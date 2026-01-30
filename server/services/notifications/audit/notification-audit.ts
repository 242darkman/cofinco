import { db } from "../../../db";
import { notificationJobs } from "@shared/schema";
import { sql, eq, gte, and } from "drizzle-orm";
import { createLogger } from "../../../lib/logger";

const logger = createLogger('NotifAudit');

// ============================================================================
// TYPES
// ============================================================================

export interface NotificationMetrics {
  total: number;
  queued: number;
  processing: number;
  sent: number;
  failed: number;
  deadLetter: number;
  byChannel: {
    sms: { sent: number; failed: number };
    email: { sent: number; failed: number };
  };
  todaySent: number;
  todayFailed: number;
}

export interface NotificationAuditEntry {
  correlationId: string;
  channel: string;
  recipient: string; // Masked for PII
  status: string;
  error?: string;
  timestamp: Date;
}

// ============================================================================
// PII MINIMISATION
// ============================================================================

/**
 * Mask a phone number for logs/audit.
 * +242065123456 -> +242065***456
 */
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 6) return "***";
  return phone.substring(0, phone.length - 6) + "***" + phone.substring(phone.length - 3);
}

/**
 * Mask an email for logs/audit.
 * user@example.com -> u***@example.com
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return "***";
  const [local, domain] = email.split("@");
  if (local.length <= 1) return `${local}***@${domain}`;
  return `${local[0]}***@${domain}`;
}

/**
 * Mask a recipient based on channel type.
 */
export function maskRecipient(recipient: string, channel: string): string {
  if (channel === "EMAIL") return maskEmail(recipient);
  return maskPhone(recipient);
}

// ============================================================================
// STRUCTURED LOGGING
// ============================================================================

/**
 * Log a notification event with structured data (PII-safe).
 */
export function logNotificationEvent(
  level: "info" | "warn" | "error",
  message: string,
  context: {
    correlationId?: string;
    channel?: string;
    recipient?: string;
    status?: string;
    error?: string;
    jobId?: string;
  }
): void {
  const safeContext = {
    ...context,
    recipient: context.recipient && context.channel
      ? maskRecipient(context.recipient, context.channel)
      : undefined,
  };

  const logContext = {
    ...safeContext,
  };

  switch (level) {
    case "error":
      logger.error(logContext, message);
      break;
    case "warn":
      logger.warn(logContext, message);
      break;
    default:
      logger.info(logContext, message);
  }
}

// ============================================================================
// METRICS
// ============================================================================

/**
 * Get notification metrics for monitoring dashboard.
 */
export async function getNotificationMetrics(): Promise<NotificationMetrics> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Overall counts by status
  const statusCounts = await db.execute<{ status: string; count: string }>(sql`
    SELECT status, COUNT(*)::text as count
    FROM notification_jobs
    GROUP BY status
  `);

  const counts: Record<string, number> = {};
  for (const row of statusCounts.rows) {
    counts[row.status] = parseInt(row.count, 10);
  }

  // Today's counts by channel and status
  const todayCounts = await db.execute<{
    channel: string;
    status: string;
    count: string;
  }>(sql`
    SELECT channel, status, COUNT(*)::text as count
    FROM notification_jobs
    WHERE created_at >= ${todayStart}
    GROUP BY channel, status
  `);

  let todaySent = 0;
  let todayFailed = 0;
  const byChannel = {
    sms: { sent: 0, failed: 0 },
    email: { sent: 0, failed: 0 },
  };

  for (const row of todayCounts.rows) {
    const c = parseInt(row.count, 10);
    const ch = row.channel.toLowerCase() as "sms" | "email";

    if (row.status === "SENT") {
      todaySent += c;
      if (ch in byChannel) byChannel[ch].sent += c;
    }
    if (row.status === "FAILED" || row.status === "DEAD_LETTER") {
      todayFailed += c;
      if (ch in byChannel) byChannel[ch].failed += c;
    }
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return {
    total,
    queued: counts["QUEUED"] || 0,
    processing: counts["PROCESSING"] || 0,
    sent: counts["SENT"] || 0,
    failed: counts["FAILED"] || 0,
    deadLetter: counts["DEAD_LETTER"] || 0,
    byChannel,
    todaySent,
    todayFailed,
  };
}

/**
 * Get recent failed/dead-letter jobs for admin monitoring.
 */
export async function getRecentFailedJobs(limit = 20) {
  return db
    .select({
      id: notificationJobs.id,
      channel: notificationJobs.channel,
      templateCode: notificationJobs.templateCode,
      status: notificationJobs.status,
      attempts: notificationJobs.attempts,
      lastError: notificationJobs.lastError,
      correlationId: notificationJobs.correlationId,
      createdAt: notificationJobs.createdAt,
    })
    .from(notificationJobs)
    .where(
      sql`${notificationJobs.status} IN ('FAILED', 'DEAD_LETTER')`
    )
    .orderBy(sql`${notificationJobs.createdAt} DESC`)
    .limit(limit);
}
