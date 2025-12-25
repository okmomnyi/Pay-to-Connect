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

    constructor() {
        this.baseUrl = process.env.MPESA_ENVIRONMENT === 'production' 
            ? 'https://api.safaricom.co.ke' 
            : 'https://sandbox.safaricom.co.ke';
        this.consumerKey = process.env.MPESA_CONSUMER_KEY!;
        this.consumerSecret = process.env.MPESA_CONSUMER_SECRET!;
        this.shortcode = process.env.MPESA_SHORTCODE!;
        this.passkey = process.env.MPESA_PASSKEY!;
        this.callbackUrl = process.env.MPESA_CALLBACK_URL!;
        this.db = DatabaseConnection.getInstance();
    }

    private async getAccessToken(): Promise<string> {
        try {
            const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
            
            const response = await axios.get(`${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                }
            });

            return response.data.access_token;
        } catch (error) {
            logger.error('Failed to get M-Pesa access token:', error);
            throw new Error('Failed to authenticate with M-Pesa API');
        }
    }

    private generatePassword(): { password: string; timestamp: string } {
        const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
        const password = Buffer.from(`${this.shortcode}${this.passkey}${timestamp}`).toString('base64');
        return { password, timestamp };
    }

    private validatePhoneNumber(phone: string): boolean {
        const cleanedPhone = this.formatPhoneNumber(phone);
        return /^254[17]\d{8}$/.test(cleanedPhone);
    }

    private formatPhoneNumber(phone: string): string {
        // Remove any non-digit characters
        let cleaned = phone.replace(/\D/g, '');
        
        // Handle different formats
        if (cleaned.startsWith('0')) {
            cleaned = '254' + cleaned.slice(1);
        } else if (cleaned.startsWith('+254')) {
            cleaned = cleaned.slice(1);
        } else if (cleaned.startsWith('254')) {
            // Already in correct format
        } else if (cleaned.length === 9) {
            cleaned = '254' + cleaned;
        }
        
        return cleaned;
    }

    public async initiateSTKPush(phone: string, amount: number, accountReference: string): Promise<{ success: boolean; checkoutRequestId?: string; error?: string }> {
        try {
            // Validate phone number
            if (!this.validatePhoneNumber(phone)) {
                return {
                    success: false,
                    error: 'Invalid phone number. Please use a valid Safaricom number.'
                };
            }

            // Validate amount
            if (amount < 1 || amount > 250000) {
                return {
                    success: false,
                    error: 'Amount must be between KES 1 and KES 250,000'
                };
            }

            const accessToken = await this.getAccessToken();
            const { password, timestamp } = this.generatePassword();
            const formattedPhone = this.formatPhoneNumber(phone);

            const stkPushData: STKPushRequest = {
                BusinessShortCode: this.shortcode,
                Password: password,
                Timestamp: timestamp,
                TransactionType: 'CustomerPayBillOnline',
                Amount: amount,
                PartyA: formattedPhone,
                PartyB: this.shortcode,
                PhoneNumber: formattedPhone,
                CallBackURL: this.callbackUrl,
                AccountReference: accountReference,
                TransactionDesc: `WiFi Access`
            };

            const response = await axios.post(
                `${this.baseUrl}/mpesa/stkpush/v1/processrequest`,
                stkPushData,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const result: STKPushResponse = response.data;

            if (result.ResponseCode === '0') {
                // Store payment record
                await this.db.query(
                    `INSERT INTO payments (phone, amount, mpesa_checkout_request_id, status) 
                     VALUES ($1, $2, $3, $4)`,
                    [phone, amount, result.CheckoutRequestID, 'pending']
                );

                logger.info(`STK Push initiated successfully for ${phone}, CheckoutRequestID: ${result.CheckoutRequestID}`);
                
                return {
                    success: true,
                    checkoutRequestId: result.CheckoutRequestID
                };
            } else {
                logger.error(`STK Push failed: ${result.ResponseDescription}`);
                return {
                    success: false,
                    error: result.ResponseDescription
                };
            }
        } catch (error) {
            logger.error('STK Push initiation failed:', error);
            return {
                success: false,
                error: 'Failed to initiate payment. Please try again.'
            };
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
                 SET status = $1, mpesa_receipt = $2, raw_callback = $3, updated_at = NOW()
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
                'SELECT status, mpesa_receipt FROM payments WHERE id = $1',
                [paymentId]
            );

            if (result.rows.length === 0) {
                return false;
            }

            const payment = result.rows[0];
            return payment.status === 'success' && payment.mpesa_receipt !== null;
        } catch (error) {
            logger.error('Failed to verify payment:', error);
            return false;
        }
    }
}

export default MpesaService;
