import { db } from "../../db";
import { eq, isNull } from "drizzle-orm";
import { configTransfertInterCoffres } from "@shared/schema";
import type { ServiceResult } from "./types";

/**
 * Récupère ou crée la configuration globale
 */
export async function getOrCreateGlobalConfig(): Promise<ServiceResult> {
  let [config] = await db
    .select()
    .from(configTransfertInterCoffres)
    .where(isNull(configTransfertInterCoffres.agenceId));

  if (!config) {
    [config] = await db
      .insert(configTransfertInterCoffres)
      .values({
        agenceId: null,
        actif: true,
      })
      .returning();
  }

  return { success: true, data: config };
}

/**
 * Met à jour la configuration
 */
export async function updateConfig(
  agenceId: string | null,
  data: Partial<typeof configTransfertInterCoffres.$inferInsert>
): Promise<ServiceResult> {
  const condition = agenceId
    ? eq(configTransfertInterCoffres.agenceId, agenceId)
    : isNull(configTransfertInterCoffres.agenceId);

  let [config] = await db
    .select()
    .from(configTransfertInterCoffres)
    .where(condition);

  if (!config) {
    // Créer si n'existe pas
    [config] = await db
      .insert(configTransfertInterCoffres)
      .values({
        agenceId,
        ...data,
        actif: true,
      } as any)
      .returning();
  } else {
    // Mettre à jour
    [config] = await db
      .update(configTransfertInterCoffres)
      .set({
        ...data,
        updatedAt: new Date(),
      } as any)
      .where(eq(configTransfertInterCoffres.id, config.id))
      .returning();
  }

  return { success: true, data: config };
}
