import { db } from "../../db";
import { eq, sql } from "drizzle-orm";
import {
  coffresForts,
  agences,
  mouvementsFinanciers,
} from "@shared/schema";
import { StatutCoffre } from "@shared/enum/status-constants";
import { postGlForMouvement } from "../accounting-posting-service";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../../lib/logger";
import type { ServiceResult } from "./types";

/**
 * Met à jour un coffre-fort
 */
export async function updateCoffre(
  coffreId: string,
  data: {
    nom?: string;
    plafondEncaisse?: number;
    soldeMinimum?: number;
    statut?: typeof StatutCoffre[keyof typeof StatutCoffre];
    description?: string;
  }
): Promise<ServiceResult> {
  const updateData: any = { updatedAt: new Date() };

  if (data.nom !== undefined) updateData.nom = data.nom;
  if (data.plafondEncaisse !== undefined) updateData.plafondEncaisse = data.plafondEncaisse.toString();
  if (data.soldeMinimum !== undefined) updateData.soldeMinimum = data.soldeMinimum.toString();
  if (data.statut !== undefined) updateData.statut = data.statut;
  if (data.description !== undefined) updateData.description = data.description;

  const [updated] = await db
    .update(coffresForts)
    .set(updateData)
    .where(eq(coffresForts.id, coffreId))
    .returning();

  if (!updated) {
    return { success: false, errorCode: "COFFRE_NOT_FOUND", error: "Coffre-fort introuvable" };
  }

  return { success: true, data: updated };
}

/**
 * Approvisionne un coffre (ajout de fonds externe)
 * Crée un mouvement financier et poste automatiquement au Grand Livre
 */
export async function approvisionnerCoffre(
  coffreId: string,
  montant: number,
  motif: string,
  userId: string
): Promise<ServiceResult> {
  if (montant <= 0) {
    return { success: false, errorCode: "INVALID_AMOUNT", error: "Le montant doit être positif" };
  }

  const [coffre] = await db
    .select()
    .from(coffresForts)
    .where(eq(coffresForts.id, coffreId));

  if (!coffre) {
    return { success: false, errorCode: "COFFRE_NOT_FOUND", error: "Coffre-fort introuvable" };
  }

  if (coffre.statut !== StatutCoffre.ACTIVE) {
    return { success: false, errorCode: "COFFRE_INACTIVE", error: "Le coffre-fort n'est pas actif" };
  }

  // Vérifier le plafond
  if (coffre.plafondEncaisse) {
    const soldeActuel = parseFloat(coffre.solde?.toString() || "0");
    const plafond = parseFloat(coffre.plafondEncaisse.toString());
    if (soldeActuel + montant > plafond) {
      return {
        success: false,
        errorCode: "PLAFOND_EXCEEDED",
        error: `Le plafond serait dépassé. Plafond: ${plafond.toLocaleString()} XAF, Solde après: ${(soldeActuel + montant).toLocaleString()} XAF`,
      };
    }
  }

  // Récupérer l'agence du coffre
  let agenceId: string;
  if (coffre.ownerType === 'AGENCE') {
    agenceId = coffre.ownerId!;
  } else {
    // Coffre de type SIEGE - utiliser l'agence par défaut
    const [defaultAgence] = await db
      .select()
      .from(agences)
      .limit(1);
    if (!defaultAgence) {
      return { success: false, errorCode: "NO_AGENCY", error: "Aucune agence trouvée" };
    }
    agenceId = defaultAgence.id;
  }

  // Transaction pour garantir l'atomicité
  const result = await db.transaction(async (tx) => {
    // 1. Créer le mouvement financier
    const mouvementId = uuidv4();
    const refPrefix = `ABD-${Date.now().toString().slice(-8)}`;

    const [mouvement] = await tx
      .insert(mouvementsFinanciers)
      .values({
        id: mouvementId,
        montant: montant.toString(),
        sens: 'DEBIT', // Débit du coffre (augmente l'actif)
        sourceModule: 'COFFRE',
        sourceTable: 'coffres_forts',
        sourceId: coffreId,
        agenceId,
        reference: `${refPrefix}-COFFRE`,
        idempotencyKey: `${coffreId}-abond-${Date.now()}`,
        statut: 'POSTED',
        dateOperation: new Date(),
        createdBy: userId,
        metadata: {
          coffreId,
          type: 'ENTREE_COFFRE',
          description: motif,
          categorie: 'Abondement Coffre',
          montantAbondement: montant,
        },
      })
      .returning();

    // 2. Poster au Grand Livre (STRICT — failure rolls back transaction)
    const glResult = await postGlForMouvement(tx, mouvement, agenceId, userId, {
      eventType: 'ENTREE_COFFRE',
      operationType: 'ABONDEMENT_COFFRE',
      coffreId,
    });

    const glPosted = !!glResult;
    if (glResult) {
      logger.info({ mouvementId, numeroPiece: glResult.numeroPiece }, 'GL posted for coffre abondement');
    }

    await tx
      .update(mouvementsFinanciers)
      .set({ glPostingStatus: "POSTED" })
      .where(eq(mouvementsFinanciers.id, mouvementId));

    // 3. Mettre à jour le solde du coffre
    const [updated] = await tx
      .update(coffresForts)
      .set({
        solde: sql`${coffresForts.solde} + ${montant}`,
        updatedAt: new Date(),
      })
      .where(eq(coffresForts.id, coffreId))
      .returning();

    return { coffre: updated, mouvement, glPosted };
  });

  return {
    success: true,
    data: {
      coffre: result.coffre,
      mouvement: result.mouvement,
      glPosted: result.glPosted,
    }
  };
}
