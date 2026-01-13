import { pgTable, text, varchar, integer, boolean, numeric, timestamp, uuid, json, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth"; // Assuming auth is created

// Helper to generate agency code
function generateAgenceCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "COF";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// System Settings table
export const systemSettings = pgTable("system_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  agenceName: text("agence_name").default("COFIN - Microfinance"),
  agenceCode: text("agence_code").$defaultFn(generateAgenceCode).unique(),
  devise: text("devise").default("XAF"),
  pays: text("pays").default("République du Congo"),
  adresse: text("adresse"),
  telephone: text("telephone"),
  email: text("email"),
  sessionTimeout: integer("session_timeout").default(30),
  maxLoginAttempts: integer("max_login_attempts").default(5),
  passwordMinLength: integer("password_min_length").default(6),
  backupFrequency: text("backup_frequency").default("daily"),
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
  passwordMinLength: integer("password_min_length").default(8),
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
  theme: text("theme").default("dark"),
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
  priorite: text("priorite").notNull().default("normale"), 
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
  status: text("status").notNull().default("success"), 
  riskLevel: text("risk_level").default("low"), 
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
  status: text("status").notNull().default("pending"),
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
  status: text("status"),
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
