import { RouterOSAPI } from 'node-routeros';
import DatabaseConnection from '../database/connection';
import encryptionService from '../utils/encryption';
import auditService from './auditService';
import { logger } from '../utils/logger';

interface RouterCredentials {
    id: string;
    router_id: string;
    api_username: string;
    api_password_encrypted: string;
    encryption_iv: string;
    api_port: number;
    connection_timeout: number;
}

interface RouterInfo {
    id: string;
    name: string;
    ipAddress: string;
    apiPort: number;
}

interface HotspotUser {
    username: string;
    password: string;
    profile: string;
    comment?: string;
}

class MikroTikService {
    private db: DatabaseConnection;

    constructor() {
        this.db = DatabaseConnection.getInstance();
    }

    private async getRouterCredentials(routerId: string): Promise<RouterCredentials | null> {
        try {
            const result = await this.db.query(
                `SELECT rc.*, r.ip_address, r.api_port 
                 FROM router_credentials rc
                 JOIN routers r ON rc.router_id = r.id
                 WHERE rc.router_id = $1`,
                [routerId]
            );

            if (result.rows.length === 0) {
                return null;
            }

            return result.rows[0];
        } catch (error) {
            logger.error('Failed to get router credentials:', error);
            return null;
        }
    }

    private async connectToRouter(routerId: string): Promise<RouterOSAPI | null> {
        try {
            const credentials = await this.getRouterCredentials(routerId);
            
            if (!credentials) {
                throw new Error('Router credentials not found');
            }

            const routerInfo = await this.db.query(
                'SELECT ip_address, api_port FROM routers WHERE id = $1',
                [routerId]
            );

            if (routerInfo.rows.length === 0) {
                throw new Error('Router not found');
            }

            const router = routerInfo.rows[0];

            // Decrypt password
            const password = encryptionService.decrypt(
                credentials.api_password_encrypted,
                credentials.encryption_iv,
                credentials.encryption_iv // Using IV as auth tag for simplicity
            );

            const api = new RouterOSAPI({
                host: router.ip_address,
                user: credentials.api_username,
                password: password,
                port: router.api_port || 8729,
                timeout: credentials.connection_timeout || 10000,
                tls: true // Always use TLS
            });

            await api.connect();
            return api;
        } catch (error) {
            logger.error(`Failed to connect to router ${routerId}:`, error);
            return null;
        }
    }

    async testConnection(routerId: string, adminUserId: string): Promise<{ success: boolean; message: string; details?: any }> {
        const startTime = Date.now();
        let api: RouterOSAPI | null = null;

        try {
            api = await this.connectToRouter(routerId);
            
            if (!api) {
                throw new Error('Failed to establish connection');
            }

            // Test with a simple command
            const identity = await api.write('/system/identity/print');
            const executionTime = Date.now() - startTime;

            await auditService.logRouterOperation(
                routerId,
                adminUserId,
                'test_connection',
                '/system/identity/print',
                {},
                true,
                identity,
                undefined,
                executionTime
            );

            // Update router status
            await this.db.query(
                `UPDATE routers 
                 SET connection_status = 'online', last_health_check = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [routerId]
            );

            return {
                success: true,
                message: 'Connection successful',
                details: identity
            };
        } catch (error: any) {
            const executionTime = Date.now() - startTime;

            await auditService.logRouterOperation(
                routerId,
                adminUserId,
                'test_connection',
                '/system/identity/print',
                {},
                false,
                undefined,
                error.message,
                executionTime
            );

            // Update router status
            await this.db.query(
                `UPDATE routers 
                 SET connection_status = 'offline', last_health_check = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [routerId]
            );

            return {
                success: false,
                message: error.message || 'Connection failed'
            };
        } finally {
            if (api) {
                try {
                    await api.close();
                } catch (e) {
                    // Ignore close errors
                }
            }
        }
    }

    async createHotspotUser(
        routerId: string,
        adminUserId: string,
        user: HotspotUser
    ): Promise<{ success: boolean; message: string }> {
        const startTime = Date.now();
        let api: RouterOSAPI | null = null;

        try {
            api = await this.connectToRouter(routerId);
            
            if (!api) {
                throw new Error('Failed to connect to router');
            }

            const params = {
                name: user.username,
                password: user.password,
                profile: user.profile,
                comment: user.comment || ''
            };

            await api.write('/ip/hotspot/user/add', params);
            const executionTime = Date.now() - startTime;

            await auditService.logRouterOperation(
                routerId,
                adminUserId,
                'create_hotspot_user',
                '/ip/hotspot/user/add',
                { username: user.username, profile: user.profile },
                true,
                undefined,
                undefined,
                executionTime
            );

            return {
                success: true,
                message: 'Hotspot user created successfully'
            };
        } catch (error: any) {
            const executionTime = Date.now() - startTime;

            await auditService.logRouterOperation(
                routerId,
                adminUserId,
                'create_hotspot_user',
                '/ip/hotspot/user/add',
                { username: user.username },
                false,
                undefined,
                error.message,
                executionTime
            );

            return {
                success: false,
                message: error.message || 'Failed to create hotspot user'
            };
        } finally {
            if (api) {
                try {
                    await api.close();
                } catch (e) {
                    // Ignore
                }
            }
        }
    }

    async disableHotspotUser(
        routerId: string,
        adminUserId: string,
        username: string
    ): Promise<{ success: boolean; message: string }> {
        const startTime = Date.now();
        let api: RouterOSAPI | null = null;

        try {
            api = await this.connectToRouter(routerId);
            
            if (!api) {
                throw new Error('Failed to connect to router');
            }

            // Find user
            const users = await api.write('/ip/hotspot/user/print', { '?name': username });
            
            if (!users || users.length === 0) {
                throw new Error('User not found on router');
            }

            const userId = users[0]['.id'];

            // Disable user
            await api.write('/ip/hotspot/user/set', {
                '.id': userId,
                disabled: 'yes'
            });

            const executionTime = Date.now() - startTime;

            await auditService.logRouterOperation(
                routerId,
                adminUserId,
                'disable_hotspot_user',
                '/ip/hotspot/user/set',
                { username },
                true,
                undefined,
                undefined,
                executionTime
            );

            return {
                success: true,
                message: 'User disabled successfully'
            };
        } catch (error: any) {
            const executionTime = Date.now() - startTime;

            await auditService.logRouterOperation(
                routerId,
                adminUserId,
                'disable_hotspot_user',
                '/ip/hotspot/user/set',
                { username },
                false,
                undefined,
                error.message,
                executionTime
            );

            return {
                success: false,
                message: error.message || 'Failed to disable user'
            };
        } finally {
            if (api) {
                try {
                    await api.close();
                } catch (e) {
                    // Ignore
                }
            }
        }
    }

    async disconnectSession(
        routerId: string,
        adminUserId: string,
        username: string
    ): Promise<{ success: boolean; message: string }> {
        const startTime = Date.now();
        let api: RouterOSAPI | null = null;

        try {
            api = await this.connectToRouter(routerId);
            
            if (!api) {
                throw new Error('Failed to connect to router');
            }

            // Find active session
            const sessions = await api.write('/ip/hotspot/active/print', { '?user': username });
            
            if (!sessions || sessions.length === 0) {
                return {
                    success: true,
                    message: 'No active session found'
                };
            }

            // Disconnect all sessions for this user
            for (const session of sessions) {
                await api.write('/ip/hotspot/active/remove', { '.id': session['.id'] });
            }

            const executionTime = Date.now() - startTime;

            await auditService.logRouterOperation(
                routerId,
                adminUserId,
                'disconnect_session',
                '/ip/hotspot/active/remove',
                { username, sessions: sessions.length },
                true,
                undefined,
                undefined,
                executionTime
            );

            return {
                success: true,
                message: `Disconnected ${sessions.length} session(s)`
            };
        } catch (error: any) {
            const executionTime = Date.now() - startTime;

            await auditService.logRouterOperation(
                routerId,
                adminUserId,
                'disconnect_session',
                '/ip/hotspot/active/remove',
                { username },
                false,
                undefined,
                error.message,
                executionTime
            );

            return {
                success: false,
                message: error.message || 'Failed to disconnect session'
            };
        } finally {
            if (api) {
                try {
                    await api.close();
                } catch (e) {
                    // Ignore
                }
            }
        }
    }

    async syncPackages(
        routerId: string,
        adminUserId: string
    ): Promise<{ success: boolean; message: string; synced?: number }> {
        const startTime = Date.now();
        let api: RouterOSAPI | null = null;

        try {
            api = await this.connectToRouter(routerId);
            
            if (!api) {
                throw new Error('Failed to connect to router');
            }

            // Get all active packages from database
            const packagesResult = await this.db.query(
                'SELECT * FROM packages WHERE active = true'
            );

            const packages = packagesResult.rows;
            let syncedCount = 0;

            // Get existing profiles
            const existingProfiles = await api.write('/ip/hotspot/user/profile/print');
            const existingProfileNames = existingProfiles.map((p: any) => p.name);

            for (const pkg of packages) {
                try {
                    const profileName = `pkg_${pkg.id}`;
                    
                    // Create or update profile
                    if (existingProfileNames.includes(profileName)) {
                        // Update existing
                        const profile = existingProfiles.find((p: any) => p.name === profileName);
                        await api.write('/ip/hotspot/user/profile/set', {
                            '.id': profile['.id'],
                            name: profileName,
                            'session-timeout': pkg.duration_minutes ? `${pkg.duration_minutes * 60}` : 'none',
                            'shared-users': '1',
                            'rate-limit': pkg.speed_limit || ''
                        });
                    } else {
                        // Create new
                        await api.write('/ip/hotspot/user/profile/add', {
                            name: profileName,
                            'session-timeout': pkg.duration_minutes ? `${pkg.duration_minutes * 60}` : 'none',
                            'shared-users': '1',
                            'rate-limit': pkg.speed_limit || ''
                        });
                    }
                    
                    syncedCount++;
                } catch (error) {
                    logger.error(`Failed to sync package ${pkg.id}:`, error);
                }
            }

            const executionTime = Date.now() - startTime;

            // Update sync status
            await this.db.query(
                `INSERT INTO router_sync_status (router_id, last_sync_at, sync_status, packages_synced)
                 VALUES ($1, CURRENT_TIMESTAMP, 'success', $2)
                 ON CONFLICT (router_id) DO UPDATE SET
                 last_sync_at = CURRENT_TIMESTAMP,
                 sync_status = 'success',
                 packages_synced = $2,
                 sync_errors = NULL`,
                [routerId, syncedCount]
            );

            await auditService.logRouterOperation(
                routerId,
                adminUserId,
                'sync_packages',
                '/ip/hotspot/user/profile/add',
                { total_packages: packages.length },
                true,
                { synced: syncedCount },
                undefined,
                executionTime
            );

            return {
                success: true,
                message: 'Packages synced successfully',
                synced: syncedCount
            };
        } catch (error: any) {
            const executionTime = Date.now() - startTime;

            // Update sync status with error
            await this.db.query(
                `INSERT INTO router_sync_status (router_id, last_sync_at, sync_status, sync_errors)
                 VALUES ($1, CURRENT_TIMESTAMP, 'failed', $2)
                 ON CONFLICT (router_id) DO UPDATE SET
                 last_sync_at = CURRENT_TIMESTAMP,
                 sync_status = 'failed',
                 sync_errors = $2`,
                [routerId, JSON.stringify({ error: error.message })]
            );

            await auditService.logRouterOperation(
                routerId,
                adminUserId,
                'sync_packages',
                '/ip/hotspot/user/profile/add',
                {},
                false,
                undefined,
                error.message,
                executionTime
            );

            return {
                success: false,
                message: error.message || 'Failed to sync packages'
            };
        } finally {
            if (api) {
                try {
                    await api.close();
                } catch (e) {
                    // Ignore
                }
            }
        }
    }

    async getActiveSessions(routerId: string): Promise<any[]> {
        let api: RouterOSAPI | null = null;

        try {
            api = await this.connectToRouter(routerId);
            
            if (!api) {
                return [];
            }

            const sessions = await api.write('/ip/hotspot/active/print');
            return sessions || [];
        } catch (error) {
            logger.error(`Failed to get active sessions from router ${routerId}:`, error);
            return [];
        } finally {
            if (api) {
                try {
                    await api.close();
                } catch (e) {
                    // Ignore
                }
            }
        }
    }
}

export default new MikroTikService();
