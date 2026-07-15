import { db } from "../../db";
import { configEvacuationCoffre } from "@shared/schema";
import { eq } from "drizzle-orm";
import { EvacuationCoffreValidator } from "./business-rules";
import type { ServiceResult } from "./types";

const validator = new EvacuationCoffreValidator();

export async function getConfig(agenceId?: string): Promise<ServiceResult> {
  const config = await validator.getConfig(agenceId);
  return { success: true, data: config };
}

export async function updateConfig(
  agenceId: string,
  data: Partial<typeof configEvacuationCoffre.$inferSelect>
): Promise<ServiceResult> {
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
