import { Request, Response } from 'express';
import MockMpesaService from '../services/mockMpesa';
import MockRadiusService from '../services/mockRadius';
import { logger } from '../utils/logger';
import Joi from 'joi';

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

class MockPortalController {
    private mpesaService: MockMpesaService;
    private radiusService: MockRadiusService;
    private mockSessions: Map<string, any> = new Map();

    constructor() {
        this.mpesaService = new MockMpesaService();
        this.radiusService = new MockRadiusService();
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
            const testPackages: PackageResponse[] = [
                {
                    id: '550e8400-e29b-41d4-a716-446655440001',
                    name: '1 Hour Basic',
                    duration_minutes: 60,
                    price_kes: 10,
                    duration_display: '1 hour'
                },
                {
                    id: '550e8400-e29b-41d4-a716-446655440002',
                    name: '3 Hours Standard',
                    duration_minutes: 180,
                    price_kes: 25,
                    duration_display: '3 hours'
                },
                {
                    id: '550e8400-e29b-41d4-a716-446655440003',
                    name: '24 Hours Premium',
                    duration_minutes: 1440,
                    price_kes: 50,
                    duration_display: '1 day'
                },
                {
                    id: '550e8400-e29b-41d4-a716-446655440004',
                    name: '7 Days Unlimited',
                    duration_minutes: 10080,
                    price_kes: 200,
                    duration_display: '7 days'
                }
            ];

            res.json({
                success: true,
                packages: testPackages
            });
        } catch (error) {
            logger.error('Failed to get packages:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    public initiatePayment = async (req: Request, res: Response): Promise<void> => {
        try {
            // Validate request
            const schema = Joi.object({
                phone: Joi.string().pattern(/^(\+254|254|0)?[17]\d{8}$/).required(),
                packageId: Joi.string().required(),
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

            // Mock packages
            const testPackages = [
                { id: '550e8400-e29b-41d4-a716-446655440001', name: '1 Hour Basic', price_kes: 10, duration_minutes: 60 },
                { id: '550e8400-e29b-41d4-a716-446655440002', name: '3 Hours Standard', price_kes: 25, duration_minutes: 180 },
                { id: '550e8400-e29b-41d4-a716-446655440003', name: '24 Hours Premium', price_kes: 50, duration_minutes: 1440 },
                { id: '550e8400-e29b-41d4-a716-446655440004', name: '7 Days Unlimited', price_kes: 200, duration_minutes: 10080 }
            ];

            const packageData = testPackages.find(p => p.id === packageId);
            if (!packageData) {
                res.status(404).json({
                    success: false,
                    error: 'Package not found'
                });
                return;
            }

            // Check for existing pending payment for this device
            const existingPayment = this.mockSessions.get(macAddress);
            if (existingPayment && existingPayment.status === 'pending') {
                res.status(409).json({
                    success: false,
                    error: 'Payment already in progress for this device',
                    checkoutRequestId: existingPayment.checkoutRequestId
                });
                return;
            }

            // Generate account reference
            const accountReference = `WIFI-${Date.now().toString().slice(-8)}`;

            // Initiate M-Pesa STK Push
            const paymentResult = await this.mpesaService.initiateSTKPush(
                phone,
                packageData.price_kes,
                accountReference
            );

            if (paymentResult.success && paymentResult.checkoutRequestId) {
                // Store session reference for later activation
                this.mockSessions.set(macAddress, {
                    checkoutRequestId: paymentResult.checkoutRequestId,
                    packageId,
                    macAddress,
                    phone,
                    amount: packageData.price_kes,
                    packageName: packageData.name,
                    duration_minutes: packageData.duration_minutes,
                    accountReference,
                    status: 'pending',
                    createdAt: new Date().toISOString()
                });

                res.json({
                    success: true,
                    message: 'Payment initiated successfully',
                    checkoutRequestId: paymentResult.checkoutRequestId,
                    amount: packageData.price_kes,
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
            if (paymentStatus.status === 'success') {
                // Find the session data
                let sessionData = null;
                for (const [macAddress, session] of this.mockSessions.entries()) {
                    if (session.checkoutRequestId === checkoutRequestId) {
                        sessionData = session;
                        break;
                    }
                }

                if (sessionData) {
                    // Create session if payment is successful
                    const sessionResult = await this.radiusService.createSession(
                        sessionData.macAddress,
                        sessionData.packageId,
                        paymentStatus.paymentId || 'mock_payment_id',
                        '127.0.0.1'
                    );

                    if (sessionResult.success) {
                        const endTime = new Date(Date.now() + (sessionData.duration_minutes * 60 * 1000));
                        const remainingSeconds = Math.floor((endTime.getTime() - Date.now()) / 1000);

                        sessionInfo = {
                            sessionId: sessionResult.sessionId,
                            packageName: sessionData.packageName,
                            expiresAt: endTime.toISOString(),
                            remainingSeconds: Math.max(remainingSeconds, 0)
                        };

                        // Update session status
                        sessionData.status = 'active';
                        sessionData.sessionId = sessionResult.sessionId;
                        sessionData.expiresAt = endTime.toISOString();
                    }
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
            const sessionData = this.mockSessions.get(macAddress);
            
            if (!sessionData || sessionData.status !== 'active') {
                res.json({
                    success: true,
                    hasActiveSession: false,
                    message: 'No active session found'
                });
                return;
            }

            // Check if session is still valid
            const expiresAt = new Date(sessionData.expiresAt);
            const now = new Date();
            
            if (now > expiresAt) {
                sessionData.status = 'expired';
                res.json({
                    success: true,
                    hasActiveSession: false,
                    message: 'Session has expired'
                });
                return;
            }

            const remainingSeconds = Math.floor((expiresAt.getTime() - now.getTime()) / 1000);

            res.json({
                success: true,
                hasActiveSession: true,
                session: {
                    sessionId: sessionData.sessionId,
                    packageName: sessionData.packageName,
                    expiresAt: sessionData.expiresAt,
                    remainingSeconds: Math.max(remainingSeconds, 0),
                    paymentStatus: 'success'
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
            logger.info('Received M-Pesa callback (mock):', JSON.stringify(req.body, null, 2));

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

export default MockPortalController;
