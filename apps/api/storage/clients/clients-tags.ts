import { clientTags, tags, type ClientTag, type InsertClientTag, type InsertTag, type Tag } from "@shared/schema";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";

export async function getAllTags(): Promise<Tag[]> {
  return db.select().from(tags).where(isNull(tags.deletedAt));
}

export async function createTag(tag: InsertTag): Promise<Tag> {
  const [newTag] = await db.insert(tags).values(tag).returning();
  return newTag;
}

export async function getClientTags(clientId: string): Promise<(ClientTag & { tag: Tag })[]> {
  const rows = await db.select({
      clientTag: clientTags,
      tag: tags
  })
  .from(clientTags)
  .innerJoin(tags, and(eq(clientTags.tagId, tags.id), isNull(tags.deletedAt)))
  .where(eq(clientTags.clientId, clientId));

  return rows.map(r => ({ ...r.clientTag, tag: r.tag }));
}

export async function addClientTag(entry: InsertClientTag): Promise<ClientTag & { tag: Tag }> {
    const [ct] = await db.insert(clientTags).values(entry).returning();

    // Récupérer le tag complet pour le retourner avec l'assignation
    const [tag] = await db.select().from(tags).where(eq(tags.id, entry.tagId));

    return { ...ct, tag };
}

export async function removeClientTag(clientId: string, tagId: string): Promise<boolean> {
    const res = await db.delete(clientTags).where(and(eq(clientTags.clientId, clientId), eq(clientTags.tagId, tagId)));
    return (res.rowCount || 0) > 0;
}

export async function deleteTag(tagId: string): Promise<boolean> {
    // Supprimer d'abord toutes les assignations de ce tag
    await db.delete(clientTags).where(eq(clientTags.tagId, tagId));
    // Suppression logique (soft-delete) du tag
    const res = await db.update(tags).set({ deletedAt: new Date() }).where(eq(tags.id, tagId));
    return (res.rowCount || 0) > 0;
}
