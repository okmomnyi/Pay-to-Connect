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
                duration_display: this.formatDuration(pkg.duration_minutes)
            }));

            res.json({
                success: true,
                packages
            });
        } catch (error) {
            logger.error('Failed to get packages:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to load packages'
            });
        }
    };

    public initiatePayment = async (req: Request, res: Response): Promise<void> => {
        try {
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

            // Check if package exists and is active
            const packageResult = await this.db.query(
                'SELECT id, name, price_kes FROM packages WHERE id = $1 AND active = true',
                [packageId]
            );

            if (packageResult.rows.length === 0) {
                res.status(404).json({
                    success: false,
                    error: 'Package not found or inactive'
                });
                return;
            }

            const packageData = packageResult.rows[0];
            const amount = parseFloat(packageData.price_kes);

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

            // Generate account reference
            const accountReference = `WIFI-${uuidv4().substring(0, 8).toUpperCase()}`;

            // Initiate M-Pesa STK Push
            const paymentResult = await this.mpesaService.initiateSTKPush(
                phone,
                amount,
                accountReference
            );

            if (paymentResult.success && paymentResult.checkoutRequestId) {
                // Store session reference for later activation
                const redisClient = this.db.getRedisClient();
                await redisClient.setEx(
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

    public getPaymentStatus = async (req: Request, res: Response): Promise<void> => {
        try {
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

    public getDeviceStatus = async (req: Request, res: Response): Promise<void> => {
        try {
            const { macAddress } = req.params;

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

            // Check for active session
            const sessionResult = await this.db.query(`
                SELECT s.id, s.end_time, p.name as package_name,
                       EXTRACT(EPOCH FROM (s.end_time - NOW()))::INTEGER as remaining_seconds,
                       py.status as payment_status
                FROM sessions s
                JOIN packages p ON s.package_id = p.id
                JOIN devices d ON s.device_id = d.id
                LEFT JOIN payments py ON s.payment_id = py.id
                WHERE d.mac_address = $1 AND s.active = true AND s.end_time > NOW()
                ORDER BY s.created_at DESC
                LIMIT 1
            `, [macAddress]);

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

                const redisClient = this.db.getRedisClient();
                const sessionDataStr = await redisClient.get(`payment:${checkoutRequestId}`);

                if (sessionDataStr && callback.ResultCode === 0) {
                    const sessionData = JSON.parse(sessionDataStr);
                    
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
                        
                        // Store session ID in Redis for quick access
                        await redisClient.setEx(
                            `session:${sessionData.macAddress}`,
                            3600, // 1 hour
                            sessionResult.sessionId!
                        );
                    } else {
                        logger.error(`Failed to create session: ${sessionResult.error}`);
                    }

                    // Clean up payment data
                    await redisClient.del(`payment:${checkoutRequestId}`);
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
