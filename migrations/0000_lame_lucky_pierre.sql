CREATE TABLE "plan_comptable" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero_compte" text NOT NULL,
	"intitule" text NOT NULL,
	"classe" integer NOT NULL,
	"type_compte" text NOT NULL,
	"sens_normal" text,
	"niveau" integer DEFAULT 1,
	"parent_compte" text,
	"report_a_nouveau" boolean DEFAULT false,
	"actif" boolean DEFAULT true,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "plan_comptable_numero_compte_unique" UNIQUE("numero_compte")
);
--> statement-breakpoint
CREATE TABLE "declarations_tva" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mois" integer NOT NULL,
	"annee" integer NOT NULL,
	"tva_collectee" numeric DEFAULT '0' NOT NULL,
	"tva_deductible" numeric DEFAULT '0' NOT NULL,
	"tva_a_payer" numeric DEFAULT '0' NOT NULL,
	"credit_tva" numeric DEFAULT '0' NOT NULL,
	"statut" text DEFAULT 'Brouillon' NOT NULL,
	"numero_quittance" text,
	"date_depot" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ecritures_comptables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exercice_id" uuid,
	"journal_id" uuid NOT NULL,
	"date_ecriture" date NOT NULL,
	"numero_piece" text NOT NULL,
	"libelle" text NOT NULL,
	"statut" text DEFAULT 'Brouillon',
	"validated_by" uuid,
	"validated_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "exercices_comptables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"date_debut" date NOT NULL,
	"date_fin" date NOT NULL,
	"statut" text DEFAULT 'Ouvert' NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "exercices_comptables_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "journaux_comptables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"intitule" text NOT NULL,
	"type_journal" text NOT NULL,
	"compte_contrepartie" text,
	"actif" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "journaux_comptables_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "lignes_ecritures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ecriture_id" uuid NOT NULL,
	"compte_id" uuid NOT NULL,
	"numero_compte" text NOT NULL,
	"libelle" text,
	"debit" numeric DEFAULT '0' NOT NULL,
	"credit" numeric DEFAULT '0' NOT NULL,
	"ref_externe" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"ip_address" text,
	"success" boolean DEFAULT false NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"nom" text NOT NULL,
	"prenom" text,
	"email" text,
	"telephone" text,
	"photo_profile" text,
	"role" text DEFAULT 'agent' NOT NULL,
	"agence" text,
	"statut" text DEFAULT 'Actif' NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"last_latitude" text,
	"last_longitude" text,
	"matricule" varchar,
	"poste" varchar,
	"departement" varchar,
	"date_embauche" date,
	"type_contrat" varchar DEFAULT 'CDI',
	"manager_id" uuid,
	"salaire_base" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"mime_type" text,
	"taille" integer,
	"chemin" text NOT NULL,
	"object_path" text,
	"parent_id" uuid,
	"categorie" text DEFAULT 'general' NOT NULL,
	"reference_id" uuid,
	"reference_type" text,
	"visibilite" text DEFAULT 'prive' NOT NULL,
	"tags" text[],
	"uploaded_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matricule" text NOT NULL,
	"nom" text NOT NULL,
	"prenom" text NOT NULL,
	"email" text,
	"phone" text,
	"date_naissance" text,
	"sexe" text DEFAULT 'M' NOT NULL,
	"adresse" text,
	"ville" text,
	"date_embauche" text NOT NULL,
	"departement" text,
	"poste" text NOT NULL,
	"type_contrat" text DEFAULT 'CDI' NOT NULL,
	"salaire_base" numeric DEFAULT '0' NOT NULL,
	"numero_cnss" text,
	"statut" text DEFAULT 'Actif' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "employes_matricule_unique" UNIQUE("matricule")
);
--> statement-breakpoint
CREATE TABLE "loge_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"quota_total" bigint DEFAULT 4398046511104,
	"quota_utilise" bigint DEFAULT 0,
	"retention_jours" integer DEFAULT 365,
	"sauvegarde_auto" boolean DEFAULT true,
	"frequence_sauvegarde" text DEFAULT 'daily',
	"compression_enabled" boolean DEFAULT true,
	"encryption_enabled" boolean DEFAULT true,
	"loge_password_required" boolean DEFAULT true,
	"archivage_auto_exports" boolean DEFAULT true,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ordres_bourse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portefeuille_id" uuid NOT NULL,
	"type" text NOT NULL,
	"type_ordre" text DEFAULT 'market' NOT NULL,
	"symbole" text NOT NULL,
	"nom" text NOT NULL,
	"quantite" numeric NOT NULL,
	"prix_limite" numeric,
	"prix_stop" numeric,
	"prix_execution" numeric,
	"montant_total" numeric,
	"frais" numeric DEFAULT '0',
	"devise" text DEFAULT 'USD' NOT NULL,
	"statut" text DEFAULT 'en_attente' NOT NULL,
	"motif_annulation" text,
	"date_expiration" timestamp,
	"execution_partielle" boolean DEFAULT false,
	"quantite_executee" numeric DEFAULT '0',
	"created_at" timestamp DEFAULT now(),
	"executed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "portefeuilles_bourse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"nom" text DEFAULT 'Mon Portefeuille' NOT NULL,
	"devise" text DEFAULT 'XAF' NOT NULL,
	"solde_disponible" numeric DEFAULT '0' NOT NULL,
	"valeur_totale" numeric DEFAULT '0' NOT NULL,
	"gain_perte" numeric DEFAULT '0' NOT NULL,
	"gain_perte_percent" numeric DEFAULT '0' NOT NULL,
	"statut" text DEFAULT 'actif' NOT NULL,
	"profil_risque" text DEFAULT 'modere',
	"objectif_investissement" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "positions_bourse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portefeuille_id" uuid NOT NULL,
	"symbole" text NOT NULL,
	"nom" text NOT NULL,
	"quantite" numeric NOT NULL,
	"prix_achat_moyen" numeric NOT NULL,
	"prix_actuel" numeric DEFAULT '0' NOT NULL,
	"valeur_actuelle" numeric DEFAULT '0' NOT NULL,
	"gain_perte" numeric DEFAULT '0' NOT NULL,
	"gain_perte_percent" numeric DEFAULT '0' NOT NULL,
	"devise" text DEFAULT 'USD' NOT NULL,
	"marche" text DEFAULT 'NYSE',
	"secteur" text,
	"date_premiere_achat" timestamp DEFAULT now(),
	"derniere_mise_a_jour" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "transactions_bourse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portefeuille_id" uuid NOT NULL,
	"ordre_id" uuid,
	"type" text NOT NULL,
	"symbole" text,
	"quantite" numeric,
	"prix" numeric,
	"montant" numeric NOT NULL,
	"frais" numeric DEFAULT '0',
	"devise" text DEFAULT 'XAF' NOT NULL,
	"taux_change" numeric DEFAULT '1',
	"description" text,
	"reference" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "watchlist_bourse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"symbole" text NOT NULL,
	"nom" text NOT NULL,
	"marche" text DEFAULT 'NYSE',
	"alerte_prix_haut" numeric,
	"alerte_prix_bas" numeric,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "client_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"metadata" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "client_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"prenom" text,
	"email" text,
	"telephone" text NOT NULL,
	"adresse" text,
	"adresse_domicile" text,
	"lieu_activite" text,
	"ville" text,
	"pays" text DEFAULT 'République du Congo',
	"date_naissance" text,
	"numero_piece" text,
	"type_piece" text,
	"profession" text,
	"employeur" text,
	"revenu_mensuel" numeric,
	"photo_url" text,
	"photo_profile" text,
	"type_marche_id" uuid,
	"latitude" numeric,
	"longitude" numeric,
	"status" text DEFAULT 'Actif' NOT NULL,
	"segment" text DEFAULT 'Standard' NOT NULL,
	"frequence_carte" text DEFAULT 'Journalier',
	"score" integer DEFAULT 50,
	"credit_total" numeric DEFAULT '0',
	"epargne_total" numeric DEFAULT '0',
	"taux_remboursement" numeric DEFAULT '100',
	"points_fidelite" integer DEFAULT 0,
	"agence" text,
	"date_inscription" timestamp DEFAULT now(),
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#000000',
	"type" text DEFAULT 'general',
	"created_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	CONSTRAINT "tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "types_marches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"description" text,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "types_marches_nom_unique" UNIQUE("nom")
);
--> statement-breakpoint
CREATE TABLE "comptes_epargne" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"numero_compte" text NOT NULL,
	"type_compte" text NOT NULL,
	"solde" numeric DEFAULT '0' NOT NULL,
	"taux_interet" numeric NOT NULL,
	"date_ouverture" timestamp DEFAULT now(),
	"statut" text DEFAULT 'Actif' NOT NULL,
	"objectif_epargne" numeric,
	"date_objectif" timestamp,
	"versement_mensuel" numeric,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	CONSTRAINT "comptes_epargne_numero_compte_unique" UNIQUE("numero_compte")
);
--> statement-breakpoint
CREATE TABLE "credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"enquete_id" uuid,
	"montant" numeric NOT NULL,
	"taux" numeric NOT NULL,
	"duree" integer NOT NULL,
	"type_credit" text NOT NULL,
	"objet_credit" text,
	"statut" text DEFAULT 'En attente' NOT NULL,
	"date_debut" timestamp,
	"date_fin" timestamp,
	"date_solvabilite" timestamp,
	"date_solde" timestamp,
	"solde_avant_2_mois" boolean DEFAULT false,
	"solde_restant" numeric,
	"echeance" text DEFAULT 'Mensuel',
	"garanties" text,
	"observations" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "demandes_credit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"montant_demande" numeric NOT NULL,
	"taux_interet" numeric NOT NULL,
	"duree_mois" integer NOT NULL,
	"type_credit" text,
	"objet_credit" text NOT NULL,
	"frequence_remboursement" text DEFAULT 'Mensuel',
	"revenus_mensuels" numeric,
	"charges_mensuelles" numeric,
	"score_credit" integer,
	"montant_approuve" numeric,
	"statut" text DEFAULT 'En attente' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "enquetes_credit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"demande_id" uuid,
	"montant_demande" numeric NOT NULL,
	"objet_credit" text NOT NULL,
	"revenu_mensuel" numeric,
	"charges_mensuelles" numeric,
	"autre_prets" numeric DEFAULT '0',
	"personnes_charge" integer DEFAULT 0,
	"type_habitation" text,
	"anciennete_activite" integer,
	"evaluation_activite" text,
	"capacite_remboursement" numeric,
	"score_global" integer,
	"recommandation" text,
	"statut" text DEFAULT 'En cours' NOT NULL,
	"observations" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "interest_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"code" text NOT NULL,
	"taux_annuel" numeric NOT NULL,
	"taux_mensuel" numeric,
	"type" text DEFAULT 'credit',
	"actif" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "interest_rates_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "objectifs_epargne" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"compte_id" uuid NOT NULL,
	"nom" text NOT NULL,
	"montant_cible" numeric NOT NULL,
	"montant_actuel" numeric DEFAULT '0' NOT NULL,
	"date_cible" timestamp NOT NULL,
	"description" text,
	"statut" text DEFAULT 'En cours' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "operations_caisse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"type_operation" text NOT NULL,
	"montant" numeric NOT NULL,
	"mode_paiement" text DEFAULT 'Espèces' NOT NULL,
	"reference" text NOT NULL,
	"description" text,
	"client_id" uuid,
	"compte_id" uuid,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "plans_epargne" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"credit_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"compte_epargne_id" uuid,
	"montant_mensuel" numeric NOT NULL,
	"duree" integer NOT NULL,
	"montant_total" numeric NOT NULL,
	"date_debut" timestamp NOT NULL,
	"date_fin" timestamp NOT NULL,
	"statut" text DEFAULT 'Actif' NOT NULL,
	"observations" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "remboursements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"credit_id" uuid NOT NULL,
	"montant" numeric NOT NULL,
	"date_remboursement" timestamp NOT NULL,
	"methode_paiement" text DEFAULT 'Espèces' NOT NULL,
	"numero_transaction" text,
	"recu" text,
	"observations" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions_caisse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"caissier_id" uuid NOT NULL,
	"date_ouverture" timestamp DEFAULT now(),
	"date_fermeture" timestamp,
	"solde_initial" numeric DEFAULT '0' NOT NULL,
	"solde_theorique" numeric DEFAULT '0' NOT NULL,
	"solde_reel" numeric,
	"ecart" numeric,
	"statut" text DEFAULT 'Ouverte' NOT NULL,
	"observations" text,
	"billetage_ouverture" json,
	"billetage_fermeture" json,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "transactions_epargne" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"compte_id" uuid NOT NULL,
	"type_transaction" text NOT NULL,
	"montant" numeric NOT NULL,
	"solde_apres" numeric NOT NULL,
	"methode_paiement" text DEFAULT 'Espèces',
	"reference" text,
	"observations" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "avantages" (
	"id" serial PRIMARY KEY NOT NULL,
	"nom" varchar NOT NULL,
	"type" varchar NOT NULL,
	"montant_par_defaut" integer DEFAULT 0,
	"description" text,
	"eligible_contrats" json,
	"actif" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "avantages_employes" (
	"id" serial PRIMARY KEY NOT NULL,
	"employe_id" uuid NOT NULL,
	"avantage_id" integer NOT NULL,
	"montant" integer NOT NULL,
	"date_attribution" date DEFAULT now() NOT NULL,
	"statut" varchar DEFAULT 'Actif'
);
--> statement-breakpoint
CREATE TABLE "bulletins_paie" (
	"id" serial PRIMARY KEY NOT NULL,
	"employe_id" uuid NOT NULL,
	"employe_nom" varchar NOT NULL,
	"mois" varchar NOT NULL,
	"salaire_base" varchar NOT NULL,
	"prime_anciennete" varchar DEFAULT '0',
	"prime_transport" varchar DEFAULT '0',
	"prime_rendement" varchar DEFAULT '0',
	"autres_primes" varchar DEFAULT '0',
	"salaire_brut" varchar NOT NULL,
	"cnss_employe" varchar NOT NULL,
	"ipr" varchar NOT NULL,
	"autres_retenues" varchar DEFAULT '0',
	"total_retenues" varchar NOT NULL,
	"salaire_net" varchar NOT NULL,
	"cnss_patronale" varchar NOT NULL,
	"pdf_url" varchar,
	"pdf_hash" varchar,
	"genere_par_id" uuid,
	"statut" varchar DEFAULT 'Brouillon',
	"date_paiement" date,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidatures" (
	"id" serial PRIMARY KEY NOT NULL,
	"nom" varchar NOT NULL,
	"prenom" varchar NOT NULL,
	"email" varchar NOT NULL,
	"telephone" varchar,
	"poste_vise" varchar NOT NULL,
	"experience" text,
	"formation" text,
	"date_postulation" date DEFAULT now() NOT NULL,
	"statut" varchar DEFAULT 'En attente' NOT NULL,
	"cv_url" varchar,
	"lettre_motivation_url" varchar,
	"notes" text,
	"date_entretien" date,
	"responsable_rh_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demandes_conges" (
	"id" serial PRIMARY KEY NOT NULL,
	"employe_id" uuid NOT NULL,
	"employe_nom" varchar NOT NULL,
	"type" varchar NOT NULL,
	"date_debut" date NOT NULL,
	"date_fin" date NOT NULL,
	"motif" text,
	"statut" varchar DEFAULT 'En attente' NOT NULL,
	"approuve_par" uuid,
	"date_decision" timestamp,
	"commentaire" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "formation_participants" (
	"formation_id" integer NOT NULL,
	"employe_id" uuid NOT NULL,
	"employe_nom" varchar NOT NULL,
	"date_inscription" timestamp DEFAULT now() NOT NULL,
	"presence" varchar DEFAULT 'Non noté',
	"evaluation" text
);
--> statement-breakpoint
CREATE TABLE "formations" (
	"id" serial PRIMARY KEY NOT NULL,
	"titre" varchar NOT NULL,
	"formateur" varchar NOT NULL,
	"date_debut" date NOT NULL,
	"date_fin" date,
	"duree" varchar NOT NULL,
	"lieu" varchar,
	"description" text,
	"programme" text,
	"statut" varchar DEFAULT 'Planifiée' NOT NULL,
	"capacite_max" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "presences" (
	"id" serial PRIMARY KEY NOT NULL,
	"employe_id" uuid NOT NULL,
	"date" date NOT NULL,
	"statut" varchar NOT NULL,
	"heure_arrivee" timestamp,
	"heure_depart" timestamp,
	"retard_justifie" boolean DEFAULT false,
	"commentaire" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sanctions" (
	"id" serial PRIMARY KEY NOT NULL,
	"employe_id" uuid NOT NULL,
	"employe_nom" varchar NOT NULL,
	"type" varchar NOT NULL,
	"motif" text NOT NULL,
	"date" date NOT NULL,
	"gravite" varchar NOT NULL,
	"emetteur_id" uuid,
	"documents_joints" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"resource" text NOT NULL,
	"resource_id" text,
	"details" json,
	"ip_address" text,
	"user_agent" text,
	"status" text DEFAULT 'success' NOT NULL,
	"risk_level" text DEFAULT 'low',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"nom" text NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"rollout_percentage" integer DEFAULT 100,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "feature_flags_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"email_enabled" boolean DEFAULT true,
	"sms_enabled" boolean DEFAULT true,
	"push_enabled" boolean DEFAULT true,
	"types" json,
	"schedule" json,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"type" text NOT NULL,
	"titre" text NOT NULL,
	"message" text NOT NULL,
	"lien" text,
	"priorite" text DEFAULT 'normale' NOT NULL,
	"lue" boolean DEFAULT false NOT NULL,
	"reference_id" uuid,
	"reference_type" text,
	"created_at" timestamp DEFAULT now(),
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "push_notification_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid,
	"title" text,
	"body" text,
	"status" text,
	"error" text,
	"sent_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"expiration_time" timestamp,
	"device_info" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "security_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"password_min_length" integer DEFAULT 8,
	"password_require_uppercase" boolean DEFAULT true,
	"password_require_lowercase" boolean DEFAULT true,
	"password_require_numbers" boolean DEFAULT true,
	"password_require_special" boolean DEFAULT true,
	"session_timeout_minutes" integer DEFAULT 30,
	"max_login_attempts" integer DEFAULT 5,
	"lockout_duration_minutes" integer DEFAULT 15,
	"two_factor_enabled" boolean DEFAULT false,
	"ip_whitelist_enabled" boolean DEFAULT false,
	"audit_log_enabled" boolean DEFAULT true,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sms_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid,
	"phone_number" text NOT NULL,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider" text,
	"provider_message_id" text,
	"error_message" text,
	"related_entity_id" uuid,
	"related_entity_type" text,
	"created_by" uuid,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sms_provider_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text DEFAULT 'manual',
	"provider_name" text DEFAULT 'infobip',
	"api_key" text,
	"api_url" text,
	"sender_id" text,
	"username" text,
	"password" text,
	"balance" numeric,
	"last_check" timestamp,
	"enabled" boolean DEFAULT true,
	"is_primary" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"settings" json,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sms_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"nom" text NOT NULL,
	"contenu" text NOT NULL,
	"placeholders" text,
	"description" text,
	"actif" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "sms_templates_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_name" text DEFAULT 'COFIN - Microfinance',
	"agence_code" text,
	"devise" text DEFAULT 'XAF',
	"pays" text DEFAULT 'République du Congo',
	"adresse" text,
	"telephone" text,
	"email" text,
	"session_timeout" integer DEFAULT 30,
	"max_login_attempts" integer DEFAULT 5,
	"password_min_length" integer DEFAULT 6,
	"backup_frequency" text DEFAULT 'daily',
	"auto_backup_enabled" boolean DEFAULT true,
	"notification_email_enabled" boolean DEFAULT true,
	"notification_sms_enabled" boolean DEFAULT true,
	"sms_payment_validation_enabled" boolean DEFAULT true,
	"mobile_money_enabled" boolean DEFAULT true,
	"maintenance_mode" boolean DEFAULT false,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "system_settings_agence_code_unique" UNIQUE("agence_code")
);
--> statement-breakpoint
CREATE TABLE "ui_customization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"theme" text DEFAULT 'dark',
	"primary_color" text DEFAULT '#3b82f6',
	"accent_color" text DEFAULT '#10b981',
	"langue" text DEFAULT 'fr',
	"sidebar_collapsed_default" boolean DEFAULT false,
	"show_animations" boolean DEFAULT true,
	"compact_mode" boolean DEFAULT false,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "contributions_tontine" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tontine_id" uuid NOT NULL,
	"membre_id" uuid NOT NULL,
	"montant" numeric NOT NULL,
	"date_contribution" timestamp DEFAULT now(),
	"methode_paiement" text DEFAULT 'Espèces',
	"reference" text,
	"statut" text DEFAULT 'Validé' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "membres_tontine" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tontine_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"date_adhesion" timestamp DEFAULT now(),
	"statut" text DEFAULT 'Actif' NOT NULL,
	"total_cotisations" numeric DEFAULT '0',
	"total_recus" numeric DEFAULT '0',
	"position" integer,
	"a_recu_benefice" boolean DEFAULT false,
	"date_benefice" timestamp,
	"created_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tontine_alertes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tontine_id" uuid NOT NULL,
	"membre_id" uuid,
	"type_alerte" text NOT NULL,
	"priorite" text DEFAULT 'Normale' NOT NULL,
	"message" text NOT NULL,
	"statut" text DEFAULT 'Active' NOT NULL,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tontine_distributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tontine_id" uuid NOT NULL,
	"membre_id" uuid NOT NULL,
	"tour_numero" integer NOT NULL,
	"montant_total" numeric NOT NULL,
	"date_distribution" timestamp DEFAULT now(),
	"mode_paiement" text DEFAULT 'ESPECES',
	"reference_paiement" text,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tontine_penalites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tontine_id" uuid NOT NULL,
	"membre_id" uuid NOT NULL,
	"regle_id" uuid,
	"montant" numeric NOT NULL,
	"date_faute" timestamp DEFAULT now(),
	"statut" text DEFAULT 'impaye',
	"date_paiement" timestamp,
	"motif" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tontine_regles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tontine_id" uuid NOT NULL,
	"type_regle" text NOT NULL,
	"montant_penalite" numeric NOT NULL,
	"description" text,
	"actif" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tontines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"description" text,
	"type_distribution" text NOT NULL,
	"montant_cotisation" numeric NOT NULL,
	"taux_plateforme" numeric DEFAULT '0' NOT NULL,
	"frequence" text NOT NULL,
	"intervalle_cotisation" integer DEFAULT 1,
	"delai_penalite" integer DEFAULT 2,
	"date_debut" timestamp NOT NULL,
	"date_fin" timestamp,
	"nombre_membres" integer NOT NULL,
	"membres_actuels" integer DEFAULT 0,
	"statut" text DEFAULT 'Active' NOT NULL,
	"solde" numeric DEFAULT '0',
	"prochain_tour" timestamp,
	"ordre_distribution" json,
	"regles" text,
	"gestionnaire_id" uuid,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_id" uuid NOT NULL,
	"receiver_id" uuid NOT NULL,
	"content" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_location_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"latitude" numeric NOT NULL,
	"longitude" numeric NOT NULL,
	"accuracy" numeric,
	"altitude" numeric,
	"speed" numeric,
	"heading" numeric,
	"source" text DEFAULT 'gps' NOT NULL,
	"battery_level" integer,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agents_terrain" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"prenom" text NOT NULL,
	"telephone" text NOT NULL,
	"email" text,
	"zone_affectation" text NOT NULL,
	"zone_latitude" numeric,
	"zone_longitude" numeric,
	"zone_rayon" numeric,
	"zone_polygon" text,
	"last_latitude" numeric,
	"last_longitude" numeric,
	"last_seen_at" timestamp,
	"statut" text DEFAULT 'Actif' NOT NULL,
	"objectif_mensuel" numeric,
	"total_prospections" integer DEFAULT 0,
	"total_visites" integer DEFAULT 0,
	"total_paiements" numeric DEFAULT '0',
	"taux_conversion" numeric DEFAULT '0',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "caisse_code_usages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_id" uuid,
	"used_at" timestamp DEFAULT now(),
	"success" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "caisse_security_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid,
	"code_hash" text NOT NULL,
	"active" boolean DEFAULT true,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "caisses_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid,
	"nom_caisse" text NOT NULL,
	"solde_actuel" numeric DEFAULT '0',
	"statut" text DEFAULT 'Fermée',
	"derniere_ouverture" timestamp,
	"derniere_fermeture" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "code_generation_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manager_id" uuid,
	"can_generate" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "comptage_billets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid NOT NULL,
	"type_comptage" text NOT NULL,
	"billets_10000" integer DEFAULT 0,
	"billets_5000" integer DEFAULT 0,
	"billets_2000" integer DEFAULT 0,
	"billets_1000" integer DEFAULT 0,
	"billets_500" integer DEFAULT 0,
	"pieces_250" integer DEFAULT 0,
	"pieces_100" integer DEFAULT 0,
	"pieces_50" integer DEFAULT 0,
	"pieces_25" integer DEFAULT 0,
	"total_calcule" numeric NOT NULL,
	"total_declare" numeric,
	"ecart" numeric DEFAULT '0',
	"valide_par" uuid,
	"date_validation" timestamp,
	"observations" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "factures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" text NOT NULL,
	"modele_id" uuid,
	"client_id" uuid,
	"agent_id" uuid,
	"shift_id" uuid,
	"date_facture" timestamp DEFAULT now() NOT NULL,
	"date_echeance" timestamp,
	"sous_total" numeric DEFAULT '0' NOT NULL,
	"montant_tva" numeric DEFAULT '0',
	"montant_total" numeric NOT NULL,
	"montant_paye" numeric DEFAULT '0',
	"statut" text DEFAULT 'emise' NOT NULL,
	"mode_paiement" text,
	"reference_transaction" text,
	"operation_caisse_id" uuid,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "factures_numero_unique" UNIQUE("numero")
);
--> statement-breakpoint
CREATE TABLE "lignes_factures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facture_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantite" integer DEFAULT 1 NOT NULL,
	"prix_unitaire" numeric NOT NULL,
	"montant" numeric NOT NULL,
	"type_operation" text,
	"reference_id" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "modeles_factures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"type_document" text DEFAULT 'facture' NOT NULL,
	"prefixe_numero" text DEFAULT 'FAC' NOT NULL,
	"dernier_numero" integer DEFAULT 0,
	"entete" text,
	"pied_page" text,
	"mentions_legales" text,
	"logo_url" text,
	"couleur_principale" text DEFAULT '#1e3a8a',
	"afficher_tva" boolean DEFAULT false,
	"taux_tva" numeric DEFAULT '0',
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "modeles_factures_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "objectifs_mensuels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"annee" integer NOT NULL,
	"mois" integer NOT NULL,
	"montant" numeric NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "paiements_terrain" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"type_paiement" text NOT NULL,
	"montant" numeric NOT NULL,
	"methode_paiement" text NOT NULL,
	"numero_telephone" text,
	"reference" text NOT NULL,
	"statut" text DEFAULT 'En attente' NOT NULL,
	"validation_otp" text,
	"date_validation" timestamp,
	"observations" text,
	"latitude" numeric,
	"longitude" numeric,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pos_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"caisse_agent_id" uuid,
	"device_id" text NOT NULL,
	"nom" text NOT NULL,
	"modele" text,
	"numero_serie" text,
	"date_enregistrement" timestamp DEFAULT now(),
	"derniere_synchronisation" timestamp,
	"version_app" text,
	"statut" text DEFAULT 'actif' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "pos_devices_device_id_unique" UNIQUE("device_id")
);
--> statement-breakpoint
CREATE TABLE "prospections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"nom_prospect" text NOT NULL,
	"prenom_prospect" text,
	"telephone_prospect" text NOT NULL,
	"adresse_prospect" text,
	"localisation" text,
	"latitude" numeric,
	"longitude" numeric,
	"type_activite" text,
	"description_activite" text,
	"revenu_estime" numeric,
	"chiffre_affaires_mensuel" numeric,
	"interet_credit" boolean DEFAULT false,
	"montant_souhaite" numeric,
	"objet_credit" text,
	"photo_url" text,
	"statut" text DEFAULT 'nouveau' NOT NULL,
	"priorite" text DEFAULT 'normale',
	"commentaires_agent" text,
	"observations" text,
	"date_prospection" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shifts_caisse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"caisse_agent_id" uuid,
	"agent_id" uuid,
	"date_ouverture" timestamp DEFAULT now(),
	"date_fermeture" timestamp,
	"solde_ouverture" numeric DEFAULT '0',
	"solde_fermeture" numeric,
	"solde_theorique" numeric DEFAULT '0',
	"ecart" numeric,
	"statut" text DEFAULT 'ouvert' NOT NULL,
	"code_securite_id" uuid,
	"observations" text,
	"fermeture_automatique" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "visites_terrain" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"client_id" uuid,
	"type_visite" text NOT NULL,
	"date_visite" timestamp NOT NULL,
	"heure_debut" text,
	"heure_fin" text,
	"objet_visite" text,
	"resultat" text,
	"observations" text,
	"coordonnees_gps" text,
	"latitude" numeric,
	"longitude" numeric,
	"statut" text DEFAULT 'Planifiée' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"ville" text NOT NULL,
	"description" text,
	"statut" text DEFAULT 'Actif' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "kyc_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"niveau" integer NOT NULL,
	"nom" text NOT NULL,
	"description" text,
	"limite_transaction_journaliere" numeric NOT NULL,
	"limite_transaction_mensuelle" numeric NOT NULL,
	"limite_transaction_unique" numeric NOT NULL,
	"documents_requis" text[],
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "kyc_levels_niveau_unique" UNIQUE("niveau")
);
--> statement-breakpoint
CREATE TABLE "otp_validations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_type" text NOT NULL,
	"transaction_reference" text NOT NULL,
	"client_id" uuid,
	"client_phone" text NOT NULL,
	"montant" numeric NOT NULL,
	"otp_code" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_by" uuid,
	"created_by_role" text,
	"validated_by" uuid,
	"validated_by_name" text,
	"validated_by_role" text,
	"validated_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "transfert_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfert_id" uuid NOT NULL,
	"action" text NOT NULL,
	"ancien_statut" text,
	"nouveau_statut" text,
	"details" json,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid,
	"hash_precedent" text,
	"hash_actuel" text,
	"timestamp" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "transfert_blacklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"valeur" text NOT NULL,
	"raison" text NOT NULL,
	"source" text,
	"severite" text DEFAULT 'high' NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"date_expiration" timestamp,
	"ajoute_par_id" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "transfert_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid,
	"telephone" text NOT NULL,
	"kyc_level" integer DEFAULT 1 NOT NULL,
	"total_journalier" numeric DEFAULT '0' NOT NULL,
	"total_mensuel" numeric DEFAULT '0' NOT NULL,
	"nombre_transfert_jour" integer DEFAULT 0,
	"nombre_transfert_mois" integer DEFAULT 0,
	"dernier_transfert" timestamp,
	"date_reset_journalier" timestamp DEFAULT now(),
	"date_reset_mensuel" timestamp DEFAULT now(),
	"bloque" boolean DEFAULT false,
	"raison_blocage" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "transfert_reconciliation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operateur_id" text NOT NULL,
	"date_reconciliation" timestamp NOT NULL,
	"periode" text NOT NULL,
	"total_transferts" integer DEFAULT 0 NOT NULL,
	"montant_total" numeric DEFAULT '0' NOT NULL,
	"montant_operateur" numeric DEFAULT '0',
	"ecart" numeric DEFAULT '0',
	"statut" text DEFAULT 'pending' NOT NULL,
	"anomalies" json,
	"resolved_by_id" uuid,
	"resolved_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "transfert_webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfert_id" uuid,
	"operateur_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" json NOT NULL,
	"signature" text,
	"signature_valide" boolean,
	"traite" boolean DEFAULT false,
	"erreur" text,
	"tentatives" integer DEFAULT 0,
	"ip_source" text,
	"received_at" timestamp DEFAULT now(),
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "transferts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"idempotency_key" text,
	"type" text NOT NULL,
	"statut" text DEFAULT 'pending' NOT NULL,
	"expediteur_nom" text NOT NULL,
	"expediteur_telephone" text NOT NULL,
	"expediteur_email" text,
	"expediteur_type_document" text,
	"expediteur_numero_document" text,
	"expediteur_adresse" text,
	"expediteur_pays" text DEFAULT 'CG' NOT NULL,
	"expediteur_kyc_level" integer DEFAULT 1,
	"beneficiaire_nom" text NOT NULL,
	"beneficiaire_telephone" text NOT NULL,
	"beneficiaire_email" text,
	"beneficiaire_pays" text NOT NULL,
	"beneficiaire_ville" text,
	"beneficiaire_adresse" text,
	"montant_envoye" numeric NOT NULL,
	"devise_envoi" text DEFAULT 'XAF' NOT NULL,
	"montant_recu" numeric NOT NULL,
	"devise_reception" text NOT NULL,
	"taux_change" numeric NOT NULL,
	"frais_transfert" numeric NOT NULL,
	"frais_operateur" numeric DEFAULT '0',
	"montant_total" numeric NOT NULL,
	"operateur_id" text NOT NULL,
	"operateur_nom" text NOT NULL,
	"mode_reception" text NOT NULL,
	"mode_paiement" text NOT NULL,
	"motif_transfert" text,
	"code_secret" text,
	"code_secret_hash" text,
	"reference_operateur" text,
	"message_operateur" text,
	"delai_estime" text,
	"otp_code" text,
	"otp_expiration" timestamp,
	"otp_verifie" boolean DEFAULT false,
	"tentatives_otp" integer DEFAULT 0,
	"risk_score" integer DEFAULT 0,
	"risk_flags" text[],
	"fraud_check" boolean DEFAULT false,
	"aml_check" boolean DEFAULT false,
	"sanctions_check" boolean DEFAULT false,
	"ip_address" text,
	"user_agent" text,
	"device_fingerprint" text,
	"geo_location" text,
	"agent_id" uuid,
	"approuve_par_id" uuid,
	"date_approbation" timestamp,
	"date_creation" timestamp DEFAULT now(),
	"date_traitement" timestamp,
	"date_completion" timestamp,
	"date_expiration" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "transferts_reference_unique" UNIQUE("reference"),
	CONSTRAINT "transferts_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "declarations_tva" ADD CONSTRAINT "declarations_tva_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecritures_comptables" ADD CONSTRAINT "ecritures_comptables_exercice_id_exercices_comptables_id_fk" FOREIGN KEY ("exercice_id") REFERENCES "public"."exercices_comptables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecritures_comptables" ADD CONSTRAINT "ecritures_comptables_journal_id_journaux_comptables_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journaux_comptables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecritures_comptables" ADD CONSTRAINT "ecritures_comptables_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecritures_comptables" ADD CONSTRAINT "ecritures_comptables_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_ecritures" ADD CONSTRAINT "lignes_ecritures_ecriture_id_ecritures_comptables_id_fk" FOREIGN KEY ("ecriture_id") REFERENCES "public"."ecritures_comptables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_ecritures" ADD CONSTRAINT "lignes_ecritures_compte_id_plan_comptable_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."plan_comptable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordres_bourse" ADD CONSTRAINT "ordres_bourse_portefeuille_id_portefeuilles_bourse_id_fk" FOREIGN KEY ("portefeuille_id") REFERENCES "public"."portefeuilles_bourse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portefeuilles_bourse" ADD CONSTRAINT "portefeuilles_bourse_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions_bourse" ADD CONSTRAINT "positions_bourse_portefeuille_id_portefeuilles_bourse_id_fk" FOREIGN KEY ("portefeuille_id") REFERENCES "public"."portefeuilles_bourse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions_bourse" ADD CONSTRAINT "transactions_bourse_portefeuille_id_portefeuilles_bourse_id_fk" FOREIGN KEY ("portefeuille_id") REFERENCES "public"."portefeuilles_bourse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions_bourse" ADD CONSTRAINT "transactions_bourse_ordre_id_ordres_bourse_id_fk" FOREIGN KEY ("ordre_id") REFERENCES "public"."ordres_bourse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_bourse" ADD CONSTRAINT "watchlist_bourse_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_activities" ADD CONSTRAINT "client_activities_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_tags" ADD CONSTRAINT "client_tags_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_tags" ADD CONSTRAINT "client_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comptes_epargne" ADD CONSTRAINT "comptes_epargne_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demandes_credit" ADD CONSTRAINT "demandes_credit_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquetes_credit" ADD CONSTRAINT "enquetes_credit_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquetes_credit" ADD CONSTRAINT "enquetes_credit_demande_id_demandes_credit_id_fk" FOREIGN KEY ("demande_id") REFERENCES "public"."demandes_credit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectifs_epargne" ADD CONSTRAINT "objectifs_epargne_compte_id_comptes_epargne_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."comptes_epargne"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_caisse" ADD CONSTRAINT "operations_caisse_session_id_sessions_caisse_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions_caisse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_caisse" ADD CONSTRAINT "operations_caisse_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans_epargne" ADD CONSTRAINT "plans_epargne_credit_id_credits_id_fk" FOREIGN KEY ("credit_id") REFERENCES "public"."credits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans_epargne" ADD CONSTRAINT "plans_epargne_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans_epargne" ADD CONSTRAINT "plans_epargne_compte_epargne_id_comptes_epargne_id_fk" FOREIGN KEY ("compte_epargne_id") REFERENCES "public"."comptes_epargne"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remboursements" ADD CONSTRAINT "remboursements_credit_id_credits_id_fk" FOREIGN KEY ("credit_id") REFERENCES "public"."credits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_caisse" ADD CONSTRAINT "sessions_caisse_caissier_id_users_id_fk" FOREIGN KEY ("caissier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions_epargne" ADD CONSTRAINT "transactions_epargne_compte_id_comptes_epargne_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."comptes_epargne"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avantages_employes" ADD CONSTRAINT "avantages_employes_employe_id_users_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avantages_employes" ADD CONSTRAINT "avantages_employes_avantage_id_avantages_id_fk" FOREIGN KEY ("avantage_id") REFERENCES "public"."avantages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulletins_paie" ADD CONSTRAINT "bulletins_paie_employe_id_users_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demandes_conges" ADD CONSTRAINT "demandes_conges_employe_id_users_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formation_participants" ADD CONSTRAINT "formation_participants_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formation_participants" ADD CONSTRAINT "formation_participants_employe_id_users_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presences" ADD CONSTRAINT "presences_employe_id_users_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_employe_id_users_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_notification_logs" ADD CONSTRAINT "push_notification_logs_subscription_id_push_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."push_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_notifications" ADD CONSTRAINT "sms_notifications_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions_tontine" ADD CONSTRAINT "contributions_tontine_tontine_id_tontines_id_fk" FOREIGN KEY ("tontine_id") REFERENCES "public"."tontines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions_tontine" ADD CONSTRAINT "contributions_tontine_membre_id_membres_tontine_id_fk" FOREIGN KEY ("membre_id") REFERENCES "public"."membres_tontine"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membres_tontine" ADD CONSTRAINT "membres_tontine_tontine_id_tontines_id_fk" FOREIGN KEY ("tontine_id") REFERENCES "public"."tontines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membres_tontine" ADD CONSTRAINT "membres_tontine_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_alertes" ADD CONSTRAINT "tontine_alertes_tontine_id_tontines_id_fk" FOREIGN KEY ("tontine_id") REFERENCES "public"."tontines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_alertes" ADD CONSTRAINT "tontine_alertes_membre_id_membres_tontine_id_fk" FOREIGN KEY ("membre_id") REFERENCES "public"."membres_tontine"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_distributions" ADD CONSTRAINT "tontine_distributions_tontine_id_tontines_id_fk" FOREIGN KEY ("tontine_id") REFERENCES "public"."tontines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_distributions" ADD CONSTRAINT "tontine_distributions_membre_id_membres_tontine_id_fk" FOREIGN KEY ("membre_id") REFERENCES "public"."membres_tontine"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_penalites" ADD CONSTRAINT "tontine_penalites_tontine_id_tontines_id_fk" FOREIGN KEY ("tontine_id") REFERENCES "public"."tontines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_penalites" ADD CONSTRAINT "tontine_penalites_membre_id_membres_tontine_id_fk" FOREIGN KEY ("membre_id") REFERENCES "public"."membres_tontine"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_penalites" ADD CONSTRAINT "tontine_penalites_regle_id_tontine_regles_id_fk" FOREIGN KEY ("regle_id") REFERENCES "public"."tontine_regles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_regles" ADD CONSTRAINT "tontine_regles_tontine_id_tontines_id_fk" FOREIGN KEY ("tontine_id") REFERENCES "public"."tontines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontines" ADD CONSTRAINT "tontines_gestionnaire_id_users_id_fk" FOREIGN KEY ("gestionnaire_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_receiver_id_users_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_location_logs" ADD CONSTRAINT "agent_location_logs_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_code_usages" ADD CONSTRAINT "caisse_code_usages_code_id_caisse_security_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."caisse_security_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_security_codes" ADD CONSTRAINT "caisse_security_codes_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisses_agents" ADD CONSTRAINT "caisses_agents_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_generation_permissions" ADD CONSTRAINT "code_generation_permissions_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comptage_billets" ADD CONSTRAINT "comptage_billets_shift_id_shifts_caisse_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts_caisse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comptage_billets" ADD CONSTRAINT "comptage_billets_valide_par_users_id_fk" FOREIGN KEY ("valide_par") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factures" ADD CONSTRAINT "factures_modele_id_modeles_factures_id_fk" FOREIGN KEY ("modele_id") REFERENCES "public"."modeles_factures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factures" ADD CONSTRAINT "factures_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factures" ADD CONSTRAINT "factures_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factures" ADD CONSTRAINT "factures_shift_id_shifts_caisse_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts_caisse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factures" ADD CONSTRAINT "factures_operation_caisse_id_operations_caisse_id_fk" FOREIGN KEY ("operation_caisse_id") REFERENCES "public"."operations_caisse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_factures" ADD CONSTRAINT "lignes_factures_facture_id_factures_id_fk" FOREIGN KEY ("facture_id") REFERENCES "public"."factures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modeles_factures" ADD CONSTRAINT "modeles_factures_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectifs_mensuels" ADD CONSTRAINT "objectifs_mensuels_agent_id_agents_terrain_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents_terrain"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paiements_terrain" ADD CONSTRAINT "paiements_terrain_agent_id_agents_terrain_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents_terrain"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paiements_terrain" ADD CONSTRAINT "paiements_terrain_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_devices" ADD CONSTRAINT "pos_devices_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_devices" ADD CONSTRAINT "pos_devices_caisse_agent_id_caisses_agents_id_fk" FOREIGN KEY ("caisse_agent_id") REFERENCES "public"."caisses_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospections" ADD CONSTRAINT "prospections_agent_id_agents_terrain_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents_terrain"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts_caisse" ADD CONSTRAINT "shifts_caisse_caisse_agent_id_caisses_agents_id_fk" FOREIGN KEY ("caisse_agent_id") REFERENCES "public"."caisses_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts_caisse" ADD CONSTRAINT "shifts_caisse_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts_caisse" ADD CONSTRAINT "shifts_caisse_code_securite_id_caisse_security_codes_id_fk" FOREIGN KEY ("code_securite_id") REFERENCES "public"."caisse_security_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visites_terrain" ADD CONSTRAINT "visites_terrain_agent_id_agents_terrain_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents_terrain"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visites_terrain" ADD CONSTRAINT "visites_terrain_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_validations" ADD CONSTRAINT "otp_validations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_validations" ADD CONSTRAINT "otp_validations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_validations" ADD CONSTRAINT "otp_validations_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfert_audit_logs" ADD CONSTRAINT "transfert_audit_logs_transfert_id_transferts_id_fk" FOREIGN KEY ("transfert_id") REFERENCES "public"."transferts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfert_audit_logs" ADD CONSTRAINT "transfert_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfert_blacklist" ADD CONSTRAINT "transfert_blacklist_ajoute_par_id_users_id_fk" FOREIGN KEY ("ajoute_par_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfert_reconciliation" ADD CONSTRAINT "transfert_reconciliation_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfert_webhooks" ADD CONSTRAINT "transfert_webhooks_transfert_id_transferts_id_fk" FOREIGN KEY ("transfert_id") REFERENCES "public"."transferts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts" ADD CONSTRAINT "transferts_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts" ADD CONSTRAINT "transferts_approuve_par_id_users_id_fk" FOREIGN KEY ("approuve_par_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;