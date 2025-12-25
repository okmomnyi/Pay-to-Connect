import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import Joi from 'joi';
import DatabaseConnection from '../database/connection';
import { logger } from '../utils/logger';
import OTPService from '../services/otpService';
import crypto from 'crypto';

export interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        username: string;
        email: string;
        phone: string;
    };
}

export class EnhancedAdminController {
    private db: DatabaseConnection;
    private otpService: OTPService;

    constructor() {
        this.db = DatabaseConnection.getInstance();
        this.otpService = new OTPService();
    }

    /**
     * Register new admin account with OTP verification
     */
    async register(req: Request, res: Response): Promise<void> {
        try {
            const schema = Joi.object({
                username: Joi.string().alphanum().min(3).max(30).required(),
                email: Joi.string().email().required(),
                phone: Joi.string().pattern(/^\+[1-9]\d{1,14}$/).required(),
                password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).required(),
                confirmPassword: Joi.string().valid(Joi.ref('password')).required()
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                res.status(400).json({
                    success: false,
                    error: error.details[0].message
                });
                return;
            }

            const { username, email, phone, password } = value;

            // Check if user already exists
            const existingUser = await this.db.query(
                'SELECT id FROM admin_users WHERE username = $1 OR email = $2 OR phone = $3',
                [username, email, phone]
            );

            if (existingUser.rows.length > 0) {
                res.status(409).json({
                    success: false,
                    error: 'User with this username, email, or phone already exists'
                });
                return;
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS || '12'));

            // Create user (unverified)
            const userResult = await this.db.query(
                `INSERT INTO admin_users (username, email, phone, password_hash, is_verified)
                 VALUES ($1, $2, $3, $4, false)
                 RETURNING id, username, email, phone`,
                [username, email, phone, hashedPassword]
            );

            const newUser = userResult.rows[0];

            // Generate OTP for email verification
            const { otpCode, verificationId } = await this.otpService.createOTPVerification(
                'registration',
                email,
                phone,
                newUser.id
            );

            // Send OTP via email and SMS
            const emailSent = await this.otpService.sendOTPEmail(email, otpCode, 'registration');
            const smsSent = await this.otpService.sendOTPSMS(phone, otpCode, 'registration');

            // Log audit trail
            await this.logAuditAction(newUser.id, 'user_registration', 'admin_users', newUser.id, req, {
                username,
                email,
                phone,
                emailSent,
                smsSent
            });

            res.status(201).json({
                success: true,
                message: 'Account created successfully. Please verify your email/phone with the OTP sent.',
                verificationId,
                emailSent,
                smsSent,
                user: {
                    id: newUser.id,
                    username: newUser.username,
                    email: newUser.email,
                    phone: newUser.phone,
                    isVerified: false
                }
            });

        } catch (error: any) {
            logger.error('Registration failed:', error);
            res.status(500).json({
                success: false,
                error: 'Registration failed'
            });
        }
    }

    /**
     * Verify OTP for account activation
     */
    async verifyRegistration(req: Request, res: Response): Promise<void> {
        try {
            const schema = Joi.object({
                verificationId: Joi.string().uuid().required(),
                otpCode: Joi.string().length(6).pattern(/^\d+$/).required(),
                email: Joi.string().email().required()
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                res.status(400).json({
                    success: false,
                    error: error.details[0].message
                });
                return;
            }

            const { verificationId, otpCode, email } = value;

            // Verify OTP
            const verification = await this.otpService.verifyOTP(verificationId, otpCode, email);

            if (!verification.success) {
                res.status(400).json({
                    success: false,
                    error: verification.message
                });
                return;
            }

            // Activate user account
            await this.db.query(
                'UPDATE admin_users SET is_verified = true WHERE id = $1',
                [verification.userId]
            );

            // Log audit trail
            await this.logAuditAction(verification.userId!, 'account_verified', 'admin_users', verification.userId!, req);

            res.json({
                success: true,
                message: 'Account verified successfully. You can now log in.'
            });

        } catch (error: any) {
            logger.error('Verification failed:', error);
            res.status(500).json({
                success: false,
                error: 'Verification failed'
            });
        }
    }

    /**
     * Login with username/email/phone and password, then send OTP
     */
    async login(req: Request, res: Response): Promise<void> {
        try {
            const schema = Joi.object({
                identifier: Joi.string().required(), // username, email, or phone
                password: Joi.string().required()
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                res.status(400).json({
                    success: false,
                    error: error.details[0].message
                });
                return;
            }

            const { identifier, password } = value;

            // Find user by username, email, or phone
            const userResult = await this.db.query(
                `SELECT id, username, email, phone, password_hash, is_verified, failed_login_attempts, locked_until
                 FROM admin_users 
                 WHERE username = $1 OR email = $1 OR phone = $1`,
                [identifier]
            );

            if (userResult.rows.length === 0) {
                // Log failed attempt
                await this.logAuditAction(null, 'login_failed', 'admin_users', null, req, { 
                    identifier, 
                    reason: 'user_not_found' 
                });

                res.status(401).json({
                    success: false,
                    error: 'Invalid credentials'
                });
                return;
            }

            const user = userResult.rows[0];

            // Check if account is locked
            if (user.locked_until && new Date(user.locked_until) > new Date()) {
                res.status(423).json({
                    success: false,
                    error: 'Account is temporarily locked due to too many failed attempts'
                });
                return;
            }

            // Check if account is verified
            if (!user.is_verified) {
                res.status(403).json({
                    success: false,
                    error: 'Account not verified. Please verify your email/phone first.'
                });
                return;
            }

            // Verify password
            const passwordMatch = await bcrypt.compare(password, user.password_hash);
            if (!passwordMatch) {
                // Increment failed attempts
                await this.handleFailedLogin(user.id);
                
                await this.logAuditAction(user.id, 'login_failed', 'admin_users', user.id, req, { 
                    identifier, 
                    reason: 'invalid_password' 
                });

                res.status(401).json({
                    success: false,
                    error: 'Invalid credentials'
                });
                return;
            }

            // Reset failed attempts on successful password verification
            await this.db.query(
                'UPDATE admin_users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
                [user.id]
            );

            // Generate OTP for login verification
            const { otpCode, verificationId } = await this.otpService.createOTPVerification(
                'login',
                user.email,
                user.phone,
                user.id
            );

            // Send OTP via email and SMS
            const emailSent = await this.otpService.sendOTPEmail(user.email, otpCode, 'login');
            const smsSent = await this.otpService.sendOTPSMS(user.phone, otpCode, 'login');

            await this.logAuditAction(user.id, 'login_otp_sent', 'admin_users', user.id, req, {
                emailSent,
                smsSent
            });

            res.json({
                success: true,
                message: 'OTP sent to your email and phone. Please verify to complete login.',
                verificationId,
                emailSent,
                smsSent,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    phone: user.phone
                }
            });

        } catch (error: any) {
            logger.error('Login failed:', error);
            res.status(500).json({
                success: false,
                error: 'Login failed'
            });
        }
    }

    /**
     * Verify OTP and complete login
     */
    async verifyLogin(req: Request, res: Response): Promise<void> {
        try {
            const schema = Joi.object({
                verificationId: Joi.string().uuid().required(),
                otpCode: Joi.string().length(6).pattern(/^\d+$/).required(),
                email: Joi.string().email().required()
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                res.status(400).json({
                    success: false,
                    error: error.details[0].message
                });
                return;
            }

            const { verificationId, otpCode, email } = value;

            // Verify OTP
            const verification = await this.otpService.verifyOTP(verificationId, otpCode, email);

            if (!verification.success) {
                res.status(400).json({
                    success: false,
                    error: verification.message
                });
                return;
            }

            // Get user details
            const userResult = await this.db.query(
                'SELECT id, username, email, phone FROM admin_users WHERE id = $1',
                [verification.userId]
            );

            const user = userResult.rows[0];

            // Generate JWT token
            const token = jwt.sign(
                { 
                    id: user.id, 
                    username: user.username,
                    email: user.email,
                    phone: user.phone
                },
                process.env.JWT_SECRET!,
                { expiresIn: '24h' }
            );

            // Create session record
            const sessionToken = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

            await this.db.query(
                `INSERT INTO admin_sessions (user_id, session_token, ip_address, user_agent, expires_at)
                 VALUES ($1, $2, $3, $4, $5)`,
                [user.id, sessionToken, req.ip, req.get('User-Agent'), expiresAt]
            );

            // Update last login
            await this.db.query(
                'UPDATE admin_users SET last_login = NOW() WHERE id = $1',
                [user.id]
            );

            // Log successful login
            await this.logAuditAction(user.id, 'login_success', 'admin_users', user.id, req);

            res.json({
                success: true,
                message: 'Login successful',
                token,
                sessionToken,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    phone: user.phone
                }
            });

        } catch (error: any) {
            logger.error('Login verification failed:', error);
            res.status(500).json({
                success: false,
                error: 'Login verification failed'
            });
        }
    }

    /**
     * Logout and invalidate session
     */
    async logout(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const sessionToken = req.headers['x-session-token'] as string;

            if (sessionToken) {
                // Invalidate session
                await this.db.query(
                    'UPDATE admin_sessions SET is_active = false WHERE session_token = $1',
                    [sessionToken]
                );
            }

            // Log logout
            await this.logAuditAction(req.user?.id!, 'logout', 'admin_users', req.user?.id!, req);

            res.json({
                success: true,
                message: 'Logged out successfully'
            });

        } catch (error: any) {
            logger.error('Logout failed:', error);
            res.status(500).json({
                success: false,
                error: 'Logout failed'
            });
        }
    }

    /**
     * Get dashboard statistics
     */
    async getDashboard(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            // Get various statistics
            const [
                totalUsers,
                activeSessions,
                totalPayments,
                recentPayments,
                packageStats,
                routerStats
            ] = await Promise.all([
                this.db.query('SELECT COUNT(*) as count FROM devices'),
                this.db.query('SELECT COUNT(*) as count FROM sessions WHERE active = true AND end_time > NOW()'),
                this.db.query('SELECT COUNT(*) as count, SUM(amount) as total FROM payments WHERE status = $1', ['success']),
                this.db.query(`
                    SELECT p.*, d.mac_address, d.device_name 
                    FROM payments p 
                    LEFT JOIN devices d ON p.device_id = d.id 
                    ORDER BY p.created_at DESC 
                    LIMIT 10
                `),
                this.db.query(`
                    SELECT pkg.name, COUNT(p.id) as payment_count, SUM(p.amount) as total_revenue
                    FROM packages pkg
                    LEFT JOIN payments p ON pkg.id = p.package_id AND p.status = 'success'
                    GROUP BY pkg.id, pkg.name
                    ORDER BY total_revenue DESC
                `),
                this.db.query('SELECT COUNT(*) as count FROM routers WHERE active = true')
            ]);

            const stats = {
                totalUsers: parseInt(totalUsers.rows[0].count),
                activeSessions: parseInt(activeSessions.rows[0].count),
                totalPayments: parseInt(totalPayments.rows[0].count),
                totalRevenue: parseFloat(totalPayments.rows[0].total || '0'),
                activeRouters: parseInt(routerStats.rows[0].count),
                recentPayments: recentPayments.rows,
                packageStats: packageStats.rows
            };

            // Log dashboard access
            await this.logAuditAction(req.user?.id!, 'dashboard_access', 'dashboard', null, req);

            res.json({
                success: true,
                stats
            });

        } catch (error: any) {
            logger.error('Failed to get dashboard:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to load dashboard'
            });
        }
    }

    /**
     * Handle failed login attempts
     */
    private async handleFailedLogin(userId: string): Promise<void> {
        const result = await this.db.query(
            'UPDATE admin_users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = $1 RETURNING failed_login_attempts',
            [userId]
        );

        const attempts = result.rows[0].failed_login_attempts;

        // Lock account after 5 failed attempts for 30 minutes
        if (attempts >= 5) {
            const lockUntil = new Date(Date.now() + 30 * 60 * 1000);
            await this.db.query(
                'UPDATE admin_users SET locked_until = $1 WHERE id = $2',
                [lockUntil, userId]
            );
        }
    }

    /**
     * Log audit actions
     */
    private async logAuditAction(
        userId: string | null,
        action: string,
        resource: string,
        resourceId: string | null,
        req: Request,
        details?: any,
        success: boolean = true
    ): Promise<void> {
        try {
            await this.db.query(
                `INSERT INTO admin_audit_logs (user_id, action, resource, resource_id, ip_address, user_agent, details, success)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    userId,
                    action,
                    resource,
                    resourceId,
                    req.ip,
                    req.get('User-Agent'),
                    details ? JSON.stringify(details) : null,
                    success
                ]
            );
        } catch (error) {
            logger.error('Failed to log audit action:', error);
        }
    }
}

export default EnhancedAdminController;
