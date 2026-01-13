#!/usr/bin/env node
/**
 * Complete Database Setup Script
 * 
 * This script fixes the packages table schema and completes the setup process.
 * Run this after the initial setup-database.js script fails on packages.
 * 
 * Usage: node scripts/complete-setup.js
 */

const { Pool } = require('pg');
require('dotenv').config();

async function completeSetup() {
    console.log('╔════════════════════════════════════════════╗');
    console.log('║   Complete Database Setup                  ║');
    console.log('║   Fixing Packages Schema                   ║');
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
        console.log('🔍 Checking packages table structure...');
        
        // Check current table structure
        const tableInfo = await pool.query(`
            SELECT column_name, data_type, is_nullable, column_default 
            FROM information_schema.columns 
            WHERE table_name = 'packages' 
            ORDER BY ordinal_position
        `);
        
        console.log('📋 Current packages table columns:');
        tableInfo.rows.forEach(row => {
            console.log(`   - ${row.column_name}: ${row.data_type}`);
        });

        // Add missing columns
        console.log('\n🔧 Adding missing columns...');
        
        // Add description column if missing
        const hasDescription = tableInfo.rows.some(row => row.column_name === 'description');
        if (!hasDescription) {
            await pool.query('ALTER TABLE packages ADD COLUMN description TEXT');
            console.log('✅ Added description column');
        } else {
            console.log('✅ Description column already exists');
        }

        // Add package_type column if missing
        const hasPackageType = tableInfo.rows.some(row => row.column_name === 'package_type');
        if (!hasPackageType) {
            await pool.query('ALTER TABLE packages ADD COLUMN package_type VARCHAR(20) DEFAULT \'time_based\'');
            console.log('✅ Added package_type column');
        } else {
            console.log('✅ Package_type column already exists');
        }

        // Update existing packages with default values
        console.log('\n📝 Updating existing packages with default values...');
        await pool.query(`
            UPDATE packages 
            SET description = COALESCE(description, name || ' - Package description'), 
                package_type = COALESCE(package_type, 'time_based')
            WHERE description IS NULL OR package_type IS NULL
        `);

        // Now create sample packages
        console.log('\n📦 Creating sample packages...');
        const packages = [
            ['Basic 1 Hour', 'Basic internet access for 1 hour', 'time_based', 60, 50.00],
            ['Standard 3 Hours', 'Standard internet access for 3 hours', 'time_based', 180, 120.00],
            ['Premium Day Pass', 'Premium internet access for 24 hours', 'time_based', 1440, 300.00],
            ['Data 500MB', '500MB data package', 'data_based', null, 100.00],
            ['Data 1GB', '1GB data package', 'data_based', null, 180.00]
        ];

        for (const pkg of packages) {
            try {
                await pool.query(
                    'INSERT INTO packages (name, description, package_type, duration_minutes, price_kes) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description, package_type = EXCLUDED.package_type, duration_minutes = EXCLUDED.duration_minutes, price_kes = EXCLUDED.price_kes',
                    pkg
                );
            } catch (error) {
                console.log(`⚠️  Package ${pkg[0]} already exists or error: ${error.message}`);
            }
        }
        console.log('✅ Sample packages created/updated successfully!');

        // Verify admin user exists and get credentials info
        console.log('\n👤 Checking admin user status...');
        const adminCheck = await pool.query('SELECT username, email, active FROM admin_users WHERE username = $1', ['admin']);
        
        if (adminCheck.rows.length > 0) {
            const admin = adminCheck.rows[0];
            console.log('✅ Admin user exists:');
            console.log(`   Username: ${admin.username}`);
            console.log(`   Email: ${admin.email}`);
            console.log(`   Status: ${admin.active ? 'Active' : 'Inactive'}`);
            
            // Check roles
            const roleCheck = await pool.query(`
                SELECT ar.name as role_name 
                FROM admin_user_roles aur
                JOIN admin_roles ar ON aur.role_id = ar.id
                JOIN admin_users au ON aur.admin_user_id = au.id
                WHERE au.username = $1
            `, ['admin']);
            
            if (roleCheck.rows.length > 0) {
                console.log('   Roles:', roleCheck.rows.map(r => r.role_name).join(', '));
            }
        } else {
            console.log('⚠️  Admin user not found. Run setup-database.js first.');
        }

        console.log('\n╔════════════════════════════════════════════╗');
        console.log('║   Setup Complete!                          ║');
        console.log('╚════════════════════════════════════════════╝');
        console.log('\n🌐 Admin Panel: http://localhost:3000/admin.html');
        console.log('\n📝 Admin Login:');
        console.log('   Username: admin');
        console.log('   Password: [Generated by setup-database.js - check previous output]');
        console.log('\n⚠️  If you don\'t have the password, run:');
        console.log('   node scripts/setup-admin.js');
        console.log('   (This will let you set a new password interactively)\n');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

completeSetup();
