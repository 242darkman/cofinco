-- ============================================================================
-- MIGRATION 0031: TONTINE MODULE - PRODUCTION READY
-- ============================================================================
-- Cette migration renforce le module tontine pour le rendre production-ready:
-- 1. Ajout des cycles formels (tontine_cycles)
-- 2. Ajout des tours avec verrouillage (tontine_turns)
-- 3. Ajout des échéances planifiées (tontine_schedules)
-- 4. Ajout des règles structurées (tontine_rulesets)
-- 5. Ajout de l'audit des modifications de tours (tontine_turn_audit)
-- 6. Ajout des demandes de distribution (tontine_distribution_requests)
-- 7. Extension de la table contributions_tontine
-- 8. Règles comptables OHADA pour tontines
-- ============================================================================

-- ============================================================================
-- 1. TONTINE_CYCLES - Cycles formels d'une tontine
-- ============================================================================
CREATE TABLE IF NOT EXISTS tontine_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agence_id UUID NOT NULL REFERENCES agences(id),
    tontine_id UUID NOT NULL REFERENCES tontines(id) ON DELETE CASCADE,

    cycle_number INTEGER NOT NULL DEFAULT 1,
    start_date DATE NOT NULL,
    end_date DATE,

    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('DRAFT', 'OPEN', 'PAUSED', 'CLOSED')),

    -- Denormalized totals (recalculable but cached for performance)
    pot_collected NUMERIC(15,2) NOT NULL DEFAULT 0,
    pot_distributed NUMERIC(15,2) NOT NULL DEFAULT 0,
    members_count INTEGER NOT NULL DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    closed_at TIMESTAMP,
    closed_by UUID REFERENCES users(id),

    UNIQUE(tontine_id, cycle_number)
);

CREATE INDEX IF NOT EXISTS idx_tontine_cycles_tontine ON tontine_cycles(tontine_id);
CREATE INDEX IF NOT EXISTS idx_tontine_cycles_status ON tontine_cycles(status);
CREATE INDEX IF NOT EXISTS idx_tontine_cycles_agence ON tontine_cycles(agence_id);

COMMENT ON TABLE tontine_cycles IS 'Cycles formels d''une tontine (chaque cycle = 1 rotation complète de tous les membres)';

-- ============================================================================
-- 2. TONTINE_TURNS - Tours de bénéficiaires avec verrouillage
-- ============================================================================
CREATE TABLE IF NOT EXISTS tontine_turns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agence_id UUID NOT NULL REFERENCES agences(id),
    tontine_id UUID NOT NULL REFERENCES tontines(id) ON DELETE CASCADE,
    cycle_id UUID NOT NULL REFERENCES tontine_cycles(id) ON DELETE CASCADE,

    turn_number INTEGER NOT NULL,
    beneficiary_member_id UUID REFERENCES membres_tontine(id),

    due_date DATE NOT NULL,

    status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN (
        'SCHEDULED',      -- Planifié, pas encore arrivé
        'READY',          -- Date atteinte, en attente de distribution
        'PARTIAL_PAID',   -- Distribution partielle effectuée
        'PAID_OUT',       -- Distribution complète effectuée
        'SKIPPED'         -- Tour sauté (membre exclu, etc.)
    )),

    -- Montants
    amount_expected NUMERIC(15,2) NOT NULL DEFAULT 0,  -- Cotisation * nb_membres
    amount_paid_out NUMERIC(15,2) NOT NULL DEFAULT 0,  -- Montant réellement distribué

    -- Verrouillage - Une fois locked, l'ordre ne peut plus changer
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    locked_at TIMESTAMP,
    locked_reason TEXT,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(tontine_id, cycle_id, turn_number)
);

CREATE INDEX IF NOT EXISTS idx_tontine_turns_tontine ON tontine_turns(tontine_id);
CREATE INDEX IF NOT EXISTS idx_tontine_turns_cycle ON tontine_turns(cycle_id);
CREATE INDEX IF NOT EXISTS idx_tontine_turns_beneficiary ON tontine_turns(beneficiary_member_id);
CREATE INDEX IF NOT EXISTS idx_tontine_turns_status ON tontine_turns(status);
CREATE INDEX IF NOT EXISTS idx_tontine_turns_due_date ON tontine_turns(due_date);

COMMENT ON TABLE tontine_turns IS 'Tours de distribution avec bénéficiaire, date prévue, verrouillage';

-- ============================================================================
-- 3. TONTINE_SCHEDULES - Échéances de cotisation planifiées
-- ============================================================================
CREATE TABLE IF NOT EXISTS tontine_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agence_id UUID NOT NULL REFERENCES agences(id),
    tontine_id UUID NOT NULL REFERENCES tontines(id) ON DELETE CASCADE,
    cycle_id UUID NOT NULL REFERENCES tontine_cycles(id) ON DELETE CASCADE,

    period_number INTEGER NOT NULL,  -- 1, 2, 3...
    due_date DATE NOT NULL,

    amount_expected_per_member NUMERIC(15,2) NOT NULL,

    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('UPCOMING', 'OPEN', 'CLOSED', 'CANCELLED')),

    -- Denormalized totals
    total_collected NUMERIC(15,2) NOT NULL DEFAULT 0,
    members_paid_count INTEGER NOT NULL DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    closed_at TIMESTAMP,

    UNIQUE(tontine_id, cycle_id, period_number)
);

CREATE INDEX IF NOT EXISTS idx_tontine_schedules_tontine ON tontine_schedules(tontine_id);
CREATE INDEX IF NOT EXISTS idx_tontine_schedules_cycle ON tontine_schedules(cycle_id);
CREATE INDEX IF NOT EXISTS idx_tontine_schedules_due_date ON tontine_schedules(due_date);
CREATE INDEX IF NOT EXISTS idx_tontine_schedules_status ON tontine_schedules(status);

COMMENT ON TABLE tontine_schedules IS 'Échéances de cotisation planifiées pour chaque période';

-- ============================================================================
-- 4. TONTINE_RULESETS - Règles structurées (JSON)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tontine_rulesets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agence_id UUID REFERENCES agences(id),

    name TEXT NOT NULL,
    description TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,

    -- Règles structurées en JSON
    rules JSONB NOT NULL DEFAULT '{}'::jsonb,
    /*
    Structure attendue:
    {
      "grace_days": 2,                          // Jours de grâce avant pénalité
      "late_fee_amount": 500,                   // Montant fixe pénalité retard
      "late_fee_percent": null,                 // OU pourcentage de la cotisation
      "max_late_count_before_suspend": 3,       // Retards avant suspension
      "max_late_count_before_exclude": 5,       // Retards avant exclusion
      "allow_partial_distribution": true,       // Autoriser distribution partielle
      "distribution_min_threshold_percent": 50, // % min du pot pour distribuer
      "withdrawal_fee_amount": 0,               // Frais fixes de retrait
      "withdrawal_fee_percent": 0,              // Frais % de retrait
      "allow_reorder_turns_until": "BEFORE_CYCLE_START", // BEFORE_CYCLE_START|BEFORE_TURN_DUE|NEVER
      "penalty_deducted_from_payout": true,     // Pénalités déduites du gain
      "penalty_as_revenue": false,              // Pénalités = produit comptable (sinon reste dans pot)
      "auto_pay_penalty_priority": true,        // Priorité pénalités sur cotisations
      "min_members_to_start": 3,                // Nb membres min pour démarrer
      "max_advance_tours": 3                    // Max tours payables d'avance
    }
    */

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_tontine_rulesets_active ON tontine_rulesets(is_active);
CREATE INDEX IF NOT EXISTS idx_tontine_rulesets_agence ON tontine_rulesets(agence_id);

-- Ruleset par défaut
INSERT INTO tontine_rulesets (id, name, description, is_default, rules)
VALUES (
    gen_random_uuid(),
    'Règles Standard Congo',
    'Règles par défaut pour les tontines au Congo Brazzaville',
    TRUE,
    '{
      "grace_days": 2,
      "late_fee_amount": 500,
      "late_fee_percent": null,
      "max_late_count_before_suspend": 3,
      "max_late_count_before_exclude": 5,
      "allow_partial_distribution": true,
      "distribution_min_threshold_percent": 50,
      "withdrawal_fee_amount": 0,
      "withdrawal_fee_percent": 0,
      "allow_reorder_turns_until": "BEFORE_TURN_DUE",
      "penalty_deducted_from_payout": true,
      "penalty_as_revenue": false,
      "auto_pay_penalty_priority": true,
      "min_members_to_start": 3,
      "max_advance_tours": 3
    }'::jsonb
) ON CONFLICT DO NOTHING;

COMMENT ON TABLE tontine_rulesets IS 'Jeux de règles réutilisables pour les tontines';

-- ============================================================================
-- 5. TONTINE_TURN_AUDIT - Historique des modifications de tours
-- ============================================================================
CREATE TABLE IF NOT EXISTS tontine_turn_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agence_id UUID NOT NULL REFERENCES agences(id),
    tontine_id UUID NOT NULL REFERENCES tontines(id) ON DELETE CASCADE,
    cycle_id UUID NOT NULL REFERENCES tontine_cycles(id) ON DELETE CASCADE,

    action_type TEXT NOT NULL CHECK (action_type IN (
        'INITIAL_GENERATION',  -- Génération initiale des tours
        'REORDER',             -- Réorganisation manuelle
        'SWAP',                -- Échange de position entre 2 membres
        'SKIP',                -- Tour sauté
        'BENEFICIARY_CHANGE'   -- Changement de bénéficiaire
    )),

    -- État avant/après (pour reorder)
    old_order JSONB,  -- [{turn_number: 1, member_id: "xxx"}, ...]
    new_order JSONB,

    -- Détails spécifiques
    affected_turn_ids UUID[],
    affected_member_ids UUID[],

    reason TEXT NOT NULL,

    changed_by UUID NOT NULL REFERENCES users(id),
    changed_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Metadata (seed pour random, etc.)
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_tontine_turn_audit_tontine ON tontine_turn_audit(tontine_id);
CREATE INDEX IF NOT EXISTS idx_tontine_turn_audit_cycle ON tontine_turn_audit(cycle_id);
CREATE INDEX IF NOT EXISTS idx_tontine_turn_audit_date ON tontine_turn_audit(changed_at);

COMMENT ON TABLE tontine_turn_audit IS 'Audit trail des modifications de l''ordre des tours';

-- ============================================================================
-- 6. TONTINE_DISTRIBUTION_REQUESTS - Demandes de distribution formelles
-- ============================================================================
CREATE TABLE IF NOT EXISTS tontine_distribution_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agence_id UUID NOT NULL REFERENCES agences(id),
    tontine_id UUID NOT NULL REFERENCES tontines(id) ON DELETE CASCADE,
    cycle_id UUID NOT NULL REFERENCES tontine_cycles(id) ON DELETE CASCADE,
    turn_id UUID NOT NULL REFERENCES tontine_turns(id),
    beneficiary_member_id UUID NOT NULL REFERENCES membres_tontine(id),

    -- Montants
    amount_requested NUMERIC(15,2) NOT NULL,
    amount_approved NUMERIC(15,2),
    amount_paid NUMERIC(15,2) NOT NULL DEFAULT 0,

    -- Déductions
    penalties_deducted NUMERIC(15,2) NOT NULL DEFAULT 0,
    fees_deducted NUMERIC(15,2) NOT NULL DEFAULT 0,
    net_amount NUMERIC(15,2),  -- amount_approved - penalties - fees

    -- Mode de paiement
    payout_method TEXT NOT NULL CHECK (payout_method IN ('CASH', 'MOBILE_MONEY', 'WALLET')),
    provider TEXT CHECK (provider IN ('MTN', 'AIRTEL')),  -- Si MOBILE_MONEY
    target_msisdn TEXT,  -- Si MOBILE_MONEY
    target_wallet_account_id UUID REFERENCES comptes(id),  -- Si WALLET

    -- Statut
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
        'DRAFT',            -- Brouillon
        'SUBMITTED',        -- Soumis pour approbation
        'APPROVED',         -- Approuvé, en attente de paiement
        'PENDING_PROVIDER', -- Envoyé au provider MM, en attente
        'SUCCESS',          -- Paiement réussi
        'PARTIAL',          -- Paiement partiel (pot insuffisant)
        'FAILED',           -- Échec du paiement
        'CANCELLED'         -- Annulé
    )),

    -- Références externes
    payment_intent_id UUID REFERENCES payment_intents(id),
    mouvement_id UUID REFERENCES mouvements_financiers(id),
    reference_externe TEXT,

    -- Idempotency
    idempotency_key TEXT UNIQUE,

    -- Workflow
    created_by UUID NOT NULL REFERENCES users(id),
    submitted_at TIMESTAMP,
    submitted_by UUID REFERENCES users(id),
    approved_at TIMESTAMP,
    approved_by UUID REFERENCES users(id),
    paid_at TIMESTAMP,

    -- Notes
    notes TEXT,
    rejection_reason TEXT,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tontine_dist_req_tontine ON tontine_distribution_requests(tontine_id);
CREATE INDEX IF NOT EXISTS idx_tontine_dist_req_cycle ON tontine_distribution_requests(cycle_id);
CREATE INDEX IF NOT EXISTS idx_tontine_dist_req_turn ON tontine_distribution_requests(turn_id);
CREATE INDEX IF NOT EXISTS idx_tontine_dist_req_beneficiary ON tontine_distribution_requests(beneficiary_member_id);
CREATE INDEX IF NOT EXISTS idx_tontine_dist_req_status ON tontine_distribution_requests(status);
CREATE INDEX IF NOT EXISTS idx_tontine_dist_req_payment_intent ON tontine_distribution_requests(payment_intent_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tontine_dist_req_idempotency ON tontine_distribution_requests(idempotency_key) WHERE idempotency_key IS NOT NULL;

COMMENT ON TABLE tontine_distribution_requests IS 'Demandes formelles de distribution avec workflow d''approbation';

-- ============================================================================
-- 7. EXTENSIONS TABLE contributions_tontine
-- ============================================================================

-- Ajouter colonnes si elles n'existent pas
DO $$
BEGIN
    -- Lien vers cycle
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contributions_tontine' AND column_name = 'cycle_id') THEN
        ALTER TABLE contributions_tontine ADD COLUMN cycle_id UUID REFERENCES tontine_cycles(id);
    END IF;

    -- Lien vers schedule
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contributions_tontine' AND column_name = 'schedule_id') THEN
        ALTER TABLE contributions_tontine ADD COLUMN schedule_id UUID REFERENCES tontine_schedules(id);
    END IF;

    -- Lien vers payment_intent
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contributions_tontine' AND column_name = 'payment_intent_id') THEN
        ALTER TABLE contributions_tontine ADD COLUMN payment_intent_id UUID REFERENCES payment_intents(id);
    END IF;

    -- Provider (MTN, AIRTEL)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contributions_tontine' AND column_name = 'provider') THEN
        ALTER TABLE contributions_tontine ADD COLUMN provider TEXT;
    END IF;

    -- Phone number pour MM
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contributions_tontine' AND column_name = 'phone') THEN
        ALTER TABLE contributions_tontine ADD COLUMN phone TEXT;
    END IF;

    -- Reçu par (agent/caissier)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contributions_tontine' AND column_name = 'received_by') THEN
        ALTER TABLE contributions_tontine ADD COLUMN received_by UUID REFERENCES users(id);
    END IF;

    -- Date de réception
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contributions_tontine' AND column_name = 'received_at') THEN
        ALTER TABLE contributions_tontine ADD COLUMN received_at TIMESTAMP;
    END IF;

    -- Membre (FK vers membres_tontine au lieu de client direct)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contributions_tontine' AND column_name = 'membre_id') THEN
        ALTER TABLE contributions_tontine ADD COLUMN membre_id UUID REFERENCES membres_tontine(id);
    END IF;

    -- Agence
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contributions_tontine' AND column_name = 'agence_id') THEN
        ALTER TABLE contributions_tontine ADD COLUMN agence_id UUID REFERENCES agences(id);
    END IF;
END $$;

-- Index additionnels
CREATE INDEX IF NOT EXISTS idx_contributions_tontine_cycle ON contributions_tontine(cycle_id);
CREATE INDEX IF NOT EXISTS idx_contributions_tontine_schedule ON contributions_tontine(schedule_id);
CREATE INDEX IF NOT EXISTS idx_contributions_tontine_payment_intent ON contributions_tontine(payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_contributions_tontine_membre ON contributions_tontine(membre_id);

-- ============================================================================
-- 8. EXTENSIONS TABLE membres_tontine
-- ============================================================================

DO $$
BEGIN
    -- Lien vers ruleset personnel (override)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membres_tontine' AND column_name = 'ruleset_id') THEN
        ALTER TABLE membres_tontine ADD COLUMN ruleset_id UUID REFERENCES tontine_rulesets(id);
    END IF;

    -- Compteur de retards
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membres_tontine' AND column_name = 'late_count') THEN
        ALTER TABLE membres_tontine ADD COLUMN late_count INTEGER NOT NULL DEFAULT 0;
    END IF;

    -- Compteur d'absences
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membres_tontine' AND column_name = 'absence_count') THEN
        ALTER TABLE membres_tontine ADD COLUMN absence_count INTEGER NOT NULL DEFAULT 0;
    END IF;

    -- MSISDN pour paiement auto MM
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membres_tontine' AND column_name = 'msisdn') THEN
        ALTER TABLE membres_tontine ADD COLUMN msisdn TEXT;
    END IF;

    -- Provider préféré pour auto-pay
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membres_tontine' AND column_name = 'preferred_provider') THEN
        ALTER TABLE membres_tontine ADD COLUMN preferred_provider TEXT CHECK (preferred_provider IN ('MTN', 'AIRTEL'));
    END IF;

    -- Mode de réception préféré pour distribution
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membres_tontine' AND column_name = 'preferred_payout_method') THEN
        ALTER TABLE membres_tontine ADD COLUMN preferred_payout_method TEXT DEFAULT 'CASH' CHECK (preferred_payout_method IN ('CASH', 'MOBILE_MONEY', 'WALLET'));
    END IF;
END $$;

-- ============================================================================
-- 9. EXTENSIONS TABLE tontines (lien vers ruleset)
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tontines' AND column_name = 'ruleset_id') THEN
        ALTER TABLE tontines ADD COLUMN ruleset_id UUID REFERENCES tontine_rulesets(id);
    END IF;

    -- Mode de distribution par défaut
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tontines' AND column_name = 'default_payout_method') THEN
        ALTER TABLE tontines ADD COLUMN default_payout_method TEXT DEFAULT 'CASH' CHECK (default_payout_method IN ('CASH', 'MOBILE_MONEY', 'WALLET'));
    END IF;

    -- Cycle actuel
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tontines' AND column_name = 'current_cycle_id') THEN
        ALTER TABLE tontines ADD COLUMN current_cycle_id UUID REFERENCES tontine_cycles(id);
    END IF;
END $$;

-- ============================================================================
-- 10. EXTENSIONS TABLE tontine_penalites
-- ============================================================================

DO $$
BEGIN
    -- Lien vers cycle
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tontine_penalites' AND column_name = 'cycle_id') THEN
        ALTER TABLE tontine_penalites ADD COLUMN cycle_id UUID REFERENCES tontine_cycles(id);
    END IF;

    -- Lien vers schedule
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tontine_penalites' AND column_name = 'schedule_id') THEN
        ALTER TABLE tontine_penalites ADD COLUMN schedule_id UUID REFERENCES tontine_schedules(id);
    END IF;

    -- Type de pénalité étendu
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tontine_penalites' AND column_name = 'penalty_type') THEN
        ALTER TABLE tontine_penalites ADD COLUMN penalty_type TEXT DEFAULT 'LATE' CHECK (penalty_type IN ('LATE', 'ABSENCE', 'WITHDRAWAL_FEE', 'CUSTOM'));
    END IF;

    -- Statut étendu
    -- Le statut existant doit être compatible

    -- Application automatique
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tontine_penalites' AND column_name = 'auto_applied') THEN
        ALTER TABLE tontine_penalites ADD COLUMN auto_applied BOOLEAN DEFAULT FALSE;
    END IF;

    -- Waived (annulé)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tontine_penalites' AND column_name = 'waived_at') THEN
        ALTER TABLE tontine_penalites ADD COLUMN waived_at TIMESTAMP;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tontine_penalites' AND column_name = 'waived_by') THEN
        ALTER TABLE tontine_penalites ADD COLUMN waived_by UUID REFERENCES users(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tontine_penalites' AND column_name = 'waive_reason') THEN
        ALTER TABLE tontine_penalites ADD COLUMN waive_reason TEXT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tontine_penalites_cycle ON tontine_penalites(cycle_id);
CREATE INDEX IF NOT EXISTS idx_tontine_penalites_schedule ON tontine_penalites(schedule_id);

-- ============================================================================
-- 11. RÈGLES COMPTABLES OHADA POUR TONTINES
-- ============================================================================

-- Ajouter les règles comptables pour les tontines
INSERT INTO accounting_rules (code, name, description, source_type, event_type, payment_method, provider, journal_code, debit_account, credit_account, description_template, priority)
VALUES
    -- === CONTRIBUTIONS TONTINE ===
    -- Cash
    ('TONTINE_CONTRIB_CASH', 'Contribution tontine cash', 'Cotisation tontine encaissée en espèces', 'TONTINE', 'CONTRIBUTION', 'CASH', NULL, 'CAI', '571', '4112', 'Cotisation tontine #{tontineName} - {memberName}', 10),

    -- Mobile Money MTN
    ('TONTINE_CONTRIB_MTN', 'Contribution tontine MTN', 'Cotisation tontine via MTN Mobile Money', 'TONTINE', 'CONTRIBUTION', 'MOBILE_MONEY', 'MTN', 'MMTN', '5781', '4112', 'Cotisation tontine #{tontineName} MM MTN - {memberName}', 10),

    -- Mobile Money Airtel
    ('TONTINE_CONTRIB_AIRTEL', 'Contribution tontine Airtel', 'Cotisation tontine via Airtel Money', 'TONTINE', 'CONTRIBUTION', 'MOBILE_MONEY', 'AIRTEL', 'MAIR', '5782', '4112', 'Cotisation tontine #{tontineName} MM Airtel - {memberName}', 10),

    -- === DISTRIBUTIONS TONTINE ===
    -- Cash
    ('TONTINE_PAYOUT_CASH', 'Distribution tontine cash', 'Versement gain tontine en espèces', 'TONTINE', 'DISTRIBUTION', 'CASH', NULL, 'CAI', '4112', '571', 'Distribution tontine #{tontineName} cash - {memberName}', 10),

    -- Mobile Money MTN
    ('TONTINE_PAYOUT_MTN', 'Distribution tontine MTN', 'Versement gain tontine via MTN', 'TONTINE', 'DISTRIBUTION', 'MOBILE_MONEY', 'MTN', 'MMTN', '4112', '5781', 'Distribution tontine #{tontineName} MM MTN - {memberName}', 10),

    -- Mobile Money Airtel
    ('TONTINE_PAYOUT_AIRTEL', 'Distribution tontine Airtel', 'Versement gain tontine via Airtel', 'TONTINE', 'DISTRIBUTION', 'MOBILE_MONEY', 'AIRTEL', 'MAIR', '4112', '5782', 'Distribution tontine #{tontineName} MM Airtel - {memberName}', 10),

    -- Wallet (virement interne vers compte courant)
    ('TONTINE_PAYOUT_WALLET', 'Distribution tontine wallet', 'Virement gain tontine vers compte client', 'TONTINE', 'DISTRIBUTION', 'WALLET', NULL, 'VRT', '4112', '4111', 'Distribution tontine #{tontineName} vers compte - {memberName}', 10),

    -- === PÉNALITÉS TONTINE (si revenue comptable) ===
    ('TONTINE_PENALTY_CASH', 'Pénalité tontine cash', 'Encaissement pénalité tontine en espèces', 'TONTINE', 'PENALTY', 'CASH', NULL, 'CAI', '571', '7078', 'Pénalité tontine #{tontineName} - {memberName}', 10),

    ('TONTINE_PENALTY_MM', 'Pénalité tontine MM', 'Encaissement pénalité tontine via Mobile Money', 'TONTINE', 'PENALTY', 'MOBILE_MONEY', NULL, 'OD', '578', '7078', 'Pénalité tontine #{tontineName} MM - {memberName}', 10)

ON CONFLICT (code) DO UPDATE SET
    description = EXCLUDED.description,
    debit_account = EXCLUDED.debit_account,
    credit_account = EXCLUDED.credit_account,
    description_template = EXCLUDED.description_template;

-- ============================================================================
-- 12. COMPTES OHADA SPÉCIFIQUES TONTINE (si manquants)
-- ============================================================================

INSERT INTO plan_comptable (numero_compte, intitule, classe, type_compte, sens_normal, niveau, actif)
VALUES
    ('4112', 'Fonds tontines clients', 4, 'Passif', 'Crédit', 3, true),
    ('7078', 'Produits pénalités tontines', 7, 'Produit', 'Crédit', 3, true)
ON CONFLICT (numero_compte) DO NOTHING;

-- ============================================================================
-- 13. VIEW: TONTINE DASHBOARD STATS
-- ============================================================================

CREATE OR REPLACE VIEW v_tontine_dashboard AS
SELECT
    t.id AS tontine_id,
    t.agence_id,
    t.nom AS tontine_name,
    t.statut,
    t.montant_cotisation,
    t.frequence,

    -- Membres
    COUNT(DISTINCT CASE WHEN m.statut = 'ACTIVE' THEN m.id END) AS membres_actifs,
    COUNT(DISTINCT CASE WHEN m.late_count > 0 THEN m.id END) AS membres_en_retard,

    -- Pot
    COALESCE(SUM(c.montant) FILTER (WHERE c.statut_transaction = 'POSTED'), 0) AS pot_collecte,
    COALESCE(t.solde, 0) AS pot_solde,

    -- Cycle actuel
    tc.cycle_number AS cycle_actuel,
    tc.status AS cycle_status,

    -- Prochain tour
    (SELECT tt.turn_number FROM tontine_turns tt
     WHERE tt.tontine_id = t.id AND tt.status IN ('SCHEDULED', 'READY')
     ORDER BY tt.turn_number LIMIT 1) AS prochain_tour,

    (SELECT u.nom || ' ' || COALESCE(u.prenom, '')
     FROM tontine_turns tt
     JOIN membres_tontine mt ON tt.beneficiary_member_id = mt.id
     JOIN clients cl ON mt.client_id = cl.id
     JOIN users u ON cl.user_id = u.id
     WHERE tt.tontine_id = t.id AND tt.status IN ('SCHEDULED', 'READY')
     ORDER BY tt.turn_number LIMIT 1) AS prochain_beneficiaire,

    -- Pénalités impayées
    COALESCE(SUM(p.montant) FILTER (WHERE p.statut = 'PENDING'), 0) AS penalites_impayees

FROM tontines t
LEFT JOIN membres_tontine m ON m.tontine_id = t.id AND m.deleted_at IS NULL
LEFT JOIN contributions_tontine c ON c.tontine_id = t.id AND c.deleted_at IS NULL
LEFT JOIN tontine_cycles tc ON tc.id = t.current_cycle_id
LEFT JOIN tontine_penalites p ON p.tontine_id = t.id AND p.deleted_at IS NULL

WHERE t.deleted_at IS NULL

GROUP BY t.id, t.agence_id, t.nom, t.statut, t.montant_cotisation, t.frequence, t.solde,
         tc.cycle_number, tc.status;

COMMENT ON VIEW v_tontine_dashboard IS 'Vue agrégée pour le dashboard tontine';

-- ============================================================================
-- 14. VIEW: MEMBER RETIRABLE AMOUNT
-- ============================================================================

CREATE OR REPLACE VIEW v_tontine_member_retirable AS
SELECT
    mt.id AS membre_id,
    mt.tontine_id,
    mt.client_id,
    t.agence_id,

    -- Droits théoriques = cotisation * nb_membres (pour un tour complet)
    t.montant_cotisation * (SELECT COUNT(*) FROM membres_tontine WHERE tontine_id = t.id AND statut = 'ACTIVE') AS droits_theoriques,

    -- Pot disponible
    COALESCE(t.solde, 0) AS pot_disponible,

    -- Pénalités impayées du membre
    COALESCE(
        (SELECT SUM(montant) FROM tontine_penalites WHERE membre_id = mt.id AND statut = 'PENDING' AND deleted_at IS NULL),
        0
    ) AS penalites_impayees,

    -- A déjà reçu dans ce cycle ?
    mt.a_recu_benefice AS deja_recu,

    -- Retirable = MIN(pot, droits - pénalités)
    LEAST(
        COALESCE(t.solde, 0),
        t.montant_cotisation * (SELECT COUNT(*) FROM membres_tontine WHERE tontine_id = t.id AND statut = 'ACTIVE')
        - COALESCE(
            (SELECT SUM(montant) FROM tontine_penalites WHERE membre_id = mt.id AND statut = 'PENDING' AND deleted_at IS NULL),
            0
        )
    ) AS montant_retirable,

    -- Peut retirer ?
    (mt.statut = 'ACTIVE' AND NOT COALESCE(mt.a_recu_benefice, FALSE)) AS peut_retirer

FROM membres_tontine mt
JOIN tontines t ON t.id = mt.tontine_id

WHERE mt.deleted_at IS NULL AND t.deleted_at IS NULL;

COMMENT ON VIEW v_tontine_member_retirable IS 'Calcul du montant retirable par membre';

-- ============================================================================
-- 15. FONCTION: Génération calendrier (schedules + turns)
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_tontine_calendar(
    p_tontine_id UUID,
    p_cycle_id UUID,
    p_user_id UUID,
    p_random_seed INTEGER DEFAULT NULL
) RETURNS TABLE (
    schedules_created INTEGER,
    turns_created INTEGER,
    audit_id UUID
) AS $$
DECLARE
    v_tontine RECORD;
    v_members UUID[];
    v_member_count INTEGER;
    v_current_date DATE;
    v_due_date DATE;
    v_interval INTERVAL;
    v_turn_order JSONB;
    v_audit_id UUID;
    v_schedules_count INTEGER := 0;
    v_turns_count INTEGER := 0;
    v_seed INTEGER;
    i INTEGER;
BEGIN
    -- Récupérer infos tontine
    SELECT t.*, tc.start_date AS cycle_start
    INTO v_tontine
    FROM tontines t
    JOIN tontine_cycles tc ON tc.id = p_cycle_id
    WHERE t.id = p_tontine_id;

    IF v_tontine IS NULL THEN
        RAISE EXCEPTION 'Tontine ou cycle non trouvé';
    END IF;

    -- Récupérer membres actifs
    SELECT ARRAY_AGG(id ORDER BY position NULLS LAST, date_adhesion)
    INTO v_members
    FROM membres_tontine
    WHERE tontine_id = p_tontine_id AND statut = 'ACTIVE' AND deleted_at IS NULL;

    v_member_count := COALESCE(array_length(v_members, 1), 0);

    IF v_member_count = 0 THEN
        RAISE EXCEPTION 'Aucun membre actif dans la tontine';
    END IF;

    -- Calculer l'intervalle selon fréquence
    v_interval := CASE v_tontine.frequence
        WHEN 'DAILY' THEN INTERVAL '1 day' * v_tontine.intervalle_cotisation
        WHEN 'WEEKLY' THEN INTERVAL '1 week' * v_tontine.intervalle_cotisation
        WHEN 'BIWEEKLY' THEN INTERVAL '2 weeks' * v_tontine.intervalle_cotisation
        WHEN 'MONTHLY' THEN INTERVAL '1 month' * v_tontine.intervalle_cotisation
        WHEN 'BIMONTHLY' THEN INTERVAL '2 months' * v_tontine.intervalle_cotisation
        WHEN 'QUARTERLY' THEN INTERVAL '3 months' * v_tontine.intervalle_cotisation
        ELSE INTERVAL '1 month'
    END;

    v_current_date := v_tontine.cycle_start;

    -- Générer les schedules et turns
    FOR i IN 1..v_member_count LOOP
        v_due_date := v_current_date + (v_interval * (i - 1));

        -- Créer schedule
        INSERT INTO tontine_schedules (
            agence_id, tontine_id, cycle_id, period_number, due_date,
            amount_expected_per_member, status
        ) VALUES (
            v_tontine.agence_id, p_tontine_id, p_cycle_id, i, v_due_date,
            v_tontine.montant_cotisation, 'UPCOMING'
        );
        v_schedules_count := v_schedules_count + 1;

        -- Créer turn (ordre par position ou random)
        INSERT INTO tontine_turns (
            agence_id, tontine_id, cycle_id, turn_number,
            beneficiary_member_id, due_date, amount_expected, status
        ) VALUES (
            v_tontine.agence_id, p_tontine_id, p_cycle_id, i,
            v_members[i], v_due_date,
            v_tontine.montant_cotisation * v_member_count,
            'SCHEDULED'
        );
        v_turns_count := v_turns_count + 1;
    END LOOP;

    -- Si typeDistribution = RANDOM et seed fourni, mélanger les tours
    IF v_tontine.type_distribution = 'RANDOM' THEN
        v_seed := COALESCE(p_random_seed, (EXTRACT(EPOCH FROM NOW()) * 1000)::INTEGER);

        -- Shuffle using seed (Fisher-Yates via SQL)
        -- Note: PostgreSQL doesn't have native shuffle, we use a deterministic approach
        -- In production, this would be done in application code for proper seeding

        -- For now, just reorder based on hash of member_id + seed
        UPDATE tontine_turns tt
        SET beneficiary_member_id = (
            SELECT m.id
            FROM membres_tontine m
            WHERE m.tontine_id = p_tontine_id AND m.statut = 'ACTIVE' AND m.deleted_at IS NULL
            ORDER BY md5(m.id::text || v_seed::text)
            OFFSET tt.turn_number - 1 LIMIT 1
        )
        WHERE tt.cycle_id = p_cycle_id;
    END IF;

    -- Créer entrée audit
    v_turn_order := (
        SELECT jsonb_agg(jsonb_build_object('turn_number', turn_number, 'member_id', beneficiary_member_id))
        FROM tontine_turns WHERE cycle_id = p_cycle_id ORDER BY turn_number
    );

    INSERT INTO tontine_turn_audit (
        agence_id, tontine_id, cycle_id, action_type, new_order,
        reason, changed_by, metadata
    ) VALUES (
        v_tontine.agence_id, p_tontine_id, p_cycle_id, 'INITIAL_GENERATION',
        v_turn_order, 'Génération initiale du calendrier',
        p_user_id, jsonb_build_object('seed', v_seed, 'distribution_type', v_tontine.type_distribution)
    ) RETURNING id INTO v_audit_id;

    RETURN QUERY SELECT v_schedules_count, v_turns_count, v_audit_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_tontine_calendar IS 'Génère le calendrier complet (schedules + turns) pour un cycle de tontine';

-- ============================================================================
-- 16. FONCTION: Calculer pot disponible & retirable
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_tontine_retirable(
    p_tontine_id UUID,
    p_member_id UUID
) RETURNS TABLE (
    pot_disponible NUMERIC,
    droits_membre NUMERIC,
    penalites_deduire NUMERIC,
    montant_retirable NUMERIC,
    peut_retirer BOOLEAN,
    raison TEXT
) AS $$
DECLARE
    v_tontine RECORD;
    v_member RECORD;
    v_pot NUMERIC;
    v_droits NUMERIC;
    v_penalites NUMERIC;
    v_retirable NUMERIC;
    v_can_withdraw BOOLEAN;
    v_reason TEXT;
    v_member_count INTEGER;
BEGIN
    -- Récupérer tontine
    SELECT * INTO v_tontine FROM tontines WHERE id = p_tontine_id AND deleted_at IS NULL;
    IF v_tontine IS NULL THEN
        RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, FALSE, 'Tontine non trouvée'::TEXT;
        RETURN;
    END IF;

    -- Récupérer membre
    SELECT * INTO v_member FROM membres_tontine WHERE id = p_member_id AND deleted_at IS NULL;
    IF v_member IS NULL THEN
        RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, FALSE, 'Membre non trouvé'::TEXT;
        RETURN;
    END IF;

    -- Vérifications
    IF v_member.statut != 'ACTIVE' THEN
        v_can_withdraw := FALSE;
        v_reason := 'Membre non actif';
    ELSIF v_member.a_recu_benefice THEN
        v_can_withdraw := FALSE;
        v_reason := 'Bénéfice déjà reçu pour ce cycle';
    ELSE
        v_can_withdraw := TRUE;
        v_reason := NULL;
    END IF;

    -- Calculer pot disponible
    v_pot := COALESCE(v_tontine.solde, 0);

    -- Calculer droits membre = cotisation * nb_membres
    SELECT COUNT(*) INTO v_member_count
    FROM membres_tontine WHERE tontine_id = p_tontine_id AND statut = 'ACTIVE' AND deleted_at IS NULL;

    v_droits := v_tontine.montant_cotisation * v_member_count;

    -- Calculer pénalités impayées
    SELECT COALESCE(SUM(montant), 0) INTO v_penalites
    FROM tontine_penalites
    WHERE membre_id = p_member_id AND statut = 'PENDING' AND deleted_at IS NULL;

    -- Calculer retirable
    v_retirable := LEAST(v_pot, v_droits - v_penalites);
    IF v_retirable < 0 THEN v_retirable := 0; END IF;

    -- Si pot insuffisant, indiquer raison
    IF v_can_withdraw AND v_retirable < v_droits THEN
        v_reason := 'Pot insuffisant (distribution partielle possible)';
    END IF;

    RETURN QUERY SELECT v_pot, v_droits, v_penalites, v_retirable, v_can_withdraw, v_reason;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_tontine_retirable IS 'Calcule le montant retirable pour un membre';

-- ============================================================================
-- 17. TRIGGER: Auto-lock turn when distribution starts
-- ============================================================================

CREATE OR REPLACE FUNCTION tontine_turn_auto_lock() RETURNS TRIGGER AS $$
BEGIN
    -- Lock le tour quand une distribution request est créée
    IF TG_OP = 'INSERT' AND NEW.turn_id IS NOT NULL THEN
        UPDATE tontine_turns
        SET is_locked = TRUE,
            locked_at = NOW(),
            locked_reason = 'Distribution request created'
        WHERE id = NEW.turn_id AND NOT is_locked;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tontine_turn_auto_lock ON tontine_distribution_requests;
CREATE TRIGGER trg_tontine_turn_auto_lock
    AFTER INSERT ON tontine_distribution_requests
    FOR EACH ROW EXECUTE FUNCTION tontine_turn_auto_lock();

-- ============================================================================
-- 18. TRIGGER: Update cycle totals on contribution
-- ============================================================================

CREATE OR REPLACE FUNCTION update_cycle_totals_on_contribution() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.cycle_id IS NOT NULL AND NEW.statut_transaction = 'POSTED' THEN
        UPDATE tontine_cycles
        SET pot_collected = pot_collected + NEW.montant,
            updated_at = NOW()
        WHERE id = NEW.cycle_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_cycle_totals_contrib ON contributions_tontine;
CREATE TRIGGER trg_update_cycle_totals_contrib
    AFTER INSERT OR UPDATE ON contributions_tontine
    FOR EACH ROW
    WHEN (NEW.statut_transaction = 'POSTED')
    EXECUTE FUNCTION update_cycle_totals_on_contribution();

-- ============================================================================
-- 19. INDEX ADDITIONNELS POUR PERFORMANCE
-- ============================================================================

-- Contributions par tour et statut
CREATE INDEX IF NOT EXISTS idx_contributions_tontine_tour_statut
    ON contributions_tontine(tontine_id, tour_numero, statut_transaction);

-- Tours par date et statut
CREATE INDEX IF NOT EXISTS idx_tontine_turns_date_status
    ON tontine_turns(due_date, status) WHERE status IN ('SCHEDULED', 'READY');

-- Pénalités par membre et statut
CREATE INDEX IF NOT EXISTS idx_tontine_penalites_membre_statut
    ON tontine_penalites(membre_id, statut) WHERE deleted_at IS NULL;

-- Distribution requests par statut
CREATE INDEX IF NOT EXISTS idx_tontine_dist_req_pending
    ON tontine_distribution_requests(status) WHERE status IN ('SUBMITTED', 'APPROVED', 'PENDING_PROVIDER');

-- ============================================================================
-- FIN MIGRATION
-- ============================================================================
