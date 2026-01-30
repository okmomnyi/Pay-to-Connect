import express from 'express';
import { authenticateAdmin, requirePermission, requireAnyPermission } from '../middleware/adminAuthBasic';
import * as authController from '../controllers/adminAuthControllerBasic';
import * as dashboardController from '../controllers/adminDashboardController';
import * as adminUsersController from '../controllers/adminUsersController';
import * as routersController from '../controllers/adminRoutersController';
import * as packagesController from '../controllers/adminPackagesController';
import * as usersManagementController from '../controllers/adminUsersManagementController';
import * as sessionsController from '../controllers/adminSessionsController';
import * as paymentsController from '../controllers/adminPaymentsController';
import * as estatesController from '../controllers/adminEstatesController';

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

// Packages management routes
router.get('/packages', requirePermission('package.view'), packagesController.getAllPackages);
router.get('/packages/:id', requirePermission('package.view'), packagesController.getPackageById);
router.post('/packages', requirePermission('package.create'), packagesController.createPackage);
router.put('/packages/:id', requirePermission('package.edit'), packagesController.updatePackage);
router.delete('/packages/:id', requirePermission('package.delete'), packagesController.deletePackage);
router.post('/packages/:id/toggle', requirePermission('package.edit'), packagesController.togglePackageStatus);

// Users management routes
router.get('/users', requirePermission('user.view'), usersManagementController.getAllUsers);
router.get('/users/:id', requirePermission('user.view'), usersManagementController.getUserById);
router.put('/users/:id', requirePermission('user.edit'), usersManagementController.updateUser);
router.post('/users/:id/toggle', requirePermission('user.edit'), usersManagementController.toggleUserStatus);
router.get('/users/:id/sessions', requirePermission('user.view'), usersManagementController.getUserSessions);

// Sessions management routes
router.get('/sessions', requirePermission('session.view'), sessionsController.getAllSessions);
router.get('/sessions/:id', requirePermission('session.view'), sessionsController.getSessionById);
router.post('/sessions/:id/disconnect', requirePermission('session.disconnect'), sessionsController.disconnectSession);
router.get('/sessions/active', requirePermission('session.view'), sessionsController.getActiveSessions);
router.get('/sessions/stats', requirePermission('analytics.view'), sessionsController.getSessionStats);

// Payments management routes
router.get('/payments', requirePermission('payment.view'), paymentsController.getAllPayments);
router.get('/payments/:id', requirePermission('payment.view'), paymentsController.getPaymentById);
router.put('/payments/:id/status', requirePermission('payment.edit'), paymentsController.updatePaymentStatus);
router.post('/payments/:id/refund', requirePermission('payment.refund'), paymentsController.refundPayment);
router.get('/payments/stats', requirePermission('analytics.view'), paymentsController.getPaymentStats);

// Estates management routes
router.get('/estates', requirePermission('estate.view'), estatesController.getAllEstates);
router.get('/estates/:id', requirePermission('estate.view'), estatesController.getEstateById);
router.post('/estates', requirePermission('estate.create'), estatesController.createEstate);
router.put('/estates/:id', requirePermission('estate.edit'), estatesController.updateEstate);
router.delete('/estates/:id', requirePermission('estate.delete'), estatesController.deleteEstate);
router.post('/estates/:id/toggle', requirePermission('estate.edit'), estatesController.toggleEstateStatus);
router.get('/estates/:id/stats', requirePermission('analytics.view'), estatesController.getEstateStats);

export default router;
