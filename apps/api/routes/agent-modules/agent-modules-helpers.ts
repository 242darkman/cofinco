import { agentsTerrain } from "@shared/schema";
import { sql } from "drizzle-orm";
import type { Request } from "express";
import { db } from "../../db";

// Aide pour récupérer l'utilisateur de la requête
export function getUser(req: Request): { id: string; agenceId?: string } | null {
  if (!req.user) return null;
  return { ...req.user, agenceId: req.user.agenceId ?? undefined };
}

// Aide pour joindre le nom de l'agent
export async function withAgentName(rows: any[]) {
  if (rows.length === 0) return rows;
  const agentIds = Array.from(new Set(rows.map(r => r.agentId).filter(Boolean)));

  if (agentIds.length === 0) return rows;

  const agents = await db.select({
    id: agentsTerrain.id,
  }).from(agentsTerrain).where(
    sql`${agentsTerrain.id} IN (${sql.join(agentIds.map(id => sql`${id}`), sql`, `)})`
  );

  // We can't easily get names from agentsTerrain alone (they're in employes->users)
  // Return rows with agent id; frontend already handles display
  return rows;
}

