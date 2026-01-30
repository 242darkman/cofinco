-- Migration: Permission Analytics
-- Système optionnel de suivi des vérifications de permissions

-- =====================================================
-- TABLE DE CONFIGURATION
-- =====================================================

CREATE TABLE IF NOT EXISTS permission_analytics_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(50) NOT NULL UNIQUE,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

-- Configuration par défaut
INSERT INTO permission_analytics_config (key, value, description)
VALUES
  ('enabled', 'false', 'Active/désactive la collecte des analytics'),
  ('sampling_rate_allowed', '0.01', 'Taux d''échantillonnage pour les checks autorisés (0.01 = 1%)'),
  ('sampling_rate_denied', '1.0', 'Taux d''échantillonnage pour les checks refusés (1.0 = 100%)'),
  ('batch_size', '100', 'Nombre de logs à insérer par batch'),
  ('flush_interval_ms', '5000', 'Intervalle de flush en millisecondes'),
  ('retention_days', '30', 'Durée de rétention des logs en jours')
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- TABLE DES LOGS DE VÉRIFICATION
-- =====================================================

CREATE TABLE IF NOT EXISTS permission_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Qui
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_role VARCHAR(50) NOT NULL,

  -- Quoi
  permission_code VARCHAR(100) NOT NULL,
  action VARCHAR(50) NOT NULL,
  subject VARCHAR(100) NOT NULL,

  -- Résultat
  allowed BOOLEAN NOT NULL,
  denied_reason TEXT,

  -- Contexte
  agence_id UUID REFERENCES agences(id),
  resource_id UUID, -- ID de la ressource concernée si applicable
  resource_type VARCHAR(100), -- Type de ressource
  endpoint VARCHAR(255), -- Route API
  ip_address INET,

  -- Timestamp
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour les requêtes d'analyse
CREATE INDEX IF NOT EXISTS idx_pul_user ON permission_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_pul_perm ON permission_usage_logs(permission_code);
CREATE INDEX IF NOT EXISTS idx_pul_checked ON permission_usage_logs(checked_at);
CREATE INDEX IF NOT EXISTS idx_pul_allowed ON permission_usage_logs(allowed);
CREATE INDEX IF NOT EXISTS idx_pul_user_perm ON permission_usage_logs(user_id, permission_code);

-- Index partiel pour les refus (plus importants à analyser)
CREATE INDEX IF NOT EXISTS idx_pul_denied ON permission_usage_logs(checked_at, permission_code) WHERE allowed = false;

-- =====================================================
-- VUE MATÉRIALISÉE POUR STATISTIQUES
-- =====================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS permission_usage_stats AS
SELECT
  permission_code,
  action,
  subject,
  COUNT(*) as total_checks,
  COUNT(*) FILTER (WHERE allowed = true) as allowed_count,
  COUNT(*) FILTER (WHERE allowed = false) as denied_count,
  COUNT(DISTINCT user_id) as unique_users,
  ROUND(100.0 * COUNT(*) FILTER (WHERE allowed = true) / NULLIF(COUNT(*), 0), 2) as allow_rate,
  MIN(checked_at) as first_check,
  MAX(checked_at) as last_check
FROM permission_usage_logs
GROUP BY permission_code, action, subject;

-- Index sur la vue matérialisée
CREATE UNIQUE INDEX IF NOT EXISTS idx_pus_perm ON permission_usage_stats(permission_code);

-- =====================================================
-- TABLE DES PERMISSIONS INUTILISÉES
-- =====================================================

-- Vue pour identifier les permissions jamais utilisées
CREATE OR REPLACE VIEW unused_permissions AS
SELECT
  p.id,
  p.code,
  p.name,
  m.name as module_name,
  p.created_at
FROM permissions p
LEFT JOIN modules m ON m.id = p.module_id
WHERE NOT EXISTS (
  SELECT 1 FROM permission_usage_logs pul
  WHERE pul.permission_code = p.code
)
ORDER BY p.created_at;

-- =====================================================
-- FONCTIONS DE MAINTENANCE
-- =====================================================

-- Fonction pour rafraîchir la vue matérialisée
CREATE OR REPLACE FUNCTION refresh_permission_stats()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY permission_usage_stats;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour purger les anciens logs
CREATE OR REPLACE FUNCTION purge_old_permission_logs(days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM permission_usage_logs
  WHERE checked_at < NOW() - (days_to_keep || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMMENTAIRES
-- =====================================================

COMMENT ON TABLE permission_analytics_config IS 'Configuration du système d''analytics des permissions';
COMMENT ON TABLE permission_usage_logs IS 'Logs des vérifications de permissions (échantillonné)';
COMMENT ON MATERIALIZED VIEW permission_usage_stats IS 'Statistiques agrégées par permission (refresh horaire)';
COMMENT ON VIEW unused_permissions IS 'Permissions définies mais jamais utilisées';
COMMENT ON FUNCTION refresh_permission_stats IS 'Rafraîchit la vue matérialisée des stats (à appeler via cron)';
COMMENT ON FUNCTION purge_old_permission_logs IS 'Purge les logs plus vieux que N jours';
