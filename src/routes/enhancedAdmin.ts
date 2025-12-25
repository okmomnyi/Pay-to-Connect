import express from 'express';
import rateLimit from 'express-rate-limit';
import EnhancedAdminController from '../controllers/enhancedAdminController';
import { enhancedAuthenticateToken } from '../middleware/enhancedAuth';
import DatabaseConnection from '../database/connection';

const router = express.Router();
const adminController = new EnhancedAdminController();

// Rate limiting for authentication endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: {
        success: false,
        error: 'Too many authentication attempts, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false
});

const otpLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 3, // 3 OTP attempts per window
    message: {
        success: false,
        error: 'Too many OTP attempts, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Public authentication routes
router.post('/register', authLimiter, (req, res) => adminController.register(req, res));
router.post('/verify-registration', otpLimiter, (req, res) => adminController.verifyRegistration(req, res));
router.post('/login', authLimiter, (req, res) => adminController.login(req, res));
router.post('/verify-login', otpLimiter, (req, res) => adminController.verifyLogin(req, res));

// Protected routes (require authentication)
router.post('/logout', enhancedAuthenticateToken, (req, res) => adminController.logout(req, res));
router.get('/dashboard', enhancedAuthenticateToken, (req, res) => adminController.getDashboard(req, res));

// Package management routes
router.get('/packages', enhancedAuthenticateToken, async (req, res) => {
    try {
        const db = DatabaseConnection.getInstance();
        const packages = await db.query(`
            SELECT id, name, duration_minutes, price_kes, active, created_at, updated_at
            FROM packages
            ORDER BY created_at DESC
        `);

        res.json({
            success: true,
            packages: packages.rows
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch packages'
        });
    }
});

router.post('/packages', enhancedAuthenticateToken, async (req, res) => {
    try {
        const { name, durationMinutes, priceKes } = req.body;
        const db = DatabaseConnection.getInstance();

        const result = await db.query(`
            INSERT INTO packages (name, duration_minutes, price_kes, active)
            VALUES ($1, $2, $3, true)
            RETURNING id, name, duration_minutes, price_kes, active, created_at
        `, [name, durationMinutes, priceKes]);

        res.status(201).json({
            success: true,
            package: result.rows[0]
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to create package'
        });
    }
});

router.put('/packages/:id', enhancedAuthenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, durationMinutes, priceKes, active } = req.body;
        const db = DatabaseConnection.getInstance();

        const result = await db.query(`
            UPDATE packages 
            SET name = $1, duration_minutes = $2, price_kes = $3, active = $4, updated_at = NOW()
            WHERE id = $5
            RETURNING id, name, duration_minutes, price_kes, active, updated_at
        `, [name, durationMinutes, priceKes, active, id]);

        if (result.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: 'Package not found'
            });
            return;
        }

        res.json({
            success: true,
            package: result.rows[0]
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to update package'
        });
    }
});

router.delete('/packages/:id', enhancedAuthenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const db = DatabaseConnection.getInstance();

        const result = await db.query(
            'DELETE FROM packages WHERE id = $1 RETURNING id',
            [id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: 'Package not found'
            });
            return;
        }

        res.json({
            success: true,
            message: 'Package deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to delete package'
        });
    }
});

// Router management routes
router.get('/routers', enhancedAuthenticateToken, async (req, res) => {
    try {
        const db = DatabaseConnection.getInstance();
        const routers = await db.query(`
            SELECT id, name, ip_address, active, created_at, updated_at
            FROM routers
            ORDER BY created_at DESC
        `);

        res.json({
            success: true,
            routers: routers.rows
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch routers'
        });
    }
});

router.post('/routers', enhancedAuthenticateToken, async (req, res) => {
    try {
        const { name, ipAddress } = req.body;
        const db = DatabaseConnection.getInstance();

        const result = await db.query(`
            INSERT INTO routers (name, ip_address, active)
            VALUES ($1, $2, true)
            RETURNING id, name, ip_address, active, created_at
        `, [name, ipAddress]);

        res.status(201).json({
            success: true,
            router: result.rows[0]
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to create router'
        });
    }
});

// Sessions monitoring
router.get('/sessions', enhancedAuthenticateToken, async (req, res) => {
    try {
        const db = DatabaseConnection.getInstance();
        const sessions = await db.query(`
            SELECT s.*, d.mac_address, d.device_name, p.name as package_name
            FROM sessions s
            LEFT JOIN devices d ON s.device_id = d.id
            LEFT JOIN packages p ON s.package_id = p.id
            ORDER BY s.created_at DESC
            LIMIT 100
        `);

        res.json({
            success: true,
            sessions: sessions.rows
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch sessions'
        });
    }
});

// Payments monitoring
router.get('/payments', enhancedAuthenticateToken, async (req, res) => {
    try {
        const db = DatabaseConnection.getInstance();
        const payments = await db.query(`
            SELECT p.*, d.mac_address, d.device_name, pkg.name as package_name
            FROM payments p
            LEFT JOIN devices d ON p.device_id = d.id
            LEFT JOIN packages pkg ON p.package_id = pkg.id
            ORDER BY p.created_at DESC
            LIMIT 100
        `);

        res.json({
            success: true,
            payments: payments.rows
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch payments'
        });
    }
});

// Audit logs
router.get('/audit-logs', enhancedAuthenticateToken, async (req, res) => {
    try {
        const db = DatabaseConnection.getInstance();
        const logs = await db.query(`
            SELECT al.*, au.username
            FROM admin_audit_logs al
            LEFT JOIN admin_users au ON al.user_id = au.id
            ORDER BY al.created_at DESC
            LIMIT 100
        `);

        res.json({
            success: true,
            logs: logs.rows
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch audit logs'
        });
    }
});

// Health check
router.get('/health', (req, res) => {
    res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

export default router;
