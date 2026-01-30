-- Employee Documents: structured metadata for employee files
-- Tracks document type, category, expiry, and verification workflow

CREATE TABLE IF NOT EXISTS employee_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID NOT NULL REFERENCES employes(id) ON DELETE CASCADE,

  -- Document metadata
  nom TEXT NOT NULL,                           -- Display name
  type_document VARCHAR(50) NOT NULL,           -- CONTRACT, ID_CARD, DIPLOMA, CERTIFICATE, MEDICAL, OTHER
  categorie VARCHAR(50) DEFAULT 'GENERAL',      -- ADMINISTRATIF, FORMATION, MEDICAL, JURIDIQUE, GENERAL
  description TEXT,

  -- File reference (stored in MinIO via StorageService)
  storage_key TEXT NOT NULL,                    -- MinIO object key
  bucket VARCHAR(20) NOT NULL DEFAULT 'private', -- public or private
  file_name TEXT NOT NULL,                      -- Original file name
  file_size INTEGER,                            -- Size in bytes
  mime_type VARCHAR(100),                       -- MIME type

  -- Expiry & verification
  date_emission DATE,                           -- Issue date
  date_expiration DATE,                         -- Expiry date (null = no expiry)
  statut VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, VERIFIED, REJECTED, EXPIRED
  verifie_par UUID REFERENCES users(id) ON SET NULL,
  verifie_at TIMESTAMP,
  motif_rejet TEXT,

  -- Audit
  ajoute_par UUID REFERENCES users(id) ON SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_employee_documents_employe ON employee_documents(employe_id);
CREATE INDEX idx_employee_documents_type ON employee_documents(type_document);
CREATE INDEX idx_employee_documents_expiry ON employee_documents(date_expiration) WHERE date_expiration IS NOT NULL;
CREATE INDEX idx_employee_documents_statut ON employee_documents(statut);
