import { db } from "../../db";
import {
  caisseHandovers,
  caisseHandoverAuditLogs,
  sessionsCaisse,
  users,
  userRoles,
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { createLogger } from "../../lib/logger";
import {
  InitiateHandoverParams,
  InitiateHandoverResult,
  ConfirmHandoverParams,
  ConfirmHandoverResult,
  CancelHandoverParams,
  CancelHandoverResult,
  ECART_APPROVAL_THRESHOLD
} from "./handover-types";

const logger = createLogger('HandoverWorkflow');

export class HandoverWorkflow {
  /**
   * Initie un transfert de garde
   */
  async initiateHandover(params: InitiateHandoverParams): Promise<InitiateHandoverResult> {
    const {
      sessionId,
      fromCaissierId,
      toCaissierId,
      montantCompte,
      billetage,
      motif,
      observations,
      ipAddress,
      userAgent,
    } = params;

    try {
      return await db.transaction(async (tx) => {
        // 1. Vérifier que la session existe et est ouverte
        const [session] = await tx.select({
          id: sessionsCaisse.id,
          caisseId: sessionsCaisse.caisseId,
          agenceId: sessionsCaisse.agenceId,
          caissierId: sessionsCaisse.caissierId,
          statut: sessionsCaisse.statut,
          montantFermetureTheorique: sessionsCaisse.montantFermetureTheorique,
          soldeActuel: sessionsCaisse.soldeActuel,
        })
        .from(sessionsCaisse)
        .where(eq(sessionsCaisse.id, sessionId));

        if (!session) {
          return { success: false, error: 'Session non trouvée', errorCode: 'SESSION_NOT_FOUND' };
        }

        if (session.statut !== 'OPEN') {
          return { success: false, error: 'La session n\'est pas ouverte', errorCode: 'SESSION_NOT_OPEN' };
        }

        // 2. Vérifier que le caissier sortant est bien le propriétaire actuel
        if (session.caissierId !== fromCaissierId) {
          return { success: false, error: 'Vous n\'êtes pas le caissier de cette session', errorCode: 'NOT_CURRENT_CASHIER' };
        }

        // 3. Vérifier que le caissier entrant est différent et existe
        if (fromCaissierId === toCaissierId) {
          return { success: false, error: 'Le caissier entrant doit être différent', errorCode: 'SAME_CASHIER' };
        }

        const [toCaissier] = await tx.select({ id: users.id })
          .from(users)
          .where(eq(users.id, toCaissierId));

        if (!toCaissier) {
          return { success: false, error: 'Caissier entrant non trouvé', errorCode: 'CASHIER_NOT_FOUND' };
        }

        // 4. Vérifier qu'il n'y a pas déjà un handover en cours
        const [existingHandover] = await tx.select()
          .from(caisseHandovers)
          .where(and(
            eq(caisseHandovers.sessionId, sessionId),
            sql`${caisseHandovers.statut} IN ('PENDING', 'COUNTING')`
          ));

        if (existingHandover) {
          return { success: false, error: 'Un transfert est déjà en cours', errorCode: 'HANDOVER_IN_PROGRESS' };
        }

        // 5. Calculer le montant théorique
        const montantTheorique = Number(session.soldeActuel || session.montantFermetureTheorique || 0);

        // 6. Créer le handover
        const [handover] = await tx.insert(caisseHandovers).values({
          sessionId,
          caisseId: session.caisseId,
          agenceId: session.agenceId,
          fromCaissierId,
          toCaissierId,
          montantTheorique: montantTheorique.toString(),
          montantCompte: montantCompte.toString(),
          ecart: (montantCompte - montantTheorique).toString(),
          billetageSortant: billetage,
          motif,
          observationsSortant: observations,
          statut: 'PENDING',
          ipAddressFrom: ipAddress,
          userAgentFrom: userAgent,
        }).returning();

        // 7. Log audit
        await tx.insert(caisseHandoverAuditLogs).values({
          handoverId: handover.id,
          action: 'INITIATED',
          actorId: fromCaissierId,
          statutAvant: null,
          statutApres: 'PENDING',
          details: {
            montantTheorique,
            montantCompte,
            billetage,
            motif,
          },
          ipAddress,
          userAgent,
        });

        logger.info({
          handoverId: handover.id,
          sessionId,
          fromCaissierId,
          toCaissierId,
          montantTheorique,
          montantCompte,
        }, 'Transfert de garde initié');

        return {
          success: true,
          handover,
        };
      });
    } catch (error: unknown) {
      logger.error({ err: error, sessionId }, 'Erreur initiation handover');
      return {
        success: false,
        error: (error as Error).message || 'Erreur lors de l\'initiation du transfert',
      };
    }
  }

  /**
   * Le caissier entrant démarre le comptage
   */
  async startCounting(handoverId: string, toCaissierId: string, ipAddress?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const [handover] = await db.select()
        .from(caisseHandovers)
        .where(eq(caisseHandovers.id, handoverId));

      if (!handover) {
        return { success: false, error: 'Transfert non trouvé' };
      }

      if (handover.toCaissierId !== toCaissierId) {
        return { success: false, error: 'Vous n\'êtes pas le caissier entrant désigné' };
      }

      if (handover.statut !== 'PENDING') {
        return { success: false, error: `Statut invalide: ${handover.statut}` };
      }

      await db.update(caisseHandovers)
        .set({
          statut: 'COUNTING',
          countingStartedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(caisseHandovers.id, handoverId));

      await db.insert(caisseHandoverAuditLogs).values({
        handoverId,
        action: 'COUNTING_STARTED',
        actorId: toCaissierId,
        statutAvant: 'PENDING',
        statutApres: 'COUNTING',
        ipAddress,
      });

      logger.info({ handoverId, toCaissierId }, 'Comptage démarré');

      return { success: true };
    } catch (error: unknown) {
      logger.error({ err: error, handoverId }, 'Erreur démarrage comptage');
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Le caissier entrant confirme le transfert
   */
  async confirmHandover(params: ConfirmHandoverParams): Promise<ConfirmHandoverResult> {
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
          await this.transferSessionOwnership(tx as any, handover.sessionId, toCaissierId, handoverId);
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
  async approveDisputed(
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
        await this.transferSessionOwnership(tx as any, handover.sessionId, handover.toCaissierId, handoverId);

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
  async cancelHandover(params: CancelHandoverParams): Promise<CancelHandoverResult> {
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

  /**
   * Transfère la propriété de la session au nouveau caissier
   */
  private async transferSessionOwnership(
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
}

export const handoverWorkflow = new HandoverWorkflow();
