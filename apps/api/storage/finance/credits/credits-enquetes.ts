import {
  clients,
  enquetesCredit,
  users, type EnqueteCredit, type InsertEnqueteCredit
} from "@shared/schema";
import { desc, eq } from "drizzle-orm";
import { db } from "../../../db";

export async function getEnqueteCredit(id: string): Promise<EnqueteCredit | undefined> {
  const [enquete] = await db.select().from(enquetesCredit).where(eq(enquetesCredit.id, id));
  return enquete || undefined;
}

export async function getEnqueteByDemandeId(demandeId: string): Promise<EnqueteCredit[]> {
  return db.select().from(enquetesCredit).where(eq(enquetesCredit.demandeId, demandeId)).orderBy(desc(enquetesCredit.createdAt));
}

export async function getEnquetesByClient(clientId: string): Promise<EnqueteCredit[]> {
  return db.select().from(enquetesCredit).where(eq(enquetesCredit.clientId, clientId)).orderBy(desc(enquetesCredit.createdAt));
}

export async function getAllEnquetes(): Promise<EnqueteCredit[]> {
  const results = await db.select({
    enquete: enquetesCredit,
    client: clients,
    user: users
  })
  .from(enquetesCredit)
  .leftJoin(clients, eq(enquetesCredit.clientId, clients.id))
  .leftJoin(users, eq(clients.userId, users.id))
  .orderBy(desc(enquetesCredit.createdAt));
  
  return results.map(({ enquete, client, user }) => ({
    ...enquete,
    clients: client ? {
      nom: user?.nom,
      prenom: user?.prenom,
      telephone: user?.telephone,
      photoProfile: user?.photoProfile
    } : undefined
  })) as EnqueteCredit[];
}

export async function createEnqueteCredit(insertEnquete: InsertEnqueteCredit): Promise<EnqueteCredit> {
  const [enquete] = await db.insert(enquetesCredit).values(insertEnquete).returning();
  return enquete;
}

export async function updateEnqueteCredit(id: string, updateData: Partial<InsertEnqueteCredit>): Promise<EnqueteCredit | undefined> {
  const [enquete] = await db.update(enquetesCredit).set(updateData).where(eq(enquetesCredit.id, id)).returning();
  return enquete || undefined;
}
