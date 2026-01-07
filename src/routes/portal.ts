import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import PortalController from '../controllers/portalController';
import { validateMpesaCallback, preventDuplicateCallback } from '../middleware/mpesaAuth';

const router = Router();
const portalController = new PortalController();

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
router.post('/payment', paymentLimiter, portalController.initiatePayment); // Added for API compatibility
router.get('/status/:checkoutRequestId', statusLimiter, portalController.getPaymentStatus);
router.get('/device/:macAddress', statusLimiter, portalController.getDeviceStatus);

// M-Pesa callback endpoint (with authentication and duplicate prevention)
router.post('/mpesa/callback', validateMpesaCallback, preventDuplicateCallback, portalController.handleMpesaCallback);

export default router;
