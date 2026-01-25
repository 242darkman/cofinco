-- Migration: RBAC Versions for cache invalidation and real-time sync
-- This table tracks permission changes to enable efficient caching and WebSocket sync

-- Create rbac_versions table (singleton pattern)
CREATE TABLE IF NOT EXISTS rbac_versions (
  id TEXT PRIMARY KEY DEFAULT 'global' CHECK (id = 'global'),
  version BIGINT NOT NULL DEFAULT 1,
  last_change_type TEXT, -- 'role_permission', 'user_permission', 'module', 'permission'
  last_change_entity TEXT, -- role name or user ID that was changed
  last_change_detail JSONB, -- optional: what specifically changed
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert the singleton row
INSERT INTO rbac_versions (id, version, updated_at)
VALUES ('global', 1, NOW())
ON CONFLICT (id) DO NOTHING;

-- Create function to increment version
CREATE OR REPLACE FUNCTION increment_rbac_version(
  p_change_type TEXT DEFAULT NULL,
  p_change_entity TEXT DEFAULT NULL,
  p_change_detail JSONB DEFAULT NULL
)
RETURNS BIGINT AS $$
DECLARE
  new_version BIGINT;
BEGIN
  UPDATE rbac_versions
  SET
    version = version + 1,
    last_change_type = COALESCE(p_change_type, last_change_type),
    last_change_entity = COALESCE(p_change_entity, last_change_entity),
    last_change_detail = COALESCE(p_change_detail, last_change_detail),
    updated_at = NOW()
  WHERE id = 'global'
  RETURNING version INTO new_version;

  RETURN new_version;
END;
$$ LANGUAGE plpgsql;

-- Create function to get current version
CREATE OR REPLACE FUNCTION get_rbac_version()
RETURNS BIGINT AS $$
DECLARE
  current_version BIGINT;
BEGIN
  SELECT version INTO current_version FROM rbac_versions WHERE id = 'global';
  RETURN COALESCE(current_version, 1);
END;
$$ LANGUAGE plpgsql;

-- Create triggers to auto-increment version on permission changes

-- Trigger for role_permissions changes
CREATE OR REPLACE FUNCTION trigger_role_permissions_version()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM increment_rbac_version(
    'role_permission',
    COALESCE(NEW.role, OLD.role)::TEXT,
    jsonb_build_object(
      'operation', TG_OP,
      'permission_id', COALESCE(NEW.permission_id, OLD.permission_id),
      'granted', NEW.granted
    )
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rbac_version_role_permissions ON role_permissions;
CREATE TRIGGER rbac_version_role_permissions
  AFTER INSERT OR UPDATE OR DELETE ON role_permissions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_role_permissions_version();

-- Trigger for user_permissions changes
CREATE OR REPLACE FUNCTION trigger_user_permissions_version()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM increment_rbac_version(
    'user_permission',
    COALESCE(NEW.user_id, OLD.user_id)::TEXT,
    jsonb_build_object(
      'operation', TG_OP,
      'permission_id', COALESCE(NEW.permission_id, OLD.permission_id),
      'granted', NEW.granted
    )
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rbac_version_user_permissions ON user_permissions;
CREATE TRIGGER rbac_version_user_permissions
  AFTER INSERT OR UPDATE OR DELETE ON user_permissions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_user_permissions_version();

-- Add index for faster version lookups
CREATE INDEX IF NOT EXISTS idx_rbac_versions_version ON rbac_versions(version);

-- Add comments
COMMENT ON TABLE rbac_versions IS 'Singleton table tracking RBAC version for cache invalidation';
COMMENT ON COLUMN rbac_versions.version IS 'Monotonically increasing version number';
COMMENT ON COLUMN rbac_versions.last_change_type IS 'Type of the last change (role_permission, user_permission, etc.)';
COMMENT ON COLUMN rbac_versions.last_change_entity IS 'Entity affected by the last change (role name or user ID)';
COMMENT ON FUNCTION increment_rbac_version IS 'Increment RBAC version and record change details';
COMMENT ON FUNCTION get_rbac_version IS 'Get current RBAC version number';
