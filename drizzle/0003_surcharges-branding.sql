CREATE TABLE "tenant_branding_overrides" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"reason" text,
	"updated_by" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_branding_overrides" ADD CONSTRAINT "tenant_branding_overrides_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;