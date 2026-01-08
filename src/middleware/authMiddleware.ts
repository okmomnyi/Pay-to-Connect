import { Request, Response, NextFunction } from 'express';
import authService from '../services/authService';
import { logger } from '../utils/logger';

export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'No token provided' });
            return;
        }

        const token = authHeader.replace('Bearer ', '');
        const user = await authService.verifyToken(token);

        if (!user) {
            res.status(401).json({ error: 'Invalid or expired token' });
            return;
        }

        (req as any).user = user;
        next();
    } catch (error) {
        logger.error('Authentication error:', error);
        res.status(401).json({ error: 'Authentication failed' });
    }
};

export const optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.replace('Bearer ', '');
            const user = await authService.verifyToken(token);

            if (user) {
                (req as any).user = user;
            }
        }

        next();
    } catch (error) {
        next();
    }
};
