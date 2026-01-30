-- =====================================================
-- FIX ADMIN LOGIN - Create missing function
-- Run this immediately to fix admin login 401 error
-- =====================================================

-- Create the get_admin_permissions function
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

-- Verify the function was created
SELECT 'get_admin_permissions function created successfully!' as status;

-- Test the function with admin user
SELECT username, get_admin_permissions(id) as permissions
FROM admin_users
WHERE username = 'admin';
