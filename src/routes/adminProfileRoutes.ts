import express from 'express';
import { authenticateAdmin } from '../middleware/adminAuthBasic';
import * as adminProfileController from '../controllers/adminProfileController';
import * as profileController from '../controllers/profileController';

const router = express.Router();

// All admin profile routes require authentication
router.use(authenticateAdmin);

// Admin profile management
router.get('/', adminProfileController.getAdminProfile);
router.put('/', adminProfileController.updateAdminProfile);

// Security questions (shared)
router.get('/security-questions', profileController.getSecurityQuestions);
router.post('/security-answers', adminProfileController.setAdminSecurityAnswers);
router.get('/security-answers', adminProfileController.getAdminSecurityAnswers);

// Password management
router.post('/forgot-password', adminProfileController.adminForgotPassword);
router.get('/validate-reset-token/:token', adminProfileController.validateAdminResetToken);
router.post('/reset-password', adminProfileController.resetAdminPassword);
router.post('/change-password', adminProfileController.changeAdminPassword);

export default router;
