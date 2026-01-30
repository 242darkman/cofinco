-- Migration: Add refresh tokens table for "Remember Me" functionality
-- Purpose: Allow users to have persistent sessions (up to 30 days) using secure refresh tokens

-- Create refresh_tokens table
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE, -- SHA-256 hash of the token (never store plain tokens)
  device_fingerprint TEXT, -- Optional: link to the device for additional security
  ip_address TEXT,
  user_agent TEXT,

  -- Token metadata
  family_id UUID NOT NULL, -- Token family for rotation detection (each family = one "remember me" session)
  generation INTEGER NOT NULL DEFAULT 1, -- Token generation within family (for rotation)

  -- Expiry
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMP,

  -- Revocation
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at TIMESTAMP,
  revoke_reason TEXT
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at) WHERE NOT revoked;

-- Comments
COMMENT ON TABLE refresh_tokens IS 'Secure refresh tokens for persistent "Remember Me" sessions';
COMMENT ON COLUMN refresh_tokens.token_hash IS 'SHA-256 hash of the refresh token - plain token is only sent to client once';
COMMENT ON COLUMN refresh_tokens.family_id IS 'Token family UUID - all tokens in a rotation chain share the same family_id';
COMMENT ON COLUMN refresh_tokens.generation IS 'Generation number within the family - used to detect reuse of old tokens';
