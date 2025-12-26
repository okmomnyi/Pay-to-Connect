import { Router } from 'express';
import { join } from 'path';
import MockAdminController from '../controllers/mockAdminController';
import { authenticateToken } from '../middleware/auth';

const router = Router();
const adminController = new MockAdminController();

// Serve admin login page
router.get('/', (req, res) => {
    res.sendFile(join(__dirname, '../../public/admin.html'));
});

// Public admin endpoints
router.post('/login', adminController.login);

// Protected admin endpoints - apply authentication to specific routes
router.get('/dashboard', authenticateToken, adminController.getDashboard);

// Package management
router.get('/packages', authenticateToken, adminController.getPackages);
router.post('/packages', authenticateToken, adminController.createPackage);
router.put('/packages/:id', authenticateToken, adminController.updatePackage);

// Router management
router.get('/routers', authenticateToken, adminController.getRouters);
router.post('/routers', authenticateToken, adminController.createRouter);

// Session and payment monitoring
router.get('/sessions', authenticateToken, adminController.getSessions);
router.get('/payments', authenticateToken, adminController.getPayments);

export default router;
