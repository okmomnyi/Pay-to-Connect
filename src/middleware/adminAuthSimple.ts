import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import pool from '../database/db';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const MAX_FAILED_ATTEMPTS = 5;
const SESSION_DURATION_HOURS = 8;

export interface AdminUser {
    id: string;
    username: string;
    email: string;
    full_name: string;
    active: boolean;
    locked: boolean;
    permissions: string[];
}

declare global {
    namespace Express {
        interface Request {
            admin?: AdminUser;
        }
    }
}

class AdminAuthServiceSimple {
    async login(
        username: string,
        password: string,
        ipAddress: string,
        userAgent: string
    ): Promise<{ success: boolean; token?: string; admin?: AdminUser; message?: string }> {
        try {
            // Get admin user without get_admin_permissions function
            const result = await pool.query(
                `SELECT au.* 
                 FROM admin_users au
                 WHERE (au.username = $1 OR au.email = $1)`,
                [username]
            );

            if (result.rows.length === 0) {
                return { success: false, message: 'Invalid credentials' };
            }

            const admin = result.rows[0];

            // Check if account is active
            if (!admin.active) {
                return { success: false, message: 'Account is inactive' };
            }

            // Check if account is locked
            if (admin.locked) {
                return { success: false, message: 'Account is locked. Contact administrator.' };
            }

            // Verify password
            const passwordMatch = await bcrypt.compare(password, admin.password_hash);

            if (!passwordMatch) {
                // Increment failed attempts
                const newFailedAttempts = (admin.failed_login_attempts || 0) + 1;
                const shouldLock = newFailedAttempts >= MAX_FAILED_ATTEMPTS;

                await pool.query(
                    `UPDATE admin_users 
                     SET failed_login_attempts = $1,
                         locked = $2
                     WHERE id = $3`,
                    [newFailedAttempts, shouldLock, admin.id]
                );

                if (shouldLock) {
                    return { success: false, message: 'Account locked due to too many failed attempts' };
                }

                return { success: false, message: 'Invalid credentials' };
            }

            // Reset failed attempts
            await pool.query(
                `UPDATE admin_users 
                 SET failed_login_attempts = 0,
                     last_login = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [admin.id]
            );

            // Get permissions manually without the function
            let permissions: string[] = [];
            try {
                const permResult = await pool.query(
                    `SELECT ar.permissions
                     FROM admin_user_roles aur
                     JOIN admin_roles ar ON aur.role_id = ar.id
                     WHERE aur.admin_user_id = $1`,
                    [admin.id]
                );

                permissions = permResult.rows.reduce((acc: string[], row) => {
                    if (row.permissions && Array.isArray(row.permissions)) {
                        acc.push(...row.permissions);
                    }
                    return acc;
                }, []);
            } catch (error) {
                logger.warn('Could not fetch admin permissions:', error);
                // Default to basic permissions
                permissions = ['admin.view', 'user.view', 'package.view', 'session.view'];
            }

            // Create JWT token
            const token = jwt.sign(
                { 
                    adminId: admin.id,
                    username: admin.username,
                    permissions 
                },
                JWT_SECRET,
                { expiresIn: '8h' }
            );

            const adminUser: AdminUser = {
                id: admin.id,
                username: admin.username,
                email: admin.email,
                full_name: admin.full_name,
                active: admin.active,
                locked: admin.locked,
                permissions
            };

            return {
                success: true,
                token,
                admin: adminUser
            };
        } catch (error) {
            logger.error('Admin login error:', error);
            return { success: false, message: 'Login failed' };
        }
    }

    async verifyToken(token: string): Promise<AdminUser | null> {
        try {
            const decoded: any = jwt.verify(token, JWT_SECRET);
            
            const result = await pool.query(
                `SELECT au.* 
                 FROM admin_users au
                 WHERE au.id = $1 AND au.active = true`,
                [decoded.adminId]
            );

            if (result.rows.length === 0) {
                return null;
            }

            const admin = result.rows[0];

            // Get permissions
            let permissions: string[] = [];
            try {
                const permResult = await pool.query(
                    `SELECT ar.permissions
                     FROM admin_user_roles aur
                     JOIN admin_roles ar ON aur.role_id = ar.id
                     WHERE aur.admin_user_id = $1`,
                    [admin.id]
                );

                permissions = permResult.rows.reduce((acc: string[], row) => {
                    if (row.permissions && Array.isArray(row.permissions)) {
                        acc.push(...row.permissions);
                    }
                    return acc;
                }, []);
            } catch (error) {
                permissions = decoded.permissions || [];
            }

            return {
                id: admin.id,
                username: admin.username,
                email: admin.email,
                full_name: admin.full_name,
                active: admin.active,
                locked: admin.locked,
                permissions
            };
        } catch (error) {
            logger.error('Token verification failed:', error);
            return null;
        }
    }

    async logout(token: string): Promise<void> {
        // For JWT, we don't need to store sessions, just let token expire
        logger.info('Admin logged out');
    }
}

const adminAuthServiceSimple = new AdminAuthServiceSimple();

// Middleware
export const authenticateAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            res.status(401).json({
                success: false,
                error: 'No token provided'
            });
            return;
        }

        const admin = await adminAuthServiceSimple.verifyToken(token);
        
        if (!admin) {
            res.status(401).json({
                success: false,
                error: 'Invalid token'
            });
            return;
        }

        req.admin = admin;
        next();
    } catch (error) {
        logger.error('Authentication middleware error:', error);
        res.status(401).json({
            success: false,
            error: 'Authentication failed'
        });
        return;
    }
};

// Permission check middleware
export const requirePermission = (permission: string) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.admin) {
            res.status(401).json({
                success: false,
                error: 'Not authenticated'
            });
            return;
        }

        if (!req.admin.permissions.includes(permission)) {
            res.status(403).json({
                success: false,
                error: 'Permission denied'
            });
            return;
        }

        next();
    };
};

// Multiple permissions check middleware
export const requireAnyPermission = (permissions: string[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.admin) {
            res.status(401).json({
                success: false,
                error: 'Not authenticated'
            });
            return;
        }

        const hasPermission = permissions.some(p => req.admin!.permissions.includes(p));

        if (!hasPermission) {
            res.status(403).json({
                success: false,
                error: 'Permission denied'
            });
            return;
        }

        next();
    };
};

export default adminAuthServiceSimple;
