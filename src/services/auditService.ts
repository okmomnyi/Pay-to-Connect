import DatabaseConnection from '../database/connection';
import { logger } from '../utils/logger';

interface AuditLogData {
    adminUserId: string;
    actionType: string;
    resourceType: string;
    resourceId?: string;
    resourceName?: string;
    actionDetails: any;
    ipAddress?: string;
    userAgent?: string;
    success: boolean;
    errorMessage?: string;
    executionTimeMs?: number;
}

interface SecurityEventData {
    eventType: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    userId?: string;
    userType: 'admin' | 'user' | 'anonymous';
    ipAddress?: string;
    userAgent?: string;
    eventDetails: any;
    blocked?: boolean;
}

export class AuditService {
    private db: DatabaseConnection;

    constructor() {
        this.db = DatabaseConnection.getInstance();
    }

    /**
     * Log admin action (immutable audit trail)
     */
    async logAdminAction(data: AuditLogData): Promise<string | null> {
        try {
            const result = await this.db.query(`
                SELECT log_admin_action($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) as log_id
            `, [
                data.adminUserId,
                data.actionType,
                data.resourceType,
                data.resourceId || null,
                data.resourceName || null,
                JSON.stringify(data.actionDetails),
                data.ipAddress || null,
                data.userAgent || null,
                data.success,
                data.errorMessage || null,
                data.executionTimeMs || null
            ]);

            const logId = result.rows[0]?.log_id;
            
            if (logId) {
                logger.info('Admin action logged:', {
                    logId,
                    adminUserId: data.adminUserId,
                    actionType: data.actionType,
                    resourceType: data.resourceType,
                    success: data.success
                });
            }

            return logId;
        } catch (error) {
            logger.error('Failed to log admin action:', error);
            return null;
        }
    }

    /**
     * Log security event
     */
    async logSecurityEvent(data: SecurityEventData): Promise<string | null> {
        try {
            const result = await this.db.query(`
                SELECT log_security_event($1, $2, $3, $4, $5, $6, $7, $8) as log_id
            `, [
                data.eventType,
                data.severity,
                data.userId || null,
                data.userType,
                data.ipAddress || null,
                data.userAgent || null,
                JSON.stringify(data.eventDetails),
                data.blocked || false
            ]);

            const logId = result.rows[0]?.log_id;
            
            if (logId) {
                logger.warn('Security event logged:', {
                    logId,
                    eventType: data.eventType,
                    severity: data.severity,
                    blocked: data.blocked
                });
            }

            return logId;
        } catch (error) {
            logger.error('Failed to log security event:', error);
            return null;
        }
    }

    /**
     * Get audit logs with filtering
     */
    async getAuditLogs(filters: {
        adminUserId?: string;
        actionType?: string;
        resourceType?: string;
        success?: boolean;
        startDate?: Date;
        endDate?: Date;
        limit?: number;
        offset?: number;
    } = {}): Promise<any[]> {
        try {
            let query = `
                SELECT 
                    id, admin_user_id, username, action_type, resource_type,
                    resource_id, resource_name, action_details, ip_address,
                    success, error_message, execution_time_ms, created_at
                FROM admin_action_logs
                WHERE 1=1
            `;
            
            const params: any[] = [];
            let paramCount = 1;

            if (filters.adminUserId) {
                query += ` AND admin_user_id = $${paramCount}`;
                params.push(filters.adminUserId);
                paramCount++;
            }

            if (filters.actionType) {
                query += ` AND action_type = $${paramCount}`;
                params.push(filters.actionType);
                paramCount++;
            }

            if (filters.resourceType) {
                query += ` AND resource_type = $${paramCount}`;
                params.push(filters.resourceType);
                paramCount++;
            }

            if (filters.success !== undefined) {
                query += ` AND success = $${paramCount}`;
                params.push(filters.success);
                paramCount++;
            }

            if (filters.startDate) {
                query += ` AND created_at >= $${paramCount}`;
                params.push(filters.startDate);
                paramCount++;
            }

            if (filters.endDate) {
                query += ` AND created_at <= $${paramCount}`;
                params.push(filters.endDate);
                paramCount++;
            }

            query += ` ORDER BY created_at DESC`;

            if (filters.limit) {
                query += ` LIMIT $${paramCount}`;
                params.push(filters.limit);
                paramCount++;
            }

            if (filters.offset) {
                query += ` OFFSET $${paramCount}`;
                params.push(filters.offset);
                paramCount++;
            }

            const result = await this.db.query(query, params);
            return result.rows;
        } catch (error) {
            logger.error('Failed to get audit logs:', error);
            return [];
        }
    }

    /**
     * Get security events with filtering
     */
    async getSecurityEvents(filters: {
        eventType?: string;
        severity?: string;
        userId?: string;
        userType?: string;
        startDate?: Date;
        endDate?: Date;
        limit?: number;
        offset?: number;
    } = {}): Promise<any[]> {
        try {
            let query = `
                SELECT 
                    id, event_type, severity, user_id, user_type,
                    ip_address, event_details, blocked, created_at
                FROM security_event_logs
                WHERE 1=1
            `;
            
            const params: any[] = [];
            let paramCount = 1;

            if (filters.eventType) {
                query += ` AND event_type = $${paramCount}`;
                params.push(filters.eventType);
                paramCount++;
            }

            if (filters.severity) {
                query += ` AND severity = $${paramCount}`;
                params.push(filters.severity);
                paramCount++;
            }

            if (filters.userId) {
                query += ` AND user_id = $${paramCount}`;
                params.push(filters.userId);
                paramCount++;
            }

            if (filters.userType) {
                query += ` AND user_type = $${paramCount}`;
                params.push(filters.userType);
                paramCount++;
            }

            if (filters.startDate) {
                query += ` AND created_at >= $${paramCount}`;
                params.push(filters.startDate);
                paramCount++;
            }

            if (filters.endDate) {
                query += ` AND created_at <= $${paramCount}`;
                params.push(filters.endDate);
                paramCount++;
            }

            query += ` ORDER BY created_at DESC`;

            if (filters.limit) {
                query += ` LIMIT $${paramCount}`;
                params.push(filters.limit);
                paramCount++;
            }

            if (filters.offset) {
                query += ` OFFSET $${paramCount}`;
                params.push(filters.offset);
                paramCount++;
            }

            const result = await this.db.query(query, params);
            return result.rows;
        } catch (error) {
            logger.error('Failed to get security events:', error);
            return [];
        }
    }

    /**
     * Get router operation logs
     */
    async getRouterOperationLogs(routerId?: string, limit: number = 100): Promise<any[]> {
        try {
            let query = `
                SELECT 
                    rol.id, rol.router_id, rol.admin_user_id, rol.operation,
                    rol.api_command, rol.parameters, rol.response_data,
                    rol.success, rol.error_message, rol.execution_time_ms,
                    rol.created_at, r.name as router_name, au.username
                FROM router_operation_logs rol
                JOIN routers r ON rol.router_id = r.id
                LEFT JOIN admin_users au ON rol.admin_user_id = au.id
            `;
            
            const params: any[] = [];
            
            if (routerId) {
                query += ` WHERE rol.router_id = $1`;
                params.push(routerId);
            }

            query += ` ORDER BY rol.created_at DESC LIMIT $${params.length + 1}`;
            params.push(limit);

            const result = await this.db.query(query, params);
            return result.rows;
        } catch (error) {
            logger.error('Failed to get router operation logs:', error);
            return [];
        }
    }

    /**
     * Create audit middleware for Express routes
     */
    createAuditMiddleware(actionType: string, resourceType: string) {
        return (req: any, res: any, next: any) => {
            const startTime = Date.now();
            
            // Store original res.json to intercept response
            const originalJson = res.json;
            
            res.json = function(data: any) {
                const executionTime = Date.now() - startTime;
                const success = res.statusCode < 400;
                
                // Log the action asynchronously
                setImmediate(async () => {
                    try {
                        await auditService.logAdminAction({
                            adminUserId: req.user?.userId || 'unknown',
                            actionType,
                            resourceType,
                            resourceId: req.params?.id || req.body?.id,
                            resourceName: req.body?.name || req.params?.name,
                            actionDetails: {
                                method: req.method,
                                path: req.path,
                                params: req.params,
                                body: this.sanitizeBody(req.body),
                                query: req.query
                            },
                            ipAddress: req.ip,
                            userAgent: req.get('User-Agent'),
                            success,
                            errorMessage: success ? null : data?.error,
                            executionTimeMs: executionTime
                        });
                    } catch (error) {
                        logger.error('Audit middleware error:', error);
                    }
                });
                
                return originalJson.call(this, data);
            };
            
            next();
        };
    }

    /**
     * Sanitize request body for logging (remove sensitive data)
     */
    private sanitizeBody(body: any): any {
        if (!body || typeof body !== 'object') {
            return body;
        }

        const sanitized = { ...body };
        const sensitiveFields = ['password', 'api_password', 'secret', 'token', 'key'];
        
        for (const field of sensitiveFields) {
            if (sanitized[field]) {
                sanitized[field] = '[REDACTED]';
            }
        }
        
        return sanitized;
    }

    /**
     * Get audit statistics
     */
    async getAuditStats(timeframe: 'day' | 'week' | 'month' = 'day'): Promise<any> {
        try {
            let interval: string;
            switch (timeframe) {
                case 'week':
                    interval = '7 days';
                    break;
                case 'month':
                    interval = '30 days';
                    break;
                default:
                    interval = '1 day';
            }

            const [actionStats, securityStats] = await Promise.all([
                this.db.query(`
                    SELECT 
                        action_type,
                        resource_type,
                        COUNT(*) as count,
                        COUNT(CASE WHEN success = true THEN 1 END) as success_count,
                        COUNT(CASE WHEN success = false THEN 1 END) as failure_count
                    FROM admin_action_logs
                    WHERE created_at >= NOW() - INTERVAL '${interval}'
                    GROUP BY action_type, resource_type
                    ORDER BY count DESC
                `),
                this.db.query(`
                    SELECT 
                        event_type,
                        severity,
                        COUNT(*) as count
                    FROM security_event_logs
                    WHERE created_at >= NOW() - INTERVAL '${interval}'
                    GROUP BY event_type, severity
                    ORDER BY count DESC
                `)
            ]);

            return {
                timeframe,
                actionStats: actionStats.rows,
                securityStats: securityStats.rows,
                generatedAt: new Date().toISOString()
            };
        } catch (error) {
            logger.error('Failed to get audit stats:', error);
            return {
                timeframe,
                actionStats: [],
                securityStats: [],
                error: 'Failed to generate statistics'
            };
        }
    }
}

export const auditService = new AuditService();
export default auditService;
