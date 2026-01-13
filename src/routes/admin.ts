import { Router } from 'express';
import { join } from 'path';
import rateLimit from 'express-rate-limit';
import AdminController from '../controllers/adminController';
import RouterController from '../controllers/routerController';
import { authenticateToken } from '../middleware/auth';
import rbacMiddleware from '../middleware/rbac';

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

// Package management (requires package access)
router.get('/packages', authenticateToken, rbacMiddleware.requireReadAccess('package'), adminController.getPackages);
router.post('/packages', authenticateToken, rbacMiddleware.requirePackageAccess(), adminController.createPackage);
router.put('/packages/:id', authenticateToken, rbacMiddleware.requirePackageAccess(), adminController.updatePackage);
router.delete('/packages/:id', authenticateToken, rbacMiddleware.requirePackageAccess(), adminController.deletePackage);

// Router management (requires router access - SECURE)
router.get('/routers', authenticateToken, rbacMiddleware.requireReadAccess('router'), RouterController.getRouters);
router.post('/routers', authenticateToken, rbacMiddleware.requireRouterAccess(), RouterController.createRouter);
router.put('/routers/:id', authenticateToken, rbacMiddleware.requireRouterAccess(), RouterController.updateRouter);
router.delete('/routers/:id', authenticateToken, rbacMiddleware.requireRouterAccess(), RouterController.deleteRouter);

// Router operations (WHITELISTED OPERATIONS ONLY)
router.post('/routers/:id/test-connection', authenticateToken, rbacMiddleware.requireRouterAccess(), RouterController.testRouterConnection);
router.post('/routers/:id/sync-packages', authenticateToken, rbacMiddleware.requireRouterAccess(), RouterController.syncPackagesToRouter);
router.get('/routers/:id/stats', authenticateToken, rbacMiddleware.requireReadAccess('router'), RouterController.getRouterStats);

// Session and payment monitoring (requires read access)
router.get('/sessions', authenticateToken, rbacMiddleware.requireReadAccess('session'), adminController.getSessions);
router.get('/payments', authenticateToken, rbacMiddleware.requireReadAccess('payment'), adminController.getPayments);
router.post('/payments/:id/approve', authenticateToken, rbacMiddleware.requireAnyPermission(['payment.manage', 'system.*']), adminController.approvePayment);

// Administrator management (requires admin access - HIGHEST PRIVILEGE)
router.get('/administrators', authenticateToken, rbacMiddleware.requireAdminAccess(), adminController.getAdministrators);
router.post('/administrators', authenticateToken, rbacMiddleware.requireAdminAccess(), adminController.createAdministrator);
router.put('/administrators/:id', authenticateToken, rbacMiddleware.requireAdminAccess(), adminController.updateAdministrator);
router.delete('/administrators/:id', authenticateToken, rbacMiddleware.requireAdminAccess(), adminController.deleteAdministrator);

// Audit logs (requires admin access)
router.get('/audit-logs', authenticateToken, rbacMiddleware.requireAdminAccess(), adminController.getAuditLogs);
router.get('/security-events', authenticateToken, rbacMiddleware.requireAdminAccess(), adminController.getSecurityEvents);

export default router;
