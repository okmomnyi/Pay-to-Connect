import { Request, Response } from 'express';
import DatabaseConnection from '../database/connection';
import { logger } from '../utils/logger';

const db = DatabaseConnection.getInstance();

export const getDashboardStats = async (req: Request, res: Response): Promise<void> => {
    try {
        // Get total users
        let totalUsers = 0;
        try {
            const totalUsersResult = await db.query(
                'SELECT COUNT(*) as count FROM users WHERE active = true'
            );
            totalUsers = parseInt(totalUsersResult.rows[0]?.count || '0');
        } catch (e) {
            logger.warn('Users table query failed');
        }

        // Get active users (users with active sessions)
        let activeUsers = 0;
        let activeSessions = 0;
        try {
            const activeUsersResult = await db.query(
                `SELECT COUNT(DISTINCT user_id) as count 
                 FROM sessions 
                 WHERE active = true 
                 AND end_time > CURRENT_TIMESTAMP`
            );
            activeUsers = parseInt(activeUsersResult.rows[0]?.count || '0');

            const activeSessionsResult = await db.query(
                `SELECT COUNT(*) as count 
                 FROM sessions 
                 WHERE active = true 
                 AND end_time > CURRENT_TIMESTAMP`
            );
            activeSessions = parseInt(activeSessionsResult.rows[0]?.count || '0');
        } catch (e) {
            logger.warn('Sessions table query failed, using defaults');
        }

        // Get revenue stats
        let totalRevenue = 0;
        let revenueToday = 0;
        let revenueMonth = 0;
        try {
            const totalRevenueResult = await db.query(
                `SELECT COALESCE(SUM(amount), 0) as total 
                 FROM payments 
                 WHERE status = 'success'`
            );
            totalRevenue = parseFloat(totalRevenueResult.rows[0]?.total || '0');

            const revenueTodayResult = await db.query(
                `SELECT COALESCE(SUM(amount), 0) as total 
                 FROM payments 
                 WHERE status = 'success' 
                 AND DATE(created_at) = CURRENT_DATE`
            );
            revenueToday = parseFloat(revenueTodayResult.rows[0]?.total || '0');

            const revenueMonthResult = await db.query(
                `SELECT COALESCE(SUM(amount), 0) as total 
                 FROM payments 
                 WHERE status = 'success' 
                 AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)`
            );
            revenueMonth = parseFloat(revenueMonthResult.rows[0]?.total || '0');
        } catch (e) {
            logger.warn('Payments revenue query failed');
        }

        // Get packages sold
        let packagesSoldToday = 0;
        let packagesSoldMonth = 0;
        try {
            const packagesTodayResult = await db.query(
                `SELECT COUNT(*) as count 
                 FROM payments 
                 WHERE status = 'success' 
                 AND DATE(created_at) = CURRENT_DATE`
            );
            packagesSoldToday = parseInt(packagesTodayResult.rows[0]?.count || '0');

            const packagesMonthResult = await db.query(
                `SELECT COUNT(*) as count 
                 FROM payments 
                 WHERE status = 'success' 
                 AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)`
            );
            packagesSoldMonth = parseInt(packagesMonthResult.rows[0]?.count || '0');
        } catch (e) {
            logger.warn('Packages sold query failed');
        }

        // Get routers status
        let routersOnline = 0;
        let routersOffline = 0;
        let totalRouters = 0;

        try {
            const routersOnlineResult = await db.query(
                `SELECT COUNT(*) as count 
                 FROM routers 
                 WHERE active = true 
                 AND connection_status = 'online'`
            );
            routersOnline = parseInt(routersOnlineResult.rows[0]?.count || '0');

            const routersOfflineResult = await db.query(
                `SELECT COUNT(*) as count 
                 FROM routers 
                 WHERE active = true 
                 AND connection_status != 'online'`
            );
            routersOffline = parseInt(routersOfflineResult.rows[0]?.count || '0');

            const totalRoutersResult = await db.query(
                'SELECT COUNT(*) as count FROM routers WHERE active = true'
            );
            totalRouters = parseInt(totalRoutersResult.rows[0]?.count || '0');
        } catch (routerError) {
            logger.warn('Routers table query failed, using defaults');
        }

        // Get recent payments
        let recentPayments: any[] = [];
        try {
            const recentPaymentsResult = await db.query(
                `SELECT p.*, u.username, pkg.name as package_name
                 FROM payments p
                 LEFT JOIN users u ON p.user_id = u.id
                 LEFT JOIN packages pkg ON p.package_id = pkg.id
                 ORDER BY p.created_at DESC
                 LIMIT 10`
            );
            recentPayments = recentPaymentsResult.rows;
        } catch (e) {
            logger.warn('Recent payments query failed');
        }

        // Get popular packages
        let popularPackages: any[] = [];
        try {
            const popularPackagesResult = await db.query(
                `SELECT pkg.id, pkg.name, pkg.price_kes, COUNT(p.id) as sales
                 FROM packages pkg
                 LEFT JOIN payments p ON pkg.id = p.package_id AND p.status = 'success'
                 WHERE pkg.active = true
                 GROUP BY pkg.id, pkg.name, pkg.price_kes
                 ORDER BY sales DESC
                 LIMIT 5`
            );
            popularPackages = popularPackagesResult.rows;
        } catch (e) {
            logger.warn('Popular packages query failed');
        }

        res.json({
            success: true,
            stats: {
                users: {
                    total: totalUsers,
                    active: activeUsers
                },
                sessions: {
                    active: activeSessions
                },
                revenue: {
                    total: totalRevenue,
                    today: revenueToday,
                    month: revenueMonth
                },
                packages: {
                    soldToday: packagesSoldToday,
                    soldMonth: packagesSoldMonth
                },
                routers: {
                    online: routersOnline,
                    offline: routersOffline,
                    total: totalRouters
                }
            },
            recentPayments,
            popularPackages
        });
    } catch (error) {
        logger.error('Dashboard stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch dashboard statistics'
        });
    }
};

export const getRecentActivity = async (req: Request, res: Response): Promise<void> => {
    try {
        const limit = parseInt(req.query.limit as string) || 20;

        // Try admin_action_logs first, fall back to payments if it doesn't exist
        let result;
        try {
            result = await db.query(
                `SELECT 
                    aal.id,
                    aal.username,
                    aal.action_type,
                    aal.resource_type,
                    aal.success,
                    aal.created_at,
                    aal.action_details
                 FROM admin_action_logs aal
                 ORDER BY aal.created_at DESC
                 LIMIT $1`,
                [limit]
            );
        } catch (tableError) {
            // Fallback to payments activity
            try {
                result = await db.query(
                    `SELECT 
                        p.id,
                        u.username,
                        'payment' as action_type,
                        'payment' as resource_type,
                        (p.status = 'success') as success,
                        p.created_at,
                        json_build_object('amount', p.amount, 'status', p.status) as action_details
                     FROM payments p
                     LEFT JOIN users u ON p.user_id = u.id
                     ORDER BY p.created_at DESC
                     LIMIT $1`,
                    [limit]
                );
            } catch (e) {
                result = { rows: [] };
            }
        }

        res.json({
            success: true,
            activities: result.rows
        });
    } catch (error) {
        logger.error('Recent activity error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch recent activity'
        });
    }
};
