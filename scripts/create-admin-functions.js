#!/usr/bin/env node

const { Pool } = require('pg');
require('dotenv').config();

async function createAdminFunctions() {
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
        console.log('  Creating Admin Database Functions');
        console.log('==============================================\n');

        // Create get_admin_permissions function
        console.log('Creating get_admin_permissions function...');
        await pool.query(`
            CREATE OR REPLACE FUNCTION get_admin_permissions(p_user_id UUID)
            RETURNS TABLE (
                permission_name VARCHAR(100),
                resource VARCHAR(50),
                action VARCHAR(50)
            ) AS $$
            BEGIN
                RETURN QUERY
                SELECT DISTINCT 
                    p.name as permission_name,
                    p.resource,
                    p.action
                FROM admin_users u
                JOIN admin_user_roles ur ON u.id = ur.user_id
                JOIN admin_roles r ON ur.role_id = r.id
                JOIN admin_role_permissions rp ON r.id = rp.role_id
                JOIN admin_permissions p ON rp.permission_id = p.id
                WHERE u.id = p_user_id
                AND u.active = true
                AND r.active = true;
            END;
            $$ LANGUAGE plpgsql;
        `);
        console.log('✓ get_admin_permissions function created\n');

        // Create admin_permissions table if it doesn't exist
        console.log('Checking admin_permissions table...');
        const permTableCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'admin_permissions'
            );
        `);

        if (!permTableCheck.rows[0].exists) {
            console.log('Creating admin_permissions table...');
            await pool.query(`
                CREATE TABLE admin_permissions (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    name VARCHAR(100) NOT NULL UNIQUE,
                    description TEXT,
                    resource VARCHAR(50) NOT NULL,
                    action VARCHAR(50) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(resource, action)
                );
            `);
            console.log('✓ admin_permissions table created');

            // Insert default permissions
            console.log('Inserting default permissions...');
            await pool.query(`
                INSERT INTO admin_permissions (name, description, resource, action) VALUES
                ('view_dashboard', 'View admin dashboard', 'dashboard', 'read'),
                ('manage_users', 'Manage admin users', 'users', 'write'),
                ('view_users', 'View admin users', 'users', 'read'),
                ('manage_routers', 'Manage routers', 'routers', 'write'),
                ('view_routers', 'View routers', 'routers', 'read'),
                ('manage_packages', 'Manage packages', 'packages', 'write'),
                ('view_packages', 'View packages', 'packages', 'read'),
                ('view_logs', 'View audit logs', 'logs', 'read'),
                ('manage_sessions', 'Manage user sessions', 'sessions', 'write'),
                ('view_sessions', 'View user sessions', 'sessions', 'read')
                ON CONFLICT (resource, action) DO NOTHING;
            `);
            console.log('✓ Default permissions inserted\n');
        } else {
            console.log('✓ admin_permissions table exists\n');
        }

        // Check admin_roles table
        console.log('Checking admin_roles table...');
        const rolesCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'admin_roles'
            );
        `);

        if (!rolesCheck.rows[0].exists) {
            console.log('Creating admin_roles table...');
            await pool.query(`
                CREATE TABLE admin_roles (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    name VARCHAR(50) NOT NULL UNIQUE,
                    description TEXT,
                    active BOOLEAN DEFAULT true,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Insert default roles
            await pool.query(`
                INSERT INTO admin_roles (name, description) VALUES
                ('SUPER_ADMIN', 'Full system access'),
                ('NETWORK_ADMIN', 'Manage routers and network'),
                ('SUPPORT_ADMIN', 'View and manage user sessions'),
                ('READ_ONLY', 'Read-only access')
                ON CONFLICT (name) DO NOTHING;
            `);
            console.log('✓ admin_roles table created with default roles\n');
        } else {
            console.log('✓ admin_roles table exists\n');
        }

        // Check admin_user_roles table
        console.log('Checking admin_user_roles table...');
        const userRolesCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'admin_user_roles'
            );
        `);

        if (!userRolesCheck.rows[0].exists) {
            console.log('Creating admin_user_roles table...');
            await pool.query(`
                CREATE TABLE admin_user_roles (
                    user_id UUID REFERENCES admin_users(id) ON DELETE CASCADE,
                    role_id UUID REFERENCES admin_roles(id) ON DELETE CASCADE,
                    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, role_id)
                );
            `);
            console.log('✓ admin_user_roles table created\n');
        } else {
            console.log('✓ admin_user_roles table exists\n');
        }

        // Check admin_role_permissions table
        console.log('Checking admin_role_permissions table...');
        const rolePermsCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'admin_role_permissions'
            );
        `);

        if (!rolePermsCheck.rows[0].exists) {
            console.log('Creating admin_role_permissions table...');
            await pool.query(`
                CREATE TABLE admin_role_permissions (
                    role_id UUID REFERENCES admin_roles(id) ON DELETE CASCADE,
                    permission_id UUID REFERENCES admin_permissions(id) ON DELETE CASCADE,
                    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (role_id, permission_id)
                );
            `);
            console.log('✓ admin_role_permissions table created\n');
        } else {
            console.log('✓ admin_role_permissions table exists\n');
        }

        // Assign SUPER_ADMIN role to admin user
        console.log('Assigning SUPER_ADMIN role to admin user...');
        const adminUser = await pool.query(`SELECT id FROM admin_users WHERE username = 'admin'`);
        const superAdminRole = await pool.query(`SELECT id FROM admin_roles WHERE name = 'SUPER_ADMIN'`);
        
        if (adminUser.rows.length > 0 && superAdminRole.rows.length > 0) {
            await pool.query(`
                INSERT INTO admin_user_roles (user_id, role_id)
                VALUES ($1, $2)
                ON CONFLICT (user_id, role_id) DO NOTHING
            `, [adminUser.rows[0].id, superAdminRole.rows[0].id]);
            console.log('✓ SUPER_ADMIN role assigned to admin user\n');

            // Assign all permissions to SUPER_ADMIN role
            console.log('Assigning all permissions to SUPER_ADMIN role...');
            await pool.query(`
                INSERT INTO admin_role_permissions (role_id, permission_id)
                SELECT $1, id FROM admin_permissions
                ON CONFLICT (role_id, permission_id) DO NOTHING
            `, [superAdminRole.rows[0].id]);
            console.log('✓ All permissions assigned to SUPER_ADMIN\n');
        }

        console.log('==============================================');
        console.log('  Setup Complete!');
        console.log('==============================================\n');
        console.log('You can now login with:');
        console.log('  Username: admin');
        console.log('  Password: Admin@123456\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

createAdminFunctions();
