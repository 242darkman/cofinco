import type { Express } from "express";
import { insertTontineSchema, insertMembreTontineSchema, insertContributionTontineSchema, insertTontineAlerteSchema,
    insertTontineRegleSchema, insertTontinePenaliteSchema, insertTontineDistributionSchema
} from "@shared/schema";
import { storage } from "../storage";
import { requireAuth, requireRole } from "../auth";
import { requireAgenceAccess } from "../middleware";
import { normalizeKeysDeep, addSnakeCaseAliasesDeep } from "./utils";

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

  app.get("/api/tontines/:id/membres", requireAuth, async (req, res) => {
      const membres = await storage.getMembresTontine(req.params.id);
      res.json(addSnakeCaseAliasesDeep(membres));
  });

  // Add membre to tontine (roles: admin, chef, superviseur)
  app.post("/api/tontines/:id/membres", requireAuth, requireRole('admin', 'chef', 'superviseur'), async (req, res) => {
      const data = normalizeKeysDeep(req.body);
      const parsed = insertMembreTontineSchema.parse(Object.assign({}, data, { tontineId: req.params.id }));
      const membre = await storage.createMembreTontine(parsed);
      res.json(addSnakeCaseAliasesDeep(membre));
  });

  app.get("/api/tontines/:id/contributions", requireAuth, async (req, res) => {
      const contribs = await storage.getContributionsByTontine(req.params.id);
      res.json(addSnakeCaseAliasesDeep(contribs));
  });

  // Create contribution tontine (roles: admin, chef, caisse, superviseur)
  app.post("/api/contributions-tontine", requireAuth, requireRole('admin', 'chef', 'caisse', 'superviseur'), async (req, res) => {
      const data = normalizeKeysDeep(req.body);
      const parsed = insertContributionTontineSchema.parse(data);
      const contrib = await storage.createContributionTontine(parsed);
      res.json(addSnakeCaseAliasesDeep(contrib));
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
    res.json(addSnakeCaseAliasesDeep(regle));
  });

  app.patch("/api/tontine-regles/:id", requireAuth, requireRole('admin', 'chef', 'superviseur'), async (req, res) => {
    const data = normalizeKeysDeep(req.body);
    const updated = await storage.updateTontineRegle(req.params.id, data as any);
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
    res.json(addSnakeCaseAliasesDeep(updated));
  });
}
