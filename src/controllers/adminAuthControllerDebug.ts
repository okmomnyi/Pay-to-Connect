import { Request, Response } from 'express';
import pool from '../database/db';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        const { username, password } = req.body;
        
        console.log('=== ADMIN LOGIN DEBUG ===');
        console.log('Username:', username);
        console.log('Password provided:', password ? 'YES' : 'NO');
        console.log('Database host:', process.env.DB_HOST);
        console.log('Database port:', process.env.DB_PORT);
        console.log('Database name:', process.env.DB_NAME);

        if (!username || !password) {
            res.status(400).json({
                success: false,
                error: 'Username and password are required'
            });
            return;
        }

        // Test database connection
        try {
            const testResult = await pool.query('SELECT NOW()');
            console.log('Database connection OK:', testResult.rows[0]);
        } catch (dbError: any) {
            console.error('Database connection failed:', dbError);
            res.status(500).json({
                success: false,
                error: 'Database connection failed',
                details: dbError.message
            });
            return;
        }

        // Check if admin_users table exists
        try {
            const tableCheck = await pool.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'admin_users'
                );
            `);
            console.log('admin_users table exists:', tableCheck.rows[0].exists);
            
            if (!tableCheck.rows[0].exists) {
                res.status(500).json({
                    success: false,
                    error: 'admin_users table does not exist'
                });
                return;
            }
        } catch (tableError: any) {
            console.error('Table check failed:', tableError);
        }

        // Query admin user
        try {
            const result = await pool.query(
                `SELECT au.* 
                 FROM admin_users au
                 WHERE (au.username = $1 OR au.email = $1)`,
                [username]
            );
            
            console.log('Query result rows:', result.rows.length);
            
            if (result.rows.length === 0) {
                console.log('Admin user not found');
                res.status(401).json({
                    success: false,
                    error: 'Invalid credentials'
                });
                return;
            }

            const admin = result.rows[0];
            console.log('Admin user found:', {
                id: admin.id,
                username: admin.username,
                email: admin.email,
                active: admin.active,
                locked: admin.locked
            });

            // Check if account is active
            if (!admin.active) {
                console.log('Account is inactive');
                res.status(401).json({
                    success: false,
                    error: 'Account is inactive'
                });
                return;
            }

            // Check if account is locked
            if (admin.locked) {
                console.log('Account is locked');
                res.status(401).json({
                    success: false,
                    error: 'Account is locked. Contact administrator.'
                });
                return;
            }

            // Verify password
            console.log('Verifying password...');
            const passwordMatch = await bcrypt.compare(password, admin.password_hash);
            console.log('Password match:', passwordMatch);

            if (!passwordMatch) {
                console.log('Password does not match');
                res.status(401).json({
                    success: false,
                    error: 'Invalid credentials'
                });
                return;
            }

            console.log('Password verified successfully');

            // Get permissions
            let permissions: string[] = [];
            try {
                const permResult = await pool.query(
                    `SELECT ar.permissions
                     FROM admin_user_roles aur
                     JOIN admin_roles ar ON aur.role_id = ar.id
                     WHERE aur.admin_user_id = $1`,
                    [admin.id]
                );

                permissions = permResult.rows.reduce((acc: string[], row) => {
                    if (row.permissions && Array.isArray(row.permissions)) {
                        acc.push(...row.permissions);
                    }
                    return acc;
                }, []);
                console.log('Permissions loaded:', permissions);
            } catch (permError: any) {
                console.warn('Could not fetch permissions:', permError);
                permissions = ['admin.view', 'user.view', 'package.view', 'session.view'];
            }

            // Create JWT token
            const token = jwt.sign(
                { 
                    adminId: admin.id,
                    username: admin.username,
                    permissions 
                },
                JWT_SECRET,
                { expiresIn: '8h' }
            );

            const adminUser = {
                id: admin.id,
                username: admin.username,
                email: admin.email,
                full_name: admin.full_name,
                active: admin.active,
                locked: admin.locked,
                permissions
            };

            console.log('Login successful, returning token');
            
            res.json({
                success: true,
                token,
                admin: adminUser
            });

        } catch (queryError: any) {
            console.error('Admin user query failed:', queryError);
            res.status(500).json({
                success: false,
                error: 'Database query failed',
                details: queryError.message
            });
            return;
        }

    } catch (error: any) {
        console.error('Login controller error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
    try {
        console.log('Admin logout');
        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    } catch (error: any) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            error: 'Logout failed'
        });
    }
};

export const getCurrentAdmin = async (req: Request, res: Response): Promise<void> => {
    res.json({
        success: true,
        admin: req.admin || null
    });
};
