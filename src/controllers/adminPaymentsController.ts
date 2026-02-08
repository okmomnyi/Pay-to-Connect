import { Request, Response } from 'express';
import DatabaseConnection from '../database/connection';
import { logger } from '../utils/logger';

const db = DatabaseConnection.getInstance();

export const getAllPayments = async (req: Request, res: Response): Promise<void> => {
    try {
        const { page = 1, limit = 50, status = 'all', start_date, end_date } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        let payments: any[] = [];
        let totalPayments = 0;

        try {
            let query = `
                SELECT p.*, 
                       u.username, u.email, u.first_name, u.last_name,
                       pkg.name as package_name
                FROM payments p
                LEFT JOIN users u ON p.user_id = u.id
                LEFT JOIN packages pkg ON p.package_id = pkg.id
            `;

            const params: any[] = [];
            const conditions: string[] = [];

            if (status !== 'all') {
                conditions.push(`p.status = $${params.length + 1}`);
                params.push(status);
            }

            if (start_date) {
                conditions.push(`DATE(p.created_at) >= $${params.length + 1}`);
                params.push(start_date);
            }

            if (end_date) {
                conditions.push(`DATE(p.created_at) <= $${params.length + 1}`);
                params.push(end_date);
            }

            if (conditions.length > 0) {
                query += ` WHERE ${conditions.join(' AND ')}`;
            }

            query += ` ORDER BY p.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
            params.push(Number(limit), offset);

            const result = await db.query(query, params);
            payments = result.rows;

            // Get total count for pagination
            let countQuery = 'SELECT COUNT(*) as total FROM payments p';
            const countParams: any[] = [];
            const countConditions: string[] = [];

            if (status !== 'all') {
                countConditions.push(`p.status = $${countParams.length + 1}`);
                countParams.push(status);
            }

            if (start_date) {
                countConditions.push(`DATE(p.created_at) >= $${countParams.length + 1}`);
                countParams.push(start_date);
            }

            if (end_date) {
                countConditions.push(`DATE(p.created_at) <= $${countParams.length + 1}`);
                countParams.push(end_date);
            }

            if (countConditions.length > 0) {
                countQuery += ` WHERE ${countConditions.join(' AND ')}`;
            }

            const countResult = await db.query(countQuery, countParams);
            totalPayments = parseInt(countResult.rows[0]?.total || '0');
        } catch (tableError) {
            logger.warn('Payments query failed:', tableError);
        }

        res.json({
            success: true,
            payments,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total: totalPayments,
                pages: Math.ceil(totalPayments / Number(limit))
            }
        });
    } catch (error) {
        logger.error('Error getting payments:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const getPaymentById = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const result = await db.query(
            `SELECT p.*, 
                   u.username, u.email, u.first_name, u.last_name, u.phone,
                   pkg.name as package_name, pkg.price_kes as package_price
             FROM payments p
             LEFT JOIN users u ON p.user_id = u.id
             LEFT JOIN packages pkg ON p.package_id = pkg.id
             WHERE p.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: 'Payment not found'
            });
            return;
        }

        res.json({
            success: true,
            payment: result.rows[0]
        });
    } catch (error) {
        logger.error('Error getting payment:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const updatePaymentStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['pending', 'completed', 'failed', 'refunded'].includes(status)) {
            res.status(400).json({
                success: false,
                error: 'Invalid status'
            });
            return;
        }

        const result = await db.query(
            `UPDATE payments 
             SET status = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING *`,
            [status, id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: 'Payment not found'
            });
            return;
        }

        res.json({
            success: true,
            payment: result.rows[0],
            message: `Payment status updated to ${status}`
        });
    } catch (error) {
        logger.error('Error updating payment status:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const getPaymentStats = async (req: Request, res: Response): Promise<void> => {
    try {
        const { period = 'month' } = req.query;

        let statsData = {
            total_payments: 0,
            completed_payments: 0,
            pending_payments: 0,
            failed_payments: 0,
            refunded_payments: 0,
            total_revenue: 0,
            avg_payment_amount: 0,
            daily_revenue: []
        };

        try {
            let dateFilter = '';
            if (period === 'today') {
                dateFilter = "AND DATE(created_at) = CURRENT_DATE";
            } else if (period === 'week') {
                dateFilter = "AND created_at >= DATE_TRUNC('week', CURRENT_DATE)";
            } else if (period === 'month') {
                dateFilter = "AND created_at >= DATE_TRUNC('month', CURRENT_DATE)";
            } else if (period === 'year') {
                dateFilter = "AND created_at >= DATE_TRUNC('year', CURRENT_DATE)";
            }

            const stats = await db.query(`
                SELECT 
                    COUNT(*) as total_payments,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_payments,
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_payments,
                    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_payments,
                    COUNT(CASE WHEN status = 'refunded' THEN 1 END) as refunded_payments,
                    COALESCE(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END), 0) as total_revenue,
                    COALESCE(AVG(CASE WHEN status = 'completed' THEN amount ELSE NULL END), 0) as avg_payment_amount
                FROM payments
                WHERE 1=1 ${dateFilter}
            `);

            // Get daily revenue for the last 7 days
            const dailyRevenue = await db.query(`
                SELECT 
                    DATE(created_at) as date,
                    COUNT(*) as payments_count,
                    COALESCE(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END), 0) as revenue
                FROM payments
                WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
                GROUP BY DATE(created_at)
                ORDER BY date DESC
            `);

            statsData = {
                ...stats.rows[0],
                daily_revenue: dailyRevenue.rows
            };
        } catch (tableError) {
            logger.warn('Payment stats query failed');
        }

        res.json({
            success: true,
            stats: statsData
        });
    } catch (error) {
        logger.error('Error getting payment stats:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export const refundPayment = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        // Get payment details
        const paymentResult = await db.query(
            'SELECT * FROM payments WHERE id = $1',
            [id]
        );

        if (paymentResult.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: 'Payment not found'
            });
            return;
        }

        const payment = paymentResult.rows[0];

        if (payment.status !== 'completed') {
            res.status(400).json({
                success: false,
                error: 'Only completed payments can be refunded'
            });
            return;
        }

        // Update payment status
        await db.query(
            `UPDATE payments 
             SET status = 'refunded', updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [id]
        );

        // Try to deactivate any associated sessions
        try {
            await db.query(
                `UPDATE sessions 
                 SET active = false, updated_at = CURRENT_TIMESTAMP
                 WHERE payment_id = $1`,
                [id]
            );
        } catch (e) {
            logger.warn('Sessions table not found for deactivation');
        }

        res.json({
            success: true,
            message: 'Payment refunded successfully'
        });
    } catch (error) {
        logger.error('Error refunding payment:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};
