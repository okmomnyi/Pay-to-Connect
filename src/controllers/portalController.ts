import { Request, Response } from 'express';
import DatabaseConnection from '../database/connection';
import MpesaService from '../services/mpesa';
import RadiusService from '../services/radius';
import { logger } from '../utils/logger';
import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';

interface PackageResponse {
    id: string;
    name: string;
    duration_minutes: number;
    price_kes: number;
    price: number; // Added for API compatibility
    duration_display: string;
}

interface PaymentRequest {
    phone: string;
    packageId: string;
    macAddress: string;
}

class PortalController {
    private db: DatabaseConnection;
    private mpesaService: MpesaService;
    private radiusService: RadiusService;

    constructor() {
        this.db = DatabaseConnection.getInstance();
        this.mpesaService = new MpesaService();
        this.radiusService = new RadiusService();
    }

    private formatDuration(minutes: number): string {
        if (minutes < 60) {
            return `${minutes} minutes`;
        } else if (minutes < 1440) {
            const hours = Math.floor(minutes / 60);
            const remainingMinutes = minutes % 60;
            if (remainingMinutes === 0) {
                return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
            }
            return `${hours}h ${remainingMinutes}m`;
        } else {
            const days = Math.floor(minutes / 1440);
            const remainingHours = Math.floor((minutes % 1440) / 60);
            if (remainingHours === 0) {
                return `${days} ${days === 1 ? 'day' : 'days'}`;
            }
            return `${days}d ${remainingHours}h`;
        }
    }

    public getPackages = async (req: Request, res: Response): Promise<void> => {
        try {
            const result = await this.db.query(
                'SELECT id, name, duration_minutes, price_kes FROM packages WHERE active = true ORDER BY price_kes ASC'
            );

            const packages: PackageResponse[] = result.rows.map((pkg: any) => ({
                id: pkg.id,
                name: pkg.name,
                duration_minutes: pkg.duration_minutes,
                price_kes: parseFloat(pkg.price_kes),
                price: parseFloat(pkg.price_kes), // Added for API compatibility
                duration_display: this.formatDuration(pkg.duration_minutes)
            }));

            res.json({
                success: true,
                packages
            });
        } catch (error) {
            logger.error('Failed to get packages from database, using test data:', error);
            
            // Return test packages if database is not available
            const testPackages: PackageResponse[] = [
                {
                    id: '550e8400-e29b-41d4-a716-446655440001',
                    name: '1 Hour Basic',
                    duration_minutes: 60,
                    price_kes: 10,
                    price: 10,
                    duration_display: '1 hour'
                },
                {
                    id: '550e8400-e29b-41d4-a716-446655440002',
                    name: '3 Hours Standard',
                    duration_minutes: 180,
                    price_kes: 25,
                    price: 25,
                    duration_display: '3 hours'
                },
                {
                    id: '550e8400-e29b-41d4-a716-446655440003',
                    name: '24 Hours Premium',
                    duration_minutes: 1440,
                    price_kes: 50,
                    price: 50,
                    duration_display: '1 day'
                },
                {
                    id: '550e8400-e29b-41d4-a716-446655440004',
                    name: '7 Days Unlimited',
                    duration_minutes: 10080,
                    price_kes: 200,
                    price: 200,
                    duration_display: '7 days'
                }
            ];

            res.json({
                success: true,
                packages: testPackages
            });
        }
    };

    public initiatePayment = async (req: any, res: Response): Promise<void> => {
        try {
            // For testing purposes, skip authentication if not provided
            // This should be removed in production
            let userId = 'test-user-id';
            if (req.user && req.user.userId) {
                userId = req.user.userId;
            }

            // Validate request
            const schema = Joi.object({
                phone: Joi.string().pattern(/^(\+254|254|0)?[17]\d{8}$/).required(),
                packageId: Joi.string().uuid().required(),
                macAddress: Joi.string().pattern(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/).required()
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                res.status(400).json({
                    success: false,
                    error: error.details[0].message
                });
                return;
            }

            const { phone, packageId, macAddress }: PaymentRequest = value;

            // Validate MAC address format
            const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
            if (!macRegex.test(macAddress)) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid MAC address format'
                });
                return;
            }

            // Check if package exists and is active (with fallback to test packages)
            let packageData: any;
            let amount: number;

            try {
                const packageResult = await this.db.query(
                    'SELECT id, name, price_kes, duration_minutes FROM packages WHERE id = $1 AND active = true',
                    [packageId]
                );

                if (packageResult.rows.length === 0) {
                    res.status(404).json({
                        success: false,
                        error: 'Package not found or inactive'
                    });
                    return;
                }

                packageData = packageResult.rows[0];
                amount = parseFloat(packageData.price_kes);

                // Check for existing pending payment for this device
                const existingPayment = await this.db.query(`
                    SELECT p.id, p.mpesa_checkout_request_id 
                    FROM payments p
                    JOIN sessions s ON p.id = s.payment_id
                    JOIN devices d ON s.device_id = d.id
                    WHERE d.mac_address = $1 AND p.status = 'pending'
                    AND p.created_at > NOW() - INTERVAL '10 minutes'
                    LIMIT 1
                `, [macAddress]);

                if (existingPayment.rows.length > 0) {
                    res.status(409).json({
                        success: false,
                        error: 'Payment already in progress for this device',
                        checkoutRequestId: existingPayment.rows[0].mpesa_checkout_request_id
                    });
                    return;
                }
            } catch (dbError) {
                // Database not available, use test packages
                logger.warn('Database not available, using test packages:', dbError);
                
                const testPackages = [
                    { id: '550e8400-e29b-41d4-a716-446655440001', name: '1 Hour Basic', price_kes: 10 },
                    { id: '550e8400-e29b-41d4-a716-446655440002', name: '3 Hours Standard', price_kes: 25 },
                    { id: '550e8400-e29b-41d4-a716-446655440003', name: '24 Hours Premium', price_kes: 50 },
                    { id: '550e8400-e29b-41d4-a716-446655440004', name: '7 Days Unlimited', price_kes: 200 }
                ];

                packageData = testPackages.find(p => p.id === packageId);
                if (!packageData) {
                    res.status(404).json({
                        success: false,
                        error: 'Package not found'
                    });
                    return;
                }
                amount = packageData.price_kes;
            }

            // Generate account reference
            const accountReference = `WIFI-${uuidv4().substring(0, 8).toUpperCase()}`;

            // Initiate M-Pesa STK Push
            const paymentResult = await this.mpesaService.initiateSTKPush(
                phone,
                amount,
                accountReference
            );

            if (paymentResult.success && paymentResult.checkoutRequestId) {
                // Try to store session reference for later activation (if Redis is available)
                try {
                    if (this.db.isRedisEnabled()) {
                        const redisClient = this.db.getRedisClient();
                        await redisClient!.setEx(
                            `payment:${paymentResult.checkoutRequestId}`,
                            600, // 10 minutes
                            JSON.stringify({
                                packageId,
                                macAddress,
                                phone,
                                amount,
                                accountReference
                            })
                        );
                    } else {
                        // Store in database as fallback
                        await this.db.query(
                            `UPDATE payments SET raw_callback = $1 WHERE mpesa_checkout_request_id = $2`,
                            [JSON.stringify({ packageId, macAddress, phone, amount, accountReference }), paymentResult.checkoutRequestId]
                        );
                    }
                } catch (storageError) {
                    logger.warn('Failed to store payment session data:', storageError);
                    // Continue without storing payment session data (we can still process the payment)
                }

                res.json({
                    success: true,
                    message: 'Payment initiated successfully',
                    checkoutRequestId: paymentResult.checkoutRequestId,
                    amount,
                    packageName: packageData.name
                });
            } else {
                res.status(400).json({
                    success: false,
                    error: paymentResult.error || 'Failed to initiate payment'
                });
            }
        } catch (error) {
            logger.error('Failed to initiate payment:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    public getPaymentStatus = async (req: any, res: Response): Promise<void> => {
        try {
            // Check if user is authenticated
            if (!req.user || !req.user.userId) {
                res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
                return;
            }

            const { checkoutRequestId } = req.params;

            if (!checkoutRequestId) {
                res.status(400).json({
                    success: false,
                    error: 'Checkout request ID is required'
                });
                return;
            }

            const paymentStatus = await this.mpesaService.getPaymentStatus(checkoutRequestId);

            if (paymentStatus.status === 'not_found') {
                res.status(404).json({
                    success: false,
                    error: 'Payment not found'
                });
                return;
            }

            let sessionInfo = null;
            if (paymentStatus.status === 'success' && paymentStatus.paymentId) {
                // Get session information
                const sessionResult = await this.db.query(`
                    SELECT s.id, s.end_time, p.name as package_name,
                           EXTRACT(EPOCH FROM (s.end_time - NOW()))::INTEGER as remaining_seconds
                    FROM sessions s
                    JOIN packages p ON s.package_id = p.id
                    WHERE s.payment_id = $1 AND s.active = true
                    LIMIT 1
                `, [paymentStatus.paymentId]);

                if (sessionResult.rows.length > 0) {
                    const session = sessionResult.rows[0];
                    sessionInfo = {
                        sessionId: session.id,
                        packageName: session.package_name,
                        expiresAt: session.end_time,
                        remainingSeconds: Math.max(session.remaining_seconds, 0)
                    };
                }
            }

            res.json({
                success: true,
                status: paymentStatus.status,
                session: sessionInfo
            });
        } catch (error) {
            logger.error('Failed to get payment status:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    public getDeviceStatus = async (req: any, res: Response): Promise<void> => {
        try {
            // Check if user is authenticated
            if (!req.user || !req.user.userId) {
                res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
                return;
            }

            const { macAddress } = req.params;
            const userId = req.user.userId;

            if (!macAddress) {
                res.status(400).json({
                    success: false,
                    error: 'MAC address is required'
                });
                return;
            }

            // Validate MAC address format
            const macPattern = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
            if (!macPattern.test(macAddress)) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid MAC address format'
                });
                return;
            }

            try {
                // Check for active session - only for devices owned by this user
                const sessionResult = await this.db.query(`
                    SELECT s.id, s.end_time, p.name as package_name,
                           EXTRACT(EPOCH FROM (s.end_time - NOW()))::INTEGER as remaining_seconds,
                           py.status as payment_status
                    FROM sessions s
                    JOIN packages p ON s.package_id = p.id
                    JOIN devices d ON s.device_id = d.id
                    LEFT JOIN payments py ON s.payment_id = py.id
                    WHERE d.mac_address = $1 
                    AND d.user_id = $2
                    AND s.active = true 
                    AND s.end_time > NOW()
                    ORDER BY s.created_at DESC
                    LIMIT 1
                `, [macAddress, userId]);

            if (sessionResult.rows.length === 0) {
                res.json({
                    success: true,
                    hasActiveSession: false,
                    message: 'No active session found'
                });
                return;
            }

                const session = sessionResult.rows[0];
                res.json({
                    success: true,
                    hasActiveSession: true,
                    session: {
                        sessionId: session.id,
                        packageName: session.package_name,
                        expiresAt: session.end_time,
                        remainingSeconds: Math.max(session.remaining_seconds, 0),
                        paymentStatus: session.payment_status
                    }
                });
            } catch (dbError) {
                // Database not available, return no active session
                logger.warn('Database not available for device status check:', dbError);
                res.json({
                    success: true,
                    hasActiveSession: false,
                    message: 'No active session found'
                });
            }
        } catch (error) {
            logger.error('Failed to get device status:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    public handleMpesaCallback = async (req: Request, res: Response): Promise<void> => {
        try {
            logger.info('Received M-Pesa callback:', JSON.stringify(req.body, null, 2));

            const result = await this.mpesaService.handleCallback(req.body);

            if (result.success && result.paymentId) {
                // Get payment and session details from Redis
                const callback = req.body.Body.stkCallback;
                const checkoutRequestId = callback.CheckoutRequestID;

                let sessionData = null;

                if (this.db.isRedisEnabled()) {
                    const redisClient = this.db.getRedisClient();
                    const sessionDataStr = await redisClient!.get(`payment:${checkoutRequestId}`);
                    if (sessionDataStr) {
                        sessionData = JSON.parse(sessionDataStr);
                    }
                } else {
                    // Fallback to database
                    const paymentResult = await this.db.query(
                        `SELECT raw_callback FROM payments WHERE mpesa_checkout_request_id = $1`,
                        [checkoutRequestId]
                    );
                    if (paymentResult.rows.length > 0 && paymentResult.rows[0].raw_callback) {
                        sessionData = paymentResult.rows[0].raw_callback;
                    }
                }

                if (sessionData && callback.ResultCode === 0) {
                    
                    // Get router IP from request or use default
                    const routerIp = req.ip || '127.0.0.1';

                    // Create session
                    const sessionResult = await this.radiusService.createSession(
                        sessionData.macAddress,
                        sessionData.packageId,
                        result.paymentId,
                        routerIp
                    );

                    if (sessionResult.success) {
                        logger.info(`Session created successfully: ${sessionResult.sessionId}`);
                        
                        // Store session ID in Redis for quick access (if available)
                        if (this.db.isRedisEnabled()) {
                            const redisClient = this.db.getRedisClient();
                            await redisClient!.setEx(
                                `session:${sessionData.macAddress}`,
                                3600, // 1 hour
                                sessionResult.sessionId!
                            );
                        }
                    } else {
                        logger.error(`Failed to create session: ${sessionResult.error}`);
                    }

                    // Clean up payment data
                    if (this.db.isRedisEnabled()) {
                        const redisClient = this.db.getRedisClient();
                        await redisClient!.del(`payment:${checkoutRequestId}`);
                    }
                }
            }

            // Always respond with success to M-Pesa
            res.json({
                ResultCode: 0,
                ResultDesc: 'Callback processed successfully'
            });
        } catch (error) {
            logger.error('Failed to process M-Pesa callback:', error);
            
            // Still respond with success to avoid retries
            res.json({
                ResultCode: 0,
                ResultDesc: 'Callback received'
            });
        }
    };
}

export default PortalController;
