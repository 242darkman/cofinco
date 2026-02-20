/**
 * Credit Allocation Service
 * Gère l'allocation des remboursements crédit selon l'ordre de priorité:
 * 1. Pénalités impayées (d'abord)
 * 2. Intérêts courus
 * 3. Principal (le reste)
 *
 * Ce service garantit que les paiements sont correctement alloués et tracés.
 */

import { db } from "../db";
import {
  credits,
  echeancesCredits,
  remboursements,
  mouvementsFinanciers,
  loanPaymentAllocations,
  type Credit,
  type InsertLoanPaymentAllocation,
} from "@shared/schema";
import { eq, and, gt, sql, desc, asc } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { MethodePaiement } from "@shared/enum/status-constants";
import { createLogger } from "../lib/logger";
import { D, roundMoney } from "../lib/money";

const logger = createLogger('CreditAllocation');

// Type for transaction context
type TxContext = PgTransaction<any, any, any>;

/**
 * Résultat de l'allocation d'un remboursement
 */
export interface AllocationResult {
  allocationId: string;
  creditId: string;
  montantTotal: number;
  penalites: number;
  interets: number;
  principal: number;
  soldeAvant: string;
  soldeApres: string;
  details?: AllocationDetails;
}

/**
 * Détails d'allocation (pour le tracking)
 */
export interface AllocationDetails {
  penalitesPayees?: Array<{
    id?: string;
    montant: number;
    dateFaute?: Date;
  }>;
  interetsAccrus?: number;
  tauxApplique?: number;
  joursRetard?: number;
}

/**
 * Information crédit pour allocation
 */
interface CreditInfo {
  id: string;
  soldeRestant: string | null;
  taux: string;
  prochaineEcheance: Date | null;
  statut: string;
}

/**
 * Récupère un crédit avec lock pour mise à jour
 */
async function getCreditForUpdate(tx: TxContext, creditId: string): Promise<CreditInfo | null> {
  const [credit] = await tx
    .select({
      id: credits.id,
      soldeRestant: credits.soldeRestant,
      taux: credits.taux,
      prochaineEcheance: credits.prochaineEcheance,
      statut: credits.statut,
    })
    .from(credits)
    .where(eq(credits.id, creditId))
    .for("update");

  return credit || null;
}

/**
 * Calcule les intérêts courus depuis la dernière échéance
 * Formule: (solde * taux annuel / 365) * jours de retard
 */
function calculateAccruedInterest(credit: CreditInfo): { interets: number; joursRetard: number } {
  if (!credit.prochaineEcheance) {
    return { interets: 0, joursRetard: 0 };
  }

  const now = new Date();
  const echeance = new Date(credit.prochaineEcheance);

  // Si pas en retard, pas d'intérêts supplémentaires
  if (now <= echeance) {
    return { interets: 0, joursRetard: 0 };
  }

  const joursRetard = Math.floor((now.getTime() - echeance.getTime()) / (1000 * 60 * 60 * 24));
  const solde = D(credit.soldeRestant);
  const tauxAnnuel = D(credit.taux).div(100);

  // Intérêts journaliers (Decimal: pas de drift sur la multiplication)
  const interetsJournaliers = solde.times(tauxAnnuel).div(365);
  const interets = interetsJournaliers.times(joursRetard).toDecimalPlaces(2).toNumber();

  return { interets, joursRetard };
}

/**
 * Met à jour le solde du crédit
 */
async function updateCreditSoldeRestant(
  tx: TxContext,
  creditId: string,
  nouveauSolde: number
): Promise<void> {
  await tx
    .update(credits)
    .set({
      soldeRestant: nouveauSolde.toString(),
      updatedAt: new Date(),
      // Si le solde est 0 ou négatif, marquer comme soldé
      ...(nouveauSolde <= 0 && {
        statut: "PAID",
        dateSolde: new Date(),
      }),
    })
    .where(eq(credits.id, creditId));
}

/**
 * Alloue un remboursement crédit selon l'ordre de priorité
 *
 * Algorithme:
 * 1. Récupérer les pénalités impayées depuis echeances_credits (penaliteMontant - penalitePayee)
 * 2. Calculer les intérêts courus (retard)
 * 3. Allouer dans l'ordre: pénalités → intérêts → principal
 * 4. Mettre à jour le solde restant du crédit
 * 5. Créer l'enregistrement d'allocation
 *
 * @param tx - Transaction context
 * @param creditId - ID du crédit
 * @param montant - Montant à allouer
 * @param mouvementId - ID du mouvement financier
 * @param paymentIntentId - ID du PaymentIntent (optionnel, pour MM)
 * @param methodePaiement - Méthode de paiement utilisée
 */
export async function allocateCreditRepayment(
  tx: TxContext,
  creditId: string,
  montant: number,
  mouvementId?: string,
  paymentIntentId?: string,
  methodePaiement?: string
): Promise<AllocationResult> {
  // 1. Récupérer le crédit avec lock
  const credit = await getCreditForUpdate(tx, creditId);

  if (!credit) {
    throw new Error(`Credit not found: ${creditId}`);
  }

  if (credit.statut === "PAID" || credit.statut === "CLOSED") {
    throw new Error(`Cannot allocate to a closed credit: ${creditId}`);
  }

  const soldeAvant = credit.soldeRestant || "0";
  let remaining = montant;

  // 2. Initialiser les compteurs d'allocation
  let penalitesPaid = 0;
  let interetsPaid = 0;
  let principalPaid = 0;

  const details: AllocationDetails = {
    penalitesPayees: [],
    tauxApplique: parseFloat(credit.taux),
  };

  // 3. Payer les pénalités impayées (écheances avec penaliteMontant > penalitePayee)
  const unpaidPenalties = await tx
    .select({
      id: echeancesCredits.id,
      penaliteMontant: echeancesCredits.penaliteMontant,
      penalitePayee: echeancesCredits.penalitePayee,
    })
    .from(echeancesCredits)
    .where(and(
      eq(echeancesCredits.creditId, creditId),
      gt(sql`${echeancesCredits.penaliteMontant}::numeric - ${echeancesCredits.penalitePayee}::numeric`, 0)
    ))
    .orderBy(asc(echeancesCredits.dateEcheance));

  for (const echeance of unpaidPenalties) {
    if (remaining <= 0) break;
    const due = D(echeance.penaliteMontant || '0').minus(D(echeance.penalitePayee || '0')).toNumber();
    if (due <= 0) continue;
    const paid = Math.min(remaining, due);
    penalitesPaid += paid;
    remaining -= paid;

    // Mettre à jour la pénalité payée sur l'échéance
    const newPayee = D(echeance.penalitePayee || '0').plus(paid).toString();
    await tx
      .update(echeancesCredits)
      .set({ penalitePayee: newPayee })
      .where(eq(echeancesCredits.id, echeance.id));

    details.penalitesPayees!.push({
      id: echeance.id,
      montant: paid,
    });
  }

  // 4. Calculer et payer les intérêts courus
  const { interets, joursRetard } = calculateAccruedInterest(credit);
  details.interetsAccrus = interets;
  details.joursRetard = joursRetard;

  if (remaining > 0 && interets > 0) {
    interetsPaid = Math.min(remaining, interets);
    remaining -= interetsPaid;
  }

  // 5. Le reste va au principal
  principalPaid = remaining;
  remaining = 0;

  // 6. Calculer le nouveau solde (Decimal pour la soustraction)
  const dSoldeActuel = D(soldeAvant);
  const nouveauSolde = Math.max(0, dSoldeActuel.minus(principalPaid).toNumber());

  // 7. Mettre à jour le solde du crédit
  await updateCreditSoldeRestant(tx, creditId, nouveauSolde);

  // 8. Créer l'enregistrement d'allocation
  const allocationData: InsertLoanPaymentAllocation = {
    creditId,
    mouvementId: mouvementId || null,
    paymentIntentId: paymentIntentId || null,
    montantTotal: montant.toString(),
    montantPenalites: penalitesPaid.toString(),
    montantInterets: interetsPaid.toString(),
    montantPrincipal: principalPaid.toString(),
    soldeAvant,
    soldeApres: nouveauSolde.toString(),
    methodePaiement: methodePaiement as any,
    details,
  };

  const [allocation] = await tx
    .insert(loanPaymentAllocations)
    .values(allocationData)
    .returning();

  logger.info({
    creditId,
    montant,
    penalitesPaid,
    interetsPaid,
    principalPaid,
    soldeAvant,
    nouveauSolde,
  }, 'Allocated payment to credit');

  return {
    allocationId: allocation.id,
    creditId,
    montantTotal: montant,
    penalites: penalitesPaid,
    interets: interetsPaid,
    principal: principalPaid,
    soldeAvant,
    soldeApres: nouveauSolde.toString(),
    details,
  };
}

/**
 * Récupère l'historique des allocations pour un crédit
 */
export async function getCreditAllocationHistory(creditId: string): Promise<{
  allocations: Array<{
    id: string;
    montantTotal: string;
    montantPenalites: string;
    montantInterets: string;
    montantPrincipal: string;
    soldeApres: string;
    createdAt: Date;
    methodePaiement: string | null;
  }>;
  totalPenalites: number;
  totalInterets: number;
  totalPrincipal: number;
}> {
  const allocations = await db
    .select({
      id: loanPaymentAllocations.id,
      montantTotal: loanPaymentAllocations.montantTotal,
      montantPenalites: loanPaymentAllocations.montantPenalites,
      montantInterets: loanPaymentAllocations.montantInterets,
      montantPrincipal: loanPaymentAllocations.montantPrincipal,
      soldeApres: loanPaymentAllocations.soldeApres,
      createdAt: loanPaymentAllocations.createdAt,
      methodePaiement: loanPaymentAllocations.methodePaiement,
    })
    .from(loanPaymentAllocations)
    .where(eq(loanPaymentAllocations.creditId, creditId))
    .orderBy(desc(loanPaymentAllocations.createdAt));

  // Calculer les totaux (Decimal pour l'accumulation — élimine le drift additif)
  let dTotalPenalites = D(0);
  let dTotalInterets = D(0);
  let dTotalPrincipal = D(0);

  for (const alloc of allocations) {
    dTotalPenalites = dTotalPenalites.plus(D(alloc.montantPenalites));
    dTotalInterets = dTotalInterets.plus(D(alloc.montantInterets));
    dTotalPrincipal = dTotalPrincipal.plus(D(alloc.montantPrincipal));
  }

  return {
    allocations,
    totalPenalites: dTotalPenalites.toNumber(),
    totalInterets: dTotalInterets.toNumber(),
    totalPrincipal: dTotalPrincipal.toNumber(),
  };
}

/**
 * Prévisualise une allocation (pour l'UI)
 * Ne modifie aucune donnée, calcule simplement la répartition
 */
export async function previewCreditAllocation(
  creditId: string,
  montant: number
): Promise<{
  penalites: number;
  interets: number;
  principal: number;
  soldeActuel: string;
  soldeApres: string;
  creditEstSolde: boolean;
}> {
  // Récupérer le crédit (sans lock)
  const [credit] = await db
    .select({
      soldeRestant: credits.soldeRestant,
      taux: credits.taux,
      prochaineEcheance: credits.prochaineEcheance,
      statut: credits.statut,
    })
    .from(credits)
    .where(eq(credits.id, creditId));

  if (!credit) {
    throw new Error(`Credit not found: ${creditId}`);
  }

  const soldeActuel = credit.soldeRestant || "0";
  let remaining = montant;
  let penalites = 0;
  let interets = 0;
  let principal = 0;

  // Calculer intérêts courus
  const { interets: interetsAccrus } = calculateAccruedInterest({
    id: creditId,
    soldeRestant: soldeActuel,
    taux: credit.taux,
    prochaineEcheance: credit.prochaineEcheance,
    statut: credit.statut,
  });

  // Allouer les intérêts
  if (remaining > 0 && interetsAccrus > 0) {
    interets = Math.min(remaining, interetsAccrus);
    remaining -= interets;
  }

  // Le reste au principal
  principal = remaining;

  // Calculer nouveau solde (Decimal pour la soustraction)
  const soldeApres = Math.max(0, D(soldeActuel).minus(principal).toNumber());

  return {
    penalites,
    interets,
    principal,
    soldeActuel,
    soldeApres: soldeApres.toString(),
    creditEstSolde: soldeApres <= 0,
  };
}

export default {
  allocateCreditRepayment,
  getCreditAllocationHistory,
  previewCreditAllocation,
};
