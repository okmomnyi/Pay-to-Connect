-- =====================================================
-- COMPLETE DATABASE FIX
-- Run this on your production database to fix all issues
-- =====================================================

-- =====================================================
-- PART 1: FIX USERS TABLE
-- =====================================================

-- Add email_verified column if missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;

-- Add phone_verified column if missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false;

-- Add failed_login_attempts column if missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;

-- Add locked_until column if missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP WITH TIME ZONE;

-- Add last_login column if missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE;

-- Add first_name column if missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);

-- Add last_name column if missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);

-- Add active column if missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

-- =====================================================
-- PART 2: CREATE REQUIRED FUNCTIONS
-- =====================================================

-- Function to get admin permissions
CREATE OR REPLACE FUNCTION get_admin_permissions(user_id UUID)
RETURNS JSONB AS $$
DECLARE
    all_permissions JSONB := '[]'::JSONB;
BEGIN
    SELECT COALESCE(jsonb_agg(DISTINCT perm), '[]'::JSONB)
    INTO all_permissions
    FROM admin_user_roles aur
    JOIN admin_roles ar ON aur.role_id = ar.id,
    jsonb_array_elements_text(ar.permissions) perm
    WHERE aur.admin_user_id = user_id;
    
    RETURN all_permissions;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- PART 3: FIX ADMIN USER
-- =====================================================

-- Reset admin password to 'Admin@123456' (bcrypt hash with 12 rounds)
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

-- =====================================================
-- VERIFICATION
-- =====================================================

-- Show users table columns
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'users'
ORDER BY ordinal_position;

-- Show admin user status
SELECT au.username, au.email, au.active, au.locked, ar.name as role
FROM admin_users au
LEFT JOIN admin_user_roles aur ON au.id = aur.admin_user_id
LEFT JOIN admin_roles ar ON aur.role_id = ar.id
WHERE au.username = 'admin';

SELECT '=== FIX COMPLETE ===' as status;
SELECT 'Admin credentials: admin / Admin@123456' as credentials;
SELECT 'CHANGE PASSWORD IMMEDIATELY!' as warning;
