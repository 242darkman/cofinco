/**
 * Routes finance — segment /agences (partie agences).
 *
 * Enregistré par l'index finance.ts dans l'ordre historique.
 * Endpoints :
 *   GET    /api/agences/:id/caisses
 */
import type { Express } from "express";
import { comptes } from "@shared/schema";
import { storage } from "../../storage";
import { requireAuth } from "../../auth";
import { requireAgenceAccess, requireAgenceIdAccess } from "../../middleware";
import { isIncomingOperation, isOutgoingOperation, getOperationDelta, CAISSE_IN_OPERATIONS } from "@shared/config/caisse-operations";

export function registerAgencesRoutes(app: Express) {
  // ============================================================================
  // COMPTES ENDPOINTS - See /api/comptes in server/routes/comptes.ts
  // All account operations (create, deposit, withdrawal, block, unblock, transfer)
  // are now handled by the unified comptes routes.
  // ============================================================================

  // Caisse Management
  /**
   * GET /api/agences/:id/caisses
   */
  app.get("/api/agences/:id/caisses", requireAuth, requireAgenceAccess(), async (req, res) => {
      const caisses = await storage.getCaissesByAgence(req.params.id);
      
      // Enrichir avec le statut "Occupé" en temps réel
      // Une caisse est occupée si elle a une session active (closedAt IS NULL)
      const activeSessions = await storage.getActiveSessions();
      
      const enrichedCaisses = await Promise.all(caisses.map(async (c) => {
         const activeSession = activeSessions.find(s => s.caisseId === c.id && !s.closedAt);
         let currentSolde = "0";

         if (activeSession) {
            // Calculate real-time balance for active session
            const ops = await storage.getOperationsBySession(activeSession.id);
            let solde = Number(activeSession.montantOuverture || 0);

            for (const op of ops) {
                const montant = Number(op.montant || 0);

                // Use centralized helper functions from caisse-operations.ts
                const delta = getOperationDelta(op.typeOperation, montant, {
                    reference: op.reference,
                    description: op.description
                });
                solde += delta;
            }
            currentSolde = solde.toString();
         } else {
            // Get balance from last closed session
            const lastClosedSession = await storage.getLastClosedSession(c.id);
            if (lastClosedSession) {
               // Priority: montantReporte (funds kept for next day) > caisse.solde > declared amount
               // montantReporte is set during the closing workflow when cashier decides to keep funds
               // IMPORTANT: Use Number() to check actual value, not string truthiness ("0" is truthy!)
               // IMPORTANT: Exposer les valeurs négatives pour que le frontend puisse les détecter et proposer une correction
               const montantReporte = Number(lastClosedSession.montantReporte || 0);
               const soldeCaisse = Number(c.solde || 0);
               const montantDeclare = Number(lastClosedSession.montantFermetureDeclare || 0);
               const montantTheorique = Number(lastClosedSession.montantFermetureTheorique || 0);

               if (montantReporte !== 0) {
                  currentSolde = montantReporte.toString();
               } else if (soldeCaisse !== 0) {
                  currentSolde = soldeCaisse.toString();
               } else if (montantDeclare !== 0) {
                  currentSolde = montantDeclare.toString();
               } else if (montantTheorique !== 0) {
                  currentSolde = montantTheorique.toString();
               } else {
                  currentSolde = "0";
               }
            } else {
               // No closed session, use caisse.solde directly
               currentSolde = c.solde || "0";
            }
         }

         const assignments = await storage.getCaisseAssignmentsEnriched(c.id);
         return {
             ...c,
             solde: currentSolde,
             isOccupied: !!activeSession,
             occupiedBy: activeSession ? activeSession.caissierId : null,
             sessionId: activeSession ? activeSession.id : null,
             assignments: assignments.map(a => a.userId),
             assignmentsDetails: assignments,
         };
      }));

      res.json(enrichedCaisses);
  });
}
