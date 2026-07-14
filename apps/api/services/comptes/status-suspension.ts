/**
 * Suspension / levée de suspension d'un compte.
 * Extrait de status.ts pour respecter la limite de 400 lignes.
 * Distinct du blocage (blocageActif) qui est un hold financier.
 */
import { comptes, evenementsOutbox } from "@shared/schema";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { StatutCompte as StatutCompteConst } from "@shared/enum/status-constants";
import { CompteError, StatutCompte, VALID_TRANSITIONS, type SuspendCompteData } from "./types";

/**
 * Suspend un compte (change statut à SUSPENDED + métadonnées enrichies)
 */
export async function suspendCompte(
  data: SuspendCompteData,
  userId: string
): Promise<typeof comptes.$inferSelect> {
  return await db.transaction(async (tx) => {
    const [compte] = await tx.select().from(comptes).where(eq(comptes.id, data.compteId));
    if (!compte) {
      throw new CompteError("Compte non trouvé", "COMPTE_NOT_FOUND");
    }

    // Validate state transition
    const allowed = VALID_TRANSITIONS[compte.statut as StatutCompte];
    if (!allowed?.includes(StatutCompteConst.SUSPENDED)) {
      throw new CompteError(
        `Impossible de suspendre un compte en statut ${compte.statut}`,
        "INVALID_STATE_TRANSITION"
      );
    }

    // Idempotency: if already suspended, update reason
    if (compte.statut === StatutCompteConst.SUSPENDED) {
      const [updated] = await tx
        .update(comptes)
        .set({
          suspendedReasonCode: data.reasonCode,
          suspendedReasonText: data.reasonText || null,
          autoLift: data.autoLift || false,
          suspendedEndDate: data.endDate || null,
          suspendedReviewRequired: data.reviewRequired || false,
          updatedAt: new Date(),
        })
        .where(eq(comptes.id, data.compteId))
        .returning();
      return updated;
    }

    const [updated] = await tx
      .update(comptes)
      .set({
        statut: StatutCompteConst.SUSPENDED,
        suspendedAt: new Date(),
        suspendedBy: userId,
        suspendedReasonCode: data.reasonCode,
        suspendedReasonText: data.reasonText || null,
        autoLift: data.autoLift || false,
        suspendedEndDate: data.endDate || null,
        suspendedReviewRequired: data.reviewRequired || false,
        updatedAt: new Date(),
      })
      .where(eq(comptes.id, data.compteId))
      .returning();

    // Outbox event
    await tx.insert(evenementsOutbox).values({
      type: "MOUVEMENT_STATUT_CHANGE",
      aggregateType: "compte",
      aggregateId: data.compteId,
      payload: {
        compteId: data.compteId,
        action: "SUSPENSION",
        reasonCode: data.reasonCode,
        reasonText: data.reasonText,
        autoLift: data.autoLift,
        endDate: data.endDate?.toISOString(),
        suspendedBy: userId,
      },
    });

    // Notify client
    await tx.insert(evenementsOutbox).values({
      type: "SOLDE_COMPTE_CHANGE",
      aggregateType: "client",
      aggregateId: compte.clientId,
      payload: {
        type: "COMPTE_SUSPENDU",
        compteId: data.compteId,
        typeCompte: compte.typeCompte,
        reasonCode: data.reasonCode,
      },
    });

    return updated;
  });
}

/**
 * Lève la suspension d'un compte (SUSPENDED -> ACTIVE)
 * Peut être appelé manuellement ou par le cron auto-lift
 */
export async function unsuspendCompte(
  compteId: string,
  motif?: string,
  userId?: string,
  isAutoLift: boolean = false
): Promise<typeof comptes.$inferSelect> {
  return await db.transaction(async (tx) => {
    const [compte] = await tx.select().from(comptes).where(eq(comptes.id, compteId));
    if (!compte) {
      throw new CompteError("Compte non trouvé", "COMPTE_NOT_FOUND");
    }

    if (compte.statut !== StatutCompteConst.SUSPENDED) {
      throw new CompteError("Le compte n'est pas suspendu", "NOT_SUSPENDED");
    }

    const ancienReasonCode = compte.suspendedReasonCode;

    const [updated] = await tx
      .update(comptes)
      .set({
        statut: StatutCompteConst.ACTIVE,
        suspendedAt: null,
        suspendedBy: null,
        suspendedReasonCode: null,
        suspendedReasonText: null,
        autoLift: false,
        suspendedEndDate: null,
        suspendedReviewRequired: false,
        updatedAt: new Date(),
      })
      .where(eq(comptes.id, compteId))
      .returning();

    // Outbox event
    await tx.insert(evenementsOutbox).values({
      type: "MOUVEMENT_STATUT_CHANGE",
      aggregateType: "compte",
      aggregateId: compteId,
      payload: {
        compteId,
        action: "UNSUSPENSION",
        ancienReasonCode,
        motif: motif || (isAutoLift ? "Levée automatique (date de fin atteinte)" : undefined),
        unsuspendedBy: userId,
        isAutoLift,
      },
    });

    // Notify client
    await tx.insert(evenementsOutbox).values({
      type: "SOLDE_COMPTE_CHANGE",
      aggregateType: "client",
      aggregateId: compte.clientId,
      payload: {
        type: "COMPTE_REACTIVE",
        compteId,
        typeCompte: compte.typeCompte,
        nouveauSolde: compte.soldeCourant,
      },
    });

    return updated;
  });
}
