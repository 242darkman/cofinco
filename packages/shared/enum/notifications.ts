/**
 * Enums Drizzle — domaine « notifications ».
 *
 * Extrait de l'ancien fichier monolithique enums.ts (façade conservée) :
 * importer via `@shared/enum/enums` reste la voie standard.
 */

import { pgEnum } from "drizzle-orm/pg-core";

// ============================================
// NOTIFICATION SYSTEM
// ============================================

export const notificationChannelEnum = pgEnum("notification_channel_enum", [
  "SMS",
  "EMAIL",
  "PUSH",
  "IN_APP",
]);

export const notificationJobStatusEnum = pgEnum("notification_job_status_enum", [
  "QUEUED",
  "PROCESSING",
  "SENT",
  "FAILED",
  "DEAD_LETTER",
]);

export const notificationScheduleStatusEnum = pgEnum("notification_schedule_status_enum", [
  "PENDING",
  "SENT",
  "CANCELLED",
  "SKIPPED",
]);

export const scheduleSourceTypeEnum = pgEnum("schedule_source_type_enum", [
  "CREDIT",
  "TONTINE",
  "INVESTIGATION",
]);

export const otpPurposeEnum = pgEnum("otp_purpose_enum", [
  "PASSWORD_RESET",
  "TRANSFER_VALIDATION",
  "CREDIT_VALIDATION",
  "SECURITY_CHANGE",
  "CAISSE_OPERATION",
]);

export const otpChannelEnum = pgEnum("otp_channel_enum", [
  "SMS",
  "EMAIL",
]);

export const fallbackPolicyEnum = pgEnum("fallback_policy_enum", [
  "SMS_ONLY",
  "EMAIL_ONLY",
  "SMS_THEN_EMAIL",
  "EMAIL_THEN_SMS",
]);

export const emailProviderTypeEnum = pgEnum("email_provider_type_enum", [
  "SMTP",
  "RESEND",
  "SENDGRID",
]);
