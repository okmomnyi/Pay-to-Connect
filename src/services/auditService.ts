import DatabaseConnection from '../database/connection';
import { logger } from '../utils/logger';

interface AuditLogEntry {
    adminUserId: string;
    username: string;
    actionType: string;
    resourceType: string;
    resourceId?: string;
    actionDetails?: any;
    beforeState?: any;
    afterState?: any;
    ipAddress?: string;
    userAgent?: string;
    success: boolean;
    errorMessage?: string;
    executionTimeMs?: number;
}

class AuditService {
    private db: DatabaseConnection;

    constructor() {
        this.db = DatabaseConnection.getInstance();
    }

    async logAction(entry: AuditLogEntry): Promise<void> {
        try {
            await this.db.query(
                `INSERT INTO admin_action_logs (
                    admin_user_id, username, action_type, resource_type, 
                    resource_id, action_details, before_state, after_state,
                    ip_address, user_agent, success, error_message, execution_time_ms
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
                [
                    entry.adminUserId,
                    entry.username,
                    entry.actionType,
                    entry.resourceType,
                    entry.resourceId || null,
                    entry.actionDetails ? JSON.stringify(entry.actionDetails) : null,
                    entry.beforeState ? JSON.stringify(entry.beforeState) : null,
                    entry.afterState ? JSON.stringify(entry.afterState) : null,
                    entry.ipAddress || null,
                    entry.userAgent || null,
                    entry.success,
                    entry.errorMessage || null,
                    entry.executionTimeMs || null
                ]
            );
        } catch (error) {
            logger.error('Failed to log audit entry:', error);
        }
    }

    async logRouterOperation(
        routerId: string,
        adminUserId: string,
        operationType: string,
        apiCommand: string,
        apiParams: any,
        success: boolean,
        responseData?: any,
        errorMessage?: string,
        executionTimeMs?: number
    ): Promise<void> {
        try {
            await this.db.query(
                `INSERT INTO router_operation_logs (
                    router_id, admin_user_id, operation_type, api_command,
                    api_params, success, response_data, error_message, execution_time_ms
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                    routerId,
                    adminUserId,
                    operationType,
                    apiCommand,
                    JSON.stringify(apiParams),
                    success,
                    responseData ? JSON.stringify(responseData) : null,
                    errorMessage || null,
                    executionTimeMs || null
                ]
            );
        } catch (error) {
            logger.error('Failed to log router operation:', error);
        }
    }

    async logSecurityEvent(
        eventType: string,
        severity: 'low' | 'medium' | 'high' | 'critical',
        userId: string | null,
        userType: 'admin' | 'user' | 'system',
        ipAddress: string | null,
        userAgent: string | null,
        eventDetails: any
    ): Promise<void> {
        try {
            await this.db.query(
                `INSERT INTO security_event_logs (
                    event_type, severity, user_id, user_type,
                    ip_address, user_agent, event_details
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    eventType,
                    severity,
                    userId,
                    userType,
                    ipAddress,
                    userAgent,
                    JSON.stringify(eventDetails)
                ]
            );
        } catch (error) {
            logger.error('Failed to log security event:', error);
        }
    }

    async getAdminLogs(filters: {
        adminUserId?: string;
        actionType?: string;
        resourceType?: string;
        startDate?: Date;
        endDate?: Date;
        limit?: number;
        offset?: number;
    }): Promise<any[]> {
        const conditions: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        if (filters.adminUserId) {
            conditions.push(`admin_user_id = $${paramIndex++}`);
            params.push(filters.adminUserId);
        }

        if (filters.actionType) {
            conditions.push(`action_type = $${paramIndex++}`);
            params.push(filters.actionType);
        }

        if (filters.resourceType) {
            conditions.push(`resource_type = $${paramIndex++}`);
            params.push(filters.resourceType);
        }

        if (filters.startDate) {
            conditions.push(`created_at >= $${paramIndex++}`);
            params.push(filters.startDate);
        }

        if (filters.endDate) {
            conditions.push(`created_at <= $${paramIndex++}`);
            params.push(filters.endDate);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const limit = filters.limit || 100;
        const offset = filters.offset || 0;

        const result = await this.db.query(
            `SELECT * FROM admin_action_logs 
             ${whereClause}
             ORDER BY created_at DESC
             LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
            [...params, limit, offset]
        );

        return result.rows;
    }

    async getRouterLogs(routerId: string, limit: number = 100): Promise<any[]> {
        const result = await this.db.query(
            `SELECT * FROM router_operation_logs 
             WHERE router_id = $1
             ORDER BY created_at DESC
             LIMIT $2`,
            [routerId, limit]
        );

        return result.rows;
    }

    async getSecurityLogs(filters: {
        eventType?: string;
        severity?: string;
        startDate?: Date;
        endDate?: Date;
        limit?: number;
        offset?: number;
    }): Promise<any[]> {
        const conditions: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        if (filters.eventType) {
            conditions.push(`event_type = $${paramIndex++}`);
            params.push(filters.eventType);
        }

        if (filters.severity) {
            conditions.push(`severity = $${paramIndex++}`);
            params.push(filters.severity);
        }

        if (filters.startDate) {
            conditions.push(`created_at >= $${paramIndex++}`);
            params.push(filters.startDate);
        }

        if (filters.endDate) {
            conditions.push(`created_at <= $${paramIndex++}`);
            params.push(filters.endDate);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const limit = filters.limit || 100;
        const offset = filters.offset || 0;

        const result = await this.db.query(
            `SELECT * FROM security_event_logs 
             ${whereClause}
             ORDER BY created_at DESC
             LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
            [...params, limit, offset]
        );

        return result.rows;
    }
}

export default new AuditService();
