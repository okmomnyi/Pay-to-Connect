-- =====================================================
-- INITIALIZE DEFAULT ADMIN USER
-- Creates a default SUPER_ADMIN for first-time setup
-- =====================================================

-- Apply admin schema first
\i admin-schema.sql

-- Create default estate if it doesn't exist
INSERT INTO estates (name, description, active) VALUES 
    ('Default Estate', 'Default location for initial setup', true)
ON CONFLICT (name) DO NOTHING;

-- Create default admin user
-- Username: admin
-- Password: Admin@123456 (MUST BE CHANGED IN PRODUCTION!)
-- Password hash generated with bcrypt rounds=12
INSERT INTO admin_users (username, email, password_hash, full_name, active) VALUES 
    ('admin', 'admin@captiveportal.local', '$2b$12$LQv3c1yqBWEHxv03kpOFQOuSiGgY4a1NOKi6oQ4Q2LhWGy/BsXbfO', 'System Administrator', true)
ON CONFLICT (username) DO UPDATE SET 
    password_hash = EXCLUDED.password_hash,
    active = true,
    locked = false,
    failed_login_attempts = 0;

-- Assign SUPER_ADMIN role to default admin
DO $$
DECLARE
    admin_user_id UUID;
    super_admin_role_id UUID;
BEGIN
    SELECT id INTO admin_user_id FROM admin_users WHERE username = 'admin';
    SELECT id INTO super_admin_role_id FROM admin_roles WHERE name = 'SUPER_ADMIN';
    
    INSERT INTO admin_user_roles (admin_user_id, role_id, granted_by)
    VALUES (admin_user_id, super_admin_role_id, admin_user_id)
    ON CONFLICT (admin_user_id, role_id) DO NOTHING;
    
    RAISE NOTICE 'Default admin user created with SUPER_ADMIN role';
END $$;

-- Log the initialization
INSERT INTO admin_action_logs (
    admin_user_id, username, action_type, resource_type, 
    action_details, success, execution_time_ms
) 
SELECT 
    id, username, 'system.initialize', 'admin',
    '{"action": "database_initialization", "message": "Admin system initialized"}'::JSONB,
    true, 0
FROM admin_users WHERE username = 'admin';

COMMIT;

-- Display summary
SELECT 
    'Admin user created' as status,
    username,
    email,
    full_name,
    active,
    created_at
FROM admin_users WHERE username = 'admin';

SELECT 
    'Admin roles assigned' as status,
    au.username,
    ar.name as role,
    aur.granted_at
FROM admin_user_roles aur
JOIN admin_users au ON aur.admin_user_id = au.id
JOIN admin_roles ar ON aur.role_id = ar.id
WHERE au.username = 'admin';
