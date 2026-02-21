import type { Express, Request, Response } from "express";
import { z } from "zod";
import { createLogger } from "../lib/logger";

const logger = createLogger('Routes:Tontines');
import { insertTontineSchema, insertMembreTontineSchema, insertContributionTontineSchema,
    insertTontinePenaliteSchema,
    insertTontinePlanSchema,
    tontineCycles, tontineTurns, tontineSchedules, tontineDistributionRequests,
    membresTontine, tontinePenalites, tontines, contributionsTontine, TontinePayoutMethod,
    clients, holidayDates, holidayCalendars
} from "@shared/schema";
import { users } from "@shared/schema/auth";
import { employes } from "@shared/schema/employes";
import { storage } from "../storage";
import { requireAuth } from "../auth";
import { attachAbility, requireAbility } from "../authorization";
import { Actions, Subjects } from "@shared/ability";
import { requireAgenceAccess } from "../middleware";
import { normalizeKeysDeep } from "./utils";
import { getWsInstance } from "../ws-server";
import tontineProductionService from "../services/tontine-production-service";
import tontineLifecycleService from "../services/tontine-lifecycle-service";
import { generateTontineSchedulePreview, type TontineCalendarConfig } from "../services/tontine-schedule-engine";
import { copyPlanToTontineValues } from "../storage/tontines";
import { formatDateKey } from "../services/credit-plan/calendar-utils";
import { dispatchDomainEvent } from "../services/notifications/domain-events/event-registry";
import { generateTontineReminderSchedule } from "../services/notifications/tontine-reminder-service";
import { executeWithLedger, updateTontineSolde, updateSessionSolde } from "../services/ledger";
import { db } from "../db";
import { eq, and, asc, sql } from "drizzle-orm";

export function registerTontineRoutes(app: Express) {
  app.get("/api/tontines", requireAuth, requireAgenceAccess("agenceId"), async (req, res) => {
      // req.agenceFilter est injecté par requireAgenceAccess avec l'agenceId
      const agenceFilter = req.agenceFilter as { agenceId?: string } | null;

      // On passe le filtre directement au storage qui l'applique en SQL
      const filter = agenceFilter ? { agence: agenceFilter.agenceId } : {};
      const tontines = await storage.getAllTontines(filter);

      res.json(tontines);
  });

  // Create tontine (roles: admin, chef, superviseur)
  app.post("/api/tontines", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.TONTINE), requireAgenceAccess("agenceId"), async (req, res) => {
      const data = normalizeKeysDeep(req.body);
      const parsed = insertTontineSchema.parse(data);

      // Auto-inject agenceId from user session if not provided
      if (!parsed.agenceId && req.user?.agenceId) {
        (parsed as any).agenceId = req.user.agenceId;
      }

      // Le gestionnaire doit être de la même agence (sauf admin)
      const agenceFilter = req.agenceFilter as { agenceId?: string } | null;

      if (agenceFilter && parsed.gestionnaireId) {
        const [employe] = await db.select({ agenceId: employes.agenceId })
          .from(employes)
          .where(eq(employes.userId, parsed.gestionnaireId));
        if (!employe) {
          return res.status(403).json({ message: "Gestionnaire introuvable dans la table employes" });
        }
        if (agenceFilter.agenceId && employe.agenceId !== agenceFilter.agenceId) {
          return res.status(403).json({ message: "Le gestionnaire n'appartient pas a cette agence" });
        }
      }

      const tontine = await storage.createTontine(parsed);

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: 'tontine_new', id: tontine.id } });
      }

      res.json(tontine);
  });

  app.get("/api/tontines/:id", requireAuth, requireAgenceAccess("agenceId"), async (req, res) => {
      const tontine = await storage.getTontine(req.params.id);
      if (!tontine) return res.status(404).json({ message: "Tontine not found" });

      // Vérifier accès via gestionnaire
      const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
      if (agenceFilter && tontine.gestionnaireId) {
        const [employe] = await db.select({ agenceId: employes.agenceId })
          .from(employes)
          .where(eq(employes.userId, tontine.gestionnaireId));
        if (employe && agenceFilter.agenceId && employe.agenceId !== agenceFilter.agenceId) {
          return res.status(403).json({ message: "Acces refuse : gestionnaire d'une autre agence" });
        }
      }

      res.json(tontine);
  });

  // Update tontine (roles: admin, chef, superviseur)
  app.patch("/api/tontines/:id", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE), async (req, res) => {
      const data = normalizeKeysDeep(req.body);
      const tontine = await storage.getTontine(req.params.id);
      if (!tontine) return res.status(404).json({ message: "Tontine not found" });

      // Convert date strings to Date objects for timestamp columns
      const updateData: Record<string, any> = { ...(data as Record<string, any>) };
      if (updateData.dateDebut && typeof updateData.dateDebut === 'string') {
        updateData.dateDebut = new Date(updateData.dateDebut);
      }
      if (updateData.dateFin && typeof updateData.dateFin === 'string') {
        updateData.dateFin = new Date(updateData.dateFin);
      }
      if (updateData.prochainTour && typeof updateData.prochainTour === 'string') {
        updateData.prochainTour = new Date(updateData.prochainTour);
      }

      const updated = await storage.updateTontine(req.params.id, updateData);

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: 'tontine_updated', id: req.params.id } });
      }

      res.json(updated);
  });

  // Delete tontine (roles: admin, chef)
  app.delete("/api/tontines/:id", requireAuth, attachAbility, requireAbility(Actions.DELETE, Subjects.TONTINE), async (req, res) => {
      const tontine = await storage.getTontine(req.params.id);
      if (!tontine) return res.status(404).json({ message: "Tontine not found" });

      const success = await storage.deleteTontine(req.params.id);
      res.json({ success });
  });

  app.get("/api/tontines/:id/membres", requireAuth, async (req, res) => {
      const membres = await storage.getMembresTontine(req.params.id);
      res.json(membres);
  });

  // Add membre to tontine (roles: admin, chef, superviseur)
  app.post("/api/tontines/:id/membres", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.TONTINE_MEMBRE), async (req, res) => {
      const data = normalizeKeysDeep(req.body);
      const tontine = await storage.getTontine(req.params.id);
      if (!tontine) return res.status(404).json({ message: "Tontine not found" });

      const currentMembres = await storage.getMembresTontine(req.params.id);
      if (currentMembres.length >= tontine.nombreMembres) {
          return res.status(400).json({ message: "Le nombre maximum de membres pour cette tontine est atteint." });
      }

      const parsed = insertMembreTontineSchema.parse(Object.assign({}, data, { tontineId: req.params.id }));
      const membre = await storage.createMembreTontine(parsed);

      // Increment member count
      await storage.updateTontine(req.params.id, {
        membresActuels: sql`COALESCE(${tontines.membresActuels}, 0) + 1`,
      } as any);

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: 'membre_added', tontineId: req.params.id } });
      }

      // Domain event: member joined tontine
      if (membre.clientId) {
        dispatchDomainEvent({
          type: "TONTINE_MEMBER_JOINED",
          data: {
            tontineId: tontine.id,
            tontineName: tontine.nom,
            clientId: membre.clientId,
            montantCotisation: Number(tontine.montantCotisation || 0),
            frequence: tontine.frequence || 'Mensuelle',
            position: membre.position ?? undefined,
            agenceId: tontine.agenceId ?? undefined,
          },
          timestamp: new Date(),
        });
      }

      res.json(membre);
  });

  // Remove membre from tontine
  app.delete("/api/tontines/:id/membres/:membreId", requireAuth, attachAbility, requireAbility(Actions.DELETE, Subjects.TONTINE_MEMBRE), async (req, res) => {
      const success = await storage.updateMembreTontine(req.params.membreId, { statut: 'Retiré', deletedAt: new Date() } as any);

      // Decrement member count
      await storage.updateTontine(req.params.id, {
        membresActuels: sql`GREATEST(0, COALESCE(${tontines.membresActuels}, 0) - 1)`,
      } as any);

      res.json({ success: !!success });
  });

  // Update membre tontine (cotisation auto etc)
  app.patch("/api/tontines/:id/membres/:membreId", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE_MEMBRE), async (req, res) => {
      const data = normalizeKeysDeep(req.body);
      // Ensure tontine exists
      const tontine = await storage.getTontine(req.params.id);
      if (!tontine) return res.status(404).json({ message: "Tontine not found" });

      const updated = await storage.updateMembreTontine(req.params.membreId, data as any);
      res.json(updated);
  });

  // ============================================================================
  // LIFECYCLE STATE MACHINE
  // ============================================================================

  app.post("/api/tontines/:id/activate", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE), async (req, res) => {
    try {
      const result = await tontineLifecycleService.transitionStatus(
        req.params.id, "ACTIVE", req.session.user!.id, req.body.reason
      );
      const wsInstance = getWsInstance();
      if (wsInstance) wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: "status_changed", id: req.params.id } });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/tontines/:id/pause", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE), async (req, res) => {
    try {
      const result = await tontineLifecycleService.transitionStatus(
        req.params.id, "PAUSED", req.session.user!.id, req.body.reason
      );
      const wsInstance = getWsInstance();
      if (wsInstance) wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: "status_changed", id: req.params.id } });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/tontines/:id/resume", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE), async (req, res) => {
    try {
      const result = await tontineLifecycleService.transitionStatus(
        req.params.id, "ACTIVE", req.session.user!.id, req.body.reason
      );
      const wsInstance = getWsInstance();
      if (wsInstance) wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: "status_changed", id: req.params.id } });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/tontines/:id/complete", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE), async (req, res) => {
    try {
      const result = await tontineLifecycleService.transitionStatus(
        req.params.id, "COMPLETED", req.session.user!.id, req.body.reason
      );
      const wsInstance = getWsInstance();
      if (wsInstance) wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: "status_changed", id: req.params.id } });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/tontines/:id/cancel", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE), async (req, res) => {
    try {
      const result = await tontineLifecycleService.transitionStatus(
        req.params.id, "CANCELLED", req.session.user!.id, req.body.reason
      );
      const wsInstance = getWsInstance();
      if (wsInstance) wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: "status_changed", id: req.params.id } });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ============================================================================
  // MEMBER EXIT/REPLACEMENT WORKFLOW
  // ============================================================================

  app.post("/api/tontines/:id/membres/:membreId/request-exit", requireAuth, async (req, res) => {
    try {
      const result = await tontineLifecycleService.requestMemberExit(
        req.params.id, req.params.membreId, req.session.user!.id
      );
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/tontines/:id/membres/:membreId/approve-exit", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE_MEMBRE), async (req, res) => {
    try {
      const result = await tontineLifecycleService.approveMemberExit(
        req.params.id, req.params.membreId, req.session.user!.id
      );
      const wsInstance = getWsInstance();
      if (wsInstance) wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: "member_exit", tontineId: req.params.id } });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/tontines/:id/membres/:membreId/replace", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE_MEMBRE), async (req, res) => {
    try {
      const { newClientId } = req.body;
      if (!newClientId) return res.status(400).json({ message: "newClientId requis" });

      const result = await tontineLifecycleService.replaceMember(
        req.params.id, req.params.membreId, newClientId, req.session.user!.id
      );
      const wsInstance = getWsInstance();
      if (wsInstance) wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: "member_replaced", tontineId: req.params.id } });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ROLE MANAGEMENT
  app.patch("/api/tontines/:id/membres/:membreId/role", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE_MEMBRE), async (req, res) => {
    try {
      const { role } = req.body;
      await tontineLifecycleService.assignMemberRole(req.params.id, req.params.membreId, role || null);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/tontines/:id/contributions", requireAuth, async (req, res) => {
      const contribs = await storage.getContributionsByTontine(req.params.id);
      res.json(contribs);
  });

  // Create contribution tontine (roles: admin, chef, caisse, superviseur)
  app.post("/api/contributions-tontine", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.TONTINE_CONTRIBUTION), async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body);
        const parsed = insertContributionTontineSchema.parse(data);

        let sessionCaisseId = undefined;

        // If Cash, we need an active session
        const isCash = parsed.methodePaiement === 'CASH';
        if (isCash) {
            const activeSession = await storage.getActiveSessionForUser(req.session.user!.id);
            if (!activeSession) {
                return res.status(400).json({ message: "Vous devez avoir une caisse ouverte pour encaisser des espèces." });
            }
            sessionCaisseId = activeSession.id;
        }
        // Mobile Money contributions don't require a caisse session

        const contrib = await storage.createContributionTontineWithLedger(parsed, sessionCaisseId, req.session.user!.id);

        // Notify
        const wsInstance = getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: 'contribution_new', tontineId: parsed.tontineId } });
            // Refresh Dashboard as cash balance changed
            if (sessionCaisseId) {
                 wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
            }
        }

        // Domain event: contribution received + scoring
        if (parsed.clientId) {
          const tontineInfo = await storage.getTontine(parsed.tontineId);
          dispatchDomainEvent({
            type: "TONTINE_CONTRIBUTION_RECEIVED",
            data: {
              tontineId: parsed.tontineId,
              tontineName: tontineInfo?.nom || 'Tontine',
              clientId: parsed.clientId,
              montant: Number(parsed.montant || 0),
              tourNumero: parsed.tourNumero ?? undefined,
              reference: (contrib as any)?.reference,
              agenceId: tontineInfo?.agenceId ?? undefined,
            },
            timestamp: new Date(),
          });

          // Score event: tontine contribution
          try {
            const { recordScoreEvent } = await import('../services/scoring-engine');
            await recordScoreEvent({
              clientId: parsed.clientId,
              agenceId: tontineInfo?.agenceId ?? undefined,
              eventType: 'TONTINE_CONTRIBUTION',
              refId: (contrib as any)?.id || (contrib as any)?.reference || `tontine-${parsed.tontineId}-${Date.now()}`,
              refType: 'contribution_tontine',
              montant: Number(parsed.montant || 0),
              metadata: { tontineId: parsed.tontineId, tontineName: tontineInfo?.nom },
              createdBy: req.session.user!.id,
            });
          } catch (err) {
            logger.error({ err }, 'Scoring event error (tontine contribution)');
          }
        }

        res.json(contrib);
      } catch (e: any) {
        logger.error({ err: e }, 'Erreur contribution tontine');
        res.status(400).json({ message: e.message || "Erreur lors de l'enregistrement de la contribution" });
      }
  });

  // Get tontines for a specific client (their memberships)
  app.get("/api/clients/:id/tontines", requireAuth, async (req, res) => {
    const tontines = await storage.getTontinesByClient(req.params.id);
    res.json(tontines);
  });

  // Tontine Penalites
  app.get("/api/tontines/:id/penalites", requireAuth, async (req, res) => {
    const penalites = await storage.getTontinePenalites(req.params.id);
    res.json(penalites);
  });

  app.patch("/api/tontine-penalites/:id", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE), async (req, res) => {
    const data = normalizeKeysDeep(req.body);
    const parsed = insertTontinePenaliteSchema.partial().parse(data);
    const updated = await storage.updateTontinePenalite(req.params.id, parsed);

    // Notify
    const wsInstance = getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: 'penalite_updated', id: req.params.id } });
    }

    res.json(updated);
  });

  /**
   * GAP #4 FIX: Pay a tontine penalty through the ledger.
   * Creates a mouvement financier, posts to GL, and emits WS events.
   */
  app.post("/api/tontines/:tontineId/penalites/:penaliteId/pay", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE), async (req, res) => {
    try {
      const { tontineId, penaliteId } = req.params;
      const userId = req.session.user?.id;
      const { sessionCaisseId, methodePaiement = "CASH" } = req.body;

      // 1. Load penalty
      const [penalite] = await db
        .select()
        .from(tontinePenalites)
        .where(eq(tontinePenalites.id, penaliteId));

      if (!penalite) {
        return res.status(404).json({ message: "Pénalité introuvable" });
      }

      if (penalite.statut === "PAID" || penalite.statut === "paye") {
        return res.status(409).json({ message: "Pénalité déjà payée" });
      }

      if (penalite.statut === "WAIVED" || penalite.statut === "CANCELLED") {
        return res.status(409).json({ message: "Pénalité annulée ou exonérée" });
      }

      // 2. Load tontine for agenceId
      const [tontine] = await db
        .select()
        .from(tontines)
        .where(eq(tontines.id, tontineId));

      if (!tontine) {
        return res.status(404).json({ message: "Tontine introuvable" });
      }

      // 3. Load member for clientId
      const membre = await storage.getMembreTontineById(penalite.membreId);

      if (!membre) {
        return res.status(404).json({ message: "Membre introuvable" });
      }

      const montant = Number(penalite.montant);

      // 4. Execute through ledger
      const { result, mouvement } = await executeWithLedger(
        "TONTINE",
        {
          montant: montant.toString(),
          sens: "CREDIT",
          clientId: membre.clientId,
          tontineId,
          sessionCaisseId: methodePaiement === "CASH" ? sessionCaisseId : undefined,
          typePaiement: "TONTINE_PENALTY",
          methodePaiement,
          agenceId: tontine.agenceId ?? undefined,
          idempotencyKey: `PENALTY-PAY-${penaliteId}`,
          metadata: {
            description: `Paiement pénalité tontine "${tontine.nom}"`,
            penaliteId,
            penaltyType: penalite.penaltyType,
          },
        },
        async (tx, mouvement) => {
          // a. Update penalty status
          await tx
            .update(tontinePenalites)
            .set({
              statut: "PAID",
              datePaiement: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(tontinePenalites.id, penaliteId));

          // b. Update tontine solde (penalty goes to pot)
          const nouveauSoldeTontine = await updateTontineSolde(tx, tontineId, montant);

          // c. Update session caisse solde if cash payment
          let nouveauSoldeSession: string | undefined;
          if (methodePaiement === "CASH" && sessionCaisseId) {
            nouveauSoldeSession = await updateSessionSolde(tx, sessionCaisseId, montant);
          }

          return {
            result: { penaliteId, montant, tontineId },
            additionalEventData: {
              nouveauSoldeTontine,
              nouveauSoldeSession,
            },
          };
        },
        userId
      );

      // 5. Score event — partial rehabilitation for paying off penalty
      try {
        const { recordScoreEvent } = await import('../services/scoring-engine');
        await recordScoreEvent({
          clientId: membre.clientId,
          agenceId: tontine.agenceId ?? undefined,
          eventType: 'TONTINE_CONTRIBUTION',
          refId: `penalite-paid-${penaliteId}`,
          refType: 'tontine_penalite',
          montant,
          createdBy: userId,
        });
      } catch (scoreErr) {
        logger.error({ err: scoreErr, penaliteId }, 'Failed to record penalty payment score event');
      }

      // 6. WS notifications
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "TONTINE_UPDATE",
          payload: { type: "penalite_paid", penaliteId, tontineId, montant },
        });
      }

      res.json({
        success: true,
        penaliteId,
        mouvementId: mouvement.id,
        montant,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erreur paiement pénalité";
      logger.error({ message }, 'TontinePenalitePay error');

      if (message.includes("Duplicate idempotency")) {
        return res.status(409).json({ message: "Pénalité déjà payée (idempotency)" });
      }

      res.status(500).json({ message });
    }
  });

  /**
   * GAP #6 FIX: Reconciliation endpoint.
   * Compares tontines.solde vs SUM(contributions) - SUM(distributions).
   */
  app.get("/api/tontines/:id/reconciliation", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.TONTINE), async (req, res) => {
    try {
      const tontineId = req.params.id;

      // 1. Load tontine solde
      const [tontine] = await db
        .select({ id: tontines.id, nom: tontines.nom, solde: tontines.solde })
        .from(tontines)
        .where(eq(tontines.id, tontineId));

      if (!tontine) {
        return res.status(404).json({ message: "Tontine introuvable" });
      }

      // 2. SUM contributions POSTED
      const [contribResult] = await db
        .select({ total: sql<string>`COALESCE(SUM(${contributionsTontine.montant}::numeric), 0)` })
        .from(contributionsTontine)
        .where(
          and(
            eq(contributionsTontine.tontineId, tontineId),
            eq(contributionsTontine.statutTransaction, "POSTED")
          )
        );

      // 3. SUM distributions SUCCESS/PARTIAL (from distribution requests)
      const [distribResult] = await db
        .select({ total: sql<string>`COALESCE(SUM(${tontineDistributionRequests.amountPaid}::numeric), 0)` })
        .from(tontineDistributionRequests)
        .where(
          and(
            eq(tontineDistributionRequests.tontineId, tontineId),
            sql`${tontineDistributionRequests.status} IN ('SUCCESS', 'PARTIAL')`
          )
        );

      // 4. SUM penalties PAID (now tracked through ledger)
      const [penaltyResult] = await db
        .select({ total: sql<string>`COALESCE(SUM(${tontinePenalites.montant}::numeric), 0)` })
        .from(tontinePenalites)
        .where(
          and(
            eq(tontinePenalites.tontineId, tontineId),
            sql`${tontinePenalites.statut} IN ('PAID', 'paye')`
          )
        );

      const soldeCourant = Number(tontine.solde || "0");
      const totalContributions = Number(contribResult.total);
      const totalDistributions = Number(distribResult.total);
      const totalPenalties = Number(penaltyResult.total);

      // Expected = contributions + penalties - distributions
      const soldeCalcule = totalContributions + totalPenalties - totalDistributions;
      const ecart = Math.abs(soldeCourant - soldeCalcule);
      const isReconciled = ecart < 0.01;

      // 5. Per-member check
      const memberChecks = await db
        .select({
          membreId: membresTontine.id,
          clientId: membresTontine.clientId,
          totalCotisationsStored: membresTontine.totalCotisations,
          totalCotisationsComputed: sql<string>`COALESCE(SUM(${contributionsTontine.montant}::numeric), 0)`,
        })
        .from(membresTontine)
        .leftJoin(
          contributionsTontine,
          and(
            eq(contributionsTontine.membreId, membresTontine.id),
            eq(contributionsTontine.statutTransaction, "POSTED")
          )
        )
        .where(eq(membresTontine.tontineId, tontineId))
        .groupBy(membresTontine.id, membresTontine.clientId, membresTontine.totalCotisations);

      const memberDiscrepancies = memberChecks
        .filter((m) => {
          const stored = Number(m.totalCotisationsStored || "0");
          const computed = Number(m.totalCotisationsComputed);
          return Math.abs(stored - computed) >= 0.01;
        })
        .map((m) => ({
          membreId: m.membreId,
          clientId: m.clientId,
          stored: Number(m.totalCotisationsStored || "0"),
          computed: Number(m.totalCotisationsComputed),
          ecart: Number(m.totalCotisationsStored || "0") - Number(m.totalCotisationsComputed),
        }));

      res.json({
        tontineId,
        tontineName: tontine.nom,
        soldeCourant,
        soldeCalcule,
        ecart,
        isReconciled,
        details: {
          totalContributions,
          totalDistributions,
          totalPenalties,
        },
        memberDiscrepancies,
        memberDiscrepancyCount: memberDiscrepancies.length,
        checkedAt: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erreur réconciliation";
      logger.error({ message }, 'TontineReconciliation error');
      res.status(500).json({ message });
    }
  });

  // Tontine Plans
  app.get("/api/tontine-plans", requireAuth, async (req, res) => {
    const plans = await storage.getAllTontinePlans();
    res.json(plans);
  });

  app.get("/api/tontine-plans/:id", requireAuth, async (req, res) => {
    const plan = await storage.getTontinePlan(req.params.id);
    if (!plan) return res.status(404).json({ message: "Plan introuvable" });
    res.json(plan);
  });

  app.post("/api/tontine-plans", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.TONTINE), async (req, res) => {
    try {
      const data = normalizeKeysDeep(req.body);
      const parsed = insertTontinePlanSchema.parse(data);
      const plan = await storage.createTontinePlan(parsed);
      res.json(plan);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Erreur de validation",
          errors: error.errors
        });
      }
      res.status(500).json({ message: "Erreur interne du serveur lors de la création du plan" });
    }
  });

  app.patch("/api/tontine-plans/:id", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE), async (req, res) => {
    const data = normalizeKeysDeep(req.body);
    const updated = await storage.updateTontinePlan(req.params.id, data as any);
    res.json(updated);
  });

  app.delete("/api/tontine-plans/:id", requireAuth, attachAbility, requireAbility(Actions.DELETE, Subjects.TONTINE), async (req, res) => {
    const success = await storage.deleteTontinePlan(req.params.id);
    res.json({ success });
  });

  // Create a tontine group pre-filled from a plan template
  app.post("/api/tontines/from-plan/:planId", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.TONTINE), async (req: Request, res: Response) => {
    try {
      const plan = await storage.getTontinePlan(req.params.planId);
      if (!plan) return res.status(404).json({ message: "Modele introuvable" });

      const planValues = copyPlanToTontineValues(plan);
      const overrides = normalizeKeysDeep(req.body);
      const merged = { ...planValues, ...overrides };

      const parsed = insertTontineSchema.parse(merged);
      const tontine = await storage.createTontine(parsed);
      res.json(tontine);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Erreur de validation", errors: error.errors });
      }
      logger.error({ err: error }, 'Erreur creation tontine depuis plan');
      res.status(500).json({ message: error.message || "Erreur interne" });
    }
  });

  // ============================================================================
  // PRODUCTION-READY TONTINE ENDPOINTS
  // ============================================================================

  // --- CYCLES ---

  // List cycles for a tontine
  app.get("/api/tontines/:id/cycles", requireAuth, async (req: Request, res: Response) => {
    try {
      const cycles = await storage.getCyclesByTontine(req.params.id);

      res.json(cycles);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur chargement cycles');
      res.status(500).json({ message: error.message || "Erreur chargement cycles" });
    }
  });

  // Generate a new cycle (with schedules and turns)
  app.post("/api/tontines/:id/cycles/generate", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.TONTINE), async (req: Request, res: Response) => {
    try {
      const agenceId = req.user?.agenceId || (req.session.user as any)?.agenceId;
      const userId = req.session.user?.id;

      if (!agenceId) {
        return res.status(400).json({ message: "Agence non définie" });
      }

      const { startDate, randomSeed } = req.body;

      const result = await tontineProductionService.generateCycle({
        tontineId: req.params.id,
        agenceId,
        userId: userId!,
        startDate: startDate ? new Date(startDate) : undefined,
        randomSeed: randomSeed ? parseInt(randomSeed) : undefined,
      });

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "TONTINE_UPDATE",
          payload: {
            type: 'cycle_generated',
            tontineId: req.params.id,
            cycleId: result.cycleId,
            turnsCount: result.turnsCreated,
          }
        });
      }

      // Domain event: cycle started — notify all members
      const tontineForCycle = await storage.getTontine(req.params.id);
      if (tontineForCycle) {
        // Get cycle number from DB
        const [cycleData] = await db
          .select({ cycleNumber: tontineCycles.cycleNumber })
          .from(tontineCycles)
          .where(eq(tontineCycles.id, result.cycleId))
          .limit(1);

        dispatchDomainEvent({
          type: "TONTINE_CYCLE_STARTED",
          data: {
            tontineId: req.params.id,
            tontineName: tontineForCycle.nom,
            cycleNumber: cycleData?.cycleNumber || 1,
            startDate: startDate
              ? new Date(startDate).toLocaleDateString("fr-FR")
              : new Date().toLocaleDateString("fr-FR"),
            membersCount: result.turnsCreated || 0,
            agenceId,
          },
          timestamp: new Date(),
        });

        // Generate SMS reminder schedules for all active members
        generateTontineReminderSchedule(req.params.id).catch((err: unknown) => {
          logger.error({ err, tontineId: req.params.id }, 'TontineReminder failed to generate reminders');
        });
      }

      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur génération cycle');
      res.status(400).json({ message: error.message || "Erreur génération cycle" });
    }
  });

  // Get cycle details
  app.get("/api/tontines/:id/cycles/:cycleId", requireAuth, async (req: Request, res: Response) => {
    try {
      const cycle = await storage.getCycle(req.params.id, req.params.cycleId);

      if (!cycle) {
        return res.status(404).json({ message: "Cycle non trouvé" });
      }

      res.json(cycle);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur chargement cycle');
      res.status(500).json({ message: error.message || "Erreur chargement cycle" });
    }
  });

  // Close a cycle
  app.post("/api/tontines/:id/cycles/:cycleId/close", requireAuth, attachAbility, requireAbility(Actions.CLOSE, Subjects.TONTINE), async (req: Request, res: Response) => {
    try {
      const userId = req.session.user?.id;

      const updated = await storage.closeCycle(req.params.id, req.params.cycleId, userId!);

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "TONTINE_UPDATE",
          payload: { type: 'cycle_closed', tontineId: req.params.id, cycleId: req.params.cycleId }
        });
      }

      res.json(updated);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur clôture cycle');
      res.status(400).json({ message: error.message || "Erreur clôture cycle" });
    }
  });

  // --- TURNS ---

  // List turns for a cycle
  app.get("/api/tontines/:id/cycles/:cycleId/turns", requireAuth, async (req: Request, res: Response) => {
    try {
      const turns = await storage.getTurnsByCycle(req.params.id, req.params.cycleId);

      res.json(turns);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur chargement tours');
      res.status(500).json({ message: error.message || "Erreur chargement tours" });
    }
  });

  // Reorder turns
  app.post("/api/tontines/:id/cycles/:cycleId/turns/reorder", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE), async (req: Request, res: Response) => {
    try {
      const agenceId = req.user?.agenceId || (req.session.user as any)?.agenceId;
      const userId = req.session.user?.id;

      if (!agenceId) {
        return res.status(400).json({ message: "Agence non définie" });
      }

      const { newOrder, reason } = req.body;

      if (!newOrder || !Array.isArray(newOrder)) {
        return res.status(400).json({ message: "newOrder requis (array)" });
      }

      if (!reason || reason.trim().length === 0) {
        return res.status(400).json({ message: "Motif de réorganisation requis" });
      }

      const result = await tontineProductionService.reorderTurns({
        tontineId: req.params.id,
        cycleId: req.params.cycleId,
        agenceId,
        userId: userId!,
        newOrder,
        reason,
      });

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "TONTINE_UPDATE",
          payload: {
            type: 'turns_reordered',
            tontineId: req.params.id,
            cycleId: req.params.cycleId,
            affectedTurns: result.affectedTurns,
          }
        });
      }

      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur réorganisation tours');
      res.status(400).json({ message: error.message || "Erreur réorganisation tours" });
    }
  });

  // Get turn audit history
  app.get("/api/tontines/:id/cycles/:cycleId/audit", requireAuth, async (req: Request, res: Response) => {
    try {
      const audits = await storage.getTurnAuditByCycle(req.params.id, req.params.cycleId);

      res.json(audits);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur chargement audit');
      res.status(500).json({ message: error.message || "Erreur chargement audit" });
    }
  });

  // --- SCHEDULES ---

  // List schedules for a cycle
  app.get("/api/tontines/:id/cycles/:cycleId/schedules", requireAuth, async (req: Request, res: Response) => {
    try {
      const schedules = await storage.getSchedulesByCycle(req.params.id, req.params.cycleId);

      res.json(schedules);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur chargement schedules');
      res.status(500).json({ message: error.message || "Erreur chargement schedules" });
    }
  });

  // --- ECHEANCES (Calendar) ---
  // Returns turn-level schedule data for the frontend TontineCalendar component.
  // Uses the active (OPEN) cycle's turns joined with beneficiary info.
  app.get("/api/tontines/:id/echeances", requireAuth, async (req: Request, res: Response) => {
    try {
      const tontineId = req.params.id;

      // Find the active cycle
      const cycle = await storage.getActiveCycle(tontineId);

      if (!cycle) {
        return res.json([]);
      }

      // Get all turns for this cycle with beneficiary info
      const turns = await db
        .select({
          turnNumber: tontineTurns.turnNumber,
          dueDate: tontineTurns.dueDate,
          status: tontineTurns.status,
          beneficiaryMemberId: tontineTurns.beneficiaryMemberId,
          amountExpected: tontineTurns.amountExpected,
          amountPaidOut: tontineTurns.amountPaidOut,
          clientNom: users.nom,
          clientPrenom: users.prenom,
        })
        .from(tontineTurns)
        .leftJoin(membresTontine, eq(tontineTurns.beneficiaryMemberId, membresTontine.id))
        .leftJoin(clients, eq(membresTontine.clientId, clients.id))
        .leftJoin(users, eq(clients.userId, users.id))
        .where(and(eq(tontineTurns.tontineId, tontineId), eq(tontineTurns.cycleId, cycle.id)))
        .orderBy(asc(tontineTurns.turnNumber));

      // Get schedule contribution counts keyed by periodNumber
      const schedules = await db
        .select({
          periodNumber: tontineSchedules.periodNumber,
          membersPaidCount: tontineSchedules.membersPaidCount,
          totalCollected: tontineSchedules.totalCollected,
          scheduleStatus: tontineSchedules.status,
        })
        .from(tontineSchedules)
        .where(and(eq(tontineSchedules.tontineId, tontineId), eq(tontineSchedules.cycleId, cycle.id)))
        .orderBy(asc(tontineSchedules.periodNumber));

      const scheduleMap = new Map(schedules.map((s) => [s.periodNumber, s]));

      const echeances = turns.map((turn) => {
        const sched = scheduleMap.get(turn.turnNumber);
        const beneficiaire = turn.clientNom
          ? `${turn.clientNom} ${turn.clientPrenom || ""}`.trim()
          : null;

        return {
          tour: turn.turnNumber,
          date: turn.dueDate,
          beneficiaire,
          statut: turn.status,
          contributions_recues: sched?.membersPaidCount ?? 0,
          contributions_attendues: cycle.membersCount,
          montant_attendu: turn.amountExpected,
          montant_verse: turn.amountPaidOut,
          total_collecte: sched?.totalCollected ?? "0",
        };
      });

      res.json(echeances);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erreur chargement échéances";
      logger.error({ err: error }, 'Erreur chargement échéances');
      res.status(500).json({ message });
    }
  });

  // --- RETIRABLE ---

  // Calculate retirable amount for a member
  app.get("/api/tontines/:id/retirable/:memberId", requireAuth, async (req: Request, res: Response) => {
    try {
      const result = await tontineProductionService.calculateRetirable(
        req.params.id,
        req.params.memberId
      );

      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur calcul retirable');
      res.status(500).json({ message: error.message || "Erreur calcul retirable" });
    }
  });

  // --- DISTRIBUTION REQUESTS (V2) ---

  // List distribution requests for a tontine
  app.get("/api/tontines/:id/distribution-requests", requireAuth, async (req: Request, res: Response) => {
    try {
      const { cycleId, status } = req.query;

      const filtered = await storage.getDistributionRequests(req.params.id, {
        cycleId: cycleId as string | undefined,
        status: status as string | undefined,
      });

      res.json(filtered);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur chargement distribution requests');
      res.status(500).json({ message: error.message || "Erreur chargement" });
    }
  });

  // Create a distribution request
  app.post("/api/tontines/:id/distribution-requests", requireAuth, attachAbility, requireAbility(Actions.DISTRIBUTE, Subjects.TONTINE), async (req: Request, res: Response) => {
    try {
      const agenceId = req.user?.agenceId || (req.session.user as any)?.agenceId;
      const userId = req.session.user?.id;

      if (!agenceId) {
        return res.status(400).json({ message: "Agence non définie" });
      }

      const {
        cycleId,
        turnId,
        beneficiaryMemberId,
        payoutMethod,
        provider,
        targetMsisdn,
        targetWalletAccountId,
        notes,
      } = req.body;

      if (!cycleId || !turnId || !beneficiaryMemberId || !payoutMethod) {
        return res.status(400).json({ message: "cycleId, turnId, beneficiaryMemberId, payoutMethod requis" });
      }

      const result = await tontineProductionService.createDistributionRequest({
        tontineId: req.params.id,
        cycleId,
        turnId,
        beneficiaryMemberId,
        agenceId,
        userId: userId!,
        payoutMethod: payoutMethod as TontinePayoutMethod,
        provider,
        targetMsisdn,
        targetWalletAccountId,
        notes,
      });

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "TONTINE_UPDATE",
          payload: {
            type: 'distribution_request_created',
            tontineId: req.params.id,
            requestId: result.requestId,
            status: result.status,
          }
        });
      }

      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur création distribution request');
      res.status(400).json({ message: error.message || "Erreur création" });
    }
  });

  // Approve and execute a distribution request
  app.post("/api/tontines/:id/distribution-requests/:requestId/approve", requireAuth, attachAbility, requireAbility(Actions.APPROVE, Subjects.TONTINE), async (req: Request, res: Response) => {
    try {
      const agenceId = req.user?.agenceId || (req.session.user as any)?.agenceId;
      const userId = req.session.user?.id;

      if (!agenceId) {
        return res.status(400).json({ message: "Agence non définie" });
      }

      // Get active session for cash distributions
      let sessionCaisseId: string | undefined;
      const activeSession = await storage.getActiveSessionForUser(userId!);
      if (activeSession) {
        sessionCaisseId = activeSession.id;
      }

      const result = await tontineProductionService.approveDistribution({
        requestId: req.params.requestId,
        agenceId,
        userId: userId!,
        sessionCaisseId,
      });

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "TONTINE_UPDATE",
          payload: {
            type: 'distribution_approved',
            tontineId: req.params.id,
            requestId: result.requestId,
            status: result.status,
            amountPaid: result.netAmount,
          }
        });

        if (sessionCaisseId) {
          wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
        }
      }

      // Domain event: distribution paid — look up beneficiary info
      if (result.status === 'SUCCESS' || result.status === 'PARTIAL') {
        try {
          const distReq = await storage.getDistributionRequest(result.requestId);
          if (distReq) {
            const tontineForDist = await storage.getTontine(req.params.id);
            const benefMember = await storage.getMembreTontineById(distReq.beneficiaryMemberId);
            const clientId = benefMember?.clientId;
            if (clientId && tontineForDist) {
              dispatchDomainEvent({
                type: "TONTINE_DISTRIBUTION_PAID",
                data: {
                  tontineId: req.params.id,
                  tontineName: tontineForDist.nom,
                  clientId,
                  montant: result.netAmount || 0,
                  reference: result.paymentIntentId || result.requestId.substring(0, 8).toUpperCase(),
                  payoutMethod: distReq.payoutMethod || 'CASH',
                  agenceId,
                },
                timestamp: new Date(),
              });
            }
          }
        } catch (e) { /* non-blocking */ }
      }

      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur approbation distribution');
      res.status(400).json({ message: error.message || "Erreur approbation" });
    }
  });

  // Cancel a distribution request
  app.post("/api/tontines/:id/distribution-requests/:requestId/cancel", requireAuth, attachAbility, requireAbility(Actions.CANCEL, Subjects.TONTINE), async (req: Request, res: Response) => {
    try {
      const { reason } = req.body;

      const updated = await storage.cancelDistributionRequest(req.params.requestId, reason);

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "TONTINE_UPDATE",
          payload: {
            type: 'distribution_cancelled',
            tontineId: req.params.id,
            requestId: req.params.requestId,
          }
        });
      }

      res.json(updated);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur annulation distribution');
      res.status(400).json({ message: error.message || "Erreur annulation" });
    }
  });

  // --- DASHBOARD V2 ---

  // Get tontine dashboard stats (V2 with cycles)
  app.get("/api/tontines/:id/dashboard", requireAuth, async (req: Request, res: Response) => {
    try {
      // Get tontine with stats
      const tontine = await storage.getTontine(req.params.id);
      if (!tontine) {
        return res.status(404).json({ message: "Tontine non trouvée" });
      }

      // Get current cycle
      let currentCycle = null;
      if (tontine.currentCycleId) {
        currentCycle = await storage.getCycleById(tontine.currentCycleId) || null;
      }

      // Get next turn
      let nextTurn = null;
      if (currentCycle) {
        nextTurn = await storage.getNextScheduledTurn(currentCycle.id) || null;
      }

      // Get pending distribution requests
      const pendingCount = await storage.getPendingDistributionCount(req.params.id);

      res.json({
        tontine,
        currentCycle,
        nextTurn,
        pendingDistributions: pendingCount,
        stats: {
          potCollecte: currentCycle?.potCollected || tontine.solde || "0",
          potDistribue: currentCycle?.potDistributed || "0",
          membresActifs: currentCycle?.membersCount || tontine.membresActuels || 0,
        },
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur dashboard tontine');
      res.status(500).json({ message: error.message || "Erreur dashboard" });
    }
  });

  // ============================================================================
  // HOLIDAY CALENDARS (read-only list for selectors)
  // ============================================================================

  app.get("/api/holiday-calendars", requireAuth, async (_req: Request, res: Response) => {
    try {
      const calendars = await db.select({
        id: holidayCalendars.id,
        nom: holidayCalendars.nom,
        description: holidayCalendars.description,
      })
        .from(holidayCalendars)
        .where(eq(holidayCalendars.isActive, true))
        .orderBy(asc(holidayCalendars.nom));
      res.json(calendars);
    } catch (error: any) {
      logger.error({ err: error }, "Erreur chargement holiday calendars");
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // SCHEDULE PREVIEW (read-only, no persistence)
  // ============================================================================

  const schedulePreviewSchema = z.object({
    startDate: z.string(),
    config: z.object({
      firstContributionRule: z.string().default("ON_START_DATE"),
      gracePeriodContribution: z.coerce.number().default(0),
      collectionCalendarMode: z.string().default("ALL_DAYS"),
      weekdaysMask: z.coerce.number().default(127),
      shiftNonWorkingDay: z.string().default("NEXT"),
      timezone: z.string().default("Africa/Brazzaville"),
      frequence: z.string(),
      intervalleCotisation: z.coerce.number().default(1),
      preferredWeekday: z.coerce.number().nullable().optional(),
      distributionType: z.string().default("ROTATIVE_SUSU"),
      payoutFrequency: z.string().default("SAME_AS_CONTRIBUTION"),
      payoutDayRule: z.string().nullable().optional(),
      nombreMembres: z.coerce.number().min(1),
    }),
    holidayCalendarId: z.string().uuid().optional(),
    customFirstDate: z.string().optional(),
  });

  app.post("/api/tontine-schedule/preview", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = schedulePreviewSchema.parse(req.body);

      // Load holidays if a calendar is specified
      let holidays: Set<string> | undefined;
      if (parsed.holidayCalendarId) {
        const dates = await db.select({ date: holidayDates.date })
          .from(holidayDates)
          .where(eq(holidayDates.calendarId, parsed.holidayCalendarId));
        holidays = new Set(dates.map(d => typeof d.date === "string" ? d.date : formatDateKey(new Date(d.date))));
      }

      const startDate = new Date(parsed.startDate);
      const customFirst = parsed.customFirstDate ? new Date(parsed.customFirstDate) : undefined;

      const preview = generateTontineSchedulePreview(
        startDate,
        parsed.config as TontineCalendarConfig,
        holidays,
        customFirst,
      );

      res.json(preview);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Données invalides", errors: error.errors });
      }
      logger.error({ err: error }, 'Erreur preview schedule tontine');
      res.status(500).json({ message: error.message || "Erreur génération preview" });
    }
  });
}
