-- Migration: Create HR Tables
-- Created: 2024-12-24
-- Description: Tables pour le module Ressources Humaines (congés, formations, sanctions, candidatures, bulletins)

-- Demandes de congés
CREATE TABLE IF NOT EXISTS demandes_conges (
  id SERIAL PRIMARY KEY,
  employe_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employe_nom VARCHAR NOT NULL,
  type VARCHAR NOT NULL,
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  motif TEXT,
  statut VARCHAR NOT NULL DEFAULT 'En attente',
  approuve_par VARCHAR,
  date_decision TIMESTAMP,
  commentaire TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_demandes_conges_employe ON demandes_conges(employe_id);
CREATE INDEX idx_demandes_conges_statut ON demandes_conges(statut);
CREATE INDEX idx_demandes_conges_dates ON demandes_conges(date_debut, date_fin);

-- Formations
CREATE TABLE IF NOT EXISTS formations (
  id SERIAL PRIMARY KEY,
  titre VARCHAR NOT NULL,
  formateur VARCHAR NOT NULL,
  date_debut DATE NOT NULL,
  duree VARCHAR NOT NULL,
  lieu VARCHAR,
  description TEXT,
  statut VARCHAR NOT NULL DEFAULT 'Planifiée',
  capacite_max INTEGER,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_formations_statut ON formations(statut);
CREATE INDEX idx_formations_date ON formations(date_debut);

-- Participants aux formations
CREATE TABLE IF NOT EXISTS formation_participants (
  formation_id INTEGER NOT NULL REFERENCES formations(id) ON DELETE CASCADE,
  employe_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employe_nom VARCHAR NOT NULL,
  date_inscription TIMESTAMP DEFAULT NOW() NOT NULL,
  presence VARCHAR DEFAULT 'Non noté',
  evaluation TEXT,
  PRIMARY KEY (formation_id, employe_id)
);

CREATE INDEX idx_formation_participants_employe ON formation_participants(employe_id);

-- Sanctions disciplinaires
CREATE TABLE IF NOT EXISTS sanctions (
  id SERIAL PRIMARY KEY,
  employe_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employe_nom VARCHAR NOT NULL,
  type VARCHAR NOT NULL,
  motif TEXT NOT NULL,
  date DATE NOT NULL,
  gravite VARCHAR NOT NULL,
  emetteur_id VARCHAR,
  documents_joints TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_sanctions_employe ON sanctions(employe_id);
CREATE INDEX idx_sanctions_date ON sanctions(date);
CREATE INDEX idx_sanctions_gravite ON sanctions(gravite);

-- Candidatures
CREATE TABLE IF NOT EXISTS candidatures (
  id SERIAL PRIMARY KEY,
  nom VARCHAR NOT NULL,
  prenom VARCHAR NOT NULL,
  email VARCHAR NOT NULL,
  telephone VARCHAR,
  poste_vise VARCHAR NOT NULL,
  experience TEXT,
  formation TEXT,
  date_postulation DATE DEFAULT CURRENT_DATE NOT NULL,
  statut VARCHAR NOT NULL DEFAULT 'En attente',
  cv_url VARCHAR,
  lettre_motivation_url VARCHAR,
  notes TEXT,
  date_entretien DATE,
  responsable_rh_id VARCHAR,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_candidatures_statut ON candidatures(statut);
CREATE INDEX idx_candidatures_poste ON candidatures(poste_vise);
CREATE INDEX idx_candidatures_date ON candidatures(date_postulation);

-- Bulletins de paie (archivage)
CREATE TABLE IF NOT EXISTS bulletins_paie (
  id SERIAL PRIMARY KEY,
  employe_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employe_nom VARCHAR NOT NULL,
  mois VARCHAR NOT NULL, -- Format: 'YYYY-MM'
  salaire_base VARCHAR NOT NULL,
  prime_anciennete VARCHAR DEFAULT '0',
  prime_transport VARCHAR DEFAULT '0',
  prime_rendement VARCHAR DEFAULT '0',
  autres_primes VARCHAR DEFAULT '0',
  salaire_brut VARCHAR NOT NULL,
  cnss_employe VARCHAR NOT NULL,
  ipr VARCHAR NOT NULL,
  autres_retenues VARCHAR DEFAULT '0',
  total_retenues VARCHAR NOT NULL,
  salaire_net VARCHAR NOT NULL,
  cnss_patronale VARCHAR NOT NULL,
  pdf_url VARCHAR,
  pdf_hash VARCHAR,
  genere_par_id VARCHAR,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(employe_id, mois) -- Un seul bulletin par employé par mois
);

CREATE INDEX idx_bulletins_paie_employe ON bulletins_paie(employe_id);
CREATE INDEX idx_bulletins_paie_mois ON bulletins_paie(mois);
CREATE INDEX idx_bulletins_paie_created ON bulletins_paie(created_at);

-- Trigger pour auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_demandes_conges_updated_at BEFORE UPDATE ON demandes_conges
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_formations_updated_at BEFORE UPDATE ON formations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_candidatures_updated_at BEFORE UPDATE ON candidatures
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Politique de rétention pour bulletins de paie (garder 5 ans)
COMMENT ON TABLE bulletins_paie IS 'Archivage bulletins de paie - Rétention: 5 ans légal Congo';
COMMENT ON COLUMN bulletins_paie.mois IS 'Format YYYY-MM pour faciliter les requêtes de nettoyage';

-- Vue pour faciliter les requêtes de statistiques RH
CREATE OR REPLACE VIEW vue_stats_rh AS
SELECT 
  (SELECT COUNT(*) FROM users WHERE role != 'admin') as total_employes,
  (SELECT COUNT(*) FROM demandes_conges WHERE statut = 'En attente') as conges_en_attente,
  (SELECT COUNT(*) FROM formations WHERE statut = 'En cours') as formations_en_cours,
  (SELECT COUNT(*) FROM candidatures WHERE statut = 'En attente') as candidatures_en_attente,
  (SELECT COUNT(*) FROM sanctions WHERE date >= CURRENT_DATE - INTERVAL '30 days') as sanctions_mois
;
