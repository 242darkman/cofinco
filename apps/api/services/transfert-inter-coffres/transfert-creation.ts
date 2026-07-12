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


