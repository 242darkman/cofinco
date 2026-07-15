CREATE TABLE "device_sync_states" (
	"device_id" text PRIMARY KEY NOT NULL,
	"agent_id" uuid NOT NULL,
	"agence_id" uuid,
	"reported_pending_count" integer DEFAULT 0 NOT NULL,
	"last_handshake_at" timestamp,
	"last_upload_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "villes_reference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"geoname_id" integer NOT NULL,
	"nom" text NOT NULL,
	"nom_ascii" text,
	"pays_id" uuid,
	"country_code" char(2),
	"admin1_code" text,
	"population" integer,
	"feature_code" text,
	"latitude" numeric,
	"longitude" numeric,
	"timezone" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "device_sync_states" ADD CONSTRAINT "device_sync_states_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "villes_reference" ADD CONSTRAINT "villes_reference_pays_id_pays_id_fk" FOREIGN KEY ("pays_id") REFERENCES "public"."pays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_dss_agent" ON "device_sync_states" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_dss_agence" ON "device_sync_states" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_dss_pending" ON "device_sync_states" USING btree ("reported_pending_count");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_villes_reference_geoname_id" ON "villes_reference" USING btree ("geoname_id");--> statement-breakpoint
CREATE INDEX "idx_villes_reference_pays_nom_ascii" ON "villes_reference" USING btree ("pays_id","nom_ascii");--> statement-breakpoint
CREATE INDEX "idx_villes_reference_pays_population" ON "villes_reference" USING btree ("pays_id","population");--> statement-breakpoint
CREATE INDEX "idx_villes_reference_country" ON "villes_reference" USING btree ("country_code");