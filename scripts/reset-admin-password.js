#!/usr/bin/env node
/**
 * Non-Interactive Admin Password Reset Script
 * 
 * This script resets the admin password without interactive prompts.
 * It generates a secure password and displays it clearly.
 * 
 * Usage: node scripts/reset-admin-password.js
 */

const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
require('dotenv').config();

async function resetAdminPassword() {
    console.log('╔════════════════════════════════════════════╗');
    console.log('║   Admin Password Reset                     ║');
    console.log('║   Non-Interactive Mode                     ║');
    console.log('╚════════════════════════════════════════════╝\n');

    if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
        console.error('❌ Error: Database configuration not found in environment variables.');
        console.error('Please ensure .env file is configured with DATABASE_URL or DB_* variables.\n');
        process.exit(1);
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        connectionTimeoutMillis: 30000,
        ssl: process.env.DB_SSL === 'true' ? {
            rejectUnauthorized: false
        } : false
    });

    try {
        console.log('🔍 Checking admin user...');
        
        // Check if admin user exists
        const checkResult = await pool.query(
            'SELECT id, username, email FROM admin_users WHERE username = $1',
            ['admin']
        );

        if (checkResult.rows.length === 0) {
            console.error('❌ Admin user not found. Creating new admin user...');
            
            // Generate secure credentials
            const adminPassword = crypto.randomBytes(12).toString('base64').replace(/[^a-zA-Z0-9]/g, '') + 'A1!';
            const passwordHash = await bcrypt.hash(adminPassword, 12);
            
            // Create admin user
            const insertResult = await pool.query(
                'INSERT INTO admin_users (username, email, password_hash, active) VALUES ($1, $2, $3, true) RETURNING id',
                ['admin', 'admin@smartwifi.local', passwordHash]
            );
            
            console.log('✅ Admin user created successfully!');
            
            // Assign SUPER_ADMIN role
            const roleResult = await pool.query('SELECT id FROM admin_roles WHERE name = $1', ['SUPER_ADMIN']);
            if (roleResult.rows.length > 0) {
                await pool.query(
                    'INSERT INTO admin_user_roles (admin_user_id, role_id, granted_by) VALUES ($1, $2, $3)',
                    [insertResult.rows[0].id, roleResult.rows[0].id, insertResult.rows[0].id]
                );
                console.log('✅ SUPER_ADMIN role assigned!');
            }
            
            console.log('\n╔════════════════════════════════════════════╗');
            console.log('║   NEW ADMIN CREDENTIALS                    ║');
            console.log('╚════════════════════════════════════════════╝');
            console.log('Username: admin');
            console.log('Password:', adminPassword);
            console.log('Email: admin@smartwifi.local');
            
        } else {
            console.log('✅ Admin user found. Resetting password...');
            
            // Generate new secure password
            const newPassword = crypto.randomBytes(12).toString('base64').replace(/[^a-zA-Z0-9]/g, '') + 'A1!';
            const passwordHash = await bcrypt.hash(newPassword, 12);
            
            // Update password
            await pool.query(
                'UPDATE admin_users SET password_hash = $1, active = true WHERE username = $2',
                [passwordHash, 'admin']
            );
            
            console.log('✅ Password reset successfully!');
            
            const admin = checkResult.rows[0];
            console.log('\n╔════════════════════════════════════════════╗');
            console.log('║   UPDATED ADMIN CREDENTIALS                ║');
            console.log('╚════════════════════════════════════════════╝');
            console.log('Username:', admin.username);
            console.log('Password:', newPassword);
            console.log('Email:', admin.email);
        }
        
        console.log('\n🌐 Login URL: http://localhost:3000/admin.html');
        console.log('🌐 Or: http://your-server-ip:3000/admin.html');
        
        console.log('\n⚠️  IMPORTANT SECURITY NOTES:');
        console.log('   • Save these credentials in a secure password manager');
        console.log('   • Change the password after first login if desired');
        console.log('   • These credentials will not be displayed again');
        console.log('   • Never share or commit credentials to version control\n');
        
        // Test database connection and verify setup
        console.log('🔍 Verifying database setup...');
        
        // Check if packages table has required columns
        const packagesCheck = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'packages' AND column_name IN ('description', 'package_type')
        `);
        
        if (packagesCheck.rows.length < 2) {
            console.log('⚠️  Packages table missing columns. Run: node scripts/complete-setup.js');
        } else {
            console.log('✅ Database schema looks good!');
        }
        
        // Check admin roles
        const rolesCheck = await pool.query(`
            SELECT ar.name 
            FROM admin_user_roles aur
            JOIN admin_roles ar ON aur.role_id = ar.id
            JOIN admin_users au ON aur.admin_user_id = au.id
            WHERE au.username = 'admin'
        `);
        
        if (rolesCheck.rows.length > 0) {
            console.log('✅ Admin roles:', rolesCheck.rows.map(r => r.name).join(', '));
        } else {
            console.log('⚠️  No roles assigned to admin user');
        }

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

resetAdminPassword();
