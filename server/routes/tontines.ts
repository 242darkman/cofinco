import type { Express } from "express";
import { z } from "zod";
import { insertTontineSchema, insertMembreTontineSchema, insertContributionTontineSchema, insertTontineAlerteSchema,
    insertTontineRegleSchema, insertTontinePenaliteSchema, insertTontineDistributionSchema,
    insertTontinePlanSchema
} from "@shared/schema";
import { storage } from "../storage";
import { requireAuth, requireRole } from "../auth";
import { requireAgenceAccess } from "../middleware";
import { normalizeKeysDeep, addSnakeCaseAliasesDeep } from "./utils";
import { getWsInstance } from "../ws-server";

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
  app.post("/api/tontines", requireAuth, requireRole('admin', 'chef', 'superviseur'), requireAgenceAccess(), async (req, res) => {
      const data = normalizeKeysDeep(req.body);
      const parsed = insertTontineSchema.parse(data);
      
      // Le gestionnaire doit être de la même agence (sauf admin)
      const agenceFilter = req.agenceFilter as { agence?: string } | null;
      
      if (agenceFilter && parsed.gestionnaireId) {
        const gestionnaire = await storage.getUser(parsed.gestionnaireId);
        // Si gestionnaire n'existe pas ou n'est pas de la bonne agence
        if (!gestionnaire || gestionnaire.agence !== agenceFilter.agence) {
          return res.status(403).json({ message: "Le gestionnaire doit appartenir à votre agence" });
        }
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
      const agenceFilter = req.agenceFilter as { agence?: string } | null;
      if (agenceFilter && tontine.gestionnaireId) {
        const gestionnaire = await storage.getUser(tontine.gestionnaireId);
        if (!gestionnaire || gestionnaire.agence !== agenceFilter.agence) {
          return res.status(403).json({ message: "Accès refusé : tontine d'une autre agence" });
        }
      }

      res.json(addSnakeCaseAliasesDeep(tontine));
  });

  // Update tontine (roles: admin, chef, superviseur)
  app.patch("/api/tontines/:id", requireAuth, requireRole('admin', 'chef', 'superviseur'), async (req, res) => {
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
  app.delete("/api/tontines/:id", requireAuth, requireRole('admin', 'chef'), async (req, res) => {
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
  app.post("/api/tontines/:id/membres", requireAuth, requireRole('admin', 'chef', 'superviseur'), async (req, res) => {
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
  app.delete("/api/tontines/:id/membres/:membreId", requireAuth, requireRole('admin', 'chef', 'superviseur'), async (req, res) => {
      // In a real app, we might want to check if the membre belongs to the tontine
      const success = await storage.updateMembreTontine(req.params.membreId, { statut: 'Retiré' } as any);
      res.json({ success: !!success });
  });

  app.get("/api/tontines/:id/contributions", requireAuth, async (req, res) => {
      const contribs = await storage.getContributionsByTontine(req.params.id);
      res.json(addSnakeCaseAliasesDeep(contribs));
  });

  // Create contribution tontine (roles: admin, chef, caisse, superviseur)
  app.post("/api/contributions-tontine", requireAuth, requireRole('admin', 'chef', 'caisse', 'superviseur'), async (req, res) => {
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

  app.post("/api/tontine-regles", requireAuth, requireRole('admin', 'chef', 'superviseur'), async (req, res) => {
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

  app.patch("/api/tontine-regles/:id", requireAuth, requireRole('admin', 'chef', 'superviseur'), async (req, res) => {
    const data = normalizeKeysDeep(req.body);
    const updated = await storage.updateTontineRegle(req.params.id, data as any);
    
    // Notify
    const wsInstance = getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: 'regle_updated', id: req.params.id } });
    }

    res.json(addSnakeCaseAliasesDeep(updated));
  });

  app.delete("/api/tontine-regles/:id", requireAuth, requireRole('admin', 'chef', 'superviseur'), async (req, res) => {
    const success = await storage.deleteTontineRegle(req.params.id);
    res.json({ success });
  });

  // Tontine Penalites
  app.get("/api/tontines/:id/penalites", requireAuth, async (req, res) => {
    const penalites = await storage.getTontinePenalites(req.params.id);
    res.json(addSnakeCaseAliasesDeep(penalites));
  });

  app.patch("/api/tontine-penalites/:id", requireAuth, requireRole('admin', 'chef', 'superviseur', 'caisse'), async (req, res) => {
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

  app.post("/api/tontine-plans", requireAuth, requireRole('admin', 'chef', 'superviseur'), async (req, res) => {
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

  app.patch("/api/tontine-plans/:id", requireAuth, requireRole('admin', 'chef', 'superviseur'), async (req, res) => {
    const data = normalizeKeysDeep(req.body);
    const updated = await storage.updateTontinePlan(req.params.id, data as any);
    res.json(addSnakeCaseAliasesDeep(updated));
  });

  app.delete("/api/tontine-plans/:id", requireAuth, requireRole('admin', 'chef', 'superviseur'), async (req, res) => {
    const success = await storage.deleteTontinePlan(req.params.id);
    res.json({ success });
  });
}
