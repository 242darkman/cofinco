/**
 * Mobile Money Reconciliation Report Cron Job
 * Generates daily reconciliation reports per provider with anomaly detection
 *
 * Schedule: Runs at 00:30 every day
 */

import { db } from "../db";
import {
  paymentIntents,
  mmReconciliationReports,
  mouvementsFinanciers,
  type InsertMmReconciliationReport,
  type ReconciliationAnomaly,
} from "@shared/schema";
import { eq, and, gte, lt, sql, inArray } from "drizzle-orm";

// Re-export for convenience
export type Anomaly = ReconciliationAnomaly;

export interface ReconciliationStats {
  totalIntents: number;
  successCount: number;
  failedCount: number;
  pendingCount: number;
  expiredCount: number;
  montantAttendu: number;  // Total of PENDING + SUCCESS
  montantConfirme: number; // Total of SUCCESS only
  ecart: number;           // Difference
}

/**
 * Get the start of a day in UTC
 */
function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

/**
 * Get yesterday's date
 */
function yesterday(): Date {
  const result = new Date();
  result.setDate(result.getDate() - 1);
  return result;
}

/**
 * Get all payment intents for a specific date and provider
 */
async function getIntentsForDateAndProvider(
  date: Date,
  provider: "MTN" | "AIRTEL"
): Promise<Array<{
  id: string;
  status: string;
  amount: string;
  externalRef: string | null;
  mouvementId: string | null;
  createdAt: Date;
  updatedAt: Date;
  clientId: string | null;
  creditId: string | null;
  compteId: string | null;
  tontineId: string | null;
  type: string;
}>> {
  const dayStart = startOfDay(date);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const intents = await db
    .select({
      id: paymentIntents.id,
      status: paymentIntents.status,
      amount: paymentIntents.amount,
      externalRef: paymentIntents.externalRef,
      mouvementId: paymentIntents.mouvementId,
      createdAt: paymentIntents.createdAt,
      updatedAt: paymentIntents.updatedAt,
      clientId: paymentIntents.clientId,
      creditId: paymentIntents.creditId,
      compteId: paymentIntents.compteId,
      tontineId: paymentIntents.tontineId,
      type: paymentIntents.type,
    })
    .from(paymentIntents)
    .where(
      and(
        eq(paymentIntents.provider, provider),
        gte(paymentIntents.createdAt, dayStart),
        lt(paymentIntents.createdAt, dayEnd)
      )
    );

  return intents;
}

/**
 * Calculate statistics from intents
 */
function calculateStats(intents: Array<{ status: string; amount: string }>): ReconciliationStats {
  const stats: ReconciliationStats = {
    totalIntents: intents.length,
    successCount: 0,
    failedCount: 0,
    pendingCount: 0,
    expiredCount: 0,
    montantAttendu: 0,
    montantConfirme: 0,
    ecart: 0,
  };

  for (const intent of intents) {
    const amount = parseFloat(intent.amount || "0");

    switch (intent.status) {
      case "SUCCESS":
        stats.successCount++;
        stats.montantConfirme += amount;
        stats.montantAttendu += amount;
        break;
      case "FAILED":
        stats.failedCount++;
        break;
      case "PENDING":
        stats.pendingCount++;
        stats.montantAttendu += amount;
        break;
      case "EXPIRED":
        stats.expiredCount++;
        break;
    }
  }

  stats.ecart = stats.montantAttendu - stats.montantConfirme;

  return stats;
}

/**
 * Detect anomalies in intents
 */
function detectAnomalies(
  intents: Array<{
    id: string;
    status: string;
    amount: string;
    externalRef: string | null;
    mouvementId: string | null;
    createdAt: Date;
    updatedAt: Date;
    clientId: string | null;
    creditId: string | null;
    compteId: string | null;
    tontineId: string | null;
    type: string;
  }>
): ReconciliationAnomaly[] {
  const anomalies: ReconciliationAnomaly[] = [];
  const now = new Date();
  const PENDING_TIMEOUT_MINUTES = 30;

  // Track external refs for duplicate detection
  const externalRefs = new Map<string, string[]>();

  for (const intent of intents) {
    // 1. Check for PENDING timeout (> 30 minutes)
    if (intent.status === "PENDING") {
      const ageMinutes = (now.getTime() - new Date(intent.createdAt).getTime()) / (1000 * 60);
      if (ageMinutes > PENDING_TIMEOUT_MINUTES) {
        anomalies.push({
          intentId: intent.id,
          type: "PENDING_TIMEOUT",
          description: `Intent en PENDING depuis ${Math.round(ageMinutes)} minutes (limite: ${PENDING_TIMEOUT_MINUTES}min)`,
          severity: ageMinutes > 120 ? "HIGH" : "MEDIUM",
          montant: intent.amount,
        });
      }
    }

    // 2. Check for SUCCESS without mouvement
    if (intent.status === "SUCCESS" && !intent.mouvementId) {
      anomalies.push({
        intentId: intent.id,
        type: "SUCCESS_NO_MOUVEMENT",
        description: "Transaction SUCCESS mais aucun mouvement financier créé",
        severity: "HIGH",
        montant: intent.amount,
      });
    }

    // 3. Track external refs for duplicate detection
    if (intent.externalRef) {
      const existing = externalRefs.get(intent.externalRef) || [];
      existing.push(intent.id);
      externalRefs.set(intent.externalRef, existing);
    }

    // 4. Check for orphan intents (no linked entity)
    if (!intent.clientId && !intent.creditId && !intent.compteId && !intent.tontineId) {
      anomalies.push({
        intentId: intent.id,
        type: "OTHER",
        description: "Intent sans entité liée (client, crédit, compte, ou tontine)",
        severity: "LOW",
        montant: intent.amount,
      });
    }
  }

  // 5. Report duplicates using Array.from to iterate Map entries
  const entries = Array.from(externalRefs.entries());
  for (const [ref, intentIds] of entries) {
    if (intentIds.length > 1) {
      for (const intentId of intentIds) {
        anomalies.push({
          intentId,
          type: "DUPLICATE",
          description: `Référence externe dupliquée: ${ref} (${intentIds.length} occurrences)`,
          severity: "HIGH",
        });
      }
    }
  }

  return anomalies;
}

/**
 * Generate daily reconciliation report for a specific date and provider
 */
export async function generateReconciliationReport(
  date: Date,
  provider: "MTN" | "AIRTEL",
  agenceId?: string
): Promise<{
  reportId: string;
  stats: ReconciliationStats;
  anomalies: Anomaly[];
}> {
  console.log(`[Reconciliation] Generating report for ${provider} on ${date.toISOString().split("T")[0]}`);

  // Get intents for the date/provider
  let intents = await getIntentsForDateAndProvider(date, provider);

  // Filter by agency if specified
  if (agenceId) {
    intents = intents.filter((i) => {
      // We would need to join with related tables to filter by agenceId
      // For now, we skip agency filtering in the query
      return true;
    });
  }

  // Calculate statistics
  const stats = calculateStats(intents);

  // Detect anomalies
  const anomalies = detectAnomalies(intents);

  // Create report record - use explicit type assertion for anomalies
  const anomaliesList: ReconciliationAnomaly[] = anomalies.map((a) => ({
    intentId: a.intentId,
    type: a.type,
    description: a.description,
    severity: a.severity,
    montant: a.montant,
  }));

  const [report] = await db
    .insert(mmReconciliationReports)
    .values({
      dateRapport: startOfDay(date),
      provider,
      agenceId: agenceId || null,
      totalIntents: stats.totalIntents,
      successCount: stats.successCount,
      failedCount: stats.failedCount,
      pendingCount: stats.pendingCount,
      expiredCount: stats.expiredCount,
      montantAttendu: stats.montantAttendu.toString(),
      montantConfirme: stats.montantConfirme.toString(),
      ecart: stats.ecart.toString(),
      anomalies: anomaliesList,
      anomaliesCount: anomaliesList.length,
      statut: "GENERATED",
    })
    .returning();

  console.log(
    `[Reconciliation] Report generated: ${report.id} - ` +
    `${stats.successCount}/${stats.totalIntents} success, ` +
    `${anomalies.length} anomalies, ` +
    `écart: ${stats.ecart}`
  );

  return {
    reportId: report.id,
    stats,
    anomalies,
  };
}

/**
 * Generate daily reconciliation reports for all providers
 * Called by cron at 00:30 every day
 */
export async function generateDailyReconciliationReports(date?: Date): Promise<{
  success: boolean;
  reports: Array<{ provider: string; reportId: string; stats: ReconciliationStats; anomalyCount: number }>;
  error?: string;
}> {
  const reportDate = date || yesterday();
  const startTime = Date.now();

  console.log(`[Reconciliation] Starting daily report generation for ${reportDate.toISOString().split("T")[0]}`);

  const results: Array<{
    provider: string;
    reportId: string;
    stats: ReconciliationStats;
    anomalyCount: number;
  }> = [];

  try {
    for (const provider of ["MTN", "AIRTEL"] as const) {
      const result = await generateReconciliationReport(reportDate, provider);
      results.push({
        provider,
        reportId: result.reportId,
        stats: result.stats,
        anomalyCount: result.anomalies.length,
      });
    }

    const duration = Date.now() - startTime;
    console.log(`[Reconciliation] Daily reports completed in ${duration}ms`);

    return { success: true, reports: results };
  } catch (error) {
    console.error("[Reconciliation] Error generating daily reports:", error);
    return {
      success: false,
      reports: results,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get reconciliation reports with filters
 */
export async function getReconciliationReports(filters: {
  from?: Date;
  to?: Date;
  provider?: "MTN" | "AIRTEL";
  statut?: string;
  limit?: number;
}): Promise<Array<{
  id: string;
  dateRapport: Date;
  provider: string;
  totalIntents: number | null;
  successCount: number | null;
  failedCount: number | null;
  pendingCount: number | null;
  montantAttendu: string | null;
  montantConfirme: string | null;
  ecart: string | null;
  anomalies: unknown;
  statut: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}>> {
  const conditions = [];

  if (filters.from) {
    conditions.push(gte(mmReconciliationReports.dateRapport, filters.from));
  }
  if (filters.to) {
    conditions.push(lt(mmReconciliationReports.dateRapport, filters.to));
  }
  if (filters.provider) {
    conditions.push(eq(mmReconciliationReports.provider, filters.provider));
  }
  if (filters.statut) {
    conditions.push(eq(mmReconciliationReports.statut, filters.statut));
  }

  const query = db
    .select()
    .from(mmReconciliationReports)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${mmReconciliationReports.dateRapport} DESC`)
    .limit(filters.limit || 50);

  return await query;
}

/**
 * Mark a report as reviewed
 */
export async function markReportReviewed(
  reportId: string,
  reviewedBy: string,
  notes?: string
): Promise<void> {
  await db
    .update(mmReconciliationReports)
    .set({
      statut: "REVIEWED",
      reviewedBy,
      reviewedAt: new Date(),
      // Notes could be stored in a separate field if needed
    })
    .where(eq(mmReconciliationReports.id, reportId));

  console.log(`[Reconciliation] Report ${reportId} marked as reviewed by ${reviewedBy}`);
}

/**
 * Mark a report as resolved
 */
export async function markReportResolved(
  reportId: string,
  resolvedBy: string
): Promise<void> {
  await db
    .update(mmReconciliationReports)
    .set({
      statut: "RESOLVED",
      reviewedBy: resolvedBy,
      reviewedAt: new Date(),
    })
    .where(eq(mmReconciliationReports.id, reportId));

  console.log(`[Reconciliation] Report ${reportId} marked as resolved by ${resolvedBy}`);
}

// Cron scheduler
const CRON_HOUR = 0;
const CRON_MINUTE = 30;
let cronTimeoutId: NodeJS.Timeout | null = null;

/**
 * Calculate milliseconds until next scheduled run
 */
function getNextRunDelay(): number {
  const now = new Date();
  const nextRun = new Date(now);
  nextRun.setHours(CRON_HOUR, CRON_MINUTE, 0, 0);

  // If the time has passed today, schedule for tomorrow
  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }

  return nextRun.getTime() - now.getTime();
}

/**
 * Schedule the next cron run
 */
function scheduleNextRun(): void {
  const delay = getNextRunDelay();
  const nextRunDate = new Date(Date.now() + delay);

  console.log(`[Reconciliation Cron] Next run scheduled for ${nextRunDate.toISOString()}`);

  cronTimeoutId = setTimeout(async () => {
    await generateDailyReconciliationReports();
    scheduleNextRun(); // Schedule next run after completion
  }, delay);
}

/**
 * Start the reconciliation report cron job
 * Runs at 00:30 every day
 */
export function startReconciliationReportCron(): void {
  console.log("[Reconciliation Cron] Starting reconciliation report cron job...");
  scheduleNextRun();
  console.log("[Reconciliation Cron] Reconciliation report cron configured: runs daily at 00:30");
}

/**
 * Stop the reconciliation report cron job
 */
export function stopReconciliationReportCron(): void {
  if (cronTimeoutId) {
    clearTimeout(cronTimeoutId);
    cronTimeoutId = null;
  }
  console.log("[Reconciliation Cron] Reconciliation report cron stopped");
}

export default {
  generateDailyReconciliationReports,
  generateReconciliationReport,
  getReconciliationReports,
  markReportReviewed,
  markReportResolved,
  startReconciliationReportCron,
  stopReconciliationReportCron,
};
