import { Request, Response } from 'express';
import DatabaseConnection from '../database/connection';
import { logger } from '../utils/logger';

const db = DatabaseConnection.getInstance();

export const getDashboardStats = async (req: Request, res: Response): Promise<void> => {
    try {
        // Get total users
        const totalUsersResult = await db.query(
            'SELECT COUNT(*) as count FROM users WHERE active = true'
        );
        const totalUsers = parseInt(totalUsersResult.rows[0].count);

        // Get active users (users with active sessions)
        const activeUsersResult = await db.query(
            `SELECT COUNT(DISTINCT user_id) as count 
             FROM user_sessions 
             WHERE status = 'active' 
             AND expires_at > CURRENT_TIMESTAMP`
        );
        const activeUsers = parseInt(activeUsersResult.rows[0].count);

        // Get active sessions count
        const activeSessionsResult = await db.query(
            `SELECT COUNT(*) as count 
             FROM user_sessions 
             WHERE status = 'active' 
             AND expires_at > CURRENT_TIMESTAMP`
        );
        const activeSessions = parseInt(activeSessionsResult.rows[0].count);

        // Get total revenue
        const totalRevenueResult = await db.query(
            `SELECT COALESCE(SUM(amount), 0) as total 
             FROM payments 
             WHERE status = 'completed'`
        );
        const totalRevenue = parseFloat(totalRevenueResult.rows[0].total);

        // Get revenue today
        const revenueTodayResult = await db.query(
            `SELECT COALESCE(SUM(amount), 0) as total 
             FROM payments 
             WHERE status = 'completed' 
             AND DATE(created_at) = CURRENT_DATE`
        );
        const revenueToday = parseFloat(revenueTodayResult.rows[0].total);

        // Get revenue this month
        const revenueMonthResult = await db.query(
            `SELECT COALESCE(SUM(amount), 0) as total 
             FROM payments 
             WHERE status = 'completed' 
             AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)`
        );
        const revenueMonth = parseFloat(revenueMonthResult.rows[0].total);

        // Get packages sold today
        const packagesTodayResult = await db.query(
            `SELECT COUNT(*) as count 
             FROM user_packages 
             WHERE DATE(purchased_at) = CURRENT_DATE`
        );
        const packagesSoldToday = parseInt(packagesTodayResult.rows[0].count);

        // Get packages sold this month
        const packagesMonthResult = await db.query(
            `SELECT COUNT(*) as count 
             FROM user_packages 
             WHERE DATE_TRUNC('month', purchased_at) = DATE_TRUNC('month', CURRENT_DATE)`
        );
        const packagesSoldMonth = parseInt(packagesMonthResult.rows[0].count);

        // Get routers status
        const routersOnlineResult = await db.query(
            `SELECT COUNT(*) as count 
             FROM routers 
             WHERE active = true 
             AND connection_status = 'online'`
        );
        const routersOnline = parseInt(routersOnlineResult.rows[0].count);

        const routersOfflineResult = await db.query(
            `SELECT COUNT(*) as count 
             FROM routers 
             WHERE active = true 
             AND connection_status != 'online'`
        );
        const routersOffline = parseInt(routersOfflineResult.rows[0].count);

        const totalRoutersResult = await db.query(
            'SELECT COUNT(*) as count FROM routers WHERE active = true'
        );
        const totalRouters = parseInt(totalRoutersResult.rows[0].count);

        // Get recent activity (last 10 payments)
        const recentPaymentsResult = await db.query(
            `SELECT p.*, u.username, pkg.name as package_name
             FROM payments p
             JOIN users u ON p.user_id = u.id
             LEFT JOIN user_packages up ON p.user_package_id = up.id
             LEFT JOIN packages pkg ON up.package_id = pkg.id
             ORDER BY p.created_at DESC
             LIMIT 10`
        );

        // Get popular packages
        const popularPackagesResult = await db.query(
            `SELECT pkg.id, pkg.name, pkg.price_kes, COUNT(up.id) as sales
             FROM packages pkg
             LEFT JOIN user_packages up ON pkg.id = up.package_id
             WHERE pkg.active = true
             GROUP BY pkg.id, pkg.name, pkg.price_kes
             ORDER BY sales DESC
             LIMIT 5`
        );

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
            recentPayments: recentPaymentsResult.rows,
            popularPackages: popularPackagesResult.rows
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

        const result = await db.query(
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
