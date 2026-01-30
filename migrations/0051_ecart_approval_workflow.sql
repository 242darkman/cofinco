-- Migration: Workflow Approbation Écarts Caisse
-- Approbation hiérarchique obligatoire pour les écarts > seuil configurable

-- Table de configuration des seuils par agence
CREATE TABLE config_ecart_caisse (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agence_id UUID REFERENCES agences(id), -- NULL = configuration globale

  -- Seuils d'écart (en XOF)
  seuil_auto_approve NUMERIC(15,2) NOT NULL DEFAULT 100, -- Auto-approuvé si <= ce montant
  seuil_n1_approval NUMERIC(15,2) NOT NULL DEFAULT 5000, -- Nécessite approbation N1
  seuil_n2_approval NUMERIC(15,2) NOT NULL DEFAULT 50000, -- Nécessite approbation N2 (chef agence)

  -- Rôles autorisés à approuver
  roles_approbateurs_n1 JSONB NOT NULL DEFAULT '["SUPERVISEUR", "CHEF_CAISSE"]',
  roles_approbateurs_n2 JSONB NOT NULL DEFAULT '["CHEF_AGENCE", "DIRECTEUR"]',

  -- Comportement
  block_close_until_approved BOOLEAN NOT NULL DEFAULT TRUE,
  allow_self_approval_if_role BOOLEAN NOT NULL DEFAULT FALSE, -- Le caissier peut-il s'auto-approuver si superviseur?
  require_double_approval_n2 BOOLEAN NOT NULL DEFAULT FALSE, -- Double approbation pour N2?

  actif BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_config_ecart_agence UNIQUE (agence_id)
);

-- Table des demandes d'approbation
CREATE TABLE ecarts_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions_caisse(id) ON DELETE CASCADE,
  caissier_id UUID NOT NULL REFERENCES users(id),
  agence_id UUID REFERENCES agences(id),

  -- Détails de l'écart
  solde_theorique NUMERIC(15,2) NOT NULL,
  montant_physique NUMERIC(15,2) NOT NULL,
  ecart NUMERIC(15,2) NOT NULL,
  type_ecart TEXT NOT NULL CHECK (type_ecart IN ('SURPLUS', 'DEFICIT')),
  justification TEXT NOT NULL,

  -- Workflow approbation
  niveau_requis TEXT NOT NULL DEFAULT 'N1' CHECK (niveau_requis IN ('N1', 'N2')),
  statut TEXT NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (statut IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'AUTO_APPROVED', 'EXPIRED')),

  -- Premier approbateur
  approver_id UUID REFERENCES users(id),
  approved_at TIMESTAMP,
  approval_decision TEXT CHECK (approval_decision IN ('APPROVED', 'REJECTED')),
  approval_comment TEXT,

  -- Second approbateur (si double approbation)
  second_approver_id UUID REFERENCES users(id),
  second_approved_at TIMESTAMP,
  second_approval_comment TEXT,

  -- Configuration snapshot (pour audit)
  threshold_applied NUMERIC(15,2) NOT NULL,
  config_snapshot JSONB,

  -- Expiration automatique
  expires_at TIMESTAMP,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index pour requêtes fréquentes
CREATE INDEX idx_ecarts_approval_session ON ecarts_approval_requests(session_id);
CREATE INDEX idx_ecarts_approval_agence ON ecarts_approval_requests(agence_id);
CREATE INDEX idx_ecarts_approval_statut ON ecarts_approval_requests(statut);
CREATE INDEX idx_ecarts_approval_pending ON ecarts_approval_requests(agence_id, statut) WHERE statut = 'PENDING_APPROVAL';
CREATE INDEX idx_ecarts_approval_caissier ON ecarts_approval_requests(caissier_id);

-- Colonnes additionnelles sur sessions_caisse
ALTER TABLE sessions_caisse
ADD COLUMN IF NOT EXISTS ecart_approval_id UUID REFERENCES ecarts_approval_requests(id),
ADD COLUMN IF NOT EXISTS ecart_approval_status TEXT CHECK (ecart_approval_status IN ('NOT_REQUIRED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'AUTO_APPROVED'));

-- Table d'historique des approbations (audit immutable)
CREATE TABLE ecarts_approval_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES ecarts_approval_requests(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- CREATED, APPROVED, REJECTED, EXPIRED, ESCALATED
  actor_id UUID REFERENCES users(id),
  actor_role TEXT,
  comment TEXT,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ecarts_audit_request ON ecarts_approval_audit_log(request_id);

-- Insérer configuration globale par défaut
INSERT INTO config_ecart_caisse (agence_id, seuil_auto_approve, seuil_n1_approval, seuil_n2_approval)
VALUES (NULL, 100, 5000, 50000)
ON CONFLICT (agence_id) DO NOTHING;

COMMENT ON TABLE config_ecart_caisse IS 'Configuration des seuils et rôles pour approbation écarts caisse';
COMMENT ON TABLE ecarts_approval_requests IS 'Demandes d''approbation pour écarts caisse dépassant les seuils';
COMMENT ON COLUMN ecarts_approval_requests.niveau_requis IS 'N1=superviseur, N2=chef agence';
