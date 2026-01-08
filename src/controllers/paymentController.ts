import { Request, Response } from 'express';
import paymentService from '../services/paymentService';
import sessionService from '../services/sessionService';
import { logger } from '../utils/logger';

export class PaymentController {
    async initiatePurchase(req: Request, res: Response): Promise<void> {
        try {
            const userId = (req as any).user.id;
            const { packageId, phoneNumber, macAddress, routerId } = req.body;

            if (!packageId || !phoneNumber || !macAddress || !routerId) {
                res.status(400).json({ error: 'Missing required fields' });
                return;
            }

            const deviceId = await sessionService.getOrCreateDevice(macAddress);

            const payment = await paymentService.initiateStkPush({
                phoneNumber,
                amount: 0,
                accountReference: `PKG-${packageId.substring(0, 8)}`,
                transactionDesc: 'Internet Package Purchase',
            });

            const purchase = await paymentService.createPurchase(
                userId,
                packageId,
                payment.id,
                deviceId,
                routerId
            );

            res.status(200).json({
                success: true,
                message: 'Payment initiated. Please complete on your phone.',
                payment,
                purchase,
            });
        } catch (error: any) {
            logger.error('Initiate purchase error:', error);
            res.status(500).json({ error: error.message || 'Failed to initiate purchase' });
        }
    }

    async handleMpesaCallback(req: Request, res: Response): Promise<void> {
        try {
            await paymentService.handleMpesaCallback(req.body);

            res.status(200).json({
                ResultCode: 0,
                ResultDesc: 'Success',
            });
        } catch (error: any) {
            logger.error('M-Pesa callback error:', error);
            res.status(200).json({
                ResultCode: 1,
                ResultDesc: 'Failed',
            });
        }
    }

    async getPaymentStatus(req: Request, res: Response): Promise<void> {
        try {
            const { paymentId } = req.params;

            const payment = await paymentService.getPaymentStatus(paymentId);

            res.status(200).json({
                success: true,
                payment,
            });
        } catch (error: any) {
            logger.error('Get payment status error:', error);
            res.status(404).json({ error: 'Payment not found' });
        }
    }

    async getPurchaseHistory(req: Request, res: Response): Promise<void> {
        try {
            const userId = (req as any).user.id;
            const limit = parseInt(req.query.limit as string) || 10;

            const history = await paymentService.getUserPurchaseHistory(userId, limit);

            res.status(200).json({
                success: true,
                history,
            });
        } catch (error: any) {
            logger.error('Get purchase history error:', error);
            res.status(500).json({ error: 'Failed to get purchase history' });
        }
    }
}

export default new PaymentController();
