import { Request, Response } from 'express';
import DatabaseConnection from '../database/connection';
import { logger } from '../utils/logger';

const db = DatabaseConnection.getInstance();

export const getAllPackages = async (req: Request, res: Response): Promise<void> => {
    try {
        // Simple query - just get all packages without complex joins
        const result = await db.query(
            `SELECT *, 0 as purchase_count FROM packages ORDER BY created_at DESC`
        );

        res.json({
            success: true,
            packages: result.rows
        });
    } catch (error) {
        logger.error('Error getting packages:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const getPackageById = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const result = await db.query(
            'SELECT * FROM packages WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: 'Package not found'
            });
            return;
        }

        res.json({
            success: true,
            package: result.rows[0]
        });
    } catch (error) {
        logger.error('Error getting package:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const createPackage = async (req: Request, res: Response): Promise<void> => {
    try {
        const {
            name,
            description,
            price_kes,
            duration_minutes,
            data_limit_mb,
            speed_limit_mbps
        } = req.body;

        if (!name || !price_kes || !duration_minutes) {
            res.status(400).json({
                success: false,
                error: 'Name, price, and duration are required'
            });
            return;
        }

        const result = await db.query(
            `INSERT INTO packages (name, description, price_kes, duration_minutes, data_limit_mb, speed_limit_mbps, active)
             VALUES ($1, $2, $3, $4, $5, $6, true)
             RETURNING *`,
            [name, description, price_kes, duration_minutes, data_limit_mb || null, speed_limit_mbps || null]
        );

        res.status(201).json({
            success: true,
            package: result.rows[0],
            message: 'Package created successfully'
        });
    } catch (error) {
        logger.error('Error creating package:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const updatePackage = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const {
            name,
            description,
            price_kes,
            duration_minutes,
            data_limit_mb,
            speed_limit_mbps
        } = req.body;

        const result = await db.query(
            `UPDATE packages 
             SET name = COALESCE($1, name),
                 description = COALESCE($2, description),
                 price_kes = COALESCE($3, price_kes),
                 duration_minutes = COALESCE($4, duration_minutes),
                 data_limit_mb = COALESCE($5, data_limit_mb),
                 speed_limit_mbps = COALESCE($6, speed_limit_mbps),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $7
             RETURNING *`,
            [name, description, price_kes, duration_minutes, data_limit_mb, speed_limit_mbps, id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: 'Package not found'
            });
            return;
        }

        res.json({
            success: true,
            package: result.rows[0],
            message: 'Package updated successfully'
        });
    } catch (error) {
        logger.error('Error updating package:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const deletePackage = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const result = await db.query(
            'DELETE FROM packages WHERE id = $1 RETURNING *',
            [id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: 'Package not found'
            });
            return;
        }

        res.json({
            success: true,
            message: 'Package deleted successfully'
        });
    } catch (error) {
        logger.error('Error deleting package:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const togglePackageStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const result = await db.query(
            `UPDATE packages 
             SET active = NOT active, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING *`,
            [id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: 'Package not found'
            });
            return;
        }

        res.json({
            success: true,
            package: result.rows[0],
            message: `Package ${result.rows[0].active ? 'activated' : 'deactivated'} successfully`
        });
    } catch (error) {
        logger.error('Error toggling package status:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};
