import pool from '../database/db';
import { logger } from '../utils/logger';
import RadiusService from './radius';

interface Session {
    id: string;
    user_id: string;
    device_id: string;
    package_id: string;
    router_ip: string;
    payment_id: string;
    start_time: Date;
    end_time: Date;
    active: boolean;
    data_used_bytes: number;
}

interface ActiveSessionInfo {
    session_id: string;
    package_name: string;
    data_limit_mb: number;
    data_used_mb: number;
    data_remaining_mb: number;
    time_remaining_minutes: number;
    start_time: Date;
    end_time: Date;
    speed_limit_mbps: number;
    price_paid: number;
}

export class SessionService {
    async createSession(
        userId: string,
        packageId: string,
        deviceId: string,
        routerId: string,
        paymentId?: string
    ): Promise<Session> {
        const packageResult = await pool.query(
            'SELECT duration_minutes FROM packages WHERE id = $1',
            [packageId]
        );

        if (packageResult.rows.length === 0) {
            throw new Error('Package not found');
        }

        const pkg = packageResult.rows[0];
        const endTime = new Date(Date.now() + pkg.duration_minutes * 60000);

        // Look up router IP — schema stores router_ip INET, not a router FK
        const routerResult = await pool.query('SELECT ip_address FROM routers WHERE id = $1', [routerId]);
        const routerIp = routerResult.rows[0]?.ip_address || null;

        // Sessions start inactive — only activated by the M-Pesa callback after confirmed payment
        const result = await pool.query(
            `INSERT INTO sessions (user_id, device_id, package_id, router_ip, payment_id, end_time, active)
             VALUES ($1, $2, $3, $4, $5, $6, false)
             RETURNING id, user_id, device_id, package_id, router_ip, payment_id,
                       start_time, end_time, active, data_used_bytes`,
            [userId, deviceId, packageId, routerIp, paymentId, endTime]
        );

        const session = result.rows[0];

        logger.info(`Session created for user ${userId}: ${session.id}`);

        return session;
    }

    async getUserActiveSession(userId: string): Promise<ActiveSessionInfo | null> {
        const result = await pool.query(
            `SELECT
                s.id as session_id,
                p.name as package_name,
                p.data_limit_mb,
                ROUND(s.data_used_bytes / 1048576.0, 2) as data_used_mb,
                ROUND((COALESCE(p.data_limit_mb, 0) * 1048576.0 - s.data_used_bytes) / 1048576.0, 2) as data_remaining_mb,
                EXTRACT(EPOCH FROM (s.end_time - NOW()))::INTEGER / 60 as time_remaining_minutes,
                s.start_time,
                s.end_time,
                p.speed_limit_mbps,
                p.price_kes as price_paid
             FROM sessions s
             JOIN packages p ON s.package_id = p.id
             WHERE s.user_id = $1
             AND s.active = true
             ORDER BY s.created_at DESC
             LIMIT 1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return result.rows[0];
    }

    async recordDataUsage(sessionId: string, bytesUploaded: number, bytesDownloaded: number): Promise<void> {
        const totalBytes = bytesUploaded + bytesDownloaded;

        await pool.query(
            'UPDATE sessions SET data_used_bytes = data_used_bytes + $1 WHERE id = $2',
            [totalBytes, sessionId]
        );

        const sessionResult = await pool.query(
            `SELECT s.active, s.data_used_bytes, s.device_id, p.data_limit_mb
             FROM sessions s
             JOIN packages p ON s.package_id = p.id
             WHERE s.id = $1`,
            [sessionId]
        );

        if (sessionResult.rows.length > 0) {
            const session = sessionResult.rows[0];
            const dataLimitBytes = session.data_limit_mb ? session.data_limit_mb * 1048576 : null;
            const dataExhausted = dataLimitBytes !== null && session.data_used_bytes >= dataLimitBytes;

            if (!session.active || dataExhausted) {
                if (dataExhausted) {
                    await pool.query('UPDATE sessions SET active = false WHERE id = $1', [sessionId]);
                }

                const deviceResult = await pool.query('SELECT mac_address FROM devices WHERE id = $1', [session.device_id]);
                const macAddress = deviceResult.rows[0]?.mac_address;

                if (macAddress) {
                    const radiusService = new RadiusService();
                    await radiusService.disconnectDevice(macAddress);
                }

                logger.info(`Session ${sessionId} auto-disconnected: data exhausted or inactive`);
            }
        }
    }

    async checkAndExpireSessions(): Promise<void> {
        // Expire sessions that have passed their end_time
        const expiredSessions = await pool.query(
            `UPDATE sessions
             SET active = false
             WHERE active = true AND end_time < NOW()
             RETURNING id, device_id`
        );

        const radiusService = new RadiusService();
        for (const session of expiredSessions.rows) {
            const deviceResult = await pool.query(
                'SELECT mac_address FROM devices WHERE id = $1',
                [session.device_id]
            );
            const macAddress = deviceResult.rows[0]?.mac_address;
            if (macAddress) {
                await radiusService.disconnectDevice(macAddress);
            }
            logger.info(`Session expired and disconnected: ${session.id}`);
        }
    }

    async terminateSession(sessionId: string, reason: string = 'manual'): Promise<void> {
        const result = await pool.query(
            `UPDATE sessions
             SET active = false
             WHERE id = $1
             RETURNING device_id`,
            [sessionId]
        );

        if (result.rows.length > 0) {
            const deviceResult = await pool.query('SELECT mac_address FROM devices WHERE id = $1', [result.rows[0].device_id]);
            const macAddress = deviceResult.rows[0]?.mac_address;

            if (macAddress) {
                const radiusService = new RadiusService();
                await radiusService.disconnectDevice(macAddress);
            }

            logger.info(`Session terminated: ${sessionId}, reason: ${reason}`);
        }
    }

    async getUserSessionHistory(userId: string, limit: number = 10): Promise<any[]> {
        const result = await pool.query(
            `SELECT
                s.id,
                p.name as package_name,
                s.start_time,
                s.end_time,
                ROUND(s.data_used_bytes / 1048576.0, 2) as data_used_mb,
                p.data_limit_mb,
                s.active,
                py.amount as amount_paid
             FROM sessions s
             JOIN packages p ON s.package_id = p.id
             LEFT JOIN payments py ON s.payment_id = py.id
             WHERE s.user_id = $1
             ORDER BY s.created_at DESC
             LIMIT $2`,
            [userId, limit]
        );

        return result.rows;
    }

    async getOrCreateDevice(macAddress: string): Promise<string> {
        let result = await pool.query(
            'SELECT id FROM devices WHERE mac_address = $1',
            [macAddress]
        );

        if (result.rows.length > 0) {
            await pool.query(
                'UPDATE devices SET last_seen = NOW() WHERE mac_address = $1',
                [macAddress]
            );
            return result.rows[0].id;
        }

        result = await pool.query(
            'INSERT INTO devices (mac_address) VALUES ($1) RETURNING id',
            [macAddress]
        );

        return result.rows[0].id;
    }

    async updateSessionActivity(sessionId: string): Promise<void> {
        await pool.query(
            'UPDATE sessions SET updated_at = NOW() WHERE id = $1',
            [sessionId]
        );
    }
}

export default new SessionService();
