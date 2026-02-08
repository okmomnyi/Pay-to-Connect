import { Request, Response } from 'express';
import DatabaseConnection from '../database/connection';
import { logger } from '../utils/logger';

const db = DatabaseConnection.getInstance();

export const getAllSessions = async (req: Request, res: Response): Promise<void> => {
    try {
        const { page = 1, limit = 50, status = 'all' } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        let sessions: any[] = [];
        let totalSessions = 0;

        try {
            let query = `
                SELECT s.*, 
                       u.username, u.email, u.first_name, u.last_name,
                       pkg.name as package_name
                FROM sessions s
                LEFT JOIN users u ON s.user_id = u.id
                LEFT JOIN packages pkg ON s.package_id = pkg.id
            `;

            const params: any[] = [];

            if (status === 'active') {
                query += ` WHERE s.active = true AND s.end_time > CURRENT_TIMESTAMP`;
            } else if (status === 'expired') {
                query += ` WHERE s.active = false OR s.end_time <= CURRENT_TIMESTAMP`;
            }

            query += ` ORDER BY s.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
            params.push(Number(limit), offset);

            const result = await db.query(query, params);
            sessions = result.rows;

            // Get total count for pagination
            let countQuery = 'SELECT COUNT(*) as total FROM sessions s';
            const countParams: any[] = [];

            if (status === 'active') {
                countQuery += ` WHERE s.active = true AND s.end_time > CURRENT_TIMESTAMP`;
            } else if (status === 'expired') {
                countQuery += ` WHERE s.active = false OR s.end_time <= CURRENT_TIMESTAMP`;
            }

            const countResult = await db.query(countQuery, countParams);
            totalSessions = parseInt(countResult.rows[0]?.total || '0');
        } catch (tableError) {
            logger.warn('Sessions table not found or query failed');
            // Return empty array if table doesn't exist
        }

        res.json({
            success: true,
            sessions,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total: totalSessions,
                pages: Math.ceil(totalSessions / Number(limit))
            }
        });
    } catch (error) {
        logger.error('Error getting sessions:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const getSessionById = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const result = await db.query(
            `SELECT s.*, 
                   u.username, u.email, u.first_name, u.last_name,
                   pkg.name as package_name
             FROM sessions s
             LEFT JOIN users u ON s.user_id = u.id
             LEFT JOIN packages pkg ON s.package_id = pkg.id
             WHERE s.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: 'Session not found'
            });
            return;
        }

        res.json({
            success: true,
            session: result.rows[0]
        });
    } catch (error) {
        logger.error('Error getting session:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const disconnectSession = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        // Update session status
        await db.query(
            `UPDATE sessions 
             SET active = false, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [id]
        );

        res.json({
            success: true,
            message: 'Session disconnected successfully'
        });
    } catch (error) {
        logger.error('Error disconnecting session:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const getActiveSessions = async (req: Request, res: Response): Promise<void> => {
    try {
        let sessions: any[] = [];

        try {
            const result = await db.query(
                `SELECT s.*, 
                       u.username, u.email,
                       pkg.name as package_name
                 FROM sessions s
                 LEFT JOIN users u ON s.user_id = u.id
                 LEFT JOIN packages pkg ON s.package_id = pkg.id
                 WHERE s.active = true 
                 AND s.end_time > CURRENT_TIMESTAMP
                 ORDER BY s.created_at DESC`
            );
            sessions = result.rows;
        } catch (tableError) {
            logger.warn('Sessions table not found');
        }

        res.json({
            success: true,
            sessions,
            count: sessions.length
        });
    } catch (error) {
        logger.error('Error getting active sessions:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const getSessionStats = async (req: Request, res: Response): Promise<void> => {
    try {
        let statsData = {
            total_sessions: 0,
            active_sessions: 0,
            expired_sessions: 0,
            sessions_today: 0,
            sessions_this_week: 0
        };

        try {
            const stats = await db.query(`
                SELECT 
                    COUNT(*) as total_sessions,
                    COUNT(CASE WHEN active = true AND end_time > CURRENT_TIMESTAMP THEN 1 END) as active_sessions,
                    COUNT(CASE WHEN active = false OR end_time <= CURRENT_TIMESTAMP THEN 1 END) as expired_sessions,
                    COUNT(CASE WHEN created_at >= CURRENT_DATE THEN 1 END) as sessions_today,
                    COUNT(CASE WHEN created_at >= DATE_TRUNC('week', CURRENT_DATE) THEN 1 END) as sessions_this_week
                FROM sessions
            `);
            statsData = stats.rows[0] || statsData;
        } catch (tableError) {
            logger.warn('Sessions table not found for stats');
        }

        res.json({
            success: true,
            stats: statsData
        });
    } catch (error) {
        logger.error('Error getting session stats:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};
