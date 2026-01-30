import { Request } from 'express';
import pool from '../database/db';
import bcrypt from 'bcrypt';
import encryptionService from '../utils/encryption';
import { logger } from '../utils/logger';

export interface AdminProfile {
    id: string;
    username: string;
    email: string;
    full_name: string;
    security_questions_set: boolean;
    created_at: Date;
    last_login?: Date;
}

export interface AdminSecurityAnswer {
    question_id: number;
    question: string;
    answer_hash: string;
}

class AdminProfileService {
    async getAdminProfile(adminUserId: string): Promise<AdminProfile | null> {
        try {
            const result = await pool.query(
                `SELECT id, username, email, full_name, 
                        security_questions_set, created_at, last_login
                 FROM admin_users 
                 WHERE id = $1 AND active = true`,
                [adminUserId]
            );

            if (result.rows.length === 0) {
                return null;
            }

            return result.rows[0];
        } catch (error) {
            logger.error('Error getting admin profile:', error);
            throw error;
        }
    }

    async updateAdminProfile(adminUserId: string, profileData: {
        full_name?: string;
        email?: string;
    }): Promise<AdminProfile> {
        try {
            const updates: string[] = [];
            const values: any[] = [];
            let paramIndex = 1;

            if (profileData.full_name !== undefined) {
                updates.push(`full_name = $${paramIndex++}`);
                values.push(profileData.full_name);
            }
            if (profileData.email !== undefined) {
                updates.push(`email = $${paramIndex++}`);
                values.push(profileData.email);
            }

            if (updates.length === 0) {
                throw new Error('No profile data provided');
            }

            updates.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(adminUserId);

            const query = `
                UPDATE admin_users 
                SET ${updates.join(', ')}
                WHERE id = $${paramIndex}
                RETURNING id, username, email, full_name, 
                         security_questions_set, created_at, last_login
            `;

            const result = await pool.query(query, values);
            return result.rows[0];
        } catch (error) {
            logger.error('Error updating admin profile:', error);
            throw error;
        }
    }

    async setAdminSecurityAnswers(adminUserId: string, answers: { question_id: number; answer: string }[]): Promise<void> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Delete existing answers for this admin
            await client.query('DELETE FROM admin_security_answers WHERE admin_user_id = $1', [adminUserId]);

            // Insert new answers
            for (const answer of answers) {
                const answerHash = await bcrypt.hash(answer.answer.toLowerCase().trim(), 12);
                await client.query(
                    'INSERT INTO admin_security_answers (admin_user_id, question_id, answer_hash) VALUES ($1, $2, $3)',
                    [adminUserId, answer.question_id, answerHash]
                );
            }

            // Mark security questions as set
            await client.query(
                'UPDATE admin_users SET security_questions_set = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                [adminUserId]
            );

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Error setting admin security answers:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    async getAdminSecurityAnswers(adminUserId: string): Promise<AdminSecurityAnswer[]> {
        try {
            const result = await pool.query(
                `SELECT asa.question_id, sq.question, asa.answer_hash
                 FROM admin_security_answers asa
                 JOIN security_questions sq ON asa.question_id = sq.id
                 WHERE asa.admin_user_id = $1`,
                [adminUserId]
            );
            return result.rows;
        } catch (error) {
            logger.error('Error getting admin security answers:', error);
            throw error;
        }
    }

    async verifyAdminSecurityAnswers(adminUserId: string, answers: { question_id: number; answer: string }[]): Promise<boolean> {
        try {
            for (const answer of answers) {
                const result = await pool.query(
                    'SELECT answer_hash FROM admin_security_answers WHERE admin_user_id = $1 AND question_id = $2',
                    [adminUserId, answer.question_id]
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
            logger.error('Error verifying admin security answers:', error);
            throw error;
        }
    }

    async createAdminPasswordResetToken(adminUserId: string): Promise<string> {
        try {
            // Generate secure token
            const token = encryptionService.generateToken(64);
            const tokenHash = encryptionService.hash(token);
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 1); // Token expires in 1 hour

            // Delete any existing unused tokens for this admin
            await pool.query('DELETE FROM admin_password_reset_tokens WHERE admin_user_id = $1 AND used = false', [adminUserId]);

            // Insert new token
            await pool.query(
                'INSERT INTO admin_password_reset_tokens (admin_user_id, token, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
                [adminUserId, token, tokenHash, expiresAt]
            );

            return token;
        } catch (error) {
            logger.error('Error creating admin password reset token:', error);
            throw error;
        }
    }

    async validateAdminPasswordResetToken(token: string): Promise<string | null> {
        try {
            const tokenHash = encryptionService.hash(token);
            
            const result = await pool.query(
                `SELECT admin_user_id FROM admin_password_reset_tokens 
                 WHERE token_hash = $1 AND used = false AND expires_at > CURRENT_TIMESTAMP`,
                [tokenHash]
            );

            if (result.rows.length === 0) {
                return null;
            }

            return result.rows[0].admin_user_id;
        } catch (error) {
            logger.error('Error validating admin password reset token:', error);
            throw error;
        }
    }

    async resetAdminPassword(token: string, newPassword: string): Promise<void> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const tokenHash = encryptionService.hash(token);
            
            // Get admin user ID and mark token as used
            const tokenResult = await client.query(
                `SELECT admin_user_id FROM admin_password_reset_tokens 
                 WHERE token_hash = $1 AND used = false AND expires_at > CURRENT_TIMESTAMP`,
                [tokenHash]
            );

            if (tokenResult.rows.length === 0) {
                throw new Error('Invalid or expired token');
            }

            const adminUserId = tokenResult.rows[0].admin_user_id;

            // Hash new password
            const passwordHash = await bcrypt.hash(newPassword, 12);

            // Update password
            await client.query(
                'UPDATE admin_users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [passwordHash, adminUserId]
            );

            // Mark token as used
            await client.query(
                'UPDATE admin_password_reset_tokens SET used = true WHERE token_hash = $1',
                [tokenHash]
            );

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Error resetting admin password:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    async changeAdminPassword(adminUserId: string, currentPassword: string, newPassword: string): Promise<void> {
        try {
            // Get current password hash
            const result = await pool.query('SELECT password_hash FROM admin_users WHERE id = $1', [adminUserId]);
            
            if (result.rows.length === 0) {
                throw new Error('Admin user not found');
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
                'UPDATE admin_users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [newPasswordHash, adminUserId]
            );
        } catch (error) {
            logger.error('Error changing admin password:', error);
            throw error;
        }
    }
}

export default new AdminProfileService();
