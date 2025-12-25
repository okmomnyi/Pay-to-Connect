import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { join } from 'path';
import dotenv from 'dotenv';

import DatabaseConnection from './database/connection';
import RadiusService from './services/radius';
import { logger } from './utils/logger';

import portalRoutes from './routes/portal';
import adminRoutes from './routes/admin';
import enhancedAdminRoutes from './routes/enhancedAdmin';

// Load environment variables
dotenv.config();

class Server {
    private app: express.Application;
    private db: DatabaseConnection;
    private radiusService: RadiusService;

    constructor() {
        this.app = express();
        this.db = DatabaseConnection.getInstance();
        this.radiusService = new RadiusService();
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    private setupMiddleware(): void {
        // Security middleware
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com"],
                    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com"],
                    imgSrc: ["'self'", "data:", "https:"],
                    connectSrc: ["'self'", "http://localhost:3000"],
                    fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "data:"],
                    objectSrc: ["'none'"],
                    mediaSrc: ["'self'"],
                    frameSrc: ["'none'"],
                },
            },
        }));

        // CORS configuration
        this.app.use(cors({
            origin: process.env.CORS_ORIGIN || '*',
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization']
        }));

        // Rate limiting
        const generalLimiter = rateLimit({
            windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
            max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
            message: {
                success: false,
                error: 'Too many requests, please try again later'
            },
            standardHeaders: true,
            legacyHeaders: false,
        });

        this.app.use(generalLimiter);

        // Body parsing middleware
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // Trust proxy for accurate IP addresses
        this.app.set('trust proxy', 1);

        // Request logging
        this.app.use((req, res, next) => {
            logger.info(`${req.method} ${req.path}`, {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                timestamp: new Date().toISOString()
            });
            next();
        });
    }

    private setupRoutes(): void {
        // Serve static files for captive portal
        this.app.use('/portal', express.static(join(__dirname, '../public')));

        // API routes
        this.app.use('/api/portal', portalRoutes);
        this.app.use('/api/admin', adminRoutes);
        this.app.use('/api/enhanced-admin', enhancedAdminRoutes);

        // Health check endpoint
        this.app.get('/health', async (req, res) => {
            try {
                // Check database connection
                await this.db.query('SELECT 1');
                
                // Check Redis connection (optional)
                let redisStatus = 'disabled';
                if (this.db.isRedisEnabled()) {
                    try {
                        const redisClient = this.db.getRedisClient();
                        await redisClient!.ping();
                        redisStatus = 'connected';
                    } catch (redisError) {
                        redisStatus = 'disconnected';
                    }
                }

                res.json({
                    success: true,
                    status: 'healthy',
                    timestamp: new Date().toISOString(),
                    services: {
                        database: 'connected',
                        redis: redisStatus,
                        radius: 'running'
                    }
                });
            } catch (error) {
                logger.error('Health check failed:', error);
                res.status(503).json({
                    success: false,
                    status: 'unhealthy',
                    timestamp: new Date().toISOString(),
                    error: 'Service unavailable'
                });
            }
        });

        // Captive portal redirect handler
        this.app.get('/', (req, res) => {
            res.redirect('/portal');
        });

        // Serve captive portal for any unmatched routes
        this.app.get('*', (req, res) => {
            // Check if it's an API request
            if (req.path.startsWith('/api/')) {
                res.status(404).json({
                    success: false,
                    error: 'API endpoint not found'
                });
                return;
            }

            // Serve captive portal
            res.sendFile(join(__dirname, '../public/index.html'));
        });
    }

    private setupErrorHandling(): void {
        // Global error handler
        this.app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
            logger.error('Unhandled error:', {
                error: error.message,
                stack: error.stack,
                path: req.path,
                method: req.method,
                ip: req.ip
            });

            res.status(500).json({
                success: false,
                error: process.env.NODE_ENV === 'production' 
                    ? 'Internal server error' 
                    : error.message
            });
        });

        // Handle 404 for API routes
        this.app.use('/api/*', (req, res) => {
            res.status(404).json({
                success: false,
                error: 'API endpoint not found'
            });
        });
    }

    private async startSessionCleanup(): Promise<void> {
        // Clean up expired sessions every minute
        setInterval(async () => {
            try {
                await this.radiusService.expireOldSessions();
            } catch (error) {
                logger.error('Session cleanup failed:', error);
            }
        }, 60000); // 1 minute

        logger.info('Session cleanup service started');
    }

    public async start(): Promise<void> {
        try {
            const port = parseInt(process.env.PORT || '3000');

            // Start HTTP server
            this.app.listen(port, () => {
                logger.info(`HTTP server listening on port ${port}`);
                logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
                logger.info(`Captive portal: http://localhost:${port}/portal`);
                logger.info(`Admin panel: http://localhost:${port}/api/admin`);
            });

            // Start RADIUS server
            this.radiusService.startRadiusServer(1812);

            // Start session cleanup
            await this.startSessionCleanup();

            logger.info('Pay-to-Connect system started successfully');

        } catch (error) {
            logger.error('Failed to start server:', error);
            process.exit(1);
        }
    }

    public async stop(): Promise<void> {
        try {
            await this.db.close();
            logger.info('Server stopped gracefully');
        } catch (error) {
            logger.error('Error stopping server:', error);
        }
    }
}

// Handle graceful shutdown
const server = new Server();

process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    await server.stop();
    process.exit(0);
});

process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully');
    await server.stop();
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Start the server
if (require.main === module) {
    server.start().catch((error) => {
        logger.error('Failed to start application:', error);
        process.exit(1);
    });
}

export default Server;
