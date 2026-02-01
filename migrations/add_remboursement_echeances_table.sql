-- Migration: Ajouter table de liaison remboursement_echeances et enrichir echeances_credits
-- Date: 2026-02-01
-- Description: Permet de tracer l'allocation des remboursements aux échéances avec FIFO

BEGIN;

-- 1. Créer la table de liaison remboursement_echeances
CREATE TABLE IF NOT EXISTS remboursement_echeances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    remboursement_id UUID NOT NULL REFERENCES remboursements(id) ON DELETE CASCADE,
    echeance_id UUID NOT NULL REFERENCES echeances_credits(id) ON DELETE CASCADE,
    allocated_amount NUMERIC(15,2) NOT NULL CHECK (allocated_amount > 0),
    allocated_capital NUMERIC(15,2) DEFAULT 0,
    allocated_interest NUMERIC(15,2) DEFAULT 0,
    allocation_order INTEGER NOT NULL DEFAULT 1, -- Ordre d'allocation FIFO
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id),
    reversed_at TIMESTAMP, -- Pour tracer les extournes
    reversed_by UUID REFERENCES users(id),
    
    -- Contraintes
    CONSTRAINT unique_remboursement_echeance UNIQUE(remboursement_id, echeance_id),
    CONSTRAINT check_allocation_split CHECK (
        allocated_capital + allocated_interest = allocated_amount
    )
);

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_remboursement_echeances_remboursement ON remboursement_echeances(remboursement_id);
CREATE INDEX IF NOT EXISTS idx_remboursement_echeances_echeance ON remboursement_echeances(echeance_id);
CREATE INDEX IF NOT EXISTS idx_remboursement_echeances_reversed ON remboursement_echeances(reversed_at) WHERE reversed_at IS NULL;

-- 2. Enrichir la table echeances_credits avec nouveaux statuts et champs
-- Ajouter les nouveaux statuts à l'enum (si pas déjà présents)
ALTER TYPE statut_echeance_credit_enum ADD VALUE IF NOT EXISTS 'DUE';
ALTER TYPE statut_echeance_credit_enum ADD VALUE IF NOT EXISTS 'PARTIALLY_PAID';
ALTER TYPE statut_echeance_credit_enum ADD VALUE IF NOT EXISTS 'RESTRUCTURED';

-- Ajouter les colonnes manquantes
ALTER TABLE echeances_credits 
    ADD COLUMN IF NOT EXISTS sequence INTEGER,
    ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS late_marked_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS last_payment_date TIMESTAMP,
    ADD COLUMN IF NOT EXISTS montant_capital_paye NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS montant_interet_paye NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS penalite_montant NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS penalite_payee NUMERIC(15,2) DEFAULT 0;

-- Index pour optimiser les requêtes FIFO
CREATE INDEX IF NOT EXISTS idx_echeances_credits_fifo ON echeances_credits(credit_id, date_echeance ASC, sequence ASC);
CREATE INDEX IF NOT EXISTS idx_echeances_credits_statut_date ON echeances_credits(statut, date_echeance) WHERE statut != 'PAID';

-- 3. Ajouter le champ overpayment sur remboursements
ALTER TABLE remboursements 
    ADD COLUMN IF NOT EXISTS overpayment_amount NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS allocation_strategy VARCHAR(50) DEFAULT 'FIFO',
    ADD COLUMN IF NOT EXISTS is_reversed BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS reversed_by UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS reversal_reason TEXT;

-- 4. Créer une table pour gérer les trop-perçus (credit balance)
CREATE TABLE IF NOT EXISTS client_credit_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id),
    agence_id UUID NOT NULL REFERENCES agences(id),
    balance NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
    last_transaction_date TIMESTAMP,
    last_transaction_type VARCHAR(50), -- OVERPAYMENT, REFUND, APPLIED_TO_CREDIT
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Un seul solde par client par agence
    CONSTRAINT unique_client_balance_per_agency UNIQUE(client_id, agence_id)
);

CREATE INDEX IF NOT EXISTS idx_client_credit_balances_client ON client_credit_balances(client_id);
CREATE INDEX IF NOT EXISTS idx_client_credit_balances_agence ON client_credit_balances(agence_id);

-- 5. Table d'audit pour traçabilité complète
CREATE TABLE IF NOT EXISTS remboursement_allocation_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    remboursement_id UUID NOT NULL REFERENCES remboursements(id),
    action VARCHAR(50) NOT NULL, -- ALLOCATED, REVERSED, MODIFIED
    before_state JSONB,
    after_state JSONB,
    metadata JSONB, -- Info supplémentaire (user agent, IP, etc.)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_remboursement_allocation_audit_remboursement ON remboursement_allocation_audit(remboursement_id);
CREATE INDEX IF NOT EXISTS idx_remboursement_allocation_audit_created ON remboursement_allocation_audit(created_at);

-- 6. Fonction pour calculer le statut d'une échéance
CREATE OR REPLACE FUNCTION calculate_echeance_status(
    p_date_echeance TIMESTAMP,
    p_montant_total NUMERIC,
    p_montant_paye NUMERIC
) RETURNS VARCHAR AS $$
DECLARE
    v_status VARCHAR;
BEGIN
    IF p_montant_paye >= p_montant_total THEN
        v_status := 'PAID';
    ELSIF p_montant_paye > 0 AND p_montant_paye < p_montant_total THEN
        v_status := 'PARTIALLY_PAID';
    ELSIF p_date_echeance < CURRENT_DATE AND p_montant_paye < p_montant_total THEN
        v_status := 'LATE';
    ELSIF p_date_echeance <= CURRENT_DATE + INTERVAL '7 days' THEN
        v_status := 'DUE';
    ELSE
        v_status := 'UPCOMING';
    END IF;
    
    RETURN v_status;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 7. Trigger pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_client_credit_balances_updated_at
    BEFORE UPDATE ON client_credit_balances
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 8. Vue pour faciliter le reporting des échéances
CREATE OR REPLACE VIEW v_echeances_with_status AS
SELECT 
    ec.*,
    c.numero_credit,
    c.client_id,
    cl.agence_id,
    calculate_echeance_status(ec.date_echeance, ec.montant_total, ec.montant_paye) as calculated_status,
    CASE 
        WHEN ec.montant_paye >= ec.montant_total THEN 0
        ELSE ec.montant_total - ec.montant_paye
    END as montant_restant,
    CASE 
        WHEN ec.date_echeance < CURRENT_DATE AND ec.montant_paye < ec.montant_total 
        THEN CURRENT_DATE - ec.date_echeance::date
        ELSE 0
    END as jours_retard
FROM echeances_credits ec
JOIN credits c ON ec.credit_id = c.id
JOIN clients cl ON c.client_id = cl.id;

-- 9. Mise à jour des échéances existantes avec le bon sequence
UPDATE echeances_credits ec
SET sequence = sub.row_num
FROM (
    SELECT 
        id,
        ROW_NUMBER() OVER (PARTITION BY credit_id ORDER BY date_echeance, numero_echeance) as row_num
    FROM echeances_credits
) sub
WHERE ec.id = sub.id AND ec.sequence IS NULL;

-- 10. Mise à jour des statuts des échéances existantes
UPDATE echeances_credits
SET statut = calculate_echeance_status(date_echeance, montant_total, montant_paye)::statut_echeance_credit_enum
WHERE statut IS NULL OR statut NOT IN ('PAID', 'SETTLED');

COMMIT;

-- Commentaires pour documentation
COMMENT ON TABLE remboursement_echeances IS 'Table de liaison entre remboursements et échéances pour tracer l''allocation FIFO des paiements';
COMMENT ON COLUMN remboursement_echeances.allocation_order IS 'Ordre d''allocation FIFO (1 = première échéance payée)';
COMMENT ON COLUMN remboursements.overpayment_amount IS 'Montant du trop-perçu après allocation sur toutes les échéances';
COMMENT ON TABLE client_credit_balances IS 'Solde créditeur des clients (trop-perçus accumulés)';