#!/usr/bin/env node

const { Pool } = require('pg');
require('dotenv').config();

async function assignAdminRole() {
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
        console.log('  Assigning SUPER_ADMIN Role');
        console.log('==============================================\n');

        // Get admin user
        const adminUser = await pool.query(`SELECT id, username FROM admin_users WHERE username = 'admin'`);
        if (adminUser.rows.length === 0) {
            console.log('❌ Admin user not found');
            process.exit(1);
        }
        console.log('✓ Found admin user:', adminUser.rows[0].username);

        // Get SUPER_ADMIN role
        const superAdminRole = await pool.query(`SELECT id, name FROM admin_roles WHERE name = 'SUPER_ADMIN'`);
        if (superAdminRole.rows.length === 0) {
            console.log('❌ SUPER_ADMIN role not found');
            process.exit(1);
        }
        console.log('✓ Found SUPER_ADMIN role');

        // Assign role to user (using correct column name: admin_user_id)
        await pool.query(`
            INSERT INTO admin_user_roles (admin_user_id, role_id)
            VALUES ($1, $2)
            ON CONFLICT (admin_user_id, role_id) DO NOTHING
        `, [adminUser.rows[0].id, superAdminRole.rows[0].id]);
        console.log('✓ SUPER_ADMIN role assigned to admin user\n');

        // Assign all permissions to SUPER_ADMIN role
        console.log('Assigning all permissions to SUPER_ADMIN role...');
        const result = await pool.query(`
            INSERT INTO admin_role_permissions (role_id, permission_id)
            SELECT $1, id FROM admin_permissions
            ON CONFLICT (role_id, permission_id) DO NOTHING
            RETURNING *
        `, [superAdminRole.rows[0].id]);
        console.log(`✓ ${result.rowCount} permissions assigned to SUPER_ADMIN\n`);

        console.log('==============================================');
        console.log('  Setup Complete!');
        console.log('==============================================\n');
        console.log('You can now login with:');
        console.log('  Username: admin');
        console.log('  Password: Admin@123456\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

assignAdminRole();
