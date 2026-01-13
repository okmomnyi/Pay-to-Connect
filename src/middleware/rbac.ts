import { Request, Response, NextFunction } from 'express';
import DatabaseConnection from '../database/connection';
import { logger } from '../utils/logger';

interface AdminUser {
    userId: string;
    username: string;
    email: string;
}

interface AuthRequest extends Request {
    user?: AdminUser;
}

export class RBACMiddleware {
    private db: DatabaseConnection;

    constructor() {
        this.db = DatabaseConnection.getInstance();
    }

    /**
     * Check if admin user has required permission
     */
    private async checkPermission(adminUserId: string, permission: string): Promise<boolean> {
        try {
            const result = await this.db.query(`
                SELECT check_admin_permission($1, $2) as has_permission
            `, [adminUserId, permission]);

            return result.rows[0]?.has_permission || false;
        } catch (error) {
            logger.error('Permission check failed:', error);
            return false;
        }
    }

    /**
     * Log security event for unauthorized access attempts
     */
    private async logSecurityEvent(
        eventType: string,
        userId: string,
        ipAddress: string,
        userAgent: string,
        details: any
    ): Promise<void> {
        try {
            await this.db.query(`
                SELECT log_security_event($1, $2, $3, $4, $5, $6, $7, $8)
            `, [
                eventType,
                'high', // severity
                userId,
                'admin',
                ipAddress,
                userAgent,
                JSON.stringify(details),
                true // blocked
            ]);
        } catch (error) {
            logger.error('Failed to log security event:', error);
        }
    }

    /**
     * Middleware to require specific permission
     */
    requirePermission(permission: string) {
        return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
            try {
                if (!req.user?.userId) {
                    res.status(401).json({
                        success: false,
                        error: 'Authentication required'
                    });
                    return;
                }

                const hasPermission = await this.checkPermission(req.user.userId, permission);

                if (!hasPermission) {
                    // Log unauthorized access attempt
                    await this.logSecurityEvent(
                        'unauthorized_access',
                        req.user.userId,
                        req.ip || 'unknown',
                        req.get('User-Agent') || '',
                        {
                            requiredPermission: permission,
                            requestedResource: req.path,
                            method: req.method,
                            username: req.user.username
                        }
                    );

                    logger.warn('Unauthorized access attempt:', {
                        userId: req.user.userId,
                        username: req.user.username,
                        permission,
                        path: req.path,
                        ip: req.ip
                    });

                    res.status(403).json({
                        success: false,
                        error: 'Insufficient permissions'
                    });
                    return;
                }

                next();
            } catch (error) {
                logger.error('RBAC middleware error:', error);
                res.status(500).json({
                    success: false,
                    error: 'Permission check failed'
                });
            }
        };
    }

    /**
     * Middleware to require any of the specified permissions
     */
    requireAnyPermission(permissions: string[]) {
        return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
            try {
                if (!req.user?.userId) {
                    res.status(401).json({
                        success: false,
                        error: 'Authentication required'
                    });
                    return;
                }

                let hasAnyPermission = false;
                for (const permission of permissions) {
                    if (await this.checkPermission(req.user.userId, permission)) {
                        hasAnyPermission = true;
                        break;
                    }
                }

                if (!hasAnyPermission) {
                    // Log unauthorized access attempt
                    await this.logSecurityEvent(
                        'unauthorized_access',
                        req.user.userId,
                        req.ip || 'unknown',
                        req.get('User-Agent') || '',
                        {
                            requiredPermissions: permissions,
                            requestedResource: req.path,
                            method: req.method,
                            username: req.user.username
                        }
                    );

                    logger.warn('Unauthorized access attempt (any permission):', {
                        userId: req.user.userId,
                        username: req.user.username,
                        permissions,
                        path: req.path,
                        ip: req.ip
                    });

                    res.status(403).json({
                        success: false,
                        error: 'Insufficient permissions'
                    });
                    return;
                }

                next();
            } catch (error) {
                logger.error('RBAC middleware error:', error);
                res.status(500).json({
                    success: false,
                    error: 'Permission check failed'
                });
            }
        };
    }

    /**
     * Middleware specifically for router management operations
     */
    requireRouterAccess() {
        return this.requireAnyPermission(['router.*', 'router.manage', 'system.*']);
    }

    /**
     * Middleware for package management operations
     */
    requirePackageAccess() {
        return this.requireAnyPermission(['package.*', 'package.manage', 'system.*']);
    }

    /**
     * Middleware for user management operations
     */
    requireUserAccess() {
        return this.requireAnyPermission(['user.*', 'user.manage', 'system.*']);
    }

    /**
     * Middleware for admin management operations (highest privilege)
     */
    requireAdminAccess() {
        return this.requireAnyPermission(['admin.*', 'system.*']);
    }

    /**
     * Middleware for read-only access
     */
    requireReadAccess(resource: string) {
        return this.requireAnyPermission([`${resource}.*`, `${resource}.view`, '*.view', 'system.*']);
    }
}

export default new RBACMiddleware();
