-- Formation certificates and evaluation scoring
-- Tracks certificates issued after completed formations + structured evaluations

-- Add evaluation scoring columns to formation_participants
ALTER TABLE formation_participants
  ADD COLUMN IF NOT EXISTS score_evaluation INTEGER,           -- 0-100 score
  ADD COLUMN IF NOT EXISTS competences_acquises TEXT,          -- JSON array of acquired competencies
  ADD COLUMN IF NOT EXISTS recommandation VARCHAR(30),         -- EXCELLENT, SATISFAISANT, INSUFFISANT, NON_EVALUE
  ADD COLUMN IF NOT EXISTS evaluateur_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS evaluated_at TIMESTAMP;

-- Certificates table
CREATE TABLE IF NOT EXISTS formation_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  formation_id INTEGER NOT NULL REFERENCES formations(id) ON DELETE CASCADE,
  employe_id UUID NOT NULL REFERENCES employes(id) ON DELETE CASCADE,
  employe_nom VARCHAR NOT NULL,

  -- Certificate details
  numero_certificat VARCHAR(50) NOT NULL UNIQUE,  -- Auto-generated reference number
  titre TEXT NOT NULL,                             -- Certificate title (from formation)
  date_emission DATE NOT NULL DEFAULT CURRENT_DATE,
  date_expiration DATE,                            -- NULL = no expiry
  competences TEXT,                                 -- Certified competencies

  -- Status
  statut VARCHAR(20) NOT NULL DEFAULT 'ISSUED',    -- ISSUED, REVOKED, EXPIRED
  revoque_par UUID REFERENCES users(id) ON DELETE SET NULL,
  revoque_at TIMESTAMP,
  motif_revocation TEXT,

  -- Storage
  fichier_url TEXT,                                 -- MinIO storage key for PDF
  emis_par UUID REFERENCES users(id) ON DELETE SET NULL,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(formation_id, employe_id)                  -- One certificate per participant per formation
);

CREATE INDEX idx_formation_certificates_employe ON formation_certificates(employe_id);
CREATE INDEX idx_formation_certificates_formation ON formation_certificates(formation_id);
CREATE INDEX idx_formation_certificates_statut ON formation_certificates(statut);
CREATE INDEX idx_formation_certificates_expiry ON formation_certificates(date_expiration) WHERE date_expiration IS NOT NULL;
