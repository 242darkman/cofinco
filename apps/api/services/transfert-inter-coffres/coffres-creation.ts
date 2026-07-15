import { db } from "../../db";
import { eq, and } from "drizzle-orm";
import {
  coffresForts,
  comptesLiaison,
} from "@shared/schema";
import { StatutCoffre } from "@shared/enum/status-constants";
import { currencyCode } from "@shared/config/currency";
import type { ServiceResult } from "./types";

/**
 * Crée un compte de liaison pour un coffre
 */
export async function createCompteLiaisonForCoffre(coffre: typeof coffresForts.$inferSelect) {
  const code = coffre.ownerType === "SIEGE"
    ? "LIAISON-SIEGE"
    : `LIAISON-${coffre.code.replace("CF-", "")}`;

  const intitule = coffre.ownerType === "SIEGE"
    ? "Compte de liaison - Siège"
    : `Compte de liaison - ${coffre.nom.replace("Coffre-fort ", "")}`;

  // Vérifier si existe déjà
  const [existing] = await db
    .select()
    .from(comptesLiaison)
    .where(eq(comptesLiaison.code, code));

  if (existing) return existing;

  const [compte] = await db
    .insert(comptesLiaison)
    .values({
      code,
      intitule,
      numeroComptable: "581200",
      entiteType: coffre.ownerType,
      entiteId: coffre.ownerId,
      soldeCourant: "0",
      actif: true,
    })
    .returning();

  return compte;
}

/**
 * Crée un coffre-fort pour une agence (appelé automatiquement à la création d'agence)
 */
export async function createCoffreForAgence(
  agenceId: string,
  agenceCode: string,
  agenceNom: string,
  options?: {
    plafondEncaisse?: number;
    soldeMinimum?: number;
  }
): Promise<ServiceResult> {
  const code = `CF-${agenceCode}`;
  const nom = `Coffre-fort ${agenceNom}`;

  // Vérifier si un coffre existe déjà pour cette agence
  const [existing] = await db
    .select()
    .from(coffresForts)
    .where(and(
      eq(coffresForts.ownerType, "AGENCE"),
      eq(coffresForts.ownerId, agenceId)
    ));

  if (existing) {
    return { success: true, data: existing };
  }

  const [coffre] = await db
    .insert(coffresForts)
    .values({
      code,
      nom,
      ownerType: "AGENCE",
      ownerId: agenceId,
      devise: currencyCode(),
      solde: "0",
      plafondEncaisse: options?.plafondEncaisse?.toString(),
      soldeMinimum: options?.soldeMinimum?.toString() || "0",
      statut: StatutCoffre.ACTIVE,
    })
    .returning();

  // Créer aussi le compte de liaison
  await createCompteLiaisonForCoffre(coffre);

  return { success: true, data: coffre };
}

/**
 * Crée le coffre-fort du siège (unique)
 */
export async function createCoffreSiege(options?: {
  plafondEncaisse?: number;
  soldeMinimum?: number;
}): Promise<ServiceResult> {
  // Vérifier si le coffre siège existe déjà
  const [existing] = await db
    .select()
    .from(coffresForts)
    .where(eq(coffresForts.ownerType, "SIEGE"));

  if (existing) {
    return { success: true, data: existing };
  }

  const [coffre] = await db
    .insert(coffresForts)
    .values({
      code: "CF-SIEGE",
      nom: "Coffre-fort Siège",
      ownerType: "SIEGE",
      ownerId: null,
      devise: currencyCode(),
      solde: "0",
      plafondEncaisse: options?.plafondEncaisse?.toString(),
      soldeMinimum: options?.soldeMinimum?.toString() || "0",
      statut: StatutCoffre.ACTIVE,
    })
    .returning();

  // Créer le compte de liaison
  await createCompteLiaisonForCoffre(coffre);

  return { success: true, data: coffre };
}
