CREATE TABLE "tenant_feature_overrides" (
	"feature" text PRIMARY KEY NOT NULL,
	"enabled" boolean NOT NULL,
	"reason" text,
	"updated_by" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_feature_overrides" ADD CONSTRAINT "tenant_feature_overrides_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;