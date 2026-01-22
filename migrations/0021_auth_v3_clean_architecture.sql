-- Migration: Auth V3 - Clean Architecture
-- Supprime roleSystem de employes et nettoie les triggers legacy
-- ATTENTION: Exécuter APRÈS 0020_multi_role_architecture.sql

-- ============================================
-- 1. Supprimer les triggers legacy de synchronisation
-- ============================================

-- Supprimer le trigger qui synchronisait userRoles -> employes.roleSystem
DROP TRIGGER IF EXISTS trg_sync_role_to_employe ON user_roles;
DROP FUNCTION IF EXISTS sync_employe_role_system();

-- ============================================
-- 2. Supprimer la colonne roleSystem de employes
-- ============================================

-- Vérifier que toutes les données sont migrées vers user_roles avant suppression
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  -- Compter les employés sans rôle dans user_roles
  SELECT COUNT(*) INTO orphan_count
  FROM employes e
  WHERE NOT EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = e.user_id
  );

  IF orphan_count > 0 THEN
    RAISE NOTICE 'ATTENTION: % employés n''ont pas de rôle dans user_roles. Migration automatique...', orphan_count;

    -- Migrer les orphelins avec le rôle par défaut AGENT_TERRAIN
    INSERT INTO user_roles (user_id, role, agence_id, is_primary)
    SELECT
      e.user_id,
      'AGENT_TERRAIN'::user_role,
      e.agence_id,
      true
    FROM employes e
    WHERE NOT EXISTS (
      SELECT 1 FROM user_roles ur WHERE ur.user_id = e.user_id
    )
    ON CONFLICT (user_id, role, agence_id) DO NOTHING;
  END IF;
END $$;

-- Supprimer la colonne (safe après migration)
ALTER TABLE employes DROP COLUMN IF EXISTS role_system;

-- ============================================
-- 3. Ajouter des index de performance pour user_roles
-- ============================================

-- Index pour les lookups par userId (déjà créé dans 0020, mais vérifions)
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);

-- Index pour trouver rapidement le rôle principal
CREATE INDEX IF NOT EXISTS idx_user_roles_primary ON user_roles(user_id) WHERE is_primary = true;

-- Index pour les lookups par agence
CREATE INDEX IF NOT EXISTS idx_user_roles_agence ON user_roles(agence_id) WHERE agence_id IS NOT NULL;

-- ============================================
-- 4. Contrainte pour garantir un seul rôle principal
-- ============================================

-- Fonction pour valider qu'un seul rôle est principal par utilisateur
CREATE OR REPLACE FUNCTION check_single_primary_role()
RETURNS TRIGGER AS $$
BEGIN
  -- Si on définit un nouveau rôle comme principal
  IF NEW.is_primary = true THEN
    -- Vérifier qu'il n'y a pas déjà un autre rôle principal
    IF EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = NEW.user_id
        AND is_primary = true
        AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) THEN
      -- Désactiver l'ancien rôle principal automatiquement
      UPDATE user_roles
      SET is_primary = false, updated_at = now()
      WHERE user_id = NEW.user_id
        AND is_primary = true
        AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recréer le trigger (version simplifiée sans sync vers roleSystem)
DROP TRIGGER IF EXISTS trg_ensure_single_primary ON user_roles;
CREATE TRIGGER trg_ensure_single_primary
BEFORE INSERT OR UPDATE OF is_primary ON user_roles
FOR EACH ROW
WHEN (NEW.is_primary = true)
EXECUTE FUNCTION check_single_primary_role();

-- ============================================
-- 5. Vue pour faciliter les requêtes de rôles
-- ============================================

CREATE OR REPLACE VIEW v_user_primary_roles AS
SELECT
  ur.user_id,
  ur.role,
  ur.agence_id,
  u.nom,
  u.prenom,
  u.username,
  a.nom as agence_nom
FROM user_roles ur
JOIN users u ON ur.user_id = u.id
LEFT JOIN agences a ON ur.agence_id = a.id
WHERE ur.is_primary = true;

COMMENT ON VIEW v_user_primary_roles IS 'Vue des rôles principaux par utilisateur avec informations contextuelles';

-- ============================================
-- 6. Fonction utilitaire pour obtenir le rôle effectif
-- ============================================

CREATE OR REPLACE FUNCTION get_effective_role(p_user_id UUID)
RETURNS user_role AS $$
DECLARE
  v_role user_role;
BEGIN
  -- Chercher le rôle principal
  SELECT role INTO v_role
  FROM user_roles
  WHERE user_id = p_user_id AND is_primary = true
  LIMIT 1;

  -- Si aucun rôle principal, prendre le premier rôle disponible
  IF v_role IS NULL THEN
    SELECT role INTO v_role
    FROM user_roles
    WHERE user_id = p_user_id
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  -- Fallback: CLIENT
  RETURN COALESCE(v_role, 'CLIENT'::user_role);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_effective_role(UUID) IS 'Retourne le rôle effectif d''un utilisateur (principal ou premier disponible)';
