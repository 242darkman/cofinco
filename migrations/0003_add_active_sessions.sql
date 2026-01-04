-- Migration: Add active_sessions table for real-time session tracking
-- Created: 2025-12-27

CREATE TABLE IF NOT EXISTS "active_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" text NOT NULL UNIQUE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "ip_address" text,
  "user_agent" text,
  "device_type" text,
  "browser" text,
  "os" text,
  "location" text,
  "login_at" timestamp NOT NULL DEFAULT NOW(),
  "last_activity" timestamp NOT NULL DEFAULT NOW(),
  "expires_at" timestamp NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS "idx_active_sessions_user_id" ON "active_sessions"("user_id");
CREATE INDEX IF NOT EXISTS "idx_active_sessions_session_id" ON "active_sessions"("session_id");
CREATE INDEX IF NOT EXISTS "idx_active_sessions_is_active" ON "active_sessions"("is_active");
CREATE INDEX IF NOT EXISTS "idx_active_sessions_last_activity" ON "active_sessions"("last_activity");

-- Cleanup expired sessions automatically (can be called by cron or application)
-- This function removes sessions that have expired
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM "active_sessions" WHERE "expires_at" < NOW();
END;
$$ LANGUAGE plpgsql;
