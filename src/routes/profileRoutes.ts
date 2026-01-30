import express from 'express';
import { authenticateUser } from '../middleware/userAuth';
import * as profileController from '../controllers/profileController';

const router = express.Router();

// All profile routes require authentication
router.use(authenticateUser);

// Profile management
router.get('/', profileController.getProfile);
router.put('/', profileController.updateProfile);

// Security questions
router.get('/security-questions', profileController.getSecurityQuestions);
router.post('/security-answers', profileController.setSecurityAnswers);
router.get('/security-answers', profileController.getSecurityAnswers);
router.post('/security-answers/forgot', profileController.getSecurityAnswersForForgotPassword);

// Password management
router.post('/forgot-password', profileController.forgotPassword);
router.get('/validate-reset-token/:token', profileController.validateResetToken);
router.post('/reset-password', profileController.resetPassword);
router.post('/change-password', profileController.changePassword);

export default router;
