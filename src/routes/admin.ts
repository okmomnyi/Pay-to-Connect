import { Router } from 'express';
import { join } from 'path';
import rateLimit from 'express-rate-limit';
import AdminController from '../controllers/adminController';
import { authenticateToken } from '../middleware/auth';

const router = Router();
const adminController = new AdminController();

const adminAuthLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3,
    message: {
        success: false,
        error: 'Too many admin login attempts, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Serve admin login page
router.get('/', (req, res) => {
    res.sendFile(join(__dirname, '../../public/admin.html'));
});

// Public admin endpoints
router.post('/login', adminAuthLimiter, adminController.login);

// Protected admin endpoints - apply authentication to specific routes
router.get('/dashboard', authenticateToken, adminController.getDashboard);

// Package management
router.get('/packages', authenticateToken, adminController.getPackages);
router.post('/packages', authenticateToken, adminController.createPackage);
router.put('/packages/:id', authenticateToken, adminController.updatePackage);
router.delete('/packages/:id', authenticateToken, adminController.deletePackage);

// Router management
router.get('/routers', authenticateToken, adminController.getRouters);
router.post('/routers', authenticateToken, adminController.createRouter);

// Session and payment monitoring
router.get('/sessions', authenticateToken, adminController.getSessions);
router.get('/payments', authenticateToken, adminController.getPayments);
router.post('/payments/:id/approve', authenticateToken, adminController.approvePayment);

// Administrator management
router.get('/administrators', authenticateToken, adminController.getAdministrators);
router.post('/administrators', authenticateToken, adminController.createAdministrator);
router.put('/administrators/:id', authenticateToken, adminController.updateAdministrator);
router.delete('/administrators/:id', authenticateToken, adminController.deleteAdministrator);

export default router;
