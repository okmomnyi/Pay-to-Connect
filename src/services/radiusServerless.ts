import DatabaseConnection from '../database/connection';

interface SessionData {
    username: string;
    sessionTimeout: number;
    macAddress: string;
    ipAddress?: string;
}

class RadiusServiceServerless {
    private db: DatabaseConnection;

    constructor() {
        this.db = DatabaseConnection.getInstance();
    }

    // Serverless-compatible methods that don't require UDP server
    async authenticateUser(username: string, password: string, macAddress: string): Promise<boolean> {
        try {
            const result = await this.db.query(
                'SELECT * FROM users WHERE username = $1 AND password = $2 AND active = true',
                [username, password]
            );
            return result.rows.length > 0;
        } catch (error) {
            console.error('Authentication error:', error);
            return false;
        }
    }

    async createSession(sessionData: SessionData): Promise<string> {
        try {
            const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const expiresAt = new Date(Date.now() + (sessionData.sessionTimeout * 1000));
            
            await this.db.query(
                `INSERT INTO radius_sessions (session_id, username, mac_address, ip_address, expires_at, created_at)
                 VALUES ($1, $2, $3, $4, $5, NOW())`,
                [sessionId, sessionData.username, sessionData.macAddress, sessionData.ipAddress, expiresAt]
            );
            
            return sessionId;
        } catch (error) {
            console.error('Session creation error:', error);
            throw error;
        }
    }

    async expireOldSessions(): Promise<void> {
        try {
            await this.db.query('DELETE FROM radius_sessions WHERE expires_at < NOW()');
        } catch (error) {
            console.error('Session cleanup error:', error);
        }
    }

    async getActiveSession(macAddress: string): Promise<any> {
        try {
            const result = await this.db.query(
                'SELECT * FROM radius_sessions WHERE mac_address = $1 AND expires_at > NOW()',
                [macAddress]
            );
            return result.rows[0] || null;
        } catch (error) {
            console.error('Session lookup error:', error);
            return null;
        }
    }

    // Stub methods for RADIUS server functionality (not available in serverless)
    startRadiusServer(port: number): void {
        console.log('RADIUS server not available in serverless environment');
    }

    async loadRouters(): Promise<void> {
        console.log('Router loading not required in serverless environment');
    }
}

export default RadiusServiceServerless;
