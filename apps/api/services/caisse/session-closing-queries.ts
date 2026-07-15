import { db } from "../../db";
import {
  sessionsCaisse,
  caisses,
  users,
} from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import type { SessionRow } from "./types";

/**
 * Récupérer les sessions en cours de fermeture (pour supervision)
 */
export async function getClosingSessionsForAgence(agenceId: string): Promise<(SessionRow & { caissierNom: string | null; caisseNom: string | undefined })[]> {
  const sessions = await db
    .select({
      session: sessionsCaisse,
      caissier: {
        id: users.id,
        nom: users.nom,
        prenom: users.prenom,
      },
      caisse: {
        id: caisses.id,
        nom: caisses.nom,
      },
    })
    .from(sessionsCaisse)
    .leftJoin(users, eq(sessionsCaisse.caissierId, users.id))
    .leftJoin(caisses, eq(sessionsCaisse.caisseId, caisses.id))
    .where(
      and(
        eq(sessionsCaisse.agenceId, agenceId),
        sql`${sessionsCaisse.statut} IN ('CLOSING_COUNT', 'CLOSING_VALIDATION')`
      )
    )
    .orderBy(desc(sessionsCaisse.closingInitiatedAt));

  return sessions.map((row) => ({
    ...row.session,
    caissierNom: row.caissier ? `${row.caissier.prenom} ${row.caissier.nom}` : null,
    caisseNom: row.caisse?.nom,
  }));
}
