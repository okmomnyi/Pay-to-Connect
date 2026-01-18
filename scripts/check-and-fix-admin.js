#!/usr/bin/env node

const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

async function checkAndFixAdmin() {
    const pool = new Pool({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('\n==============================================');
        console.log('  Admin Database Check & Fix');
        console.log('==============================================\n');

        // Check if admin_users table exists
        const tableCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'admin_users'
            );
        `);

        if (!tableCheck.rows[0].exists) {
            console.log('❌ admin_users table does not exist');
            console.log('Creating admin tables...\n');
            
            // Create the tables
            const fs = require('fs');
            const path = require('path');
            const schemaPath = path.join(__dirname, '../src/database/admin-schema.sql');
            const schemaSql = fs.readFileSync(schemaPath, 'utf8');
            
            await pool.query(schemaSql);
            console.log('✓ Admin tables created\n');
        } else {
            console.log('✓ admin_users table exists\n');
        }

        // Check table structure
        console.log('Checking admin_users structure...');
        const columns = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'admin_users'
            ORDER BY ordinal_position;
        `);
        
        console.log('Columns:', columns.rows.map(r => r.column_name).join(', '));
        console.log('');

        // Check if admin user exists
        const adminCheck = await pool.query(`
            SELECT id, username, email, active 
            FROM admin_users 
            WHERE username = 'admin'
        `);

        if (adminCheck.rows.length === 0) {
            console.log('Creating default admin user...');
            
            // Hash the password
            const passwordHash = await bcrypt.hash('Admin@123456', 12);
            
            // Insert admin user
            const result = await pool.query(`
                INSERT INTO admin_users (username, email, password_hash, full_name, active)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id, username, email
            `, ['admin', 'admin@captiveportal.local', passwordHash, 'System Administrator', true]);
            
            console.log('✓ Admin user created:', result.rows[0]);
            
            // Assign SUPER_ADMIN role if roles exist
            try {
                const roleCheck = await pool.query(`
                    SELECT id FROM admin_roles WHERE name = 'SUPER_ADMIN'
                `);
                
                if (roleCheck.rows.length > 0) {
                    await pool.query(`
                        INSERT INTO admin_user_roles (user_id, role_id)
                        VALUES ($1, $2)
                        ON CONFLICT DO NOTHING
                    `, [result.rows[0].id, roleCheck.rows[0].id]);
                    console.log('✓ SUPER_ADMIN role assigned');
                }
            } catch (err) {
                console.log('Note: Roles table may not exist yet');
            }
        } else {
            console.log('✓ Admin user already exists:', adminCheck.rows[0]);
            
            // Reset password if needed
            console.log('\nResetting admin password to: Admin@123456');
            const passwordHash = await bcrypt.hash('Admin@123456', 12);
            await pool.query(`
                UPDATE admin_users 
                SET password_hash = $1, 
                    failed_login_attempts = 0,
                    locked_until = NULL,
                    active = true
                WHERE username = 'admin'
            `, [passwordHash]);
            console.log('✓ Password reset and account unlocked');
        }

        console.log('\n==============================================');
        console.log('  Setup Complete!');
        console.log('==============================================\n');
        console.log('Login credentials:');
        console.log('  Username: admin');
        console.log('  Password: Admin@123456\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

checkAndFixAdmin();
