import { db } from "../../db";
import { eq, and } from "drizzle-orm";
import { evacuationsCoffre, evacuationsCoffreAuditLogs } from "@shared/schema";
import { EvacuationCoffreValidator, type UserContext } from "./business-rules";
import { executeDispatch } from "./execute-dispatch";
import { executeDeposit } from "./execute-deposit";
import { isValidTransition } from "./state-machine";
import { StatutEvacuationCoffre } from "@shared/enum/status-constants";
import { createLogger } from "../../lib/logger";
import type { ServiceResult } from "./types";

const logger = createLogger("EvacuationCoffre:Workflow");
const validator = new EvacuationCoffreValidator();

async function simpleTransition(params: {
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

export async function submitEvacuation(params: {
  evacuationId: string;
  userId: string;
  userRole: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<ServiceResult> {
  return simpleTransition({
    ...params,
    expectedStatut: StatutEvacuationCoffre.DRAFT,
    newStatut: StatutEvacuationCoffre.SUBMITTED,
    auditAction: "SUBMITTED",
    updateFields: { submittedBy: params.userId, submittedAt: new Date() },
  });
}

export async function approveEvacuation(params: {
  evacuationId: string;
  userId: string;
  userRole: string;
  commentaire?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<ServiceResult> {
  const [evacuation] = await db
    .select()
    .from(evacuationsCoffre)
    .where(eq(evacuationsCoffre.id, params.evacuationId));

  if (!evacuation) {
    return { success: false, errorCode: "EVC_050", error: "Évacuation introuvable" };
  }

  const user: UserContext = { id: params.userId, role: params.userRole };
  const canApprove = await validator.canApprove(user, evacuation, evacuation.agenceId);
  if (!canApprove.valid) {
    return { success: false, errorCode: canApprove.errorCode, error: canApprove.error };
  }

  return simpleTransition({
    ...params,
    expectedStatut: StatutEvacuationCoffre.SUBMITTED,
    newStatut: StatutEvacuationCoffre.APPROVED,
    auditAction: "APPROVED",
    updateFields: {
      approvedBy: params.userId,
      approvedAt: new Date(),
      commentaireApprobation: params.commentaire,
    },
  });
}

export async function rejectEvacuation(params: {
  evacuationId: string;
  userId: string;
  userRole: string;
  reason: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<ServiceResult> {
  const [evacuation] = await db
    .select()
    .from(evacuationsCoffre)
    .where(eq(evacuationsCoffre.id, params.evacuationId));

  if (!evacuation) {
    return { success: false, errorCode: "EVC_050", error: "Évacuation introuvable" };
  }

  if (!isValidTransition(evacuation.statut, StatutEvacuationCoffre.REJECTED)) {
    return { success: false, errorCode: "EVC_020", error: `Impossible de rejeter depuis le statut "${evacuation.statut}"` };
  }

  return simpleTransition({
    ...params,
    expectedStatut: evacuation.statut,
    newStatut: StatutEvacuationCoffre.REJECTED,
    auditAction: "REJECTED",
    updateFields: {
      rejectedBy: params.userId,
      rejectedAt: new Date(),
      rejectionReason: params.reason,
    },
  });
}

export async function prepareEvacuation(params: {
  evacuationId: string;
  userId: string;
  userRole: string;
  typeConditionnement?: string;
  numeroScelle?: string;
  billetage?: Record<string, number>;
  montantCompte?: number;
  commentairePreparation?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<ServiceResult> {
  const [evacuation] = await db
    .select()
    .from(evacuationsCoffre)
    .where(eq(evacuationsCoffre.id, params.evacuationId));

  if (!evacuation) {
    return { success: false, errorCode: "EVC_050", error: "Évacuation introuvable" };
  }

  const user: UserContext = { id: params.userId, role: params.userRole };
  const canPrepare = await validator.canPrepare(user, evacuation, evacuation.agenceId);
  if (!canPrepare.valid) {
    return { success: false, errorCode: canPrepare.errorCode, error: canPrepare.error };
  }

  const montantOriginal = parseFloat(evacuation.montant || "0");
  const montantCompte = params.montantCompte ?? montantOriginal;
  const ecartPreparation = montantCompte - montantOriginal;

  return simpleTransition({
    ...params,
    expectedStatut: StatutEvacuationCoffre.APPROVED,
    newStatut: StatutEvacuationCoffre.PREPARED,
    auditAction: "PREPARED",
    updateFields: {
      preparedBy: params.userId,
      preparedAt: new Date(),
      typeConditionnement: params.typeConditionnement as any,
      numeroScelle: params.numeroScelle,
      billetage: params.billetage,
      montantCompte: montantCompte.toString(),
      ecartPreparation: ecartPreparation.toString(),
      commentairePreparation: params.commentairePreparation,
    },
  });
}

export async function dispatchEvacuation(params: {
  evacuationId: string;
  userId: string;
  userRole: string;
  agentsTransport?: Array<{ userId?: string; nom: string; contact: string; fonction?: string }>;
  heureDepart?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<ServiceResult> {
  const [evacuation] = await db
    .select()
    .from(evacuationsCoffre)
    .where(eq(evacuationsCoffre.id, params.evacuationId));

  if (!evacuation) {
    return { success: false, errorCode: "EVC_050", error: "Évacuation introuvable" };
  }

  const user: UserContext = { id: params.userId, role: params.userRole };
  const canDispatch = await validator.canDispatch(user, evacuation, evacuation.agenceId);
  if (!canDispatch.valid) {
    return { success: false, errorCode: canDispatch.errorCode, error: canDispatch.error };
  }

  const result = await executeDispatch(
    params.evacuationId,
    params.userId,
    params.userRole,
    { agentsTransport: params.agentsTransport, heureDepart: params.heureDepart },
    params.ipAddress,
    params.userAgent,
  );

  if (!result.success) {
    return result;
  }

  const [updated] = await db
    .select()
    .from(evacuationsCoffre)
    .where(eq(evacuationsCoffre.id, params.evacuationId));

  return { success: true, evacuation: updated };
}

export async function depositEvacuation(params: {
  evacuationId: string;
  userId: string;
  userRole: string;
  montantDepose: number;
  referenceBordereau?: string;
  referenceRecuTransporteur?: string;
  heureDepot?: string;
  commentaireDepot?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<ServiceResult> {
  const result = await executeDeposit(
    params.evacuationId,
    params.userId,
    params.userRole,
    {
      montantDepose: params.montantDepose,
      referenceBordereau: params.referenceBordereau,
      referenceRecuTransporteur: params.referenceRecuTransporteur,
      heureDepot: params.heureDepot,
      commentaireDepot: params.commentaireDepot,
    },
    params.ipAddress,
    params.userAgent,
  );

  if (!result.success) return result;

  const [updated] = await db
    .select()
    .from(evacuationsCoffre)
    .where(eq(evacuationsCoffre.id, params.evacuationId));

  return { success: true, evacuation: updated };
}

export async function reconcileEvacuation(params: {
  evacuationId: string;
  userId: string;
  userRole: string;
  montantConfirme: number;
  conforme: boolean;
  motifEcart?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<ServiceResult> {
  const [evacuation] = await db
    .select()
    .from(evacuationsCoffre)
    .where(eq(evacuationsCoffre.id, params.evacuationId));

  if (!evacuation) {
    return { success: false, errorCode: "EVC_050", error: "Évacuation introuvable" };
  }

  if (evacuation.statut !== StatutEvacuationCoffre.DEPOSITED) {
    return { success: false, errorCode: "EVC_020", error: `Impossible de rapprocher depuis statut "${evacuation.statut}"` };
  }

  const montantOriginal = parseFloat(evacuation.montantCompte || evacuation.montant || "0");
  const ecartMontant = params.montantConfirme - montantOriginal;
  const newStatut = params.conforme
    ? StatutEvacuationCoffre.RECONCILED
    : StatutEvacuationCoffre.DISCREPANCY;

  const now = new Date();
  await db
    .update(evacuationsCoffre)
    .set({
      statut: newStatut,
      reconciledBy: params.userId,
      reconciledAt: now,
      montantConfirme: params.montantConfirme.toString(),
      ecartMontant: ecartMontant.toString(),
      conforme: params.conforme,
      motifEcart: params.motifEcart,
      updatedAt: now,
    })
    .where(eq(evacuationsCoffre.id, params.evacuationId));

  await db.insert(evacuationsCoffreAuditLogs).values({
    evacuationId: params.evacuationId,
    action: params.conforme ? "RECONCILED" : "DISCREPANCY_FLAGGED",
    statutAvant: StatutEvacuationCoffre.DEPOSITED,
    statutApres: newStatut,
    details: {
      montantConfirme: params.montantConfirme,
      montantOriginal,
      ecartMontant,
      conforme: params.conforme,
      motifEcart: params.motifEcart,
    },
    userId: params.userId,
    userRole: params.userRole,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  const [updated] = await db
    .select()
    .from(evacuationsCoffre)
    .where(eq(evacuationsCoffre.id, params.evacuationId));

  return { success: true, evacuation: updated };
}

export async function cancelEvacuation(params: {
  evacuationId: string;
  userId: string;
  userRole: string;
  reason: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<ServiceResult> {
  const [evacuation] = await db
    .select()
    .from(evacuationsCoffre)
    .where(eq(evacuationsCoffre.id, params.evacuationId));

  if (!evacuation) {
    return { success: false, errorCode: "EVC_050", error: "Évacuation introuvable" };
  }

  const user: UserContext = { id: params.userId, role: params.userRole };
  const canCancel = await validator.canCancel(user, evacuation);
  if (!canCancel.valid) {
    return { success: false, errorCode: canCancel.errorCode, error: canCancel.error };
  }

  return simpleTransition({
    ...params,
    expectedStatut: evacuation.statut,
    newStatut: StatutEvacuationCoffre.CANCELLED,
    auditAction: "CANCELLED",
    updateFields: {
      cancelledBy: params.userId,
      cancelledAt: new Date(),
      cancellationReason: params.reason,
    },
  });
}
