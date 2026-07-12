import {
  creditRefundRequests,
  remboursements,
  type CreditRefundRequest, type InsertCreditRefundRequest,
  type InsertRemboursement,
  type Remboursement
} from "@shared/schema";
import { desc, eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { db } from "../../../db";

export async function getRemboursement(id: string): Promise<Remboursement | undefined> {
  const [remboursement] = await db.select().from(remboursements).where(eq(remboursements.id, id));
  return remboursement || undefined;
}

export async function getRemboursementsByCredit(creditId: string): Promise<Remboursement[]> {
  return db.select().from(remboursements).where(eq(remboursements.creditId, creditId)).orderBy(desc(remboursements.dateRemboursement));
}

export async function createRemboursement(insertRemboursement: InsertRemboursement): Promise<Remboursement> {
  const [remboursement] = await db.insert(remboursements).values(insertRemboursement).returning();
  return remboursement;
}

/**
 * Crée une nouvelle demande de remboursement de crédit
 */
export async function createCreditRefundRequest(
  data: InsertCreditRefundRequest, 
  tx?: PgTransaction<any, any, any>
): Promise<CreditRefundRequest> {
  const [request] = await (tx || db)
    .insert(creditRefundRequests)
    .values(data)
    .returning();
  return request;
}

/**
 * Récupère une demande de remboursement de crédit par ID
 */
export async function getCreditRefundRequest(
  id: string, 
  tx?: PgTransaction<any, any, any>
): Promise<CreditRefundRequest | undefined> {
  const [request] = await (tx || db)
    .select()
    .from(creditRefundRequests)
    .where(eq(creditRefundRequests.id, id));
  return request;
}

/**
 * Met à jour une demande de remboursement de crédit
 */
export async function updateCreditRefundRequest(
  id: string, 
  updateData: Partial<CreditRefundRequest>,
  tx?: PgTransaction<any, any, any>
): Promise<CreditRefundRequest> {
  const [updated] = await (tx || db)
    .update(creditRefundRequests)
    .set({ ...updateData, updatedAt: new Date() })
    .where(eq(creditRefundRequests.id, id))
    .returning();
  return updated;
}
