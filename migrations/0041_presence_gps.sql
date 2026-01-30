-- GPS columns for presence tracking
ALTER TABLE presences
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS accuracy DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS gps_source VARCHAR(20) DEFAULT 'manual';
  -- gps_source: 'gps' | 'wifi' | 'manual' (no GPS captured)

-- Sanctions workflow columns
ALTER TABLE sanctions
  ADD COLUMN IF NOT EXISTS statut_workflow VARCHAR(30) DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS appealed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS appeal_reason TEXT,
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS finalized_by UUID REFERENCES users(id) ON DELETE SET NULL;
  -- workflow: DRAFT -> NOTIFIED -> ACKNOWLEDGED -> APPEALED -> FINAL
