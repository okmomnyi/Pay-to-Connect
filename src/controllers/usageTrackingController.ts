import { Response } from 'express';
import DatabaseConnection from '../database/connection';
import { logger } from '../utils/logger';

interface AuthRequest extends Request {
    user?: {
        userId: string;
        username: string;
    };
}

class UsageTrackingController {
    private db: DatabaseConnection;

    constructor() {
        this.db = DatabaseConnection.getInstance();
    }

    // Get active session stats
    public getActiveSessionStats = async (req: any, res: Response): Promise<void> => {
        try {
            const userId = req.user.userId;

            const result = await this.db.query(
                'SELECT * FROM get_user_active_session_stats($1)',
                [userId]
            );

            if (result.rows.length === 0) {
                res.json({
                    success: true,
                    activeSession: null,
                    message: 'No active session'
                });
                return;
            }

            const session = result.rows[0];

            // Format the response
            const activeSession = {
                sessionId: session.session_id,
                packageName: session.package_name,
                startTime: session.start_time,
                endTime: session.end_time,
                timeUsed: {
                    minutes: session.time_used_minutes,
                    formatted: this.formatDuration(session.time_used_minutes)
                },
                timeRemaining: {
                    minutes: session.time_remaining_minutes,
                    formatted: this.formatDuration(session.time_remaining_minutes)
                },
                dataUsed: {
                    mb: parseFloat(session.data_used_mb || 0),
                    formatted: this.formatDataSize(session.total_bytes || 0)
                },
                dataLimit: session.data_limit_mb ? {
                    mb: session.data_limit_mb,
                    formatted: this.formatDataSize(session.data_limit_mb * 1024 * 1024)
                } : null,
                dataRemaining: session.data_remaining_mb ? {
                    mb: parseFloat(session.data_remaining_mb),
                    formatted: this.formatDataSize(session.data_remaining_mb * 1024 * 1024)
                } : null,
                bandwidth: {
                    uploaded: {
                        bytes: session.bytes_uploaded || 0,
                        formatted: this.formatDataSize(session.bytes_uploaded || 0)
                    },
                    downloaded: {
                        bytes: session.bytes_downloaded || 0,
                        formatted: this.formatDataSize(session.bytes_downloaded || 0)
                    },
                    total: {
                        bytes: session.total_bytes || 0,
                        formatted: this.formatDataSize(session.total_bytes || 0)
                    }
                }
            };

            res.json({
                success: true,
                activeSession
            });
        } catch (error) {
            logger.error('Failed to get active session stats:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    // Get total usage statistics
    public getTotalUsageStats = async (req: any, res: Response): Promise<void> => {
        try {
            const userId = req.user.userId;

            const result = await this.db.query(
                'SELECT * FROM get_user_total_data_usage($1)',
                [userId]
            );

            if (result.rows.length === 0) {
                res.json({
                    success: true,
                    totalUsage: {
                        uploaded: { bytes: 0, formatted: '0 B' },
                        downloaded: { bytes: 0, formatted: '0 B' },
                        total: { bytes: 0, formatted: '0 B' },
                        sessionCount: 0
                    }
                });
                return;
            }

            const usage = result.rows[0];

            res.json({
                success: true,
                totalUsage: {
                    uploaded: {
                        bytes: parseInt(usage.total_uploaded),
                        formatted: this.formatDataSize(parseInt(usage.total_uploaded))
                    },
                    downloaded: {
                        bytes: parseInt(usage.total_downloaded),
                        formatted: this.formatDataSize(parseInt(usage.total_downloaded))
                    },
                    total: {
                        bytes: parseInt(usage.total_bytes),
                        formatted: this.formatDataSize(parseInt(usage.total_bytes))
                    },
                    sessionCount: usage.session_count
                }
            });
        } catch (error) {
            logger.error('Failed to get total usage stats:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    // Get session history
    public getSessionHistory = async (req: any, res: Response): Promise<void> => {
        try {
            const userId = req.user.userId;
            const limit = parseInt(req.query.limit as string) || 10;

            const result = await this.db.query(
                'SELECT * FROM get_user_session_history($1, $2)',
                [userId, limit]
            );

            const history = result.rows.map((session: any) => ({
                sessionId: session.session_id,
                packageName: session.package_name,
                startTime: session.start_time,
                endTime: session.end_time,
                duration: {
                    minutes: session.duration_minutes,
                    formatted: this.formatDuration(session.duration_minutes)
                },
                dataUsed: {
                    mb: parseFloat(session.data_used_mb || 0),
                    formatted: this.formatDataSize((session.data_used_mb || 0) * 1024 * 1024)
                },
                amountPaid: parseFloat(session.amount_paid || 0),
                status: session.session_status
            }));

            res.json({
                success: true,
                history
            });
        } catch (error) {
            logger.error('Failed to get session history:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    // Get usage summary (combines active and total stats)
    public getUsageSummary = async (req: any, res: Response): Promise<void> => {
        try {
            const userId = req.user.userId;

            // Get active session
            const activeResult = await this.db.query(
                'SELECT * FROM get_user_active_session_stats($1)',
                [userId]
            );

            // Get total usage
            const totalResult = await this.db.query(
                'SELECT * FROM get_user_total_data_usage($1)',
                [userId]
            );

            // Get recent history
            const historyResult = await this.db.query(
                'SELECT * FROM get_user_session_history($1, $2)',
                [userId, 5]
            );

            let activeSession = null;
            if (activeResult.rows.length > 0) {
                const session = activeResult.rows[0];
                activeSession = {
                    sessionId: session.session_id,
                    packageName: session.package_name,
                    timeUsed: session.time_used_minutes,
                    timeRemaining: session.time_remaining_minutes,
                    dataUsedMB: parseFloat(session.data_used_mb || 0),
                    dataLimitMB: session.data_limit_mb,
                    dataRemainingMB: session.data_remaining_mb ? parseFloat(session.data_remaining_mb) : null
                };
            }

            const totalUsage = totalResult.rows.length > 0 ? {
                totalUploadedBytes: parseInt(totalResult.rows[0].total_uploaded),
                totalDownloadedBytes: parseInt(totalResult.rows[0].total_downloaded),
                totalBytes: parseInt(totalResult.rows[0].total_bytes),
                sessionCount: totalResult.rows[0].session_count
            } : {
                totalUploadedBytes: 0,
                totalDownloadedBytes: 0,
                totalBytes: 0,
                sessionCount: 0
            };

            const recentHistory = historyResult.rows.map((session: any) => ({
                packageName: session.package_name,
                startTime: session.start_time,
                durationMinutes: session.duration_minutes,
                dataUsedMB: parseFloat(session.data_used_mb || 0),
                amountPaid: parseFloat(session.amount_paid || 0)
            }));

            res.json({
                success: true,
                summary: {
                    activeSession,
                    totalUsage,
                    recentHistory
                }
            });
        } catch (error) {
            logger.error('Failed to get usage summary:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    // Helper function to format duration
    private formatDuration(minutes: number): string {
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

    // Helper function to format data size
    private formatDataSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

export default UsageTrackingController;
