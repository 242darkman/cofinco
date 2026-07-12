import type {
  AmortizationTypeDz,
  CalendarModeDz,
  DayCountConventionDz,
  FeeCollectionModeDz,
  FirstDueRuleDz,
  FrequenceRemboursementDz,
  InterestMethodDz,
  InterestRatePeriodDz,
  RoundingModeDz,
  ShiftNonWorkingDayDz,
} from "@shared/enum/enums";
import {
  credits,
  echeancesCredits,
  type EcheanceCredit, type InsertEcheanceCredit
} from "@shared/schema";
import { and, asc, eq, ne } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { db } from "../../../db";
import { D, roundMoney } from "../../../lib/money";
import { getCreditPlan } from "./credits-plans";

export async function createEcheances(echeances: InsertEcheanceCredit[]): Promise<EcheanceCredit[]> {
  if (echeances.length === 0) return [];
  
  // L'utilisation de returning() avec des insertions multiples dépend du pilote, mais Drizzle PG le supporte.
  const results = await db.insert(echeancesCredits).values(echeances).returning();
  return results;
}

export async function getEcheancesByCredit(creditId: string): Promise<EcheanceCredit[]> {
  return db.select()
    .from(echeancesCredits)
    .where(eq(echeancesCredits.creditId, creditId))
    .orderBy(asc(echeancesCredits.dateEcheance));
}

export async function getProchaineEcheance(creditId: string): Promise<EcheanceCredit | undefined> {
  const [result] = await db.select()
    .from(echeancesCredits)
    // On cherche la première échéance qui n'est pas complètement payée (UPCOMING ou LATE)
    // On exclut celles qui sont PAID ou SETTLED
    .where(and(
      eq(echeancesCredits.creditId, creditId),
      ne(echeancesCredits.statut, 'PAID'), 
      ne(echeancesCredits.statut, 'SETTLED')
    ))
    .orderBy(asc(echeancesCredits.dateEcheance))
    .limit(1);
    
  return result;
}

export async function updateEcheance(id: string, updateData: Partial<InsertEcheanceCredit>): Promise<EcheanceCredit | undefined> {
  const [updated] = await db.update(echeancesCredits)
    .set(updateData)
    .where(eq(echeancesCredits.id, id))
    .returning();
  return updated;
}

/**
 * Génère automatiquement l'échéancier de paiement pour un crédit en utilisant le moteur de plan.
 */
export async function generateCreditSchedule(
  creditId: string,
  tx?: PgTransaction<any, any, any>
): Promise<EcheanceCredit[]> {
  const executor = tx || db;

  // 1. Récupérer le crédit
  const [credit] = await executor.select().from(credits).where(eq(credits.id, creditId));
  if (!credit) throw new Error("Crédit introuvable pour la génération de l'échéancier");

  // 2. Vérifier si l'échéancier existe déjà
  const existing = await executor.select().from(echeancesCredits).where(eq(echeancesCredits.creditId, creditId));
  if (existing.length > 0) return existing;

  // 3. Générer en utilisant le moteur de plan de crédit
  const { generateSchedule } = await import("../../../services/credit-plan");
  const startDate = new Date(credit.dateDebut || Date.now());

  if (!credit.creditPlanId) {
    throw new Error("Impossible de générer l'échéancier : aucun plan de crédit associé (creditPlanId manquant)");
  }

  const plan = await getCreditPlan(credit.creditPlanId);
  if (!plan) {
    throw new Error(`Plan de crédit introuvable : ${credit.creditPlanId}`);
  }

  const planConfig: import("../../../services/credit-plan/types").PlanConfig = {
    dureeValeur: plan.dureeValeur,
    dureeUnite: plan.dureeUnite as "DAY" | "WEEK" | "MONTH",
    frequenceRemboursement: plan.frequenceRemboursement as FrequenceRemboursementDz,
    tauxInteret: plan.tauxInteret,
    interestMethod: plan.interestMethod as InterestMethodDz,
    interestRatePeriod: plan.interestRatePeriod as InterestRatePeriodDz,
    dayCountConvention: plan.dayCountConvention as DayCountConventionDz,
    interestRoundingMode: plan.interestRoundingMode as RoundingModeDz,
    interestRoundingUnit: plan.interestRoundingUnit,
    amortizationType: plan.amortizationType as AmortizationTypeDz,
    firstDueRule: plan.firstDueRule as FirstDueRuleDz,
    gracePeriodDays: plan.gracePeriodDays,
    preferredWeekday: plan.preferredWeekday,
    calendarMode: plan.calendarMode as CalendarModeDz,
    weekdaysMask: plan.weekdaysMask,
    shiftNonWorkingDay: plan.shiftNonWorkingDay as ShiftNonWorkingDayDz,
    allowManualFirstDueDate: plan.allowManualFirstDueDate,
  };

  const feeConfigs: import("../../../services/credit-plan/types").FeeConfig[] = plan.fees
    .filter((f) => f.isActive)
    .map((f) => ({
      feeType: f.feeType,
      label: f.label,
      calcType: f.calcType as "FIXED" | "PERCENTAGE",
      value: f.value,
      minAmount: f.minAmount,
      maxAmount: f.maxAmount,
      collectionMode: f.collectionMode as FeeCollectionModeDz,
    }));

  const result = generateSchedule({
    principal: D(credit.montant),
    disbursementDate: startDate,
    plan: planConfig,
    fees: feeConfigs,
  });

  const schedule: InsertEcheanceCredit[] = result.rows.map((row: any) => ({
    creditId: credit.id,
    numeroEcheance: row.number,
    dateEcheance: row.date,
    montantCapital: roundMoney(row.capitalPayment),
    montantInteret: roundMoney(row.interestPayment),
    montantTotal: roundMoney(row.totalPayment),
    statut: 'UPCOMING',
    sequence: row.number,
  }));

  if (schedule.length === 0) return [];

  const inserted = await executor.insert(echeancesCredits).values(schedule).returning();

  // Mettre à jour le crédit avec le vrai totalDu et soldeRestant issus du moteur d'échéancier
  const totalDu = roundMoney(result.summary.totalDue);
  await executor.update(credits).set({
    totalDu,
    soldeRestant: totalDu,
    montantEcheance: schedule.length > 0 ? schedule[0].montantTotal : null,
  }).where(eq(credits.id, creditId));

  return inserted;
}
