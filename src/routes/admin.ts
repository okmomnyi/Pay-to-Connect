import express from 'express';
import { authenticateAdmin, requirePermission, requireAnyPermission } from '../middleware/adminAuthSimple';
import * as authController from '../controllers/adminAuthControllerDebug';
import * as dashboardController from '../controllers/adminDashboardController';
import * as adminUsersController from '../controllers/adminUsersController';
import * as routersController from '../controllers/adminRoutersController';

const router = express.Router();

// =====================================================
// PUBLIC ROUTES (No authentication required)
// =====================================================
router.post('/auth/login', authController.login);

// =====================================================
// AUTHENTICATED ROUTES (All routes below require authentication)
// =====================================================
router.use(authenticateAdmin);

// Auth routes
router.post('/auth/logout', authController.logout);
router.get('/auth/me', authController.getCurrentAdmin);

// Dashboard routes
router.get('/dashboard/stats', requireAnyPermission(['admin.view', 'user.view']), dashboardController.getDashboardStats);
router.get('/dashboard/activity', requirePermission('audit.view'), dashboardController.getRecentActivity);

// Admin users management routes
router.get('/admins', requirePermission('admin.view'), adminUsersController.getAllAdmins);
router.get('/admins/:id', requirePermission('admin.view'), adminUsersController.getAdminById);
router.post('/admins', requirePermission('admin.create'), adminUsersController.createAdmin);
router.put('/admins/:id', requirePermission('admin.edit'), adminUsersController.updateAdmin);
router.delete('/admins/:id', requirePermission('admin.delete'), adminUsersController.deleteAdmin);
router.get('/roles', requirePermission('admin.view'), adminUsersController.getAllRoles);

// Routers management routes
router.get('/routers', requirePermission('router.view'), routersController.getAllRouters);
router.get('/routers/:id', requirePermission('router.view'), routersController.getRouterById);
router.post('/routers', requirePermission('router.create'), routersController.createRouter);
router.put('/routers/:id', requirePermission('router.edit'), routersController.updateRouter);
router.delete('/routers/:id', requirePermission('router.delete'), routersController.deleteRouter);
router.post('/routers/:id/test', requirePermission('router.view'), routersController.testRouterConnection);
router.post('/routers/:id/sync', requirePermission('router.sync'), routersController.syncRouterPackages);
router.post('/routers/:id/disconnect', requirePermission('router.disconnect'), routersController.disconnectUserSession);
router.get('/routers/:id/logs', requirePermission('audit.view'), routersController.getRouterLogs);

export default router;
