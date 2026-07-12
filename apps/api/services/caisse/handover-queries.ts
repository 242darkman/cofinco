import { db } from "../../db";
import { caisseHandovers, caisses, users } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import type { CaisseHandover } from "@shared/schema";
import { PendingHandover } from "./handover-types";

export class HandoverQueries {
  /**
   * Récupère les transferts en attente pour un utilisateur
   */
  async getPendingHandovers(userId: string): Promise<PendingHandover[]> {
    const handovers = await db.select({
      id: caisseHandovers.id,
      sessionId: caisseHandovers.sessionId,
      caisseId: caisseHandovers.caisseId,
      caisseNom: caisses.nom,
      fromCaissierId: caisseHandovers.fromCaissierId,
      toCaissierId: caisseHandovers.toCaissierId,
      montantTheorique: caisseHandovers.montantTheorique,
      statut: caisseHandovers.statut,
      initiatedAt: caisseHandovers.initiatedAt,
    })
    .from(caisseHandovers)
    .innerJoin(caisses, eq(caisseHandovers.caisseId, caisses.id))
    .where(and(
      sql`${caisseHandovers.statut} IN ('PENDING', 'COUNTING', 'DISPUTED')`,
      sql`(${caisseHandovers.fromCaissierId} = ${userId} OR ${caisseHandovers.toCaissierId} = ${userId})`
    ))
    .orderBy(desc(caisseHandovers.initiatedAt));

    // Récupérer les noms des caissiers
    const result: PendingHandover[] = [];
    for (const h of handovers) {
      const [fromUser] = await db.select({ nom: users.nom, prenom: users.prenom })
        .from(users).where(eq(users.id, h.fromCaissierId));
      const [toUser] = await db.select({ nom: users.nom, prenom: users.prenom })
        .from(users).where(eq(users.id, h.toCaissierId));

      result.push({
        id: h.id,
        sessionId: h.sessionId,
        caisseId: h.caisseId,
        caisseNom: h.caisseNom,
        fromCaissierNom: `${fromUser?.prenom || ''} ${fromUser?.nom || ''}`.trim(),
        toCaissierNom: `${toUser?.prenom || ''} ${toUser?.nom || ''}`.trim(),
        montantTheorique: Number(h.montantTheorique),
        statut: h.statut,
        initiatedAt: h.initiatedAt,
      });
    }

    return result;
  }

  /**
   * Récupère l'historique des transferts pour une session
   */
  async getHandoverHistory(sessionId: string): Promise<CaisseHandover[]> {
    const handovers = await db.select()
      .from(caisseHandovers)
      .where(eq(caisseHandovers.sessionId, sessionId))
      .orderBy(desc(caisseHandovers.initiatedAt));

    return handovers;
  }

  /**
   * Récupère un handover par ID
   */
  async getHandoverById(handoverId: string): Promise<CaisseHandover | null> {
    const [handover] = await db.select()
      .from(caisseHandovers)
      .where(eq(caisseHandovers.id, handoverId));

    return handover || null;
  }
}

export const handoverQueries = new HandoverQueries();
