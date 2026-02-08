/**
 * Version améliorée de createRemboursementWithLedger avec allocation FIFO automatique
 */

import { db } from "../db";
import { 
  credits, 
  remboursements, 
  mouvementsFinanciers,
  type Remboursement,
  type MouvementFinancier
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { executeWithLedger, updateCreditSolde, updateSessionSolde, validateUserId } from "../services/ledger";
import { 
  allocateRepaymentToSchedule, 
  type AllocationResult,
  type RepaymentAllocationOptions 
} from "../services/repayment-allocation-service";
import { createFactureForRemboursement } from "./finance";
import { getWsInstance } from "../ws-server";
import { createLogger } from "../lib/logger";
import { StatutCredit } from "@shared/enum/status-constants";

const logger = createLogger('FinanceEnhanced');

export interface EnhancedRepaymentResult {
  remboursement: Remboursement;
  mouvement: MouvementFinancier;
  allocationResult: AllocationResult;
  facture?: any;
}

/**
 * Crée un remboursement avec allocation FIFO automatique aux échéances
 */
export async function createRemboursementWithAllocation(
  data: {
    creditId: string;
    montant: string;
    methodePaiement: string;
    sessionCaisseId?: string;
    observations?: string;
    idempotencyKey?: string;
    allocationOptions?: RepaymentAllocationOptions;
  },
  userId?: string
): Promise<EnhancedRepaymentResult> {
  
  logger.info({ creditId: data.creditId, montant: data.montant }, 'Creating repayment with FIFO allocation');

  // Récupérer le crédit
  const [credit] = await db.select().from(credits).where(eq(credits.id, data.creditId));
  if (!credit) {
    throw new Error(`Credit ${data.creditId} not found`);
  }

  // Validation pour paiements en espèces
  if (data.methodePaiement === 'CASH' && !data.sessionCaisseId) {
    throw new Error("Une session de caisse active est requise pour les remboursements en espèces");
  }

  // Exécuter dans une transaction unique avec le ledger
  const result = await executeWithLedger(
    "CREDIT",
    {
      montant: data.montant,
      sens: "CREDIT",
      clientId: credit.clientId,
      creditId: data.creditId,
      sessionCaisseId: data.sessionCaisseId,
      methodePaiement: data.methodePaiement,
      typePaiement: "CREDIT_REPAYMENT",
      idempotencyKey: data.idempotencyKey,
    },
    async (tx, mouvement) => {
      // 1. Valider l'utilisateur
      const validatedUserId = await validateUserId(tx, userId);

      // 2. Créer le remboursement
      const [remboursement] = await tx.insert(remboursements).values({
        creditId: data.creditId,
        mouvementId: mouvement.id,
        montant: data.montant,
        dateRemboursement: new Date(),
        methodePaiement: data.methodePaiement as any,
        observations: data.observations,
        createdBy: validatedUserId,
        idempotencyKey: data.idempotencyKey,
        allocationStrategy: data.allocationOptions?.strategy || 'FIFO',
      }).returning();

      // 3. Allouer le remboursement aux échéances (FIFO)
      const allocationResult = await allocateRepaymentToSchedule(
        tx,
        remboursement.id,
        data.creditId,
        parseFloat(data.montant),
        validatedUserId,
        data.allocationOptions
      );

      // 4. Calculer le nouveau solde du crédit
      // Le solde restant = somme des échéances non payées
      const echeancesNonPayees = allocationResult.updatedEcheances.filter(e => 
        Number(e.montantPaye || 0) < Number(e.montantTotal)
      );
      
      const nouveauSoldeRestant = echeancesNonPayees.reduce((sum, e) => {
        const restant = Number(e.montantTotal) - Number(e.montantPaye || 0);
        return sum + restant;
      }, 0);

      // 5. Mettre à jour le crédit
      let nouveauStatutCredit = credit.statut;
      
      // Si toutes les échéances sont payées, le crédit est soldé
      if (nouveauSoldeRestant === 0 && echeancesNonPayees.length === 0) {
        nouveauStatutCredit = StatutCredit.SETTLED;
      }

      const [updatedCredit] = await tx.update(credits)
        .set({
          soldeRestant: nouveauSoldeRestant.toString(),
          statut: nouveauStatutCredit as any,
          updatedAt: new Date()
        })
        .where(eq(credits.id, data.creditId))
        .returning();

      // 6. Mettre à jour la session de caisse si applicable
      let nouveauSoldeSession: string | undefined;
      if (data.sessionCaisseId) {
        nouveauSoldeSession = await updateSessionSolde(tx, data.sessionCaisseId, parseFloat(data.montant));
      }

      return {
        result: { remboursement, allocationResult },
        additionalEventData: {
          nouveauSoldeCredit: nouveauSoldeRestant,
          nouveauSoldeSession,
          updatedCredit,
          allocationsCount: allocationResult.allocations.length,
          overpayment: allocationResult.overpaymentAmount
        },
      };
    },
    userId
  ).then(async ({ result: { remboursement, allocationResult }, mouvement }) => {
    // Générer la facture
    const facture = await createFactureForRemboursement({
      creditId: data.creditId,
      numeroCredit: credit.numeroCredit,
      clientId: credit.clientId,
      montant: data.montant,
      agentId: userId,
      sessionCaisseId: data.sessionCaisseId,
    }).catch(err => {
      logger.error({ err }, 'Failed to create invoice for repayment');
      return undefined;
    });

    // Émettre les événements WebSocket
    const wsInstance = getWsInstance();
    if (wsInstance) {
      // Événement de création du remboursement
      wsInstance.broadcast({
        type: 'CREDIT_REPAYMENT_CREATED',
        payload: {
          remboursementId: remboursement.id,
          creditId: data.creditId,
          montant: data.montant,
          allocations: allocationResult.allocations.length,
          timestamp: new Date().toISOString()
        }
      });

      // Événement de mise à jour des échéances
      wsInstance.broadcast({
        type: 'CREDIT_SCHEDULE_UPDATED',
        payload: {
          creditId: data.creditId,
          updatedEcheances: allocationResult.updatedEcheances.map(e => ({
            id: e.id,
            statut: e.statut,
            montantPaye: e.montantPaye,
            isPaid: Number(e.montantPaye || 0) >= Number(e.montantTotal)
          })),
          totalAllocated: allocationResult.totalAllocated,
          overpayment: allocationResult.overpaymentAmount,
          timestamp: new Date().toISOString()
        }
      });

      // Événement de mise à jour du solde
      wsInstance.broadcast({
        type: 'CREDIT_BALANCE_UPDATED',
        payload: {
          creditId: data.creditId,
          clientId: credit.clientId,
          nouveauSoldeRestant: credit.soldeRestant,
          statut: credit.statut,
          timestamp: new Date().toISOString()
        }
      });

      // Événement détaillé pour le dashboard
      wsInstance.broadcast({
        type: 'REPAYMENT_ALLOCATED',
        payload: {
          remboursementId: remboursement.id,
          creditId: data.creditId,
          numeroCredit: credit.numeroCredit,
          clientId: credit.clientId,
          montantTotal: parseFloat(data.montant),
          allocations: allocationResult.allocations.map(a => ({
            echeanceId: a.echeanceId,
            montant: a.allocatedAmount,
            statut: a.echeanceStatus,
            isPaid: a.isPaid
          })),
          overpayment: allocationResult.overpaymentAmount,
          creditBalance: allocationResult.creditBalance,
          message: generateAllocationMessage(allocationResult),
          timestamp: new Date().toISOString()
        }
      });
    }

    return {
      remboursement,
      mouvement,
      allocationResult,
      facture
    };
  });

  logger.info({
    remboursementId: result.remboursement.id,
    creditId: data.creditId,
    allocations: result.allocationResult.allocations.length,
    overpayment: result.allocationResult.overpaymentAmount
  }, 'Repayment created with allocations');

  return result;
}

/**
 * Génère un message descriptif pour l'allocation
 */
function generateAllocationMessage(allocationResult: AllocationResult): string {
  const { allocations, overpaymentAmount, totalAllocated } = allocationResult;
  
  if (allocations.length === 0) {
    return "Aucune échéance à payer";
  }

  const paidCount = allocations.filter(a => a.isPaid).length;
  const partialCount = allocations.filter(a => !a.isPaid).length;
  
  let message = `Paiement de ${totalAllocated.toLocaleString('fr-FR')} FCFA`;
  
  if (paidCount > 0 && partialCount === 0) {
    message += ` - ${paidCount} échéance${paidCount > 1 ? 's' : ''} soldée${paidCount > 1 ? 's' : ''}`;
  } else if (paidCount > 0 && partialCount > 0) {
    message += ` - ${paidCount} échéance${paidCount > 1 ? 's' : ''} soldée${paidCount > 1 ? 's' : ''}`;
    message += ` et ${partialCount} partiellement payée${partialCount > 1 ? 's' : ''}`;
  } else if (partialCount > 0) {
    message += ` - Paiement partiel de ${partialCount} échéance${partialCount > 1 ? 's' : ''}`;
  }
  
  if (overpaymentAmount > 0) {
    message += ` (Trop-perçu: ${overpaymentAmount.toLocaleString('fr-FR')} FCFA)`;
  }
  
  return message;
}

/**
 * Extourne un remboursement et ses allocations
 */
export async function reverseRemboursement(
  remboursementId: string,
  reason: string,
  userId?: string
): Promise<{ success: boolean; message: string }> {
  
  logger.info({ remboursementId, reason }, 'Reversing repayment');

  const { reverseRepaymentAllocations } = await import("../services/repayment-allocation-service");

  return await db.transaction(async (tx) => {
    // 1. Récupérer le remboursement
    const [remboursement] = await tx.select()
      .from(remboursements)
      .where(eq(remboursements.id, remboursementId));

    if (!remboursement) {
      throw new Error('Remboursement non trouvé');
    }

    if (remboursement.isReversed) {
      return { success: false, message: 'Ce remboursement a déjà été extourné' };
    }

    // 2. Reverser les allocations
    const { reversedAllocations, updatedEcheances } = await reverseRepaymentAllocations(
      tx,
      remboursementId,
      reason,
      userId
    );

    // 3. Recalculer le solde du crédit
    const soldeRestant = updatedEcheances.reduce((sum, e) => {
      const restant = Number(e.montantTotal) - Number(e.montantPaye || 0);
      return sum + restant;
    }, 0);

    // 4. Mettre à jour le crédit
    await tx.update(credits)
      .set({
        soldeRestant: soldeRestant.toString(),
        statut: soldeRestant > 0 ? StatutCredit.ACTIVE as any : StatutCredit.SETTLED as any,
        updatedAt: new Date()
      })
      .where(eq(credits.id, remboursement.creditId));

    // 5. Émettre les événements WebSocket
    const wsInstance = getWsInstance();
    if (wsInstance) {
      wsInstance.broadcast({
        type: 'REPAYMENT_REVERSED',
        payload: {
          remboursementId,
          creditId: remboursement.creditId,
          reversedAllocations,
          reason,
          timestamp: new Date().toISOString()
        }
      });

      wsInstance.broadcast({
        type: 'CREDIT_SCHEDULE_UPDATED',
        payload: {
          creditId: remboursement.creditId,
          updatedEcheances: updatedEcheances.map(e => ({
            id: e.id,
            statut: e.statut,
            montantPaye: e.montantPaye,
            isPaid: false
          })),
          action: 'REVERSED',
          timestamp: new Date().toISOString()
        }
      });

      wsInstance.broadcast({
        type: 'CREDIT_BALANCE_UPDATED',
        payload: {
          creditId: remboursement.creditId,
          nouveauSoldeRestant: soldeRestant,
          action: 'REVERSED',
          timestamp: new Date().toISOString()
        }
      });
    }

    logger.info({
      remboursementId,
      reversedAllocations,
      nouveauSoldeRestant: soldeRestant
    }, 'Repayment reversed successfully');

    return {
      success: true,
      message: `Remboursement extourné avec succès. ${reversedAllocations} allocation(s) annulée(s).`
    };
  });
}