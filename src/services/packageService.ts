import pool from '../database/db';
import { logger } from '../utils/logger';

interface Package {
    id: string;
    name: string;
    duration_minutes: number;
    price_kes: number;
    data_limit_mb: number;
    speed_limit_mbps: number;
    description: string;
    active: boolean;
}

export class PackageService {
    async getAllPackages(): Promise<Package[]> {
        const result = await pool.query(
            `SELECT id, name, duration_minutes, price_kes, data_limit_mb, 
                    speed_limit_mbps, description, active
             FROM packages 
             WHERE active = true 
             ORDER BY price_kes ASC`
        );

        return result.rows;
    }

    async getPackageById(packageId: string): Promise<Package> {
        const result = await pool.query(
            `SELECT id, name, duration_minutes, price_kes, data_limit_mb, 
                    speed_limit_mbps, description, active
             FROM packages 
             WHERE id = $1 AND active = true`,
            [packageId]
        );

        if (result.rows.length === 0) {
            throw new Error('Package not found');
        }

        return result.rows[0];
    }

    async createPackage(data: Omit<Package, 'id' | 'active'>): Promise<Package> {
        const { name, duration_minutes, price_kes, data_limit_mb, speed_limit_mbps, description } = data;

        const result = await pool.query(
            `INSERT INTO packages (name, duration_minutes, price_kes, data_limit_mb, speed_limit_mbps, description)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, name, duration_minutes, price_kes, data_limit_mb, speed_limit_mbps, description, active`,
            [name, duration_minutes, price_kes, data_limit_mb, speed_limit_mbps, description]
        );

        logger.info(`Package created: ${name}`);

        return result.rows[0];
    }

    async updatePackage(packageId: string, data: Partial<Package>): Promise<Package> {
        const fields: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        Object.entries(data).forEach(([key, value]) => {
            if (value !== undefined && key !== 'id') {
                fields.push(`${key} = $${paramIndex}`);
                values.push(value);
                paramIndex++;
            }
        });

        if (fields.length === 0) {
            throw new Error('No fields to update');
        }

        values.push(packageId);

        const result = await pool.query(
            `UPDATE packages 
             SET ${fields.join(', ')}
             WHERE id = $${paramIndex}
             RETURNING id, name, duration_minutes, price_kes, data_limit_mb, speed_limit_mbps, description, active`,
            values
        );

        if (result.rows.length === 0) {
            throw new Error('Package not found');
        }

        logger.info(`Package updated: ${packageId}`);

        return result.rows[0];
    }

    async deactivatePackage(packageId: string): Promise<void> {
        await pool.query(
            'UPDATE packages SET active = false WHERE id = $1',
            [packageId]
        );

        logger.info(`Package deactivated: ${packageId}`);
    }
}

export default new PackageService();
