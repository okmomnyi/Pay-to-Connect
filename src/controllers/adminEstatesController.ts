import { Request, Response } from 'express';
import DatabaseConnection from '../database/connection';
import { logger } from '../utils/logger';

const db = DatabaseConnection.getInstance();

export const getAllEstates = async (req: Request, res: Response): Promise<void> => {
    try {
        const { page = 1, limit = 50, search = '' } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        let query = `
            SELECT e.*, 
                   COUNT(r.id) as router_count,
                   COUNT(u.id) as user_count
            FROM estates e
            LEFT JOIN routers r ON e.id = r.estate_id
            LEFT JOIN users u ON e.id = u.estate_id
        `;

        const params: any[] = [];

        if (search) {
            query += ` WHERE e.name ILIKE $1 OR e.location ILIKE $1 OR e.description ILIKE $1`;
            params.push(`%${search}%`);
        }

        query += ` GROUP BY e.id ORDER BY e.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(Number(limit), offset);

        const result = await db.query(query, params);

        // Get total count for pagination
        let countQuery = 'SELECT COUNT(*) as total FROM estates e';
        const countParams: any[] = [];
        
        if (search) {
            countQuery += ` WHERE e.name ILIKE $1 OR e.location ILIKE $1 OR e.description ILIKE $1`;
            countParams.push(`%${search}%`);
        }

        const countResult = await db.query(countQuery, countParams);
        const totalEstates = parseInt(countResult.rows[0].total);

        res.json({
            success: true,
            estates: result.rows,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total: totalEstates,
                pages: Math.ceil(totalEstates / Number(limit))
            }
        });
    } catch (error) {
        logger.error('Error getting estates:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const getEstateById = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        
        const result = await db.query(
            `SELECT e.*, 
                   COUNT(r.id) as router_count,
                   COUNT(u.id) as user_count
             FROM estates e
             LEFT JOIN routers r ON e.id = r.estate_id
             LEFT JOIN users u ON e.id = u.estate_id
             WHERE e.id = $1
             GROUP BY e.id`,
            [id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: 'Estate not found'
            });
            return;
        }

        // Get routers in this estate
        const routersResult = await db.query(
            `SELECT r.*, 
                   COUNT(us.id) as active_sessions
             FROM routers r
             LEFT JOIN user_sessions us ON r.id = us.router_id AND us.status = 'active'
             WHERE r.estate_id = $1
             GROUP BY r.id
             ORDER BY r.name`,
            [id]
        );

        // Get users in this estate
        const usersResult = await db.query(
            `SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.active, u.created_at
             FROM users u
             WHERE u.estate_id = $1
             ORDER BY u.created_at DESC
             LIMIT 10`,
            [id]
        );

        const estate = result.rows[0];
        estate.routers = routersResult.rows;
        estate.recent_users = usersResult.rows;

        res.json({
            success: true,
            estate
        });
    } catch (error) {
        logger.error('Error getting estate:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const createEstate = async (req: Request, res: Response): Promise<void> => {
    try {
        const {
            name,
            location,
            description,
            contact_person,
            contact_phone,
            contact_email,
            status = 'active'
        } = req.body;

        if (!name || !location) {
            res.status(400).json({
                success: false,
                error: 'Name and location are required'
            });
            return;
        }

        const result = await db.query(
            `INSERT INTO estates (name, location, description, contact_person, contact_phone, contact_email, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [name, location, description, contact_person, contact_phone, contact_email, status]
        );

        res.status(201).json({
            success: true,
            estate: result.rows[0],
            message: 'Estate created successfully'
        });
    } catch (error) {
        logger.error('Error creating estate:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const updateEstate = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const {
            name,
            location,
            description,
            contact_person,
            contact_phone,
            contact_email,
            status
        } = req.body;

        const result = await db.query(
            `UPDATE estates 
             SET name = $1, location = $2, description = $3, contact_person = $4, 
                 contact_phone = $5, contact_email = $6, status = $7, updated_at = CURRENT_TIMESTAMP
             WHERE id = $8
             RETURNING *`,
            [name, location, description, contact_person, contact_phone, contact_email, status, id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: 'Estate not found'
            });
            return;
        }

        res.json({
            success: true,
            estate: result.rows[0],
            message: 'Estate updated successfully'
        });
    } catch (error) {
        logger.error('Error updating estate:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const deleteEstate = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        // Check if estate has routers
        const routerResult = await db.query(
            'SELECT COUNT(*) as count FROM routers WHERE estate_id = $1',
            [id]
        );

        if (parseInt(routerResult.rows[0].count) > 0) {
            res.status(400).json({
                success: false,
                error: 'Cannot delete estate that has routers. Please remove or reassign routers first.'
            });
            return;
        }

        // Check if estate has users
        const userResult = await db.query(
            'SELECT COUNT(*) as count FROM users WHERE estate_id = $1',
            [id]
        );

        if (parseInt(userResult.rows[0].count) > 0) {
            res.status(400).json({
                success: false,
                error: 'Cannot delete estate that has users. Please reassign users first.'
            });
            return;
        }

        const result = await db.query(
            'DELETE FROM estates WHERE id = $1 RETURNING *',
            [id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: 'Estate not found'
            });
            return;
        }

        res.json({
            success: true,
            message: 'Estate deleted successfully'
        });
    } catch (error) {
        logger.error('Error deleting estate:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const toggleEstateStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const result = await db.query(
            `UPDATE estates 
             SET status = CASE WHEN status = 'active' THEN 'inactive' ELSE 'active' END,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING *`,
            [id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: 'Estate not found'
            });
            return;
        }

        // If deactivating estate, also deactivate all routers in it
        if (result.rows[0].status === 'inactive') {
            await db.query(
                'UPDATE routers SET status = $1 WHERE estate_id = $2',
                ['inactive', id]
            );
        }

        res.json({
            success: true,
            estate: result.rows[0],
            message: `Estate ${result.rows[0].status} successfully`
        });
    } catch (error) {
        logger.error('Error toggling estate status:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const getEstateStats = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        // Get estate statistics
        const stats = await db.query(`
            SELECT 
                COUNT(DISTINCT r.id) as total_routers,
                COUNT(DISTINCT CASE WHEN r.status = 'active' THEN r.id END) as active_routers,
                COUNT(DISTINCT u.id) as total_users,
                COUNT(DISTINCT CASE WHEN u.active = true THEN u.id END) as active_users,
                COUNT(DISTINCT us.id) as total_sessions,
                COUNT(DISTINCT CASE WHEN us.status = 'active' AND us.expires_at > CURRENT_TIMESTAMP THEN us.id END) as active_sessions,
                COALESCE(SUM(p.amount), 0) as total_revenue
            FROM estates e
            LEFT JOIN routers r ON e.id = r.estate_id
            LEFT JOIN users u ON e.id = u.estate_id
            LEFT JOIN user_sessions us ON u.id = us.user_id
            LEFT JOIN payments p ON u.id = p.user_id AND p.status = 'completed'
            WHERE e.id = $1
        `, [id]);

        // Get daily session count for the last 7 days
        const dailySessions = await db.query(`
            SELECT 
                DATE(us.created_at) as date,
                COUNT(*) as session_count
            FROM user_sessions us
            JOIN users u ON us.user_id = u.id
            WHERE u.estate_id = $1
            AND us.created_at >= CURRENT_DATE - INTERVAL '7 days'
            GROUP BY DATE(us.created_at)
            ORDER BY date DESC
        `, [id]);

        res.json({
            success: true,
            stats: {
                ...stats.rows[0],
                daily_sessions: dailySessions.rows
            }
        });
    } catch (error) {
        logger.error('Error getting estate stats:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};
