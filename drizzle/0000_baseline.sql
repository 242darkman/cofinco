CREATE TYPE "public"."permission_request_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."permission_request_type" AS ENUM('GRANT', 'DENY', 'TEMPORARY');--> statement-breakpoint
CREATE TYPE "public"."permission_scope" AS ENUM('GLOBAL', 'AGENCE');--> statement-breakpoint
CREATE TYPE "public"."rbac_audit_action" AS ENUM('TOGGLE', 'BULK_UPDATE', 'RESET', 'GRANT_TEMPORARY', 'REVOKE_TEMPORARY', 'EXPIRE_TEMPORARY', 'MODULE_CREATE', 'MODULE_UPDATE', 'MODULE_DELETE', 'PERMISSION_CREATE', 'PERMISSION_UPDATE', 'PERMISSION_DELETE', 'REVERT', 'REQUEST_APPROVED', 'REQUEST_REJECTED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'CHEF_AGENCE', 'CAISSIER', 'AGENT_TERRAIN', 'COMPTABLE', 'SUPERVISEUR', 'GESTIONNAIRE_CREDIT', 'AUDITEUR', 'RH', 'SUPPORT_IT', 'CLIENT');--> statement-breakpoint
CREATE TYPE "public"."type_piece_enum" AS ENUM('CNI', 'PASSPORT', 'PERMIS_CONDUIRE', 'CARTE_RESIDENT');--> statement-breakpoint
CREATE TYPE "public"."conversation_type" AS ENUM('DM', 'GROUP');--> statement-breakpoint
CREATE TYPE "public"."message_content_type" AS ENUM('TEXT', 'IMAGE', 'FILE', 'AUDIO', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."participant_role" AS ENUM('MEMBER', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."device_key_status" AS ENUM('active', 'rotated', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."offline_day_session_status" AS ENUM('synced', 'reconciled', 'pending_review', 'flagged');--> statement-breakpoint
CREATE TYPE "public"."offline_journal_status" AS ENUM('confirmed', 'rejected', 'quarantined');--> statement-breakpoint
CREATE TYPE "public"."action_audit_evacuation_enum" AS ENUM('CREATED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PREPARED', 'DISPATCHED', 'DEPOSITED', 'RECONCILED', 'DISCREPANCY_FLAGGED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."action_audit_transfert_enum" AS ENUM('CREATED', 'SUBMITTED', 'APPROVED_L1', 'APPROVED_L2', 'REJECTED', 'DISPATCHED', 'RECEIVED', 'RECEIVED_WITH_DISCREPANCY', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."activity_priority_enum" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT');--> statement-breakpoint
CREATE TYPE "public"."activity_status_enum" AS ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'OVERDUE');--> statement-breakpoint
CREATE TYPE "public"."activity_type_enum" AS ENUM('PROSPECTION', 'CREDIT_INVESTIGATION', 'COLLECTION', 'CLIENT_VISIT', 'DOCUMENT_PICKUP', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."agent_recommendation_enum" AS ENUM('APPROVE', 'APPROVE_WITH_CAUTION', 'REDUCE_AMOUNT', 'REJECT');--> statement-breakpoint
CREATE TYPE "public"."amortization_type_enum" AS ENUM('EQUAL_INSTALLMENTS', 'EQUAL_PRINCIPAL', 'INTEREST_ONLY_THEN_BALLOON');--> statement-breakpoint
CREATE TYPE "public"."avis_enqueteur_enum" AS ENUM('FAVORABLE', 'DEFAVORABLE', 'RESERVE');--> statement-breakpoint
CREATE TYPE "public"."caisse_opening_strictness_enum" AS ENUM('STRICT_BLOCK', 'WARNING_WITH_JUSTIFICATION', 'LOG_ONLY');--> statement-breakpoint
CREATE TYPE "public"."caisse_request_category_enum" AS ENUM('ENGAGEMENT_FEE', 'FEE_REFUND', 'SALARY_PAYMENT', 'ACCOUNT_ACTIVATION');--> statement-breakpoint
CREATE TYPE "public"."caisse_request_status_enum" AS ENUM('PENDING', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."calendar_mode_enum" AS ENUM('ALL_DAYS', 'BUSINESS_DAYS_ONLY', 'CUSTOM_WEEKDAYS');--> statement-breakpoint
CREATE TYPE "public"."closure_payout_method_enum" AS ENUM('CASH', 'MOBILE_MONEY');--> statement-breakpoint
CREATE TYPE "public"."closure_payout_status_enum" AS ENUM('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."closure_request_status_enum" AS ENUM('PENDING', 'APPROVED', 'CANCELLED', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."collateral_type_enum" AS ENUM('IMMOBILIER', 'VEHICULE', 'EQUIPEMENT', 'DEPOT_GARANTIE', 'CAUTION_SOLIDAIRE', 'AUTRE');--> statement-breakpoint
CREATE TYPE "public"."day_count_convention_enum" AS ENUM('ACT_365', 'ACT_360', '30_360');--> statement-breakpoint
CREATE TYPE "public"."disbursement_channel_enum" AS ENUM('ACCOUNT', 'CASH', 'MOBILE_MONEY');--> statement-breakpoint
CREATE TYPE "public"."disbursement_status_enum" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."duree_unite_enum" AS ENUM('DAY', 'WEEK', 'MONTH');--> statement-breakpoint
CREATE TYPE "public"."email_provider_type_enum" AS ENUM('SMTP', 'RESEND', 'SENDGRID');--> statement-breakpoint
CREATE TYPE "public"."fallback_policy_enum" AS ENUM('SMS_ONLY', 'EMAIL_ONLY', 'SMS_THEN_EMAIL', 'EMAIL_THEN_SMS');--> statement-breakpoint
CREATE TYPE "public"."fee_calc_type_enum" AS ENUM('FIXED', 'PERCENTAGE');--> statement-breakpoint
CREATE TYPE "public"."fee_collection_mode_enum" AS ENUM('UPFRONT', 'DEDUCTED_FROM_PRINCIPAL', 'SPREAD', 'ON_DISBURSEMENT');--> statement-breakpoint
CREATE TYPE "public"."fee_type_enum" AS ENUM('DOSSIER', 'ASSURANCE', 'NOTAIRE', 'TIMBRES', 'COMMISSION', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."first_due_rule_enum" AS ENUM('NEXT_DAY', 'NEXT_BUSINESS_DAY', 'AFTER_N_DAYS', 'NEXT_WEEKDAY', 'END_OF_WEEK', 'END_OF_MONTH', 'CUSTOM_DATE_ALLOWED');--> statement-breakpoint
CREATE TYPE "public"."frequence_remboursement_enum" AS ENUM('DAILY', 'WEEKLY', 'MONTHLY', 'BI_MONTHLY', 'QUARTERLY');--> statement-breakpoint
CREATE TYPE "public"."frequence_virement_enum" AS ENUM('ONCE', 'DAILY', 'WEEKLY', 'BI_MONTHLY', 'MONTHLY', 'QUARTERLY');--> statement-breakpoint
CREATE TYPE "public"."guarantee_release_rule_enum" AS ENUM('ON_FULL_REPAYMENT', 'ON_PERCENTAGE_REPAID', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."interest_method_enum" AS ENUM('FLAT', 'DECLINING_BALANCE');--> statement-breakpoint
CREATE TYPE "public"."interest_rate_period_enum" AS ENUM('DAILY', 'MONTHLY', 'ANNUAL');--> statement-breakpoint
CREATE TYPE "public"."interest_rate_type_enum" AS ENUM('credit', 'epargne', 'autre');--> statement-breakpoint
CREATE TYPE "public"."late_fee_type_enum" AS ENUM('FIXED', 'PERCENTAGE');--> statement-breakpoint
CREATE TYPE "public"."methode_paiement_enum" AS ENUM('CASH', 'MOBILE_MONEY', 'TRANSFER', 'CARD', 'CHECK', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."mobile_money_provider_enum" AS ENUM('MTN', 'AIRTEL');--> statement-breakpoint
CREATE TYPE "public"."motif_blocage_enum" AS ENUM('LOAN_GUARANTEE', 'TONTINE_GUARANTEE', 'FORCED_SAVINGS', 'INTERNAL_DECISION', 'DISPUTE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."motif_evacuation_enum" AS ENUM('EXCEDENT_ENCAISSE', 'FIN_EXERCICE', 'SECURITE', 'FERMETURE_AGENCE', 'APPROVISIONNEMENT_SIEGE', 'TRANSFERT_BANCAIRE', 'AUTRE');--> statement-breakpoint
CREATE TYPE "public"."niveau_risque_enum" AS ENUM('FAIBLE', 'MOYEN', 'ELEVE');--> statement-breakpoint
CREATE TYPE "public"."notification_channel_enum" AS ENUM('SMS', 'EMAIL', 'PUSH', 'IN_APP');--> statement-breakpoint
CREATE TYPE "public"."notification_job_status_enum" AS ENUM('QUEUED', 'PROCESSING', 'SENT', 'FAILED', 'DEAD_LETTER');--> statement-breakpoint
CREATE TYPE "public"."notification_schedule_status_enum" AS ENUM('PENDING', 'SENT', 'CANCELLED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."opening_request_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."otp_channel_enum" AS ENUM('SMS', 'EMAIL');--> statement-breakpoint
CREATE TYPE "public"."otp_purpose_enum" AS ENUM('PASSWORD_RESET', 'TRANSFER_VALIDATION', 'CREDIT_VALIDATION', 'SECURITY_CHANGE', 'CAISSE_OPERATION');--> statement-breakpoint
CREATE TYPE "public"."owner_type_coffre_enum" AS ENUM('AGENCE', 'SIEGE');--> statement-breakpoint
CREATE TYPE "public"."penalty_application_enum" AS ENUM('PER_INSTALLMENT', 'ON_TOTAL_OVERDUE', 'DAILY_ACCRUAL');--> statement-breakpoint
CREATE TYPE "public"."prepayment_fee_type_enum" AS ENUM('NONE', 'FIXED', 'PERCENTAGE_OF_REMAINING', 'PERCENTAGE_OF_PREPAID');--> statement-breakpoint
CREATE TYPE "public"."priorite_tache_enum" AS ENUM('LOW', 'NORMAL', 'HIGH', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."risk_level_enum" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH');--> statement-breakpoint
CREATE TYPE "public"."rounding_mode_enum" AS ENUM('ROUND', 'FLOOR', 'CEIL');--> statement-breakpoint
CREATE TYPE "public"."schedule_source_type_enum" AS ENUM('CREDIT', 'TONTINE', 'INVESTIGATION');--> statement-breakpoint
CREATE TYPE "public"."score_event_type_enum" AS ENUM('EPARGNE_DEPOT', 'CREDIT_REMBOURSEMENT', 'CREDIT_SOLDE', 'TONTINE_CONTRIBUTION', 'KYC_VERIFIED', 'PROFILE_COMPLETED', 'INCIDENT_RETARD', 'INCIDENT_DEFAUT', 'TONTINE_PENALITE', 'COMPTE_BLOQUE', 'BONUS_MANUEL', 'MALUS_MANUEL', 'INITIAL_SCORE', 'RECALCUL_COMPLET');--> statement-breakpoint
CREATE TYPE "public"."sens_mouvement_enum" AS ENUM('DEBIT', 'CREDIT');--> statement-breakpoint
CREATE TYPE "public"."shift_non_working_day_enum" AS ENUM('NEXT', 'PREVIOUS', 'NEAREST');--> statement-breakpoint
CREATE TYPE "public"."source_module_enum" AS ENUM('CAISSE', 'EPARGNE', 'CREDIT', 'TONTINE', 'TERRAIN', 'TRANSFERT', 'SYSTEME', 'CAISSE_AGENT', 'VERSEMENT_AUTO', 'DECAISSEMENT_PROGRAMME', 'COMPTE', 'COFFRE', 'MOBILE_MONEY', 'RH_PAYROLL', 'COFFRE_TRANSFER', 'INTER_COFFRE', 'EVACUATION_COFFRE', 'FRAIS', 'REMISE', 'CONTRIBUTION');--> statement-breakpoint
CREATE TYPE "public"."statut_agence_enum" AS ENUM('ACTIVE', 'INACTIVE', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."statut_audit_virement_enum" AS ENUM('SUCCESS', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."statut_caisse_agent_enum" AS ENUM('ACTIVE', 'SUSPENDED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."statut_caisse_main_enum" AS ENUM('OPEN', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."statut_coffre_enum" AS ENUM('ACTIVE', 'SUSPENDED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."statut_compte_enum" AS ENUM('ACTIVE', 'SUSPENDED', 'CLOSED', 'PENDING_ACTIVATION', 'PENDING_VALIDATION', 'CANCELLED', 'CLOSURE_PENDING', 'PENDING_PAYMENT', 'PENDING_APPROVAL', 'PENDING_PAYMENT_AND_APPROVAL');--> statement-breakpoint
CREATE TYPE "public"."statut_credit_enum" AS ENUM('PENDING', 'ACTIVE', 'LATE', 'PAID', 'CLOSED', 'CANCELLED', 'WAITING_DISBURSEMENT');--> statement-breakpoint
CREATE TYPE "public"."statut_decaissement_prog_enum" AS ENUM('PENDING', 'SUCCESS', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."statut_demande_enum" AS ENUM('PENDING_FEES', 'READY_FOR_INVESTIGATION', 'UNDER_INVESTIGATION', 'INVESTIGATION_COMPLETE', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED', 'DISBURSED', 'CLOSED', 'REEVALUATION_IN_PROGRESS', 'APPROVED_AFTER_REEVALUATION', 'DEFINITIVELY_REJECTED', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."statut_dossier_credit_enum" AS ENUM('DRAFT', 'SUBMITTED', 'PENDING_FEES', 'READY_FOR_INVESTIGATION', 'UNDER_INVESTIGATION', 'INVESTIGATION_COMPLETE', 'IN_COMMITTEE', 'APPROVED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."statut_echeance_credit_enum" AS ENUM('UPCOMING', 'PAID', 'LATE', 'SETTLED', 'DUE', 'PARTIALLY_PAID', 'RESTRUCTURED');--> statement-breakpoint
CREATE TYPE "public"."statut_enquete_complementaire_enum" AS ENUM('IN_PROGRESS', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."statut_enquete_credit_agent_enum" AS ENUM('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'APPROVED', 'REJECTED', 'REDUCED');--> statement-breakpoint
CREATE TYPE "public"."statut_enquete_credit_enum" AS ENUM('PENDING_ASSIGNMENT', 'ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'REVIEWED', 'APPROVED', 'REJECTED', 'REDUCED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."statut_evacuation_coffre_enum" AS ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'PREPARED', 'IN_TRANSIT', 'DEPOSITED', 'RECONCILED', 'DISCREPANCY', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."statut_objectif_epargne_enum" AS ENUM('IN_PROGRESS', 'ACHIEVED', 'ABANDONED');--> statement-breakpoint
CREATE TYPE "public"."statut_operation_terrain_enum" AS ENUM('SUBMITTED', 'APPROVED', 'PENDING_SETTLEMENT', 'REJECTED', 'CANCELLED', 'SETTLED');--> statement-breakpoint
CREATE TYPE "public"."statut_payment_intent_enum" AS ENUM('CREATED', 'PENDING', 'SUCCESS', 'FAILED', 'EXPIRED', 'CANCELLED', 'REVERSED');--> statement-breakpoint
CREATE TYPE "public"."statut_plan_epargne_enum" AS ENUM('ACTIVE', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."statut_reconciliation_enum" AS ENUM('PENDING', 'RECONCILED', 'DISCREPANCY_DETECTED');--> statement-breakpoint
CREATE TYPE "public"."statut_reevaluation_enum" AS ENUM('REQUESTED', 'ELIGIBILITY_CHECK', 'AUTHORIZED', 'REFUSED', 'ADDITIONAL_INVESTIGATION', 'INVESTIGATION_COMPLETE', 'IN_COMMITTEE', 'APPROVED', 'DEFINITIVELY_REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."statut_refund_request_enum" AS ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PENDING_CAISSE', 'PAID', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."statut_remise_terrain_enum" AS ENUM('DRAFT', 'PENDING', 'VALIDATED', 'SETTLED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."statut_run_virement_enum" AS ENUM('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."statut_session_agent_enum" AS ENUM('REQUESTING_FUNDS', 'ACTIVE', 'CLOSING', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."statut_session_caisse_enum" AS ENUM('REQUESTING_FUNDS', 'FUNDS_DISPATCHED', 'OPEN', 'CLOSING_COUNT', 'CLOSING_VALIDATION', 'CLOSED', 'RECONCILIATION_PENDING', 'RECONCILIATION_COMPLETE');--> statement-breakpoint
CREATE TYPE "public"."statut_tache_regularisation_enum" AS ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'ESCALATED');--> statement-breakpoint
CREATE TYPE "public"."statut_transaction_enum" AS ENUM('PENDING', 'PENDING_SETTLEMENT', 'POSTED', 'CANCELLED', 'REVERSED');--> statement-breakpoint
CREATE TYPE "public"."statut_transfert_caisse_enum" AS ENUM('PENDING', 'VALIDATED', 'REJECTED', 'CANCELLED', 'RECEIVED');--> statement-breakpoint
CREATE TYPE "public"."statut_transfert_coffre_enum" AS ENUM('REQUESTED', 'VALIDATED', 'EXECUTED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."statut_transfert_inter_coffre_enum" AS ENUM('DRAFT', 'SUBMITTED', 'APPROVED_L1', 'APPROVED_L2', 'IN_TRANSIT', 'RECEIVED', 'RECEIVED_WITH_DISCREPANCY', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."statut_versement_auto_enum" AS ENUM('PENDING', 'SUCCESS', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."suspension_reason_enum" AS ENUM('KYC', 'FRAUD', 'INTERNAL', 'CLIENT_REQUEST', 'DISPUTE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."type_agence_enum" AS ENUM('MAIN', 'SECONDARY', 'KIOSK');--> statement-breakpoint
CREATE TYPE "public"."type_compte_enum" AS ENUM('SAVINGS', 'CURRENT', 'BLOCKED');--> statement-breakpoint
CREATE TYPE "public"."type_conditionnement_enum" AS ENUM('Sac scellé', 'Mallette', 'Enveloppe', 'Autre');--> statement-breakpoint
CREATE TYPE "public"."type_credit_enum" AS ENUM('PERSONAL', 'REAL_ESTATE', 'COMMERCIAL');--> statement-breakpoint
CREATE TYPE "public"."type_destination_evacuation_enum" AS ENUM('BANQUE', 'COFFRE_CENTRAL', 'TRANSPORTEUR');--> statement-breakpoint
CREATE TYPE "public"."type_document_transfert_enum" AS ENUM('BON_TRANSFERT', 'BON_SORTIE', 'BON_ENTREE');--> statement-breakpoint
CREATE TYPE "public"."type_element_nouveau_enum" AS ENUM('ADDITIONAL_COLLATERAL', 'CO_BORROWER', 'INCOME_PROOF', 'AMOUNT_REDUCTION', 'DURATION_ADJUSTMENT', 'SITUATION_IMPROVEMENT', 'MISSING_DOCUMENT', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."type_evenement_enum" AS ENUM('MOUVEMENT_CREE', 'MOUVEMENT_STATUT_CHANGE', 'SOLDE_COMPTE_CHANGE', 'CREDIT_SOLDE_CHANGE', 'SESSION_CAISSE_CHANGE', 'TRANSFERT_CAISSE_CHANGE', 'COMPTE_CREE', 'COMPTE_BLOQUE', 'COMPTE_DEBLOQUE', 'COMPTE_TRANSFERE_AGENCE', 'CAISSE_AGENT_SOLDE_CHANGE', 'OPERATION_TERRAIN_CREATED', 'OPERATION_TERRAIN_SUBMITTED', 'OPERATION_TERRAIN_APPROVED', 'OPERATION_TERRAIN_REJECTED', 'OPERATION_TERRAIN_SETTLED', 'SESSION_FORCE_CLOSED', 'CAISSE_STATUS_CHANGED', 'CAISSE_LIQUIDATED', 'REMISE_CREATED', 'REMISE_SETTLED', 'REMISE_REJECTED', 'ECART_APPROVAL_REQUEST', 'ECART_APPROVAL_DECISION', 'GL_POSTING_FAILED', 'LIQUIDITY_CHANGED', 'GL_ENTRY_POSTED');--> statement-breakpoint
CREATE TYPE "public"."type_operation_caisse" AS ENUM('SAVINGS_DEPOSIT', 'SAVINGS_WITHDRAWAL', 'CREDIT_DISBURSEMENT', 'CREDIT_REPAYMENT', 'ENGAGEMENT_FEE', 'FEE', 'ADJUSTMENT', 'CASH_TRANSFER', 'SAFE_SUPPLY', 'SAFE_DEPOSIT', 'DEPOSIT_SAVINGS', 'DEPOSIT_CURRENT', 'WITHDRAWAL_CURRENT', 'DEPOSIT_BLOCKED', 'WITHDRAWAL_BLOCKED', 'MISC_COLLECTION', 'MISC_DISBURSEMENT', 'BANK_FEE', 'TONTINE_CONTRIBUTION', 'TONTINE_WITHDRAWAL', 'LOAN_REPAYMENT', 'LOAN_DISBURSEMENT', 'WITHDRAWAL_SAVINGS', 'INITIAL_DEPOSIT', 'OPENING_FEE', 'CLOSING_FEE', 'FEE_REFUND', 'AGENT_PROVISIONING', 'AGENT_SETTLEMENT', 'AGENT_SESSION_CLOSE');--> statement-breakpoint
CREATE TYPE "public"."type_operation_terrain_enum" AS ENUM('COLLECT_CASH', 'SETTLEMENT_CASH', 'PROVISIONING', 'SESSION_CLOSE');--> statement-breakpoint
CREATE TYPE "public"."type_paiement_terrain_enum" AS ENUM('DEPOSIT_SAVINGS', 'DEPOSIT_CURRENT', 'DEPOSIT_BLOCKED', 'WITHDRAWAL_SAVINGS', 'WITHDRAWAL_CURRENT', 'WITHDRAWAL_BLOCKED', 'CREDIT_REPAYMENT', 'ENGAGEMENT_FEE', 'CREDIT_DISBURSEMENT', 'LOAN_REPAYMENT', 'LOAN_DISBURSEMENT', 'TONTINE_CONTRIBUTION', 'TONTINE_WITHDRAWAL', 'SAFE_SUPPLY', 'SAFE_DEPOSIT', 'TRANSFER_IN', 'TRANSFER_OUT', 'INITIAL_DEPOSIT', 'INTERNAL_TRANSFER', 'ADJUSTMENT', 'INTEREST_PAYMENT', 'LIQUIDATION', 'COFFRE_TO_CAISSE', 'CAISSE_TO_COFFRE', 'COFFRE_TRANSIT_OUT', 'COFFRE_TRANSIT_IN', 'SESSION_OPENING_FLOAT', 'SESSION_CLOSING_TRANSFER', 'SESSION_DEFICIT', 'SESSION_SURPLUS', 'PAYROLL_ENGAGEMENT', 'PAYROLL_PAYMENT', 'SALARY_ADVANCE', 'FINANCIAL_PENALTY', 'PROSPECTION_PRIME', 'MISC_COLLECTION', 'MISC_DISBURSEMENT', 'FEE', 'BANK_FEE', 'CASH_TRANSFER', 'CREDIT_REPAYMENT_INTEREST', 'CREDIT_REPAYMENT_PENALTY', 'CREDIT_FEE', 'CREDIT_LATE_PENALTY', 'CREDIT_PROVISION', 'CREDIT_PROVISION_REVERSAL', 'CREDIT_WRITEOFF', 'CLOSURE_PAYOUT', 'OPENING_FEE', 'CLOSING_FEE', 'CLOSING_FEE_SAVINGS', 'CLOSING_FEE_CURRENT', 'CLOSING_FEE_BLOCKED', 'CLOSURE_PAYOUT_SAVINGS', 'CLOSURE_PAYOUT_CURRENT', 'CLOSURE_PAYOUT_BLOCKED', 'AGENT_WITHDRAWAL_SAVINGS', 'AGENT_WITHDRAWAL_CURRENT', 'AGENT_PROVISIONING', 'FEE_REFUND', 'SALARY_PAYMENT');--> statement-breakpoint
CREATE TYPE "public"."type_payment_intent_enum" AS ENUM('COLLECTION', 'PAYOUT');--> statement-breakpoint
CREATE TYPE "public"."type_revenu_enum" AS ENUM('MONTHLY', 'DAILY');--> statement-breakpoint
CREATE TYPE "public"."type_tache_regularisation_enum" AS ENUM('ECART_RECEPTION', 'RECONCILIATION_EN_ATTENTE', 'VIREMENT_PROG_ECHEC', 'VIREMENT_AUTO_ECHEC', 'ECART_COFFRE_CAISSE');--> statement-breakpoint
CREATE TYPE "public"."type_taux_interet_enum" AS ENUM('credit', 'epargne', 'autre');--> statement-breakpoint
CREATE TYPE "public"."type_transaction_epargne_enum" AS ENUM('DEPOSIT', 'WITHDRAWAL', 'INTEREST', 'FEE', 'ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."type_transfert_coffre_enum" AS ENUM('COFFRE_VERS_CAISSE', 'CAISSE_VERS_COFFRE');--> statement-breakpoint
CREATE TYPE "public"."type_transfert_inter_coffre_enum" AS ENUM('AGENCE_VERS_SIEGE', 'AGENCE_VERS_AGENCE', 'SIEGE_VERS_AGENCE');--> statement-breakpoint
CREATE TABLE "accounting_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"source_type" text NOT NULL,
	"event_type" text NOT NULL,
	"payment_method" text,
	"provider" text,
	"journal_code" text NOT NULL,
	"debit_account" text NOT NULL,
	"credit_account" text NOT NULL,
	"description_template" text,
	"priority" integer DEFAULT 100,
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "amortissements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid NOT NULL,
	"immobilisation_id" uuid NOT NULL,
	"exercice_id" uuid NOT NULL,
	"periode_date" date NOT NULL,
	"base_amortissable" numeric NOT NULL,
	"taux_applique" numeric NOT NULL,
	"montant_dotation" numeric NOT NULL,
	"cumul_avant" numeric NOT NULL,
	"cumul_apres" numeric NOT NULL,
	"valeur_nette_comptable" numeric NOT NULL,
	"ecriture_id" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "bareme_provisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid,
	"jours_retard_min" integer NOT NULL,
	"jours_retard_max" integer,
	"taux_provision" numeric NOT NULL,
	"categorie" text NOT NULL,
	"actif" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cobac_seuils" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ratio_code" text NOT NULL,
	"libelle" text NOT NULL,
	"seuil_minimum" numeric,
	"seuil_warning" numeric,
	"seuil_maximum" numeric,
	"actif" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "cobac_seuils_ratio_code_unique" UNIQUE("ratio_code")
);
--> statement-breakpoint
CREATE TABLE "declarations_dsf" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid NOT NULL,
	"exercice_id" uuid NOT NULL,
	"annee" integer NOT NULL,
	"statut" text DEFAULT 'DRAFT' NOT NULL,
	"tableaux" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"total_actif" numeric,
	"total_passif" numeric,
	"resultat_net" numeric,
	"chiffre_affaires" numeric,
	"generated_at" timestamp,
	"generated_by" uuid,
	"validated_at" timestamp,
	"validated_by" uuid,
	"submitted_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
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
	"statut" text DEFAULT 'DRAFT' NOT NULL,
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
	"statut" text DEFAULT 'DRAFT',
	"source_type" text,
	"source_id" uuid,
	"mouvement_id" uuid,
	"reversal_of_id" uuid,
	"reversed_by_id" uuid,
	"reversal_reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"agence_id" uuid NOT NULL,
	"validated_by" uuid,
	"validated_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "engagements_hors_bilan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid NOT NULL,
	"classe" integer DEFAULT 8 NOT NULL,
	"sous_classe" text NOT NULL,
	"compte_hors_bilan" text NOT NULL,
	"type_engagement" text NOT NULL,
	"client_id" uuid,
	"contrepartie" text,
	"montant" numeric NOT NULL,
	"devise" text DEFAULT 'XAF',
	"date_debut" date NOT NULL,
	"date_echeance" date,
	"statut" text DEFAULT 'ACTIVE' NOT NULL,
	"credit_id" uuid,
	"description" text,
	"reference" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "exercice_cloture_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exercice_id" uuid NOT NULL,
	"agence_id" uuid NOT NULL,
	"step" text NOT NULL,
	"statut" text DEFAULT 'PENDING' NOT NULL,
	"details" jsonb,
	"started_at" timestamp,
	"completed_at" timestamp,
	"error_message" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "exercices_comptables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"date_debut" date NOT NULL,
	"date_fin" date NOT NULL,
	"statut" text DEFAULT 'OPEN' NOT NULL,
	"description" text,
	"agence_id" uuid,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "exercices_comptables_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "gl_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid NOT NULL,
	"exercice_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"name" text NOT NULL,
	"date_debut" date NOT NULL,
	"date_fin" date NOT NULL,
	"statut" text DEFAULT 'OPEN' NOT NULL,
	"closed_at" timestamp,
	"closed_by" uuid,
	"closure_notes" text,
	"total_debits" numeric DEFAULT '0',
	"total_credits" numeric DEFAULT '0',
	"entry_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "gl_posting_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"ecriture_id" uuid NOT NULL,
	"mouvement_id" uuid,
	"status" text DEFAULT 'POSTED' NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"last_attempt_at" timestamp DEFAULT now(),
	"next_retry_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gl_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid NOT NULL,
	"journal_code" text NOT NULL,
	"year" integer NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "immobilisations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid NOT NULL,
	"code" text NOT NULL,
	"designation" text NOT NULL,
	"categorie" text NOT NULL,
	"compte_immobilisation" text NOT NULL,
	"compte_amortissement" text NOT NULL,
	"date_acquisition" date NOT NULL,
	"date_mise_en_service" date,
	"valeur_acquisition" numeric NOT NULL,
	"valeur_residuelle" numeric DEFAULT '0' NOT NULL,
	"duree_amortissement_mois" integer NOT NULL,
	"methode_amortissement" text DEFAULT 'LINEAIRE' NOT NULL,
	"taux_amortissement" numeric,
	"cumul_amortissements" numeric DEFAULT '0' NOT NULL,
	"valeur_nette_comptable" numeric NOT NULL,
	"statut" text DEFAULT 'ACTIVE' NOT NULL,
	"date_cession" date,
	"prix_cession" numeric,
	"fournisseur" text,
	"numero_facture" text,
	"localisation" text,
	"description" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "journaux_comptables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"intitule" text NOT NULL,
	"type_journal" text NOT NULL,
	"compte_contrepartie" text,
	"actif" boolean DEFAULT true,
	"agence_id" uuid,
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
	"lettrage_key" text,
	"lettrage_date" date,
	"lettrage_user_id" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
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
	"agence_id" uuid,
	"is_system" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "plan_comptable_numero_compte_unique" UNIQUE("numero_compte")
);
--> statement-breakpoint
CREATE TABLE "provisions_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid NOT NULL,
	"credit_id" uuid NOT NULL,
	"exercice_id" uuid NOT NULL,
	"periode_date" date NOT NULL,
	"solde_restant" numeric NOT NULL,
	"jours_retard" integer NOT NULL,
	"categorie" text NOT NULL,
	"taux_provision" numeric NOT NULL,
	"montant_provision" numeric NOT NULL,
	"provision_precedente" numeric DEFAULT '0' NOT NULL,
	"dotation" numeric DEFAULT '0' NOT NULL,
	"reprise" numeric DEFAULT '0' NOT NULL,
	"ecriture_id" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rapprochement_lignes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rapprochement_id" uuid NOT NULL,
	"source" text NOT NULL,
	"reference" text,
	"libelle" text,
	"debit" numeric DEFAULT '0' NOT NULL,
	"credit" numeric DEFAULT '0' NOT NULL,
	"date_valeur" date,
	"match_status" text DEFAULT 'UNMATCHED' NOT NULL,
	"matched_with_id" uuid,
	"ecart" numeric DEFAULT '0',
	"ecriture_id" uuid,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rapprochements_bancaires" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid NOT NULL,
	"compte_gl" text NOT NULL,
	"period" text NOT NULL,
	"solde_banque_debut" numeric DEFAULT '0' NOT NULL,
	"solde_banque_fin" numeric DEFAULT '0' NOT NULL,
	"solde_gl_debut" numeric DEFAULT '0' NOT NULL,
	"solde_gl_fin" numeric DEFAULT '0' NOT NULL,
	"ecart" numeric DEFAULT '0' NOT NULL,
	"total_matched" numeric DEFAULT '0' NOT NULL,
	"total_unmatched" numeric DEFAULT '0' NOT NULL,
	"matched_count" integer DEFAULT 0 NOT NULL,
	"unmatched_count" integer DEFAULT 0 NOT NULL,
	"statut" text DEFAULT 'DRAFT' NOT NULL,
	"import_file_name" text,
	"completed_at" timestamp,
	"completed_by" uuid,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ratios_prudentiels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid NOT NULL,
	"exercice_id" uuid,
	"periode_date" date NOT NULL,
	"roe" numeric,
	"roa" numeric,
	"ratio_solvabilite" numeric,
	"ratio_liquidite" numeric,
	"coeff_exploitation" numeric,
	"par30" numeric,
	"par60" numeric,
	"par90" numeric,
	"taux_recouvrement" numeric,
	"taux_defaut" numeric,
	"resultat_net" numeric,
	"capitaux_propres" numeric,
	"total_actif" numeric,
	"fonds_propres" numeric,
	"encours_pondere" numeric,
	"actifs_liquides" numeric,
	"passifs_ct" numeric,
	"charges_exploitation" numeric,
	"pnb" numeric,
	"alerts" jsonb DEFAULT '[]'::jsonb,
	"generated_at" timestamp DEFAULT now(),
	"generated_by" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_agence" varchar(20) NOT NULL,
	"nom" text NOT NULL,
	"type_agence" "type_agence_enum" DEFAULT 'SECONDARY' NOT NULL,
	"adresse" text,
	"ville_id" uuid,
	"telephone" text,
	"email" text,
	"responsable_id" uuid,
	"responsable_nom" text,
	"responsable_phone" text,
	"statut" text DEFAULT 'DRAFT' NOT NULL,
	"date_ouverture" date,
	"latitude" numeric,
	"longitude" numeric,
	"notes" text,
	"activated_at" timestamp,
	"activated_by" uuid,
	"suspended_at" timestamp,
	"suspended_reason" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	CONSTRAINT "agences_code_agence_unique" UNIQUE("code_agence")
);
--> statement-breakpoint
CREATE TABLE "agency_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"changed_by" uuid NOT NULL,
	"reason" text,
	"checklist_snapshot" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_agences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"agence_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"role" text,
	"date_affectation" date DEFAULT now(),
	"date_fin" date,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agency_migrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"source_agency_id" uuid NOT NULL,
	"target_clients_agency_id" uuid,
	"target_employees_agency_id" uuid,
	"target_treasury_agency_id" uuid,
	"statut" text DEFAULT 'DRAFT' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"current_step" text,
	"scheduled_at" timestamp,
	"execution_started_at" timestamp,
	"is_dry_run" boolean DEFAULT false NOT NULL,
	"dry_run_result" jsonb,
	"logs" jsonb DEFAULT '[]'::jsonb,
	"error" text,
	"error_details" jsonb,
	"can_retry" boolean DEFAULT true NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"report" jsonb,
	"report_generated_at" timestamp,
	"report_document_id" uuid,
	"created_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp,
	"executed_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	"locked" boolean DEFAULT false NOT NULL,
	"locked_at" timestamp,
	"metadata" jsonb,
	CONSTRAINT "agency_migrations_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "migration_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"migration_id" uuid NOT NULL,
	"action" text NOT NULL,
	"statut_avant" text,
	"statut_apres" text,
	"details" jsonb NOT NULL,
	"user_id" uuid,
	"user_role" text,
	"user_name" text,
	"ip_address" text,
	"user_agent" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "migration_entity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"migration_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"previous_agency_id" uuid NOT NULL,
	"new_agency_id" uuid NOT NULL,
	"snapshot_before" jsonb,
	"success" boolean DEFAULT true NOT NULL,
	"error" text,
	"migrated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "migration_pre_flight_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"migration_id" uuid NOT NULL,
	"check_type" text NOT NULL,
	"passed" boolean NOT NULL,
	"blocking" boolean DEFAULT true NOT NULL,
	"message" text,
	"details" jsonb,
	"resolution" text,
	"checked_at" timestamp DEFAULT now(),
	"checked_by" uuid
);
--> statement-breakpoint
CREATE TABLE "agent_commissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"agence_id" uuid,
	"periode" varchar(7) NOT NULL,
	"montant_collecte" numeric DEFAULT '0' NOT NULL,
	"taux_commission" numeric DEFAULT '5.0' NOT NULL,
	"montant_commission" numeric DEFAULT '0' NOT NULL,
	"primes" numeric DEFAULT '0' NOT NULL,
	"avances" numeric DEFAULT '0' NOT NULL,
	"montant_net" numeric DEFAULT '0' NOT NULL,
	"statut_paiement" text DEFAULT 'En attente' NOT NULL,
	"date_paiement" timestamp,
	"methode_paiement" text,
	"mouvement_id" uuid,
	"notes" text DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "agent_communications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expediteur_id" text NOT NULL,
	"destinataire_id" uuid NOT NULL,
	"agence_id" uuid,
	"type_message" text DEFAULT 'Info' NOT NULL,
	"sujet" text NOT NULL,
	"message" text NOT NULL,
	"priorite" text DEFAULT 'Normale' NOT NULL,
	"lu" boolean DEFAULT false NOT NULL,
	"date_lecture" timestamp,
	"piece_jointe_url" text DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "agent_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"agence_id" uuid,
	"type_incident" text DEFAULT 'Autre' NOT NULL,
	"gravite" text DEFAULT 'Moyenne' NOT NULL,
	"description" text NOT NULL,
	"date_incident" text NOT NULL,
	"localisation" text DEFAULT '',
	"statut" text DEFAULT 'OPEN' NOT NULL,
	"resolution" text DEFAULT '',
	"date_resolution" timestamp,
	"pieces_jointes" jsonb DEFAULT '[]'::jsonb,
	"escalade_par" text,
	"date_escalade" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "agent_materiel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"agence_id" uuid,
	"type_materiel" text DEFAULT 'Tablette' NOT NULL,
	"nom_materiel" text NOT NULL,
	"numero_serie" text DEFAULT '',
	"date_attribution" text NOT NULL,
	"date_retour" text,
	"etat" text DEFAULT 'Neuf' NOT NULL,
	"valeur" numeric DEFAULT '0' NOT NULL,
	"date_garantie_fin" text,
	"duree_amortissement_mois" integer DEFAULT 36,
	"prochaine_maintenance" text,
	"historique_maintenances" jsonb DEFAULT '[]'::jsonb,
	"notes" text DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "agent_objectifs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"agence_id" uuid,
	"periode" varchar(7) NOT NULL,
	"type_objectif" text DEFAULT 'Collecte' NOT NULL,
	"valeur_objectif" numeric DEFAULT '0' NOT NULL,
	"valeur_realisee" numeric DEFAULT '0' NOT NULL,
	"unite" text DEFAULT 'FCFA' NOT NULL,
	"statut" text DEFAULT 'IN_PROGRESS' NOT NULL,
	"recompense" numeric DEFAULT '0' NOT NULL,
	"avantage_id" integer,
	"avantage_employe_id" integer,
	"prime_statut" text DEFAULT 'NONE' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "agent_plannings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"agence_id" uuid,
	"date_planning" text NOT NULL,
	"heure_debut" text DEFAULT '08:00' NOT NULL,
	"heure_fin" text DEFAULT '17:00' NOT NULL,
	"type_activite" text DEFAULT 'Visite' NOT NULL,
	"zone" text DEFAULT '',
	"statut" text DEFAULT 'PLANNED' NOT NULL,
	"notes" text DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "agent_rapports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"agence_id" uuid,
	"periode_debut" text NOT NULL,
	"periode_fin" text NOT NULL,
	"type_rapport" text DEFAULT 'Mensuel' NOT NULL,
	"nombre_visites" integer DEFAULT 0 NOT NULL,
	"nombre_collectes" integer DEFAULT 0 NOT NULL,
	"montant_total_collecte" numeric DEFAULT '0' NOT NULL,
	"taux_reussite" numeric DEFAULT '0' NOT NULL,
	"clients_nouveaux" integer DEFAULT 0 NOT NULL,
	"incidents" integer DEFAULT 0 NOT NULL,
	"km_parcourus" numeric DEFAULT '0' NOT NULL,
	"notes" text DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "centres_couts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid,
	"code" text NOT NULL,
	"intitule" text NOT NULL,
	"type_center" text DEFAULT 'COST',
	"parent_id" uuid,
	"responsable" text,
	"actif" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cles_repartition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid,
	"code" text NOT NULL,
	"intitule" text NOT NULL,
	"actif" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cles_repartition_lignes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cle_id" uuid NOT NULL,
	"centre_cout_id" uuid NOT NULL,
	"pourcentage" numeric NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lignes_analytiques" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ligne_ecriture_id" uuid NOT NULL,
	"ecriture_id" uuid NOT NULL,
	"compte_analytique" text,
	"centre_cout_id" uuid,
	"ligne_produit_id" uuid,
	"debit" numeric DEFAULT '0' NOT NULL,
	"credit" numeric DEFAULT '0' NOT NULL,
	"pourcentage" numeric DEFAULT '100',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lignes_produits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid,
	"code" text NOT NULL,
	"intitule" text NOT NULL,
	"categorie" text,
	"actif" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "active_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"device_type" text,
	"browser" text,
	"os" text,
	"location" text,
	"login_at" timestamp DEFAULT now() NOT NULL,
	"last_activity" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"device_fingerprint" text,
	"device_fingerprint_partial" text,
	CONSTRAINT "active_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "agency_feature_locks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid NOT NULL,
	"feature_key" text NOT NULL,
	"locked" boolean DEFAULT true NOT NULL,
	"reason" text,
	"locked_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "agency_feature_locks_agence_id_feature_key_unique" UNIQUE("agence_id","feature_key")
);
--> statement-breakpoint
CREATE TABLE "critical_permission_patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pattern" text NOT NULL,
	"description" text,
	"require_reason" boolean DEFAULT true NOT NULL,
	"require_supervisor_approval" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "critical_permission_patterns_pattern_unique" UNIQUE("pattern")
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
CREATE TABLE "modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text DEFAULT 'Shield',
	"category" text DEFAULT 'general' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "modules_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "permission_analytics_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(50) NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "permission_analytics_config_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "permission_condition_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"condition_schema" jsonb NOT NULL,
	"variables" jsonb DEFAULT '[]'::jsonb,
	"examples" jsonb DEFAULT '[]'::jsonb,
	"is_system" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "permission_condition_templates_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "permission_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"permission_code" text NOT NULL,
	"request_type" "permission_request_type" DEFAULT 'GRANT' NOT NULL,
	"reason" text NOT NULL,
	"status" "permission_request_status" DEFAULT 'PENDING' NOT NULL,
	"expires_at" timestamp,
	"reviewer_id" uuid,
	"reviewed_at" timestamp,
	"review_reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permission_usage_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"user_role" varchar(50) NOT NULL,
	"permission_code" varchar(100) NOT NULL,
	"action" varchar(50) NOT NULL,
	"subject" varchar(100) NOT NULL,
	"allowed" boolean NOT NULL,
	"denied_reason" text,
	"agence_id" uuid,
	"resource_id" uuid,
	"resource_type" varchar(100),
	"endpoint" varchar(255),
	"ip_address" "inet",
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rbac_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"actor_ip" text,
	"actor_user_agent" text,
	"target_user_id" uuid,
	"target_role" text,
	"action" "rbac_audit_action" NOT NULL,
	"permission_id" uuid,
	"permission_code" text,
	"old_value" boolean,
	"new_value" boolean,
	"scope" "permission_scope" DEFAULT 'GLOBAL' NOT NULL,
	"agence_id" uuid,
	"reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"rbac_version_before" integer,
	"rbac_version_after" integer
);
--> statement-breakpoint
CREATE TABLE "rbac_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"last_change_type" text,
	"last_change_entity" text,
	"last_change_detail" jsonb,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"device_fingerprint" text,
	"ip_address" text,
	"user_agent" text,
	"family_id" uuid NOT NULL,
	"generation" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	"revoked" boolean DEFAULT false NOT NULL,
	"revoked_at" timestamp,
	"revoke_reason" text,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "role_hierarchy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_role" text NOT NULL,
	"child_role" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "role_hierarchy_parent_role_child_role_unique" UNIQUE("parent_role","child_role")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" "user_role" NOT NULL,
	"permission_id" uuid NOT NULL,
	"granted" boolean DEFAULT true NOT NULL,
	"conditions" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "system_feature_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flag_key" text NOT NULL,
	"flag_value" boolean DEFAULT false NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"enabled_at" timestamp,
	"enabled_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "system_feature_flags_flag_key_unique" UNIQUE("flag_key")
);
--> statement-breakpoint
CREATE TABLE "temporary_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"granted_by" uuid NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"reason" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"revoked_at" timestamp,
	"revoked_by" uuid,
	"revoke_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"granted" boolean DEFAULT true NOT NULL,
	"conditions" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_permissions_user_id_permission_id_unique" UNIQUE("user_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "user_role" NOT NULL,
	"agence_id" uuid,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_roles_user_id_role_agence_id_unique" UNIQUE("user_id","role","agence_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text,
	"password" text,
	"nom" text NOT NULL,
	"prenom" text,
	"email" text,
	"telephone" text,
	"sexe" varchar(1),
	"date_naissance" timestamp,
	"lieu_naissance" text,
	"lieu_naissance_locality_id" uuid,
	"lieu_naissance_locality_type" text,
	"nationalite_id" uuid,
	"pays_naissance_id" uuid,
	"adresse" text,
	"ville" varchar(100),
	"photo_profile" text,
	"type_compte" text DEFAULT 'employe' NOT NULL,
	"can_login" boolean DEFAULT true NOT NULL,
	"statut" text DEFAULT 'ACTIVE' NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "agent_agency_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"agence_id" uuid NOT NULL,
	"gl_account_id" uuid,
	"gl_account_number" text,
	"date_from" timestamp DEFAULT now() NOT NULL,
	"date_to" timestamp,
	"reason" text,
	"transferred_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_session_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid NOT NULL,
	"require_provisioning_approval" boolean DEFAULT false NOT NULL,
	"max_session_duration_hours" integer DEFAULT 24 NOT NULL,
	"max_provisioning_amount" numeric,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "caisses_agent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"solde_valide" numeric DEFAULT '0' NOT NULL,
	"devise" text DEFAULT 'XAF' NOT NULL,
	"statut" "statut_caisse_agent_enum" DEFAULT 'ACTIVE' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "operations_terrain" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"idempotency_key" text,
	"type" "type_operation_terrain_enum" NOT NULL,
	"agent_id" uuid NOT NULL,
	"caisse_agent_id" uuid NOT NULL,
	"client_id" uuid,
	"destination_caisse_id" uuid,
	"montant" numeric NOT NULL,
	"devise" text DEFAULT 'XAF' NOT NULL,
	"statut" "statut_operation_terrain_enum" DEFAULT 'SUBMITTED' NOT NULL,
	"submitted_by" uuid NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp,
	"rejected_by" uuid,
	"rejected_at" timestamp,
	"rejection_reason" text,
	"cancelled_by" uuid,
	"cancelled_at" timestamp,
	"cancellation_reason" text,
	"posted_at" timestamp,
	"posted_mouvement_caisse_agent_id" uuid,
	"posted_mouvement_client_id" uuid,
	"posted_mouvement_destination_id" uuid,
	"posted_paiement_terrain_id" uuid,
	"session_agent_id" uuid,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operations_terrain_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_id" uuid NOT NULL,
	"action" text NOT NULL,
	"statut_avant" text,
	"statut_apres" text NOT NULL,
	"details" json NOT NULL,
	"user_id" uuid NOT NULL,
	"user_role" text,
	"ip_address" text,
	"user_agent" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions_agent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"caisse_agent_id" uuid NOT NULL,
	"agence_id" uuid NOT NULL,
	"gl_account_id" uuid,
	"gl_account_number" text,
	"statut" "statut_session_agent_enum" DEFAULT 'REQUESTING_FUNDS' NOT NULL,
	"montant_demande" numeric,
	"montant_provisionne" numeric,
	"fund_requested_at" timestamp,
	"fund_dispatched_at" timestamp,
	"fund_dispatched_by" uuid,
	"source_caisse_id" uuid,
	"provisioning_operation_id" uuid,
	"opened_at" timestamp,
	"total_collected" numeric DEFAULT '0' NOT NULL,
	"total_settled" numeric DEFAULT '0' NOT NULL,
	"operation_count" integer DEFAULT 0 NOT NULL,
	"closing_initiated_at" timestamp,
	"montant_physique" numeric,
	"montant_theorique" numeric,
	"ecart" numeric,
	"ecart_justification" text,
	"billetage_fermeture" json,
	"destination_caisse_id" uuid,
	"closing_operation_id" uuid,
	"montant_retourne" numeric,
	"closed_at" timestamp,
	"closed_by" uuid,
	"closure_reason" text DEFAULT 'manual',
	"observations" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions_agent_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"action" text NOT NULL,
	"statut_avant" text,
	"statut_apres" text NOT NULL,
	"details" json,
	"user_id" uuid NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_closure_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"closure_id" uuid NOT NULL,
	"action" text NOT NULL,
	"actor_id" uuid,
	"statut_avant" text,
	"statut_apres" text,
	"metadata" jsonb,
	"ip_address" "inet",
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_closure_blockers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"closure_id" uuid NOT NULL,
	"blocker_type" text NOT NULL,
	"entity_id" uuid,
	"entity_type" text,
	"description" text NOT NULL,
	"montant" numeric(15, 2),
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp,
	"resolved_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_daily_closure" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid NOT NULL,
	"date_cloture" date NOT NULL,
	"statut" text DEFAULT 'OPEN' NOT NULL,
	"total_caisses" numeric DEFAULT '0' NOT NULL,
	"caisses_closed" numeric DEFAULT '0' NOT NULL,
	"caisses_with_pending_transfers" numeric DEFAULT '0' NOT NULL,
	"caisses_with_pending_remises" numeric DEFAULT '0' NOT NULL,
	"caisses_with_pending_ecarts" numeric DEFAULT '0' NOT NULL,
	"total_montant_ouverture" numeric(15, 2) DEFAULT '0',
	"total_montant_fermeture" numeric(15, 2) DEFAULT '0',
	"total_montant_vers_coffre" numeric(15, 2) DEFAULT '0',
	"total_montant_reporte" numeric(15, 2) DEFAULT '0',
	"total_ecarts" numeric(15, 2) DEFAULT '0',
	"total_ecarts_surplus" numeric(15, 2) DEFAULT '0',
	"total_ecarts_deficit" numeric(15, 2) DEFAULT '0',
	"all_caisses_closed" boolean DEFAULT false NOT NULL,
	"all_transfers_executed" boolean DEFAULT false NOT NULL,
	"all_remises_settled" boolean DEFAULT false NOT NULL,
	"all_ecarts_approved" boolean DEFAULT false NOT NULL,
	"coffre_reconciled" boolean DEFAULT false NOT NULL,
	"closed_by" uuid,
	"closed_at" timestamp,
	"closure_observations" text,
	"reopened_by" uuid,
	"reopened_at" timestamp,
	"reopened_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config_ecart_caisse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid,
	"seuil_auto_approve" numeric(15, 2) DEFAULT '100' NOT NULL,
	"seuil_n1_approval" numeric(15, 2) DEFAULT '5000' NOT NULL,
	"seuil_n2_approval" numeric(15, 2) DEFAULT '50000' NOT NULL,
	"roles_approbateurs_n1" jsonb DEFAULT '["SUPERVISEUR","CAISSIER"]'::jsonb NOT NULL,
	"roles_approbateurs_n2" jsonb DEFAULT '["CHEF_AGENCE","ADMIN"]'::jsonb NOT NULL,
	"block_close_until_approved" boolean DEFAULT true NOT NULL,
	"allow_self_approval_if_role" boolean DEFAULT false NOT NULL,
	"require_double_approval_n2" boolean DEFAULT false NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "config_ecart_caisse_agence_id_unique" UNIQUE("agence_id")
);
--> statement-breakpoint
CREATE TABLE "ecarts_approval_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"action" text NOT NULL,
	"actor_id" uuid,
	"actor_role" text,
	"comment" text,
	"metadata" jsonb,
	"ip_address" "inet",
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ecarts_approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"caissier_id" uuid NOT NULL,
	"agence_id" uuid,
	"solde_theorique" numeric(15, 2) NOT NULL,
	"montant_physique" numeric(15, 2) NOT NULL,
	"ecart" numeric(15, 2) NOT NULL,
	"type_ecart" text NOT NULL,
	"justification" text NOT NULL,
	"niveau_requis" text DEFAULT 'N1' NOT NULL,
	"statut" text DEFAULT 'PENDING_APPROVAL' NOT NULL,
	"approver_id" uuid,
	"approved_at" timestamp,
	"approval_decision" text,
	"approval_comment" text,
	"second_approver_id" uuid,
	"second_approved_at" timestamp,
	"second_approval_comment" text,
	"threshold_applied" numeric(15, 2) NOT NULL,
	"config_snapshot" jsonb,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mm_balance_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"caisse_digitale_id" uuid,
	"expected_balance" numeric(15, 2) NOT NULL,
	"provider_balance" numeric(15, 2),
	"ecart" numeric(15, 2) NOT NULL,
	"api_call_success" boolean DEFAULT false NOT NULL,
	"api_error_message" text,
	"api_response_time_ms" numeric,
	"statut" text DEFAULT 'PENDING' NOT NULL,
	"override_reason" text,
	"overridden_by" uuid,
	"overridden_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "activity_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"nom" text NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "profession_activity_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profession_id" uuid NOT NULL,
	"activity_type_id" uuid NOT NULL,
	"weight" integer DEFAULT 50 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profession_sectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profession_id" uuid NOT NULL,
	"sector_id" uuid NOT NULL,
	"weight" integer DEFAULT 50 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "professions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"nom" text NOT NULL,
	"keywords" text[],
	"actif" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sector_activity_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sector_id" uuid NOT NULL,
	"activity_type_id" uuid NOT NULL,
	"weight" integer DEFAULT 50 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"nom" text NOT NULL,
	"description" text,
	"parent_id" uuid,
	"keywords" text[],
	"actif" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
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
	"user_id" uuid,
	"adresse_domicile" text,
	"lieu_activite" text,
	"ville_id" uuid,
	"locality_type" text,
	"pays_residence_id" uuid,
	"statut_logement" text,
	"type_piece" "type_piece_enum",
	"numero_piece" text,
	"date_expiration_piece" timestamp,
	"pays_emission_id" uuid,
	"statut_verification_piece" text DEFAULT 'PENDING' NOT NULL,
	"verification_piece_by" uuid,
	"verification_piece_date" timestamp,
	"situation_matrimoniale" text,
	"nombre_personnes_charge" integer DEFAULT 0,
	"niveau_education" text,
	"type_client" text DEFAULT 'PARTICULIER' NOT NULL,
	"sector_id" uuid,
	"segment" text DEFAULT 'Standard' NOT NULL,
	"frequence_carte" text DEFAULT 'DAILY',
	"profession_id" uuid,
	"profession_autre_texte" text,
	"activity_type_id" uuid,
	"employeur" text,
	"anciennete_activite_mois" integer,
	"source_fonds" text,
	"revenu_mensuel" numeric,
	"revenu_journalier" numeric,
	"type_revenu" text DEFAULT 'Mensuel',
	"latitude" numeric,
	"longitude" numeric,
	"score" integer DEFAULT 50,
	"credit_total" numeric DEFAULT '0',
	"epargne_total" numeric DEFAULT '0',
	"taux_remboursement" numeric DEFAULT '100',
	"limite_retrait_journalier" numeric DEFAULT '2000000',
	"limite_retrait_hebdomadaire" numeric DEFAULT '10000000',
	"limite_retrait_mensuel" numeric DEFAULT '30000000',
	"points_fidelite" integer DEFAULT 0,
	"score_engagement" integer DEFAULT 0,
	"derniere_activite" timestamp,
	"is_pep" boolean DEFAULT false NOT NULL,
	"pep_details" text,
	"is_blacklisted" boolean DEFAULT false NOT NULL,
	"blacklist_reason" text,
	"blacklisted_at" timestamp,
	"risk_level" text DEFAULT 'LOW' NOT NULL,
	"kyc_status" text DEFAULT 'PENDING' NOT NULL,
	"kyc_verified_at" timestamp,
	"kyc_verified_by" uuid,
	"kyc_expiry_date" timestamp,
	"kyc_notes" text,
	"documents" jsonb,
	"consentement_donnees" boolean DEFAULT false NOT NULL,
	"consentement_date" timestamp,
	"notes" jsonb DEFAULT '[]'::jsonb,
	"references_personnes" jsonb DEFAULT '[]'::jsonb,
	"alerts" jsonb DEFAULT '[]'::jsonb,
	"client_origin" text DEFAULT 'OTHER' NOT NULL,
	"prospect_id" uuid,
	"agence_id" uuid,
	"agent_referent_id" uuid,
	"date_adhesion" timestamp DEFAULT now(),
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL
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
CREATE TABLE "config_coffre_fort" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid NOT NULL,
	"seuil_double_validation" numeric DEFAULT '1000000',
	"montant_max_transfert" numeric,
	"separation_initiateur_valideur" boolean DEFAULT true NOT NULL,
	"separation_valideur_executeur" boolean DEFAULT false NOT NULL,
	"roles_initiateurs" json DEFAULT '["CAISSIER", "COMPTABLE"]',
	"roles_valideurs" json DEFAULT '["CHEF_AGENCE", "SUPERVISEUR"]',
	"roles_executeurs" json DEFAULT '["CAISSIER", "COMPTABLE", "CHEF_AGENCE"]',
	"horaires_ouverture" json DEFAULT '{"debut":"08:00","fin":"18:00"}'::json,
	"jours_ouvrables" json DEFAULT '["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]'::json,
	"tentatives_max_par_jour" numeric DEFAULT '20',
	"verouillage_apres_echec" boolean DEFAULT true NOT NULL,
	"montant_min_transfert" numeric DEFAULT '100',
	"plafond_journalier_sortant" numeric,
	"plafond_journalier_entrant" numeric,
	"seuil_solde_min" numeric DEFAULT '1000000',
	"seuil_solde_critique" numeric DEFAULT '100000',
	"alerte_email_actif" boolean DEFAULT false NOT NULL,
	"justificatif_obligatoire" boolean DEFAULT false NOT NULL,
	"billetage_obligatoire_si_montant_sup" numeric,
	"comptage_double_personne" boolean DEFAULT false NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliations_coffre_caisse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"compte_liaison_source_id" uuid,
	"compte_liaison_dest_id" uuid,
	"transfert_id" uuid,
	"montant" numeric NOT NULL,
	"date_operation" timestamp NOT NULL,
	"statut" "statut_reconciliation_enum" DEFAULT 'PENDING' NOT NULL,
	"ecriture_source_id" uuid,
	"ecriture_dest_id" uuid,
	"date_rapprochement" timestamp,
	"rapproche_par" uuid,
	"jours_en_attente" numeric,
	"alerte_envoyee" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "taches_regularisation_coffre_caisse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfert_id" uuid,
	"type" "type_tache_regularisation_enum" NOT NULL,
	"description" text NOT NULL,
	"montant_ecart" numeric,
	"statut" "statut_tache_regularisation_enum" DEFAULT 'OPEN' NOT NULL,
	"assigned_to" uuid,
	"priorite" "priorite_tache_enum" DEFAULT 'NORMAL' NOT NULL,
	"date_echeance" timestamp,
	"resolution" text,
	"resolved_by" uuid,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "transferts_coffre_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfert_id" uuid NOT NULL,
	"action" text NOT NULL,
	"statut_avant" text,
	"statut_apres" text NOT NULL,
	"details" json NOT NULL,
	"user_id" uuid NOT NULL,
	"user_role" text,
	"ip_address" text,
	"user_agent" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transferts_coffre_caisse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid NOT NULL,
	"type_transfert" "type_transfert_coffre_enum" NOT NULL,
	"coffre_id" uuid NOT NULL,
	"caisse_id" uuid NOT NULL,
	"montant" numeric NOT NULL,
	"devise" text DEFAULT 'XAF' NOT NULL,
	"motif" text NOT NULL,
	"commentaire" text,
	"reference" text NOT NULL,
	"idempotency_key" text,
	"statut" "statut_transfert_coffre_enum" DEFAULT 'REQUESTED' NOT NULL,
	"requested_by" uuid NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"session_request_id" uuid,
	"validated_by" uuid,
	"validated_at" timestamp,
	"reason_rejection" text,
	"executed_by" uuid,
	"executed_at" timestamp,
	"session_execute_id" uuid,
	"mouvement_debit_id" uuid,
	"mouvement_credit_id" uuid,
	"operation_source_id" uuid,
	"operation_dest_id" uuid,
	"billetage" json,
	"metadata" json,
	"verrouille" boolean DEFAULT false NOT NULL,
	"session_ouverture_id" uuid,
	"is_opening_fund" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coffre_balance_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_date" date NOT NULL,
	"scope_type" text NOT NULL,
	"coffre_id" uuid,
	"agency_id" uuid,
	"balance" numeric(15, 2) NOT NULL,
	"payload" json,
	"source" text DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coffres_forts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"nom" text NOT NULL,
	"owner_type" "owner_type_coffre_enum" NOT NULL,
	"owner_id" uuid,
	"devise" text DEFAULT 'XAF' NOT NULL,
	"solde" numeric(15, 2) DEFAULT '0' NOT NULL,
	"plafond_encaisse" numeric(15, 2),
	"solde_minimum" numeric(15, 2) DEFAULT '0',
	"statut" "statut_coffre_enum" DEFAULT 'ACTIVE' NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "coffres_forts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "comptes_liaison" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"intitule" text NOT NULL,
	"numero_comptable" text NOT NULL,
	"entite_type" "owner_type_coffre_enum" NOT NULL,
	"entite_id" uuid,
	"solde_courant" numeric(15, 2) DEFAULT '0' NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "comptes_liaison_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "config_transfert_inter_coffres" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid,
	"montant_min_transfert" numeric(15, 2) DEFAULT '10000',
	"montant_max_transfert" numeric(15, 2),
	"seuil_alerte_plafond" numeric DEFAULT '80',
	"approbation_double_niveau" boolean DEFAULT true NOT NULL,
	"nombre_agents_transport_min" numeric DEFAULT '2' NOT NULL,
	"scelle_obligatoire_si_montant_superieur" numeric(15, 2),
	"separation_createur_approbateur_n1" boolean DEFAULT true NOT NULL,
	"separation_approbateur_n1_n2" boolean DEFAULT true NOT NULL,
	"separation_approbateur_recepteur" boolean DEFAULT true NOT NULL,
	"roles_createurs" json,
	"roles_approbateurs_n1" json,
	"roles_approbateurs_n2" json,
	"roles_recepteurs" json,
	"delai_max_reconciliation" numeric DEFAULT '3',
	"alerte_reconciliation_active" boolean DEFAULT true NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "config_transfert_inter_coffres_agence_id_unique" UNIQUE("agence_id")
);
--> statement-breakpoint
CREATE TABLE "documents_transfert" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfert_id" uuid NOT NULL,
	"type_document" "type_document_transfert_enum" NOT NULL,
	"numero_document" text NOT NULL,
	"date_generation" timestamp DEFAULT now(),
	"generated_by" uuid,
	"contenu_data" json,
	"pdf_url" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "documents_transfert_numero_document_unique" UNIQUE("numero_document")
);
--> statement-breakpoint
CREATE TABLE "reconciliations_liaison" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"compte_liaison_source_id" uuid,
	"compte_liaison_dest_id" uuid,
	"transfert_id" uuid,
	"montant" numeric(15, 2) NOT NULL,
	"date_operation" date NOT NULL,
	"statut" "statut_reconciliation_enum" DEFAULT 'PENDING' NOT NULL,
	"ecriture_source_id" uuid,
	"ecriture_dest_id" uuid,
	"date_rapprochement" timestamp,
	"rapproche_par" uuid,
	"jours_en_attente" numeric,
	"alerte_envoyee" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "taches_regularisation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfert_id" uuid,
	"type" "type_tache_regularisation_enum" NOT NULL,
	"description" text NOT NULL,
	"montant_ecart" numeric(15, 2),
	"statut" "statut_tache_regularisation_enum" DEFAULT 'OPEN' NOT NULL,
	"assigned_to" uuid,
	"priorite" "priorite_tache_enum" DEFAULT 'NORMAL' NOT NULL,
	"date_echeance" date,
	"resolution" text,
	"resolved_by" uuid,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "transferts_inter_coffres" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"date_transfert" date NOT NULL,
	"heure_depart" time,
	"coffre_source_id" uuid NOT NULL,
	"coffre_destination_id" uuid NOT NULL,
	"montant" numeric(15, 2) NOT NULL,
	"devise" text DEFAULT 'XAF' NOT NULL,
	"type_transfert" "type_transfert_inter_coffre_enum" NOT NULL,
	"type_conditionnement" "type_conditionnement_enum" NOT NULL,
	"numero_scelle" text,
	"motif" text NOT NULL,
	"statut" "statut_transfert_inter_coffre_enum" DEFAULT 'DRAFT' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"submitted_by" uuid,
	"submitted_at" timestamp,
	"approved_by_level1" uuid,
	"approved_at_level1" timestamp,
	"commentaire_n1" text,
	"approved_by_level2" uuid,
	"approved_at_level2" timestamp,
	"commentaire_n2" text,
	"dispatched_by" uuid,
	"dispatched_at" timestamp,
	"agents_transport" json,
	"received_by" uuid,
	"received_at" timestamp,
	"heure_reception" time,
	"montant_recu" numeric(15, 2),
	"conforme" boolean,
	"commentaire_reception" text,
	"ecart_montant" numeric(15, 2),
	"motif_ecart" text,
	"mouvement_source_id" uuid,
	"mouvement_destination_id" uuid,
	"date_comptable" date,
	"rejection_reason" text,
	"rejected_by" uuid,
	"rejected_at" timestamp,
	"cancellation_reason" text,
	"cancelled_by" uuid,
	"cancelled_at" timestamp,
	"verrouille" boolean DEFAULT false NOT NULL,
	"idempotency_key" text,
	"metadata" json,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "transferts_inter_coffres_reference_unique" UNIQUE("reference"),
	CONSTRAINT "transferts_inter_coffres_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "transferts_inter_coffres_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfert_id" uuid NOT NULL,
	"action" "action_audit_transfert_enum" NOT NULL,
	"statut_avant" text,
	"statut_apres" text,
	"details" json,
	"user_id" uuid,
	"user_role" text,
	"user_name" text,
	"ip_address" text,
	"user_agent" text,
	"timestamp" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "conversation_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "participant_role" DEFAULT 'MEMBER' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"left_at" timestamp,
	"last_read_at" timestamp,
	"last_read_message_id" uuid,
	"mute_until" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "conversation_type" DEFAULT 'DM' NOT NULL,
	"title" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by_id" uuid NOT NULL,
	"last_message_id" uuid,
	"last_message_at" timestamp,
	"last_message_preview" text,
	"agence_id" uuid,
	"is_archived" boolean DEFAULT false NOT NULL,
	"dm_key" varchar(73),
	CONSTRAINT "conversations_dm_key_unique" UNIQUE("dm_key")
);
--> statement-breakpoint
CREATE TABLE "message_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"emoji" varchar(10) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages_v2" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"content" text,
	"content_type" "message_content_type" DEFAULT 'TEXT' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"edited_at" timestamp,
	"deleted_at" timestamp,
	"reply_to_message_id" uuid
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "departments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "job_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"department_id" uuid NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"salaire_min" integer,
	"salaire_max" integer,
	"qualification" varchar(50),
	"responsabilites" text,
	"competences_requises" json,
	"effectif_prevu" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "device_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" uuid NOT NULL,
	"device_fingerprint" text NOT NULL,
	"public_key_jwk" jsonb NOT NULL,
	"status" "device_key_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"revoke_reason" text,
	"last_used_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "offline_day_sessions" (
	"id" text PRIMARY KEY DEFAULT 'gen_random_uuid()' NOT NULL,
	"date" text NOT NULL,
	"agent_id" uuid NOT NULL,
	"device_id" text NOT NULL,
	"agence_id" uuid NOT NULL,
	"opening_balance" text NOT NULL,
	"opening_billetage" jsonb,
	"closing_balance" text,
	"closing_billetage" jsonb,
	"total_collected" text DEFAULT '0',
	"total_disbursed" text DEFAULT '0',
	"operation_count" text DEFAULT '0',
	"daily_volume" text DEFAULT '0',
	"expected_balance" text,
	"discrepancy" text,
	"discrepancy_justification" text,
	"status" "offline_day_session_status" DEFAULT 'synced' NOT NULL,
	"first_entry_id" text,
	"last_entry_id" text,
	"entry_count" text DEFAULT '0',
	"chain_valid" text,
	"opened_at" timestamp NOT NULL,
	"closed_at" timestamp,
	"synced_at" timestamp DEFAULT now(),
	"reconciled_at" timestamp,
	"reconciled_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offline_journal_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"client_sequence" text NOT NULL,
	"device_id" text NOT NULL,
	"agent_id" uuid NOT NULL,
	"agence_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"previous_hash" text NOT NULL,
	"entry_hash" text NOT NULL,
	"signature" text NOT NULL,
	"device_key_id" text NOT NULL,
	"client_timestamp" timestamp NOT NULL,
	"ntp_offset" text,
	"server_timestamp" timestamp DEFAULT now() NOT NULL,
	"server_sequence" text,
	"status" "offline_journal_status" DEFAULT 'confirmed' NOT NULL,
	"reject_reason" text,
	"mouvement_id" text,
	"operation_ref" text,
	"offline_session_date" text,
	"idempotency_key" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "offline_journal_entries_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "dossiers_credit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"idempotency_key" text,
	"prospection_id" uuid,
	"client_id" uuid,
	"agent_id" uuid NOT NULL,
	"agence_id" uuid,
	"montant_demande" numeric NOT NULL,
	"objet_credit" text NOT NULL,
	"duree_souhaitee" integer,
	"frequence_remboursement" text DEFAULT 'MONTHLY',
	"nom_client" text NOT NULL,
	"prenom_client" text,
	"telephone_client" text NOT NULL,
	"adresse_client" text,
	"profession" text,
	"type_activite" text,
	"revenu_estime" numeric,
	"nom_garant" text,
	"telephone_garant" text,
	"adresse_garant" text,
	"relation_garant" text,
	"documents" jsonb DEFAULT '[]'::jsonb,
	"photo_url" text,
	"latitude" numeric,
	"longitude" numeric,
	"statut" "statut_dossier_credit_enum" DEFAULT 'DRAFT' NOT NULL,
	"frais_engagement_attendus" numeric,
	"frais_engagement_payes" numeric DEFAULT '0',
	"paiement_frais_id" uuid,
	"frais_payes_at" timestamp,
	"submitted_by" uuid,
	"submitted_at" timestamp,
	"enquete_id" uuid,
	"committee_decision" text,
	"committee_decision_at" timestamp,
	"committee_decision_by" uuid,
	"committee_observations" text,
	"montant_approuve" numeric,
	"demande_credit_id" uuid,
	"credit_id" uuid,
	"rejected_at" timestamp,
	"rejected_by" uuid,
	"rejection_reason" text,
	"cancelled_at" timestamp,
	"cancelled_by" uuid,
	"cancellation_reason" text,
	"observations" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "employes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"matricule" varchar(50),
	"job_position_id" uuid,
	"date_embauche" date,
	"type_contrat" varchar(20) DEFAULT 'CDI',
	"agence_id" uuid,
	"manager_id" uuid,
	"statut" text DEFAULT 'ACTIVE' NOT NULL,
	"salaire_base" integer DEFAULT 0,
	"taux_horaire" integer DEFAULT 0,
	"taux_journalier" integer DEFAULT 0,
	"mode_calcul_paie" varchar(20) DEFAULT 'MONTHLY',
	"numero_cnss" varchar(50),
	"type_piece" varchar(20),
	"numero_piece" text,
	"date_expiration_piece" date,
	"pays_emission_id" uuid,
	"payment_method" varchar(20) DEFAULT 'CASH',
	"payment_details" text,
	"bank_name" varchar(100),
	"bank_code" varchar(10),
	"branch_code" varchar(10),
	"bank_account_number" varchar(50),
	"account_key" varchar(5),
	"coefficient" integer,
	"categorie" varchar(20),
	"date_fin_contrat" date,
	"date_fin_essai" date,
	"duree_essai_mois" integer,
	"prochaine_medicale" date,
	"date_sortie" date,
	"motif_sortie" varchar(50),
	"niu" varchar(30),
	"situation_familiale" varchar(20) DEFAULT 'CELIBATAIRE',
	"nombre_enfants_charge" integer DEFAULT 0,
	"caisse_pin" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "employes_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "employes_matricule_unique" UNIQUE("matricule"),
	CONSTRAINT "employes_numero_cnss_unique" UNIQUE("numero_cnss")
);
--> statement-breakpoint
CREATE TABLE "config_evacuation_coffre" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid,
	"montant_min_evacuation" numeric(15, 2) DEFAULT '100000',
	"montant_max_evacuation" numeric(15, 2),
	"seuil_evacuation_obligatoire" numeric(15, 2),
	"approbation_requise" boolean DEFAULT true NOT NULL,
	"separation_createur_approbateur" boolean DEFAULT true NOT NULL,
	"separation_approbateur_preparateur" boolean DEFAULT true NOT NULL,
	"separation_preparateur_dispatcher" boolean DEFAULT false NOT NULL,
	"roles_createurs" json DEFAULT '["CAISSIER","COMPTABLE","CHEF_AGENCE"]'::json,
	"roles_approbateurs" json DEFAULT '["CHEF_AGENCE","ADMIN","SUPERVISEUR"]'::json,
	"roles_preparateurs" json DEFAULT '["CAISSIER","COMPTABLE","CHEF_AGENCE"]'::json,
	"roles_dispatchers" json DEFAULT '["CHEF_AGENCE","ADMIN"]'::json,
	"nombre_agents_transport_min" numeric DEFAULT '1' NOT NULL,
	"scelle_obligatoire" boolean DEFAULT false NOT NULL,
	"scelle_obligatoire_si_montant_superieur" numeric(15, 2),
	"billetage_obligatoire" boolean DEFAULT true NOT NULL,
	"destinations_autorisees" json DEFAULT '["BANQUE","COFFRE_CENTRAL","TRANSPORTEUR"]'::json,
	"delai_max_reconciliation" numeric DEFAULT '5',
	"alerte_reconciliation_active" boolean DEFAULT true NOT NULL,
	"seuil_ecart_acceptable" numeric(15, 2) DEFAULT '0',
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evacuations_coffre" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"date_evacuation" date NOT NULL,
	"coffre_source_id" uuid NOT NULL,
	"agence_id" uuid NOT NULL,
	"type_destination" "type_destination_evacuation_enum" NOT NULL,
	"banque_nom" text,
	"banque_compte" text,
	"banque_numero_comptable" text,
	"coffre_destination_id" uuid,
	"transporteur_nom" text,
	"transporteur_contact" text,
	"transporteur_reference" text,
	"montant" numeric(15, 2) NOT NULL,
	"devise" text DEFAULT 'XAF' NOT NULL,
	"motif_evacuation" "motif_evacuation_enum" NOT NULL,
	"motif_detail" text NOT NULL,
	"statut" "statut_evacuation_coffre_enum" DEFAULT 'DRAFT' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"submitted_by" uuid,
	"submitted_at" timestamp,
	"approved_by" uuid,
	"approved_at" timestamp,
	"commentaire_approbation" text,
	"prepared_by" uuid,
	"prepared_at" timestamp,
	"type_conditionnement" "type_conditionnement_enum",
	"numero_scelle" text,
	"billetage" json,
	"montant_compte" numeric(15, 2),
	"ecart_preparation" numeric(15, 2),
	"commentaire_preparation" text,
	"dispatched_by" uuid,
	"dispatched_at" timestamp,
	"heure_depart" time,
	"agents_transport" json,
	"deposited_by" uuid,
	"deposited_at" timestamp,
	"heure_depot" time,
	"montant_depose" numeric(15, 2),
	"reference_bordereau" text,
	"reference_recu_transporteur" text,
	"commentaire_depot" text,
	"reconciled_by" uuid,
	"reconciled_at" timestamp,
	"montant_confirme" numeric(15, 2),
	"ecart_montant" numeric(15, 2),
	"motif_ecart" text,
	"conforme" boolean,
	"mouvement_transit_id" uuid,
	"mouvement_depot_id" uuid,
	"mouvement_ecart_id" uuid,
	"date_comptable" date,
	"rejection_reason" text,
	"rejected_by" uuid,
	"rejected_at" timestamp,
	"cancellation_reason" text,
	"cancelled_by" uuid,
	"cancelled_at" timestamp,
	"verrouille" boolean DEFAULT false NOT NULL,
	"idempotency_key" text,
	"metadata" json,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evacuations_coffre_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evacuation_id" uuid NOT NULL,
	"action" "action_audit_evacuation_enum" NOT NULL,
	"statut_avant" text,
	"statut_apres" text,
	"details" json,
	"user_id" uuid,
	"user_role" text,
	"user_name" text,
	"ip_address" text,
	"user_agent" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_closure_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"compte_id" uuid NOT NULL,
	"initiated_by" uuid NOT NULL,
	"initiated_at" timestamp DEFAULT now() NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp,
	"status" "closure_request_status_enum" DEFAULT 'PENDING' NOT NULL,
	"reason" text NOT NULL,
	"closing_fee_amount" numeric DEFAULT '0' NOT NULL,
	"payout_method" "closure_payout_method_enum" NOT NULL,
	"payout_amount" numeric NOT NULL,
	"payout_phone_number" text,
	"payout_status" "closure_payout_status_enum" DEFAULT 'PENDING' NOT NULL,
	"payout_mouvement_id" uuid,
	"payout_payment_intent_id" uuid,
	"balance_at_initiation" numeric NOT NULL,
	"cancelled_by" uuid,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_opening_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"compte_id" uuid NOT NULL,
	"initiated_by" uuid NOT NULL,
	"initiated_at" timestamp DEFAULT now() NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp,
	"status" "opening_request_status_enum" DEFAULT 'PENDING' NOT NULL,
	"opening_fee_amount" numeric DEFAULT '0' NOT NULL,
	"initial_deposit_amount" numeric NOT NULL,
	"produit_id" uuid,
	"rejected_by" uuid,
	"rejected_at" timestamp,
	"reject_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "caisse_handover_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handover_id" uuid NOT NULL,
	"action" text NOT NULL,
	"actor_id" uuid,
	"statut_avant" text,
	"statut_apres" text,
	"details" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "caisse_handovers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"caisse_id" uuid NOT NULL,
	"agence_id" uuid,
	"from_caissier_id" uuid NOT NULL,
	"to_caissier_id" uuid NOT NULL,
	"montant_theorique" numeric NOT NULL,
	"montant_compte" numeric NOT NULL,
	"ecart" numeric DEFAULT '0',
	"billetage_sortant" jsonb,
	"billetage_entrant" jsonb,
	"statut" text DEFAULT 'PENDING' NOT NULL,
	"motif" text,
	"observations_sortant" text,
	"observations_entrant" text,
	"ecart_justification" text,
	"initiated_at" timestamp DEFAULT now() NOT NULL,
	"counting_started_at" timestamp,
	"confirmed_at" timestamp,
	"cancelled_at" timestamp,
	"cancelled_by" uuid,
	"cancel_reason" text,
	"requires_approval" boolean DEFAULT false,
	"approved_by" uuid,
	"approved_at" timestamp,
	"approval_comment" text,
	"ip_address_from" text,
	"ip_address_to" text,
	"user_agent_from" text,
	"user_agent_to" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "caisse_payment_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" "caisse_request_category_enum" NOT NULL,
	"direction" text NOT NULL,
	"agence_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"target_caisse_id" uuid,
	"client_id" uuid,
	"employee_id" uuid,
	"montant" numeric NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"metadata" jsonb,
	"statut" "caisse_request_status_enum" DEFAULT 'PENDING' NOT NULL,
	"processed_by" uuid,
	"processed_at" timestamp,
	"session_caisse_id" uuid,
	"mouvement_id" uuid,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "caisse_transferts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_source_id" uuid NOT NULL,
	"session_dest_id" uuid,
	"agence_source_id" uuid NOT NULL,
	"agence_dest_id" uuid NOT NULL,
	"montant" numeric NOT NULL,
	"statut" "statut_transfert_caisse_enum" DEFAULT 'PENDING' NOT NULL,
	"reference" text NOT NULL,
	"idempotency_key" text,
	"mouvement_sortie_id" uuid,
	"mouvement_entree_id" uuid,
	"motif" text,
	"observations" text,
	"date_creation" timestamp DEFAULT now() NOT NULL,
	"date_validation" timestamp,
	"date_reception" timestamp,
	"validated_by" uuid,
	"received_by" uuid,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "caisses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"agence_id" uuid NOT NULL,
	"type" text DEFAULT 'PHYSICAL' NOT NULL,
	"solde" numeric DEFAULT '0' NOT NULL,
	"statut" "statut_caisse_main_enum" DEFAULT 'CLOSED' NOT NULL,
	"operating_hours_enabled" boolean DEFAULT false,
	"operating_hours_start" text DEFAULT '08:00',
	"operating_hours_end" text DEFAULT '17:00',
	"operating_days" jsonb DEFAULT '[1,2,3,4,5]'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "cash_opening_discrepancies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"agence_id" uuid NOT NULL,
	"caisse_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"gl_balance" numeric NOT NULL,
	"billetage_total" numeric NOT NULL,
	"ecart" numeric NOT NULL,
	"ecart_percent" numeric,
	"strictness_mode" text NOT NULL,
	"action" text NOT NULL,
	"justification" text,
	"approved_by" uuid,
	"approved_at" timestamp,
	"billetage_detail" json,
	"previous_session_id" uuid,
	"previous_session_closed_at" timestamp,
	"previous_session_ecart" numeric,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "compte_agences_historique" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"compte_id" uuid NOT NULL,
	"agence_id" uuid NOT NULL,
	"date_debut" timestamp DEFAULT now() NOT NULL,
	"date_fin" timestamp,
	"motif" text,
	"reference" text,
	"transfere_par" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comptes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"produit_id" uuid,
	"agence_id" uuid,
	"numero_compte" text NOT NULL,
	"type_compte" "type_compte_enum" NOT NULL,
	"statut" "statut_compte_enum" DEFAULT 'ACTIVE' NOT NULL,
	"opening_snapshot" jsonb,
	"paid_opening_fee" numeric DEFAULT '0' NOT NULL,
	"paid_initial_deposit" numeric DEFAULT '0' NOT NULL,
	"is_approved" boolean DEFAULT false NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp,
	"blocage_actif" boolean DEFAULT false NOT NULL,
	"blocage_motif" "motif_blocage_enum",
	"blocage_reference" text,
	"blocage_debut" timestamp,
	"blocage_fin" timestamp,
	"suspended_at" timestamp,
	"suspended_by" uuid,
	"suspended_reason_code" "suspension_reason_enum",
	"suspended_reason_text" text,
	"auto_lift" boolean DEFAULT false NOT NULL,
	"suspended_end_date" timestamp,
	"suspended_review_required" boolean DEFAULT false NOT NULL,
	"solde_courant" numeric DEFAULT '0' NOT NULL,
	"versement_auto_actif" boolean DEFAULT false NOT NULL,
	"versement_auto_montant" numeric,
	"versement_auto_frequence" "frequence_remboursement_enum",
	"versement_auto_jour" integer,
	"compte_source_id" uuid,
	"dernier_versement_auto" timestamp,
	"prochain_versement_auto" timestamp,
	"accrued_interest" numeric DEFAULT '0' NOT NULL,
	"date_derniere_capitalisation" timestamp,
	"date_derniere_frais_tenue" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"closed_at" timestamp,
	"closed_by" uuid
);
--> statement-breakpoint
CREATE TABLE "config_reevaluation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delai_minimum_jours" integer DEFAULT 1 NOT NULL,
	"max_reevaluations_par_demande" integer DEFAULT 2 NOT NULL,
	"motifs_non_reevaluables" text[],
	"elements_nouveaux_obligatoires" boolean DEFAULT true NOT NULL,
	"enquete_complementaire_obligatoire" boolean DEFAULT false NOT NULL,
	"documents_minimum" integer DEFAULT 1 NOT NULL,
	"seuil_score_minimum" integer DEFAULT 40,
	"delta_score_minimum" integer DEFAULT 5,
	"reduction_montant_max_pourcentage" integer DEFAULT 50,
	"actif" boolean DEFAULT true NOT NULL,
	"agence_id" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "credit_plan_fees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"fee_type" "fee_type_enum" NOT NULL,
	"label" text,
	"calc_type" "fee_calc_type_enum" DEFAULT 'FIXED' NOT NULL,
	"value" numeric NOT NULL,
	"min_amount" numeric,
	"max_amount" numeric,
	"collection_mode" "fee_collection_mode_enum" DEFAULT 'UPFRONT' NOT NULL,
	"is_refundable" boolean DEFAULT false NOT NULL,
	"accounting_code" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "credit_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"description" text,
	"type_credit" "type_credit_enum" DEFAULT 'PERSONAL' NOT NULL,
	"montant_min" numeric,
	"montant_max" numeric,
	"duree_valeur" integer NOT NULL,
	"duree_unite" "duree_unite_enum" NOT NULL,
	"frequence_remboursement" "frequence_remboursement_enum" NOT NULL,
	"taux_interet" numeric NOT NULL,
	"interest_method" "interest_method_enum" DEFAULT 'FLAT' NOT NULL,
	"interest_rate_period" "interest_rate_period_enum" DEFAULT 'MONTHLY' NOT NULL,
	"day_count_convention" "day_count_convention_enum" DEFAULT '30_360' NOT NULL,
	"interest_rounding_mode" "rounding_mode_enum" DEFAULT 'ROUND' NOT NULL,
	"interest_rounding_unit" integer DEFAULT 1 NOT NULL,
	"amortization_type" "amortization_type_enum" DEFAULT 'EQUAL_INSTALLMENTS' NOT NULL,
	"allow_partial_payments" boolean DEFAULT true NOT NULL,
	"first_due_rule" "first_due_rule_enum" DEFAULT 'NEXT_DAY' NOT NULL,
	"grace_period_days" integer DEFAULT 0 NOT NULL,
	"preferred_weekday" integer,
	"calendar_mode" "calendar_mode_enum" DEFAULT 'ALL_DAYS' NOT NULL,
	"weekdays_mask" integer DEFAULT 127 NOT NULL,
	"shift_non_working_day" "shift_non_working_day_enum" DEFAULT 'NEXT' NOT NULL,
	"holiday_calendar_id" uuid,
	"allow_manual_first_due_date" boolean DEFAULT false NOT NULL,
	"late_fee_enabled" boolean DEFAULT true NOT NULL,
	"late_fee_grace_days" integer DEFAULT 0 NOT NULL,
	"late_fee_type" "late_fee_type_enum" DEFAULT 'PERCENTAGE' NOT NULL,
	"late_fee_value" numeric DEFAULT '2' NOT NULL,
	"late_interest_enabled" boolean DEFAULT false NOT NULL,
	"late_interest_rate" numeric,
	"penalty_cap" numeric,
	"penalty_application" "penalty_application_enum" DEFAULT 'PER_INSTALLMENT' NOT NULL,
	"prepayment_allowed" boolean DEFAULT true NOT NULL,
	"prepayment_fee_type" "prepayment_fee_type_enum" DEFAULT 'NONE' NOT NULL,
	"prepayment_fee_value" numeric,
	"prepayment_interest_rebate" boolean DEFAULT false NOT NULL,
	"min_segment" text,
	"min_score_global" integer,
	"min_points_fidelite" integer,
	"min_taux_remboursement" numeric,
	"kyc_required" boolean DEFAULT false NOT NULL,
	"max_debt_to_income_ratio" numeric,
	"require_savings_account" boolean DEFAULT false NOT NULL,
	"collateral_required" boolean DEFAULT false NOT NULL,
	"collateral_types" text[],
	"guarantee_deposit_percent" numeric,
	"guarantee_deposit_min" numeric,
	"guarantee_release_rule" "guarantee_release_rule_enum" DEFAULT 'ON_FULL_REPAYMENT',
	"is_active" boolean DEFAULT true NOT NULL,
	"effective_from" timestamp,
	"effective_to" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" uuid,
	"created_by" uuid,
	"conditions" text[],
	"documents_requis" text[],
	"agence_id" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "credit_refund_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"demande_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"agence_id" uuid NOT NULL,
	"montant_encaisse" numeric NOT NULL,
	"montant_remboursable" numeric NOT NULL,
	"montant_non_remboursable" numeric NOT NULL,
	"statut" "statut_refund_request_enum" DEFAULT 'DRAFT' NOT NULL,
	"motif_rejet_credit" text,
	"motif_remboursement" text,
	"maker_id" uuid,
	"maker_at" timestamp,
	"checker_id" uuid,
	"checker_at" timestamp,
	"checker_decision" text,
	"checker_comment" text,
	"paid_at" timestamp,
	"paid_by" uuid,
	"payment_method" text,
	"mobile_money_provider" text,
	"mobile_money_phone" text,
	"payment_reference" text,
	"mouvement_id" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero_credit" text NOT NULL,
	"client_id" uuid NOT NULL,
	"demande_id" uuid,
	"credit_plan_id" uuid,
	"enquete_id" uuid,
	"montant" numeric NOT NULL,
	"taux" numeric NOT NULL,
	"duree" integer NOT NULL,
	"type_credit" text NOT NULL,
	"objet_credit" text,
	"statut" "statut_credit_enum" DEFAULT 'PENDING' NOT NULL,
	"date_debut" timestamp,
	"date_fin" timestamp,
	"date_solvabilite" timestamp,
	"date_solde" timestamp,
	"solde_avant_2_mois" boolean DEFAULT false,
	"solde_restant" numeric,
	"total_du" numeric DEFAULT '0' NOT NULL,
	"echeance" text DEFAULT 'DAILY',
	"montant_echeance" numeric,
	"prochaine_echeance" timestamp,
	"garanties" text,
	"observations" text,
	"agence_id" uuid,
	"date_decaissement_programme" timestamp,
	"decaissement_automatique" boolean DEFAULT false NOT NULL,
	"date_decaissement_effectif" timestamp,
	"decaissement_tentatives" integer DEFAULT 0 NOT NULL,
	"decaissement_erreur" text,
	"remboursement_automatique" boolean DEFAULT false NOT NULL,
	"remboursement_compte_id" uuid,
	"last_auto_repayment_check" timestamp,
	"disbursement_channel" "disbursement_channel_enum" DEFAULT 'ACCOUNT',
	"disbursement_status" "disbursement_status_enum",
	"target_caisse_id" uuid,
	"payment_reference" text,
	"disbursed_at" timestamp,
	"disbursed_by" uuid,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "credits_numero_credit_unique" UNIQUE("numero_credit")
);
--> statement-breakpoint
CREATE TABLE "decaissements_programmes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"credit_id" uuid NOT NULL,
	"montant" numeric NOT NULL,
	"statut" "statut_decaissement_prog_enum" NOT NULL,
	"date_execution" timestamp,
	"date_planifiee" timestamp NOT NULL,
	"mouvement_id" uuid,
	"erreur" text,
	"tentatives" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demandes_credit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero_demande" text NOT NULL,
	"client_id" uuid NOT NULL,
	"agence_id" uuid NOT NULL,
	"credit_plan_id" uuid,
	"montant_demande" numeric NOT NULL,
	"taux_interet" numeric NOT NULL,
	"frequence_remboursement" "frequence_remboursement_enum" NOT NULL,
	"duree_valeur" integer NOT NULL,
	"duree_unite" "duree_unite_enum" NOT NULL,
	"nombre_echeances" integer,
	"type_revenu" "type_revenu_enum",
	"statut" "statut_demande_enum",
	"type_credit" "type_credit_enum",
	"objet_credit" text NOT NULL,
	"revenus_mensuels" numeric,
	"revenu_journalier" numeric,
	"charges_mensuelles" numeric,
	"score_credit" integer,
	"montant_approuve" numeric,
	"motif_rejet" text,
	"frais_engagement_payes" boolean DEFAULT false,
	"montant_frais_engagement" numeric,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	"date_rejet" timestamp,
	"nombre_reevaluations" integer DEFAULT 0 NOT NULL,
	"derniere_reevaluation_id" uuid,
	"date_derniere_reevaluation" timestamp,
	"reevaluation_en_cours" boolean DEFAULT false NOT NULL,
	CONSTRAINT "demandes_credit_numero_demande_unique" UNIQUE("numero_demande")
);
--> statement-breakpoint
CREATE TABLE "denomination_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"description" text,
	"agence_id" uuid,
	"caisse_id" uuid,
	"billetage" jsonb NOT NULL,
	"total_calcule" numeric NOT NULL,
	"type_template" text DEFAULT 'GENERAL',
	"usage_count" integer DEFAULT 0,
	"last_used_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "durees_suggerees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"frequence" "frequence_remboursement_enum" NOT NULL,
	"duree_valeur" integer NOT NULL,
	"duree_unite" "duree_unite_enum" NOT NULL,
	"type_credit" text,
	"agence_id" uuid,
	"est_recommandee" boolean DEFAULT false NOT NULL,
	"ordre" integer DEFAULT 0 NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "echeances_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"credit_id" uuid NOT NULL,
	"numero_echeance" integer NOT NULL,
	"date_echeance" timestamp NOT NULL,
	"montant_capital" numeric NOT NULL,
	"montant_interet" numeric NOT NULL,
	"montant_total" numeric NOT NULL,
	"montant_paye" numeric DEFAULT '0',
	"statut" "statut_echeance_credit_enum" DEFAULT 'UPCOMING' NOT NULL,
	"date_paiement" timestamp,
	"sequence" integer,
	"paid_at" timestamp,
	"late_marked_at" timestamp,
	"last_payment_date" timestamp,
	"montant_capital_paye" numeric DEFAULT '0',
	"montant_interet_paye" numeric DEFAULT '0',
	"penalite_montant" numeric DEFAULT '0',
	"penalite_payee" numeric DEFAULT '0',
	"accrual_posted" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "enquetes_complementaires" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reevaluation_id" uuid NOT NULL,
	"demande_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"enquete_initiale_id" uuid,
	"numero_enquete" text NOT NULL,
	"objectif_enquete" text NOT NULL,
	"points_a_verifier" text[],
	"verifications_effectuees" json,
	"situation_actuelle" json,
	"garanties_verifiees" json,
	"co_emprunteur_verifie" json,
	"photos_enquete" text[],
	"documents_collectes" text[],
	"geo_latitude" numeric,
	"geo_longitude" numeric,
	"geo_accuracy" numeric,
	"geo_timestamp" timestamp,
	"score_complementaire" integer,
	"recommandation_enqueteur" text,
	"observations_enqueteur" text,
	"risques_identifies" text[],
	"statut" "statut_enquete_complementaire_enum" DEFAULT 'IN_PROGRESS' NOT NULL,
	"enqueteur_id" uuid NOT NULL,
	"date_debut" timestamp DEFAULT now(),
	"date_fin" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "enquetes_complementaires_numero_enquete_unique" UNIQUE("numero_enquete")
);
--> statement-breakpoint
CREATE TABLE "enquetes_credit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"demande_id" uuid,
	"credit_plan_id" uuid,
	"montant_demande" numeric NOT NULL,
	"objet_credit" text NOT NULL,
	"assigned_agent_id" uuid,
	"assigned_at" timestamp,
	"assigned_by" uuid,
	"due_date" timestamp,
	"priority" text DEFAULT 'MEDIUM',
	"categorie_activite" text,
	"type_activite" text,
	"anciennete_activite" integer,
	"evaluation_activite" text,
	"revenu_mensuel" numeric,
	"type_revenu" "type_revenu_enum",
	"revenu_journalier" numeric,
	"jours_travail_mois" integer DEFAULT 26,
	"charges_mensuelles" numeric,
	"autre_prets" numeric DEFAULT '0',
	"personnes_charge" integer DEFAULT 0,
	"situation_matrimoniale" text,
	"type_habitation" text,
	"autres_credits" json,
	"garanties_proposees" json,
	"photos_activite" text[],
	"documents_justificatifs" text[],
	"geo_latitude" numeric,
	"geo_longitude" numeric,
	"geo_accuracy" numeric,
	"geo_timestamp" timestamp,
	"capacite_remboursement" numeric,
	"score_global" integer,
	"recommandation" text,
	"statut" "statut_enquete_credit_enum" DEFAULT 'PENDING_ASSIGNMENT' NOT NULL,
	"observations" text,
	"agent_recommendation" "agent_recommendation_enum",
	"recommended_amount" numeric,
	"risk_level" "risk_level_enum",
	"risk_factors" text[],
	"started_at" timestamp,
	"submitted_at" timestamp,
	"reviewed_at" timestamp,
	"reviewed_by" uuid,
	"closed_at" timestamp,
	"supervisor_notes" text,
	"requires_additional_investigation" boolean DEFAULT false,
	"additional_investigation_reason" text,
	"offline_created" boolean DEFAULT false,
	"offline_synced_at" timestamp,
	"device_id" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "evenements_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "type_evenement_enum" NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"payload" json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"published_at" timestamp,
	"tentative" integer DEFAULT 0 NOT NULL,
	"erreur" text
);
--> statement-breakpoint
CREATE TABLE "interest_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"code" text NOT NULL,
	"taux_annuel" numeric NOT NULL,
	"taux_mensuel" numeric,
	"type" "type_taux_interet_enum" DEFAULT 'credit' NOT NULL,
	"valid_from" timestamp DEFAULT now() NOT NULL,
	"valid_to" timestamp,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "mouvements_financiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date_operation" timestamp DEFAULT now() NOT NULL,
	"montant" numeric NOT NULL,
	"sens" "sens_mouvement_enum" NOT NULL,
	"statut" "statut_transaction_enum" DEFAULT 'POSTED' NOT NULL,
	"methode_paiement" "methode_paiement_enum",
	"reference" text NOT NULL,
	"reference_externe" text,
	"idempotency_key" text,
	"agence_id" uuid,
	"session_caisse_id" uuid,
	"client_id" uuid,
	"compte_id" uuid,
	"credit_id" uuid,
	"tontine_id" uuid,
	"agent_id" uuid,
	"type_paiement" "type_paiement_terrain_enum",
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"source_module" "source_module_enum" DEFAULT 'SYSTEME' NOT NULL,
	"source_table" text,
	"source_id" uuid,
	"metadata" json,
	"requires_gl_posting" boolean DEFAULT true NOT NULL,
	"gl_posting_status" text DEFAULT 'PENDING' NOT NULL,
	"gl_posting_error" text,
	"reversal_of_id" uuid,
	"reversal_reason" text
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
	"statut" "statut_objectif_epargne_enum" DEFAULT 'IN_PROGRESS' NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operations_caisse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"mouvement_id" uuid,
	"type_operation" "type_operation_caisse" NOT NULL,
	"statut" "statut_transaction_enum" DEFAULT 'POSTED' NOT NULL,
	"montant" numeric NOT NULL,
	"methode_paiement" "methode_paiement_enum" DEFAULT 'CASH' NOT NULL,
	"reference" text NOT NULL,
	"idempotency_key" text,
	"description" text,
	"client_id" uuid,
	"presence_verification" jsonb,
	"metadata" jsonb,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"annulled_at" timestamp,
	"reversed_at" timestamp,
	"reversal_of_id" uuid,
	"reversal_reason" text,
	"reversed_by_user_id" uuid,
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "plans_epargne" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"credit_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"compte_id" uuid NOT NULL,
	"montant_mensuel" numeric NOT NULL,
	"duree" integer NOT NULL,
	"montant_total" numeric NOT NULL,
	"date_debut" timestamp NOT NULL,
	"date_fin" timestamp NOT NULL,
	"statut" "statut_plan_epargne_enum" DEFAULT 'ACTIVE' NOT NULL,
	"observations" text,
	"type_paiement" "type_paiement_terrain_enum" DEFAULT 'DEPOSIT_SAVINGS',
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "produits_compte" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"nom" text NOT NULL,
	"type_compte" "type_compte_enum" NOT NULL,
	"taux_interet" numeric,
	"frais" json,
	"regles" json,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reevaluation_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reevaluation_id" uuid NOT NULL,
	"demande_id" uuid NOT NULL,
	"action" text NOT NULL,
	"statut_avant" text,
	"statut_apres" text,
	"details" json NOT NULL,
	"user_id" uuid NOT NULL,
	"role_utilisateur" text,
	"ip_address" text,
	"user_agent" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reevaluations_credit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"demande_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"numero_version" integer DEFAULT 1 NOT NULL,
	"numero_reevaluation" text NOT NULL,
	"motif_rejet_initial" text NOT NULL,
	"date_rejet_initial" timestamp NOT NULL,
	"score_rejet_initial" integer,
	"montant_initial_demande" numeric NOT NULL,
	"elements_nouveaux" json NOT NULL,
	"justification" text NOT NULL,
	"nouveau_montant_demande" numeric,
	"nouvelle_duree_valeur" integer,
	"nouvelle_duree_unite" "duree_unite_enum",
	"nouvelle_frequence" "frequence_remboursement_enum",
	"garanties_additionnelles" json,
	"co_emprunteur_id" uuid,
	"co_emprunteur_details" json,
	"documents_joints" text[],
	"statut" "statut_reevaluation_enum" DEFAULT 'REQUESTED' NOT NULL,
	"eligibilite_validee" boolean,
	"motif_refus_eligibilite" text,
	"date_validation_eligibilite" timestamp,
	"valide_par" uuid,
	"enquete_complementaire_id" uuid,
	"nouveau_score" integer,
	"delta_score" integer,
	"details_scoring" json,
	"decision_comite" text,
	"montant_approuve_comite" numeric,
	"duree_approuvee_comite" integer,
	"conditions_speciales" text,
	"commentaire_comite" text,
	"date_decision_comite" timestamp,
	"decide_par" uuid,
	"membres_comite" uuid[],
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"verrouille" boolean DEFAULT false NOT NULL,
	"date_verrouillage" timestamp,
	CONSTRAINT "reevaluations_credit_numero_reevaluation_unique" UNIQUE("numero_reevaluation")
);
--> statement-breakpoint
CREATE TABLE "remboursements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"credit_id" uuid NOT NULL,
	"mouvement_id" uuid,
	"facture_id" uuid,
	"montant" numeric NOT NULL,
	"date_remboursement" timestamp NOT NULL,
	"methode_paiement" "methode_paiement_enum",
	"statut" "statut_transaction_enum" DEFAULT 'POSTED' NOT NULL,
	"numero_transaction" text,
	"reference_externe" text,
	"idempotency_key" text,
	"recu" text,
	"observations" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"annulled_at" timestamp,
	"reversed_at" timestamp,
	"overpayment_amount" numeric DEFAULT '0',
	"allocation_strategy" text DEFAULT 'FIFO',
	"is_reversed" boolean DEFAULT false,
	"reversed_by" uuid,
	"reversal_reason" text,
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_caisse_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_source_id" uuid NOT NULL,
	"agence_dest_id" uuid NOT NULL,
	"montant" numeric NOT NULL,
	"date_prevue" date NOT NULL,
	"frequence" varchar(20) DEFAULT 'ONE_TIME',
	"jour_semaine" integer,
	"jour_mois" integer,
	"motif" text,
	"statut" varchar(20) DEFAULT 'SCHEDULED',
	"transfert_id" uuid,
	"derniere_execution" timestamp,
	"prochaine_execution" timestamp,
	"nombre_executions" integer DEFAULT 0,
	"max_executions" integer,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scheduled_transfer_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scheduled_transfer_id" uuid NOT NULL,
	"execution_key" text NOT NULL,
	"status" "statut_run_virement_enum" DEFAULT 'PENDING' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"mouvement_id" uuid,
	"error_message" text,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scoring_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"demande_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"reevaluation_id" uuid,
	"enquete_id" uuid,
	"enquete_complementaire_id" uuid,
	"type_score" text NOT NULL,
	"numero_version" integer DEFAULT 1 NOT NULL,
	"score_total" integer NOT NULL,
	"score_capacite_remboursement" integer,
	"score_stabilite_revenus" integer,
	"score_anciennete_activite" integer,
	"score_historique_credit" integer,
	"score_garanties" integer,
	"score_charges_endettement" integer,
	"donnees_calcul" json NOT NULL,
	"score_precedent" integer,
	"delta_score" integer,
	"facteurs_delta" json,
	"seuil_approbation" integer DEFAULT 60,
	"recommandation_auto" text,
	"calcule_par_systeme" boolean DEFAULT true NOT NULL,
	"calcule_par" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions_caisse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"caissier_id" uuid NOT NULL,
	"opened_at" timestamp DEFAULT now(),
	"closed_at" timestamp,
	"montant_ouverture" numeric DEFAULT '0' NOT NULL,
	"montant_fermeture_theorique" numeric DEFAULT '0' NOT NULL,
	"montant_fermeture_declare" numeric,
	"ecart" numeric,
	"statut" "statut_session_caisse_enum" DEFAULT 'REQUESTING_FUNDS' NOT NULL,
	"observations" text,
	"billetage_ouverture" json,
	"billetage_fermeture" json,
	"agence_id" uuid,
	"caisse_id" uuid NOT NULL,
	"connection_status" text DEFAULT 'DISCONNECTED',
	"last_activity" timestamp DEFAULT now(),
	"timeout_at" timestamp,
	"forced_close_reason" text,
	"closed_reason" text DEFAULT 'manual',
	"force_closed_by" uuid,
	"force_closed_at" timestamp,
	"funds_kept_in_caisse" boolean DEFAULT false,
	"transfer_to_coffre_id" uuid,
	"opening_transfert_id" uuid,
	"montant_demande" numeric,
	"solde_veille" numeric DEFAULT '0',
	"funds_requested_at" timestamp,
	"funds_dispatched_at" timestamp,
	"funds_received_at" timestamp,
	"billetage_reception" json,
	"request_expires_at" timestamp,
	"closing_initiated_at" timestamp,
	"count_submitted_at" timestamp,
	"closing_finalized_at" timestamp,
	"montant_physique" numeric,
	"ecart_justification" text,
	"montant_vers_coffre" numeric,
	"montant_reporte" numeric,
	"closing_transfert_id" uuid,
	"coffre_validation_status" text,
	"coffre_validated_by" uuid,
	"coffre_validated_at" timestamp,
	"closing_bordereau_url" text,
	"ecart_approval_id" uuid,
	"ecart_approval_status" text,
	"handover_count" integer DEFAULT 0,
	"last_handover_id" uuid,
	"original_caissier_id" uuid,
	"solde_actuel" numeric,
	"opening_gl_balance" numeric,
	"opening_billetage_total" numeric,
	"opening_ecart" numeric,
	"opening_strictness_applied" text,
	"has_opening_discrepancy" boolean DEFAULT false,
	"opening_discrepancy_justification" text,
	"opening_discrepancy_approved_by" uuid,
	"opening_discrepancy_approved_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "sessions_caisse_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"action" text NOT NULL,
	"statut_avant" text,
	"statut_apres" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"caisse_id" uuid,
	"user_id" uuid,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions_compte" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"compte_id" uuid NOT NULL,
	"mouvement_id" uuid,
	"facture_id" uuid,
	"type_paiement" "type_paiement_terrain_enum" NOT NULL,
	"statut" "statut_transaction_enum" DEFAULT 'POSTED' NOT NULL,
	"sens" "sens_mouvement_enum" DEFAULT 'DEBIT' NOT NULL,
	"montant" numeric NOT NULL,
	"solde_apres" numeric,
	"methode_paiement" "methode_paiement_enum" DEFAULT 'CASH' NOT NULL,
	"reference_externe" text,
	"idempotency_key" text,
	"observations" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"annulled_at" timestamp,
	"reversed_at" timestamp,
	"reversal_of_id" uuid,
	"reversal_reason" text,
	"reversed_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "versements_automatiques" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"compte_source_id" uuid NOT NULL,
	"compte_dest_id" uuid NOT NULL,
	"montant" numeric NOT NULL,
	"statut" "statut_versement_auto_enum" NOT NULL,
	"date_execution" timestamp,
	"date_planifiee" timestamp NOT NULL,
	"mouvement_id" uuid,
	"erreur" text,
	"tentatives" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "virements_programmes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"compte_source_id" uuid NOT NULL,
	"compte_dest_id" uuid NOT NULL,
	"agence_id" uuid,
	"montant" numeric NOT NULL,
	"frequence" "frequence_virement_enum" NOT NULL,
	"timezone" text DEFAULT 'Africa/Brazzaville' NOT NULL,
	"jour_execution" integer,
	"prochaine_execution" timestamp,
	"actif" boolean DEFAULT true NOT NULL,
	"dernier_execution" timestamp,
	"statut_dernier" "statut_audit_virement_enum",
	"erreur_derniere" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"processing_lock" text,
	"processing_started_at" timestamp,
	"libelle" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "virements_programmes_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"virement_id" uuid NOT NULL,
	"run_id" uuid,
	"statut" "statut_audit_virement_enum" NOT NULL,
	"message" text,
	"executed_at" timestamp DEFAULT now() NOT NULL,
	"execution_time_ms" integer,
	"metadata" jsonb,
	"mouvement_id" uuid
);
--> statement-breakpoint
CREATE TABLE "geonames_staging" (
	"geoname_id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"latitude" numeric,
	"longitude" numeric,
	"feature_class" char(1),
	"feature_code" text,
	"country_code" char(2),
	"admin1_code" text,
	"admin2_code" text,
	"population" integer DEFAULT 0,
	"timezone" text
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pays_id" uuid NOT NULL,
	"code" text NOT NULL,
	"geoname_id" integer,
	"nom" text NOT NULL,
	"nom_ascii" text,
	"latitude" numeric,
	"longitude" numeric,
	"population" integer,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "avances_salaire" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employe_id" uuid NOT NULL,
	"montant" integer NOT NULL,
	"motif" text NOT NULL,
	"date_demande" date DEFAULT now() NOT NULL,
	"date_remboursement" date,
	"mois_deduction" varchar(7),
	"statut" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"approuve_par" uuid,
	"approuve_at" timestamp,
	"paye_at" timestamp,
	"rejete_motif" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "avantages" (
	"id" serial PRIMARY KEY NOT NULL,
	"nom" varchar NOT NULL,
	"type" varchar NOT NULL,
	"montant_par_defaut" integer DEFAULT 0,
	"description" text,
	"eligible_contrats" json,
	"mode_calcul" varchar(20) DEFAULT 'FIXE',
	"pourcentage" numeric(5, 2),
	"plafond" integer,
	"frequence" varchar(20) DEFAULT 'MENSUEL',
	"date_debut" date,
	"date_fin" date,
	"imposable" boolean DEFAULT true,
	"soumis_cnss" boolean DEFAULT true,
	"auto_attribution" boolean DEFAULT false,
	"categorie" varchar(30) DEFAULT 'AUTRE',
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
	"statut" varchar DEFAULT 'ACTIVE'
);
--> statement-breakpoint
CREATE TABLE "bank_reconciliation_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"source" varchar(10) NOT NULL,
	"reference" text,
	"employe_nom" varchar(255),
	"montant" integer NOT NULL,
	"date_valeur" date,
	"batch_item_id" uuid,
	"match_status" varchar(20) DEFAULT 'UNMATCHED' NOT NULL,
	"matched_with_id" uuid,
	"ecart" integer DEFAULT 0,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "bank_reconciliation_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period" varchar(7) NOT NULL,
	"bank_name" varchar(100) NOT NULL,
	"statut" varchar(20) DEFAULT 'DRAFT' NOT NULL,
	"total_expected" numeric(14, 0) DEFAULT '0',
	"total_matched" numeric(14, 0) DEFAULT '0',
	"total_unmatched" numeric(14, 0) DEFAULT '0',
	"matched_count" integer DEFAULT 0,
	"unmatched_count" integer DEFAULT 0,
	"import_file_name" text,
	"completed_at" timestamp,
	"completed_by" uuid,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "bulletins_paie" (
	"id" serial PRIMARY KEY NOT NULL,
	"payroll_run_id" integer,
	"employe_id" uuid NOT NULL,
	"employe_nom" varchar NOT NULL,
	"mois" varchar NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"salaire_brut" numeric(12, 0) DEFAULT '0' NOT NULL,
	"total_charges_salariales" numeric(12, 0) DEFAULT '0' NOT NULL,
	"total_charges_patronales" numeric(12, 0) DEFAULT '0' NOT NULL,
	"irpp" numeric(12, 0) DEFAULT '0' NOT NULL,
	"total_retenues" numeric(12, 0) DEFAULT '0' NOT NULL,
	"salaire_net" numeric(12, 0) DEFAULT '0' NOT NULL,
	"salaire_base_snapshot" integer DEFAULT 0 NOT NULL,
	"situation_familiale_snapshot" varchar(20),
	"nombre_enfants_snapshot" integer DEFAULT 0,
	"coefficient_prorata_snapshot" numeric(5, 4) DEFAULT '1.0000',
	"pdf_url" varchar,
	"pdf_hash" varchar,
	"genere_par_id" uuid,
	"statut" varchar DEFAULT 'DRAFT',
	"date_paiement" date,
	"cancelled" boolean DEFAULT false,
	"cancelled_at" timestamp,
	"cancelled_reason" text,
	"previous_bulletin_id" integer,
	"engagement_mouvement_id" uuid,
	"paiement_mouvement_id" uuid,
	"engagement_ecriture_id" uuid,
	"paiement_ecriture_id" uuid,
	"viewed_at" timestamp,
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
	"statut" varchar DEFAULT 'PENDING' NOT NULL,
	"cv_url" varchar,
	"lettre_motivation_url" varchar,
	"notes" text,
	"date_entretien" date,
	"responsable_rh_id" uuid,
	"current_approval_level" integer DEFAULT 0,
	"approval_status" varchar(20) DEFAULT 'NOT_STARTED',
	"final_approved_at" timestamp,
	"final_approved_by" uuid,
	"job_offer_id" integer,
	"score_global" integer,
	"score_competences" integer,
	"score_qualification" integer,
	"score_experience" integer,
	"source" varchar(20) DEFAULT 'MANUAL',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charge_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(20) NOT NULL,
	"libelle" varchar(120) NOT NULL,
	"organisme" varchar(20) NOT NULL,
	"side" varchar(10) NOT NULL,
	"assiette_rule" varchar(30) NOT NULL,
	"rate" numeric(8, 4) NOT NULL,
	"plafond" integer,
	"plancher" integer,
	"effective_from" date DEFAULT now() NOT NULL,
	"effective_to" date,
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "charge_definitions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "conventions_collectives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(20) NOT NULL,
	"libelle" text NOT NULL,
	"pays" varchar(5) DEFAULT 'CG' NOT NULL,
	"secteur" varchar(50) NOT NULL,
	"duree_essai_cdi" integer,
	"duree_essai_cdd" integer,
	"conges_annuels" integer DEFAULT 26,
	"heures_hebdo" numeric(4, 1) DEFAULT '40.0',
	"defaults" jsonb,
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "conventions_collectives_code_unique" UNIQUE("code")
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
	"statut" varchar DEFAULT 'PENDING' NOT NULL,
	"approuve_par" uuid,
	"date_decision" timestamp,
	"commentaire" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_agency_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employe_id" uuid NOT NULL,
	"agence_id" uuid NOT NULL,
	"role_operationnel" varchar(80),
	"manager_id" uuid,
	"is_primary" boolean DEFAULT false,
	"date_debut" date NOT NULL,
	"date_fin" date,
	"statut" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"motif" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employe_id" uuid NOT NULL,
	"nom" text NOT NULL,
	"type_document" varchar(50) NOT NULL,
	"categorie" varchar(50) DEFAULT 'GENERAL',
	"description" text,
	"storage_key" text NOT NULL,
	"bucket" varchar(20) DEFAULT 'private' NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer,
	"mime_type" varchar(100),
	"date_emission" date,
	"date_expiration" date,
	"statut" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"verifie_par" uuid,
	"verifie_at" timestamp,
	"motif_rejet" text,
	"ajoute_par" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "evaluation_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" varchar(200) NOT NULL,
	"description" text,
	"type" varchar(30) DEFAULT 'ANNUAL' NOT NULL,
	"date_debut" date NOT NULL,
	"date_fin" date NOT NULL,
	"statut" varchar(30) DEFAULT 'DRAFT' NOT NULL,
	"target_type" varchar(30) DEFAULT 'ALL' NOT NULL,
	"target_filter" json,
	"template_id" uuid,
	"self_eval_deadline" date,
	"manager_eval_deadline" date,
	"agence_id" uuid,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "evaluation_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"libelle" varchar(250) NOT NULL,
	"description" text,
	"categorie" varchar(50) NOT NULL,
	"poids" integer DEFAULT 10 NOT NULL,
	"ordre" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "evaluation_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"criteria_id" uuid NOT NULL,
	"response_type" varchar(20) NOT NULL,
	"rating" integer NOT NULL,
	"commentaire" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "evaluation_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" varchar(200) NOT NULL,
	"description" text,
	"actif" boolean DEFAULT true,
	"is_default" boolean DEFAULT false,
	"agence_id" uuid,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"employe_id" uuid NOT NULL,
	"employe_nom" varchar(255) NOT NULL,
	"manager_id" uuid,
	"manager_nom" varchar(255),
	"self_eval_status" varchar(30) DEFAULT 'NOT_STARTED',
	"self_eval_submitted_at" timestamp,
	"manager_eval_status" varchar(30) DEFAULT 'NOT_STARTED',
	"manager_eval_submitted_at" timestamp,
	"statut" varchar(30) DEFAULT 'DRAFT' NOT NULL,
	"self_eval_score" numeric(5, 2),
	"manager_eval_score" numeric(5, 2),
	"final_score" numeric(5, 2),
	"recommandation" varchar(30),
	"self_commentaire" text,
	"manager_commentaire" text,
	"action_plan" text,
	"training_recommendations" json,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"finalized_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "feuilles_temps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employe_id" uuid NOT NULL,
	"employe_nom" varchar(255) NOT NULL,
	"semaine" varchar(10) NOT NULL,
	"date_debut" date NOT NULL,
	"date_fin" date NOT NULL,
	"total_heures" numeric(6, 2) DEFAULT '0',
	"statut" varchar(20) DEFAULT 'DRAFT' NOT NULL,
	"soumis_at" timestamp,
	"approuve_par" uuid,
	"approuve_at" timestamp,
	"rejete_motif" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "formation_certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"formation_id" integer NOT NULL,
	"employe_id" uuid NOT NULL,
	"employe_nom" varchar NOT NULL,
	"numero_certificat" varchar(50) NOT NULL,
	"titre" text NOT NULL,
	"date_emission" date DEFAULT now() NOT NULL,
	"date_expiration" date,
	"competences" text,
	"statut" varchar(20) DEFAULT 'ISSUED' NOT NULL,
	"revoque_par" uuid,
	"revoque_at" timestamp,
	"motif_revocation" text,
	"fichier_url" text,
	"emis_par" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "formation_certificates_numero_certificat_unique" UNIQUE("numero_certificat")
);
--> statement-breakpoint
CREATE TABLE "formation_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"formation_id" integer NOT NULL,
	"employe_id" uuid NOT NULL,
	"employe_nom" varchar NOT NULL,
	"date_inscription" timestamp DEFAULT now() NOT NULL,
	"date_debut" timestamp,
	"date_fin" timestamp,
	"progression" integer DEFAULT 0,
	"statut" varchar DEFAULT 'IN_PROGRESS',
	"certificat_url" text,
	"presence" varchar DEFAULT 'Non noté',
	"evaluation" text,
	"score_evaluation" integer,
	"competences_acquises" text,
	"recommandation" varchar(30),
	"evaluateur_id" uuid,
	"evaluated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "formations" (
	"id" serial PRIMARY KEY NOT NULL,
	"titre" varchar NOT NULL,
	"formateur" varchar NOT NULL,
	"date_debut" timestamp NOT NULL,
	"date_fin" timestamp,
	"duree" varchar NOT NULL,
	"duree_heures" integer DEFAULT 1,
	"type_formation" varchar DEFAULT 'Continue',
	"contenu_url" text,
	"obligatoire" boolean DEFAULT false,
	"agence_id" uuid,
	"lieu" varchar,
	"description" text,
	"programme" text,
	"statut" varchar DEFAULT 'PLANNED' NOT NULL,
	"capacite_max" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "hiring_approval_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid,
	"approval_levels" json DEFAULT '[]'::json NOT NULL,
	"min_salary_threshold" numeric,
	"actif" boolean DEFAULT true,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "hiring_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidature_id" integer NOT NULL,
	"level" integer NOT NULL,
	"approver_role" varchar(50) NOT NULL,
	"approver_id" uuid,
	"statut" varchar(20) DEFAULT 'PENDING',
	"commentaire" text,
	"decided_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "horaires_travail" (
	"id" serial PRIMARY KEY NOT NULL,
	"employe_id" uuid NOT NULL,
	"jour_semaine" integer NOT NULL,
	"heure_debut" varchar NOT NULL,
	"heure_fin" varchar NOT NULL,
	"pause_minutes" integer DEFAULT 60,
	"actif" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_alert_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_type" varchar(50) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"reminder_days" json DEFAULT '[30,15,7,1]'::json NOT NULL,
	"channels" json DEFAULT '["IN_APP"]'::json NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "hr_alert_config_alert_type_unique" UNIQUE("alert_type")
);
--> statement-breakpoint
CREATE TABLE "hr_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_type" varchar(50) NOT NULL,
	"employe_id" uuid NOT NULL,
	"employe_nom" varchar(255) NOT NULL,
	"event_date" date NOT NULL,
	"event_label" text NOT NULL,
	"metadata" json,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"acknowledged_by" uuid,
	"acknowledged_at" timestamp,
	"dismissed_by" uuid,
	"dismissed_at" timestamp,
	"dismiss_reason" text,
	"agence_id" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "hr_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" varchar(100) NOT NULL,
	"action" varchar(50) NOT NULL,
	"actor_user_id" uuid,
	"actor_name" varchar(255),
	"actor_role" varchar(100),
	"old_values" json,
	"new_values" json,
	"diff" json,
	"ip_address" varchar(45),
	"user_agent" text,
	"reason" text,
	"severity" varchar(20) DEFAULT 'info',
	"created_at" timestamp DEFAULT now(),
	"agence_id" uuid
);
--> statement-breakpoint
CREATE TABLE "hr_document_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employe_id" uuid NOT NULL,
	"employe_nom" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"motif" text,
	"details" text,
	"urgence" boolean DEFAULT false,
	"statut" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"traite_par" uuid,
	"traite_at" timestamp,
	"commentaire_rh" text,
	"motif_rejet" text,
	"document_url" text,
	"document_file_name" text,
	"viewed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "irpp_baremes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(20) NOT NULL,
	"pays" varchar(5) DEFAULT 'CG' NOT NULL,
	"libelle" text NOT NULL,
	"abattement_forfaitaire" numeric(5, 4) DEFAULT '0.2000' NOT NULL,
	"brackets" jsonb NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "job_offers" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_position_id" uuid NOT NULL,
	"titre" varchar(200) NOT NULL,
	"description" text,
	"competences_requises" json,
	"qualification_minimum" varchar(50),
	"experience_min_annees" integer DEFAULT 0,
	"formation_requise" text,
	"salaire_propose" varchar(100),
	"type_contrat" varchar(20),
	"lieu" varchar(200),
	"visibilite" varchar(20) DEFAULT 'BOTH' NOT NULL,
	"statut" varchar(20) DEFAULT 'DRAFT' NOT NULL,
	"date_publication" timestamp,
	"date_limite" date,
	"poids_competences" integer DEFAULT 40,
	"poids_qualification" integer DEFAULT 30,
	"poids_experience" integer DEFAULT 30,
	"postes_ouverts" integer DEFAULT 1,
	"created_by" uuid,
	"agence_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employe_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"leave_type" varchar(50) DEFAULT 'Congé Annuel' NOT NULL,
	"initial_allocation" integer DEFAULT 30 NOT NULL,
	"acquired" integer DEFAULT 0 NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	"pending" integer DEFAULT 0 NOT NULL,
	"carry_over" integer DEFAULT 0,
	"expiry_date" date,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "onboarding_checklists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid,
	"nom" text NOT NULL,
	"description" text,
	"items" json DEFAULT '[]'::json NOT NULL,
	"actif" boolean DEFAULT true,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "onboarding_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidature_id" integer,
	"employe_id" uuid,
	"checklist_id" uuid,
	"completed_items" json DEFAULT '[]'::json,
	"statut" varchar(20) DEFAULT 'NOT_STARTED',
	"started_at" timestamp,
	"completed_at" timestamp,
	"assigned_to" uuid,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "org_global_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employe_id" uuid NOT NULL,
	"role_type" varchar(30) NOT NULL,
	"titre" varchar(120),
	"date_debut" date NOT NULL,
	"date_fin" date,
	"statut" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "overtime_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employe_id" uuid NOT NULL,
	"date" date NOT NULL,
	"hours" numeric(5, 2) NOT NULL,
	"type" varchar(20) NOT NULL,
	"presence_id" integer,
	"approved_by" uuid,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_batch_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"employe_id" uuid NOT NULL,
	"employe_nom" varchar(255) NOT NULL,
	"bank_code" varchar(10),
	"branch_code" varchar(10),
	"account_number" varchar(30),
	"account_key" varchar(5),
	"montant_net" integer NOT NULL,
	"statut" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"paid_at" timestamp,
	"failure_reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid,
	"cnss_employee_rate" numeric(5, 4) DEFAULT '0.0500' NOT NULL,
	"cnss_employer_rate" numeric(5, 4) DEFAULT '0.0900' NOT NULL,
	"cnss_alloc_familiales_rate" numeric(5, 4) DEFAULT '0.0000',
	"cnss_pvid_rate" numeric(5, 4) DEFAULT '0.0350',
	"cnss_atmp_rate" numeric(5, 4) DEFAULT '0.0150',
	"cnss_alloc_familiales_employer_rate" numeric(5, 4) DEFAULT '0.0650',
	"cnss_pvid_employer_rate" numeric(5, 4) DEFAULT '0.0050',
	"cnss_atmp_employer_rate" numeric(5, 4) DEFAULT '0.0150',
	"ipr_brackets" json DEFAULT '[{"min":0,"max":524000,"rate":0},{"min":524001,"max":1428000,"rate":0.15},{"min":1428001,"max":2700000,"rate":0.3},{"min":2700001,"max":null,"rate":0.4}]'::json NOT NULL,
	"transport_allowance" integer DEFAULT 50000,
	"housing_allowance" integer DEFAULT 0,
	"overtime_rate" numeric(3, 2) DEFAULT '1.50',
	"night_shift_rate" numeric(3, 2) DEFAULT '1.25',
	"holiday_rate" numeric(3, 2) DEFAULT '2.00',
	"late_grace_minutes" integer DEFAULT 5,
	"allow_overtime" boolean DEFAULT true,
	"default_heure_debut" varchar(5) DEFAULT '08:00',
	"default_heure_fin" varchar(5) DEFAULT '17:00',
	"default_pause_minutes" integer DEFAULT 60,
	"mm_salary_fee_option" varchar(20) DEFAULT 'COMPANY_ABSORBS',
	"effective_from" date DEFAULT now() NOT NULL,
	"effective_to" date,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "payroll_config_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payroll_config_id" uuid NOT NULL,
	"agence_id" uuid,
	"changed_by" uuid,
	"change_type" varchar(20) NOT NULL,
	"old_values" jsonb,
	"new_values" jsonb NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_gl_mapping" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" varchar(20) NOT NULL,
	"source_code" varchar(20) NOT NULL,
	"side" varchar(10) NOT NULL,
	"account_number" varchar(20) NOT NULL,
	"journal_code" varchar(10) NOT NULL,
	"description" text,
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_payment_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payroll_run_id" integer NOT NULL,
	"transfer_file_id" uuid,
	"bank_name" varchar(100) NOT NULL,
	"statut" varchar(20) DEFAULT 'GENERATED' NOT NULL,
	"employee_count" integer NOT NULL,
	"total_amount" numeric(14, 0) NOT NULL,
	"sent_at" timestamp,
	"sent_by" uuid,
	"confirmed_at" timestamp,
	"confirmed_by" uuid,
	"reference_externe" varchar(100),
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_run_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payroll_run_id" integer NOT NULL,
	"employe_id" uuid,
	"field" varchar(50),
	"severity" varchar(10) DEFAULT 'WARNING' NOT NULL,
	"message" text NOT NULL,
	"resolved" boolean DEFAULT false,
	"resolved_at" timestamp,
	"resolved_by" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"period" varchar(7) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" varchar(20) DEFAULT 'DRAFT' NOT NULL,
	"agence_id" uuid,
	"rerun_of_run_id" integer,
	"rerun_reason" text,
	"generated_by" uuid,
	"validated_by" uuid,
	"validated_at" timestamp,
	"paid_by" uuid,
	"paid_at" timestamp,
	"closed_at" timestamp,
	"cancelled_at" timestamp,
	"cancelled_reason" text,
	"total_brut" numeric(14, 0) DEFAULT '0',
	"total_net" numeric(14, 0) DEFAULT '0',
	"total_charges_patronales" numeric(14, 0) DEFAULT '0',
	"total_charges_salariales" numeric(14, 0) DEFAULT '0',
	"employee_count" integer DEFAULT 0,
	"issue_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_transfer_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payroll_run_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"storage_key" text NOT NULL,
	"format" varchar(10) DEFAULT 'CSV' NOT NULL,
	"employee_count" integer NOT NULL,
	"total_amount" numeric(14, 0) NOT NULL,
	"generated_by" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payslip_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"bulletin_id" integer NOT NULL,
	"code" varchar(30) NOT NULL,
	"libelle" varchar(100) NOT NULL,
	"category" varchar(20) NOT NULL,
	"base" integer DEFAULT 0,
	"taux" numeric(10, 4),
	"montant_gain" integer DEFAULT 0,
	"montant_retenue" integer DEFAULT 0,
	"montant_patronal" integer DEFAULT 0,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presences" (
	"id" serial PRIMARY KEY NOT NULL,
	"employe_id" uuid NOT NULL,
	"date" date NOT NULL,
	"statut" varchar NOT NULL,
	"heure_arrivee" timestamp,
	"pause_debut" timestamp,
	"pause_fin" timestamp,
	"heure_depart" timestamp,
	"heures_travaillees" integer DEFAULT 0,
	"heures_supplementaires" integer DEFAULT 0,
	"retard_justifie" boolean DEFAULT false,
	"commentaire" text,
	"latitude" double precision,
	"longitude" double precision,
	"accuracy" double precision,
	"gps_source" varchar(20) DEFAULT 'manual',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projet_membres" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid NOT NULL,
	"employe_id" uuid NOT NULL,
	"role" varchar(20) DEFAULT 'MEMBER' NOT NULL,
	"date_ajout" date,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "projets_rh" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(30) NOT NULL,
	"nom" varchar(200) NOT NULL,
	"description" text,
	"client" varchar(200),
	"responsable_id" uuid,
	"agence_id" uuid,
	"budget_heures" integer,
	"budget_montant" integer,
	"date_debut" date NOT NULL,
	"date_fin" date,
	"statut" varchar(20) DEFAULT 'DRAFT' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "projets_rh_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "qualification_coefficients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"convention_collective_id" uuid NOT NULL,
	"categorie" varchar(30) NOT NULL,
	"echelon" integer NOT NULL,
	"coefficient" integer NOT NULL,
	"salaire_minimum" integer NOT NULL,
	"description" text,
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rubrique_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(10) NOT NULL,
	"libelle" varchar(120) NOT NULL,
	"type" varchar(20) NOT NULL,
	"calc_mode" varchar(20) DEFAULT 'FIXED' NOT NULL,
	"base_source" varchar(30),
	"default_rate" numeric(10, 4),
	"default_amount" integer,
	"rounding_rule" varchar(10) DEFAULT 'ROUND',
	"is_taxable" boolean DEFAULT true,
	"is_cnss_applicable" boolean DEFAULT true,
	"priority" integer DEFAULT 100 NOT NULL,
	"active" boolean DEFAULT true,
	"effective_from" date,
	"effective_to" date,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "rubrique_definitions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "salary_payment_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bulletin_id" integer NOT NULL,
	"payroll_run_id" integer NOT NULL,
	"employe_id" uuid NOT NULL,
	"agence_id" uuid,
	"payment_method" varchar(20) NOT NULL,
	"execution_mode" varchar(20) NOT NULL,
	"scheduled_at" timestamp,
	"amount" numeric(14, 0) NOT NULL,
	"currency" varchar(3) DEFAULT 'XAF' NOT NULL,
	"fee_option" varchar(20),
	"fee_amount" numeric(14, 0),
	"montant_net" numeric(14, 0),
	"status" varchar(20) DEFAULT 'CREATED' NOT NULL,
	"failure_reason" text,
	"failure_code" varchar(50),
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"next_retry_at" timestamp,
	"msisdn" text,
	"operator" varchar(10),
	"correspondent" varchar(30),
	"payment_intent_id" uuid,
	"caisse_request_id" uuid,
	"mouvement_id" uuid,
	"ecriture_id" uuid,
	"idempotency_key" text NOT NULL,
	"created_by" uuid,
	"processed_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"processed_at" timestamp,
	"completed_at" timestamp,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "salary_rate_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employe_id" uuid NOT NULL,
	"salaire_base" numeric NOT NULL,
	"taux_horaire" numeric,
	"taux_journalier" numeric,
	"mode_calcul" varchar(20) DEFAULT 'MONTHLY' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"motif_changement" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sanction_escalation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid,
	"nom" text NOT NULL,
	"description" text,
	"sanction_count_threshold" integer NOT NULL,
	"period_months" integer DEFAULT 12,
	"source_gravite" varchar(20) NOT NULL,
	"escalate_to_gravite" varchar(20) NOT NULL,
	"notification_required" boolean DEFAULT true,
	"auto_apply" boolean DEFAULT false,
	"actif" boolean DEFAULT true,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
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
	"statut_workflow" varchar(30) DEFAULT 'DRAFT',
	"acknowledged_at" timestamp,
	"appealed_at" timestamp,
	"appeal_reason" text,
	"finalized_at" timestamp,
	"finalized_by" uuid,
	"escalated_from_id" integer,
	"auto_escalated" boolean DEFAULT false,
	"escalation_rule_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"description" text,
	"agence_id" uuid,
	"horaires" json NOT NULL,
	"created_by" uuid,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "temps_imputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feuille_temps_id" uuid NOT NULL,
	"projet_id" uuid NOT NULL,
	"date" date NOT NULL,
	"heures" numeric(4, 2) NOT NULL,
	"description" text,
	"presence_id" integer,
	"taux_horaire_snapshot" integer,
	"cout_calcule" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"resource_type" text NOT NULL,
	"status_code" integer,
	"response_body" jsonb,
	"status" text DEFAULT 'processing' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "idempotency_keys_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "pays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"iso2" char(2) NOT NULL,
	"iso3" char(3) NOT NULL,
	"numeric_code" char(3),
	"nom_en" text NOT NULL,
	"nom_fr" text,
	"indicatif_tel" text,
	"devise_code" text,
	"region" text,
	"sub_region" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_high_risk_aml" boolean DEFAULT false NOT NULL,
	"is_sanctioned" boolean DEFAULT false NOT NULL,
	"latitude" numeric,
	"longitude" numeric,
	"population" integer,
	"geoname_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "pays_iso2_unique" UNIQUE("iso2"),
	CONSTRAINT "pays_iso3_unique" UNIQUE("iso3")
);
--> statement-breakpoint
CREATE TABLE "access_code_rotation_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid,
	"rotation_frequency_days" integer DEFAULT 30,
	"max_usage_before_rotation" integer,
	"notify_days_before_expiry" integer DEFAULT 7,
	"auto_generate_on_expiry" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "access_code_usage_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_id" uuid NOT NULL,
	"used_by" uuid,
	"used_at" timestamp DEFAULT now(),
	"action" varchar(50) NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"success" boolean DEFAULT true,
	"failure_reason" text
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
	"statut" text DEFAULT 'SUCCESS' NOT NULL,
	"risk_level" text DEFAULT 'LOW',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "credit_penalty_structures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"days_late_min" integer NOT NULL,
	"days_late_max" integer,
	"penalty_type" varchar(20) NOT NULL,
	"amount" numeric NOT NULL,
	"max_penalty" numeric,
	"grace_period_days" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "credit_plan_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" json NOT NULL,
	"changed_by" uuid,
	"changed_at" timestamp DEFAULT now(),
	"change_reason" text,
	"is_current" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "currency_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"symbol" text NOT NULL,
	"symbol_position" text DEFAULT 'after' NOT NULL,
	"locale" text DEFAULT 'fr-FR' NOT NULL,
	"decimals" integer DEFAULT 0 NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"ordre" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "currency_presets_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "expo_push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"device_info" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
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
CREATE TABLE "holiday_calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"description" text,
	"agence_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "holiday_dates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calendar_id" uuid NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "holiday_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid,
	"date" timestamp NOT NULL,
	"name" text NOT NULL,
	"is_recurring" boolean DEFAULT false,
	"affects_all_caisses" boolean DEFAULT true,
	"caisse_ids" json,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_type" varchar(50) NOT NULL,
	"file_name" text,
	"total_records" integer DEFAULT 0,
	"created_records" integer DEFAULT 0,
	"updated_records" integer DEFAULT 0,
	"skipped_records" integer DEFAULT 0,
	"failed_records" integer DEFAULT 0,
	"record_ids" json,
	"status" varchar(20) DEFAULT 'COMPLETED',
	"imported_by" uuid,
	"imported_at" timestamp DEFAULT now(),
	"rolled_back_at" timestamp,
	"rolled_back_by" uuid,
	"error_details" json
);
--> statement-breakpoint
CREATE TABLE "maintenance_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_name" text NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"locked_by" uuid,
	"locked_at" timestamp,
	"reason" text,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "maintenance_modules_module_name_unique" UNIQUE("module_name")
);
--> statement-breakpoint
CREATE TABLE "maintenance_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"scheduled_start" timestamp NOT NULL,
	"scheduled_end" timestamp NOT NULL,
	"affected_modules" json,
	"notify_at" json,
	"status" varchar(20) DEFAULT 'SCHEDULED',
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"started_at" timestamp,
	"completed_at" timestamp
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
	"priorite" text DEFAULT 'NORMAL' NOT NULL,
	"lue" boolean DEFAULT false NOT NULL,
	"reference_id" uuid,
	"reference_type" text,
	"created_at" timestamp DEFAULT now(),
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "onboarding_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"current_step" integer DEFAULT 1,
	"completed_steps" json DEFAULT '[]'::json,
	"step_data" json,
	"status" varchar(20) DEFAULT 'IN_PROGRESS',
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "permission_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" varchar(20) NOT NULL,
	"entity_id" text NOT NULL,
	"permission_id" uuid,
	"permission_code" text,
	"action" varchar(20) NOT NULL,
	"before_state" json,
	"after_state" json,
	"changed_by" uuid,
	"changed_at" timestamp DEFAULT now(),
	"ip_address" text,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "push_notification_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid,
	"title" text,
	"body" text,
	"statut" text,
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
CREATE TABLE "regularization_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"trigger_condition" varchar(30) NOT NULL,
	"condition_value" json,
	"action" varchar(30) NOT NULL,
	"action_config" json,
	"priority" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "role_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"permissions" json NOT NULL,
	"is_system" boolean DEFAULT false,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "role_templates_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "security_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"password_min_length" integer DEFAULT 12,
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
CREATE TABLE "session_blocking_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_type" varchar(20) NOT NULL,
	"pattern" varchar(255) NOT NULL,
	"description" text,
	"reason" text,
	"expires_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"is_active" boolean DEFAULT true,
	"hit_count" integer DEFAULT 0,
	"last_hit_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "settings_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"settings_type" varchar(50) NOT NULL,
	"version" integer NOT NULL,
	"snapshot" json NOT NULL,
	"changed_by" uuid,
	"changed_at" timestamp DEFAULT now(),
	"change_reason" text,
	"ip_address" text,
	"user_agent" text,
	"is_current" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "sms_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid,
	"phone_number" text NOT NULL,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"statut" text DEFAULT 'PENDING' NOT NULL,
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
CREATE TABLE "system_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(30) NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"target_audience" varchar(30) DEFAULT 'ALL',
	"target_user_ids" json,
	"expires_at" timestamp,
	"is_read" boolean DEFAULT false,
	"read_by" json DEFAULT '[]'::json,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_name" text DEFAULT 'MicroFlex',
	"agence_code" text,
	"devise" text DEFAULT 'XAF',
	"pays" text DEFAULT 'République du Congo',
	"adresse" text,
	"telephone" text,
	"email" text,
	"niu" text,
	"cnss_membership" text,
	"rccm" text,
	"logo_url" text,
	"session_timeout" integer DEFAULT 30,
	"max_login_attempts" integer DEFAULT 5,
	"password_min_length" integer DEFAULT 12,
	"backup_frequency" text DEFAULT 'DAILY',
	"auto_backup_enabled" boolean DEFAULT true,
	"notification_email_enabled" boolean DEFAULT true,
	"notification_sms_enabled" boolean DEFAULT true,
	"sms_payment_validation_enabled" boolean DEFAULT true,
	"mobile_money_enabled" boolean DEFAULT true,
	"cash_enabled" boolean DEFAULT true,
	"check_enabled" boolean DEFAULT true,
	"transfer_enabled" boolean DEFAULT true,
	"maintenance_mode" boolean DEFAULT false,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "system_settings_agence_code_unique" UNIQUE("agence_code")
);
--> statement-breakpoint
CREATE TABLE "transfer_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"source_account_pattern" text,
	"destination_account_pattern" text,
	"frequency" varchar(20),
	"default_amount" numeric,
	"is_active" boolean DEFAULT true,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ui_customization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"theme" text DEFAULT 'DARK',
	"primary_color" text DEFAULT '#3b82f6',
	"accent_color" text DEFAULT '#10b981',
	"langue" text DEFAULT 'fr',
	"sidebar_collapsed_default" boolean DEFAULT false,
	"show_animations" boolean DEFAULT true,
	"compact_mode" boolean DEFAULT false,
	"font_family" text DEFAULT 'Inter',
	"border_radius" text DEFAULT 'lg',
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "contributions_tontine" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tontine_id" uuid NOT NULL,
	"client_id" uuid,
	"membre_id" uuid,
	"agence_id" uuid,
	"mouvement_id" uuid,
	"type_operation" text NOT NULL,
	"montant" numeric NOT NULL,
	"tour_numero" integer DEFAULT 1,
	"methode_paiement" "methode_paiement_enum" DEFAULT 'CASH' NOT NULL,
	"statut_transaction" "statut_transaction_enum" DEFAULT 'POSTED' NOT NULL,
	"reference" text NOT NULL,
	"reference_externe" text,
	"idempotency_key" text,
	"payment_intent_id" uuid,
	"provider" text,
	"phone" text,
	"statut_contribution" text DEFAULT 'FULL',
	"observations" text,
	"created_by" uuid,
	"received_by" uuid,
	"received_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "membres_tontine" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tontine_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"date_adhesion" timestamp DEFAULT now(),
	"statut" text DEFAULT 'ACTIVE' NOT NULL,
	"total_cotisations" numeric DEFAULT '0',
	"total_recus" numeric DEFAULT '0',
	"position" integer,
	"a_recu_benefice" boolean DEFAULT false,
	"date_benefice" timestamp,
	"cotisation_automatique" boolean DEFAULT false NOT NULL,
	"cotisation_compte_id" uuid,
	"late_count" integer DEFAULT 0 NOT NULL,
	"absence_count" integer DEFAULT 0 NOT NULL,
	"preferred_payout_method" text DEFAULT 'CASH',
	"group_role" text,
	"join_fee_paid" boolean DEFAULT false NOT NULL,
	"exit_requested_at" timestamp,
	"exit_approved_at" timestamp,
	"replaced_by_id" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tontine_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid NOT NULL,
	"tontine_id" uuid NOT NULL,
	"cycle_number" integer DEFAULT 1 NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"pot_collected" numeric(15, 2) DEFAULT '0' NOT NULL,
	"pot_distributed" numeric(15, 2) DEFAULT '0' NOT NULL,
	"members_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"closed_at" timestamp,
	"closed_by" uuid
);
--> statement-breakpoint
CREATE TABLE "tontine_distribution_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid NOT NULL,
	"tontine_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"turn_id" uuid NOT NULL,
	"beneficiary_member_id" uuid NOT NULL,
	"amount_requested" numeric(15, 2) NOT NULL,
	"amount_approved" numeric(15, 2),
	"amount_paid" numeric(15, 2) DEFAULT '0' NOT NULL,
	"penalties_deducted" numeric(15, 2) DEFAULT '0' NOT NULL,
	"fees_deducted" numeric(15, 2) DEFAULT '0' NOT NULL,
	"net_amount" numeric(15, 2),
	"payout_method" text NOT NULL,
	"provider" text,
	"target_msisdn" text,
	"target_wallet_account_id" uuid,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"payment_intent_id" uuid,
	"mouvement_id" uuid,
	"reference_externe" text,
	"idempotency_key" text,
	"created_by" uuid NOT NULL,
	"submitted_at" timestamp,
	"submitted_by" uuid,
	"approved_at" timestamp,
	"approved_by" uuid,
	"paid_at" timestamp,
	"notes" text,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tontine_penalites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tontine_id" uuid NOT NULL,
	"membre_id" uuid NOT NULL,
	"cycle_id" uuid,
	"schedule_id" uuid,
	"penalty_type" text DEFAULT 'LATE',
	"montant" numeric NOT NULL,
	"date_faute" timestamp DEFAULT now(),
	"statut" text DEFAULT 'PENDING',
	"date_paiement" timestamp,
	"motif" text,
	"auto_applied" boolean DEFAULT false,
	"waived_at" timestamp,
	"waived_by" uuid,
	"waive_reason" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tontine_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"description" text,
	"montant_cotisation" numeric NOT NULL,
	"nombre_membres" integer NOT NULL,
	"frequence" text NOT NULL,
	"taux_plateforme" numeric DEFAULT '0' NOT NULL,
	"intervalle_cotisation" integer DEFAULT 1,
	"agence_id" uuid,
	"actif" boolean DEFAULT true,
	"first_contribution_rule" text DEFAULT 'ON_START_DATE' NOT NULL,
	"grace_period_contribution" integer DEFAULT 0 NOT NULL,
	"collection_calendar_mode" text DEFAULT 'ALL_DAYS' NOT NULL,
	"weekdays_mask" integer DEFAULT 127 NOT NULL,
	"shift_non_working_day" text DEFAULT 'NEXT' NOT NULL,
	"holiday_calendar_id" uuid,
	"timezone" text DEFAULT 'Africa/Brazzaville' NOT NULL,
	"preferred_weekday" integer,
	"distribution_type" text DEFAULT 'ROTATIVE_SUSU' NOT NULL,
	"payout_frequency" text DEFAULT 'SAME_AS_CONTRIBUTION' NOT NULL,
	"payout_day_rule" text,
	"payout_order_mode" text DEFAULT 'FIXED_BY_ADMIN' NOT NULL,
	"allow_swap_payout_order" boolean DEFAULT false NOT NULL,
	"swap_requires_approval" boolean DEFAULT true NOT NULL,
	"payout_requires_contrib_paid" boolean DEFAULT true NOT NULL,
	"allow_partial_distribution" boolean DEFAULT true NOT NULL,
	"distribution_min_threshold_pct" numeric(5, 2) DEFAULT '50' NOT NULL,
	"penalty_enabled" boolean DEFAULT false NOT NULL,
	"penalty_type" text DEFAULT 'FIXED' NOT NULL,
	"penalty_value" numeric(15, 2) DEFAULT '0' NOT NULL,
	"penalty_application" text DEFAULT 'PER_PERIOD' NOT NULL,
	"penalty_cap" numeric(15, 2),
	"late_grace_period_days" integer DEFAULT 0 NOT NULL,
	"max_missed_contributions" integer DEFAULT 0 NOT NULL,
	"arrears_policy" text DEFAULT 'MUST_PAY_BEFORE_PAYOUT' NOT NULL,
	"suspension_policy" text DEFAULT 'SUSPEND_MEMBER' NOT NULL,
	"default_policy" text DEFAULT 'EXCLUDE_MEMBER' NOT NULL,
	"max_late_before_suspend" integer DEFAULT 3 NOT NULL,
	"max_late_before_exclude" integer DEFAULT 5 NOT NULL,
	"penalty_deducted_from_payout" boolean DEFAULT true NOT NULL,
	"penalty_as_revenue" boolean DEFAULT false NOT NULL,
	"auto_penalty_priority" boolean DEFAULT true NOT NULL,
	"join_fee_enabled" boolean DEFAULT false NOT NULL,
	"join_fee_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"exit_allowed" boolean DEFAULT true NOT NULL,
	"exit_fee_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"exit_notice_periods" integer DEFAULT 0 NOT NULL,
	"replacement_allowed" boolean DEFAULT true NOT NULL,
	"transfer_membership_allowed" boolean DEFAULT false NOT NULL,
	"allow_mid_cycle_join" boolean DEFAULT false NOT NULL,
	"allowed_payment_methods" jsonb DEFAULT '["CASH"]'::jsonb NOT NULL,
	"default_payment_method" text DEFAULT 'CASH' NOT NULL,
	"cash_must_go_to_caisse" boolean DEFAULT true NOT NULL,
	"fee_collection_mode" text DEFAULT 'ON_EACH_PAYOUT' NOT NULL,
	"max_advance_tours" integer DEFAULT 3 NOT NULL,
	"roles_enabled" boolean DEFAULT true NOT NULL,
	"group_roles" jsonb DEFAULT '["PRESIDENT","TRESORIER","SECRETAIRE"]'::jsonb NOT NULL,
	"approvals_required_for" jsonb DEFAULT '["DISTRIBUTION","REORDER"]'::jsonb NOT NULL,
	"min_kyc_level" text DEFAULT 'NONE' NOT NULL,
	"min_segment_required" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tontine_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid NOT NULL,
	"tontine_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"period_number" integer NOT NULL,
	"due_date" date NOT NULL,
	"amount_expected_per_member" numeric(15, 2) NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"total_collected" numeric(15, 2) DEFAULT '0' NOT NULL,
	"members_paid_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"closed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tontine_turn_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid NOT NULL,
	"tontine_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"action_type" text NOT NULL,
	"old_order" jsonb,
	"new_order" jsonb,
	"affected_turn_ids" text[],
	"affected_member_ids" text[],
	"reason" text NOT NULL,
	"changed_by" uuid NOT NULL,
	"changed_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "tontine_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid NOT NULL,
	"tontine_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"turn_number" integer NOT NULL,
	"beneficiary_member_id" uuid,
	"due_date" date NOT NULL,
	"status" text DEFAULT 'SCHEDULED' NOT NULL,
	"amount_expected" numeric(15, 2) DEFAULT '0' NOT NULL,
	"amount_paid_out" numeric(15, 2) DEFAULT '0' NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"locked_at" timestamp,
	"locked_reason" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tontines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"description" text,
	"montant_cotisation" numeric NOT NULL,
	"taux_plateforme" numeric DEFAULT '0' NOT NULL,
	"frequence" text NOT NULL,
	"intervalle_cotisation" integer DEFAULT 1,
	"date_debut" timestamp NOT NULL,
	"date_fin" timestamp,
	"nombre_membres" integer NOT NULL,
	"membres_actuels" integer DEFAULT 0,
	"statut" text DEFAULT 'DRAFT' NOT NULL,
	"solde" numeric DEFAULT '0',
	"prochain_tour" timestamp,
	"ordre_distribution" json,
	"gestionnaire_id" uuid,
	"agence_id" uuid,
	"created_by" uuid,
	"current_cycle_id" uuid,
	"plan_id" uuid,
	"first_contribution_rule" text DEFAULT 'ON_START_DATE' NOT NULL,
	"grace_period_contribution" integer DEFAULT 0 NOT NULL,
	"collection_calendar_mode" text DEFAULT 'ALL_DAYS' NOT NULL,
	"weekdays_mask" integer DEFAULT 127 NOT NULL,
	"shift_non_working_day" text DEFAULT 'NEXT' NOT NULL,
	"holiday_calendar_id" uuid,
	"timezone" text DEFAULT 'Africa/Brazzaville' NOT NULL,
	"preferred_weekday" integer,
	"distribution_type" text DEFAULT 'ROTATIVE_SUSU' NOT NULL,
	"payout_frequency" text DEFAULT 'SAME_AS_CONTRIBUTION' NOT NULL,
	"payout_day_rule" text,
	"payout_order_mode" text DEFAULT 'FIXED_BY_ADMIN' NOT NULL,
	"allow_swap_payout_order" boolean DEFAULT false NOT NULL,
	"swap_requires_approval" boolean DEFAULT true NOT NULL,
	"payout_requires_contrib_paid" boolean DEFAULT true NOT NULL,
	"allow_partial_distribution" boolean DEFAULT true NOT NULL,
	"distribution_min_threshold_pct" numeric(5, 2) DEFAULT '50' NOT NULL,
	"penalty_enabled" boolean DEFAULT false NOT NULL,
	"penalty_type" text DEFAULT 'FIXED' NOT NULL,
	"penalty_value" numeric(15, 2) DEFAULT '0' NOT NULL,
	"penalty_application" text DEFAULT 'PER_PERIOD' NOT NULL,
	"penalty_cap" numeric(15, 2),
	"late_grace_period_days" integer DEFAULT 0 NOT NULL,
	"max_missed_contributions" integer DEFAULT 0 NOT NULL,
	"arrears_policy" text DEFAULT 'MUST_PAY_BEFORE_PAYOUT' NOT NULL,
	"suspension_policy" text DEFAULT 'SUSPEND_MEMBER' NOT NULL,
	"default_policy" text DEFAULT 'EXCLUDE_MEMBER' NOT NULL,
	"max_late_before_suspend" integer DEFAULT 3 NOT NULL,
	"max_late_before_exclude" integer DEFAULT 5 NOT NULL,
	"penalty_deducted_from_payout" boolean DEFAULT true NOT NULL,
	"penalty_as_revenue" boolean DEFAULT false NOT NULL,
	"auto_penalty_priority" boolean DEFAULT true NOT NULL,
	"join_fee_enabled" boolean DEFAULT false NOT NULL,
	"join_fee_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"exit_allowed" boolean DEFAULT true NOT NULL,
	"exit_fee_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"exit_notice_periods" integer DEFAULT 0 NOT NULL,
	"replacement_allowed" boolean DEFAULT true NOT NULL,
	"transfer_membership_allowed" boolean DEFAULT false NOT NULL,
	"allow_mid_cycle_join" boolean DEFAULT false NOT NULL,
	"allowed_payment_methods" jsonb DEFAULT '["CASH"]'::jsonb NOT NULL,
	"default_payment_method" text DEFAULT 'CASH' NOT NULL,
	"cash_must_go_to_caisse" boolean DEFAULT true NOT NULL,
	"fee_collection_mode" text DEFAULT 'ON_EACH_PAYOUT' NOT NULL,
	"max_advance_tours" integer DEFAULT 3 NOT NULL,
	"roles_enabled" boolean DEFAULT true NOT NULL,
	"group_roles" jsonb DEFAULT '["PRESIDENT","TRESORIER","SECRETAIRE"]'::jsonb NOT NULL,
	"approvals_required_for" jsonb DEFAULT '["DISTRIBUTION","REORDER"]'::jsonb NOT NULL,
	"min_kyc_level" text DEFAULT 'NONE' NOT NULL,
	"min_segment_required" text,
	"end_rule" text DEFAULT 'WHEN_ALL_RECEIVED' NOT NULL,
	"round_count" integer,
	"current_round" integer DEFAULT 0 NOT NULL,
	"min_members_to_start" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL
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
	"session_id" text,
	"day_key" text,
	"client_point_id" text,
	"activity_type" text,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_mm_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_intent_id" uuid,
	"agent_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"agence_id" uuid,
	"type_paiement" text NOT NULL,
	"montant" numeric NOT NULL,
	"provider" text NOT NULL,
	"phone" text NOT NULL,
	"reference" text NOT NULL,
	"external_reference" text,
	"idempotency_key" text,
	"credit_id" uuid,
	"compte_id" uuid,
	"tontine_id" uuid,
	"statut" text DEFAULT 'PENDING' NOT NULL,
	"settled_at" timestamp,
	"mouvement_client_id" uuid,
	"error_code" text,
	"error_message" text,
	"latitude" numeric,
	"longitude" numeric,
	"observations" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents_terrain" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employe_id" uuid,
	"current_agence_id" uuid,
	"current_gl_account_id" uuid,
	"zone_affectation" text,
	"zone_latitude" numeric,
	"zone_longitude" numeric,
	"zone_rayon" numeric,
	"zone_polygon" text,
	"last_latitude" numeric,
	"last_longitude" numeric,
	"last_seen_at" timestamp,
	"statut" text DEFAULT 'ACTIVE' NOT NULL,
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
CREATE TABLE "arrondissements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"ville_id" uuid NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "caisse_assignations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"caisse_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"assigned_by" uuid,
	"assigned_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "caisse_code_usages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_id" uuid,
	"used_at" timestamp DEFAULT now(),
	"success" boolean DEFAULT false,
	"user_id" uuid,
	"authorization_id" uuid,
	"ip_address" text,
	"user_agent" text,
	"failure_reason" text
);
--> statement-breakpoint
CREATE TABLE "caisse_security_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid,
	"code_hash" text NOT NULL,
	"active" boolean DEFAULT true,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"caisse_id" uuid,
	"agence_id" uuid,
	"code_type" text DEFAULT 'EMERGENCY',
	"max_usages" integer,
	"usage_count" integer DEFAULT 0,
	"authorization_duration_hours" integer DEFAULT 4,
	"created_by" uuid,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "caisse_user_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"caisse_id" uuid,
	"agence_id" uuid,
	"code_id" uuid,
	"reason" text,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"revoked_by" uuid,
	"revoke_reason" text,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "comptage_billets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
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
	"compteur_id" uuid,
	"verificateur_id" uuid,
	"verification_billetage" jsonb,
	"verification_total" numeric,
	"ecart_verification" numeric,
	"dual_count_required" boolean DEFAULT false,
	"dual_count_completed" boolean DEFAULT false,
	"verification_submitted_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "departements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"pays_id" uuid,
	"region_id" uuid,
	"code" text,
	"geoname_id" integer,
	"nom_ascii" text,
	"latitude" numeric,
	"longitude" numeric,
	"population" integer
);
--> statement-breakpoint
CREATE TABLE "dual_count_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid,
	"threshold_montant" numeric DEFAULT '1000000',
	"always_required_for_closing" boolean DEFAULT true,
	"require_different_user" boolean DEFAULT true,
	"max_ecart_tolerance" numeric DEFAULT '100',
	"actif" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "factures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" text NOT NULL,
	"modele_id" uuid,
	"client_id" uuid,
	"agent_id" uuid,
	"session_id" uuid,
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
CREATE TABLE "marches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"arrondissement_id" uuid NOT NULL,
	"nom" text NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
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
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "paiements_terrain" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"agence_id" uuid,
	"client_id" uuid NOT NULL,
	"type_paiement" "type_paiement_terrain_enum" NOT NULL,
	"montant" numeric NOT NULL,
	"methode_paiement" "methode_paiement_enum" NOT NULL,
	"numero_telephone" text,
	"reference" text NOT NULL,
	"reference_externe" text,
	"idempotency_key" text,
	"mouvement_id" uuid,
	"credit_id" uuid,
	"compte_id" uuid,
	"tontine_id" uuid,
	"statut" "statut_transaction_enum" DEFAULT 'PENDING' NOT NULL,
	"validation_otp" text,
	"date_validation" timestamp,
	"remise_id" uuid,
	"session_caisse_remise_id" uuid,
	"date_remise" timestamp,
	"settled_remise_id" uuid,
	"settled_at" timestamp,
	"posted_mouvement_client_id" uuid,
	"observations" text,
	"latitude" numeric,
	"longitude" numeric,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pos_device_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"message" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pos_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"serial" text NOT NULL,
	"model" text,
	"agence_id" uuid NOT NULL,
	"assigned_to" uuid,
	"last_sync_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	CONSTRAINT "pos_devices_serial_unique" UNIQUE("serial")
);
--> statement-breakpoint
CREATE TABLE "prospection_prime_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text DEFAULT 'Prime de Prospection' NOT NULL,
	"agence_id" uuid,
	"type_prime" text DEFAULT 'FIXED' NOT NULL,
	"montant_fixe" numeric DEFAULT '5000',
	"taux_variable" numeric,
	"require_first_credit" boolean DEFAULT false,
	"require_min_revenu" numeric,
	"actif" boolean DEFAULT true NOT NULL,
	"effective_from" timestamp DEFAULT now(),
	"effective_to" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "prospection_primes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"agence_id" uuid,
	"prospection_id" uuid NOT NULL,
	"client_id" uuid,
	"montant" numeric NOT NULL,
	"type_prime" text DEFAULT 'FIXED' NOT NULL,
	"periode" varchar(7) NOT NULL,
	"statut" text DEFAULT 'PENDING' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp,
	"rejected_by" uuid,
	"rejected_at" timestamp,
	"rejection_reason" text,
	"paid_at" timestamp,
	"mouvement_id" uuid,
	"avantage_employe_id" integer,
	"observations" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "prospections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"nom_prospect" text NOT NULL,
	"prenom_prospect" text,
	"telephone_prospect" text NOT NULL,
	"adresse_prospect" text,
	"type_activite" text,
	"description_activite" text,
	"revenu_estime" numeric,
	"chiffre_affaires_mensuel" numeric,
	"type_revenu" text DEFAULT 'Mensuel',
	"revenu_journalier" numeric,
	"photo_url" text,
	"statut" text DEFAULT 'REGISTERED' NOT NULL,
	"priorite" text DEFAULT 'NORMAL',
	"commentaires_agent" text,
	"observations" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	"sexe" text,
	"activite_principale" text,
	"anciennete_activite" text,
	"arrondissement_id" uuid,
	"marche_id" uuid,
	"last_action_at" timestamp DEFAULT now(),
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remise_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"remise_id" uuid NOT NULL,
	"action" text NOT NULL,
	"statut_avant" text,
	"statut_apres" text NOT NULL,
	"details" json,
	"user_id" uuid NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remise_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"remise_id" uuid NOT NULL,
	"paiement_terrain_id" uuid NOT NULL,
	"operation_terrain_id" uuid,
	"montant" numeric NOT NULL,
	"type_paiement" text NOT NULL,
	"client_id" uuid,
	"settled_at" timestamp,
	"mouvement_client_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remises_terrain" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"session_caisse_id" uuid,
	"agence_id" uuid,
	"caisse_destination_id" uuid,
	"reference" text NOT NULL,
	"idempotency_key" text,
	"montant_declare" numeric NOT NULL,
	"montant_calcule" numeric DEFAULT '0' NOT NULL,
	"ecart" numeric DEFAULT '0',
	"motif_ecart" text,
	"statut" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"validated_at" timestamp,
	"validated_by" uuid,
	"settled_at" timestamp,
	"rejected_at" timestamp,
	"rejected_by" uuid,
	"rejection_reason" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"mouvement_caisse_id" uuid,
	"mouvement_coffre_id" uuid,
	"billetage" json,
	"observations" text
);
--> statement-breakpoint
CREATE TABLE "tracking_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"agent_id" uuid NOT NULL,
	"agency_id" uuid,
	"day_key" text NOT NULL,
	"started_at" timestamp NOT NULL,
	"ended_at" timestamp,
	"point_count" integer DEFAULT 0 NOT NULL,
	"total_distance_m" numeric DEFAULT '0',
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "tracking_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "villes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"region_id" uuid,
	"pays_id" uuid,
	"geoname_id" integer,
	"nom_ascii" text,
	"population" integer,
	"feature_code" text,
	"timezone" text,
	"latitude" numeric,
	"longitude" numeric,
	"is_chef_lieu" boolean DEFAULT false NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
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
	"statut" text DEFAULT 'PLANNED' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"ville" text NOT NULL,
	"ville_id" uuid,
	"description" text,
	"statut" text DEFAULT 'ACTIVE' NOT NULL,
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
	"statut" text DEFAULT 'PENDING' NOT NULL,
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
	"severite" text DEFAULT 'HIGH' NOT NULL,
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
	"statut" text DEFAULT 'PENDING' NOT NULL,
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
	"mouvement_id" uuid,
	"client_id" uuid,
	"montant" numeric NOT NULL,
	"methode_paiement" "methode_paiement_enum",
	"statut" "statut_transaction_enum" DEFAULT 'POSTED' NOT NULL,
	"reference" text NOT NULL,
	"reference_externe" text,
	"idempotency_key" text,
	"sens" text NOT NULL,
	"destinataire" text,
	"numero_telephone" text,
	"motif" text,
	"observations" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_credit_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"agence_id" uuid NOT NULL,
	"balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"last_transaction_date" timestamp,
	"last_transaction_type" varchar(50),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "remboursement_allocation_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"remboursement_id" uuid NOT NULL,
	"action" varchar(50) NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "remboursement_echeances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"remboursement_id" uuid NOT NULL,
	"echeance_id" uuid NOT NULL,
	"allocated_amount" numeric(15, 2) NOT NULL,
	"allocated_capital" numeric(15, 2) DEFAULT '0',
	"allocated_interest" numeric(15, 2) DEFAULT '0',
	"allocation_order" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"created_by" uuid,
	"reversed_at" timestamp,
	"reversed_by" uuid
);
--> statement-breakpoint
CREATE TABLE "loan_payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"remboursement_id" uuid,
	"credit_id" uuid NOT NULL,
	"mouvement_id" uuid,
	"payment_intent_id" uuid,
	"montant_total" numeric NOT NULL,
	"montant_penalites" numeric DEFAULT '0' NOT NULL,
	"montant_interets" numeric DEFAULT '0' NOT NULL,
	"montant_principal" numeric DEFAULT '0' NOT NULL,
	"solde_avant" numeric NOT NULL,
	"solde_apres" numeric NOT NULL,
	"methode_paiement" "methode_paiement_enum",
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mm_reconciliation_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date_rapport" timestamp NOT NULL,
	"provider" "mobile_money_provider_enum" NOT NULL,
	"agence_id" uuid,
	"total_intents" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"pending_count" integer DEFAULT 0 NOT NULL,
	"expired_count" integer DEFAULT 0 NOT NULL,
	"montant_attendu" numeric DEFAULT '0' NOT NULL,
	"montant_confirme" numeric DEFAULT '0' NOT NULL,
	"ecart" numeric DEFAULT '0' NOT NULL,
	"anomalies" jsonb,
	"anomalies_count" integer DEFAULT 0 NOT NULL,
	"statut" text DEFAULT 'GENERATED' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp,
	"review_notes" text,
	"resolved_by" uuid,
	"resolved_at" timestamp,
	"resolution_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid,
	"provider" "mobile_money_provider_enum" NOT NULL,
	"type" "type_payment_intent_enum" NOT NULL,
	"status" "statut_payment_intent_enum" DEFAULT 'CREATED' NOT NULL,
	"gateway" text DEFAULT 'PAWAPAY' NOT NULL,
	"operator" text,
	"correspondent" text,
	"amount" numeric NOT NULL,
	"currency" text DEFAULT 'XAF' NOT NULL,
	"phone" text NOT NULL,
	"external_ref" uuid DEFAULT gen_random_uuid() NOT NULL,
	"provider_ref" text,
	"provider_txn_id" text,
	"client_id" uuid,
	"compte_id" uuid,
	"credit_id" uuid,
	"tontine_id" uuid,
	"remboursement_id" uuid,
	"mouvement_id" uuid,
	"operation_caisse_id" uuid,
	"callback_url" text,
	"idempotency_key" text,
	"error_code" text,
	"error_message" text,
	"fee_amount" numeric,
	"fee_breakdown" jsonb,
	"fee_option" text,
	"client_fee_amount" numeric,
	"client_fee_rate" numeric,
	"montant_brut" numeric,
	"montant_net" numeric,
	"raw_callback_payload" jsonb,
	"callback_signature_valid" boolean,
	"metadata" jsonb,
	"initiated_at" timestamp,
	"confirmed_at" timestamp,
	"settlement_timestamp" timestamp,
	"expire_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "mobile_money_provider_enum" NOT NULL,
	"event_type" text NOT NULL,
	"provider_ref" text,
	"external_ref" uuid,
	"payload" jsonb NOT NULL,
	"signature" text,
	"processed" boolean DEFAULT false NOT NULL,
	"processed_at" timestamp,
	"processing_error" text,
	"payment_intent_id" uuid,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mm_fee_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "mobile_money_provider_enum" NOT NULL,
	"direction" "type_payment_intent_enum" NOT NULL,
	"fee_pct" numeric DEFAULT '0' NOT NULL,
	"fee_fixed" numeric DEFAULT '0' NOT NULL,
	"min_fee" numeric DEFAULT '0' NOT NULL,
	"max_fee" numeric DEFAULT '999999999' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_provider_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "email_provider_type_enum" DEFAULT 'SMTP' NOT NULL,
	"provider_name" text DEFAULT 'SMTP Default' NOT NULL,
	"host" text,
	"port" integer,
	"username" text,
	"password" text,
	"from_email" text NOT NULL,
	"from_name" text DEFAULT 'MicroFlex' NOT NULL,
	"api_key" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"secure" boolean DEFAULT true NOT NULL,
	"settings" json,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"nom" text NOT NULL,
	"subject" text NOT NULL,
	"contenu_html" text NOT NULL,
	"contenu_text" text NOT NULL,
	"placeholders" text,
	"description" text,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "email_templates_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "notification_delivery_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_job_id" uuid NOT NULL,
	"request_id" text NOT NULL,
	"sender_address" text,
	"receiver_address" text,
	"status" text,
	"raw_response" json,
	"checked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" "notification_channel_enum" NOT NULL,
	"template_code" text NOT NULL,
	"recipient" text NOT NULL,
	"payload" json NOT NULL,
	"status" "notification_job_status_enum" DEFAULT 'QUEUED' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now(),
	"locked_at" timestamp,
	"locked_until" timestamp,
	"last_error" text,
	"correlation_id" text NOT NULL,
	"agence_id" uuid,
	"user_id" uuid,
	"provider_response" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "notification_schedules" (
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
	"notification_job_id" uuid,
	"payload" json,
	"schedule_version" integer DEFAULT 1 NOT NULL,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"user_id" uuid,
	"agence_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agence_id" uuid,
	"sms_enabled" boolean DEFAULT true NOT NULL,
	"email_enabled" boolean DEFAULT false NOT NULL,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"fallback_policy" "fallback_policy_enum" DEFAULT 'SMS_ONLY' NOT NULL,
	"otp_channel" "otp_channel_enum" DEFAULT 'SMS' NOT NULL,
	"otp_max_per_minute" integer DEFAULT 3 NOT NULL,
	"otp_max_per_day" integer DEFAULT 20 NOT NULL,
	"sms_quota_daily" integer DEFAULT 1000 NOT NULL,
	"email_quota_daily" integer DEFAULT 500 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"destination" text NOT NULL,
	"channel" "otp_channel_enum" NOT NULL,
	"purpose" "otp_purpose_enum" NOT NULL,
	"code_hash" text NOT NULL,
	"salt" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"consumed_at" timestamp,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kpi_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_type" text NOT NULL,
	"period_key" text NOT NULL,
	"scope_type" text NOT NULL,
	"agency_id" uuid,
	"payload" jsonb NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"generated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_score_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"agence_id" uuid,
	"event_type" "score_event_type_enum" NOT NULL,
	"ref_id" text NOT NULL,
	"ref_type" text NOT NULL,
	"points_delta" integer DEFAULT 0 NOT NULL,
	"montant" numeric,
	"reason" text,
	"metadata" jsonb,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_score_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"agence_id" uuid,
	"score_payment" integer DEFAULT 50 NOT NULL,
	"score_loyalty" integer DEFAULT 50 NOT NULL,
	"score_engagement" integer DEFAULT 50 NOT NULL,
	"score_compliance" integer DEFAULT 50 NOT NULL,
	"score_global" integer DEFAULT 50 NOT NULL,
	"segment" text DEFAULT 'Standard' NOT NULL,
	"taux_remboursement" numeric DEFAULT '100' NOT NULL,
	"total_points_fidelite" integer DEFAULT 0 NOT NULL,
	"total_credits_rembourses" integer DEFAULT 0 NOT NULL,
	"total_incidents" integer DEFAULT 0 NOT NULL,
	"total_epargne_depots" integer DEFAULT 0 NOT NULL,
	"last_event_at" timestamp,
	"last_recalc_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_score_state_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
ALTER TABLE "accounting_rules" ADD CONSTRAINT "accounting_rules_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amortissements" ADD CONSTRAINT "amortissements_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amortissements" ADD CONSTRAINT "amortissements_immobilisation_id_immobilisations_id_fk" FOREIGN KEY ("immobilisation_id") REFERENCES "public"."immobilisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amortissements" ADD CONSTRAINT "amortissements_exercice_id_exercices_comptables_id_fk" FOREIGN KEY ("exercice_id") REFERENCES "public"."exercices_comptables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amortissements" ADD CONSTRAINT "amortissements_ecriture_id_ecritures_comptables_id_fk" FOREIGN KEY ("ecriture_id") REFERENCES "public"."ecritures_comptables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bareme_provisions" ADD CONSTRAINT "bareme_provisions_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declarations_dsf" ADD CONSTRAINT "declarations_dsf_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declarations_dsf" ADD CONSTRAINT "declarations_dsf_exercice_id_exercices_comptables_id_fk" FOREIGN KEY ("exercice_id") REFERENCES "public"."exercices_comptables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declarations_dsf" ADD CONSTRAINT "declarations_dsf_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declarations_dsf" ADD CONSTRAINT "declarations_dsf_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declarations_tva" ADD CONSTRAINT "declarations_tva_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecritures_comptables" ADD CONSTRAINT "ecritures_comptables_exercice_id_exercices_comptables_id_fk" FOREIGN KEY ("exercice_id") REFERENCES "public"."exercices_comptables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecritures_comptables" ADD CONSTRAINT "ecritures_comptables_journal_id_journaux_comptables_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journaux_comptables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecritures_comptables" ADD CONSTRAINT "ecritures_comptables_mouvement_id_mouvements_financiers_id_fk" FOREIGN KEY ("mouvement_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecritures_comptables" ADD CONSTRAINT "ecritures_comptables_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecritures_comptables" ADD CONSTRAINT "ecritures_comptables_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecritures_comptables" ADD CONSTRAINT "ecritures_comptables_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements_hors_bilan" ADD CONSTRAINT "engagements_hors_bilan_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements_hors_bilan" ADD CONSTRAINT "engagements_hors_bilan_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercice_cloture_steps" ADD CONSTRAINT "exercice_cloture_steps_exercice_id_exercices_comptables_id_fk" FOREIGN KEY ("exercice_id") REFERENCES "public"."exercices_comptables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercice_cloture_steps" ADD CONSTRAINT "exercice_cloture_steps_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercice_cloture_steps" ADD CONSTRAINT "exercice_cloture_steps_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercices_comptables" ADD CONSTRAINT "exercices_comptables_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gl_periods" ADD CONSTRAINT "gl_periods_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gl_periods" ADD CONSTRAINT "gl_periods_exercice_id_exercices_comptables_id_fk" FOREIGN KEY ("exercice_id") REFERENCES "public"."exercices_comptables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gl_periods" ADD CONSTRAINT "gl_periods_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gl_posting_links" ADD CONSTRAINT "gl_posting_links_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gl_posting_links" ADD CONSTRAINT "gl_posting_links_ecriture_id_ecritures_comptables_id_fk" FOREIGN KEY ("ecriture_id") REFERENCES "public"."ecritures_comptables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gl_posting_links" ADD CONSTRAINT "gl_posting_links_mouvement_id_mouvements_financiers_id_fk" FOREIGN KEY ("mouvement_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gl_sequences" ADD CONSTRAINT "gl_sequences_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "immobilisations" ADD CONSTRAINT "immobilisations_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "immobilisations" ADD CONSTRAINT "immobilisations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journaux_comptables" ADD CONSTRAINT "journaux_comptables_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_ecritures" ADD CONSTRAINT "lignes_ecritures_ecriture_id_ecritures_comptables_id_fk" FOREIGN KEY ("ecriture_id") REFERENCES "public"."ecritures_comptables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_ecritures" ADD CONSTRAINT "lignes_ecritures_compte_id_plan_comptable_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."plan_comptable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_ecritures" ADD CONSTRAINT "lignes_ecritures_lettrage_user_id_users_id_fk" FOREIGN KEY ("lettrage_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_comptable" ADD CONSTRAINT "plan_comptable_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisions_credits" ADD CONSTRAINT "provisions_credits_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisions_credits" ADD CONSTRAINT "provisions_credits_credit_id_credits_id_fk" FOREIGN KEY ("credit_id") REFERENCES "public"."credits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisions_credits" ADD CONSTRAINT "provisions_credits_exercice_id_exercices_comptables_id_fk" FOREIGN KEY ("exercice_id") REFERENCES "public"."exercices_comptables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisions_credits" ADD CONSTRAINT "provisions_credits_ecriture_id_ecritures_comptables_id_fk" FOREIGN KEY ("ecriture_id") REFERENCES "public"."ecritures_comptables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rapprochement_lignes" ADD CONSTRAINT "rapprochement_lignes_rapprochement_id_rapprochements_bancaires_id_fk" FOREIGN KEY ("rapprochement_id") REFERENCES "public"."rapprochements_bancaires"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rapprochements_bancaires" ADD CONSTRAINT "rapprochements_bancaires_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rapprochements_bancaires" ADD CONSTRAINT "rapprochements_bancaires_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rapprochements_bancaires" ADD CONSTRAINT "rapprochements_bancaires_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratios_prudentiels" ADD CONSTRAINT "ratios_prudentiels_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratios_prudentiels" ADD CONSTRAINT "ratios_prudentiels_exercice_id_exercices_comptables_id_fk" FOREIGN KEY ("exercice_id") REFERENCES "public"."exercices_comptables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratios_prudentiels" ADD CONSTRAINT "ratios_prudentiels_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agences" ADD CONSTRAINT "agences_responsable_id_users_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agences" ADD CONSTRAINT "agences_activated_by_users_id_fk" FOREIGN KEY ("activated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_status_history" ADD CONSTRAINT "agency_status_history_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_status_history" ADD CONSTRAINT "agency_status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_agences" ADD CONSTRAINT "user_agences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_agences" ADD CONSTRAINT "user_agences_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_migrations" ADD CONSTRAINT "agency_migrations_source_agency_id_agences_id_fk" FOREIGN KEY ("source_agency_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_migrations" ADD CONSTRAINT "agency_migrations_target_clients_agency_id_agences_id_fk" FOREIGN KEY ("target_clients_agency_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_migrations" ADD CONSTRAINT "agency_migrations_target_employees_agency_id_agences_id_fk" FOREIGN KEY ("target_employees_agency_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_migrations" ADD CONSTRAINT "agency_migrations_target_treasury_agency_id_agences_id_fk" FOREIGN KEY ("target_treasury_agency_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_migrations" ADD CONSTRAINT "agency_migrations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_migrations" ADD CONSTRAINT "agency_migrations_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_migrations" ADD CONSTRAINT "agency_migrations_executed_by_users_id_fk" FOREIGN KEY ("executed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_audit_logs" ADD CONSTRAINT "migration_audit_logs_migration_id_agency_migrations_id_fk" FOREIGN KEY ("migration_id") REFERENCES "public"."agency_migrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_audit_logs" ADD CONSTRAINT "migration_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_entity_logs" ADD CONSTRAINT "migration_entity_logs_migration_id_agency_migrations_id_fk" FOREIGN KEY ("migration_id") REFERENCES "public"."agency_migrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_pre_flight_checks" ADD CONSTRAINT "migration_pre_flight_checks_migration_id_agency_migrations_id_fk" FOREIGN KEY ("migration_id") REFERENCES "public"."agency_migrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_pre_flight_checks" ADD CONSTRAINT "migration_pre_flight_checks_checked_by_users_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_agent_id_agents_terrain_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents_terrain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_mouvement_id_mouvements_financiers_id_fk" FOREIGN KEY ("mouvement_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_communications" ADD CONSTRAINT "agent_communications_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_incidents" ADD CONSTRAINT "agent_incidents_agent_id_agents_terrain_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents_terrain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_incidents" ADD CONSTRAINT "agent_incidents_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_materiel" ADD CONSTRAINT "agent_materiel_agent_id_agents_terrain_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents_terrain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_materiel" ADD CONSTRAINT "agent_materiel_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_objectifs" ADD CONSTRAINT "agent_objectifs_agent_id_agents_terrain_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents_terrain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_objectifs" ADD CONSTRAINT "agent_objectifs_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_plannings" ADD CONSTRAINT "agent_plannings_agent_id_agents_terrain_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents_terrain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_plannings" ADD CONSTRAINT "agent_plannings_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_rapports" ADD CONSTRAINT "agent_rapports_agent_id_agents_terrain_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents_terrain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_rapports" ADD CONSTRAINT "agent_rapports_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centres_couts" ADD CONSTRAINT "centres_couts_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cles_repartition" ADD CONSTRAINT "cles_repartition_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cles_repartition_lignes" ADD CONSTRAINT "cles_repartition_lignes_cle_id_cles_repartition_id_fk" FOREIGN KEY ("cle_id") REFERENCES "public"."cles_repartition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cles_repartition_lignes" ADD CONSTRAINT "cles_repartition_lignes_centre_cout_id_centres_couts_id_fk" FOREIGN KEY ("centre_cout_id") REFERENCES "public"."centres_couts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_analytiques" ADD CONSTRAINT "lignes_analytiques_ligne_ecriture_id_lignes_ecritures_id_fk" FOREIGN KEY ("ligne_ecriture_id") REFERENCES "public"."lignes_ecritures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_analytiques" ADD CONSTRAINT "lignes_analytiques_ecriture_id_ecritures_comptables_id_fk" FOREIGN KEY ("ecriture_id") REFERENCES "public"."ecritures_comptables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_analytiques" ADD CONSTRAINT "lignes_analytiques_centre_cout_id_centres_couts_id_fk" FOREIGN KEY ("centre_cout_id") REFERENCES "public"."centres_couts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_analytiques" ADD CONSTRAINT "lignes_analytiques_ligne_produit_id_lignes_produits_id_fk" FOREIGN KEY ("ligne_produit_id") REFERENCES "public"."lignes_produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_produits" ADD CONSTRAINT "lignes_produits_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_sessions" ADD CONSTRAINT "active_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_analytics_config" ADD CONSTRAINT "permission_analytics_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_requests" ADD CONSTRAINT "permission_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_requests" ADD CONSTRAINT "permission_requests_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_requests" ADD CONSTRAINT "permission_requests_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_usage_logs" ADD CONSTRAINT "permission_usage_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbac_audit_log" ADD CONSTRAINT "rbac_audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbac_audit_log" ADD CONSTRAINT "rbac_audit_log_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbac_audit_log" ADD CONSTRAINT "rbac_audit_log_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_feature_flags" ADD CONSTRAINT "system_feature_flags_enabled_by_users_id_fk" FOREIGN KEY ("enabled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temporary_permissions" ADD CONSTRAINT "temporary_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temporary_permissions" ADD CONSTRAINT "temporary_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temporary_permissions" ADD CONSTRAINT "temporary_permissions_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temporary_permissions" ADD CONSTRAINT "temporary_permissions_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_nationalite_id_pays_id_fk" FOREIGN KEY ("nationalite_id") REFERENCES "public"."pays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_pays_naissance_id_pays_id_fk" FOREIGN KEY ("pays_naissance_id") REFERENCES "public"."pays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_agency_history" ADD CONSTRAINT "agent_agency_history_agent_id_agents_terrain_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents_terrain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_agency_history" ADD CONSTRAINT "agent_agency_history_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_agency_history" ADD CONSTRAINT "agent_agency_history_gl_account_id_plan_comptable_id_fk" FOREIGN KEY ("gl_account_id") REFERENCES "public"."plan_comptable"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_agency_history" ADD CONSTRAINT "agent_agency_history_transferred_by_users_id_fk" FOREIGN KEY ("transferred_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_session_config" ADD CONSTRAINT "agent_session_config_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisses_agent" ADD CONSTRAINT "caisses_agent_agent_id_agents_terrain_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents_terrain"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisses_agent" ADD CONSTRAINT "caisses_agent_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_terrain" ADD CONSTRAINT "operations_terrain_agent_id_agents_terrain_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents_terrain"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_terrain" ADD CONSTRAINT "operations_terrain_caisse_agent_id_caisses_agent_id_fk" FOREIGN KEY ("caisse_agent_id") REFERENCES "public"."caisses_agent"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_terrain" ADD CONSTRAINT "operations_terrain_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_terrain" ADD CONSTRAINT "operations_terrain_destination_caisse_id_caisses_id_fk" FOREIGN KEY ("destination_caisse_id") REFERENCES "public"."caisses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_terrain" ADD CONSTRAINT "operations_terrain_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_terrain" ADD CONSTRAINT "operations_terrain_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_terrain" ADD CONSTRAINT "operations_terrain_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_terrain" ADD CONSTRAINT "operations_terrain_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_terrain" ADD CONSTRAINT "operations_terrain_posted_mouvement_caisse_agent_id_mouvements_financiers_id_fk" FOREIGN KEY ("posted_mouvement_caisse_agent_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_terrain" ADD CONSTRAINT "operations_terrain_posted_mouvement_client_id_mouvements_financiers_id_fk" FOREIGN KEY ("posted_mouvement_client_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_terrain" ADD CONSTRAINT "operations_terrain_posted_mouvement_destination_id_mouvements_financiers_id_fk" FOREIGN KEY ("posted_mouvement_destination_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_terrain" ADD CONSTRAINT "operations_terrain_posted_paiement_terrain_id_paiements_terrain_id_fk" FOREIGN KEY ("posted_paiement_terrain_id") REFERENCES "public"."paiements_terrain"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_terrain_audit_logs" ADD CONSTRAINT "operations_terrain_audit_logs_operation_id_operations_terrain_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations_terrain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_terrain_audit_logs" ADD CONSTRAINT "operations_terrain_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_agent" ADD CONSTRAINT "sessions_agent_agent_id_agents_terrain_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents_terrain"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_agent" ADD CONSTRAINT "sessions_agent_caisse_agent_id_caisses_agent_id_fk" FOREIGN KEY ("caisse_agent_id") REFERENCES "public"."caisses_agent"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_agent" ADD CONSTRAINT "sessions_agent_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_agent" ADD CONSTRAINT "sessions_agent_gl_account_id_plan_comptable_id_fk" FOREIGN KEY ("gl_account_id") REFERENCES "public"."plan_comptable"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_agent" ADD CONSTRAINT "sessions_agent_fund_dispatched_by_users_id_fk" FOREIGN KEY ("fund_dispatched_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_agent" ADD CONSTRAINT "sessions_agent_source_caisse_id_caisses_id_fk" FOREIGN KEY ("source_caisse_id") REFERENCES "public"."caisses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_agent" ADD CONSTRAINT "sessions_agent_provisioning_operation_id_operations_terrain_id_fk" FOREIGN KEY ("provisioning_operation_id") REFERENCES "public"."operations_terrain"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_agent" ADD CONSTRAINT "sessions_agent_destination_caisse_id_caisses_id_fk" FOREIGN KEY ("destination_caisse_id") REFERENCES "public"."caisses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_agent" ADD CONSTRAINT "sessions_agent_closing_operation_id_operations_terrain_id_fk" FOREIGN KEY ("closing_operation_id") REFERENCES "public"."operations_terrain"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_agent" ADD CONSTRAINT "sessions_agent_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_agent" ADD CONSTRAINT "sessions_agent_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_agent_audit_logs" ADD CONSTRAINT "sessions_agent_audit_logs_session_id_sessions_agent_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions_agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_agent_audit_logs" ADD CONSTRAINT "sessions_agent_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_closure_audit_log" ADD CONSTRAINT "agency_closure_audit_log_closure_id_agency_daily_closure_id_fk" FOREIGN KEY ("closure_id") REFERENCES "public"."agency_daily_closure"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_closure_audit_log" ADD CONSTRAINT "agency_closure_audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_closure_blockers" ADD CONSTRAINT "agency_closure_blockers_closure_id_agency_daily_closure_id_fk" FOREIGN KEY ("closure_id") REFERENCES "public"."agency_daily_closure"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_closure_blockers" ADD CONSTRAINT "agency_closure_blockers_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_daily_closure" ADD CONSTRAINT "agency_daily_closure_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_daily_closure" ADD CONSTRAINT "agency_daily_closure_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_daily_closure" ADD CONSTRAINT "agency_daily_closure_reopened_by_users_id_fk" FOREIGN KEY ("reopened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_ecart_caisse" ADD CONSTRAINT "config_ecart_caisse_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecarts_approval_audit_log" ADD CONSTRAINT "ecarts_approval_audit_log_request_id_ecarts_approval_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."ecarts_approval_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecarts_approval_audit_log" ADD CONSTRAINT "ecarts_approval_audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecarts_approval_requests" ADD CONSTRAINT "ecarts_approval_requests_session_id_sessions_caisse_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions_caisse"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecarts_approval_requests" ADD CONSTRAINT "ecarts_approval_requests_caissier_id_users_id_fk" FOREIGN KEY ("caissier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecarts_approval_requests" ADD CONSTRAINT "ecarts_approval_requests_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecarts_approval_requests" ADD CONSTRAINT "ecarts_approval_requests_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecarts_approval_requests" ADD CONSTRAINT "ecarts_approval_requests_second_approver_id_users_id_fk" FOREIGN KEY ("second_approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mm_balance_reconciliations" ADD CONSTRAINT "mm_balance_reconciliations_session_id_sessions_caisse_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions_caisse"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mm_balance_reconciliations" ADD CONSTRAINT "mm_balance_reconciliations_caisse_digitale_id_caisses_id_fk" FOREIGN KEY ("caisse_digitale_id") REFERENCES "public"."caisses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mm_balance_reconciliations" ADD CONSTRAINT "mm_balance_reconciliations_overridden_by_users_id_fk" FOREIGN KEY ("overridden_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profession_activity_types" ADD CONSTRAINT "profession_activity_types_profession_id_professions_id_fk" FOREIGN KEY ("profession_id") REFERENCES "public"."professions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profession_activity_types" ADD CONSTRAINT "profession_activity_types_activity_type_id_activity_types_id_fk" FOREIGN KEY ("activity_type_id") REFERENCES "public"."activity_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profession_sectors" ADD CONSTRAINT "profession_sectors_profession_id_professions_id_fk" FOREIGN KEY ("profession_id") REFERENCES "public"."professions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profession_sectors" ADD CONSTRAINT "profession_sectors_sector_id_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sector_activity_types" ADD CONSTRAINT "sector_activity_types_sector_id_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sector_activity_types" ADD CONSTRAINT "sector_activity_types_activity_type_id_activity_types_id_fk" FOREIGN KEY ("activity_type_id") REFERENCES "public"."activity_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_activities" ADD CONSTRAINT "client_activities_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_tags" ADD CONSTRAINT "client_tags_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_tags" ADD CONSTRAINT "client_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_pays_residence_id_pays_id_fk" FOREIGN KEY ("pays_residence_id") REFERENCES "public"."pays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_pays_emission_id_pays_id_fk" FOREIGN KEY ("pays_emission_id") REFERENCES "public"."pays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_verification_piece_by_users_id_fk" FOREIGN KEY ("verification_piece_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_sector_id_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_profession_id_professions_id_fk" FOREIGN KEY ("profession_id") REFERENCES "public"."professions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_activity_type_id_activity_types_id_fk" FOREIGN KEY ("activity_type_id") REFERENCES "public"."activity_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_kyc_verified_by_users_id_fk" FOREIGN KEY ("kyc_verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_agent_referent_id_employes_id_fk" FOREIGN KEY ("agent_referent_id") REFERENCES "public"."employes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_coffre_fort" ADD CONSTRAINT "config_coffre_fort_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliations_coffre_caisse" ADD CONSTRAINT "reconciliations_coffre_caisse_compte_liaison_source_id_caisses_id_fk" FOREIGN KEY ("compte_liaison_source_id") REFERENCES "public"."caisses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliations_coffre_caisse" ADD CONSTRAINT "reconciliations_coffre_caisse_compte_liaison_dest_id_caisses_id_fk" FOREIGN KEY ("compte_liaison_dest_id") REFERENCES "public"."caisses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliations_coffre_caisse" ADD CONSTRAINT "reconciliations_coffre_caisse_transfert_id_transferts_coffre_caisse_id_fk" FOREIGN KEY ("transfert_id") REFERENCES "public"."transferts_coffre_caisse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliations_coffre_caisse" ADD CONSTRAINT "reconciliations_coffre_caisse_rapproche_par_users_id_fk" FOREIGN KEY ("rapproche_par") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taches_regularisation_coffre_caisse" ADD CONSTRAINT "taches_regularisation_coffre_caisse_transfert_id_transferts_coffre_caisse_id_fk" FOREIGN KEY ("transfert_id") REFERENCES "public"."transferts_coffre_caisse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taches_regularisation_coffre_caisse" ADD CONSTRAINT "taches_regularisation_coffre_caisse_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taches_regularisation_coffre_caisse" ADD CONSTRAINT "taches_regularisation_coffre_caisse_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_coffre_audit_logs" ADD CONSTRAINT "transferts_coffre_audit_logs_transfert_id_transferts_coffre_caisse_id_fk" FOREIGN KEY ("transfert_id") REFERENCES "public"."transferts_coffre_caisse"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_coffre_audit_logs" ADD CONSTRAINT "transferts_coffre_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_coffre_caisse" ADD CONSTRAINT "transferts_coffre_caisse_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_coffre_caisse" ADD CONSTRAINT "transferts_coffre_caisse_coffre_id_coffres_forts_id_fk" FOREIGN KEY ("coffre_id") REFERENCES "public"."coffres_forts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_coffre_caisse" ADD CONSTRAINT "transferts_coffre_caisse_caisse_id_caisses_id_fk" FOREIGN KEY ("caisse_id") REFERENCES "public"."caisses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_coffre_caisse" ADD CONSTRAINT "transferts_coffre_caisse_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_coffre_caisse" ADD CONSTRAINT "transferts_coffre_caisse_session_request_id_sessions_caisse_id_fk" FOREIGN KEY ("session_request_id") REFERENCES "public"."sessions_caisse"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_coffre_caisse" ADD CONSTRAINT "transferts_coffre_caisse_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_coffre_caisse" ADD CONSTRAINT "transferts_coffre_caisse_executed_by_users_id_fk" FOREIGN KEY ("executed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_coffre_caisse" ADD CONSTRAINT "transferts_coffre_caisse_session_execute_id_sessions_caisse_id_fk" FOREIGN KEY ("session_execute_id") REFERENCES "public"."sessions_caisse"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_coffre_caisse" ADD CONSTRAINT "transferts_coffre_caisse_mouvement_debit_id_mouvements_financiers_id_fk" FOREIGN KEY ("mouvement_debit_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_coffre_caisse" ADD CONSTRAINT "transferts_coffre_caisse_mouvement_credit_id_mouvements_financiers_id_fk" FOREIGN KEY ("mouvement_credit_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_coffre_caisse" ADD CONSTRAINT "transferts_coffre_caisse_operation_source_id_operations_caisse_id_fk" FOREIGN KEY ("operation_source_id") REFERENCES "public"."operations_caisse"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_coffre_caisse" ADD CONSTRAINT "transferts_coffre_caisse_operation_dest_id_operations_caisse_id_fk" FOREIGN KEY ("operation_dest_id") REFERENCES "public"."operations_caisse"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_coffre_caisse" ADD CONSTRAINT "transferts_coffre_caisse_session_ouverture_id_sessions_caisse_id_fk" FOREIGN KEY ("session_ouverture_id") REFERENCES "public"."sessions_caisse"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coffre_balance_snapshots" ADD CONSTRAINT "coffre_balance_snapshots_coffre_id_coffres_forts_id_fk" FOREIGN KEY ("coffre_id") REFERENCES "public"."coffres_forts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coffre_balance_snapshots" ADD CONSTRAINT "coffre_balance_snapshots_agency_id_agences_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coffres_forts" ADD CONSTRAINT "coffres_forts_owner_id_agences_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."agences"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comptes_liaison" ADD CONSTRAINT "comptes_liaison_entite_id_agences_id_fk" FOREIGN KEY ("entite_id") REFERENCES "public"."agences"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_transfert_inter_coffres" ADD CONSTRAINT "config_transfert_inter_coffres_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents_transfert" ADD CONSTRAINT "documents_transfert_transfert_id_transferts_inter_coffres_id_fk" FOREIGN KEY ("transfert_id") REFERENCES "public"."transferts_inter_coffres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents_transfert" ADD CONSTRAINT "documents_transfert_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliations_liaison" ADD CONSTRAINT "reconciliations_liaison_compte_liaison_source_id_comptes_liaison_id_fk" FOREIGN KEY ("compte_liaison_source_id") REFERENCES "public"."comptes_liaison"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliations_liaison" ADD CONSTRAINT "reconciliations_liaison_compte_liaison_dest_id_comptes_liaison_id_fk" FOREIGN KEY ("compte_liaison_dest_id") REFERENCES "public"."comptes_liaison"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliations_liaison" ADD CONSTRAINT "reconciliations_liaison_transfert_id_transferts_inter_coffres_id_fk" FOREIGN KEY ("transfert_id") REFERENCES "public"."transferts_inter_coffres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliations_liaison" ADD CONSTRAINT "reconciliations_liaison_rapproche_par_users_id_fk" FOREIGN KEY ("rapproche_par") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taches_regularisation" ADD CONSTRAINT "taches_regularisation_transfert_id_transferts_inter_coffres_id_fk" FOREIGN KEY ("transfert_id") REFERENCES "public"."transferts_inter_coffres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taches_regularisation" ADD CONSTRAINT "taches_regularisation_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taches_regularisation" ADD CONSTRAINT "taches_regularisation_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_inter_coffres" ADD CONSTRAINT "transferts_inter_coffres_coffre_source_id_coffres_forts_id_fk" FOREIGN KEY ("coffre_source_id") REFERENCES "public"."coffres_forts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_inter_coffres" ADD CONSTRAINT "transferts_inter_coffres_coffre_destination_id_coffres_forts_id_fk" FOREIGN KEY ("coffre_destination_id") REFERENCES "public"."coffres_forts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_inter_coffres" ADD CONSTRAINT "transferts_inter_coffres_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_inter_coffres" ADD CONSTRAINT "transferts_inter_coffres_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_inter_coffres" ADD CONSTRAINT "transferts_inter_coffres_approved_by_level1_users_id_fk" FOREIGN KEY ("approved_by_level1") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_inter_coffres" ADD CONSTRAINT "transferts_inter_coffres_approved_by_level2_users_id_fk" FOREIGN KEY ("approved_by_level2") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_inter_coffres" ADD CONSTRAINT "transferts_inter_coffres_dispatched_by_users_id_fk" FOREIGN KEY ("dispatched_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_inter_coffres" ADD CONSTRAINT "transferts_inter_coffres_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_inter_coffres" ADD CONSTRAINT "transferts_inter_coffres_mouvement_source_id_mouvements_financiers_id_fk" FOREIGN KEY ("mouvement_source_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_inter_coffres" ADD CONSTRAINT "transferts_inter_coffres_mouvement_destination_id_mouvements_financiers_id_fk" FOREIGN KEY ("mouvement_destination_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_inter_coffres" ADD CONSTRAINT "transferts_inter_coffres_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_inter_coffres" ADD CONSTRAINT "transferts_inter_coffres_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_inter_coffres_audit_logs" ADD CONSTRAINT "transferts_inter_coffres_audit_logs_transfert_id_transferts_inter_coffres_id_fk" FOREIGN KEY ("transfert_id") REFERENCES "public"."transferts_inter_coffres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts_inter_coffres_audit_logs" ADD CONSTRAINT "transferts_inter_coffres_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_message_id_messages_v2_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages_v2"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages_v2" ADD CONSTRAINT "messages_v2_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages_v2" ADD CONSTRAINT "messages_v2_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_positions" ADD CONSTRAINT "job_positions_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_keys" ADD CONSTRAINT "device_keys_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_day_sessions" ADD CONSTRAINT "offline_day_sessions_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_journal_entries" ADD CONSTRAINT "offline_journal_entries_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_journal_entries" ADD CONSTRAINT "offline_journal_entries_device_key_id_device_keys_id_fk" FOREIGN KEY ("device_key_id") REFERENCES "public"."device_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossiers_credit" ADD CONSTRAINT "dossiers_credit_prospection_id_prospections_id_fk" FOREIGN KEY ("prospection_id") REFERENCES "public"."prospections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossiers_credit" ADD CONSTRAINT "dossiers_credit_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossiers_credit" ADD CONSTRAINT "dossiers_credit_agent_id_agents_terrain_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents_terrain"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossiers_credit" ADD CONSTRAINT "dossiers_credit_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossiers_credit" ADD CONSTRAINT "dossiers_credit_paiement_frais_id_paiements_terrain_id_fk" FOREIGN KEY ("paiement_frais_id") REFERENCES "public"."paiements_terrain"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossiers_credit" ADD CONSTRAINT "dossiers_credit_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossiers_credit" ADD CONSTRAINT "dossiers_credit_committee_decision_by_users_id_fk" FOREIGN KEY ("committee_decision_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossiers_credit" ADD CONSTRAINT "dossiers_credit_demande_credit_id_demandes_credit_id_fk" FOREIGN KEY ("demande_credit_id") REFERENCES "public"."demandes_credit"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossiers_credit" ADD CONSTRAINT "dossiers_credit_credit_id_credits_id_fk" FOREIGN KEY ("credit_id") REFERENCES "public"."credits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossiers_credit" ADD CONSTRAINT "dossiers_credit_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossiers_credit" ADD CONSTRAINT "dossiers_credit_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossiers_credit" ADD CONSTRAINT "dossiers_credit_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employes" ADD CONSTRAINT "employes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employes" ADD CONSTRAINT "employes_job_position_id_job_positions_id_fk" FOREIGN KEY ("job_position_id") REFERENCES "public"."job_positions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employes" ADD CONSTRAINT "employes_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employes" ADD CONSTRAINT "employes_pays_emission_id_pays_id_fk" FOREIGN KEY ("pays_emission_id") REFERENCES "public"."pays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_evacuation_coffre" ADD CONSTRAINT "config_evacuation_coffre_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evacuations_coffre" ADD CONSTRAINT "evacuations_coffre_coffre_source_id_coffres_forts_id_fk" FOREIGN KEY ("coffre_source_id") REFERENCES "public"."coffres_forts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evacuations_coffre" ADD CONSTRAINT "evacuations_coffre_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evacuations_coffre" ADD CONSTRAINT "evacuations_coffre_coffre_destination_id_coffres_forts_id_fk" FOREIGN KEY ("coffre_destination_id") REFERENCES "public"."coffres_forts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evacuations_coffre" ADD CONSTRAINT "evacuations_coffre_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evacuations_coffre" ADD CONSTRAINT "evacuations_coffre_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evacuations_coffre" ADD CONSTRAINT "evacuations_coffre_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evacuations_coffre" ADD CONSTRAINT "evacuations_coffre_prepared_by_users_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evacuations_coffre" ADD CONSTRAINT "evacuations_coffre_dispatched_by_users_id_fk" FOREIGN KEY ("dispatched_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evacuations_coffre" ADD CONSTRAINT "evacuations_coffre_deposited_by_users_id_fk" FOREIGN KEY ("deposited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evacuations_coffre" ADD CONSTRAINT "evacuations_coffre_reconciled_by_users_id_fk" FOREIGN KEY ("reconciled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evacuations_coffre" ADD CONSTRAINT "evacuations_coffre_mouvement_transit_id_mouvements_financiers_id_fk" FOREIGN KEY ("mouvement_transit_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evacuations_coffre" ADD CONSTRAINT "evacuations_coffre_mouvement_depot_id_mouvements_financiers_id_fk" FOREIGN KEY ("mouvement_depot_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evacuations_coffre" ADD CONSTRAINT "evacuations_coffre_mouvement_ecart_id_mouvements_financiers_id_fk" FOREIGN KEY ("mouvement_ecart_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evacuations_coffre" ADD CONSTRAINT "evacuations_coffre_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evacuations_coffre" ADD CONSTRAINT "evacuations_coffre_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evacuations_coffre_audit_logs" ADD CONSTRAINT "evacuations_coffre_audit_logs_evacuation_id_evacuations_coffre_id_fk" FOREIGN KEY ("evacuation_id") REFERENCES "public"."evacuations_coffre"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evacuations_coffre_audit_logs" ADD CONSTRAINT "evacuations_coffre_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_closure_requests" ADD CONSTRAINT "account_closure_requests_compte_id_comptes_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."comptes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_closure_requests" ADD CONSTRAINT "account_closure_requests_initiated_by_users_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_closure_requests" ADD CONSTRAINT "account_closure_requests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_closure_requests" ADD CONSTRAINT "account_closure_requests_payout_mouvement_id_mouvements_financiers_id_fk" FOREIGN KEY ("payout_mouvement_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_closure_requests" ADD CONSTRAINT "account_closure_requests_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_opening_requests" ADD CONSTRAINT "account_opening_requests_compte_id_comptes_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."comptes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_opening_requests" ADD CONSTRAINT "account_opening_requests_initiated_by_users_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_opening_requests" ADD CONSTRAINT "account_opening_requests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_opening_requests" ADD CONSTRAINT "account_opening_requests_produit_id_produits_compte_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits_compte"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_opening_requests" ADD CONSTRAINT "account_opening_requests_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_handover_audit_logs" ADD CONSTRAINT "caisse_handover_audit_logs_handover_id_caisse_handovers_id_fk" FOREIGN KEY ("handover_id") REFERENCES "public"."caisse_handovers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_handover_audit_logs" ADD CONSTRAINT "caisse_handover_audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_handovers" ADD CONSTRAINT "caisse_handovers_session_id_sessions_caisse_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions_caisse"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_handovers" ADD CONSTRAINT "caisse_handovers_caisse_id_caisses_id_fk" FOREIGN KEY ("caisse_id") REFERENCES "public"."caisses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_handovers" ADD CONSTRAINT "caisse_handovers_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_handovers" ADD CONSTRAINT "caisse_handovers_from_caissier_id_users_id_fk" FOREIGN KEY ("from_caissier_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_handovers" ADD CONSTRAINT "caisse_handovers_to_caissier_id_users_id_fk" FOREIGN KEY ("to_caissier_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_handovers" ADD CONSTRAINT "caisse_handovers_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_handovers" ADD CONSTRAINT "caisse_handovers_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_payment_requests" ADD CONSTRAINT "caisse_payment_requests_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_payment_requests" ADD CONSTRAINT "caisse_payment_requests_target_caisse_id_caisses_id_fk" FOREIGN KEY ("target_caisse_id") REFERENCES "public"."caisses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_payment_requests" ADD CONSTRAINT "caisse_payment_requests_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_payment_requests" ADD CONSTRAINT "caisse_payment_requests_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_payment_requests" ADD CONSTRAINT "caisse_payment_requests_session_caisse_id_sessions_caisse_id_fk" FOREIGN KEY ("session_caisse_id") REFERENCES "public"."sessions_caisse"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_payment_requests" ADD CONSTRAINT "caisse_payment_requests_mouvement_id_mouvements_financiers_id_fk" FOREIGN KEY ("mouvement_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_payment_requests" ADD CONSTRAINT "caisse_payment_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_transferts" ADD CONSTRAINT "caisse_transferts_session_source_id_sessions_caisse_id_fk" FOREIGN KEY ("session_source_id") REFERENCES "public"."sessions_caisse"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_transferts" ADD CONSTRAINT "caisse_transferts_session_dest_id_sessions_caisse_id_fk" FOREIGN KEY ("session_dest_id") REFERENCES "public"."sessions_caisse"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_transferts" ADD CONSTRAINT "caisse_transferts_agence_source_id_agences_id_fk" FOREIGN KEY ("agence_source_id") REFERENCES "public"."agences"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_transferts" ADD CONSTRAINT "caisse_transferts_agence_dest_id_agences_id_fk" FOREIGN KEY ("agence_dest_id") REFERENCES "public"."agences"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_transferts" ADD CONSTRAINT "caisse_transferts_mouvement_sortie_id_mouvements_financiers_id_fk" FOREIGN KEY ("mouvement_sortie_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_transferts" ADD CONSTRAINT "caisse_transferts_mouvement_entree_id_mouvements_financiers_id_fk" FOREIGN KEY ("mouvement_entree_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_transferts" ADD CONSTRAINT "caisse_transferts_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_transferts" ADD CONSTRAINT "caisse_transferts_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_transferts" ADD CONSTRAINT "caisse_transferts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisses" ADD CONSTRAINT "caisses_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_opening_discrepancies" ADD CONSTRAINT "cash_opening_discrepancies_session_id_sessions_caisse_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions_caisse"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_opening_discrepancies" ADD CONSTRAINT "cash_opening_discrepancies_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_opening_discrepancies" ADD CONSTRAINT "cash_opening_discrepancies_caisse_id_caisses_id_fk" FOREIGN KEY ("caisse_id") REFERENCES "public"."caisses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_opening_discrepancies" ADD CONSTRAINT "cash_opening_discrepancies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_opening_discrepancies" ADD CONSTRAINT "cash_opening_discrepancies_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_opening_discrepancies" ADD CONSTRAINT "cash_opening_discrepancies_previous_session_id_sessions_caisse_id_fk" FOREIGN KEY ("previous_session_id") REFERENCES "public"."sessions_caisse"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compte_agences_historique" ADD CONSTRAINT "compte_agences_historique_compte_id_comptes_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."comptes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compte_agences_historique" ADD CONSTRAINT "compte_agences_historique_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compte_agences_historique" ADD CONSTRAINT "compte_agences_historique_transfere_par_users_id_fk" FOREIGN KEY ("transfere_par") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comptes" ADD CONSTRAINT "comptes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comptes" ADD CONSTRAINT "comptes_produit_id_produits_compte_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits_compte"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comptes" ADD CONSTRAINT "comptes_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comptes" ADD CONSTRAINT "comptes_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comptes" ADD CONSTRAINT "comptes_suspended_by_users_id_fk" FOREIGN KEY ("suspended_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comptes" ADD CONSTRAINT "comptes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comptes" ADD CONSTRAINT "comptes_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_reevaluation" ADD CONSTRAINT "config_reevaluation_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_plan_fees" ADD CONSTRAINT "credit_plan_fees_plan_id_credit_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."credit_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_refund_requests" ADD CONSTRAINT "credit_refund_requests_demande_id_demandes_credit_id_fk" FOREIGN KEY ("demande_id") REFERENCES "public"."demandes_credit"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_refund_requests" ADD CONSTRAINT "credit_refund_requests_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_refund_requests" ADD CONSTRAINT "credit_refund_requests_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_refund_requests" ADD CONSTRAINT "credit_refund_requests_maker_id_users_id_fk" FOREIGN KEY ("maker_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_refund_requests" ADD CONSTRAINT "credit_refund_requests_checker_id_users_id_fk" FOREIGN KEY ("checker_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_refund_requests" ADD CONSTRAINT "credit_refund_requests_paid_by_users_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_refund_requests" ADD CONSTRAINT "credit_refund_requests_mouvement_id_mouvements_financiers_id_fk" FOREIGN KEY ("mouvement_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_demande_id_demandes_credit_id_fk" FOREIGN KEY ("demande_id") REFERENCES "public"."demandes_credit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_credit_plan_id_credit_plans_id_fk" FOREIGN KEY ("credit_plan_id") REFERENCES "public"."credit_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_enquete_id_enquetes_credit_id_fk" FOREIGN KEY ("enquete_id") REFERENCES "public"."enquetes_credit"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_remboursement_compte_id_comptes_id_fk" FOREIGN KEY ("remboursement_compte_id") REFERENCES "public"."comptes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_target_caisse_id_caisses_id_fk" FOREIGN KEY ("target_caisse_id") REFERENCES "public"."caisses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_disbursed_by_users_id_fk" FOREIGN KEY ("disbursed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decaissements_programmes" ADD CONSTRAINT "decaissements_programmes_credit_id_credits_id_fk" FOREIGN KEY ("credit_id") REFERENCES "public"."credits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decaissements_programmes" ADD CONSTRAINT "decaissements_programmes_mouvement_id_mouvements_financiers_id_fk" FOREIGN KEY ("mouvement_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demandes_credit" ADD CONSTRAINT "demandes_credit_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demandes_credit" ADD CONSTRAINT "demandes_credit_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demandes_credit" ADD CONSTRAINT "demandes_credit_credit_plan_id_credit_plans_id_fk" FOREIGN KEY ("credit_plan_id") REFERENCES "public"."credit_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "denomination_templates" ADD CONSTRAINT "denomination_templates_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "denomination_templates" ADD CONSTRAINT "denomination_templates_caisse_id_caisses_id_fk" FOREIGN KEY ("caisse_id") REFERENCES "public"."caisses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "denomination_templates" ADD CONSTRAINT "denomination_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "durees_suggerees" ADD CONSTRAINT "durees_suggerees_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "echeances_credits" ADD CONSTRAINT "echeances_credits_credit_id_credits_id_fk" FOREIGN KEY ("credit_id") REFERENCES "public"."credits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquetes_complementaires" ADD CONSTRAINT "enquetes_complementaires_reevaluation_id_reevaluations_credit_id_fk" FOREIGN KEY ("reevaluation_id") REFERENCES "public"."reevaluations_credit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquetes_complementaires" ADD CONSTRAINT "enquetes_complementaires_demande_id_demandes_credit_id_fk" FOREIGN KEY ("demande_id") REFERENCES "public"."demandes_credit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquetes_complementaires" ADD CONSTRAINT "enquetes_complementaires_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquetes_complementaires" ADD CONSTRAINT "enquetes_complementaires_enquete_initiale_id_enquetes_credit_id_fk" FOREIGN KEY ("enquete_initiale_id") REFERENCES "public"."enquetes_credit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquetes_complementaires" ADD CONSTRAINT "enquetes_complementaires_enqueteur_id_users_id_fk" FOREIGN KEY ("enqueteur_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquetes_credit" ADD CONSTRAINT "enquetes_credit_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquetes_credit" ADD CONSTRAINT "enquetes_credit_demande_id_demandes_credit_id_fk" FOREIGN KEY ("demande_id") REFERENCES "public"."demandes_credit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquetes_credit" ADD CONSTRAINT "enquetes_credit_credit_plan_id_credit_plans_id_fk" FOREIGN KEY ("credit_plan_id") REFERENCES "public"."credit_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquetes_credit" ADD CONSTRAINT "enquetes_credit_assigned_agent_id_users_id_fk" FOREIGN KEY ("assigned_agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquetes_credit" ADD CONSTRAINT "enquetes_credit_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquetes_credit" ADD CONSTRAINT "enquetes_credit_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mouvements_financiers" ADD CONSTRAINT "mouvements_financiers_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mouvements_financiers" ADD CONSTRAINT "mouvements_financiers_session_caisse_id_sessions_caisse_id_fk" FOREIGN KEY ("session_caisse_id") REFERENCES "public"."sessions_caisse"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mouvements_financiers" ADD CONSTRAINT "mouvements_financiers_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mouvements_financiers" ADD CONSTRAINT "mouvements_financiers_compte_id_comptes_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."comptes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mouvements_financiers" ADD CONSTRAINT "mouvements_financiers_credit_id_credits_id_fk" FOREIGN KEY ("credit_id") REFERENCES "public"."credits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mouvements_financiers" ADD CONSTRAINT "mouvements_financiers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectifs_epargne" ADD CONSTRAINT "objectifs_epargne_compte_id_comptes_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."comptes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_caisse" ADD CONSTRAINT "operations_caisse_session_id_sessions_caisse_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions_caisse"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_caisse" ADD CONSTRAINT "operations_caisse_mouvement_id_mouvements_financiers_id_fk" FOREIGN KEY ("mouvement_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_caisse" ADD CONSTRAINT "operations_caisse_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_caisse" ADD CONSTRAINT "operations_caisse_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_caisse" ADD CONSTRAINT "operations_caisse_reversed_by_user_id_users_id_fk" FOREIGN KEY ("reversed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans_epargne" ADD CONSTRAINT "plans_epargne_credit_id_credits_id_fk" FOREIGN KEY ("credit_id") REFERENCES "public"."credits"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans_epargne" ADD CONSTRAINT "plans_epargne_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans_epargne" ADD CONSTRAINT "plans_epargne_compte_id_comptes_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."comptes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans_epargne" ADD CONSTRAINT "plans_epargne_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reevaluation_audit_logs" ADD CONSTRAINT "reevaluation_audit_logs_reevaluation_id_reevaluations_credit_id_fk" FOREIGN KEY ("reevaluation_id") REFERENCES "public"."reevaluations_credit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reevaluation_audit_logs" ADD CONSTRAINT "reevaluation_audit_logs_demande_id_demandes_credit_id_fk" FOREIGN KEY ("demande_id") REFERENCES "public"."demandes_credit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reevaluation_audit_logs" ADD CONSTRAINT "reevaluation_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reevaluations_credit" ADD CONSTRAINT "reevaluations_credit_demande_id_demandes_credit_id_fk" FOREIGN KEY ("demande_id") REFERENCES "public"."demandes_credit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reevaluations_credit" ADD CONSTRAINT "reevaluations_credit_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reevaluations_credit" ADD CONSTRAINT "reevaluations_credit_co_emprunteur_id_clients_id_fk" FOREIGN KEY ("co_emprunteur_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reevaluations_credit" ADD CONSTRAINT "reevaluations_credit_valide_par_users_id_fk" FOREIGN KEY ("valide_par") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reevaluations_credit" ADD CONSTRAINT "reevaluations_credit_decide_par_users_id_fk" FOREIGN KEY ("decide_par") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reevaluations_credit" ADD CONSTRAINT "reevaluations_credit_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remboursements" ADD CONSTRAINT "remboursements_credit_id_credits_id_fk" FOREIGN KEY ("credit_id") REFERENCES "public"."credits"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remboursements" ADD CONSTRAINT "remboursements_mouvement_id_mouvements_financiers_id_fk" FOREIGN KEY ("mouvement_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remboursements" ADD CONSTRAINT "remboursements_facture_id_factures_id_fk" FOREIGN KEY ("facture_id") REFERENCES "public"."factures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remboursements" ADD CONSTRAINT "remboursements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remboursements" ADD CONSTRAINT "remboursements_reversed_by_users_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_caisse_transfers" ADD CONSTRAINT "scheduled_caisse_transfers_agence_source_id_agences_id_fk" FOREIGN KEY ("agence_source_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_caisse_transfers" ADD CONSTRAINT "scheduled_caisse_transfers_agence_dest_id_agences_id_fk" FOREIGN KEY ("agence_dest_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_caisse_transfers" ADD CONSTRAINT "scheduled_caisse_transfers_transfert_id_caisse_transferts_id_fk" FOREIGN KEY ("transfert_id") REFERENCES "public"."caisse_transferts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_caisse_transfers" ADD CONSTRAINT "scheduled_caisse_transfers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_transfer_runs" ADD CONSTRAINT "scheduled_transfer_runs_scheduled_transfer_id_virements_programmes_id_fk" FOREIGN KEY ("scheduled_transfer_id") REFERENCES "public"."virements_programmes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_transfer_runs" ADD CONSTRAINT "scheduled_transfer_runs_mouvement_id_mouvements_financiers_id_fk" FOREIGN KEY ("mouvement_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_history" ADD CONSTRAINT "scoring_history_demande_id_demandes_credit_id_fk" FOREIGN KEY ("demande_id") REFERENCES "public"."demandes_credit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_history" ADD CONSTRAINT "scoring_history_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_history" ADD CONSTRAINT "scoring_history_reevaluation_id_reevaluations_credit_id_fk" FOREIGN KEY ("reevaluation_id") REFERENCES "public"."reevaluations_credit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_history" ADD CONSTRAINT "scoring_history_enquete_id_enquetes_credit_id_fk" FOREIGN KEY ("enquete_id") REFERENCES "public"."enquetes_credit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_history" ADD CONSTRAINT "scoring_history_enquete_complementaire_id_enquetes_complementaires_id_fk" FOREIGN KEY ("enquete_complementaire_id") REFERENCES "public"."enquetes_complementaires"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_history" ADD CONSTRAINT "scoring_history_calcule_par_users_id_fk" FOREIGN KEY ("calcule_par") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_caisse" ADD CONSTRAINT "sessions_caisse_caissier_id_users_id_fk" FOREIGN KEY ("caissier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_caisse" ADD CONSTRAINT "sessions_caisse_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_caisse" ADD CONSTRAINT "sessions_caisse_caisse_id_caisses_id_fk" FOREIGN KEY ("caisse_id") REFERENCES "public"."caisses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_caisse" ADD CONSTRAINT "sessions_caisse_force_closed_by_users_id_fk" FOREIGN KEY ("force_closed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_caisse" ADD CONSTRAINT "sessions_caisse_transfer_to_coffre_id_coffres_forts_id_fk" FOREIGN KEY ("transfer_to_coffre_id") REFERENCES "public"."coffres_forts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_caisse" ADD CONSTRAINT "sessions_caisse_coffre_validated_by_users_id_fk" FOREIGN KEY ("coffre_validated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_caisse" ADD CONSTRAINT "sessions_caisse_original_caissier_id_users_id_fk" FOREIGN KEY ("original_caissier_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_caisse" ADD CONSTRAINT "sessions_caisse_opening_discrepancy_approved_by_users_id_fk" FOREIGN KEY ("opening_discrepancy_approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_caisse_audit_logs" ADD CONSTRAINT "sessions_caisse_audit_logs_session_id_sessions_caisse_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions_caisse"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_caisse_audit_logs" ADD CONSTRAINT "sessions_caisse_audit_logs_caisse_id_caisses_id_fk" FOREIGN KEY ("caisse_id") REFERENCES "public"."caisses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_caisse_audit_logs" ADD CONSTRAINT "sessions_caisse_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions_compte" ADD CONSTRAINT "transactions_compte_compte_id_comptes_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."comptes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions_compte" ADD CONSTRAINT "transactions_compte_mouvement_id_mouvements_financiers_id_fk" FOREIGN KEY ("mouvement_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions_compte" ADD CONSTRAINT "transactions_compte_facture_id_factures_id_fk" FOREIGN KEY ("facture_id") REFERENCES "public"."factures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions_compte" ADD CONSTRAINT "transactions_compte_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions_compte" ADD CONSTRAINT "transactions_compte_reversed_by_user_id_users_id_fk" FOREIGN KEY ("reversed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versements_automatiques" ADD CONSTRAINT "versements_automatiques_compte_source_id_comptes_id_fk" FOREIGN KEY ("compte_source_id") REFERENCES "public"."comptes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versements_automatiques" ADD CONSTRAINT "versements_automatiques_compte_dest_id_comptes_id_fk" FOREIGN KEY ("compte_dest_id") REFERENCES "public"."comptes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versements_automatiques" ADD CONSTRAINT "versements_automatiques_mouvement_id_mouvements_financiers_id_fk" FOREIGN KEY ("mouvement_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virements_programmes" ADD CONSTRAINT "virements_programmes_compte_source_id_comptes_id_fk" FOREIGN KEY ("compte_source_id") REFERENCES "public"."comptes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virements_programmes" ADD CONSTRAINT "virements_programmes_compte_dest_id_comptes_id_fk" FOREIGN KEY ("compte_dest_id") REFERENCES "public"."comptes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virements_programmes" ADD CONSTRAINT "virements_programmes_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virements_programmes" ADD CONSTRAINT "virements_programmes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virements_programmes_audit_logs" ADD CONSTRAINT "virements_programmes_audit_logs_virement_id_virements_programmes_id_fk" FOREIGN KEY ("virement_id") REFERENCES "public"."virements_programmes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virements_programmes_audit_logs" ADD CONSTRAINT "virements_programmes_audit_logs_run_id_scheduled_transfer_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."scheduled_transfer_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virements_programmes_audit_logs" ADD CONSTRAINT "virements_programmes_audit_logs_mouvement_id_mouvements_financiers_id_fk" FOREIGN KEY ("mouvement_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regions" ADD CONSTRAINT "regions_pays_id_pays_id_fk" FOREIGN KEY ("pays_id") REFERENCES "public"."pays"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avances_salaire" ADD CONSTRAINT "avances_salaire_employe_id_employes_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avances_salaire" ADD CONSTRAINT "avances_salaire_approuve_par_users_id_fk" FOREIGN KEY ("approuve_par") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avantages_employes" ADD CONSTRAINT "avantages_employes_employe_id_employes_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avantages_employes" ADD CONSTRAINT "avantages_employes_avantage_id_avantages_id_fk" FOREIGN KEY ("avantage_id") REFERENCES "public"."avantages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_reconciliation_lines" ADD CONSTRAINT "bank_reconciliation_lines_session_id_bank_reconciliation_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."bank_reconciliation_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_reconciliation_lines" ADD CONSTRAINT "bank_reconciliation_lines_batch_item_id_payroll_batch_items_id_fk" FOREIGN KEY ("batch_item_id") REFERENCES "public"."payroll_batch_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_reconciliation_sessions" ADD CONSTRAINT "bank_reconciliation_sessions_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_reconciliation_sessions" ADD CONSTRAINT "bank_reconciliation_sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulletins_paie" ADD CONSTRAINT "bulletins_paie_employe_id_employes_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidatures" ADD CONSTRAINT "candidatures_final_approved_by_users_id_fk" FOREIGN KEY ("final_approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demandes_conges" ADD CONSTRAINT "demandes_conges_employe_id_employes_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_agency_assignments" ADD CONSTRAINT "employee_agency_assignments_employe_id_employes_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_agency_assignments" ADD CONSTRAINT "employee_agency_assignments_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_agency_assignments" ADD CONSTRAINT "employee_agency_assignments_manager_id_employes_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."employes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_agency_assignments" ADD CONSTRAINT "employee_agency_assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employe_id_employes_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_verifie_par_users_id_fk" FOREIGN KEY ("verifie_par") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_ajoute_par_users_id_fk" FOREIGN KEY ("ajoute_par") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_campaigns" ADD CONSTRAINT "evaluation_campaigns_template_id_evaluation_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."evaluation_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_campaigns" ADD CONSTRAINT "evaluation_campaigns_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_campaigns" ADD CONSTRAINT "evaluation_campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_criteria" ADD CONSTRAINT "evaluation_criteria_template_id_evaluation_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."evaluation_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_responses" ADD CONSTRAINT "evaluation_responses_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_responses" ADD CONSTRAINT "evaluation_responses_criteria_id_evaluation_criteria_id_fk" FOREIGN KEY ("criteria_id") REFERENCES "public"."evaluation_criteria"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_templates" ADD CONSTRAINT "evaluation_templates_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_templates" ADD CONSTRAINT "evaluation_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_campaign_id_evaluation_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."evaluation_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_employe_id_employes_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_manager_id_employes_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."employes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feuilles_temps" ADD CONSTRAINT "feuilles_temps_employe_id_employes_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feuilles_temps" ADD CONSTRAINT "feuilles_temps_approuve_par_users_id_fk" FOREIGN KEY ("approuve_par") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formation_certificates" ADD CONSTRAINT "formation_certificates_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formation_certificates" ADD CONSTRAINT "formation_certificates_employe_id_employes_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formation_participants" ADD CONSTRAINT "formation_participants_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formation_participants" ADD CONSTRAINT "formation_participants_employe_id_employes_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formations" ADD CONSTRAINT "formations_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring_approval_config" ADD CONSTRAINT "hiring_approval_config_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring_approval_config" ADD CONSTRAINT "hiring_approval_config_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring_approvals" ADD CONSTRAINT "hiring_approvals_candidature_id_candidatures_id_fk" FOREIGN KEY ("candidature_id") REFERENCES "public"."candidatures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring_approvals" ADD CONSTRAINT "hiring_approvals_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horaires_travail" ADD CONSTRAINT "horaires_travail_employe_id_employes_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_alerts" ADD CONSTRAINT "hr_alerts_employe_id_employes_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_alerts" ADD CONSTRAINT "hr_alerts_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_alerts" ADD CONSTRAINT "hr_alerts_dismissed_by_users_id_fk" FOREIGN KEY ("dismissed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_alerts" ADD CONSTRAINT "hr_alerts_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_audit_log" ADD CONSTRAINT "hr_audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_audit_log" ADD CONSTRAINT "hr_audit_log_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_document_requests" ADD CONSTRAINT "hr_document_requests_employe_id_employes_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_document_requests" ADD CONSTRAINT "hr_document_requests_traite_par_users_id_fk" FOREIGN KEY ("traite_par") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_job_position_id_job_positions_id_fk" FOREIGN KEY ("job_position_id") REFERENCES "public"."job_positions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employe_id_employes_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_checklists" ADD CONSTRAINT "onboarding_checklists_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_checklists" ADD CONSTRAINT "onboarding_checklists_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_instances" ADD CONSTRAINT "onboarding_instances_candidature_id_candidatures_id_fk" FOREIGN KEY ("candidature_id") REFERENCES "public"."candidatures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_instances" ADD CONSTRAINT "onboarding_instances_employe_id_employes_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_instances" ADD CONSTRAINT "onboarding_instances_checklist_id_onboarding_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."onboarding_checklists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_instances" ADD CONSTRAINT "onboarding_instances_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_global_roles" ADD CONSTRAINT "org_global_roles_employe_id_employes_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_global_roles" ADD CONSTRAINT "org_global_roles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_log" ADD CONSTRAINT "overtime_log_employe_id_employes_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_log" ADD CONSTRAINT "overtime_log_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_batch_items" ADD CONSTRAINT "payroll_batch_items_batch_id_payroll_payment_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."payroll_payment_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_batch_items" ADD CONSTRAINT "payroll_batch_items_employe_id_employes_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_config" ADD CONSTRAINT "payroll_config_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_config" ADD CONSTRAINT "payroll_config_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_config_history" ADD CONSTRAINT "payroll_config_history_payroll_config_id_payroll_config_id_fk" FOREIGN KEY ("payroll_config_id") REFERENCES "public"."payroll_config"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_config_history" ADD CONSTRAINT "payroll_config_history_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_config_history" ADD CONSTRAINT "payroll_config_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_payment_batches" ADD CONSTRAINT "payroll_payment_batches_payroll_run_id_payroll_runs_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_payment_batches" ADD CONSTRAINT "payroll_payment_batches_transfer_file_id_payroll_transfer_files_id_fk" FOREIGN KEY ("transfer_file_id") REFERENCES "public"."payroll_transfer_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_payment_batches" ADD CONSTRAINT "payroll_payment_batches_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_payment_batches" ADD CONSTRAINT "payroll_payment_batches_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_run_issues" ADD CONSTRAINT "payroll_run_issues_employe_id_employes_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_run_issues" ADD CONSTRAINT "payroll_run_issues_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_paid_by_users_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_transfer_files" ADD CONSTRAINT "payroll_transfer_files_payroll_run_id_payroll_runs_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_transfer_files" ADD CONSTRAINT "payroll_transfer_files_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip_lines" ADD CONSTRAINT "payslip_lines_bulletin_id_bulletins_paie_id_fk" FOREIGN KEY ("bulletin_id") REFERENCES "public"."bulletins_paie"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presences" ADD CONSTRAINT "presences_employe_id_employes_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projet_membres" ADD CONSTRAINT "projet_membres_projet_id_projets_rh_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projets_rh"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projet_membres" ADD CONSTRAINT "projet_membres_employe_id_employes_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projets_rh" ADD CONSTRAINT "projets_rh_responsable_id_employes_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."employes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projets_rh" ADD CONSTRAINT "projets_rh_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projets_rh" ADD CONSTRAINT "projets_rh_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_coefficients" ADD CONSTRAINT "qualification_coefficients_convention_collective_id_conventions_collectives_id_fk" FOREIGN KEY ("convention_collective_id") REFERENCES "public"."conventions_collectives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_payment_jobs" ADD CONSTRAINT "salary_payment_jobs_bulletin_id_bulletins_paie_id_fk" FOREIGN KEY ("bulletin_id") REFERENCES "public"."bulletins_paie"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_payment_jobs" ADD CONSTRAINT "salary_payment_jobs_payroll_run_id_payroll_runs_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_payment_jobs" ADD CONSTRAINT "salary_payment_jobs_employe_id_employes_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_payment_jobs" ADD CONSTRAINT "salary_payment_jobs_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_payment_jobs" ADD CONSTRAINT "salary_payment_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_payment_jobs" ADD CONSTRAINT "salary_payment_jobs_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_rate_history" ADD CONSTRAINT "salary_rate_history_employe_id_employes_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_rate_history" ADD CONSTRAINT "salary_rate_history_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanction_escalation_rules" ADD CONSTRAINT "sanction_escalation_rules_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanction_escalation_rules" ADD CONSTRAINT "sanction_escalation_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_employe_id_employes_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_finalized_by_users_id_fk" FOREIGN KEY ("finalized_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temps_imputes" ADD CONSTRAINT "temps_imputes_feuille_temps_id_feuilles_temps_id_fk" FOREIGN KEY ("feuille_temps_id") REFERENCES "public"."feuilles_temps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temps_imputes" ADD CONSTRAINT "temps_imputes_projet_id_projets_rh_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projets_rh"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_code_usage_logs" ADD CONSTRAINT "access_code_usage_logs_used_by_users_id_fk" FOREIGN KEY ("used_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_penalty_structures" ADD CONSTRAINT "credit_penalty_structures_plan_id_credit_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."credit_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_plan_versions" ADD CONSTRAINT "credit_plan_versions_plan_id_credit_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."credit_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_plan_versions" ADD CONSTRAINT "credit_plan_versions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expo_push_tokens" ADD CONSTRAINT "expo_push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holiday_calendars" ADD CONSTRAINT "holiday_calendars_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holiday_dates" ADD CONSTRAINT "holiday_dates_calendar_id_holiday_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."holiday_calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holiday_exceptions" ADD CONSTRAINT "holiday_exceptions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_rolled_back_by_users_id_fk" FOREIGN KEY ("rolled_back_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_modules" ADD CONSTRAINT "maintenance_modules_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_audit_logs" ADD CONSTRAINT "permission_audit_logs_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_notification_logs" ADD CONSTRAINT "push_notification_logs_subscription_id_push_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."push_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regularization_rules" ADD CONSTRAINT "regularization_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_templates" ADD CONSTRAINT "role_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_blocking_rules" ADD CONSTRAINT "session_blocking_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings_history" ADD CONSTRAINT "settings_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_notifications" ADD CONSTRAINT "sms_notifications_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_alerts" ADD CONSTRAINT "system_alerts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_templates" ADD CONSTRAINT "transfer_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions_tontine" ADD CONSTRAINT "contributions_tontine_tontine_id_tontines_id_fk" FOREIGN KEY ("tontine_id") REFERENCES "public"."tontines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions_tontine" ADD CONSTRAINT "contributions_tontine_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions_tontine" ADD CONSTRAINT "contributions_tontine_membre_id_membres_tontine_id_fk" FOREIGN KEY ("membre_id") REFERENCES "public"."membres_tontine"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions_tontine" ADD CONSTRAINT "contributions_tontine_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions_tontine" ADD CONSTRAINT "contributions_tontine_mouvement_id_mouvements_financiers_id_fk" FOREIGN KEY ("mouvement_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions_tontine" ADD CONSTRAINT "contributions_tontine_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions_tontine" ADD CONSTRAINT "contributions_tontine_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions_tontine" ADD CONSTRAINT "contributions_tontine_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membres_tontine" ADD CONSTRAINT "membres_tontine_tontine_id_tontines_id_fk" FOREIGN KEY ("tontine_id") REFERENCES "public"."tontines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membres_tontine" ADD CONSTRAINT "membres_tontine_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membres_tontine" ADD CONSTRAINT "membres_tontine_cotisation_compte_id_comptes_id_fk" FOREIGN KEY ("cotisation_compte_id") REFERENCES "public"."comptes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_cycles" ADD CONSTRAINT "tontine_cycles_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_cycles" ADD CONSTRAINT "tontine_cycles_tontine_id_tontines_id_fk" FOREIGN KEY ("tontine_id") REFERENCES "public"."tontines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_cycles" ADD CONSTRAINT "tontine_cycles_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_distribution_requests" ADD CONSTRAINT "tontine_distribution_requests_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_distribution_requests" ADD CONSTRAINT "tontine_distribution_requests_tontine_id_tontines_id_fk" FOREIGN KEY ("tontine_id") REFERENCES "public"."tontines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_distribution_requests" ADD CONSTRAINT "tontine_distribution_requests_cycle_id_tontine_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."tontine_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_distribution_requests" ADD CONSTRAINT "tontine_distribution_requests_turn_id_tontine_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."tontine_turns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_distribution_requests" ADD CONSTRAINT "tontine_distribution_requests_beneficiary_member_id_membres_tontine_id_fk" FOREIGN KEY ("beneficiary_member_id") REFERENCES "public"."membres_tontine"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_distribution_requests" ADD CONSTRAINT "tontine_distribution_requests_target_wallet_account_id_comptes_id_fk" FOREIGN KEY ("target_wallet_account_id") REFERENCES "public"."comptes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_distribution_requests" ADD CONSTRAINT "tontine_distribution_requests_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_distribution_requests" ADD CONSTRAINT "tontine_distribution_requests_mouvement_id_mouvements_financiers_id_fk" FOREIGN KEY ("mouvement_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_distribution_requests" ADD CONSTRAINT "tontine_distribution_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_distribution_requests" ADD CONSTRAINT "tontine_distribution_requests_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_distribution_requests" ADD CONSTRAINT "tontine_distribution_requests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_penalites" ADD CONSTRAINT "tontine_penalites_tontine_id_tontines_id_fk" FOREIGN KEY ("tontine_id") REFERENCES "public"."tontines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_penalites" ADD CONSTRAINT "tontine_penalites_membre_id_membres_tontine_id_fk" FOREIGN KEY ("membre_id") REFERENCES "public"."membres_tontine"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_penalites" ADD CONSTRAINT "tontine_penalites_waived_by_users_id_fk" FOREIGN KEY ("waived_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_plans" ADD CONSTRAINT "tontine_plans_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_plans" ADD CONSTRAINT "tontine_plans_holiday_calendar_id_holiday_calendars_id_fk" FOREIGN KEY ("holiday_calendar_id") REFERENCES "public"."holiday_calendars"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_schedules" ADD CONSTRAINT "tontine_schedules_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_schedules" ADD CONSTRAINT "tontine_schedules_tontine_id_tontines_id_fk" FOREIGN KEY ("tontine_id") REFERENCES "public"."tontines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_schedules" ADD CONSTRAINT "tontine_schedules_cycle_id_tontine_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."tontine_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_turn_audit" ADD CONSTRAINT "tontine_turn_audit_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_turn_audit" ADD CONSTRAINT "tontine_turn_audit_tontine_id_tontines_id_fk" FOREIGN KEY ("tontine_id") REFERENCES "public"."tontines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_turn_audit" ADD CONSTRAINT "tontine_turn_audit_cycle_id_tontine_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."tontine_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_turn_audit" ADD CONSTRAINT "tontine_turn_audit_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_turns" ADD CONSTRAINT "tontine_turns_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_turns" ADD CONSTRAINT "tontine_turns_tontine_id_tontines_id_fk" FOREIGN KEY ("tontine_id") REFERENCES "public"."tontines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_turns" ADD CONSTRAINT "tontine_turns_cycle_id_tontine_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."tontine_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontine_turns" ADD CONSTRAINT "tontine_turns_beneficiary_member_id_membres_tontine_id_fk" FOREIGN KEY ("beneficiary_member_id") REFERENCES "public"."membres_tontine"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontines" ADD CONSTRAINT "tontines_gestionnaire_id_users_id_fk" FOREIGN KEY ("gestionnaire_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontines" ADD CONSTRAINT "tontines_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontines" ADD CONSTRAINT "tontines_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tontines" ADD CONSTRAINT "tontines_holiday_calendar_id_holiday_calendars_id_fk" FOREIGN KEY ("holiday_calendar_id") REFERENCES "public"."holiday_calendars"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_location_logs" ADD CONSTRAINT "agent_location_logs_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_mm_payments" ADD CONSTRAINT "agent_mm_payments_agent_id_agents_terrain_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents_terrain"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_mm_payments" ADD CONSTRAINT "agent_mm_payments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_mm_payments" ADD CONSTRAINT "agent_mm_payments_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_mm_payments" ADD CONSTRAINT "agent_mm_payments_credit_id_credits_id_fk" FOREIGN KEY ("credit_id") REFERENCES "public"."credits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_mm_payments" ADD CONSTRAINT "agent_mm_payments_compte_id_comptes_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."comptes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_mm_payments" ADD CONSTRAINT "agent_mm_payments_mouvement_client_id_mouvements_financiers_id_fk" FOREIGN KEY ("mouvement_client_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_mm_payments" ADD CONSTRAINT "agent_mm_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents_terrain" ADD CONSTRAINT "agents_terrain_employe_id_employes_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents_terrain" ADD CONSTRAINT "agents_terrain_current_agence_id_agences_id_fk" FOREIGN KEY ("current_agence_id") REFERENCES "public"."agences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents_terrain" ADD CONSTRAINT "agents_terrain_current_gl_account_id_plan_comptable_id_fk" FOREIGN KEY ("current_gl_account_id") REFERENCES "public"."plan_comptable"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrondissements" ADD CONSTRAINT "arrondissements_ville_id_villes_id_fk" FOREIGN KEY ("ville_id") REFERENCES "public"."villes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_assignations" ADD CONSTRAINT "caisse_assignations_caisse_id_caisses_id_fk" FOREIGN KEY ("caisse_id") REFERENCES "public"."caisses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_assignations" ADD CONSTRAINT "caisse_assignations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_assignations" ADD CONSTRAINT "caisse_assignations_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_code_usages" ADD CONSTRAINT "caisse_code_usages_code_id_caisse_security_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."caisse_security_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_code_usages" ADD CONSTRAINT "caisse_code_usages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_security_codes" ADD CONSTRAINT "caisse_security_codes_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_security_codes" ADD CONSTRAINT "caisse_security_codes_caisse_id_caisses_id_fk" FOREIGN KEY ("caisse_id") REFERENCES "public"."caisses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_security_codes" ADD CONSTRAINT "caisse_security_codes_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_security_codes" ADD CONSTRAINT "caisse_security_codes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_user_authorizations" ADD CONSTRAINT "caisse_user_authorizations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_user_authorizations" ADD CONSTRAINT "caisse_user_authorizations_caisse_id_caisses_id_fk" FOREIGN KEY ("caisse_id") REFERENCES "public"."caisses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_user_authorizations" ADD CONSTRAINT "caisse_user_authorizations_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_user_authorizations" ADD CONSTRAINT "caisse_user_authorizations_code_id_caisse_security_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."caisse_security_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_user_authorizations" ADD CONSTRAINT "caisse_user_authorizations_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comptage_billets" ADD CONSTRAINT "comptage_billets_session_id_sessions_caisse_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions_caisse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comptage_billets" ADD CONSTRAINT "comptage_billets_valide_par_users_id_fk" FOREIGN KEY ("valide_par") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comptage_billets" ADD CONSTRAINT "comptage_billets_compteur_id_users_id_fk" FOREIGN KEY ("compteur_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comptage_billets" ADD CONSTRAINT "comptage_billets_verificateur_id_users_id_fk" FOREIGN KEY ("verificateur_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departements" ADD CONSTRAINT "departements_pays_id_pays_id_fk" FOREIGN KEY ("pays_id") REFERENCES "public"."pays"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departements" ADD CONSTRAINT "departements_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dual_count_config" ADD CONSTRAINT "dual_count_config_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factures" ADD CONSTRAINT "factures_modele_id_modeles_factures_id_fk" FOREIGN KEY ("modele_id") REFERENCES "public"."modeles_factures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factures" ADD CONSTRAINT "factures_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factures" ADD CONSTRAINT "factures_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factures" ADD CONSTRAINT "factures_session_id_sessions_caisse_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions_caisse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factures" ADD CONSTRAINT "factures_operation_caisse_id_operations_caisse_id_fk" FOREIGN KEY ("operation_caisse_id") REFERENCES "public"."operations_caisse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_factures" ADD CONSTRAINT "lignes_factures_facture_id_factures_id_fk" FOREIGN KEY ("facture_id") REFERENCES "public"."factures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marches" ADD CONSTRAINT "marches_arrondissement_id_arrondissements_id_fk" FOREIGN KEY ("arrondissement_id") REFERENCES "public"."arrondissements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modeles_factures" ADD CONSTRAINT "modeles_factures_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectifs_mensuels" ADD CONSTRAINT "objectifs_mensuels_agent_id_agents_terrain_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents_terrain"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paiements_terrain" ADD CONSTRAINT "paiements_terrain_agent_id_agents_terrain_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents_terrain"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paiements_terrain" ADD CONSTRAINT "paiements_terrain_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paiements_terrain" ADD CONSTRAINT "paiements_terrain_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paiements_terrain" ADD CONSTRAINT "paiements_terrain_mouvement_id_mouvements_financiers_id_fk" FOREIGN KEY ("mouvement_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paiements_terrain" ADD CONSTRAINT "paiements_terrain_credit_id_credits_id_fk" FOREIGN KEY ("credit_id") REFERENCES "public"."credits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paiements_terrain" ADD CONSTRAINT "paiements_terrain_compte_id_comptes_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."comptes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paiements_terrain" ADD CONSTRAINT "paiements_terrain_remise_id_remises_terrain_id_fk" FOREIGN KEY ("remise_id") REFERENCES "public"."remises_terrain"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paiements_terrain" ADD CONSTRAINT "paiements_terrain_session_caisse_remise_id_sessions_caisse_id_fk" FOREIGN KEY ("session_caisse_remise_id") REFERENCES "public"."sessions_caisse"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paiements_terrain" ADD CONSTRAINT "paiements_terrain_settled_remise_id_remises_terrain_id_fk" FOREIGN KEY ("settled_remise_id") REFERENCES "public"."remises_terrain"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paiements_terrain" ADD CONSTRAINT "paiements_terrain_posted_mouvement_client_id_mouvements_financiers_id_fk" FOREIGN KEY ("posted_mouvement_client_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paiements_terrain" ADD CONSTRAINT "paiements_terrain_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_device_logs" ADD CONSTRAINT "pos_device_logs_device_id_pos_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."pos_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_device_logs" ADD CONSTRAINT "pos_device_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_devices" ADD CONSTRAINT "pos_devices_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_devices" ADD CONSTRAINT "pos_devices_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospection_prime_config" ADD CONSTRAINT "prospection_prime_config_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospection_prime_config" ADD CONSTRAINT "prospection_prime_config_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospection_primes" ADD CONSTRAINT "prospection_primes_agent_id_agents_terrain_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents_terrain"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospection_primes" ADD CONSTRAINT "prospection_primes_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospection_primes" ADD CONSTRAINT "prospection_primes_prospection_id_prospections_id_fk" FOREIGN KEY ("prospection_id") REFERENCES "public"."prospections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospection_primes" ADD CONSTRAINT "prospection_primes_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospection_primes" ADD CONSTRAINT "prospection_primes_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospection_primes" ADD CONSTRAINT "prospection_primes_mouvement_id_mouvements_financiers_id_fk" FOREIGN KEY ("mouvement_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospections" ADD CONSTRAINT "prospections_agent_id_agents_terrain_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents_terrain"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospections" ADD CONSTRAINT "prospections_arrondissement_id_arrondissements_id_fk" FOREIGN KEY ("arrondissement_id") REFERENCES "public"."arrondissements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospections" ADD CONSTRAINT "prospections_marche_id_marches_id_fk" FOREIGN KEY ("marche_id") REFERENCES "public"."marches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remise_audit_logs" ADD CONSTRAINT "remise_audit_logs_remise_id_remises_terrain_id_fk" FOREIGN KEY ("remise_id") REFERENCES "public"."remises_terrain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remise_audit_logs" ADD CONSTRAINT "remise_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remise_items" ADD CONSTRAINT "remise_items_remise_id_remises_terrain_id_fk" FOREIGN KEY ("remise_id") REFERENCES "public"."remises_terrain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remise_items" ADD CONSTRAINT "remise_items_paiement_terrain_id_paiements_terrain_id_fk" FOREIGN KEY ("paiement_terrain_id") REFERENCES "public"."paiements_terrain"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remise_items" ADD CONSTRAINT "remise_items_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remise_items" ADD CONSTRAINT "remise_items_mouvement_client_id_mouvements_financiers_id_fk" FOREIGN KEY ("mouvement_client_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remises_terrain" ADD CONSTRAINT "remises_terrain_agent_id_agents_terrain_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents_terrain"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remises_terrain" ADD CONSTRAINT "remises_terrain_session_caisse_id_sessions_caisse_id_fk" FOREIGN KEY ("session_caisse_id") REFERENCES "public"."sessions_caisse"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remises_terrain" ADD CONSTRAINT "remises_terrain_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remises_terrain" ADD CONSTRAINT "remises_terrain_caisse_destination_id_caisses_id_fk" FOREIGN KEY ("caisse_destination_id") REFERENCES "public"."caisses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remises_terrain" ADD CONSTRAINT "remises_terrain_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remises_terrain" ADD CONSTRAINT "remises_terrain_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remises_terrain" ADD CONSTRAINT "remises_terrain_mouvement_caisse_id_mouvements_financiers_id_fk" FOREIGN KEY ("mouvement_caisse_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remises_terrain" ADD CONSTRAINT "remises_terrain_mouvement_coffre_id_mouvements_financiers_id_fk" FOREIGN KEY ("mouvement_coffre_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_sessions" ADD CONSTRAINT "tracking_sessions_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_sessions" ADD CONSTRAINT "tracking_sessions_agency_id_agences_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "villes" ADD CONSTRAINT "villes_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "villes" ADD CONSTRAINT "villes_pays_id_pays_id_fk" FOREIGN KEY ("pays_id") REFERENCES "public"."pays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "transferts" ADD CONSTRAINT "transferts_mouvement_id_mouvements_financiers_id_fk" FOREIGN KEY ("mouvement_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts" ADD CONSTRAINT "transferts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferts" ADD CONSTRAINT "transferts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_credit_balances" ADD CONSTRAINT "client_credit_balances_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_credit_balances" ADD CONSTRAINT "client_credit_balances_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remboursement_allocation_audit" ADD CONSTRAINT "remboursement_allocation_audit_remboursement_id_remboursements_id_fk" FOREIGN KEY ("remboursement_id") REFERENCES "public"."remboursements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remboursement_allocation_audit" ADD CONSTRAINT "remboursement_allocation_audit_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remboursement_echeances" ADD CONSTRAINT "remboursement_echeances_remboursement_id_remboursements_id_fk" FOREIGN KEY ("remboursement_id") REFERENCES "public"."remboursements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remboursement_echeances" ADD CONSTRAINT "remboursement_echeances_echeance_id_echeances_credits_id_fk" FOREIGN KEY ("echeance_id") REFERENCES "public"."echeances_credits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remboursement_echeances" ADD CONSTRAINT "remboursement_echeances_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remboursement_echeances" ADD CONSTRAINT "remboursement_echeances_reversed_by_users_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_payment_allocations" ADD CONSTRAINT "loan_payment_allocations_remboursement_id_remboursements_id_fk" FOREIGN KEY ("remboursement_id") REFERENCES "public"."remboursements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_payment_allocations" ADD CONSTRAINT "loan_payment_allocations_credit_id_credits_id_fk" FOREIGN KEY ("credit_id") REFERENCES "public"."credits"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_payment_allocations" ADD CONSTRAINT "loan_payment_allocations_mouvement_id_mouvements_financiers_id_fk" FOREIGN KEY ("mouvement_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_payment_allocations" ADD CONSTRAINT "loan_payment_allocations_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mm_reconciliation_reports" ADD CONSTRAINT "mm_reconciliation_reports_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mm_reconciliation_reports" ADD CONSTRAINT "mm_reconciliation_reports_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mm_reconciliation_reports" ADD CONSTRAINT "mm_reconciliation_reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_compte_id_comptes_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."comptes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_credit_id_credits_id_fk" FOREIGN KEY ("credit_id") REFERENCES "public"."credits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_mouvement_id_mouvements_financiers_id_fk" FOREIGN KEY ("mouvement_id") REFERENCES "public"."mouvements_financiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_operation_caisse_id_operations_caisse_id_fk" FOREIGN KEY ("operation_caisse_id") REFERENCES "public"."operations_caisse"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_events" ADD CONSTRAINT "provider_events_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_delivery_receipts" ADD CONSTRAINT "notification_delivery_receipts_notification_job_id_notification_jobs_id_fk" FOREIGN KEY ("notification_job_id") REFERENCES "public"."notification_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_jobs" ADD CONSTRAINT "notification_jobs_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_jobs" ADD CONSTRAINT "notification_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_schedules" ADD CONSTRAINT "notification_schedules_notification_job_id_notification_jobs_id_fk" FOREIGN KEY ("notification_job_id") REFERENCES "public"."notification_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_schedules" ADD CONSTRAINT "notification_schedules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_schedules" ADD CONSTRAINT "notification_schedules_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_snapshots" ADD CONSTRAINT "kpi_snapshots_agency_id_agences_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_snapshots" ADD CONSTRAINT "kpi_snapshots_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_score_events" ADD CONSTRAINT "client_score_events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_score_events" ADD CONSTRAINT "client_score_events_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_score_events" ADD CONSTRAINT "client_score_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_score_state" ADD CONSTRAINT "client_score_state_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_score_state" ADD CONSTRAINT "client_score_state_agence_id_agences_id_fk" FOREIGN KEY ("agence_id") REFERENCES "public"."agences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_amortissement_immo_periode" ON "amortissements" USING btree ("immobilisation_id","periode_date");--> statement-breakpoint
CREATE INDEX "idx_amortissements_agence_periode" ON "amortissements" USING btree ("agence_id","periode_date");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_dsf_agence_annee" ON "declarations_dsf" USING btree ("agence_id","annee");--> statement-breakpoint
CREATE INDEX "idx_engagements_hb_agence" ON "engagements_hors_bilan" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_engagements_hb_credit" ON "engagements_hors_bilan" USING btree ("credit_id");--> statement-breakpoint
CREATE INDEX "idx_engagements_hb_sous_classe" ON "engagements_hors_bilan" USING btree ("sous_classe");--> statement-breakpoint
CREATE INDEX "idx_engagements_hb_statut" ON "engagements_hors_bilan" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_cloture_exercice_step" ON "exercice_cloture_steps" USING btree ("exercice_id","step");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_gl_posting_links_source" ON "gl_posting_links" USING btree ("agence_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "idx_gl_posting_links_mouvement" ON "gl_posting_links" USING btree ("mouvement_id");--> statement-breakpoint
CREATE INDEX "idx_gl_posting_links_status" ON "gl_posting_links" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_gl_sequences" ON "gl_sequences" USING btree ("agence_id","journal_code","year");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_immobilisation_code" ON "immobilisations" USING btree ("agence_id","code");--> statement-breakpoint
CREATE INDEX "idx_immobilisations_categorie" ON "immobilisations" USING btree ("categorie");--> statement-breakpoint
CREATE INDEX "idx_immobilisations_statut" ON "immobilisations" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_lignes_ecritures_lettrage" ON "lignes_ecritures" USING btree ("lettrage_key","numero_compte");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_provision_credit_periode" ON "provisions_credits" USING btree ("credit_id","periode_date");--> statement-breakpoint
CREATE INDEX "idx_provisions_agence_periode" ON "provisions_credits" USING btree ("agence_id","periode_date");--> statement-breakpoint
CREATE INDEX "idx_rapprochement_lignes_session" ON "rapprochement_lignes" USING btree ("rapprochement_id");--> statement-breakpoint
CREATE INDEX "idx_rapprochement_lignes_match" ON "rapprochement_lignes" USING btree ("match_status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_rapprochement_agence_period" ON "rapprochements_bancaires" USING btree ("agence_id","compte_gl","period");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ratios_prudentiels_periode" ON "ratios_prudentiels" USING btree ("agence_id","periode_date");--> statement-breakpoint
CREATE INDEX "idx_ratios_prudentiels_date" ON "ratios_prudentiels" USING btree ("periode_date");--> statement-breakpoint
CREATE INDEX "idx_agency_status_history_agence" ON "agency_status_history" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_agency_status_history_date" ON "agency_status_history" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_agences_primary" ON "user_agences" USING btree ("user_id") WHERE "user_agences"."is_primary" IS TRUE;--> statement-breakpoint
CREATE INDEX "idx_agency_migration_status" ON "agency_migrations" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_agency_migration_source" ON "agency_migrations" USING btree ("source_agency_id");--> statement-breakpoint
CREATE INDEX "idx_agency_migration_scheduled" ON "agency_migrations" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_agency_migration_created" ON "agency_migrations" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agency_migration_reference" ON "agency_migrations" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "idx_migration_audit_migration" ON "migration_audit_logs" USING btree ("migration_id");--> statement-breakpoint
CREATE INDEX "idx_migration_audit_action" ON "migration_audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_migration_audit_timestamp" ON "migration_audit_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_entity_log_migration" ON "migration_entity_logs" USING btree ("migration_id");--> statement-breakpoint
CREATE INDEX "idx_entity_log_type" ON "migration_entity_logs" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "idx_entity_log_entity" ON "migration_entity_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_pre_flight_migration" ON "migration_pre_flight_checks" USING btree ("migration_id");--> statement-breakpoint
CREATE INDEX "idx_pre_flight_type" ON "migration_pre_flight_checks" USING btree ("check_type");--> statement-breakpoint
CREATE INDEX "idx_agent_commissions_agent" ON "agent_commissions" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_agent_commissions_periode" ON "agent_commissions" USING btree ("periode");--> statement-breakpoint
CREATE INDEX "idx_agent_commissions_agence" ON "agent_commissions" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_agent_communications_dest" ON "agent_communications" USING btree ("destinataire_id");--> statement-breakpoint
CREATE INDEX "idx_agent_communications_exp" ON "agent_communications" USING btree ("expediteur_id");--> statement-breakpoint
CREATE INDEX "idx_agent_communications_agence" ON "agent_communications" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_agent_incidents_agent" ON "agent_incidents" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_agent_incidents_statut" ON "agent_incidents" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_agent_incidents_agence" ON "agent_incidents" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_agent_materiel_agent" ON "agent_materiel" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_agent_materiel_etat" ON "agent_materiel" USING btree ("etat");--> statement-breakpoint
CREATE INDEX "idx_agent_materiel_agence" ON "agent_materiel" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_agent_objectifs_agent" ON "agent_objectifs" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_agent_objectifs_periode" ON "agent_objectifs" USING btree ("periode");--> statement-breakpoint
CREATE INDEX "idx_agent_objectifs_agence" ON "agent_objectifs" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_agent_plannings_agent" ON "agent_plannings" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_agent_plannings_date" ON "agent_plannings" USING btree ("date_planning");--> statement-breakpoint
CREATE INDEX "idx_agent_plannings_agence" ON "agent_plannings" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_agent_rapports_agent" ON "agent_rapports" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_agent_rapports_type" ON "agent_rapports" USING btree ("type_rapport");--> statement-breakpoint
CREATE INDEX "idx_agent_rapports_agence" ON "agent_rapports" USING btree ("agence_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_centres_couts_code" ON "centres_couts" USING btree ("agence_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cles_repartition_code" ON "cles_repartition" USING btree ("agence_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cle_centre" ON "cles_repartition_lignes" USING btree ("cle_id","centre_cout_id");--> statement-breakpoint
CREATE INDEX "idx_lignes_analytiques_ecriture" ON "lignes_analytiques" USING btree ("ecriture_id");--> statement-breakpoint
CREATE INDEX "idx_lignes_analytiques_centre" ON "lignes_analytiques" USING btree ("centre_cout_id");--> statement-breakpoint
CREATE INDEX "idx_lignes_analytiques_produit" ON "lignes_analytiques" USING btree ("ligne_produit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_lignes_produits_code" ON "lignes_produits" USING btree ("agence_id","code");--> statement-breakpoint
CREATE INDEX "idx_active_sessions_user_id" ON "active_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_active_sessions_user_active" ON "active_sessions" USING btree ("user_id","is_active");--> statement-breakpoint
CREATE INDEX "idx_active_sessions_expires_at" ON "active_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_login_attempts_username" ON "login_attempts" USING btree ("username");--> statement-breakpoint
CREATE INDEX "idx_login_attempts_username_created" ON "login_attempts" USING btree ("username","created_at");--> statement-breakpoint
CREATE INDEX "idx_login_attempts_ip_address" ON "login_attempts" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "idx_perm_requests_requester" ON "permission_requests" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "idx_perm_requests_status" ON "permission_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_pul_user" ON "permission_usage_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_pul_perm" ON "permission_usage_logs" USING btree ("permission_code");--> statement-breakpoint
CREATE INDEX "idx_pul_checked" ON "permission_usage_logs" USING btree ("checked_at");--> statement-breakpoint
CREATE INDEX "idx_pul_allowed" ON "permission_usage_logs" USING btree ("allowed");--> statement-breakpoint
CREATE INDEX "idx_pul_user_perm" ON "permission_usage_logs" USING btree ("user_id","permission_code");--> statement-breakpoint
CREATE INDEX "idx_rbac_audit_log_created_at" ON "rbac_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_rbac_audit_log_actor_user" ON "rbac_audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "idx_rbac_audit_log_target_user" ON "rbac_audit_log" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "idx_rbac_audit_log_action" ON "rbac_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_rbac_audit_log_actor_created" ON "rbac_audit_log" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens_user_id" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens_family_id" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens_user_revoked" ON "refresh_tokens" USING btree ("user_id","revoked");--> statement-breakpoint
CREATE INDEX "idx_role_hierarchy_parent" ON "role_hierarchy" USING btree ("parent_role");--> statement-breakpoint
CREATE INDEX "idx_user_roles_user_id" ON "user_roles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_roles_user_primary" ON "user_roles" USING btree ("user_id","is_primary");--> statement-breakpoint
CREATE INDEX "idx_user_roles_agence_id" ON "user_roles" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_users_statut" ON "users" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_users_type_compte" ON "users" USING btree ("type_compte");--> statement-breakpoint
CREATE INDEX "idx_users_deleted_at" ON "users" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_users_can_login" ON "users" USING btree ("can_login");--> statement-breakpoint
CREATE INDEX "idx_users_statut_type_compte" ON "users" USING btree ("statut","type_compte");--> statement-breakpoint
CREATE INDEX "idx_users_telephone" ON "users" USING btree ("telephone");--> statement-breakpoint
CREATE INDEX "idx_agent_agency_history_agent" ON "agent_agency_history" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_agent_agency_history_agence" ON "agent_agency_history" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_agent_agency_history_current" ON "agent_agency_history" USING btree ("agent_id") WHERE date_to IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agent_session_config_agence" ON "agent_session_config" USING btree ("agence_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_caisses_agent_agent_actif" ON "caisses_agent" USING btree ("agent_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "idx_caisses_agent_statut" ON "caisses_agent" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_caisses_agent_agent_id" ON "caisses_agent" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_operations_terrain_reference" ON "operations_terrain" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_operations_terrain_idempotency" ON "operations_terrain" USING btree ("idempotency_key") WHERE idempotency_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_operations_terrain_agent_statut" ON "operations_terrain" USING btree ("agent_id","statut");--> statement-breakpoint
CREATE INDEX "idx_operations_terrain_statut_date" ON "operations_terrain" USING btree ("statut","submitted_at");--> statement-breakpoint
CREATE INDEX "idx_operations_terrain_type_date" ON "operations_terrain" USING btree ("type","submitted_at");--> statement-breakpoint
CREATE INDEX "idx_operations_terrain_client_date" ON "operations_terrain" USING btree ("client_id","submitted_at");--> statement-breakpoint
CREATE INDEX "idx_operations_terrain_caisse_agent" ON "operations_terrain" USING btree ("caisse_agent_id");--> statement-breakpoint
CREATE INDEX "idx_operations_terrain_destination_caisse" ON "operations_terrain" USING btree ("destination_caisse_id");--> statement-breakpoint
CREATE INDEX "idx_operations_terrain_audit_operation_date" ON "operations_terrain_audit_logs" USING btree ("operation_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_operations_terrain_audit_action" ON "operations_terrain_audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_operations_terrain_audit_timestamp" ON "operations_terrain_audit_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_sessions_agent_active" ON "sessions_agent" USING btree ("agent_id") WHERE statut != 'CLOSED';--> statement-breakpoint
CREATE INDEX "idx_sessions_agent_agent_statut" ON "sessions_agent" USING btree ("agent_id","statut");--> statement-breakpoint
CREATE INDEX "idx_sessions_agent_agence" ON "sessions_agent" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_agent_statut" ON "sessions_agent" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_sessions_agent_created_at" ON "sessions_agent" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_sessions_agent_audit_session" ON "sessions_agent_audit_logs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_agent_audit_timestamp" ON "sessions_agent_audit_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_closure_audit_closure" ON "agency_closure_audit_log" USING btree ("closure_id");--> statement-breakpoint
CREATE INDEX "idx_closure_blockers_closure" ON "agency_closure_blockers" USING btree ("closure_id");--> statement-breakpoint
CREATE INDEX "idx_agency_closure_agence" ON "agency_daily_closure" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_agency_closure_date" ON "agency_daily_closure" USING btree ("date_cloture");--> statement-breakpoint
CREATE INDEX "idx_agency_closure_statut" ON "agency_daily_closure" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "uq_agency_closure_agence_date" ON "agency_daily_closure" USING btree ("agence_id","date_cloture");--> statement-breakpoint
CREATE INDEX "idx_ecarts_audit_request" ON "ecarts_approval_audit_log" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "idx_ecarts_approval_session" ON "ecarts_approval_requests" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_ecarts_approval_agence" ON "ecarts_approval_requests" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_ecarts_approval_statut" ON "ecarts_approval_requests" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_ecarts_approval_caissier" ON "ecarts_approval_requests" USING btree ("caissier_id");--> statement-breakpoint
CREATE INDEX "idx_mm_balance_recon_session" ON "mm_balance_reconciliations" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_mm_balance_recon_statut" ON "mm_balance_reconciliations" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_mm_balance_recon_provider" ON "mm_balance_reconciliations" USING btree ("provider");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_activity_types_code" ON "activity_types" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_activity_types_actif" ON "activity_types" USING btree ("actif");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_profession_activity_types" ON "profession_activity_types" USING btree ("profession_id","activity_type_id");--> statement-breakpoint
CREATE INDEX "idx_prof_activity_prof" ON "profession_activity_types" USING btree ("profession_id");--> statement-breakpoint
CREATE INDEX "idx_prof_activity_type" ON "profession_activity_types" USING btree ("activity_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_profession_sectors" ON "profession_sectors" USING btree ("profession_id","sector_id");--> statement-breakpoint
CREATE INDEX "idx_prof_sectors_prof" ON "profession_sectors" USING btree ("profession_id");--> statement-breakpoint
CREATE INDEX "idx_prof_sectors_sector" ON "profession_sectors" USING btree ("sector_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_professions_code" ON "professions" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_professions_actif" ON "professions" USING btree ("actif");--> statement-breakpoint
CREATE INDEX "idx_professions_nom" ON "professions" USING btree ("nom");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_sector_activity_types" ON "sector_activity_types" USING btree ("sector_id","activity_type_id");--> statement-breakpoint
CREATE INDEX "idx_sector_activity_sector" ON "sector_activity_types" USING btree ("sector_id");--> statement-breakpoint
CREATE INDEX "idx_sector_activity_type" ON "sector_activity_types" USING btree ("activity_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_sectors_code" ON "sectors" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_sectors_parent" ON "sectors" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_sectors_actif" ON "sectors" USING btree ("actif");--> statement-breakpoint
CREATE INDEX "idx_sectors_nom" ON "sectors" USING btree ("nom");--> statement-breakpoint
CREATE INDEX "idx_client_activities_client_id" ON "client_activities" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_client_activities_client_created" ON "client_activities" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_client_tags_client_id" ON "client_tags" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_client_tags_tag_id" ON "client_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "idx_clients_user_id" ON "clients" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_clients_agence_id" ON "clients" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_clients_agent_referent_id" ON "clients" USING btree ("agent_referent_id");--> statement-breakpoint
CREATE INDEX "idx_clients_deleted_at" ON "clients" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_clients_agence_segment" ON "clients" USING btree ("agence_id","segment");--> statement-breakpoint
CREATE INDEX "idx_clients_agence_created_at" ON "clients" USING btree ("agence_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_clients_client_origin" ON "clients" USING btree ("client_origin");--> statement-breakpoint
CREATE INDEX "idx_clients_prospect_id" ON "clients" USING btree ("prospect_id");--> statement-breakpoint
CREATE INDEX "idx_clients_risk_level" ON "clients" USING btree ("risk_level");--> statement-breakpoint
CREATE INDEX "idx_clients_kyc_status" ON "clients" USING btree ("kyc_status");--> statement-breakpoint
CREATE INDEX "idx_clients_type_client" ON "clients" USING btree ("type_client");--> statement-breakpoint
CREATE INDEX "idx_clients_is_blacklisted" ON "clients" USING btree ("is_blacklisted");--> statement-breakpoint
CREATE INDEX "idx_clients_is_pep" ON "clients" USING btree ("is_pep");--> statement-breakpoint
CREATE INDEX "idx_clients_agence_kyc" ON "clients" USING btree ("agence_id","kyc_status");--> statement-breakpoint
CREATE INDEX "idx_clients_agence_risk" ON "clients" USING btree ("agence_id","risk_level");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_config_coffre_agence" ON "config_coffre_fort" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_reconciliation_cc_transfert" ON "reconciliations_coffre_caisse" USING btree ("transfert_id");--> statement-breakpoint
CREATE INDEX "idx_reconciliation_cc_statut" ON "reconciliations_coffre_caisse" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_tache_reg_cc_transfert" ON "taches_regularisation_coffre_caisse" USING btree ("transfert_id");--> statement-breakpoint
CREATE INDEX "idx_tache_reg_cc_statut" ON "taches_regularisation_coffre_caisse" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_tache_reg_cc_priorite" ON "taches_regularisation_coffre_caisse" USING btree ("priorite");--> statement-breakpoint
CREATE INDEX "idx_coffre_audit_transfert_id" ON "transferts_coffre_audit_logs" USING btree ("transfert_id");--> statement-breakpoint
CREATE INDEX "idx_coffre_audit_action" ON "transferts_coffre_audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_coffre_audit_timestamp" ON "transferts_coffre_audit_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_transferts_coffre_reference" ON "transferts_coffre_caisse" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_transferts_coffre_idempotency" ON "transferts_coffre_caisse" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_transferts_coffre_agence_statut" ON "transferts_coffre_caisse" USING btree ("agence_id","statut");--> statement-breakpoint
CREATE INDEX "idx_transferts_coffre_agence_date" ON "transferts_coffre_caisse" USING btree ("agence_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_transferts_coffre_coffre" ON "transferts_coffre_caisse" USING btree ("coffre_id");--> statement-breakpoint
CREATE INDEX "idx_transferts_coffre_caisse" ON "transferts_coffre_caisse" USING btree ("caisse_id");--> statement-breakpoint
CREATE INDEX "idx_transferts_coffre_statut_date" ON "transferts_coffre_caisse" USING btree ("statut","created_at");--> statement-breakpoint
CREATE INDEX "idx_transferts_coffre_requested_by" ON "transferts_coffre_caisse" USING btree ("requested_by");--> statement-breakpoint
CREATE INDEX "idx_transferts_coffre_session_ouverture" ON "transferts_coffre_caisse" USING btree ("session_ouverture_id");--> statement-breakpoint
CREATE INDEX "idx_transferts_coffre_opening_fund" ON "transferts_coffre_caisse" USING btree ("is_opening_fund");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_coffre_snapshot_date_scope" ON "coffre_balance_snapshots" USING btree ("snapshot_date","scope_type","coffre_id","agency_id");--> statement-breakpoint
CREATE INDEX "idx_coffre_snapshot_date" ON "coffre_balance_snapshots" USING btree ("snapshot_date");--> statement-breakpoint
CREATE INDEX "idx_coffre_snapshot_agency" ON "coffre_balance_snapshots" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "idx_coffre_snapshot_scope" ON "coffre_balance_snapshots" USING btree ("scope_type");--> statement-breakpoint
CREATE INDEX "idx_coffre_fort_owner" ON "coffres_forts" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "idx_coffre_fort_statut" ON "coffres_forts" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_compte_liaison_entite" ON "comptes_liaison" USING btree ("entite_type","entite_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_document_transfert_numero" ON "documents_transfert" USING btree ("numero_document");--> statement-breakpoint
CREATE INDEX "idx_document_transfert_id" ON "documents_transfert" USING btree ("transfert_id");--> statement-breakpoint
CREATE INDEX "idx_document_transfert_type" ON "documents_transfert" USING btree ("type_document");--> statement-breakpoint
CREATE INDEX "idx_reconciliation_transfert" ON "reconciliations_liaison" USING btree ("transfert_id");--> statement-breakpoint
CREATE INDEX "idx_reconciliation_statut" ON "reconciliations_liaison" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_tache_regularisation_transfert" ON "taches_regularisation" USING btree ("transfert_id");--> statement-breakpoint
CREATE INDEX "idx_tache_regularisation_statut" ON "taches_regularisation" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_tache_regularisation_priorite" ON "taches_regularisation" USING btree ("priorite");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_transfert_inter_coffre_reference" ON "transferts_inter_coffres" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_transfert_inter_coffre_idempotency" ON "transferts_inter_coffres" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_transfert_inter_coffre_statut" ON "transferts_inter_coffres" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_transfert_inter_coffre_date" ON "transferts_inter_coffres" USING btree ("date_transfert");--> statement-breakpoint
CREATE INDEX "idx_transfert_inter_coffre_source" ON "transferts_inter_coffres" USING btree ("coffre_source_id");--> statement-breakpoint
CREATE INDEX "idx_transfert_inter_coffre_dest" ON "transferts_inter_coffres" USING btree ("coffre_destination_id");--> statement-breakpoint
CREATE INDEX "idx_transfert_inter_coffre_created_by" ON "transferts_inter_coffres" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_audit_transfert_inter_coffre_id" ON "transferts_inter_coffres_audit_logs" USING btree ("transfert_id");--> statement-breakpoint
CREATE INDEX "idx_audit_transfert_inter_coffre_timestamp" ON "transferts_inter_coffres_audit_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_participants_unique" ON "conversation_participants" USING btree ("conversation_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_participants_conversation" ON "conversation_participants" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_participants_user" ON "conversation_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_participants_user_active" ON "conversation_participants" USING btree ("user_id") WHERE left_at IS NULL;--> statement-breakpoint
CREATE INDEX "idx_conversations_updated_at" ON "conversations" USING btree ("updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_conversations_last_message_at" ON "conversations" USING btree ("last_message_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_conversations_agence_id" ON "conversations" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_created_by" ON "conversations" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_dm_key" ON "conversations" USING btree ("dm_key");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_reactions_unique" ON "message_reactions" USING btree ("message_id","user_id","emoji");--> statement-breakpoint
CREATE INDEX "idx_reactions_message" ON "message_reactions" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_reactions_user" ON "message_reactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_messages_v2_conversation_created" ON "messages_v2" USING btree ("conversation_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_messages_v2_sender_created" ON "messages_v2" USING btree ("sender_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_messages_v2_conversation_active" ON "messages_v2" USING btree ("conversation_id","created_at" DESC NULLS LAST) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "idx_messages_v2_reply_to" ON "messages_v2" USING btree ("reply_to_message_id");--> statement-breakpoint
CREATE INDEX "idx_device_keys_agent" ON "device_keys" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_device_keys_status" ON "device_keys" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_device_keys_fingerprint" ON "device_keys" USING btree ("device_fingerprint");--> statement-breakpoint
CREATE INDEX "idx_ods_agent_date" ON "offline_day_sessions" USING btree ("agent_id","date");--> statement-breakpoint
CREATE INDEX "idx_ods_status" ON "offline_day_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_ods_agence" ON "offline_day_sessions" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_oje_agent" ON "offline_journal_entries" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_oje_agence" ON "offline_journal_entries" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_oje_status" ON "offline_journal_entries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_oje_device_key" ON "offline_journal_entries" USING btree ("device_key_id");--> statement-breakpoint
CREATE INDEX "idx_oje_session_date" ON "offline_journal_entries" USING btree ("agent_id","offline_session_date");--> statement-breakpoint
CREATE INDEX "idx_oje_server_timestamp" ON "offline_journal_entries" USING btree ("server_timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_dossiers_credit_reference" ON "dossiers_credit" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_dossiers_credit_idempotency" ON "dossiers_credit" USING btree ("idempotency_key") WHERE idempotency_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_dossiers_credit_agent" ON "dossiers_credit" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_dossiers_credit_client" ON "dossiers_credit" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_dossiers_credit_prospection" ON "dossiers_credit" USING btree ("prospection_id");--> statement-breakpoint
CREATE INDEX "idx_dossiers_credit_statut" ON "dossiers_credit" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_dossiers_credit_agence" ON "dossiers_credit" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_dossiers_credit_date" ON "dossiers_credit" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_config_evacuation_coffre_agence" ON "config_evacuation_coffre" USING btree ("agence_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_evacuation_coffre_reference" ON "evacuations_coffre" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_evacuation_coffre_idempotency" ON "evacuations_coffre" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_evacuation_coffre_statut" ON "evacuations_coffre" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_evacuation_coffre_date" ON "evacuations_coffre" USING btree ("date_evacuation");--> statement-breakpoint
CREATE INDEX "idx_evacuation_coffre_source" ON "evacuations_coffre" USING btree ("coffre_source_id");--> statement-breakpoint
CREATE INDEX "idx_evacuation_coffre_agence" ON "evacuations_coffre" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_evacuation_coffre_created_by" ON "evacuations_coffre" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_evacuation_coffre_type_dest" ON "evacuations_coffre" USING btree ("type_destination");--> statement-breakpoint
CREATE INDEX "idx_evacuation_coffre_agence_statut" ON "evacuations_coffre" USING btree ("agence_id","statut");--> statement-breakpoint
CREATE INDEX "idx_evacuation_coffre_agence_date" ON "evacuations_coffre" USING btree ("agence_id","date_evacuation");--> statement-breakpoint
CREATE INDEX "idx_audit_evacuation_coffre_id" ON "evacuations_coffre_audit_logs" USING btree ("evacuation_id");--> statement-breakpoint
CREATE INDEX "idx_audit_evacuation_coffre_timestamp" ON "evacuations_coffre_audit_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_audit_evacuation_coffre_action" ON "evacuations_coffre_audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_closure_requests_compte_id" ON "account_closure_requests" USING btree ("compte_id");--> statement-breakpoint
CREATE INDEX "idx_closure_requests_status" ON "account_closure_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_closure_requests_initiated_by" ON "account_closure_requests" USING btree ("initiated_by");--> statement-breakpoint
CREATE INDEX "idx_opening_requests_compte_id" ON "account_opening_requests" USING btree ("compte_id");--> statement-breakpoint
CREATE INDEX "idx_opening_requests_status" ON "account_opening_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_opening_requests_initiated_by" ON "account_opening_requests" USING btree ("initiated_by");--> statement-breakpoint
CREATE INDEX "idx_caisse_requests_agence_statut" ON "caisse_payment_requests" USING btree ("agence_id","statut");--> statement-breakpoint
CREATE INDEX "idx_caisse_requests_source" ON "caisse_payment_requests" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_caisse_transferts_reference" ON "caisse_transferts" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_caisse_transferts_idempotency" ON "caisse_transferts" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_caisse_transferts_source_date" ON "caisse_transferts" USING btree ("session_source_id","date_creation");--> statement-breakpoint
CREATE INDEX "idx_caisse_transferts_dest_date" ON "caisse_transferts" USING btree ("session_dest_id","date_creation");--> statement-breakpoint
CREATE INDEX "idx_caisse_transferts_statut_date" ON "caisse_transferts" USING btree ("statut","date_creation");--> statement-breakpoint
CREATE INDEX "idx_cash_opening_discrepancies_session" ON "cash_opening_discrepancies" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_cash_opening_discrepancies_agence" ON "cash_opening_discrepancies" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_cash_opening_discrepancies_caisse" ON "cash_opening_discrepancies" USING btree ("caisse_id");--> statement-breakpoint
CREATE INDEX "idx_cash_opening_discrepancies_action" ON "cash_opening_discrepancies" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_cash_opening_discrepancies_created" ON "cash_opening_discrepancies" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_compte_agences_hist_compte" ON "compte_agences_historique" USING btree ("compte_id","date_debut");--> statement-breakpoint
CREATE INDEX "idx_compte_agences_hist_agence" ON "compte_agences_historique" USING btree ("agence_id","date_debut");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_comptes_numero_compte" ON "comptes" USING btree ("numero_compte");--> statement-breakpoint
CREATE INDEX "idx_comptes_client_id" ON "comptes" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_comptes_agence_type_statut" ON "comptes" USING btree ("agence_id","type_compte","statut");--> statement-breakpoint
CREATE INDEX "idx_comptes_type_statut" ON "comptes" USING btree ("type_compte","statut");--> statement-breakpoint
CREATE INDEX "idx_comptes_versement_auto" ON "comptes" USING btree ("versement_auto_actif","prochain_versement_auto");--> statement-breakpoint
CREATE INDEX "idx_comptes_statut" ON "comptes" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_comptes_deleted_at" ON "comptes" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_comptes_produit_id" ON "comptes" USING btree ("produit_id");--> statement-breakpoint
CREATE INDEX "idx_comptes_agence_id" ON "comptes" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_credit_plan_fees_plan" ON "credit_plan_fees" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "idx_credit_plans_active" ON "credit_plans" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_credit_plans_agence" ON "credit_plans" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_credit_plans_type" ON "credit_plans" USING btree ("type_credit");--> statement-breakpoint
CREATE INDEX "idx_refund_demande" ON "credit_refund_requests" USING btree ("demande_id");--> statement-breakpoint
CREATE INDEX "idx_refund_status" ON "credit_refund_requests" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_credits_client_id" ON "credits" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_credits_statut" ON "credits" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_credits_client_statut" ON "credits" USING btree ("client_id","statut");--> statement-breakpoint
CREATE INDEX "idx_credits_agence_id" ON "credits" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_credits_agence_statut" ON "credits" USING btree ("agence_id","statut");--> statement-breakpoint
CREATE INDEX "idx_credits_prochaine_echeance" ON "credits" USING btree ("prochaine_echeance");--> statement-breakpoint
CREATE INDEX "idx_credits_decaissement_programme" ON "credits" USING btree ("date_decaissement_programme","decaissement_automatique");--> statement-breakpoint
CREATE INDEX "idx_credits_remboursement_auto" ON "credits" USING btree ("remboursement_automatique");--> statement-breakpoint
CREATE INDEX "idx_credits_deleted_at" ON "credits" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_credits_disbursement_pending" ON "credits" USING btree ("disbursement_channel","disbursement_status");--> statement-breakpoint
CREATE INDEX "idx_decaissements_prog_credit" ON "decaissements_programmes" USING btree ("credit_id","date_execution");--> statement-breakpoint
CREATE INDEX "idx_decaissements_prog_statut" ON "decaissements_programmes" USING btree ("statut","date_planifiee");--> statement-breakpoint
CREATE INDEX "idx_demandes_credit_client_id" ON "demandes_credit" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_demandes_credit_statut" ON "demandes_credit" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_demandes_credit_created_at" ON "demandes_credit" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_durees_suggerees_triplet" ON "durees_suggerees" USING btree ("frequence","duree_valeur","duree_unite","type_credit","agence_id");--> statement-breakpoint
CREATE INDEX "idx_durees_suggerees_actif" ON "durees_suggerees" USING btree ("actif");--> statement-breakpoint
CREATE INDEX "idx_durees_suggerees_reco" ON "durees_suggerees" USING btree ("est_recommandee","ordre");--> statement-breakpoint
CREATE INDEX "idx_echeances_credits_credit_id" ON "echeances_credits" USING btree ("credit_id");--> statement-breakpoint
CREATE INDEX "idx_echeances_credits_date" ON "echeances_credits" USING btree ("date_echeance");--> statement-breakpoint
CREATE INDEX "idx_echeances_credits_statut" ON "echeances_credits" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_echeances_credits_fifo" ON "echeances_credits" USING btree ("credit_id","date_echeance","sequence");--> statement-breakpoint
CREATE INDEX "idx_echeances_credits_statut_date" ON "echeances_credits" USING btree ("statut","date_echeance") WHERE statut != 'PAID';--> statement-breakpoint
CREATE INDEX "idx_enquetes_comp_reevaluation_id" ON "enquetes_complementaires" USING btree ("reevaluation_id");--> statement-breakpoint
CREATE INDEX "idx_enquetes_comp_enqueteur_id" ON "enquetes_complementaires" USING btree ("enqueteur_id");--> statement-breakpoint
CREATE INDEX "idx_enquetes_comp_statut" ON "enquetes_complementaires" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_enquete_assigned_agent" ON "enquetes_credit" USING btree ("assigned_agent_id");--> statement-breakpoint
CREATE INDEX "idx_enquete_agent_statut" ON "enquetes_credit" USING btree ("assigned_agent_id","statut");--> statement-breakpoint
CREATE INDEX "idx_enquete_pending_assignment" ON "enquetes_credit" USING btree ("statut","assigned_agent_id");--> statement-breakpoint
CREATE INDEX "idx_enquete_reviewed_by" ON "enquetes_credit" USING btree ("reviewed_by");--> statement-breakpoint
CREATE INDEX "idx_enquete_deleted_at" ON "enquetes_credit" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_enquete_offline_sync" ON "enquetes_credit" USING btree ("offline_created","offline_synced_at");--> statement-breakpoint
CREATE INDEX "idx_outbox_non_publie" ON "evenements_outbox" USING btree ("published_at","created_at");--> statement-breakpoint
CREATE INDEX "idx_outbox_aggregate" ON "evenements_outbox" USING btree ("aggregate_type","aggregate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_interest_rates_code_valid_from" ON "interest_rates" USING btree ("code","valid_from");--> statement-breakpoint
CREATE INDEX "idx_interest_rates_code" ON "interest_rates" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_interest_rates_actif" ON "interest_rates" USING btree ("actif");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mouvements_reference" ON "mouvements_financiers" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mouvements_idempotency" ON "mouvements_financiers" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mouvements_reference_externe" ON "mouvements_financiers" USING btree ("reference_externe");--> statement-breakpoint
CREATE INDEX "idx_mouvements_compte_date" ON "mouvements_financiers" USING btree ("compte_id","date_operation");--> statement-breakpoint
CREATE INDEX "idx_mouvements_credit_date" ON "mouvements_financiers" USING btree ("credit_id","date_operation");--> statement-breakpoint
CREATE INDEX "idx_mouvements_session_date" ON "mouvements_financiers" USING btree ("session_caisse_id","date_operation");--> statement-breakpoint
CREATE INDEX "idx_mouvements_module_date" ON "mouvements_financiers" USING btree ("source_module","date_operation");--> statement-breakpoint
CREATE INDEX "idx_mouvements_agence_created" ON "mouvements_financiers" USING btree ("agence_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_mouvements_agence_module_ref" ON "mouvements_financiers" USING btree ("agence_id","source_module","reference");--> statement-breakpoint
CREATE INDEX "idx_mouvements_gl_status" ON "mouvements_financiers" USING btree ("gl_posting_status");--> statement-breakpoint
CREATE INDEX "idx_mouvements_reversal_of" ON "mouvements_financiers" USING btree ("reversal_of_id");--> statement-breakpoint
CREATE INDEX "idx_objectifs_epargne_compte" ON "objectifs_epargne" USING btree ("compte_id");--> statement-breakpoint
CREATE INDEX "idx_objectifs_epargne_actif" ON "objectifs_epargne" USING btree ("actif");--> statement-breakpoint
CREATE INDEX "idx_operations_caisse_session_date" ON "operations_caisse" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_operations_caisse_session_type" ON "operations_caisse" USING btree ("session_id","type_operation");--> statement-breakpoint
CREATE INDEX "idx_operations_caisse_mouvement" ON "operations_caisse" USING btree ("mouvement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_operations_caisse_reference" ON "operations_caisse" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_operations_caisse_idempotency" ON "operations_caisse" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_operations_caisse_reversal_of" ON "operations_caisse" USING btree ("reversal_of_id");--> statement-breakpoint
CREATE INDEX "idx_plans_epargne_client" ON "plans_epargne" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_plans_epargne_credit" ON "plans_epargne" USING btree ("credit_id");--> statement-breakpoint
CREATE INDEX "idx_plans_epargne_compte" ON "plans_epargne" USING btree ("compte_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_produits_compte_code" ON "produits_compte" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_produits_compte_type_actif" ON "produits_compte" USING btree ("type_compte","actif");--> statement-breakpoint
CREATE INDEX "idx_reeval_audit_reevaluation_id" ON "reevaluation_audit_logs" USING btree ("reevaluation_id");--> statement-breakpoint
CREATE INDEX "idx_reeval_audit_demande_id" ON "reevaluation_audit_logs" USING btree ("demande_id");--> statement-breakpoint
CREATE INDEX "idx_reeval_audit_action" ON "reevaluation_audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_reeval_audit_timestamp" ON "reevaluation_audit_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_reevaluations_demande_id" ON "reevaluations_credit" USING btree ("demande_id");--> statement-breakpoint
CREATE INDEX "idx_reevaluations_client_id" ON "reevaluations_credit" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_reevaluations_statut" ON "reevaluations_credit" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_reevaluations_created_at" ON "reevaluations_credit" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_reevaluation_demande_version" ON "reevaluations_credit" USING btree ("demande_id","numero_version");--> statement-breakpoint
CREATE INDEX "idx_remboursements_credit_id" ON "remboursements" USING btree ("credit_id");--> statement-breakpoint
CREATE INDEX "idx_remboursements_date" ON "remboursements" USING btree ("date_remboursement");--> statement-breakpoint
CREATE INDEX "idx_remboursements_mouvement" ON "remboursements" USING btree ("mouvement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_remboursements_idempotency" ON "remboursements" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_remboursements_reference_externe" ON "remboursements" USING btree ("reference_externe");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_scheduled_transfer_runs_execution_key" ON "scheduled_transfer_runs" USING btree ("execution_key");--> statement-breakpoint
CREATE INDEX "idx_scheduled_runs_schedule_status" ON "scheduled_transfer_runs" USING btree ("scheduled_transfer_id","status");--> statement-breakpoint
CREATE INDEX "idx_scheduled_runs_created_at" ON "scheduled_transfer_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_scoring_history_demande_id" ON "scoring_history" USING btree ("demande_id");--> statement-breakpoint
CREATE INDEX "idx_scoring_history_reevaluation_id" ON "scoring_history" USING btree ("reevaluation_id");--> statement-breakpoint
CREATE INDEX "idx_scoring_history_created_at" ON "scoring_history" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_scoring_demande_type_version" ON "scoring_history" USING btree ("demande_id","type_score","numero_version");--> statement-breakpoint
CREATE INDEX "idx_transactions_compte_compte_date" ON "transactions_compte" USING btree ("compte_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_transactions_compte_mouvement" ON "transactions_compte" USING btree ("mouvement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_transactions_compte_idempotency" ON "transactions_compte" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_transactions_compte_reference_externe" ON "transactions_compte" USING btree ("reference_externe");--> statement-breakpoint
CREATE INDEX "idx_transactions_compte_reversal_of" ON "transactions_compte" USING btree ("reversal_of_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_compte_sens" ON "transactions_compte" USING btree ("sens");--> statement-breakpoint
CREATE INDEX "idx_transactions_compte_compte_sens_date" ON "transactions_compte" USING btree ("compte_id","sens","created_at");--> statement-breakpoint
CREATE INDEX "idx_versements_auto_source" ON "versements_automatiques" USING btree ("compte_source_id","date_execution");--> statement-breakpoint
CREATE INDEX "idx_versements_auto_dest" ON "versements_automatiques" USING btree ("compte_dest_id","date_execution");--> statement-breakpoint
CREATE INDEX "idx_versements_auto_statut" ON "versements_automatiques" USING btree ("statut","date_planifiee");--> statement-breakpoint
CREATE INDEX "idx_virements_prog_execution" ON "virements_programmes" USING btree ("actif","prochaine_execution");--> statement-breakpoint
CREATE INDEX "idx_virements_prog_source" ON "virements_programmes" USING btree ("compte_source_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_virements_prog_dest" ON "virements_programmes" USING btree ("compte_dest_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_virements_prog_agence" ON "virements_programmes" USING btree ("agence_id","actif");--> statement-breakpoint
CREATE INDEX "idx_virements_prog_lock" ON "virements_programmes" USING btree ("processing_lock","processing_started_at");--> statement-breakpoint
CREATE INDEX "idx_virement_audit_virement_id" ON "virements_programmes_audit_logs" USING btree ("virement_id");--> statement-breakpoint
CREATE INDEX "idx_virement_audit_executed_at" ON "virements_programmes_audit_logs" USING btree ("executed_at");--> statement-breakpoint
CREATE INDEX "idx_virement_audit_statut" ON "virements_programmes_audit_logs" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_virement_audit_run_id" ON "virements_programmes_audit_logs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_geonames_staging_cc" ON "geonames_staging" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "idx_geonames_staging_fc" ON "geonames_staging" USING btree ("feature_class");--> statement-breakpoint
CREATE INDEX "idx_geonames_staging_fcode" ON "geonames_staging" USING btree ("feature_code");--> statement-breakpoint
CREATE INDEX "idx_geonames_staging_admin1" ON "geonames_staging" USING btree ("country_code","admin1_code");--> statement-breakpoint
CREATE INDEX "idx_geonames_staging_admin2" ON "geonames_staging" USING btree ("country_code","admin1_code","admin2_code");--> statement-breakpoint
CREATE INDEX "idx_geonames_staging_pop" ON "geonames_staging" USING btree ("population");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_regions_code" ON "regions" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_regions_geoname_id" ON "regions" USING btree ("geoname_id");--> statement-breakpoint
CREATE INDEX "idx_regions_pays" ON "regions" USING btree ("pays_id");--> statement-breakpoint
CREATE INDEX "idx_regions_pays_nom" ON "regions" USING btree ("pays_id","nom");--> statement-breakpoint
CREATE INDEX "idx_regions_actif" ON "regions" USING btree ("actif");--> statement-breakpoint
CREATE INDEX "idx_reconciliation_period" ON "bank_reconciliation_sessions" USING btree ("period");--> statement-breakpoint
CREATE INDEX "idx_charge_definitions_code" ON "charge_definitions" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_charge_definitions_active" ON "charge_definitions" USING btree ("active");--> statement-breakpoint
CREATE INDEX "idx_eaa_employe" ON "employee_agency_assignments" USING btree ("employe_id");--> statement-breakpoint
CREATE INDEX "idx_eaa_agence" ON "employee_agency_assignments" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_eaa_active" ON "employee_agency_assignments" USING btree ("employe_id","agence_id") WHERE statut = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "idx_eaa_primary" ON "employee_agency_assignments" USING btree ("employe_id") WHERE is_primary = true AND statut = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "idx_feuilles_temps_employe_semaine" ON "feuilles_temps" USING btree ("employe_id","semaine");--> statement-breakpoint
CREATE INDEX "idx_feuilles_temps_statut" ON "feuilles_temps" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_hr_alerts_type_status" ON "hr_alerts" USING btree ("alert_type","status");--> statement-breakpoint
CREATE INDEX "idx_hr_alerts_event_date" ON "hr_alerts" USING btree ("event_date");--> statement-breakpoint
CREATE INDEX "idx_hr_alerts_employe" ON "hr_alerts" USING btree ("employe_id");--> statement-breakpoint
CREATE INDEX "idx_hr_doc_requests_employe" ON "hr_document_requests" USING btree ("employe_id");--> statement-breakpoint
CREATE INDEX "idx_hr_doc_requests_statut" ON "hr_document_requests" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_job_offers_statut" ON "job_offers" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_job_offers_position" ON "job_offers" USING btree ("job_position_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_ogr_unique_active_role" ON "org_global_roles" USING btree ("role_type") WHERE statut = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "idx_ogr_employe" ON "org_global_roles" USING btree ("employe_id");--> statement-breakpoint
CREATE INDEX "idx_overtime_log_employe_date" ON "overtime_log" USING btree ("employe_id","date");--> statement-breakpoint
CREATE INDEX "idx_pch_config" ON "payroll_config_history" USING btree ("payroll_config_id");--> statement-breakpoint
CREATE INDEX "idx_pch_agence" ON "payroll_config_history" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_payroll_gl_mapping_source" ON "payroll_gl_mapping" USING btree ("source_type","source_code");--> statement-breakpoint
CREATE INDEX "idx_payment_batches_run" ON "payroll_payment_batches" USING btree ("payroll_run_id");--> statement-breakpoint
CREATE INDEX "idx_payment_batches_statut" ON "payroll_payment_batches" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_payroll_run_issues_run" ON "payroll_run_issues" USING btree ("payroll_run_id");--> statement-breakpoint
CREATE INDEX "idx_payroll_runs_period" ON "payroll_runs" USING btree ("period");--> statement-breakpoint
CREATE INDEX "idx_payroll_runs_status" ON "payroll_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_transfer_files_run" ON "payroll_transfer_files" USING btree ("payroll_run_id");--> statement-breakpoint
CREATE INDEX "idx_projet_membres_projet" ON "projet_membres" USING btree ("projet_id");--> statement-breakpoint
CREATE INDEX "idx_projet_membres_employe" ON "projet_membres" USING btree ("employe_id");--> statement-breakpoint
CREATE INDEX "idx_projets_rh_statut" ON "projets_rh" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_projets_rh_agence" ON "projets_rh" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_rubrique_definitions_code" ON "rubrique_definitions" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_rubrique_definitions_priority" ON "rubrique_definitions" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "idx_salary_payment_jobs_status_scheduled" ON "salary_payment_jobs" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_salary_payment_jobs_run" ON "salary_payment_jobs" USING btree ("payroll_run_id");--> statement-breakpoint
CREATE INDEX "idx_salary_payment_jobs_bulletin" ON "salary_payment_jobs" USING btree ("bulletin_id");--> statement-breakpoint
CREATE INDEX "idx_salary_payment_jobs_intent" ON "salary_payment_jobs" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_salary_payment_jobs_idempotency" ON "salary_payment_jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_temps_imputes_feuille_projet" ON "temps_imputes" USING btree ("feuille_temps_id","projet_id");--> statement-breakpoint
CREATE INDEX "idx_temps_imputes_projet_date" ON "temps_imputes" USING btree ("projet_id","date");--> statement-breakpoint
CREATE INDEX "idx_idempotency_keys_expires" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_idempotency_keys_status" ON "idempotency_keys" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_pays_nom_fr" ON "pays" USING btree ("nom_fr");--> statement-breakpoint
CREATE INDEX "idx_pays_is_active" ON "pays" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_pays_region" ON "pays" USING btree ("region");--> statement-breakpoint
CREATE INDEX "idx_pays_high_risk_aml" ON "pays" USING btree ("is_high_risk_aml");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_pays_geoname_id" ON "pays" USING btree ("geoname_id");--> statement-breakpoint
CREATE INDEX "idx_credit_penalty_structures_plan" ON "credit_penalty_structures" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "idx_credit_plan_versions_plan" ON "credit_plan_versions" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "idx_holiday_dates_calendar" ON "holiday_dates" USING btree ("calendar_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_holiday_dates_calendar_date" ON "holiday_dates" USING btree ("calendar_id","date");--> statement-breakpoint
CREATE INDEX "idx_contributions_tontine_tontine_date" ON "contributions_tontine" USING btree ("tontine_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_contributions_tontine_mouvement" ON "contributions_tontine" USING btree ("mouvement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_contributions_tontine_idempotency" ON "contributions_tontine" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_contributions_tontine_reference_externe" ON "contributions_tontine" USING btree ("reference_externe");--> statement-breakpoint
CREATE INDEX "idx_membres_tontine_tontine_id" ON "membres_tontine" USING btree ("tontine_id");--> statement-breakpoint
CREATE INDEX "idx_membres_tontine_client_id" ON "membres_tontine" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_membres_tontine_tontine_client" ON "membres_tontine" USING btree ("tontine_id","client_id");--> statement-breakpoint
CREATE INDEX "idx_membres_tontine_cotisation_auto" ON "membres_tontine" USING btree ("cotisation_automatique");--> statement-breakpoint
CREATE INDEX "idx_membres_tontine_statut" ON "membres_tontine" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_tontine_cycles_tontine" ON "tontine_cycles" USING btree ("tontine_id");--> statement-breakpoint
CREATE INDEX "idx_tontine_cycles_status" ON "tontine_cycles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_tontine_cycles_agence" ON "tontine_cycles" USING btree ("agence_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tontine_cycles_tontine_cycle" ON "tontine_cycles" USING btree ("tontine_id","cycle_number");--> statement-breakpoint
CREATE INDEX "idx_tontine_dist_req_tontine" ON "tontine_distribution_requests" USING btree ("tontine_id");--> statement-breakpoint
CREATE INDEX "idx_tontine_dist_req_cycle" ON "tontine_distribution_requests" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX "idx_tontine_dist_req_turn" ON "tontine_distribution_requests" USING btree ("turn_id");--> statement-breakpoint
CREATE INDEX "idx_tontine_dist_req_beneficiary" ON "tontine_distribution_requests" USING btree ("beneficiary_member_id");--> statement-breakpoint
CREATE INDEX "idx_tontine_dist_req_status" ON "tontine_distribution_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_tontine_dist_req_payment_intent" ON "tontine_distribution_requests" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tontine_dist_req_idempotency" ON "tontine_distribution_requests" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_tontine_schedules_tontine" ON "tontine_schedules" USING btree ("tontine_id");--> statement-breakpoint
CREATE INDEX "idx_tontine_schedules_cycle" ON "tontine_schedules" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX "idx_tontine_schedules_due_date" ON "tontine_schedules" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "idx_tontine_schedules_status" ON "tontine_schedules" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tontine_schedules_cycle_period" ON "tontine_schedules" USING btree ("tontine_id","cycle_id","period_number");--> statement-breakpoint
CREATE INDEX "idx_tontine_turn_audit_tontine" ON "tontine_turn_audit" USING btree ("tontine_id");--> statement-breakpoint
CREATE INDEX "idx_tontine_turn_audit_cycle" ON "tontine_turn_audit" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX "idx_tontine_turn_audit_date" ON "tontine_turn_audit" USING btree ("changed_at");--> statement-breakpoint
CREATE INDEX "idx_tontine_turns_tontine" ON "tontine_turns" USING btree ("tontine_id");--> statement-breakpoint
CREATE INDEX "idx_tontine_turns_cycle" ON "tontine_turns" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX "idx_tontine_turns_beneficiary" ON "tontine_turns" USING btree ("beneficiary_member_id");--> statement-breakpoint
CREATE INDEX "idx_tontine_turns_status" ON "tontine_turns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_tontine_turns_due_date" ON "tontine_turns" USING btree ("due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tontine_turns_cycle_turn" ON "tontine_turns" USING btree ("tontine_id","cycle_id","turn_number");--> statement-breakpoint
CREATE INDEX "idx_tontines_statut" ON "tontines" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_tontines_agence_id" ON "tontines" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_tontines_agence_statut" ON "tontines" USING btree ("agence_id","statut");--> statement-breakpoint
CREATE INDEX "idx_tontines_prochain_tour" ON "tontines" USING btree ("prochain_tour");--> statement-breakpoint
CREATE INDEX "idx_tontines_gestionnaire_id" ON "tontines" USING btree ("gestionnaire_id");--> statement-breakpoint
CREATE INDEX "idx_tontines_deleted_at" ON "tontines" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_agent_loc_agent_captured" ON "agent_location_logs" USING btree ("agent_id","captured_at");--> statement-breakpoint
CREATE INDEX "idx_agent_loc_session" ON "agent_location_logs" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_agent_loc_client_point" ON "agent_location_logs" USING btree ("agent_id","client_point_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agent_mm_payments_reference" ON "agent_mm_payments" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agent_mm_payments_idempotency" ON "agent_mm_payments" USING btree ("idempotency_key") WHERE idempotency_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_agent_mm_payments_agent" ON "agent_mm_payments" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_agent_mm_payments_client" ON "agent_mm_payments" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_agent_mm_payments_intent" ON "agent_mm_payments" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE INDEX "idx_agent_mm_payments_statut" ON "agent_mm_payments" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_agent_mm_payments_date" ON "agent_mm_payments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_arrondissements_nom" ON "arrondissements" USING btree ("nom");--> statement-breakpoint
CREATE INDEX "idx_arrondissements_ville" ON "arrondissements" USING btree ("ville_id");--> statement-breakpoint
CREATE INDEX "idx_arrondissements_actif" ON "arrondissements" USING btree ("actif");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_departements_code" ON "departements" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_departements_geoname_id" ON "departements" USING btree ("geoname_id");--> statement-breakpoint
CREATE INDEX "idx_departements_region" ON "departements" USING btree ("region_id");--> statement-breakpoint
CREATE INDEX "idx_departements_pays" ON "departements" USING btree ("pays_id");--> statement-breakpoint
CREATE INDEX "idx_departements_region_nom" ON "departements" USING btree ("region_id","nom");--> statement-breakpoint
CREATE INDEX "idx_departements_actif" ON "departements" USING btree ("actif");--> statement-breakpoint
CREATE INDEX "idx_marches_arrondissement" ON "marches" USING btree ("arrondissement_id");--> statement-breakpoint
CREATE INDEX "idx_marches_nom" ON "marches" USING btree ("nom");--> statement-breakpoint
CREATE INDEX "idx_marches_actif" ON "marches" USING btree ("actif");--> statement-breakpoint
CREATE INDEX "idx_marches_arrondissement_actif" ON "marches" USING btree ("arrondissement_id","actif");--> statement-breakpoint
CREATE INDEX "idx_paiements_terrain_agent_date" ON "paiements_terrain" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_paiements_terrain_agent_statut_date" ON "paiements_terrain" USING btree ("agent_id","statut","created_at");--> statement-breakpoint
CREATE INDEX "idx_paiements_terrain_client_date" ON "paiements_terrain" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_paiements_terrain_type_date" ON "paiements_terrain" USING btree ("type_paiement","created_at");--> statement-breakpoint
CREATE INDEX "idx_paiements_terrain_remise" ON "paiements_terrain" USING btree ("remise_id");--> statement-breakpoint
CREATE INDEX "idx_paiements_terrain_session_remise" ON "paiements_terrain" USING btree ("session_caisse_remise_id");--> statement-breakpoint
CREATE INDEX "idx_paiements_terrain_settled" ON "paiements_terrain" USING btree ("settled_remise_id");--> statement-breakpoint
CREATE INDEX "idx_paiements_terrain_mouvement" ON "paiements_terrain" USING btree ("mouvement_id");--> statement-breakpoint
CREATE INDEX "idx_paiements_terrain_credit" ON "paiements_terrain" USING btree ("credit_id");--> statement-breakpoint
CREATE INDEX "idx_paiements_terrain_compte" ON "paiements_terrain" USING btree ("compte_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_paiements_terrain_reference" ON "paiements_terrain" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_paiements_terrain_idempotency" ON "paiements_terrain" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_paiements_terrain_reference_externe" ON "paiements_terrain" USING btree ("reference_externe");--> statement-breakpoint
CREATE INDEX "idx_prospection_prime_config_agence" ON "prospection_prime_config" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_prospection_prime_config_actif" ON "prospection_prime_config" USING btree ("actif");--> statement-breakpoint
CREATE INDEX "idx_prospection_primes_agent" ON "prospection_primes" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_prospection_primes_agence" ON "prospection_primes" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_prospection_primes_prospection" ON "prospection_primes" USING btree ("prospection_id");--> statement-breakpoint
CREATE INDEX "idx_prospection_primes_statut" ON "prospection_primes" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_prospection_primes_periode" ON "prospection_primes" USING btree ("periode");--> statement-breakpoint
CREATE INDEX "idx_prospection_primes_agent_periode" ON "prospection_primes" USING btree ("agent_id","periode");--> statement-breakpoint
CREATE INDEX "idx_prospection_primes_agent_statut" ON "prospection_primes" USING btree ("agent_id","statut");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_prospection_primes_prospection" ON "prospection_primes" USING btree ("prospection_id");--> statement-breakpoint
CREATE INDEX "idx_prospections_agent" ON "prospections" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_prospections_statut" ON "prospections" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_prospections_arrondissement" ON "prospections" USING btree ("arrondissement_id");--> statement-breakpoint
CREATE INDEX "idx_prospections_marche" ON "prospections" USING btree ("marche_id");--> statement-breakpoint
CREATE INDEX "idx_prospections_telephone" ON "prospections" USING btree ("telephone_prospect");--> statement-breakpoint
CREATE INDEX "idx_prospections_agent_statut" ON "prospections" USING btree ("agent_id","statut");--> statement-breakpoint
CREATE INDEX "idx_prospections_created_at" ON "prospections" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_prospections_last_action" ON "prospections" USING btree ("last_action_at");--> statement-breakpoint
CREATE INDEX "idx_prospections_deleted_at" ON "prospections" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_remise_audit_logs_remise" ON "remise_audit_logs" USING btree ("remise_id");--> statement-breakpoint
CREATE INDEX "idx_remise_audit_logs_timestamp" ON "remise_audit_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_remise_items_remise" ON "remise_items" USING btree ("remise_id");--> statement-breakpoint
CREATE INDEX "idx_remise_items_paiement" ON "remise_items" USING btree ("paiement_terrain_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_remise_items_paiement" ON "remise_items" USING btree ("paiement_terrain_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_remises_terrain_reference" ON "remises_terrain" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_remises_terrain_idempotency" ON "remises_terrain" USING btree ("idempotency_key") WHERE idempotency_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_remises_terrain_agent_date" ON "remises_terrain" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_remises_terrain_session" ON "remises_terrain" USING btree ("session_caisse_id");--> statement-breakpoint
CREATE INDEX "idx_remises_terrain_statut" ON "remises_terrain" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_remises_terrain_agence" ON "remises_terrain" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_tracking_sessions_agent_day" ON "tracking_sessions" USING btree ("agent_id","day_key");--> statement-breakpoint
CREATE INDEX "idx_villes_nom" ON "villes" USING btree ("nom");--> statement-breakpoint
CREATE INDEX "idx_villes_region" ON "villes" USING btree ("region_id");--> statement-breakpoint
CREATE INDEX "idx_villes_pays" ON "villes" USING btree ("pays_id");--> statement-breakpoint
CREATE INDEX "idx_villes_actif" ON "villes" USING btree ("actif");--> statement-breakpoint
CREATE INDEX "idx_villes_population" ON "villes" USING btree ("population");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_villes_geoname_id" ON "villes" USING btree ("geoname_id");--> statement-breakpoint
CREATE INDEX "idx_transferts_client_date" ON "transferts" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_transferts_mouvement" ON "transferts" USING btree ("mouvement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_transferts_reference" ON "transferts" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_transferts_idempotency" ON "transferts" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_transferts_reference_externe" ON "transferts" USING btree ("reference_externe");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_client_balance_per_agency" ON "client_credit_balances" USING btree ("client_id","agence_id");--> statement-breakpoint
CREATE INDEX "idx_client_credit_balances_client" ON "client_credit_balances" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_client_credit_balances_agence" ON "client_credit_balances" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_remboursement_allocation_audit_remboursement" ON "remboursement_allocation_audit" USING btree ("remboursement_id");--> statement-breakpoint
CREATE INDEX "idx_remboursement_allocation_audit_created" ON "remboursement_allocation_audit" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_remboursement_echeance" ON "remboursement_echeances" USING btree ("remboursement_id","echeance_id");--> statement-breakpoint
CREATE INDEX "idx_remboursement_echeances_remboursement" ON "remboursement_echeances" USING btree ("remboursement_id");--> statement-breakpoint
CREATE INDEX "idx_remboursement_echeances_echeance" ON "remboursement_echeances" USING btree ("echeance_id");--> statement-breakpoint
CREATE INDEX "idx_remboursement_echeances_reversed" ON "remboursement_echeances" USING btree ("reversed_at");--> statement-breakpoint
CREATE INDEX "idx_loan_payment_allocations_credit" ON "loan_payment_allocations" USING btree ("credit_id");--> statement-breakpoint
CREATE INDEX "idx_loan_payment_allocations_mouvement" ON "loan_payment_allocations" USING btree ("mouvement_id");--> statement-breakpoint
CREATE INDEX "idx_loan_payment_allocations_payment_intent" ON "loan_payment_allocations" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE INDEX "idx_loan_payment_allocations_created_at" ON "loan_payment_allocations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_mm_reconciliation_date_provider" ON "mm_reconciliation_reports" USING btree ("date_rapport","provider");--> statement-breakpoint
CREATE INDEX "idx_mm_reconciliation_agence_date" ON "mm_reconciliation_reports" USING btree ("agence_id","date_rapport");--> statement-breakpoint
CREATE INDEX "idx_mm_reconciliation_statut" ON "mm_reconciliation_reports" USING btree ("statut");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mm_reconciliation_date_provider_agence" ON "mm_reconciliation_reports" USING btree ("date_rapport","provider","agence_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_payment_intents_external_ref" ON "payment_intents" USING btree ("external_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_payment_intents_idempotency" ON "payment_intents" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_payment_intents_provider_ref" ON "payment_intents" USING btree ("provider_ref");--> statement-breakpoint
CREATE INDEX "idx_payment_intents_status_provider" ON "payment_intents" USING btree ("status","provider");--> statement-breakpoint
CREATE INDEX "idx_payment_intents_client_id" ON "payment_intents" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_payment_intents_agence_status" ON "payment_intents" USING btree ("agence_id","status");--> statement-breakpoint
CREATE INDEX "idx_payment_intents_pending" ON "payment_intents" USING btree ("status","initiated_at");--> statement-breakpoint
CREATE INDEX "idx_payment_intents_gateway_operator" ON "payment_intents" USING btree ("gateway","operator");--> statement-breakpoint
CREATE INDEX "idx_provider_events_provider_ref" ON "provider_events" USING btree ("provider","provider_ref");--> statement-breakpoint
CREATE INDEX "idx_provider_events_external_ref" ON "provider_events" USING btree ("external_ref");--> statement-breakpoint
CREATE INDEX "idx_provider_events_unprocessed" ON "provider_events" USING btree ("processed","received_at");--> statement-breakpoint
CREATE INDEX "idx_provider_events_payment_intent_id" ON "provider_events" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE INDEX "idx_mm_fee_schedules_provider_direction" ON "mm_fee_schedules" USING btree ("provider","direction");--> statement-breakpoint
CREATE INDEX "idx_mm_fee_schedules_active" ON "mm_fee_schedules" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mm_fee_schedules_provider_direction_active" ON "mm_fee_schedules" USING btree ("provider","direction") WHERE "mm_fee_schedules"."active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_delivery_receipts_request" ON "notification_delivery_receipts" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "idx_delivery_receipts_job" ON "notification_delivery_receipts" USING btree ("notification_job_id");--> statement-breakpoint
CREATE INDEX "idx_notif_jobs_status_next" ON "notification_jobs" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_notif_jobs_correlation" ON "notification_jobs" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "idx_notif_jobs_agence" ON "notification_jobs" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_notif_jobs_user_created" ON "notification_jobs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_notif_sched_status_scheduled" ON "notification_schedules" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_notif_sched_source" ON "notification_schedules" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "idx_notif_sched_source_version" ON "notification_schedules" USING btree ("source_id","schedule_version");--> statement-breakpoint
CREATE INDEX "idx_notif_sched_user" ON "notification_schedules" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_notif_settings_agence" ON "notification_settings" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_otp_codes_dest_purpose" ON "otp_codes" USING btree ("destination","purpose","created_at");--> statement-breakpoint
CREATE INDEX "idx_otp_codes_expires" ON "otp_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_otp_codes_user" ON "otp_codes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_kpi_period_scope" ON "kpi_snapshots" USING btree ("period_type","period_key","scope_type","agency_id");--> statement-breakpoint
CREATE INDEX "idx_kpi_period_key" ON "kpi_snapshots" USING btree ("period_key");--> statement-breakpoint
CREATE INDEX "idx_kpi_agency_id" ON "kpi_snapshots" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "idx_kpi_generated_at" ON "kpi_snapshots" USING btree ("generated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_score_event_ref" ON "client_score_events" USING btree ("event_type","ref_id");--> statement-breakpoint
CREATE INDEX "idx_score_events_client_id" ON "client_score_events" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_score_events_agence_id" ON "client_score_events" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_score_events_client_created" ON "client_score_events" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_score_events_type" ON "client_score_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_score_events_client_type" ON "client_score_events" USING btree ("client_id","event_type");--> statement-breakpoint
CREATE INDEX "idx_score_state_agence_id" ON "client_score_state" USING btree ("agence_id");--> statement-breakpoint
CREATE INDEX "idx_score_state_segment" ON "client_score_state" USING btree ("segment");--> statement-breakpoint
CREATE INDEX "idx_score_state_score_global" ON "client_score_state" USING btree ("score_global");