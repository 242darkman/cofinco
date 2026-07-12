import { clientActivities, type ClientActivity, type InsertClientActivity } from "@shared/schema";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db";

export async function logClientActivity(activity: InsertClientActivity): Promise<ClientActivity> {
    const [act] = await db.insert(clientActivities).values(activity).returning();
    return act;
}

export async function getClientActivities(clientId: string): Promise<ClientActivity[]> {
    return db.select().from(clientActivities).where(eq(clientActivities.clientId, clientId)).orderBy(desc(clientActivities.createdAt));
}
