import { db } from "../../db";
import { payrollGlMapping, type PayrollGlMappingEntry } from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * Charge tous les mappages GL (Grand Livre) actifs pour la paie.
 * 
 * @returns Une promesse résolvant un tableau des mappages GL actifs pour la paie.
 */
export async function loadGlMappings(): Promise<PayrollGlMappingEntry[]> {
  return db
    .select()
    .from(payrollGlMapping)
    .where(eq(payrollGlMapping.active, true));
}

/**
 * Trouve un mappage spécifique basé sur le type de source, le code et le sens (débit/crédit).
 * 
 * @param mappings - Le tableau des mappages GL dans lequel chercher.
 * @param sourceType - Le type de source du mappage (ex: "ALLOWANCE").
 * @param sourceCode - Le code de l'élément spécifique à mapper.
 * @param side - Le sens comptable (ex: "DEBIT", "CREDIT").
 * @returns L'entrée de mappage GL correspondante, ou undefined si introuvable.
 */
export function findMapping(
  mappings: PayrollGlMappingEntry[],
  sourceType: string,
  sourceCode: string,
  side: string
): PayrollGlMappingEntry | undefined {
  return mappings.find(
    (m) => m.sourceType === sourceType && m.sourceCode === sourceCode && m.side === side
  );
}

/**
 * Résout un numéro de compte vers son identifiant et son numéro formel dans le plan comptable.
 * 
 * @param accountNumber - Le numéro de compte standard à résoudre.
 * @returns L'identifiant et le numéro du compte, ou null si le compte est introuvable.
 */
export async function resolveAccount(
  accountNumber: string
): Promise<{ id: string; numeroCompte: string } | null> {
  const { planComptable } = await import("@shared/schema");
  const [account] = await db
    .select({ id: planComptable.id, numeroCompte: planComptable.numeroCompte })
    .from(planComptable)
    .where(eq(planComptable.numeroCompte, accountNumber))
    .limit(1);
  return account || null;
}
