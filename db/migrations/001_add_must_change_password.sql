-- Migration: Add must_change_password field to users table
-- Date: 2025-12-24
-- Description: Adds a boolean field to track when users must change their password

-- Add the column with default value false
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- Set must_change_password to true for any existing admin users with hashed password matching "admin123"
-- This would require verification in application code as hashed passwords vary
-- For safety, we don't automatically set this flag on existing users

-- Create index for performance on password change checks
CREATE INDEX IF NOT EXISTS idx_users_must_change_password 
ON users(must_change_password) 
WHERE must_change_password = TRUE;

-- Add comment to the column for documentation
COMMENT ON COLUMN users.must_change_password IS 'Flag indicating if user must change password on next login';
