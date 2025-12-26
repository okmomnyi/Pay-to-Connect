import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import Joi from 'joi';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Mock admin data
const mockAdmins = [
    {
        id: 'admin_1',
        username: 'admin',
        email: 'admin@estate.local',
        password_hash: '$2b$12$Apfah3mAu.3IRk.y/rDr4uHZ9rfwsWgR5xZmkBvVwwoKv6yLpoy2i', // admin123
        active: true
    }
];

// Mock data for dashboard
const mockPackages = [
    { id: 'pkg_1', name: '1 Hour Basic', duration_minutes: 60, price_kes: 10.00, active: true },
    { id: 'pkg_2', name: '3 Hours Standard', duration_minutes: 180, price_kes: 25.00, active: true },
    { id: 'pkg_3', name: '24 Hours Premium', duration_minutes: 1440, price_kes: 50.00, active: true },
    { id: 'pkg_4', name: '7 Days Unlimited', duration_minutes: 10080, price_kes: 200.00, active: true }
];

const mockSessions: any[] = [];
const mockPayments: any[] = [];
const mockRouters: any[] = [];

interface AdminUser {
    id: string;
    username: string;
    email: string;
}

interface AuthRequest extends Request {
    user?: AdminUser;
}

class MockAdminController {
    public login = async (req: Request, res: Response): Promise<void> => {
        try {
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

            const admin = mockAdmins.find(a => a.username === username && a.active);

            if (!admin) {
                res.status(401).json({
                    success: false,
                    error: 'Invalid credentials'
                });
                return;
            }

            const isValidPassword = await bcrypt.compare(password, admin.password_hash);

            if (!isValidPassword) {
                res.status(401).json({
                    success: false,
                    error: 'Invalid credentials'
                });
                return;
            }

            const token = jwt.sign(
                { 
                    userId: admin.id, 
                    username: admin.username,
                    email: admin.email 
                },
                process.env.JWT_SECRET!,
                { expiresIn: '24h' }
            );

            res.json({
                success: true,
                token,
                user: {
                    id: admin.id,
                    username: admin.username,
                    email: admin.email
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
            const stats = {
                activeSessions: mockSessions.filter(s => s.active).length,
                todayPayments: {
                    count: mockPayments.filter(p => p.status === 'success').length,
                    amount: mockPayments.filter(p => p.status === 'success').reduce((sum, p) => sum + p.amount, 0)
                },
                totalDevices: 5, // Mock data
                totalRevenue: mockPayments.filter(p => p.status === 'success').reduce((sum, p) => sum + p.amount, 0)
            };

            const recentSessions = mockSessions.slice(-10).map(session => ({
                id: session.id,
                macAddress: session.mac_address || '00:11:22:33:44:55',
                packageName: 'Mock Package',
                price: 25.00,
                startTime: session.start_time || new Date().toISOString(),
                endTime: session.end_time || new Date(Date.now() + 3600000).toISOString(),
                active: session.active || false,
                paymentStatus: 'success'
            }));

            res.json({
                success: true,
                stats,
                recentSessions
            });
        } catch (error) {
            logger.error('Get dashboard failed:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    public getPackages = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            res.json({
                success: true,
                packages: mockPackages
            });
        } catch (error) {
            logger.error('Get packages failed:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    public createPackage = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const schema = Joi.object({
                name: Joi.string().required(),
                duration_minutes: Joi.number().integer().min(1).required(),
                price_kes: Joi.number().min(0).required()
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                res.status(400).json({
                    success: false,
                    error: error.details[0].message
                });
                return;
            }

            const newPackage = {
                id: `pkg_${Date.now()}`,
                ...value,
                active: true,
                created_at: new Date().toISOString()
            };

            mockPackages.push(newPackage);

            res.status(201).json({
                success: true,
                message: 'Package created successfully',
                package: newPackage
            });
        } catch (error) {
            logger.error('Create package failed:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    public updatePackage = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            const packageIndex = mockPackages.findIndex(p => p.id === id);

            if (packageIndex === -1) {
                res.status(404).json({
                    success: false,
                    error: 'Package not found'
                });
                return;
            }

            const schema = Joi.object({
                name: Joi.string(),
                duration_minutes: Joi.number().integer().min(1),
                price_kes: Joi.number().min(0),
                active: Joi.boolean()
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                res.status(400).json({
                    success: false,
                    error: error.details[0].message
                });
                return;
            }

            mockPackages[packageIndex] = { ...mockPackages[packageIndex], ...value };

            res.json({
                success: true,
                message: 'Package updated successfully',
                package: mockPackages[packageIndex]
            });
        } catch (error) {
            logger.error('Update package failed:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    public getRouters = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            res.json({
                success: true,
                routers: mockRouters
            });
        } catch (error) {
            logger.error('Get routers failed:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    public createRouter = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const schema = Joi.object({
                name: Joi.string().required(),
                ip_address: Joi.string().ip().required(),
                shared_secret: Joi.string().required()
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                res.status(400).json({
                    success: false,
                    error: error.details[0].message
                });
                return;
            }

            const newRouter = {
                id: `router_${Date.now()}`,
                ...value,
                active: true,
                created_at: new Date().toISOString()
            };

            mockRouters.push(newRouter);

            res.status(201).json({
                success: true,
                message: 'Router created successfully',
                router: newRouter
            });
        } catch (error) {
            logger.error('Create router failed:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    public getSessions = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            res.json({
                success: true,
                sessions: mockSessions
            });
        } catch (error) {
            logger.error('Get sessions failed:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    public getPayments = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            res.json({
                success: true,
                payments: mockPayments
            });
        } catch (error) {
            logger.error('Get payments failed:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };
}

export default MockAdminController;
