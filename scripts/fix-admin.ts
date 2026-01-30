import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: {
        rejectUnauthorized: false
    }
});

const BCRYPT_ROUNDS = 12;

async function fixAdmin() {
    try {
        console.log('Starting admin fix...');
        console.log(`Connecting to ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
        
        // Test connection
        await pool.query('SELECT NOW()');
        console.log('✓ Database connection successful');
        
        // Check if admin_users table exists
        const tableCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'admin_users'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('ERROR: admin_users table does not exist. Run migrations first.');
            process.exit(1);
        }
        
        // Check if admin user exists
        const adminCheck = await pool.query(
            `SELECT id, username, email, active, locked, failed_login_attempts 
             FROM admin_users WHERE username = 'admin'`
        );
        
        // Generate new password hash for 'Admin@123456'
        const defaultPassword = 'Admin@123456';
        const passwordHash = await bcrypt.hash(defaultPassword, BCRYPT_ROUNDS);
        
        if (adminCheck.rows.length === 0) {
            console.log('Admin user does not exist. Creating...');
            
            await pool.query(`
                INSERT INTO admin_users (username, email, password_hash, full_name, active, locked, failed_login_attempts)
                VALUES ('admin', 'admin@captiveportal.local', $1, 'System Administrator', true, false, 0)
            `, [passwordHash]);
            
            console.log('✓ Admin user created');
        } else {
            console.log('Admin user exists. Resetting password and unlocking...');
            
            await pool.query(`
                UPDATE admin_users 
                SET password_hash = $1,
                    active = true,
                    locked = false,
                    failed_login_attempts = 0
                WHERE username = 'admin'
            `, [passwordHash]);
            
            console.log('✓ Admin user updated');
        }
        
        // Check if admin_roles table exists and has SUPER_ADMIN
        const roleCheck = await pool.query(
            `SELECT id FROM admin_roles WHERE name = 'SUPER_ADMIN'`
        );
        
        if (roleCheck.rows.length === 0) {
            console.log('SUPER_ADMIN role does not exist. Creating...');
            
            await pool.query(`
                INSERT INTO admin_roles (name, description, permissions)
                VALUES ('SUPER_ADMIN', 'Full system access', 
                    '["admin.create", "admin.edit", "admin.delete", "admin.view", "user.create", "user.edit", "user.delete", "user.view", "package.create", "package.edit", "package.delete", "package.view", "router.create", "router.edit", "router.delete", "router.view", "router.sync", "session.view", "session.disconnect", "payment.view", "audit.view", "settings.edit"]')
            `);
            
            console.log('✓ SUPER_ADMIN role created');
        }
        
        // Assign SUPER_ADMIN role to admin user
        const adminUser = await pool.query(`SELECT id FROM admin_users WHERE username = 'admin'`);
        const superAdminRole = await pool.query(`SELECT id FROM admin_roles WHERE name = 'SUPER_ADMIN'`);
        
        if (adminUser.rows.length > 0 && superAdminRole.rows.length > 0) {
            await pool.query(`
                INSERT INTO admin_user_roles (admin_user_id, role_id)
                VALUES ($1, $2)
                ON CONFLICT (admin_user_id, role_id) DO NOTHING
            `, [adminUser.rows[0].id, superAdminRole.rows[0].id]);
            
            console.log('✓ SUPER_ADMIN role assigned to admin user');
        }
        
        // Verify the setup
        const verifyAdmin = await pool.query(`
            SELECT au.username, au.email, au.active, au.locked, 
                   ar.name as role, get_admin_permissions(au.id) as permissions
            FROM admin_users au
            LEFT JOIN admin_user_roles aur ON au.id = aur.admin_user_id
            LEFT JOIN admin_roles ar ON aur.role_id = ar.id
            WHERE au.username = 'admin'
        `);
        
        console.log('\nAdmin user status:');
        console.log(verifyAdmin.rows[0]);
        
        console.log('\n✓ Admin fix completed successfully!');
        console.log('\nDefault admin credentials:');
        console.log('  Username: admin');
        console.log('  Password: Admin@123456');
        console.log('\n⚠️  CHANGE THIS PASSWORD IMMEDIATELY IN PRODUCTION!');
        
    } catch (error) {
        console.error('Admin fix failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

fixAdmin();
