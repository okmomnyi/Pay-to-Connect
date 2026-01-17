#!/usr/bin/env node

/**
 * Test Admin Login - Diagnostic Script
 * Tests database connection and admin user setup
 */

const { Client } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m'
};

function log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
}

async function testAdminLogin() {
    log('\n==============================================', colors.blue);
    log('  Admin Login Diagnostic Test', colors.blue);
    log('==============================================\n', colors.blue);

    // Connect to database
    log('1. Connecting to database...', colors.blue);
    
    const client = new Client({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        await client.connect();
        log('✓ Connected to database', colors.green);
    } catch (error) {
        log(`✗ Failed to connect: ${error.message}`, colors.red);
        process.exit(1);
    }

    // Check if admin_users table exists
    log('\n2. Checking admin_users table...', colors.blue);
    
    try {
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'admin_users'
            );
        `);
        
        if (tableCheck.rows[0].exists) {
            log('✓ admin_users table exists', colors.green);
        } else {
            log('✗ admin_users table does not exist', colors.red);
            log('Run: node scripts/setup-admin-panel.js', colors.yellow);
            await client.end();
            process.exit(1);
        }
    } catch (error) {
        log(`✗ Error checking table: ${error.message}`, colors.red);
        await client.end();
        process.exit(1);
    }

    // Check if default admin exists
    log('\n3. Checking default admin user...', colors.blue);
    
    try {
        const adminCheck = await client.query(`
            SELECT id, username, email, active, locked, failed_login_attempts, password_hash
            FROM admin_users 
            WHERE username = 'admin'
        `);
        
        if (adminCheck.rows.length === 0) {
            log('✗ Default admin user does not exist', colors.red);
            log('Run: node scripts/setup-admin-panel.js', colors.yellow);
            await client.end();
            process.exit(1);
        }
        
        const admin = adminCheck.rows[0];
        log('✓ Default admin user exists', colors.green);
        log(`  Username: ${admin.username}`, colors.reset);
        log(`  Email: ${admin.email}`, colors.reset);
        log(`  Active: ${admin.active}`, admin.active ? colors.green : colors.red);
        log(`  Locked: ${admin.locked}`, admin.locked ? colors.red : colors.green);
        log(`  Failed attempts: ${admin.failed_login_attempts}`, colors.reset);
        
        if (admin.locked) {
            log('\n⚠ Admin account is locked!', colors.red);
            log('Unlocking account...', colors.yellow);
            await client.query(`
                UPDATE admin_users 
                SET locked = false, failed_login_attempts = 0 
                WHERE username = 'admin'
            `);
            log('✓ Account unlocked', colors.green);
        }
        
        // Test password
        log('\n4. Testing default password...', colors.blue);
        const testPassword = 'Admin@123456';
        const passwordMatch = await bcrypt.compare(testPassword, admin.password_hash);
        
        if (passwordMatch) {
            log('✓ Default password is correct', colors.green);
        } else {
            log('✗ Default password does not match', colors.red);
            log('Resetting to default password...', colors.yellow);
            const newHash = await bcrypt.hash(testPassword, 12);
            await client.query(`
                UPDATE admin_users 
                SET password_hash = $1 
                WHERE username = 'admin'
            `, [newHash]);
            log('✓ Password reset to: Admin@123456', colors.green);
        }
        
    } catch (error) {
        log(`✗ Error checking admin: ${error.message}`, colors.red);
        await client.end();
        process.exit(1);
    }

    // Check admin roles
    log('\n5. Checking admin roles...', colors.blue);
    
    try {
        const rolesCheck = await client.query(`
            SELECT ar.name, ar.description
            FROM admin_user_roles aur
            JOIN admin_roles ar ON aur.role_id = ar.id
            JOIN admin_users au ON aur.admin_user_id = au.id
            WHERE au.username = 'admin'
        `);
        
        if (rolesCheck.rows.length === 0) {
            log('✗ No roles assigned to admin', colors.red);
            log('Assigning SUPER_ADMIN role...', colors.yellow);
            
            await client.query(`
                INSERT INTO admin_user_roles (admin_user_id, role_id, granted_by)
                SELECT au.id, ar.id, au.id
                FROM admin_users au, admin_roles ar
                WHERE au.username = 'admin' AND ar.name = 'SUPER_ADMIN'
                ON CONFLICT DO NOTHING
            `);
            log('✓ SUPER_ADMIN role assigned', colors.green);
        } else {
            log('✓ Admin has roles:', colors.green);
            rolesCheck.rows.forEach(role => {
                log(`  - ${role.name}: ${role.description}`, colors.reset);
            });
        }
    } catch (error) {
        log(`✗ Error checking roles: ${error.message}`, colors.red);
    }

    // Check permissions
    log('\n6. Checking admin permissions...', colors.blue);
    
    try {
        const permsCheck = await client.query(`
            SELECT get_admin_permissions(id) as permissions
            FROM admin_users
            WHERE username = 'admin'
        `);
        
        if (permsCheck.rows.length > 0 && permsCheck.rows[0].permissions) {
            const permissions = permsCheck.rows[0].permissions;
            log(`✓ Admin has ${permissions.length} permissions`, colors.green);
        } else {
            log('✗ No permissions found', colors.red);
        }
    } catch (error) {
        log(`⚠ Error checking permissions: ${error.message}`, colors.yellow);
    }

    // Check ENCRYPTION_KEY
    log('\n7. Checking environment variables...', colors.blue);
    
    if (!process.env.ENCRYPTION_KEY) {
        log('✗ ENCRYPTION_KEY not set', colors.red);
        log('Add to .env: ENCRYPTION_KEY=<32+ character key>', colors.yellow);
    } else if (process.env.ENCRYPTION_KEY.length < 32) {
        log('✗ ENCRYPTION_KEY too short (minimum 32 characters)', colors.red);
    } else {
        log('✓ ENCRYPTION_KEY is set', colors.green);
    }
    
    if (!process.env.JWT_SECRET) {
        log('✗ JWT_SECRET not set', colors.red);
    } else {
        log('✓ JWT_SECRET is set', colors.green);
    }

    await client.end();

    log('\n==============================================', colors.blue);
    log('  Diagnostic Complete', colors.blue);
    log('==============================================\n', colors.blue);
    
    log('You can now try logging in with:', colors.green);
    log('  URL: http://localhost:3000/admin', colors.reset);
    log('  Username: admin', colors.reset);
    log('  Password: Admin@123456', colors.reset);
    log('\n⚠️  Remember to change the password after first login!\n', colors.yellow);
}

testAdminLogin().catch(error => {
    log(`\n✗ Test failed: ${error.message}`, colors.red);
    console.error(error);
    process.exit(1);
});
