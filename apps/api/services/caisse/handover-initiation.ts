import { db } from "../../db";
import {
  caisseHandovers,
  caisseHandoverAuditLogs,
  sessionsCaisse,
  users,
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { createLogger } from "../../lib/logger";
import { InitiateHandoverParams, InitiateHandoverResult } from "./handover-types";

const logger = createLogger('HandoverInitiation');

/**
 * Initie un transfert de garde
 */
export async function initiateHandover(params: InitiateHandoverParams): Promise<InitiateHandoverResult> {
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
export async function startCounting(handoverId: string, toCaissierId: string, ipAddress?: string): Promise<{ success: boolean; error?: string }> {
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
