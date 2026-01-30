-- Agent Sub-Modules Tables
-- Tables for agent commissions, objectives, planning, reports, incidents, equipment, communications, and training

CREATE TABLE IF NOT EXISTS "agent_commissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL REFERENCES "agents_terrain"("id") ON DELETE CASCADE,
  "agence_id" uuid REFERENCES "agences"("id"),
  "periode" varchar(7) NOT NULL,
  "montant_collecte" numeric NOT NULL DEFAULT '0',
  "taux_commission" numeric NOT NULL DEFAULT '5.0',
  "montant_commission" numeric NOT NULL DEFAULT '0',
  "primes" numeric NOT NULL DEFAULT '0',
  "avances" numeric NOT NULL DEFAULT '0',
  "montant_net" numeric NOT NULL DEFAULT '0',
  "statut_paiement" text NOT NULL DEFAULT 'En attente',
  "date_paiement" timestamp,
  "methode_paiement" text,
  "notes" text DEFAULT '',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "deleted_at" timestamp
);

CREATE INDEX IF NOT EXISTS "idx_agent_commissions_agent" ON "agent_commissions" ("agent_id");
CREATE INDEX IF NOT EXISTS "idx_agent_commissions_periode" ON "agent_commissions" ("periode");
CREATE INDEX IF NOT EXISTS "idx_agent_commissions_agence" ON "agent_commissions" ("agence_id");

CREATE TABLE IF NOT EXISTS "agent_objectifs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL REFERENCES "agents_terrain"("id") ON DELETE CASCADE,
  "agence_id" uuid REFERENCES "agences"("id"),
  "periode" varchar(7) NOT NULL,
  "type_objectif" text NOT NULL DEFAULT 'Collecte',
  "valeur_objectif" numeric NOT NULL DEFAULT '0',
  "valeur_realisee" numeric NOT NULL DEFAULT '0',
  "unite" text NOT NULL DEFAULT 'FCFA',
  "statut" text NOT NULL DEFAULT 'IN_PROGRESS',
  "recompense" numeric NOT NULL DEFAULT '0',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "deleted_at" timestamp
);

CREATE INDEX IF NOT EXISTS "idx_agent_objectifs_agent" ON "agent_objectifs" ("agent_id");
CREATE INDEX IF NOT EXISTS "idx_agent_objectifs_periode" ON "agent_objectifs" ("periode");
CREATE INDEX IF NOT EXISTS "idx_agent_objectifs_agence" ON "agent_objectifs" ("agence_id");

CREATE TABLE IF NOT EXISTS "agent_plannings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL REFERENCES "agents_terrain"("id") ON DELETE CASCADE,
  "agence_id" uuid REFERENCES "agences"("id"),
  "date_planning" text NOT NULL,
  "heure_debut" text NOT NULL DEFAULT '08:00',
  "heure_fin" text NOT NULL DEFAULT '17:00',
  "type_activite" text NOT NULL DEFAULT 'Visite',
  "zone" text DEFAULT '',
  "statut" text NOT NULL DEFAULT 'PLANNED',
  "notes" text DEFAULT '',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "deleted_at" timestamp
);

CREATE INDEX IF NOT EXISTS "idx_agent_plannings_agent" ON "agent_plannings" ("agent_id");
CREATE INDEX IF NOT EXISTS "idx_agent_plannings_date" ON "agent_plannings" ("date_planning");
CREATE INDEX IF NOT EXISTS "idx_agent_plannings_agence" ON "agent_plannings" ("agence_id");

CREATE TABLE IF NOT EXISTS "agent_rapports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL REFERENCES "agents_terrain"("id") ON DELETE CASCADE,
  "agence_id" uuid REFERENCES "agences"("id"),
  "periode_debut" text NOT NULL,
  "periode_fin" text NOT NULL,
  "type_rapport" text NOT NULL DEFAULT 'Mensuel',
  "nombre_visites" integer NOT NULL DEFAULT 0,
  "nombre_collectes" integer NOT NULL DEFAULT 0,
  "montant_total_collecte" numeric NOT NULL DEFAULT '0',
  "taux_reussite" numeric NOT NULL DEFAULT '0',
  "clients_nouveaux" integer NOT NULL DEFAULT 0,
  "incidents" integer NOT NULL DEFAULT 0,
  "km_parcourus" numeric NOT NULL DEFAULT '0',
  "notes" text DEFAULT '',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "deleted_at" timestamp
);

CREATE INDEX IF NOT EXISTS "idx_agent_rapports_agent" ON "agent_rapports" ("agent_id");
CREATE INDEX IF NOT EXISTS "idx_agent_rapports_type" ON "agent_rapports" ("type_rapport");
CREATE INDEX IF NOT EXISTS "idx_agent_rapports_agence" ON "agent_rapports" ("agence_id");

CREATE TABLE IF NOT EXISTS "agent_incidents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL REFERENCES "agents_terrain"("id") ON DELETE CASCADE,
  "agence_id" uuid REFERENCES "agences"("id"),
  "type_incident" text NOT NULL DEFAULT 'Autre',
  "gravite" text NOT NULL DEFAULT 'Moyenne',
  "description" text NOT NULL,
  "date_incident" text NOT NULL,
  "localisation" text DEFAULT '',
  "statut" text NOT NULL DEFAULT 'OPEN',
  "resolution" text DEFAULT '',
  "date_resolution" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "deleted_at" timestamp
);

CREATE INDEX IF NOT EXISTS "idx_agent_incidents_agent" ON "agent_incidents" ("agent_id");
CREATE INDEX IF NOT EXISTS "idx_agent_incidents_statut" ON "agent_incidents" ("statut");
CREATE INDEX IF NOT EXISTS "idx_agent_incidents_agence" ON "agent_incidents" ("agence_id");

CREATE TABLE IF NOT EXISTS "agent_materiel" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL REFERENCES "agents_terrain"("id") ON DELETE CASCADE,
  "agence_id" uuid REFERENCES "agences"("id"),
  "type_materiel" text NOT NULL DEFAULT 'Tablette',
  "nom_materiel" text NOT NULL,
  "numero_serie" text DEFAULT '',
  "date_attribution" text NOT NULL,
  "date_retour" text,
  "etat" text NOT NULL DEFAULT 'Neuf',
  "valeur" numeric NOT NULL DEFAULT '0',
  "notes" text DEFAULT '',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "deleted_at" timestamp
);

CREATE INDEX IF NOT EXISTS "idx_agent_materiel_agent" ON "agent_materiel" ("agent_id");
CREATE INDEX IF NOT EXISTS "idx_agent_materiel_etat" ON "agent_materiel" ("etat");
CREATE INDEX IF NOT EXISTS "idx_agent_materiel_agence" ON "agent_materiel" ("agence_id");

CREATE TABLE IF NOT EXISTS "agent_communications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "expediteur_id" text NOT NULL,
  "destinataire_id" uuid NOT NULL,
  "agence_id" uuid REFERENCES "agences"("id"),
  "type_message" text NOT NULL DEFAULT 'Info',
  "sujet" text NOT NULL,
  "message" text NOT NULL,
  "priorite" text NOT NULL DEFAULT 'Normale',
  "lu" boolean NOT NULL DEFAULT false,
  "date_lecture" timestamp,
  "piece_jointe_url" text DEFAULT '',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "deleted_at" timestamp
);

CREATE INDEX IF NOT EXISTS "idx_agent_communications_dest" ON "agent_communications" ("destinataire_id");
CREATE INDEX IF NOT EXISTS "idx_agent_communications_exp" ON "agent_communications" ("expediteur_id");
CREATE INDEX IF NOT EXISTS "idx_agent_communications_agence" ON "agent_communications" ("agence_id");

CREATE TABLE IF NOT EXISTS "agent_formations_catalogue" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "titre" text NOT NULL,
  "description" text DEFAULT '',
  "type_formation" text NOT NULL DEFAULT 'Continue',
  "duree_heures" integer NOT NULL DEFAULT 1,
  "contenu_url" text DEFAULT '',
  "obligatoire" boolean NOT NULL DEFAULT false,
  "agence_id" uuid REFERENCES "agences"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "deleted_at" timestamp
);

CREATE INDEX IF NOT EXISTS "idx_agent_formations_cat_type" ON "agent_formations_catalogue" ("type_formation");
CREATE INDEX IF NOT EXISTS "idx_agent_formations_cat_agence" ON "agent_formations_catalogue" ("agence_id");

CREATE TABLE IF NOT EXISTS "agent_formations_suivi" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL REFERENCES "agents_terrain"("id") ON DELETE CASCADE,
  "formation_id" uuid NOT NULL REFERENCES "agent_formations_catalogue"("id") ON DELETE CASCADE,
  "date_debut" text,
  "date_fin" text,
  "progression" integer NOT NULL DEFAULT 0,
  "statut" text NOT NULL DEFAULT 'IN_PROGRESS',
  "score" integer,
  "certificat_url" text DEFAULT '',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "deleted_at" timestamp
);

CREATE INDEX IF NOT EXISTS "idx_agent_formations_suivi_agent" ON "agent_formations_suivi" ("agent_id");
CREATE INDEX IF NOT EXISTS "idx_agent_formations_suivi_formation" ON "agent_formations_suivi" ("formation_id");
