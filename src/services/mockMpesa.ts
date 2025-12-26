import { logger } from '../utils/logger';

interface MockSTKPushResponse {
    success: boolean;
    checkoutRequestId?: string;
    error?: string;
}

interface MockPaymentStatus {
    status: string;
    paymentId?: string;
}

class MockMpesaService {
    private mockPayments: Map<string, any> = new Map();

    constructor() {
        logger.info('Using Mock M-Pesa Service for serverless environment');
    }

    public async initiateSTKPush(phone: string, amount: number, accountReference: string): Promise<MockSTKPushResponse> {
        try {
            // Validate phone number format
            const phoneRegex = /^(\+254|254|0)?[17]\d{8}$/;
            if (!phoneRegex.test(phone)) {
                return {
                    success: false,
                    error: 'Invalid phone number format'
                };
            }

            // Validate amount
            if (amount < 1 || amount > 250000) {
                return {
                    success: false,
                    error: 'Amount must be between KES 1 and KES 250,000'
                };
            }

            // Generate mock checkout request ID
            const checkoutRequestId = `ws_CO_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Store mock payment
            this.mockPayments.set(checkoutRequestId, {
                phone,
                amount,
                accountReference,
                status: 'pending',
                createdAt: new Date().toISOString()
            });

            // Simulate automatic success after 3 seconds for demo purposes
            setTimeout(() => {
                const payment = this.mockPayments.get(checkoutRequestId);
                if (payment && payment.status === 'pending') {
                    payment.status = 'success';
                    payment.mpesaReceipt = `NLJ7RT61SV_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
                    payment.completedAt = new Date().toISOString();
                    logger.info(`Mock payment ${checkoutRequestId} automatically completed`);
                }
            }, 3000);

            logger.info(`Mock STK Push initiated for ${phone}, amount: ${amount}, checkoutRequestId: ${checkoutRequestId}`);

            return {
                success: true,
                checkoutRequestId
            };
        } catch (error) {
            logger.error('Mock STK Push failed:', error);
            return {
                success: false,
                error: 'Failed to initiate payment'
            };
        }
    }

    public async getPaymentStatus(checkoutRequestId: string): Promise<MockPaymentStatus> {
        try {
            const payment = this.mockPayments.get(checkoutRequestId);
            
            if (!payment) {
                return { status: 'not_found' };
            }

            return {
                status: payment.status,
                paymentId: payment.status === 'success' ? `payment_${checkoutRequestId}` : undefined
            };
        } catch (error) {
            logger.error('Failed to get mock payment status:', error);
            return { status: 'error' };
        }
    }

    public async handleCallback(payload: any): Promise<{ success: boolean; paymentId?: string }> {
        // Mock callback handler - in real implementation this would be called by M-Pesa
        logger.info('Mock callback handler called');
        return { success: true };
    }

    public async verifyPayment(paymentId: string): Promise<boolean> {
        // Mock verification - always return true for demo
        return true;
    }
}

export default MockMpesaService;
