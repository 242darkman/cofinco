import { db } from "../../db";
import {
  transfertsCoffreCaisse,
  mouvementsFinanciers,
  operationsCaisse,
  caisses,
  coffresForts,
  sessionsCaisse,
  transfertsCoffreAuditLogs,
} from "@shared/schema";
import { StatutTransaction, StatutTransfertCoffre, TypeOperationCaisse, MethodePaiement } from "@shared/enum/status-constants";
import { eq, sql, desc, and, isNull } from "drizzle-orm";
import { getWsInstance } from "../../ws-server";

import { updateSessionSolde } from "../ledger";
import { postGlForMouvement } from "../accounting-posting-service";
import { balanceService } from "../balance-service";
import { createLogger } from "../../lib/logger";

const logger = createLogger('CoffreTransfer');
import {
  assertCoffreCanDebit,
  assertCoffreCanCredit,
  assertCaisseCanDebit,
  assertCaisseCanCredit,
  updateCoffreBalance,
  updateCaisseBalance,
} from "./coffre-guard";

import type { TransfertCoffreCaisse } from "@shared/schema";

// Helper for reference generation if not imported
function generateReference(prefix: string): string {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
    return `${prefix}-${timestamp}${random}`;
}

export interface ExecuteTransferResult {
  success: boolean;
  transfert: TransfertCoffreCaisse;
  mouvementDebit: any;
  mouvementCredit: any;
  operationSource: any;
  operationDest: any;
  error?: string;
}

// Note: updateBalance removed — use updateCoffreBalance/updateCaisseBalance from coffre-guard.ts

export async function executeTransfertCoffre(
  transfertId: string,
  executorId: string,
  sessionExecuteId?: string,
  billetage?: Record<string, number>,
  ipAddress?: string,
  userAgent?: string
): Promise<ExecuteTransferResult> {
  
  return await db.transaction(async (tx) => {
    const [transfert] = await tx
      .select()
      .from(transfertsCoffreCaisse)
      .where(eq(transfertsCoffreCaisse.id, transfertId));

    if (!transfert) {
      throw new Error("TRANSFERT_NOT_FOUND: Transfert introuvable");
    }

    if (transfert.statut !== StatutTransfertCoffre.VALIDATED) {
      throw new Error(`INVALID_STATUS: Le transfert doit être 'Validé' pour être exécuté (actuel: ${transfert.statut})`);
    }

    if (transfert.verrouille || transfert.executedAt) {
      throw new Error("ALREADY_EXECUTED: Ce transfert a déjà été exécuté");
    }

    // 4. Déterminer direction et montant
    const isCoffreSource = transfert.typeTransfert === "COFFRE_VERS_CAISSE";
    const montant = parseFloat(transfert.montant);
    const isClosingTransfer = transfert.motif?.includes("Remise de clôture");
    const guardCtx = { userId: executorId, operationType: "TRANSFERT_COFFRE_CAISSE" };

    // 4a. Acquérir les verrous (SELECT FOR UPDATE) et valider les entités
    // L'ordre d'acquisition est toujours: coffre d'abord, puis caisse (évite les deadlocks)
    let coffre, caisse;
    let soldeSource: number;

    if (isCoffreSource) {
      // COFFRE → CAISSE : coffre débité, caisse créditée
      const coffreResult = await assertCoffreCanDebit(tx, transfert.coffreId, montant, guardCtx);
      const caisseResult = await assertCaisseCanCredit(tx, transfert.caisseId, montant, guardCtx);
      coffre = coffreResult.coffre;
      caisse = caisseResult.caisse;
      soldeSource = coffreResult.soldeBefore;
    } else {
      // CAISSE → COFFRE : caisse débitée, coffre crédité
      // Pour les transferts de clôture, on skip la vérification de solde caisse
      // (le solde a déjà été validé et défini par finalizeClose)
      const coffreResult = await assertCoffreCanCredit(tx, transfert.coffreId, montant, guardCtx);
      coffre = coffreResult.coffre;
      if (isClosingTransfer) {
        // Fermeture: juste verrouiller la caisse sans vérifier le solde
        const caisseResult = await assertCaisseCanCredit(tx, transfert.caisseId, montant, guardCtx);
        caisse = caisseResult.caisse;
        soldeSource = caisseResult.soldeBefore;
      } else {
        const caisseResult = await assertCaisseCanDebit(tx, transfert.caisseId, montant, guardCtx);
        caisse = caisseResult.caisse;
        soldeSource = caisseResult.soldeBefore;
      }
    }

    // 5. Générer les références
    const groupRef = generateReference("TRF");
    const refDebit = `${groupRef}-DEB`;
    const refCredit = `${groupRef}-CRE`;

    // 6. Créer le mouvement DÉBIT (Sortie Source)
    // Source: Si Coffre (Sortie Coffre), Si Caisse (Sortie Caisse)
    const typePaiement = isCoffreSource ? "COFFRE_TO_CAISSE" : "CAISSE_TO_COFFRE";
    const [mouvementDebit] = await tx.insert(mouvementsFinanciers).values({
      montant: transfert.montant,
      sens: "DEBIT",
      sourceModule: "COFFRE_TRANSFER",
      typePaiement: typePaiement as any,
      agenceId: transfert.agenceId,
      reference: refDebit,
      idempotencyKey: `${transfert.idempotencyKey || transfert.id}-debit`,
      statut: StatutTransaction.POSTED,
      dateOperation: new Date(),
      requiresGlPosting: true,
      glPostingStatus: "PENDING",
      metadata: {
        transfertId: transfert.id,
        coffreId: isCoffreSource ? coffre.id : undefined,
        caisseId: !isCoffreSource ? caisse.id : undefined,
        type: isCoffreSource ? "SORTIE_COFFRE" : "SORTIE_CAISSE",
        groupRef,
        description: `Transfert sortant vers ${isCoffreSource ? caisse.nom : coffre.nom}`,
        categorie: "Transfert Interne",
      },
    }).returning();

    // 7. Créer le mouvement CRÉDIT (Entrée Destination)
    // GL posting is handled via the DEBIT mouvement — one écriture covers both sides
    const [mouvementCredit] = await tx.insert(mouvementsFinanciers).values({
      montant: transfert.montant,
      sens: "CREDIT",
      sourceModule: "COFFRE_TRANSFER",
      typePaiement: typePaiement as any,
      agenceId: transfert.agenceId,
      reference: refCredit,
      idempotencyKey: `${transfert.idempotencyKey || transfert.id}-credit`,
      statut: StatutTransaction.POSTED,
      dateOperation: new Date(),
      requiresGlPosting: false,
      glPostingStatus: "SKIPPED",
      metadata: {
        transfertId: transfert.id,
        coffreId: !isCoffreSource ? coffre.id : undefined,
        caisseId: isCoffreSource ? caisse.id : undefined,
        type: !isCoffreSource ? "ENTREE_COFFRE" : "ENTREE_CAISSE",
        groupRef,
        glCoveredByMouvementDebit: true,
        description: `Transfert entrant de ${isCoffreSource ? coffre.nom : caisse.nom}`,
        categorie: "Transfert Interne",
      },
    }).returning();

    // 8. Gestion des Opérations Caisse (Seulement pour le côté Caisse)
    let operationSource: any = null;
    let operationDest: any = null;

    // Variables pour tracker si updateSessionSolde a été appelé (pour éviter double mise à jour caisse)
    let sessionSoldeUpdatedForSource = false;
    let sessionSoldeUpdatedForDest = false;

    // Si Caisse -> Coffre (Source = Caisse)
    if (!isCoffreSource) {
        // Caisse Source: Versement vers coffre (Sortie)
        // AUTO-FIND: Rechercher la session active de la caisse source si non fournie
        let sessionId = sessionExecuteId || transfert.sessionRequestId;

        if (!sessionId) {
          // Rechercher la session active pour la caisse source
          const [activeSourceSession] = await tx.select({ id: sessionsCaisse.id })
            .from(sessionsCaisse)
            .where(and(
              eq(sessionsCaisse.caisseId, transfert.caisseId),
              eq(sessionsCaisse.statut, "OPEN")
            ))
            .limit(1);

          if (activeSourceSession) {
            sessionId = activeSourceSession.id;
            logger.info({ caisseId: transfert.caisseId, sessionId }, 'Auto-found source caisse session');
          }
        }

        if (sessionId) {
            const [op] = await tx.insert(operationsCaisse).values({
                sessionId,
                mouvementId: mouvementDebit.id,
                typeOperation: TypeOperationCaisse.SAFE_DEPOSIT,
                montant: transfert.montant,
                methodePaiement: MethodePaiement.CASH,
                reference: refDebit,
                description: `Versement vers ${coffre.nom}`,
                statut: StatutTransaction.POSTED
            }).returning();
            operationSource = op;

            // Update Session montantFermetureTheorique + Caisse solde (Sortie)
            // Pour les transferts de clôture: syncCaisseBalance=false car le solde caisse
            // a déjà été défini à montantReporte par finalizeClose
            await updateSessionSolde(tx, sessionId, -montant, !isClosingTransfer);
            sessionSoldeUpdatedForSource = true;
        }
    }

    // Si Coffre -> Caisse (Dest = Caisse)
    if (isCoffreSource) {
        // Caisse Dest: Approvisionnement depuis coffre (Entrée)
        // AUTO-FIND: Rechercher la session active de la caisse destination si non fournie
        let sessionId = sessionExecuteId;

        if (!sessionId) {
          // Rechercher la session active pour la caisse destination
          const [activeDestSession] = await tx.select({ id: sessionsCaisse.id })
            .from(sessionsCaisse)
            .where(and(
              eq(sessionsCaisse.caisseId, transfert.caisseId),
              eq(sessionsCaisse.statut, "OPEN")
            ))
            .limit(1);

          if (activeDestSession) {
            sessionId = activeDestSession.id;
            logger.info({ caisseId: transfert.caisseId, sessionId }, 'Auto-found destination caisse session');
          }
        }

        if (sessionId) {
            const [op] = await tx.insert(operationsCaisse).values({
                sessionId,
                mouvementId: mouvementCredit.id,
                typeOperation: TypeOperationCaisse.SAFE_SUPPLY,
                montant: transfert.montant,
                methodePaiement: MethodePaiement.CASH,
                reference: refCredit,
                description: `Approvisionnement depuis ${coffre.nom}`,
                statut: StatutTransaction.POSTED
            }).returning();
            operationDest = op;

             // Update Session montantFermetureTheorique + Caisse solde (Entrée)
             await updateSessionSolde(tx, sessionId, montant, true);
             sessionSoldeUpdatedForDest = true;
        }
    }

    // 9. Mise à jour des Soldes Réels (atomique, rows déjà verrouillées par les guards)
    // Note: caisses.solde est synchronisé par updateSessionSolde quand une session existe
    const soldeDestAvant = parseFloat((isCoffreSource ? caisse.solde : coffre.solde) || "0");

    if (isCoffreSource) {
        await updateCoffreBalance(tx, coffre.id, -montant); // Coffre Debit
        // Caisse Credit: seulement si pas de session (fallback)
        if (!sessionSoldeUpdatedForDest) {
            await updateCaisseBalance(tx, caisse.id, montant);
        }
    } else {
        // Coffre Credit (toujours)
        await updateCoffreBalance(tx, coffre.id, montant);
        // Caisse Debit: seulement si pas de session ET pas transfert de clôture
        if (!sessionSoldeUpdatedForSource && !isClosingTransfer) {
            await updateCaisseBalance(tx, caisse.id, -montant);
        }
    }

    // 9b. GL Posting — one écriture for the whole transfer (via DEBIT mouvement)
    if (transfert.agenceId) {
      try {
        const glResult = await postGlForMouvement(tx, mouvementDebit, transfert.agenceId, executorId, {
          transfertId: transfert.id,
          coffreNom: coffre.nom,
          caisseNom: caisse.nom,
          direction: isCoffreSource ? "COFFRE→CAISSE" : "CAISSE→COFFRE",
        });
        if (glResult) {
          await tx.update(mouvementsFinanciers)
            .set({ glPostingStatus: "POSTED", glPostingError: null })
            .where(eq(mouvementsFinanciers.id, mouvementDebit.id));
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown GL error";
        logger.error({ transfertId, error: message }, 'GL posting failed');
        await tx.update(mouvementsFinanciers)
          .set({ glPostingStatus: "FAILED", glPostingError: message })
          .where(eq(mouvementsFinanciers.id, mouvementDebit.id));
        // Don't rethrow — coffre transfer should still succeed even if GL posting fails
        // The FAILED status will be picked up by the coverage report
      }
    }

    // 10. Finaliser le transfert
    const [updatedTransfert] = await tx.update(transfertsCoffreCaisse)
      .set({
        statut: StatutTransfertCoffre.EXECUTED,
        executedBy: executorId,
        executedAt: new Date(),
        sessionExecuteId,
        mouvementDebitId: mouvementDebit.id,
        mouvementCreditId: mouvementCredit.id,
        operationSourceId: operationSource?.id || null,
        operationDestId: operationDest?.id || null,
        billetage: billetage || transfert.billetage,
        verrouille: true,
        updatedAt: new Date(),
      })
      .where(eq(transfertsCoffreCaisse.id, transfertId))
      .returning();

    // 11. Audit Log
    await tx.insert(transfertsCoffreAuditLogs).values({
      transfertId,
      action: "EXECUTED",
      statutAvant: StatutTransfertCoffre.VALIDATED,
      statutApres: StatutTransfertCoffre.EXECUTED,
      details: {
        amount: montant,
        coffreId: coffre.id,
        caisseId: caisse.id,
        direction: isCoffreSource ? "COFFRE->CAISSE" : "CAISSE->COFFRE",
        soldeSourceAvant: soldeSource,
        soldeDestAvant: soldeDestAvant,
        // (skipped apres soldes for brevity/perf, or fetch from update result)
      },
      userId: executorId,
      ipAddress,
      userAgent,
    });

    // 12. WebSocket Notification (Real-Time) - BALANCE_UPDATED standardisé
    try {
        const mouvementRef = groupRef;
        const previousCoffreBalance = parseFloat(coffre.solde || "0");
        const previousCaisseBalance = parseFloat(caisse.solde || "0");

        // Coffre balance update
        const newCoffreBalance = isCoffreSource
          ? previousCoffreBalance - montant
          : previousCoffreBalance + montant;

        balanceService.broadcastBalanceUpdate({
          entityType: 'coffre',
          entityId: coffre.id,
          agenceId: transfert.agenceId,
          newBalance: newCoffreBalance,
          previousBalance: previousCoffreBalance,
          mouvementRef,
          sourceModule: 'TRANSFERT',
          typePaiement: isCoffreSource ? 'SAFE_SUPPLY' : 'SAFE_DEPOSIT',
        });

        // Caisse balance update (si pas un transfert de clôture)
        if (!isClosingTransfer) {
          const newCaisseBalance = isCoffreSource
            ? previousCaisseBalance + montant
            : previousCaisseBalance - montant;

          balanceService.broadcastBalanceUpdate({
            entityType: 'caisse',
            entityId: caisse.id,
            agenceId: transfert.agenceId,
            newBalance: newCaisseBalance,
            previousBalance: previousCaisseBalance,
            mouvementRef,
            sourceModule: 'TRANSFERT',
            typePaiement: isCoffreSource ? 'SAFE_SUPPLY' : 'SAFE_DEPOSIT',
          });
        }
      // ACCOUNTING_UPDATE broadcast
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "ACCOUNTING_UPDATE",
          payload: { type: "coffre_transfer_posted", transfertId: transfert.id },
        });
      }
    } catch (e) {
        logger.error({ err: e }, 'Failed to broadcast BALANCE_UPDATED for transfert');
    }

    return {
      success: true,
      transfert: updatedTransfert,
      mouvementDebit,
      mouvementCredit,
      operationSource,
      operationDest,
    };
  });
}
