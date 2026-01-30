/**
 * Mobile Money Caisse Service
 * Gestion des caisses digitales pour Mobile Money (MTN et Airtel)
 *
 * Chaque agence a des caisses digitales dédiées aux providers Mobile Money.
 * Ces caisses trackent les flux d'argent entrant/sortant via MM.
 */

import { db } from "../../db";
import { caisses, agences, type Caisse, type InsertCaisse } from "@shared/schema";
import { eq, and, or, inArray } from "drizzle-orm";
import { TypeCaisse, getDigitalCaisseType, TYPE_CAISSE_LABELS } from "@shared/enum/status-constants";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { createLogger } from "../../lib/logger";

const logger = createLogger('MmCaisse');

// Type for transaction context
type TxContext = PgTransaction<any, any, any> | typeof db;

/**
 * Récupère ou crée la caisse digitale pour un provider/agence
 *
 * @param tx - Transaction context (ou db direct)
 * @param provider - MTN ou AIRTEL
 * @param agenceId - ID de l'agence
 * @returns La caisse digitale existante ou nouvellement créée
 */
export async function getOrCreateDigitalCaisse(
  tx: TxContext,
  provider: "MTN" | "AIRTEL",
  agenceId: string
): Promise<Caisse> {
  const caisseType = getDigitalCaisseType(provider);

  // 1. Chercher une caisse existante pour ce provider/agence
  const [existingCaisse] = await tx
    .select()
    .from(caisses)
    .where(
      and(
        eq(caisses.agenceId, agenceId),
        eq(caisses.type, caisseType)
      )
    )
    .limit(1);

  if (existingCaisse) {
    return existingCaisse;
  }

  // 2. Récupérer le nom de l'agence pour le nom de la caisse
  const [agence] = await tx
    .select({ nom: agences.nom })
    .from(agences)
    .where(eq(agences.id, agenceId))
    .limit(1);

  if (!agence) {
    throw new Error(`Agence not found: ${agenceId}`);
  }

  // 3. Créer la caisse digitale
  const caisseName = `Caisse MM ${provider} - ${agence.nom}`;

  const [newCaisse] = await tx
    .insert(caisses)
    .values({
      nom: caisseName,
      agenceId,
      type: caisseType,
      solde: "0",
      statut: "OPEN", // Les caisses digitales sont toujours ouvertes
    })
    .returning();

  logger.info({ provider, agenceName: agence.nom, caisseId: newCaisse.id }, 'Created digital caisse');

  return newCaisse;
}

/**
 * Met à jour le solde de la caisse digitale
 *
 * @param tx - Transaction context
 * @param caisseId - ID de la caisse
 * @param delta - Montant à ajouter (positif) ou soustraire (négatif)
 * @param mouvementId - ID du mouvement financier associé
 * @returns Le nouveau solde
 */
export async function updateDigitalCaisseSolde(
  tx: TxContext,
  caisseId: string,
  delta: number,
  mouvementId: string
): Promise<string> {
  // Récupérer la caisse avec lock FOR UPDATE
  const [caisse] = await tx
    .select()
    .from(caisses)
    .where(eq(caisses.id, caisseId))
    .for("update");

  if (!caisse) {
    throw new Error(`Caisse not found: ${caisseId}`);
  }

  const currentSolde = parseFloat(caisse.solde || "0");
  const newSolde = currentSolde + delta;

  if (newSolde < 0) {
    throw new Error(`Insufficient funds in digital caisse ${caisseId}: current=${currentSolde}, delta=${delta}`);
  }

  // Mettre à jour le solde
  await tx
    .update(caisses)
    .set({
      solde: newSolde.toString(),
      updatedAt: new Date(),
    })
    .where(eq(caisses.id, caisseId));

  logger.info({ caisseId, currentSolde, newSolde, delta, mouvementId }, 'Updated solde');

  return newSolde.toString();
}

/**
 * Récupère le résumé des caisses digitales (pour dashboard trésorerie)
 */
export interface DigitalCaisseSummary {
  caisseId: string;
  agenceId: string;
  agenceNom: string;
  provider: "MTN" | "AIRTEL";
  type: string;
  solde: string;
  statut: string;
}

export interface DigitalCaisseTotals {
  mtn: {
    total: number;
    byAgence: DigitalCaisseSummary[];
  };
  airtel: {
    total: number;
    byAgence: DigitalCaisseSummary[];
  };
  grandTotal: number;
}

/**
 * Récupère le résumé des caisses digitales pour le dashboard trésorerie
 *
 * @param agenceId - Optionnel: filtrer par agence
 * @returns Totaux par provider et par agence
 */
export async function getDigitalCaisseSummary(
  agenceId?: string
): Promise<DigitalCaisseTotals> {
  // Construire les conditions de filtre
  const digitalCaisseTypes = [TypeCaisse.DIGITAL_MM_MTN, TypeCaisse.DIGITAL_MM_AIRTEL];

  const conditions = agenceId
    ? and(
        eq(caisses.agenceId, agenceId),
        inArray(caisses.type, digitalCaisseTypes)
      )
    : inArray(caisses.type, digitalCaisseTypes);

  // Exécuter la requête
  const digitalCaisses = await db
    .select({
      caisse: caisses,
      agenceNom: agences.nom,
    })
    .from(caisses)
    .innerJoin(agences, eq(caisses.agenceId, agences.id))
    .where(conditions);

  // Séparer par provider
  const mtnCaisses: DigitalCaisseSummary[] = [];
  const airtelCaisses: DigitalCaisseSummary[] = [];
  let mtnTotal = 0;
  let airtelTotal = 0;

  for (const row of digitalCaisses) {
    const summary: DigitalCaisseSummary = {
      caisseId: row.caisse.id,
      agenceId: row.caisse.agenceId,
      agenceNom: row.agenceNom,
      provider: row.caisse.type === TypeCaisse.DIGITAL_MM_MTN ? "MTN" : "AIRTEL",
      type: row.caisse.type,
      solde: row.caisse.solde,
      statut: row.caisse.statut,
    };

    const solde = parseFloat(row.caisse.solde || "0");

    if (row.caisse.type === TypeCaisse.DIGITAL_MM_MTN) {
      mtnCaisses.push(summary);
      mtnTotal += solde;
    } else {
      airtelCaisses.push(summary);
      airtelTotal += solde;
    }
  }

  return {
    mtn: {
      total: mtnTotal,
      byAgence: mtnCaisses,
    },
    airtel: {
      total: airtelTotal,
      byAgence: airtelCaisses,
    },
    grandTotal: mtnTotal + airtelTotal,
  };
}

/**
 * Crée les caisses digitales pour toutes les agences (utilitaire)
 * Utile pour initialiser ou s'assurer que toutes les agences ont leurs caisses
 */
export async function ensureDigitalCaissesForAllAgences(): Promise<{
  created: number;
  existing: number;
}> {
  const allAgences = await db.select({ id: agences.id, nom: agences.nom }).from(agences);

  let created = 0;
  let existing = 0;

  for (const agence of allAgences) {
    for (const provider of ["MTN", "AIRTEL"] as const) {
      const caisseType = getDigitalCaisseType(provider);

      // Vérifier si la caisse existe
      const [existingCaisse] = await db
        .select({ id: caisses.id })
        .from(caisses)
        .where(
          and(
            eq(caisses.agenceId, agence.id),
            eq(caisses.type, caisseType)
          )
        )
        .limit(1);

      if (existingCaisse) {
        existing++;
      } else {
        // Créer la caisse
        await db.insert(caisses).values({
          nom: `Caisse MM ${provider} - ${agence.nom}`,
          agenceId: agence.id,
          type: caisseType,
          solde: "0",
          statut: "OPEN",
        });
        created++;
        logger.info({ provider, agenceName: agence.nom }, 'Created caisse');
      }
    }
  }

  logger.info({ created, existing }, 'Ensured digital caisses');

  return { created, existing };
}

/**
 * Récupère la caisse digitale par provider et agence (sans création)
 */
export async function getDigitalCaisse(
  provider: "MTN" | "AIRTEL",
  agenceId: string
): Promise<Caisse | null> {
  const caisseType = getDigitalCaisseType(provider);

  const [caisse] = await db
    .select()
    .from(caisses)
    .where(
      and(
        eq(caisses.agenceId, agenceId),
        eq(caisses.type, caisseType)
      )
    )
    .limit(1);

  return caisse || null;
}

export default {
  getOrCreateDigitalCaisse,
  updateDigitalCaisseSolde,
  getDigitalCaisseSummary,
  ensureDigitalCaissesForAllAgences,
  getDigitalCaisse,
};
