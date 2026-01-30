-- Migration: Add BI_MONTHLY and QUARTERLY to frequence_virement_enum
-- These values support bimensuel (2×/mois: 1er ↔ 15) and quarterly auto-transfers

ALTER TYPE frequence_virement_enum ADD VALUE IF NOT EXISTS 'BI_MONTHLY';
ALTER TYPE frequence_virement_enum ADD VALUE IF NOT EXISTS 'QUARTERLY';
