import { Express } from "express";
import { createLogger } from "../../lib/logger";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { getAgencyActivationChecklist } from "../../services/agency-checklist";
import {
  submitAgence,
  activateAgence,
  rejectAgence,
  suspendAgence,
  closeAgence,
  getAgenceStatusHistory
} from "../../services/agences/agences-lifecycle.service";

const logger = createLogger('Routes:AgencesLifecycle');

export function registerAgencesLifecycleRoutes(app: Express) {
  app.post("/api/agences/:id/submit", attachAbility, requireAbility(Actions.EDIT, Subjects.AGENCE), async (req, res) => {
    try {
      const result = await submitAgence(req.params.id, req.body?.comment, req.session?.userId as string, req);
      res.json(result);
    } catch (error: any) {
      if (error.message.includes("Transition invalide") || error.message.includes("Données incomplètes")) {
        return res.status(400).json({ error: error.message });
      }
      if (error.message === "Agence non trouvée") return res.status(404).json({ error: error.message });
      
      logger.error({ err: error }, 'Erreur POST /api/agences/:id/submit');
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/agences/:id/activate", attachAbility, requireAbility(Actions.APPROVE, Subjects.AGENCE), async (req, res) => {
    try {
      const result = await activateAgence(req.params.id, req.session?.userId as string, req);
      res.json(result);
    } catch (error: any) {
      if (error.message === "Agence non trouvée") return res.status(404).json({ error: error.message });
      if (error.message.includes("Transition invalide")) {
        return res.status(400).json({ error: error.message });
      }
      if (error.message.includes("checklist d'activation")) {
        try {
          return res.status(400).json(JSON.parse(error.message));
        } catch(e) {
          return res.status(400).json({ error: error.message });
        }
      }
      logger.error({ err: error }, 'Erreur POST /api/agences/:id/activate');
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/agences/:id/reject", attachAbility, requireAbility(Actions.APPROVE, Subjects.AGENCE), async (req, res) => {
    try {
      const result = await rejectAgence(req.params.id, req.body?.reason, req.session?.userId as string, req);
      res.json(result);
    } catch (error: any) {
      if (error.message === "Agence non trouvée") return res.status(404).json({ error: error.message });
      if (error.message.includes("obligatoire") || error.message.includes("Seule une agence")) {
        return res.status(400).json({ error: error.message });
      }
      logger.error({ err: error }, 'Erreur POST /api/agences/:id/reject');
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/agences/:id/suspend", attachAbility, requireAbility(Actions.SUSPEND, Subjects.AGENCE), async (req, res) => {
    try {
      const result = await suspendAgence(req.params.id, req.body?.reason, req.session?.userId as string, req);
      res.json(result);
    } catch (error: any) {
      if (error.message === "Agence non trouvée") return res.status(404).json({ error: error.message });
      if (error.message.includes("obligatoire") || error.message.includes("Transition invalide")) {
        return res.status(400).json({ error: error.message });
      }
      logger.error({ err: error }, 'Erreur POST /api/agences/:id/suspend');
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/agences/:id/close", attachAbility, requireAbility(Actions.MANAGE, Subjects.AGENCE), async (req, res) => {
    try {
      const result = await closeAgence(req.params.id, req.body?.reason, req.session?.userId as string, req);
      res.json(result);
    } catch (error: any) {
      if (error.message === "Agence non trouvée") return res.status(404).json({ error: error.message });
      if (error.message.includes("obligatoire") || error.message.includes("Impossible")) {
        return res.status(400).json({ error: error.message });
      }
      logger.error({ err: error }, 'Erreur POST /api/agences/:id/close');
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/agences/:id/checklist", attachAbility, requireAbility(Actions.VIEW, Subjects.AGENCE), async (req, res) => {
    try {
      const checklist = await getAgencyActivationChecklist(req.params.id);
      res.json(checklist);
    } catch (error: any) {
      if (error.message === "Agence non trouvée") return res.status(404).json({ error: error.message });
      logger.error({ err: error }, 'Erreur GET /api/agences/:id/checklist');
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/agences/:id/status-history", attachAbility, requireAbility(Actions.VIEW, Subjects.AGENCE), async (req, res) => {
    try {
      const history = await getAgenceStatusHistory(req.params.id);
      res.json(history);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur GET /api/agences/:id/status-history');
      res.status(500).json({ error: error.message });
    }
  });
}
