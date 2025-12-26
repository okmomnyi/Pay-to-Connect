import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

interface User {
    userId: string;
    username: string;
    email: string;
}

interface UserAuthRequest extends Request {
    user?: User;
}

export const authenticateUser = (req: UserAuthRequest, res: Response, next: NextFunction): void => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        res.status(401).json({
            success: false,
            error: 'Access token required'
        });
        return;
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        req.user = {
            userId: decoded.userId,
            username: decoded.username,
            email: decoded.email
        };
        next();
    } catch (error) {
        logger.warn('Invalid user token attempt:', { token: token.substring(0, 20) + '...' });
        res.status(403).json({
            success: false,
            error: 'Invalid or expired token'
        });
    }
};

export { UserAuthRequest };
