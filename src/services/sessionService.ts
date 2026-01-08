import pool from '../database/db';
import { logger } from '../utils/logger';
import RadiusService from './radius';

interface Session {
    id: string;
    user_id: string;
    device_id: string;
    package_id: string;
    router_id: string;
    start_time: Date;
    end_time: Date;
    active: boolean;
    data_used_mb: number;
    data_limit_mb: number;
    session_status: string;
    last_activity: Date;
}

interface ActiveSessionInfo {
    session_id: string;
    package_name: string;
    data_limit_mb: number;
    data_used_mb: number;
    data_remaining_mb: number;
    time_remaining_minutes: number;
    session_status: string;
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
            'SELECT duration_minutes, data_limit_mb FROM packages WHERE id = $1',
            [packageId]
        );

        if (packageResult.rows.length === 0) {
            throw new Error('Package not found');
        }

        const pkg = packageResult.rows[0];
        const endTime = new Date(Date.now() + pkg.duration_minutes * 60000);

        const result = await pool.query(
            `INSERT INTO sessions (user_id, device_id, package_id, router_id, payment_id, end_time, data_limit_mb, session_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
             RETURNING id, user_id, device_id, package_id, router_id, start_time, end_time, 
                       active, data_used_mb, data_limit_mb, session_status, last_activity`,
            [userId, deviceId, packageId, routerId, paymentId, endTime, pkg.data_limit_mb]
        );

        const session = result.rows[0];

        const deviceResult = await pool.query('SELECT mac_address FROM devices WHERE id = $1', [deviceId]);
        const macAddress = deviceResult.rows[0]?.mac_address;

        if (macAddress) {
            const radiusService = new RadiusService();
            await radiusService.authorizeDevice(macAddress, routerId, session.id);
        }

        logger.info(`Session created for user ${userId}: ${session.id}`);

        return session;
    }

    async getUserActiveSession(userId: string): Promise<ActiveSessionInfo | null> {
        const result = await pool.query(
            `SELECT 
                s.id as session_id,
                p.name as package_name,
                s.data_limit_mb,
                s.data_used_mb,
                (s.data_limit_mb - s.data_used_mb) as data_remaining_mb,
                EXTRACT(EPOCH FROM (s.end_time - NOW()))::INTEGER / 60 as time_remaining_minutes,
                s.session_status,
                s.start_time,
                s.end_time,
                p.speed_limit_mbps,
                p.price_kes as price_paid
             FROM sessions s
             JOIN packages p ON s.package_id = p.id
             WHERE s.user_id = $1
             AND s.active = true
             AND s.session_status = 'active'
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
        await pool.query(
            'SELECT record_data_usage($1, $2, $3)',
            [sessionId, bytesUploaded, bytesDownloaded]
        );

        const sessionResult = await pool.query(
            'SELECT active, session_status, device_id FROM sessions WHERE id = $1',
            [sessionId]
        );

        if (sessionResult.rows.length > 0) {
            const session = sessionResult.rows[0];
            
            if (!session.active || session.session_status === 'exhausted') {
                const deviceResult = await pool.query('SELECT mac_address FROM devices WHERE id = $1', [session.device_id]);
                const macAddress = deviceResult.rows[0]?.mac_address;

                if (macAddress) {
                    const radiusService = new RadiusService();
                    await radiusService.disconnectDevice(macAddress);
                }

                logger.info(`Session ${sessionId} auto-disconnected: ${session.session_status}`);
            }
        }
    }

    async checkAndExpireSessions(): Promise<void> {
        await pool.query('SELECT check_and_expire_sessions()');

        const expiredSessions = await pool.query(
            `SELECT s.id, d.mac_address 
             FROM sessions s
             JOIN devices d ON s.device_id = d.id
             WHERE s.active = false 
             AND s.session_status IN ('expired', 'exhausted', 'disconnected')
             AND s.updated_at > NOW() - INTERVAL '1 minute'`
        );

        const radiusService = new RadiusService();
        for (const session of expiredSessions.rows) {
            await radiusService.disconnectDevice(session.mac_address);
            logger.info(`Session expired and disconnected: ${session.id}`);
        }
    }

    async terminateSession(sessionId: string, reason: string = 'manual'): Promise<void> {
        const result = await pool.query(
            `UPDATE sessions 
             SET active = false, session_status = 'terminated', disconnect_reason = $2
             WHERE id = $1
             RETURNING device_id`,
            [sessionId, reason]
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
                s.data_used_mb,
                s.data_limit_mb,
                s.session_status,
                s.disconnect_reason,
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
            'UPDATE sessions SET last_activity = NOW() WHERE id = $1',
            [sessionId]
        );
    }
}

export default new SessionService();
