import { Request, Response } from 'express';
import profileService from '../services/profileService';
import { logger } from '../utils/logger';
import pool from '../database/db';

export const getProfile = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        
        const profile = await profileService.getUserProfile(userId);
        
        if (!profile) {
            res.status(404).json({
                success: false,
                error: 'Profile not found'
            });
            return;
        }

        res.json({
            success: true,
            profile
        });
    } catch (error) {
        logger.error('Error getting profile:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { first_name, last_name, phone } = req.body;

        const updatedProfile = await profileService.updateProfile(userId, {
            first_name,
            last_name,
            phone
        });

        res.json({
            success: true,
            profile: updatedProfile,
            message: 'Profile updated successfully'
        });
    } catch (error) {
        logger.error('Error updating profile:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const getSecurityQuestions = async (req: Request, res: Response): Promise<void> => {
    try {
        const questions = await profileService.getSecurityQuestions();
        
        res.json({
            success: true,
            questions
        });
    } catch (error) {
        logger.error('Error getting security questions:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const setSecurityAnswers = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { answers } = req.body;

        if (!answers || !Array.isArray(answers) || answers.length < 3) {
            res.status(400).json({
                success: false,
                error: 'At least 3 security answers are required'
            });
            return;
        }

        await profileService.setUserSecurityAnswers(userId, answers);

        res.json({
            success: true,
            message: 'Security answers set successfully'
        });
    } catch (error) {
        logger.error('Error setting security answers:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const getSecurityAnswers = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        
        const answers = await profileService.getUserSecurityAnswers(userId);
        
        // Don't return the actual answer hashes, just the questions
        const questionsOnly = answers.map(a => ({
            question_id: a.question_id,
            question: a.question
        }));

        res.json({
            success: true,
            questions: questionsOnly
        });
    } catch (error) {
        logger.error('Error getting security answers:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const getSecurityAnswersForForgotPassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const { identifier } = req.body;

        if (!identifier) {
            res.status(400).json({
                success: false,
                error: 'Identifier is required'
            });
            return;
        }

        // Find user by identifier
        const userResult = await pool.query(
            `SELECT id FROM users 
             WHERE (username = $1 OR email = $1 OR phone = $1) AND active = true`,
            [identifier]
        );

        if (userResult.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: 'User not found'
            });
            return;
        }

        const userId = userResult.rows[0].id;

        const answers = await profileService.getUserSecurityAnswers(userId);
        
        // Don't return the actual answer hashes, just the questions
        const questionsOnly = answers.map(a => ({
            question_id: a.question_id,
            question: a.question
        }));

        res.json({
            success: true,
            questions: questionsOnly
        });
    } catch (error) {
        logger.error('Error getting security answers for forgot password:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const { identifier, answers } = req.body;

        if (!identifier || !answers || !Array.isArray(answers)) {
            res.status(400).json({
                success: false,
                error: 'Identifier and security answers are required'
            });
            return;
        }

        // Find user by identifier (username, email, or phone)
        const userResult = await pool.query(
            `SELECT id FROM users 
             WHERE (username = $1 OR email = $1 OR phone = $1) AND active = true`,
            [identifier]
        );

        if (userResult.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: 'User not found'
            });
            return;
        }

        const userId = userResult.rows[0].id;

        // Verify security answers
        const isValid = await profileService.verifySecurityAnswers(userId, answers);
        
        if (!isValid) {
            res.status(400).json({
                success: false,
                error: 'One or more security answers are incorrect'
            });
            return;
        }

        // Create reset token
        const token = await profileService.createPasswordResetToken(userId);

        res.json({
            success: true,
            message: 'Password reset token generated successfully',
            token // In production, you might want to send this via email/SMS
        });
    } catch (error) {
        logger.error('Error in forgot password:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const validateResetToken = async (req: Request, res: Response): Promise<void> => {
    try {
        const { token } = req.params;

        const userId = await profileService.validatePasswordResetToken(token);
        
        if (!userId) {
            res.status(400).json({
                success: false,
                error: 'Invalid or expired token'
            });
            return;
        }

        res.json({
            success: true,
            message: 'Token is valid'
        });
    } catch (error) {
        logger.error('Error validating reset token:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const { token, new_password } = req.body;

        if (!token || !new_password) {
            res.status(400).json({
                success: false,
                error: 'Token and new password are required'
            });
            return;
        }

        if (new_password.length < 8) {
            res.status(400).json({
                success: false,
                error: 'Password must be at least 8 characters long'
            });
            return;
        }

        await profileService.resetPassword(token, new_password);

        res.json({
            success: true,
            message: 'Password reset successfully'
        });
    } catch (error) {
        logger.error('Error resetting password:', error);
        res.status(500).json({
            success: false,
            error: (error as Error).message || 'Internal server error'
        });
    }
};

export const changePassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { current_password, new_password } = req.body;

        if (!current_password || !new_password) {
            res.status(400).json({
                success: false,
                error: 'Current password and new password are required'
            });
            return;
        }

        if (new_password.length < 8) {
            res.status(400).json({
                success: false,
                error: 'New password must be at least 8 characters long'
            });
            return;
        }

        await profileService.changePassword(userId, current_password, new_password);

        res.json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        logger.error('Error changing password:', error);
        res.status(400).json({
            success: false,
            error: (error as Error).message || 'Internal server error'
        });
    }
};
