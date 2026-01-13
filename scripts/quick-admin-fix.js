#!/usr/bin/env node
/**
 * Quick Admin Fix Script
 * 
 * This script fixes the admin login issue by creating/resetting admin credentials
 * and ensuring the database schema is correct. No interactive prompts.
 * 
 * Usage: node scripts/quick-admin-fix.js
 */

const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
require('dotenv').config();

async function quickAdminFix() {
    console.log('🔧 Quick Admin Fix - Starting...\n');

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
    });

    try {
        // Step 1: Fix packages table if needed
        console.log('1️⃣ Checking packages table...');
        try {
            const columnsCheck = await pool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'packages'
            `);
            
            const columns = columnsCheck.rows.map(r => r.column_name);
            
            if (!columns.includes('description')) {
                await pool.query('ALTER TABLE packages ADD COLUMN description TEXT');
                console.log('   ✅ Added description column');
            }
            
            if (!columns.includes('package_type')) {
                await pool.query('ALTER TABLE packages ADD COLUMN package_type VARCHAR(20) DEFAULT \'time_based\'');
                console.log('   ✅ Added package_type column');
            }
            
            console.log('   ✅ Packages table structure OK');
        } catch (error) {
            console.log('   ⚠️ Packages table issue:', error.message);
        }

        // Step 2: Create/Reset admin user
        console.log('\n2️⃣ Setting up admin user...');
        
        // Generate secure password
        const adminPassword = 'Admin' + crypto.randomBytes(8).toString('hex') + '!';
        const passwordHash = await bcrypt.hash(adminPassword, 12);
        
        // Create or update admin user
        await pool.query(`
            INSERT INTO admin_users (username, email, password_hash, active) 
            VALUES ('admin', 'admin@smartwifi.local', $1, true)
            ON CONFLICT (username) 
            DO UPDATE SET password_hash = EXCLUDED.password_hash, active = true
        `, [passwordHash]);
        
        console.log('   ✅ Admin user created/updated');

        // Step 3: Assign SUPER_ADMIN role
        console.log('\n3️⃣ Assigning admin role...');
        try {
            const adminUser = await pool.query('SELECT id FROM admin_users WHERE username = $1', ['admin']);
            const superAdminRole = await pool.query('SELECT id FROM admin_roles WHERE name = $1', ['SUPER_ADMIN']);
            
            if (adminUser.rows.length > 0 && superAdminRole.rows.length > 0) {
                await pool.query(`
                    INSERT INTO admin_user_roles (admin_user_id, role_id, granted_by)
                    VALUES ($1, $2, $1)
                    ON CONFLICT (admin_user_id, role_id) DO NOTHING
                `, [adminUser.rows[0].id, superAdminRole.rows[0].id]);
                
                console.log('   ✅ SUPER_ADMIN role assigned');
            }
        } catch (error) {
            console.log('   ⚠️ Role assignment issue:', error.message);
        }

        // Step 4: Create sample packages
        console.log('\n4️⃣ Creating sample packages...');
        const packages = [
            ['Basic 1 Hour', 'Basic internet access for 1 hour', 'time_based', 60, 50.00],
            ['Standard 3 Hours', 'Standard internet access for 3 hours', 'time_based', 180, 120.00],
            ['Premium Day Pass', 'Premium internet access for 24 hours', 'time_based', 1440, 300.00]
        ];

        for (const pkg of packages) {
            try {
                await pool.query(`
                    INSERT INTO packages (name, description, package_type, duration_minutes, price_kes) 
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (name) DO UPDATE SET 
                        description = EXCLUDED.description,
                        package_type = EXCLUDED.package_type,
                        duration_minutes = EXCLUDED.duration_minutes,
                        price_kes = EXCLUDED.price_kes
                `, pkg);
            } catch (error) {
                console.log(`   ⚠️ Package ${pkg[0]}: ${error.message}`);
            }
        }
        console.log('   ✅ Sample packages created');

        // Display results
        console.log('\n╔══════════════════════════════════════╗');
        console.log('║          ADMIN LOGIN FIXED           ║');
        console.log('╚══════════════════════════════════════╝');
        console.log('\n🔑 ADMIN CREDENTIALS:');
        console.log('   Username: admin');
        console.log('   Password:', adminPassword);
        console.log('   Email: admin@smartwifi.local');
        console.log('\n🌐 LOGIN URL:');
        console.log('   http://localhost:3000/admin.html');
        console.log('   OR http://your-server-ip:3000/admin.html');
        console.log('\n⚠️  SAVE THESE CREDENTIALS SECURELY!');
        console.log('   Change password after first login if needed.\n');

    } catch (error) {
        console.error('❌ Fix failed:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

quickAdminFix();
