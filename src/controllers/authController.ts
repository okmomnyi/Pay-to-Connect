import { Request, Response } from 'express';
import authService from '../services/authService';
import { logger } from '../utils/logger';

export class AuthController {
    async register(req: Request, res: Response): Promise<void> {
        try {
            const { username, email, phone, password, first_name, last_name } = req.body;

            if (!username || !email || !phone || !password) {
                res.status(400).json({ error: 'Missing required fields' });
                return;
            }

            const result = await authService.register({
                username,
                email,
                phone,
                password,
                first_name,
                last_name,
            });

            res.status(201).json({
                success: true,
                message: 'Registration successful',
                user: result.user,
                token: result.token,
            });
        } catch (error: any) {
            logger.error('Registration error:', error);
            res.status(400).json({ error: error.message || 'Registration failed' });
        }
    }

    async login(req: Request, res: Response): Promise<void> {
        try {
            const { identifier, password } = req.body;

            if (!identifier || !password) {
                res.status(400).json({ error: 'Missing identifier or password' });
                return;
            }

            const ipAddress = req.ip;
            const userAgent = req.get('user-agent');

            const result = await authService.login(
                { identifier, password },
                ipAddress,
                userAgent
            );

            res.status(200).json({
                success: true,
                message: 'Login successful',
                user: result.user,
                token: result.token,
            });
        } catch (error: any) {
            logger.error('Login error:', error);
            res.status(401).json({ error: error.message || 'Login failed' });
        }
    }

    async logout(req: Request, res: Response): Promise<void> {
        try {
            const token = req.headers.authorization?.replace('Bearer ', '');

            if (!token) {
                res.status(400).json({ error: 'No token provided' });
                return;
            }

            await authService.logout(token);

            res.status(200).json({
                success: true,
                message: 'Logout successful',
            });
        } catch (error: any) {
            logger.error('Logout error:', error);
            res.status(500).json({ error: 'Logout failed' });
        }
    }

    async getProfile(req: Request, res: Response): Promise<void> {
        try {
            const userId = (req as any).user.id;

            const profile = await authService.getUserProfile(userId);

            res.status(200).json({
                success: true,
                profile,
            });
        } catch (error: any) {
            logger.error('Get profile error:', error);
            res.status(500).json({ error: 'Failed to get profile' });
        }
    }

    async changePassword(req: Request, res: Response): Promise<void> {
        try {
            const userId = (req as any).user.id;
            const { oldPassword, newPassword } = req.body;

            if (!oldPassword || !newPassword) {
                res.status(400).json({ error: 'Missing old or new password' });
                return;
            }

            if (newPassword.length < 8) {
                res.status(400).json({ error: 'New password must be at least 8 characters' });
                return;
            }

            await authService.changePassword(userId, oldPassword, newPassword);

            res.status(200).json({
                success: true,
                message: 'Password changed successfully',
            });
        } catch (error: any) {
            logger.error('Change password error:', error);
            res.status(400).json({ error: error.message || 'Failed to change password' });
        }
    }

    async requestPasswordReset(req: Request, res: Response): Promise<void> {
        try {
            const { email } = req.body;

            if (!email) {
                res.status(400).json({ error: 'Email is required' });
                return;
            }

            const token = await authService.generatePasswordResetToken(email);

            res.status(200).json({
                success: true,
                message: 'Password reset link sent',
                resetToken: token,
            });
        } catch (error: any) {
            logger.error('Password reset request error:', error);
            res.status(400).json({ error: error.message || 'Failed to request password reset' });
        }
    }

    async resetPassword(req: Request, res: Response): Promise<void> {
        try {
            const { token, newPassword } = req.body;

            if (!token || !newPassword) {
                res.status(400).json({ error: 'Token and new password are required' });
                return;
            }

            if (newPassword.length < 8) {
                res.status(400).json({ error: 'Password must be at least 8 characters' });
                return;
            }

            await authService.resetPassword(token, newPassword);

            res.status(200).json({
                success: true,
                message: 'Password reset successful',
            });
        } catch (error: any) {
            logger.error('Password reset error:', error);
            res.status(400).json({ error: error.message || 'Failed to reset password' });
        }
    }
}

export default new AuthController();
