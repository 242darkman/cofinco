import { pgTable, text, varchar, integer, boolean, numeric, timestamp, uuid, json, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth"; // Assuming auth is created
import { DEFAULT_CURRENCY } from "../config/currency";

// Helper to generate agency code (crypto-secure)
function generateAgenceCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "COF";
  const crypto = require('crypto');
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(crypto.randomInt(0, chars.length));
  }
  return code;
}

// System Settings table
export const systemSettings = pgTable("system_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  agenceName: text("agence_name").default("COFIN&CO-M"),
  agenceCode: text("agence_code").$defaultFn(generateAgenceCode).unique(),
  devise: text("devise").default(DEFAULT_CURRENCY.code),
  pays: text("pays").default("République du Congo"),
  adresse: text("adresse"),
  telephone: text("telephone"),
  email: text("email"),
  // Identifiants légaux
  niu: text("niu"),                          // Numéro d'Identification Unique (fiscal)
  cnssMembership: text("cnss_membership"),   // N° CNSS employeur
  rccm: text("rccm"),                       // Registre Commerce et Crédit Mobilier
  logoUrl: text("logo_url"),                 // URL du logo dans MinIO
  sessionTimeout: integer("session_timeout").default(30),
  maxLoginAttempts: integer("max_login_attempts").default(5),
  passwordMinLength: integer("password_min_length").default(12),
  backupFrequency: text("backup_frequency").default("DAILY"),
  autoBackupEnabled: boolean("auto_backup_enabled").default(true),
  notificationEmailEnabled: boolean("notification_email_enabled").default(true),
  notificationSmsEnabled: boolean("notification_sms_enabled").default(true),
  smsPaymentValidationEnabled: boolean("sms_payment_validation_enabled").default(true),
  mobileMoneyEnabled: boolean("mobile_money_enabled").default(true),
  maintenanceMode: boolean("maintenance_mode").default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSystemSettingsSchema = createInsertSchema(systemSettings).omit({ updatedAt: true, id: true });
export type InsertSystemSettings = z.infer<typeof insertSystemSettingsSchema>;
export type SystemSettings = typeof systemSettings.$inferSelect;

// Maintenance Modules table (Granular Locking)
export const maintenanceModules = pgTable("maintenance_modules", {
  id: uuid("id").primaryKey().defaultRandom(),
  moduleName: text("module_name").notNull().unique(), // 'CREDITS', 'CAISSE', 'PLATFORM'
  isLocked: boolean("is_locked").notNull().default(false),
  lockedBy: uuid("locked_by").references(() => users.id),
  lockedAt: timestamp("locked_at"),
  reason: text("reason"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertMaintenanceModuleSchema = createInsertSchema(maintenanceModules).omit({ id: true, updatedAt: true });
export type InsertMaintenanceModule = z.infer<typeof insertMaintenanceModuleSchema>;
export type MaintenanceModule = typeof maintenanceModules.$inferSelect;

// Feature Flags table
export const featureFlags = pgTable("feature_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  nom: text("nom").notNull(),
  description: text("description"),
  enabled: boolean("enabled").notNull().default(true),
  rolloutPercentage: integer("rollout_percentage").default(100),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertFeatureFlagSchema = createInsertSchema(featureFlags).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFeatureFlag = z.infer<typeof insertFeatureFlagSchema>;
export type FeatureFlag = typeof featureFlags.$inferSelect;

// Security Settings table
export const securitySettings = pgTable("security_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  passwordMinLength: integer("password_min_length").default(12),
  passwordRequireUppercase: boolean("password_require_uppercase").default(true),
  passwordRequireLowercase: boolean("password_require_lowercase").default(true),
  passwordRequireNumbers: boolean("password_require_numbers").default(true),
  passwordRequireSpecial: boolean("password_require_special").default(true),
  sessionTimeoutMinutes: integer("session_timeout_minutes").default(30),
  maxLoginAttempts: integer("max_login_attempts").default(5),
  lockoutDurationMinutes: integer("lockout_duration_minutes").default(15),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  ipWhitelistEnabled: boolean("ip_whitelist_enabled").default(false),
  auditLogEnabled: boolean("audit_log_enabled").default(true),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSecuritySettingsSchema = createInsertSchema(securitySettings).omit({ updatedAt: true, id: true });
export type InsertSecuritySettings = z.infer<typeof insertSecuritySettingsSchema>;
export type SecuritySettings = typeof securitySettings.$inferSelect;

// UI Customization table
export const uiCustomization = pgTable("ui_customization", {
  id: uuid("id").primaryKey().defaultRandom(),
  theme: text("theme").default("DARK"),
  primaryColor: text("primary_color").default("#3b82f6"),
  accentColor: text("accent_color").default("#10b981"),
  langue: text("langue").default("fr"),
  sidebarCollapsedDefault: boolean("sidebar_collapsed_default").default(false),
  showAnimations: boolean("show_animations").default(true),
  compactMode: boolean("compact_mode").default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUICustomizationSchema = createInsertSchema(uiCustomization).omit({ updatedAt: true, id: true });
export type InsertUICustomization = z.infer<typeof insertUICustomizationSchema>;
export type UICustomization = typeof uiCustomization.$inferSelect;

// Notifications table
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  type: text("type").notNull(), // 'echeance', 'credit', 'tontine', 'system', 'alerte'
  titre: text("titre").notNull(),
  message: text("message").notNull(),
  lien: text("lien"),
  priorite: text("priorite").notNull().default("NORMAL"), 
  lue: boolean("lue").notNull().default(false),
  referenceId: uuid("reference_id"), 
  referenceType: text("reference_type"), 
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// Audit Logs
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  action: text("action").notNull(), 
  resource: text("resource").notNull(), 
  resourceId: text("resource_id"),
  details: json("details"), 
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  statut: text("statut").notNull().default("SUCCESS"), 
  riskLevel: text("risk_level").default("LOW"), 
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

// Push Subscriptions
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(), 
  auth: text("auth").notNull(), 
  expirationTime: timestamp("expiration_time"),
  deviceInfo: text("device_info"), 
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;

// SMS Templates (from existing code in original file)
export const smsTemplates = pgTable("sms_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(), 
  nom: text("nom").notNull(),
  contenu: text("contenu").notNull(),
  placeholders: text("placeholders"), 
  description: text("description"),
  actif: boolean("actif").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSmsTemplateSchema = createInsertSchema(smsTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSmsTemplate = z.infer<typeof insertSmsTemplateSchema>;
export type SmsTemplate = typeof smsTemplates.$inferSelect;

export const smsNotifications = pgTable("sms_notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").references(() => users.id),
  phoneNumber: text("phone_number").notNull(),
  type: text("type").notNull(),
  message: text("message").notNull(),
  statut: text("statut").notNull().default("PENDING"),
  provider: text("provider"),
  providerMessageId: text("provider_message_id"),
  errorMessage: text("error_message"),
  relatedEntityId: uuid("related_entity_id"),
  relatedEntityType: text("related_entity_type"),
  createdBy: uuid("created_by"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSmsNotificationSchema = createInsertSchema(smsNotifications).omit({ id: true, createdAt: true });
export type InsertSmsNotification = z.infer<typeof insertSmsNotificationSchema>;
export type SmsNotification = typeof smsNotifications.$inferSelect;

export const notificationPreferences = pgTable("notification_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  emailEnabled: boolean("email_enabled").default(true),
  smsEnabled: boolean("sms_enabled").default(true),
  pushEnabled: boolean("push_enabled").default(true),
  types: json("types").$type<string[]>(), 
  schedule: json("schedule"), 
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertNotificationPreferencesSchema = createInsertSchema(notificationPreferences).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertNotificationPreferences = z.infer<typeof insertNotificationPreferencesSchema>;
export type NotificationPreferences = typeof notificationPreferences.$inferSelect;

export const pushNotificationLogs = pgTable("push_notification_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  subscriptionId: uuid("subscription_id").references(() => pushSubscriptions.id),
  title: text("title"),
  body: text("body"),
  statut: text("statut"),
  error: text("error"),
  sentAt: timestamp("sent_at").defaultNow(),
});

export const insertPushNotificationLogSchema = createInsertSchema(pushNotificationLogs).omit({ id: true, sentAt: true });
export type InsertPushNotificationLog = z.infer<typeof insertPushNotificationLogSchema>;
export type PushNotificationLog = typeof pushNotificationLogs.$inferSelect;

export const smsProviderSettings = pgTable("sms_provider_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").default("manual"),
  providerName: text("provider_name").default("infobip"),
  apiKey: text("api_key"),
  apiUrl: text("api_url"),
  senderId: text("sender_id"),
  username: text("username"), // For some providers
  password: text("password"),
  balance: numeric("balance"),
  lastCheck: timestamp("last_check"),
  enabled: boolean("enabled").default(true),
  isPrimary: boolean("is_primary").default(false),
  isActive: boolean("is_active").default(true), // redundant with enabled but required by service
  settings: json("settings"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSmsProviderSettingsSchema = createInsertSchema(smsProviderSettings).omit({ updatedAt: true, id: true });
export type InsertSmsProviderSettings = z.infer<typeof insertSmsProviderSettingsSchema>;
export type SmsProviderSettings = typeof smsProviderSettings.$inferSelect;

// ==========================================
// SETTINGS HISTORY (for versioning & rollback)
// ==========================================

export const settingsHistory = pgTable("settings_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  settingsType: varchar("settings_type", { length: 50 }).notNull(), // 'system', 'security', 'ui', 'notification'
  version: integer("version").notNull(),
  snapshot: json("snapshot").notNull().$type<Record<string, any>>(),
  changedBy: uuid("changed_by").references(() => users.id),
  changedAt: timestamp("changed_at").defaultNow(),
  changeReason: text("change_reason"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  isCurrent: boolean("is_current").default(false),
});

export const insertSettingsHistorySchema = createInsertSchema(settingsHistory).omit({ id: true, changedAt: true });
export type InsertSettingsHistory = z.infer<typeof insertSettingsHistorySchema>;
export type SettingsHistory = typeof settingsHistory.$inferSelect;

// ==========================================
// PERMISSION AUDIT LOGS
// ==========================================

export const permissionAuditLogs = pgTable("permission_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityType: varchar("entity_type", { length: 20 }).notNull(), // 'role', 'user'
  entityId: text("entity_id").notNull(), // role name or user id
  permissionId: uuid("permission_id"),
  permissionCode: text("permission_code"),
  action: varchar("action", { length: 20 }).notNull(), // 'GRANT', 'REVOKE', 'BULK_GRANT', 'BULK_REVOKE'
  beforeState: json("before_state").$type<Record<string, any>>(),
  afterState: json("after_state").$type<Record<string, any>>(),
  changedBy: uuid("changed_by").references(() => users.id),
  changedAt: timestamp("changed_at").defaultNow(),
  ipAddress: text("ip_address"),
  reason: text("reason"),
});

export const insertPermissionAuditLogSchema = createInsertSchema(permissionAuditLogs).omit({ id: true, changedAt: true });
export type InsertPermissionAuditLog = z.infer<typeof insertPermissionAuditLogSchema>;
export type PermissionAuditLog = typeof permissionAuditLogs.$inferSelect;

// ==========================================
// IMPORT BATCHES (for CSV import rollback)
// ==========================================

export const importBatches = pgTable("import_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  importType: varchar("import_type", { length: 50 }).notNull(), // 'users', 'clients', 'employees'
  fileName: text("file_name"),
  totalRecords: integer("total_records").default(0),
  createdRecords: integer("created_records").default(0),
  updatedRecords: integer("updated_records").default(0),
  skippedRecords: integer("skipped_records").default(0),
  failedRecords: integer("failed_records").default(0),
  recordIds: json("record_ids").$type<string[]>(), // Array of created record IDs for rollback
  status: varchar("status", { length: 20 }).default("COMPLETED"), // 'COMPLETED', 'ROLLED_BACK', 'PARTIAL'
  importedBy: uuid("imported_by").references(() => users.id),
  importedAt: timestamp("imported_at").defaultNow(),
  rolledBackAt: timestamp("rolled_back_at"),
  rolledBackBy: uuid("rolled_back_by").references(() => users.id),
  errorDetails: json("error_details").$type<Record<string, any>>(),
});

export const insertImportBatchSchema = createInsertSchema(importBatches).omit({ id: true, importedAt: true });
export type InsertImportBatch = z.infer<typeof insertImportBatchSchema>;
export type ImportBatch = typeof importBatches.$inferSelect;

// ==========================================
// SESSION BLOCKING RULES
// ==========================================

export const sessionBlockingRules = pgTable("session_blocking_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  ruleType: varchar("rule_type", { length: 20 }).notNull(), // 'IP', 'IP_RANGE', 'DEVICE', 'GEO', 'USER_AGENT'
  pattern: varchar("pattern", { length: 255 }).notNull(),
  description: text("description"),
  reason: text("reason"),
  expiresAt: timestamp("expires_at"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  isActive: boolean("is_active").default(true),
  hitCount: integer("hit_count").default(0),
  lastHitAt: timestamp("last_hit_at"),
});

export const insertSessionBlockingRuleSchema = createInsertSchema(sessionBlockingRules).omit({ id: true, createdAt: true });
export type InsertSessionBlockingRule = z.infer<typeof insertSessionBlockingRuleSchema>;
export type SessionBlockingRule = typeof sessionBlockingRules.$inferSelect;

// ==========================================
// MAINTENANCE SCHEDULES
// ==========================================

export const maintenanceSchedules = pgTable("maintenance_schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description"),
  scheduledStart: timestamp("scheduled_start").notNull(),
  scheduledEnd: timestamp("scheduled_end").notNull(),
  affectedModules: json("affected_modules").$type<string[]>(), // ['CAISSE', 'CREDITS', 'PLATFORM']
  notifyAt: json("notify_at").$type<string[]>(), // ['24h', '1h', '15m']
  status: varchar("status", { length: 20 }).default("SCHEDULED"), // 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

export const insertMaintenanceScheduleSchema = createInsertSchema(maintenanceSchedules).omit({ id: true, createdAt: true });
export type InsertMaintenanceSchedule = z.infer<typeof insertMaintenanceScheduleSchema>;
export type MaintenanceSchedule = typeof maintenanceSchedules.$inferSelect;

// ==========================================
// TRANSFER TEMPLATES
// ==========================================

export const transferTemplates = pgTable("transfer_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  sourceAccountPattern: text("source_account_pattern"), // Pattern or specific account
  destinationAccountPattern: text("destination_account_pattern"),
  frequency: varchar("frequency", { length: 20 }), // 'once', 'daily', 'weekly', 'monthly'
  defaultAmount: numeric("default_amount"),
  isActive: boolean("is_active").default(true),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTransferTemplateSchema = createInsertSchema(transferTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTransferTemplate = z.infer<typeof insertTransferTemplateSchema>;
export type TransferTemplate = typeof transferTemplates.$inferSelect;

// ==========================================
// CREDIT PLAN VERSIONS
// ==========================================

export const creditPlanVersions = pgTable("credit_plan_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  planId: uuid("plan_id").notNull(), // References credit plan
  version: integer("version").notNull(),
  snapshot: json("snapshot").notNull().$type<Record<string, any>>(),
  changedBy: uuid("changed_by").references(() => users.id),
  changedAt: timestamp("changed_at").defaultNow(),
  changeReason: text("change_reason"),
  isCurrent: boolean("is_current").default(false),
});

export const insertCreditPlanVersionSchema = createInsertSchema(creditPlanVersions).omit({ id: true, changedAt: true });
export type InsertCreditPlanVersion = z.infer<typeof insertCreditPlanVersionSchema>;
export type CreditPlanVersion = typeof creditPlanVersions.$inferSelect;

// ==========================================
// CREDIT PENALTY STRUCTURES
// ==========================================

export const creditPenaltyStructures = pgTable("credit_penalty_structures", {
  id: uuid("id").primaryKey().defaultRandom(),
  planId: uuid("plan_id").notNull(), // References credit plan
  daysLateMin: integer("days_late_min").notNull(),
  daysLateMax: integer("days_late_max"),
  penaltyType: varchar("penalty_type", { length: 20 }).notNull(), // 'FIXED', 'PERCENTAGE', 'COMPOUND'
  amount: numeric("amount").notNull(),
  maxPenalty: numeric("max_penalty"),
  gracePeriodDays: integer("grace_period_days").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCreditPenaltyStructureSchema = createInsertSchema(creditPenaltyStructures).omit({ id: true, createdAt: true });
export type InsertCreditPenaltyStructure = z.infer<typeof insertCreditPenaltyStructureSchema>;
export type CreditPenaltyStructure = typeof creditPenaltyStructures.$inferSelect;

// ==========================================
// HOLIDAY EXCEPTIONS
// ==========================================

export const holidayExceptions = pgTable("holiday_exceptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  agenceId: uuid("agence_id"), // null = all agencies
  date: timestamp("date").notNull(),
  name: text("name").notNull(),
  isRecurring: boolean("is_recurring").default(false), // Repeats every year
  affectsAllCaisses: boolean("affects_all_caisses").default(true),
  caisseIds: json("caisse_ids").$type<string[]>(), // Specific caisses if not all
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertHolidayExceptionSchema = createInsertSchema(holidayExceptions).omit({ id: true, createdAt: true });
export type InsertHolidayException = z.infer<typeof insertHolidayExceptionSchema>;
export type HolidayException = typeof holidayExceptions.$inferSelect;

// ==========================================
// ROLE TEMPLATES
// ==========================================

export const roleTemplates = pgTable("role_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  permissions: json("permissions").$type<string[]>().notNull(), // Array of permission codes
  isSystem: boolean("is_system").default(false), // System templates can't be deleted
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertRoleTemplateSchema = createInsertSchema(roleTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRoleTemplate = z.infer<typeof insertRoleTemplateSchema>;
export type RoleTemplate = typeof roleTemplates.$inferSelect;

// ==========================================
// ACCESS CODE ROTATION POLICIES
// ==========================================

export const accessCodeRotationPolicies = pgTable("access_code_rotation_policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  agenceId: uuid("agence_id"), // null = global policy
  rotationFrequencyDays: integer("rotation_frequency_days").default(30),
  maxUsageBeforeRotation: integer("max_usage_before_rotation"),
  notifyDaysBeforeExpiry: integer("notify_days_before_expiry").default(7),
  autoGenerateOnExpiry: boolean("auto_generate_on_expiry").default(false),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAccessCodeRotationPolicySchema = createInsertSchema(accessCodeRotationPolicies).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAccessCodeRotationPolicy = z.infer<typeof insertAccessCodeRotationPolicySchema>;
export type AccessCodeRotationPolicy = typeof accessCodeRotationPolicies.$inferSelect;

// ==========================================
// ACCESS CODE USAGE LOGS
// ==========================================

export const accessCodeUsageLogs = pgTable("access_code_usage_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  codeId: uuid("code_id").notNull(),
  usedBy: uuid("used_by").references(() => users.id),
  usedAt: timestamp("used_at").defaultNow(),
  action: varchar("action", { length: 50 }).notNull(), // 'CAISSE_OPEN', 'CAISSE_CLOSE', etc.
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  success: boolean("success").default(true),
  failureReason: text("failure_reason"),
});

export const insertAccessCodeUsageLogSchema = createInsertSchema(accessCodeUsageLogs).omit({ id: true, usedAt: true });
export type InsertAccessCodeUsageLog = z.infer<typeof insertAccessCodeUsageLogSchema>;
export type AccessCodeUsageLog = typeof accessCodeUsageLogs.$inferSelect;

// ==========================================
// ONBOARDING PROGRESS
// ==========================================

export const onboardingProgress = pgTable("onboarding_progress", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  currentStep: integer("current_step").default(1),
  completedSteps: json("completed_steps").$type<number[]>().default([]),
  stepData: json("step_data").$type<Record<string, any>>(), // Data collected at each step
  status: varchar("status", { length: 20 }).default("IN_PROGRESS"), // 'IN_PROGRESS', 'COMPLETED', 'SKIPPED'
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertOnboardingProgressSchema = createInsertSchema(onboardingProgress).omit({ id: true, startedAt: true });
export type InsertOnboardingProgress = z.infer<typeof insertOnboardingProgressSchema>;
export type OnboardingProgress = typeof onboardingProgress.$inferSelect;

// ==========================================
// REGULARIZATION RULES
// ==========================================

export const regularizationRules = pgTable("regularization_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  triggerCondition: varchar("trigger_condition", { length: 30 }).notNull(), // 'AMOUNT_THRESHOLD', 'TIME_DELAY', 'SOURCE_MATCH'
  conditionValue: json("condition_value").$type<Record<string, any>>(),
  action: varchar("action", { length: 30 }).notNull(), // 'AUTO_ASSIGN', 'AUTO_ESCALATE', 'AUTO_RESOLVE'
  actionConfig: json("action_config").$type<Record<string, any>>(),
  priority: integer("priority").default(0),
  isActive: boolean("is_active").default(true),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertRegularizationRuleSchema = createInsertSchema(regularizationRules).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRegularizationRule = z.infer<typeof insertRegularizationRuleSchema>;
export type RegularizationRule = typeof regularizationRules.$inferSelect;

// ==========================================
// SYSTEM ALERTS (for admin alert CRUD)
// ==========================================

export const systemAlerts = pgTable("system_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: varchar("type", { length: 30 }).notNull(), // 'INFO', 'WARNING', 'CRITICAL', 'SUCCESS'
  title: text("title").notNull(),
  message: text("message").notNull(),
  targetAudience: varchar("target_audience", { length: 30 }).default("ALL"), // 'ALL', 'ADMINS', 'AGENTS', 'SPECIFIC_USERS'
  targetUserIds: json("target_user_ids").$type<string[]>(),
  expiresAt: timestamp("expires_at"),
  isRead: boolean("is_read").default(false),
  readBy: json("read_by").$type<string[]>().default([]),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const insertSystemAlertSchema = createInsertSchema(systemAlerts).omit({ id: true, createdAt: true });
export type InsertSystemAlert = z.infer<typeof insertSystemAlertSchema>;
export type SystemAlert = typeof systemAlerts.$inferSelect;

// ============================================================
// Currency Presets — devises configurables depuis l'admin
// ============================================================

export const currencyPresets = pgTable("currency_presets", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),                              // ISO 4217: "XAF", "EUR"
  symbol: text("symbol").notNull(),                                   // Display: "FCFA", "€"
  symbolPosition: text("symbol_position").notNull().default("after"), // "before" | "after"
  locale: text("locale").notNull().default("fr-FR"),                  // Intl locale
  decimals: integer("decimals").notNull().default(0),                 // 0 for FCFA, 2 for EUR/USD
  actif: boolean("actif").notNull().default(true),
  ordre: integer("ordre").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCurrencyPresetSchema = createInsertSchema(currencyPresets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCurrencyPreset = z.infer<typeof insertCurrencyPresetSchema>;
export type CurrencyPreset = typeof currencyPresets.$inferSelect;
