import { Express } from "express";
import { createLogger } from "../../lib/logger";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import {
  getAgencesList,
  getAgenceById,
  createAgence,
  updateAgence,
  deleteAgence
} from "../../services/agences/agences-core.service";

const logger = createLogger('Routes:Agences');

export function registerAgencesCoreRoutes(app: Express) {
  app.get("/api/agences", requireAuth, async (req, res) => {
    try {
      const result = await getAgencesList(req.query);
      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur GET /api/agences');
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/agences/:id - Détail d'une agence
  app.get("/api/agences/:id", requireAuth, async (req, res) => {
    try {
      const result = await getAgenceById(req.params.id);
      res.json(result);
    } catch (error: any) {
      if (error.message === "Agence non trouvée") {
        return res.status(404).json({ error: error.message });
      }
      logger.error({ err: error }, 'Erreur GET /api/agences/:id');
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/agences - Créer une agence (avec coffre-fort atomique)
  app.post("/api/agences", attachAbility, requireAbility(Actions.MANAGE, Subjects.AGENCE), async (req, res) => {
    try {
      const result = await createAgence(req.body, req.session?.userId as string, req);
      res.status(201).json({
        ...result.agence,
        coffre: result.coffre,
        compteLiaison: result.compteLiaison
      });
    } catch (error: any) {
      if (error.message === "Ce code agence existe déjà") {
        return res.status(400).json({ error: error.message });
      }
      logger.error({ err: error }, 'Erreur POST /api/agences');
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /api/agences/:id - Modifier une agence
  app.patch("/api/agences/:id", attachAbility, requireAbility(Actions.MANAGE, Subjects.AGENCE), async (req, res) => {
    try {
      const result = await updateAgence(req.params.id, req.body, req);
      res.json(result);
    } catch (error: any) {
      if (error.message === "Agence non trouvée") {
        return res.status(404).json({ error: error.message });
      }
      logger.error({ err: error }, 'Erreur PATCH /api/agences/:id');
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/agences/:id - Supprimer une agence
  app.delete("/api/agences/:id", attachAbility, requireAbility(Actions.MANAGE, Subjects.AGENCE), async (req, res) => {
    try {
      await deleteAgence(req.params.id, req);
      res.json({ message: "Agence supprimée avec succès" });
    } catch (error: any) {
      if (error.message === "Agence non trouvée") {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes("Impossible")) {
        return res.status(400).json({ error: error.message });
      }
      logger.error({ err: error }, 'Erreur DELETE /api/agences/:id');
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // USER AGENCES (Affectations)
  // ============================================

  // GET /api/users/:userId/agences - Agences d'un utilisateur
}
