-- =====================================================
-- ADD SECURITY QUESTIONS AND PROFILE FEATURES
-- =====================================================

-- Add security questions table
CREATE TABLE IF NOT EXISTS security_questions (
    id SERIAL PRIMARY KEY,
    question TEXT NOT NULL UNIQUE,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert common security questions
INSERT INTO security_questions (question) VALUES
('What was your first pet''s name?'),
('What was the name of your elementary school?'),
('What is your mother''s maiden name?'),
('What was your childhood nickname?'),
('What is the name of your favorite childhood friend?'),
('What is your favorite book?'),
('What is your favorite movie?'),
('What city were you born in?'),
('What is your father''s middle name?'),
('What is the name of the street you grew up on?')
ON CONFLICT (question) DO NOTHING;

-- Add user security answers table
CREATE TABLE IF NOT EXISTS user_security_answers (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    question_id INTEGER REFERENCES security_questions(id),
    answer_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, question_id)
);

-- Add password reset tokens table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add admin security answers table
CREATE TABLE IF NOT EXISTS admin_security_answers (
    id SERIAL PRIMARY KEY,
    admin_user_id UUID REFERENCES admin_users(id) ON DELETE CASCADE,
    question_id INTEGER REFERENCES security_questions(id),
    answer_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(admin_user_id, question_id)
);

-- Add admin password reset tokens table
CREATE TABLE IF NOT EXISTS admin_password_reset_tokens (
    id SERIAL PRIMARY KEY,
    admin_user_id UUID REFERENCES admin_users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add profile completion tracking to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS security_questions_set BOOLEAN DEFAULT false;

-- Add to admin_users table
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS security_questions_set BOOLEAN DEFAULT false;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_security_answers_user_id ON user_security_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_security_answers_admin_user_id ON admin_security_answers(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_password_reset_tokens_token_hash ON admin_password_reset_tokens(token_hash);

-- Function to check if user has security questions set
CREATE OR REPLACE FUNCTION check_user_security_questions(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_security_answers 
        WHERE user_security_answers.user_id = check_user_security_questions.user_id
    );
END;
$$ LANGUAGE plpgsql;

-- Function to check if admin has security questions set
CREATE OR REPLACE FUNCTION check_admin_security_questions(admin_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM admin_security_answers 
        WHERE admin_security_answers.admin_user_id = check_admin_security_questions.admin_user_id
    );
END;
$$ LANGUAGE plpgsql;

-- Verify tables were created
SELECT 'Security questions table created' as status FROM security_questions LIMIT 1;
SELECT 'User security answers table created' as status FROM user_security_answers LIMIT 1;
SELECT 'Password reset tokens table created' as status FROM password_reset_tokens LIMIT 1;
