import nodemailer, { Transporter } from 'nodemailer';
import { logger } from '../utils/logger';

class EmailService {
    private transporter: Transporter | null = null;
    private from: string;
    private enabled: boolean;

    constructor() {
        this.from = process.env.EMAIL_FROM || `SmartWiFi <noreply@${process.env.SERVER_HOST || 'localhost'}>`;
        this.enabled = !!process.env.EMAIL_HOST;

        if (this.enabled) {
            this.transporter = nodemailer.createTransport({
                host: process.env.EMAIL_HOST,
                port: parseInt(process.env.EMAIL_PORT || '587'),
                secure: process.env.EMAIL_SECURE === 'true', // true = port 465, false = STARTTLS
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS,
                },
            });
        } else {
            logger.warn('EMAIL_HOST not set — email sending is disabled. Password reset tokens will be logged only.');
        }
    }

    async sendPasswordReset(toEmail: string, resetToken: string): Promise<boolean> {
        const serverHost = process.env.SERVER_HOST || 'localhost:3000';
        const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
        const resetUrl = `${protocol}://${serverHost}/forgot-password?token=${resetToken}`;

        const subject = 'Reset your SmartWiFi password';
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #2563eb;">Password Reset Request</h2>
                <p>We received a request to reset the password for your SmartWiFi account (<strong>${toEmail}</strong>).</p>
                <p>Click the button below to reset your password. This link expires in <strong>1 hour</strong>.</p>
                <div style="text-align: center; margin: 32px 0;">
                    <a href="${resetUrl}"
                       style="background: #2563eb; color: white; padding: 12px 32px; border-radius: 6px;
                              text-decoration: none; font-size: 16px; font-weight: bold;">
                        Reset Password
                    </a>
                </div>
                <p style="color: #6b7280; font-size: 14px;">
                    If you did not request a password reset, you can safely ignore this email.
                    Your password will not change.
                </p>
                <p style="color: #6b7280; font-size: 14px;">
                    Or copy this link into your browser:<br>
                    <a href="${resetUrl}" style="color: #2563eb;">${resetUrl}</a>
                </p>
            </div>
        `;

        if (!this.enabled || !this.transporter) {
            // Development fallback — log the URL so the developer can test manually
            logger.warn(`[EMAIL DISABLED] Password reset link for ${toEmail}: ${resetUrl}`);
            return false;
        }

        try {
            await this.transporter.sendMail({
                from: this.from,
                to: toEmail,
                subject,
                html,
            });
            logger.info(`Password reset email sent to ${toEmail}`);
            return true;
        } catch (error) {
            logger.error(`Failed to send password reset email to ${toEmail}:`, error);
            return false;
        }
    }
}

const emailService = new EmailService();
export default emailService;
