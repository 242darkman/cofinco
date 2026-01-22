-- =============================================================================
-- Migration: Add Departments and Job Positions tables
-- Date: 2026-01-22
-- Description: Creates departments and job_positions tables with UUID IDs,
--              adds job_position_id column to employes table
-- =============================================================================

-- Start transaction
BEGIN;

-- =============================================================================
-- STEP 1: Create departments table
-- =============================================================================
CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(30) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- STEP 2: Create job_positions table
-- =============================================================================
CREATE TABLE IF NOT EXISTS job_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    code VARCHAR(30) NOT NULL,
    name VARCHAR(120) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- STEP 3: Add job_position_id to employes table (if not exists)
-- =============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'employes' AND column_name = 'job_position_id'
    ) THEN
        ALTER TABLE employes ADD COLUMN job_position_id UUID REFERENCES job_positions(id) ON DELETE SET NULL;
    END IF;
END $$;

-- =============================================================================
-- STEP 4: Insert default departments
-- =============================================================================
INSERT INTO departments (code, name, description) VALUES
    ('DIR', 'Direction Générale', 'Direction et administration générale'),
    ('FIN', 'Finance & Comptabilité', 'Gestion financière et comptable'),
    ('RH', 'Ressources Humaines', 'Gestion du personnel'),
    ('OPS', 'Opérations', 'Opérations terrain et caisse'),
    ('COM', 'Commercial', 'Vente et relation client'),
    ('IT', 'Informatique', 'Systèmes d''information'),
    ('RISK', 'Risques & Conformité', 'Gestion des risques et conformité')
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- STEP 5: Insert job positions (using subqueries to get department UUIDs)
-- =============================================================================

-- Direction
INSERT INTO job_positions (department_id, code, name) VALUES
    ((SELECT id FROM departments WHERE code = 'DIR'), 'DG', 'Directeur Général'),
    ((SELECT id FROM departments WHERE code = 'DIR'), 'DGA', 'Directeur Général Adjoint'),
    ((SELECT id FROM departments WHERE code = 'DIR'), 'SEC', 'Secrétaire de Direction')
ON CONFLICT DO NOTHING;

-- Finance
INSERT INTO job_positions (department_id, code, name) VALUES
    ((SELECT id FROM departments WHERE code = 'FIN'), 'DAF', 'Directeur Administratif et Financier'),
    ((SELECT id FROM departments WHERE code = 'FIN'), 'COMPT', 'Comptable'),
    ((SELECT id FROM departments WHERE code = 'FIN'), 'TRESO', 'Trésorier'),
    ((SELECT id FROM departments WHERE code = 'FIN'), 'AUDIT', 'Auditeur Interne')
ON CONFLICT DO NOTHING;

-- RH
INSERT INTO job_positions (department_id, code, name) VALUES
    ((SELECT id FROM departments WHERE code = 'RH'), 'DRH', 'Directeur des Ressources Humaines'),
    ((SELECT id FROM departments WHERE code = 'RH'), 'GPERSO', 'Gestionnaire du Personnel'),
    ((SELECT id FROM departments WHERE code = 'RH'), 'FORM', 'Responsable Formation')
ON CONFLICT DO NOTHING;

-- Opérations
INSERT INTO job_positions (department_id, code, name) VALUES
    ((SELECT id FROM departments WHERE code = 'OPS'), 'DOPS', 'Directeur des Opérations'),
    ((SELECT id FROM departments WHERE code = 'OPS'), 'CAGENCE', 'Chef d''Agence'),
    ((SELECT id FROM departments WHERE code = 'OPS'), 'CAISS', 'Caissier'),
    ((SELECT id FROM departments WHERE code = 'OPS'), 'AGTER', 'Agent Terrain'),
    ((SELECT id FROM departments WHERE code = 'OPS'), 'SUPV', 'Superviseur')
ON CONFLICT DO NOTHING;

-- Commercial
INSERT INTO job_positions (department_id, code, name) VALUES
    ((SELECT id FROM departments WHERE code = 'COM'), 'DCOM', 'Directeur Commercial'),
    ((SELECT id FROM departments WHERE code = 'COM'), 'CCONS', 'Chargé de Clientèle'),
    ((SELECT id FROM departments WHERE code = 'COM'), 'ACRED', 'Analyste Crédit')
ON CONFLICT DO NOTHING;

-- IT
INSERT INTO job_positions (department_id, code, name) VALUES
    ((SELECT id FROM departments WHERE code = 'IT'), 'DSI', 'Directeur des Systèmes d''Information'),
    ((SELECT id FROM departments WHERE code = 'IT'), 'DEV', 'Développeur'),
    ((SELECT id FROM departments WHERE code = 'IT'), 'ADMIN', 'Administrateur Système')
ON CONFLICT DO NOTHING;

-- Risques
INSERT INTO job_positions (department_id, code, name) VALUES
    ((SELECT id FROM departments WHERE code = 'RISK'), 'DRISK', 'Directeur des Risques'),
    ((SELECT id FROM departments WHERE code = 'RISK'), 'ARISK', 'Analyste Risques'),
    ((SELECT id FROM departments WHERE code = 'RISK'), 'CONF', 'Responsable Conformité')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- STEP 6: (OPTIONAL) Drop old columns from employes if they exist
-- Uncomment if you want to remove the old poste and departement columns
-- =============================================================================
-- DO $$
-- BEGIN
--     IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employes' AND column_name = 'poste') THEN
--         ALTER TABLE employes DROP COLUMN poste;
--     END IF;
--     IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employes' AND column_name = 'departement') THEN
--         ALTER TABLE employes DROP COLUMN departement;
--     END IF;
-- END $$;

-- Commit transaction
COMMIT;

-- =============================================================================
-- Verification queries (run separately to verify)
-- =============================================================================
-- SELECT * FROM departments;
-- SELECT jp.*, d.name as department_name FROM job_positions jp JOIN departments d ON jp.department_id = d.id ORDER BY d.name, jp.name;
-- SELECT COUNT(*) FROM departments;
-- SELECT COUNT(*) FROM job_positions;
