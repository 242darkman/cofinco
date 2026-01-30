/**
 * Script pour transférer les opérations vers la bonne session
 */

import { config } from "dotenv";
config();

import { db } from "./db";
import { sessionsCaisse, operationsCaisse } from "@shared/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { StatutSessionCaisse } from "@shared/enum/status-constants";
import { createLogger } from "./lib/logger";

const logger = createLogger('TransferOperations');

async function transferOperations() {
  logger.info('Starting transfer of operations to correct session');

  try {
    // 1. Session actuelle
    const currentSession = await db.query.sessionsCaisse.findFirst({
      where: eq(sessionsCaisse.statut, StatutSessionCaisse.OPEN),
      orderBy: desc(sessionsCaisse.openedAt)
    });

    if (!currentSession) {
      logger.error('No open session found');
      process.exit(1);
    }

    logger.info({
      sessionId: currentSession.id,
      openedAt: currentSession.openedAt?.toLocaleString('fr-FR'),
      balance: Number(currentSession.montantFermetureTheorique)
    }, 'Target session identified');

    // 2. Trouver les opérations de la session zombie
    const zombieSessionId = "3bec5a84-6c6f-49fc-b196-729d7bd621bb";

    const opsToTransfer = await db.query.operationsCaisse.findMany({
      where: eq(operationsCaisse.sessionId, zombieSessionId)
    });

    logger.info({ count: opsToTransfer.length }, 'Operations to transfer');

    // Filtrer celles créées APRÈS l'ouverture de la nouvelle session
    const currentSessionOpenedAt = currentSession.openedAt!;
    const eligibleOps = opsToTransfer.filter(op => {
      return op.createdAt && op.createdAt > currentSessionOpenedAt;
    });

    logger.info({ eligibleCount: eligibleOps.length, sessionOpenedAt: currentSessionOpenedAt.toLocaleString('fr-FR') }, 'Eligible operations after session opened');

    if (eligibleOps.length === 0) {
      logger.warn('No operations to transfer - operations were created BEFORE current session');

      // Log les opérations pour décider
      for (const op of opsToTransfer) {
        logger.debug({
          typeOperation: op.typeOperation,
          montant: Number(op.montant),
          createdAt: op.createdAt?.toLocaleString('fr-FR'),
          reference: op.reference
        }, 'Old session operation');
      }

      // Forcer le transfert de la cotisation tontine qui a été créée aujourd'hui
      const tontineOp = opsToTransfer.find(op =>
        op.typeOperation === 'TONTINE_CONTRIBUTION' &&
        op.createdAt &&
        op.createdAt.toDateString() === new Date().toDateString()
      );

      if (tontineOp) {
        logger.info('Force transferring today\'s tontine contribution');

        await db.update(operationsCaisse)
          .set({ sessionId: currentSession.id })
          .where(eq(operationsCaisse.id, tontineOp.id));

        // Mettre à jour le solde
        const montant = Number(tontineOp.montant);
        await db.update(sessionsCaisse)
          .set({
            montantFermetureTheorique: sql`${sessionsCaisse.montantFermetureTheorique} + ${montant}`,
            updatedAt: new Date()
          })
          .where(eq(sessionsCaisse.id, currentSession.id));

        logger.info({ montant }, 'Tontine contribution transferred');
      }

      process.exit(0);
    }

    // 3. Transférer les opérations éligibles
    logger.info('Transfer in progress');

    let totalDelta = 0;
    const typesEntrees = [
      'TONTINE_CONTRIBUTION',
      'DEPOSIT_SAVINGS',
      'DEPOSIT_CURRENT',
      'DEPOSIT_BLOCKED',
      'MISC_COLLECTION',
      'LOAN_REPAYMENT',
      'SAFE_SUPPLY',
      'INITIAL_DEPOSIT'
    ];

    for (const op of eligibleOps) {
      await db.update(operationsCaisse)
        .set({ sessionId: currentSession.id })
        .where(eq(operationsCaisse.id, op.id));

      const montant = Number(op.montant);
      const isEntree = typesEntrees.includes(op.typeOperation);
      const delta = isEntree ? montant : -montant;
      totalDelta += delta;

      logger.info({ typeOperation: op.typeOperation, delta }, 'Operation transferred');
    }

    // 4. Mettre à jour le solde
    if (totalDelta !== 0) {
      await db.update(sessionsCaisse)
        .set({
          montantFermetureTheorique: sql`${sessionsCaisse.montantFermetureTheorique} + ${totalDelta}`,
          updatedAt: new Date()
        })
        .where(eq(sessionsCaisse.id, currentSession.id));

      logger.info({ totalDelta }, 'Balance updated');
    }

    // 5. Vérification finale
    const updatedSession = await db.query.sessionsCaisse.findFirst({
      where: eq(sessionsCaisse.id, currentSession.id)
    });

    const finalOps = await db.query.operationsCaisse.findMany({
      where: eq(operationsCaisse.sessionId, currentSession.id)
    });

    logger.info({
      balance: Number(updatedSession?.montantFermetureTheorique),
      operationsCount: finalOps.length
    }, 'Transfer completed - session after correction');

  } catch (error: any) {
    logger.error({ err: error }, 'Transfer operations failed');
    process.exit(1);
  }

  process.exit(0);
}

transferOperations();
