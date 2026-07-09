CREATE TABLE "deployment_identity" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"tenant_id" text NOT NULL,
	"claimed_at" timestamp DEFAULT now() NOT NULL,
	"last_verified_at" timestamp
);
