import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../utils/logger';

export const validateMpesaCallback = (req: Request, res: Response, next: NextFunction): void => {
    try {
        const mpesaIPs = [
            '196.201.214.200',
            '196.201.214.206',
            '196.201.213.114',
            '196.201.214.207',
            '196.201.214.208',
            '196.201.213.44',
            '196.201.212.127',
            '196.201.212.138',
            '196.201.212.129',
            '196.201.212.136',
            '196.201.212.74'
        ];

        const clientIP = req.ip || req.connection.remoteAddress || '';
        const forwardedFor = req.headers['x-forwarded-for'];
        const realIP = forwardedFor ? (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor.split(',')[0]) : clientIP;

        if (process.env.NODE_ENV === 'production') {
            const isValidIP = mpesaIPs.some(ip => realIP.includes(ip));
            
            if (!isValidIP) {
                logger.warn('M-Pesa callback from unauthorized IP:', { ip: realIP });
                res.status(403).json({
                    ResultCode: 1,
                    ResultDesc: 'Unauthorized'
                });
                return;
            }
        }

        const callbackData = req.body;
        if (!callbackData || !callbackData.Body || !callbackData.Body.stkCallback) {
            logger.warn('Invalid M-Pesa callback structure');
            res.status(400).json({
                ResultCode: 1,
                ResultDesc: 'Invalid callback structure'
            });
            return;
        }

        const callback = callbackData.Body.stkCallback;
        if (!callback.CheckoutRequestID || callback.ResultCode === undefined) {
            logger.warn('Missing required callback fields');
            res.status(400).json({
                ResultCode: 1,
                ResultDesc: 'Missing required fields'
            });
            return;
        }

        next();
    } catch (error) {
        logger.error('M-Pesa callback validation error:', error);
        res.status(500).json({
            ResultCode: 1,
            ResultDesc: 'Internal error'
        });
    }
};

export const preventDuplicateCallback = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const callback = req.body.Body.stkCallback;
        const checkoutRequestId = callback.CheckoutRequestID;
        
        const cacheKey = `callback_processed:${checkoutRequestId}`;
        
        const DatabaseConnection = (await import('../database/connection')).default;
        const db = DatabaseConnection.getInstance();
        
        if (db.isRedisEnabled()) {
            const redisClient = db.getRedisClient();
            const alreadyProcessed = await redisClient!.get(cacheKey);
            
            if (alreadyProcessed) {
                logger.warn('Duplicate callback detected:', { checkoutRequestId });
                res.json({
                    ResultCode: 0,
                    ResultDesc: 'Already processed'
                });
                return;
            }
            
            await redisClient!.setEx(cacheKey, 3600, 'processed');
        }
        
        next();
    } catch (error) {
        logger.error('Duplicate callback check error:', error);
        next();
    }
};
