/**
 * Version améliorée de createRemboursementWithLedger avec allocation FIFO automatique
 */

import { db } from "../db";
import {
  credits,
  remboursements,
  mouvementsFinanciers,
  echeancesCredits,
  type Remboursement,
  type MouvementFinancier,
  type InsertEcheanceCredit
} from "@shared/schema";
import { eq, and, inArray, asc } from "drizzle-orm";
import { executeWithLedger, updateCreditSolde, updateSessionSolde, validateUserId } from "../services/ledger";
import {
  allocateRepaymentToSchedule,
  type AllocationResult,
  type RepaymentAllocationOptions
} from "../services/repayment-allocation-service";
import { createFactureForRemboursement, getCreditPlan } from "./finance";
import { getWsInstance } from "../ws-server";
import { createLogger } from "../lib/logger";
import { StatutCredit, StatutEcheanceCredit } from "@shared/enum/status-constants";
import { D, roundMoney } from "../lib/money";
import type { PgTransaction } from "drizzle-orm/pg-core";

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
      agenceId: credit.agenceId || undefined,
      sessionCaisseId: data.sessionCaisseId,
      methodePaiement: data.methodePaiement,
      typePaiement: "CREDIT_REPAYMENT",
      idempotencyKey: data.idempotencyKey,
    },
    async (tx: any, mouvement: any): Promise<any> => {
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
        nouveauStatutCredit = StatutCredit.PAID;
      }

      const [updatedCredit] = await tx.update(credits)
        .set({
          soldeRestant: nouveauSoldeRestant.toString(),
          statut: nouveauStatutCredit as any,
          updatedAt: new Date()
        })
        .where(eq(credits.id, data.creditId))
        .returning();

      // 5b. Recalculer les échéances futures si le crédit n'est pas soldé
      if (nouveauStatutCredit !== StatutCredit.PAID) {
        await recalculateRemainingSchedule(tx, data.creditId);
      }

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
  ).then(async ({ result: { remboursement, allocationResult }, mouvement }: any) => {
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
          updatedEcheances: allocationResult.updatedEcheances.map((e: any) => ({
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
          allocations: allocationResult.allocations.map((a: any) => ({
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
 * Recalcule les échéances UPCOMING d'un crédit après un remboursement.
 * Stratégie : même nombre d'échéances restantes, montant ajusté.
 * - Garde les échéances PAID/PARTIALLY_PAID/LATE intactes
 * - Supprime les UPCOMING et les recrée avec le capital/intérêt restant réparti
 * - Met à jour montantEcheance et prochaineEcheance sur le crédit
 */
export async function recalculateRemainingSchedule(
  tx: PgTransaction<any, any, any>,
  creditId: string
): Promise<void> {
  // 1. Charger toutes les échéances du crédit
  const allEcheances = await tx.select()
    .from(echeancesCredits)
    .where(eq(echeancesCredits.creditId, creditId))
    .orderBy(asc(echeancesCredits.dateEcheance), asc(echeancesCredits.sequence));

  if (allEcheances.length === 0) return;

  // 2. Séparer les échéances par statut
  const upcoming = allEcheances.filter(e => e.statut === StatutEcheanceCredit.UPCOMING);
  const partiallyPaid = allEcheances.filter(e => e.statut === StatutEcheanceCredit.PARTIALLY_PAID);
  const paid = allEcheances.filter(e =>
    e.statut === StatutEcheanceCredit.PAID || e.statut === StatutEcheanceCredit.SETTLED
  );
  const late = allEcheances.filter(e => e.statut === StatutEcheanceCredit.LATE);

  // Rien à recalculer si aucune échéance UPCOMING
  if (upcoming.length === 0) {
    // Mettre à jour prochaineEcheance avec la première échéance non payée (PARTIALLY_PAID ou LATE)
    const firstUnpaid = [...partiallyPaid, ...late]
      .sort((a, b) => new Date(a.dateEcheance).getTime() - new Date(b.dateEcheance).getTime())[0];

    if (firstUnpaid) {
      await tx.update(credits).set({
        prochaineEcheance: firstUnpaid.dateEcheance,
        updatedAt: new Date(),
      }).where(eq(credits.id, creditId));
    }
    return;
  }

  // 3. Calculer le capital et l'intérêt restant dans les échéances UPCOMING
  const capitalRestantUpcoming = upcoming.reduce((sum, e) => sum.plus(D(e.montantCapital)), D(0));
  const interetRestantUpcoming = upcoming.reduce((sum, e) => sum.plus(D(e.montantInteret)), D(0));

  const nbUpcoming = upcoming.length;

  // 4. Calculer les montants par échéance (répartition uniforme)
  const capitalParEcheance = capitalRestantUpcoming.div(nbUpcoming);
  const interetParEcheance = interetRestantUpcoming.div(nbUpcoming);

  // Arrondi : dernière échéance absorbe le reliquat
  const capitalArrondi = D(roundMoney(capitalParEcheance));
  const interetArrondi = D(roundMoney(interetParEcheance));
  const capitalDerniereEcheance = capitalRestantUpcoming.minus(capitalArrondi.times(nbUpcoming - 1));
  const interetDerniereEcheance = interetRestantUpcoming.minus(interetArrondi.times(nbUpcoming - 1));

  // 5. Supprimer les échéances UPCOMING existantes
  const upcomingIds = upcoming.map(e => e.id);
  await tx.delete(echeancesCredits).where(
    and(
      eq(echeancesCredits.creditId, creditId),
      inArray(echeancesCredits.id, upcomingIds)
    )
  );

  // 6. Déterminer la numérotation et les dates (conserver celles des anciennes UPCOMING)
  const newEcheances: InsertEcheanceCredit[] = upcoming.map((old, idx) => {
    const isLast = idx === nbUpcoming - 1;
    const capital = isLast ? roundMoney(capitalDerniereEcheance) : roundMoney(capitalArrondi);
    const interet = isLast ? roundMoney(interetDerniereEcheance) : roundMoney(interetArrondi);
    const total = roundMoney(D(capital).plus(D(interet)));

    return {
      creditId,
      numeroEcheance: old.numeroEcheance,
      dateEcheance: old.dateEcheance,
      montantCapital: capital,
      montantInteret: interet,
      montantTotal: total,
      statut: StatutEcheanceCredit.UPCOMING as any,
      sequence: old.sequence ?? old.numeroEcheance,
    };
  });

  if (newEcheances.length > 0) {
    await tx.insert(echeancesCredits).values(newEcheances);
  }

  // 7. Déterminer la première échéance non payée (pour prochaineEcheance)
  const allNonPaid = [...partiallyPaid, ...late, ...newEcheances.map(e => ({
    dateEcheance: e.dateEcheance,
    montantTotal: e.montantTotal,
  }))]
    .sort((a, b) => new Date(a.dateEcheance).getTime() - new Date(b.dateEcheance).getTime());

  const prochaineEcheance = allNonPaid.length > 0 ? allNonPaid[0].dateEcheance : null;
  const nouveauMontantEcheance = newEcheances.length > 0 ? newEcheances[0].montantTotal : null;

  // 8. Recalculer soldeRestant = PARTIALLY_PAID restant + LATE restant + UPCOMING total
  const soldePartial = partiallyPaid.reduce((sum, e) =>
    sum.plus(D(e.montantTotal).minus(D(e.montantPaye || 0))), D(0));
  const soldeLate = late.reduce((sum, e) =>
    sum.plus(D(e.montantTotal).minus(D(e.montantPaye || 0))), D(0));
  const soldeUpcoming = newEcheances.reduce((sum, e) => sum.plus(D(e.montantTotal)), D(0));
  const nouveauSoldeRestant = roundMoney(soldePartial.plus(soldeLate).plus(soldeUpcoming));

  // 9. Mettre à jour le crédit
  await tx.update(credits).set({
    montantEcheance: nouveauMontantEcheance,
    prochaineEcheance,
    soldeRestant: nouveauSoldeRestant,
    updatedAt: new Date(),
  }).where(eq(credits.id, creditId));

  logger.info({
    creditId,
    nbUpcomingRecalculated: nbUpcoming,
    nouveauMontantEcheance,
    nouveauSoldeRestant,
  }, 'Schedule recalculated after repayment');
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
        statut: soldeRestant > 0 ? StatutCredit.ACTIVE as any : StatutCredit.PAID as any,
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