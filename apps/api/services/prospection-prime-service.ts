/**
 * Prospection Prime Service — GL posting & HR integration for prospection primes
 *
 * Handles:
 * - GL posting when a prime is PAID (charge primes → dette personnel)
 * - HR integration: assigns benefit to agent's employee record
 */

import { mouvementsFinanciers, prospectionPrimes, prospectionPrimeConfig, avantages, avantagesEmployes, agentsTerrain, employes } from "@shared/schema";
import type { ProspectionPrime } from "@shared/schema";
import { StatutTransaction } from "@shared/enum/status-constants";
import { eq, and } from "drizzle-orm";
import { postGlForMouvement } from "./accounting-posting-service";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { createLogger } from "../lib/logger";

const logger = createLogger("ProspectionPrimeService");

function generateReference(prefix: string): string {
  const { randomInt } = require('crypto');
  const timestamp = Date.now().toString().slice(-6);
  const random = randomInt(0, 1000).toString().padStart(3, "0");
  return `${prefix}-${timestamp}${random}`;
}

export interface PrimeGlResult {
  mouvementId: string;
  ecritureId: string | null;
  glPostingStatus: string;
  avantageEmployeId: number | null;
}

/**
 * Pay a prospection prime: create financial movement, post GL entry, and record HR benefit.
 *
 * Must be called within a database transaction.
 */
export async function payProspectionPrime(
  tx: PgTransaction<any, any, any>,
  prime: ProspectionPrime,
  agenceId: string,
  userId: string
): Promise<PrimeGlResult> {
  const reference = generateReference("PRP");

  // Resolve agent's employee name for GL description
  let employeNom = "Agent";
  let employeId: string | null = null;

  if (prime.agentId) {
    const [agentRow] = await tx
      .select({
        employeId: agentsTerrain.employeId,
      })
      .from(agentsTerrain)
      .where(eq(agentsTerrain.id, prime.agentId))
      .limit(1);

    if (agentRow?.employeId) {
      employeId = agentRow.employeId;

      // Get employee name from users table via employes
      const { users } = await import("@shared/schema");
      const [empUser] = await tx
        .select({ nom: users.nom, prenom: users.prenom })
        .from(employes)
        .innerJoin(users, eq(employes.userId, users.id))
        .where(eq(employes.id, agentRow.employeId))
        .limit(1);

      if (empUser) {
        employeNom = `${empUser.prenom || ""} ${empUser.nom}`.trim();
      }
    }
  }

  // 0. For VARIABLE primes, calculate montant from agent's gross annual salary
  let effectiveMontant = prime.montant;

  if (prime.typePrime === "VARIABLE" && employeId) {
    // Get agent's salary
    const [emp] = await tx
      .select({ salaireBase: employes.salaireBase })
      .from(employes)
      .where(eq(employes.id, employeId))
      .limit(1);

    // Get active config for this agency
    const [config] = await tx
      .select({ tauxVariable: prospectionPrimeConfig.tauxVariable })
      .from(prospectionPrimeConfig)
      .where(
        and(
          eq(prospectionPrimeConfig.actif, true),
          prime.agenceId ? eq(prospectionPrimeConfig.agenceId, prime.agenceId) : undefined
        )
      )
      .limit(1);

    const salaireBase = Number(emp?.salaireBase) || 0;
    const tauxVariable = Number(config?.tauxVariable) || 0;

    if (salaireBase > 0 && tauxVariable > 0) {
      const salaireBrutAnnuel = salaireBase * 12;
      effectiveMontant = String(Math.round(salaireBrutAnnuel * tauxVariable / 100));
      logger.info({ primeId: prime.id, salaireBase, salaireBrutAnnuel, tauxVariable, effectiveMontant }, "Calculated variable prime amount");

      // Update prime montant
      await tx
        .update(prospectionPrimes)
        .set({ montant: effectiveMontant, updatedAt: new Date() })
        .where(eq(prospectionPrimes.id, prime.id));
    } else {
      logger.warn({ primeId: prime.id, salaireBase, tauxVariable }, "Cannot calculate variable prime: missing salary or rate");
    }
  }

  // 1. Create financial movement
  const [mouvement] = await tx
    .insert(mouvementsFinanciers)
    .values({
      montant: effectiveMontant,
      sens: "DEBIT",
      sourceModule: "RH_PAYROLL",
      typePaiement: "PROSPECTION_PRIME",
      agenceId,
      agentId: prime.agentId,
      reference,
      idempotencyKey: `prospection-prime-${prime.id}`,
      statut: StatutTransaction.POSTED,
      dateOperation: new Date(),
      requiresGlPosting: true,
      glPostingStatus: "PENDING",
      createdBy: userId,
      metadata: {
        primeId: prime.id,
        prospectionId: prime.prospectionId,
        clientId: prime.clientId,
        agentId: prime.agentId,
        employeNom,
        periode: prime.periode,
        montant: effectiveMontant,
      },
    } as any)
    .returning();

  // 2. Post GL entry
  let ecritureId: string | null = null;
  let glPostingStatus = "PENDING";

  try {
    const glResult = await postGlForMouvement(tx, mouvement, agenceId, userId, {
      primeId: prime.id,
      employeNom,
      periode: prime.periode,
      type: "PROSPECTION_PRIME",
    });
    if (glResult) {
      ecritureId = glResult.ecritureId;
      glPostingStatus = "POSTED";
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown GL error";
    logger.error({ primeId: prime.id, error: message }, "GL posting failed for prospection prime");
    glPostingStatus = "FAILED";

    await tx
      .update(mouvementsFinanciers)
      .set({ glPostingStatus: "FAILED", glPostingError: message })
      .where(eq(mouvementsFinanciers.id, mouvement.id));
  }

  // 3. Update prime with mouvement link and payment status
  await tx
    .update(prospectionPrimes)
    .set({
      statut: "PAID",
      paidAt: new Date(),
      mouvementId: mouvement.id,
      updatedAt: new Date(),
    })
    .where(eq(prospectionPrimes.id, prime.id));

  // 4. HR integration: assign benefit to employee
  let avantageEmployeId: number | null = null;

  if (employeId) {
    try {
      // Find or create "Prime de Prospection" benefit catalog entry
      let [primeAvantage] = await tx
        .select()
        .from(avantages)
        .where(
          and(
            eq(avantages.nom, "Prime de Prospection"),
            eq(avantages.type, "Prime")
          )
        )
        .limit(1);

      if (!primeAvantage) {
        [primeAvantage] = await tx
          .insert(avantages)
          .values({
            nom: "Prime de Prospection",
            type: "Prime",
            montantParDefaut: Number(effectiveMontant) || 5000,
            description: "Prime versée pour la conversion d'un prospect en client",
            actif: true,
          })
          .returning();
      }

      // Assign benefit to employee
      const [assignedBenefit] = await tx
        .insert(avantagesEmployes)
        .values({
          employeId,
          avantageId: primeAvantage.id,
          montant: Number(effectiveMontant) || 5000,
          statut: "ACTIVE",
        })
        .returning();

      avantageEmployeId = assignedBenefit.id;

      // Link back to prime
      await tx
        .update(prospectionPrimes)
        .set({ avantageEmployeId })
        .where(eq(prospectionPrimes.id, prime.id));
    } catch (hrError) {
      logger.error({ primeId: prime.id, employeId, err: hrError }, "HR benefit assignment failed");
      // Non-blocking: prime payment still goes through even if HR link fails
    }
  }

  return {
    mouvementId: mouvement.id,
    ecritureId,
    glPostingStatus,
    avantageEmployeId,
  };
}
