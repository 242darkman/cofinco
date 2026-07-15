import { db } from "../../db";
import {
  sessionsCaisse,
  transfertsCoffreCaisse,
  caisses,
  users,
} from "@shared/schema";
import { eq, and, isNull, inArray, desc } from "drizzle-orm";

/**
 * Récupérer la session en attente d'un utilisateur
 */
export async function getPendingSession(userId: string) {
  const [session] = await db
    .select()
    .from(sessionsCaisse)
    .where(
      and(
        eq(sessionsCaisse.caissierId, userId),
        inArray(sessionsCaisse.statut, [
          "REQUESTING_FUNDS",
          "FUNDS_DISPATCHED",
        ] as const),
        isNull(sessionsCaisse.deletedAt)
      )
    )
    .limit(1);

  if (!session) return null;

  // Enrichir avec les infos du transfert
  let transfert = null;
  if (session.openingTransfertId) {
    [transfert] = await db
      .select()
      .from(transfertsCoffreCaisse)
      .where(eq(transfertsCoffreCaisse.id, session.openingTransfertId));
  }

  // Enrichir avec les infos de la caisse
  const [caisse] = await db
    .select()
    .from(caisses)
    .where(eq(caisses.id, session.caisseId));

  return {
    ...session,
    transfert,
    caisse,
  };
}

/**
 * Récupérer les demandes d'ouverture en attente (pour le dashboard coffre)
 */
export async function getPendingOpeningRequests(agenceId: string) {
  const requests = await db
    .select({
      transfert: transfertsCoffreCaisse,
      session: sessionsCaisse,
    })
    .from(transfertsCoffreCaisse)
    .innerJoin(
      sessionsCaisse,
      eq(transfertsCoffreCaisse.sessionOuvertureId, sessionsCaisse.id)
    )
    .where(
      and(
        eq(transfertsCoffreCaisse.agenceId, agenceId),
        eq(transfertsCoffreCaisse.isOpeningFund, true),
        eq(transfertsCoffreCaisse.statut, "REQUESTED")
      )
    )
    .orderBy(desc(transfertsCoffreCaisse.createdAt));

  // Enrichir avec les noms des caissiers et des caisses
  const enriched = await Promise.all(
    requests.map(async (req) => {
      const [caissier] = await db
        .select({ nom: users.nom, prenom: users.prenom })
        .from(users)
        .where(eq(users.id, req.session.caissierId));

      const [caisse] = await db
        .select({ nom: caisses.nom })
        .from(caisses)
        .where(eq(caisses.id, req.transfert.caisseId));

      return {
        ...req,
        caissierNom: caissier?.nom,
        caissierPrenom: caissier?.prenom,
        caisseNom: caisse?.nom,
      };
    })
  );

  return enriched;
}
