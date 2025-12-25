import { Router } from 'express';
import AdminController from '../controllers/adminController';
import { authenticateToken } from '../middleware/auth';

const router = Router();
const adminController = new AdminController();

// Public admin endpoints
router.post('/login', adminController.login);

// Protected admin endpoints
router.use(authenticateToken);

router.get('/dashboard', adminController.getDashboard);

// Package management
router.get('/packages', adminController.getPackages);
router.post('/packages', adminController.createPackage);
router.put('/packages/:id', adminController.updatePackage);

// Router management
router.get('/routers', adminController.getRouters);
router.post('/routers', adminController.createRouter);

// Session and payment monitoring
router.get('/sessions', adminController.getSessions);
router.get('/payments', adminController.getPayments);

export default router;
