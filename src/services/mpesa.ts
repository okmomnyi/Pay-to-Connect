import axios from 'axios';
import crypto from 'crypto';
import DatabaseConnection from '../database/connection';
import { logger } from '../utils/logger';

interface STKPushRequest {
    BusinessShortCode: string;
    Password: string;
    Timestamp: string;
    TransactionType: string;
    Amount: number;
    PartyA: string;
    PartyB: string;
    PhoneNumber: string;
    CallBackURL: string;
    AccountReference: string;
    TransactionDesc: string;
}

interface STKPushResponse {
    MerchantRequestID: string;
    CheckoutRequestID: string;
    ResponseCode: string;
    ResponseDescription: string;
    CustomerMessage: string;
}

interface CallbackPayload {
    Body: {
        stkCallback: {
            MerchantRequestID: string;
            CheckoutRequestID: string;
            ResultCode: number;
            ResultDesc: string;
            CallbackMetadata?: {
                Item: Array<{
                    Name: string;
                    Value: any;
                }>;
            };
        };
    };
}

class MpesaService {
    private baseUrl: string;
    private consumerKey: string;
    private consumerSecret: string;
    private shortcode: string;
    private passkey: string;
    private callbackUrl: string;
    private db: DatabaseConnection;
    private isConfigured: boolean = false;

    constructor() {
        this.baseUrl = process.env.MPESA_ENVIRONMENT === 'production'
            ? 'https://api.safaricom.co.ke'
            : 'https://sandbox.safaricom.co.ke';
        this.consumerKey = process.env.MPESA_CONSUMER_KEY || '';
        this.consumerSecret = process.env.MPESA_CONSUMER_SECRET || '';
        this.shortcode = process.env.MPESA_SHORTCODE || '';
        this.passkey = process.env.MPESA_PASSKEY || '';
        this.callbackUrl = process.env.MPESA_CALLBACK_URL || '';
        this.db = DatabaseConnection.getInstance();

        // Validate M-Pesa configuration
        this.validateConfiguration();
    }

    private validateConfiguration(): void {
        const missing: string[] = [];

        if (!this.consumerKey) missing.push('MPESA_CONSUMER_KEY');
        if (!this.consumerSecret) missing.push('MPESA_CONSUMER_SECRET');
        if (!this.shortcode) missing.push('MPESA_SHORTCODE');
        if (!this.passkey) missing.push('MPESA_PASSKEY');
        if (!this.callbackUrl) missing.push('MPESA_CALLBACK_URL');

        if (missing.length > 0) {
            logger.warn(`M-Pesa configuration incomplete. Missing: ${missing.join(', ')}`);
            logger.warn('M-Pesa STK Push will not work until all credentials are configured.');
            this.isConfigured = false;
        } else {
            logger.info('M-Pesa configuration validated successfully');
            logger.info(`M-Pesa Environment: ${process.env.MPESA_ENVIRONMENT || 'sandbox'}`);
            logger.info(`M-Pesa Shortcode: ${this.shortcode}`);
            logger.info(`M-Pesa Callback URL: ${this.callbackUrl}`);
            this.isConfigured = true;
        }
    }

    private async getAccessToken(): Promise<string> {
        try {
            if (!this.isConfigured) {
                throw new Error('M-Pesa is not configured. Please check environment variables.');
            }

            const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');

            logger.info(`Requesting M-Pesa access token from ${this.baseUrl}`);

            const response = await axios.get(`${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000 // 30 second timeout
            });

            if (!response.data.access_token) {
                logger.error('M-Pesa API returned response without access_token:', response.data);
                throw new Error('Invalid response from M-Pesa API');
            }

            logger.info('M-Pesa access token obtained successfully');
            return response.data.access_token;
        } catch (error: any) {
            logger.error('Failed to get M-Pesa access token:', {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status
            });
            throw new Error('Failed to authenticate with M-Pesa API. Please check credentials.');
        }
    }

    private generatePassword(): { password: string; timestamp: string } {
        // Format: YYYYMMDDHHmmss (14 digits)
        const now = new Date();
        const timestamp = now.getFullYear().toString() +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0') +
            String(now.getHours()).padStart(2, '0') +
            String(now.getMinutes()).padStart(2, '0') +
            String(now.getSeconds()).padStart(2, '0');

        const password = Buffer.from(`${this.shortcode}${this.passkey}${timestamp}`).toString('base64');
        return { password, timestamp };
    }

    private validatePhoneNumber(phone: string): boolean {
        const cleanedPhone = this.formatPhoneNumber(phone);
        // Accept Safaricom numbers: 254 + (7xx, 1xx) + 7 more digits = 12 digits total
        // 7xx series: 700-729, 740-799 (traditional Safaricom)
        // 1xx series: 110-119 (new Safaricom numbers)
        return /^254(7\d{8}|1[01]\d{7})$/.test(cleanedPhone);
    }

    private formatPhoneNumber(phone: string): string {
        // Remove any non-digit characters
        let cleaned = phone.replace(/\D/g, '');

        // Handle different formats
        if (cleaned.startsWith('0')) {
            cleaned = '254' + cleaned.slice(1);
        } else if (cleaned.startsWith('+254')) {
            cleaned = cleaned.slice(1); // Remove + to get 254...
        } else if (cleaned.startsWith('254')) {
            // Already in correct format
        } else if (cleaned.length === 9) {
            cleaned = '254' + cleaned;
        }

        return cleaned;
    }

    // Initiate STK Push. The caller must create the payment record first and pass its ID.
    // This function only talks to Safaricom and updates the payment with the checkoutRequestId.
    public async initiateSTKPush(paymentId: string, phone: string, amount: number, accountReference: string): Promise<{ success: boolean; checkoutRequestId?: string; error?: string }> {
        try {
            if (!this.isConfigured) {
                logger.error('M-Pesa STK Push attempted but M-Pesa is not configured');
                return { success: false, error: 'Payment service is not configured. Please contact support.' };
            }

            if (!this.validatePhoneNumber(phone)) {
                logger.warn(`Invalid phone number attempted: ${phone}`);
                return { success: false, error: 'Invalid phone number. Please use a valid Safaricom number.' };
            }

            if (amount < 1 || amount > 250000) {
                return { success: false, error: 'Amount must be between KES 1 and KES 250,000' };
            }

            logger.info(`Initiating STK Push - Phone: ${phone}, Amount: ${amount}, Ref: ${accountReference}`);

            const accessToken = await this.getAccessToken();
            const { password, timestamp } = this.generatePassword();
            const formattedPhone = this.formatPhoneNumber(phone);

            const stkPushData: STKPushRequest = {
                BusinessShortCode: this.shortcode,
                Password: password,
                Timestamp: timestamp,
                TransactionType: 'CustomerPayBillOnline',
                Amount: Math.ceil(amount), // M-Pesa requires integer amounts
                PartyA: formattedPhone,
                PartyB: this.shortcode,
                PhoneNumber: formattedPhone,
                CallBackURL: this.callbackUrl,
                AccountReference: accountReference,
                TransactionDesc: 'WiFi Access'
            };

            const response = await axios.post(
                `${this.baseUrl}/mpesa/stkpush/v1/processrequest`,
                stkPushData,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            const result: STKPushResponse = response.data;

            logger.info('STK Push API Response:', {
                ResponseCode: result.ResponseCode,
                ResponseDescription: result.ResponseDescription,
                CheckoutRequestID: result.CheckoutRequestID
            });

            if (result.ResponseCode === '0') {
                // Save the checkoutRequestId to the pre-created payment record
                await this.db.query(
                    `UPDATE payments SET mpesa_checkout_request_id = $1, updated_at = NOW() WHERE id = $2`,
                    [result.CheckoutRequestID, paymentId]
                );
                logger.info(`STK Push initiated for payment ${paymentId}, CheckoutRequestID: ${result.CheckoutRequestID}`);
                return { success: true, checkoutRequestId: result.CheckoutRequestID };
            } else {
                await this.db.query(
                    `UPDATE payments SET status = 'failed', updated_at = NOW() WHERE id = $1`,
                    [paymentId]
                );
                logger.error(`STK Push failed: ${result.ResponseDescription}`);
                return { success: false, error: result.ResponseDescription };
            }
        } catch (error: any) {
            logger.error('STK Push initiation failed:', error);
            await this.db.query(
                `UPDATE payments SET status = 'failed', updated_at = NOW() WHERE id = $1`,
                [paymentId]
            ).catch(() => {}); // best-effort
            return { success: false, error: 'Failed to initiate payment. Please try again.' };
        }
    }

    public async handleCallback(payload: CallbackPayload): Promise<{ success: boolean; paymentId?: string }> {
        try {
            const callback = payload.Body.stkCallback;
            const checkoutRequestId = callback.CheckoutRequestID;

            logger.info(`Processing M-Pesa callback for CheckoutRequestID: ${checkoutRequestId}`);

            // Check if callback already processed (idempotency)
            const existingPayment = await this.db.query(
                'SELECT id, status FROM payments WHERE mpesa_checkout_request_id = $1',
                [checkoutRequestId]
            );

            if (existingPayment.rows.length === 0) {
                logger.error(`No payment record found for CheckoutRequestID: ${checkoutRequestId}`);
                return { success: false };
            }

            const payment = existingPayment.rows[0];

            // If already processed, return success
            if (payment.status !== 'pending') {
                logger.info(`Payment ${payment.id} already processed with status: ${payment.status}`);
                return { success: true, paymentId: payment.id };
            }

            let status: string;
            let mpesaReceipt: string | null = null;

            if (callback.ResultCode === 0) {
                status = 'success';

                // Extract M-Pesa receipt from callback metadata
                if (callback.CallbackMetadata?.Item) {
                    const receiptItem = callback.CallbackMetadata.Item.find(
                        item => item.Name === 'MpesaReceiptNumber'
                    );
                    if (receiptItem) {
                        mpesaReceipt = receiptItem.Value;
                    }
                }
            } else {
                status = 'failed';
                logger.info(`Payment failed: ${callback.ResultDesc}`);
            }

            // Update payment record
            await this.db.query(
                `UPDATE payments 
                 SET status = $1, mpesa_receipt_number = $2, raw_callback = $3, updated_at = NOW()
                 WHERE mpesa_checkout_request_id = $4`,
                [status, mpesaReceipt, JSON.stringify(payload), checkoutRequestId]
            );

            logger.info(`Payment ${payment.id} updated with status: ${status}`);

            return { success: true, paymentId: payment.id };
        } catch (error) {
            logger.error('Failed to process M-Pesa callback:', error);
            return { success: false };
        }
    }

    public async getPaymentStatus(checkoutRequestId: string): Promise<{ status: string; paymentId?: string }> {
        try {
            const result = await this.db.query(
                'SELECT id, status FROM payments WHERE mpesa_checkout_request_id = $1',
                [checkoutRequestId]
            );

            if (result.rows.length === 0) {
                return { status: 'not_found' };
            }

            return {
                status: result.rows[0].status,
                paymentId: result.rows[0].id
            };
        } catch (error) {
            logger.error('Failed to get payment status:', error);
            return { status: 'error' };
        }
    }

    public async verifyPayment(paymentId: string): Promise<boolean> {
        try {
            const result = await this.db.query(
                'SELECT status, mpesa_receipt_number FROM payments WHERE id = $1',
                [paymentId]
            );

            if (result.rows.length === 0) {
                return false;
            }

            const payment = result.rows[0];
            return payment.status === 'success' && payment.mpesa_receipt_number !== null;
        } catch (error) {
            logger.error('Failed to verify payment:', error);
            return false;
        }
    }
}

export default MpesaService;
