-- Migration: Add device fingerprint columns to active_sessions
-- Purpose: Store device fingerprint for stolen cookie detection
-- Security feature to detect when a session cookie is used from a different device

-- Add device fingerprint column (full hash)
ALTER TABLE active_sessions
ADD COLUMN IF NOT EXISTS device_fingerprint TEXT;

-- Add partial fingerprint column (for tolerant comparison)
ALTER TABLE active_sessions
ADD COLUMN IF NOT EXISTS device_fingerprint_partial TEXT;

-- Index for faster lookups when verifying fingerprint
CREATE INDEX IF NOT EXISTS idx_active_sessions_fingerprint
ON active_sessions(device_fingerprint)
WHERE device_fingerprint IS NOT NULL;

-- Comment explaining the columns
COMMENT ON COLUMN active_sessions.device_fingerprint IS 'Full device fingerprint hash for strict cookie verification';
COMMENT ON COLUMN active_sessions.device_fingerprint_partial IS 'Partial fingerprint for tolerant comparison (allows minor browser updates)';
