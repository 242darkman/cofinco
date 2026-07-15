import { comptageBillets, type ComptageBillets, type InsertComptageBillets } from "@shared/schema";
import { eq } from "drizzle-orm";
import { db } from "../../../db";

export async function getComptageBillets(id: string): Promise<ComptageBillets | undefined> {
    const [comptage] = await db.select().from(comptageBillets).where(eq(comptageBillets.id, id));
    return comptage || undefined;
}

export async function getComptagesBySession(sessionId: string): Promise<ComptageBillets[]> {
    return db.select().from(comptageBillets).where(eq(comptageBillets.sessionId, sessionId));
}

export async function createComptageBillets(insertComptage: InsertComptageBillets): Promise<ComptageBillets> {
    const [comptage] = await db.insert(comptageBillets).values(insertComptage).returning();
    return comptage;
}
