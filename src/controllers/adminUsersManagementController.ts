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
                   COUNT(up.id) as package_count,
                   COUNT(CASE WHEN up.status = 'active' AND up.expires_at > CURRENT_TIMESTAMP THEN 1 END) as active_packages
            FROM users u
            LEFT JOIN user_packages up ON u.id = up.user_id
        `;

        const params: any[] = [];

        if (search) {
            query += ` WHERE u.username ILIKE $1 OR u.email ILIKE $1 OR u.phone ILIKE $1 OR u.first_name ILIKE $1 OR u.last_name ILIKE $1`;
            params.push(`%${search}%`);
        }

        query += ` GROUP BY u.id ORDER BY u.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
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
        const totalUsers = parseInt(countResult.rows[0].total);

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
            `SELECT u.*, 
                    COUNT(up.id) as package_count,
                    COUNT(CASE WHEN up.status = 'active' AND up.expires_at > CURRENT_TIMESTAMP THEN 1 END) as active_packages
             FROM users u
             LEFT JOIN user_packages up ON u.id = up.user_id
             WHERE u.id = $1
             GROUP BY u.id`,
            [id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: 'User not found'
            });
            return;
        }

        // Get user packages
        const packagesResult = await db.query(
            `SELECT up.*, p.name as package_name, p.package_type
             FROM user_packages up
             JOIN packages p ON up.package_id = p.id
             WHERE up.user_id = $1
             ORDER BY up.created_at DESC`,
            [id]
        );

        const user = result.rows[0];
        user.packages = packagesResult.rows;

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

        // Deactivate all user sessions if deactivating user
        if (!result.rows[0].active) {
            await db.query(
                'UPDATE user_sessions SET status = $1 WHERE user_id = $2 AND status = $3',
                ['deactivated', id, 'active']
            );
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

        const result = await db.query(
            `SELECT us.*, p.name as package_name, p.package_type
             FROM user_sessions us
             LEFT JOIN user_packages up ON us.user_package_id = up.id
             LEFT JOIN packages p ON up.package_id = p.id
             WHERE us.user_id = $1
             ORDER BY us.created_at DESC
             LIMIT $2 OFFSET $3`,
            [id, Number(limit), offset]
        );

        const countResult = await db.query(
            'SELECT COUNT(*) as total FROM user_sessions WHERE user_id = $1',
            [id]
        );

        res.json({
            success: true,
            sessions: result.rows,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total: parseInt(countResult.rows[0].total),
                pages: Math.ceil(parseInt(countResult.rows[0].total) / Number(limit))
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
