import { db } from "../../db";
import {
  caisseHandovers,
  caisseHandoverAuditLogs,
  sessionsCaisse,
  userRoles,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { createLogger } from "../../lib/logger";
import {
  ConfirmHandoverParams,
  ConfirmHandoverResult,
  CancelHandoverParams,
  CancelHandoverResult,
  ECART_APPROVAL_THRESHOLD
} from "./handover-types";

const logger = createLogger('HandoverResolution');

/**
 * Transfère la propriété de la session au nouveau caissier
 */
async function transferSessionOwnership(
  tx: typeof db,
  sessionId: string,
  newCaissierId: string,
  handoverId: string
): Promise<void> {
  // Récupérer la session actuelle
  const [session] = await tx.select({
    caissierId: sessionsCaisse.caissierId,
    originalCaissierId: sessionsCaisse.originalCaissierId,
    handoverCount: sessionsCaisse.handoverCount,
  })
  .from(sessionsCaisse)
  .where(eq(sessionsCaisse.id, sessionId));

  // Mettre à jour la session
  await tx.update(sessionsCaisse)
    .set({
      caissierId: newCaissierId,
      originalCaissierId: session.originalCaissierId || session.caissierId,
      handoverCount: (session.handoverCount || 0) + 1,
      lastHandoverId: handoverId,
      updatedAt: new Date(),
    })
    .where(eq(sessionsCaisse.id, sessionId));

  logger.info({
    sessionId,
    previousCaissierId: session.caissierId,
    newCaissierId,
    handoverCount: (session.handoverCount || 0) + 1,
  }, 'Propriété session transférée');
}

/**
 * Le caissier entrant confirme le transfert
 */
export async function confirmHandover(params: ConfirmHandoverParams): Promise<ConfirmHandoverResult> {
  const {
    handoverId,
    toCaissierId,
    montantVerifie,
    billetage,
    observations,
    ecartJustification,
    ipAddress,
    userAgent,
  } = params;

  try {
    return await db.transaction(async (tx) => {
      // 1. Récupérer le handover
      const [handover] = await tx.select()
        .from(caisseHandovers)
        .where(eq(caisseHandovers.id, handoverId));

      if (!handover) {
        return { success: false, error: 'Transfert non trouvé', errorCode: 'HANDOVER_NOT_FOUND' };
      }

      if (handover.toCaissierId !== toCaissierId) {
        return { success: false, error: 'Vous n\'êtes pas le caissier entrant désigné', errorCode: 'NOT_TO_CASHIER' };
      }

      if (!['PENDING', 'COUNTING'].includes(handover.statut)) {
        return { success: false, error: `Statut invalide: ${handover.statut}`, errorCode: 'INVALID_STATUS' };
      }

      // 2. Calculer l'écart
      const ecart = montantVerifie - Number(handover.montantCompte);
      const absEcart = Math.abs(ecart);
      const requiresApproval = absEcart > ECART_APPROVAL_THRESHOLD;

      // 3. Mettre à jour le handover
      const newStatus = requiresApproval ? 'DISPUTED' : 'CONFIRMED';

      const [updatedHandover] = await tx.update(caisseHandovers)
        .set({
          billetageEntrant: billetage,
          observationsEntrant: observations,
          ecart: ecart.toString(),
          ecartJustification,
          statut: newStatus,
          confirmedAt: requiresApproval ? null : new Date(),
          requiresApproval,
          ipAddressTo: ipAddress,
          userAgentTo: userAgent,
          updatedAt: new Date(),
        })
        .where(eq(caisseHandovers.id, handoverId))
        .returning();

      // 4. Si confirmé (sans écart majeur), transférer la session
      if (!requiresApproval) {
        await transferSessionOwnership(tx as any, handover.sessionId, toCaissierId, handoverId);
      }

      // 5. Log audit
      await tx.insert(caisseHandoverAuditLogs).values({
        handoverId,
        action: requiresApproval ? 'DISPUTED' : 'CONFIRMED',
        actorId: toCaissierId,
        statutAvant: handover.statut,
        statutApres: newStatus,
        details: {
          montantVerifie,
          montantSortant: Number(handover.montantCompte),
          ecart,
          billetage,
          ecartJustification,
        },
        ipAddress,
        userAgent,
      });

      logger.info({
        handoverId,
        toCaissierId,
        ecart,
        requiresApproval,
        newStatus,
      }, 'Transfert confirmé');

      return {
        success: true,
        handover: updatedHandover,
        requiresApproval,
      };
    });
  } catch (error: unknown) {
    logger.error({ err: error, handoverId }, 'Erreur confirmation handover');
    return {
      success: false,
      error: (error as Error).message || 'Erreur lors de la confirmation',
    };
  }
}

/**
 * Approuve un transfert contesté (écart important)
 */
export async function approveDisputed(
  handoverId: string,
  approvedBy: string,
  comment?: string,
  ipAddress?: string
): Promise<ConfirmHandoverResult> {
  try {
    return await db.transaction(async (tx) => {
      const [handover] = await tx.select()
        .from(caisseHandovers)
        .where(eq(caisseHandovers.id, handoverId));

      if (!handover) {
        return { success: false, error: 'Transfert non trouvé' };
      }

      if (handover.statut !== 'DISPUTED') {
        return { success: false, error: 'Ce transfert n\'est pas en attente d\'approbation' };
      }

      // Approuver et transférer
      const [updatedHandover] = await tx.update(caisseHandovers)
        .set({
          statut: 'CONFIRMED',
          confirmedAt: new Date(),
          approvedBy,
          approvedAt: new Date(),
          approvalComment: comment,
          updatedAt: new Date(),
        })
        .where(eq(caisseHandovers.id, handoverId))
        .returning();

      // Transférer la session
      await transferSessionOwnership(tx as any, handover.sessionId, handover.toCaissierId, handoverId);

      // Log
      await tx.insert(caisseHandoverAuditLogs).values({
        handoverId,
        action: 'APPROVED',
        actorId: approvedBy,
        statutAvant: 'DISPUTED',
        statutApres: 'CONFIRMED',
        details: { comment },
        ipAddress,
      });

      logger.info({ handoverId, approvedBy }, 'Transfert contesté approuvé');

      return {
        success: true,
        handover: updatedHandover,
      };
    });
  } catch (error: unknown) {
    logger.error({ err: error, handoverId }, 'Erreur approbation handover');
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Annule un transfert en cours
 */
export async function cancelHandover(params: CancelHandoverParams): Promise<CancelHandoverResult> {
  const { handoverId, cancelledBy, reason, ipAddress } = params;

  try {
    const [handover] = await db.select()
      .from(caisseHandovers)
      .where(eq(caisseHandovers.id, handoverId));

    if (!handover) {
      return { success: false, error: 'Transfert non trouvé' };
    }

    if (['CONFIRMED', 'CANCELLED'].includes(handover.statut)) {
      return { success: false, error: `Impossible d'annuler un transfert ${handover.statut.toLowerCase()}` };
    }

    // Vérifier que c'est un des participants ou un superviseur
    if (handover.fromCaissierId !== cancelledBy && handover.toCaissierId !== cancelledBy) {
      const [user] = await db.select({ role: userRoles.role })
        .from(userRoles)
        .where(eq(userRoles.userId, cancelledBy));
      const supervisorRoles = ['ADMIN', 'CHEF_AGENCE', 'SUPERVISEUR'];
      if (!user || !supervisorRoles.includes(user.role)) {
        return { success: false, error: 'Seuls les participants ou un superviseur peuvent annuler ce transfert' };
      }
    }

    const [updatedHandover] = await db.update(caisseHandovers)
      .set({
        statut: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledBy,
        cancelReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(caisseHandovers.id, handoverId))
      .returning();

    await db.insert(caisseHandoverAuditLogs).values({
      handoverId,
      action: 'CANCELLED',
      actorId: cancelledBy,
      statutAvant: handover.statut,
      statutApres: 'CANCELLED',
      details: { reason },
      ipAddress,
      userAgent: undefined, // Add if needed
    });

    logger.info({ handoverId, cancelledBy, reason }, 'Transfert annulé');

    return {
      success: true,
      handover: updatedHandover,
    };
  } catch (error: unknown) {
    logger.error({ err: error, handoverId }, 'Erreur annulation handover');
    return { success: false, error: (error as Error).message };
  }
}
