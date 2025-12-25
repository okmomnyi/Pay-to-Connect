import crypto from 'crypto';
import nodemailer from 'nodemailer';
import twilio from 'twilio';
import DatabaseConnection from '../database/connection';
import { logger } from '../utils/logger';

export interface OTPVerification {
    id: string;
    userId?: string;
    email?: string;
    phone?: string;
    otpCode: string;
    otpType: 'registration' | 'login' | 'password_reset';
    expiresAt: Date;
    verified: boolean;
    attempts: number;
}

export class OTPService {
    private db: DatabaseConnection;
    private emailTransporter: nodemailer.Transporter | null = null;
    private twilioClient: twilio.Twilio | null = null;

    constructor() {
        this.db = DatabaseConnection.getInstance();
        this.initializeEmailService();
        this.initializeSMSService();
    }

    private initializeEmailService(): void {
        try {
            // Configure email service (using Gmail SMTP as example)
            this.emailTransporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.EMAIL_USER || 'your-email@gmail.com',
                    pass: process.env.EMAIL_PASSWORD || 'your-app-password'
                }
            });
            
            logger.info('Email service initialized');
        } catch (error) {
            logger.error('Failed to initialize email service:', error);
        }
    }

    private initializeSMSService(): void {
        try {
            if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
                this.twilioClient = twilio(
                    process.env.TWILIO_ACCOUNT_SID,
                    process.env.TWILIO_AUTH_TOKEN
                );
                logger.info('SMS service initialized');
            } else {
                logger.warn('Twilio credentials not found, SMS service disabled');
            }
        } catch (error) {
            logger.error('Failed to initialize SMS service:', error);
        }
    }

    /**
     * Generate a 6-digit OTP code
     */
    private generateOTP(): string {
        return crypto.randomInt(100000, 999999).toString();
    }

    /**
     * Create and store OTP verification record
     */
    async createOTPVerification(
        type: 'registration' | 'login' | 'password_reset',
        email?: string,
        phone?: string,
        userId?: string
    ): Promise<{ otpCode: string; verificationId: string }> {
        const otpCode = this.generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        try {
            const query = `
                INSERT INTO otp_verifications (user_id, email, phone, otp_code, otp_type, expires_at)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id
            `;

            const result = await this.db.query(query, [
                userId || null,
                email || null,
                phone || null,
                otpCode,
                type,
                expiresAt
            ]);

            const verificationId = result.rows[0].id;

            logger.info(`OTP created for ${email || phone}`, {
                verificationId,
                type,
                expiresAt
            });

            return { otpCode, verificationId };
        } catch (error) {
            logger.error('Failed to create OTP verification:', error);
            throw new Error('Failed to create OTP verification');
        }
    }

    /**
     * Send OTP via email
     */
    async sendOTPEmail(email: string, otpCode: string, type: string): Promise<boolean> {
        if (!this.emailTransporter) {
            logger.error('Email service not available');
            return false;
        }

        try {
            const subject = this.getEmailSubject(type);
            const htmlContent = this.getEmailTemplate(otpCode, type);

            await this.emailTransporter.sendMail({
                from: process.env.EMAIL_FROM || 'Pay-to-Connect <noreply@paytoconnect.local>',
                to: email,
                subject,
                html: htmlContent
            });

            logger.info(`OTP email sent to ${email}`);
            return true;
        } catch (error) {
            logger.error('Failed to send OTP email:', error);
            return false;
        }
    }

    /**
     * Send OTP via SMS
     */
    async sendOTPSMS(phone: string, otpCode: string, type: string): Promise<boolean> {
        if (!this.twilioClient) {
            logger.error('SMS service not available');
            return false;
        }

        try {
            const message = this.getSMSMessage(otpCode, type);

            await this.twilioClient.messages.create({
                body: message,
                from: process.env.TWILIO_PHONE_NUMBER || '+1234567890',
                to: phone
            });

            logger.info(`OTP SMS sent to ${phone}`);
            return true;
        } catch (error) {
            logger.error('Failed to send OTP SMS:', error);
            return false;
        }
    }

    /**
     * Verify OTP code
     */
    async verifyOTP(
        verificationId: string,
        otpCode: string,
        email?: string,
        phone?: string
    ): Promise<{ success: boolean; userId?: string; message: string }> {
        try {
            // Get OTP verification record
            const query = `
                SELECT id, user_id, email, phone, otp_code, otp_type, expires_at, verified, attempts
                FROM otp_verifications
                WHERE id = $1 AND verified = false
            `;

            const result = await this.db.query(query, [verificationId]);

            if (result.rows.length === 0) {
                return { success: false, message: 'Invalid or expired verification code' };
            }

            const verification = result.rows[0];

            // Check if OTP has expired
            if (new Date() > new Date(verification.expires_at)) {
                await this.deleteOTPVerification(verificationId);
                return { success: false, message: 'Verification code has expired' };
            }

            // Check attempts limit
            if (verification.attempts >= 3) {
                await this.deleteOTPVerification(verificationId);
                return { success: false, message: 'Too many failed attempts' };
            }

            // Verify contact method matches
            if (email && verification.email !== email) {
                return { success: false, message: 'Email mismatch' };
            }

            if (phone && verification.phone !== phone) {
                return { success: false, message: 'Phone number mismatch' };
            }

            // Check OTP code
            if (verification.otp_code !== otpCode) {
                // Increment attempts
                await this.db.query(
                    'UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = $1',
                    [verificationId]
                );
                return { success: false, message: 'Invalid verification code' };
            }

            // Mark as verified
            await this.db.query(
                'UPDATE otp_verifications SET verified = true WHERE id = $1',
                [verificationId]
            );

            logger.info(`OTP verified successfully for ${email || phone}`);

            return {
                success: true,
                userId: verification.user_id,
                message: 'Verification successful'
            };
        } catch (error) {
            logger.error('Failed to verify OTP:', error);
            return { success: false, message: 'Verification failed' };
        }
    }

    /**
     * Delete OTP verification record
     */
    async deleteOTPVerification(verificationId: string): Promise<void> {
        try {
            await this.db.query('DELETE FROM otp_verifications WHERE id = $1', [verificationId]);
        } catch (error) {
            logger.error('Failed to delete OTP verification:', error);
        }
    }

    /**
     * Clean up expired OTP records
     */
    async cleanupExpiredOTPs(): Promise<void> {
        try {
            const result = await this.db.query(
                'DELETE FROM otp_verifications WHERE expires_at < NOW()'
            );
            
            if (result.rowCount && result.rowCount > 0) {
                logger.info(`Cleaned up ${result.rowCount} expired OTP records`);
            }
        } catch (error) {
            logger.error('Failed to cleanup expired OTPs:', error);
        }
    }

    /**
     * Get email subject based on OTP type
     */
    private getEmailSubject(type: string): string {
        switch (type) {
            case 'registration':
                return 'Complete Your Pay-to-Connect Registration';
            case 'login':
                return 'Your Pay-to-Connect Login Code';
            case 'password_reset':
                return 'Reset Your Pay-to-Connect Password';
            default:
                return 'Your Pay-to-Connect Verification Code';
        }
    }

    /**
     * Get email HTML template
     */
    private getEmailTemplate(otpCode: string, type: string): string {
        const title = this.getEmailSubject(type);
        const message = this.getEmailMessage(type);

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${title}</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
                .content { padding: 30px 20px; background: #f9fafb; }
                .otp-code { 
                    font-size: 32px; 
                    font-weight: bold; 
                    color: #2563eb; 
                    text-align: center; 
                    padding: 20px; 
                    background: white; 
                    border-radius: 8px; 
                    margin: 20px 0; 
                    letter-spacing: 4px;
                }
                .footer { padding: 20px; text-align: center; color: #666; font-size: 14px; }
                .warning { color: #dc2626; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Pay-to-Connect</h1>
                </div>
                <div class="content">
                    <h2>${title}</h2>
                    <p>${message}</p>
                    <div class="otp-code">${otpCode}</div>
                    <p>This code will expire in 10 minutes.</p>
                    <p class="warning">Do not share this code with anyone.</p>
                </div>
                <div class="footer">
                    <p>If you didn't request this code, please ignore this email.</p>
                    <p>&copy; 2025 Pay-to-Connect. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    /**
     * Get email message based on type
     */
    private getEmailMessage(type: string): string {
        switch (type) {
            case 'registration':
                return 'Welcome to Pay-to-Connect! Use the verification code below to complete your registration:';
            case 'login':
                return 'Use the verification code below to log in to your Pay-to-Connect admin account:';
            case 'password_reset':
                return 'Use the verification code below to reset your Pay-to-Connect password:';
            default:
                return 'Use the verification code below to proceed:';
        }
    }

    /**
     * Get SMS message
     */
    private getSMSMessage(otpCode: string, type: string): string {
        const action = type === 'registration' ? 'registration' : 
                      type === 'login' ? 'login' : 'password reset';
        
        return `Your Pay-to-Connect ${action} code is: ${otpCode}. Valid for 10 minutes. Do not share this code.`;
    }
}

export default OTPService;
