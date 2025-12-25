import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import DatabaseConnection from '../database/connection';
import { logger } from '../utils/logger';

export interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        username: string;
        email: string;
        phone: string;
    };
}

export const enhancedAuthenticateToken = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const authHeader = req.headers['authorization'];
        const sessionToken = req.headers['x-session-token'] as string;
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            res.status(401).json({
                success: false,
                error: 'Access token required'
            });
            return;
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        
        const db = DatabaseConnection.getInstance();

        // Verify user exists and is active
        const userResult = await db.query(
            'SELECT id, username, email, phone, is_verified FROM admin_users WHERE id = $1 AND is_verified = true',
            [decoded.id]
        );

        if (userResult.rows.length === 0) {
            res.status(401).json({
                success: false,
                error: 'Invalid or expired token'
            });
            return;
        }

        const user = userResult.rows[0];

        // If session token provided, verify it's active
        if (sessionToken) {
            const sessionResult = await db.query(
                `SELECT id FROM admin_sessions 
                 WHERE session_token = $1 AND user_id = $2 AND is_active = true AND expires_at > NOW()`,
                [sessionToken, user.id]
            );

            if (sessionResult.rows.length === 0) {
                res.status(401).json({
                    success: false,
                    error: 'Invalid or expired session'
                });
                return;
            }

            // Update session last activity
            await db.query(
                'UPDATE admin_sessions SET updated_at = NOW() WHERE session_token = $1',
                [sessionToken]
            );
        }

        // Attach user to request
        req.user = {
            id: user.id,
            username: user.username,
            email: user.email,
            phone: user.phone
        };

        next();
    } catch (error: any) {
        logger.error('Authentication failed:', error);
        
        if (error.name === 'JsonWebTokenError') {
            res.status(401).json({
                success: false,
                error: 'Invalid token'
            });
        } else if (error.name === 'TokenExpiredError') {
            res.status(401).json({
                success: false,
                error: 'Token expired'
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Authentication error'
            });
        }
    }
};

export const requirePermission = (permission: string) => {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            // For now, all authenticated users have all permissions
            // In a more complex system, you would check user roles/permissions here
            next();
        } catch (error) {
            logger.error('Permission check failed:', error);
            res.status(403).json({
                success: false,
                error: 'Insufficient permissions'
            });
        }
    };
};

export const auditLog = (action: string, resource: string) => {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const db = DatabaseConnection.getInstance();
            
            // Log the action
            await db.query(
                `INSERT INTO admin_audit_logs (user_id, action, resource, ip_address, user_agent, details)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    req.user?.id,
                    action,
                    resource,
                    req.ip,
                    req.get('User-Agent'),
                    JSON.stringify({
                        method: req.method,
                        url: req.url,
                        params: req.params,
                        query: req.query
                    })
                ]
            );

            next();
        } catch (error) {
            logger.error('Audit logging failed:', error);
            // Don't fail the request if audit logging fails
            next();
        }
    };
};
