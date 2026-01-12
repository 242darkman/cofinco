-- Migration: Amélioration Robuste des Sessions de Caisse
-- Description: Ajoute des contraintes, index et fonctions pour sécuriser les sessions de caisse en production
--              - Contrainte unique pour éviter double-ouverture
--              - Colonne heartbeat pour détecter sessions orphelines
--              - Index partiels pour performance
--              - Triggers pour audit automatique

-- ============================================================================
-- 1. CONTRAINTE UNIQUE: Une seule session ouverte par caisse
-- ============================================================================

-- Supprimer l'index s'il existe déjà (pour réexécution idempotente)
DROP INDEX IF EXISTS uq_sessions_caisse_one_open_per_caisse;

-- Créer un index unique partiel: empêche 2 sessions "Ouverte" sur la même caisse
CREATE UNIQUE INDEX uq_sessions_caisse_one_open_per_caisse
  ON sessions_caisse (caisse_id)
  WHERE statut = 'Ouverte';

COMMENT ON INDEX uq_sessions_caisse_one_open_per_caisse IS
  'Empêche l''ouverture de deux sessions simultanées sur la même caisse (race condition protection)';

-- ============================================================================
-- 2. CONTRAINTE UNIQUE: Un seul utilisateur avec une session ouverte à la fois
-- ============================================================================

DROP INDEX IF EXISTS uq_sessions_caisse_one_open_per_user;

CREATE UNIQUE INDEX uq_sessions_caisse_one_open_per_user
  ON sessions_caisse (caissier_id)
  WHERE statut = 'Ouverte';

COMMENT ON INDEX uq_sessions_caisse_one_open_per_user IS
  'Empêche un utilisateur d''ouvrir plusieurs sessions simultanément';

-- ============================================================================
-- 3. COLONNE HEARTBEAT: Détection des sessions orphelines
-- ============================================================================

-- Ajouter colonne last_activity si elle n'existe pas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sessions_caisse' AND column_name = 'last_activity'
  ) THEN
    ALTER TABLE sessions_caisse
    ADD COLUMN last_activity TIMESTAMP DEFAULT NOW();
  END IF;
END $$;

-- Ajouter colonne timeout_at si elle n'existe pas (date d'expiration prévue)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sessions_caisse' AND column_name = 'timeout_at'
  ) THEN
    ALTER TABLE sessions_caisse
    ADD COLUMN timeout_at TIMESTAMP;
  END IF;
END $$;

-- Ajouter colonne closed_reason pour distinguer fermeture normale vs timeout
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sessions_caisse' AND column_name = 'closed_reason'
  ) THEN
    ALTER TABLE sessions_caisse
    ADD COLUMN closed_reason TEXT DEFAULT 'manual';
  END IF;
END $$;

-- Mettre à jour les sessions existantes avec last_activity
UPDATE sessions_caisse
SET last_activity = COALESCE(date_fermeture, date_ouverture)
WHERE last_activity IS NULL;

-- Index pour recherche rapide des sessions à expirer
DROP INDEX IF EXISTS idx_sessions_caisse_open_timeout;
CREATE INDEX idx_sessions_caisse_open_timeout
  ON sessions_caisse (last_activity, timeout_at)
  WHERE statut = 'Ouverte';

COMMENT ON COLUMN sessions_caisse.last_activity IS
  'Dernière activité sur la session (mis à jour à chaque opération)';
COMMENT ON COLUMN sessions_caisse.timeout_at IS
  'Date/heure prévue d''expiration automatique de la session';
COMMENT ON COLUMN sessions_caisse.closed_reason IS
  'Raison de fermeture: manual (normal), timeout (auto-expiration), admin (forcée par admin)';

-- ============================================================================
-- 4. FONCTION: Mise à jour automatique du heartbeat
-- ============================================================================

CREATE OR REPLACE FUNCTION update_session_heartbeat()
RETURNS TRIGGER AS $$
BEGIN
  -- Mettre à jour last_activity de la session liée
  UPDATE sessions_caisse
  SET last_activity = NOW()
  WHERE id = NEW.session_id AND statut = 'Ouverte';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: mise à jour heartbeat à chaque opération
DROP TRIGGER IF EXISTS trigger_update_session_heartbeat ON operations_caisse;
CREATE TRIGGER trigger_update_session_heartbeat
  AFTER INSERT ON operations_caisse
  FOR EACH ROW
  EXECUTE FUNCTION update_session_heartbeat();

COMMENT ON FUNCTION update_session_heartbeat() IS
  'Met à jour automatiquement le timestamp last_activity de la session à chaque opération';

-- ============================================================================
-- 5. FONCTION: Fermeture automatique des sessions expirées
-- ============================================================================

CREATE OR REPLACE FUNCTION close_expired_sessions(timeout_hours INTEGER DEFAULT 12)
RETURNS TABLE (
  session_id UUID,
  caisse_id UUID,
  caissier_id UUID,
  opened_at TIMESTAMP,
  last_activity TIMESTAMP,
  hours_inactive NUMERIC
) AS $$
DECLARE
  expired_session RECORD;
  session_ops RECORD;
  calculated_solde NUMERIC;
BEGIN
  FOR expired_session IN
    SELECT s.*
    FROM sessions_caisse s
    WHERE s.statut = 'Ouverte'
    AND s.last_activity < NOW() - (timeout_hours || ' hours')::INTERVAL
  LOOP
    -- Calculer le solde théorique final
    SELECT
      COALESCE(SUM(
        CASE
          WHEN o.type_operation IN ('Versement', 'Depot', 'Encaissement', 'Dépôt épargne', 'Remboursement crédit', 'Approvisionnement coffre')
          THEN CAST(o.montant AS NUMERIC)
          WHEN o.type_operation IN ('Retrait', 'Decaissement', 'Retrait épargne', 'Décaissement crédit', 'Frais', 'Versement coffre')
          THEN -CAST(o.montant AS NUMERIC)
          ELSE 0
        END
      ), 0) INTO calculated_solde
    FROM operations_caisse o
    WHERE o.session_id = expired_session.id;

    calculated_solde := CAST(expired_session.solde_initial AS NUMERIC) + calculated_solde;

    -- Fermer la session avec raison "timeout"
    UPDATE sessions_caisse
    SET
      statut = 'Fermée',
      date_fermeture = NOW(),
      solde_theorique = calculated_solde::TEXT,
      closed_reason = 'timeout',
      observations = COALESCE(observations, '') ||
        E'\n[AUTO-FERMETURE] Session expirée après ' || timeout_hours || 'h d''inactivité. ' ||
        'Dernière activité: ' || expired_session.last_activity::TEXT
    WHERE id = expired_session.id;

    -- Retourner les infos de la session fermée
    session_id := expired_session.id;
    caisse_id := expired_session.caisse_id;
    caissier_id := expired_session.caissier_id;
    opened_at := expired_session.date_ouverture;
    last_activity := expired_session.last_activity;
    hours_inactive := EXTRACT(EPOCH FROM (NOW() - expired_session.last_activity)) / 3600;

    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION close_expired_sessions(INTEGER) IS
  'Ferme automatiquement les sessions inactives depuis plus de X heures. Retourne la liste des sessions fermées.';

-- ============================================================================
-- 6. INDEX DE PERFORMANCE
-- ============================================================================

-- Index pour recherche rapide des sessions ouvertes par agence
DROP INDEX IF EXISTS idx_sessions_caisse_agence_statut;
CREATE INDEX idx_sessions_caisse_agence_statut
  ON sessions_caisse (agence_id, statut);

-- Index pour recherche des sessions par caissier
DROP INDEX IF EXISTS idx_sessions_caisse_caissier_date;
CREATE INDEX idx_sessions_caisse_caissier_date
  ON sessions_caisse (caissier_id, date_ouverture DESC);

-- Index pour les opérations par session
DROP INDEX IF EXISTS idx_operations_caisse_session_date;
CREATE INDEX idx_operations_caisse_session_date
  ON operations_caisse (session_id, created_at DESC);

-- ============================================================================
-- 7. CONTRAINTE: Validation du billetage (non-négatif)
-- ============================================================================

-- Ajouter contrainte pour vérifier que les valeurs de billetage sont valides
-- Note: Le billetage est stocké en JSONB, on ne peut pas valider directement en DB
-- La validation se fera côté application (backend)

-- ============================================================================
-- 8. TABLE D'AUDIT: Logs des événements de session
-- ============================================================================

CREATE TABLE IF NOT EXISTS sessions_caisse_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Référence à la session
  session_id UUID NOT NULL REFERENCES sessions_caisse(id) ON DELETE CASCADE,

  -- Action effectuée
  action TEXT NOT NULL, -- OPENED, CLOSED, TIMEOUT, ADMIN_CLOSED, HEARTBEAT

  -- État avant/après
  statut_avant TEXT,
  statut_apres TEXT,

  -- Détails de l'action (soldes, écarts, etc.)
  details JSONB NOT NULL DEFAULT '{}',

  -- Acteur
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Contexte de la requête
  ip_address TEXT,
  user_agent TEXT,

  -- Timestamp immuable
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_sessions_audit_session_date
  ON sessions_caisse_audit_logs (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_audit_action
  ON sessions_caisse_audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_sessions_audit_date
  ON sessions_caisse_audit_logs (created_at DESC);

COMMENT ON TABLE sessions_caisse_audit_logs IS
  'Logs d''audit immuables pour toutes les actions sur les sessions de caisse';

-- ============================================================================
-- 9. FONCTION TRIGGER: Audit automatique des changements de session
-- ============================================================================

CREATE OR REPLACE FUNCTION audit_session_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO sessions_caisse_audit_logs (session_id, action, statut_apres, details)
    VALUES (
      NEW.id,
      'OPENED',
      NEW.statut,
      jsonb_build_object(
        'solde_initial', NEW.solde_initial,
        'caisse_id', NEW.caisse_id,
        'caissier_id', NEW.caissier_id,
        'billetage_ouverture', NEW.billetage_ouverture
      )
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Détecter changement de statut
    IF OLD.statut != NEW.statut THEN
      INSERT INTO sessions_caisse_audit_logs (session_id, action, statut_avant, statut_apres, details)
      VALUES (
        NEW.id,
        CASE
          WHEN NEW.statut = 'Fermée' AND NEW.closed_reason = 'timeout' THEN 'TIMEOUT'
          WHEN NEW.statut = 'Fermée' AND NEW.closed_reason = 'admin' THEN 'ADMIN_CLOSED'
          WHEN NEW.statut = 'Fermée' THEN 'CLOSED'
          ELSE 'STATUS_CHANGE'
        END,
        OLD.statut,
        NEW.statut,
        jsonb_build_object(
          'solde_theorique', NEW.solde_theorique,
          'solde_reel', NEW.solde_reel,
          'ecart', NEW.ecart,
          'billetage_fermeture', NEW.billetage_fermeture,
          'observations', NEW.observations,
          'closed_reason', NEW.closed_reason
        )
      );
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger: audit automatique
DROP TRIGGER IF EXISTS trigger_audit_session_changes ON sessions_caisse;
CREATE TRIGGER trigger_audit_session_changes
  AFTER INSERT OR UPDATE ON sessions_caisse
  FOR EACH ROW
  EXECUTE FUNCTION audit_session_changes();

-- ============================================================================
-- 10. VUE: Sessions avec statistiques temps réel
-- ============================================================================

CREATE OR REPLACE VIEW v_sessions_caisse_stats AS
SELECT
  s.id,
  s.caisse_id,
  s.caissier_id,
  s.agence_id,
  s.statut,
  s.date_ouverture,
  s.date_fermeture,
  s.solde_initial,
  s.solde_theorique,
  s.solde_reel,
  s.ecart,
  s.last_activity,
  s.timeout_at,
  s.closed_reason,
  -- Calculer le temps écoulé
  EXTRACT(EPOCH FROM (NOW() - s.date_ouverture)) / 3600 AS hours_open,
  EXTRACT(EPOCH FROM (NOW() - s.last_activity)) / 60 AS minutes_since_activity,
  -- Nombre d'opérations
  (SELECT COUNT(*) FROM operations_caisse o WHERE o.session_id = s.id) AS nb_operations,
  -- Totaux
  (SELECT COALESCE(SUM(CAST(o.montant AS NUMERIC)), 0)
   FROM operations_caisse o
   WHERE o.session_id = s.id
   AND o.type_operation IN ('Versement', 'Depot', 'Encaissement', 'Dépôt épargne', 'Remboursement crédit', 'Approvisionnement coffre')
  ) AS total_entrees,
  (SELECT COALESCE(SUM(CAST(o.montant AS NUMERIC)), 0)
   FROM operations_caisse o
   WHERE o.session_id = s.id
   AND o.type_operation IN ('Retrait', 'Decaissement', 'Retrait épargne', 'Décaissement crédit', 'Frais', 'Versement coffre')
  ) AS total_sorties,
  -- Noms
  c.nom AS caisse_nom,
  u.nom AS caissier_nom,
  u.prenom AS caissier_prenom
FROM sessions_caisse s
LEFT JOIN caisses c ON s.caisse_id = c.id
LEFT JOIN users u ON s.caissier_id = u.id;

COMMENT ON VIEW v_sessions_caisse_stats IS
  'Vue enrichie des sessions avec statistiques temps réel (durée, nombre d''opérations, totaux)';

-- ============================================================================
-- 11. FONCTION: Vérifier les sessions à risque (monitoring)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_risky_sessions(
  warning_hours INTEGER DEFAULT 6,
  critical_hours INTEGER DEFAULT 10
)
RETURNS TABLE (
  session_id UUID,
  caisse_nom TEXT,
  caissier_nom TEXT,
  hours_inactive NUMERIC,
  risk_level TEXT,
  solde_current NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    c.nom,
    u.nom || ' ' || COALESCE(u.prenom, ''),
    EXTRACT(EPOCH FROM (NOW() - s.last_activity)) / 3600,
    CASE
      WHEN EXTRACT(EPOCH FROM (NOW() - s.last_activity)) / 3600 >= critical_hours THEN 'CRITICAL'
      WHEN EXTRACT(EPOCH FROM (NOW() - s.last_activity)) / 3600 >= warning_hours THEN 'WARNING'
      ELSE 'OK'
    END,
    CAST(s.solde_initial AS NUMERIC) + COALESCE(
      (SELECT SUM(
        CASE
          WHEN o.type_operation IN ('Versement', 'Depot', 'Encaissement', 'Dépôt épargne', 'Remboursement crédit', 'Approvisionnement coffre')
          THEN CAST(o.montant AS NUMERIC)
          WHEN o.type_operation IN ('Retrait', 'Decaissement', 'Retrait épargne', 'Décaissement crédit', 'Frais', 'Versement coffre')
          THEN -CAST(o.montant AS NUMERIC)
          ELSE 0
        END
      ) FROM operations_caisse o WHERE o.session_id = s.id), 0
    )
  FROM sessions_caisse s
  LEFT JOIN caisses c ON s.caisse_id = c.id
  LEFT JOIN users u ON s.caissier_id = u.id
  WHERE s.statut = 'Ouverte'
  AND EXTRACT(EPOCH FROM (NOW() - s.last_activity)) / 3600 >= warning_hours
  ORDER BY EXTRACT(EPOCH FROM (NOW() - s.last_activity)) DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_risky_sessions(INTEGER, INTEGER) IS
  'Retourne les sessions à risque (inactives depuis trop longtemps) avec leur niveau de risque';

-- ============================================================================
-- 12. MISE À JOUR DES DONNÉES EXISTANTES
-- ============================================================================

-- Initialiser last_activity pour les sessions ouvertes sans cette valeur
UPDATE sessions_caisse
SET last_activity = (
  SELECT COALESCE(MAX(o.created_at), sessions_caisse.date_ouverture)
  FROM operations_caisse o
  WHERE o.session_id = sessions_caisse.id
)
WHERE statut = 'Ouverte' AND last_activity IS NULL;

-- Définir timeout_at par défaut (12h après last_activity)
UPDATE sessions_caisse
SET timeout_at = last_activity + INTERVAL '12 hours'
WHERE statut = 'Ouverte' AND timeout_at IS NULL;

-- ============================================================================
-- FIN DE LA MIGRATION
-- ============================================================================
