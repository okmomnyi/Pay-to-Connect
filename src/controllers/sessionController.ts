import { Request, Response } from 'express';
import sessionService from '../services/sessionService';
import { logger } from '../utils/logger';

export class SessionController {
    async getActiveSession(req: Request, res: Response): Promise<void> {
        try {
            const userId = (req as any).user.id;

            const session = await sessionService.getUserActiveSession(userId);

            if (!session) {
                res.status(200).json({
                    success: true,
                    hasActiveSession: false,
                    session: null,
                });
                return;
            }

            res.status(200).json({
                success: true,
                hasActiveSession: true,
                session,
            });
        } catch (error: any) {
            logger.error('Get active session error:', error);
            res.status(500).json({ error: 'Failed to get active session' });
        }
    }

    async getSessionHistory(req: Request, res: Response): Promise<void> {
        try {
            const userId = (req as any).user.id;
            const limit = parseInt(req.query.limit as string) || 10;

            const history = await sessionService.getUserSessionHistory(userId, limit);

            res.status(200).json({
                success: true,
                history,
            });
        } catch (error: any) {
            logger.error('Get session history error:', error);
            res.status(500).json({ error: 'Failed to get session history' });
        }
    }

    async recordDataUsage(req: Request, res: Response): Promise<void> {
        try {
            const { sessionId, bytesUploaded, bytesDownloaded } = req.body;

            if (!sessionId || bytesUploaded === undefined || bytesDownloaded === undefined) {
                res.status(400).json({ error: 'Missing required fields' });
                return;
            }

            await sessionService.recordDataUsage(sessionId, bytesUploaded, bytesDownloaded);

            res.status(200).json({
                success: true,
                message: 'Data usage recorded',
            });
        } catch (error: any) {
            logger.error('Record data usage error:', error);
            res.status(500).json({ error: 'Failed to record data usage' });
        }
    }
}

export default new SessionController();
