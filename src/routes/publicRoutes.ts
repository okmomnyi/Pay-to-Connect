import express from 'express';
import * as profileController from '../controllers/profileController';

const router = express.Router();

// Public routes (no authentication required)

// Get security questions for forgot password
router.post('/security-answers/forgot', profileController.getSecurityAnswersForForgotPassword);

// Forgot password flow
router.post('/forgot-password', profileController.forgotPassword);
router.get('/validate-reset-token/:token', profileController.validateResetToken);
router.post('/reset-password', profileController.resetPassword);

export default router;
