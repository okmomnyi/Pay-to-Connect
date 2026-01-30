import { Request, Response } from 'express';
import DatabaseConnection from '../database/connection';
import { logger } from '../utils/logger';

const db = DatabaseConnection.getInstance();

export const getAllPackages = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await db.query(
            `SELECT p.*, 
                    COUNT(pkg.id) as purchase_count
             FROM packages p
             LEFT JOIN user_packages pkg ON p.id = pkg.package_id
             GROUP BY p.id
             ORDER BY p.created_at DESC`
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
            price,
            duration_hours,
            data_limit_mb,
            package_type,
            status = 'active'
        } = req.body;

        if (!name || !price || !package_type) {
            res.status(400).json({
                success: false,
                error: 'Name, price, and package type are required'
            });
            return;
        }

        const result = await db.query(
            `INSERT INTO packages (name, description, price, duration_hours, data_limit_mb, package_type, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [name, description, price, duration_hours, data_limit_mb, package_type, status]
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
            price,
            duration_hours,
            data_limit_mb,
            package_type,
            status
        } = req.body;

        const result = await db.query(
            `UPDATE packages 
             SET name = $1, description = $2, price = $3, duration_hours = $4, 
                 data_limit_mb = $5, package_type = $6, status = $7, updated_at = CURRENT_TIMESTAMP
             WHERE id = $8
             RETURNING *`,
            [name, description, price, duration_hours, data_limit_mb, package_type, status, id]
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

        // Check if package is in use
        const usageResult = await db.query(
            'SELECT COUNT(*) as count FROM user_packages WHERE package_id = $1',
            [id]
        );

        if (parseInt(usageResult.rows[0].count) > 0) {
            res.status(400).json({
                success: false,
                error: 'Cannot delete package that is in use'
            });
            return;
        }

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
             SET status = CASE WHEN status = 'active' THEN 'inactive' ELSE 'active' END,
                 updated_at = CURRENT_TIMESTAMP
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
            message: `Package ${result.rows[0].status} successfully`
        });
    } catch (error) {
        logger.error('Error toggling package status:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};
