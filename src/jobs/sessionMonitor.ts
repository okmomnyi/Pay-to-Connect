import sessionService from '../services/sessionService';
import { logger } from '../utils/logger';

export class SessionMonitor {
    private intervalId: NodeJS.Timeout | null = null;
    private checkIntervalMs: number;

    constructor(checkIntervalMs: number = 30000) {
        this.checkIntervalMs = checkIntervalMs;
    }

    start(): void {
        if (this.intervalId) {
            logger.warn('Session monitor is already running');
            return;
        }

        logger.info(`Starting session monitor (check interval: ${this.checkIntervalMs}ms)`);

        this.intervalId = setInterval(async () => {
            try {
                await this.checkSessions();
            } catch (error) {
                logger.error('Session monitor error:', error);
            }
        }, this.checkIntervalMs);

        this.checkSessions();
    }

    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            logger.info('Session monitor stopped');
        }
    }

    private async checkSessions(): Promise<void> {
        try {
            await sessionService.checkAndExpireSessions();
            logger.debug('Session check completed');
        } catch (error) {
            logger.error('Failed to check and expire sessions:', error);
        }
    }
}

export default new SessionMonitor();
