import winston from 'winston';
import { join } from 'path';

const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    defaultMeta: { service: 'pay-to-connect' },
    transports: [
        new winston.transports.File({
            filename: join(process.cwd(), 'logs', 'error.log'),
            level: 'error'
        }),
        new winston.transports.File({
            filename: join(process.cwd(), 'logs', 'combined.log')
        })
    ]
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

export { logger };
