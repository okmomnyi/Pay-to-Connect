-- Enhanced Database Schema for Secure Router Management
-- This extends the existing production schema with RBAC and router management

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

-- Router Credentials Table (Encrypted Storage)
CREATE TABLE IF NOT EXISTS router_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    router_id UUID NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
    api_username VARCHAR(100) NOT NULL,
    api_password_encrypted TEXT NOT NULL,
    api_port INTEGER NOT NULL DEFAULT 8729,
    connection_timeout INTEGER NOT NULL DEFAULT 10000,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(router_id)
);

-- Router Configuration Templates
CREATE TABLE IF NOT EXISTS router_config_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    config_data JSONB NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES admin_users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Router Sync Status Tracking
CREATE TABLE IF NOT EXISTS router_sync_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    router_id UUID NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    sync_status VARCHAR(20) DEFAULT 'pending',
    packages_synced INTEGER DEFAULT 0,
    sync_errors JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(router_id)
);

-- Admin Action Logs (Immutable Audit Trail)
CREATE TABLE IF NOT EXISTS admin_action_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID REFERENCES admin_users(id),
    username VARCHAR(100),
    action_type VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    action_details JSONB,
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    execution_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Router Operation Logs (MikroTik API Calls)
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

-- Add connection_status column to routers table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='routers' AND column_name='connection_status') THEN
        ALTER TABLE routers ADD COLUMN connection_status VARCHAR(20) DEFAULT 'unknown';
    END IF;
END $$;

-- Add last_sync_at column to routers table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='routers' AND column_name='last_sync_at') THEN
        ALTER TABLE routers ADD COLUMN last_sync_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Create Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_admin_action_logs_admin_user_id ON admin_action_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_action_logs_created_at ON admin_action_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_action_logs_action_type ON admin_action_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_router_operation_logs_router_id ON router_operation_logs(router_id);
CREATE INDEX IF NOT EXISTS idx_router_operation_logs_created_at ON router_operation_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_security_event_logs_created_at ON security_event_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_security_event_logs_event_type ON security_event_logs(event_type);

-- Insert Default Admin Roles
INSERT INTO admin_roles (name, description, permissions) VALUES
    ('SUPER_ADMIN', 'Full system access including router management', 
     '["router.manage", "router.view", "package.manage", "package.view", "admin.manage", "admin.view", "session.manage", "session.view", "payment.manage", "payment.view", "audit.view", "security.view"]'),
    ('NETWORK_ADMIN', 'Network and router management access',
     '["router.manage", "router.view", "package.view", "session.view", "audit.view"]'),
    ('SUPPORT_ADMIN', 'Customer support and session management',
     '["package.view", "session.manage", "session.view", "payment.view"]'),
    ('READONLY_ADMIN', 'Read-only access to all resources',
     '["router.view", "package.view", "session.view", "payment.view", "admin.view", "audit.view"]')
ON CONFLICT (name) DO UPDATE SET 
    description = EXCLUDED.description,
    permissions = EXCLUDED.permissions;

-- Create Security Functions
CREATE OR REPLACE FUNCTION check_admin_permission(user_id UUID, required_permission TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    has_permission BOOLEAN := FALSE;
    role_permissions JSONB;
BEGIN
    -- Check if user has the required permission through any of their roles
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

-- Update triggers for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update triggers
DROP TRIGGER IF EXISTS update_router_credentials_updated_at ON router_credentials;
CREATE TRIGGER update_router_credentials_updated_at
    BEFORE UPDATE ON router_credentials
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_router_config_templates_updated_at ON router_config_templates;
CREATE TRIGGER update_router_config_templates_updated_at
    BEFORE UPDATE ON router_config_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_router_sync_status_updated_at ON router_sync_status;
CREATE TRIGGER update_router_sync_status_updated_at
    BEFORE UPDATE ON router_sync_status
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMIT;
