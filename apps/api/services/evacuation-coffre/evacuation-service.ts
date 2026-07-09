import { db } from "../../db";
import { eq, and, desc, asc, gte, lte, ilike, count, sql, isNull } from "drizzle-orm";
import {
  coffresForts,
  evacuationsCoffre,
  evacuationsCoffreAuditLogs,
  configEvacuationCoffre,
  agences,
  users,
} from "@shared/schema";
import { EvacuationCoffreValidator, type UserContext } from "./business-rules";
import { executeDispatch, executeDeposit } from "./evacuation-executor";
import { isValidTransition, isCancellable } from "./state-machine";
import { StatutEvacuationCoffre } from "@shared/enum/status-constants";
import { createLogger } from "../../lib/logger";
import { currencyCode } from "@shared/config/currency";

const logger = createLogger("EvacuationCoffreService");

interface ServiceResult<T = any> {
  success: boolean;
  errorCode?: string;
  error?: string;
  evacuation?: T;
  data?: any;
}

interface ListParams {
  page?: number;
  limit?: number;
  statut?: string;
  coffreSourceId?: string;
  typeDestination?: string;
  agenceId?: string;
  dateDebut?: string;
  dateFin?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export class EvacuationCoffreService {
  private validator = new EvacuationCoffreValidator();

  private generateReference(): string {
    const { randomBytes } = require("crypto");
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
    const random = randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
    return `EVC-${dateStr}-${random}`;
  }

  // ======================================================================
  // CRUD
  // ======================================================================

  async createEvacuation(data: {
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
      // Idempotence
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

      // Vérifier permission de création
      const canCreateResult = await this.validator.canCreate(user, data.agenceId);
      if (!canCreateResult.valid) {
        return { success: false, errorCode: canCreateResult.errorCode, error: canCreateResult.error };
      }

      // Valider les données
      const validationResult = await this.validator.validateCreation({
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

      const reference = this.generateReference();
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

      // Audit
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

  // ======================================================================
  // WORKFLOW TRANSITIONS
  // ======================================================================

  async submitEvacuation(params: {
    evacuationId: string;
    userId: string;
    userRole: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<ServiceResult> {
    return this.simpleTransition({
      ...params,
      expectedStatut: StatutEvacuationCoffre.DRAFT,
      newStatut: StatutEvacuationCoffre.SUBMITTED,
      auditAction: "SUBMITTED",
      updateFields: { submittedBy: params.userId, submittedAt: new Date() },
    });
  }

  async approveEvacuation(params: {
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
    const canApprove = await this.validator.canApprove(user, evacuation, evacuation.agenceId);
    if (!canApprove.valid) {
      return { success: false, errorCode: canApprove.errorCode, error: canApprove.error };
    }

    return this.simpleTransition({
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

  async rejectEvacuation(params: {
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

    return this.simpleTransition({
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

  async prepareEvacuation(params: {
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
    const canPrepare = await this.validator.canPrepare(user, evacuation, evacuation.agenceId);
    if (!canPrepare.valid) {
      return { success: false, errorCode: canPrepare.errorCode, error: canPrepare.error };
    }

    const montantOriginal = parseFloat(evacuation.montant || "0");
    const montantCompte = params.montantCompte ?? montantOriginal;
    const ecartPreparation = montantCompte - montantOriginal;

    return this.simpleTransition({
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

  async dispatchEvacuation(params: {
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
    const canDispatch = await this.validator.canDispatch(user, evacuation, evacuation.agenceId);
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

  async depositEvacuation(params: {
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

  async reconcileEvacuation(params: {
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

  async cancelEvacuation(params: {
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
    const canCancel = await this.validator.canCancel(user, evacuation);
    if (!canCancel.valid) {
      return { success: false, errorCode: canCancel.errorCode, error: canCancel.error };
    }

    return this.simpleTransition({
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

  // ======================================================================
  // QUERIES
  // ======================================================================

  async listEvacuations(params: ListParams) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const offset = (page - 1) * limit;

    let conditions: any[] = [];

    if (params.statut) {
      conditions.push(eq(evacuationsCoffre.statut, params.statut as any));
    }
    if (params.coffreSourceId) {
      conditions.push(eq(evacuationsCoffre.coffreSourceId, params.coffreSourceId));
    }
    if (params.typeDestination) {
      conditions.push(eq(evacuationsCoffre.typeDestination, params.typeDestination as any));
    }
    if (params.agenceId) {
      conditions.push(eq(evacuationsCoffre.agenceId, params.agenceId));
    }
    if (params.dateDebut) {
      conditions.push(gte(evacuationsCoffre.dateEvacuation, params.dateDebut));
    }
    if (params.dateFin) {
      conditions.push(lte(evacuationsCoffre.dateEvacuation, params.dateFin));
    }
    if (params.search) {
      conditions.push(ilike(evacuationsCoffre.reference, `%${params.search}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const sortColumn =
      params.sortBy === "montant" ? evacuationsCoffre.montant :
      params.sortBy === "reference" ? evacuationsCoffre.reference :
      params.sortBy === "dateEvacuation" ? evacuationsCoffre.dateEvacuation :
      evacuationsCoffre.createdAt;
    const sortDirection = params.sortOrder === "asc" ? asc : desc;

    const [evacuations, [{ total }]] = await Promise.all([
      db
        .select({
          evacuation: evacuationsCoffre,
          coffreSource: {
            id: coffresForts.id,
            nom: coffresForts.nom,
            code: coffresForts.code,
          },
        })
        .from(evacuationsCoffre)
        .leftJoin(coffresForts, eq(evacuationsCoffre.coffreSourceId, coffresForts.id))
        .where(whereClause)
        .orderBy(sortDirection(sortColumn))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(evacuationsCoffre)
        .where(whereClause),
    ]);

    return {
      success: true,
      data: evacuations,
      pagination: {
        page,
        limit,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / limit),
      },
    };
  }

  async getEvacuationDetails(evacuationId: string) {
    const [evacuation] = await db
      .select()
      .from(evacuationsCoffre)
      .where(eq(evacuationsCoffre.id, evacuationId));

    if (!evacuation) {
      return { success: false, errorCode: "EVC_050", error: "Évacuation introuvable" };
    }

    // Enrichir avec les infos de coffre et utilisateurs
    const [coffreSource] = await db
      .select()
      .from(coffresForts)
      .where(eq(coffresForts.id, evacuation.coffreSourceId));

    let coffreDest = null;
    if (evacuation.coffreDestinationId) {
      [coffreDest] = await db
        .select()
        .from(coffresForts)
        .where(eq(coffresForts.id, evacuation.coffreDestinationId));
    }

    const auditLogs = await db
      .select()
      .from(evacuationsCoffreAuditLogs)
      .where(eq(evacuationsCoffreAuditLogs.evacuationId, evacuationId))
      .orderBy(asc(evacuationsCoffreAuditLogs.timestamp));

    return {
      success: true,
      data: {
        ...evacuation,
        coffreSource,
        coffreDestination: coffreDest,
        auditLogs,
      },
    };
  }

  async getAuditLogs(evacuationId: string) {
    const logs = await db
      .select()
      .from(evacuationsCoffreAuditLogs)
      .where(eq(evacuationsCoffreAuditLogs.evacuationId, evacuationId))
      .orderBy(desc(evacuationsCoffreAuditLogs.timestamp));

    return { success: true, data: logs };
  }

  async getStatistics(agenceId?: string) {
    const agenceFilter = agenceId ? eq(evacuationsCoffre.agenceId, agenceId) : undefined;
    const sumMontant = sql<string>`coalesce(sum(${evacuationsCoffre.montant}), 0)`;

    const statuses = ["DRAFT", "SUBMITTED", "IN_TRANSIT", "DEPOSITED", "RECONCILED", "DISCREPANCY"] as const;

    const [globalRow, ...statusRows] = await Promise.all([
      db.select({ total: count(), montant: sumMontant }).from(evacuationsCoffre).where(agenceFilter),
      ...statuses.map(s =>
        db.select({ total: count(), montant: sumMontant })
          .from(evacuationsCoffre)
          .where(and(eq(evacuationsCoffre.statut, s as any), agenceFilter))
      ),
    ]);

    const byStatus: Record<string, { count: number; montant: string }> = {};
    statuses.forEach((s, i) => {
      byStatus[s] = {
        count: Number(statusRows[i][0].total),
        montant: statusRows[i][0].montant,
      };
    });

    return {
      success: true,
      data: {
        total: Number(globalRow[0].total),
        totalMontant: globalRow[0].montant,
        byStatus,
      },
    };
  }

  // ======================================================================
  // CONFIG
  // ======================================================================

  async getConfig(agenceId?: string) {
    const config = await this.validator.getConfig(agenceId);
    return { success: true, data: config };
  }

  async updateConfig(agenceId: string, data: Partial<typeof configEvacuationCoffre.$inferSelect>) {
    const [existing] = await db
      .select()
      .from(configEvacuationCoffre)
      .where(eq(configEvacuationCoffre.agenceId, agenceId));

    if (existing) {
      const [updated] = await db
        .update(configEvacuationCoffre)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(configEvacuationCoffre.id, existing.id))
        .returning();
      return { success: true, data: updated };
    }

    const [created] = await db
      .insert(configEvacuationCoffre)
      .values({ ...data as any, agenceId })
      .returning();
    return { success: true, data: created };
  }

  // ======================================================================
  // HELPER: Transition simple (sans comptabilité)
  // ======================================================================

  private async simpleTransition(params: {
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
            eq(evacuationsCoffre.statut, params.expectedStatut as any),
          ),
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
}
