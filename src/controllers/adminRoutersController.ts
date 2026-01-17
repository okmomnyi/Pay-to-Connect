import { Request, Response } from 'express';
import DatabaseConnection from '../database/connection';
import mikrotikService from '../services/mikrotikService';
import encryptionService from '../utils/encryption';
import auditService from '../services/auditService';
import { logger } from '../utils/logger';

const db = DatabaseConnection.getInstance();

export const getAllRouters = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await db.query(
            `SELECT 
                r.*,
                e.name as estate_name,
                rss.last_sync_at,
                rss.sync_status,
                rss.packages_synced
             FROM routers r
             LEFT JOIN estates e ON r.estate_id = e.id
             LEFT JOIN router_sync_status rss ON r.id = rss.router_id
             ORDER BY r.created_at DESC`
        );

        res.json({
            success: true,
            routers: result.rows
        });
    } catch (error) {
        logger.error('Get all routers error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch routers'
        });
    }
};

export const getRouterById = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const result = await db.query(
            `SELECT 
                r.*,
                e.name as estate_name,
                rss.last_sync_at,
                rss.sync_status,
                rss.packages_synced,
                rss.sync_errors
             FROM routers r
             LEFT JOIN estates e ON r.estate_id = e.id
             LEFT JOIN router_sync_status rss ON r.id = rss.router_id
             WHERE r.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: 'Router not found'
            });
            return;
        }

        res.json({
            success: true,
            router: result.rows[0]
        });
    } catch (error) {
        logger.error('Get router by ID error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch router'
        });
    }
};

export const createRouter = async (req: Request, res: Response): Promise<void> => {
    try {
        const { 
            name, 
            ip_address, 
            api_port, 
            api_username, 
            api_password, 
            estate_id, 
            description 
        } = req.body;

        if (!name || !ip_address || !api_username || !api_password) {
            res.status(400).json({
                success: false,
                error: 'Name, IP address, API username, and API password are required'
            });
            return;
        }

        // Check if router with same IP and port already exists
        const existingResult = await db.query(
            'SELECT id FROM routers WHERE ip_address = $1 AND api_port = $2',
            [ip_address, api_port || 8729]
        );

        if (existingResult.rows.length > 0) {
            res.status(400).json({
                success: false,
                error: 'Router with this IP address and port already exists'
            });
            return;
        }

        // Create router
        const routerResult = await db.query(
            `INSERT INTO routers (name, ip_address, api_port, estate_id, description, connection_status)
             VALUES ($1, $2, $3, $4, $5, 'unknown')
             RETURNING *`,
            [name, ip_address, api_port || 8729, estate_id || null, description || null]
        );

        const router = routerResult.rows[0];

        // Encrypt and store credentials
        const encrypted = encryptionService.encrypt(api_password);

        await db.query(
            `INSERT INTO router_credentials (router_id, api_username, api_password_encrypted, encryption_iv)
             VALUES ($1, $2, $3, $4)`,
            [router.id, api_username, encrypted.encrypted, encrypted.iv]
        );

        // Initialize sync status
        await db.query(
            `INSERT INTO router_sync_status (router_id, sync_status)
             VALUES ($1, 'pending')`,
            [router.id]
        );

        // Log action
        await auditService.logAction({
            adminUserId: req.admin!.id,
            username: req.admin!.username,
            actionType: 'router.create',
            resourceType: 'router',
            resourceId: router.id,
            actionDetails: { name, ip_address, api_port, estate_id },
            afterState: router,
            ipAddress: req.ip || undefined,
            userAgent: req.get('User-Agent') || undefined,
            success: true
        });

        res.status(201).json({
            success: true,
            message: 'Router created successfully',
            router
        });
    } catch (error) {
        logger.error('Create router error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create router'
        });
    }
};

export const updateRouter = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { name, description, estate_id, active } = req.body;

        // Get current state
        const beforeResult = await db.query(
            'SELECT * FROM routers WHERE id = $1',
            [id]
        );

        if (beforeResult.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: 'Router not found'
            });
            return;
        }

        const beforeState = beforeResult.rows[0];

        // Update router
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (name !== undefined) {
            updates.push(`name = $${paramIndex++}`);
            values.push(name);
        }

        if (description !== undefined) {
            updates.push(`description = $${paramIndex++}`);
            values.push(description);
        }

        if (estate_id !== undefined) {
            updates.push(`estate_id = $${paramIndex++}`);
            values.push(estate_id);
        }

        if (active !== undefined) {
            updates.push(`active = $${paramIndex++}`);
            values.push(active);
        }

        if (updates.length > 0) {
            values.push(id);
            await db.query(
                `UPDATE routers SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
                values
            );
        }

        // Get updated state
        const afterResult = await db.query(
            'SELECT * FROM routers WHERE id = $1',
            [id]
        );

        // Log action
        await auditService.logAction({
            adminUserId: req.admin!.id,
            username: req.admin!.username,
            actionType: 'router.update',
            resourceType: 'router',
            resourceId: id,
            actionDetails: { name, description, estate_id, active },
            beforeState,
            afterState: afterResult.rows[0],
            ipAddress: req.ip || undefined,
            userAgent: req.get('User-Agent') || undefined,
            success: true
        });

        res.json({
            success: true,
            message: 'Router updated successfully',
            router: afterResult.rows[0]
        });
    } catch (error) {
        logger.error('Update router error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update router'
        });
    }
};

export const deleteRouter = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        // Get router before deletion
        const beforeResult = await db.query(
            'SELECT * FROM routers WHERE id = $1',
            [id]
        );

        if (beforeResult.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: 'Router not found'
            });
            return;
        }

        const beforeState = beforeResult.rows[0];

        // Delete router (cascade will handle credentials and sync status)
        await db.query('DELETE FROM routers WHERE id = $1', [id]);

        // Log action
        await auditService.logAction({
            adminUserId: req.admin!.id,
            username: req.admin!.username,
            actionType: 'router.delete',
            resourceType: 'router',
            resourceId: id,
            beforeState,
            ipAddress: req.ip || undefined,
            userAgent: req.get('User-Agent') || undefined,
            success: true
        });

        res.json({
            success: true,
            message: 'Router deleted successfully'
        });
    } catch (error) {
        logger.error('Delete router error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete router'
        });
    }
};

export const testRouterConnection = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const result = await mikrotikService.testConnection(id, req.admin!.id);

        res.json({
            success: result.success,
            message: result.message,
            details: result.details
        });
    } catch (error) {
        logger.error('Test router connection error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to test connection'
        });
    }
};

export const syncRouterPackages = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const result = await mikrotikService.syncPackages(id, req.admin!.id);

        res.json({
            success: result.success,
            message: result.message,
            synced: result.synced
        });
    } catch (error) {
        logger.error('Sync router packages error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to sync packages'
        });
    }
};

export const disconnectUserSession = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { username } = req.body;

        if (!username) {
            res.status(400).json({
                success: false,
                error: 'Username is required'
            });
            return;
        }

        const result = await mikrotikService.disconnectSession(id, req.admin!.id, username);

        res.json({
            success: result.success,
            message: result.message
        });
    } catch (error) {
        logger.error('Disconnect user session error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to disconnect session'
        });
    }
};

export const getRouterLogs = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const limit = parseInt(req.query.limit as string) || 100;

        const logs = await auditService.getRouterLogs(id, limit);

        res.json({
            success: true,
            logs
        });
    } catch (error) {
        logger.error('Get router logs error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch router logs'
        });
    }
};
