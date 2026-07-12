import { db } from "../../db";
import { eq } from "drizzle-orm";
import {
  coffresForts,
  transfertsInterCoffres,
  transfertsInterCoffresAuditLogs,
  documentsTransfert,
} from "@shared/schema";
import { TransfertInterCoffresValidator, type UserContext, type ValidationResult } from "./business-rules";
import { currencyCode } from "@shared/config/currency";
import type { ServiceResult } from "./types";
import { randomBytes } from "crypto";

const validator = new TransfertInterCoffresValidator();

export function generateTransfertReference(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
  return `TIC-${dateStr}-${random}`;
}

export function generateDocumentNumber(type: "BON_TRANSFERT" | "BON_SORTIE" | "BON_ENTREE"): string {
  const prefixes = {
    BON_TRANSFERT: "BT",
    BON_SORTIE: "BS",
    BON_ENTREE: "BE",
  };
  const year = new Date().getFullYear();
  const random = randomBytes(3).toString('hex').slice(0, 5).toUpperCase();
  return `${prefixes[type]}-${year}-${random}`;
}

export async function determineTransferType(
  coffreSourceId: string,
  coffreDestinationId: string
): Promise<"AGENCE_VERS_SIEGE" | "AGENCE_VERS_AGENCE" | "SIEGE_VERS_AGENCE"> {
  const [source] = await db.select().from(coffresForts).where(eq(coffresForts.id, coffreSourceId));
  const [dest] = await db.select().from(coffresForts).where(eq(coffresForts.id, coffreDestinationId));

  if (source.ownerType === "AGENCE" && dest.ownerType === "SIEGE") {
    return "AGENCE_VERS_SIEGE";
  } else if (source.ownerType === "SIEGE" && dest.ownerType === "AGENCE") {
    return "SIEGE_VERS_AGENCE";
  } else {
    return "AGENCE_VERS_AGENCE";
  }
}

export async function createTransfert(params: {
  coffreSourceId: string;
  coffreDestinationId: string;
  montant: number;
  devise?: string;
  motif: string;
  typeConditionnement: string;
  numeroScelle?: string;
  agentsTransport: Array<{ userId?: string; nom: string; contact: string }>;
  heureDepart?: string;
  dateTransfert?: string;
  userId: string;
  userRole: string;
  idempotencyKey?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<ServiceResult> {
  const {
    coffreSourceId,
    coffreDestinationId,
    montant,
    devise = currencyCode(),
    motif,
    typeConditionnement,
    numeroScelle,
    agentsTransport,
    heureDepart,
    dateTransfert,
    userId,
    userRole,
    idempotencyKey,
    ipAddress,
    userAgent,
  } = params;

  if (idempotencyKey) {
    const [existing] = await db
      .select()
      .from(transfertsInterCoffres)
      .where(eq(transfertsInterCoffres.idempotencyKey, idempotencyKey));

    if (existing) {
      return { success: true, transfert: existing, alreadyExists: true };
    }
  }

  const [coffreSource] = await db
    .select()
    .from(coffresForts)
    .where(eq(coffresForts.id, coffreSourceId));

  const agenceId = coffreSource?.ownerId;
  const user: UserContext = { id: userId, role: userRole, agenceId: agenceId || undefined };
  
  const canCreateResult = await validator.canCreate(user, agenceId || undefined);
  if (!canCreateResult.valid) {
    return { success: false, errorCode: canCreateResult.errorCode, error: canCreateResult.error };
  }

  const validationResult = await validator.validateCreation({
    coffreSourceId,
    coffreDestinationId,
    montant,
    devise,
    typeConditionnement,
    numeroScelle,
    motif,
    agentsTransport,
  }, agenceId || undefined);

  if (!validationResult.valid) {
    return { success: false, errorCode: validationResult.errorCode, error: validationResult.error };
  }

  const typeTransfert = await determineTransferType(coffreSourceId, coffreDestinationId);
  const reference = generateTransfertReference();

  const [transfert] = await db
    .insert(transfertsInterCoffres)
    .values({
      reference,
      dateTransfert: dateTransfert || new Date().toISOString().split("T")[0],
      heureDepart,
      coffreSourceId,
      coffreDestinationId,
      montant: montant.toString(),
      devise,
      typeTransfert,
      typeConditionnement: typeConditionnement as any,
      numeroScelle,
      motif,
      statut: "DRAFT",
      createdBy: userId,
      agentsTransport,
      idempotencyKey,
    })
    .returning();

  await db.insert(transfertsInterCoffresAuditLogs).values({
    transfertId: transfert.id,
    action: "CREATED",
    statutAvant: null,
    statutApres: "DRAFT",
    details: {
      coffreSourceId,
      coffreDestinationId,
      montant,
      typeTransfert,
      agentsTransport,
    },
    userId,
    userRole,
    ipAddress,
    userAgent,
  });

  return { success: true, transfert };
}

export async function submitTransfert(params: {
  transfertId: string;
  userId: string;
  userRole: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<ServiceResult> {
  const { transfertId, userId, userRole, ipAddress, userAgent } = params;

  const [transfert] = await db
    .select()
    .from(transfertsInterCoffres)
    .where(eq(transfertsInterCoffres.id, transfertId));

  if (!transfert) {
    return { success: false, errorCode: "TIC_050", error: "Transfert introuvable" };
  }

  if (transfert.statut !== "DRAFT") {
    return { success: false, errorCode: "TIC_020", error: `Impossible de soumettre un transfert en statut "${transfert.statut}"` };
  }

  const [coffreSource] = await db.select().from(coffresForts).where(eq(coffresForts.id, transfert.coffreSourceId));
  const validationResult = await validator.validateCreation({
    coffreSourceId: transfert.coffreSourceId,
    coffreDestinationId: transfert.coffreDestinationId,
    montant: parseFloat(transfert.montant?.toString() || "0"),
    devise: transfert.devise,
    typeConditionnement: transfert.typeConditionnement,
    numeroScelle: transfert.numeroScelle || undefined,
    motif: transfert.motif,
    agentsTransport: transfert.agentsTransport as any,
  }, coffreSource?.ownerId || undefined);

  if (!validationResult.valid) {
    return { success: false, errorCode: validationResult.errorCode, error: validationResult.error };
  }

  const now = new Date();
  const [updated] = await db
    .update(transfertsInterCoffres)
    .set({
      statut: "SUBMITTED",
      submittedBy: userId,
      submittedAt: now,
      updatedAt: now,
    })
    .where(eq(transfertsInterCoffres.id, transfertId))
    .returning();

  const documentNumber = generateDocumentNumber("BON_TRANSFERT");
  const [document] = await db
    .insert(documentsTransfert)
    .values({
      transfertId,
      typeDocument: "BON_TRANSFERT",
      numeroDocument: documentNumber,
      generatedBy: userId,
      contenuData: {
        reference: updated.reference,
        dateTransfert: updated.dateTransfert,
        montant: updated.montant,
        devise: updated.devise,
        motif: updated.motif,
        typeConditionnement: updated.typeConditionnement,
        numeroScelle: updated.numeroScelle,
        agentsTransport: updated.agentsTransport,
        coffreSourceId: updated.coffreSourceId,
        coffreDestinationId: updated.coffreDestinationId,
        submittedAt: now.toISOString(),
      },
    })
    .returning();

  await db.insert(transfertsInterCoffresAuditLogs).values({
    transfertId,
    action: "SUBMITTED",
    statutAvant: "DRAFT",
    statutApres: "SUBMITTED",
    details: { documentId: document.id, documentNumber },
    userId,
    userRole,
    ipAddress,
    userAgent,
  });

  return {
    success: true,
    transfert: updated,
    document: { id: document.id, type: "BON_TRANSFERT", numero: documentNumber },
  };
}

export async function approveTransfert(params: {
  transfertId: string;
  level: 1 | 2;
  approved: boolean;
  commentaire?: string;
  rejectionReason?: string;
  userId: string;
  userRole: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<ServiceResult> {
  const { transfertId, level, approved, commentaire, rejectionReason, userId, userRole, ipAddress, userAgent } = params;

  const [transfert] = await db
    .select()
    .from(transfertsInterCoffres)
    .where(eq(transfertsInterCoffres.id, transfertId));

  if (!transfert) {
    return { success: false, errorCode: "TIC_050", error: "Transfert introuvable" };
  }

  const [coffreSource] = await db.select().from(coffresForts).where(eq(coffresForts.id, transfert.coffreSourceId));
  const agenceId = coffreSource?.ownerId;
  const user: UserContext = { id: userId, role: userRole, agenceId: agenceId || undefined };

  let validationResult: ValidationResult;
  let expectedStatus: string;
  let newStatus: string;

  if (level === 1) {
    if (transfert.statut !== "SUBMITTED") {
      return { success: false, errorCode: "TIC_020", error: `Impossible d'approuver niveau 1 un transfert en statut "${transfert.statut}"` };
    }
    validationResult = await validator.canApproveLevel1(user, transfert, agenceId || undefined);
    expectedStatus = "SUBMITTED";
    newStatus = approved ? "APPROVED_L1" : "REJECTED";
  } else {
    if (transfert.statut !== "APPROVED_L1") {
      return { success: false, errorCode: "TIC_020", error: `Impossible d'approuver niveau 2 un transfert en statut "${transfert.statut}"` };
    }
    validationResult = await validator.canApproveLevel2(user, transfert, agenceId || undefined);
    expectedStatus = "APPROVED_L1";
    newStatus = approved ? "APPROVED_L2" : "REJECTED";
  }

  if (!validationResult.valid) {
    return { success: false, errorCode: validationResult.errorCode, error: validationResult.error };
  }

  if (!approved && (!rejectionReason || rejectionReason.trim().length < 10)) {
    return { success: false, errorCode: "TIC_025", error: "Le motif de rejet doit contenir au moins 10 caractères" };
  }

  const now = new Date();
  const updateData: any = {
    statut: newStatus,
    updatedAt: now,
  };

  if (level === 1) {
    updateData.approvedByLevel1 = userId;
    updateData.approvedAtLevel1 = now;
    updateData.commentaireN1 = commentaire;
  } else {
    updateData.approvedByLevel2 = userId;
    updateData.approvedAtLevel2 = now;
    updateData.commentaireN2 = commentaire;
  }

  if (!approved) {
    updateData.rejectionReason = rejectionReason;
    updateData.rejectedBy = userId;
    updateData.rejectedAt = now;
  }

  const [updated] = await db
    .update(transfertsInterCoffres)
    .set(updateData)
    .where(eq(transfertsInterCoffres.id, transfertId))
    .returning();

  const action = approved ? (level === 1 ? "APPROVED_L1" : "APPROVED_L2") : "REJECTED";
  await db.insert(transfertsInterCoffresAuditLogs).values({
    transfertId,
    action,
    statutAvant: expectedStatus,
    statutApres: newStatus,
    details: {
      level,
      approved,
      commentaire,
      rejectionReason: !approved ? rejectionReason : null,
    },
    userId,
    userRole,
    ipAddress,
    userAgent,
  });

  return { success: true, transfert: updated };
}

export async function cancelTransfert(params: {
  transfertId: string;
  reason: string;
  userId: string;
  userRole: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<ServiceResult> {
  const { transfertId, reason, userId, userRole, ipAddress, userAgent } = params;

  const [transfert] = await db
    .select()
    .from(transfertsInterCoffres)
    .where(eq(transfertsInterCoffres.id, transfertId));

  if (!transfert) {
    return { success: false, errorCode: "TIC_050", error: "Transfert introuvable" };
  }

  const user: UserContext = { id: userId, role: userRole };
  const canCancelResult = await validator.canCancel(user, transfert);
  if (!canCancelResult.valid) {
    return { success: false, errorCode: canCancelResult.errorCode, error: canCancelResult.error };
  }

  if (!reason || reason.trim().length < 10) {
    return { success: false, errorCode: "TIC_025", error: "Le motif d'annulation doit contenir au moins 10 caractères" };
  }

  const now = new Date();
  const statutAvant = transfert.statut;

  const [updated] = await db
    .update(transfertsInterCoffres)
    .set({
      statut: "CANCELLED",
      cancellationReason: reason,
      cancelledBy: userId,
      cancelledAt: now,
      updatedAt: now,
    })
    .where(eq(transfertsInterCoffres.id, transfertId))
    .returning();

  await db.insert(transfertsInterCoffresAuditLogs).values({
    transfertId,
    action: "CANCELLED",
    statutAvant,
    statutApres: "CANCELLED",
    details: { reason },
    userId,
    userRole,
    ipAddress,
    userAgent,
  });

  return { success: true, transfert: updated };
}
