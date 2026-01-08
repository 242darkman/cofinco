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

      // Notify
      const wsInstance = require("../ws-server").getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "OPERATIONS_UPDATE", payload: { type: 'agent_new', id: agent.id } });
      }

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

      // Notify
      const wsInstance = require("../ws-server").getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "OPERATIONS_UPDATE", payload: { type: 'prospection_new', id: prospection.id } });
      }

      res.json(addSnakeCaseAliasesDeep(prospection));
  });

  // Visites
  app.get("/api/visites-terrain", requireAuth, async (req, res) => {
      const list = await storage.getAllVisitesTerrain();
      res.json(addSnakeCaseAliasesDeep(list));
  });
  

  // Create Paiement Terrain (roles: admin, chef, terrain, superviseur)
  // Now using atomic ledger flow
  app.post("/api/paiements-terrain", requireAuth, requireRole('admin', 'chef', 'terrain', 'superviseur'), async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body) as any;
        const user = req.session.user;

        // Use atomic ledger function
        const { paiement, mouvement } = await storage.createPaiementTerrainWithLedger({
          agentId: data.agentId,
          clientId: data.clientId,
          creditId: data.creditId,
          compteId: data.compteId,
          montant: data.montant,
          typePaiement: data.typePaiement || 'Paiement Crédit',
          latitude: data.latitude,
          longitude: data.longitude,
          idempotencyKey: data.idempotencyKey,
        }, user?.id);
        
        // WebSocket notifications managed by outbox worker
        // Additional backward compatible notifications if needed
        const wsInstance = require("../ws-server").getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "OPERATIONS_UPDATE", payload: { type: 'paiement_new', id: paiement.id } });
            
            // Notify specific client channel
             if (paiement.clientId) {
               wsInstance.broadcast({ type: "CLIENT_UPDATE", payload: { clientId: paiement.clientId } });
            }
        }
        
        res.status(201).json(addSnakeCaseAliasesDeep({ ...paiement, mouvement_id: mouvement.id }));
      } catch (error: any) {
        console.error('Error creating paiement terrain:', error);
        res.status(400).json({ error: error.message || "Invalid data" });
      }
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

    // Notify
    const wsInstance = require("../ws-server").getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "OPERATIONS_UPDATE", payload: { type: 'zone_new', id: zone.id } });
    }

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

    // Notify
    const wsInstance = require("../ws-server").getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "OPERATIONS_UPDATE", payload: { type: 'objectif_update', agentId: parsed.agentId } });
    }

    res.json(addSnakeCaseAliasesDeep(objectif));
  });
}
