import { db } from "../../db";
import { eq } from "drizzle-orm";
import { evacuationsCoffre, evacuationsCoffreAuditLogs } from "@shared/schema";
import { EvacuationCoffreValidator, type UserContext } from "./business-rules";
import { StatutEvacuationCoffre } from "@shared/enum/status-constants";
import { createLogger } from "../../lib/logger";
import { currencyCode } from "@shared/config/currency";
import type { ServiceResult } from "./types";
import { randomBytes } from "crypto";

const logger = createLogger("EvacuationCoffre:Creation");
const validator = new EvacuationCoffreValidator();

function generateReference(): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
  const random = randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
  return `EVC-${dateStr}-${random}`;
}

export async function createEvacuation(data: {
  coffreSourceId: string;
  agenceId: string;
  typeDestination: string;
  banqueNom?: string;
  banqueCompte?: string;
  banqueNumeroComptable?: string;
  coffreDestinationId?: string;
  transporteurNom?: string;
  transporteurContact?: string;
  transporteurReference?: string;
  montant: number;
  devise?: string;
  motifEvacuation: string;
  motifDetail: string;
  userId: string;
  userRole: string;
  idempotencyKey?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<ServiceResult> {
  try {
    if (data.idempotencyKey) {
      const [existing] = await db
        .select()
        .from(evacuationsCoffre)
        .where(eq(evacuationsCoffre.idempotencyKey, data.idempotencyKey));
      if (existing) {
        return { success: true, evacuation: existing, data: { alreadyExists: true } };
      }
    }

    const user: UserContext = { id: data.userId, role: data.userRole, agenceId: data.agenceId };

    const canCreateResult = await validator.canCreate(user, data.agenceId);
    if (!canCreateResult.valid) {
      return { success: false, errorCode: canCreateResult.errorCode, error: canCreateResult.error };
    }

    const validationResult = await validator.validateCreation({
      coffreSourceId: data.coffreSourceId,
      typeDestination: data.typeDestination,
      coffreDestinationId: data.coffreDestinationId,
      banqueNom: data.banqueNom,
      banqueCompte: data.banqueCompte,
      transporteurNom: data.transporteurNom,
      montant: data.montant,
      devise: data.devise || currencyCode(),
      motifDetail: data.motifDetail,
    }, data.agenceId);

    if (!validationResult.valid) {
      return { success: false, errorCode: validationResult.errorCode, error: validationResult.error };
    }

    const reference = generateReference();
    const now = new Date();

    const [evacuation] = await db
      .insert(evacuationsCoffre)
      .values({
        reference,
        dateEvacuation: now.toISOString().split("T")[0],
        coffreSourceId: data.coffreSourceId,
        agenceId: data.agenceId,
        typeDestination: data.typeDestination as any,
        banqueNom: data.banqueNom,
        banqueCompte: data.banqueCompte,
        banqueNumeroComptable: data.banqueNumeroComptable,
        coffreDestinationId: data.coffreDestinationId,
        transporteurNom: data.transporteurNom,
        transporteurContact: data.transporteurContact,
        transporteurReference: data.transporteurReference,
        montant: data.montant.toString(),
        devise: data.devise || currencyCode(),
        motifEvacuation: data.motifEvacuation as any,
        motifDetail: data.motifDetail,
        statut: StatutEvacuationCoffre.DRAFT,
        createdBy: data.userId,
        idempotencyKey: data.idempotencyKey,
      })
      .returning();

    await db.insert(evacuationsCoffreAuditLogs).values({
      evacuationId: evacuation.id,
      action: "CREATED",
      statutAvant: null,
      statutApres: StatutEvacuationCoffre.DRAFT,
      details: {
        montant: data.montant,
        typeDestination: data.typeDestination,
        motifEvacuation: data.motifEvacuation,
      },
      userId: data.userId,
      userRole: data.userRole,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
    });

    return { success: true, evacuation };
  } catch (error: any) {
    logger.error({ error }, "Erreur création évacuation");
    return { success: false, error: error.message };
  }
}
