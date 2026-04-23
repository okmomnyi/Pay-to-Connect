import { Request, Response, NextFunction } from 'express';
import DatabaseConnection from '../database/connection';
import encryptionService from '../utils/encryption';
import { logger } from '../utils/logger';

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

const db = DatabaseConnection.getInstance();

// Validate session token against the database — no fake admins
export const authenticateAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        // Prefer httpOnly cookie; fall back to Authorization header for API clients
        const token = (req as any).cookies?.admin_token
            || req.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            res.status(401).json({
                success: false,
                error: 'No token provided'
            });
            return;
        }

        const tokenHash = encryptionService.hash(token);

        const result = await db.query(
            `SELECT au.id, au.username, au.email, au.full_name, au.active, au.locked,
                    get_admin_permissions(au.id) as permissions
             FROM admin_sessions s
             JOIN admin_users au ON s.admin_user_id = au.id
             WHERE s.token_hash = $1
               AND s.expires_at > CURRENT_TIMESTAMP
               AND au.active = true
               AND au.locked = false`,
            [tokenHash]
        );

        if (result.rows.length === 0) {
            res.status(401).json({
                success: false,
                error: 'Invalid or expired session'
            });
            return;
        }

        const admin = result.rows[0];

        // Touch last activity
        await db.query(
            'UPDATE admin_sessions SET last_activity_at = CURRENT_TIMESTAMP WHERE token_hash = $1',
            [tokenHash]
        );

        req.admin = {
            id: admin.id,
            username: admin.username,
            email: admin.email,
            full_name: admin.full_name,
            active: admin.active,
            locked: admin.locked,
            permissions: admin.permissions || []
        };

        next();
    } catch (error) {
        logger.error('Auth middleware error:', error);
        res.status(401).json({
            success: false,
            error: 'Authentication failed'
        });
    }
};

export const requirePermission = (permission: string) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.admin) {
            res.status(401).json({ success: false, error: 'Not authenticated' });
            return;
        }

        if (!req.admin.permissions.includes(permission)) {
            res.status(403).json({ success: false, error: 'Permission denied' });
            return;
        }

        next();
    };
};

export const requireAnyPermission = (permissions: string[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.admin) {
            res.status(401).json({ success: false, error: 'Not authenticated' });
            return;
        }

        const hasPermission = permissions.some(p => req.admin!.permissions.includes(p));

        if (!hasPermission) {
            res.status(403).json({ success: false, error: 'Permission denied' });
            return;
        }

        next();
    };
};
