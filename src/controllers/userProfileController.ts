import { Response } from 'express';
import DatabaseConnection from '../database/connection';
import { logger } from '../utils/logger';
import Joi from 'joi';
import bcrypt from 'bcrypt';

interface AuthRequest extends Request {
    user?: {
        userId: string;
        username: string;
    };
}

class UserProfileController {
    private db: DatabaseConnection;

    constructor() {
        this.db = DatabaseConnection.getInstance();
    }

    // Get user profile
    public getProfile = async (req: any, res: Response): Promise<void> => {
        try {
            const userId = req.user.userId;

            const result = await this.db.query(
                `SELECT id, username, email, full_name, phone, profile_picture_url, 
                        created_at, last_password_change, email_verified, phone_verified
                 FROM users 
                 WHERE id = $1`,
                [userId]
            );

            if (result.rows.length === 0) {
                res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
                return;
            }

            res.json({
                success: true,
                profile: result.rows[0]
            });
        } catch (error) {
            logger.error('Failed to get profile:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    // Update user profile
    public updateProfile = async (req: any, res: Response): Promise<void> => {
        try {
            const userId = req.user.userId;
            
            const schema = Joi.object({
                full_name: Joi.string().max(255),
                phone: Joi.string().max(20),
                email: Joi.string().email()
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                res.status(400).json({
                    success: false,
                    error: error.details[0].message
                });
                return;
            }

            const updates: string[] = [];
            const values: any[] = [];
            let paramCount = 1;

            Object.entries(value).forEach(([key, val]) => {
                if (val !== undefined) {
                    updates.push(`${key} = $${paramCount}`);
                    values.push(val);
                    paramCount++;
                }
            });

            if (updates.length === 0) {
                res.status(400).json({
                    success: false,
                    error: 'No valid fields to update'
                });
                return;
            }

            values.push(userId);
            const query = `
                UPDATE users 
                SET ${updates.join(', ')}, updated_at = NOW()
                WHERE id = $${paramCount}
                RETURNING id, username, email, full_name, phone
            `;

            const result = await this.db.query(query, values);

            res.json({
                success: true,
                profile: result.rows[0]
            });
        } catch (error: any) {
            logger.error('Failed to update profile:', error);
            if (error.code === '23505') {
                res.status(409).json({
                    success: false,
                    error: 'Email or phone already in use'
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: 'Internal server error'
                });
            }
        }
    };

    // Change password
    public changePassword = async (req: any, res: Response): Promise<void> => {
        try {
            const userId = req.user.userId;
            
            const schema = Joi.object({
                currentPassword: Joi.string().required(),
                newPassword: Joi.string().min(8).required(),
                confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required()
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                res.status(400).json({
                    success: false,
                    error: error.details[0].message
                });
                return;
            }

            // Get current password hash
            const userResult = await this.db.query(
                'SELECT password_hash FROM users WHERE id = $1',
                [userId]
            );

            if (userResult.rows.length === 0) {
                res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
                return;
            }

            // Verify current password
            const isValid = await bcrypt.compare(
                value.currentPassword,
                userResult.rows[0].password_hash
            );

            if (!isValid) {
                res.status(401).json({
                    success: false,
                    error: 'Current password is incorrect'
                });
                return;
            }

            // Hash new password
            const newPasswordHash = await bcrypt.hash(value.newPassword, 10);

            // Update password
            await this.db.query(
                `UPDATE users 
                 SET password_hash = $1, last_password_change = NOW(), updated_at = NOW()
                 WHERE id = $2`,
                [newPasswordHash, userId]
            );

            logger.info(`User ${userId} changed password`);

            res.json({
                success: true,
                message: 'Password changed successfully'
            });
        } catch (error) {
            logger.error('Failed to change password:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    // Get security questions
    public getSecurityQuestions = async (req: any, res: Response): Promise<void> => {
        try {
            const result = await this.db.query(
                'SELECT id, question FROM security_questions WHERE active = true ORDER BY question'
            );

            res.json({
                success: true,
                questions: result.rows
            });
        } catch (error) {
            logger.error('Failed to get security questions:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    // Get user's security questions
    public getUserSecurityQuestions = async (req: any, res: Response): Promise<void> => {
        try {
            const userId = req.user.userId;

            const result = await this.db.query(
                `SELECT sq.id, sq.question, usa.created_at
                 FROM user_security_answers usa
                 JOIN security_questions sq ON usa.question_id = sq.id
                 WHERE usa.user_id = $1
                 ORDER BY usa.created_at`,
                [userId]
            );

            res.json({
                success: true,
                questions: result.rows
            });
        } catch (error) {
            logger.error('Failed to get user security questions:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    // Set security question answers
    public setSecurityAnswers = async (req: any, res: Response): Promise<void> => {
        try {
            const userId = req.user.userId;
            
            const schema = Joi.object({
                answers: Joi.array().items(
                    Joi.object({
                        questionId: Joi.string().uuid().required(),
                        answer: Joi.string().min(1).required()
                    })
                ).min(2).max(3).required()
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                res.status(400).json({
                    success: false,
                    error: error.details[0].message
                });
                return;
            }

            // Delete existing answers
            await this.db.query(
                'DELETE FROM user_security_answers WHERE user_id = $1',
                [userId]
            );

            // Insert new answers
            for (const answer of value.answers) {
                const answerHash = await bcrypt.hash(answer.answer.toLowerCase().trim(), 10);
                
                await this.db.query(
                    `INSERT INTO user_security_answers (user_id, question_id, answer_hash)
                     VALUES ($1, $2, $3)`,
                    [userId, answer.questionId, answerHash]
                );
            }

            logger.info(`User ${userId} set security questions`);

            res.json({
                success: true,
                message: 'Security questions set successfully'
            });
        } catch (error) {
            logger.error('Failed to set security answers:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    // Verify security answers (for password recovery)
    public verifySecurityAnswers = async (req: any, res: Response): Promise<void> => {
        try {
            const schema = Joi.object({
                username: Joi.string().required(),
                answers: Joi.array().items(
                    Joi.object({
                        questionId: Joi.string().uuid().required(),
                        answer: Joi.string().required()
                    })
                ).min(2).required()
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                res.status(400).json({
                    success: false,
                    error: error.details[0].message
                });
                return;
            }

            // Get user ID
            const userResult = await this.db.query(
                'SELECT id FROM users WHERE username = $1',
                [value.username]
            );

            if (userResult.rows.length === 0) {
                res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
                return;
            }

            const userId = userResult.rows[0].id;

            // Verify each answer
            let allCorrect = true;
            for (const answer of value.answers) {
                const result = await this.db.query(
                    'SELECT answer_hash FROM user_security_answers WHERE user_id = $1 AND question_id = $2',
                    [userId, answer.questionId]
                );

                if (result.rows.length === 0) {
                    allCorrect = false;
                    break;
                }

                const isValid = await bcrypt.compare(
                    answer.answer.toLowerCase().trim(),
                    result.rows[0].answer_hash
                );

                if (!isValid) {
                    allCorrect = false;
                    break;
                }
            }

            if (allCorrect) {
                res.json({
                    success: true,
                    userId: userId,
                    message: 'Security answers verified'
                });
            } else {
                res.status(401).json({
                    success: false,
                    error: 'Security answers are incorrect'
                });
            }
        } catch (error) {
            logger.error('Failed to verify security answers:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    // Reset password using security questions
    public resetPasswordWithSecurity = async (req: any, res: Response): Promise<void> => {
        try {
            const schema = Joi.object({
                userId: Joi.string().uuid().required(),
                newPassword: Joi.string().min(8).required(),
                confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required()
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                res.status(400).json({
                    success: false,
                    error: error.details[0].message
                });
                return;
            }

            // Hash new password
            const newPasswordHash = await bcrypt.hash(value.newPassword, 10);

            // Update password
            await this.db.query(
                `UPDATE users 
                 SET password_hash = $1, last_password_change = NOW(), updated_at = NOW()
                 WHERE id = $2`,
                [newPasswordHash, value.userId]
            );

            logger.info(`User ${value.userId} reset password via security questions`);

            res.json({
                success: true,
                message: 'Password reset successfully'
            });
        } catch (error) {
            logger.error('Failed to reset password:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };
}

export default UserProfileController;
