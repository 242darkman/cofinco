-- Migration: 0024_caisse_access_control.sql
-- Description: Ajout du contrôle d'accès horaire pour les caisses et suivi des autorisations utilisateur
-- Fonctionnalités:
--   1. Horaires d'ouverture configurables par caisse
--   2. Table d'autorisation pour suivre les utilisateurs ayant validé un code d'accès
--   3. Codes d'accès d'urgence avec durée de validité

-- ============================================================================
-- 1. AJOUT DES CHAMPS D'HORAIRES D'OUVERTURE DANS caisses
-- ============================================================================

-- Activer/Désactiver le contrôle d'horaires pour cette caisse
ALTER TABLE caisses
ADD COLUMN IF NOT EXISTS operating_hours_enabled BOOLEAN DEFAULT FALSE;

-- Heure d'ouverture (format HH:MM, ex: "08:00")
ALTER TABLE caisses
ADD COLUMN IF NOT EXISTS operating_hours_start TEXT DEFAULT '08:00';

-- Heure de fermeture (format HH:MM, ex: "17:00")
ALTER TABLE caisses
ADD COLUMN IF NOT EXISTS operating_hours_end TEXT DEFAULT '17:00';

-- Jours d'ouverture (tableau JSON, 0=Dimanche, 1=Lundi, ..., 6=Samedi)
-- Par défaut: Lundi à Vendredi [1,2,3,4,5]
ALTER TABLE caisses
ADD COLUMN IF NOT EXISTS operating_days JSONB DEFAULT '[1, 2, 3, 4, 5]';

-- ============================================================================
-- 2. TABLE DES AUTORISATIONS UTILISATEUR (tracking des codes validés)
-- ============================================================================

-- Cette table stocke les autorisations temporaires accordées aux utilisateurs
-- lorsqu'ils valident un code de sécurité pour accéder à la caisse hors horaires
CREATE TABLE IF NOT EXISTS caisse_user_authorizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Utilisateur autorisé
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Caisse concernée (NULL = autorisation globale pour l'agence)
    caisse_id UUID REFERENCES caisses(id) ON DELETE CASCADE,

    -- Agence (pour filtrage rapide)
    agence_id UUID REFERENCES agences(id) ON DELETE CASCADE,

    -- Code utilisé pour obtenir l'autorisation (pour audit)
    code_id UUID REFERENCES caisse_security_codes(id) ON DELETE SET NULL,

    -- Raison de l'accès (urgence, maintenance, etc.)
    reason TEXT,

    -- Période de validité
    granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,

    -- Révoqué manuellement?
    revoked_at TIMESTAMP,
    revoked_by UUID REFERENCES users(id) ON DELETE SET NULL,
    revoke_reason TEXT,

    -- Métadonnées de connexion
    ip_address TEXT,
    user_agent TEXT,

    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- 3. AMÉLIORATION DE LA TABLE caisse_security_codes
-- ============================================================================

-- Ajout de champs manquants pour une meilleure gestion des codes
ALTER TABLE caisse_security_codes
ADD COLUMN IF NOT EXISTS caisse_id UUID REFERENCES caisses(id) ON DELETE CASCADE;

ALTER TABLE caisse_security_codes
ADD COLUMN IF NOT EXISTS agence_id UUID REFERENCES agences(id) ON DELETE CASCADE;

-- Type de code: EMERGENCY (accès hors horaires), DAILY (code journalier), PERMANENT (pour admins)
ALTER TABLE caisse_security_codes
ADD COLUMN IF NOT EXISTS code_type TEXT DEFAULT 'EMERGENCY';

-- Nombre maximal d'utilisations (NULL = illimité)
ALTER TABLE caisse_security_codes
ADD COLUMN IF NOT EXISTS max_usages INTEGER;

-- Compteur d'utilisations
ALTER TABLE caisse_security_codes
ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0;

-- Durée de l'autorisation accordée lors de la validation (en heures)
-- Par défaut: 4 heures d'accès après validation du code
ALTER TABLE caisse_security_codes
ADD COLUMN IF NOT EXISTS authorization_duration_hours INTEGER DEFAULT 4;

-- Créé par quel utilisateur
ALTER TABLE caisse_security_codes
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Description/motif du code
ALTER TABLE caisse_security_codes
ADD COLUMN IF NOT EXISTS description TEXT;

-- ============================================================================
-- 4. AMÉLIORATION DE LA TABLE caisse_code_usages
-- ============================================================================

-- Ajout de l'utilisateur qui a utilisé le code
ALTER TABLE caisse_code_usages
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Ajout de l'autorisation générée
ALTER TABLE caisse_code_usages
ADD COLUMN IF NOT EXISTS authorization_id UUID REFERENCES caisse_user_authorizations(id) ON DELETE SET NULL;

-- IP et User-Agent
ALTER TABLE caisse_code_usages
ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE caisse_code_usages
ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- Raison de l'échec (si success = false)
ALTER TABLE caisse_code_usages
ADD COLUMN IF NOT EXISTS failure_reason TEXT;

-- ============================================================================
-- 5. INDEX POUR PERFORMANCE
-- ============================================================================

-- Index sur les autorisations actives par utilisateur
CREATE INDEX IF NOT EXISTS idx_caisse_user_auth_user_active
ON caisse_user_authorizations(user_id, expires_at)
WHERE revoked_at IS NULL;

-- Index sur les autorisations par caisse
CREATE INDEX IF NOT EXISTS idx_caisse_user_auth_caisse
ON caisse_user_authorizations(caisse_id, expires_at)
WHERE revoked_at IS NULL;

-- Index sur les codes actifs par agence
CREATE INDEX IF NOT EXISTS idx_caisse_codes_agence_active
ON caisse_security_codes(agence_id, active)
WHERE active = TRUE;

-- Index sur les codes actifs par caisse
CREATE INDEX IF NOT EXISTS idx_caisse_codes_caisse_active
ON caisse_security_codes(caisse_id, active)
WHERE active = TRUE;

-- Index sur les usages par code
CREATE INDEX IF NOT EXISTS idx_caisse_code_usages_code
ON caisse_code_usages(code_id, used_at);

-- Index sur les usages par utilisateur
CREATE INDEX IF NOT EXISTS idx_caisse_code_usages_user
ON caisse_code_usages(user_id, used_at);

-- ============================================================================
-- 6. COMMENTAIRES POUR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE caisse_user_authorizations IS
'Autorisations temporaires accordées aux utilisateurs pour accéder à la caisse hors des horaires normaux. Créées lors de la validation d''un code de sécurité.';

COMMENT ON COLUMN caisses.operating_hours_enabled IS
'Active ou désactive le contrôle d''horaires pour cette caisse. Si FALSE, la caisse est accessible à tout moment.';

COMMENT ON COLUMN caisses.operating_hours_start IS
'Heure d''ouverture au format HH:MM (ex: 08:00). Les utilisateurs sans autorisation ne peuvent accéder qu''entre start et end.';

COMMENT ON COLUMN caisses.operating_hours_end IS
'Heure de fermeture au format HH:MM (ex: 17:00).';

COMMENT ON COLUMN caisses.operating_days IS
'Jours d''ouverture en tableau JSON. 0=Dimanche, 1=Lundi, ..., 6=Samedi. Par défaut [1,2,3,4,5] = Lun-Ven.';

COMMENT ON COLUMN caisse_security_codes.code_type IS
'Type de code: EMERGENCY (accès hors horaires), DAILY (code journalier renouvelé), PERMANENT (pour admins).';

COMMENT ON COLUMN caisse_security_codes.authorization_duration_hours IS
'Durée en heures de l''autorisation accordée lors de la validation du code. Par défaut 4h.';
