/**
 * Routes comptes — segment /accounts (partie accounts).
 *
 * Enregistré par l'index comptes.ts dans l'ordre historique.
 * Endpoints :
 *   GET    /api/accounts/check/:accountNumber
 */
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { requireAgenceAccess, requireAgenceIdAccess, validateAgenceIdAction } from "../../middleware";
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { comptes, produitsCompte, insertProduitCompteSchema, clients, users, virementsProgrammes } from "@shared/schema";
import { logger } from "./shared";

export function registerAccountsRoutes(app: Express) {
  /**
   * GET /api/accounts/check/:accountNumber - Vérifier un compte par numéro
   * Retourne uniquement le nom/prénom pour confidentialité
   */
  /**
   * GET /api/accounts/check/:accountNumber
   */
  app.get(
    "/api/accounts/check/:accountNumber",
    requireAuth,
    requireAgenceAccess(),
    async (req, res) => {
      try {
        const accountNumber = String(req.params.accountNumber || '').trim();
        if (!accountNumber) {
          return res.status(400).json({ message: "Numéro de compte requis" });
        }

        const agenceId = req.selectedAgenceId;
        const conditions: any[] = [eq(comptes.numeroCompte, accountNumber)];
        if (agenceId) {
          conditions.push(eq(comptes.agenceId, agenceId));
        }

        const [result] = await db
          .select({
            userNom: users.nom,
            userPrenom: users.prenom,
          })
          .from(comptes)
          .leftJoin(clients, eq(comptes.clientId, clients.id))
          .leftJoin(users, eq(clients.userId, users.id))
          .where(and(...conditions))
          .limit(1);

        if (!result) {
          return res.status(404).json({ message: "Compte introuvable" });
        }

        const ownerName = `${result.userNom || ''} ${result.userPrenom || ''}`.trim();
        return res.json({
          found: true,
          accountNumber,
          ownerName: ownerName || 'Compte trouvé',
        });
      } catch (error: any) {
        logger.error({ err: error }, 'Error checking account number');
        res.status(500).json({ message: error.message });
      }
    }
  );
}
