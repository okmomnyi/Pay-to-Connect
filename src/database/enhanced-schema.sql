-- Enhanced Captive Portal Schema
-- Adds user authentication, session tracking, data usage monitoring, and purchase history

-- User sessions table (for authenticated user sessions - JWT tokens)
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(500) NOT NULL UNIQUE,
    device_info JSONB,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enhanced packages table with data limits and speed tiers
ALTER TABLE packages 
ADD COLUMN IF NOT EXISTS data_limit_mb INTEGER,
ADD COLUMN IF NOT EXISTS speed_limit_mbps INTEGER,
ADD COLUMN IF NOT EXISTS description TEXT;

-- Update existing packages with data limits
UPDATE packages SET data_limit_mb = 500, speed_limit_mbps = 5, description = 'Basic browsing for 1 hour' WHERE name = '1 Hour';
UPDATE packages SET data_limit_mb = 1500, speed_limit_mbps = 10, description = 'Stream and browse for 3 hours' WHERE name = '3 Hours';
UPDATE packages SET data_limit_mb = 3000, speed_limit_mbps = 15, description = 'Extended browsing for 6 hours' WHERE name = '6 Hours';
UPDATE packages SET data_limit_mb = 6000, speed_limit_mbps = 20, description = 'All-day connectivity for 12 hours' WHERE name = '12 Hours';
UPDATE packages SET data_limit_mb = 12000, speed_limit_mbps = 25, description = 'Full day unlimited browsing' WHERE name = '24 Hours';

-- Enhanced sessions table with data usage tracking
ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS data_used_mb DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS data_limit_mb INTEGER,
ADD COLUMN IF NOT EXISTS last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS disconnect_reason VARCHAR(50),
ADD COLUMN IF NOT EXISTS session_status VARCHAR(20) DEFAULT 'active' CHECK (session_status IN ('active', 'expired', 'exhausted', 'disconnected', 'terminated'));

-- Purchase history table
CREATE TABLE IF NOT EXISTS purchase_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    package_id UUID NOT NULL REFERENCES packages(id) ON DELETE RESTRICT,
    payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
    amount_paid DECIMAL(10,2) NOT NULL,
    purchase_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
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

-- OTP verification table (for phone/email verification)
CREATE TABLE IF NOT EXISTS otp_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    identifier VARCHAR(255) NOT NULL,
    otp_code VARCHAR(6) NOT NULL,
    otp_type VARCHAR(20) NOT NULL CHECK (otp_type IN ('registration', 'login', 'password_reset')),
    verified BOOLEAN DEFAULT false,
    attempts INTEGER DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(session_status);
CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON sessions(last_activity);
CREATE INDEX IF NOT EXISTS idx_purchase_history_user_id ON purchase_history(user_id);
CREATE INDEX IF NOT EXISTS idx_purchase_history_date ON purchase_history(purchase_date);
CREATE INDEX IF NOT EXISTS idx_data_usage_logs_session_id ON data_usage_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_data_usage_logs_recorded_at ON data_usage_logs(recorded_at);
CREATE INDEX IF NOT EXISTS idx_otp_verifications_identifier ON otp_verifications(identifier);
CREATE INDEX IF NOT EXISTS idx_otp_verifications_expires ON otp_verifications(expires_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_id ON user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_created_at ON user_activity_logs(created_at);

-- Create triggers for updated_at
CREATE TRIGGER update_user_sessions_updated_at 
    BEFORE UPDATE ON user_sessions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to check and expire sessions
CREATE OR REPLACE FUNCTION check_and_expire_sessions()
RETURNS void AS $$
BEGIN
    -- Expire sessions by time
    UPDATE sessions 
    SET active = false, 
        session_status = 'expired',
        disconnect_reason = 'time_limit_reached'
    WHERE active = true 
    AND end_time < NOW();
    
    -- Expire sessions by data usage
    UPDATE sessions 
    SET active = false, 
        session_status = 'exhausted',
        disconnect_reason = 'data_limit_reached'
    WHERE active = true 
    AND data_limit_mb IS NOT NULL
    AND data_used_mb >= data_limit_mb;
    
    -- Mark inactive sessions (no activity for 5 minutes)
    UPDATE sessions 
    SET active = false, 
        session_status = 'disconnected',
        disconnect_reason = 'inactivity'
    WHERE active = true 
    AND last_activity < NOW() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql;

-- Function to get user's active session
CREATE OR REPLACE FUNCTION get_user_active_session(p_user_id UUID)
RETURNS TABLE (
    session_id UUID,
    package_name VARCHAR,
    data_limit_mb INTEGER,
    data_used_mb DECIMAL,
    data_remaining_mb DECIMAL,
    time_remaining_minutes INTEGER,
    session_status VARCHAR,
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        p.name,
        s.data_limit_mb,
        s.data_used_mb,
        (s.data_limit_mb - s.data_used_mb) as data_remaining,
        EXTRACT(EPOCH FROM (s.end_time - NOW()))::INTEGER / 60 as time_remaining,
        s.session_status,
        s.start_time,
        s.end_time
    FROM sessions s
    JOIN packages p ON s.package_id = p.id
    WHERE s.user_id = p_user_id
    AND s.active = true
    AND s.session_status = 'active'
    ORDER BY s.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to record data usage
CREATE OR REPLACE FUNCTION record_data_usage(
    p_session_id UUID,
    p_bytes_uploaded BIGINT,
    p_bytes_downloaded BIGINT
)
RETURNS void AS $$
DECLARE
    v_total_mb DECIMAL;
BEGIN
    -- Insert usage log
    INSERT INTO data_usage_logs (session_id, bytes_uploaded, bytes_downloaded, total_bytes)
    VALUES (p_session_id, p_bytes_uploaded, p_bytes_downloaded, p_bytes_uploaded + p_bytes_downloaded);
    
    -- Update session total
    UPDATE sessions 
    SET data_used_mb = data_used_mb + ((p_bytes_uploaded + p_bytes_downloaded) / 1048576.0),
        last_activity = NOW()
    WHERE id = p_session_id;
    
    -- Check if data limit reached
    SELECT data_used_mb INTO v_total_mb
    FROM sessions
    WHERE id = p_session_id;
    
    -- Auto-disconnect if limit reached
    UPDATE sessions 
    SET active = false, 
        session_status = 'exhausted',
        disconnect_reason = 'data_limit_reached'
    WHERE id = p_session_id
    AND data_limit_mb IS NOT NULL
    AND data_used_mb >= data_limit_mb;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup expired data
CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS void AS $$
BEGIN
    -- Delete expired OTPs
    DELETE FROM otp_verifications WHERE expires_at < NOW();
    
    -- Delete used password reset tokens older than 24 hours
    DELETE FROM password_reset_tokens 
    WHERE used = true AND created_at < NOW() - INTERVAL '24 hours';
    
    -- Delete expired user sessions
    DELETE FROM user_sessions WHERE expires_at < NOW();
    
    -- Archive old activity logs (older than 90 days)
    DELETE FROM user_activity_logs WHERE created_at < NOW() - INTERVAL '90 days';
    
    -- Archive old data usage logs (older than 30 days)
    DELETE FROM data_usage_logs 
    WHERE session_id IN (
        SELECT id FROM sessions WHERE created_at < NOW() - INTERVAL '30 days'
    );
END;
$$ LANGUAGE plpgsql;

-- Add user account status tracking
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE;

COMMENT ON TABLE users IS 'End-user accounts for captive portal authentication';
COMMENT ON TABLE user_sessions IS 'JWT session tokens for authenticated users';
COMMENT ON TABLE sessions IS 'Active internet sessions with data usage tracking';
COMMENT ON TABLE purchase_history IS 'Complete purchase history for all users';
COMMENT ON TABLE data_usage_logs IS 'Detailed data usage tracking per session';
COMMENT ON TABLE otp_verifications IS 'OTP codes for phone/email verification';
