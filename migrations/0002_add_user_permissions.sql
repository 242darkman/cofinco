-- Migration: Add user_permissions table for fine-grained access control
-- Date: 2025-12-27

CREATE TABLE IF NOT EXISTS "user_permissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "module_name" text NOT NULL,
  "peut_voir" boolean DEFAULT false NOT NULL,
  "peut_creer" boolean DEFAULT false NOT NULL,
  "peut_modifier" boolean DEFAULT false NOT NULL,
  "peut_supprimer" boolean DEFAULT false NOT NULL,
  "peut_valider" boolean DEFAULT false NOT NULL,
  "peut_exporter" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Create index for faster lookups by user_id
CREATE INDEX IF NOT EXISTS "idx_user_permissions_user_id" ON "user_permissions"("user_id");

-- Create unique constraint to prevent duplicate module permissions per user
CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_permissions_unique" ON "user_permissions"("user_id", "module_name");
