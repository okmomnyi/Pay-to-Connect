import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import pool from '../database/db';
import { logger } from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = '7d';
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12');

interface User {
    id: string;
    username: string;
    email: string;
    phone: string;
    first_name?: string;
    last_name?: string;
    active: boolean;
    email_verified: boolean;
    phone_verified: boolean;
}

interface RegisterData {
    username: string;
    email: string;
    phone: string;
    password: string;
    first_name?: string;
    last_name?: string;
}

interface LoginData {
    identifier: string;
    password: string;
}

export class AuthService {
    async register(data: RegisterData): Promise<{ user: User; token: string }> {
        const { username, email, phone, password, first_name, last_name } = data;

        const existingUser = await pool.query(
            'SELECT id FROM users WHERE username = $1 OR email = $2 OR phone = $3',
            [username, email, phone]
        );

        if (existingUser.rows.length > 0) {
            throw new Error('Username, email, or phone already exists');
        }

        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

        const result = await pool.query(
            `INSERT INTO users (username, email, phone, password_hash, first_name, last_name)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, username, email, phone, first_name, last_name, active, email_verified, phone_verified`,
            [username, email, phone, passwordHash, first_name, last_name]
        );

        const user = result.rows[0];
        const token = await this.createSession(user.id);

        await this.logActivity(user.id, 'user_registered', 'user', undefined);

        logger.info(`New user registered: ${username}`);

        return { user, token };
    }

    async login(data: LoginData, ipAddress?: string, userAgent?: string): Promise<{ user: User; token: string }> {
        const { identifier, password } = data;

        const result = await pool.query(
            `SELECT id, username, email, phone, password_hash, first_name, last_name, 
                    active, email_verified, phone_verified, failed_login_attempts, locked_until
             FROM users 
             WHERE username = $1 OR email = $1 OR phone = $1`,
            [identifier]
        );

        if (result.rows.length === 0) {
            throw new Error('Invalid credentials');
        }

        const user = result.rows[0];

        if (!user.active) {
            throw new Error('Account is disabled');
        }

        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            throw new Error('Account is temporarily locked. Please try again later.');
        }

        const isValidPassword = await bcrypt.compare(password, user.password_hash);

        if (!isValidPassword) {
            await pool.query(
                `UPDATE users 
                 SET failed_login_attempts = failed_login_attempts + 1,
                     locked_until = CASE 
                         WHEN failed_login_attempts >= 4 THEN NOW() + INTERVAL '15 minutes'
                         ELSE NULL 
                     END
                 WHERE id = $1`,
                [user.id]
            );

            await this.logActivity(user.id, 'login_failed', 'user', ipAddress);
            throw new Error('Invalid credentials');
        }

        await pool.query(
            `UPDATE users 
             SET failed_login_attempts = 0, 
                 locked_until = NULL,
                 last_login = NOW()
             WHERE id = $1`,
            [user.id]
        );

        const token = await this.createSession(user.id, ipAddress, userAgent);

        await this.logActivity(user.id, 'user_login', 'user', ipAddress);

        logger.info(`User logged in: ${user.username}`);

        delete user.password_hash;
        delete user.failed_login_attempts;
        delete user.locked_until;

        return { user, token };
    }

    async createSession(userId: string, ipAddress?: string, userAgent?: string): Promise<string> {
        const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        const decoded: any = jwt.decode(token);
        const expiresAt = new Date(decoded.exp * 1000);

        await pool.query(
            `INSERT INTO user_sessions (user_id, session_token, ip_address, user_agent, expires_at)
             VALUES ($1, $2, $3, $4, $5)`,
            [userId, token, ipAddress, userAgent, expiresAt]
        );

        return token;
    }

    async verifyToken(token: string): Promise<User | null> {
        try {
            const decoded: any = jwt.verify(token, JWT_SECRET);

            const sessionResult = await pool.query(
                `SELECT is_active FROM user_sessions 
                 WHERE session_token = $1 AND expires_at > NOW()`,
                [token]
            );

            if (sessionResult.rows.length === 0 || !sessionResult.rows[0].is_active) {
                return null;
            }

            const userResult = await pool.query(
                `SELECT id, username, email, phone, first_name, last_name, active, email_verified, phone_verified
                 FROM users WHERE id = $1 AND active = true`,
                [decoded.userId]
            );

            if (userResult.rows.length === 0) {
                return null;
            }

            return userResult.rows[0];
        } catch (error) {
            logger.error('Token verification failed:', error);
            return null;
        }
    }

    async logout(token: string): Promise<void> {
        await pool.query(
            'UPDATE user_sessions SET is_active = false WHERE session_token = $1',
            [token]
        );
    }

    async logoutAllSessions(userId: string): Promise<void> {
        await pool.query(
            'UPDATE user_sessions SET is_active = false WHERE user_id = $1',
            [userId]
        );

        await this.logActivity(userId, 'logout_all_sessions', 'user', undefined);
    }

    async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
        const result = await pool.query(
            'SELECT password_hash FROM users WHERE id = $1',
            [userId]
        );

        if (result.rows.length === 0) {
            throw new Error('User not found');
        }

        const isValidPassword = await bcrypt.compare(oldPassword, result.rows[0].password_hash);

        if (!isValidPassword) {
            throw new Error('Invalid current password');
        }

        const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

        await pool.query(
            'UPDATE users SET password_hash = $1 WHERE id = $2',
            [newPasswordHash, userId]
        );

        await this.logoutAllSessions(userId);

        await this.logActivity(userId, 'password_changed', 'user', undefined);

        logger.info(`Password changed for user: ${userId}`);
    }

    async generatePasswordResetToken(email: string): Promise<string> {
        const result = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            throw new Error('User not found');
        }

        const userId = result.rows[0].id;
        const token = uuidv4();
        const expiresAt = new Date(Date.now() + 3600000);

        await pool.query(
            'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
            [userId, token, expiresAt]
        );

        return token;
    }

    async resetPassword(token: string, newPassword: string): Promise<void> {
        const result = await pool.query(
            `SELECT user_id FROM password_reset_tokens 
             WHERE token = $1 AND expires_at > NOW() AND used = false`,
            [token]
        );

        if (result.rows.length === 0) {
            throw new Error('Invalid or expired reset token');
        }

        const userId = result.rows[0].user_id;
        const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

        await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newPasswordHash, userId]);
        await pool.query('UPDATE password_reset_tokens SET used = true WHERE token = $1', [token]);
        await this.logoutAllSessions(userId);

        await this.logActivity(userId, 'password_reset', 'user', undefined);

        logger.info(`Password reset for user: ${userId}`);
    }

    private async logActivity(userId: string | null, action: string, resource: string, ipAddress: string | null | undefined): Promise<void> {
        await pool.query(
            'INSERT INTO user_activity_logs (user_id, action, resource, ip_address) VALUES ($1, $2, $3, $4)',
            [userId, action, resource, ipAddress]
        );
    }

    async getUserProfile(userId: string): Promise<User> {
        const result = await pool.query(
            `SELECT id, username, email, phone, first_name, last_name, active, 
                    email_verified, phone_verified, created_at, last_login
             FROM users WHERE id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            throw new Error('User not found');
        }

        return result.rows[0];
    }
}

export default new AuthService();
