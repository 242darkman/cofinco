-- Migration: Add agence_id column to main entities
-- Date: 2025-12-27
-- Purpose: Enable multi-agency filtering by linking entities directly to agences table

-- ============================================
-- ADD AGENCE_ID TO CLIENTS
-- ============================================
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS agence_id UUID REFERENCES agences(id);

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_clients_agence_id ON clients(agence_id);

-- Migrate existing data: Link clients to agences based on text 'agence' field
UPDATE clients c
SET agence_id = a.id
FROM agences a
WHERE c.agence IS NOT NULL
  AND c.agence_id IS NULL
  AND (a.nom = c.agence OR a.code_agence = c.agence);

-- For clients without a matching agence, assign to Agence Centrale
UPDATE clients
SET agence_id = (SELECT id FROM agences WHERE code_agence = 'COF-CENTRAL' LIMIT 1)
WHERE agence_id IS NULL;

-- ============================================
-- ADD AGENCE_ID TO CREDITS
-- ============================================
ALTER TABLE credits
ADD COLUMN IF NOT EXISTS agence_id UUID REFERENCES agences(id);

CREATE INDEX IF NOT EXISTS idx_credits_agence_id ON credits(agence_id);

-- Migrate: Inherit agence_id from the client
UPDATE credits cr
SET agence_id = c.agence_id
FROM clients c
WHERE cr.client_id = c.id
  AND cr.agence_id IS NULL
  AND c.agence_id IS NOT NULL;

-- ============================================
-- ADD AGENCE_ID TO COMPTES_EPARGNE
-- ============================================
ALTER TABLE comptes_epargne
ADD COLUMN IF NOT EXISTS agence_id UUID REFERENCES agences(id);

CREATE INDEX IF NOT EXISTS idx_comptes_epargne_agence_id ON comptes_epargne(agence_id);

-- Migrate: Inherit agence_id from the client
UPDATE comptes_epargne ce
SET agence_id = c.agence_id
FROM clients c
WHERE ce.client_id = c.id
  AND ce.agence_id IS NULL
  AND c.agence_id IS NOT NULL;

-- ============================================
-- ADD AGENCE_ID TO SESSIONS_CAISSE
-- ============================================
ALTER TABLE sessions_caisse
ADD COLUMN IF NOT EXISTS agence_id UUID REFERENCES agences(id);

CREATE INDEX IF NOT EXISTS idx_sessions_caisse_agence_id ON sessions_caisse(agence_id);

-- Migrate: Link sessions to user's primary agence
UPDATE sessions_caisse sc
SET agence_id = ua.agence_id
FROM user_agences ua
WHERE sc.caissier_id = ua.user_id
  AND ua.is_primary = true
  AND sc.agence_id IS NULL;

-- ============================================
-- ADD AGENCE_ID TO TONTINES
-- ============================================
ALTER TABLE tontines
ADD COLUMN IF NOT EXISTS agence_id UUID REFERENCES agences(id);

CREATE INDEX IF NOT EXISTS idx_tontines_agence_id ON tontines(agence_id);

-- Migrate: Link tontines to user's primary agence (via gestionnaire)
UPDATE tontines t
SET agence_id = ua.agence_id
FROM user_agences ua
WHERE t.gestionnaire_id = ua.user_id
  AND ua.is_primary = true
  AND t.agence_id IS NULL;

-- For tontines without gestionnaire, assign to Agence Centrale
UPDATE tontines
SET agence_id = (SELECT id FROM agences WHERE code_agence = 'COF-CENTRAL' LIMIT 1)
WHERE agence_id IS NULL;

-- ============================================
-- ADD AGENCE_ID TO DEMANDES_CREDIT
-- ============================================
ALTER TABLE demandes_credit
ADD COLUMN IF NOT EXISTS agence_id UUID REFERENCES agences(id);

CREATE INDEX IF NOT EXISTS idx_demandes_credit_agence_id ON demandes_credit(agence_id);

-- Migrate: Inherit from client
UPDATE demandes_credit dc
SET agence_id = c.agence_id
FROM clients c
WHERE dc.client_id = c.id
  AND dc.agence_id IS NULL
  AND c.agence_id IS NOT NULL;

-- ============================================
-- ADD AGENCE_ID TO ENQUETES_CREDIT
-- ============================================
ALTER TABLE enquetes_credit
ADD COLUMN IF NOT EXISTS agence_id UUID REFERENCES agences(id);

CREATE INDEX IF NOT EXISTS idx_enquetes_credit_agence_id ON enquetes_credit(agence_id);

-- Migrate: Inherit from client
UPDATE enquetes_credit ec
SET agence_id = c.agence_id
FROM clients c
WHERE ec.client_id = c.id
  AND ec.agence_id IS NULL
  AND c.agence_id IS NOT NULL;

-- ============================================
-- SUMMARY
-- ============================================
-- Tables modified:
--   - clients (agence_id added)
--   - credits (agence_id added)
--   - comptes_epargne (agence_id added)
--   - sessions_caisse (agence_id added)
--   - tontines (agence_id added)
--   - demandes_credit (agence_id added)
--   - enquetes_credit (agence_id added)
--
-- All entities now have a direct link to agences table for efficient filtering.
-- The old text 'agence' column in clients is kept for backward compatibility.
