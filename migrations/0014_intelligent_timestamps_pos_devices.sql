-- Migration: Intelligent Timestamps + POS Devices refactor
-- Description:
-- - Sessions caisse: status derived from timestamps (opened_at/closed_at)
-- - Users: drop legacy agence column
-- - user_agences: enforce single primary agence
-- - POS devices: new structure + logs
-- - Paiements terrain: link to agence

BEGIN;

-- ============================================================================
-- 1. USERS: Remove legacy agence column
-- ============================================================================
ALTER TABLE users
  DROP COLUMN IF EXISTS agence;

-- ============================================================================
-- 2. SESSIONS CAISSE: Intelligent timestamps
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sessions_caisse' AND column_name = 'date_ouverture'
  ) THEN
    ALTER TABLE sessions_caisse RENAME COLUMN date_ouverture TO opened_at;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sessions_caisse' AND column_name = 'date_fermeture'
  ) THEN
    ALTER TABLE sessions_caisse RENAME COLUMN date_fermeture TO closed_at;
  END IF;
END $$;

-- Ensure opened_at is set where missing
UPDATE sessions_caisse
SET opened_at = COALESCE(opened_at, created_at)
WHERE opened_at IS NULL;

-- If the session was closed but closed_at is missing, set it
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sessions_caisse' AND column_name = 'statut'
  ) THEN
    UPDATE sessions_caisse
    SET closed_at = COALESCE(closed_at, updated_at)
    WHERE closed_at IS NULL AND statut = 'Fermée';
  END IF;
END $$;

ALTER TABLE sessions_caisse
  DROP COLUMN IF EXISTS statut,
  DROP COLUMN IF EXISTS closed_reason,
  DROP COLUMN IF EXISTS forced_close,
  DROP COLUMN IF EXISTS force_close_motif;

ALTER TABLE sessions_caisse
  ADD COLUMN IF NOT EXISTS timeout_at timestamp,
  ADD COLUMN IF NOT EXISTS forced_close_reason text;

-- Rebuild "one open session" constraints based on timestamps
DROP INDEX IF EXISTS uq_sessions_caisse_one_open_per_caisse;
DROP INDEX IF EXISTS uq_sessions_caisse_one_open_per_user;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sessions_caisse_one_open_per_caisse
  ON sessions_caisse (caisse_id)
  WHERE opened_at IS NOT NULL AND closed_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sessions_caisse_one_open_per_user
  ON sessions_caisse (caissier_id)
  WHERE opened_at IS NOT NULL AND closed_at IS NULL;

-- Cleanup old enum if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'statut_session_caisse_enum') THEN
    DROP TYPE statut_session_caisse_enum;
  END IF;
END $$;

-- ============================================================================
-- 3. USER AGENCES: Enforce single primary
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_agences_primary
  ON user_agences (user_id)
  WHERE is_primary IS TRUE;

-- Backfill: ensure each user with active agencies has one primary
WITH lacking AS (
  SELECT ua.user_id
  FROM user_agences ua
  WHERE ua.actif IS TRUE
  GROUP BY ua.user_id
  HAVING SUM(CASE WHEN ua.is_primary IS TRUE THEN 1 ELSE 0 END) = 0
),
pick AS (
  SELECT DISTINCT ON (ua.user_id) ua.id
  FROM user_agences ua
  JOIN lacking l ON l.user_id = ua.user_id
  WHERE ua.actif IS TRUE
  ORDER BY ua.user_id, ua.created_at ASC
)
UPDATE user_agences ua
SET is_primary = TRUE
FROM pick p
WHERE ua.id = p.id;

-- ============================================================================
-- 4. POS DEVICES: Refactor table + logs
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_devices' AND column_name = 'device_id'
  ) THEN
    ALTER TABLE pos_devices RENAME COLUMN device_id TO serial;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_devices' AND column_name = 'modele'
  ) THEN
    ALTER TABLE pos_devices RENAME COLUMN modele TO model;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_devices' AND column_name = 'agent_id'
  ) THEN
    ALTER TABLE pos_devices RENAME COLUMN agent_id TO assigned_to;
  END IF;
END $$;

ALTER TABLE pos_devices
  ADD COLUMN IF NOT EXISTS agence_id uuid,
  ADD COLUMN IF NOT EXISTS last_sync_at timestamp,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS metadata jsonb,
  ADD COLUMN IF NOT EXISTS deleted_at timestamp;

-- Backfill agence_id from caisse
UPDATE pos_devices pd
SET agence_id = c.agence_id
FROM caisses c
WHERE pd.caisse_id = c.id
  AND pd.agence_id IS NULL;

-- Backfill agence_id from primary user agency
UPDATE pos_devices pd
SET agence_id = ua.agence_id
FROM user_agences ua
WHERE ua.user_id = pd.assigned_to
  AND ua.is_primary IS TRUE
  AND ua.actif IS TRUE
  AND pd.agence_id IS NULL;

ALTER TABLE pos_devices
  DROP COLUMN IF EXISTS nom,
  DROP COLUMN IF EXISTS numero_serie,
  DROP COLUMN IF EXISTS date_enregistrement,
  DROP COLUMN IF EXISTS derniere_synchronisation,
  DROP COLUMN IF EXISTS version_app,
  DROP COLUMN IF EXISTS statut,
  DROP COLUMN IF EXISTS caisse_id;

ALTER TABLE pos_devices
  ALTER COLUMN assigned_to DROP NOT NULL;

ALTER TABLE pos_devices
  ALTER COLUMN serial SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pos_devices_agence_fk') THEN
    ALTER TABLE pos_devices
      ADD CONSTRAINT pos_devices_agence_fk FOREIGN KEY (agence_id) REFERENCES agences(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pos_devices_assigned_to_fk') THEN
    ALTER TABLE pos_devices
      ADD CONSTRAINT pos_devices_assigned_to_fk FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS pos_device_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES pos_devices(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  message text,
  metadata jsonb,
  created_at timestamp DEFAULT now()
);

-- ============================================================================
-- 5. PAIEMENTS TERRAIN: Link to agence
-- ============================================================================
ALTER TABLE paiements_terrain
  ADD COLUMN IF NOT EXISTS agence_id uuid;

UPDATE paiements_terrain pt
SET agence_id = ua.agence_id
FROM agents_terrain at
JOIN employes e ON at.employe_id = e.id
JOIN user_agences ua ON ua.user_id = e.user_id AND ua.is_primary IS TRUE AND ua.actif IS TRUE
WHERE pt.agent_id = at.id
  AND pt.agence_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'paiements_terrain_agence_fk') THEN
    ALTER TABLE paiements_terrain
      ADD CONSTRAINT paiements_terrain_agence_fk FOREIGN KEY (agence_id) REFERENCES agences(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_paiements_terrain_agence_date
  ON paiements_terrain (agence_id, created_at);

COMMIT;
