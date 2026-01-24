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

// Helper to update balance
async function updateBalance(tx: any, entityType: 'coffre' | 'caisse', id: string, amountChange: number) {
    if (entityType === 'coffre') {
        const result = await tx.update(coffresForts)
            .set({ 
                solde: sql`${coffresForts.solde} + ${amountChange}`,
                updatedAt: new Date()
            })
            .where(eq(coffresForts.id, id))
            .returning({ solde: coffresForts.solde });
        return result[0];
    } else {
        const result = await tx.update(caisses)
            .set({ 
                solde: sql`${caisses.solde} + ${amountChange}`,
                updatedAt: new Date()
            })
            .where(eq(caisses.id, id))
            .returning({ solde: caisses.solde });
        return result[0];
    }
}

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

    // 4. Récupérer les entités
    const [coffre] = await tx.select().from(coffresForts).where(eq(coffresForts.id, transfert.coffreId));
    const [caisse] = await tx.select().from(caisses).where(eq(caisses.id, transfert.caisseId));

    if (!coffre || !caisse) {
      throw new Error("ENTITY_NOT_FOUND: Coffre ou Caisse introuvable");
    }

    // Déterminer source et destination
    const isCoffreSource = transfert.typeTransfert === "COFFRE_VERS_CAISSE";

    // Vérifier solde source (sauf pour les transferts de clôture qui ont déjà été validés)
    const montant = parseFloat(transfert.montant);
    const soldeSource = parseFloat((isCoffreSource ? coffre.solde : caisse.solde) || "0");
    const isClosingTransfer = transfert.motif?.includes("Remise de clôture");

    if (soldeSource < montant && !isClosingTransfer) {
      throw new Error(`INSUFFICIENT_FUNDS: Solde insuffisant (disponible: ${soldeSource}, requis: ${montant})`);
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

    // 9. Mise à jour des Soldes Réels
    // Note: caisses.solde est maintenant synchronisé par updateSessionSolde quand une session existe
    // On n'appelle updateBalance('caisse') QUE si updateSessionSolde n'a pas été appelé (fallback)
    const soldeDestAvant = parseFloat((isCoffreSource ? caisse.solde : coffre.solde) || "0");

    if (isCoffreSource) {
        await updateBalance(tx, 'coffre', coffre.id, -montant); // Coffre Debit
        // Caisse Credit: seulement si pas de session (fallback)
        if (!sessionSoldeUpdatedForDest) {
            await updateBalance(tx, 'caisse', caisse.id, montant);
        }
    } else {
        // Coffre Credit (toujours)
        await updateBalance(tx, 'coffre', coffre.id, montant);
        // Caisse Debit: seulement si pas de session ET pas transfert de clôture
        // (les transferts de clôture ont déjà le bon solde via finalizeClose)
        if (!sessionSoldeUpdatedForSource && !isClosingTransfer) {
            await updateBalance(tx, 'caisse', caisse.id, -montant);
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

    // 12. WebSocket Notification (Real-Time)
    try {
        const ws = getWsInstance();
        if (ws) {
             // Notify Agence (Coffre Updates)
             ws.broadcastToAggregate('coffre', transfert.agenceId, {
                type: 'REALTIME_EVENT',
                payload: {
                    aggregateType: 'coffre',
                    aggregateId: transfert.agenceId,
                    event: 'TRANSFERT_EXECUTED',
                    transfertId: transfertId
                }
             });

             // Notify Caisse (Balance Updates)
             // Pour les transferts de clôture, le solde de la caisse est déjà le montantReporte
             const newCaisseBalance = isCoffreSource
                 ? (Number(caisse.solde) + Number(montant))
                 : (isClosingTransfer ? Number(caisse.solde) : (Number(caisse.solde) - Number(montant)));

             ws.broadcastToAggregate('caisse', caisse.id, {
                type: 'CAISSE_UPDATE',
                payload: {
                    caisseId: caisse.id,
                    type: 'BALANCE_UPDATED',
                    newBalance: newCaisseBalance
                }
             });
        }
    } catch (e) {
        console.error("Failed to broadcast WS event for transfert", e);
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
