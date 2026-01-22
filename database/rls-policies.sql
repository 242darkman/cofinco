-- =============================================================================
-- COFIN Platform - Row Level Security (RLS) Policies
-- =============================================================================
--
-- Ce script implémente l'isolation des données par agence au niveau PostgreSQL.
-- C'est une couche de sécurité SUPPLÉMENTAIRE au filtrage applicatif existant.
--
-- STRATÉGIE:
--   1. Variables de session pour le contexte (app.current_agency_id, app.is_admin)
--   2. Politiques RLS basées sur ces variables
--   3. Bypass automatique pour les administrateurs
--
-- EXÉCUTION:
--   - Mode test:  psql -d cofinco_db -f database/rls-policies.sql
--   - Production: Via migration Drizzle ou script de déploiement
--
-- ATTENTION:
--   - Ce script est IDEMPOTENT (peut être relancé sans effet de bord)
--   - Les politiques existantes sont supprimées avant recréation
--   - Les tables manquantes sont ignorées silencieusement
--
-- =============================================================================

-- =============================================================================
-- SECTION 1: FONCTIONS HELPER POUR LE CONTEXTE DE SESSION
-- =============================================================================

-- Fonction pour récupérer l'agence courante depuis les variables de session
CREATE OR REPLACE FUNCTION current_agency_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  agency_id text;
BEGIN
  BEGIN
    agency_id := current_setting('app.current_agency_id', true);
    IF agency_id IS NULL OR agency_id = '' THEN
      RETURN NULL;
    END IF;
    RETURN agency_id::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
END;
$$;

-- Fonction pour vérifier si l'utilisateur courant est admin
CREATE OR REPLACE FUNCTION is_admin_context()
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  is_admin text;
BEGIN
  BEGIN
    is_admin := current_setting('app.is_admin', true);
    RETURN is_admin = 'true';
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;
END;
$$;

-- Fonction pour vérifier si l'utilisateur a accès à une agence spécifique
CREATE OR REPLACE FUNCTION has_agency_access(record_agency_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF is_admin_context() THEN
    RETURN true;
  END IF;
  IF record_agency_id IS NULL THEN
    RETURN true;
  END IF;
  RETURN record_agency_id = current_agency_id();
END;
$$;

COMMENT ON FUNCTION current_agency_id() IS 'Retourne l''ID de l''agence courante depuis la session PostgreSQL';
COMMENT ON FUNCTION is_admin_context() IS 'Vérifie si le contexte courant est administrateur (bypass RLS)';
COMMENT ON FUNCTION has_agency_access(uuid) IS 'Vérifie si l''utilisateur a accès à une agence donnée';

-- =============================================================================
-- SECTION 2: POLITIQUES RLS (avec gestion des tables manquantes)
-- =============================================================================

-- Fonction utilitaire pour créer une politique de manière sécurisée
CREATE OR REPLACE FUNCTION safe_create_policy(
  p_policy_name text,
  p_table_name text,
  p_command text,
  p_using_expr text DEFAULT NULL,
  p_check_expr text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  sql_stmt text;
BEGIN
  -- Vérifier si la table existe
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = p_table_name) THEN
    RAISE NOTICE 'Table % does not exist, skipping policy %', p_table_name, p_policy_name;
    RETURN;
  END IF;

  -- Activer RLS sur la table
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', p_table_name);

  -- Supprimer la politique si elle existe
  EXECUTE format('DROP POLICY IF EXISTS %I ON %I', p_policy_name, p_table_name);

  -- Construire la requête CREATE POLICY
  sql_stmt := format('CREATE POLICY %I ON %I FOR %s', p_policy_name, p_table_name, p_command);

  IF p_using_expr IS NOT NULL THEN
    sql_stmt := sql_stmt || ' USING (' || p_using_expr || ')';
  END IF;

  IF p_check_expr IS NOT NULL THEN
    sql_stmt := sql_stmt || ' WITH CHECK (' || p_check_expr || ')';
  END IF;

  EXECUTE sql_stmt;
  RAISE NOTICE 'Created policy % on %', p_policy_name, p_table_name;
END;
$$;

-- =============================================================================
-- TIER 1: Tables avec agence_id direct
-- =============================================================================

-- CLIENTS
SELECT safe_create_policy('rls_clients_select', 'clients', 'SELECT', 'has_agency_access(agence_id)');
SELECT safe_create_policy('rls_clients_insert', 'clients', 'INSERT', NULL, 'is_admin_context() OR agence_id IS NULL OR agence_id = current_agency_id()');
SELECT safe_create_policy('rls_clients_update', 'clients', 'UPDATE', 'has_agency_access(agence_id)', 'is_admin_context() OR agence_id IS NULL OR agence_id = current_agency_id()');
SELECT safe_create_policy('rls_clients_delete', 'clients', 'DELETE', 'is_admin_context() OR has_agency_access(agence_id)');

-- COMPTES
SELECT safe_create_policy('rls_comptes_select', 'comptes', 'SELECT', 'has_agency_access(agence_id)');
SELECT safe_create_policy('rls_comptes_insert', 'comptes', 'INSERT', NULL, 'is_admin_context() OR agence_id IS NULL OR agence_id = current_agency_id()');
SELECT safe_create_policy('rls_comptes_update', 'comptes', 'UPDATE', 'has_agency_access(agence_id)', 'is_admin_context() OR agence_id IS NULL OR agence_id = current_agency_id()');
SELECT safe_create_policy('rls_comptes_delete', 'comptes', 'DELETE', 'is_admin_context()');

-- CREDITS
SELECT safe_create_policy('rls_credits_select', 'credits', 'SELECT', 'has_agency_access(agence_id)');
SELECT safe_create_policy('rls_credits_insert', 'credits', 'INSERT', NULL, 'is_admin_context() OR agence_id IS NULL OR agence_id = current_agency_id()');
SELECT safe_create_policy('rls_credits_update', 'credits', 'UPDATE', 'has_agency_access(agence_id)', 'is_admin_context() OR agence_id IS NULL OR agence_id = current_agency_id()');
SELECT safe_create_policy('rls_credits_delete', 'credits', 'DELETE', 'is_admin_context()');

-- DEMANDES CREDIT
SELECT safe_create_policy('rls_demandes_credit_select', 'demandes_credit', 'SELECT', 'has_agency_access(agence_id)');
SELECT safe_create_policy('rls_demandes_credit_insert', 'demandes_credit', 'INSERT', NULL, 'is_admin_context() OR agence_id = current_agency_id()');
SELECT safe_create_policy('rls_demandes_credit_update', 'demandes_credit', 'UPDATE', 'has_agency_access(agence_id)', 'is_admin_context() OR agence_id = current_agency_id()');
SELECT safe_create_policy('rls_demandes_credit_delete', 'demandes_credit', 'DELETE', 'is_admin_context()');

-- MOUVEMENTS FINANCIERS
SELECT safe_create_policy('rls_mouvements_select', 'mouvements_financiers', 'SELECT', 'has_agency_access(agence_id)');
SELECT safe_create_policy('rls_mouvements_insert', 'mouvements_financiers', 'INSERT', NULL, 'is_admin_context() OR agence_id IS NULL OR agence_id = current_agency_id()');
SELECT safe_create_policy('rls_mouvements_update', 'mouvements_financiers', 'UPDATE', 'has_agency_access(agence_id)', 'is_admin_context() OR agence_id IS NULL OR agence_id = current_agency_id()');
SELECT safe_create_policy('rls_mouvements_delete', 'mouvements_financiers', 'DELETE', 'is_admin_context()');

-- EMPLOYES
SELECT safe_create_policy('rls_employes_select', 'employes', 'SELECT', 'has_agency_access(agence_id)');
SELECT safe_create_policy('rls_employes_insert', 'employes', 'INSERT', NULL, 'is_admin_context() OR agence_id IS NULL OR agence_id = current_agency_id()');
SELECT safe_create_policy('rls_employes_update', 'employes', 'UPDATE', 'has_agency_access(agence_id)', 'is_admin_context() OR agence_id IS NULL OR agence_id = current_agency_id()');
SELECT safe_create_policy('rls_employes_delete', 'employes', 'DELETE', 'is_admin_context()');

-- =============================================================================
-- TIER 2: Tables opérationnelles
-- =============================================================================

-- CAISSES (agence_id NOT NULL)
SELECT safe_create_policy('rls_caisses_select', 'caisses', 'SELECT', 'is_admin_context() OR agence_id = current_agency_id()');
SELECT safe_create_policy('rls_caisses_insert', 'caisses', 'INSERT', NULL, 'is_admin_context() OR agence_id = current_agency_id()');
SELECT safe_create_policy('rls_caisses_update', 'caisses', 'UPDATE', 'is_admin_context() OR agence_id = current_agency_id()', 'is_admin_context() OR agence_id = current_agency_id()');
SELECT safe_create_policy('rls_caisses_delete', 'caisses', 'DELETE', 'is_admin_context()');

-- SESSIONS CAISSE
SELECT safe_create_policy('rls_sessions_caisse_select', 'sessions_caisse', 'SELECT', 'has_agency_access(agence_id)');
SELECT safe_create_policy('rls_sessions_caisse_insert', 'sessions_caisse', 'INSERT', NULL, 'is_admin_context() OR agence_id IS NULL OR agence_id = current_agency_id()');
SELECT safe_create_policy('rls_sessions_caisse_update', 'sessions_caisse', 'UPDATE', 'has_agency_access(agence_id)');
SELECT safe_create_policy('rls_sessions_caisse_delete', 'sessions_caisse', 'DELETE', 'is_admin_context()');

-- TONTINES
SELECT safe_create_policy('rls_tontines_select', 'tontines', 'SELECT', 'has_agency_access(agence_id)');
SELECT safe_create_policy('rls_tontines_insert', 'tontines', 'INSERT', NULL, 'is_admin_context() OR agence_id IS NULL OR agence_id = current_agency_id()');
SELECT safe_create_policy('rls_tontines_update', 'tontines', 'UPDATE', 'has_agency_access(agence_id)');
SELECT safe_create_policy('rls_tontines_delete', 'tontines', 'DELETE', 'is_admin_context()');

-- PAIEMENTS TERRAIN
SELECT safe_create_policy('rls_paiements_terrain_select', 'paiements_terrain', 'SELECT', 'has_agency_access(agence_id)');
SELECT safe_create_policy('rls_paiements_terrain_insert', 'paiements_terrain', 'INSERT', NULL, 'is_admin_context() OR agence_id IS NULL OR agence_id = current_agency_id()');
SELECT safe_create_policy('rls_paiements_terrain_update', 'paiements_terrain', 'UPDATE', 'has_agency_access(agence_id)');
SELECT safe_create_policy('rls_paiements_terrain_delete', 'paiements_terrain', 'DELETE', 'is_admin_context()');

-- =============================================================================
-- TIER 3: Tables coffres (owner_id = agence, NULL = siège)
-- =============================================================================

-- COFFRES FORTS
SELECT safe_create_policy('rls_coffres_forts_select', 'coffres_forts', 'SELECT', 'is_admin_context() OR owner_id = current_agency_id()');
SELECT safe_create_policy('rls_coffres_forts_insert', 'coffres_forts', 'INSERT', NULL, 'is_admin_context() OR owner_id = current_agency_id()');
SELECT safe_create_policy('rls_coffres_forts_update', 'coffres_forts', 'UPDATE', 'is_admin_context() OR owner_id = current_agency_id()');
SELECT safe_create_policy('rls_coffres_forts_delete', 'coffres_forts', 'DELETE', 'is_admin_context()');

-- TRANSFERTS COFFRE (accès si source ou destination appartient à l'agence)
SELECT safe_create_policy('rls_transferts_coffre_select', 'transferts_coffre', 'SELECT',
  'is_admin_context() OR EXISTS (SELECT 1 FROM coffres_forts cf WHERE (cf.id = transferts_coffre.coffre_source_id OR cf.id = transferts_coffre.coffre_destination_id) AND cf.owner_id = current_agency_id())');
SELECT safe_create_policy('rls_transferts_coffre_insert', 'transferts_coffre', 'INSERT', NULL,
  'is_admin_context() OR EXISTS (SELECT 1 FROM coffres_forts cf WHERE cf.id = transferts_coffre.coffre_source_id AND cf.owner_id = current_agency_id())');
SELECT safe_create_policy('rls_transferts_coffre_update', 'transferts_coffre', 'UPDATE',
  'is_admin_context() OR EXISTS (SELECT 1 FROM coffres_forts cf WHERE (cf.id = transferts_coffre.coffre_source_id OR cf.id = transferts_coffre.coffre_destination_id) AND cf.owner_id = current_agency_id())');
SELECT safe_create_policy('rls_transferts_coffre_delete', 'transferts_coffre', 'DELETE', 'is_admin_context()');

-- TRANSFERTS INTER-COFFRES
SELECT safe_create_policy('rls_transferts_inter_coffres_select', 'transferts_inter_coffres', 'SELECT',
  'is_admin_context() OR EXISTS (SELECT 1 FROM coffres_forts cf WHERE (cf.id = transferts_inter_coffres.coffre_source_id OR cf.id = transferts_inter_coffres.coffre_destination_id) AND cf.owner_id = current_agency_id())');
SELECT safe_create_policy('rls_transferts_inter_coffres_insert', 'transferts_inter_coffres', 'INSERT', NULL,
  'is_admin_context() OR EXISTS (SELECT 1 FROM coffres_forts cf WHERE cf.id = transferts_inter_coffres.coffre_source_id AND cf.owner_id = current_agency_id())');
SELECT safe_create_policy('rls_transferts_inter_coffres_update', 'transferts_inter_coffres', 'UPDATE',
  'is_admin_context() OR EXISTS (SELECT 1 FROM coffres_forts cf WHERE (cf.id = transferts_inter_coffres.coffre_source_id OR cf.id = transferts_inter_coffres.coffre_destination_id) AND cf.owner_id = current_agency_id())');
SELECT safe_create_policy('rls_transferts_inter_coffres_delete', 'transferts_inter_coffres', 'DELETE', 'is_admin_context()');

-- =============================================================================
-- TIER 4: Tables héritées via FK (accès via jointure)
-- =============================================================================

-- AGENTS TERRAIN (hérite de employes.agence_id)
SELECT safe_create_policy('rls_agents_terrain_select', 'agents_terrain', 'SELECT',
  'is_admin_context() OR EXISTS (SELECT 1 FROM employes e WHERE e.id = agents_terrain.employe_id AND has_agency_access(e.agence_id))');
SELECT safe_create_policy('rls_agents_terrain_insert', 'agents_terrain', 'INSERT', NULL,
  'is_admin_context() OR EXISTS (SELECT 1 FROM employes e WHERE e.id = agents_terrain.employe_id AND (e.agence_id IS NULL OR e.agence_id = current_agency_id()))');
SELECT safe_create_policy('rls_agents_terrain_update', 'agents_terrain', 'UPDATE',
  'is_admin_context() OR EXISTS (SELECT 1 FROM employes e WHERE e.id = agents_terrain.employe_id AND has_agency_access(e.agence_id))');
SELECT safe_create_policy('rls_agents_terrain_delete', 'agents_terrain', 'DELETE', 'is_admin_context()');

-- CAISSES AGENT (hérite via agents_terrain → employes)
-- Colonne FK: agent_id (pas agent_terrain_id)
SELECT safe_create_policy('rls_caisses_agent_select', 'caisses_agent', 'SELECT',
  'is_admin_context() OR EXISTS (SELECT 1 FROM agents_terrain at JOIN employes e ON e.id = at.employe_id WHERE at.id = caisses_agent.agent_id AND has_agency_access(e.agence_id))');
SELECT safe_create_policy('rls_caisses_agent_insert', 'caisses_agent', 'INSERT', NULL,
  'is_admin_context() OR EXISTS (SELECT 1 FROM agents_terrain at JOIN employes e ON e.id = at.employe_id WHERE at.id = caisses_agent.agent_id AND (e.agence_id IS NULL OR e.agence_id = current_agency_id()))');
SELECT safe_create_policy('rls_caisses_agent_update', 'caisses_agent', 'UPDATE',
  'is_admin_context() OR EXISTS (SELECT 1 FROM agents_terrain at JOIN employes e ON e.id = at.employe_id WHERE at.id = caisses_agent.agent_id AND has_agency_access(e.agence_id))');
SELECT safe_create_policy('rls_caisses_agent_delete', 'caisses_agent', 'DELETE', 'is_admin_context()');

-- OPERATIONS TERRAIN
-- Colonne FK: agent_id (pas agent_terrain_id)
SELECT safe_create_policy('rls_operations_terrain_select', 'operations_terrain', 'SELECT',
  'is_admin_context() OR EXISTS (SELECT 1 FROM agents_terrain at JOIN employes e ON e.id = at.employe_id WHERE at.id = operations_terrain.agent_id AND has_agency_access(e.agence_id))');
SELECT safe_create_policy('rls_operations_terrain_insert', 'operations_terrain', 'INSERT', NULL,
  'is_admin_context() OR EXISTS (SELECT 1 FROM agents_terrain at JOIN employes e ON e.id = at.employe_id WHERE at.id = operations_terrain.agent_id AND (e.agence_id IS NULL OR e.agence_id = current_agency_id()))');
SELECT safe_create_policy('rls_operations_terrain_update', 'operations_terrain', 'UPDATE',
  'is_admin_context() OR EXISTS (SELECT 1 FROM agents_terrain at JOIN employes e ON e.id = at.employe_id WHERE at.id = operations_terrain.agent_id AND has_agency_access(e.agence_id))');
SELECT safe_create_policy('rls_operations_terrain_delete', 'operations_terrain', 'DELETE', 'is_admin_context()');

-- OPERATIONS CAISSE (hérite de sessions_caisse.agence_id)
-- Colonne FK: session_id (pas session_caisse_id)
SELECT safe_create_policy('rls_operations_caisse_select', 'operations_caisse', 'SELECT',
  'is_admin_context() OR EXISTS (SELECT 1 FROM sessions_caisse sc WHERE sc.id = operations_caisse.session_id AND has_agency_access(sc.agence_id))');
SELECT safe_create_policy('rls_operations_caisse_insert', 'operations_caisse', 'INSERT', NULL,
  'is_admin_context() OR EXISTS (SELECT 1 FROM sessions_caisse sc WHERE sc.id = operations_caisse.session_id AND (sc.agence_id IS NULL OR sc.agence_id = current_agency_id()))');
SELECT safe_create_policy('rls_operations_caisse_update', 'operations_caisse', 'UPDATE',
  'is_admin_context() OR EXISTS (SELECT 1 FROM sessions_caisse sc WHERE sc.id = operations_caisse.session_id AND has_agency_access(sc.agence_id))');
SELECT safe_create_policy('rls_operations_caisse_delete', 'operations_caisse', 'DELETE', 'is_admin_context()');

-- REMISES TERRAIN
-- Colonne FK: agent_id (pas agent_terrain_id)
SELECT safe_create_policy('rls_remises_terrain_select', 'remises_terrain', 'SELECT',
  'is_admin_context() OR EXISTS (SELECT 1 FROM agents_terrain at JOIN employes e ON e.id = at.employe_id WHERE at.id = remises_terrain.agent_id AND has_agency_access(e.agence_id))');
SELECT safe_create_policy('rls_remises_terrain_insert', 'remises_terrain', 'INSERT', NULL,
  'is_admin_context() OR EXISTS (SELECT 1 FROM agents_terrain at JOIN employes e ON e.id = at.employe_id WHERE at.id = remises_terrain.agent_id AND (e.agence_id IS NULL OR e.agence_id = current_agency_id()))');
SELECT safe_create_policy('rls_remises_terrain_update', 'remises_terrain', 'UPDATE',
  'is_admin_context() OR EXISTS (SELECT 1 FROM agents_terrain at JOIN employes e ON e.id = at.employe_id WHERE at.id = remises_terrain.agent_id AND has_agency_access(e.agence_id))');
SELECT safe_create_policy('rls_remises_terrain_delete', 'remises_terrain', 'DELETE', 'is_admin_context()');

-- MEMBRES TONTINE (hérite de tontines.agence_id)
-- Note: La colonne Drizzle "tontineId" devient "tontine_id" en SQL (snake_case)
SELECT safe_create_policy('rls_membres_tontine_select', 'membres_tontine', 'SELECT',
  'is_admin_context() OR EXISTS (SELECT 1 FROM tontines t WHERE t.id = membres_tontine.tontine_id AND has_agency_access(t.agence_id))');
SELECT safe_create_policy('rls_membres_tontine_insert', 'membres_tontine', 'INSERT', NULL,
  'is_admin_context() OR EXISTS (SELECT 1 FROM tontines t WHERE t.id = membres_tontine.tontine_id AND (t.agence_id IS NULL OR t.agence_id = current_agency_id()))');
SELECT safe_create_policy('rls_membres_tontine_update', 'membres_tontine', 'UPDATE',
  'is_admin_context() OR EXISTS (SELECT 1 FROM tontines t WHERE t.id = membres_tontine.tontine_id AND has_agency_access(t.agence_id))');
SELECT safe_create_policy('rls_membres_tontine_delete', 'membres_tontine', 'DELETE', 'is_admin_context()');

-- CONTRIBUTIONS TONTINE
SELECT safe_create_policy('rls_contributions_tontine_select', 'contributions_tontine', 'SELECT',
  'is_admin_context() OR EXISTS (SELECT 1 FROM tontines t WHERE t.id = contributions_tontine.tontine_id AND has_agency_access(t.agence_id))');
SELECT safe_create_policy('rls_contributions_tontine_insert', 'contributions_tontine', 'INSERT', NULL,
  'is_admin_context() OR EXISTS (SELECT 1 FROM tontines t WHERE t.id = contributions_tontine.tontine_id AND (t.agence_id IS NULL OR t.agence_id = current_agency_id()))');
SELECT safe_create_policy('rls_contributions_tontine_update', 'contributions_tontine', 'UPDATE',
  'is_admin_context() OR EXISTS (SELECT 1 FROM tontines t WHERE t.id = contributions_tontine.tontine_id AND has_agency_access(t.agence_id))');
SELECT safe_create_policy('rls_contributions_tontine_delete', 'contributions_tontine', 'DELETE', 'is_admin_context()');

-- =============================================================================
-- NETTOYAGE
-- =============================================================================

-- Supprimer la fonction utilitaire (ne sert qu'au setup)
DROP FUNCTION IF EXISTS safe_create_policy(text, text, text, text, text);

-- =============================================================================
-- RAPPORT FINAL
-- =============================================================================

-- Vue pour vérifier l'état RLS
CREATE OR REPLACE VIEW rls_status AS
SELECT
  t.tablename,
  t.rowsecurity as rls_enabled,
  COALESCE(p.policy_count, 0) as policy_count
FROM pg_tables t
LEFT JOIN (
  SELECT tablename, COUNT(*) as policy_count
  FROM pg_policies
  GROUP BY tablename
) p ON t.tablename = p.tablename
WHERE t.schemaname = 'public'
AND t.tablename IN (
  'clients', 'comptes', 'credits', 'demandes_credit', 'mouvements_financiers',
  'employes', 'caisses', 'sessions_caisse', 'tontines', 'paiements_terrain',
  'coffres_forts', 'transferts_coffre', 'transferts_inter_coffres',
  'agents_terrain', 'caisses_agent', 'operations_terrain', 'operations_caisse',
  'remises_terrain', 'membres_tontine', 'contributions_tontine'
)
ORDER BY t.tablename;

-- Afficher le rapport
SELECT
  '✅ RLS activé sur ' || COUNT(*) FILTER (WHERE rls_enabled) || ' tables' as status,
  '📜 ' || SUM(policy_count) || ' politiques créées' as policies
FROM rls_status;

-- =============================================================================
-- FIN DU SCRIPT
-- =============================================================================
