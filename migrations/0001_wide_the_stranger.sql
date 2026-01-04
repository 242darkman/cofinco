CREATE TABLE "user_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
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
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "caisse_pin" text;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;