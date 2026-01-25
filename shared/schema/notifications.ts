import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  uuid,
  json,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { agences } from "./agences";
import {
  notificationChannelEnum,
  notificationJobStatusEnum,
  otpPurposeEnum,
  otpChannelEnum,
  fallbackPolicyEnum,
  emailProviderTypeEnum,
} from "../enum/enums";

// ============================================================================
// NOTIFICATION JOBS (Unified Queue)
// ============================================================================

export const notificationJobs = pgTable(
  "notification_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channel: notificationChannelEnum("channel").notNull(),
    templateCode: text("template_code").notNull(),
    recipient: text("recipient").notNull(),
    payload: json("payload").notNull().$type<Record<string, unknown>>(),
    status: notificationJobStatusEnum("status").notNull().default("QUEUED"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    nextAttemptAt: timestamp("next_attempt_at").defaultNow(),
    lockedAt: timestamp("locked_at"),
    lockedUntil: timestamp("locked_until"),
    lastError: text("last_error"),
    correlationId: text("correlation_id").notNull(),
    agenceId: uuid("agence_id").references(() => agences.id),
    userId: uuid("user_id").references(() => users.id),
    providerResponse: json("provider_response"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    processedAt: timestamp("processed_at"),
  },
  (t) => ({
    idxStatusNextAttempt: index("idx_notif_jobs_status_next").on(
      t.status,
      t.nextAttemptAt
    ),
    uqCorrelationId: uniqueIndex("uq_notif_jobs_correlation").on(
      t.correlationId
    ),
    idxAgenceId: index("idx_notif_jobs_agence").on(t.agenceId),
    idxUserCreated: index("idx_notif_jobs_user_created").on(
      t.userId,
      t.createdAt
    ),
  })
);

export const insertNotificationJobSchema = createInsertSchema(
  notificationJobs
).omit({
  id: true,
  createdAt: true,
  processedAt: true,
  lockedAt: true,
  lockedUntil: true,
});
export type InsertNotificationJob = z.infer<
  typeof insertNotificationJobSchema
>;
export type NotificationJob = typeof notificationJobs.$inferSelect;

// ============================================================================
// EMAIL PROVIDER SETTINGS
// ============================================================================

export const emailProviderSettings = pgTable("email_provider_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: emailProviderTypeEnum("provider").notNull().default("SMTP"),
  providerName: text("provider_name").notNull().default("SMTP Default"),
  host: text("host"),
  port: integer("port"),
  username: text("username"),
  password: text("password"),
  fromEmail: text("from_email").notNull(),
  fromName: text("from_name").notNull().default("COFIN&CO-M"),
  apiKey: text("api_key"),
  isActive: boolean("is_active").notNull().default(false),
  isPrimary: boolean("is_primary").notNull().default(false),
  secure: boolean("secure").notNull().default(true),
  settings: json("settings"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEmailProviderSettingsSchema = createInsertSchema(
  emailProviderSettings
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEmailProviderSettings = z.infer<
  typeof insertEmailProviderSettingsSchema
>;
export type EmailProviderSettings =
  typeof emailProviderSettings.$inferSelect;

// ============================================================================
// EMAIL TEMPLATES
// ============================================================================

export const emailTemplates = pgTable("email_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  nom: text("nom").notNull(),
  subject: text("subject").notNull(),
  contenuHtml: text("contenu_html").notNull(),
  contenuText: text("contenu_text").notNull(),
  placeholders: text("placeholders"),
  description: text("description"),
  actif: boolean("actif").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEmailTemplateSchema = createInsertSchema(
  emailTemplates
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
export type EmailTemplate = typeof emailTemplates.$inferSelect;

// ============================================================================
// OTP CODES (Secure - hashed, not plaintext)
// ============================================================================

export const otpCodes = pgTable(
  "otp_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    destination: text("destination").notNull(),
    channel: otpChannelEnum("channel").notNull(),
    purpose: otpPurposeEnum("purpose").notNull(),
    codeHash: text("code_hash").notNull(),
    salt: text("salt").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    consumedAt: timestamp("consumed_at"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    idxDestPurpose: index("idx_otp_codes_dest_purpose").on(
      t.destination,
      t.purpose,
      t.createdAt
    ),
    idxExpiresAt: index("idx_otp_codes_expires").on(t.expiresAt),
    idxUserId: index("idx_otp_codes_user").on(t.userId),
  })
);

export const insertOtpCodeSchema = createInsertSchema(otpCodes).omit({
  id: true,
  createdAt: true,
  consumedAt: true,
});
export type InsertOtpCode = z.infer<typeof insertOtpCodeSchema>;
export type OtpCode = typeof otpCodes.$inferSelect;

// ============================================================================
// NOTIFICATION DELIVERY RECEIPTS (MTN SMS Delivery Status)
// ============================================================================

export const notificationDeliveryReceipts = pgTable(
  "notification_delivery_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notificationJobId: uuid("notification_job_id")
      .notNull()
      .references(() => notificationJobs.id),
    requestId: text("request_id").notNull(),
    senderAddress: text("sender_address"),
    receiverAddress: text("receiver_address"),
    status: text("status"),
    rawResponse: json("raw_response"),
    checkedAt: timestamp("checked_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uqRequestId: uniqueIndex("uq_delivery_receipts_request").on(t.requestId),
    idxJobId: index("idx_delivery_receipts_job").on(t.notificationJobId),
  })
);

export const insertNotificationDeliveryReceiptSchema = createInsertSchema(
  notificationDeliveryReceipts
).omit({ id: true, createdAt: true, checkedAt: true });
export type InsertNotificationDeliveryReceipt = z.infer<
  typeof insertNotificationDeliveryReceiptSchema
>;
export type NotificationDeliveryReceipt =
  typeof notificationDeliveryReceipts.$inferSelect;

// ============================================================================
// NOTIFICATION SETTINGS (Global + per-agency config)
// ============================================================================

export const notificationSettings = pgTable(
  "notification_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agenceId: uuid("agence_id").references(() => agences.id),
    smsEnabled: boolean("sms_enabled").notNull().default(true),
    emailEnabled: boolean("email_enabled").notNull().default(false),
    pushEnabled: boolean("push_enabled").notNull().default(true),
    fallbackPolicy: fallbackPolicyEnum("fallback_policy")
      .notNull()
      .default("SMS_ONLY"),
    otpChannel: otpChannelEnum("otp_channel").notNull().default("SMS"),
    otpMaxPerMinute: integer("otp_max_per_minute").notNull().default(3),
    otpMaxPerDay: integer("otp_max_per_day").notNull().default(20),
    smsQuotaDaily: integer("sms_quota_daily").notNull().default(1000),
    emailQuotaDaily: integer("email_quota_daily").notNull().default(500),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    uqAgence: uniqueIndex("uq_notif_settings_agence").on(t.agenceId),
  })
);

export const insertNotificationSettingsSchema = createInsertSchema(
  notificationSettings
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertNotificationSettings = z.infer<
  typeof insertNotificationSettingsSchema
>;
export type NotificationSettings =
  typeof notificationSettings.$inferSelect;
