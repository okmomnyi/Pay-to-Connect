import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const csrfTokens = new Map<string, { token: string; expires: number }>();

const CSRF_TOKEN_EXPIRY = 3600000;

setInterval(() => {
    const now = Date.now();
    for (const [key, value] of csrfTokens.entries()) {
        if (value.expires < now) {
            csrfTokens.delete(key);
        }
    }
}, 60000);

export const generateCSRFToken = (req: Request, res: Response, next: NextFunction): void => {
    const token = crypto.randomBytes(32).toString('hex');
    const sessionId = req.headers['x-session-id'] as string || crypto.randomBytes(16).toString('hex');
    
    csrfTokens.set(sessionId, {
        token,
        expires: Date.now() + CSRF_TOKEN_EXPIRY
    });
    
    res.setHeader('X-CSRF-Token', token);
    res.setHeader('X-Session-ID', sessionId);
    
    next();
};

export const validateCSRFToken = (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
        next();
        return;
    }
    
    const sessionId = req.headers['x-session-id'] as string;
    const providedToken = req.headers['x-csrf-token'] as string;
    
    if (!sessionId || !providedToken) {
        res.status(403).json({
            success: false,
            error: 'CSRF token required'
        });
        return;
    }
    
    const storedData = csrfTokens.get(sessionId);
    
    if (!storedData || storedData.token !== providedToken || storedData.expires < Date.now()) {
        res.status(403).json({
            success: false,
            error: 'Invalid or expired CSRF token'
        });
        return;
    }
    
    next();
};
