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
            if (!req.user || !req.user.userId) {
                res.status(401).json({ success: false, error: 'Authentication required' });
                return;
            }
            const userId = req.user.userId;

            const schema = Joi.object({
                phone: Joi.string().pattern(/^(\+254|254|0)?[17]\d{8}$/).required(),
                packageId: Joi.string().uuid().required(),
                macAddress: Joi.string().required(),
                routerId: Joi.string().uuid().optional().allow(null, '')
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                res.status(400).json({ success: false, error: error.details[0].message });
                return;
            }

            const { phone, packageId, macAddress } = value;
            let routerId: string | null = value.routerId || null;

            // Verify package exists
            const packageResult = await this.db.query(
                'SELECT id, name, price_kes, duration_minutes FROM packages WHERE id = $1 AND active = true',
                [packageId]
            );
            if (packageResult.rows.length === 0) {
                res.status(404).json({ success: false, error: 'Package not found or inactive' });
                return;
            }
            const packageData = packageResult.rows[0];
            const amount = parseFloat(packageData.price_kes);

            // Resolve router — use provided routerId or fall back to first active router
            if (routerId) {
                const routerResult = await this.db.query(
                    'SELECT id FROM routers WHERE id = $1 AND active = true',
                    [routerId]
                );
                if (routerResult.rows.length === 0) {
                    res.status(404).json({ success: false, error: 'Router not found or inactive' });
                    return;
                }
            } else {
                const defaultRouter = await this.db.query(
                    'SELECT id FROM routers WHERE active = true LIMIT 1'
                );
                routerId = defaultRouter.rows.length > 0 ? defaultRouter.rows[0].id : null;
                if (!routerId) {
                    res.status(503).json({ success: false, error: 'No active routers available. Please contact support.' });
                    return;
                }
            }

            // Block duplicate pending payments for this device (within 10 minutes)
            const existingPayment = await this.db.query(
                `SELECT id, mpesa_checkout_request_id FROM payments
                 WHERE mac_address = $1 AND status = 'pending'
                 AND created_at > NOW() - INTERVAL '10 minutes'
                 LIMIT 1`,
                [macAddress]
            );
            if (existingPayment.rows.length > 0) {
                res.status(409).json({
                    success: false,
                    error: 'Payment already in progress for this device',
                    checkoutRequestId: existingPayment.rows[0].mpesa_checkout_request_id
                });
                return;
            }

            // Create the payment record FIRST with full context so the callback can
            // find everything it needs without relying on Redis or raw_callback.
            const paymentInsert = await this.db.query(
                `INSERT INTO payments (user_id, package_id, phone, amount, mac_address, router_id, status)
                 VALUES ($1, $2, $3, $4, $5, $6, 'pending')
                 RETURNING id`,
                [userId, packageId, phone, amount, macAddress, routerId]
            );
            const paymentId = paymentInsert.rows[0].id;

            const accountReference = `WIFI-${uuidv4().substring(0, 8).toUpperCase()}`;

            // Initiate STK Push — mpesaService updates the payment with checkoutRequestId
            const stkResult = await this.mpesaService.initiateSTKPush(
                paymentId,
                phone,
                amount,
                accountReference
            );

            if (stkResult.success && stkResult.checkoutRequestId) {
                res.json({
                    success: true,
                    message: 'Payment initiated successfully. Complete the prompt on your phone.',
                    checkoutRequestId: stkResult.checkoutRequestId,
                    paymentId,
                    amount,
                    packageName: packageData.name
                });
            } else {
                res.status(400).json({
                    success: false,
                    error: stkResult.error || 'Failed to initiate payment'
                });
            }
        } catch (error) {
            logger.error('Failed to initiate payment:', error);
            res.status(500).json({ success: false, error: 'Internal server error' });
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
        // Always respond 200 immediately — M-Pesa retries if it doesn't get a fast response
        res.json({ ResultCode: 0, ResultDesc: 'Received' });

        try {
            const callback = req.body.Body.stkCallback;
            const checkoutRequestId = callback.CheckoutRequestID;
            const resultCode = callback.ResultCode;

            logger.info(`M-Pesa callback received: CheckoutRequestID=${checkoutRequestId}, ResultCode=${resultCode}`);

            // Read the payment record — it already has user_id, package_id, mac_address, router_id
            // saved at initiation time. No Redis or raw_callback needed for session context.
            const paymentRow = await this.db.query(
                `SELECT id, user_id, package_id, mac_address, router_id, status
                 FROM payments WHERE mpesa_checkout_request_id = $1`,
                [checkoutRequestId]
            );

            if (paymentRow.rows.length === 0) {
                logger.error(`No payment found for CheckoutRequestID: ${checkoutRequestId}`);
                return;
            }

            const payment = paymentRow.rows[0];

            if (payment.status !== 'pending') {
                logger.info(`Payment ${payment.id} already processed (status=${payment.status}), skipping`);
                return;
            }

            if (resultCode === 0) {
                // Extract M-Pesa receipt number from callback metadata
                const items: any[] = callback.CallbackMetadata?.Item ?? [];
                const mpesaReceipt = items.find((i: any) => i.Name === 'MpesaReceiptNumber')?.Value ?? null;
                const paidAmount   = items.find((i: any) => i.Name === 'Amount')?.Value ?? null;
                const payerPhone   = items.find((i: any) => i.Name === 'PhoneNumber')?.Value?.toString() ?? null;

                // Mark payment as successful
                await this.db.query(
                    `UPDATE payments
                     SET status = 'success',
                         mpesa_receipt_number = $1,
                         amount = COALESCE($2, amount),
                         phone  = COALESCE($3, phone),
                         raw_callback = $4,
                         updated_at = NOW()
                     WHERE id = $5`,
                    [mpesaReceipt, paidAmount, payerPhone, JSON.stringify(req.body), payment.id]
                );

                logger.info(`Payment ${payment.id} marked successful. Receipt: ${mpesaReceipt}`);

                // Look up the router's IP address for the RADIUS session
                let routerIp: string | null = null;
                if (payment.router_id) {
                    const routerRow = await this.db.query(
                        'SELECT ip_address FROM routers WHERE id = $1',
                        [payment.router_id]
                    );
                    routerIp = routerRow.rows[0]?.ip_address ?? null;
                }

                if (!payment.mac_address || !payment.package_id) {
                    logger.error(`Payment ${payment.id} is missing mac_address or package_id — cannot create session`);
                    return;
                }

                // Create the WiFi session now that payment is confirmed
                const sessionResult = await this.radiusService.createSession(
                    payment.mac_address,
                    payment.package_id,
                    payment.id,
                    routerIp || '0.0.0.0',
                    payment.user_id
                );

                if (sessionResult.success) {
                    logger.info(`Session ${sessionResult.sessionId} created for device ${payment.mac_address} after payment ${payment.id}`);

                    // Cache the session ID in Redis for fast RADIUS lookups (optional)
                    if (this.db.isRedisEnabled()) {
                        const redis = this.db.getRedisClient();
                        await redis!.setEx(`session:${payment.mac_address}`, 86400, sessionResult.sessionId!);
                    }
                } else {
                    logger.error(`Failed to create session for payment ${payment.id}: ${sessionResult.error}`);
                }

            } else {
                // Payment was cancelled or failed — mark it and do not create a session
                await this.db.query(
                    `UPDATE payments
                     SET status = 'failed', raw_callback = $1, updated_at = NOW()
                     WHERE id = $2`,
                    [JSON.stringify(req.body), payment.id]
                );
                logger.info(`Payment ${payment.id} failed. ResultCode=${resultCode}, Desc="${callback.ResultDesc}"`);
            }
        } catch (error) {
            logger.error('Error processing M-Pesa callback:', error);
        }
    };
}

export default PortalController;
