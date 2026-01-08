import { Request, Response } from 'express';
import packageService from '../services/packageService';
import { logger } from '../utils/logger';

export class PackageController {
    async getAllPackages(req: Request, res: Response): Promise<void> {
        try {
            const packages = await packageService.getAllPackages();

            res.status(200).json({
                success: true,
                packages,
            });
        } catch (error: any) {
            logger.error('Get packages error:', error);
            res.status(500).json({ error: 'Failed to get packages' });
        }
    }

    async getPackageById(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;

            const pkg = await packageService.getPackageById(id);

            res.status(200).json({
                success: true,
                package: pkg,
            });
        } catch (error: any) {
            logger.error('Get package error:', error);
            res.status(404).json({ error: error.message || 'Package not found' });
        }
    }
}

export default new PackageController();
