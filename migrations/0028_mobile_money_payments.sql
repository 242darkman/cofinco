-- Migration: Add Mobile Money Payment Tables
-- Description: Creates payment_intents and provider_events tables for MTN/Airtel integration

-- ============================================
-- ENUMS
-- ============================================

-- Mobile Money Provider
DO $$ BEGIN
    CREATE TYPE mobile_money_provider_enum AS ENUM ('MTN', 'AIRTEL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Payment Intent Type
DO $$ BEGIN
    CREATE TYPE type_payment_intent_enum AS ENUM ('COLLECTION', 'PAYOUT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Payment Intent Status
DO $$ BEGIN
    CREATE TYPE statut_payment_intent_enum AS ENUM (
        'CREATED',
        'PENDING',
        'SUCCESS',
        'FAILED',
        'EXPIRED',
        'CANCELLED',
        'REVERSED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add MOBILE_MONEY to source_module_enum if not exists
DO $$ BEGIN
    ALTER TYPE source_module_enum ADD VALUE IF NOT EXISTS 'MOBILE_MONEY';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- PAYMENT INTENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS payment_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    agence_id UUID REFERENCES agences(id) ON DELETE SET NULL,

    -- Provider info
    provider mobile_money_provider_enum NOT NULL,
    type type_payment_intent_enum NOT NULL,
    status statut_payment_intent_enum NOT NULL DEFAULT 'CREATED',

    -- Transaction details
    amount NUMERIC NOT NULL,
    currency TEXT NOT NULL DEFAULT 'XAF',
    phone TEXT NOT NULL,

    -- References
    external_ref UUID NOT NULL DEFAULT gen_random_uuid(),
    provider_ref TEXT,
    provider_txn_id TEXT,

    -- Linked entities
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    compte_id UUID REFERENCES comptes(id) ON DELETE SET NULL,
    credit_id UUID REFERENCES credits(id) ON DELETE SET NULL,
    tontine_id UUID,
    remboursement_id UUID,

    -- Ledger link
    mouvement_id UUID REFERENCES mouvements_financiers(id) ON DELETE SET NULL,

    -- Callbacks
    callback_url TEXT,

    -- Idempotency
    idempotency_key TEXT,

    -- Error tracking
    error_code TEXT,
    error_message TEXT,

    -- Metadata
    metadata JSONB,

    -- Timestamps
    initiated_at TIMESTAMP,
    confirmed_at TIMESTAMP,
    expire_at TIMESTAMP,

    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT chk_payment_intents_amount_pos CHECK (amount > 0)
);

-- Indexes for payment_intents
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_intents_external_ref
    ON payment_intents(external_ref);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_intents_idempotency
    ON payment_intents(idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_intents_provider_ref
    ON payment_intents(provider_ref)
    WHERE provider_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_intents_status_provider
    ON payment_intents(status, provider);

CREATE INDEX IF NOT EXISTS idx_payment_intents_client_id
    ON payment_intents(client_id)
    WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_intents_agence_status
    ON payment_intents(agence_id, status)
    WHERE agence_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_intents_pending
    ON payment_intents(status, initiated_at)
    WHERE status = 'PENDING';

-- ============================================
-- PROVIDER EVENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS provider_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    provider mobile_money_provider_enum NOT NULL,
    event_type TEXT NOT NULL,

    provider_ref TEXT,
    external_ref UUID,

    payload JSONB NOT NULL,
    signature TEXT,

    -- Processing status
    processed BOOLEAN NOT NULL DEFAULT FALSE,
    processed_at TIMESTAMP,
    processing_error TEXT,

    -- Linked payment intent
    payment_intent_id UUID REFERENCES payment_intents(id) ON DELETE SET NULL,

    received_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for provider_events
CREATE INDEX IF NOT EXISTS idx_provider_events_provider_ref
    ON provider_events(provider, provider_ref)
    WHERE provider_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_provider_events_external_ref
    ON provider_events(external_ref)
    WHERE external_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_provider_events_unprocessed
    ON provider_events(processed, received_at)
    WHERE processed = FALSE;

CREATE INDEX IF NOT EXISTS idx_provider_events_payment_intent_id
    ON provider_events(payment_intent_id)
    WHERE payment_intent_id IS NOT NULL;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE payment_intents IS 'Mobile Money payment intentions with async lifecycle (MTN/Airtel)';
COMMENT ON COLUMN payment_intents.external_ref IS 'Our unique UUID sent to the provider';
COMMENT ON COLUMN payment_intents.provider_ref IS 'Reference ID returned by the provider';
COMMENT ON COLUMN payment_intents.provider_txn_id IS 'Final transaction ID from provider confirmation';
COMMENT ON COLUMN payment_intents.mouvement_id IS 'Link to ledger entry (created on SUCCESS)';

COMMENT ON TABLE provider_events IS 'Raw webhook/callback logs from Mobile Money providers';
COMMENT ON COLUMN provider_events.payload IS 'Raw webhook payload for audit trail';
COMMENT ON COLUMN provider_events.processed IS 'Whether the event has been processed';
