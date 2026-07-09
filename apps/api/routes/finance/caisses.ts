/**
 * Routes finance — segment /caisses (partie caisses).
 *
 * Enregistré par l'index finance.ts dans l'ordre historique.
 * Endpoints :
 *   GET    /api/caisses
 *   POST   /api/caisses/:id/assign
 *   POST   /api/caisses
 *   DELETE /api/caisses/:id
 *   GET    /api/caisses/status
 *   POST   /api/caisses/:id/liquidate
 *   PATCH  /api/caisses/:id/operating-hours
 */
import type { Express } from "express";
import * as schema from "@shared/schema";
import { insertCaisseSchema, coffresForts } from "@shared/schema";
import { storage } from "../../storage";
import { createMouvementFinancier } from "../../services/ledger";
import { postGlForMouvement } from "../../services/accounting-posting-service";
import { StatutCaisse } from "@shared/enum/status-constants";
import { requireAuth } from "../../auth";
import { requireAgenceAccess, requireAgenceIdAccess } from "../../middleware";
import { attachAbility, requireAbility, requireDisbursement, hasAbility, Actions, Subjects } from "../../authorization";
import { logAudit } from "../../audit";
import { normalizeKeysDeep, coerceValueToSchema } from "../utils";
import { db } from "../../db";
import { eq, desc, and, sql, count, inArray } from "drizzle-orm";
import { SystemRole } from "@shared/types/roles";
import { logger } from "./shared";

export function registerCaissesRoutes(app: Express) {
  /**
   * GET /api/caisses
   */
  app.get("/api/caisses", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), async (req, res) => {
      // Admin only: Get ALL caisses
      const caisses = await storage.getAllCaisses();
      const activeSessions = await storage.getActiveSessions();

      // Build agence name map for enrichment (active agencies only)
      const allAgences = await storage.getAllAgences();
      const agenceMap = new Map(allAgences.map(a => [a.id, a.nom]));
      const activeAgenceIds = new Set(allAgences.filter(a => a.statut === 'ACTIVE').map(a => a.id));

      // Filter out caisses from closed/migrated agencies
      const activeCaisses = caisses.filter(c => activeAgenceIds.has(c.agenceId));

      const enrichedCaisses = await Promise.all(activeCaisses.map(async (c) => {
         const activeSession = activeSessions.find(s => s.caisseId === c.id && !s.closedAt);
         let currentSolde = "0";

         if (activeSession) {
            // Calculate real-time balance using Ledger SENS (Source of Truth)
            // This fixes discrepancies where some operation types were missing from the hardcoded list
            const ops = await storage.getOperationsBySessionWithSens(activeSession.id);
            let solde = Number(activeSession.montantOuverture || 0);

            for (const op of ops) {
                const montant = Number(op.montant || 0);
                // Support both old FR and new EN values
                if (op.sens === 'CREDIT' || op.sens === 'Crédit') {
                    solde += montant;
                } else if (op.sens === 'DEBIT' || op.sens === 'Débit') {
                    solde -= montant;
                }
            }
            currentSolde = solde.toString();
         } else {
            // Get balance from last closed session
            const lastClosedSession = await storage.getLastClosedSession(c.id);
            if (lastClosedSession) {
               // Priority: montantReporte (funds kept for next day) > caisse.solde > declared amount
               // IMPORTANT: Use Number() to check actual value, not string truthiness ("0" is truthy!)
               // IMPORTANT: Exposer les valeurs négatives pour détection frontend
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
             agenceNom: agenceMap.get(c.agenceId) || null,
             isOccupied: !!activeSession,
             occupiedBy: activeSession ? activeSession.caissierId : null,
             sessionId: activeSession ? activeSession.id : null,
             assignments: assignments.map(a => a.userId),
             assignmentsDetails: assignments,
         };
      }));

      res.json(enrichedCaisses);
  });

  /**
   * POST /api/caisses/:id/assign
   */
  app.post("/api/caisses/:id/assign", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), requireAgenceAccess(), async (req, res) => {
      const { id } = req.params;
      const { userIds } = req.body; // Expect array of user IDs
      
      if (!Array.isArray(userIds)) {
          return res.status(400).json({ message: "userIds must be an array" });
      }

      await storage.setCaisseAssignments(id, userIds, req.session.user!.id);
      res.json({ success: true });
  });

  /**
   * POST /api/caisses
   */
  app.post("/api/caisses", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), requireAgenceAccess(), async (req, res) => {
      const data = normalizeKeysDeep(req.body) as any;
      const user = req.session.user!;
      
      const isAdmin = user.role === SystemRole.ADMIN;
      
      // If admin, use provided agenceId (validate it exists?)
      // If not admin, FORCE user's agenceId
      if (!isAdmin) {
          data.agenceId = user.agenceId;
      } else {
          // Admin must provide agenceId
          if (!data.agenceId) {
             return res.status(400).json({ message: "L'agence est obligatoire pour la création par un administrateur." });
          }
      }

      const parsed = insertCaisseSchema.parse(data);
      const caisse = await storage.createCaisse(parsed);
      res.status(201).json(caisse);
  });

  /**
   * DELETE /api/caisses/:id
   */
  app.delete("/api/caisses/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), async (req, res) => {
    const { id } = req.params;
    const user = req.session.user!;

    const caisse = await storage.getCaisse(id);
    if (!caisse) return res.status(404).json({ message: "Caisse non trouvée" });

    // Check Agency Access
    const isGlobalAdmin = req.ability?.can(Actions.MANAGE, 'all');
    if (!isGlobalAdmin && caisse.agenceId !== user.agenceId) {
        return res.status(403).json({ message: "Accès refusé à cette agence" });
    }

    const deleted = await storage.deleteCaisse(id);
    if (!deleted) {
        return res.status(409).json({ message: "Impossible de supprimer cette caisse car elle a déjà été utilisée (historique présent)." });
    }

    res.json({ success: true });
  });

  // ============================================================================
  /**
   * GET /api/caisses/status
   */
  app.get("/api/caisses/status", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE), async (req, res) => {
    const agenceId = req.query.agenceId as string;
    const caisses = await storage.getCaissesWithStatus(agenceId);
    res.json(caisses);
  });

  // ==========================================
  // CAISSE LIQUIDATION & DELETION
  // ==========================================

  // LIQUIDATION CAISSE
  /**
   * POST /api/caisses/:id/liquidate
   */
  app.post("/api/caisses/:id/liquidate", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session?.userId;

      // 1. Get Caisse
      const [caisse] = await db.select().from(schema.caisses).where(eq(schema.caisses.id, id));
      if (!caisse) return res.status(404).json({ error: "Caisse not found" });

      if (caisse.statut === StatutCaisse.CLOSED) {
         // If already closed, check balance. If 0, soft delete.
         if (Number(caisse.solde) === 0) {
            await db.update(schema.caisses).set({ deletedAt: new Date() }).where(eq(schema.caisses.id, id));
            return res.json({ message: "Caisse fermée et vide archivée." });
         }
      }

      // 2. Get Agency Safe (Coffre-Fort)
      const [coffre] = await db.select()
        .from(schema.coffresForts)
        .where(eq(schema.coffresForts.ownerId, caisse.agenceId));
      
      if (!coffre) return res.status(400).json({ error: "Aucun coffre-fort trouvé pour cette agence." });

      // 3. Transfer Balance via Ledger (GL-tracked)
      const amount = Number(caisse.solde);

      await db.transaction(async (tx) => {
        if (amount > 0) {
            // Create mouvement financier via ledger service
            const mouvement = await createMouvementFinancier(tx, {
                montant: amount.toString(),
                sens: "DEBIT",
                sourceModule: "CAISSE",
                sourceId: caisse.id,
                typePaiement: "CAISSE_TO_COFFRE",
                agenceId: caisse.agenceId,
                metadata: {
                    type: "LIQUIDATION_CAISSE",
                    caisseId: caisse.id,
                    coffreId: coffre.id,
                    caisseNom: caisse.nom,
                    description: `Liquidation Caisse ${caisse.nom} -> Coffre`,
                },
            }, userId);

            // Debit Caisse
            await tx.update(schema.caisses)
                .set({ solde: "0" })
                .where(eq(schema.caisses.id, id));

            // Credit Coffre
            await tx.update(schema.coffresForts)
                .set({ solde: sql`${schema.coffresForts.solde} + ${amount}` })
                .where(eq(schema.coffresForts.id, coffre.id));

            // GL Posting (bloquant — échoue si pas de règle comptable)
            if (caisse.agenceId) {
                await postGlForMouvement(tx, mouvement, caisse.agenceId, userId, {
                    type: "LIQUIDATION_CAISSE",
                    caisseId: caisse.id,
                    coffreId: coffre.id,
                });
            }
        }

        // 4. Soft-delete Caisse (preserve audit trail)
        await tx.update(schema.caisses)
            .set({ deletedAt: new Date() })
            .where(eq(schema.caisses.id, id));
      });

      await logAudit(req, "LIQUIDATE", "caisses", id, { amount });

      res.json({ message: "Caisse liquidée et supprimée avec succès." });

    } catch (e: any) {
      logger.error({ err: e }, 'Erreur liquidation');
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * PATCH /api/caisses/:id/operating-hours
   * Met à jour les horaires d'ouverture d'une caisse (admin/chef d'agence)
   */
  /**
   * PATCH /api/caisses/:id/operating-hours
   */
  app.patch("/api/caisses/:id/operating-hours", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.session.user!;
      const data = normalizeKeysDeep(req.body) as any;

      // Validate operating days if provided
      if (data.operatingDays) {
        if (!Array.isArray(data.operatingDays)) {
          return res.status(400).json({ error: "Les jours d'ouverture doivent être un tableau" });
        }
        const validDays = data.operatingDays.every((d: any) => typeof d === 'number' && d >= 0 && d <= 6);
        if (!validDays) {
          return res.status(400).json({ error: "Les jours doivent être des nombres entre 0 (Dimanche) et 6 (Samedi)" });
        }
      }

      // Validate time format if provided
      const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
      if (data.operatingHoursStart && !timeRegex.test(data.operatingHoursStart)) {
        return res.status(400).json({ error: "Format d'heure de début invalide (HH:MM attendu)" });
      }
      if (data.operatingHoursEnd && !timeRegex.test(data.operatingHoursEnd)) {
        return res.status(400).json({ error: "Format d'heure de fin invalide (HH:MM attendu)" });
      }

      const caisse = await storage.getCaisse(id);
      if (!caisse) {
        return res.status(404).json({ error: "Caisse non trouvée" });
      }

      // Check agency access
      const isGlobalAdmin = req.ability?.can(Actions.MANAGE, 'all');
      if (!isGlobalAdmin && caisse.agenceId !== user.agenceId) {
        return res.status(403).json({ error: "Accès refusé à cette agence" });
      }

      const updateData: any = {};
      if (typeof data.operatingHoursEnabled === 'boolean') {
        updateData.operatingHoursEnabled = data.operatingHoursEnabled;
      }
      if (data.operatingHoursStart) {
        updateData.operatingHoursStart = data.operatingHoursStart;
      }
      if (data.operatingHoursEnd) {
        updateData.operatingHoursEnd = data.operatingHoursEnd;
      }
      if (data.operatingDays) {
        updateData.operatingDays = data.operatingDays;
      }

      const updated = await storage.updateCaisse(id, updateData);

      await logAudit(
        req,
        "CAISSE_OPERATING_HOURS_UPDATED",
        "caisse",
        id,
        updateData,
        "success",
        "medium"
      );

      res.json(updated);
    } catch (error: any) {
      logger.error({ err: error }, 'Error updating operating hours');
      res.status(500).json({ error: error.message });
    }
  });
}
