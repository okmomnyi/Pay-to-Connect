import { Request, Response } from 'express';
import adminAuthService from '../middleware/adminAuth';
import { logger } from '../utils/logger';

export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            res.status(400).json({
                success: false,
                error: 'Username and password are required'
            });
            return;
        }

        const ipAddress = req.ip || 'unknown';
        const userAgent = req.get('User-Agent') || 'unknown';

        const result = await adminAuthService.login(username, password, ipAddress, userAgent);

        if (!result.success) {
            res.status(401).json({
                success: false,
                error: result.message || 'Login failed'
            });
            return;
        }

        res.json({
            success: true,
            token: result.token,
            admin: result.admin
        });
    } catch (error) {
        logger.error('Login controller error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (token && req.admin) {
            await adminAuthService.logout(token, req.admin.id, req.admin.username);
        }

        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    } catch (error) {
        logger.error('Logout controller error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const getCurrentAdmin = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.admin) {
            res.status(401).json({
                success: false,
                error: 'Not authenticated'
            });
            return;
        }

        res.json({
            success: true,
            admin: req.admin
        });
    } catch (error) {
        logger.error('Get current admin error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};
