-- Migration: Add Caisse Admin Event Types
-- Description: Adds new event types to support force-closing sessions and real-time caisse status updates

-- ============================================================================
-- Add new event types to type_evenement_enum
-- ============================================================================

-- Add SESSION_FORCE_CLOSED event type
ALTER TYPE type_evenement_enum ADD VALUE IF NOT EXISTS 'SESSION_FORCE_CLOSED';

-- Add CAISSE_STATUS_CHANGED event type
ALTER TYPE type_evenement_enum ADD VALUE IF NOT EXISTS 'CAISSE_STATUS_CHANGED';

-- Add CAISSE_LIQUIDATED event type
ALTER TYPE type_evenement_enum ADD VALUE IF NOT EXISTS 'CAISSE_LIQUIDATED';

-- ============================================================================
-- Add COFFRE to source_module_enum
-- ============================================================================

-- Add COFFRE source module
ALTER TYPE source_module_enum ADD VALUE IF NOT EXISTS 'COFFRE';

-- ============================================================================
-- Comments for documentation
-- ============================================================================

COMMENT ON TYPE type_evenement_enum IS 
  'Event types for the outbox pattern. Includes:
  - SESSION_FORCE_CLOSED: Admin forcibly closed a session
  - CAISSE_STATUS_CHANGED: Real-time caisse status update';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
