import {
  demandesConges
} from "@shared/schema";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";

// Demandes de Congés
export async function getConges(filter?: { statut?: string; employeId?: string }) {
  let query = db.select().from(demandesConges);
  const conditions = [];
  if (filter?.statut) conditions.push(eq(demandesConges.statut, filter.statut));
  if (filter?.employeId) conditions.push(eq(demandesConges.employeId, filter.employeId));
  
  if (conditions.length > 0) {
    return await query.where(and(...conditions)).orderBy(desc(demandesConges.createdAt));
  }
  return await query.orderBy(desc(demandesConges.createdAt));
}

export async function createConge(conge: any) {
  const [newConge] = await db.insert(demandesConges).values(conge).returning();
  return newConge;
}

export async function updateCongeStatus(id: number, status: string, userId: string, commentaire?: string) {
    const [updated] = await db.update(demandesConges)
      .set({
        statut: status,
        approuvePar: userId,
        dateDecision: new Date(),
        commentaire: commentaire || null
      })
      .where(eq(demandesConges.id, id))
      .returning();
    return updated;
}
