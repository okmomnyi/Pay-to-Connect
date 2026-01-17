import { Request, Response, NextFunction } from 'express';
import DatabaseConnection from '../database/connection';
import { logger } from '../utils/logger';

interface RateLimitConfig {
    maxAttempts: number;
    windowMinutes: number;
    action: string;
}

class RateLimiter {
    private db: DatabaseConnection;

    constructor() {
        this.db = DatabaseConnection.getInstance();
    }

    /**
     * Create rate limiter middleware
     */
    public createLimiter(config: RateLimitConfig) {
        return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
            try {
                const identifier = this.getIdentifier(req);
                const ipAddress = this.getIpAddress(req);

                // Check if rate limit exceeded
                const allowed = await this.checkRateLimit(
                    identifier,
                    config.action,
                    config.maxAttempts,
                    config.windowMinutes
                );

                if (!allowed) {
                    logger.warn(`Rate limit exceeded for ${config.action}`, {
                        identifier,
                        ipAddress,
                        action: config.action
                    });

                    res.status(429).json({
                        success: false,
                        error: `Too many attempts. Please try again in ${config.windowMinutes} minutes.`,
                        retryAfter: config.windowMinutes * 60
                    });
                    return;
                }

                // Store original end method
                const originalEnd = res.end;
                let responseBody: any;

                // Intercept response to log attempt
                res.end = function(chunk?: any, encoding?: any, callback?: any): Response {
                    if (chunk) {
                        try {
                            responseBody = JSON.parse(chunk.toString());
                        } catch (e) {
                            responseBody = chunk;
                        }
                    }

                    // Log the attempt after response
                    setImmediate(async () => {
                        const success = res.statusCode >= 200 && res.statusCode < 300 && 
                                       (!responseBody || responseBody.success !== false);
                        
                        await logRateLimitAttempt(
                            identifier,
                            config.action,
                            ipAddress,
                            success
                        );
                    });

                    return originalEnd.call(res, chunk, encoding, callback);
                };

                next();
            } catch (error) {
                logger.error('Rate limiter error:', error);
                // Don't block request on rate limiter error
                next();
            }
        };
    }

    /**
     * Check if rate limit is exceeded
     */
    private async checkRateLimit(
        identifier: string,
        action: string,
        maxAttempts: number,
        windowMinutes: number
    ): Promise<boolean> {
        try {
            const result = await this.db.query(
                'SELECT check_rate_limit($1, $2, $3, $4) as allowed',
                [identifier, action, maxAttempts, windowMinutes]
            );

            return result.rows[0]?.allowed || false;
        } catch (error) {
            logger.error('Failed to check rate limit:', error);
            // Allow request on error to prevent blocking legitimate users
            return true;
        }
    }

    /**
     * Get identifier from request (username, email, or IP)
     */
    private getIdentifier(req: Request): string {
        const body = req.body || {};
        return body.username || body.email || body.identifier || this.getIpAddress(req);
    }

    /**
     * Get IP address from request
     */
    private getIpAddress(req: Request): string {
        const forwarded = req.headers['x-forwarded-for'];
        if (forwarded) {
            return (forwarded as string).split(',')[0].trim();
        }
        return req.ip || req.socket.remoteAddress || 'unknown';
    }
}

/**
 * Log rate limit attempt
 */
async function logRateLimitAttempt(
    identifier: string,
    action: string,
    ipAddress: string,
    success: boolean
): Promise<void> {
    try {
        const db = DatabaseConnection.getInstance();
        await db.query(
            'SELECT log_rate_limit_attempt($1, $2, $3, $4)',
            [identifier, action, ipAddress, success]
        );
    } catch (error) {
        logger.error('Failed to log rate limit attempt:', error);
    }
}

// Create rate limiter instance
const rateLimiter = new RateLimiter();

// Export pre-configured limiters
export const loginLimiter = rateLimiter.createLimiter({
    maxAttempts: 5,
    windowMinutes: 15,
    action: 'login'
});

export const registerLimiter = rateLimiter.createLimiter({
    maxAttempts: 3,
    windowMinutes: 60,
    action: 'register'
});

export const forgotPasswordLimiter = rateLimiter.createLimiter({
    maxAttempts: 3,
    windowMinutes: 15,
    action: 'forgot_password'
});

export const resetPasswordLimiter = rateLimiter.createLimiter({
    maxAttempts: 3,
    windowMinutes: 15,
    action: 'reset_password'
});


export default rateLimiter;
