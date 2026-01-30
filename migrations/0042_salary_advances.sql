-- Salary Advances (Avances sur salaire)
CREATE TABLE IF NOT EXISTS avances_salaire (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID NOT NULL REFERENCES employes(id) ON DELETE CASCADE,
  montant INTEGER NOT NULL, -- Amount in FCFA
  motif TEXT NOT NULL,
  date_demande DATE NOT NULL DEFAULT CURRENT_DATE,
  date_remboursement DATE, -- Expected repayment date (deducted from salary)
  mois_deduction VARCHAR(7), -- 'YYYY-MM' month to deduct from salary
  statut VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    -- PENDING -> APPROVED -> PAID -> DEDUCTED
    -- PENDING -> REJECTED
  approuve_par UUID REFERENCES users(id) ON DELETE SET NULL,
  approuve_at TIMESTAMP,
  paye_at TIMESTAMP,
  rejete_motif TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_avances_employe ON avances_salaire(employe_id);
CREATE INDEX idx_avances_statut ON avances_salaire(statut);
CREATE INDEX idx_avances_mois ON avances_salaire(mois_deduction);
