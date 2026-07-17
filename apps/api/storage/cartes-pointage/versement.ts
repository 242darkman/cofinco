/**
 * Versement — pointage d'une case de la carte.
 * Invariants critiques : verrou pessimiste, ACID, idempotence, lien ledger/GL.
 */

import { sql, eq } from "drizzle-orm";
import {
  cartesPointage,
  transactionsPointage,
  operationsCaisse,
  type TransactionPointage,
} from "@shared/schema";
import {
  NOMBRE_CASES_CARTE_POINTAGE,
  peutPointer,
} from "@shared/utils/carte-pointage";
import {
  executeWithLedger,
  updateSessionSolde,
  validateUserId,
} from "../../services/ledger";
import { GL_EVENT_DEPOT, type VersementCartePointageParams } from "./types";
import { getCartePointage, lockCarteActive } from "./cartes";

/**
 * Enregistre un versement : coche la case suivante de la carte.
 *
 * Atomique via `executeWithLedger` (mouvement financier + GL + événements +
 * opération métier dans une seule transaction PostgreSQL, rollback complet
 * en cas d'échec). Idempotent par `idempotencyKey` (unicité en base +
 * vérification ledger).
 *
 * Espèces : la caisse ouverte de l'agent est créditée du montant unitaire M
 * et une opération de caisse est tracée (1 mouvement de solde = 1 opération).
 */
export async function createVersementCartePointage(
  params: VersementCartePointageParams,
): Promise<TransactionPointage> {
  const isCash = params.paymentMethod === "CASH";
  if (isCash && !params.sessionCaisseId) {
    throw new Error("Une session de caisse active est requise pour les versements en espèces");
  }

  // Lecture hors transaction uniquement pour le contexte du mouvement (agence, client, montant).
  const carteInfo = await getCartePointage(params.cardId);
  if (!carteInfo) throw new Error("Carte de pointage introuvable");

  const { result } = await executeWithLedger(
    "EPARGNE",
    {
      montant: carteInfo.unitAmount,
      sens: "CREDIT",
      clientId: carteInfo.clientId,
      agenceId: carteInfo.agenceId,
      sessionCaisseId: isCash ? params.sessionCaisseId : undefined,
      typePaiement: GL_EVENT_DEPOT,
      methodePaiement: params.paymentMethod,
      referenceExterne: carteInfo.reference,
      idempotencyKey: params.idempotencyKey,
      metadata: { cardId: carteInfo.id, cardReference: carteInfo.reference },
    },
    async (tx, mouvement) => {
      // 1. Verrou pessimiste + revalidation des invariants sous verrou.
      const carte = await lockCarteActive(tx, params.cardId);
      if (!peutPointer(carte.completedSlots)) {
        throw new Error(
          `Carte pleine : les ${NOMBRE_CASES_CARTE_POINTAGE} cases sont déjà pointées`,
        );
      }
      const slotNumber = carte.completedSlots + 1;

      // 2. Journal immuable du versement, lié au mouvement du ledger.
      const [transaction] = await tx
        .insert(transactionsPointage)
        .values({
          cardId: carte.id,
          type: "DEPOSIT",
          amount: carte.unitAmount,
          commissionAmount: "0",
          slotNumber,
          paymentMethod: params.paymentMethod,
          sessionCaisseId: isCash ? params.sessionCaisseId : null,
          mouvementFinancierId: mouvement.id,
          idempotencyKey: params.idempotencyKey,
          createdBy: params.userId,
        })
        .returning();

      // 3. Progression de la carte (verrouillage optimiste incrémenté).
      await tx
        .update(cartesPointage)
        .set({
          completedSlots: slotNumber,
          updatedAt: new Date(),
          version: sql`${cartesPointage.version} + 1`,
        })
        .where(eq(cartesPointage.id, carte.id));

      // 4. Espèces : créditer la caisse ouverte de l'agent + traçabilité caisse.
      let nouveauSoldeSession: string | undefined;
      if (isCash && params.sessionCaisseId) {
        nouveauSoldeSession = await updateSessionSolde(
          tx,
          params.sessionCaisseId,
          Number(carte.unitAmount),
        );
        const validatedUserId = await validateUserId(tx, params.userId);
        await tx.insert(operationsCaisse).values({
          sessionId: params.sessionCaisseId,
          mouvementId: mouvement.id,
          typeOperation: "MISC_COLLECTION",
          montant: carte.unitAmount,
          methodePaiement: "CASH",
          reference: `CDP-IN-${carte.reference}`,
          description: `Versement carte de pointage ${carte.reference} (case ${slotNumber}/${NOMBRE_CASES_CARTE_POINTAGE})`,
          createdBy: validatedUserId,
        });
      }

      return { result: transaction, additionalEventData: { nouveauSoldeSession } };
    },
    params.userId,
  );

  return result;
}
