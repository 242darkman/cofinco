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
import { balanceService } from "../balance-service";
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
    const [mouvementDebit] = await tx.insert(mouvementsFinanciers).values({
      montant: transfert.montant,
      sens: "DEBIT",
      sourceModule: "TRANSFERT",
      agenceId: transfert.agenceId,
      reference: refDebit,
      idempotencyKey: `${transfert.idempotencyKey || transfert.id}-debit`,
      statut: StatutTransaction.POSTED,
      dateOperation: new Date(),
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
    const [mouvementCredit] = await tx.insert(mouvementsFinanciers).values({
      montant: transfert.montant,
      sens: "CREDIT",
      sourceModule: "TRANSFERT",
      agenceId: transfert.agenceId,
      reference: refCredit,
      idempotencyKey: `${transfert.idempotencyKey || transfert.id}-credit`,
      statut: StatutTransaction.POSTED,
      dateOperation: new Date(),
      metadata: {
        transfertId: transfert.id,
        coffreId: !isCoffreSource ? coffre.id : undefined,
        caisseId: isCoffreSource ? caisse.id : undefined,
        type: !isCoffreSource ? "ENTREE_COFFRE" : "ENTREE_CAISSE",
        groupRef,
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
        const sessionId = sessionExecuteId || transfert.sessionRequestId; // Execute ID priority if passed, else Request ID
        // Note: Logic for session finding skipped for brevity but ideally reused
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
        // Need to find session for Dest Caisse
        // Assuming sessionExecuteId corresponds to the executing cashier receiving funds
        const sessionId = sessionExecuteId;

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
    } catch (e) {
        console.error("Failed to broadcast BALANCE_UPDATED for transfert", e);
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
