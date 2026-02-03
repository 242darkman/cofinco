-- Migration: RBAC Ultra Hardening
-- ================================
-- 1. Audit trail complet pour modifications RBAC
-- 2. Scope agence pour user_permissions
-- 3. Feature flags pour migration progressive
-- 4. Helpers pour permissions critiques

-- =====================================================
-- 1. AUDIT LOG RBAC
-- =====================================================

-- Enum pour les actions d'audit
DO $$ BEGIN
  CREATE TYPE rbac_audit_action AS ENUM (
    'TOGGLE',
    'BULK_UPDATE',
    'RESET',
    'GRANT_TEMPORARY',
    'REVOKE_TEMPORARY',
    'EXPIRE_TEMPORARY'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Enum pour le scope
DO $$ BEGIN
  CREATE TYPE permission_scope AS ENUM ('GLOBAL', 'AGENCE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Table d'audit RBAC
CREATE TABLE IF NOT EXISTS rbac_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Qui fait l'action
  actor_user_id UUID NOT NULL REFERENCES users(id),
  actor_ip TEXT,
  actor_user_agent TEXT,

  -- Qui subit l'action
  target_user_id UUID REFERENCES users(id),
  target_role TEXT, -- Pour les changements de role_permissions

  -- L'action
  action rbac_audit_action NOT NULL,

  -- La permission concernée
  permission_id UUID REFERENCES permissions(id),
  permission_code TEXT,

  -- Changement
  old_value BOOLEAN, -- null si pas de valeur précédente
  new_value BOOLEAN, -- null = suppression (retour au rôle)

  -- Scope
  scope permission_scope NOT NULL DEFAULT 'GLOBAL',
  agence_id UUID, -- FK vers agences

  -- Détails obligatoires pour permissions critiques
  reason TEXT,

  -- Métadonnées supplémentaires (diff complet pour bulk, etc.)
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Versioning
  rbac_version_before BIGINT,
  rbac_version_after BIGINT
);

-- Index pour requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_rbac_audit_log_actor ON rbac_audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_log_target ON rbac_audit_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_log_created ON rbac_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_log_permission ON rbac_audit_log(permission_code);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_log_action ON rbac_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_log_agence ON rbac_audit_log(agence_id) WHERE agence_id IS NOT NULL;

-- Commentaires
COMMENT ON TABLE rbac_audit_log IS 'Audit trail complet de toutes les modifications RBAC';
COMMENT ON COLUMN rbac_audit_log.reason IS 'Obligatoire pour les permissions critiques (paiements.*, coffre.*, admin.*)';
COMMENT ON COLUMN rbac_audit_log.metadata IS 'Données supplémentaires: diff[], bulk changes, etc.';

-- =====================================================
-- 2. SCOPE AGENCE POUR USER_PERMISSIONS
-- =====================================================

-- Ajouter les colonnes scope et agence_id si elles n'existent pas
DO $$
BEGIN
  -- Ajouter la colonne scope
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_permissions' AND column_name = 'scope'
  ) THEN
    ALTER TABLE user_permissions ADD COLUMN scope permission_scope NOT NULL DEFAULT 'GLOBAL';
  END IF;

  -- Ajouter la colonne agence_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_permissions' AND column_name = 'agence_id'
  ) THEN
    ALTER TABLE user_permissions ADD COLUMN agence_id UUID;
  END IF;

  -- Ajouter la colonne reason (pour audit trail inline)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_permissions' AND column_name = 'reason'
  ) THEN
    ALTER TABLE user_permissions ADD COLUMN reason TEXT;
  END IF;

  -- Ajouter granted_by (qui a fait l'override)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_permissions' AND column_name = 'granted_by'
  ) THEN
    ALTER TABLE user_permissions ADD COLUMN granted_by UUID REFERENCES users(id);
  END IF;
END $$;

-- Contrainte: si scope=AGENCE, agence_id doit être défini
ALTER TABLE user_permissions DROP CONSTRAINT IF EXISTS chk_agence_scope;
ALTER TABLE user_permissions ADD CONSTRAINT chk_agence_scope
  CHECK (
    (scope = 'GLOBAL' AND agence_id IS NULL) OR
    (scope = 'AGENCE' AND agence_id IS NOT NULL)
  );

-- Contrainte unique mise à jour: userId + permissionId + scope + agenceId
-- Supprimer l'ancienne contrainte si elle existe
DO $$
BEGIN
  ALTER TABLE user_permissions DROP CONSTRAINT IF EXISTS user_permissions_user_id_permission_id_key;
  ALTER TABLE user_permissions DROP CONSTRAINT IF EXISTS user_permissions_user_id_permission_id_scope_agence_id_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Nouvelle contrainte unique avec scope et agence
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_permissions_unique_scoped
  ON user_permissions (user_id, permission_id, scope, COALESCE(agence_id, '00000000-0000-0000-0000-000000000000'));

-- Index pour recherche par agence
CREATE INDEX IF NOT EXISTS idx_user_permissions_agence ON user_permissions(agence_id) WHERE agence_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_permissions_scope ON user_permissions(scope);

-- Commentaires
COMMENT ON COLUMN user_permissions.scope IS 'GLOBAL = s''applique partout, AGENCE = s''applique uniquement dans l''agence spécifiée';
COMMENT ON COLUMN user_permissions.agence_id IS 'ID de l''agence si scope=AGENCE (NULL si GLOBAL)';
COMMENT ON COLUMN user_permissions.reason IS 'Raison de l''override (obligatoire pour permissions critiques)';
COMMENT ON COLUMN user_permissions.granted_by IS 'Utilisateur qui a accordé/retiré cette permission';

-- =====================================================
-- 3. FEATURE FLAGS POUR MIGRATION PROGRESSIVE
-- =====================================================

-- Table des feature flags système
CREATE TABLE IF NOT EXISTS system_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key TEXT NOT NULL UNIQUE,
  flag_value BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  -- Contrôle qui peut modifier
  is_system BOOLEAN NOT NULL DEFAULT false, -- Flags système non modifiables via UI
  -- Métadonnées
  enabled_at TIMESTAMP WITH TIME ZONE,
  enabled_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insérer les feature flags RBAC
INSERT INTO system_feature_flags (flag_key, flag_value, description, is_system)
VALUES
  ('RBAC_SCOPED_OVERRIDES', false, 'Activer le scope agence pour les overrides utilisateur (off = tout est GLOBAL)', true),
  ('RBAC_REQUIRE_REASON_CRITICAL', true, 'Exiger une raison pour les permissions critiques', true),
  ('RBAC_AUDIT_LOG_ENABLED', true, 'Activer l''audit log RBAC', true),
  ('RBAC_SOFT_REVALIDATE', false, 'Activer la revalidation soft côté client (focus, reconnect)', true)
ON CONFLICT (flag_key) DO NOTHING;

-- Fonction helper pour lire un flag
CREATE OR REPLACE FUNCTION get_feature_flag(p_flag_key TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_value BOOLEAN;
BEGIN
  SELECT flag_value INTO v_value
  FROM system_feature_flags
  WHERE flag_key = p_flag_key;

  RETURN COALESCE(v_value, false);
END;
$$ LANGUAGE plpgsql STABLE;

-- Fonction helper pour modifier un flag
CREATE OR REPLACE FUNCTION set_feature_flag(p_flag_key TEXT, p_value BOOLEAN, p_user_id UUID DEFAULT NULL)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE system_feature_flags
  SET
    flag_value = p_value,
    enabled_at = CASE WHEN p_value THEN NOW() ELSE NULL END,
    enabled_by = p_user_id,
    updated_at = NOW()
  WHERE flag_key = p_flag_key
    AND is_system = false; -- Empêcher modification des flags système via cette fonction

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Commentaires
COMMENT ON TABLE system_feature_flags IS 'Feature flags pour déploiement progressif';
COMMENT ON FUNCTION get_feature_flag IS 'Lire la valeur d''un feature flag';

-- =====================================================
-- 4. LISTE DES PERMISSIONS CRITIQUES
-- =====================================================

-- Table de référence pour les patterns de permissions critiques
CREATE TABLE IF NOT EXISTS critical_permission_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern TEXT NOT NULL UNIQUE, -- ex: 'paiements.%', 'coffre.%', 'admin.%'
  description TEXT,
  require_reason BOOLEAN NOT NULL DEFAULT true,
  require_supervisor_approval BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insérer les patterns critiques par défaut
INSERT INTO critical_permission_patterns (pattern, description, require_reason, require_supervisor_approval)
VALUES
  ('paiements.%', 'Toutes les permissions de paiement', true, false),
  ('coffre.%', 'Toutes les permissions coffre-fort', true, true),
  ('admin.%', 'Toutes les permissions administration', true, false),
  ('validation.%', 'Toutes les permissions de validation', true, false),
  ('caisse.close', 'Fermeture de caisse', true, false),
  ('caisse.admin', 'Administration caisse', true, false),
  ('credits.disburse%', 'Décaissement de crédits', true, false),
  ('rbac.manage', 'Gestion RBAC', true, false)
ON CONFLICT (pattern) DO NOTHING;

-- Fonction pour vérifier si une permission est critique
CREATE OR REPLACE FUNCTION is_critical_permission(p_permission_code TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_is_critical BOOLEAN := false;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM critical_permission_patterns
    WHERE p_permission_code LIKE REPLACE(pattern, '%', '') || '%'
       OR p_permission_code = pattern
  ) INTO v_is_critical;

  RETURN v_is_critical;
END;
$$ LANGUAGE plpgsql STABLE;

-- Commentaires
COMMENT ON TABLE critical_permission_patterns IS 'Patterns de permissions critiques nécessitant justification';
COMMENT ON FUNCTION is_critical_permission IS 'Vérifie si un code permission est critique (nécessite reason)';

-- =====================================================
-- 5. TRIGGER POUR AUDIT LOG AUTOMATIQUE
-- =====================================================

-- Fonction trigger pour logger automatiquement les changements user_permissions
CREATE OR REPLACE FUNCTION trigger_audit_user_permission_change()
RETURNS TRIGGER AS $$
DECLARE
  v_version_before BIGINT;
  v_version_after BIGINT;
  v_permission_code TEXT;
  v_actor_id UUID;
BEGIN
  -- Obtenir la version courante
  SELECT get_rbac_version() INTO v_version_before;

  -- Obtenir le code permission
  SELECT code INTO v_permission_code
  FROM permissions
  WHERE id = COALESCE(NEW.permission_id, OLD.permission_id);

  -- Déterminer l'actor (granted_by si disponible, sinon session)
  v_actor_id := COALESCE(NEW.granted_by, OLD.granted_by);

  -- Si audit log est activé
  IF get_feature_flag('RBAC_AUDIT_LOG_ENABLED') THEN
    -- Insérer dans audit log
    INSERT INTO rbac_audit_log (
      actor_user_id,
      target_user_id,
      action,
      permission_id,
      permission_code,
      old_value,
      new_value,
      scope,
      agence_id,
      reason,
      rbac_version_before,
      metadata
    ) VALUES (
      COALESCE(v_actor_id, '00000000-0000-0000-0000-000000000000'::UUID), -- Fallback si pas d'actor
      COALESCE(NEW.user_id, OLD.user_id),
      CASE TG_OP
        WHEN 'INSERT' THEN 'TOGGLE'::rbac_audit_action
        WHEN 'UPDATE' THEN 'TOGGLE'::rbac_audit_action
        WHEN 'DELETE' THEN 'RESET'::rbac_audit_action
      END,
      COALESCE(NEW.permission_id, OLD.permission_id),
      v_permission_code,
      OLD.granted,
      NEW.granted,
      COALESCE(NEW.scope, OLD.scope, 'GLOBAL'),
      COALESCE(NEW.agence_id, OLD.agence_id),
      COALESCE(NEW.reason, OLD.reason),
      v_version_before,
      jsonb_build_object(
        'operation', TG_OP,
        'conditions', NEW.conditions,
        'table', 'user_permissions'
      )
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Créer le trigger
DROP TRIGGER IF EXISTS audit_user_permission_change ON user_permissions;
CREATE TRIGGER audit_user_permission_change
  AFTER INSERT OR UPDATE OR DELETE ON user_permissions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_audit_user_permission_change();

-- =====================================================
-- 6. VERSIONING PAR UTILISATEUR (OPTIONNEL)
-- =====================================================

-- Ajouter une colonne rbac_version sur users pour tracking individuel
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'rbac_version'
  ) THEN
    ALTER TABLE users ADD COLUMN rbac_version BIGINT NOT NULL DEFAULT 1;
  END IF;
END $$;

-- Fonction pour incrémenter la version RBAC d'un utilisateur
CREATE OR REPLACE FUNCTION increment_user_rbac_version(p_user_id UUID)
RETURNS BIGINT AS $$
DECLARE
  v_new_version BIGINT;
BEGIN
  UPDATE users
  SET rbac_version = rbac_version + 1, updated_at = NOW()
  WHERE id = p_user_id
  RETURNING rbac_version INTO v_new_version;

  RETURN v_new_version;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour auto-incrémenter la version utilisateur lors de changements
CREATE OR REPLACE FUNCTION trigger_increment_user_rbac_version()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM increment_user_rbac_version(COALESCE(NEW.user_id, OLD.user_id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_rbac_version_on_permission ON user_permissions;
CREATE TRIGGER user_rbac_version_on_permission
  AFTER INSERT OR UPDATE OR DELETE ON user_permissions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_increment_user_rbac_version();

DROP TRIGGER IF EXISTS user_rbac_version_on_temp_permission ON temporary_permissions;
CREATE TRIGGER user_rbac_version_on_temp_permission
  AFTER INSERT OR UPDATE OR DELETE ON temporary_permissions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_increment_user_rbac_version();

-- Commentaires
COMMENT ON COLUMN users.rbac_version IS 'Version RBAC individuelle, incrémentée à chaque changement de permissions';
COMMENT ON FUNCTION increment_user_rbac_version IS 'Incrémente la version RBAC d''un utilisateur';

-- =====================================================
-- 7. VUE POUR PERMISSIONS EFFECTIVES AVEC SOURCE
-- =====================================================

-- Vue pour calculer les permissions effectives avec la source
CREATE OR REPLACE VIEW v_effective_permissions AS
WITH user_role_perms AS (
  -- Permissions du rôle
  SELECT
    ur.user_id,
    p.id AS permission_id,
    p.code AS permission_code,
    p.name AS permission_name,
    rp.granted,
    'ROLE' AS source,
    ur.role AS source_role,
    NULL::UUID AS source_agence_id,
    rp.conditions
  FROM user_roles ur
  JOIN role_permissions rp ON rp.role = ur.role
  JOIN permissions p ON p.id = rp.permission_id
  WHERE ur.is_primary = true
),
temp_perms AS (
  -- Permissions temporaires actives
  SELECT
    tp.user_id,
    p.id AS permission_id,
    p.code AS permission_code,
    p.name AS permission_name,
    true AS granted,
    'TEMPORARY' AS source,
    NULL AS source_role,
    NULL::UUID AS source_agence_id,
    NULL::JSONB AS conditions
  FROM temporary_permissions tp
  JOIN permissions p ON p.id = tp.permission_id
  WHERE tp.is_active = true
    AND tp.expires_at > NOW()
),
user_overrides AS (
  -- Overrides utilisateur
  SELECT
    up.user_id,
    p.id AS permission_id,
    p.code AS permission_code,
    p.name AS permission_name,
    up.granted,
    CASE up.scope
      WHEN 'GLOBAL' THEN 'OVERRIDE_GLOBAL'
      ELSE 'OVERRIDE_AGENCE'
    END AS source,
    NULL AS source_role,
    up.agence_id AS source_agence_id,
    up.conditions
  FROM user_permissions up
  JOIN permissions p ON p.id = up.permission_id
)
-- Fusionner avec priorité: OVERRIDE > TEMPORARY > ROLE
SELECT DISTINCT ON (user_id, permission_id)
  user_id,
  permission_id,
  permission_code,
  permission_name,
  granted,
  source,
  source_role,
  source_agence_id,
  conditions
FROM (
  SELECT *, 1 AS priority FROM user_overrides
  UNION ALL
  SELECT *, 2 AS priority FROM temp_perms
  UNION ALL
  SELECT *, 3 AS priority FROM user_role_perms
) combined
ORDER BY user_id, permission_id, priority ASC;

COMMENT ON VIEW v_effective_permissions IS 'Vue calculant les permissions effectives avec leur source (ROLE, TEMPORARY, OVERRIDE_GLOBAL, OVERRIDE_AGENCE)';

-- =====================================================
-- FIN DE LA MIGRATION
-- =====================================================

-- Rafraîchir les vues matérialisées si elles existent
-- (pas de vues matérialisées dans ce cas)

SELECT 'RBAC Hardening Migration completed successfully' AS status;
