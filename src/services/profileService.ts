import { Request } from 'express';
import pool from '../database/db';
import bcrypt from 'bcrypt';
import encryptionService from '../utils/encryption';
import { logger } from '../utils/logger';

export interface UserProfile {
    id: string;
    username: string;
    email: string;
    phone: string;
    first_name: string;
    last_name: string;
    profile_completed: boolean;
    security_questions_set: boolean;
    created_at: Date;
    last_login?: Date;
}

export interface SecurityQuestion {
    id: number;
    question: string;
}

export interface UserSecurityAnswer {
    question_id: number;
    question: string;
    answer_hash: string;
}

class ProfileService {
    async getUserProfile(userId: string): Promise<UserProfile | null> {
        try {
            const result = await pool.query(
                `SELECT id, username, email, phone, first_name, last_name, 
                        profile_completed, security_questions_set, created_at, last_login
                 FROM users 
                 WHERE id = $1 AND active = true`,
                [userId]
            );

            if (result.rows.length === 0) {
                return null;
            }

            return result.rows[0];
        } catch (error) {
            logger.error('Error getting user profile:', error);
            throw error;
        }
    }

    async updateProfile(userId: string, profileData: {
        first_name?: string;
        last_name?: string;
        phone?: string;
    }): Promise<UserProfile> {
        try {
            const updates: string[] = [];
            const values: any[] = [];
            let paramIndex = 1;

            if (profileData.first_name !== undefined) {
                updates.push(`first_name = $${paramIndex++}`);
                values.push(profileData.first_name);
            }
            if (profileData.last_name !== undefined) {
                updates.push(`last_name = $${paramIndex++}`);
                values.push(profileData.last_name);
            }
            if (profileData.phone !== undefined) {
                updates.push(`phone = $${paramIndex++}`);
                values.push(profileData.phone);
            }

            if (updates.length === 0) {
                throw new Error('No profile data provided');
            }

            updates.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(userId);

            const query = `
                UPDATE users 
                SET ${updates.join(', ')}
                WHERE id = $${paramIndex}
                RETURNING id, username, email, phone, first_name, last_name, 
                         profile_completed, security_questions_set, created_at, last_login
            `;

            const result = await pool.query(query, values);
            return result.rows[0];
        } catch (error) {
            logger.error('Error updating user profile:', error);
            throw error;
        }
    }

    async getSecurityQuestions(): Promise<SecurityQuestion[]> {
        try {
            const result = await pool.query(
                'SELECT id, question FROM security_questions WHERE active = true ORDER BY id'
            );
            return result.rows;
        } catch (error) {
            logger.error('Error getting security questions:', error);
            throw error;
        }
    }

    async setUserSecurityAnswers(userId: string, answers: { question_id: number; answer: string }[]): Promise<void> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Delete existing answers for this user
            await client.query('DELETE FROM user_security_answers WHERE user_id = $1', [userId]);

            // Insert new answers
            for (const answer of answers) {
                const answerHash = await bcrypt.hash(answer.answer.toLowerCase().trim(), 12);
                await client.query(
                    'INSERT INTO user_security_answers (user_id, question_id, answer_hash) VALUES ($1, $2, $3)',
                    [userId, answer.question_id, answerHash]
                );
            }

            // Mark security questions as set
            await client.query(
                'UPDATE users SET security_questions_set = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                [userId]
            );

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Error setting user security answers:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    async getUserSecurityAnswers(userId: string): Promise<UserSecurityAnswer[]> {
        try {
            const result = await pool.query(
                `SELECT usa.question_id, sq.question, usa.answer_hash
                 FROM user_security_answers usa
                 JOIN security_questions sq ON usa.question_id = sq.id
                 WHERE usa.user_id = $1`,
                [userId]
            );
            return result.rows;
        } catch (error) {
            logger.error('Error getting user security answers:', error);
            throw error;
        }
    }

    async verifySecurityAnswers(userId: string, answers: { question_id: number; answer: string }[]): Promise<boolean> {
        try {
            for (const answer of answers) {
                const result = await pool.query(
                    'SELECT answer_hash FROM user_security_answers WHERE user_id = $1 AND question_id = $2',
                    [userId, answer.question_id]
                );

                if (result.rows.length === 0) {
                    return false;
                }

                const isValid = await bcrypt.compare(answer.answer.toLowerCase().trim(), result.rows[0].answer_hash);
                if (!isValid) {
                    return false;
                }
            }

            return true;
        } catch (error) {
            logger.error('Error verifying security answers:', error);
            throw error;
        }
    }

    async createPasswordResetToken(userId: string): Promise<string> {
        try {
            // Generate secure token
            const token = encryptionService.generateToken(64);
            const tokenHash = encryptionService.hash(token);
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 1); // Token expires in 1 hour

            // Delete any existing unused tokens for this user
            await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND used = false', [userId]);

            // Insert new token
            await pool.query(
                'INSERT INTO password_reset_tokens (user_id, token, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
                [userId, token, tokenHash, expiresAt]
            );

            return token;
        } catch (error) {
            logger.error('Error creating password reset token:', error);
            throw error;
        }
    }

    async validatePasswordResetToken(token: string): Promise<string | null> {
        try {
            const tokenHash = encryptionService.hash(token);
            
            const result = await pool.query(
                `SELECT user_id FROM password_reset_tokens 
                 WHERE token_hash = $1 AND used = false AND expires_at > CURRENT_TIMESTAMP`,
                [tokenHash]
            );

            if (result.rows.length === 0) {
                return null;
            }

            return result.rows[0].user_id;
        } catch (error) {
            logger.error('Error validating password reset token:', error);
            throw error;
        }
    }

    async resetPassword(token: string, newPassword: string): Promise<void> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const tokenHash = encryptionService.hash(token);
            
            // Get user ID and mark token as used
            const tokenResult = await client.query(
                `SELECT user_id FROM password_reset_tokens 
                 WHERE token_hash = $1 AND used = false AND expires_at > CURRENT_TIMESTAMP`,
                [tokenHash]
            );

            if (tokenResult.rows.length === 0) {
                throw new Error('Invalid or expired token');
            }

            const userId = tokenResult.rows[0].user_id;

            // Hash new password
            const passwordHash = await bcrypt.hash(newPassword, 12);

            // Update password
            await client.query(
                'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [passwordHash, userId]
            );

            // Mark token as used
            await client.query(
                'UPDATE password_reset_tokens SET used = true WHERE token_hash = $1',
                [tokenHash]
            );

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Error resetting password:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
        try {
            // Get current password hash
            const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
            
            if (result.rows.length === 0) {
                throw new Error('User not found');
            }

            // Verify current password
            const isValid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
            if (!isValid) {
                throw new Error('Current password is incorrect');
            }

            // Hash new password
            const newPasswordHash = await bcrypt.hash(newPassword, 12);

            // Update password
            await pool.query(
                'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [newPasswordHash, userId]
            );
        } catch (error) {
            logger.error('Error changing password:', error);
            throw error;
        }
    }
}

export default new ProfileService();
