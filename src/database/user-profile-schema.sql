-- User Profile Enhancement Schema
-- Adds security questions, password recovery, and enhanced profile management

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

-- Add profile fields to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS full_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS profile_picture_url TEXT,
ADD COLUMN IF NOT EXISTS last_password_change TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Insert default security questions
INSERT INTO security_questions (question) VALUES
    ('What was the name of your first pet?'),
    ('What city were you born in?'),
    ('What is your mother''s maiden name?'),
    ('What was the name of your first school?'),
    ('What is your favorite book?'),
    ('What was your childhood nickname?'),
    ('In what city did you meet your spouse/partner?'),
    ('What is the name of your favorite childhood friend?')
ON CONFLICT (question) DO NOTHING;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_security_answers_user_id ON user_security_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_data_usage_logs_session_id ON data_usage_logs(session_id);

-- Add data usage tracking columns if not exists
ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS bytes_uploaded BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS bytes_downloaded BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_bytes BIGINT DEFAULT 0;

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
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    time_used_minutes INTEGER,
    time_remaining_minutes INTEGER,
    data_used_mb DECIMAL(10,2),
    data_limit_mb INTEGER,
    data_remaining_mb DECIMAL(10,2),
    bytes_uploaded BIGINT,
    bytes_downloaded BIGINT,
    total_bytes BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id as session_id,
        p.name as package_name,
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
        s.total_bytes
    FROM sessions s
    JOIN packages p ON s.package_id = p.id
    WHERE s.user_id = p_user_id 
    AND s.active = true 
    AND s.end_time > NOW()
    ORDER BY s.start_time DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get user session history
CREATE OR REPLACE FUNCTION get_user_session_history(p_user_id UUID, p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
    session_id UUID,
    package_name VARCHAR(255),
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
