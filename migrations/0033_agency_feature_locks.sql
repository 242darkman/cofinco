-- Migration: Agency Feature Locks (Module Lock / Kill Switch)
-- Purpose: Allow agencies to lock specific features/modules
-- Part of CASL Authorization System

-- Create agency_feature_locks table
CREATE TABLE IF NOT EXISTS agency_feature_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agence_id UUID NOT NULL REFERENCES agences(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  locked BOOLEAN NOT NULL DEFAULT true,
  reason TEXT,
  locked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Each feature can only be locked once per agency
  CONSTRAINT unique_agency_feature UNIQUE (agence_id, feature_key)
);

-- Create index for faster lookups by agency
CREATE INDEX IF NOT EXISTS idx_agency_feature_locks_agence_id
  ON agency_feature_locks(agence_id);

-- Create index for locked features (common query)
CREATE INDEX IF NOT EXISTS idx_agency_feature_locks_locked
  ON agency_feature_locks(agence_id, locked) WHERE locked = true;

-- Add comment explaining the table
COMMENT ON TABLE agency_feature_locks IS 'Feature flags per agency - allows locking specific modules/features';
COMMENT ON COLUMN agency_feature_locks.feature_key IS 'Feature identifier: credits, tontines, caisse, comptabilite, epargnes, coffre, terrain, rh, admin';
COMMENT ON COLUMN agency_feature_locks.locked IS 'When true, the feature is disabled for this agency';
COMMENT ON COLUMN agency_feature_locks.reason IS 'Optional explanation for why the feature is locked';
COMMENT ON COLUMN agency_feature_locks.locked_by IS 'User who locked the feature (for audit)';

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_agency_feature_locks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic updated_at
DROP TRIGGER IF EXISTS trigger_agency_feature_locks_updated_at ON agency_feature_locks;
CREATE TRIGGER trigger_agency_feature_locks_updated_at
  BEFORE UPDATE ON agency_feature_locks
  FOR EACH ROW
  EXECUTE FUNCTION update_agency_feature_locks_updated_at();

-- Insert default feature keys reference (commented out - just for documentation)
-- Valid feature_keys:
-- 'credits'      - Crédits module
-- 'tontines'     - Tontines module
-- 'caisse'       - Caisse module
-- 'comptabilite' - Comptabilité module
-- 'epargnes'     - Comptes/Épargnes module
-- 'coffre'       - Coffre-Fort module
-- 'terrain'      - Agent Terrain module
-- 'rh'           - RH module
-- 'admin'        - Administration module
-- 'rapports'     - Rapports module
-- 'transferts'   - Transferts module

-- Add permissions for managing feature locks (if permissions table seeding is separate)
-- These should be added to the permissions seed data
DO $$
DECLARE
  admin_module_id UUID;
BEGIN
  -- Find the Administration module
  SELECT id INTO admin_module_id FROM modules WHERE name = 'Administration' LIMIT 1;

  IF admin_module_id IS NOT NULL THEN
    -- Add feature lock permissions if they don't exist
    INSERT INTO permissions (module_id, name, code, description)
    VALUES
      (admin_module_id, 'Voir les verrous', 'admin.locks.view', 'Voir les modules verrouillés par agence'),
      (admin_module_id, 'Gérer les verrous', 'admin.locks.manage', 'Activer/désactiver les modules par agence')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
