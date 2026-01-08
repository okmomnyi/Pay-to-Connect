import axios from 'axios';
import pool from '../database/db';
import { logger } from '../utils/logger';
import sessionService from './sessionService';

interface MpesaSTKPushRequest {
    phoneNumber: string;
    amount: number;
    accountReference: string;
    transactionDesc: string;
}

interface Payment {
    id: string;
    phone: string;
    amount: number;
    status: string;
    mpesa_receipt?: string;
    mpesa_checkout_request_id?: string;
}

export class PaymentService {
    private consumerKey: string;
    private consumerSecret: string;
    private shortcode: string;
    private passkey: string;
    private callbackUrl: string;
    private environment: string;

    constructor() {
        this.consumerKey = process.env.MPESA_CONSUMER_KEY || '';
        this.consumerSecret = process.env.MPESA_CONSUMER_SECRET || '';
        this.shortcode = process.env.MPESA_SHORTCODE || '';
        this.passkey = process.env.MPESA_PASSKEY || '';
        this.callbackUrl = process.env.MPESA_CALLBACK_URL || '';
        this.environment = process.env.MPESA_ENVIRONMENT || 'sandbox';
    }

    private async getAccessToken(): Promise<string> {
        const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
        const url = this.environment === 'production'
            ? 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
            : 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';

        try {
            const response = await axios.get(url, {
                headers: {
                    Authorization: `Basic ${auth}`,
                },
            });

            return response.data.access_token;
        } catch (error) {
            logger.error('Failed to get M-Pesa access token:', error);
            throw new Error('Failed to authenticate with M-Pesa');
        }
    }

    async initiateStkPush(data: MpesaSTKPushRequest): Promise<Payment> {
        const { phoneNumber, amount, accountReference, transactionDesc } = data;

        const formattedPhone = phoneNumber.startsWith('0')
            ? `254${phoneNumber.substring(1)}`
            : phoneNumber.startsWith('+')
            ? phoneNumber.substring(1)
            : phoneNumber;

        const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
        const password = Buffer.from(`${this.shortcode}${this.passkey}${timestamp}`).toString('base64');

        const paymentResult = await pool.query(
            `INSERT INTO payments (phone, amount, status)
             VALUES ($1, $2, 'pending')
             RETURNING id, phone, amount, status`,
            [formattedPhone, amount]
        );

        const payment = paymentResult.rows[0];

        try {
            const accessToken = await this.getAccessToken();
            const url = this.environment === 'production'
                ? 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest'
                : 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest';

            const response = await axios.post(
                url,
                {
                    BusinessShortCode: this.shortcode,
                    Password: password,
                    Timestamp: timestamp,
                    TransactionType: 'CustomerPayBillOnline',
                    Amount: Math.floor(amount),
                    PartyA: formattedPhone,
                    PartyB: this.shortcode,
                    PhoneNumber: formattedPhone,
                    CallBackURL: this.callbackUrl,
                    AccountReference: accountReference,
                    TransactionDesc: transactionDesc,
                },
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            if (response.data.ResponseCode === '0') {
                await pool.query(
                    `UPDATE payments 
                     SET mpesa_checkout_request_id = $1
                     WHERE id = $2`,
                    [response.data.CheckoutRequestID, payment.id]
                );

                logger.info(`STK Push initiated for payment ${payment.id}`);

                return {
                    ...payment,
                    mpesa_checkout_request_id: response.data.CheckoutRequestID,
                };
            } else {
                await pool.query(
                    `UPDATE payments SET status = 'failed' WHERE id = $1`,
                    [payment.id]
                );

                throw new Error(response.data.ResponseDescription || 'STK Push failed');
            }
        } catch (error: any) {
            await pool.query(
                `UPDATE payments SET status = 'failed' WHERE id = $1`,
                [payment.id]
            );

            logger.error('STK Push error:', error);
            throw new Error(error.response?.data?.errorMessage || 'Payment initiation failed');
        }
    }

    async handleMpesaCallback(callbackData: any): Promise<void> {
        const { Body } = callbackData;
        const { stkCallback } = Body;

        const checkoutRequestId = stkCallback.CheckoutRequestID;
        const resultCode = stkCallback.ResultCode;

        const paymentResult = await pool.query(
            'SELECT id FROM payments WHERE mpesa_checkout_request_id = $1',
            [checkoutRequestId]
        );

        if (paymentResult.rows.length === 0) {
            logger.error(`Payment not found for checkout request: ${checkoutRequestId}`);
            return;
        }

        const paymentId = paymentResult.rows[0].id;

        if (resultCode === 0) {
            const callbackMetadata = stkCallback.CallbackMetadata.Item;
            const mpesaReceipt = callbackMetadata.find((item: any) => item.Name === 'MpesaReceiptNumber')?.Value;
            const amount = callbackMetadata.find((item: any) => item.Name === 'Amount')?.Value;
            const phone = callbackMetadata.find((item: any) => item.Name === 'PhoneNumber')?.Value;

            await pool.query(
                `UPDATE payments 
                 SET status = 'success', 
                     mpesa_receipt = $1,
                     amount = $2,
                     phone = $3,
                     raw_callback = $4
                 WHERE id = $5`,
                [mpesaReceipt, amount, phone, JSON.stringify(callbackData), paymentId]
            );

            logger.info(`Payment successful: ${paymentId}, Receipt: ${mpesaReceipt}`);

            await this.activateSessionAfterPayment(paymentId);
        } else {
            await pool.query(
                `UPDATE payments 
                 SET status = 'failed',
                     raw_callback = $1
                 WHERE id = $2`,
                [JSON.stringify(callbackData), paymentId]
            );

            logger.info(`Payment failed: ${paymentId}, Result Code: ${resultCode}`);
        }
    }

    private async activateSessionAfterPayment(paymentId: string): Promise<void> {
        const result = await pool.query(
            `SELECT ph.user_id, ph.package_id, ph.session_id
             FROM purchase_history ph
             WHERE ph.payment_id = $1 AND ph.session_id IS NOT NULL`,
            [paymentId]
        );

        if (result.rows.length > 0) {
            const { session_id } = result.rows[0];
            
            await pool.query(
                `UPDATE sessions 
                 SET active = true, session_status = 'active'
                 WHERE id = $1`,
                [session_id]
            );

            logger.info(`Session activated after payment: ${session_id}`);
        }
    }

    async createPurchase(
        userId: string,
        packageId: string,
        paymentId: string,
        deviceId: string,
        routerId: string
    ): Promise<any> {
        const packageResult = await pool.query(
            'SELECT price_kes FROM packages WHERE id = $1',
            [packageId]
        );

        if (packageResult.rows.length === 0) {
            throw new Error('Package not found');
        }

        const amount = packageResult.rows[0].price_kes;

        const session = await sessionService.createSession(userId, packageId, deviceId, routerId, paymentId);

        const purchaseResult = await pool.query(
            `INSERT INTO purchase_history (user_id, package_id, payment_id, session_id, amount_paid, status)
             VALUES ($1, $2, $3, $4, $5, 'pending')
             RETURNING id, user_id, package_id, payment_id, session_id, amount_paid, status, purchase_date`,
            [userId, packageId, paymentId, session.id, amount]
        );

        logger.info(`Purchase created for user ${userId}: ${purchaseResult.rows[0].id}`);

        return {
            purchase: purchaseResult.rows[0],
            session: session,
        };
    }

    async getUserPurchaseHistory(userId: string, limit: number = 10): Promise<any[]> {
        const result = await pool.query(
            `SELECT 
                ph.id,
                p.name as package_name,
                ph.amount_paid,
                ph.purchase_date,
                ph.status,
                py.mpesa_receipt,
                s.session_status,
                s.start_time,
                s.end_time
             FROM purchase_history ph
             JOIN packages p ON ph.package_id = p.id
             LEFT JOIN payments py ON ph.payment_id = py.id
             LEFT JOIN sessions s ON ph.session_id = s.id
             WHERE ph.user_id = $1
             ORDER BY ph.purchase_date DESC
             LIMIT $2`,
            [userId, limit]
        );

        return result.rows;
    }

    async getPaymentStatus(paymentId: string): Promise<Payment> {
        const result = await pool.query(
            `SELECT id, phone, amount, status, mpesa_receipt, mpesa_checkout_request_id
             FROM payments WHERE id = $1`,
            [paymentId]
        );

        if (result.rows.length === 0) {
            throw new Error('Payment not found');
        }

        return result.rows[0];
    }
}

export default new PaymentService();
