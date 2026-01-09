import DatabaseConnection from '../database/connection';
import { logger } from '../utils/logger';

interface UsageData {
    sessionId: string;
    packageName: string;
    packageType: 'time_based' | 'data_based' | 'hybrid';
    startTime: Date;
    endTime: Date;
    purchaseTimestamp: Date;
    expiryDateTime: Date;
    timeUsedMinutes: number;
    timeRemainingMinutes: number;
    timeAllocatedMinutes: number | null;
    dataUsedMB: number;
    dataRemainingMB: number | null;
    dataAllocatedMB: number | null;
    status: 'active' | 'expired' | 'exhausted' | 'suspended';
    bytesUploaded: number;
    bytesDownloaded: number;
    totalBytes: number;
}

class UsageCalculationService {
    private db: DatabaseConnection;

    constructor() {
        this.db = DatabaseConnection.getInstance();
    }

    /**
     * Get current usage for a user
     * This is the authoritative source for usage data
     */
    public async getCurrentUsage(userId: string): Promise<UsageData | null> {
        try {
            // Get active session from database function
            const result = await this.db.query(
                'SELECT * FROM get_user_active_session_stats($1)',
                [userId]
            );

            if (result.rows.length === 0) {
                return null;
            }

            const session = result.rows[0];

            // Calculate status
            const status = this.calculateStatus(
                session.end_time,
                session.data_limit_mb,
                session.data_used_mb,
                session.session_status
            );

            // Get package details for time allocation
            const packageResult = await this.db.query(
                'SELECT duration_minutes FROM packages WHERE id = (SELECT package_id FROM sessions WHERE id = $1)',
                [session.session_id]
            );

            const timeAllocatedMinutes = packageResult.rows[0]?.duration_minutes || null;

            return {
                sessionId: session.session_id,
                packageName: session.package_name,
                packageType: session.package_type,
                startTime: session.start_time,
                endTime: session.end_time,
                purchaseTimestamp: session.start_time,
                expiryDateTime: session.end_time,
                timeUsedMinutes: session.time_used_minutes,
                timeRemainingMinutes: Math.max(0, session.time_remaining_minutes),
                timeAllocatedMinutes,
                dataUsedMB: parseFloat(session.data_used_mb || 0),
                dataRemainingMB: session.data_remaining_mb ? parseFloat(session.data_remaining_mb) : null,
                dataAllocatedMB: session.data_limit_mb,
                status,
                bytesUploaded: parseInt(session.bytes_uploaded || 0),
                bytesDownloaded: parseInt(session.bytes_downloaded || 0),
                totalBytes: parseInt(session.total_bytes || 0)
            };
        } catch (error) {
            logger.error('Failed to get current usage:', error);
            throw error;
        }
    }

    /**
     * Update session usage data
     * Called periodically by background job or on session events
     */
    public async updateSessionUsage(sessionId: string, dataUsedBytes: number): Promise<void> {
        try {
            const dataUsedMB = dataUsedBytes / (1024 * 1024);

            await this.db.query(
                `UPDATE sessions 
                 SET data_used_mb = data_used_mb + $1,
                     total_bytes = total_bytes + $2,
                     last_activity = NOW(),
                     updated_at = NOW()
                 WHERE id = $3`,
                [dataUsedMB, dataUsedBytes, sessionId]
            );

            // Log detailed usage
            await this.db.query(
                `INSERT INTO data_usage_logs (session_id, total_bytes, recorded_at)
                 VALUES ($1, $2, NOW())`,
                [sessionId, dataUsedBytes]
            );

            // Check if data limit exceeded
            await this.checkAndUpdateSessionStatus(sessionId);
        } catch (error) {
            logger.error('Failed to update session usage:', error);
            throw error;
        }
    }

    /**
     * Check and update session status based on usage
     */
    private async checkAndUpdateSessionStatus(sessionId: string): Promise<void> {
        try {
            const result = await this.db.query(
                `SELECT 
                    s.id,
                    s.end_time,
                    s.data_limit_mb,
                    s.data_used_mb,
                    s.session_status,
                    s.active
                 FROM sessions s
                 WHERE s.id = $1`,
                [sessionId]
            );

            if (result.rows.length === 0) {
                return;
            }

            const session = result.rows[0];
            let newStatus = session.session_status;
            let active = session.active;

            // Check if time expired
            if (new Date(session.end_time) <= new Date()) {
                newStatus = 'expired';
                active = false;
            }

            // Check if data exhausted
            if (session.data_limit_mb && session.data_used_mb >= session.data_limit_mb) {
                newStatus = 'exhausted';
                active = false;
            }

            // Update if status changed
            if (newStatus !== session.session_status || active !== session.active) {
                await this.db.query(
                    `UPDATE sessions 
                     SET session_status = $1, active = $2, updated_at = NOW()
                     WHERE id = $3`,
                    [newStatus, active, sessionId]
                );

                logger.info(`Session ${sessionId} status updated to ${newStatus}`);
            }
        } catch (error) {
            logger.error('Failed to check session status:', error);
        }
    }

    /**
     * Calculate session status
     */
    private calculateStatus(
        endTime: Date,
        dataLimitMB: number | null,
        dataUsedMB: number,
        currentStatus: string
    ): 'active' | 'expired' | 'exhausted' | 'suspended' {
        // Check if manually suspended
        if (currentStatus === 'suspended' || currentStatus === 'terminated') {
            return 'suspended';
        }

        // Check if time expired
        if (new Date(endTime) <= new Date()) {
            return 'expired';
        }

        // Check if data exhausted
        if (dataLimitMB && dataUsedMB >= dataLimitMB) {
            return 'exhausted';
        }

        return 'active';
    }

    /**
     * Get total usage statistics for a user
     */
    public async getTotalUsageStats(userId: string): Promise<any> {
        try {
            const result = await this.db.query(
                'SELECT * FROM get_user_total_data_usage($1)',
                [userId]
            );

            if (result.rows.length === 0) {
                return {
                    totalUploaded: 0,
                    totalDownloaded: 0,
                    totalBytes: 0,
                    sessionCount: 0
                };
            }

            const stats = result.rows[0];
            return {
                totalUploaded: parseInt(stats.total_uploaded),
                totalDownloaded: parseInt(stats.total_downloaded),
                totalBytes: parseInt(stats.total_bytes),
                sessionCount: stats.session_count
            };
        } catch (error) {
            logger.error('Failed to get total usage stats:', error);
            throw error;
        }
    }

    /**
     * Get session history for a user
     */
    public async getSessionHistory(userId: string, limit: number = 10): Promise<any[]> {
        try {
            const result = await this.db.query(
                'SELECT * FROM get_user_session_history($1, $2)',
                [userId, limit]
            );

            return result.rows.map((session: any) => ({
                sessionId: session.session_id,
                packageName: session.package_name,
                packageType: session.package_type,
                startTime: session.start_time,
                endTime: session.end_time,
                durationMinutes: session.duration_minutes,
                dataUsedMB: parseFloat(session.data_used_mb || 0),
                amountPaid: parseFloat(session.amount_paid || 0),
                status: session.session_status
            }));
        } catch (error) {
            logger.error('Failed to get session history:', error);
            throw error;
        }
    }

    /**
     * Periodic cleanup job - expire old sessions
     */
    public async expireOldSessions(): Promise<void> {
        try {
            const result = await this.db.query(
                `UPDATE sessions 
                 SET session_status = 'expired', active = false, updated_at = NOW()
                 WHERE end_time <= NOW() 
                 AND active = true
                 RETURNING id`
            );

            if (result.rows.length > 0) {
                logger.info(`Expired ${result.rows.length} sessions`);
            }
        } catch (error) {
            logger.error('Failed to expire old sessions:', error);
        }
    }

    /**
     * Format data size for display
     */
    public formatDataSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Format duration for display
     */
    public formatDuration(minutes: number): string {
        if (minutes < 60) {
            return `${minutes} min`;
        }
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (mins === 0) {
            return `${hours} hr`;
        }
        return `${hours} hr ${mins} min`;
    }
}

export default new UsageCalculationService();
