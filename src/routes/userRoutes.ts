import { Router } from 'express';
import authController from '../controllers/authController';
import packageController from '../controllers/packageController';
import sessionController from '../controllers/sessionController';
import paymentController from '../controllers/paymentController';
import UserProfileController from '../controllers/userProfileController';
import UsageTrackingController from '../controllers/usageTrackingController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();
const profileController = new UserProfileController();
const usageController = new UsageTrackingController();

router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.post('/auth/logout', authenticate, authController.logout);
router.post('/auth/change-password', authenticate, authController.changePassword);
router.post('/auth/request-password-reset', authController.requestPasswordReset);
router.post('/auth/reset-password', authController.resetPassword);

// Profile management routes
router.get('/profile', authenticate, profileController.getProfile);
router.put('/profile', authenticate, profileController.updateProfile);
router.post('/profile/change-password', authenticate, profileController.changePassword);

// Security questions routes
router.get('/security-questions', profileController.getSecurityQuestions);
router.get('/security-questions/user', authenticate, profileController.getUserSecurityQuestions);
router.post('/security-questions/set', authenticate, profileController.setSecurityAnswers);
router.post('/security-questions/verify', profileController.verifySecurityAnswers);
router.post('/security-questions/reset-password', profileController.resetPasswordWithSecurity);

// Usage tracking routes
router.get('/usage/active', authenticate, usageController.getActiveSessionStats);
router.get('/usage/total', authenticate, usageController.getTotalUsageStats);
router.get('/usage/history', authenticate, usageController.getSessionHistory);
router.get('/usage/summary', authenticate, usageController.getUsageSummary);

router.get('/packages', packageController.getAllPackages);
router.get('/packages/:id', packageController.getPackageById);

router.get('/session/active', authenticate, sessionController.getActiveSession);
router.get('/session/history', authenticate, sessionController.getSessionHistory);

router.post('/purchase/initiate', authenticate, paymentController.initiatePurchase);
router.get('/purchase/history', authenticate, paymentController.getPurchaseHistory);
router.get('/payment/:paymentId/status', authenticate, paymentController.getPaymentStatus);

router.post('/mpesa/callback', paymentController.handleMpesaCallback);

export default router;
