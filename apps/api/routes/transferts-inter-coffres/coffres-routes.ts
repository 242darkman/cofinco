import { Router } from "express";
import { z } from "zod";
import { createLogger } from "../../lib/logger";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import * as coffresQueries from "../../services/transfert-inter-coffres/coffres-queries";
import * as coffresOperations from "../../services/transfert-inter-coffres/coffres-operations";
import { StatutCoffre } from "@shared/enum/status-constants";

const logger = createLogger('Routes:CoffresForts');

export const coffresRouter = Router();

// GET /coffres - Liste des coffres-forts
coffresRouter.get("/", async (req, res) => {
  try {
    const { ownerType, statut, agenceId } = req.query;

    const result = await coffresQueries.listCoffres({
      ownerType: ownerType as any,
      statut: statut as string,
      agenceId: agenceId as string,
    });

    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur GET /coffres');
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /coffres/siege - Coffre du siège
coffresRouter.get("/siege", async (req, res) => {
  try {
    const result = await coffresQueries.getCoffreSiege();
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur GET /coffres/siege');
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /coffres/agence/:agenceId - Coffre d'une agence
coffresRouter.get("/agence/:agenceId", async (req, res) => {
  try {
    const { agenceId } = req.params;
    const result = await coffresQueries.getCoffreByAgenceId(agenceId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur GET /coffres/agence/:agenceId');
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /coffres/:id - Détail d'un coffre
coffresRouter.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await coffresQueries.getCoffreById(id);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur GET /coffres/:id');
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /coffres/:id - Modifier un coffre
coffresRouter.patch("/:id", attachAbility, requireAbility(Actions.MANAGE, Subjects.COFFRE), async (req, res) => {
  try {
    const { id } = req.params;
    const schema = z.object({
      nom: z.string().optional(),
      plafondEncaisse: z.number().positive().optional(),
      soldeMinimum: z.number().min(0).optional(),
      statut: z.enum([StatutCoffre.ACTIVE, StatutCoffre.SUSPENDED, StatutCoffre.CLOSED]).optional(),
      description: z.string().optional(),
    });

    const data = schema.parse(req.body);
    const result = await coffresOperations.updateCoffre(id, data);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur PATCH /coffres/:id');
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /coffres/:id/approvisionner - Approvisionner un coffre
coffresRouter.post("/:id/approvisionner", attachAbility, requireAbility(Actions.CREATE, Subjects.COFFRE_TRANSFERT), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const schema = z.object({
      montant: z.number().positive(),
      motif: z.string().min(10),
    });

    const { montant, motif } = schema.parse(req.body);
    const result = await coffresOperations.approvisionnerCoffre(id, montant, motif, userId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur POST /coffres/:id/approvisionner');
    res.status(400).json({ success: false, error: error.message });
  }
});
