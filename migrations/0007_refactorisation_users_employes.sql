-- Migration: Refactorisation Users/Employes - Source de vérité unique
-- Date: 2026-01-02
-- Purpose: Créer une architecture où users est la source de vérité pour l'identité,
--          employes contient les données RH, et clients/agents_terrain sont liés

-- ============================================
-- PHASE 1: MODIFIER LA TABLE USERS
-- ============================================

-- Ajouter les nouvelles colonnes à users
ALTER TABLE users ADD COLUMN IF NOT EXISTS sexe VARCHAR(1); -- 'M' ou 'F'
ALTER TABLE users ADD COLUMN IF NOT EXISTS type_compte TEXT DEFAULT 'employe'; -- 'employe', 'client', 'both'
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_login BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP; -- Soft delete

-- Rendre username et password nullable (pour clients sans accès portail)
ALTER TABLE users ALTER COLUMN username DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password DROP NOT NULL;

-- Mettre à jour type_compte pour les utilisateurs existants
UPDATE users SET type_compte = 'employe' WHERE type_compte IS NULL;
UPDATE users SET can_login = true WHERE can_login IS NULL;

-- ============================================
-- PHASE 2: CRÉER LA TABLE EMPLOYES
-- ============================================

CREATE TABLE IF NOT EXISTS employes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

  -- Identité RH
  matricule VARCHAR(50) UNIQUE,
  poste VARCHAR(100),
  departement VARCHAR(100),
  date_embauche DATE,
  type_contrat VARCHAR(20) DEFAULT 'CDI', -- 'CDI', 'CDD', 'Stage', 'Intérim'

  -- Organisation
  agence_id UUID REFERENCES agences(id),
  manager_id UUID, -- Self-reference vers employes.id (géré au niveau app)
  role_system TEXT NOT NULL DEFAULT 'agent', -- 'admin', 'chef_agence', 'comptable', 'caissier', 'agent', 'terrain', 'credit'

  -- Rémunération
  salaire_base INTEGER DEFAULT 0,
  taux_horaire INTEGER DEFAULT 0,
  taux_journalier INTEGER DEFAULT 0,
  mode_calcul_paie VARCHAR(20) DEFAULT 'Mensuel', -- 'Mensuel', 'Horaire', 'Journalier'

  -- Sécurité Caisse
  caisse_pin TEXT, -- PIN hashé pour autorisation caisse

  -- Métadonnées
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index pour optimiser les jointures
CREATE INDEX IF NOT EXISTS idx_employes_user_id ON employes(user_id);
CREATE INDEX IF NOT EXISTS idx_employes_agence_id ON employes(agence_id);
CREATE INDEX IF NOT EXISTS idx_employes_role_system ON employes(role_system);
CREATE INDEX IF NOT EXISTS idx_employes_matricule ON employes(matricule);

-- ============================================
-- PHASE 3: MIGRER LES DONNÉES VERS EMPLOYES
-- ============================================

-- Créer un enregistrement employes pour chaque user existant (qui n'en a pas déjà)
INSERT INTO employes (user_id, matricule, poste, departement, date_embauche, type_contrat, role_system, salaire_base, taux_horaire, taux_journalier, mode_calcul_paie, caisse_pin)
SELECT
  u.id,
  u.matricule,
  u.poste,
  u.departement,
  u.date_embauche,
  COALESCE(u.type_contrat, 'CDI'),
  COALESCE(u.role, 'agent'),
  COALESCE(u.salaire_base, 0),
  COALESCE(u.taux_horaire, 0),
  COALESCE(u.taux_journalier, 0),
  COALESCE(u.mode_calcul_paie, 'Mensuel'),
  u.caisse_pin
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM employes e WHERE e.user_id = u.id);

-- Lier employes.agence_id via user_agences
UPDATE employes e
SET agence_id = ua.agence_id
FROM user_agences ua
WHERE e.user_id = ua.user_id
  AND ua.is_primary = true
  AND e.agence_id IS NULL;

-- ============================================
-- PHASE 4: MODIFIER LA TABLE CLIENTS
-- ============================================

-- Ajouter la référence vers users
ALTER TABLE clients ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Ajouter la référence vers l'agent référent (via employes)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS agent_referent_id UUID REFERENCES employes(id);

-- Ajouter date_adhesion si pas présent
ALTER TABLE clients ADD COLUMN IF NOT EXISTS date_adhesion TIMESTAMP DEFAULT NOW();

-- Rendre les champs legacy nullable (ils étaient NOT NULL avant)
ALTER TABLE clients ALTER COLUMN nom DROP NOT NULL;

-- Index pour optimiser les jointures
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_agent_referent_id ON clients(agent_referent_id);

-- ============================================
-- PHASE 5: MODIFIER LA TABLE AGENTS_TERRAIN
-- ============================================

-- Ajouter la référence vers employes
ALTER TABLE agents_terrain ADD COLUMN IF NOT EXISTS employe_id UUID REFERENCES employes(id) ON DELETE CASCADE;

-- Rendre les champs legacy nullable
ALTER TABLE agents_terrain ALTER COLUMN nom DROP NOT NULL;
ALTER TABLE agents_terrain ALTER COLUMN prenom DROP NOT NULL;
ALTER TABLE agents_terrain ALTER COLUMN telephone DROP NOT NULL;
ALTER TABLE agents_terrain ALTER COLUMN zone_affectation DROP NOT NULL;

-- Index pour optimiser les jointures
CREATE INDEX IF NOT EXISTS idx_agents_terrain_employe_id ON agents_terrain(employe_id);

-- ============================================
-- PHASE 6: MIGRATION DES AGENTS_TERRAIN
-- ============================================

-- Pour chaque agent_terrain existant, créer un user + employe s'ils n'existent pas
-- Cette migration est complexe et doit être faite via un script applicatif
-- car elle nécessite de vérifier les doublons par téléphone/email

-- Créer users pour agents_terrain sans correspondance
INSERT INTO users (nom, prenom, email, telephone, type_compte, can_login, statut)
SELECT
  at.nom,
  at.prenom,
  at.email,
  at.telephone,
  'employe',
  true,
  CASE WHEN at.statut = 'Actif' THEN 'Actif' ELSE 'Inactif' END
FROM agents_terrain at
WHERE at.employe_id IS NULL
  AND at.telephone IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.telephone = at.telephone
    OR (u.email = at.email AND at.email IS NOT NULL)
  )
ON CONFLICT DO NOTHING;

-- Créer employes pour les nouveaux users créés ci-dessus
INSERT INTO employes (user_id, role_system)
SELECT u.id, 'terrain'
FROM users u
WHERE u.type_compte = 'employe'
  AND NOT EXISTS (SELECT 1 FROM employes e WHERE e.user_id = u.id);

-- Lier agents_terrain aux employes via téléphone
UPDATE agents_terrain at
SET employe_id = e.id
FROM employes e
JOIN users u ON e.user_id = u.id
WHERE at.employe_id IS NULL
  AND at.telephone IS NOT NULL
  AND u.telephone = at.telephone;

-- ============================================
-- SUMMARY
-- ============================================
-- Tables créées:
--   - employes (nouvelle table pour données RH)
--
-- Tables modifiées:
--   - users (ajout: sexe, type_compte, can_login, updated_at, deleted_at)
--   - clients (ajout: user_id, agent_referent_id, date_adhesion)
--   - agents_terrain (ajout: employe_id, champs rendus nullable)
--
-- Architecture finale:
--   users (source de vérité identité)
--     ↓
--   employes (données RH, lié 1:1 à users)
--     ↓
--   agents_terrain (données terrain, lié à employes)
--
--   users (source de vérité identité)
--     ↓
--   clients (données métier client, lié optionnellement à users)
--
-- Note: Les champs LEGACY dans users sont conservés temporairement
-- pour la rétro-compatibilité. Ils seront supprimés dans une migration future.
