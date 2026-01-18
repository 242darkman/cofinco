-- Migration V2: Agency Migration System with Scheduling and Audit
-- =====================================================

-- Drop existing table if it exists (we're replacing it with a more robust version)
DROP TABLE IF EXISTS agency_migrations CASCADE;

-- =====================================================
-- MAIN MIGRATION TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS agency_migrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Unique reference for audit trail
  reference TEXT NOT NULL UNIQUE,

  -- Source agency (the one being closed)
  source_agency_id UUID NOT NULL REFERENCES agences(id),

  -- Target agencies (can be different for each type of entity)
  target_clients_agency_id UUID REFERENCES agences(id),
  target_employees_agency_id UUID REFERENCES agences(id),
  target_treasury_agency_id UUID REFERENCES agences(id),

  -- Status and progress
  status TEXT NOT NULL DEFAULT 'DRAFT',
  progress INTEGER NOT NULL DEFAULT 0,
  current_step TEXT,

  -- Scheduling
  scheduled_at TIMESTAMP,
  execution_started_at TIMESTAMP,

  -- Dry run (simulation)
  is_dry_run BOOLEAN NOT NULL DEFAULT FALSE,
  dry_run_result JSONB,

  -- Logs (immutable once written)
  logs JSONB DEFAULT '[]'::jsonb,

  -- Error handling
  error TEXT,
  error_details JSONB,
  can_retry BOOLEAN NOT NULL DEFAULT TRUE,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,

  -- Final report
  report JSONB,
  report_generated_at TIMESTAMP,
  report_document_id UUID,

  -- Audit trail
  created_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP,
  executed_by UUID REFERENCES users(id),

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,

  -- Locking (prevent modifications after start)
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  locked_at TIMESTAMP,

  -- Extensible metadata
  metadata JSONB
);

-- Indexes for agency_migrations
CREATE INDEX IF NOT EXISTS idx_agency_migration_status ON agency_migrations(status);
CREATE INDEX IF NOT EXISTS idx_agency_migration_source ON agency_migrations(source_agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_migration_scheduled ON agency_migrations(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_agency_migration_created ON agency_migrations(created_at);

-- =====================================================
-- PRE-FLIGHT CHECKS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS migration_pre_flight_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_id UUID NOT NULL REFERENCES agency_migrations(id) ON DELETE CASCADE,

  -- Check type
  check_type TEXT NOT NULL,

  -- Result
  passed BOOLEAN NOT NULL,
  blocking BOOLEAN NOT NULL DEFAULT TRUE,

  -- Details
  message TEXT,
  details JSONB,

  -- Resolution suggestion
  resolution TEXT,

  checked_at TIMESTAMP DEFAULT NOW(),
  checked_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_pre_flight_migration ON migration_pre_flight_checks(migration_id);
CREATE INDEX IF NOT EXISTS idx_pre_flight_type ON migration_pre_flight_checks(check_type);

-- =====================================================
-- ENTITY LOGS TABLE (for audit and potential rollback)
-- =====================================================
CREATE TABLE IF NOT EXISTS migration_entity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_id UUID NOT NULL REFERENCES agency_migrations(id) ON DELETE CASCADE,

  -- Entity being migrated
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,

  -- Before/after data
  previous_agency_id UUID NOT NULL,
  new_agency_id UUID NOT NULL,

  -- Snapshot for complete audit
  snapshot_before JSONB,

  -- Status
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error TEXT,

  migrated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entity_log_migration ON migration_entity_logs(migration_id);
CREATE INDEX IF NOT EXISTS idx_entity_log_type ON migration_entity_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_entity_log_entity ON migration_entity_logs(entity_type, entity_id);

-- =====================================================
-- AUDIT LOGS TABLE (immutable)
-- =====================================================
CREATE TABLE IF NOT EXISTS migration_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_id UUID NOT NULL REFERENCES agency_migrations(id) ON DELETE CASCADE,

  -- Action
  action TEXT NOT NULL,

  -- State before/after
  status_before TEXT,
  status_after TEXT,

  -- Details
  details JSONB NOT NULL,

  -- Actor
  user_id UUID REFERENCES users(id),
  user_role TEXT,
  user_name TEXT,

  -- Context
  ip_address TEXT,
  user_agent TEXT,

  -- Immutable timestamp
  timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_migration_audit_migration ON migration_audit_logs(migration_id);
CREATE INDEX IF NOT EXISTS idx_migration_audit_action ON migration_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_migration_audit_timestamp ON migration_audit_logs(timestamp);

-- =====================================================
-- UPDATE AGENCES TABLE TO SUPPORT NEW STATUSES
-- =====================================================
-- The "En fermeture" status is added to indicate an agency pending migration

-- Add constraint comment (PostgreSQL doesn't support enum modification easily)
COMMENT ON COLUMN agences.statut IS 'Statut de l''agence: Actif, Suspendu, En fermeture, Fermé';

-- =====================================================
-- GRANT PERMISSIONS (if using row-level security)
-- =====================================================
-- These may need to be adjusted based on your RLS policies

-- =====================================================
-- SEED DATA (optional - for testing)
-- =====================================================
-- No seed data required for production
