-- Migration: Temporary Permissions
-- Permet d'accorder des permissions avec une date d'expiration

-- Table des permissions temporaires
CREATE TABLE IF NOT EXISTS temporary_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted_by UUID NOT NULL REFERENCES users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES users(id),
  revoke_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Contrainte unique: Une seule permission temporaire active par user/permission
CREATE UNIQUE INDEX IF NOT EXISTS idx_temp_perm_unique_active
ON temporary_permissions(user_id, permission_id)
WHERE is_active = true;

-- Index pour le cron job d'expiration
CREATE INDEX IF NOT EXISTS idx_temp_perm_expires
ON temporary_permissions(expires_at)
WHERE is_active = true;

-- Index pour lookup par utilisateur
CREATE INDEX IF NOT EXISTS idx_temp_perm_user
ON temporary_permissions(user_id, is_active);

-- Index pour audit par granted_by
CREATE INDEX IF NOT EXISTS idx_temp_perm_granted_by
ON temporary_permissions(granted_by);

-- Trigger pour mettre à jour updated_at
CREATE OR REPLACE FUNCTION update_temp_perm_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_temp_perm_updated ON temporary_permissions;
CREATE TRIGGER trg_temp_perm_updated
BEFORE UPDATE ON temporary_permissions
FOR EACH ROW
EXECUTE FUNCTION update_temp_perm_updated_at();

-- Commentaires
COMMENT ON TABLE temporary_permissions IS 'Permissions temporaires avec date d''expiration automatique';
COMMENT ON COLUMN temporary_permissions.user_id IS 'Utilisateur recevant la permission temporaire';
COMMENT ON COLUMN temporary_permissions.permission_id IS 'Permission accordée temporairement';
COMMENT ON COLUMN temporary_permissions.granted_by IS 'Administrateur ayant accordé la permission';
COMMENT ON COLUMN temporary_permissions.expires_at IS 'Date/heure d''expiration automatique';
COMMENT ON COLUMN temporary_permissions.reason IS 'Justification de l''élévation temporaire';
COMMENT ON COLUMN temporary_permissions.is_active IS 'False si révoquée ou expirée';
