import { Request, Response } from 'express';
import pool from '../database/db';
import bcrypt from 'bcrypt';
import { logger } from '../utils/logger';

export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        const { username, password } = req.body;
        
        console.log('=== BASIC ADMIN LOGIN ===');
        console.log('Username:', username);

        if (!username || !password) {
            console.log('Missing credentials');
            res.status(400).json({
                success: false,
                error: 'Username and password are required'
            });
            return;
        }

        // Query admin user
        const result = await pool.query(
            `SELECT au.* 
             FROM admin_users au
             WHERE (au.username = $1 OR au.email = $1)`,
            [username]
        );
        
        console.log('Found users:', result.rows.length);
        
        if (result.rows.length === 0) {
            console.log('User not found');
            res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
            return;
        }

        const admin = result.rows[0];
        console.log('User found:', admin.username, 'Active:', admin.active, 'Locked:', admin.locked);

        // Check if account is active
        if (!admin.active) {
            console.log('Account inactive');
            res.status(401).json({
                success: false,
                error: 'Account is inactive'
            });
            return;
        }

        // Check if account is locked
        if (admin.locked) {
            console.log('Account locked');
            res.status(401).json({
                success: false,
                error: 'Account is locked. Contact administrator.'
            });
            return;
        }

        // Verify password
        console.log('Checking password...');
        const passwordMatch = await bcrypt.compare(password, admin.password_hash);
        console.log('Password match:', passwordMatch);

        if (!passwordMatch) {
            console.log('Password mismatch');
            res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
            return;
        }

        console.log('Login successful!');

        // Create simple admin object
        const adminUser = {
            id: admin.id,
            username: admin.username,
            email: admin.email,
            full_name: admin.full_name,
            active: admin.active,
            locked: admin.locked,
            permissions: ['admin.view', 'user.view', 'package.view', 'session.view']
        };

        // Create a simple token (just a base64 encoded string for now)
        const token = Buffer.from(`${admin.id}:${admin.username}:${Date.now()}`).toString('base64');

        console.log('Returning success response');
        
        // Send response
        res.json({
            success: true,
            token: token,
            admin: adminUser
        });

        console.log('Response sent');

    } catch (error: any) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
};

export const getCurrentAdmin = async (req: Request, res: Response): Promise<void> => {
    res.json({
        success: true,
        admin: req.admin || null
    });
};
