/**
 * Retrait — clôture de la carte et répartition des fonds.
 * Invariants critiques : verrou pessimiste, ACID, idempotence, lien ledger/GL,
 * commission créée et postée au GL dans la même transaction.
 */

import { eq, sql } from "drizzle-orm";
import {
  cartesPointage,
  transactionsPointage,
  operationsCaisse,
} from "@shared/schema";
import {
  calculerRetraitCartePointage,
  peutRetirer,
  MIN_VERSEMENTS_POUR_RETRAIT,
} from "@shared/utils/carte-pointage";
import {
  executeWithLedger,
  createMouvementFinancier,
  createMouvementEvents,
  updateSessionSolde,
  validateUserId,
  type MouvementFinancier,
} from "../../services/ledger";
import { postGlForMouvement } from "../../services/accounting-posting-service";
import { validateAccountingRule, isGLStrictMode } from "../../services/accounting-validation";
import { createLogger } from "../../lib/logger";
import {
  GL_EVENT_RETRAIT,
  GL_EVENT_COMMISSION,
  type RetraitCartePointageParams,
  type RetraitCartePointageResult,
} from "./types";
import { getCartePointage, lockCarteActive } from "./cartes";

const logger = createLogger("Storage:CartesPointage");

/**
 * Exécute le retrait et clôture la carte.
 *
 * Répartition contractuelle (voir `calculerRetraitCartePointage`) :
 * - le client reçoit `A = M×N − M` (espèces via la caisse, ou Mobile Money) ;
 * - la retenue `M` est comptabilisée en commission (produit 708300) au titre
 *   des frais de gestion, rattachée à la session de caisse de l'agent validateur.
 *
 * Le tout est atomique : mouvement de retrait (via `executeWithLedger`) et
 * mouvement de commission (créé et posté au GL dans la même transaction).
 * Refus si N < MIN_VERSEMENTS_POUR_RETRAIT.
 */
export async function createRetraitCartePointage(
  params: RetraitCartePointageParams,
): Promise<RetraitCartePointageResult> {
  const isCash = params.paymentMethod === "CASH";
  if (isCash && !params.sessionCaisseId) {
    throw new Error("Une session de caisse active est requise pour un retrait en espèces");
  }

  const carteInfo = await getCartePointage(params.cardId);
  if (!carteInfo) throw new Error("Carte de pointage introuvable");
  if (!peutRetirer(carteInfo.completedSlots)) {
    throw new Error(
      `Retrait refusé : au moins ${MIN_VERSEMENTS_POUR_RETRAIT} versements sont requis ` +
      `(actuellement ${carteInfo.completedSlots})`,
    );
  }

  const repartition = calculerRetraitCartePointage(carteInfo.unitAmount, carteInfo.completedSlots);

  // Pré-validation de la règle comptable de commission AVANT la transaction,
  // symétrique à celle qu'executeWithLedger applique au mouvement principal.
  if (isGLStrictMode()) {
    await validateAccountingRule(GL_EVENT_COMMISSION, carteInfo.agenceId);
  }

  const { result } = await executeWithLedger(
    "EPARGNE",
    {
      montant: repartition.montantClient,
      sens: "DEBIT",
      clientId: carteInfo.clientId,
      agenceId: carteInfo.agenceId,
      sessionCaisseId: isCash ? params.sessionCaisseId : undefined,
      typePaiement: GL_EVENT_RETRAIT,
      methodePaiement: params.paymentMethod,
      referenceExterne: carteInfo.reference,
      idempotencyKey: params.idempotencyKey,
      metadata: {
        cardId: carteInfo.id,
        cardReference: carteInfo.reference,
        commission: repartition.commission,
      },
    },
    async (tx, mouvement) => {
      // 1. Verrou pessimiste + revalidation sous verrou (concurrence retrait/versement).
      const carte = await lockCarteActive(tx, params.cardId);
      if (!peutRetirer(carte.completedSlots)) {
        throw new Error(
          `Retrait refusé : au moins ${MIN_VERSEMENTS_POUR_RETRAIT} versements sont requis`,
        );
      }
      // Recalcul sous verrou : le N verrouillé fait foi, pas la lecture initiale.
      const montants = calculerRetraitCartePointage(carte.unitAmount, carte.completedSlots);

      // 2. Mouvement de commission (retenue M), créé dans la MÊME transaction.
      const mouvementCommission: MouvementFinancier = await createMouvementFinancier(
        tx,
        {
          montant: montants.commission,
          sens: "CREDIT",
          sourceModule: "FRAIS",
          clientId: carte.clientId,
          agenceId: carte.agenceId,
          sessionCaisseId: isCash ? params.sessionCaisseId : undefined,
          typePaiement: GL_EVENT_COMMISSION,
          methodePaiement: params.paymentMethod,
          referenceExterne: carte.reference,
          idempotencyKey: `${params.idempotencyKey}:commission`,
          metadata: { cardId: carte.id, cardReference: carte.reference },
        },
        params.userId,
      );
      await createMouvementEvents(tx, mouvementCommission);
      await postGlForMouvement(tx, mouvementCommission, carte.agenceId, params.userId, {
        eventType: GL_EVENT_COMMISSION,
        cardReference: carte.reference,
      });

      // 3. Journal immuable du retrait.
      const [transaction] = await tx
        .insert(transactionsPointage)
        .values({
          cardId: carte.id,
          type: "WITHDRAWAL",
          amount: montants.montantClient,
          commissionAmount: montants.commission,
          slotNumber: null,
          paymentMethod: params.paymentMethod,
          sessionCaisseId: isCash ? params.sessionCaisseId : null,
          mouvementFinancierId: mouvement.id,
          idempotencyKey: params.idempotencyKey,
          createdBy: params.userId,
        })
        .returning();

      // 4. Clôture de la carte (archivage, plus aucune opération possible).
      await tx
        .update(cartesPointage)
        .set({
          status: "WITHDRAWN",
          withdrawnAt: new Date(),
          updatedAt: new Date(),
          version: sql`${cartesPointage.version} + 1`,
        })
        .where(eq(cartesPointage.id, carte.id));

      // 5. Espèces : sortie de caisse du montant restitué au client.
      //    La commission M reste physiquement dans la caisse : elle est
      //    reclassée comptablement en produit (4193 → 708300), sans mouvement d'espèces.
      let nouveauSoldeSession: string | undefined;
      if (isCash && params.sessionCaisseId) {
        nouveauSoldeSession = await updateSessionSolde(
          tx,
          params.sessionCaisseId,
          -Number(montants.montantClient),
        );
        const validatedUserId = await validateUserId(tx, params.userId);
        await tx.insert(operationsCaisse).values({
          sessionId: params.sessionCaisseId,
          mouvementId: mouvement.id,
          typeOperation: "MISC_DISBURSEMENT",
          montant: montants.montantClient,
          methodePaiement: "CASH",
          reference: `CDP-OUT-${carte.reference}`,
          description: `Retrait carte de pointage ${carte.reference} (${carte.completedSlots} versements, commission ${montants.commission})`,
          createdBy: validatedUserId,
        });
      }

      logger.info(
        {
          cardId: carte.id,
          reference: carte.reference,
          versements: carte.completedSlots,
          montantClient: montants.montantClient,
          commission: montants.commission,
        },
        "Retrait carte de pointage exécuté",
      );

      return {
        result: {
          transaction,
          montantClient: montants.montantClient,
          commission: montants.commission,
          totalCollecte: montants.totalCollecte,
        },
        additionalEventData: { nouveauSoldeSession },
      };
    },
    params.userId,
  );

  return result;
}
