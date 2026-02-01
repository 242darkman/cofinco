/**
 * Service d'allocation FIFO des remboursements aux échéances
 * Gère l'allocation automatique, les paiements partiels, surpaiements et extournes
 */

import { db } from "../db";
import { 
  credits, 
  echeancesCredits, 
  remboursements,
  type Credit,
  type EcheanceCredit,
  type Remboursement,
  type InsertEcheanceCredit
} from "@shared/schema";
import { 
  remboursementEcheances,
  clientCreditBalances,
  remboursementAllocationAudit,
  type InsertRemboursementEcheance,
  type InsertClientCreditBalance,
  type InsertRemboursementAllocationAudit,
  AllocationStrategy,
  CreditBalanceTransactionType
} from "@shared/schema/remboursement-allocations";
import { eq, and, lt, lte, isNull, asc, desc, sql, gte, or, ne } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { StatutEcheanceCredit } from "@shared/enum/status-constants";
import { createLogger } from "../lib/logger";
import { getWsInstance } from "../ws-server";

const logger = createLogger('RepaymentAllocation');

export interface AllocationResult {
  allocations: Array<{
    echeanceId: string;
    allocatedAmount: number;
    allocatedCapital: number;
    allocatedInterest: number;
    echeanceStatus: string;
    isPaid: boolean;
  }>;
  overpaymentAmount: number;
  totalAllocated: number;
  updatedEcheances: EcheanceCredit[];
  creditBalance?: number;
}

export interface RepaymentAllocationOptions {
  strategy?: typeof AllocationStrategy[keyof typeof AllocationStrategy];
  applyToFutureInstallments?: boolean; // Si true, applique aux échéances futures
  createCreditBalance?: boolean; // Si true, crée un solde créditeur pour le trop-perçu
}

/**
 * Alloue un remboursement aux échéances selon la stratégie FIFO
 */
export async function allocateRepaymentToSchedule(
  tx: PgTransaction<any, any, any>,
  remboursementId: string,
  creditId: string,
  montantRemboursement: number,
  userId?: string,
  options: RepaymentAllocationOptions = {}
): Promise<AllocationResult> {
  const {
    strategy = AllocationStrategy.FIFO,
    applyToFutureInstallments = true,
    createCreditBalance = true
  } = options;

  logger.info({ remboursementId, creditId, montantRemboursement, strategy }, 'Starting repayment allocation');

  // 1. Vérifier l'idempotence - si des allocations existent déjà, les retourner
  const existingAllocations = await tx.select()
    .from(remboursementEcheances)
    .where(and(
      eq(remboursementEcheances.remboursementId, remboursementId),
      isNull(remboursementEcheances.reversedAt)
    ));

  if (existingAllocations.length > 0) {
    logger.warn({ remboursementId }, 'Allocations already exist for this repayment (idempotency)');
    
    // Récupérer les échéances mises à jour
    const echeanceIds = existingAllocations.map(a => a.echeanceId);
    const updatedEcheances = await tx.select()
      .from(echeancesCredits)
      .where(sql`${echeancesCredits.id} = ANY(${echeanceIds})`);

    const totalAllocated = existingAllocations.reduce((sum, a) => sum + Number(a.allocatedAmount), 0);
    
    return {
      allocations: existingAllocations.map(a => ({
        echeanceId: a.echeanceId,
        allocatedAmount: Number(a.allocatedAmount),
        allocatedCapital: Number(a.allocatedCapital || 0),
        allocatedInterest: Number(a.allocatedInterest || 0),
        echeanceStatus: 'EXISTING',
        isPaid: false
      })),
      overpaymentAmount: montantRemboursement - totalAllocated,
      totalAllocated,
      updatedEcheances
    };
  }

  // 2. Récupérer les échéances non soldées, triées selon la stratégie
  let echeancesQuery = tx.select()
    .from(echeancesCredits)
    .where(and(
      eq(echeancesCredits.creditId, creditId),
      // Inclure toutes les échéances non complètement payées
      or(
        lt(echeancesCredits.montantPaye, echeancesCredits.montantTotal),
        isNull(echeancesCredits.montantPaye)
      )
    ))
    .$dynamic();

  // Ordre selon la stratégie
  if (strategy === AllocationStrategy.FIFO) {
    echeancesQuery = echeancesQuery.orderBy(
      asc(echeancesCredits.dateEcheance),
      asc(echeancesCredits.sequence),
      asc(echeancesCredits.numeroEcheance)
    );
  } else if (strategy === AllocationStrategy.LIFO) {
    echeancesQuery = echeancesQuery.orderBy(
      desc(echeancesCredits.dateEcheance),
      desc(echeancesCredits.sequence),
      desc(echeancesCredits.numeroEcheance)
    );
  }

  // Si on n'applique pas aux échéances futures, filtrer par date
  if (!applyToFutureInstallments) {
    echeancesQuery = echeancesQuery.where(
      lte(echeancesCredits.dateEcheance, new Date())
    );
  }

  const echeances = await echeancesQuery;

  // 3. Verrouiller les échéances pour éviter les conditions de course
  if (echeances.length > 0) {
    const echeanceIds = echeances.map(e => e.id);
    await tx.execute(
      sql`SELECT * FROM echeances_credits WHERE id = ANY(${echeanceIds}) FOR UPDATE`
    );
  }

  // 4. Allocation FIFO
  let remainingAmount = montantRemboursement;
  const allocations: AllocationResult['allocations'] = [];
  const updatedEcheances: EcheanceCredit[] = [];
  let allocationOrder = 1;

  for (const echeance of echeances) {
    if (remainingAmount <= 0) break;

    const montantPaye = Number(echeance.montantPaye || 0);
    const montantTotal = Number(echeance.montantTotal);
    const montantCapital = Number(echeance.montantCapital);
    const montantInteret = Number(echeance.montantInteret);
    
    // Montant restant à payer sur cette échéance
    const montantDu = montantTotal - montantPaye;
    
    if (montantDu <= 0) continue; // Échéance déjà payée

    // Montant à allouer (minimum entre restant et dû)
    const montantAAllouer = Math.min(remainingAmount, montantDu);
    
    // Répartition proportionnelle capital/intérêt
    const ratioCapital = montantCapital / montantTotal;
    const allocatedCapital = Math.round(montantAAllouer * ratioCapital * 100) / 100;
    const allocatedInterest = montantAAllouer - allocatedCapital;

    // Mettre à jour l'échéance
    const nouveauMontantPaye = montantPaye + montantAAllouer;
    const isPaid = nouveauMontantPaye >= montantTotal;
    
    // Calculer le nouveau statut
    let nouveauStatut: string;
    if (isPaid) {
      nouveauStatut = StatutEcheanceCredit.PAID;
    } else if (nouveauMontantPaye > 0) {
      nouveauStatut = StatutEcheanceCredit.PARTIALLY_PAID;
    } else if (echeance.dateEcheance < new Date()) {
      nouveauStatut = StatutEcheanceCredit.LATE;
    } else {
      nouveauStatut = StatutEcheanceCredit.UPCOMING;
    }

    // Mettre à jour l'échéance dans la DB
    const [updatedEcheance] = await tx.update(echeancesCredits)
      .set({
        montantPaye: nouveauMontantPaye.toString(),
        montantCapitalPaye: sql`COALESCE(montant_capital_paye, 0) + ${allocatedCapital}`,
        montantInteretPaye: sql`COALESCE(montant_interet_paye, 0) + ${allocatedInterest}`,
        statut: nouveauStatut as any,
        paidAt: isPaid ? new Date() : undefined,
        lastPaymentDate: new Date()
      })
      .where(eq(echeancesCredits.id, echeance.id))
      .returning();

    updatedEcheances.push(updatedEcheance);

    // Créer l'enregistrement d'allocation
    await tx.insert(remboursementEcheances).values({
      remboursementId,
      echeanceId: echeance.id,
      allocatedAmount: montantAAllouer.toString(),
      allocatedCapital: allocatedCapital.toString(),
      allocatedInterest: allocatedInterest.toString(),
      allocationOrder,
      createdBy: userId
    });

    allocations.push({
      echeanceId: echeance.id,
      allocatedAmount: montantAAllouer,
      allocatedCapital,
      allocatedInterest,
      echeanceStatus: nouveauStatut,
      isPaid
    });

    remainingAmount -= montantAAllouer;
    allocationOrder++;

    logger.debug({
      echeanceId: echeance.id,
      montantAAllouer,
      nouveauMontantPaye,
      nouveauStatut,
      remainingAmount
    }, 'Allocated payment to installment');
  }

  // 5. Gérer le trop-perçu (overpayment)
  let creditBalance: number | undefined;
  
  if (remainingAmount > 0) {
    logger.info({ remainingAmount, creditId }, 'Overpayment detected');

    // Mettre à jour le remboursement avec le montant du trop-perçu
    await tx.update(remboursements)
      .set({ overpaymentAmount: remainingAmount.toString() })
      .where(eq(remboursements.id, remboursementId));

    // Créer ou mettre à jour le solde créditeur du client si demandé
    if (createCreditBalance) {
      // Récupérer le crédit pour avoir le clientId et agenceId
      const [credit] = await tx.select()
        .from(credits)
        .where(eq(credits.id, creditId));

      if (credit && credit.clientId) {
        // Chercher un solde existant
        const [existingBalance] = await tx.select()
          .from(clientCreditBalances)
          .where(and(
            eq(clientCreditBalances.clientId, credit.clientId),
            eq(clientCreditBalances.agenceId, credit.agenceId!)
          ));

        if (existingBalance) {
          // Mettre à jour le solde existant
          const newBalance = Number(existingBalance.balance) + remainingAmount;
          await tx.update(clientCreditBalances)
            .set({
              balance: newBalance.toString(),
              lastTransactionDate: new Date(),
              lastTransactionType: CreditBalanceTransactionType.OVERPAYMENT,
              updatedAt: new Date()
            })
            .where(eq(clientCreditBalances.id, existingBalance.id));
          
          creditBalance = newBalance;
        } else {
          // Créer un nouveau solde
          await tx.insert(clientCreditBalances).values({
            clientId: credit.clientId,
            agenceId: credit.agenceId!,
            balance: remainingAmount.toString(),
            lastTransactionDate: new Date(),
            lastTransactionType: CreditBalanceTransactionType.OVERPAYMENT
          });
          
          creditBalance = remainingAmount;
        }
      }
    }
  }

  // 6. Créer l'audit trail
  await tx.insert(remboursementAllocationAudit).values({
    remboursementId,
    action: 'ALLOCATED',
    afterState: {
      allocations,
      overpayment: remainingAmount,
      totalAllocated: montantRemboursement - remainingAmount,
      strategy
    },
    metadata: { userId, timestamp: new Date().toISOString() },
    createdBy: userId
  });

  const result: AllocationResult = {
    allocations,
    overpaymentAmount: remainingAmount,
    totalAllocated: montantRemboursement - remainingAmount,
    updatedEcheances,
    creditBalance
  };

  logger.info({
    remboursementId,
    totalAllocated: result.totalAllocated,
    allocationsCount: allocations.length,
    overpayment: remainingAmount
  }, 'Repayment allocation completed');

  return result;
}

/**
 * Extourne (reverse) un remboursement et ses allocations
 */
export async function reverseRepaymentAllocations(
  tx: PgTransaction<any, any, any>,
  remboursementId: string,
  reason: string,
  userId?: string
): Promise<{ success: boolean; reversedAllocations: number; updatedEcheances: EcheanceCredit[] }> {
  logger.info({ remboursementId, reason }, 'Starting repayment reversal');

  // 1. Récupérer les allocations non extournées
  const allocations = await tx.select()
    .from(remboursementEcheances)
    .where(and(
      eq(remboursementEcheances.remboursementId, remboursementId),
      isNull(remboursementEcheances.reversedAt)
    ));

  if (allocations.length === 0) {
    logger.warn({ remboursementId }, 'No allocations to reverse');
    return { success: true, reversedAllocations: 0, updatedEcheances: [] };
  }

  const updatedEcheances: EcheanceCredit[] = [];

  // 2. Pour chaque allocation, reverser les montants
  for (const allocation of allocations) {
    // Récupérer l'échéance
    const [echeance] = await tx.select()
      .from(echeancesCredits)
      .where(eq(echeancesCredits.id, allocation.echeanceId))
      .for('update'); // Lock pour éviter les conditions de course

    if (!echeance) {
      logger.error({ echeanceId: allocation.echeanceId }, 'Echeance not found for reversal');
      continue;
    }

    const montantPaye = Number(echeance.montantPaye || 0);
    const allocatedAmount = Number(allocation.allocatedAmount);
    const allocatedCapital = Number(allocation.allocatedCapital || 0);
    const allocatedInterest = Number(allocation.allocatedInterest || 0);

    // Calculer les nouveaux montants (cap à 0)
    const nouveauMontantPaye = Math.max(0, montantPaye - allocatedAmount);
    const nouveauCapitalPaye = Math.max(0, Number(echeance.montantCapitalPaye || 0) - allocatedCapital);
    const nouveauInteretPaye = Math.max(0, Number(echeance.montantInteretPaye || 0) - allocatedInterest);

    // Recalculer le statut
    let nouveauStatut: string;
    if (nouveauMontantPaye === 0) {
      if (echeance.dateEcheance < new Date()) {
        nouveauStatut = StatutEcheanceCredit.LATE;
      } else {
        nouveauStatut = StatutEcheanceCredit.UPCOMING;
      }
    } else if (nouveauMontantPaye < Number(echeance.montantTotal)) {
      nouveauStatut = StatutEcheanceCredit.PARTIALLY_PAID;
    } else {
      nouveauStatut = StatutEcheanceCredit.PAID; // Ne devrait pas arriver
    }

    // Mettre à jour l'échéance
    const [updatedEcheance] = await tx.update(echeancesCredits)
      .set({
        montantPaye: nouveauMontantPaye.toString(),
        montantCapitalPaye: nouveauCapitalPaye.toString(),
        montantInteretPaye: nouveauInteretPaye.toString(),
        statut: nouveauStatut as any,
        paidAt: nouveauMontantPaye >= Number(echeance.montantTotal) ? echeance.paidAt : null
      })
      .where(eq(echeancesCredits.id, echeance.id))
      .returning();

    updatedEcheances.push(updatedEcheance);

    // Marquer l'allocation comme extournée
    await tx.update(remboursementEcheances)
      .set({
        reversedAt: new Date(),
        reversedBy: userId
      })
      .where(eq(remboursementEcheances.id, allocation.id));
  }

  // 3. Récupérer le remboursement pour gérer le trop-perçu
  const [remboursement] = await tx.select()
    .from(remboursements)
    .where(eq(remboursements.id, remboursementId));

  if (remboursement?.overpaymentAmount && Number(remboursement.overpaymentAmount) > 0) {
    // Reverser le solde créditeur si il existe
    const [credit] = await tx.select()
      .from(credits)
      .where(eq(credits.id, remboursement.creditId));

    if (credit?.clientId) {
      const [creditBalance] = await tx.select()
        .from(clientCreditBalances)
        .where(and(
          eq(clientCreditBalances.clientId, credit.clientId),
          eq(clientCreditBalances.agenceId, credit.agenceId!)
        ));

      if (creditBalance) {
        const newBalance = Math.max(0, Number(creditBalance.balance) - Number(remboursement.overpaymentAmount));
        await tx.update(clientCreditBalances)
          .set({
            balance: newBalance.toString(),
            lastTransactionDate: new Date(),
            lastTransactionType: 'ADJUSTMENT' as any,
            updatedAt: new Date()
          })
          .where(eq(clientCreditBalances.id, creditBalance.id));
      }
    }
  }

  // 4. Marquer le remboursement comme extourné
  await tx.update(remboursements)
    .set({
      isReversed: true,
      reversedAt: new Date(),
      reversedBy: userId,
      reversalReason: reason
    })
    .where(eq(remboursements.id, remboursementId));

  // 5. Créer l'audit trail
  await tx.insert(remboursementAllocationAudit).values({
    remboursementId,
    action: 'REVERSED',
    beforeState: { allocations },
    afterState: { reversedCount: allocations.length, reason },
    metadata: { userId, timestamp: new Date().toISOString() },
    createdBy: userId
  });

  logger.info({
    remboursementId,
    reversedAllocations: allocations.length,
    updatedEcheances: updatedEcheances.length
  }, 'Repayment reversal completed');

  return {
    success: true,
    reversedAllocations: allocations.length,
    updatedEcheances
  };
}

/**
 * Marque les échéances en retard (job périodique)
 */
export async function markLateInstallments(): Promise<{ markedCount: number; creditIds: string[] }> {
  logger.info('Starting late installments marking job');

  const now = new Date();
  
  // Trouver toutes les échéances non payées dont la date est passée
  const lateEcheances = await db.select()
    .from(echeancesCredits)
    .where(and(
      lt(echeancesCredits.dateEcheance, now),
      lt(echeancesCredits.montantPaye, echeancesCredits.montantTotal),
      ne(echeancesCredits.statut, StatutEcheanceCredit.PAID as any),
      ne(echeancesCredits.statut, StatutEcheanceCredit.SETTLED as any)
    ));

  const creditIds = new Set<string>();
  let markedCount = 0;

  for (const echeance of lateEcheances) {
    // Ne pas toucher si déjà marqué LATE aujourd'hui
    if (echeance.lateMarkedAt && 
        echeance.lateMarkedAt.toDateString() === now.toDateString()) {
      continue;
    }

    await db.update(echeancesCredits)
      .set({
        statut: StatutEcheanceCredit.LATE as any,
        lateMarkedAt: now
      })
      .where(eq(echeancesCredits.id, echeance.id));

    creditIds.add(echeance.creditId);
    markedCount++;
  }

  // Émettre des événements WebSocket pour les crédits impactés
  if (creditIds.size > 0) {
    const wsInstance = getWsInstance();
    if (wsInstance) {
      for (const creditId of creditIds) {
        wsInstance.broadcast({
          type: 'CREDIT_SCHEDULE_UPDATED',
          payload: {
            creditId,
            action: 'LATE_MARKED',
            timestamp: now.toISOString()
          }
        });
      }
    }
  }

  logger.info({ markedCount, creditIds: Array.from(creditIds) }, 'Late installments marking completed');

  return {
    markedCount,
    creditIds: Array.from(creditIds)
  };
}

/**
 * Calcule le statut d'une échéance basé sur les montants et dates
 */
export function calculateInstallmentStatus(
  echeance: Pick<EcheanceCredit, 'dateEcheance' | 'montantTotal' | 'montantPaye'>
): string {
  const montantTotal = Number(echeance.montantTotal);
  const montantPaye = Number(echeance.montantPaye || 0);
  const now = new Date();

  if (montantPaye >= montantTotal) {
    return StatutEcheanceCredit.PAID;
  } else if (montantPaye > 0 && montantPaye < montantTotal) {
    return StatutEcheanceCredit.PARTIALLY_PAID;
  } else if (echeance.dateEcheance < now && montantPaye < montantTotal) {
    return StatutEcheanceCredit.LATE;
  } else if (echeance.dateEcheance <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)) {
    // Due dans les 7 prochains jours
    return StatutEcheanceCredit.DUE;
  } else {
    return StatutEcheanceCredit.UPCOMING;
  }
}

/**
 * Récupère le détail des allocations d'un remboursement
 */
export async function getRepaymentAllocations(remboursementId: string) {
  const allocations = await db.select({
    allocation: remboursementEcheances,
    echeance: echeancesCredits
  })
  .from(remboursementEcheances)
  .innerJoin(echeancesCredits, eq(remboursementEcheances.echeanceId, echeancesCredits.id))
  .where(and(
    eq(remboursementEcheances.remboursementId, remboursementId),
    isNull(remboursementEcheances.reversedAt)
  ))
  .orderBy(asc(remboursementEcheances.allocationOrder));

  return allocations.map(({ allocation, echeance }) => ({
    ...allocation,
    echeance: {
      id: echeance.id,
      numeroEcheance: echeance.numeroEcheance,
      dateEcheance: echeance.dateEcheance,
      montantTotal: echeance.montantTotal,
      montantPaye: echeance.montantPaye,
      statut: echeance.statut
    }
  }));
}