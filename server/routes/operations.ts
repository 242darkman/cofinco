import type { Express } from "express";
import { insertAgentTerrainSchema, insertProspectionSchema, insertVisiteTerrainSchema, insertPaiementTerrainSchema, insertZoneSchema, insertObjectifMensuelSchema } from "@shared/schema";
import { storage } from "../storage";
import { requireAuth, requireRole } from "../auth";
import { normalizeKeysDeep, addSnakeCaseAliasesDeep } from "./utils";

export function registerOperationsRoutes(app: Express) {
  // Agents
  app.get("/api/agents-terrain", requireAuth, async (req, res) => {
      const agents = await storage.getAllAgentsTerrain();
      // Agents enriched with dynamic stats (clients, performance)
      res.json(addSnakeCaseAliasesDeep(agents));
  });

  // Create agent terrain (roles: admin, chef)
  app.post("/api/agents-terrain", requireAuth, requireRole('admin', 'chef'), async (req, res) => {
      const data = normalizeKeysDeep(req.body);
      const parsed = insertAgentTerrainSchema.parse(data);
      const agent = await storage.createAgentTerrain(parsed);
      res.json(addSnakeCaseAliasesDeep(agent));
  });

  app.get("/api/agents-terrain/:id", requireAuth, async (req, res) => {
      const agent = await storage.getAgentTerrain(req.params.id);
      if (!agent) {
          return res.status(404).json({ error: "Agent non trouvé" });
      }
      res.json(addSnakeCaseAliasesDeep(agent));
  });

  app.get("/api/agents-terrain/:id/visites", requireAuth, async (req, res) => {
      const visites = await storage.getVisitesByAgent(req.params.id);
      res.json(addSnakeCaseAliasesDeep(visites));
  });

  // Prospections
  app.get("/api/prospections", requireAuth, async (req, res) => {
      const list = await storage.getAllProspections();
      res.json(addSnakeCaseAliasesDeep(list));
  });

  // Create prospection (roles: admin, chef, terrain, superviseur)
  app.post("/api/prospections", requireAuth, requireRole('admin', 'chef', 'terrain', 'superviseur'), async (req, res) => {
      const data = normalizeKeysDeep(req.body);
      const parsed = insertProspectionSchema.parse(data);
      const prospection = await storage.createProspection(parsed);
      res.json(addSnakeCaseAliasesDeep(prospection));
  });

  // Visites
  app.get("/api/visites-terrain", requireAuth, async (req, res) => {
      const list = await storage.getAllVisitesTerrain();
      res.json(addSnakeCaseAliasesDeep(list));
  });
  

  // Paiements
  app.get("/api/paiements-terrain", requireAuth, async (req, res) => {
      const list = await storage.getAllPaiementsTerrain();
      res.json(addSnakeCaseAliasesDeep(list));
  });

  // Zones
  app.get("/api/zones", requireAuth, async (req, res) => {
    const list = await storage.getAllZones();
    res.json(addSnakeCaseAliasesDeep(list));
  });

  // Create zone (roles: admin, chef)
  app.post("/api/zones", requireAuth, requireRole('admin', 'chef'), async (req, res) => {
    const data = normalizeKeysDeep(req.body);
    const parsed = insertZoneSchema.parse(data);
    const zone = await storage.createZone(parsed);
    res.json(addSnakeCaseAliasesDeep(zone));
  });

  // Objectifs Mensuels
  app.get("/api/objectifs-mensuels/:agentId", requireAuth, async (req, res) => {
    const { agentId } = req.params;
    const { annee } = req.query;
    const objectifs = await storage.getObjectifsMensuelsByAgent(agentId, annee ? Number(annee) : undefined);
    res.json(addSnakeCaseAliasesDeep(objectifs));
  });

  app.get("/api/objectifs-mensuels/:agentId/current", requireAuth, async (req, res) => {
    const objectif = await storage.getCurrentObjectifMensuel(req.params.agentId);
    if (!objectif) {
      // Return fallback to agent's default objectifMensuel
      const agent = await storage.getAgentTerrain(req.params.agentId);
      return res.json({ montant: agent?.objectifMensuel || "0", isDefault: true });
    }
    res.json(addSnakeCaseAliasesDeep(objectif));
  });

  // Create/update objectif mensuel (roles: admin, chef, superviseur)
  app.post("/api/objectifs-mensuels", requireAuth, requireRole('admin', 'chef', 'superviseur'), async (req, res) => {
    const data = normalizeKeysDeep(req.body);
    const parsed = insertObjectifMensuelSchema.parse(data);
    const objectif = await storage.createOrUpdateObjectifMensuel(parsed);
    res.json(addSnakeCaseAliasesDeep(objectif));
  });
}
