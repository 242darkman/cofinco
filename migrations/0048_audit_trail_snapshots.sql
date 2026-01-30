-- Migration: Add audit trail snapshots for rollback capability
-- This extends the audit system to support before/after state tracking

-- Add snapshot columns to audit_logs table
ALTER TABLE audit_logs
ADD COLUMN IF NOT EXISTS before_state JSONB,
ADD COLUMN IF NOT EXISTS after_state JSONB,
ADD COLUMN IF NOT EXISTS is_rollbackable BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS rolled_back_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS rolled_back_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS rollback_audit_id UUID;

-- Create settings history table for versioning
CREATE TABLE IF NOT EXISTS settings_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settings_type VARCHAR(50) NOT NULL, -- 'system', 'security', 'ui', 'notification'
  version INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  changed_by UUID REFERENCES users(id),
  changed_at TIMESTAMP DEFAULT NOW(),
  change_reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  is_current BOOLEAN DEFAULT false,
  UNIQUE(settings_type, version)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_settings_history_type_version ON settings_history(settings_type, version DESC);
CREATE INDEX IF NOT EXISTS idx_settings_history_current ON settings_history(settings_type, is_current) WHERE is_current = true;

-- Create permission change audit table
CREATE TABLE IF NOT EXISTS permission_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(20) NOT NULL, -- 'role', 'user'
  entity_id TEXT NOT NULL, -- role name or user id
  permission_id UUID,
  permission_code TEXT,
  action VARCHAR(20) NOT NULL, -- 'GRANT', 'REVOKE', 'BULK_GRANT', 'BULK_REVOKE'
  before_state JSONB, -- Previous permission state
  after_state JSONB, -- New permission state
  changed_by UUID REFERENCES users(id),
  changed_at TIMESTAMP DEFAULT NOW(),
  ip_address TEXT,
  reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_permission_audit_entity ON permission_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_permission_audit_date ON permission_audit_logs(changed_at DESC);

-- Create import batch tracking for rollback
CREATE TABLE IF NOT EXISTS import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_type VARCHAR(50) NOT NULL, -- 'users', 'clients', 'employees'
  file_name TEXT,
  total_records INTEGER DEFAULT 0,
  created_records INTEGER DEFAULT 0,
  updated_records INTEGER DEFAULT 0,
  skipped_records INTEGER DEFAULT 0,
  failed_records INTEGER DEFAULT 0,
  record_ids JSONB, -- Array of created record IDs for rollback
  status VARCHAR(20) DEFAULT 'COMPLETED', -- 'COMPLETED', 'ROLLED_BACK', 'PARTIAL'
  imported_by UUID REFERENCES users(id),
  imported_at TIMESTAMP DEFAULT NOW(),
  rolled_back_at TIMESTAMP,
  rolled_back_by UUID REFERENCES users(id),
  error_details JSONB
);

CREATE INDEX IF NOT EXISTS idx_import_batches_type ON import_batches(import_type, imported_at DESC);

-- Add function to get next settings version
CREATE OR REPLACE FUNCTION get_next_settings_version(p_settings_type VARCHAR)
RETURNS INTEGER AS $$
DECLARE
  next_version INTEGER;
BEGIN
  SELECT COALESCE(MAX(version), 0) + 1 INTO next_version
  FROM settings_history
  WHERE settings_type = p_settings_type;
  RETURN next_version;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to auto-increment version on insert
CREATE OR REPLACE FUNCTION set_settings_version()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.version IS NULL THEN
    NEW.version := get_next_settings_version(NEW.settings_type);
  END IF;

  -- Mark previous current as not current
  UPDATE settings_history
  SET is_current = false
  WHERE settings_type = NEW.settings_type AND is_current = true;

  NEW.is_current := true;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_settings_version ON settings_history;
CREATE TRIGGER trg_settings_version
BEFORE INSERT ON settings_history
FOR EACH ROW
EXECUTE FUNCTION set_settings_version();
