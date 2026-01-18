import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import DatabaseConnection from '../database/connection';
import encryptionService from '../utils/encryption';
import auditService from '../services/auditService';
import { logger } from '../utils/logger';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 30;
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

class AdminAuthService {
    private db: DatabaseConnection;

    constructor() {
        this.db = DatabaseConnection.getInstance();
    }

    async login(
        username: string,
        password: string,
        ipAddress: string,
        userAgent: string
    ): Promise<{ success: boolean; token?: string; admin?: AdminUser; message?: string }> {
        try {
            // Get admin user
            const result = await this.db.query(
                `SELECT au.*, 
                        get_admin_permissions(au.id) as permissions
                 FROM admin_users au
                 WHERE (au.username = $1 OR au.email = $1)`,
                [username]
            );

            if (result.rows.length === 0) {
                await auditService.logSecurityEvent(
                    'admin_login_failed',
                    'medium',
                    null,
                    'admin',
                    ipAddress,
                    userAgent,
                    { username, reason: 'user_not_found' }
                );

                return { success: false, message: 'Invalid credentials' };
            }

            const admin = result.rows[0];

            // Check if account is active
            if (!admin.active) {
                await auditService.logSecurityEvent(
                    'admin_login_failed',
                    'medium',
                    admin.id,
                    'admin',
                    ipAddress,
                    userAgent,
                    { username, reason: 'account_inactive' }
                );

                return { success: false, message: 'Account is inactive' };
            }

            // Check if account is locked
            if (admin.locked) {
                await auditService.logSecurityEvent(
                    'admin_login_failed',
                    'high',
                    admin.id,
                    'admin',
                    ipAddress,
                    userAgent,
                    { username, reason: 'account_locked' }
                );

                return { success: false, message: 'Account is locked. Contact administrator.' };
            }

            // Verify password
            const passwordMatch = await bcrypt.compare(password, admin.password_hash);

            if (!passwordMatch) {
                // Increment failed attempts
                const newFailedAttempts = (admin.failed_login_attempts || 0) + 1;
                const shouldLock = newFailedAttempts >= MAX_FAILED_ATTEMPTS;

                await this.db.query(
                    `UPDATE admin_users 
                     SET failed_login_attempts = $1,
                         locked = $2
                     WHERE id = $3`,
                    [newFailedAttempts, shouldLock, admin.id]
                );

                await auditService.logSecurityEvent(
                    'admin_login_failed',
                    shouldLock ? 'high' : 'medium',
                    admin.id,
                    'admin',
                    ipAddress,
                    userAgent,
                    { 
                        username, 
                        reason: 'invalid_password',
                        failed_attempts: newFailedAttempts,
                        locked: shouldLock
                    }
                );

                if (shouldLock) {
                    return { success: false, message: 'Account locked due to too many failed attempts' };
                }

                return { success: false, message: 'Invalid credentials' };
            }

            // Reset failed attempts
            await this.db.query(
                `UPDATE admin_users 
                 SET failed_login_attempts = 0,
                     last_login = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [admin.id]
            );

            // Create session token
            const token = encryptionService.generateToken(64);
            const tokenHash = encryptionService.hash(token);
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + SESSION_DURATION_HOURS);

            await this.db.query(
                `INSERT INTO admin_sessions (admin_user_id, token_hash, ip_address, user_agent, expires_at)
                 VALUES ($1, $2, $3, $4, $5)`,
                [admin.id, tokenHash, ipAddress, userAgent, expiresAt]
            );

            // Log successful login
            await auditService.logAction({
                adminUserId: admin.id,
                username: admin.username,
                actionType: 'admin.login',
                resourceType: 'admin',
                resourceId: admin.id,
                ipAddress,
                userAgent,
                success: true
            });

            await auditService.logSecurityEvent(
                'admin_login_success',
                'low',
                admin.id,
                'admin',
                ipAddress,
                userAgent,
                { username: admin.username }
            );

            const adminUser: AdminUser = {
                id: admin.id,
                username: admin.username,
                email: admin.email,
                full_name: admin.full_name,
                active: admin.active,
                locked: admin.locked,
                permissions: admin.permissions || []
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

    async logout(token: string, adminId: string, username: string): Promise<void> {
        try {
            const tokenHash = encryptionService.hash(token);

            await this.db.query(
                'DELETE FROM admin_sessions WHERE token_hash = $1',
                [tokenHash]
            );

            await auditService.logAction({
                adminUserId: adminId,
                username,
                actionType: 'admin.logout',
                resourceType: 'admin',
                resourceId: adminId,
                success: true
            });
        } catch (error) {
            logger.error('Admin logout error:', error);
        }
    }

    async validateSession(token: string): Promise<AdminUser | null> {
        try {
            const tokenHash = encryptionService.hash(token);

            const result = await this.db.query(
                `SELECT au.*, 
                        get_admin_permissions(au.id) as permissions,
                        s.expires_at
                 FROM admin_sessions s
                 JOIN admin_users au ON s.admin_user_id = au.id
                 WHERE s.token_hash = $1
                 AND s.expires_at > CURRENT_TIMESTAMP
                 AND au.active = true
                 AND au.locked = false`,
                [tokenHash]
            );

            if (result.rows.length === 0) {
                return null;
            }

            const admin = result.rows[0];

            // Update last activity
            await this.db.query(
                'UPDATE admin_sessions SET last_activity_at = CURRENT_TIMESTAMP WHERE token_hash = $1',
                [tokenHash]
            );

            return {
                id: admin.id,
                username: admin.username,
                email: admin.email,
                full_name: admin.full_name,
                active: admin.active,
                locked: admin.locked,
                permissions: admin.permissions || []
            };
        } catch (error) {
            logger.error('Session validation error:', error);
            return null;
        }
    }

    async cleanExpiredSessions(): Promise<void> {
        try {
            await this.db.query('SELECT clean_expired_admin_sessions()');
        } catch (error) {
            logger.error('Failed to clean expired sessions:', error);
        }
    }
}

const adminAuthService = new AdminAuthService();

export const authenticateAdmin = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
            return;
        }

        const admin = await adminAuthService.validateSession(token);

        if (!admin) {
            res.status(401).json({
                success: false,
                error: 'Invalid or expired session'
            });
            return;
        }

        req.admin = admin;
        next();
    } catch (error) {
        logger.error('Authentication middleware error:', error);
        res.status(500).json({
            success: false,
            error: 'Authentication failed'
        });
    }
};

export const requirePermission = (permission: string) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.admin) {
            res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
            return;
        }

        if (!req.admin.permissions.includes(permission)) {
            auditService.logSecurityEvent(
                'permission_denied',
                'medium',
                req.admin.id,
                'admin',
                req.ip || null,
                req.get('User-Agent') || null,
                {
                    username: req.admin.username,
                    required_permission: permission,
                    path: req.path
                }
            );

            res.status(403).json({
                success: false,
                error: 'Insufficient permissions'
            });
            return;
        }

        next();
    };
};

export const requireAnyPermission = (permissions: string[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.admin) {
            res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
            return;
        }

        const hasPermission = permissions.some(p => req.admin!.permissions.includes(p));

        if (!hasPermission) {
            auditService.logSecurityEvent(
                'permission_denied',
                'medium',
                req.admin.id,
                'admin',
                req.ip || null,
                req.get('User-Agent') || null,
                {
                    username: req.admin.username,
                    required_permissions: permissions,
                    path: req.path
                }
            );

            res.status(403).json({
                success: false,
                error: 'Insufficient permissions'
            });
            return;
        }

        next();
    };
};

export default adminAuthService;
