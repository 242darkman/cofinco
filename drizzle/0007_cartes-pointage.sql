CREATE TYPE "public"."statut_carte_pointage_enum" AS ENUM('ACTIVE', 'WITHDRAWN');--> statement-breakpoint
CREATE TYPE "public"."type_transaction_pointage_enum" AS ENUM('DEPOSIT', 'WITHDRAWAL');--> statement-breakpoint
CREATE TABLE "cartes_pointage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"client_id" uuid NOT NULL,
	"agence_id" uuid NOT NULL,
	"unit_amount" numeric(15, 2) NOT NULL,
	"devise" text DEFAULT 'XAF' NOT NULL,
	"completed_slots" integer DEFAULT 0 NOT NULL,
	"status" "statut_carte_pointage_enum" DEFAULT 'ACTIVE' NOT NULL,
	"withdrawn_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "ck_cartes_pointage_slots" CHECK ("cartes_pointage"."completed_slots" >= 0 AND "cartes_pointage"."completed_slots" <= 31),
	CONSTRAINT "ck_cartes_pointage_unit_amount" CHECK ("cartes_pointage"."unit_amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "transactions_pointage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"type" "type_transaction_pointage_enum" NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"commission_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"slot_number" integer,
	"payment_method" "methode_paiement_enum" NOT NULL,
	"session_caisse_id" uuid,
	"mouvement_financier_id" uuid,
	"idempotency_key" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ck_transactions_pointage_slot" CHECK ("transactions_pointage"."slot_number" IS NULL OR ("transactions_pointage"."slot_number" >= 1 AND "transactions_pointage"."slot_number" <= 31)),
	CONSTRAINT "ck_transactions_pointage_amount" CHECK ("transactions_pointage"."amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "cartes_pointage" ADD CONSTRAINT "cartes_pointage_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cartes_pointage" ADD CONSTRAINT "cartes_pointage_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cartes_pointage" ADD CONSTRAINT "cartes_pointage_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions_pointage" ADD CONSTRAINT "transactions_pointage_card_id_cartes_pointage_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cartes_pointage"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions_pointage" ADD CONSTRAINT "transactions_pointage_mouvement_financier_id_mouvements_financiers_id_fk" FOREIGN KEY ("mouvement_financier_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions_pointage" ADD CONSTRAINT "transactions_pointage_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cartes_pointage_reference" ON "cartes_pointage" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "idx_cartes_pointage_client_statut" ON "cartes_pointage" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "idx_cartes_pointage_agence_statut" ON "cartes_pointage" USING btree ("agence_id","status");--> statement-breakpoint
CREATE INDEX "idx_cartes_pointage_deleted_at" ON "cartes_pointage" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_transactions_pointage_idem" ON "transactions_pointage" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_transactions_pointage_card_slot" ON "transactions_pointage" USING btree ("card_id","slot_number");--> statement-breakpoint
CREATE INDEX "idx_transactions_pointage_card_date" ON "transactions_pointage" USING btree ("card_id","created_at");