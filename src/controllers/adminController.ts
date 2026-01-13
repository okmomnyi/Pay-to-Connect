import { Request, Response } from 'express';
import DatabaseConnection from '../database/connection';
import { logger } from '../utils/logger';
import auditService from '../services/auditService';
import Joi from 'joi';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

interface AdminUser {
    id: string;
    username: string;
    email: string;
}

interface AuthRequest extends Request {
    user?: AdminUser;
}

class AdminController {
    private db: DatabaseConnection;

    constructor() {
        this.db = DatabaseConnection.getInstance();
    }

    public login = async (req: Request, res: Response): Promise<void> => {
        try {
            // Validate JWT_SECRET exists
            if (!process.env.JWT_SECRET) {
                logger.error('JWT_SECRET not configured');
                res.status(500).json({
                    success: false,
                    error: 'Server configuration error'
                });
                return;
            }

            const schema = Joi.object({
                username: Joi.string().required(),
                password: Joi.string().required()
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                res.status(400).json({
                    success: false,
                    error: error.details[0].message
                });
                return;
            }

            const { username, password } = value;

            const result = await this.db.query(
                'SELECT id, username, email, password_hash FROM admin_users WHERE username = $1 AND active = true',
                [username]
            );

            if (result.rows.length === 0) {
                res.status(401).json({
                    success: false,
                    error: 'Invalid credentials'
                });
                return;
            }

            const user = result.rows[0];
            const isValidPassword = await bcrypt.compare(password, user.password_hash);

            if (!isValidPassword) {
                res.status(401).json({
                    success: false,
                    error: 'Invalid credentials'
                });
                return;
            }

            const token = jwt.sign(
                { 
                    userId: user.id, 
                    username: user.username,
                    email: user.email 
                },
                process.env.JWT_SECRET,
                { expiresIn: '24h' }
            );

            res.json({
                success: true,
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email
                }
            });
        } catch (error) {
            logger.error('Admin login failed:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    public getDashboard = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            // Get dashboard statistics
            const [
                activeSessionsResult,
                todayPaymentsResult,
                totalDevicesResult,
                revenueResult
            ] = await Promise.all([
                this.db.query('SELECT COUNT(*) as count FROM sessions WHERE active = true AND end_time > NOW()'),
                this.db.query("SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'success' AND DATE(created_at) = CURRENT_DATE"),
                this.db.query('SELECT COUNT(*) as count FROM devices'),
                this.db.query("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'success'")
            ]);

            const stats = {
                activeSessions: parseInt(activeSessionsResult.rows[0].count),
                todayPayments: {
                    count: parseInt(todayPaymentsResult.rows[0].count),
                    amount: parseFloat(todayPaymentsResult.rows[0].total)
                },
                totalDevices: parseInt(totalDevicesResult.rows[0].count),
                totalRevenue: parseFloat(revenueResult.rows[0].total)
            };

            // Get recent sessions
            const recentSessionsResult = await this.db.query(`
                SELECT s.id, s.start_time, s.end_time, s.active,
                       d.mac_address, p.name as package_name, p.price_kes,
                       py.status as payment_status
                FROM sessions s
                JOIN devices d ON s.device_id = d.id
                JOIN packages p ON s.package_id = p.id
                LEFT JOIN payments py ON s.payment_id = py.id
                ORDER BY s.created_at DESC
                LIMIT 10
            `);

            const recentSessions = recentSessionsResult.rows.map((session: any) => ({
                id: session.id,
                macAddress: session.mac_address,
                packageName: session.package_name,
                price: parseFloat(session.price_kes),
                startTime: session.start_time,
                endTime: session.end_time,
                active: session.active,
                paymentStatus: session.payment_status
            }));

            res.json({
                success: true,
                stats,
                recentSessions
            });
        } catch (error) {
            logger.error('Failed to get dashboard data:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    public getPackages = async (req: AuthRequest, res: Response): Promise<void> => {
        const startTime = Date.now();
        
        try {
            const result = await this.db.query(`
                SELECT id, name, description, package_type, duration_minutes, 
                       data_limit_mb, speed_limit_mbps, price_kes, active, 
                       created_at, updated_at
                FROM packages
                ORDER BY price_kes ASC
            `);

            const packages = result.rows.map((pkg: any) => ({
                id: pkg.id,
                name: pkg.name,
                description: pkg.description,
                packageType: pkg.package_type,
                durationMinutes: pkg.duration_minutes,
                dataLimitMb: pkg.data_limit_mb,
                speedLimitMbps: pkg.speed_limit_mbps,
                priceKes: parseFloat(pkg.price_kes),
                active: pkg.active,
                createdAt: pkg.created_at,
                updatedAt: pkg.updated_at
            }));

            // Log successful action
            await auditService.logAdminAction({
                adminUserId: req.user!.id,
                actionType: 'package.list',
                resourceType: 'package',
                actionDetails: { count: packages.length },
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                success: true,
                executionTimeMs: Date.now() - startTime
            });

            res.json({
                success: true,
                packages
            });
        } catch (error) {
            logger.error('Failed to get packages:', error);
            
            await auditService.logAdminAction({
                adminUserId: req.user!.id,
                actionType: 'package.list',
                resourceType: 'package',
                actionDetails: {},
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                success: false,
                errorMessage: error instanceof Error ? error.message : 'Unknown error',
                executionTimeMs: Date.now() - startTime
            });
            
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve packages'
            });
        }
    };

    public createPackage = async (req: AuthRequest, res: Response): Promise<void> => {
        const startTime = Date.now();
        
        try {
            const schema = Joi.object({
                name: Joi.string().min(1).max(255).required(),
                description: Joi.string().max(1000).optional(),
                packageType: Joi.string().valid('time_based', 'data_based', 'hybrid').default('time_based'),
                durationMinutes: Joi.number().integer().min(1).when('packageType', {
                    is: Joi.string().valid('time_based', 'hybrid'),
                    then: Joi.required(),
                    otherwise: Joi.optional()
                }),
                dataLimitMb: Joi.number().integer().min(1).when('packageType', {
                    is: Joi.string().valid('data_based', 'hybrid'),
                    then: Joi.required(),
                    otherwise: Joi.optional()
                }),
                speedLimitMbps: Joi.number().integer().min(1).optional(),
                priceKes: Joi.number().positive().required()
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                res.status(400).json({
                    success: false,
                    error: error.details[0].message
                });
                return;
            }

            const { name, description, packageType, durationMinutes, dataLimitMb, speedLimitMbps, priceKes } = value;

            // Check if package with same name already exists
            const existingPackage = await this.db.query(
                'SELECT id FROM packages WHERE name = $1',
                [name]
            );

            if (existingPackage.rows.length > 0) {
                res.status(409).json({
                    success: false,
                    error: 'Package with this name already exists'
                });
                return;
            }

            const result = await this.db.query(`
                INSERT INTO packages (name, description, package_type, duration_minutes, data_limit_mb, speed_limit_mbps, price_kes)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING id, name, description, package_type, duration_minutes, data_limit_mb, speed_limit_mbps, price_kes, active, created_at
            `, [name, description, packageType, durationMinutes, dataLimitMb, speedLimitMbps, priceKes]);

            const newPackage = result.rows[0];

            // Log successful action
            await auditService.logAdminAction({
                adminUserId: req.user!.id,
                actionType: 'package.create',
                resourceType: 'package',
                resourceId: newPackage.id,
                resourceName: newPackage.name,
                actionDetails: {
                    name,
                    description,
                    packageType,
                    durationMinutes,
                    dataLimitMb,
                    speedLimitMbps,
                    priceKes
                },
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                success: true,
                executionTimeMs: Date.now() - startTime
            });

            res.status(201).json({
                success: true,
                package: {
                    id: newPackage.id,
                    name: newPackage.name,
                    description: newPackage.description,
                    packageType: newPackage.package_type,
                    durationMinutes: newPackage.duration_minutes,
                    dataLimitMb: newPackage.data_limit_mb,
                    speedLimitMbps: newPackage.speed_limit_mbps,
                    priceKes: parseFloat(newPackage.price_kes),
                    active: newPackage.active,
                    createdAt: newPackage.created_at
                }
            });
        } catch (error: any) {
            logger.error('Failed to create package:', error);
            
            await auditService.logAdminAction({
                adminUserId: req.user!.id,
                actionType: 'package.create',
                resourceType: 'package',
                actionDetails: req.body,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                success: false,
                errorMessage: error.message || 'Unknown error',
                executionTimeMs: Date.now() - startTime
            });
            
            if (error.code === '23505') { // Unique constraint violation
                res.status(409).json({
                    success: false,
                    error: 'Package with this name already exists'
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: 'Failed to create package'
                });
            }
        }
    };

    public updatePackage = async (req: AuthRequest, res: Response): Promise<void> => {
        const startTime = Date.now();
        
        try {
            const { id } = req.params;
            
            const schema = Joi.object({
                name: Joi.string().min(1).max(255).optional(),
                description: Joi.string().max(1000).optional(),
                packageType: Joi.string().valid('time_based', 'data_based', 'hybrid').optional(),
                durationMinutes: Joi.number().integer().min(1).optional(),
                dataLimitMb: Joi.number().integer().min(1).optional(),
                speedLimitMbps: Joi.number().integer().min(1).optional(),
                priceKes: Joi.number().positive().optional(),
                active: Joi.boolean().optional()
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                res.status(400).json({
                    success: false,
                    error: error.details[0].message
                });
                return;
            }

            // Get current package for audit logging
            const currentPackage = await this.db.query(
                'SELECT id, name FROM packages WHERE id = $1',
                [id]
            );

            if (currentPackage.rows.length === 0) {
                res.status(404).json({
                    success: false,
                    error: 'Package not found'
                });
                return;
            }

            const updates: string[] = [];
            const values: any[] = [];
            let paramCount = 1;

            // Map frontend field names to database column names
            const fieldMapping: { [key: string]: string } = {
                durationMinutes: 'duration_minutes',
                dataLimitMb: 'data_limit_mb',
                speedLimitMbps: 'speed_limit_mbps',
                priceKes: 'price_kes',
                packageType: 'package_type'
            };

            Object.entries(value).forEach(([key, val]) => {
                if (val !== undefined) {
                    const dbKey = fieldMapping[key] || key;
                    updates.push(`${dbKey} = $${paramCount}`);
                    values.push(val);
                    paramCount++;
                }
            });

            if (updates.length === 0) {
                res.status(400).json({
                    success: false,
                    error: 'No valid fields to update'
                });
                return;
            }

            values.push(id);
            const query = `
                UPDATE packages 
                SET ${updates.join(', ')}, updated_at = NOW()
                WHERE id = $${paramCount}
                RETURNING id, name, description, package_type, duration_minutes, data_limit_mb, speed_limit_mbps, price_kes, active, updated_at
            `;

            const result = await this.db.query(query, values);
            const updatedPackage = result.rows[0];

            // Log successful action
            await auditService.logAdminAction({
                adminUserId: req.user!.id,
                actionType: 'package.update',
                resourceType: 'package',
                resourceId: id,
                resourceName: currentPackage.rows[0].name,
                actionDetails: value,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                success: true,
                executionTimeMs: Date.now() - startTime
            });

            res.json({
                success: true,
                package: {
                    id: updatedPackage.id,
                    name: updatedPackage.name,
                    description: updatedPackage.description,
                    packageType: updatedPackage.package_type,
                    durationMinutes: updatedPackage.duration_minutes,
                    dataLimitMb: updatedPackage.data_limit_mb,
                    speedLimitMbps: updatedPackage.speed_limit_mbps,
                    priceKes: parseFloat(updatedPackage.price_kes),
                    active: updatedPackage.active,
                    updatedAt: updatedPackage.updated_at
                }
            });
        } catch (error: any) {
            logger.error('Failed to update package:', error);
            
            await auditService.logAdminAction({
                adminUserId: req.user!.id,
                actionType: 'package.update',
                resourceType: 'package',
                resourceId: req.params.id,
                actionDetails: req.body,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                success: false,
                errorMessage: error.message || 'Unknown error',
                executionTimeMs: Date.now() - startTime
            });
            
            res.status(500).json({
                success: false,
                error: 'Failed to update package'
            });
        }
    };

    public deletePackage = async (req: AuthRequest, res: Response): Promise<void> => {
        const startTime = Date.now();
        
        try {
            const { id } = req.params;

            // Get package details for audit logging
            const packageResult = await this.db.query(
                'SELECT id, name FROM packages WHERE id = $1',
                [id]
            );

            if (packageResult.rows.length === 0) {
                res.status(404).json({
                    success: false,
                    error: 'Package not found'
                });
                return;
            }

            const packageData = packageResult.rows[0];

            // Check if package is being used in active sessions
            const activeSessionsResult = await this.db.query(
                'SELECT COUNT(*) as count FROM sessions WHERE package_id = $1 AND active = true',
                [id]
            );

            const activeSessions = parseInt(activeSessionsResult.rows[0].count);
            
            if (activeSessions > 0) {
                res.status(409).json({
                    success: false,
                    error: `Cannot delete package. It has ${activeSessions} active session(s).`
                });
                return;
            }

            // Check if package has been purchased (has payment history)
            const purchaseHistoryResult = await this.db.query(
                'SELECT COUNT(*) as count FROM payments WHERE package_id = $1',
                [id]
            );

            const hasPurchaseHistory = parseInt(purchaseHistoryResult.rows[0].count) > 0;

            if (hasPurchaseHistory) {
                // Deactivate instead of delete to preserve purchase history
                await this.db.query(
                    'UPDATE packages SET active = false, updated_at = NOW() WHERE id = $1',
                    [id]
                );
                
                // Log successful action
                await auditService.logAdminAction({
                    adminUserId: req.user!.id,
                    actionType: 'package.deactivate',
                    resourceType: 'package',
                    resourceId: id,
                    resourceName: packageData.name,
                    actionDetails: { reason: 'has_purchase_history' },
                    ipAddress: req.ip,
                    userAgent: req.get('User-Agent'),
                    success: true,
                    executionTimeMs: Date.now() - startTime
                });

                res.json({
                    success: true,
                    message: 'Package deactivated successfully (purchase history preserved)'
                });
            } else {
                // Safe to delete - no purchase history
                await this.db.query('DELETE FROM packages WHERE id = $1', [id]);
                
                // Log successful action
                await auditService.logAdminAction({
                    adminUserId: req.user!.id,
                    actionType: 'package.delete',
                    resourceType: 'package',
                    resourceId: id,
                    resourceName: packageData.name,
                    actionDetails: { reason: 'no_purchase_history' },
                    ipAddress: req.ip,
                    userAgent: req.get('User-Agent'),
                    success: true,
                    executionTimeMs: Date.now() - startTime
                });

                res.json({
                    success: true,
                    message: 'Package deleted successfully'
                });
            }
        } catch (error: any) {
            logger.error('Failed to delete package:', error);
            
            await auditService.logAdminAction({
                adminUserId: req.user!.id,
                actionType: 'package.delete',
                resourceType: 'package',
                resourceId: req.params.id,
                actionDetails: {},
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                success: false,
                errorMessage: error.message || 'Unknown error',
                executionTimeMs: Date.now() - startTime
            });
            
            res.status(500).json({
                success: false,
                error: 'Failed to delete package'
            });
        }
    };

    public getRouters = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const result = await this.db.query(`
                SELECT r.id, r.name, r.ip_address, r.active, r.created_at, r.updated_at,
                       e.name as estate_name
                FROM routers r
                JOIN estates e ON r.estate_id = e.id
                ORDER BY r.name ASC
            `);

            const routers = result.rows.map((router: any) => ({
                id: router.id,
                name: router.name,
                ipAddress: router.ip_address,
                estateName: router.estate_name,
                active: router.active,
                createdAt: router.created_at,
                updatedAt: router.updated_at
            }));

            res.json({
                success: true,
                routers
            });
        } catch (error) {
            logger.error('Failed to get routers:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    public createRouter = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const schema = Joi.object({
                name: Joi.string().min(1).max(255).required(),
                ipAddress: Joi.string().ip().required(),
                sharedSecret: Joi.string().min(8).required(),
                estateId: Joi.string().uuid()
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                res.status(400).json({
                    success: false,
                    error: error.details[0].message
                });
                return;
            }

            const { name, ipAddress, sharedSecret, estateId } = value;

            // Use default estate if not provided
            let finalEstateId = estateId;
            if (!finalEstateId) {
                const defaultEstate = await this.db.query(
                    'SELECT id FROM estates ORDER BY created_at ASC LIMIT 1'
                );
                finalEstateId = defaultEstate.rows[0].id;
            }

            const result = await this.db.query(`
                INSERT INTO routers (estate_id, name, ip_address, shared_secret)
                VALUES ($1, $2, $3, $4)
                RETURNING id, name, ip_address, active, created_at
            `, [finalEstateId, name, ipAddress, sharedSecret]);

            const newRouter = result.rows[0];

            res.status(201).json({
                success: true,
                router: {
                    id: newRouter.id,
                    name: newRouter.name,
                    ipAddress: newRouter.ip_address,
                    active: newRouter.active,
                    createdAt: newRouter.created_at
                }
            });
        } catch (error: any) {
            logger.error('Failed to create router:', error);
            if (error.code === '23505') { // Unique constraint violation
                res.status(409).json({
                    success: false,
                    error: 'Router with this IP address already exists'
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: 'Internal server error'
                });
            }
        }
    };

    public getSessions = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 50;
            const offset = (page - 1) * limit;

            const [sessionsResult, countResult] = await Promise.all([
                this.db.query(`
                    SELECT s.id, s.start_time, s.end_time, s.active,
                           d.mac_address, p.name as package_name, p.price_kes,
                           py.status as payment_status, py.mpesa_receipt,
                           r.name as router_name
                    FROM sessions s
                    JOIN devices d ON s.device_id = d.id
                    JOIN packages p ON s.package_id = p.id
                    JOIN routers r ON s.router_id = r.id
                    LEFT JOIN payments py ON s.payment_id = py.id
                    ORDER BY s.created_at DESC
                    LIMIT $1 OFFSET $2
                `, [limit, offset]),
                this.db.query('SELECT COUNT(*) as total FROM sessions')
            ]);

            const sessions = sessionsResult.rows.map((session: any) => ({
                id: session.id,
                macAddress: session.mac_address,
                packageName: session.package_name,
                price: parseFloat(session.price_kes),
                startTime: session.start_time,
                endTime: session.end_time,
                active: session.active,
                paymentStatus: session.payment_status,
                mpesaReceipt: session.mpesa_receipt,
                routerName: session.router_name
            }));

            const total = parseInt(countResult.rows[0].total);
            const totalPages = Math.ceil(total / limit);

            res.json({
                success: true,
                sessions,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages
                }
            });
        } catch (error) {
            logger.error('Failed to get sessions:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    public getPayments = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 50;
            const offset = (page - 1) * limit;

            const [paymentsResult, countResult] = await Promise.all([
                this.db.query(`
                    SELECT id, phone, amount, mpesa_receipt, status, created_at, mpesa_checkout_request_id
                    FROM payments
                    ORDER BY created_at DESC
                    LIMIT $1 OFFSET $2
                `, [limit, offset]),
                this.db.query('SELECT COUNT(*) as total FROM payments')
            ]);

            const payments = paymentsResult.rows.map((payment: any) => ({
                id: payment.id,
                phone: payment.phone,
                amount: parseFloat(payment.amount),
                mpesaReceipt: payment.mpesa_receipt,
                status: payment.status,
                createdAt: payment.created_at,
                checkoutRequestId: payment.mpesa_checkout_request_id
            }));

            const total = parseInt(countResult.rows[0].total);
            const totalPages = Math.ceil(total / limit);

            res.json({
                success: true,
                payments,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages
                }
            });
        } catch (error) {
            logger.error('Failed to get payments:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    public approvePayment = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            const { mpesaReceipt } = req.body;

            // Check if payment exists and is pending
            const paymentResult = await this.db.query(
                'SELECT id, status, device_id, package_id, amount FROM payments WHERE id = $1',
                [id]
            );

            if (paymentResult.rows.length === 0) {
                res.status(404).json({
                    success: false,
                    error: 'Payment not found'
                });
                return;
            }

            const payment = paymentResult.rows[0];

            if (payment.status !== 'pending') {
                res.status(400).json({
                    success: false,
                    error: `Payment already ${payment.status}`
                });
                return;
            }

            // Update payment to success
            const receipt = mpesaReceipt || `TEST${Date.now()}`;
            await this.db.query(
                `UPDATE payments 
                 SET status = 'success', mpesa_receipt = $1, updated_at = NOW()
                 WHERE id = $2`,
                [receipt, id]
            );

            // Create session for the user
            const packageResult = await this.db.query(
                'SELECT duration_minutes FROM packages WHERE id = $1',
                [payment.package_id]
            );

            if (packageResult.rows.length > 0) {
                const durationMinutes = packageResult.rows[0].duration_minutes;
                const endTime = new Date(Date.now() + durationMinutes * 60 * 1000);

                // Get first available router
                const routerResult = await this.db.query(
                    'SELECT id FROM routers WHERE active = true LIMIT 1'
                );

                if (routerResult.rows.length > 0) {
                    await this.db.query(
                        `INSERT INTO sessions (device_id, package_id, router_id, payment_id, start_time, end_time, active)
                         VALUES ($1, $2, $3, $4, NOW(), $5, true)`,
                        [payment.device_id, payment.package_id, routerResult.rows[0].id, id, endTime]
                    );
                }
            }

            logger.info(`Payment ${id} manually approved by admin`);

            res.json({
                success: true,
                message: 'Payment approved successfully'
            });
        } catch (error) {
            logger.error('Failed to approve payment:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    // Administrator Management Methods
    public getAdministrators = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const result = await this.db.query(`
                SELECT 
                    id,
                    username,
                    email,
                    active,
                    created_at,
                    last_login
                FROM admin_users
                ORDER BY created_at DESC
            `);

            res.json({
                success: true,
                administrators: result.rows
            });
        } catch (error) {
            logger.error('Failed to get administrators:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    public createAdministrator = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const schema = Joi.object({
                username: Joi.string().alphanum().min(3).max(30).required(),
                email: Joi.string().email().required(),
                password: Joi.string().min(8).required()
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                res.status(400).json({
                    success: false,
                    error: error.details[0].message
                });
                return;
            }

            const { username, email, password } = value;

            const existingAdmin = await this.db.query(
                'SELECT id FROM admin_users WHERE username = $1 OR email = $2',
                [username, email]
            );

            if (existingAdmin.rows.length > 0) {
                res.status(409).json({
                    success: false,
                    error: 'Administrator with this username or email already exists'
                });
                return;
            }

            const passwordHash = await bcrypt.hash(password, 12);

            const result = await this.db.query(
                `INSERT INTO admin_users (username, email, password_hash, active)
                 VALUES ($1, $2, $3, true)
                 RETURNING id, username, email, active, created_at`,
                [username, email, passwordHash]
            );

            const newAdmin = result.rows[0];

            logger.info(`New administrator created: ${username} by ${req.user?.username}`);

            res.status(201).json({
                success: true,
                message: 'Administrator created successfully',
                administrator: {
                    id: newAdmin.id,
                    username: newAdmin.username,
                    email: newAdmin.email,
                    active: newAdmin.active,
                    created_at: newAdmin.created_at
                }
            });
        } catch (error) {
            logger.error('Failed to create administrator:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    public updateAdministrator = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const { id } = req.params;

            const schema = Joi.object({
                email: Joi.string().email().optional(),
                password: Joi.string().min(8).optional(),
                active: Joi.boolean().optional()
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                res.status(400).json({
                    success: false,
                    error: error.details[0].message
                });
                return;
            }

            if (value.active === false && req.user?.id === id) {
                res.status(400).json({
                    success: false,
                    error: 'Cannot deactivate your own account'
                });
                return;
            }

            const updates: string[] = [];
            const params: any[] = [];
            let paramIndex = 1;

            if (value.email) {
                updates.push(`email = $${paramIndex++}`);
                params.push(value.email);
            }

            if (value.password) {
                const passwordHash = await bcrypt.hash(value.password, 12);
                updates.push(`password_hash = $${paramIndex++}`);
                params.push(passwordHash);
            }

            if (value.active !== undefined) {
                updates.push(`active = $${paramIndex++}`);
                params.push(value.active);
            }

            if (updates.length === 0) {
                res.status(400).json({
                    success: false,
                    error: 'No valid fields to update'
                });
                return;
            }

            params.push(id);

            const result = await this.db.query(
                `UPDATE admin_users 
                 SET ${updates.join(', ')}
                 WHERE id = $${paramIndex}
                 RETURNING id, username, email, active`,
                params
            );

            if (result.rows.length === 0) {
                res.status(404).json({
                    success: false,
                    error: 'Administrator not found'
                });
                return;
            }

            logger.info(`Administrator updated: ${result.rows[0].username} by ${req.user?.username}`);

            res.json({
                success: true,
                message: 'Administrator updated successfully',
                administrator: result.rows[0]
            });
        } catch (error) {
            logger.error('Failed to update administrator:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    public deleteAdministrator = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const { id } = req.params;

            if (req.user?.id === id) {
                res.status(400).json({
                    success: false,
                    error: 'Cannot delete your own account'
                });
                return;
            }

            const adminCheck = await this.db.query(
                'SELECT username FROM admin_users WHERE id = $1',
                [id]
            );

            if (adminCheck.rows.length === 0) {
                res.status(404).json({
                    success: false,
                    error: 'Administrator not found'
                });
                return;
            }

            await this.db.query(
                'UPDATE admin_users SET active = false WHERE id = $1',
                [id]
            );

            logger.info(`Administrator deactivated: ${adminCheck.rows[0].username} by ${req.user?.username}`);

            res.json({
                success: true,
                message: 'Administrator deactivated successfully'
            });
        } catch (error) {
            logger.error('Failed to delete administrator:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    public getAuditLogs = async (req: AuthRequest, res: Response): Promise<void> => {
        const startTime = Date.now();
        
        try {
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 50;
            const offset = (page - 1) * limit;
            
            const filters = {
                adminUserId: req.query.adminUserId as string,
                actionType: req.query.actionType as string,
                resourceType: req.query.resourceType as string,
                success: req.query.success ? req.query.success === 'true' : undefined,
                startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
                endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
                limit,
                offset
            };

            const auditLogs = await auditService.getAuditLogs(filters);
            
            // Get total count for pagination
            const countResult = await this.db.query(
                'SELECT COUNT(*) as total FROM admin_action_logs'
            );
            const total = parseInt(countResult.rows[0].total);
            const totalPages = Math.ceil(total / limit);

            // Log successful action
            await auditService.logAdminAction({
                adminUserId: req.user!.id,
                actionType: 'audit.view_logs',
                resourceType: 'audit',
                actionDetails: { filters, count: auditLogs.length },
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                success: true,
                executionTimeMs: Date.now() - startTime
            });

            res.json({
                success: true,
                auditLogs,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages
                }
            });
        } catch (error) {
            logger.error('Failed to get audit logs:', error);
            
            await auditService.logAdminAction({
                adminUserId: req.user!.id,
                actionType: 'audit.view_logs',
                resourceType: 'audit',
                actionDetails: {},
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                success: false,
                errorMessage: error instanceof Error ? error.message : 'Unknown error',
                executionTimeMs: Date.now() - startTime
            });
            
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve audit logs'
            });
        }
    };

    public getSecurityEvents = async (req: AuthRequest, res: Response): Promise<void> => {
        const startTime = Date.now();
        
        try {
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 50;
            const offset = (page - 1) * limit;
            
            const filters = {
                eventType: req.query.eventType as string,
                severity: req.query.severity as string,
                userId: req.query.userId as string,
                userType: req.query.userType as string,
                startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
                endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
                limit,
                offset
            };

            const securityEvents = await auditService.getSecurityEvents(filters);
            
            // Get total count for pagination
            const countResult = await this.db.query(
                'SELECT COUNT(*) as total FROM security_event_logs'
            );
            const total = parseInt(countResult.rows[0].total);
            const totalPages = Math.ceil(total / limit);

            // Log successful action
            await auditService.logAdminAction({
                adminUserId: req.user!.id,
                actionType: 'security.view_events',
                resourceType: 'security',
                actionDetails: { filters, count: securityEvents.length },
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                success: true,
                executionTimeMs: Date.now() - startTime
            });

            res.json({
                success: true,
                securityEvents,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages
                }
            });
        } catch (error) {
            logger.error('Failed to get security events:', error);
            
            await auditService.logAdminAction({
                adminUserId: req.user!.id,
                actionType: 'security.view_events',
                resourceType: 'security',
                actionDetails: {},
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                success: false,
                errorMessage: error instanceof Error ? error.message : 'Unknown error',
                executionTimeMs: Date.now() - startTime
            });
            
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve security events'
            });
        }
    };
}

export default AdminController;
