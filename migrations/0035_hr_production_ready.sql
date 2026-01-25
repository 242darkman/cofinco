-- Migration: HR Module Production Ready
-- Description: Add leave_balances, hr_audit_log, payroll_config tables, indexes, and cleanup legacy

-- ============================================
-- 1. CREATE NEW TABLES
-- ============================================

-- 1.1 Leave Balances (Soldes Congés)
CREATE TABLE IF NOT EXISTS leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID NOT NULL REFERENCES employes(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  leave_type VARCHAR(50) NOT NULL DEFAULT 'Congé Annuel',
  -- Quotas
  initial_allocation INTEGER NOT NULL DEFAULT 30,
  acquired INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0,
  pending INTEGER NOT NULL DEFAULT 0,
  -- Carry over from previous year
  carry_over INTEGER DEFAULT 0,
  expiry_date DATE,
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT leave_balances_unique UNIQUE(employe_id, year, leave_type)
);

COMMENT ON TABLE leave_balances IS 'Tracks employee leave balances per year and type';
COMMENT ON COLUMN leave_balances.initial_allocation IS 'Total days allocated for the year';
COMMENT ON COLUMN leave_balances.acquired IS 'Days acquired based on prorata calculation';
COMMENT ON COLUMN leave_balances.used IS 'Days already used (approved leaves)';
COMMENT ON COLUMN leave_balances.pending IS 'Days in pending approval requests';
COMMENT ON COLUMN leave_balances.carry_over IS 'Days carried over from previous year';

-- 1.2 HR Audit Log
CREATE TABLE IF NOT EXISTS hr_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Target
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(100) NOT NULL,
  -- Action
  action VARCHAR(50) NOT NULL,
  -- Actor
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_name VARCHAR(255),
  actor_role VARCHAR(100),
  -- Changes
  old_values JSONB,
  new_values JSONB,
  diff JSONB,
  -- Context
  ip_address INET,
  user_agent TEXT,
  reason TEXT,
  -- Severity
  severity VARCHAR(20) DEFAULT 'info',
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  agence_id UUID REFERENCES agences(id) ON DELETE SET NULL
);

COMMENT ON TABLE hr_audit_log IS 'Audit trail for all HR-related actions';
COMMENT ON COLUMN hr_audit_log.entity_type IS 'Type: employe, conge, bulletin, sanction, formation, etc.';
COMMENT ON COLUMN hr_audit_log.action IS 'Action: created, updated, approved, rejected, deleted, etc.';
COMMENT ON COLUMN hr_audit_log.severity IS 'Severity level: info, warning, critical';

-- 1.3 Payroll Configuration
CREATE TABLE IF NOT EXISTS payroll_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Scope (NULL = global)
  agence_id UUID REFERENCES agences(id) ON DELETE CASCADE,
  -- Employee contribution rates
  cnss_employee_rate NUMERIC(5,4) NOT NULL DEFAULT 0.0500,
  cnss_employer_rate NUMERIC(5,4) NOT NULL DEFAULT 0.0900,
  -- Tax brackets (IPR)
  ipr_brackets JSONB NOT NULL DEFAULT '[
    {"min": 0, "max": 524000, "rate": 0},
    {"min": 524001, "max": 1428000, "rate": 0.15},
    {"min": 1428001, "max": 2700000, "rate": 0.30},
    {"min": 2700001, "max": null, "rate": 0.40}
  ]'::jsonb,
  -- Fixed allowances
  transport_allowance INTEGER DEFAULT 50000,
  housing_allowance INTEGER DEFAULT 0,
  -- Overtime rates
  overtime_rate NUMERIC(3,2) DEFAULT 1.50,
  night_shift_rate NUMERIC(3,2) DEFAULT 1.25,
  holiday_rate NUMERIC(3,2) DEFAULT 2.00,
  -- Validity period
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  is_active BOOLEAN DEFAULT true,
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

COMMENT ON TABLE payroll_config IS 'Configurable payroll parameters per agency';
COMMENT ON COLUMN payroll_config.ipr_brackets IS 'JSON array of tax brackets: [{min, max, rate}]';

-- 1.4 Create horaires_travail if not exists (was missing from migrations)
CREATE TABLE IF NOT EXISTS horaires_travail (
  id SERIAL PRIMARY KEY,
  employe_id UUID NOT NULL REFERENCES employes(id) ON DELETE CASCADE,
  jour_semaine INTEGER NOT NULL CHECK (jour_semaine >= 0 AND jour_semaine <= 6),
  heure_debut VARCHAR(5) NOT NULL,
  heure_fin VARCHAR(5) NOT NULL,
  pause_minutes INTEGER DEFAULT 60,
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE horaires_travail IS 'Employee work schedules per day of week';
COMMENT ON COLUMN horaires_travail.jour_semaine IS '0=Sunday, 1=Monday, ..., 6=Saturday';

-- ============================================
-- 2. ADD MISSING COLUMNS TO EXISTING TABLES
-- ============================================

-- 2.1 Add missing columns to presences if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'presences' AND column_name = 'pause_debut') THEN
    ALTER TABLE presences ADD COLUMN pause_debut TIMESTAMP;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'presences' AND column_name = 'pause_fin') THEN
    ALTER TABLE presences ADD COLUMN pause_fin TIMESTAMP;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'presences' AND column_name = 'heures_travaillees') THEN
    ALTER TABLE presences ADD COLUMN heures_travaillees INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'presences' AND column_name = 'heures_supplementaires') THEN
    ALTER TABLE presences ADD COLUMN heures_supplementaires INTEGER DEFAULT 0;
  END IF;
END $$;

-- 2.2 Add cancelled status support to demandes_conges
-- (statut already allows any varchar, just documenting the new value)
COMMENT ON COLUMN demandes_conges.statut IS 'Status: DRAFT, PENDING, APPROVED, REJECTED, CANCELLED';

-- ============================================
-- 3. CREATE INDEXES FOR PERFORMANCE
-- ============================================

-- 3.1 leave_balances indexes
CREATE INDEX IF NOT EXISTS idx_leave_balances_employe ON leave_balances(employe_id);
CREATE INDEX IF NOT EXISTS idx_leave_balances_year ON leave_balances(year);
CREATE INDEX IF NOT EXISTS idx_leave_balances_type ON leave_balances(leave_type);

-- 3.2 hr_audit_log indexes
CREATE INDEX IF NOT EXISTS idx_hr_audit_entity ON hr_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_hr_audit_actor ON hr_audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_hr_audit_date ON hr_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_audit_severity ON hr_audit_log(severity) WHERE severity IN ('warning', 'critical');
CREATE INDEX IF NOT EXISTS idx_hr_audit_agence ON hr_audit_log(agence_id);

-- 3.3 payroll_config indexes
CREATE INDEX IF NOT EXISTS idx_payroll_config_active ON payroll_config(is_active, effective_from);
CREATE INDEX IF NOT EXISTS idx_payroll_config_agence ON payroll_config(agence_id);

-- 3.4 demandes_conges indexes (missing)
CREATE INDEX IF NOT EXISTS idx_demandes_conges_employe ON demandes_conges(employe_id);
CREATE INDEX IF NOT EXISTS idx_demandes_conges_statut ON demandes_conges(statut);
CREATE INDEX IF NOT EXISTS idx_demandes_conges_dates ON demandes_conges(date_debut, date_fin);

-- 3.5 bulletins_paie indexes (missing)
CREATE INDEX IF NOT EXISTS idx_bulletins_paie_employe ON bulletins_paie(employe_id);
CREATE INDEX IF NOT EXISTS idx_bulletins_paie_mois ON bulletins_paie(mois);
CREATE INDEX IF NOT EXISTS idx_bulletins_paie_statut ON bulletins_paie(statut);

-- 3.6 presences indexes (missing)
CREATE INDEX IF NOT EXISTS idx_presences_employe ON presences(employe_id);
CREATE INDEX IF NOT EXISTS idx_presences_date ON presences(date);
CREATE INDEX IF NOT EXISTS idx_presences_employe_date ON presences(employe_id, date);

-- 3.7 formations indexes (missing)
CREATE INDEX IF NOT EXISTS idx_formations_statut ON formations(statut);
CREATE INDEX IF NOT EXISTS idx_formations_dates ON formations(date_debut);

-- 3.8 sanctions indexes (missing)
CREATE INDEX IF NOT EXISTS idx_sanctions_employe ON sanctions(employe_id);
CREATE INDEX IF NOT EXISTS idx_sanctions_date ON sanctions(date);

-- 3.9 candidatures indexes (missing)
CREATE INDEX IF NOT EXISTS idx_candidatures_statut ON candidatures(statut);
CREATE INDEX IF NOT EXISTS idx_candidatures_date ON candidatures(date_postulation);

-- 3.10 avantages_employes indexes (missing)
CREATE INDEX IF NOT EXISTS idx_avantages_employes_employe ON avantages_employes(employe_id);
CREATE INDEX IF NOT EXISTS idx_avantages_employes_avantage ON avantages_employes(avantage_id);

-- 3.11 horaires_travail indexes
CREATE INDEX IF NOT EXISTS idx_horaires_travail_employe ON horaires_travail(employe_id);
CREATE INDEX IF NOT EXISTS idx_horaires_travail_jour ON horaires_travail(jour_semaine);

-- ============================================
-- 4. SEED DEFAULT PAYROLL CONFIG
-- ============================================

INSERT INTO payroll_config (
  agence_id,
  cnss_employee_rate,
  cnss_employer_rate,
  ipr_brackets,
  transport_allowance,
  housing_allowance,
  overtime_rate,
  night_shift_rate,
  holiday_rate,
  effective_from,
  is_active
)
SELECT
  NULL, -- Global config
  0.0500,
  0.0900,
  '[
    {"min": 0, "max": 524000, "rate": 0},
    {"min": 524001, "max": 1428000, "rate": 0.15},
    {"min": 1428001, "max": 2700000, "rate": 0.30},
    {"min": 2700001, "max": null, "rate": 0.40}
  ]'::jsonb,
  50000,
  0,
  1.50,
  1.25,
  2.00,
  CURRENT_DATE,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM payroll_config WHERE agence_id IS NULL AND is_active = true
);

-- ============================================
-- 5. INITIALIZE LEAVE BALANCES FOR EXISTING EMPLOYEES
-- ============================================

-- Create leave balances for current year for all active employees who don't have one
INSERT INTO leave_balances (employe_id, year, leave_type, initial_allocation, acquired, used, pending)
SELECT
  e.id,
  EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
  'Congé Annuel',
  30,
  -- Pro-rata calculation: days based on months worked this year
  CASE
    WHEN e.date_embauche IS NULL THEN 30
    WHEN EXTRACT(YEAR FROM e.date_embauche::date) < EXTRACT(YEAR FROM CURRENT_DATE) THEN 30
    ELSE GREATEST(0, (30 * (12 - EXTRACT(MONTH FROM e.date_embauche::date) + 1) / 12)::INTEGER)
  END,
  0, -- used
  0  -- pending
FROM employes e
WHERE e.statut = 'ACTIVE'
  AND NOT EXISTS (
    SELECT 1 FROM leave_balances lb
    WHERE lb.employe_id = e.id
      AND lb.year = EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
      AND lb.leave_type = 'Congé Annuel'
  );

-- ============================================
-- 6. LEGACY CLEANUP: MIGRATE caissePin
-- ============================================

-- Note: We don't drop the column yet to avoid breaking existing code
-- The column will be ignored in the schema and can be dropped later
-- after confirming all code paths no longer use it

-- Add comment to indicate deprecation
COMMENT ON COLUMN employes.caisse_pin IS 'DEPRECATED: Use caisse_security_codes table instead. To be removed in future migration.';

-- ============================================
-- 7. CREATE HELPER FUNCTIONS
-- ============================================

-- Function to calculate business days between two dates (excluding weekends)
CREATE OR REPLACE FUNCTION calculate_business_days(start_date DATE, end_date DATE)
RETURNS INTEGER AS $$
DECLARE
  total_days INTEGER;
  full_weeks INTEGER;
  remaining_days INTEGER;
  start_dow INTEGER;
  end_dow INTEGER;
  weekend_days INTEGER;
BEGIN
  IF start_date > end_date THEN
    RETURN 0;
  END IF;

  total_days := end_date - start_date + 1;
  full_weeks := total_days / 7;
  remaining_days := total_days % 7;
  weekend_days := full_weeks * 2;

  start_dow := EXTRACT(DOW FROM start_date);
  end_dow := EXTRACT(DOW FROM end_date);

  -- Adjust for partial weeks
  IF remaining_days > 0 THEN
    IF start_dow = 0 THEN -- Sunday
      weekend_days := weekend_days + 1;
    ELSIF start_dow = 6 THEN -- Saturday
      weekend_days := weekend_days + 2;
    ELSIF start_dow + remaining_days > 6 THEN
      weekend_days := weekend_days + LEAST(2, start_dow + remaining_days - 6);
    END IF;
  END IF;

  RETURN GREATEST(0, total_days - weekend_days);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_business_days(DATE, DATE) IS 'Calculate number of business days (excluding weekends) between two dates';

-- Function to check leave overlap
CREATE OR REPLACE FUNCTION check_leave_overlap(
  p_employe_id UUID,
  p_date_debut DATE,
  p_date_fin DATE,
  p_exclude_id INTEGER DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM demandes_conges dc
    WHERE dc.employe_id = p_employe_id
      AND dc.statut IN ('PENDING', 'APPROVED')
      AND dc.id != COALESCE(p_exclude_id, -1)
      AND (
        (p_date_debut BETWEEN dc.date_debut AND dc.date_fin)
        OR (p_date_fin BETWEEN dc.date_debut AND dc.date_fin)
        OR (dc.date_debut BETWEEN p_date_debut AND p_date_fin)
      )
  );
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION check_leave_overlap IS 'Returns TRUE if the date range overlaps with existing pending/approved leaves';

-- Function to get current leave balance
CREATE OR REPLACE FUNCTION get_leave_balance(
  p_employe_id UUID,
  p_leave_type VARCHAR DEFAULT 'Congé Annuel'
)
RETURNS INTEGER AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  SELECT (lb.acquired + lb.carry_over - lb.used - lb.pending)
  INTO v_balance
  FROM leave_balances lb
  WHERE lb.employe_id = p_employe_id
    AND lb.year = EXTRACT(YEAR FROM CURRENT_DATE)
    AND lb.leave_type = p_leave_type;

  RETURN COALESCE(v_balance, 0);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_leave_balance IS 'Get available leave balance for an employee';

-- ============================================
-- 8. CREATE TRIGGER FOR AUDIT LOG
-- ============================================

-- Generic function to log HR changes
CREATE OR REPLACE FUNCTION hr_audit_trigger_fn()
RETURNS TRIGGER AS $$
DECLARE
  v_old_values JSONB;
  v_new_values JSONB;
  v_action VARCHAR(50);
  v_entity_type VARCHAR(50);
BEGIN
  -- Determine entity type from table name
  v_entity_type := TG_TABLE_NAME;

  -- Determine action
  IF TG_OP = 'INSERT' THEN
    v_action := 'created';
    v_old_values := NULL;
    v_new_values := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'updated';
    v_old_values := to_jsonb(OLD);
    v_new_values := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'deleted';
    v_old_values := to_jsonb(OLD);
    v_new_values := NULL;
  END IF;

  -- Insert audit log (actor info will be filled by application layer)
  INSERT INTO hr_audit_log (
    entity_type,
    entity_id,
    action,
    old_values,
    new_values,
    created_at
  ) VALUES (
    v_entity_type,
    COALESCE(NEW.id::text, OLD.id::text),
    v_action,
    v_old_values,
    v_new_values,
    NOW()
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for sensitive HR tables (optional - can be enabled per-table)
-- Uncomment to enable automatic audit logging:

-- CREATE TRIGGER tr_demandes_conges_audit
-- AFTER INSERT OR UPDATE OR DELETE ON demandes_conges
-- FOR EACH ROW EXECUTE FUNCTION hr_audit_trigger_fn();

-- CREATE TRIGGER tr_sanctions_audit
-- AFTER INSERT OR UPDATE OR DELETE ON sanctions
-- FOR EACH ROW EXECUTE FUNCTION hr_audit_trigger_fn();

-- CREATE TRIGGER tr_bulletins_paie_audit
-- AFTER INSERT OR UPDATE OR DELETE ON bulletins_paie
-- FOR EACH ROW EXECUTE FUNCTION hr_audit_trigger_fn();

-- ============================================
-- DONE
-- ============================================
