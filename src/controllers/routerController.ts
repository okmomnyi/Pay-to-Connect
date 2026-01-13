import { Request, Response } from 'express';
import Joi from 'joi';
import DatabaseConnection from '../database/connection';
import mikrotikService from '../services/mikrotikService';
import auditService from '../services/auditService';
import { logger } from '../utils/logger';

interface AdminUser {
    userId: string;
    username: string;
    email: string;
}

interface AuthRequest extends Request {
    user?: AdminUser;
}

export class RouterController {
    private db: DatabaseConnection;

    constructor() {
        this.db = DatabaseConnection.getInstance();
    }

    /**
     * Get all routers (READ-ONLY)
     */
    public getRouters = async (req: AuthRequest, res: Response): Promise<void> => {
        const startTime = Date.now();
        
        try {
            const result = await this.db.query(`
                SELECT 
                    r.id, r.name, r.ip_address, r.active, r.created_at, r.updated_at,
                    e.name as estate_name,
                    rc.connection_status, rc.last_connection_test,
                    rss.sync_status as package_sync_status, rss.last_sync_at
                FROM routers r
                JOIN estates e ON r.estate_id = e.id
                LEFT JOIN router_credentials rc ON r.id = rc.router_id
                LEFT JOIN router_sync_status rss ON r.id = rss.router_id AND rss.sync_type = 'packages'
                ORDER BY r.name ASC
            `);

            const routers = result.rows.map((router: any) => ({
                id: router.id,
                name: router.name,
                ipAddress: router.ip_address,
                estateName: router.estate_name,
                active: router.active,
                connectionStatus: router.connection_status || 'unknown',
                lastConnectionTest: router.last_connection_test,
                packageSyncStatus: router.package_sync_status || 'pending',
                lastSyncAt: router.last_sync_at,
                createdAt: router.created_at,
                updatedAt: router.updated_at
            }));

            // Log successful action
            await auditService.logAdminAction({
                adminUserId: req.user!.userId,
                actionType: 'router.list',
                resourceType: 'router',
                actionDetails: { count: routers.length },
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                success: true,
                executionTimeMs: Date.now() - startTime
            });

            res.json({
                success: true,
                routers
            });
        } catch (error) {
            logger.error('Failed to get routers:', error);
            
            await auditService.logAdminAction({
                adminUserId: req.user!.userId,
                actionType: 'router.list',
                resourceType: 'router',
                actionDetails: {},
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                success: false,
                errorMessage: error instanceof Error ? error.message : 'Unknown error',
                executionTimeMs: Date.now() - startTime
            });

            res.status(500).json({
                success: false,
                error: 'Failed to retrieve routers'
            });
        }
    };

    /**
     * Create new router with secure credential storage
     */
    public createRouter = async (req: AuthRequest, res: Response): Promise<void> => {
        const startTime = Date.now();
        
        try {
            const schema = Joi.object({
                name: Joi.string().min(1).max(255).required(),
                ipAddress: Joi.string().ip().required(),
                apiUsername: Joi.string().min(1).max(100).required(),
                apiPassword: Joi.string().min(1).required(),
                apiPort: Joi.number().integer().min(1).max(65535).default(8729),
                estateId: Joi.string().uuid().optional()
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                res.status(400).json({
                    success: false,
                    error: error.details[0].message
                });
                return;
            }

            const { name, ipAddress, apiUsername, apiPassword, apiPort, estateId } = value;

            // Check if router with same IP already exists
            const existingRouter = await this.db.query(
                'SELECT id FROM routers WHERE ip_address = $1',
                [ipAddress]
            );

            if (existingRouter.rows.length > 0) {
                res.status(409).json({
                    success: false,
                    error: 'Router with this IP address already exists'
                });
                return;
            }

            // Get default estate if not provided
            let finalEstateId = estateId;
            if (!finalEstateId) {
                const defaultEstate = await this.db.query(
                    'SELECT id FROM estates ORDER BY created_at ASC LIMIT 1'
                );
                if (defaultEstate.rows.length === 0) {
                    // Create default estate if none exists
                    const newEstate = await this.db.query(
                        'INSERT INTO estates (name) VALUES ($1) RETURNING id',
                        ['Default Estate']
                    );
                    finalEstateId = newEstate.rows[0].id;
                } else {
                    finalEstateId = defaultEstate.rows[0].id;
                }
            }

            // Begin transaction
            await this.db.query('BEGIN');

            try {
                // Create router
                const routerResult = await this.db.query(`
                    INSERT INTO routers (estate_id, name, ip_address, secret)
                    VALUES ($1, $2, $3, $4)
                    RETURNING id, name, ip_address, active, created_at
                `, [finalEstateId, name, ipAddress, 'default-secret']);

                const newRouter = routerResult.rows[0];

                // Store encrypted credentials
                await mikrotikService.storeRouterCredentials(
                    newRouter.id,
                    apiUsername,
                    apiPassword,
                    apiPort
                );

                // Test connection immediately
                const connectionTest = await mikrotikService.testConnection(
                    newRouter.id,
                    req.user!.userId
                );

                await this.db.query('COMMIT');

                // Log successful action
                await auditService.logAdminAction({
                    adminUserId: req.user!.userId,
                    actionType: 'router.create',
                    resourceType: 'router',
                    resourceId: newRouter.id,
                    resourceName: newRouter.name,
                    actionDetails: {
                        name,
                        ipAddress,
                        apiUsername,
                        apiPort,
                        connectionTest: connectionTest.success
                    },
                    ipAddress: req.ip,
                    userAgent: req.get('User-Agent'),
                    success: true,
                    executionTimeMs: Date.now() - startTime
                });

                res.status(201).json({
                    success: true,
                    router: {
                        id: newRouter.id,
                        name: newRouter.name,
                        ipAddress: newRouter.ip_address,
                        active: newRouter.active,
                        createdAt: newRouter.created_at,
                        connectionTest
                    }
                });
            } catch (innerError) {
                await this.db.query('ROLLBACK');
                throw innerError;
            }

        } catch (error: any) {
            logger.error('Failed to create router:', error);
            
            await auditService.logAdminAction({
                adminUserId: req.user!.userId,
                actionType: 'router.create',
                resourceType: 'router',
                actionDetails: req.body,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                success: false,
                errorMessage: error.message || 'Unknown error',
                executionTimeMs: Date.now() - startTime
            });

            if (error.code === '23505') { // Unique constraint violation
                res.status(409).json({
                    success: false,
                    error: 'Router with this IP address already exists'
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: 'Failed to create router'
                });
            }
        }
    };

    /**
     * Test router connection (SECURE OPERATION)
     */
    public testRouterConnection = async (req: AuthRequest, res: Response): Promise<void> => {
        const startTime = Date.now();
        
        try {
            const { id } = req.params;

            if (!id) {
                res.status(400).json({
                    success: false,
                    error: 'Router ID is required'
                });
                return;
            }

            // Verify router exists
            const routerResult = await this.db.query(
                'SELECT id, name FROM routers WHERE id = $1',
                [id]
            );

            if (routerResult.rows.length === 0) {
                res.status(404).json({
                    success: false,
                    error: 'Router not found'
                });
                return;
            }

            const router = routerResult.rows[0];
            
            // Test connection using MikroTik service
            const result = await mikrotikService.testConnection(id, req.user!.userId);

            // Log action
            await auditService.logAdminAction({
                adminUserId: req.user!.userId,
                actionType: 'router.test_connection',
                resourceType: 'router',
                resourceId: id,
                resourceName: router.name,
                actionDetails: { result },
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                success: result.success,
                errorMessage: result.success ? undefined : result.message || undefined,
                executionTimeMs: Date.now() - startTime
            });

            res.json({
                success: true,
                connectionTest: result
            });

        } catch (error) {
            logger.error('Failed to test router connection:', error);
            
            await auditService.logAdminAction({
                adminUserId: req.user!.userId,
                actionType: 'router.test_connection',
                resourceType: 'router',
                resourceId: req.params.id,
                actionDetails: {},
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                success: false,
                errorMessage: error instanceof Error ? error.message : 'Unknown error',
                executionTimeMs: Date.now() - startTime
            });

            res.status(500).json({
                success: false,
                error: 'Failed to test router connection'
            });
        }
    };

    /**
     * Sync packages to router (SECURE OPERATION)
     */
    public syncPackagesToRouter = async (req: AuthRequest, res: Response): Promise<void> => {
        const startTime = Date.now();
        
        try {
            const { id } = req.params;

            if (!id) {
                res.status(400).json({
                    success: false,
                    error: 'Router ID is required'
                });
                return;
            }

            // Verify router exists
            const routerResult = await this.db.query(
                'SELECT id, name FROM routers WHERE id = $1 AND active = true',
                [id]
            );

            if (routerResult.rows.length === 0) {
                res.status(404).json({
                    success: false,
                    error: 'Router not found or inactive'
                });
                return;
            }

            const router = routerResult.rows[0];
            
            // Sync packages using MikroTik service
            const result = await mikrotikService.syncPackagesToRouter(id, req.user!.userId);

            // Log action
            await auditService.logAdminAction({
                adminUserId: req.user!.userId,
                actionType: 'router.sync_packages',
                resourceType: 'router',
                resourceId: id,
                resourceName: router.name,
                actionDetails: { result },
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                success: result.success,
                errorMessage: result.success ? undefined : result.message || undefined,
                executionTimeMs: Date.now() - startTime
            });

            res.json({
                success: true,
                syncResult: result
            });

        } catch (error) {
            logger.error('Failed to sync packages to router:', error);
            
            await auditService.logAdminAction({
                adminUserId: req.user!.userId,
                actionType: 'router.sync_packages',
                resourceType: 'router',
                resourceId: req.params.id,
                actionDetails: {},
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                success: false,
                errorMessage: error instanceof Error ? error.message : 'Unknown error',
                executionTimeMs: Date.now() - startTime
            });

            res.status(500).json({
                success: false,
                error: 'Failed to sync packages to router'
            });
        }
    };

    /**
     * Get router statistics (READ-ONLY OPERATION)
     */
    public getRouterStats = async (req: AuthRequest, res: Response): Promise<void> => {
        const startTime = Date.now();
        
        try {
            const { id } = req.params;

            if (!id) {
                res.status(400).json({
                    success: false,
                    error: 'Router ID is required'
                });
                return;
            }

            // Verify router exists
            const routerResult = await this.db.query(
                'SELECT id, name FROM routers WHERE id = $1',
                [id]
            );

            if (routerResult.rows.length === 0) {
                res.status(404).json({
                    success: false,
                    error: 'Router not found'
                });
                return;
            }

            const router = routerResult.rows[0];
            
            // Get router stats using MikroTik service
            const result = await mikrotikService.getRouterStats(id, req.user!.userId);

            // Log action
            await auditService.logAdminAction({
                adminUserId: req.user!.userId,
                actionType: 'router.get_stats',
                resourceType: 'router',
                resourceId: id,
                resourceName: router.name,
                actionDetails: { hasData: !!result.data },
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                success: result.success,
                errorMessage: result.success ? undefined : result.message || undefined,
                executionTimeMs: Date.now() - startTime
            });

            if (result.success) {
                res.json({
                    success: true,
                    stats: result.data
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: result.message || 'Failed to get router statistics'
                });
            }

        } catch (error) {
            logger.error('Failed to get router stats:', error);
            
            await auditService.logAdminAction({
                adminUserId: req.user!.userId,
                actionType: 'router.get_stats',
                resourceType: 'router',
                resourceId: req.params.id,
                actionDetails: {},
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                success: false,
                errorMessage: error instanceof Error ? error.message : 'Unknown error',
                executionTimeMs: Date.now() - startTime
            });

            res.status(500).json({
                success: false,
                error: 'Failed to get router statistics'
            });
        }
    };

    /**
     * Update router configuration
     */
    public updateRouter = async (req: AuthRequest, res: Response): Promise<void> => {
        const startTime = Date.now();
        
        try {
            const { id } = req.params;
            
            const schema = Joi.object({
                name: Joi.string().min(1).max(255).optional(),
                active: Joi.boolean().optional(),
                apiUsername: Joi.string().min(1).max(100).optional(),
                apiPassword: Joi.string().min(1).optional(),
                apiPort: Joi.number().integer().min(1).max(65535).optional()
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                res.status(400).json({
                    success: false,
                    error: error.details[0].message
                });
                return;
            }

            // Verify router exists
            const routerResult = await this.db.query(
                'SELECT id, name FROM routers WHERE id = $1',
                [id]
            );

            if (routerResult.rows.length === 0) {
                res.status(404).json({
                    success: false,
                    error: 'Router not found'
                });
                return;
            }

            const router = routerResult.rows[0];
            const updates: string[] = [];
            const params: any[] = [];
            let paramCount = 1;

            // Build update query for router table
            if (value.name !== undefined) {
                updates.push(`name = $${paramCount}`);
                params.push(value.name);
                paramCount++;
            }

            if (value.active !== undefined) {
                updates.push(`active = $${paramCount}`);
                params.push(value.active);
                paramCount++;
            }

            // Update router if there are changes
            if (updates.length > 0) {
                params.push(id);
                const query = `
                    UPDATE routers 
                    SET ${updates.join(', ')}, updated_at = NOW()
                    WHERE id = $${paramCount}
                    RETURNING id, name, ip_address, active, updated_at
                `;

                const updateResult = await this.db.query(query, params);
                
                if (updateResult.rows.length === 0) {
                    res.status(404).json({
                        success: false,
                        error: 'Router not found'
                    });
                    return;
                }
            }

            // Update credentials if provided
            if (value.apiUsername || value.apiPassword || value.apiPort) {
                // Get current credentials
                const credResult = await this.db.query(
                    'SELECT api_username, api_port FROM router_credentials WHERE router_id = $1',
                    [id]
                );

                if (credResult.rows.length > 0) {
                    const currentCreds = credResult.rows[0];
                    
                    // Update credentials
                    await mikrotikService.storeRouterCredentials(
                        id,
                        value.apiUsername || currentCreds.api_username,
                        value.apiPassword || 'UNCHANGED', // Service will handle unchanged passwords
                        value.apiPort || currentCreds.api_port
                    );
                }
            }

            // Get updated router data
            const updatedRouter = await this.db.query(`
                SELECT r.id, r.name, r.ip_address, r.active, r.updated_at,
                       rc.connection_status
                FROM routers r
                LEFT JOIN router_credentials rc ON r.id = rc.router_id
                WHERE r.id = $1
            `, [id]);

            // Log successful action
            await auditService.logAdminAction({
                adminUserId: req.user!.userId,
                actionType: 'router.update',
                resourceType: 'router',
                resourceId: id,
                resourceName: router.name,
                actionDetails: value,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                success: true,
                executionTimeMs: Date.now() - startTime
            });

            res.json({
                success: true,
                router: updatedRouter.rows[0]
            });

        } catch (error) {
            logger.error('Failed to update router:', error);
            
            await auditService.logAdminAction({
                adminUserId: req.user!.userId,
                actionType: 'router.update',
                resourceType: 'router',
                resourceId: req.params.id,
                actionDetails: req.body,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                success: false,
                errorMessage: error instanceof Error ? error.message : 'Unknown error',
                executionTimeMs: Date.now() - startTime
            });

            res.status(500).json({
                success: false,
                error: 'Failed to update router'
            });
        }
    };

    /**
     * Delete router (deactivate)
     */
    public deleteRouter = async (req: AuthRequest, res: Response): Promise<void> => {
        const startTime = Date.now();
        
        try {
            const { id } = req.params;

            // Verify router exists
            const routerResult = await this.db.query(
                'SELECT id, name FROM routers WHERE id = $1',
                [id]
            );

            if (routerResult.rows.length === 0) {
                res.status(404).json({
                    success: false,
                    error: 'Router not found'
                });
                return;
            }

            const router = routerResult.rows[0];

            // Check if router has active sessions
            const activeSessions = await this.db.query(
                'SELECT COUNT(*) as count FROM sessions WHERE router_id = $1 AND active = true',
                [id]
            );

            if (parseInt(activeSessions.rows[0].count) > 0) {
                res.status(409).json({
                    success: false,
                    error: 'Cannot delete router with active sessions'
                });
                return;
            }

            // Deactivate router instead of deleting
            await this.db.query(
                'UPDATE routers SET active = false, updated_at = NOW() WHERE id = $1',
                [id]
            );

            // Log successful action
            await auditService.logAdminAction({
                adminUserId: req.user!.userId,
                actionType: 'router.delete',
                resourceType: 'router',
                resourceId: id,
                resourceName: router.name,
                actionDetails: { deactivated: true },
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                success: true,
                executionTimeMs: Date.now() - startTime
            });

            res.json({
                success: true,
                message: 'Router deactivated successfully'
            });

        } catch (error) {
            logger.error('Failed to delete router:', error);
            
            await auditService.logAdminAction({
                adminUserId: req.user!.userId,
                actionType: 'router.delete',
                resourceType: 'router',
                resourceId: req.params.id,
                actionDetails: {},
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                success: false,
                errorMessage: error instanceof Error ? error.message : 'Unknown error',
                executionTimeMs: Date.now() - startTime
            });

            res.status(500).json({
                success: false,
                error: 'Failed to delete router'
            });
        }
    };
}

export default new RouterController();
