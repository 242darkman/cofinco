-- Migration: notification_schedules
-- Adds scheduled reminder system for credit & tontine notifications

-- New enums
DO $$ BEGIN
  CREATE TYPE "notification_schedule_status_enum" AS ENUM ('PENDING', 'SENT', 'CANCELLED', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "schedule_source_type_enum" AS ENUM ('CREDIT', 'TONTINE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Notification schedules table
CREATE TABLE IF NOT EXISTS "notification_schedules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_type" "schedule_source_type_enum" NOT NULL,
  "source_id" uuid NOT NULL,
  "channel" "notification_channel_enum" DEFAULT 'SMS' NOT NULL,
  "template_code" text NOT NULL,
  "recipient" text NOT NULL,
  "scheduled_at" timestamp NOT NULL,
  "due_date" timestamp NOT NULL,
  "installment_index" integer DEFAULT 0 NOT NULL,
  "day_offset" integer DEFAULT 0 NOT NULL,
  "status" "notification_schedule_status_enum" DEFAULT 'PENDING' NOT NULL,
  "notification_job_id" uuid REFERENCES "notification_jobs"("id"),
  "payload" json,
  "schedule_version" integer DEFAULT 1 NOT NULL,
  "cancelled_at" timestamp,
  "cancel_reason" text,
  "user_id" uuid REFERENCES "users"("id"),
  "agence_id" uuid REFERENCES "agences"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS "idx_notif_sched_status_scheduled" ON "notification_schedules" ("status", "scheduled_at");
CREATE INDEX IF NOT EXISTS "idx_notif_sched_source" ON "notification_schedules" ("source_type", "source_id");
CREATE INDEX IF NOT EXISTS "idx_notif_sched_source_version" ON "notification_schedules" ("source_id", "schedule_version");
CREATE INDEX IF NOT EXISTS "idx_notif_sched_user" ON "notification_schedules" ("user_id");
