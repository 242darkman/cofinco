/**
 * Routes des comptes bancaires d'un client (lecture + mise à jour).
 * Extrait de finance.ts pour respecter la limite de 400 lignes.
 */
import type { Express } from "express";
import { z } from "zod";
import { createLogger } from "../../lib/logger";
import { storage } from "../../storage";
import { getComptesByClient } from "../../storage/finance";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { requireAgenceIdAccess } from "../../middleware";
import { logAudit } from "../../audit";
import {
  TypeCompte,
  StatutCompte,
  MethodePaiement,
  getTypePaiementForCompte,
} from "@shared/enum/status-constants";

const logger = createLogger('Routes:ClientComptes');

export function registerClientCompteRoutes(app: Express) {

  // ============================================
  // COMPTES BANCAIRES (Refactored)
  // ============================================

  // GET Accounts
  app.get("/api/clients/:id/accounts", requireAuth, requireAgenceIdAccess(), async (req, res) => {
    try {
      // 1. Verify access to client
      const client = await storage.getClient(req.params.id);
      if (!client) return res.status(404).json({ message: "Client not found" });

      const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
      if (agenceFilter?.agenceId && client.agenceId !== agenceFilter.agenceId) {
        return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
      }

      // 2. Fetch accounts
      const accounts = await getComptesByClient(req.params.id);
      res.json(accounts);
    } catch (error) {
       logger.error({ err: error }, 'Error fetching accounts');
       res.status(500).json({ message: "Erreur chargement comptes" });
    }
  });

  // POST Account (Create) — REMOVED: Use POST /api/comptes (modern route with product system) instead

  // UPDATE Account (PATCH)
  app.patch("/api/clients/:clientId/accounts/:accountId", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.COMPTE), requireAgenceIdAccess(), async (req, res) => {
      try {
        const { clientId, accountId } = req.params;

        // 1. Verify access to client
        const client = await storage.getClient(clientId);
        if (!client) return res.status(404).json({ message: "Client not found" });

        const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;
        if (agenceFilter) {
          if (agenceFilter.agenceId && client.agenceId !== agenceFilter.agenceId) {
            return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
          }
        }

        // 2. Validate input
        const schema = z.object({
            typeCompte: z.enum([TypeCompte.CURRENT, TypeCompte.SAVINGS]).optional(),
            tauxInteret: z.coerce.number().min(0).optional(),
            statut: z.enum([StatutCompte.ACTIVE, StatutCompte.SUSPENDED, StatutCompte.CLOSED]).optional(),
            solde: z.coerce.number().optional()
        });

        const parsed = schema.parse(req.body);

        // Fetch current account to compare balance
        const currentAccount = await storage.getCompte(accountId);
        if (!currentAccount) return res.status(404).json({ message: "Compte introuvable" });

        // Handle Balance Correction (Safe Mode)
        if (parsed.solde !== undefined && parsed.solde !== Number(currentAccount.soldeCourant)) {
            const difference = parsed.solde - Number(currentAccount.soldeCourant);

            // Create automatic transaction line
            await storage.createTransactionCompte({
                compteId: accountId,
                typePaiement: getTypePaiementForCompte(currentAccount.typeCompte, difference > 0),
                montant: Math.abs(difference).toString(),
                soldeApres: parsed.solde.toString(),
                methodePaiement: MethodePaiement.CASH,
                referenceExterne: `CORRECTION-${Date.now()}`,
                observations: `Correction manuelle de solde par ${req.session.user?.username || 'Admin'}`,
                createdBy: req.session.user?.id
            });
        }

        // 3. Update account
        const updatedAccount = await storage.updateClientAccount(accountId, {
          typeCompte: parsed.typeCompte,
          tauxInteret: parsed.tauxInteret?.toString(),
          statut: parsed.statut,
          // If solde was provided, it's now backed by a transaction, so we can update it in the account record too
          ...(parsed.solde !== undefined ? { solde: parsed.solde.toString() } : {})
        });

        if (!updatedAccount) {
            return res.status(404).json({ message: "Compte introuvable" });
        }

        // 4. Log Audit
        await logAudit(
            req,
            "UPDATE_ACCOUNT",
            "client",
            client.id,
            { accountId, updates: parsed },
            "success",
            "medium"
        );

        // 5. Notify Real-Time Updates
        const wsServer = await import("../../ws-server");
        const wsInstance = wsServer.getWsInstance();
        if (wsInstance) {
            // Notify client update (force refresh of client details everywhere)
            wsInstance.broadcast({ type: "CLIENT_UPDATE", payload: { clientId: client.id, agenceId: client.agenceId } });

            // Notify live activity
            wsInstance.broadcast({
              type: "LIVE_ACTIVITY",
              payload: {
                action: `Modification compte ${updatedAccount.numeroCompte}`,
                user: req.session.user?.nom || 'Système',
                type: 'finance',
                timestamp: new Date().toISOString(),
                agenceId: client.agenceId
              }
            });

             // Update dashboard stats if there was an invalidation needed
            wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
        }

        res.json(updatedAccount);
      } catch (error) {
         if (error instanceof z.ZodError) return res.status(400).json(error);
         logger.error({ err: error }, 'Error updating account');
         res.status(500).json({ message: "Erreur mise à jour compte" });
      }
  });
}
