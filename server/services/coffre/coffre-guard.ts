/**
 * Coffre-fort & Caisse Guards
 *
 * Guards centraux pour toute opération de débit sur un coffre ou une caisse.
 * Chaque guard acquiert un verrou pessimiste (SELECT FOR UPDATE) puis vérifie:
 *  1. Entité active
 *  2. Solde suffisant
 *  3. Solde minimum respecté (coffres uniquement)
 *  4. Plafond journalier non dépassé
 */

import { eq, sql, and, gte } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { coffresForts, configCoffreFort } from "@shared/schema";
import { caisses, mouvementsFinanciers } from "@shared/schema";
import type { CoffreFort } from "@shared/schema";
import type { Caisse } from "@shared/schema";
import {
  CoffreInactifError,
  CoffreInsufficientFundsError,
  CoffreSoldeMinimumError,
  CoffrePlafondJournalierError,
  CaisseInactiveError,
  CaisseInsufficientFundsError,
} from "./coffre-errors";

// ============================================================================
// DAILY TOTALS (for plafond journalier checks)
// ============================================================================

/**
 * Calcule le total journalier des mouvements pour un coffre donné.
 * Filtre sur metadata->>'coffreId' et le sens (DEBIT/CREDIT).
 */
export async function getDailyCoffreTotal(
  tx: PgTransaction<any, any, any>,
  coffreId: string,
  direction: "DEBIT" | "CREDIT",
  date: Date = new Date()
): Promise<number> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const result = await tx
    .select({
      total: sql<string>`COALESCE(SUM(${mouvementsFinanciers.montant}::numeric), 0)`,
    })
    .from(mouvementsFinanciers)
    .where(
      and(
        sql`${mouvementsFinanciers.metadata}->>'coffreId' = ${coffreId}`,
        eq(mouvementsFinanciers.sens, direction),
        eq(mouvementsFinanciers.statut, "POSTED"),
        gte(mouvementsFinanciers.dateOperation, startOfDay)
      )
    );

  return parseFloat(result[0]?.total || "0");
}

/**
 * Calcule le total journalier des mouvements pour une caisse donnée.
 * Filtre sur metadata->>'caisseId' et le sens (DEBIT/CREDIT).
 */
export async function getDailyCaisseTotal(
  tx: PgTransaction<any, any, any>,
  caisseId: string,
  direction: "DEBIT" | "CREDIT",
  date: Date = new Date()
): Promise<number> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const result = await tx
    .select({
      total: sql<string>`COALESCE(SUM(${mouvementsFinanciers.montant}::numeric), 0)`,
    })
    .from(mouvementsFinanciers)
    .where(
      and(
        sql`${mouvementsFinanciers.metadata}->>'caisseId' = ${caisseId}`,
        eq(mouvementsFinanciers.sens, direction),
        eq(mouvementsFinanciers.statut, "POSTED"),
        gte(mouvementsFinanciers.dateOperation, startOfDay)
      )
    );

  return parseFloat(result[0]?.total || "0");
}

// ============================================================================
// COFFRE GUARD
// ============================================================================

export interface CoffreGuardResult {
  coffre: CoffreFort;
  soldeBefore: number;
}

export interface GuardContext {
  userId: string;
  operationType: string;
}

/**
 * Guard central pour débit coffre-fort.
 *
 * Acquiert un verrou SELECT FOR UPDATE, puis vérifie:
 *  1. Coffre actif (statut = ACTIVE)
 *  2. Solde >= montant demandé
 *  3. (Solde - montant) >= soldeMinimum du coffre
 *  4. Plafond journalier sortant non dépassé (si configuré)
 *
 * @returns Le coffre verrouillé et son solde avant l'opération
 */
export async function assertCoffreCanDebit(
  tx: PgTransaction<any, any, any>,
  coffreId: string,
  amount: number,
  ctx: GuardContext
): Promise<CoffreGuardResult> {
  // 1. SELECT FOR UPDATE — acquiert le verrou pessimiste
  const [coffre] = await tx
    .select()
    .from(coffresForts)
    .where(eq(coffresForts.id, coffreId))
    .for("update");

  if (!coffre) {
    throw new Error(`COFFRE_NOT_FOUND: Coffre ${coffreId} introuvable`);
  }

  // 2. Vérifier statut actif
  if (coffre.statut !== "ACTIVE") {
    throw new CoffreInactifError(coffreId, coffre.statut);
  }

  const solde = parseFloat(coffre.solde || "0");

  // 3. Vérifier solde suffisant
  if (solde < amount) {
    throw new CoffreInsufficientFundsError(coffreId, solde, amount);
  }

  // 4. Vérifier solde minimum
  const soldeMinimum = parseFloat(coffre.soldeMinimum || "0");
  const soldeApres = solde - amount;
  if (soldeApres < soldeMinimum) {
    throw new CoffreSoldeMinimumError(coffreId, soldeApres, soldeMinimum, solde, amount);
  }

  // 5. Vérifier plafond journalier sortant (si configuré)
  if (coffre.ownerId) {
    const [config] = await tx
      .select()
      .from(configCoffreFort)
      .where(eq(configCoffreFort.agenceId, coffre.ownerId));

    if (config?.plafondJournalierSortant) {
      const plafond = parseFloat(config.plafondJournalierSortant);
      if (plafond > 0) {
        const dailyTotal = await getDailyCoffreTotal(tx, coffreId, "DEBIT");
        if (dailyTotal + amount > plafond) {
          throw new CoffrePlafondJournalierError(
            "coffre", coffreId, "DEBIT", dailyTotal, amount, plafond
          );
        }
      }
    }
  }

  return { coffre, soldeBefore: solde };
}

/**
 * Guard pour crédit coffre — vérifie uniquement le plafond journalier entrant.
 * Pas besoin de vérifier le solde (on ajoute de l'argent).
 */
export async function assertCoffreCanCredit(
  tx: PgTransaction<any, any, any>,
  coffreId: string,
  amount: number,
  ctx: GuardContext
): Promise<CoffreGuardResult> {
  // SELECT FOR UPDATE
  const [coffre] = await tx
    .select()
    .from(coffresForts)
    .where(eq(coffresForts.id, coffreId))
    .for("update");

  if (!coffre) {
    throw new Error(`COFFRE_NOT_FOUND: Coffre ${coffreId} introuvable`);
  }

  if (coffre.statut !== "ACTIVE") {
    throw new CoffreInactifError(coffreId, coffre.statut);
  }

  const solde = parseFloat(coffre.solde || "0");

  // Vérifier plafond journalier entrant (si configuré)
  if (coffre.ownerId) {
    const [config] = await tx
      .select()
      .from(configCoffreFort)
      .where(eq(configCoffreFort.agenceId, coffre.ownerId));

    if (config?.plafondJournalierEntrant) {
      const plafond = parseFloat(config.plafondJournalierEntrant);
      if (plafond > 0) {
        const dailyTotal = await getDailyCoffreTotal(tx, coffreId, "CREDIT");
        if (dailyTotal + amount > plafond) {
          throw new CoffrePlafondJournalierError(
            "coffre", coffreId, "CREDIT", dailyTotal, amount, plafond
          );
        }
      }
    }
  }

  return { coffre, soldeBefore: solde };
}

// ============================================================================
// CAISSE GUARD
// ============================================================================

export interface CaisseGuardResult {
  caisse: Caisse;
  soldeBefore: number;
}

/**
 * Guard central pour débit caisse.
 *
 * Acquiert un verrou SELECT FOR UPDATE, puis vérifie:
 *  1. Caisse non supprimée (deletedAt IS NULL)
 *  2. Solde >= montant demandé
 *
 * @returns La caisse verrouillée et son solde avant l'opération
 */
export async function assertCaisseCanDebit(
  tx: PgTransaction<any, any, any>,
  caisseId: string,
  amount: number,
  ctx: GuardContext
): Promise<CaisseGuardResult> {
  // SELECT FOR UPDATE
  const [caisse] = await tx
    .select()
    .from(caisses)
    .where(eq(caisses.id, caisseId))
    .for("update");

  if (!caisse) {
    throw new Error(`CAISSE_NOT_FOUND: Caisse ${caisseId} introuvable`);
  }

  // Vérifier non supprimée
  if (caisse.deletedAt) {
    throw new CaisseInactiveError(caisseId, "DELETED");
  }

  const solde = parseFloat(caisse.solde || "0");

  // Vérifier solde suffisant
  if (solde < amount) {
    throw new CaisseInsufficientFundsError(caisseId, solde, amount);
  }

  return { caisse, soldeBefore: solde };
}

/**
 * Guard pour crédit caisse — acquiert le verrou, vérifie l'existence.
 */
export async function assertCaisseCanCredit(
  tx: PgTransaction<any, any, any>,
  caisseId: string,
  amount: number,
  ctx: GuardContext
): Promise<CaisseGuardResult> {
  const [caisse] = await tx
    .select()
    .from(caisses)
    .where(eq(caisses.id, caisseId))
    .for("update");

  if (!caisse) {
    throw new Error(`CAISSE_NOT_FOUND: Caisse ${caisseId} introuvable`);
  }

  if (caisse.deletedAt) {
    throw new CaisseInactiveError(caisseId, "DELETED");
  }

  const solde = parseFloat(caisse.solde || "0");
  return { caisse, soldeBefore: solde };
}

// ============================================================================
// ATOMIC BALANCE UPDATES (post-guard)
// ============================================================================

/**
 * Met à jour atomiquement le solde d'un coffre avec un guard SQL.
 * Le coffre DOIT avoir été verrouillé par un guard au préalable.
 */
export async function updateCoffreBalance(
  tx: PgTransaction<any, any, any>,
  coffreId: string,
  delta: number
): Promise<{ solde: string }> {
  const [result] = await tx
    .update(coffresForts)
    .set({
      solde: sql`${coffresForts.solde} + ${delta}`,
      updatedAt: new Date(),
    })
    .where(eq(coffresForts.id, coffreId))
    .returning({ solde: coffresForts.solde });

  if (!result) {
    throw new Error(`Coffre ${coffreId} not found during balance update`);
  }
  return result;
}

/**
 * Met à jour atomiquement le solde d'une caisse avec un guard SQL.
 * La caisse DOIT avoir été verrouillée par un guard au préalable.
 */
export async function updateCaisseBalance(
  tx: PgTransaction<any, any, any>,
  caisseId: string,
  delta: number
): Promise<{ solde: string }> {
  const [result] = await tx
    .update(caisses)
    .set({
      solde: sql`${caisses.solde} + ${delta}`,
      updatedAt: new Date(),
    })
    .where(eq(caisses.id, caisseId))
    .returning({ solde: caisses.solde });

  if (!result) {
    throw new Error(`Caisse ${caisseId} not found during balance update`);
  }
  return result;
}
