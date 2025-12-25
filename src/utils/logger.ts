import winston from 'winston';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

// Check if we're in a serverless environment
const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY;

const createLogger = () => {
    const transports: winston.transport[] = [];

    // Always add console transport
    transports.push(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));

    // Only add file transports if not in serverless environment and we can write to filesystem
    if (!isServerless) {
        try {
            const logsDir = join(process.cwd(), 'logs');
            if (!existsSync(logsDir)) {
                mkdirSync(logsDir, { recursive: true });
            }

            transports.push(
                new winston.transports.File({
                    filename: join(logsDir, 'error.log'),
                    level: 'error'
                }),
                new winston.transports.File({
                    filename: join(logsDir, 'combined.log')
                })
            );
        } catch (error) {
            // If we can't create file transports, just use console
            console.warn('Could not create file transports, using console only:', error);
        }
    }

    return winston.createLogger({
        level: process.env.LOG_LEVEL || 'info',
        format: logFormat,
        defaultMeta: { service: 'pay-to-connect' },
        transports
    });
};

const logger = createLogger();

export { logger };
