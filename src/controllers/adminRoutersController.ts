import { Request, Response } from 'express';
import DatabaseConnection from '../database/connection';
import mikrotikService from '../services/mikrotikService';
import encryptionService from '../utils/encryption';
import auditService from '../services/auditService';
import { logger } from '../utils/logger';
import RadiusService from '../services/radius';

const db = DatabaseConnection.getInstance();
const radiusService = new RadiusService();

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

        // Encrypt and store credentials with auth tag
        const encrypted = encryptionService.encrypt(api_password);

        await db.query(
            `INSERT INTO router_credentials (router_id, api_username, api_password_encrypted, encryption_iv, encryption_auth_tag)
             VALUES ($1, $2, $3, $4, $5)`,
            [router.id, api_username, encrypted.encrypted, encrypted.iv, encrypted.authTag]
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

        // Immediately make the new router visible to the RADIUS server
        radiusService.refreshRouters().catch(e => logger.warn('RADIUS refresh after create failed:', e));

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
        const { name, description, estate_id, active, api_username, api_password } = req.body;

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

        // Update credentials if provided
        if (api_username || api_password) {
            const credUpdates: string[] = [];
            const credValues: any[] = [];
            let credIdx = 1;

            if (api_username) {
                credUpdates.push(`api_username = $${credIdx++}`);
                credValues.push(api_username);
            }

            if (api_password) {
                const encrypted = encryptionService.encrypt(api_password);
                credUpdates.push(`api_password_encrypted = $${credIdx++}`);
                credValues.push(encrypted.encrypted);
                credUpdates.push(`encryption_iv = $${credIdx++}`);
                credValues.push(encrypted.iv);
                credUpdates.push(`encryption_auth_tag = $${credIdx++}`);
                credValues.push(encrypted.authTag);
            }

            credValues.push(id);
            await db.query(
                `UPDATE router_credentials SET ${credUpdates.join(', ')} WHERE router_id = $${credIdx}`,
                credValues
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

        radiusService.refreshRouters().catch(e => logger.warn('RADIUS refresh after update failed:', e));

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

        radiusService.refreshRouters().catch(e => logger.warn('RADIUS refresh after delete failed:', e));

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

export const getRouterSetupScript = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const routerResult = await db.query(
            `SELECT r.*, e.name as estate_name
             FROM routers r
             LEFT JOIN estates e ON r.estate_id = e.id
             WHERE r.id = $1`,
            [id]
        );

        if (routerResult.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Router not found' });
            return;
        }

        const router = routerResult.rows[0];
        const radiusSecret = process.env.RADIUS_SECRET;
        if (!radiusSecret) {
            res.status(500).json({ success: false, error: 'RADIUS_SECRET is not configured on the server. Set it in .env before generating setup scripts.' });
            return;
        }
        const serverHost = process.env.SERVER_HOST || req.hostname || 'YOUR_SERVER_IP';
        const serverPort = process.env.PORT || '3000';
        const radiusPort = '1812';

        // Generate the RouterOS script
        const script = `# ============================================================
# Pay-to-Connect Setup Script for: ${router.name}
# Estate: ${router.estate_name || 'N/A'}
# Server: ${serverHost}
# Generated: ${new Date().toISOString()}
# ============================================================
# Paste this script into your MikroTik terminal (Winbox or SSH)
# ============================================================

# 1. Configure RADIUS client
/radius
add address=${serverHost} secret="${radiusSecret}" service=hotspot,login authentication-port=${radiusPort} accounting-port=1813 timeout=3s
print

# 2. Enable hotspot RADIUS authentication and accounting
/ip hotspot profile
set [find name=default] use-radius=yes

# 3. Configure hotspot login page to redirect to Pay-to-Connect portal
/ip hotspot profile
set [find name=default] login-by=mac-cookie,mac,http-chap login-page="http://${serverHost}:${serverPort}/portal"

# 4. Make sure the hotspot walled garden allows the portal server
/ip hotspot walled-garden
add dst-host="${serverHost}" action=allow comment="Pay-to-Connect Portal"

# 5. Configure hotspot RADIUS accounting
/ip hotspot profile
set [find name=default] accounting=yes interim-update=5m

# 6. Set hotspot to send MAC address as username (required for this billing system)
/ip hotspot profile
set [find name=default] login-by=mac

# 7. Enable API-SSL service (required for admin panel remote management)
/ip service
enable api-ssl
set api-ssl port=8729

# 8. (Optional) Set system identity for identification in admin panel
/system identity
set name="${router.name.replace(/[^a-zA-Z0-9-]/g, '-')}"

# 9. Verify RADIUS configuration
/radius print
/ip hotspot profile print
/ip service print where name=api-ssl

# ============================================================
# After running this script:
# 1. Go back to the admin panel
# 2. Click "Test Connection" on this router to verify API access
# 3. Click "Sync Packages" to push WiFi packages to this router
# 4. Users can now pay on the portal and get automatic access
# ============================================================
`;

        res.json({
            success: true,
            router: { id: router.id, name: router.name },
            script
        });
    } catch (error) {
        logger.error('Get router setup script error:', error);
        res.status(500).json({ success: false, error: 'Failed to generate setup script' });
    }
};

export const getRouterActiveSessions = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        // Check router exists
        const routerResult = await db.query('SELECT name, ip_address FROM routers WHERE id = $1', [id]);
        if (routerResult.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Router not found' });
            return;
        }

        const sessions = await mikrotikService.getActiveSessions(id);

        res.json({
            success: true,
            router: routerResult.rows[0],
            sessions: sessions.map((s: any) => ({
                id: s['.id'],
                user: s.user,
                address: s.address,
                mac_address: s['mac-address'],
                uptime: s.uptime,
                bytes_in: s['bytes-in'],
                bytes_out: s['bytes-out'],
                packets_in: s['packets-in'],
                packets_out: s['packets-out'],
                server: s.server,
                status: s.status
            }))
        });
    } catch (error) {
        logger.error('Get router active sessions error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch active sessions'
        });
    }
};

export const getRouterSystemInfo = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        // Check router exists
        const routerResult = await db.query('SELECT name, ip_address, connection_status FROM routers WHERE id = $1', [id]);
        if (routerResult.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Router not found' });
            return;
        }

        const result = await mikrotikService.getSystemInfo(id);

        if (result.success) {
            // Update router status to online
            await db.query(
                `UPDATE routers SET connection_status = 'online', last_health_check = CURRENT_TIMESTAMP WHERE id = $1`,
                [id]
            );
        } else {
            await db.query(
                `UPDATE routers SET connection_status = 'offline', last_health_check = CURRENT_TIMESTAMP WHERE id = $1`,
                [id]
            );
        }

        res.json({
            success: result.success,
            router: routerResult.rows[0],
            info: result.info,
            error: result.error
        });
    } catch (error) {
        logger.error('Get router system info error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch system info'
        });
    }
};

export const getRouterHotspotUsers = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const routerResult = await db.query('SELECT name FROM routers WHERE id = $1', [id]);
        if (routerResult.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Router not found' });
            return;
        }

        const users = await mikrotikService.getHotspotUsers(id);

        res.json({
            success: true,
            users
        });
    } catch (error) {
        logger.error('Get router hotspot users error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch hotspot users'
        });
    }
};
