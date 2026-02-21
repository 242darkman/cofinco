/**
 * TONTINE PRODUCTION SERVICE
 * ==========================
 * Service principal pour la gestion des tontines production-ready.
 * Gère les cycles, tours, contributions, distributions avec:
 * - Validation du pot avant distribution
 * - Support des paiements cash + Mobile Money
 * - Intégration comptable OHADA
 * - Pénalités automatiques
 * - Audit trail complet
 */

import { db } from "../db";
import { createLogger } from "../lib/logger";
import { paymentService } from "./mobile-money/payment-service";

const logger = createLogger('TontineProduction');
import {
  tontines,
  tontineCycles,
  tontineTurns,
  tontineSchedules,
  tontineTurnAudit,
  tontineDistributionRequests,
  membresTontine,
  contributionsTontine,
  tontinePenalites,
  TontineCycleStatus,
  TontineTurnStatus,
  TontineScheduleStatus,
  TontineDistributionRequestStatus,
  TontinePayoutMethod,
  TontineTurnAuditActionType,
  TontineFrequency,
} from "@shared/schema/tontines";
import {
  users,
} from "@shared/schema/auth";
import {
  clients,
} from "@shared/schema/clients";
import {
  mouvementsFinanciers,
  comptes,
} from "@shared/schema/finance";
import { coffresForts } from "@shared/schema/coffres-forts";
import { dispatchDomainEvent } from "./notifications/domain-events/event-registry";
import { eq, and, sql, desc, asc, gte, lte, or, isNull, ne } from "drizzle-orm";
import { executeWithLedger, type SensMouvement } from "./ledger";
import accountingPostingService from "./accounting-posting-service";
import { v4 as uuidv4 } from "uuid";

// ============================================================================
// TYPES
// ============================================================================

export interface CycleGenerationResult {
  cycleId: string;
  schedulesCreated: number;
  turnsCreated: number;
  auditId: string;
  turnOrder: Array<{ turnNumber: number; memberId: string; memberName: string }>;
}

export interface RetirableResult {
  potDisponible: number;
  droitsMembre: number;
  penalitesADeduire: number;
  montantRetirable: number;
  peutRetirer: boolean;
  raison: string | null;
  details: {
    membersCount: number;
    cotisationAmount: number;
    hasBenefitThisCycle: boolean;
    memberStatus: string;
  };
}

export interface ContributionResult {
  contributionId: string;
  mouvementId: string | null;
  amount: number;
  tourNumber: number;
  scheduleId: string | null;
  status: string;
  paymentIntentId?: string;
}

export interface DistributionResult {
  requestId: string;
  status: string;
  amountRequested: number;
  amountApproved: number | null;
  penaltiesDeducted: number;
  feesDeducted: number;
  netAmount: number | null;
  paymentIntentId?: string;
  mouvementId?: string;
}

export interface TurnReorderResult {
  success: boolean;
  auditId: string;
  affectedTurns: number;
  newOrder: Array<{ turnNumber: number; memberId: string }>;
}

// ============================================================================
// TYPES — Tontine Rules (read from typed columns)
// ============================================================================

interface TontineRules {
  penaltyEnabled: boolean;
  penaltyType: string;
  penaltyValue: number;
  penaltyApplication: string;
  penaltyCap: number | null;
  lateGracePeriodDays: number;
  maxLateBeforeSuspend: number;
  maxLateBeforeExclude: number;
  allowPartialDistribution: boolean;
  distributionMinThresholdPct: number;
  exitFeePercent: number;
  tauxPlateforme: number;
  penaltyDeductedFromPayout: boolean;
  penaltyAsRevenue: boolean;
  autoPenaltyPriority: boolean;
  minMembersToStart: number;
  maxAdvanceTours: number;
  payoutOrderMode: string;
  allowSwapPayoutOrder: boolean;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get tontine rules from typed columns on the tontines table.
 */
async function getTontineRules(tontineId: string): Promise<TontineRules> {
  const [tontine] = await db
    .select({
      penaltyEnabled: tontines.penaltyEnabled,
      penaltyType: tontines.penaltyType,
      penaltyValue: tontines.penaltyValue,
      penaltyApplication: tontines.penaltyApplication,
      penaltyCap: tontines.penaltyCap,
      lateGracePeriodDays: tontines.lateGracePeriodDays,
      maxLateBeforeSuspend: tontines.maxLateBeforeSuspend,
      maxLateBeforeExclude: tontines.maxLateBeforeExclude,
      allowPartialDistribution: tontines.allowPartialDistribution,
      distributionMinThresholdPct: tontines.distributionMinThresholdPct,
      exitFeePercent: tontines.exitFeePercent,
      tauxPlateforme: tontines.tauxPlateforme,
      penaltyDeductedFromPayout: tontines.penaltyDeductedFromPayout,
      penaltyAsRevenue: tontines.penaltyAsRevenue,
      autoPenaltyPriority: tontines.autoPenaltyPriority,
      minMembersToStart: tontines.minMembersToStart,
      maxAdvanceTours: tontines.maxAdvanceTours,
      payoutOrderMode: tontines.payoutOrderMode,
      allowSwapPayoutOrder: tontines.allowSwapPayoutOrder,
    })
    .from(tontines)
    .where(eq(tontines.id, tontineId))
    .limit(1);

  if (!tontine) {
    throw new Error("Tontine non trouvée");
  }

  return {
    penaltyEnabled: tontine.penaltyEnabled ?? false,
    penaltyType: tontine.penaltyType ?? 'FIXED',
    penaltyValue: parseFloat(tontine.penaltyValue?.toString() ?? '0'),
    penaltyApplication: tontine.penaltyApplication ?? 'PER_PERIOD',
    penaltyCap: tontine.penaltyCap ? parseFloat(tontine.penaltyCap.toString()) : null,
    lateGracePeriodDays: tontine.lateGracePeriodDays ?? 0,
    maxLateBeforeSuspend: tontine.maxLateBeforeSuspend ?? 3,
    maxLateBeforeExclude: tontine.maxLateBeforeExclude ?? 5,
    allowPartialDistribution: tontine.allowPartialDistribution ?? true,
    distributionMinThresholdPct: parseFloat(tontine.distributionMinThresholdPct?.toString() ?? '50'),
    exitFeePercent: parseFloat(tontine.exitFeePercent?.toString() ?? '0'),
    tauxPlateforme: parseFloat(tontine.tauxPlateforme?.toString() ?? '0'),
    penaltyDeductedFromPayout: tontine.penaltyDeductedFromPayout ?? true,
    penaltyAsRevenue: tontine.penaltyAsRevenue ?? false,
    autoPenaltyPriority: tontine.autoPenaltyPriority ?? true,
    minMembersToStart: tontine.minMembersToStart ?? 3,
    maxAdvanceTours: tontine.maxAdvanceTours ?? 3,
    payoutOrderMode: tontine.payoutOrderMode ?? 'FIXED_BY_ADMIN',
    allowSwapPayoutOrder: tontine.allowSwapPayoutOrder ?? false,
  };
}

/**
 * Calculate interval based on frequency
 */
function calculateInterval(frequency: string, interval: number = 1): { days: number } {
  const baseInterval = interval || 1;
  switch (frequency) {
    case TontineFrequency.DAILY:
      return { days: 1 * baseInterval };
    case TontineFrequency.WEEKLY:
      return { days: 7 * baseInterval };
    case TontineFrequency.BIWEEKLY:
      return { days: 14 * baseInterval };
    case TontineFrequency.MONTHLY:
      return { days: 30 * baseInterval }; // Approximation, real logic uses date math
    case TontineFrequency.BIMONTHLY:
      return { days: 60 * baseInterval };
    case TontineFrequency.QUARTERLY:
      return { days: 90 * baseInterval };
    default:
      return { days: 30 };
  }
}

/**
 * Add interval to date based on frequency
 */
function addFrequencyInterval(date: Date, frequency: string, interval: number = 1): Date {
  const result = new Date(date);
  const mult = interval || 1;

  switch (frequency) {
    case TontineFrequency.DAILY:
      result.setDate(result.getDate() + (1 * mult));
      break;
    case TontineFrequency.WEEKLY:
      result.setDate(result.getDate() + (7 * mult));
      break;
    case TontineFrequency.BIWEEKLY:
      result.setDate(result.getDate() + (14 * mult));
      break;
    case TontineFrequency.MONTHLY:
      result.setMonth(result.getMonth() + (1 * mult));
      break;
    case TontineFrequency.BIMONTHLY:
      result.setMonth(result.getMonth() + (2 * mult));
      break;
    case TontineFrequency.QUARTERLY:
      result.setMonth(result.getMonth() + (3 * mult));
      break;
    default:
      result.setMonth(result.getMonth() + 1);
  }

  return result;
}

/**
 * Seeded random number generator (for reproducible turn order)
 */
function seededRandom(seed: number): () => number {
  return function() {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

/**
 * Fisher-Yates shuffle with seed
 */
function shuffleWithSeed<T>(array: T[], seed: number): T[] {
  const result = [...array];
  const random = seededRandom(seed);

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

// ============================================================================
// CYCLE & CALENDAR GENERATION
// ============================================================================

/**
 * Generate a new cycle with schedules and turns
 */
export async function generateCycle(params: {
  tontineId: string;
  agenceId: string;
  userId: string;
  startDate?: Date;
  randomSeed?: number;
}): Promise<CycleGenerationResult> {
  const { tontineId, agenceId, userId, startDate, randomSeed } = params;

  return await db.transaction(async (tx) => {
    // Get tontine details
    const [tontine] = await tx
      .select()
      .from(tontines)
      .where(and(eq(tontines.id, tontineId), isNull(tontines.deletedAt)))
      .limit(1);

    if (!tontine) {
      throw new Error("Tontine non trouvée");
    }

    // Get active members
    const members = await tx
      .select({
        id: membresTontine.id,
        clientId: membresTontine.clientId,
        position: membresTontine.position,
        dateAdhesion: membresTontine.dateAdhesion,
      })
      .from(membresTontine)
      .where(and(
        eq(membresTontine.tontineId, tontineId),
        eq(membresTontine.statut, "ACTIVE"),
        isNull(membresTontine.deletedAt)
      ))
      .orderBy(asc(membresTontine.position), asc(membresTontine.dateAdhesion));

    if (members.length === 0) {
      throw new Error("Aucun membre actif dans la tontine");
    }

    const rules = await getTontineRules(tontineId);
    if (members.length < rules.minMembersToStart) {
      throw new Error(`Minimum ${rules.minMembersToStart} membres requis pour démarrer un cycle`);
    }

    // Check for existing open cycle
    const existingCycle = await tx
      .select()
      .from(tontineCycles)
      .where(and(
        eq(tontineCycles.tontineId, tontineId),
        eq(tontineCycles.status, TontineCycleStatus.OPEN)
      ))
      .limit(1);

    if (existingCycle.length > 0) {
      throw new Error("Un cycle est déjà ouvert. Clôturez-le avant d'en créer un nouveau.");
    }

    // Get next cycle number
    const [lastCycle] = await tx
      .select({ cycleNumber: tontineCycles.cycleNumber })
      .from(tontineCycles)
      .where(eq(tontineCycles.tontineId, tontineId))
      .orderBy(desc(tontineCycles.cycleNumber))
      .limit(1);

    const cycleNumber = (lastCycle?.cycleNumber || 0) + 1;
    const cycleStartDate = startDate || new Date(tontine.dateDebut);

    // Create cycle
    const [cycle] = await tx
      .insert(tontineCycles)
      .values({
        agenceId,
        tontineId,
        cycleNumber,
        startDate: cycleStartDate.toISOString().split('T')[0],
        status: TontineCycleStatus.OPEN,
        membersCount: members.length,
      })
      .returning();

    // Determine turn order
    let orderedMembers = members;
    const seed = randomSeed ?? (Date.now() + parseInt(tontineId.replace(/-/g, '').slice(0, 8), 16));

    if (rules.payoutOrderMode === 'RANDOM_AT_START') {
      orderedMembers = shuffleWithSeed(members, seed);
    }
    // FIXED_BY_ADMIN and PRIORITY_SCORE use position field (already ordered)

    // Generate schedules and turns
    let currentDate = new Date(cycleStartDate);
    const cotisationAmount = parseFloat(tontine.montantCotisation || "0");

    for (let i = 0; i < members.length; i++) {
      const periodNumber = i + 1;
      const dueDate = i === 0 ? currentDate : addFrequencyInterval(currentDate, tontine.frequence, i);

      // Create schedule
      await tx.insert(tontineSchedules).values({
        agenceId,
        tontineId,
        cycleId: cycle.id,
        periodNumber,
        dueDate: dueDate.toISOString().split('T')[0],
        amountExpectedPerMember: cotisationAmount.toString(),
        status: i === 0 ? TontineScheduleStatus.OPEN : TontineScheduleStatus.UPCOMING,
      });

      // Create turn
      await tx.insert(tontineTurns).values({
        agenceId,
        tontineId,
        cycleId: cycle.id,
        turnNumber: periodNumber,
        beneficiaryMemberId: orderedMembers[i].id,
        dueDate: dueDate.toISOString().split('T')[0],
        amountExpected: (cotisationAmount * members.length).toString(),
        status: TontineTurnStatus.SCHEDULED,
      });
    }

    // Get member names for audit
    const memberNames = await tx
      .select({
        memberId: membresTontine.id,
        nom: users.nom,
        prenom: users.prenom,
      })
      .from(membresTontine)
      .innerJoin(clients, eq(membresTontine.clientId, clients.id))
      .innerJoin(users, eq(clients.userId, users.id))
      .where(eq(membresTontine.tontineId, tontineId));

    const memberNameMap = new Map(memberNames.map(m => [m.memberId, `${m.nom} ${m.prenom || ''}`.trim()]));

    // Create turn order for response
    const turnOrder = orderedMembers.map((m, i) => ({
      turnNumber: i + 1,
      memberId: m.id,
      memberName: memberNameMap.get(m.id) || 'Inconnu',
    }));

    // Create audit entry
    const [audit] = await tx
      .insert(tontineTurnAudit)
      .values({
        agenceId,
        tontineId,
        cycleId: cycle.id,
        actionType: TontineTurnAuditActionType.INITIAL_GENERATION,
        newOrder: turnOrder,
        reason: 'Génération initiale du calendrier',
        changedBy: userId,
        metadata: {
          seed,
          payoutOrderMode: rules.payoutOrderMode,
          membersCount: members.length,
          frequency: tontine.frequence,
        },
      })
      .returning();

    // Update tontine with current cycle
    await tx
      .update(tontines)
      .set({ currentCycleId: cycle.id, updatedAt: new Date() })
      .where(eq(tontines.id, tontineId));

    return {
      cycleId: cycle.id,
      schedulesCreated: members.length,
      turnsCreated: members.length,
      auditId: audit.id,
      turnOrder,
    };
  });
}

// ============================================================================
// TURN REORDERING
// ============================================================================

/**
 * Reorder turns (with validation and audit)
 */
export async function reorderTurns(params: {
  tontineId: string;
  cycleId: string;
  agenceId: string;
  userId: string;
  newOrder: Array<{ turnNumber: number; memberId: string }>;
  reason: string;
}): Promise<TurnReorderResult> {
  const { tontineId, cycleId, agenceId, userId, newOrder, reason } = params;

  return await db.transaction(async (tx) => {
    // Get tontine rules
    const rules = await getTontineRules(tontineId);

    // Get current turns
    const currentTurns = await tx
      .select()
      .from(tontineTurns)
      .where(and(
        eq(tontineTurns.tontineId, tontineId),
        eq(tontineTurns.cycleId, cycleId)
      ))
      .orderBy(asc(tontineTurns.turnNumber));

    // Check if reordering is allowed
    const today = new Date();
    const cycle = await tx
      .select()
      .from(tontineCycles)
      .where(eq(tontineCycles.id, cycleId))
      .limit(1);

    if (!cycle[0]) {
      throw new Error("Cycle non trouvé");
    }

    if (cycle[0].status !== TontineCycleStatus.OPEN) {
      throw new Error("Le cycle n'est pas ouvert");
    }

    // Check locked turns
    const lockedTurns = currentTurns.filter(t => t.isLocked);
    for (const turn of lockedTurns) {
      const newTurn = newOrder.find(no => no.turnNumber === turn.turnNumber);
      if (newTurn && newTurn.memberId !== turn.beneficiaryMemberId) {
        throw new Error(`Le tour ${turn.turnNumber} est verrouillé et ne peut pas être modifié`);
      }
    }

    // Check rule: swap reorder allowed
    if (!rules.allowSwapPayoutOrder) {
      throw new Error("La réorganisation des tours n'est pas autorisée selon les règles");
    }

    // Prepare old order for audit
    const oldOrder = currentTurns.map(t => ({
      turnNumber: t.turnNumber,
      memberId: t.beneficiaryMemberId,
    }));

    // Update turns
    let affectedTurns = 0;
    for (const newTurnOrder of newOrder) {
      const currentTurn = currentTurns.find(t => t.turnNumber === newTurnOrder.turnNumber);
      if (!currentTurn) continue;

      if (currentTurn.beneficiaryMemberId !== newTurnOrder.memberId) {
        // Check if turn due date has passed
        const turnDueDate = new Date(currentTurn.dueDate);
        if (today >= turnDueDate) {
          throw new Error(`Le tour ${currentTurn.turnNumber} a déjà atteint sa date d'échéance`);
        }

        await tx
          .update(tontineTurns)
          .set({
            beneficiaryMemberId: newTurnOrder.memberId,
            updatedAt: new Date(),
          })
          .where(eq(tontineTurns.id, currentTurn.id));

        affectedTurns++;
      }
    }

    // Create audit entry
    const [audit] = await tx
      .insert(tontineTurnAudit)
      .values({
        agenceId,
        tontineId,
        cycleId,
        actionType: TontineTurnAuditActionType.REORDER,
        oldOrder,
        newOrder,
        reason,
        changedBy: userId,
        affectedTurnIds: currentTurns.filter(t =>
          newOrder.find(no => no.turnNumber === t.turnNumber && no.memberId !== t.beneficiaryMemberId)
        ).map(t => t.id),
      })
      .returning();

    return {
      success: true,
      auditId: audit.id,
      affectedTurns,
      newOrder,
    };
  });
}

// ============================================================================
// RETIRABLE CALCULATION
// ============================================================================

/**
 * Calculate retirable amount for a member
 */
export async function calculateRetirable(
  tontineId: string,
  memberId: string
): Promise<RetirableResult> {
  // Get tontine
  const [tontine] = await db
    .select()
    .from(tontines)
    .where(and(eq(tontines.id, tontineId), isNull(tontines.deletedAt)))
    .limit(1);

  if (!tontine) {
    return {
      potDisponible: 0,
      droitsMembre: 0,
      penalitesADeduire: 0,
      montantRetirable: 0,
      peutRetirer: false,
      raison: "Tontine non trouvée",
      details: { membersCount: 0, cotisationAmount: 0, hasBenefitThisCycle: false, memberStatus: 'UNKNOWN' },
    };
  }

  // Get member
  const [member] = await db
    .select()
    .from(membresTontine)
    .where(and(eq(membresTontine.id, memberId), isNull(membresTontine.deletedAt)))
    .limit(1);

  if (!member) {
    return {
      potDisponible: 0,
      droitsMembre: 0,
      penalitesADeduire: 0,
      montantRetirable: 0,
      peutRetirer: false,
      raison: "Membre non trouvé",
      details: { membersCount: 0, cotisationAmount: 0, hasBenefitThisCycle: false, memberStatus: 'UNKNOWN' },
    };
  }

  // Get member count
  const [memberCountResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(membresTontine)
    .where(and(
      eq(membresTontine.tontineId, tontineId),
      eq(membresTontine.statut, "ACTIVE"),
      isNull(membresTontine.deletedAt)
    ));

  const membersCount = memberCountResult?.count || 0;
  const cotisationAmount = parseFloat(tontine.montantCotisation || "0");

  // Calculate pot disponible
  const potDisponible = parseFloat(tontine.solde || "0");

  // Calculate droits membre (cotisation × nb_membres)
  const droitsMembre = cotisationAmount * membersCount;

  // Get unpaid penalties
  const [penaltiesResult] = await db
    .select({ total: sql<number>`COALESCE(sum(montant)::numeric, 0)` })
    .from(tontinePenalites)
    .where(and(
      eq(tontinePenalites.membreId, memberId),
      eq(tontinePenalites.statut, "PENDING"),
      isNull(tontinePenalites.deletedAt)
    ));

  const penalitesADeduire = parseFloat(penaltiesResult?.total?.toString() || "0");

  // Get rules
  const rules = await getTontineRules(tontineId);

  // Check if member can withdraw
  let peutRetirer = true;
  let raison: string | null = null;

  if (member.statut !== "ACTIVE") {
    peutRetirer = false;
    raison = "Membre non actif";
  } else if (member.aRecuBenefice) {
    peutRetirer = false;
    raison = "Bénéfice déjà reçu pour ce cycle";
  }

  // Calculate retirable amount
  let montantRetirable = Math.min(potDisponible, droitsMembre - penalitesADeduire);
  if (montantRetirable < 0) montantRetirable = 0;

  // Check minimum threshold
  if (rules.allowPartialDistribution) {
    const minThreshold = (droitsMembre * rules.distributionMinThresholdPct) / 100;
    if (potDisponible < minThreshold) {
      raison = `Pot insuffisant (minimum ${rules.distributionMinThresholdPct}% requis)`;
      // Still allow partial if pot > 0
      if (potDisponible <= 0) {
        peutRetirer = false;
      }
    }
  } else {
    // Full distribution only
    if (potDisponible < droitsMembre) {
      peutRetirer = false;
      raison = "Pot insuffisant pour distribution complète";
    }
  }

  return {
    potDisponible,
    droitsMembre,
    penalitesADeduire,
    montantRetirable,
    peutRetirer,
    raison,
    details: {
      membersCount,
      cotisationAmount,
      hasBenefitThisCycle: member.aRecuBenefice || false,
      memberStatus: member.statut,
    },
  };
}

// ============================================================================
// DISTRIBUTION REQUEST
// ============================================================================

/**
 * Create a distribution request
 */
export async function createDistributionRequest(params: {
  tontineId: string;
  cycleId: string;
  turnId: string;
  beneficiaryMemberId: string;
  agenceId: string;
  userId: string;
  payoutMethod: TontinePayoutMethod;
  provider?: 'MTN' | 'AIRTEL';
  targetMsisdn?: string;
  targetWalletAccountId?: string;
  notes?: string;
}): Promise<DistributionResult> {
  const {
    tontineId, cycleId, turnId, beneficiaryMemberId, agenceId, userId,
    payoutMethod, provider, targetMsisdn, targetWalletAccountId, notes
  } = params;

  return await db.transaction(async (tx) => {
    // Calculate retirable
    const retirable = await calculateRetirable(tontineId, beneficiaryMemberId);

    if (!retirable.peutRetirer && retirable.montantRetirable <= 0) {
      throw new Error(retirable.raison || "Distribution non autorisée");
    }

    // Get turn
    const [turn] = await tx
      .select()
      .from(tontineTurns)
      .where(eq(tontineTurns.id, turnId))
      .limit(1);

    if (!turn) {
      throw new Error("Tour non trouvé");
    }

    if (turn.beneficiaryMemberId !== beneficiaryMemberId) {
      throw new Error("Ce membre n'est pas le bénéficiaire de ce tour");
    }

    if (turn.status === TontineTurnStatus.PAID_OUT) {
      throw new Error("Ce tour a déjà été entièrement payé");
    }

    // Get rules
    const rules = await getTontineRules(tontineId);

    // Calculate platform fees on distribution
    let feesDeducted = 0;
    if (rules.tauxPlateforme > 0) {
      feesDeducted += (retirable.montantRetirable * rules.tauxPlateforme) / 100;
    }

    // Calculate net amount
    const penaltiesDeducted = rules.penaltyDeductedFromPayout ? retirable.penalitesADeduire : 0;
    const netAmount = retirable.montantRetirable - penaltiesDeducted - feesDeducted;

    if (netAmount <= 0) {
      throw new Error("Le montant net après déductions est nul ou négatif");
    }

    // Validate payout method requirements
    if (payoutMethod === TontinePayoutMethod.MOBILE_MONEY) {
      if (!provider) throw new Error("Provider requis pour Mobile Money");
      if (!targetMsisdn) throw new Error("Numéro de téléphone requis pour Mobile Money");
    }

    if (payoutMethod === TontinePayoutMethod.WALLET) {
      if (!targetWalletAccountId) throw new Error("Compte cible requis pour virement wallet");
    }

    // Create idempotency key
    const idempotencyKey = `tontine-dist-${tontineId}-${cycleId}-${turnId}-${beneficiaryMemberId}`;

    // Check idempotency
    const [existing] = await tx
      .select()
      .from(tontineDistributionRequests)
      .where(eq(tontineDistributionRequests.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existing) {
      return {
        requestId: existing.id,
        status: existing.status,
        amountRequested: parseFloat(existing.amountRequested),
        amountApproved: existing.amountApproved ? parseFloat(existing.amountApproved) : null,
        penaltiesDeducted: parseFloat(existing.penaltiesDeducted),
        feesDeducted: parseFloat(existing.feesDeducted),
        netAmount: existing.netAmount ? parseFloat(existing.netAmount) : null,
        paymentIntentId: existing.paymentIntentId || undefined,
        mouvementId: existing.mouvementId || undefined,
      };
    }

    // Create distribution request
    const [request] = await tx
      .insert(tontineDistributionRequests)
      .values({
        agenceId,
        tontineId,
        cycleId,
        turnId,
        beneficiaryMemberId,
        amountRequested: retirable.montantRetirable.toString(),
        amountApproved: null,
        amountPaid: "0",
        penaltiesDeducted: penaltiesDeducted.toString(),
        feesDeducted: feesDeducted.toString(),
        netAmount: netAmount.toString(),
        payoutMethod,
        provider,
        targetMsisdn,
        targetWalletAccountId,
        status: TontineDistributionRequestStatus.SUBMITTED,
        idempotencyKey,
        createdBy: userId,
        submittedAt: new Date(),
        submittedBy: userId,
        notes,
      })
      .returning();

    // Lock the turn
    await tx
      .update(tontineTurns)
      .set({
        isLocked: true,
        lockedAt: new Date(),
        lockedReason: 'Distribution request created',
        status: TontineTurnStatus.READY,
        updatedAt: new Date(),
      })
      .where(eq(tontineTurns.id, turnId));

    return {
      requestId: request.id,
      status: request.status,
      amountRequested: parseFloat(request.amountRequested),
      amountApproved: null,
      penaltiesDeducted,
      feesDeducted,
      netAmount,
    };
  });
}

/**
 * Approve and execute a distribution request
 */
export async function approveDistribution(params: {
  requestId: string;
  agenceId: string;
  userId: string;
  sessionCaisseId?: string;
}): Promise<DistributionResult> {
  const { requestId, agenceId, userId, sessionCaisseId } = params;

  return await db.transaction(async (tx) => {
    // Get request
    const [request] = await tx
      .select()
      .from(tontineDistributionRequests)
      .where(eq(tontineDistributionRequests.id, requestId))
      .for("update")
      .limit(1);

    if (!request) {
      throw new Error("Demande de distribution non trouvée");
    }

    if (request.status !== TontineDistributionRequestStatus.SUBMITTED) {
      throw new Error(`Statut invalide: ${request.status}. La demande doit être SUBMITTED.`);
    }

    // Verify pot is still sufficient
    const retirable = await calculateRetirable(request.tontineId, request.beneficiaryMemberId);
    const requestedAmount = parseFloat(request.amountRequested);

    let approvedAmount = requestedAmount;
    let finalStatus: TontineDistributionRequestStatus = TontineDistributionRequestStatus.APPROVED;

    if (retirable.montantRetirable < requestedAmount) {
      // Partial distribution
      const rules = await getTontineRules(request.tontineId);
      if (!rules.allowPartialDistribution) {
        throw new Error("Distribution partielle non autorisée et pot insuffisant");
      }
      approvedAmount = retirable.montantRetirable;
      finalStatus = TontineDistributionRequestStatus.PARTIAL;
    }

    // Recalculate net amount with approved amount
    const penaltiesDeducted = parseFloat(request.penaltiesDeducted);
    const feesDeducted = parseFloat(request.feesDeducted);
    const netAmount = approvedAmount - penaltiesDeducted - feesDeducted;

    if (netAmount <= 0) {
      throw new Error("Montant net après déductions est nul");
    }

    // Handle based on payout method
    let mouvementId: string | null = null;
    let paymentIntentId: string | null = null;

    if (request.payoutMethod === TontinePayoutMethod.CASH) {
      // Cash distribution via ledger
      const ledgerResult = await executeWithLedger(
        "TONTINE",
        {
          tontineId: request.tontineId,
          clientId: undefined, // Will be filled from member
          sens: "DEBIT" as SensMouvement,
          montant: netAmount.toString(),
          typePaiement: "TONTINE_DISTRIBUTION",
          methodePaiement: "CASH",
          agenceId,
          sessionCaisseId,
          idempotencyKey: `tontine-dist-ledger-${request.id}`,
          metadata: { description: `Distribution tontine - Tour` },
        },
        async (txInner, mouvement) => {
          // Update tontine balance
          await txInner
            .update(tontines)
            .set({
              solde: sql`${tontines.solde}::numeric - ${netAmount}`,
              updatedAt: new Date(),
            })
            .where(eq(tontines.id, request.tontineId));

          // Update cycle pot_distributed
          await txInner
            .update(tontineCycles)
            .set({
              potDistributed: sql`${tontineCycles.potDistributed}::numeric + ${netAmount}`,
              updatedAt: new Date(),
            })
            .where(eq(tontineCycles.id, request.cycleId));

          // Mark member as received benefit
          await txInner
            .update(membresTontine)
            .set({
              aRecuBenefice: true,
              dateBenefice: new Date(),
              totalRecus: sql`${membresTontine.totalRecus}::numeric + ${netAmount}`,
              updatedAt: new Date(),
            })
            .where(eq(membresTontine.id, request.beneficiaryMemberId));

          // Mark penalties as paid if deducted
          if (penaltiesDeducted > 0) {
            await txInner
              .update(tontinePenalites)
              .set({
                statut: "PAID",
                datePaiement: new Date(),
                updatedAt: new Date(),
              })
              .where(and(
                eq(tontinePenalites.membreId, request.beneficiaryMemberId),
                eq(tontinePenalites.statut, "PENDING")
              ));
          }

          return { result: mouvement };
        }
      );

      mouvementId = ledgerResult.mouvement.id;
      finalStatus = TontineDistributionRequestStatus.SUCCESS;

      // Post to accounting (OHADA)
      try {
        await accountingPostingService.postFromMouvement({
          mouvement: ledgerResult.mouvement,
          agenceId,
          additionalMetadata: {
            tontineName: `Tontine`,
            memberName: `Membre`,
            turnNumber: 0,
          },
        });
      } catch (e) {
        logger.error({ err: e }, 'Error posting tontine distribution');
      }
    } else if (request.payoutMethod === TontinePayoutMethod.WALLET) {
      // Wallet transfer (internal)
      const ledgerResult = await executeWithLedger(
        "TONTINE",
        {
          tontineId: request.tontineId,
          compteId: request.targetWalletAccountId ?? undefined,
          sens: "CREDIT" as SensMouvement,
          montant: netAmount.toString(),
          typePaiement: "TONTINE_DISTRIBUTION",
          methodePaiement: "TRANSFER",
          agenceId,
          idempotencyKey: `tontine-dist-wallet-${request.id}`,
          metadata: { description: `Distribution tontine vers compte` },
        },
        async (txInner, mouvement) => {
          // Update tontine balance (debit)
          await txInner
            .update(tontines)
            .set({
              solde: sql`${tontines.solde}::numeric - ${netAmount}`,
              updatedAt: new Date(),
            })
            .where(eq(tontines.id, request.tontineId));

          // Credit target account
          if (request.targetWalletAccountId) {
            await txInner
              .update(comptes)
              .set({
                soldeCourant: sql`${comptes.soldeCourant}::numeric + ${netAmount}`,
                updatedAt: new Date(),
              })
              .where(eq(comptes.id, request.targetWalletAccountId));
          }

          // Update cycle and member
          await txInner
            .update(tontineCycles)
            .set({
              potDistributed: sql`${tontineCycles.potDistributed}::numeric + ${netAmount}`,
              updatedAt: new Date(),
            })
            .where(eq(tontineCycles.id, request.cycleId));

          await txInner
            .update(membresTontine)
            .set({
              aRecuBenefice: true,
              dateBenefice: new Date(),
              totalRecus: sql`${membresTontine.totalRecus}::numeric + ${netAmount}`,
              updatedAt: new Date(),
            })
            .where(eq(membresTontine.id, request.beneficiaryMemberId));

          return { result: mouvement };
        }
      );

      mouvementId = ledgerResult.mouvement.id;
      finalStatus = TontineDistributionRequestStatus.SUCCESS;
    } else if (request.payoutMethod === TontinePayoutMethod.MOBILE_MONEY) {
      // Mobile Money payout via PawaPay
      finalStatus = TontineDistributionRequestStatus.PENDING_PROVIDER;

      try {
        const paymentResult = await paymentService.initiatePayout({
          provider: request.provider as 'MTN' | 'AIRTEL',
          amount: netAmount,
          phone: request.targetMsisdn!,
          tontineId: request.tontineId,
          clientId: request.beneficiaryMemberId,
          description: `Distribution Tontine - Tour #${request.turnId}`,
          idempotencyKey: `tontine-dist-${request.id}`,
          agenceId,
        });
        paymentIntentId = paymentResult.id;
      } catch (error) {
        logger.error({ err: error, requestId: request.id }, 'Erreur initiation payout Mobile Money tontine');
        finalStatus = TontineDistributionRequestStatus.FAILED;
      }
    }

    // ========================================================================
    // HANDLE EXIT FEES (Platform Revenue)
    // ========================================================================
    if (finalStatus === TontineDistributionRequestStatus.SUCCESS && feesDeducted > 0) {
      // 1. Find the Agency's Safe (Coffre)
      // We look for a safe owned by this agency. 
      // Ideally should be "Caisse Principale" or similar, here we take the first active one.
      const [agencySafe] = await tx
        .select()
        .from(coffresForts)
        .where(and(
          eq(coffresForts.ownerId, agenceId),
          eq(coffresForts.statut, "ACTIVE")
        ))
        .limit(1);

      if (agencySafe) {
        // 2. Create Fee Movement (Tontine -> Coffre)
        await executeWithLedger(
          "TONTINE",
          {
            tontineId: request.tontineId,
            sens: "DEBIT" as SensMouvement, // Money leaves Tontine
            montant: feesDeducted.toString(),
            typePaiement: "COMMISSION",
            methodePaiement: "CASH", // Internal transfer implies cash/liquidity move
            agenceId,
            idempotencyKey: `tontine-fee-${request.id}`,
            metadata: { 
              description: `Frais de sortie tontine - Tour`,
              targetCoffreId: agencySafe.id 
            },
            requiresGlPosting: true, // IMPORTANT: Trigger Accounting
          },
          async (txInner, mouvement) => {
            // Debit Tontine
            await txInner
              .update(tontines)
              .set({
                solde: sql`${tontines.solde}::numeric - ${feesDeducted}`,
                updatedAt: new Date(),
              })
              .where(eq(tontines.id, request.tontineId));

            // Credit Agency Safe
            await txInner
              .update(coffresForts)
              .set({
                solde: sql`${coffresForts.solde}::numeric + ${feesDeducted}`,
                updatedAt: new Date(),
              })
              .where(eq(coffresForts.id, agencySafe.id));

            return { result: mouvement };
          }
        );
      } else {
         // Fallback: Just debit Tontine if no safe found? 
         // Or throw error? For now, we log warning and don't transfer to safe, 
         // but we MUST debit the Tontine to balance the "feesDeducted" from the calculation.
         // Actually, if we don't have a safe, where does the money go? 
         // Ideally it should go to a generic "Revenue Account".
         // For safety, we'll throw if no safe is found to ensure configuration is correct.
         throw new Error(`Aucun coffre-fort actif trouvé pour l'agence ${agenceId} afin de recevoir les frais.`);
      }
    }

    // Update turn status
    const turnStatus = finalStatus === TontineDistributionRequestStatus.SUCCESS
      ? TontineTurnStatus.PAID_OUT
      : (finalStatus === TontineDistributionRequestStatus.PARTIAL
        ? TontineTurnStatus.PARTIAL_PAID
        : TontineTurnStatus.READY);

    await tx
      .update(tontineTurns)
      .set({
        status: turnStatus,
        amountPaidOut: approvedAmount.toString(),
        updatedAt: new Date(),
      })
      .where(eq(tontineTurns.id, request.turnId));

    // Update request
    const [updated] = await tx
      .update(tontineDistributionRequests)
      .set({
        status: finalStatus,
        amountApproved: approvedAmount.toString(),
        amountPaid: (finalStatus === TontineDistributionRequestStatus.SUCCESS ? netAmount : 0).toString(),
        netAmount: netAmount.toString(),
        mouvementId,
        paymentIntentId,
        approvedAt: new Date(),
        approvedBy: userId,
        paidAt: finalStatus === TontineDistributionRequestStatus.SUCCESS ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(tontineDistributionRequests.id, requestId))
      .returning();

    return {
      requestId: updated.id,
      status: updated.status,
      amountRequested: parseFloat(updated.amountRequested),
      amountApproved: updated.amountApproved ? parseFloat(updated.amountApproved) : null,
      penaltiesDeducted: parseFloat(updated.penaltiesDeducted),
      feesDeducted: parseFloat(updated.feesDeducted),
      netAmount: updated.netAmount ? parseFloat(updated.netAmount) : null,
      paymentIntentId: updated.paymentIntentId || undefined,
      mouvementId: updated.mouvementId || undefined,
    };
  });
}

// ============================================================================
// PENALTY MANAGEMENT
// ============================================================================

/**
 * Apply penalties for late payments (called by cron job)
 */
export async function applyLatePenalties(agenceId: string): Promise<{ applied: number; skipped: number }> {
  const today = new Date();
  let applied = 0;
  let skipped = 0;

  // Get all open schedules past due date + grace period
  const schedules = await db
    .select({
      schedule: tontineSchedules,
      tontine: tontines,
    })
    .from(tontineSchedules)
    .innerJoin(tontines, eq(tontineSchedules.tontineId, tontines.id))
    .where(and(
      eq(tontineSchedules.agenceId, agenceId),
      eq(tontineSchedules.status, TontineScheduleStatus.OPEN),
      isNull(tontines.deletedAt)
    ));

  for (const { schedule, tontine } of schedules) {
    const rules = await getTontineRules(tontine.id);

    // Skip if penalties are disabled for this tontine
    if (!rules.penaltyEnabled) {
      continue;
    }

    const dueDate = new Date(schedule.dueDate);
    const graceEndDate = new Date(dueDate);
    graceEndDate.setDate(graceEndDate.getDate() + rules.lateGracePeriodDays);

    if (today <= graceEndDate) {
      continue; // Still in grace period
    }

    // Get members who haven't paid for this period
    const paidMembers = await db
      .select({ membreId: contributionsTontine.membreId })
      .from(contributionsTontine)
      .where(and(
        eq(contributionsTontine.tontineId, tontine.id),
        eq(contributionsTontine.tourNumero, schedule.periodNumber),
        eq(contributionsTontine.statutTransaction, "POSTED")
      ));

    const paidMemberIds = new Set(paidMembers.map(m => m.membreId).filter(Boolean));

    // Get all active members
    const members = await db
      .select()
      .from(membresTontine)
      .where(and(
        eq(membresTontine.tontineId, tontine.id),
        eq(membresTontine.statut, "ACTIVE"),
        isNull(membresTontine.deletedAt)
      ));

    for (const member of members) {
      if (paidMemberIds.has(member.id)) {
        continue; // Already paid
      }

      // Check if penalty already applied for this schedule
      const [existingPenalty] = await db
        .select()
        .from(tontinePenalites)
        .where(and(
          eq(tontinePenalites.membreId, member.id),
          eq(tontinePenalites.scheduleId, schedule.id),
          isNull(tontinePenalites.deletedAt)
        ))
        .limit(1);

      if (existingPenalty) {
        skipped++;
        continue;
      }

      // Calculate penalty amount
      let penaltyAmount = 0;
      if (rules.penaltyType === 'FIXED') {
        penaltyAmount = rules.penaltyValue;
      } else if (rules.penaltyType === 'PERCENTAGE') {
        penaltyAmount = (parseFloat(tontine.montantCotisation || "0") * rules.penaltyValue) / 100;
      }

      if (penaltyAmount <= 0) {
        continue;
      }

      // Apply penalty
      await db.insert(tontinePenalites).values({
        tontineId: tontine.id,
        membreId: member.id,
        cycleId: schedule.cycleId,
        scheduleId: schedule.id,
        montant: penaltyAmount.toString(),
        dateFaute: dueDate,
        statut: "PENDING",
        penaltyType: "LATE",
        autoApplied: true,
        motif: `Retard de paiement - Période ${schedule.periodNumber}`,
      });

      // Increment member late count
      await db
        .update(membresTontine)
        .set({
          lateCount: sql`${membresTontine.lateCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(membresTontine.id, member.id));

      // Score event: TONTINE_PENALITE for penalty incurrence
      if (member.clientId) {
        try {
          const { recordScoreEvent } = await import('./scoring-engine');
          await recordScoreEvent({
            clientId: member.clientId,
            agenceId: tontine.agenceId ?? undefined,
            eventType: 'TONTINE_PENALITE',
            refId: `tontine-penalty-${schedule.id}`,
            refType: 'tontine_penalite',
            montant: penaltyAmount,
            reason: `Retard de paiement - Période ${schedule.periodNumber}`,
          });
        } catch (scoreErr) {
          logger.warn({ err: scoreErr, memberId: member.id }, 'Score event TONTINE_PENALITE failed (non-blocking)');
        }
      }

      // Domain events: overdue + penalty applied
      if (member.clientId) {
        const daysOverdue = Math.floor(
          (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        dispatchDomainEvent({
          type: "TONTINE_CONTRIBUTION_OVERDUE",
          data: {
            tontineId: tontine.id,
            tontineName: tontine.nom,
            clientId: member.clientId,
            montantDu: parseFloat(tontine.montantCotisation || "0"),
            dueDate: dueDate.toLocaleDateString("fr-FR"),
            daysOverdue,
            agenceId,
          },
          timestamp: new Date(),
        });

        dispatchDomainEvent({
          type: "TONTINE_PENALTY_APPLIED",
          data: {
            tontineId: tontine.id,
            tontineName: tontine.nom,
            clientId: member.clientId,
            montantPenalite: penaltyAmount,
            motif: `Retard de paiement - Période ${schedule.periodNumber}`,
            lateCount: (member.lateCount || 0) + 1,
            agenceId,
          },
          timestamp: new Date(),
        });

        // NOTE: Score event already recorded above (refId: tontine-penalty-${schedule.id})
      }

      // Check if member should be suspended
      const newLateCount = (member.lateCount || 0) + 1;
      if (newLateCount >= rules.maxLateBeforeSuspend) {
        await db
          .update(membresTontine)
          .set({
            statut: newLateCount >= rules.maxLateBeforeExclude ? "EXCLUDED" : "INACTIVE",
            updatedAt: new Date(),
          })
          .where(eq(membresTontine.id, member.id));
      }

      applied++;
    }
  }

  return { applied, skipped };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateCycle,
  reorderTurns,
  calculateRetirable,
  createDistributionRequest,
  approveDistribution,
  applyLatePenalties,
  getTontineRules,
};
