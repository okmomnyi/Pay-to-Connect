-- Enhanced authentication schema with OTP support
-- Add columns to existing admin_users table

ALTER TABLE admin_users 
ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS phone VARCHAR(20) UNIQUE,
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP,
ADD COLUMN IF NOT EXISTS last_login TIMESTAMP,
ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255),
ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMP;

-- Create OTP verification table
CREATE TABLE IF NOT EXISTS otp_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES admin_users(id) ON DELETE CASCADE,
    email VARCHAR(255),
    phone VARCHAR(20),
    otp_code VARCHAR(6) NOT NULL,
    otp_type VARCHAR(20) NOT NULL CHECK (otp_type IN ('registration', 'login', 'password_reset')),
    expires_at TIMESTAMP NOT NULL,
    verified BOOLEAN DEFAULT false,
    attempts INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create login sessions table for enhanced security
CREATE TABLE IF NOT EXISTS admin_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES admin_users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create audit log table for security tracking
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100),
    resource_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    details JSONB,
    success BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_phone ON admin_users(phone);
CREATE INDEX IF NOT EXISTS idx_otp_verifications_email ON otp_verifications(email);
CREATE INDEX IF NOT EXISTS idx_otp_verifications_phone ON otp_verifications(phone);
CREATE INDEX IF NOT EXISTS idx_otp_verifications_expires ON otp_verifications(expires_at);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_user_id ON admin_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON admin_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON admin_audit_logs(created_at);

-- Add triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_otp_verifications_updated_at 
    BEFORE UPDATE ON otp_verifications 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admin_sessions_updated_at 
    BEFORE UPDATE ON admin_sessions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update existing admin user with email and phone
UPDATE admin_users 
SET email = 'admin@paytoconnect.local', 
    phone = '+254700000000',
    is_verified = true
WHERE username = 'admin';

-- Clean up expired OTPs and sessions (function for maintenance)
CREATE OR REPLACE FUNCTION cleanup_expired_auth_data()
RETURNS void AS $$
BEGIN
    -- Delete expired OTPs
    DELETE FROM otp_verifications WHERE expires_at < NOW();
    
    -- Delete expired sessions
    DELETE FROM admin_sessions WHERE expires_at < NOW();
    
    -- Reset failed login attempts for users not locked
    UPDATE admin_users 
    SET failed_login_attempts = 0 
    WHERE locked_until IS NULL OR locked_until < NOW();
END;
$$ LANGUAGE plpgsql;
