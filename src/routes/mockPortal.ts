import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import MockPortalController from '../controllers/mockPortalController';

const router = Router();
const portalController = new MockPortalController();

// Rate limiting for payment endpoints
const paymentLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 payment requests per windowMs
    message: {
        success: false,
        error: 'Too many payment attempts, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const statusLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // Limit each IP to 30 status requests per minute
    message: {
        success: false,
        error: 'Too many status requests, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Public portal endpoints
router.get('/packages', portalController.getPackages);
router.post('/pay', paymentLimiter, portalController.initiatePayment);
router.get('/status/:checkoutRequestId', statusLimiter, portalController.getPaymentStatus);
router.get('/device/:macAddress', statusLimiter, portalController.getDeviceStatus);

// M-Pesa callback endpoint (no rate limiting for callbacks)
router.post('/mpesa/callback', portalController.handleMpesaCallback);

export default router;
