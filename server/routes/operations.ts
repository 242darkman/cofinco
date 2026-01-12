import type { Express } from "express";
import { insertAgentTerrainSchema, insertProspectionSchema, insertVisiteTerrainSchema, insertPaiementTerrainSchema, insertZoneSchema, insertObjectifMensuelSchema } from "@shared/schema";
import { storage } from "../storage";
import { requireAuth, requireRole } from "../auth";
import { normalizeKeysDeep, addSnakeCaseAliasesDeep } from "./utils";
import { getWsInstance } from "../ws-server";

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
      const wsInstance = getWsInstance();
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
      const wsInstance = getWsInstance();
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
  // Now creates a PENDING payment that needs validation
  app.post("/api/paiements-terrain", requireAuth, requireRole('admin', 'chef', 'terrain', 'superviseur'), async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body) as any;
        const user = req.session.user;

        // Create PENDING payment
        // Storage function now handles creating "En attente" payment without immediate ledger impact
        const paiement = await storage.createPendingPaiementTerrain({
          agentId: data.agentId,
          clientId: data.clientId,
          creditId: data.creditId,
          compteId: data.compteId,
          visiteId: data.visiteId,
          montant: data.montant,
          typePaiement: data.typePaiement || 'Paiement Crédit',
          methodePaiement: data.methodePaiement || 'Espèces',
          numeroTelephone: data.numeroTelephone,
          numeroTransaction: data.numeroTransaction,
          reference: data.reference || `PAY-${Date.now()}`,
          notes: data.notes,
          latitude: data.latitude,
          longitude: data.longitude,
          idempotencyKey: data.idempotencyKey,
          presenceVerification: data.presenceVerification,
          tontineId: data.tontineId,
          membreId: data.membreId
        }, user?.id);
        
        // Notify admins/managers of new pending payment
        const wsInstance = getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "OPERATIONS_UPDATE", payload: { type: 'paiement_pending', id: paiement.id } });
        }
        
        res.status(201).json(addSnakeCaseAliasesDeep(paiement));
      } catch (error: any) {
        console.error('Error creating paiement terrain:', error);
        res.status(400).json({ error: error.message || "Invalid data" });
      }
  });

  // Validate Paiement Terrain (roles: admin, chef, superviseur)
  app.post("/api/paiements-terrain/:id/validate", requireAuth, requireRole('admin', 'chef', 'superviseur'), async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.session.user;

      const { paiement, mouvement } = await storage.validatePaiementTerrain(id, user?.id || 'system');

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "OPERATIONS_UPDATE", payload: { type: 'paiement_validated', id: paiement.id } });
          
          if (paiement.clientId) {
            wsInstance.broadcast({ type: "CLIENT_UPDATE", payload: { clientId: paiement.clientId } });
         }
      }

      res.json(addSnakeCaseAliasesDeep({ ...paiement, mouvement_id: mouvement.id }));
    } catch (error: any) {
      console.error('Error validating paiement terrain:', error);
      res.status(400).json({ error: error.message || "Error validating payment" });
    }
  });

  // Reject Paiement Terrain
  app.post("/api/paiements-terrain/:id/reject", requireAuth, requireRole('admin', 'chef', 'superviseur'), async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const paiement = await storage.rejectPaiementTerrain(id, reason || 'Rejeté par administrateur');

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "OPERATIONS_UPDATE", payload: { type: 'paiement_rejected', id: paiement.id } });
      }

      res.json(addSnakeCaseAliasesDeep(paiement));
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Error rejecting payment" });
    }
  });

  // Paiements
  app.get("/api/paiements-terrain", requireAuth, async (req, res) => {
      try {
        const user = req.session.user;
        let agenceId: string | undefined;

        // For chef d'agence, automatically filter by their agency
        if (user?.role === 'chef' || user?.role === 'chef_agence') {
          // Get employe record to find agenceId
          const employe = await storage.getEmployeByUserId(user.id);
          agenceId = employe?.agenceId || undefined;
        } else if (user?.role === 'admin' || user?.role === 'admin_generale' || user?.role === 'Administrateur') {
          // For admin, use query parameter (optional)
          agenceId = req.query.agenceId as string | undefined;
          if (agenceId === 'all') agenceId = undefined;
        }

        // Use the new getPendingPaiementsByAgence function
        const list = await storage.getPendingPaiementsByAgence(agenceId);
        res.json(addSnakeCaseAliasesDeep(list));
      } catch (error: any) {
        console.error('Error fetching paiements terrain:', error);
        res.status(500).json({ error: 'Failed to fetch payments' });
      }
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
