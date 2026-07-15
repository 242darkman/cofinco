import { db } from "../../db";
import { eq, and, or, desc, asc, gte, lte, ilike, count, sql } from "drizzle-orm";
import {
  coffresForts,
  transfertsInterCoffres,
  transfertsInterCoffresAuditLogs,
  documentsTransfert,
  reconciliationsLiaison,
  tachesRegularisation,
  agences,
  users,
  userRoles,
} from "@shared/schema";
import type { ListParams } from "./types";

/**
 * Récupère les détails d'un transfert
 */
export async function getTransfertDetails(transfertId: string) {
  const [transfert] = await db
    .select()
    .from(transfertsInterCoffres)
    .where(eq(transfertsInterCoffres.id, transfertId));

  if (!transfert) {
    return { success: false, errorCode: "TIC_050", error: "Transfert introuvable" };
  }

  // Récupérer les coffres
  const [coffreSource] = await db.select().from(coffresForts).where(eq(coffresForts.id, transfert.coffreSourceId));
  const [coffreDest] = await db.select().from(coffresForts).where(eq(coffresForts.id, transfert.coffreDestinationId));

  // Récupérer les agences
  let agenceSource = null;
  let agenceDest = null;
  if (coffreSource?.ownerId) {
    [agenceSource] = await db.select().from(agences).where(eq(agences.id, coffreSource.ownerId));
  }
  if (coffreDest?.ownerId) {
    [agenceDest] = await db.select().from(agences).where(eq(agences.id, coffreDest.ownerId));
  }

  // Récupérer les documents
  const documents = await db
    .select()
    .from(documentsTransfert)
    .where(eq(documentsTransfert.transfertId, transfertId))
    .orderBy(asc(documentsTransfert.dateGeneration));

  // Récupérer les logs d'audit
  const auditLogs = await db
    .select()
    .from(transfertsInterCoffresAuditLogs)
    .where(eq(transfertsInterCoffresAuditLogs.transfertId, transfertId))
    .orderBy(asc(transfertsInterCoffresAuditLogs.timestamp));

  // Récupérer la réconciliation
  const [reconciliation] = await db
    .select()
    .from(reconciliationsLiaison)
    .where(eq(reconciliationsLiaison.transfertId, transfertId));

  // Récupérer la tâche de régularisation
  const [tache] = await db
    .select()
    .from(tachesRegularisation)
    .where(eq(tachesRegularisation.transfertId, transfertId));

  // Récupérer les noms des utilisateurs impliqués
  const userIds = [
    transfert.createdBy,
    transfert.submittedBy,
    transfert.approvedByLevel1,
    transfert.approvedByLevel2,
    transfert.dispatchedBy,
    transfert.receivedBy,
    transfert.rejectedBy,
    transfert.cancelledBy,
  ].filter(Boolean) as string[];

  const usersData = userIds.length > 0
    ? await db.select({ id: users.id, nom: users.nom, prenom: users.prenom, role: userRoles.role })
        .from(users)
        .leftJoin(userRoles, and(
          eq(userRoles.userId, users.id),
          eq(userRoles.isPrimary, true)
        ))
        .where(sql`${users.id} IN ${userIds}`)
    : [];

  const usersMap = new Map(usersData.map(u => [u.id, u]));

  return {
    success: true,
    transfert: {
      ...transfert,
      coffreSource: {
        ...coffreSource,
        agence: agenceSource,
      },
      coffreDestination: {
        ...coffreDest,
        agence: agenceDest,
      },
      createdByUser: usersMap.get(transfert.createdBy),
      submittedByUser: transfert.submittedBy ? usersMap.get(transfert.submittedBy) : null,
      approvedByLevel1User: transfert.approvedByLevel1 ? usersMap.get(transfert.approvedByLevel1) : null,
      approvedByLevel2User: transfert.approvedByLevel2 ? usersMap.get(transfert.approvedByLevel2) : null,
      dispatchedByUser: transfert.dispatchedBy ? usersMap.get(transfert.dispatchedBy) : null,
      receivedByUser: transfert.receivedBy ? usersMap.get(transfert.receivedBy) : null,
    },
    documents,
    auditLogs,
    reconciliation,
    tache,
  };
}

/**
 * Liste les transferts avec filtres et pagination
 */
export async function listTransferts(params: ListParams) {
  const {
    page = 1,
    limit = 20,
    statut,
    coffreSourceId,
    coffreDestinationId,
    dateDebut,
    dateFin,
    search,
    sortBy = "dateTransfert",
    sortOrder = "desc",
  } = params;

  const offset = (page - 1) * limit;
  const conditions = [];

  if (statut && statut !== "all") {
    conditions.push(eq(transfertsInterCoffres.statut, statut as any));
  }
  if (coffreSourceId) {
    conditions.push(eq(transfertsInterCoffres.coffreSourceId, coffreSourceId));
  }
  if (coffreDestinationId) {
    conditions.push(eq(transfertsInterCoffres.coffreDestinationId, coffreDestinationId));
  }
  if (params?.dateDebut) {
    const debutStr = typeof params.dateDebut === 'string' ? params.dateDebut : params.dateDebut.toISOString();
    conditions.push(gte(transfertsInterCoffres.dateTransfert, debutStr));
  }
  if (params?.dateFin) {
    const finStr = typeof params.dateFin === 'string' ? params.dateFin : params.dateFin.toISOString();
    conditions.push(lte(transfertsInterCoffres.dateTransfert, finStr));
  }
  if (search) {
    conditions.push(
      or(
        ilike(transfertsInterCoffres.reference, `%${search}%`),
        ilike(transfertsInterCoffres.motif, `%${search}%`)
      )
    );
  }
  if (params?.montantMin !== undefined) {
    conditions.push(gte(transfertsInterCoffres.montant, params.montantMin.toString()));
  }
  if (params?.montantMax !== undefined) {
    conditions.push(lte(transfertsInterCoffres.montant, params.montantMax.toString()));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  let query = db
    .select({
      transfert: transfertsInterCoffres,
      coffreSource: coffresForts,
    })
    .from(transfertsInterCoffres)
    .leftJoin(coffresForts, eq(transfertsInterCoffres.coffreSourceId, coffresForts.id));

  if (whereClause) {
    query = query.where(whereClause) as typeof query;
  }

  const sortColumn = sortBy === "montant"
    ? transfertsInterCoffres.montant
    : sortBy === "reference"
      ? transfertsInterCoffres.reference
      : transfertsInterCoffres.dateTransfert;

  query = query.orderBy(sortOrder === "asc" ? asc(sortColumn) : desc(sortColumn)) as typeof query;
  query = query.limit(limit).offset(offset) as typeof query;

  const results = await query;

  const [countResult] = await db
    .select({ count: count() })
    .from(transfertsInterCoffres)
    .where(whereClause);

  const total = Number(countResult?.count || 0);

  const transfertsEnriched = await Promise.all(
    results.map(async (r) => {
      const [coffreDest] = await db
        .select()
        .from(coffresForts)
        .where(eq(coffresForts.id, r.transfert.coffreDestinationId));

      let agenceSourceNom = null;
      let agenceDestNom = null;

      if (r.coffreSource?.ownerId) {
        const [agence] = await db.select({ nom: agences.nom }).from(agences).where(eq(agences.id, r.coffreSource.ownerId));
        agenceSourceNom = agence?.nom;
      } else if (r.coffreSource?.ownerType === "SIEGE") {
        agenceSourceNom = "Siège";
      }

      if (coffreDest?.ownerId) {
        const [agence] = await db.select({ nom: agences.nom }).from(agences).where(eq(agences.id, coffreDest.ownerId));
        agenceDestNom = agence?.nom;
      } else if (coffreDest?.ownerType === "SIEGE") {
        agenceDestNom = "Siège";
      }

      return {
        ...r.transfert,
        coffreSource: {
          ...r.coffreSource,
          agenceNom: agenceSourceNom,
        },
        coffreDestination: {
          ...coffreDest,
          agenceNom: agenceDestNom,
        },
      };
    })
  );

  const allTransferts = await db
    .select({ statut: transfertsInterCoffres.statut, montant: transfertsInterCoffres.montant })
    .from(transfertsInterCoffres)
    .where(whereClause);

  const stats = {
    total: allTransferts.length,
    parStatut: allTransferts.reduce((acc, t) => {
      acc[t.statut] = (acc[t.statut] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    montantTotal: allTransferts.reduce((sum, t) => sum + parseFloat(t.montant?.toString() || "0"), 0),
  };

  return {
    success: true,
    transferts: transfertsEnriched,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    stats,
  };
}

/**
 * Récupère les documents d'un transfert
 */
export async function getDocuments(transfertId: string) {
  const documents = await db
    .select()
    .from(documentsTransfert)
    .where(eq(documentsTransfert.transfertId, transfertId))
    .orderBy(asc(documentsTransfert.dateGeneration));

  return { success: true, documents };
}

/**
 * Récupère les logs d'audit d'un transfert
 */
export async function getAuditLogs(transfertId: string) {
  const logs = await db
    .select()
    .from(transfertsInterCoffresAuditLogs)
    .where(eq(transfertsInterCoffresAuditLogs.transfertId, transfertId))
    .orderBy(desc(transfertsInterCoffresAuditLogs.timestamp));

  return { success: true, auditLogs: logs };
}

/**
 * Statistiques des transferts par statut (comptage + montants)
 */
export async function getTransfertStats() {
  const sumMontant = sql<string>`coalesce(sum(${transfertsInterCoffres.montant}), 0)`;

  const rows = await db
    .select({
      statut: transfertsInterCoffres.statut,
      count: count(),
      montant: sumMontant,
    })
    .from(transfertsInterCoffres)
    .groupBy(transfertsInterCoffres.statut);

  const byStatus: Record<string, { count: number; montant: string }> = {};
  let total = 0;
  let totalMontant = 0;
  for (const row of rows) {
    byStatus[row.statut] = { count: Number(row.count), montant: row.montant };
    total += Number(row.count);
    totalMontant += parseFloat(row.montant || "0");
  }

  return {
    success: true,
    data: { total, totalMontant: totalMontant.toString(), byStatus },
  };
}
