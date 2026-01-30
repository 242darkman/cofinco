-- Migration: CASL Conditions
-- Ajoute le support des conditions MongoDB-style pour les permissions

-- =====================================================
-- COLONNES CONDITIONS SUR LES TABLES EXISTANTES
-- =====================================================

-- Ajouter la colonne conditions sur role_permissions
ALTER TABLE role_permissions
ADD COLUMN IF NOT EXISTS conditions JSONB;

-- Ajouter la colonne conditions sur user_permissions
ALTER TABLE user_permissions
ADD COLUMN IF NOT EXISTS conditions JSONB;

COMMENT ON COLUMN role_permissions.conditions IS 'Conditions CASL MongoDB-style (ex: {"amount": {"$lte": 1000000}})';
COMMENT ON COLUMN user_permissions.conditions IS 'Conditions CASL MongoDB-style surchargeant les conditions du rôle';

-- =====================================================
-- TABLE DES TEMPLATES DE CONDITIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS permission_condition_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  condition_schema JSONB NOT NULL,
  variables JSONB DEFAULT '[]', -- Liste des variables utilisées (ex: ["userId", "agenceId"])
  examples JSONB DEFAULT '[]', -- Exemples d'utilisation
  is_system BOOLEAN DEFAULT false, -- Templates système non modifiables
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour recherche par nom
CREATE INDEX IF NOT EXISTS idx_pct_name ON permission_condition_templates(name);

-- Trigger pour updated_at
CREATE OR REPLACE FUNCTION update_pct_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pct_updated ON permission_condition_templates;
CREATE TRIGGER trg_pct_updated
BEFORE UPDATE ON permission_condition_templates
FOR EACH ROW
EXECUTE FUNCTION update_pct_updated_at();

-- =====================================================
-- TEMPLATES DE CONDITIONS SYSTÈME
-- =====================================================

-- Template: Limite de montant
INSERT INTO permission_condition_templates (name, description, condition_schema, variables, examples, is_system)
VALUES (
  'amount_limit',
  'Limite le montant maximal autorisé pour une opération',
  '{"amount": {"$lte": "$maxAmount"}}',
  '["maxAmount"]',
  '[
    {"description": "Limite à 1M FCFA", "values": {"maxAmount": 1000000}},
    {"description": "Limite à 5M FCFA", "values": {"maxAmount": 5000000}}
  ]',
  true
) ON CONFLICT (name) DO NOTHING;

-- Template: Statuts autorisés
INSERT INTO permission_condition_templates (name, description, condition_schema, variables, examples, is_system)
VALUES (
  'status_filter',
  'Limite les actions aux entités ayant certains statuts',
  '{"status": {"$in": "$allowedStatuses"}}',
  '["allowedStatuses"]',
  '[
    {"description": "Statuts en attente", "values": {"allowedStatuses": ["PENDING", "REVIEW"]}},
    {"description": "Statuts actifs", "values": {"allowedStatuses": ["ACTIVE", "APPROVED"]}}
  ]',
  true
) ON CONFLICT (name) DO NOTHING;

-- Template: Propriétaire uniquement
INSERT INTO permission_condition_templates (name, description, condition_schema, variables, examples, is_system)
VALUES (
  'owner_only',
  'Limite les actions aux entités créées par l''utilisateur',
  '{"createdBy": "${userId}"}',
  '["userId"]',
  '[
    {"description": "Propres créations uniquement", "values": {}}
  ]',
  true
) ON CONFLICT (name) DO NOTHING;

-- Template: Même agence
INSERT INTO permission_condition_templates (name, description, condition_schema, variables, examples, is_system)
VALUES (
  'same_agency',
  'Limite les actions aux entités de la même agence',
  '{"agenceId": "${agenceId}"}',
  '["agenceId"]',
  '[
    {"description": "Même agence", "values": {}}
  ]',
  true
) ON CONFLICT (name) DO NOTHING;

-- Template: Fenêtre temporelle
INSERT INTO permission_condition_templates (name, description, condition_schema, variables, examples, is_system)
VALUES (
  'time_window',
  'Limite les actions aux entités créées dans une fenêtre temporelle',
  '{"createdAt": {"$gte": "${startDate}", "$lte": "${endDate}"}}',
  '["startDate", "endDate"]',
  '[
    {"description": "Créé aujourd''hui", "values": {"startDate": "${startOfDay}", "endDate": "${endOfDay}"}},
    {"description": "7 derniers jours", "values": {"startDate": "${startOfWeek}", "endDate": "${now}"}}
  ]',
  true
) ON CONFLICT (name) DO NOTHING;

-- Template: Combinaison AND
INSERT INTO permission_condition_templates (name, description, condition_schema, variables, examples, is_system)
VALUES (
  'combined_and',
  'Combine plusieurs conditions avec AND',
  '{"$and": ["$conditions"]}',
  '["conditions"]',
  '[
    {"description": "Montant < 1M ET statut PENDING", "values": {"conditions": [{"amount": {"$lte": 1000000}}, {"status": "PENDING"}]}}
  ]',
  true
) ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- INDEX POUR RECHERCHE DE CONDITIONS
-- =====================================================

-- Index GIN pour recherche dans les conditions JSONB
CREATE INDEX IF NOT EXISTS idx_role_perm_conditions ON role_permissions USING GIN (conditions) WHERE conditions IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_perm_conditions ON user_permissions USING GIN (conditions) WHERE conditions IS NOT NULL;

-- =====================================================
-- COMMENTAIRES
-- =====================================================

COMMENT ON TABLE permission_condition_templates IS 'Templates réutilisables pour les conditions CASL';
COMMENT ON COLUMN permission_condition_templates.condition_schema IS 'Schema JSONB avec variables template (${varName})';
COMMENT ON COLUMN permission_condition_templates.variables IS 'Liste des variables utilisées dans le schema';
