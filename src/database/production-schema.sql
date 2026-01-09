-- SmartWiFi Captive Portal - Production Schema
-- Consolidated schema with all features for production deployment

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Estates table
CREATE TABLE IF NOT EXISTS estates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Routers table
CREATE TABLE IF NOT EXISTS routers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    estate_id UUID NOT NULL REFERENCES estates(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    ip_address INET NOT NULL,
    nas_identifier VARCHAR(100),
    secret VARCHAR(255) NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Packages table with enhanced fields
CREATE TABLE IF NOT EXISTS packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    package_type VARCHAR(20) NOT NULL DEFAULT 'time_based' CHECK (package_type IN ('time_based', 'data_based', 'hybrid')),
    duration_minutes INTEGER CHECK (duration_minutes > 0),
    data_limit_mb INTEGER CHECK (data_limit_mb > 0),
    speed_limit_mbps INTEGER,
    price_kes DECIMAL(10,2) NOT NULL CHECK (price_kes >= 0),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT package_limits_check CHECK (
        (package_type = 'time_based' AND duration_minutes IS NOT NULL) OR
        (package_type = 'data_based' AND data_limit_mb IS NOT NULL) OR
        (package_type = 'hybrid' AND duration_minutes IS NOT NULL AND data_limit_mb IS NOT NULL)
    )
);

-- Devices table
CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mac_address MACADDR NOT NULL UNIQUE,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- USER MANAGEMENT
-- ============================================================================

-- Users table (end-user accounts)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(20) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    full_name VARCHAR(255),
    profile_picture_url TEXT,
    active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    phone_verified BOOLEAN DEFAULT false,
    failed_login_attempts INTEGER DEFAULT 0,
    last_login TIMESTAMP WITH TIME ZONE,
    last_password_change TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Admin users table
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(20) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    active BOOLEAN DEFAULT true,
    failed_login_attempts INTEGER DEFAULT 0,
    last_login TIMESTAMP WITH TIME ZONE,
    password_reset_token VARCHAR(255),
    password_reset_expires TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- SECURITY & RECOVERY
-- ============================================================================

-- Security questions table
CREATE TABLE IF NOT EXISTS security_questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question TEXT NOT NULL UNIQUE,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User security answers table
CREATE TABLE IF NOT EXISTS user_security_answers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES security_questions(id) ON DELETE CASCADE,
    answer_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, question_id)
);

-- Password reset tokens table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Password recovery attempts table (for rate limiting)
CREATE TABLE IF NOT EXISTS password_recovery_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    identifier VARCHAR(255) NOT NULL, -- email or username
    ip_address INET,
    success BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Rate limiting table
CREATE TABLE IF NOT EXISTS rate_limit_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    identifier VARCHAR(255) NOT NULL, -- username, email, or IP
    action VARCHAR(50) NOT NULL, -- login, register, forgot_password, etc.
    ip_address INET,
    success BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- SESSIONS & PAYMENTS
-- ============================================================================

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(15) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    mpesa_receipt VARCHAR(50),
    mpesa_checkout_request_id VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'cancelled')),
    device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
    package_id UUID REFERENCES packages(id) ON DELETE SET NULL,
    raw_callback JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sessions table with comprehensive tracking
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    package_id UUID NOT NULL REFERENCES packages(id) ON DELETE RESTRICT,
    payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    router_id UUID NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    active BOOLEAN DEFAULT true,
    session_status VARCHAR(20) DEFAULT 'active' CHECK (session_status IN ('active', 'expired', 'exhausted', 'disconnected', 'terminated')),
    data_used_mb DECIMAL(10,2) DEFAULT 0,
    data_limit_mb INTEGER,
    bytes_uploaded BIGINT DEFAULT 0,
    bytes_downloaded BIGINT DEFAULT 0,
    total_bytes BIGINT DEFAULT 0,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    disconnect_reason VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (end_time > start_time)
);

-- Data usage logs table (for detailed tracking)
CREATE TABLE IF NOT EXISTS data_usage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    bytes_uploaded BIGINT DEFAULT 0,
    bytes_downloaded BIGINT DEFAULT 0,
    total_bytes BIGINT DEFAULT 0,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Purchase history table
CREATE TABLE IF NOT EXISTS purchase_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    package_id UUID NOT NULL REFERENCES packages(id) ON DELETE RESTRICT,
    payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
    amount_paid DECIMAL(10,2) NOT NULL,
    mpesa_receipt VARCHAR(50),
    purchase_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- SESSION MANAGEMENT
-- ============================================================================

-- User sessions table (for JWT token tracking)
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(500) NOT NULL UNIQUE,
    device_info JSONB,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    invalidated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Admin sessions table
CREATE TABLE IF NOT EXISTS admin_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES admin_users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- AUDIT & LOGGING
-- ============================================================================

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(50) NOT NULL,
    record_id UUID NOT NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_values JSONB,
    new_values JSONB,
    changed_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User activity logs
CREATE TABLE IF NOT EXISTS user_activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100),
    ip_address INET,
    user_agent TEXT,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Admin audit logs
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100),
    ip_address INET,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- User indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(active);

-- Session indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_device_id ON sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(active);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(session_status);
CREATE INDEX IF NOT EXISTS idx_sessions_end_time ON sessions(end_time);

-- User sessions indexes
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(is_active);

-- Payment indexes
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_device_id ON payments(device_id);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);

-- Package indexes
CREATE INDEX IF NOT EXISTS idx_packages_active ON packages(active);
CREATE INDEX IF NOT EXISTS idx_packages_type ON packages(package_type);

-- Security indexes
CREATE INDEX IF NOT EXISTS idx_user_security_answers_user_id ON user_security_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);

-- Rate limiting indexes
CREATE INDEX IF NOT EXISTS idx_rate_limit_identifier ON rate_limit_attempts(identifier, action, created_at);
CREATE INDEX IF NOT EXISTS idx_recovery_attempts_identifier ON password_recovery_attempts(identifier, created_at);

-- Data usage indexes
CREATE INDEX IF NOT EXISTS idx_data_usage_logs_session_id ON data_usage_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_data_usage_logs_recorded_at ON data_usage_logs(recorded_at);

-- ============================================================================
-- DEFAULT DATA
-- ============================================================================

-- Insert default security questions
INSERT INTO security_questions (question) VALUES
    ('What was the name of your first pet?'),
    ('What city were you born in?'),
    ('What is your mother''s maiden name?'),
    ('What was the name of your first school?'),
    ('What is your favorite book?'),
    ('What was your childhood nickname?'),
    ('In what city did you meet your spouse/partner?'),
    ('What is the name of your favorite childhood friend?'),
    ('What was the make and model of your first car?'),
    ('What is the name of the street you grew up on?')
ON CONFLICT (question) DO NOTHING;

-- ============================================================================
-- FUNCTIONS FOR USAGE TRACKING
-- ============================================================================

-- Function to calculate total data usage for a user
CREATE OR REPLACE FUNCTION get_user_total_data_usage(p_user_id UUID)
RETURNS TABLE (
    total_uploaded BIGINT,
    total_downloaded BIGINT,
    total_bytes BIGINT,
    session_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(bytes_uploaded), 0)::BIGINT as total_uploaded,
        COALESCE(SUM(bytes_downloaded), 0)::BIGINT as total_downloaded,
        COALESCE(SUM(total_bytes), 0)::BIGINT as total_bytes,
        COUNT(*)::INTEGER as session_count
    FROM sessions
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get active session stats for a user
CREATE OR REPLACE FUNCTION get_user_active_session_stats(p_user_id UUID)
RETURNS TABLE (
    session_id UUID,
    package_name VARCHAR(255),
    package_type VARCHAR(20),
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    time_used_minutes INTEGER,
    time_remaining_minutes INTEGER,
    data_used_mb DECIMAL(10,2),
    data_limit_mb INTEGER,
    data_remaining_mb DECIMAL(10,2),
    bytes_uploaded BIGINT,
    bytes_downloaded BIGINT,
    total_bytes BIGINT,
    session_status VARCHAR(20)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id as session_id,
        p.name as package_name,
        p.package_type,
        s.start_time,
        s.end_time,
        EXTRACT(EPOCH FROM (LEAST(NOW(), s.end_time) - s.start_time))::INTEGER / 60 as time_used_minutes,
        GREATEST(0, EXTRACT(EPOCH FROM (s.end_time - NOW()))::INTEGER / 60) as time_remaining_minutes,
        s.data_used_mb,
        s.data_limit_mb,
        CASE 
            WHEN s.data_limit_mb IS NOT NULL THEN GREATEST(0, s.data_limit_mb - COALESCE(s.data_used_mb, 0))
            ELSE NULL
        END as data_remaining_mb,
        s.bytes_uploaded,
        s.bytes_downloaded,
        s.total_bytes,
        s.session_status
    FROM sessions s
    JOIN packages p ON s.package_id = p.id
    WHERE s.user_id = p_user_id 
    AND s.active = true 
    AND s.end_time > NOW()
    ORDER BY s.start_time DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to get user session history
CREATE OR REPLACE FUNCTION get_user_session_history(p_user_id UUID, p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
    session_id UUID,
    package_name VARCHAR(255),
    package_type VARCHAR(20),
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    duration_minutes INTEGER,
    data_used_mb DECIMAL(10,2),
    amount_paid DECIMAL(10,2),
    session_status VARCHAR(20)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id as session_id,
        p.name as package_name,
        p.package_type,
        s.start_time,
        s.end_time,
        EXTRACT(EPOCH FROM (s.end_time - s.start_time))::INTEGER / 60 as duration_minutes,
        s.data_used_mb,
        py.amount as amount_paid,
        s.session_status
    FROM sessions s
    JOIN packages p ON s.package_id = p.id
    LEFT JOIN payments py ON s.payment_id = py.id
    WHERE s.user_id = p_user_id
    ORDER BY s.start_time DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to check rate limiting
CREATE OR REPLACE FUNCTION check_rate_limit(
    p_identifier VARCHAR(255),
    p_action VARCHAR(50),
    p_max_attempts INTEGER,
    p_window_minutes INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
    attempt_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO attempt_count
    FROM rate_limit_attempts
    WHERE identifier = p_identifier
    AND action = p_action
    AND created_at > NOW() - (p_window_minutes || ' minutes')::INTERVAL;
    
    RETURN attempt_count < p_max_attempts;
END;
$$ LANGUAGE plpgsql;

-- Function to log rate limit attempt
CREATE OR REPLACE FUNCTION log_rate_limit_attempt(
    p_identifier VARCHAR(255),
    p_action VARCHAR(50),
    p_ip_address INET,
    p_success BOOLEAN
) RETURNS VOID AS $$
BEGIN
    INSERT INTO rate_limit_attempts (identifier, action, ip_address, success)
    VALUES (p_identifier, p_action, p_ip_address, p_success);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON admin_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_packages_updated_at BEFORE UPDATE ON packages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_routers_updated_at BEFORE UPDATE ON routers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON devices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
