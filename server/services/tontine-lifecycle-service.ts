/**
 * TONTINE LIFECYCLE SERVICE
 * =========================
 * State machine for tontine lifecycle transitions.
 * Handles: DRAFT → ACTIVE → PAUSED → COMPLETED → CANCELLED
 * Plus member exit/replacement workflow.
 */

import { db } from "../db";
import { createLogger } from "../lib/logger";
import {
  tontines,
  membresTontine,
  tontineCycles,
  tontineSchedules,
  TontineStatus,
  TontineCycleStatus,
} from "@shared/schema/tontines";
import { eq, and, sql } from "drizzle-orm";
import { StatutMembreTontine } from "@shared/enum/status-constants";
import { dispatchDomainEvent } from "./notifications/domain-events/event-registry";

const logger = createLogger("TontineLifecycle");

// ============================================================================
// VALID TRANSITIONS
// ============================================================================

const VALID_TRANSITIONS: Record<string, string[]> = {
  [TontineStatus.DRAFT]:     [TontineStatus.ACTIVE, TontineStatus.CANCELLED],
  [TontineStatus.ACTIVE]:    [TontineStatus.PAUSED, TontineStatus.COMPLETED, TontineStatus.CANCELLED],
  [TontineStatus.PAUSED]:    [TontineStatus.ACTIVE, TontineStatus.CANCELLED],
  [TontineStatus.COMPLETED]: [],
  [TontineStatus.CANCELLED]: [],
};

// ============================================================================
// TRANSITION LOGIC
// ============================================================================

interface TransitionResult {
  success: boolean;
  previousStatus: string;
  newStatus: string;
  message: string;
}

/**
 * Transition a tontine from one status to another with validation.
 */
async function transitionStatus(
  tontineId: string,
  targetStatus: string,
  userId: string,
  reason?: string,
): Promise<TransitionResult> {
  const tontine = await db.select().from(tontines).where(eq(tontines.id, tontineId)).then(r => r[0]);
  if (!tontine) throw new Error("Tontine introuvable");

  const currentStatus = tontine.statut || TontineStatus.DRAFT;
  const allowed = VALID_TRANSITIONS[currentStatus] || [];

  if (!allowed.includes(targetStatus)) {
    throw new Error(
      `Transition invalide: ${currentStatus} → ${targetStatus}. ` +
      `Transitions autorisees: ${allowed.join(", ") || "aucune"}`
    );
  }

  // Pre-transition validations
  await validateTransition(tontine, targetStatus);

  // Execute transition
  const updateData: Record<string, any> = {
    statut: targetStatus,
    updatedAt: new Date(),
  };

  // Side effects per transition
  if (targetStatus === TontineStatus.ACTIVE && currentStatus === TontineStatus.DRAFT) {
    // Set start date if not already set
    if (!tontine.dateDebut) {
      updateData.dateDebut = new Date();
    }
  }

  if (targetStatus === TontineStatus.COMPLETED) {
    updateData.dateFin = new Date();
  }

  if (targetStatus === TontineStatus.CANCELLED) {
    updateData.dateFin = new Date();
  }

  await db.update(tontines).set(updateData).where(eq(tontines.id, tontineId));

  // Pause/cancel active cycles when tontine is paused/cancelled
  if (targetStatus === TontineStatus.PAUSED || targetStatus === TontineStatus.CANCELLED) {
    const cycleStatus = targetStatus === TontineStatus.PAUSED
      ? TontineCycleStatus.PAUSED
      : TontineCycleStatus.CLOSED;

    await db.update(tontineCycles)
      .set({ status: cycleStatus, updatedAt: new Date() })
      .where(and(
        eq(tontineCycles.tontineId, tontineId),
        eq(tontineCycles.status, TontineCycleStatus.OPEN),
      ));
  }

  // Resume paused cycles when tontine is resumed
  if (targetStatus === TontineStatus.ACTIVE && currentStatus === TontineStatus.PAUSED) {
    await db.update(tontineCycles)
      .set({ status: TontineCycleStatus.OPEN, updatedAt: new Date() })
      .where(and(
        eq(tontineCycles.tontineId, tontineId),
        eq(tontineCycles.status, TontineCycleStatus.PAUSED),
      ));
  }

  logger.info({ tontineId, from: currentStatus, to: targetStatus, userId, reason }, "Tontine status transitioned");

  dispatchDomainEvent({
    type: "TONTINE_STATUS_CHANGED",
    data: {
      tontineId,
      tontineName: tontine.nom,
      previousStatus: currentStatus,
      newStatus: targetStatus,
      reason,
      agenceId: tontine.agenceId ?? undefined,
    },
    timestamp: new Date(),
  });

  return {
    success: true,
    previousStatus: currentStatus,
    newStatus: targetStatus,
    message: `Tontine passée de ${currentStatus} à ${targetStatus}`,
  };
}

/**
 * Validate pre-conditions for a transition.
 */
async function validateTransition(tontine: any, targetStatus: string): Promise<void> {
  if (targetStatus === TontineStatus.ACTIVE) {
    // Must have minimum members to start
    const [memberCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(membresTontine)
      .where(and(
        eq(membresTontine.tontineId, tontine.id),
        eq(membresTontine.statut, StatutMembreTontine.ACTIVE),
      ));

    const minMembers = tontine.minMembersToStart || 3;
    if (memberCount.count < minMembers) {
      throw new Error(
        `Nombre minimum de membres requis: ${minMembers}. Actuellement: ${memberCount.count}`
      );
    }
  }

  if (targetStatus === TontineStatus.COMPLETED) {
    // Check if all members have received their payout (for rotative)
    if (tontine.distributionType === "ROTATIVE_SUSU") {
      const [unpaid] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(membresTontine)
        .where(and(
          eq(membresTontine.tontineId, tontine.id),
          eq(membresTontine.statut, StatutMembreTontine.ACTIVE),
          eq(membresTontine.aRecuBenefice, false),
        ));

      if (unpaid.count > 0) {
        throw new Error(
          `${unpaid.count} membre(s) n'ont pas encore recu leur distribution. ` +
          `Utilisez CANCELLED si vous voulez terminer sans completer le cycle.`
        );
      }
    }
  }
}

// ============================================================================
// MEMBER EXIT WORKFLOW
// ============================================================================

interface ExitRequestResult {
  memberId: string;
  exitRequestedAt: Date;
  noticePeriods: number;
}

/**
 * Request exit from a tontine. Starts the notice period.
 */
async function requestMemberExit(
  tontineId: string,
  memberId: string,
  _userId: string,
): Promise<ExitRequestResult> {
  const tontine = await db.select().from(tontines).where(eq(tontines.id, tontineId)).then(r => r[0]);
  if (!tontine) throw new Error("Tontine introuvable");

  if (!tontine.exitAllowed) {
    throw new Error("La sortie n'est pas autorisee pour cette tontine");
  }

  const member = await db.select().from(membresTontine)
    .where(and(eq(membresTontine.id, memberId), eq(membresTontine.tontineId, tontineId)))
    .then(r => r[0]);

  if (!member) throw new Error("Membre introuvable");
  if (member.statut !== StatutMembreTontine.ACTIVE) throw new Error("Seuls les membres actifs peuvent demander la sortie");
  if (member.exitRequestedAt) throw new Error("Une demande de sortie est deja en cours");

  const now = new Date();
  await db.update(membresTontine)
    .set({ exitRequestedAt: now, updatedAt: now })
    .where(eq(membresTontine.id, memberId));

  logger.info({ tontineId, memberId }, "Member exit requested");

  return {
    memberId,
    exitRequestedAt: now,
    noticePeriods: tontine.exitNoticePeriods || 0,
  };
}

/**
 * Approve a member's exit request.
 */
async function approveMemberExit(
  tontineId: string,
  memberId: string,
  userId: string,
): Promise<{ memberId: string; exitFeePercent: number; exitFeeAmount: number; exitApprovedAt: Date }> {
  const tontine = await db.select().from(tontines).where(eq(tontines.id, tontineId)).then(r => r[0]);
  if (!tontine) throw new Error("Tontine introuvable");

  const member = await db.select().from(membresTontine)
    .where(and(eq(membresTontine.id, memberId), eq(membresTontine.tontineId, tontineId)))
    .then(r => r[0]);

  if (!member) throw new Error("Membre introuvable");
  if (!member.exitRequestedAt) throw new Error("Aucune demande de sortie en cours");
  if (member.exitApprovedAt) throw new Error("La sortie a deja ete approuvee");

  const exitFeePercent = Number(tontine.exitFeePercent || 0);
  const totalCotisations = parseFloat(member.totalCotisations?.toString() || "0");
  const exitFeeAmount = exitFeePercent > 0 ? Math.round(totalCotisations * exitFeePercent / 100) : 0;

  const now = new Date();
  await db.update(membresTontine)
    .set({
      exitApprovedAt: now,
      statut: StatutMembreTontine.RETIRED,
      updatedAt: now,
    })
    .where(eq(membresTontine.id, memberId));

  // Deduct exit fee from tontine pot (retained as platform revenue)
  if (exitFeeAmount > 0) {
    await db.update(tontines)
      .set({
        solde: sql`GREATEST(0, ${tontines.solde}::numeric - ${exitFeeAmount})`,
        updatedAt: now,
      })
      .where(eq(tontines.id, tontineId));

    logger.info({ tontineId, memberId, exitFeeAmount, exitFeePercent }, "Exit fee deducted from pot");
  }

  // Update tontine member count
  await db.update(tontines)
    .set({
      membresActuels: sql`GREATEST(0, ${tontines.membresActuels} - 1)`,
      updatedAt: now,
    })
    .where(eq(tontines.id, tontineId));

  logger.info({ tontineId, memberId, approvedBy: userId, exitFeeAmount }, "Member exit approved");

  dispatchDomainEvent({
    type: "TONTINE_MEMBER_EXIT",
    data: {
      tontineId,
      tontineName: tontine.nom,
      memberId,
      clientId: member.clientId,
      exitFeePercent,
      exitFeeAmount,
      agenceId: tontine.agenceId ?? undefined,
    },
    timestamp: new Date(),
  });

  return {
    memberId,
    exitFeePercent,
    exitFeeAmount,
    exitApprovedAt: now,
  };
}

/**
 * Replace an exited member with a new one.
 */
async function replaceMember(
  tontineId: string,
  oldMemberId: string,
  newClientId: string,
  userId: string,
): Promise<{ oldMemberId: string; newMemberId: string }> {
  const tontine = await db.select().from(tontines).where(eq(tontines.id, tontineId)).then(r => r[0]);
  if (!tontine) throw new Error("Tontine introuvable");

  if (!tontine.replacementAllowed) {
    throw new Error("Le remplacement de membres n'est pas autorise pour cette tontine");
  }

  const oldMember = await db.select().from(membresTontine)
    .where(and(eq(membresTontine.id, oldMemberId), eq(membresTontine.tontineId, tontineId)))
    .then(r => r[0]);

  if (!oldMember) throw new Error("Ancien membre introuvable");
  if (oldMember.statut !== StatutMembreTontine.RETIRED && oldMember.statut !== StatutMembreTontine.EXCLUDED) {
    throw new Error("Seuls les membres retires ou exclus peuvent etre remplaces");
  }

  // Create new member inheriting position
  const [newMember] = await db.insert(membresTontine).values({
    tontineId,
    clientId: newClientId,
    position: oldMember.position,
    statut: StatutMembreTontine.ACTIVE,
    dateAdhesion: new Date(),
    totalCotisations: "0",
    totalRecus: "0",
    aRecuBenefice: false,
    joinFeePaid: !tontine.joinFeeEnabled,
  }).returning();

  // Link old member to replacement
  await db.update(membresTontine)
    .set({ replacedById: newMember.id, updatedAt: new Date() })
    .where(eq(membresTontine.id, oldMemberId));

  // Update tontine member count
  await db.update(tontines)
    .set({
      membresActuels: sql`${tontines.membresActuels} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(tontines.id, tontineId));

  logger.info({ tontineId, oldMemberId, newMemberId: newMember.id, replacedBy: userId }, "Member replaced");

  return {
    oldMemberId,
    newMemberId: newMember.id,
  };
}

// ============================================================================
// ROLE MANAGEMENT
// ============================================================================

/**
 * Assign a role to a tontine member.
 */
async function assignMemberRole(
  tontineId: string,
  memberId: string,
  role: string | null,
): Promise<void> {
  const member = await db.select().from(membresTontine)
    .where(and(eq(membresTontine.id, memberId), eq(membresTontine.tontineId, tontineId)))
    .then(r => r[0]);

  if (!member) throw new Error("Membre introuvable");

  await db.update(membresTontine)
    .set({ groupRole: role, updatedAt: new Date() })
    .where(eq(membresTontine.id, memberId));
}

// ============================================================================
// MID-CYCLE JOIN
// ============================================================================

interface MidCycleJoinResult {
  memberId: string;
  position: number;
  missedPeriods: number;
}

/**
 * Add a member mid-cycle. The member joins the active cycle but
 * won't receive distributions for already-completed turns.
 */
async function midCycleJoin(
  tontineId: string,
  clientId: string,
  userId: string,
): Promise<MidCycleJoinResult> {
  const tontine = await db.select().from(tontines).where(eq(tontines.id, tontineId)).then(r => r[0]);
  if (!tontine) throw new Error("Tontine introuvable");

  if (!tontine.allowMidCycleJoin) {
    throw new Error("L'adhesion en cours de cycle n'est pas autorisee pour cette tontine");
  }

  if (tontine.statut !== TontineStatus.ACTIVE) {
    throw new Error("La tontine doit etre active pour accepter de nouveaux membres");
  }

  // Check max members
  const currentMembers = (tontine.membresActuels || 0);
  if (currentMembers >= tontine.nombreMembres) {
    throw new Error("Le nombre maximum de membres est atteint");
  }

  // Check if client already a member
  const existing = await db.select().from(membresTontine)
    .where(and(
      eq(membresTontine.tontineId, tontineId),
      eq(membresTontine.clientId, clientId),
      eq(membresTontine.statut, StatutMembreTontine.ACTIVE),
    ))
    .limit(1);

  if (existing.length > 0) {
    throw new Error("Ce client est deja membre actif de cette tontine");
  }

  // Get next position
  const [maxPos] = await db
    .select({ max: sql<number>`COALESCE(MAX(position), 0)` })
    .from(membresTontine)
    .where(eq(membresTontine.tontineId, tontineId));

  const position = (maxPos?.max || 0) + 1;

  // Count closed schedules in the active cycle (missed periods for catch-up tracking)
  const [activeCycle] = await db
    .select({ id: tontineCycles.id })
    .from(tontineCycles)
    .where(and(
      eq(tontineCycles.tontineId, tontineId),
      eq(tontineCycles.status, TontineCycleStatus.OPEN),
    ))
    .limit(1);

  let missedPeriods = 0;
  if (activeCycle) {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tontineSchedules)
      .where(and(
        eq(tontineSchedules.tontineId, tontineId),
        eq(tontineSchedules.cycleId, activeCycle.id),
        eq(tontineSchedules.status, 'CLOSED'),
      ));
    missedPeriods = result?.count || 0;
  }

  // Create member
  const [newMember] = await db.insert(membresTontine).values({
    tontineId,
    clientId,
    position,
    statut: StatutMembreTontine.ACTIVE,
    dateAdhesion: new Date(),
    totalCotisations: "0",
    totalRecus: "0",
    aRecuBenefice: false,
    joinFeePaid: !tontine.joinFeeEnabled,
  }).returning();

  // Increment member count
  await db.update(tontines)
    .set({
      membresActuels: sql`COALESCE(${tontines.membresActuels}, 0) + 1`,
      updatedAt: new Date(),
    })
    .where(eq(tontines.id, tontineId));

  logger.info({ tontineId, clientId, memberId: newMember.id, position, joinedBy: userId }, "Mid-cycle join");

  dispatchDomainEvent({
    type: "TONTINE_MEMBER_JOINED",
    data: {
      tontineId,
      tontineName: tontine.nom,
      clientId,
      montantCotisation: Number(tontine.montantCotisation || 0),
      frequence: tontine.frequence || 'Mensuelle',
      position,
      midCycle: true,
      agenceId: tontine.agenceId ?? undefined,
    },
    timestamp: new Date(),
  });

  return {
    memberId: newMember.id,
    position,
    missedPeriods: missedPeriods || 0,
  };
}

// ============================================================================
// MEMBER SUSPENSION
// ============================================================================

/**
 * Suspend a member (typically triggered by arrears policy).
 */
async function suspendMember(
  tontineId: string,
  memberId: string,
  reason: string,
): Promise<{ memberId: string; suspended: boolean }> {
  const member = await db.select().from(membresTontine)
    .where(and(eq(membresTontine.id, memberId), eq(membresTontine.tontineId, tontineId)))
    .then(r => r[0]);

  if (!member) throw new Error("Membre introuvable");
  if (member.statut !== StatutMembreTontine.ACTIVE) {
    throw new Error("Seuls les membres actifs peuvent etre suspendus");
  }

  await db.update(membresTontine)
    .set({
      statut: "SUSPENDED" as any,
      updatedAt: new Date(),
    })
    .where(eq(membresTontine.id, memberId));

  logger.info({ tontineId, memberId, reason }, "Member suspended");

  return { memberId, suspended: true };
}

/**
 * Reinstate a suspended member.
 */
async function reinstateMember(
  tontineId: string,
  memberId: string,
): Promise<{ memberId: string; reinstated: boolean }> {
  const member = await db.select().from(membresTontine)
    .where(and(eq(membresTontine.id, memberId), eq(membresTontine.tontineId, tontineId)))
    .then(r => r[0]);

  if (!member) throw new Error("Membre introuvable");
  if (member.statut !== ("SUSPENDED" as any)) {
    throw new Error("Seuls les membres suspendus peuvent etre reactives");
  }

  await db.update(membresTontine)
    .set({
      statut: StatutMembreTontine.ACTIVE,
      updatedAt: new Date(),
    })
    .where(eq(membresTontine.id, memberId));

  logger.info({ tontineId, memberId }, "Member reinstated");

  return { memberId, reinstated: true };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  transitionStatus,
  requestMemberExit,
  approveMemberExit,
  replaceMember,
  assignMemberRole,
  midCycleJoin,
  suspendMember,
  reinstateMember,
  VALID_TRANSITIONS,
};
