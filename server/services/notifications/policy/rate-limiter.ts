import { db } from "../../../db";
import { notificationJobs, notificationSettings } from "@shared/schema";
import { eq, and, gte, isNull, sql } from "drizzle-orm";

// ============================================================================
// TYPES
// ============================================================================

export interface QuotaCheckResult {
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
}

// ============================================================================
// QUOTA CHECKS
// ============================================================================

/**
 * Check if the daily SMS quota has been reached.
 * Counts SENT + QUEUED + PROCESSING jobs for today.
 */
export async function checkSmsQuota(
  agenceId?: string
): Promise<QuotaCheckResult> {
  const settings = await getQuotaSettings(agenceId);
  const limit = settings?.smsQuotaDaily ?? 1000;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const conditions = [
    eq(notificationJobs.channel, "SMS"),
    gte(notificationJobs.createdAt, todayStart),
    sql`${notificationJobs.status} IN ('SENT', 'QUEUED', 'PROCESSING')`,
  ];

  if (agenceId) {
    conditions.push(eq(notificationJobs.agenceId, agenceId));
  }

  const [result] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(notificationJobs)
    .where(and(...conditions));

  const current = result?.count ?? 0;

  return {
    allowed: current < limit,
    current,
    limit,
    remaining: Math.max(0, limit - current),
  };
}

/**
 * Check if the daily email quota has been reached.
 * Counts SENT + QUEUED + PROCESSING jobs for today.
 */
export async function checkEmailQuota(
  agenceId?: string
): Promise<QuotaCheckResult> {
  const settings = await getQuotaSettings(agenceId);
  const limit = settings?.emailQuotaDaily ?? 500;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const conditions = [
    eq(notificationJobs.channel, "EMAIL"),
    gte(notificationJobs.createdAt, todayStart),
    sql`${notificationJobs.status} IN ('SENT', 'QUEUED', 'PROCESSING')`,
  ];

  if (agenceId) {
    conditions.push(eq(notificationJobs.agenceId, agenceId));
  }

  const [result] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(notificationJobs)
    .where(and(...conditions));

  const current = result?.count ?? 0;

  return {
    allowed: current < limit,
    current,
    limit,
    remaining: Math.max(0, limit - current),
  };
}

/**
 * Check quota for a given channel.
 */
export async function checkChannelQuota(
  channel: "SMS" | "EMAIL",
  agenceId?: string
): Promise<QuotaCheckResult> {
  if (channel === "SMS") return checkSmsQuota(agenceId);
  if (channel === "EMAIL") return checkEmailQuota(agenceId);
  return { allowed: true, current: 0, limit: Infinity, remaining: Infinity };
}

// ============================================================================
// HELPERS
// ============================================================================

async function getQuotaSettings(agenceId?: string) {
  if (agenceId) {
    const [agencySettings] = await db
      .select({
        smsQuotaDaily: notificationSettings.smsQuotaDaily,
        emailQuotaDaily: notificationSettings.emailQuotaDaily,
      })
      .from(notificationSettings)
      .where(eq(notificationSettings.agenceId, agenceId))
      .limit(1);
    if (agencySettings) return agencySettings;
  }

  const [globalSettings] = await db
    .select({
      smsQuotaDaily: notificationSettings.smsQuotaDaily,
      emailQuotaDaily: notificationSettings.emailQuotaDaily,
    })
    .from(notificationSettings)
    .where(isNull(notificationSettings.agenceId))
    .limit(1);

  return globalSettings || null;
}
