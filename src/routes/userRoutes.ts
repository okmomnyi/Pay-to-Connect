import { Router } from 'express';
import authController from '../controllers/authController';
import packageController from '../controllers/packageController';
import sessionController from '../controllers/sessionController';
import paymentController from '../controllers/paymentController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.post('/auth/logout', authenticate, authController.logout);
router.post('/auth/change-password', authenticate, authController.changePassword);
router.post('/auth/request-password-reset', authController.requestPasswordReset);
router.post('/auth/reset-password', authController.resetPassword);

router.get('/profile', authenticate, authController.getProfile);

router.get('/packages', packageController.getAllPackages);
router.get('/packages/:id', packageController.getPackageById);

router.get('/session/active', authenticate, sessionController.getActiveSession);
router.get('/session/history', authenticate, sessionController.getSessionHistory);

router.post('/purchase/initiate', authenticate, paymentController.initiatePurchase);
router.get('/purchase/history', authenticate, paymentController.getPurchaseHistory);
router.get('/payment/:paymentId/status', authenticate, paymentController.getPaymentStatus);

router.post('/mpesa/callback', paymentController.handleMpesaCallback);

export default router;
