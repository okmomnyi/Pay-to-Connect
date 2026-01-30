import { Request, Response } from 'express';
import DatabaseConnection from '../database/connection';
import { logger } from '../utils/logger';

const db = DatabaseConnection.getInstance();

export const getAllSessions = async (req: Request, res: Response): Promise<void> => {
    try {
        const { page = 1, limit = 50, status = 'all' } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        let query = `
            SELECT us.*, 
                   u.username, u.email, u.first_name, u.last_name,
                   p.name as package_name, p.package_type,
                   r.name as router_name
            FROM user_sessions us
            JOIN users u ON us.user_id = u.id
            LEFT JOIN user_packages up ON us.user_package_id = up.id
            LEFT JOIN packages p ON up.package_id = p.id
            LEFT JOIN routers r ON us.router_id = r.id
        `;

        const params: any[] = [];

        if (status !== 'all') {
            query += ` WHERE us.status = $1`;
            params.push(status);
        }

        query += ` ORDER BY us.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(Number(limit), offset);

        const result = await db.query(query, params);

        // Get total count for pagination
        let countQuery = 'SELECT COUNT(*) as total FROM user_sessions us';
        const countParams: any[] = [];
        
        if (status !== 'all') {
            countQuery += ` WHERE us.status = $1`;
            countParams.push(status);
        }

        const countResult = await db.query(countQuery, countParams);
        const totalSessions = parseInt(countResult.rows[0].total);

        res.json({
            success: true,
            sessions: result.rows,
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
            `SELECT us.*, 
                   u.username, u.email, u.first_name, u.last_name,
                   p.name as package_name, p.package_type,
                   r.name as router_name, r.ip_address as router_ip
             FROM user_sessions us
             JOIN users u ON us.user_id = u.id
             LEFT JOIN user_packages up ON us.user_package_id = up.id
             LEFT JOIN packages p ON up.package_id = p.id
             LEFT JOIN routers r ON us.router_id = r.id
             WHERE us.id = $1`,
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

        // Get session details
        const sessionResult = await db.query(
            'SELECT * FROM user_sessions WHERE id = $1',
            [id]
        );

        if (sessionResult.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: 'Session not found'
            });
            return;
        }

        const session = sessionResult.rows[0];

        // Update session status
        await db.query(
            `UPDATE user_sessions 
             SET status = 'disconnected', disconnected_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [id]
        );

        // TODO: Send disconnect command to router via MikroTik API
        // This would involve calling the router service to disconnect the user

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
        const result = await db.query(
            `SELECT us.*, 
                   u.username, u.email,
                   p.name as package_name,
                   r.name as router_name
             FROM user_sessions us
             JOIN users u ON us.user_id = u.id
             LEFT JOIN user_packages up ON us.user_package_id = up.id
             LEFT JOIN packages p ON up.package_id = p.id
             LEFT JOIN routers r ON us.router_id = r.id
             WHERE us.status = 'active' 
             AND us.expires_at > CURRENT_TIMESTAMP
             ORDER BY us.created_at DESC`
        );

        res.json({
            success: true,
            sessions: result.rows,
            count: result.rows.length
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
        // Get session statistics
        const stats = await db.query(`
            SELECT 
                COUNT(*) as total_sessions,
                COUNT(CASE WHEN status = 'active' AND expires_at > CURRENT_TIMESTAMP THEN 1 END) as active_sessions,
                COUNT(CASE WHEN status = 'expired' THEN 1 END) as expired_sessions,
                COUNT(CASE WHEN status = 'disconnected' THEN 1 END) as disconnected_sessions,
                COUNT(CASE WHEN created_at >= CURRENT_DATE THEN 1 END) as sessions_today,
                COUNT(CASE WHEN created_at >= DATE_TRUNC('week', CURRENT_DATE) THEN 1 END) as sessions_this_week
            FROM user_sessions
        `);

        // Get peak concurrent sessions
        const peakResult = await db.query(`
            SELECT COUNT(*) as peak_concurrent
            FROM (
                SELECT created_at
                FROM user_sessions
                WHERE status = 'active'
                AND created_at >= CURRENT_DATE
                GROUP BY DATE_TRUNC('hour', created_at)
                ORDER BY COUNT(*) DESC
                LIMIT 1
            ) t
        `);

        res.json({
            success: true,
            stats: {
                ...stats.rows[0],
                peak_concurrent_today: parseInt(peakResult.rows[0]?.peak_concurrent || '0')
            }
        });
    } catch (error) {
        logger.error('Error getting session stats:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};
