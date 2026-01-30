import { Request, Response, NextFunction } from 'express';
import pool from '../database/db';

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

// Basic middleware that just checks for a token and creates a fake admin
export const authenticateAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        console.log('Basic auth middleware, token:', token ? 'present' : 'missing');
        
        if (!token) {
            console.log('No token provided');
            res.status(401).json({
                success: false,
                error: 'No token provided'
            });
            return;
        }

        // For now, just decode the basic token and create a fake admin
        try {
            const decoded = Buffer.from(token, 'base64').toString('utf-8');
            const [adminId, username] = decoded.split(':');
            
            console.log('Decoded token:', { adminId, username });
            
            // Create a basic admin user
            const admin: AdminUser = {
                id: adminId,
                username: username,
                email: 'admin@captiveportal.local',
                full_name: 'System Administrator',
                active: true,
                locked: false,
                permissions: ['admin.view', 'user.view', 'package.view', 'session.view', 'admin.create', 'admin.edit', 'admin.delete']
            };
            
            req.admin = admin;
            console.log('Admin authenticated:', admin.username);
            next();
            
        } catch (decodeError) {
            console.log('Token decode failed, creating default admin');
            // If token decode fails, create a default admin
            const admin: AdminUser = {
                id: 'default',
                username: 'admin',
                email: 'admin@captiveportal.local',
                full_name: 'System Administrator',
                active: true,
                locked: false,
                permissions: ['admin.view', 'user.view', 'package.view', 'session.view', 'admin.create', 'admin.edit', 'admin.delete']
            };
            
            req.admin = admin;
            next();
        }
        
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(401).json({
            success: false,
            error: 'Authentication failed'
        });
        return;
    }
};

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
