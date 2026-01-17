-- =====================================================
-- SECURE ADMIN PANEL DATABASE SCHEMA
-- Production-ready ISP Captive Portal Admin System
-- =====================================================

-- Admin Users Table
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    active BOOLEAN DEFAULT true,
    locked BOOLEAN DEFAULT false,
    failed_login_attempts INTEGER DEFAULT 0,
    last_login_at TIMESTAMP WITH TIME ZONE,
    last_login_ip INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES admin_users(id)
);

-- Admin Roles Table
CREATE TABLE IF NOT EXISTS admin_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Admin User Roles Junction Table
CREATE TABLE IF NOT EXISTS admin_user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES admin_roles(id) ON DELETE CASCADE,
    granted_by UUID REFERENCES admin_users(id),
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(admin_user_id, role_id)
);

-- Admin Sessions Table
CREATE TABLE IF NOT EXISTS admin_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Estates/Locations Table (if not exists)
CREATE TABLE IF NOT EXISTS estates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    address TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Routers Table (enhanced)
CREATE TABLE IF NOT EXISTS routers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    estate_id UUID REFERENCES estates(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    ip_address INET NOT NULL,
    api_port INTEGER NOT NULL DEFAULT 8729,
    description TEXT,
    active BOOLEAN DEFAULT true,
    connection_status VARCHAR(20) DEFAULT 'unknown',
    last_sync_at TIMESTAMP WITH TIME ZONE,
    last_health_check TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ip_address, api_port)
);

-- Router Credentials Table (Encrypted Storage)
CREATE TABLE IF NOT EXISTS router_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    router_id UUID NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
    api_username VARCHAR(100) NOT NULL,
    api_password_encrypted TEXT NOT NULL,
    encryption_iv TEXT NOT NULL,
    connection_timeout INTEGER NOT NULL DEFAULT 10000,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(router_id)
);

-- Admin Action Logs (Immutable Audit Trail)
CREATE TABLE IF NOT EXISTS admin_action_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID REFERENCES admin_users(id),
    username VARCHAR(100) NOT NULL,
    action_type VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    action_details JSONB,
    before_state JSONB,
    after_state JSONB,
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    execution_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Router Operation Logs
CREATE TABLE IF NOT EXISTS router_operation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    router_id UUID NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
    admin_user_id UUID REFERENCES admin_users(id),
    operation_type VARCHAR(50) NOT NULL,
    api_command TEXT NOT NULL,
    api_params JSONB,
    success BOOLEAN NOT NULL,
    response_data JSONB,
    error_message TEXT,
    execution_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Security Event Logs
CREATE TABLE IF NOT EXISTS security_event_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'medium',
    user_id UUID,
    user_type VARCHAR(20),
    ip_address INET,
    user_agent TEXT,
    event_details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Router Sync Status
CREATE TABLE IF NOT EXISTS router_sync_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    router_id UUID NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    sync_status VARCHAR(20) DEFAULT 'pending',
    packages_synced INTEGER DEFAULT 0,
    users_synced INTEGER DEFAULT 0,
    sync_errors JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(router_id)
);

-- Create Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username);
CREATE INDEX IF NOT EXISTS idx_admin_users_active ON admin_users(active);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token_hash ON admin_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_user_id ON admin_sessions(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_admin_action_logs_admin_user_id ON admin_action_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_action_logs_created_at ON admin_action_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_action_logs_action_type ON admin_action_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_admin_action_logs_resource_type ON admin_action_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_router_operation_logs_router_id ON router_operation_logs(router_id);
CREATE INDEX IF NOT EXISTS idx_router_operation_logs_created_at ON router_operation_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_security_event_logs_created_at ON security_event_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_security_event_logs_event_type ON security_event_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_routers_estate_id ON routers(estate_id);
CREATE INDEX IF NOT EXISTS idx_routers_active ON routers(active);

-- Insert Default Admin Roles
INSERT INTO admin_roles (name, description, permissions) VALUES
    ('SUPER_ADMIN', 'Full system access including all management capabilities', 
     '["admin.create", "admin.edit", "admin.delete", "admin.view", "user.create", "user.edit", "user.delete", "user.view", "user.disconnect", "package.create", "package.edit", "package.delete", "package.view", "router.create", "router.edit", "router.delete", "router.view", "router.sync", "router.disconnect", "session.view", "session.disconnect", "payment.view", "payment.verify", "estate.create", "estate.edit", "estate.delete", "estate.view", "audit.view", "security.view", "settings.edit"]'),
    ('NETWORK_ADMIN', 'Network and router management access',
     '["user.view", "user.disconnect", "package.view", "router.create", "router.edit", "router.view", "router.sync", "router.disconnect", "session.view", "session.disconnect", "estate.view", "audit.view"]'),
    ('SUPPORT_ADMIN', 'Customer support and session management',
     '["user.view", "user.disconnect", "package.view", "session.view", "session.disconnect", "payment.view", "estate.view"]'),
    ('READ_ONLY', 'Read-only access to all resources',
     '["admin.view", "user.view", "package.view", "router.view", "session.view", "payment.view", "estate.view", "audit.view"]')
ON CONFLICT (name) DO UPDATE SET 
    description = EXCLUDED.description,
    permissions = EXCLUDED.permissions;

-- Update Triggers for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_admin_users_updated_at ON admin_users;
CREATE TRIGGER update_admin_users_updated_at
    BEFORE UPDATE ON admin_users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_admin_roles_updated_at ON admin_roles;
CREATE TRIGGER update_admin_roles_updated_at
    BEFORE UPDATE ON admin_roles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_routers_updated_at ON routers;
CREATE TRIGGER update_routers_updated_at
    BEFORE UPDATE ON routers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_router_credentials_updated_at ON router_credentials;
CREATE TRIGGER update_router_credentials_updated_at
    BEFORE UPDATE ON router_credentials
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_estates_updated_at ON estates;
CREATE TRIGGER update_estates_updated_at
    BEFORE UPDATE ON estates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_router_sync_status_updated_at ON router_sync_status;
CREATE TRIGGER update_router_sync_status_updated_at
    BEFORE UPDATE ON router_sync_status
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Security Functions
CREATE OR REPLACE FUNCTION check_admin_permission(user_id UUID, required_permission TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    has_permission BOOLEAN := FALSE;
BEGIN
    SELECT EXISTS (
        SELECT 1 
        FROM admin_user_roles aur
        JOIN admin_roles ar ON aur.role_id = ar.id
        WHERE aur.admin_user_id = user_id
        AND ar.permissions ? required_permission
    ) INTO has_permission;
    
    RETURN has_permission;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

-- Function to log security events
CREATE OR REPLACE FUNCTION log_security_event(
    p_event_type TEXT,
    p_severity TEXT,
    p_user_id UUID,
    p_user_type TEXT,
    p_ip_address INET,
    p_user_agent TEXT,
    p_event_details JSONB
) RETURNS UUID AS $$
DECLARE
    event_id UUID;
BEGIN
    INSERT INTO security_event_logs (
        event_type, severity, user_id, user_type, 
        ip_address, user_agent, event_details
    ) VALUES (
        p_event_type, p_severity, p_user_id, p_user_type,
        p_ip_address, p_user_agent, p_event_details
    ) RETURNING id INTO event_id;
    
    RETURN event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean expired admin sessions
CREATE OR REPLACE FUNCTION clean_expired_admin_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM admin_sessions
    WHERE expires_at < CURRENT_TIMESTAMP;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMIT;
