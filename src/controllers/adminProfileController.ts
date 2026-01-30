import { Request, Response } from 'express';
import adminProfileService from '../services/adminProfileService';
import { logger } from '../utils/logger';
import pool from '../database/db';

export const getAdminProfile = async (req: Request, res: Response): Promise<void> => {
    try {
        const adminUserId = req.admin!.id;
        
        const profile = await adminProfileService.getAdminProfile(adminUserId);
        
        if (!profile) {
            res.status(404).json({
                success: false,
                error: 'Admin profile not found'
            });
            return;
        }

        res.json({
            success: true,
            profile
        });
    } catch (error) {
        logger.error('Error getting admin profile:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const updateAdminProfile = async (req: Request, res: Response): Promise<void> => {
    try {
        const adminUserId = req.admin!.id;
        const { full_name, email } = req.body;

        const updatedProfile = await adminProfileService.updateAdminProfile(adminUserId, {
            full_name,
            email
        });

        res.json({
            success: true,
            profile: updatedProfile,
            message: 'Admin profile updated successfully'
        });
    } catch (error) {
        logger.error('Error updating admin profile:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const setAdminSecurityAnswers = async (req: Request, res: Response): Promise<void> => {
    try {
        const adminUserId = req.admin!.id;
        const { answers } = req.body;

        if (!answers || !Array.isArray(answers) || answers.length < 3) {
            res.status(400).json({
                success: false,
                error: 'At least 3 security answers are required'
            });
            return;
        }

        await adminProfileService.setAdminSecurityAnswers(adminUserId, answers);

        res.json({
            success: true,
            message: 'Admin security answers set successfully'
        });
    } catch (error) {
        logger.error('Error setting admin security answers:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const getAdminSecurityAnswers = async (req: Request, res: Response): Promise<void> => {
    try {
        const adminUserId = req.admin!.id;
        
        const answers = await adminProfileService.getAdminSecurityAnswers(adminUserId);
        
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
        logger.error('Error getting admin security answers:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const adminForgotPassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const { username, answers } = req.body;

        if (!username || !answers || !Array.isArray(answers)) {
            res.status(400).json({
                success: false,
                error: 'Username and security answers are required'
            });
            return;
        }

        // Find admin user by username
        const adminResult = await pool.query(
            `SELECT id FROM admin_users 
             WHERE username = $1 AND active = true`,
            [username]
        );

        if (adminResult.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: 'Admin user not found'
            });
            return;
        }

        const adminUserId = adminResult.rows[0].id;

        // Verify security answers
        const isValid = await adminProfileService.verifyAdminSecurityAnswers(adminUserId, answers);
        
        if (!isValid) {
            res.status(400).json({
                success: false,
                error: 'One or more security answers are incorrect'
            });
            return;
        }

        // Create reset token
        const token = await adminProfileService.createAdminPasswordResetToken(adminUserId);

        res.json({
            success: true,
            message: 'Admin password reset token generated successfully',
            token
        });
    } catch (error) {
        logger.error('Error in admin forgot password:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const validateAdminResetToken = async (req: Request, res: Response): Promise<void> => {
    try {
        const { token } = req.params;

        const adminUserId = await adminProfileService.validateAdminPasswordResetToken(token);
        
        if (!adminUserId) {
            res.status(400).json({
                success: false,
                error: 'Invalid or expired token'
            });
            return;
        }

        res.json({
            success: true,
            message: 'Admin token is valid'
        });
    } catch (error) {
        logger.error('Error validating admin reset token:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const resetAdminPassword = async (req: Request, res: Response): Promise<void> => {
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

        await adminProfileService.resetAdminPassword(token, new_password);

        res.json({
            success: true,
            message: 'Admin password reset successfully'
        });
    } catch (error) {
        logger.error('Error resetting admin password:', error);
        res.status(500).json({
            success: false,
            error: (error as Error).message || 'Internal server error'
        });
    }
};

export const changeAdminPassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const adminUserId = req.admin!.id;
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

        await adminProfileService.changeAdminPassword(adminUserId, current_password, new_password);

        res.json({
            success: true,
            message: 'Admin password changed successfully'
        });
    } catch (error) {
        logger.error('Error changing admin password:', error);
        res.status(400).json({
            success: false,
            error: (error as Error).message || 'Internal server error'
        });
    }
};
