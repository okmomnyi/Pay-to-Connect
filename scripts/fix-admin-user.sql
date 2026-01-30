-- =====================================================
-- FIX ADMIN USER - Reset admin credentials
-- Run this on your production database
-- =====================================================

-- Check current admin user status
SELECT id, username, email, active, locked, failed_login_attempts 
FROM admin_users WHERE username = 'admin';

-- Reset admin password to 'Admin@123456' (bcrypt hash with 12 rounds)
-- IMPORTANT: Change this password immediately after login!
UPDATE admin_users 
SET password_hash = '$2b$12$LQv3c1yqBWEHxv03kpOFQOuSiGgY4a1NOKi6oQ4Q2LhWGy/BsXbfO',
    active = true,
    locked = false,
    failed_login_attempts = 0
WHERE username = 'admin';

-- If admin user doesn't exist, create it
INSERT INTO admin_users (username, email, password_hash, full_name, active, locked, failed_login_attempts)
SELECT 'admin', 'admin@captiveportal.local', '$2b$12$LQv3c1yqBWEHxv03kpOFQOuSiGgY4a1NOKi6oQ4Q2LhWGy/BsXbfO', 'System Administrator', true, false, 0
WHERE NOT EXISTS (SELECT 1 FROM admin_users WHERE username = 'admin');

-- Ensure SUPER_ADMIN role exists
INSERT INTO admin_roles (name, description, permissions)
VALUES ('SUPER_ADMIN', 'Full system access', 
    '["admin.create", "admin.edit", "admin.delete", "admin.view", "user.create", "user.edit", "user.delete", "user.view", "package.create", "package.edit", "package.delete", "package.view", "router.create", "router.edit", "router.delete", "router.view", "router.sync", "session.view", "session.disconnect", "payment.view", "audit.view", "settings.edit"]')
ON CONFLICT (name) DO NOTHING;

-- Assign SUPER_ADMIN role to admin user
INSERT INTO admin_user_roles (admin_user_id, role_id)
SELECT au.id, ar.id
FROM admin_users au, admin_roles ar
WHERE au.username = 'admin' AND ar.name = 'SUPER_ADMIN'
ON CONFLICT (admin_user_id, role_id) DO NOTHING;

-- Verify the fix
SELECT au.username, au.email, au.active, au.locked, ar.name as role
FROM admin_users au
LEFT JOIN admin_user_roles aur ON au.id = aur.admin_user_id
LEFT JOIN admin_roles ar ON aur.role_id = ar.id
WHERE au.username = 'admin';

SELECT 'Admin user fixed! Login with: admin / Admin@123456' as status;
