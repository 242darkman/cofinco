import {
  agences,
  caisseTransferts,
  users,
  type CaisseTransfert,
  type InsertCaisseTransfert
} from "@shared/schema";
import { aliasedTable, desc, eq, getTableColumns, or } from "drizzle-orm";
import { db } from "../../../db";

export async function getCaisseTransfert(id: string): Promise<CaisseTransfert | undefined> {
    const [transfert] = await db.select().from(caisseTransferts).where(eq(caisseTransferts.id, id));
    return transfert || undefined;
}

export async function getCaisseTransferts(agenceId?: string): Promise<any[]> {
    const sourceAgence = aliasedTable(agences, "source_agence");
    const destAgence = aliasedTable(agences, "dest_agence");

    const selection = {
        ...getTableColumns(caisseTransferts),
        created_by_username: users.username,
        created_by_nom: users.nom,
        created_by_prenom: users.prenom,
        agence_source_nom: sourceAgence.nom,
        agence_dest_nom: destAgence.nom
    };

    let query = db.select(selection)
        .from(caisseTransferts)
        .leftJoin(users, eq(caisseTransferts.createdBy, users.id))
        .leftJoin(sourceAgence, eq(caisseTransferts.agenceSourceId, sourceAgence.id))
        .leftJoin(destAgence, eq(caisseTransferts.agenceDestId, destAgence.id));

    if (agenceId) {
        query = query.where(or(
            eq(caisseTransferts.agenceSourceId, agenceId), 
            eq(caisseTransferts.agenceDestId, agenceId)
        )) as any;
    }
    
    return query.orderBy(desc(caisseTransferts.dateCreation));
}

export async function getCaisseTransfertsByAgence(agenceId: string): Promise<any[]> {
    return getCaisseTransferts(agenceId);
}

export async function createCaisseTransfert(insertData: InsertCaisseTransfert): Promise<CaisseTransfert> {
    const [transfert] = await db.insert(caisseTransferts).values(insertData).returning();
    return transfert;
}

export async function updateCaisseTransfert(id: string, updateData: Partial<InsertCaisseTransfert>): Promise<CaisseTransfert | undefined> {
    const [transfert] = await db.update(caisseTransferts).set({ ...updateData }).where(eq(caisseTransferts.id, id)).returning();
    return transfert || undefined;
}
