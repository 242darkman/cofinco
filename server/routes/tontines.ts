import type { Express, Request, Response } from "express";
import { z } from "zod";
import { insertTontineSchema, insertMembreTontineSchema, insertContributionTontineSchema, insertTontineAlerteSchema,
    insertTontineRegleSchema, insertTontinePenaliteSchema, insertTontineDistributionSchema,
    insertTontinePlanSchema,
    tontineCycles, tontineTurns, tontineSchedules, tontineDistributionRequests, tontineTurnAudit,
    TontinePayoutMethod
} from "@shared/schema";
import { storage } from "../storage";
import { requireAuth } from "../auth";
import { attachAbility, requireAbility } from "../authorization";
import { Actions, Subjects } from "@shared/ability";
import { requireAgenceAccess } from "../middleware";
import { normalizeKeysDeep, addSnakeCaseAliasesDeep } from "./utils";
import { getWsInstance } from "../ws-server";
import tontineProductionService from "../services/tontine-production-service";
import { db } from "../db";
import { eq, and, desc, asc } from "drizzle-orm";

export function registerTontineRoutes(app: Express) {
  app.get("/api/tontines", requireAuth, requireAgenceAccess(), async (req, res) => {
      // req.agenceFilter est injecté par requireAgenceAccess
      // Ex: { agence: "Siège" } ou null (admin)
      const agenceFilter = req.agenceFilter as { agence?: string } | null;

      // On passe le filtre directement au storage qui l'applique en SQL (jointure gestionnaire)
      const filter = agenceFilter ? { agence: agenceFilter.agence } : {};
      const tontines = await storage.getAllTontines(filter);

      res.json(addSnakeCaseAliasesDeep(tontines));
  });

  // Create tontine (roles: admin, chef, superviseur)
  app.post("/api/tontines", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.TONTINE), requireAgenceAccess(), async (req, res) => {
      const data = normalizeKeysDeep(req.body);
      const parsed = insertTontineSchema.parse(data);

      // Le gestionnaire doit être de la même agence (sauf admin)
      const agenceFilter = req.agenceFilter as { agence?: string } | null;

      if (agenceFilter && parsed.gestionnaireId) {
        // Architecture V3: User n'a plus de champ agence
        // La vérification d'agence doit se faire via employes.agenceId
        const gestionnaire = await storage.getUser(parsed.gestionnaireId);
        if (!gestionnaire) {
          return res.status(403).json({ message: "Gestionnaire introuvable" });
        }
        // TODO: Vérifier l'agence via la table employes si nécessaire
      }

      const tontine = await storage.createTontine(parsed);

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: 'tontine_new', id: tontine.id } });
      }

      res.json(addSnakeCaseAliasesDeep(tontine));
  });

  app.get("/api/tontines/:id", requireAuth, requireAgenceAccess(), async (req, res) => {
      const tontine = await storage.getTontine(req.params.id);
      if (!tontine) return res.status(404).json({ message: "Tontine not found" });

      // Vérifier accès via gestionnaire
      // Architecture V3: User n'a plus de champ agence
      const agenceFilter = req.agenceFilter as { agence?: string } | null;
      if (agenceFilter && tontine.gestionnaireId) {
        const gestionnaire = await storage.getUser(tontine.gestionnaireId);
        if (!gestionnaire) {
          return res.status(403).json({ message: "Accès refusé : gestionnaire introuvable" });
        }
        // TODO: Vérifier l'agence via la table employes si nécessaire
      }

      res.json(addSnakeCaseAliasesDeep(tontine));
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

      res.json(addSnakeCaseAliasesDeep(updated));
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
      res.json(addSnakeCaseAliasesDeep(membres));
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

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: 'membre_added', tontineId: req.params.id } });
      }

      res.json(addSnakeCaseAliasesDeep(membre));
  });

  // Remove membre from tontine
  app.delete("/api/tontines/:id/membres/:membreId", requireAuth, attachAbility, requireAbility(Actions.DELETE, Subjects.TONTINE_MEMBRE), async (req, res) => {
      // In a real app, we might want to check if the membre belongs to the tontine
      const success = await storage.updateMembreTontine(req.params.membreId, { statut: 'Retiré' } as any);
      res.json({ success: !!success });
  });

  // Update membre tontine (cotisation auto etc)
  app.patch("/api/tontines/:id/membres/:membreId", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE_MEMBRE), async (req, res) => {
      const data = normalizeKeysDeep(req.body);
      // Ensure tontine exists
      const tontine = await storage.getTontine(req.params.id);
      if (!tontine) return res.status(404).json({ message: "Tontine not found" });

      const updated = await storage.updateMembreTontine(req.params.membreId, data as any);
      res.json(addSnakeCaseAliasesDeep(updated));
  });

  app.get("/api/tontines/:id/contributions", requireAuth, async (req, res) => {
      const contribs = await storage.getContributionsByTontine(req.params.id);
      res.json(addSnakeCaseAliasesDeep(contribs));
  });

  // Create contribution tontine (roles: admin, chef, caisse, superviseur)
  app.post("/api/contributions-tontine", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.TONTINE_CONTRIBUTION), async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body);
        const parsed = insertContributionTontineSchema.parse(data);

        let sessionCaisseId = undefined;

        // If Cash, we need an active session
        if (parsed.methodePaiement === 'Espèces') {
            const activeSession = await storage.getActiveSessionForUser(req.session.user!.id);
            if (!activeSession) {
                return res.status(400).json({ message: "Vous devez avoir une caisse ouverte pour encaisser des espèces." });
            }
            sessionCaisseId = activeSession.id;
        }

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

        res.json(addSnakeCaseAliasesDeep(contrib));
      } catch (e: any) {
        console.error("Erreur contribution tontine:", e);
        res.status(400).json({ message: e.message || "Erreur lors de l'enregistrement de la contribution" });
      }
  });

  // Get tontines for a specific client (their memberships)
  app.get("/api/clients/:id/tontines", requireAuth, async (req, res) => {
    const tontines = await storage.getTontinesByClient(req.params.id);
    res.json(addSnakeCaseAliasesDeep(tontines));
  });

  // Tontine Rules
  app.get("/api/tontines/:id/regles", requireAuth, async (req, res) => {
    const regles = await storage.getTontineRegles(req.params.id);
    res.json(addSnakeCaseAliasesDeep(regles));
  });

  app.post("/api/tontine-regles", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.TONTINE), async (req, res) => {
    const data = normalizeKeysDeep(req.body);
    const parsed = insertTontineRegleSchema.parse(data);
    const regle = await storage.createTontineRegle(parsed);

    // Notify
    const wsInstance = getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: 'regle_new', tontineId: parsed.tontineId } });
    }

    res.json(addSnakeCaseAliasesDeep(regle));
  });

  app.patch("/api/tontine-regles/:id", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE), async (req, res) => {
    const data = normalizeKeysDeep(req.body);
    const updated = await storage.updateTontineRegle(req.params.id, data as any);

    // Notify
    const wsInstance = getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: 'regle_updated', id: req.params.id } });
    }

    res.json(addSnakeCaseAliasesDeep(updated));
  });

  app.delete("/api/tontine-regles/:id", requireAuth, attachAbility, requireAbility(Actions.DELETE, Subjects.TONTINE), async (req, res) => {
    const success = await storage.deleteTontineRegle(req.params.id);
    res.json({ success });
  });

  // Tontine Penalites
  app.get("/api/tontines/:id/penalites", requireAuth, async (req, res) => {
    const penalites = await storage.getTontinePenalites(req.params.id);
    res.json(addSnakeCaseAliasesDeep(penalites));
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

    res.json(addSnakeCaseAliasesDeep(updated));
  });

  // Tontine Plans
  app.get("/api/tontine-plans", requireAuth, async (req, res) => {
    const plans = await storage.getAllTontinePlans();
    res.json(addSnakeCaseAliasesDeep(plans));
  });

  app.post("/api/tontine-plans", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.TONTINE), async (req, res) => {
    try {
      const data = normalizeKeysDeep(req.body);
      const parsed = insertTontinePlanSchema.parse(data);
      const plan = await storage.createTontinePlan(parsed);
      res.json(addSnakeCaseAliasesDeep(plan));
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
    res.json(addSnakeCaseAliasesDeep(updated));
  });

  app.delete("/api/tontine-plans/:id", requireAuth, attachAbility, requireAbility(Actions.DELETE, Subjects.TONTINE), async (req, res) => {
    const success = await storage.deleteTontinePlan(req.params.id);
    res.json({ success });
  });

  // ============================================================================
  // PRODUCTION-READY TONTINE ENDPOINTS
  // ============================================================================

  // --- CYCLES ---

  // List cycles for a tontine
  app.get("/api/tontines/:id/cycles", requireAuth, async (req: Request, res: Response) => {
    try {
      const cycles = await db
        .select()
        .from(tontineCycles)
        .where(eq(tontineCycles.tontineId, req.params.id))
        .orderBy(desc(tontineCycles.cycleNumber));

      res.json(addSnakeCaseAliasesDeep(cycles));
    } catch (error: any) {
      console.error("Erreur chargement cycles:", error);
      res.status(500).json({ message: error.message || "Erreur chargement cycles" });
    }
  });

  // Generate a new cycle (with schedules and turns)
  app.post("/api/tontines/:id/cycles/generate", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.TONTINE), async (req: Request, res: Response) => {
    try {
      const agenceId = (req as any).user?.agenceId || (req.session.user as any)?.agenceId;
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

      res.json(addSnakeCaseAliasesDeep(result));
    } catch (error: any) {
      console.error("Erreur génération cycle:", error);
      res.status(400).json({ message: error.message || "Erreur génération cycle" });
    }
  });

  // Get cycle details
  app.get("/api/tontines/:id/cycles/:cycleId", requireAuth, async (req: Request, res: Response) => {
    try {
      const [cycle] = await db
        .select()
        .from(tontineCycles)
        .where(and(
          eq(tontineCycles.tontineId, req.params.id),
          eq(tontineCycles.id, req.params.cycleId)
        ))
        .limit(1);

      if (!cycle) {
        return res.status(404).json({ message: "Cycle non trouvé" });
      }

      res.json(addSnakeCaseAliasesDeep(cycle));
    } catch (error: any) {
      console.error("Erreur chargement cycle:", error);
      res.status(500).json({ message: error.message || "Erreur chargement cycle" });
    }
  });

  // Close a cycle
  app.post("/api/tontines/:id/cycles/:cycleId/close", requireAuth, attachAbility, requireAbility(Actions.CLOSE, Subjects.TONTINE), async (req: Request, res: Response) => {
    try {
      const userId = req.session.user?.id;

      const [updated] = await db
        .update(tontineCycles)
        .set({
          status: 'CLOSED',
          closedAt: new Date(),
          closedBy: userId,
          updatedAt: new Date(),
        })
        .where(and(
          eq(tontineCycles.tontineId, req.params.id),
          eq(tontineCycles.id, req.params.cycleId)
        ))
        .returning();

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "TONTINE_UPDATE",
          payload: { type: 'cycle_closed', tontineId: req.params.id, cycleId: req.params.cycleId }
        });
      }

      res.json(addSnakeCaseAliasesDeep(updated));
    } catch (error: any) {
      console.error("Erreur clôture cycle:", error);
      res.status(400).json({ message: error.message || "Erreur clôture cycle" });
    }
  });

  // --- TURNS ---

  // List turns for a cycle
  app.get("/api/tontines/:id/cycles/:cycleId/turns", requireAuth, async (req: Request, res: Response) => {
    try {
      const turns = await db
        .select()
        .from(tontineTurns)
        .where(and(
          eq(tontineTurns.tontineId, req.params.id),
          eq(tontineTurns.cycleId, req.params.cycleId)
        ))
        .orderBy(asc(tontineTurns.turnNumber));

      res.json(addSnakeCaseAliasesDeep(turns));
    } catch (error: any) {
      console.error("Erreur chargement tours:", error);
      res.status(500).json({ message: error.message || "Erreur chargement tours" });
    }
  });

  // Reorder turns
  app.post("/api/tontines/:id/cycles/:cycleId/turns/reorder", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE), async (req: Request, res: Response) => {
    try {
      const agenceId = (req as any).user?.agenceId || (req.session.user as any)?.agenceId;
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

      res.json(addSnakeCaseAliasesDeep(result));
    } catch (error: any) {
      console.error("Erreur réorganisation tours:", error);
      res.status(400).json({ message: error.message || "Erreur réorganisation tours" });
    }
  });

  // Get turn audit history
  app.get("/api/tontines/:id/cycles/:cycleId/audit", requireAuth, async (req: Request, res: Response) => {
    try {
      const audits = await db
        .select()
        .from(tontineTurnAudit)
        .where(and(
          eq(tontineTurnAudit.tontineId, req.params.id),
          eq(tontineTurnAudit.cycleId, req.params.cycleId)
        ))
        .orderBy(desc(tontineTurnAudit.changedAt));

      res.json(addSnakeCaseAliasesDeep(audits));
    } catch (error: any) {
      console.error("Erreur chargement audit:", error);
      res.status(500).json({ message: error.message || "Erreur chargement audit" });
    }
  });

  // --- SCHEDULES ---

  // List schedules for a cycle
  app.get("/api/tontines/:id/cycles/:cycleId/schedules", requireAuth, async (req: Request, res: Response) => {
    try {
      const schedules = await db
        .select()
        .from(tontineSchedules)
        .where(and(
          eq(tontineSchedules.tontineId, req.params.id),
          eq(tontineSchedules.cycleId, req.params.cycleId)
        ))
        .orderBy(asc(tontineSchedules.periodNumber));

      res.json(addSnakeCaseAliasesDeep(schedules));
    } catch (error: any) {
      console.error("Erreur chargement schedules:", error);
      res.status(500).json({ message: error.message || "Erreur chargement schedules" });
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

      res.json(addSnakeCaseAliasesDeep(result));
    } catch (error: any) {
      console.error("Erreur calcul retirable:", error);
      res.status(500).json({ message: error.message || "Erreur calcul retirable" });
    }
  });

  // --- DISTRIBUTION REQUESTS (V2) ---

  // List distribution requests for a tontine
  app.get("/api/tontines/:id/distribution-requests", requireAuth, async (req: Request, res: Response) => {
    try {
      const { cycleId, status } = req.query;

      let query = db
        .select()
        .from(tontineDistributionRequests)
        .where(eq(tontineDistributionRequests.tontineId, req.params.id));

      const requests = await query.orderBy(desc(tontineDistributionRequests.createdAt));

      // Filter in memory if needed (Drizzle chaining limitations)
      let filtered = requests;
      if (cycleId) {
        filtered = filtered.filter(r => r.cycleId === cycleId);
      }
      if (status) {
        filtered = filtered.filter(r => r.status === status);
      }

      res.json(addSnakeCaseAliasesDeep(filtered));
    } catch (error: any) {
      console.error("Erreur chargement distribution requests:", error);
      res.status(500).json({ message: error.message || "Erreur chargement" });
    }
  });

  // Create a distribution request
  app.post("/api/tontines/:id/distribution-requests", requireAuth, attachAbility, requireAbility(Actions.DISTRIBUTE, Subjects.TONTINE), async (req: Request, res: Response) => {
    try {
      const agenceId = (req as any).user?.agenceId || (req.session.user as any)?.agenceId;
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

      res.json(addSnakeCaseAliasesDeep(result));
    } catch (error: any) {
      console.error("Erreur création distribution request:", error);
      res.status(400).json({ message: error.message || "Erreur création" });
    }
  });

  // Approve and execute a distribution request
  app.post("/api/tontines/:id/distribution-requests/:requestId/approve", requireAuth, attachAbility, requireAbility(Actions.APPROVE, Subjects.TONTINE), async (req: Request, res: Response) => {
    try {
      const agenceId = (req as any).user?.agenceId || (req.session.user as any)?.agenceId;
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

      res.json(addSnakeCaseAliasesDeep(result));
    } catch (error: any) {
      console.error("Erreur approbation distribution:", error);
      res.status(400).json({ message: error.message || "Erreur approbation" });
    }
  });

  // Cancel a distribution request
  app.post("/api/tontines/:id/distribution-requests/:requestId/cancel", requireAuth, attachAbility, requireAbility(Actions.CANCEL, Subjects.TONTINE), async (req: Request, res: Response) => {
    try {
      const { reason } = req.body;

      const [updated] = await db
        .update(tontineDistributionRequests)
        .set({
          status: 'CANCELLED',
          rejectionReason: reason || 'Annulé',
          updatedAt: new Date(),
        })
        .where(eq(tontineDistributionRequests.id, req.params.requestId))
        .returning();

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

      res.json(addSnakeCaseAliasesDeep(updated));
    } catch (error: any) {
      console.error("Erreur annulation distribution:", error);
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
        const [cycle] = await db
          .select()
          .from(tontineCycles)
          .where(eq(tontineCycles.id, tontine.currentCycleId))
          .limit(1);
        currentCycle = cycle;
      }

      // Get next turn
      let nextTurn = null;
      if (currentCycle) {
        const [turn] = await db
          .select()
          .from(tontineTurns)
          .where(and(
            eq(tontineTurns.cycleId, currentCycle.id),
            eq(tontineTurns.status, 'SCHEDULED')
          ))
          .orderBy(asc(tontineTurns.turnNumber))
          .limit(1);
        nextTurn = turn;
      }

      // Get pending distribution requests
      const pendingRequests = await db
        .select()
        .from(tontineDistributionRequests)
        .where(and(
          eq(tontineDistributionRequests.tontineId, req.params.id),
          eq(tontineDistributionRequests.status, 'SUBMITTED')
        ));

      res.json(addSnakeCaseAliasesDeep({
        tontine,
        currentCycle,
        nextTurn,
        pendingDistributions: pendingRequests.length,
        stats: {
          potCollecte: currentCycle?.potCollected || tontine.solde || "0",
          potDistribue: currentCycle?.potDistributed || "0",
          membresActifs: currentCycle?.membersCount || tontine.membresActuels || 0,
        },
      }));
    } catch (error: any) {
      console.error("Erreur dashboard tontine:", error);
      res.status(500).json({ message: error.message || "Erreur dashboard" });
    }
  });
}
