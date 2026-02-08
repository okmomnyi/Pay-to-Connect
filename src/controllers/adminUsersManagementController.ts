import { Request, Response } from 'express';
import DatabaseConnection from '../database/connection';
import { logger } from '../utils/logger';

const db = DatabaseConnection.getInstance();

export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
    try {
        const { page = 1, limit = 50, search = '' } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        let query = `
            SELECT u.id, u.username, u.email, u.phone, u.first_name, u.last_name,
                   u.active, u.email_verified, u.phone_verified, u.created_at, u.last_login,
                   0 as package_count,
                   0 as active_packages
            FROM users u
        `;

        const params: any[] = [];

        if (search) {
            query += ` WHERE u.username ILIKE $1 OR u.email ILIKE $1 OR u.phone ILIKE $1 OR u.first_name ILIKE $1 OR u.last_name ILIKE $1`;
            params.push(`%${search}%`);
        }

        query += ` ORDER BY u.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(Number(limit), offset);

        const result = await db.query(query, params);

        // Get total count for pagination
        let countQuery = 'SELECT COUNT(*) as total FROM users u';
        const countParams: any[] = [];

        if (search) {
            countQuery += ` WHERE u.username ILIKE $1 OR u.email ILIKE $1 OR u.phone ILIKE $1 OR u.first_name ILIKE $1 OR u.last_name ILIKE $1`;
            countParams.push(`%${search}%`);
        }

        const countResult = await db.query(countQuery, countParams);
        const totalUsers = parseInt(countResult.rows[0]?.total || '0');

        res.json({
            success: true,
            users: result.rows,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total: totalUsers,
                pages: Math.ceil(totalUsers / Number(limit))
            }
        });
    } catch (error) {
        logger.error('Error getting users:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const getUserById = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const result = await db.query(
            `SELECT u.*, 0 as package_count, 0 as active_packages
             FROM users u
             WHERE u.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: 'User not found'
            });
            return;
        }

        // Get user payments
        let payments: any[] = [];
        try {
            const paymentsResult = await db.query(
                `SELECT p.*, pkg.name as package_name
                 FROM payments p
                 LEFT JOIN packages pkg ON p.package_id = pkg.id
                 WHERE p.user_id = $1
                 ORDER BY p.created_at DESC`,
                [id]
            );
            payments = paymentsResult.rows;
        } catch (e) {
            logger.warn('Payments query failed for user');
        }

        const user = result.rows[0];
        user.payments = payments;

        res.json({
            success: true,
            user
        });
    } catch (error) {
        logger.error('Error getting user:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const updateUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { first_name, last_name, phone, active } = req.body;

        const result = await db.query(
            `UPDATE users 
             SET first_name = $1, last_name = $2, phone = $3, active = $4, updated_at = CURRENT_TIMESTAMP
             WHERE id = $5
             RETURNING id, username, email, phone, first_name, last_name, active, created_at, last_login`,
            [first_name, last_name, phone, active, id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: 'User not found'
            });
            return;
        }

        res.json({
            success: true,
            user: result.rows[0],
            message: 'User updated successfully'
        });
    } catch (error) {
        logger.error('Error updating user:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const toggleUserStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const result = await db.query(
            `UPDATE users 
             SET active = NOT active, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING id, username, email, active`,
            [id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: 'User not found'
            });
            return;
        }

        // Try to deactivate sessions if user is deactivated
        if (!result.rows[0].active) {
            try {
                await db.query(
                    'UPDATE sessions SET active = false WHERE user_id = $1 AND active = true',
                    [id]
                );
            } catch (e) {
                logger.warn('Sessions table not found, skipping session deactivation');
            }
        }

        res.json({
            success: true,
            user: result.rows[0],
            message: `User ${result.rows[0].active ? 'activated' : 'deactivated'} successfully`
        });
    } catch (error) {
        logger.error('Error toggling user status:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const getUserSessions = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 20 } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        let sessions: any[] = [];
        let total = 0;

        try {
            const result = await db.query(
                `SELECT s.*, pkg.name as package_name
                 FROM sessions s
                 LEFT JOIN packages pkg ON s.package_id = pkg.id
                 WHERE s.user_id = $1
                 ORDER BY s.created_at DESC
                 LIMIT $2 OFFSET $3`,
                [id, Number(limit), offset]
            );
            sessions = result.rows;

            const countResult = await db.query(
                'SELECT COUNT(*) as total FROM sessions WHERE user_id = $1',
                [id]
            );
            total = parseInt(countResult.rows[0]?.total || '0');
        } catch (e) {
            logger.warn('Sessions table not found');
        }

        res.json({
            success: true,
            sessions,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                pages: Math.ceil(total / Number(limit))
            }
        });
    } catch (error) {
        logger.error('Error getting user sessions:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};
