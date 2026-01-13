import crypto from 'crypto';
import DatabaseConnection from '../database/connection';
import { logger } from '../utils/logger';

// Mock RouterOSAPI interface until dependency is installed
interface RouterOSAPI {
    connect(): Promise<void>;
    close(): Promise<void>;
    write(command: string, params?: any): Promise<any[]>;
}

// Mock RouterOSAPI constructor
const RouterOSAPI = class {
    private config: any;
    
    constructor(config: any) {
        this.config = config;
    }
    
    async connect(): Promise<void> {
        throw new Error('RouterOSAPI not installed. Run: npm install node-routeros');
    }
    
    async close(): Promise<void> {
        // Mock implementation
    }
    
    async write(command: string, params?: any): Promise<any[]> {
        throw new Error('RouterOSAPI not installed. Run: npm install node-routeros');
    }
};

interface RouterCredentials {
    id: string;
    router_id: string;
    api_username: string;
    api_password_encrypted: string;
    api_port: number;
    connection_timeout: number;
}

interface RouterConfig {
    id: string;
    name: string;
    ip_address: string;
    active: boolean;
}

interface MikroTikConnection {
    host: string;
    user: string;
    password: string;
    port: number;
    timeout: number;
}

export class MikroTikService {
    private db: DatabaseConnection;
    private encryptionKey: string;
    private encryptionAlgorithm = 'aes-256-gcm';

    constructor() {
        this.db = DatabaseConnection.getInstance();
        this.encryptionKey = process.env.ROUTER_ENCRYPTION_KEY || this.generateEncryptionKey();
        
        if (!process.env.ROUTER_ENCRYPTION_KEY) {
            logger.warn('ROUTER_ENCRYPTION_KEY not set in environment. Using generated key.');
        }
    }

    private generateEncryptionKey(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Encrypt router password for secure storage
     */
    private encryptPassword(password: string): string {
        try {
            const iv = crypto.randomBytes(16);
            const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
            const cipher = crypto.createCipher('aes-256-cbc', key);
            
            let encrypted = cipher.update(password, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            return `${iv.toString('hex')}:${encrypted}`;
        } catch (error) {
            logger.error('Failed to encrypt password:', error);
            throw new Error('Encryption failed');
        }
    }

    /**
     * Decrypt router password for API connection
     */
    private decryptPassword(encryptedPassword: string): string {
        try {
            const parts = encryptedPassword.split(':');
            
            if (parts.length < 2) {
                throw new Error('Invalid encrypted password format');
            }
            
            const [ivHex, encrypted] = parts;
            const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
            const decipher = crypto.createDecipher('aes-256-cbc', key);
            
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            logger.error('Failed to decrypt password:', error);
            throw new Error('Decryption failed');
        }
    }

    /**
     * Get router credentials (decrypted in memory only)
     */
    private async getRouterCredentials(routerId: string): Promise<MikroTikConnection | null> {
        try {
            const result = await this.db.query(`
                SELECT r.ip_address, rc.api_username, rc.api_password_encrypted, 
                       rc.api_port, rc.connection_timeout
                FROM routers r
                JOIN router_credentials rc ON r.id = rc.router_id
                WHERE r.id = $1 AND r.active = true
            `, [routerId]);

            if (result.rows.length === 0) {
                return null;
            }

            const row = result.rows[0];
            const decryptedPassword = this.decryptPassword(row.api_password_encrypted);

            return {
                host: row.ip_address,
                user: row.api_username,
                password: decryptedPassword,
                port: row.api_port || 8729,
                timeout: (row.connection_timeout || 30) * 1000
            };
        } catch (error) {
            logger.error('Failed to get router credentials:', error);
            throw new Error('Failed to retrieve router credentials');
        }
    }

    /**
     * Test router connection (WHITELISTED OPERATION)
     */
    async testConnection(routerId: string, adminUserId: string): Promise<{success: boolean, message: string, details?: any}> {
        const startTime = Date.now();
        let connection: RouterOSAPI | null = null;

        try {
            const credentials = await this.getRouterCredentials(routerId);
            if (!credentials) {
                throw new Error('Router credentials not found');
            }

            connection = new RouterOSAPI({
                host: credentials.host,
                user: credentials.user,
                password: credentials.password,
                port: credentials.port,
                timeout: credentials.timeout
            });

            // Connect and test basic API access
            await connection.connect();
            
            // Test read-only command to verify connection
            const identity = await connection.write('/system/identity/print');
            
            // Update connection status
            await this.updateConnectionStatus(routerId, 'connected', null);
            
            // Log successful operation
            await this.logRouterOperation(
                routerId, 
                adminUserId, 
                'test_connection',
                '/system/identity/print',
                {},
                { identity },
                true,
                null,
                Date.now() - startTime
            );

            return {
                success: true,
                message: 'Connection successful',
                details: {
                    identity: identity[0]?.name || 'Unknown',
                    responseTime: Date.now() - startTime
                }
            };

        } catch (error: any) {
            const errorMessage = error.message || 'Connection failed';
            
            // Update connection status
            await this.updateConnectionStatus(routerId, 'failed', errorMessage);
            
            // Log failed operation
            await this.logRouterOperation(
                routerId,
                adminUserId,
                'test_connection',
                '/system/identity/print',
                {},
                null,
                false,
                errorMessage,
                Date.now() - startTime
            );

            logger.error('Router connection test failed:', error);
            
            return {
                success: false,
                message: errorMessage
            };
        } finally {
            if (connection) {
                try {
                    await connection.close();
                } catch (closeError) {
                    logger.warn('Failed to close router connection:', closeError);
                }
            }
        }
    }

    /**
     * Enable hotspot on router (WHITELISTED OPERATION)
     */
    async enableHotspot(routerId: string, adminUserId: string, interfaceName: string = 'wlan1'): Promise<{success: boolean, message: string}> {
        const startTime = Date.now();
        let connection: RouterOSAPI | null = null;

        try {
            const credentials = await this.getRouterCredentials(routerId);
            if (!credentials) {
                throw new Error('Router credentials not found');
            }

            connection = new RouterOSAPI({
                host: credentials.host,
                user: credentials.user,
                password: credentials.password,
                port: credentials.port,
                timeout: credentials.timeout
            });

            await connection.connect();

            // Check if hotspot is already enabled
            const hotspots = await connection.write('/ip/hotspot/print');
            const existingHotspot = hotspots.find((h: any) => h.interface === interfaceName);

            if (existingHotspot && existingHotspot.disabled !== 'true') {
                return {
                    success: true,
                    message: 'Hotspot already enabled'
                };
            }

            // Enable hotspot
            const command = '/ip/hotspot/enable';
            const params = { numbers: existingHotspot?.['.id'] || '0' };
            
            await connection.write(command, params);

            // Log successful operation
            await this.logRouterOperation(
                routerId,
                adminUserId,
                'enable_hotspot',
                command,
                params,
                { interface: interfaceName },
                true,
                null,
                Date.now() - startTime
            );

            return {
                success: true,
                message: 'Hotspot enabled successfully'
            };

        } catch (error: any) {
            const errorMessage = error.message || 'Failed to enable hotspot';
            
            await this.logRouterOperation(
                routerId,
                adminUserId,
                'enable_hotspot',
                '/ip/hotspot/enable',
                { interface: interfaceName },
                null,
                false,
                errorMessage,
                Date.now() - startTime
            );

            logger.error('Failed to enable hotspot:', error);
            
            return {
                success: false,
                message: errorMessage
            };
        } finally {
            if (connection) {
                try {
                    await connection.close();
                } catch (closeError) {
                    logger.warn('Failed to close router connection:', closeError);
                }
            }
        }
    }

    /**
     * Create hotspot user profile (WHITELISTED OPERATION)
     */
    async createUserProfile(routerId: string, adminUserId: string, profileData: {
        name: string;
        sessionTimeout?: string;
        idleTimeout?: string;
        rateLimit?: string;
    }): Promise<{success: boolean, message: string}> {
        const startTime = Date.now();
        let connection: RouterOSAPI | null = null;

        try {
            const credentials = await this.getRouterCredentials(routerId);
            if (!credentials) {
                throw new Error('Router credentials not found');
            }

            connection = new RouterOSAPI({
                host: credentials.host,
                user: credentials.user,
                password: credentials.password,
                port: credentials.port,
                timeout: credentials.timeout
            });

            await connection.connect();

            // Check if profile already exists
            const profiles = await connection.write('/ip/hotspot/user/profile/print');
            const existingProfile = profiles.find((p: any) => p.name === profileData.name);

            if (existingProfile) {
                return {
                    success: true,
                    message: 'Profile already exists'
                };
            }

            // Create user profile
            const command = '/ip/hotspot/user/profile/add';
            const params: any = { name: profileData.name };
            
            if (profileData.sessionTimeout) params['session-timeout'] = profileData.sessionTimeout;
            if (profileData.idleTimeout) params['idle-timeout'] = profileData.idleTimeout;
            if (profileData.rateLimit) params['rate-limit'] = profileData.rateLimit;

            await connection.write(command, params);

            // Log successful operation
            await this.logRouterOperation(
                routerId,
                adminUserId,
                'create_user_profile',
                command,
                params,
                { profileName: profileData.name },
                true,
                null,
                Date.now() - startTime
            );

            return {
                success: true,
                message: 'User profile created successfully'
            };

        } catch (error: any) {
            const errorMessage = error.message || 'Failed to create user profile';
            
            await this.logRouterOperation(
                routerId,
                adminUserId,
                'create_user_profile',
                '/ip/hotspot/user/profile/add',
                profileData,
                null,
                false,
                errorMessage,
                Date.now() - startTime
            );

            logger.error('Failed to create user profile:', error);
            
            return {
                success: false,
                message: errorMessage
            };
        } finally {
            if (connection) {
                try {
                    await connection.close();
                } catch (closeError) {
                    logger.warn('Failed to close router connection:', closeError);
                }
            }
        }
    }

    /**
     * Sync packages to router (WHITELISTED OPERATION)
     */
    async syncPackagesToRouter(routerId: string, adminUserId: string): Promise<{success: boolean, message: string, syncedCount?: number}> {
        const startTime = Date.now();
        let connection: RouterOSAPI | null = null;

        try {
            // Get active packages from database
            const packagesResult = await this.db.query(`
                SELECT id, name, duration_minutes, price_kes, speed_limit_mbps
                FROM packages 
                WHERE active = true
                ORDER BY price_kes ASC
            `);

            if (packagesResult.rows.length === 0) {
                return {
                    success: true,
                    message: 'No active packages to sync',
                    syncedCount: 0
                };
            }

            const credentials = await this.getRouterCredentials(routerId);
            if (!credentials) {
                throw new Error('Router credentials not found');
            }

            connection = new RouterOSAPI({
                host: credentials.host,
                user: credentials.user,
                password: credentials.password,
                port: credentials.port,
                timeout: credentials.timeout
            });

            await connection.connect();

            let syncedCount = 0;
            const packages = packagesResult.rows;

            for (const pkg of packages) {
                try {
                    // Create user profile for each package
                    const profileName = `pkg_${pkg.name.replace(/\s+/g, '_').toLowerCase()}`;
                    const sessionTimeout = `${pkg.duration_minutes}m`;
                    const rateLimit = pkg.speed_limit_mbps ? `${pkg.speed_limit_mbps}M/${pkg.speed_limit_mbps}M` : undefined;

                    const profileResult = await this.createUserProfile(routerId, adminUserId, {
                        name: profileName,
                        sessionTimeout,
                        rateLimit
                    });

                    if (profileResult.success) {
                        syncedCount++;
                    }
                } catch (pkgError) {
                    logger.warn(`Failed to sync package ${pkg.name}:`, pkgError);
                }
            }

            // Update sync status
            await this.updateSyncStatus(routerId, 'packages', 'success', {
                syncedPackages: syncedCount,
                totalPackages: packages.length
            });

            // Log successful operation
            await this.logRouterOperation(
                routerId,
                adminUserId,
                'sync_packages',
                'bulk_profile_creation',
                { packageCount: packages.length },
                { syncedCount },
                true,
                null,
                Date.now() - startTime
            );

            return {
                success: true,
                message: `Successfully synced ${syncedCount} packages`,
                syncedCount
            };

        } catch (error: any) {
            const errorMessage = error.message || 'Failed to sync packages';
            
            // Update sync status
            await this.updateSyncStatus(routerId, 'packages', 'failed', null, errorMessage);
            
            await this.logRouterOperation(
                routerId,
                adminUserId,
                'sync_packages',
                'bulk_profile_creation',
                {},
                null,
                false,
                errorMessage,
                Date.now() - startTime
            );

            logger.error('Failed to sync packages:', error);
            
            return {
                success: false,
                message: errorMessage
            };
        } finally {
            if (connection) {
                try {
                    await connection.close();
                } catch (closeError) {
                    logger.warn('Failed to close router connection:', closeError);
                }
            }
        }
    }

    /**
     * Get router monitoring data (READ-ONLY OPERATION)
     */
    async getRouterStats(routerId: string, adminUserId: string): Promise<{success: boolean, data?: any, message?: string}> {
        const startTime = Date.now();
        let connection: RouterOSAPI | null = null;

        try {
            const credentials = await this.getRouterCredentials(routerId);
            if (!credentials) {
                throw new Error('Router credentials not found');
            }

            connection = new RouterOSAPI({
                host: credentials.host,
                user: credentials.user,
                password: credentials.password,
                port: credentials.port,
                timeout: credentials.timeout
            });

            await connection.connect();

            // Get system resource info
            const resources = await connection.write('/system/resource/print');
            const hotspotUsers = await connection.write('/ip/hotspot/active/print');
            const interfaces = await connection.write('/interface/print');

            const stats = {
                uptime: resources[0]?.uptime || 'Unknown',
                cpuLoad: resources[0]?.['cpu-load'] || '0%',
                freeMemory: resources[0]?.['free-memory'] || '0',
                totalMemory: resources[0]?.['total-memory'] || '0',
                activeUsers: hotspotUsers.length,
                interfaces: interfaces.length
            };

            // Log successful operation
            await this.logRouterOperation(
                routerId,
                adminUserId,
                'get_router_stats',
                '/system/resource/print',
                {},
                stats,
                true,
                null,
                Date.now() - startTime
            );

            return {
                success: true,
                data: stats
            };

        } catch (error: any) {
            const errorMessage = error.message || 'Failed to get router stats';
            
            await this.logRouterOperation(
                routerId,
                adminUserId,
                'get_router_stats',
                '/system/resource/print',
                {},
                null,
                false,
                errorMessage,
                Date.now() - startTime
            );

            logger.error('Failed to get router stats:', error);
            
            return {
                success: false,
                message: errorMessage
            };
        } finally {
            if (connection) {
                try {
                    await connection.close();
                } catch (closeError) {
                    logger.warn('Failed to close router connection:', closeError);
                }
            }
        }
    }

    /**
     * Store router credentials securely
     */
    async storeRouterCredentials(routerId: string, username: string, password: string, port: number = 8729): Promise<void> {
        try {
            const encryptedPassword = this.encryptPassword(password);
            
            await this.db.query(`
                INSERT INTO router_credentials (router_id, api_username, api_password_encrypted, api_port)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (router_id) 
                DO UPDATE SET 
                    api_username = EXCLUDED.api_username,
                    api_password_encrypted = EXCLUDED.api_password_encrypted,
                    api_port = EXCLUDED.api_port,
                    updated_at = NOW()
            `, [routerId, username, encryptedPassword, port]);
            
        } catch (error) {
            logger.error('Failed to store router credentials:', error);
            throw new Error('Failed to store router credentials');
        }
    }

    /**
     * Update router connection status
     */
    private async updateConnectionStatus(routerId: string, status: string, errorMessage: string | null): Promise<void> {
        try {
            await this.db.query(`
                UPDATE router_credentials 
                SET connection_status = $1, last_connection_test = NOW()
                WHERE router_id = $2
            `, [status, routerId]);
        } catch (error) {
            logger.error('Failed to update connection status:', error);
        }
    }

    /**
     * Update sync status
     */
    private async updateSyncStatus(routerId: string, syncType: string, status: string, details: any = null, errorMessage: string | null = null): Promise<void> {
        try {
            await this.db.query(`
                INSERT INTO router_sync_status (router_id, sync_type, sync_status, sync_details, error_message, last_sync_at)
                VALUES ($1, $2, $3, $4, $5, NOW())
                ON CONFLICT (router_id, sync_type)
                DO UPDATE SET 
                    sync_status = EXCLUDED.sync_status,
                    sync_details = EXCLUDED.sync_details,
                    error_message = EXCLUDED.error_message,
                    last_sync_at = EXCLUDED.last_sync_at,
                    updated_at = NOW()
            `, [routerId, syncType, status, JSON.stringify(details), errorMessage]);
        } catch (error) {
            logger.error('Failed to update sync status:', error);
        }
    }

    /**
     * Log router operations for audit trail
     */
    private async logRouterOperation(
        routerId: string,
        adminUserId: string,
        operation: string,
        apiCommand: string,
        parameters: any,
        responseData: any,
        success: boolean,
        errorMessage: string | null,
        executionTimeMs: number
    ): Promise<void> {
        try {
            await this.db.query(`
                INSERT INTO router_operation_logs (
                    router_id, admin_user_id, operation, api_command, 
                    parameters, response_data, success, error_message, execution_time_ms
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [
                routerId, adminUserId, operation, apiCommand,
                JSON.stringify(parameters), JSON.stringify(responseData),
                success, errorMessage, executionTimeMs
            ]);
        } catch (error) {
            logger.error('Failed to log router operation:', error);
        }
    }
}

export default new MikroTikService();
