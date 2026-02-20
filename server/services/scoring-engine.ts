/**
 * Scoring Engine — Unified, event-driven scoring system
 *
 * Single source of truth for all client scoring. Replaces:
 *   - server/scoring-service.ts (deleted)
 *   - server/services/scoring.ts (deleted)
 *   - storage/clients.ts addLoyaltyPoints/calculateEngagementScore (deleted)
 *
 * Architecture:
 *   1. Financial operations call recordScoreEvent() with an idempotent refId
 *   2. The event is persisted in client_score_events (immutable ledger)
 *   3. recalculateClientScore() derives ALL scores from real data
 *   4. Results are persisted in client_score_state and synced to clients table
 */

import { db } from "../db";
import {
  clients,
  users,
  credits,
  comptes,
  echeancesCredits,
  mouvementsFinanciers,
  clientScoreEvents,
  clientScoreState,
} from "@shared/schema";
import { membresTontine, contributionsTontine } from "@shared/schema/tontines";
import { eq, and, gte, lte, sql, desc, count, sum } from "drizzle-orm";
import { SegmentClient } from "@shared/enum/status-constants";
import { StatutCredit, StatutCompte } from "@shared/enum/status-constants";
import { createLogger } from "../lib/logger";

const logger = createLogger("ScoringEngine");

type DbOrTx = typeof db;

// ============================================================================
// WEIGHTS & THRESHOLDS
// ============================================================================

export const SCORE_WEIGHTS = {
  PAYMENT: 0.40,      // Repayment discipline
  LOYALTY: 0.30,      // Loyalty & tenure
  ENGAGEMENT: 0.20,   // Activity & savings engagement
  COMPLIANCE: 0.10,   // KYC, profile completeness
} as const;

export const SEGMENT_THRESHOLDS = {
  VIP:      { min: 80, minCreditsRembourses: 2, minAncienneteMois: 12 },
  PREMIUM:  { min: 65, minCreditsRembourses: 1, minAncienneteMois: 6 },
  STANDARD: { min: 40 },
  RISQUE:   { max: 40 },
} as const;

export const POINTS_TABLE: Record<string, (montant?: number) => number> = {
  EPARGNE_DEPOT:         (m) => Math.floor((m || 0) / 1000),
  CREDIT_REMBOURSEMENT:  (m) => Math.floor((m || 0) / 500) + 5,
  CREDIT_SOLDE:          () => 50,
  TONTINE_CONTRIBUTION:  (m) => Math.floor((m || 0) / 2000) + 3,
  KYC_VERIFIED:          () => 20,
  PROFILE_COMPLETED:     () => 10,
  INCIDENT_RETARD:       () => -15,
  INCIDENT_DEFAUT:       () => -30,
  TONTINE_PENALITE:      () => -10,
  COMPTE_BLOQUE:         () => -20,
  BONUS_MANUEL:          (m) => m || 0,
  MALUS_MANUEL:          (m) => -(m || 0),
  INITIAL_SCORE:         () => 0,
  RECALCUL_COMPLET:      () => 0,
};

// ============================================================================
// TYPES
// ============================================================================

export interface ScoreEventInput {
  clientId: string;
  agenceId?: string;
  eventType: string;
  refId: string;
  refType: string;
  montant?: number;
  reason?: string;
  metadata?: Record<string, any>;
  createdBy?: string;
}

interface CreditDataSummary {
  totalCredits: number;
  creditsSoldes: number;
  creditsEnRetard: number;
  creditsActifs: number;
  tauxRemboursement: number;
  joursRetardMoyen: number;
}

interface EventSummary {
  totalPoints: number;
  totalDepots: number;
  totalRemboursements: number;
  totalCotisationsTontine: number;
  totalIncidents: number;
}

export interface ScoreResult {
  scoreGlobal: number;
  segment: string;
  scorePayment: number;
  scoreLoyalty: number;
  scoreEngagement: number;
  scoreCompliance: number;
  tauxRemboursement: string;
  totalPointsFidelite: number;
}

interface RecalcMeta {
  clientId: string;
  segmentChanged: boolean;
  previousSegment: string;
  agenceId?: string;
  clientName?: string;
}

interface RecalcResult extends ScoreResult {
  _meta?: RecalcMeta;
}

// ============================================================================
// CORE: Record a scoring event (idempotent)
// ============================================================================

/**
 * Records a score event and recalculates the client's score.
 * Idempotent: if (eventType, refId) already exists, returns existing without recalc.
 * All DB writes (event insert + recalculation + state upsert + clients sync) run in a single transaction.
 */
export async function recordScoreEvent(input: ScoreEventInput): Promise<{
  isNew: boolean;
  result: ScoreResult;
}> {
  // 1. Check idempotency (read-only, outside transaction)
  const existing = await db.select({ id: clientScoreEvents.id })
    .from(clientScoreEvents)
    .where(and(
      eq(clientScoreEvents.eventType, input.eventType as any),
      eq(clientScoreEvents.refId, input.refId)
    ))
    .limit(1);

  if (existing.length > 0) {
    const state = await getScoreState(input.clientId);
    return {
      isNew: false,
      result: state ? {
        scoreGlobal: state.scoreGlobal,
        segment: state.segment,
        scorePayment: state.scorePayment,
        scoreLoyalty: state.scoreLoyalty,
        scoreEngagement: state.scoreEngagement,
        scoreCompliance: state.scoreCompliance,
        tauxRemboursement: state.tauxRemboursement,
        totalPointsFidelite: state.totalPointsFidelite,
      } : { scoreGlobal: 50, segment: 'Standard', scorePayment: 50, scoreLoyalty: 50, scoreEngagement: 50, scoreCompliance: 50, tauxRemboursement: '100', totalPointsFidelite: 0 },
    };
  }

  // 2. Validate mandatory reason for manual events
  if (["BONUS_MANUEL", "MALUS_MANUEL"].includes(input.eventType) && !input.reason) {
    throw new Error("Un motif est obligatoire pour les ajustements manuels de score");
  }

  // 3. Calculate points delta
  const calculator = POINTS_TABLE[input.eventType];
  const pointsDelta = calculator ? calculator(input.montant) : 0;

  // 4. Transaction: event insert + recalculate + persist (atomic)
  const recalcResult = await db.transaction(async (tx) => {
    await tx.insert(clientScoreEvents).values({
      clientId: input.clientId,
      agenceId: input.agenceId,
      eventType: input.eventType as any,
      refId: input.refId,
      refType: input.refType,
      pointsDelta,
      montant: input.montant?.toString(),
      reason: input.reason,
      metadata: input.metadata,
      createdBy: input.createdBy,
    }).onConflictDoNothing();

    return _recalculate(input.clientId, tx as any);
  });

  // 5. Side effects AFTER transaction commit (WS + domain events)
  _broadcastScoreUpdate(recalcResult);

  logger.info({
    clientId: input.clientId,
    eventType: input.eventType,
    pointsDelta,
    scoreGlobal: recalcResult.scoreGlobal,
    segment: recalcResult.segment,
  }, "Score event recorded");

  return { isNew: true, result: recalcResult };
}

// ============================================================================
// RECALCULATION: Derives ALL scores from real data
// ============================================================================

/**
 * Public entry point: recalculate + persist + broadcast.
 * Optionally records a RECALCUL_COMPLET audit event (idempotent per day/week).
 * @param source - 'manual' (1/day), 'cron' (1/week), or undefined (no audit event)
 */
export async function recalculateClientScore(
  clientId: string,
  options?: { source?: "manual" | "cron"; createdBy?: string },
): Promise<ScoreResult> {
  const result = await _recalculate(clientId, db);
  _broadcastScoreUpdate(result);

  // Record audit event (idempotent: manual=1/day, cron=1/week)
  if (options?.source) {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const refId =
      options.source === "cron"
        ? `recalc-cron-${clientId}-${getIsoWeek()}`
        : `recalc-manual-${clientId}-${today}`;
    try {
      await db
        .insert(clientScoreEvents)
        .values({
          clientId,
          agenceId: result._meta?.agenceId,
          eventType: "RECALCUL_COMPLET" as any,
          refId,
          refType: "recalculation",
          pointsDelta: 0,
          reason: options.source === "cron" ? "Recalcul hebdomadaire automatique" : "Recalcul manuel",
          createdBy: options.createdBy,
        })
        .onConflictDoNothing();
    } catch {
      // Audit event failure must never break recalculation
    }
  }

  return result;
}

/** Internal: full recalculation + DB persistence. Accepts db or tx for write atomicity. */
async function _recalculate(clientId: string, txDb: DbOrTx): Promise<RecalcResult> {
  // Reads use txDb so getEventSummary sees just-inserted events within a transaction
  const [client, creditData, savingsData, tontineData, eventSummary] = await Promise.all([
    txDb.query.clients.findFirst({ where: eq(clients.id, clientId) }),
    getCreditData(clientId),
    getSavingsData(clientId),
    getTontineData(clientId),
    getEventSummary(clientId, txDb),
  ]);

  if (!client) throw new Error(`Client ${clientId} not found`);

  // 1. Payment score (0-100)
  const scorePayment = calculatePaymentScore(creditData);

  // 2. Loyalty score (0-100)
  const scoreLoyalty = calculateLoyaltyScore(client, eventSummary);

  // 3. Engagement score (0-100)
  const scoreEngagement = calculateEngagementScore(savingsData, tontineData, eventSummary);

  // 4. Compliance score (0-100)
  const scoreCompliance = calculateComplianceScore(client);

  // 5. Weighted global score
  const scoreGlobal = Math.min(100, Math.max(0, Math.round(
    scorePayment * SCORE_WEIGHTS.PAYMENT +
    scoreLoyalty * SCORE_WEIGHTS.LOYALTY +
    scoreEngagement * SCORE_WEIGHTS.ENGAGEMENT +
    scoreCompliance * SCORE_WEIGHTS.COMPLIANCE
  )));

  // 6. Real tauxRemboursement
  const tauxRemboursement = creditData.tauxRemboursement;

  // 7. Segment determination (multi-condition)
  const previousSegment = client.segment || SegmentClient.STANDARD;
  const segment = determineSegment(scoreGlobal, creditData, client);
  const segmentChanged = segment !== previousSegment;

  if (segmentChanged) {
    logger.info(
      { clientId, previousSegment, newSegment: segment, scoreGlobal },
      `Segment change: ${previousSegment} → ${segment}`
    );
  }

  // 8. Upsert score state (uses txDb for atomicity)
  await upsertScoreState(clientId, client.agenceId || undefined, {
    scorePayment,
    scoreLoyalty,
    scoreEngagement,
    scoreCompliance,
    scoreGlobal,
    segment,
    tauxRemboursement: tauxRemboursement.toString(),
    totalPointsFidelite: eventSummary.totalPoints,
    totalCreditsRembourses: creditData.creditsSoldes,
    totalIncidents: eventSummary.totalIncidents,
    totalEpargneDepots: eventSummary.totalDepots,
  }, txDb);

  // 9. Sync to clients table (uses txDb for atomicity)
  await txDb.update(clients).set({
    score: scoreGlobal,
    segment,
    tauxRemboursement: tauxRemboursement.toString(),
    scoreEngagement,
    pointsFidelite: eventSummary.totalPoints,
    derniereActivite: new Date(),
    updatedAt: new Date(),
  }).where(eq(clients.id, clientId));

  const clientName = [(client as any).prenom, (client as any).nom].filter(Boolean).join(' ') || undefined;

  return {
    scoreGlobal,
    segment,
    scorePayment,
    scoreLoyalty,
    scoreEngagement,
    scoreCompliance,
    tauxRemboursement: tauxRemboursement.toString(),
    totalPointsFidelite: eventSummary.totalPoints,
    // Extra metadata for broadcasting (not part of ScoreResult)
    _meta: { clientId, segmentChanged, previousSegment, agenceId: client.agenceId || undefined, clientName },
  };
}

/** Broadcast WS update + domain event for segment change. Called AFTER transaction commit. */
function _broadcastScoreUpdate(result: RecalcResult) {
  const { _meta } = result;
  if (!_meta) return;

  // WS broadcast
  try {
    import('../ws-server').then(({ getWsInstance }) => {
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "SCORE_UPDATED",
          payload: {
            clientId: _meta.clientId,
            scoreGlobal: result.scoreGlobal,
            segment: result.segment,
            scorePayment: result.scorePayment,
            scoreLoyalty: result.scoreLoyalty,
            scoreEngagement: result.scoreEngagement,
            scoreCompliance: result.scoreCompliance,
            tauxRemboursement: result.tauxRemboursement,
            totalPointsFidelite: result.totalPointsFidelite,
            segmentChanged: _meta.segmentChanged,
            previousSegment: _meta.segmentChanged ? _meta.previousSegment : undefined,
          },
        });
      }
    }).catch(() => {});
  } catch { /* WS broadcast failure must never break scoring */ }

  // Domain event for segment change notification (with clientName)
  if (_meta.segmentChanged) {
    try {
      import('./notifications/domain-events/event-registry').then(({ dispatchDomainEvent }) => {
        dispatchDomainEvent({
          type: "CLIENT_SEGMENT_CHANGED",
          data: {
            clientId: _meta.clientId,
            clientName: _meta.clientName,
            previousSegment: _meta.previousSegment,
            newSegment: result.segment,
            scoreGlobal: result.scoreGlobal,
            agenceId: _meta.agenceId,
          },
          timestamp: new Date(),
          agenceId: _meta.agenceId,
        });
      }).catch(() => {});
    } catch { /* notification failure must never break scoring */ }
  }
}

// ============================================================================
// COMPONENT SCORE CALCULATIONS
// ============================================================================

function calculatePaymentScore(creditData: CreditDataSummary): number {
  if (creditData.totalCredits === 0) return 50; // neutral for new clients

  let score = 50;
  score += Math.min(20, creditData.creditsSoldes * 7);
  score -= creditData.creditsEnRetard * 15;

  // Repayment rate bonus/malus
  if (creditData.tauxRemboursement >= 95) score += 20;
  else if (creditData.tauxRemboursement >= 80) score += 10;
  else if (creditData.tauxRemboursement < 60) score -= 15;

  // Late days penalty
  if (creditData.joursRetardMoyen > 15) score -= 10;
  else if (creditData.joursRetardMoyen <= 3 && creditData.totalCredits > 0) score += 10;

  return Math.min(100, Math.max(0, score));
}

function calculateLoyaltyScore(client: any, events: EventSummary): number {
  let score = 0;

  // Tenure score (up to 40 points)
  const ancienneteMois = getAncienneteMois(client);
  if (ancienneteMois >= 24) score += 40;
  else if (ancienneteMois >= 12) score += 30;
  else if (ancienneteMois >= 6) score += 20;
  else if (ancienneteMois >= 3) score += 10;
  else score += 5;

  // Points accumulated (up to 30 points)
  const pointsNorm = Math.min(30, Math.floor(events.totalPoints / 100));
  score += pointsNorm;

  // Activity frequency (up to 30 points) — count all positive interactions
  const totalActivity = events.totalDepots + events.totalRemboursements + events.totalCotisationsTontine;
  if (totalActivity >= 24) score += 30;
  else if (totalActivity >= 12) score += 20;
  else if (totalActivity >= 6) score += 10;

  return Math.min(100, Math.max(0, score));
}

function calculateEngagementScore(
  savingsData: { totalSolde: number; nombreComptes: number; depots6Mois: number },
  tontineData: { participationsActives: number; totalCotisations: number },
  events: EventSummary
): number {
  let score = 0;

  // Savings engagement (up to 40 points)
  if (savingsData.nombreComptes > 0) score += 5;
  if (savingsData.totalSolde >= 500000) score += 15;
  else if (savingsData.totalSolde >= 200000) score += 10;
  else if (savingsData.totalSolde >= 50000) score += 5;

  // Deposit regularity (up to 20 pts)
  if (savingsData.depots6Mois >= 12) score += 20;
  else if (savingsData.depots6Mois >= 6) score += 12;
  else if (savingsData.depots6Mois >= 3) score += 5;

  // Tontine participation (up to 25 points)
  score += Math.min(10, tontineData.participationsActives * 5);
  if (tontineData.totalCotisations >= 100000) score += 15;
  else if (tontineData.totalCotisations >= 50000) score += 10;
  else if (tontineData.totalCotisations >= 10000) score += 5;

  // Event-based engagement bonus (up to 15 points) — all positive event types
  const totalPositiveEvents = events.totalDepots + events.totalRemboursements + events.totalCotisationsTontine;
  if (totalPositiveEvents >= 20) score += 15;
  else if (totalPositiveEvents >= 10) score += 10;
  else if (totalPositiveEvents >= 5) score += 5;

  return Math.min(100, Math.max(0, score));
}

function calculateComplianceScore(client: any): number {
  let score = 0;

  // KYC status (up to 50 points)
  if (client.kycStatus === "VERIFIED") score += 50;
  else if (client.kycStatus === "PARTIAL") score += 25;
  else score += 10; // PENDING

  // Profile completeness (up to 30 points)
  let profileParts = 0;
  if (client.adresseDomicile) profileParts++;
  if (client.professionId) profileParts++;
  if (client.numeroPiece) profileParts++;
  if (client.typePiece) profileParts++;
  if (client.villeId) profileParts++;
  if (client.paysResidenceId) profileParts++;
  score += Math.min(30, profileParts * 5);

  // AML compliance (up to 20 points)
  if (!client.isPep && !client.isBlacklisted) score += 20;
  else if (client.isPep && !client.isBlacklisted) score += 10;
  // blacklisted = 0

  return Math.min(100, Math.max(0, score));
}

// ============================================================================
// SEGMENT DETERMINATION (multi-condition)
// ============================================================================

function determineSegment(
  score: number,
  creditData: CreditDataSummary,
  client: any
): string {
  const ancienneteMois = getAncienneteMois(client);

  // VIP: score >= 80 AND at least 2 credits repaid AND 12+ months tenure
  if (
    score >= SEGMENT_THRESHOLDS.VIP.min &&
    creditData.creditsSoldes >= SEGMENT_THRESHOLDS.VIP.minCreditsRembourses &&
    ancienneteMois >= SEGMENT_THRESHOLDS.VIP.minAncienneteMois
  ) {
    return SegmentClient.VIP;
  }

  // PREMIUM: score >= 65 AND at least 1 credit repaid AND 6+ months tenure
  if (
    score >= SEGMENT_THRESHOLDS.PREMIUM.min &&
    creditData.creditsSoldes >= SEGMENT_THRESHOLDS.PREMIUM.minCreditsRembourses &&
    ancienneteMois >= SEGMENT_THRESHOLDS.PREMIUM.minAncienneteMois
  ) {
    return SegmentClient.PREMIUM;
  }

  // RISQUE: score < 40 OR any active late credit
  if (score < SEGMENT_THRESHOLDS.RISQUE.max || creditData.creditsEnRetard > 0) {
    return SegmentClient.RISQUE;
  }

  return SegmentClient.STANDARD;
}

// ============================================================================
// DATA FETCHERS
// ============================================================================

async function getCreditData(clientId: string): Promise<CreditDataSummary> {
  const clientCredits = await db.query.credits.findMany({
    where: eq(credits.clientId, clientId),
  });

  if (clientCredits.length === 0) {
    return {
      totalCredits: 0,
      creditsSoldes: 0,
      creditsEnRetard: 0,
      creditsActifs: 0,
      tauxRemboursement: 100,
      joursRetardMoyen: 0,
    };
  }

  const creditIds = clientCredits.map((c) => c.id);

  // Real repayment rate from echeances_credits
  const stats = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE statut IN ('PAID', 'SETTLED')) as paid_count,
      COUNT(*) FILTER (WHERE statut IN ('PAID', 'SETTLED', 'LATE', 'DUE', 'PARTIALLY_PAID')) as due_count,
      COALESCE(AVG(
        CASE
          WHEN statut = 'LATE' AND date_echeance < NOW()
          THEN EXTRACT(DAY FROM NOW() - date_echeance)
          ELSE 0
        END
      ) FILTER (WHERE statut = 'LATE'), 0) as avg_late_days
    FROM echeances_credits
    WHERE credit_id IN (${sql.join(creditIds.map((id) => sql`${id}`), sql`, `)})
  `);

  const row = (stats as any).rows?.[0] || (stats as any)[0] || {};
  const paidCount = parseInt(row.paid_count) || 0;
  const dueCount = parseInt(row.due_count) || 0;
  const avgLateDays = parseFloat(row.avg_late_days) || 0;

  return {
    totalCredits: clientCredits.length,
    creditsSoldes: clientCredits.filter((c) => c.statut === StatutCredit.PAID || c.statut === StatutCredit.CLOSED).length,
    creditsEnRetard: clientCredits.filter((c) => c.statut === StatutCredit.LATE).length,
    creditsActifs: clientCredits.filter((c) => c.statut === StatutCredit.ACTIVE).length,
    tauxRemboursement: dueCount > 0 ? (paidCount / dueCount) * 100 : 100,
    joursRetardMoyen: avgLateDays,
  };
}

async function getSavingsData(clientId: string): Promise<{
  totalSolde: number;
  nombreComptes: number;
  depots6Mois: number;
}> {
  const comptesClient = await db.query.comptes.findMany({
    where: and(eq(comptes.clientId, clientId), eq(comptes.statut, StatutCompte.ACTIVE)),
  });

  const totalSolde = comptesClient.reduce((acc, c) => acc + parseFloat(c.soldeCourant?.toString() || "0"), 0);

  // Count deposits in last 6 months
  const sixMoisAgo = new Date();
  sixMoisAgo.setMonth(sixMoisAgo.getMonth() - 6);

  const depotRows = await db
    .select({ cnt: count() })
    .from(mouvementsFinanciers)
    .where(and(
      eq(mouvementsFinanciers.clientId, clientId),
      gte(mouvementsFinanciers.createdAt, sixMoisAgo),
      sql`${mouvementsFinanciers.sens} = 'CREDIT'`,
      sql`${mouvementsFinanciers.sourceModule} IN ('EPARGNE', 'CAISSE', 'COMPTE', 'CAISSE_AGENT')`
    ));

  return {
    totalSolde,
    nombreComptes: comptesClient.length,
    depots6Mois: depotRows[0]?.cnt || 0,
  };
}

async function getTontineData(clientId: string): Promise<{
  participationsActives: number;
  totalCotisations: number;
}> {
  const participations = await db.query.membresTontine.findMany({
    where: eq(membresTontine.clientId, clientId),
  });

  const actives = participations.filter((p) => p.statut === "ACTIVE");
  const totalCotisations = participations.reduce(
    (acc, p) => acc + parseFloat(p.totalCotisations?.toString() || "0"),
    0
  );

  return {
    participationsActives: actives.length,
    totalCotisations,
  };
}

async function getEventSummary(clientId: string, txDb: DbOrTx = db): Promise<EventSummary> {
  const rows = await txDb
    .select({
      totalPoints: sql<number>`COALESCE(SUM(${clientScoreEvents.pointsDelta}), 0)`,
      totalDepots: sql<number>`COUNT(*) FILTER (WHERE ${clientScoreEvents.eventType} = 'EPARGNE_DEPOT')`,
      totalRemboursements: sql<number>`COUNT(*) FILTER (WHERE ${clientScoreEvents.eventType} IN ('CREDIT_REMBOURSEMENT', 'CREDIT_SOLDE'))`,
      totalCotisationsTontine: sql<number>`COUNT(*) FILTER (WHERE ${clientScoreEvents.eventType} = 'TONTINE_CONTRIBUTION')`,
      totalIncidents: sql<number>`COUNT(*) FILTER (WHERE ${clientScoreEvents.eventType} IN ('INCIDENT_RETARD', 'INCIDENT_DEFAUT', 'TONTINE_PENALITE', 'COMPTE_BLOQUE'))`,
    })
    .from(clientScoreEvents)
    .where(eq(clientScoreEvents.clientId, clientId));

  const row = rows[0];
  return {
    totalPoints: Number(row?.totalPoints) || 0,
    totalDepots: Number(row?.totalDepots) || 0,
    totalRemboursements: Number(row?.totalRemboursements) || 0,
    totalCotisationsTontine: Number(row?.totalCotisationsTontine) || 0,
    totalIncidents: Number(row?.totalIncidents) || 0,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function getAncienneteMois(client: any): number {
  const dateCreation = new Date(client.dateAdhesion || client.createdAt || new Date());
  return Math.floor((Date.now() - dateCreation.getTime()) / (1000 * 60 * 60 * 24 * 30));
}

/** Returns ISO week string like "2026-W08" for idempotent cron refIds */
function getIsoWeek(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

async function upsertScoreState(
  clientId: string,
  agenceId: string | undefined,
  data: {
    scorePayment: number;
    scoreLoyalty: number;
    scoreEngagement: number;
    scoreCompliance: number;
    scoreGlobal: number;
    segment: string;
    tauxRemboursement: string;
    totalPointsFidelite: number;
    totalCreditsRembourses: number;
    totalIncidents: number;
    totalEpargneDepots: number;
  },
  txDb: DbOrTx = db,
) {
  const now = new Date();

  await txDb.insert(clientScoreState).values({
    clientId,
    agenceId,
    ...data,
    lastEventAt: now,
    lastRecalcAt: now,
  }).onConflictDoUpdate({
    target: clientScoreState.clientId,
    set: {
      agenceId,
      ...data,
      lastEventAt: now,
      lastRecalcAt: now,
      updatedAt: now,
    },
  });
}

// ============================================================================
// QUERY HELPERS (for API endpoints)
// ============================================================================

export async function getScoreHistory(clientId: string, limit = 50, offset = 0) {
  const rows = await db.select()
    .from(clientScoreEvents)
    .where(eq(clientScoreEvents.clientId, clientId))
    .orderBy(desc(clientScoreEvents.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: count() })
    .from(clientScoreEvents)
    .where(eq(clientScoreEvents.clientId, clientId));

  return { rows, total: Number(total), limit, offset };
}

export async function getScoreState(clientId: string) {
  return db.query.clientScoreState.findFirst({
    where: eq(clientScoreState.clientId, clientId),
  });
}

/**
 * Score trend: monthly score snapshots derived from events.
 * Returns up to 12 months of { month, scoreGlobal, segment, pointsDelta }.
 */
export async function getScoreTrend(clientId: string, months = 12) {
  const rows = await db.execute(sql`
    SELECT
      TO_CHAR(DATE_TRUNC('month', ${clientScoreEvents.createdAt}), 'YYYY-MM') as month,
      SUM(${clientScoreEvents.pointsDelta}) as points_delta,
      COUNT(*) as event_count
    FROM ${clientScoreEvents}
    WHERE ${clientScoreEvents.clientId} = ${clientId}
    GROUP BY DATE_TRUNC('month', ${clientScoreEvents.createdAt})
    ORDER BY month DESC
    LIMIT ${months}
  `);

  return ((rows as any).rows || rows).map((r: any) => ({
    month: r.month,
    pointsDelta: Number(r.points_delta) || 0,
    eventCount: Number(r.event_count) || 0,
  }));
}

/**
 * Agency scoring stats: average score, segment distribution, per agency.
 */
export async function getAgencyScoreStats(agenceId?: string) {
  const whereClause = agenceId
    ? sql`WHERE ${clientScoreState.agenceId} = ${agenceId}`
    : sql``;

  const rows = await db.execute(sql`
    SELECT
      ${clientScoreState.agenceId} as agence_id,
      COUNT(*) as total_clients,
      ROUND(AVG(${clientScoreState.scoreGlobal})) as avg_score,
      ROUND(AVG(${clientScoreState.scorePayment})) as avg_payment,
      ROUND(AVG(${clientScoreState.scoreLoyalty})) as avg_loyalty,
      ROUND(AVG(${clientScoreState.scoreEngagement})) as avg_engagement,
      ROUND(AVG(${clientScoreState.scoreCompliance})) as avg_compliance,
      COUNT(*) FILTER (WHERE ${clientScoreState.segment} = 'VIP') as count_vip,
      COUNT(*) FILTER (WHERE ${clientScoreState.segment} = 'Premium') as count_premium,
      COUNT(*) FILTER (WHERE ${clientScoreState.segment} = 'Standard') as count_standard,
      COUNT(*) FILTER (WHERE ${clientScoreState.segment} = 'Risque') as count_risque
    FROM ${clientScoreState}
    ${whereClause}
    GROUP BY ${clientScoreState.agenceId}
    ORDER BY avg_score DESC
  `);

  return ((rows as any).rows || rows).map((r: any) => ({
    agenceId: r.agence_id,
    totalClients: Number(r.total_clients) || 0,
    avgScore: Number(r.avg_score) || 0,
    avgPayment: Number(r.avg_payment) || 0,
    avgLoyalty: Number(r.avg_loyalty) || 0,
    avgEngagement: Number(r.avg_engagement) || 0,
    avgCompliance: Number(r.avg_compliance) || 0,
    segments: {
      VIP: Number(r.count_vip) || 0,
      Premium: Number(r.count_premium) || 0,
      Standard: Number(r.count_standard) || 0,
      Risque: Number(r.count_risque) || 0,
    },
  }));
}

/**
 * Client score percentile within their agency.
 * Returns { rank, total, percentile }.
 */
export async function getScorePercentile(clientId: string) {
  const state = await getScoreState(clientId);
  if (!state) return null;

  const agenceId = state.agenceId;

  const rows = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE ${clientScoreState.scoreGlobal} <= ${state.scoreGlobal}) as rank_position,
      COUNT(*) as total
    FROM ${clientScoreState}
    ${agenceId ? sql`WHERE ${clientScoreState.agenceId} = ${agenceId}` : sql``}
  `);

  const row = ((rows as any).rows || rows)[0];
  const rank = Number(row?.rank_position) || 1;
  const total = Number(row?.total) || 1;

  return {
    rank,
    total,
    percentile: Math.round((rank / total) * 100),
    agenceId,
  };
}

// ============================================================================
// ADMIN QUERY HELPERS (cross-client)
// ============================================================================

export interface AdminEventsFilter {
  agenceId?: string;
  eventType?: string;
  dateFrom?: string;
  dateTo?: string;
  clientId?: string;
  limit?: number;
  offset?: number;
}

/**
 * Cross-client scoring events with filters. For admin audit log.
 */
export async function getAdminScoreEvents(filters: AdminEventsFilter) {
  const conditions = [];
  if (filters.agenceId) conditions.push(eq(clientScoreEvents.agenceId, filters.agenceId));
  if (filters.eventType) conditions.push(eq(clientScoreEvents.eventType, filters.eventType as any));
  if (filters.clientId) conditions.push(eq(clientScoreEvents.clientId, filters.clientId));
  if (filters.dateFrom) conditions.push(gte(clientScoreEvents.createdAt, new Date(filters.dateFrom)));
  if (filters.dateTo) conditions.push(lte(clientScoreEvents.createdAt, new Date(filters.dateTo + "T23:59:59")));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = Math.min(filters.limit || 50, 200);
  const offset = filters.offset || 0;

  const rows = await db.select({
    id: clientScoreEvents.id,
    clientId: clientScoreEvents.clientId,
    agenceId: clientScoreEvents.agenceId,
    eventType: clientScoreEvents.eventType,
    refId: clientScoreEvents.refId,
    refType: clientScoreEvents.refType,
    pointsDelta: clientScoreEvents.pointsDelta,
    montant: clientScoreEvents.montant,
    reason: clientScoreEvents.reason,
    createdBy: clientScoreEvents.createdBy,
    createdAt: clientScoreEvents.createdAt,
    clientNom: users.nom,
    clientPrenom: users.prenom,
  })
    .from(clientScoreEvents)
    .leftJoin(clients, eq(clientScoreEvents.clientId, clients.id))
    .leftJoin(users, eq(clients.userId, users.id))
    .where(where)
    .orderBy(desc(clientScoreEvents.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: count() })
    .from(clientScoreEvents)
    .where(where);

  return { rows, total: Number(total), limit, offset };
}

export interface AdminStatesFilter {
  agenceId?: string;
  segment?: string;
  limit?: number;
  offset?: number;
}

/**
 * All score states with filters. For admin overview.
 */
export async function getAdminScoreStates(filters: AdminStatesFilter) {
  const conditions = [];
  if (filters.agenceId) conditions.push(eq(clientScoreState.agenceId, filters.agenceId));
  if (filters.segment) conditions.push(eq(clientScoreState.segment, filters.segment));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = Math.min(filters.limit || 50, 200);
  const offset = filters.offset || 0;

  const rows = await db.select({
    id: clientScoreState.id,
    clientId: clientScoreState.clientId,
    agenceId: clientScoreState.agenceId,
    scoreGlobal: clientScoreState.scoreGlobal,
    scorePayment: clientScoreState.scorePayment,
    scoreLoyalty: clientScoreState.scoreLoyalty,
    scoreEngagement: clientScoreState.scoreEngagement,
    scoreCompliance: clientScoreState.scoreCompliance,
    segment: clientScoreState.segment,
    tauxRemboursement: clientScoreState.tauxRemboursement,
    totalPointsFidelite: clientScoreState.totalPointsFidelite,
    totalIncidents: clientScoreState.totalIncidents,
    totalEpargneDepots: clientScoreState.totalEpargneDepots,
    updatedAt: clientScoreState.updatedAt,
    clientNom: users.nom,
    clientPrenom: users.prenom,
  })
    .from(clientScoreState)
    .leftJoin(clients, eq(clientScoreState.clientId, clients.id))
    .leftJoin(users, eq(clients.userId, users.id))
    .where(where)
    .orderBy(desc(clientScoreState.scoreGlobal))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: count() })
    .from(clientScoreState)
    .where(where);

  return { rows, total: Number(total), limit, offset };
}
