import type { StatutCreditType } from "@shared/enum/status-constants";
import { validateCreditTransition } from "@shared/machines/credit-workflow";
import {
  agences,
  clients,
  credits, demandesCredit,
  users,
  type Credit, type InsertCredit
} from "@shared/schema";
import { and, count, desc, eq, or, sql } from "drizzle-orm";
import { db } from "../../../db";
import { enrichCreditData, type PaginatedCredits } from "../misc";

export async function getCredit(id: string): Promise<Credit & { fraisEngagementPayes?: boolean } | undefined> {
  const [result] = await db.select({
    credit: credits,
    demande: demandesCredit
  })
  .from(credits)
  .leftJoin(demandesCredit, eq(credits.demandeId, demandesCredit.id))
  .where(eq(credits.id, id));

  if (!result) return undefined;

  return {
    ...enrichCreditData(result.credit),
    fraisEngagementPayes: result.demande?.fraisEngagementPayes || false
  };
}

export async function getCreditsByClient(clientId: string): Promise<Credit[]> {
  const results = await db.select().from(credits).where(eq(credits.clientId, clientId)).orderBy(desc(credits.createdAt));
  return results.map(credit => enrichCreditData(credit));
}

export async function getAllCredits(
  filter: { agence?: string; agenceId?: string; clientId?: string } = {},
  options: { search?: string; page?: number; limit?: number; statut?: string } = {}
): Promise<PaginatedCredits> {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const offset = (page - 1) * limit;

  const conditions = [];

  // Utilisation de agenceId directement si fourni (plus sûr)
  if (filter.agenceId && filter.agenceId !== "all") {
    conditions.push(eq(clients.agenceId, filter.agenceId));
  } else if (filter.agence && filter.agence !== "all") {
    // Repli : rechercher agenceId par nom si agence est un nom
    const [agenceRecord] = await db.select({ id: agences.id })
      .from(agences)
      .where(eq(agences.nom, filter.agence))
      .limit(1);
    if (agenceRecord) {
      conditions.push(eq(clients.agenceId, agenceRecord.id));
    }
  }

  if (filter.clientId) {
    conditions.push(eq(credits.clientId, filter.clientId));
  }

  if (options.statut) {
    conditions.push(eq(credits.statut, options.statut as StatutCreditType));
  }

  if (options.search && options.search.trim()) {
    const searchTerm = `%${options.search.trim().toLowerCase()}%`;
    conditions.push(
      or(
        sql`LOWER(${users.nom}) LIKE ${searchTerm}`,
        sql`LOWER(${users.prenom}) LIKE ${searchTerm}`,
        sql`LOWER(${credits.numeroCredit}) LIKE ${searchTerm}`,
        sql`LOWER(${users.telephone}) LIKE ${searchTerm}`
      )
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Comptage du total
  const countQuery = db.select({ count: count() })
    .from(credits)
    .leftJoin(clients, eq(credits.clientId, clients.id))
    .leftJoin(users, eq(clients.userId, users.id));

  const countResult = whereClause
    ? await countQuery.where(whereClause)
    : await countQuery;

  const total = countResult[0]?.count || 0;

  // Récupération des données avec pagination
  let dataQuery = db.select({
    credit: credits,
    client: clients,
    user: users
  })
  .from(credits)
  .leftJoin(clients, eq(credits.clientId, clients.id))
  .leftJoin(users, eq(clients.userId, users.id))
  .orderBy(desc(credits.createdAt))
  .limit(limit)
  .offset(offset)
  .$dynamic();

  if (whereClause) {
    dataQuery = dataQuery.where(whereClause);
  }

  const results = await dataQuery;
  const data = results.map(({ credit, client, user }) =>
    enrichCreditData(credit, {
      ...client,
      nom: user?.nom,
      prenom: user?.prenom,
      telephone: user?.telephone,
      photoProfile: user?.photoProfile,
    })
  );

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function createCredit(insertCredit: InsertCredit): Promise<Credit> {
  const [credit] = await db.insert(credits).values(insertCredit).returning();
  return credit;
}

export async function updateCredit(id: string, updateData: Partial<InsertCredit>): Promise<Credit | undefined> {
  // Garde de machine à état : Valider la transition de statut s'il est mis à jour
  if (updateData.statut) {
    const [currentCredit] = await db.select({ statut: credits.statut }).from(credits).where(eq(credits.id, id));
    if (currentCredit) {
      // validateCreditTransition lève une CreditTransitionError si la transition est invalide
      validateCreditTransition(currentCredit.statut, updateData.statut);
    }
  }

  const [credit] = await db.update(credits).set({ ...updateData, updatedAt: new Date() }).where(eq(credits.id, id)).returning();
  return credit || undefined;
}
