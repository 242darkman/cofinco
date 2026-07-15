import { db } from "../../db";
import { eq, and, asc } from "drizzle-orm";
import { coffresForts, agences } from "@shared/schema";
import { StatutCoffre } from "@shared/enum/status-constants";
import type { ServiceResult } from "./types";
import { createCoffreSiege } from "./coffres-creation";

/**
 * Liste tous les coffres-forts
 */
export async function listCoffres(params?: {
  ownerType?: "AGENCE" | "SIEGE";
  statut?: string;
  agenceId?: string;
}): Promise<ServiceResult> {
  const conditions = [];

  if (params?.ownerType) {
    conditions.push(eq(coffresForts.ownerType, params.ownerType));
  }
  if (params?.statut) {
    conditions.push(eq(coffresForts.statut, params.statut as any));
  }
  if (params?.agenceId) {
    conditions.push(eq(coffresForts.ownerId, params.agenceId));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const coffres = await db
    .select({
      coffre: coffresForts,
      agence: agences,
    })
    .from(coffresForts)
    .leftJoin(agences, eq(coffresForts.ownerId, agences.id))
    .where(whereClause)
    .orderBy(asc(coffresForts.nom));

  const result = coffres.map(c => ({
    ...c.coffre,
    agence: c.agence,
    agenceNom: c.agence?.nom || (c.coffre.ownerType === "SIEGE" ? "Siège" : null),
  }));

  return { success: true, data: result };
}

/**
 * Récupère un coffre par ID
 */
export async function getCoffreById(coffreId: string): Promise<ServiceResult> {
  const [coffre] = await db
    .select()
    .from(coffresForts)
    .where(eq(coffresForts.id, coffreId));

  if (!coffre) {
    return { success: false, errorCode: "COFFRE_NOT_FOUND", error: "Coffre-fort introuvable" };
  }

  let agence = null;
  if (coffre.ownerId) {
    [agence] = await db.select().from(agences).where(eq(agences.id, coffre.ownerId));
  }

  return {
    success: true,
    data: {
      ...coffre,
      agence,
      agenceNom: agence?.nom || (coffre.ownerType === "SIEGE" ? "Siège" : null),
    },
  };
}

/**
 * Récupère le coffre d'une agence
 */
export async function getCoffreByAgenceId(agenceId: string): Promise<ServiceResult> {
  const [coffre] = await db
    .select()
    .from(coffresForts)
    .where(and(
      eq(coffresForts.ownerType, "AGENCE"),
      eq(coffresForts.ownerId, agenceId)
    ));

  if (!coffre) {
    return { success: false, errorCode: "COFFRE_NOT_FOUND", error: "Cette agence n'a pas de coffre-fort" };
  }

  const [agence] = await db.select().from(agences).where(eq(agences.id, agenceId));

  return {
    success: true,
    data: {
      ...coffre,
      agence,
      agenceNom: agence?.nom,
    },
  };
}

/**
 * Récupère le coffre du siège
 */
export async function getCoffreSiege(): Promise<ServiceResult> {
  const [coffre] = await db
    .select()
    .from(coffresForts)
    .where(eq(coffresForts.ownerType, "SIEGE"));

  if (!coffre) {
    // Créer automatiquement si n'existe pas
    return createCoffreSiege();
  }

  return {
    success: true,
    data: {
      ...coffre,
      agence: null,
      agenceNom: "Siège",
    },
  };
}

/**
 * Récupère les statistiques des coffres
 */
export async function getStatistiques(): Promise<ServiceResult> {
  const coffres = await db.select().from(coffresForts);

  const stats = {
    totalCoffres: coffres.length,
    coffresActifs: coffres.filter(c => c.statut === StatutCoffre.ACTIVE).length,
    coffresSuspendus: coffres.filter(c => c.statut === StatutCoffre.SUSPENDED).length,
    coffresFermes: coffres.filter(c => c.statut === StatutCoffre.CLOSED).length,
    soldeTotal: coffres.reduce((sum, c) => sum + parseFloat(c.solde?.toString() || "0"), 0),
    soldeSiege: coffres
      .filter(c => c.ownerType === "SIEGE")
      .reduce((sum, c) => sum + parseFloat(c.solde?.toString() || "0"), 0),
    soldeAgences: coffres
      .filter(c => c.ownerType === "AGENCE")
      .reduce((sum, c) => sum + parseFloat(c.solde?.toString() || "0"), 0),
  };

  return { success: true, data: stats };
}
