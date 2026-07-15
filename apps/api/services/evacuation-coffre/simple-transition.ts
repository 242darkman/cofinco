import { db } from "../../db";
import { eq, and } from "drizzle-orm";
import { evacuationsCoffre, evacuationsCoffreAuditLogs } from "@shared/schema";
import { isValidTransition } from "./state-machine";
import { createLogger } from "../../lib/logger";
import type { ServiceResult } from "./types";

const logger = createLogger("EvacuationCoffre:SimpleTransition");

export async function simpleTransition(params: {
  evacuationId: string;
  userId: string;
  userRole: string;
  expectedStatut: string;
  newStatut: string;
  auditAction: string;
  updateFields: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}): Promise<ServiceResult> {
  try {
    const [evacuation] = await db
      .select()
      .from(evacuationsCoffre)
      .where(eq(evacuationsCoffre.id, params.evacuationId));

    if (!evacuation) {
      return { success: false, errorCode: "EVC_050", error: "Évacuation introuvable" };
    }

    if (evacuation.statut !== params.expectedStatut) {
      return {
        success: false,
        errorCode: "EVC_020",
        error: `Transition non autorisée: statut actuel "${evacuation.statut}", attendu "${params.expectedStatut}"`,
      };
    }

    if (!isValidTransition(evacuation.statut, params.newStatut)) {
      return {
        success: false,
        errorCode: "EVC_020",
        error: `Transition "${evacuation.statut}" -> "${params.newStatut}" non autorisée`,
      };
    }

    const now = new Date();
    const [updated] = await db
      .update(evacuationsCoffre)
      .set({
        statut: params.newStatut as any,
        ...params.updateFields,
        updatedAt: now,
      })
      .where(
        and(
          eq(evacuationsCoffre.id, params.evacuationId),
          eq(evacuationsCoffre.statut, params.expectedStatut as any)
        )
      )
      .returning();

    if (!updated) {
      return { success: false, errorCode: "EVC_020", error: "Statut modifié par un autre processus" };
    }

    await db.insert(evacuationsCoffreAuditLogs).values({
      evacuationId: params.evacuationId,
      action: params.auditAction as any,
      statutAvant: params.expectedStatut,
      statutApres: params.newStatut,
      details: params.updateFields,
      userId: params.userId,
      userRole: params.userRole,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });

    return { success: true, evacuation: updated };
  } catch (error: any) {
    logger.error({ error, evacuationId: params.evacuationId }, `Erreur transition ${params.auditAction}`);
    return { success: false, error: error.message };
  }
}
