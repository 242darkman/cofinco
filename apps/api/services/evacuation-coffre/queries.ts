import { db } from "../../db";
import { eq, and, desc, asc, gte, lte, ilike, count, sql } from "drizzle-orm";
import {
  coffresForts,
  evacuationsCoffre,
  evacuationsCoffreAuditLogs,
} from "@shared/schema";
import type { ServiceResult } from "./types";

export interface ListParams {
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

export async function listEvacuations(params: ListParams): Promise<ServiceResult> {
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

export async function getEvacuationDetails(evacuationId: string): Promise<ServiceResult> {
  const [evacuation] = await db
    .select()
    .from(evacuationsCoffre)
    .where(eq(evacuationsCoffre.id, evacuationId));

  if (!evacuation) {
    return { success: false, errorCode: "EVC_050", error: "Évacuation introuvable" };
  }

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

export async function getAuditLogs(evacuationId: string): Promise<ServiceResult> {
  const logs = await db
    .select()
    .from(evacuationsCoffreAuditLogs)
    .where(eq(evacuationsCoffreAuditLogs.evacuationId, evacuationId))
    .orderBy(desc(evacuationsCoffreAuditLogs.timestamp));

  return { success: true, data: logs };
}

export async function getStatistics(agenceId?: string): Promise<ServiceResult> {
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
