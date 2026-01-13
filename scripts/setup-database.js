#!/usr/bin/env node
/**
 * Secure Database Setup Script
 * 
 * This script sets up the database schema and creates admin user securely.
 * NO HARDCODED CREDENTIALS - all generated dynamically.
 * 
 * Usage: node scripts/setup-database.js
 */

const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function setupDatabase() {
    console.log('╔════════════════════════════════════════════╗');
    console.log('║   Secure Database Setup                    ║');
    console.log('║   Pay-to-Connect System                    ║');
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
        console.log('📋 Setting up database schema...\n');

        // Read and execute router management schema
        const schemaPath = path.join(__dirname, '../src/database/router-management-schema.sql');
        if (fs.existsSync(schemaPath)) {
            console.log('📄 Applying router management schema...');
            const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
            await pool.query(schemaSQL);
            console.log('✅ Router management schema applied successfully!');
        } else {
            console.log('⚠️  Router management schema file not found, skipping...');
        }

        // Generate secure admin credentials
        console.log('\n🔐 Generating secure admin credentials...');
        
        const adminUsername = 'admin';
        const adminEmail = 'admin@smartwifi.local';
        
        // Generate a secure random password
        const adminPassword = crypto.randomBytes(16).toString('base64').slice(0, 12) + 'A1!';
        const passwordHash = await bcrypt.hash(adminPassword, 12);

        console.log('🔍 Checking if admin user exists...');
        const checkResult = await pool.query(
            'SELECT id FROM admin_users WHERE username = $1',
            [adminUsername]
        );

        let adminUserId;
        if (checkResult.rows.length > 0) {
            console.log('📝 Updating existing admin user...');
            const updateResult = await pool.query(
                'UPDATE admin_users SET password_hash = $1, email = $2, active = true WHERE username = $3 RETURNING id',
                [passwordHash, adminEmail, adminUsername]
            );
            adminUserId = updateResult.rows[0].id;
            console.log('✅ Admin user updated successfully!');
        } else {
            console.log('👤 Creating new admin user...');
            const insertResult = await pool.query(
                'INSERT INTO admin_users (username, email, password_hash, active) VALUES ($1, $2, $3, true) RETURNING id',
                [adminUsername, adminEmail, passwordHash]
            );
            adminUserId = insertResult.rows[0].id;
            console.log('✅ Admin user created successfully!');
        }

        // Assign SUPER_ADMIN role
        console.log('🔑 Assigning SUPER_ADMIN role...');
        const roleResult = await pool.query(
            'SELECT id FROM admin_roles WHERE name = $1',
            ['SUPER_ADMIN']
        );

        if (roleResult.rows.length > 0) {
            const roleId = roleResult.rows[0].id;
            await pool.query(
                'INSERT INTO admin_user_roles (admin_user_id, role_id, granted_by) VALUES ($1, $2, $3) ON CONFLICT (admin_user_id, role_id) DO NOTHING',
                [adminUserId, roleId, adminUserId]
            );
            console.log('✅ SUPER_ADMIN role assigned successfully!');
        } else {
            console.log('⚠️  SUPER_ADMIN role not found in database. Please run router-management-schema.sql first.');
        }

        // Create sample packages
        console.log('\n📦 Creating sample packages...');
        const packages = [
            ['Basic 1 Hour', 'Basic internet access for 1 hour', 'time_based', 60, 50.00],
            ['Standard 3 Hours', 'Standard internet access for 3 hours', 'time_based', 180, 120.00],
            ['Premium Day Pass', 'Premium internet access for 24 hours', 'time_based', 1440, 300.00],
            ['Data 500MB', '500MB data package', 'data_based', null, 100.00],
            ['Data 1GB', '1GB data package', 'data_based', null, 180.00]
        ];

        for (const pkg of packages) {
            await pool.query(
                'INSERT INTO packages (name, description, package_type, duration_minutes, price_kes) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description, package_type = EXCLUDED.package_type, duration_minutes = EXCLUDED.duration_minutes, price_kes = EXCLUDED.price_kes',
                pkg
            );
        }
        console.log('✅ Sample packages created successfully!');

        // Log the initialization
        await pool.query(
            'INSERT INTO admin_action_logs (admin_user_id, username, action_type, resource_type, action_details, success, execution_time_ms) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [adminUserId, adminUsername, 'system.initialize', 'database', JSON.stringify({action: 'database_setup', packages_created: packages.length}), true, 0]
        );

        console.log('\n╔════════════════════════════════════════════╗');
        console.log('║   Database Setup Complete!                ║');
        console.log('╚════════════════════════════════════════════╝');
        console.log('\n🔑 ADMIN CREDENTIALS (SAVE SECURELY):');
        console.log('   Username:', adminUsername);
        console.log('   Password:', adminPassword);
        console.log('   Email:', adminEmail);
        console.log('\n🌐 Admin Panel: http://localhost:3000/admin.html');
        console.log('\n⚠️  CRITICAL SECURITY NOTES:');
        console.log('   • Change the admin password after first login');
        console.log('   • These credentials will not be displayed again');
        console.log('   • Store them in a secure password manager');
        console.log('   • Never commit credentials to version control\n');

        // Generate encryption key if not exists
        if (!process.env.ROUTER_ENCRYPTION_KEY) {
            const encryptionKey = crypto.randomBytes(32).toString('hex');
            console.log('🔐 ROUTER ENCRYPTION KEY (Add to .env):');
            console.log('   ROUTER_ENCRYPTION_KEY=' + encryptionKey);
            console.log('\n   Add this to your .env file for router credential encryption.\n');
        }

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

setupDatabase();
