import { Request, Response } from 'express';
import DatabaseConnection from '../database/connection';
import { logger } from '../utils/logger';

const db = DatabaseConnection.getInstance();

export const getAllEstates = async (req: Request, res: Response): Promise<void> => {
    try {
        const { page = 1, limit = 50, search = '' } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        let estates: any[] = [];
        let totalEstates = 0;

        try {
            let query = `
                SELECT e.*, 
                       0 as router_count,
                       0 as user_count
                FROM estates e
            `;

            const params: any[] = [];

            if (search) {
                query += ` WHERE e.name ILIKE $1 OR e.location ILIKE $1 OR e.description ILIKE $1`;
                params.push(`%${search}%`);
            }

            query += ` ORDER BY e.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
            params.push(Number(limit), offset);

            const result = await db.query(query, params);
            estates = result.rows;

            // Get total count for pagination
            let countQuery = 'SELECT COUNT(*) as total FROM estates e';
            const countParams: any[] = [];

            if (search) {
                countQuery += ` WHERE e.name ILIKE $1 OR e.location ILIKE $1 OR e.description ILIKE $1`;
                countParams.push(`%${search}%`);
            }

            const countResult = await db.query(countQuery, countParams);
            totalEstates = parseInt(countResult.rows[0]?.total || '0');
        } catch (tableError) {
            logger.warn('Estates table not found or query failed');
            // Return empty array if table doesn't exist
        }

        res.json({
            success: true,
            estates,
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
            `SELECT * FROM estates WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: 'Estate not found'
            });
            return;
        }

        const estate = result.rows[0];
        estate.routers = [];
        estate.recent_users = [];

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

        res.json({
            success: true,
            stats: {
                total_routers: 0,
                active_routers: 0,
                total_users: 0,
                active_users: 0,
                total_sessions: 0,
                active_sessions: 0,
                total_revenue: 0,
                daily_sessions: []
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
