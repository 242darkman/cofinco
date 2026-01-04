import { pgTable, text, varchar, integer, numeric, boolean, timestamp, uuid, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { clients } from "./clients";

// Niveaux KYC pour les clients
export const kycLevels = pgTable("kyc_levels", {
  id: uuid("id").primaryKey().defaultRandom(),
  niveau: integer("niveau").notNull().unique(),
  nom: text("nom").notNull(),
  description: text("description"),
  limiteTransactionJournaliere: numeric("limite_transaction_journaliere").notNull(),
  limiteTransactionMensuelle: numeric("limite_transaction_mensuelle").notNull(),
  limiteTransactionUnique: numeric("limite_transaction_unique").notNull(),
  documentsRequis: text("documents_requis").array(),
  actif: boolean("actif").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertKycLevelSchema = createInsertSchema(kycLevels).omit({ id: true, createdAt: true });
export type InsertKycLevel = z.infer<typeof insertKycLevelSchema>;
export type KycLevel = typeof kycLevels.$inferSelect;

// Transferts d'argent
export const transferts = pgTable("transferts", {
  id: uuid("id").primaryKey().defaultRandom(),
  reference: text("reference").notNull().unique(),
  idempotencyKey: text("idempotency_key").unique(),
  type: text("type").notNull(),
  statut: text("statut").notNull().default("pending"),
  
  expediteurNom: text("expediteur_nom").notNull(),
  expediteurTelephone: text("expediteur_telephone").notNull(),
  expediteurEmail: text("expediteur_email"),
  expediteurTypeDocument: text("expediteur_type_document"),
  expediteurNumeroDocument: text("expediteur_numero_document"),
  expediteurAdresse: text("expediteur_adresse"),
  expediteurPays: text("expediteur_pays").notNull().default("CG"),
  expediteurKycLevel: integer("expediteur_kyc_level").default(1),
  
  beneficiaireNom: text("beneficiaire_nom").notNull(),
  beneficiaireTelephone: text("beneficiaire_telephone").notNull(),
  beneficiaireEmail: text("beneficiaire_email"),
  beneficiairePays: text("beneficiaire_pays").notNull(),
  beneficiaireVille: text("beneficiaire_ville"),
  beneficiaireAdresse: text("beneficiaire_adresse"),
  
  montantEnvoye: numeric("montant_envoye").notNull(),
  deviseEnvoi: text("devise_envoi").notNull().default("XAF"),
  montantRecu: numeric("montant_recu").notNull(),
  deviseReception: text("devise_reception").notNull(),
  tauxChange: numeric("taux_change").notNull(),
  fraisTransfert: numeric("frais_transfert").notNull(),
  fraisOperateur: numeric("frais_operateur").default("0"),
  montantTotal: numeric("montant_total").notNull(),
  
  operateurId: text("operateur_id").notNull(),
  operateurNom: text("operateur_nom").notNull(),
  modeReception: text("mode_reception").notNull(), 
  modePaiement: text("mode_paiement").notNull(), 
  
  motifTransfert: text("motif_transfert"),
  codeSecret: text("code_secret"),
  codeSecretHash: text("code_secret_hash"),
  
  referenceOperateur: text("reference_operateur"),
  messageOperateur: text("message_operateur"),
  delaiEstime: text("delai_estime"),
  
  otpCode: text("otp_code"),
  otpExpiration: timestamp("otp_expiration"),
  otpVerifie: boolean("otp_verifie").default(false),
  tentativesOtp: integer("tentatives_otp").default(0),
  
  riskScore: integer("risk_score").default(0),
  riskFlags: text("risk_flags").array(),
  fraudCheck: boolean("fraud_check").default(false),
  amlCheck: boolean("aml_check").default(false),
  sanctionsCheck: boolean("sanctions_check").default(false),
  
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  deviceFingerprint: text("device_fingerprint"),
  geoLocation: text("geo_location"),
  
  agentId: uuid("agent_id").references(() => users.id),
  approuveParId: uuid("approuve_par_id").references(() => users.id),
  dateApprobation: timestamp("date_approbation"),
  
  dateCreation: timestamp("date_creation").defaultNow(),
  dateTraitement: timestamp("date_traitement"),
  dateCompletion: timestamp("date_completion"),
  dateExpiration: timestamp("date_expiration"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTransfertSchema = createInsertSchema(transferts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTransfert = z.infer<typeof insertTransfertSchema>;
export type Transfert = typeof transferts.$inferSelect;

// Audit des transferts
export const transfertAuditLogs = pgTable("transfert_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  transfertId: uuid("transfert_id").notNull().references(() => transferts.id),
  action: text("action").notNull(),
  ancienStatut: text("ancien_statut"),
  nouveauStatut: text("nouveau_statut"),
  details: json("details"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: uuid("user_id").references(() => users.id),
  hashPrecedent: text("hash_precedent"),
  hashActuel: text("hash_actuel"),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const insertTransfertAuditLogSchema = createInsertSchema(transfertAuditLogs).omit({ id: true, timestamp: true });
export type InsertTransfertAuditLog = z.infer<typeof insertTransfertAuditLogSchema>;
export type TransfertAuditLog = typeof transfertAuditLogs.$inferSelect;

// Limites de transfert
export const transfertLimits = pgTable("transfert_limits", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id"),
  telephone: text("telephone").notNull(),
  kycLevel: integer("kyc_level").notNull().default(1),
  totalJournalier: numeric("total_journalier").notNull().default("0"),
  totalMensuel: numeric("total_mensuel").notNull().default("0"),
  nombreTransfertJour: integer("nombre_transfert_jour").default(0),
  nombreTransfertMois: integer("nombre_transfert_mois").default(0),
  dernierTransfert: timestamp("dernier_transfert"),
  dateResetJournalier: timestamp("date_reset_journalier").defaultNow(),
  dateResetMensuel: timestamp("date_reset_mensuel").defaultNow(),
  bloque: boolean("bloque").default(false),
  raisonBlocage: text("raison_blocage"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTransfertLimitSchema = createInsertSchema(transfertLimits).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTransfertLimit = z.infer<typeof insertTransfertLimitSchema>;
export type TransfertLimit = typeof transfertLimits.$inferSelect;

// Webhooks
export const transfertWebhooks = pgTable("transfert_webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  transfertId: uuid("transfert_id").references(() => transferts.id),
  operateurId: text("operateur_id").notNull(),
  eventType: text("event_type").notNull(),
  payload: json("payload").notNull(),
  signature: text("signature"),
  signatureValide: boolean("signature_valide"),
  traite: boolean("traite").default(false),
  erreur: text("erreur"),
  tentatives: integer("tentatives").default(0),
  ipSource: text("ip_source"),
  receivedAt: timestamp("received_at").defaultNow(),
  processedAt: timestamp("processed_at"),
});

export const insertTransfertWebhookSchema = createInsertSchema(transfertWebhooks).omit({ id: true, receivedAt: true });
export type InsertTransfertWebhook = z.infer<typeof insertTransfertWebhookSchema>;
export type TransfertWebhook = typeof transfertWebhooks.$inferSelect;

// Blacklist
export const transfertBlacklist = pgTable("transfert_blacklist", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(),
  valeur: text("valeur").notNull(),
  raison: text("raison").notNull(),
  source: text("source"),
  severite: text("severite").notNull().default("high"),
  actif: boolean("actif").notNull().default(true),
  dateExpiration: timestamp("date_expiration"),
  ajouteParId: uuid("ajoute_par_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTransfertBlacklistSchema = createInsertSchema(transfertBlacklist).omit({ id: true, createdAt: true });
export type InsertTransfertBlacklist = z.infer<typeof insertTransfertBlacklistSchema>;
export type TransfertBlacklist = typeof transfertBlacklist.$inferSelect;

// Reconciliation
export const transfertReconciliation = pgTable("transfert_reconciliation", {
  id: uuid("id").primaryKey().defaultRandom(),
  operateurId: text("operateur_id").notNull(),
  dateReconciliation: timestamp("date_reconciliation").notNull(),
  periode: text("periode").notNull(),
  totalTransferts: integer("total_transferts").notNull().default(0),
  montantTotal: numeric("montant_total").notNull().default("0"),
  montantOperateur: numeric("montant_operateur").default("0"),
  ecart: numeric("ecart").default("0"),
  statut: text("statut").notNull().default("pending"),
  anomalies: json("anomalies"),
  resolvedById: uuid("resolved_by_id").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTransfertReconciliationSchema = createInsertSchema(transfertReconciliation).omit({ id: true, createdAt: true });
export type InsertTransfertReconciliation = z.infer<typeof insertTransfertReconciliationSchema>;
export type TransfertReconciliation = typeof transfertReconciliation.$inferSelect;

// OTP Validations
export const otpValidations = pgTable("otp_validations", {
  id: uuid("id").primaryKey().defaultRandom(),
  transactionType: text("transaction_type").notNull(),
  transactionReference: text("transaction_reference").notNull(),
  clientId: uuid("client_id").references(() => clients.id),
  clientPhone: text("client_phone").notNull(),
  montant: numeric("montant").notNull(),
  otpCode: text("otp_code").notNull(),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  status: text("status").notNull().default("pending"),
  createdBy: uuid("created_by").references(() => users.id),
  createdByRole: text("created_by_role"),
  validatedBy: uuid("validated_by").references(() => users.id),
  validatedByName: text("validated_by_name"),
  validatedByRole: text("validated_by_role"),
  validatedAt: timestamp("validated_at"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOtpValidationSchema = createInsertSchema(otpValidations).omit({ id: true, createdAt: true });
export type InsertOtpValidation = z.infer<typeof insertOtpValidationSchema>;
export type OtpValidation = typeof otpValidations.$inferSelect;
