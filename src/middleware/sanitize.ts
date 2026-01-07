import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

const sanitizeString = (str: string): string => {
    if (typeof str !== 'string') return str;
    
    return str
        .replace(/[<>]/g, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+=/gi, '')
        .trim();
};

const sanitizeObject = (obj: any): any => {
    if (typeof obj !== 'object' || obj === null) {
        return obj;
    }
    
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item));
    }
    
    const sanitized: any = {};
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            const value = obj[key];
            if (typeof value === 'string') {
                sanitized[key] = sanitizeString(value);
            } else if (typeof value === 'object') {
                sanitized[key] = sanitizeObject(value);
            } else {
                sanitized[key] = value;
            }
        }
    }
    return sanitized;
};

export const sanitizeInput = (req: Request, res: Response, next: NextFunction): void => {
    try {
        if (req.body && typeof req.body === 'object') {
            req.body = sanitizeObject(req.body);
        }
        
        if (req.query && typeof req.query === 'object') {
            req.query = sanitizeObject(req.query);
        }
        
        if (req.params && typeof req.params === 'object') {
            req.params = sanitizeObject(req.params);
        }
        
        next();
    } catch (error) {
        logger.error('Input sanitization error:', error);
        next();
    }
};

export const validateNoSQLInjection = (req: Request, res: Response, next: NextFunction): void => {
    const checkForSQLInjection = (obj: any): boolean => {
        if (typeof obj === 'string') {
            const sqlPatterns = [
                /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
                /(--|\*\/|\/\*)/g,
                /(\bOR\b.*=.*)/gi,
                /(\bAND\b.*=.*)/gi,
                /(;|\||&)/g
            ];
            
            return sqlPatterns.some(pattern => pattern.test(obj));
        }
        
        if (typeof obj === 'object' && obj !== null) {
            return Object.values(obj).some(value => checkForSQLInjection(value));
        }
        
        return false;
    };
    
    try {
        const hasSQLInjection = 
            checkForSQLInjection(req.body) ||
            checkForSQLInjection(req.query) ||
            checkForSQLInjection(req.params);
        
        if (hasSQLInjection) {
            logger.warn('Potential SQL injection attempt detected:', {
                ip: req.ip,
                path: req.path,
                method: req.method
            });
            
            res.status(400).json({
                success: false,
                error: 'Invalid input detected'
            });
            return;
        }
        
        next();
    } catch (error) {
        logger.error('SQL injection validation error:', error);
        next();
    }
};
