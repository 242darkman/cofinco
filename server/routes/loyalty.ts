import { Router } from "express";
import { createLogger } from "../lib/logger";
import { storage } from "../storage";

const logger = createLogger('Routes:Loyalty');
import { requireAuth } from "../auth";
import { attachAbility, requireAbility } from "../authorization";
import { Actions, Subjects } from "@shared/ability";
import { getWsInstance } from "../ws-server";

const loyaltyRouter = Router();

// GET /api/loyalty/:clientId/points - Historique des points
loyaltyRouter.get("/:clientId/points", requireAuth, async (req, res) => {
    try {
        const { clientId } = req.params;
        const history = await storage.getLoyaltyHistory(clientId);
        res.json(history);
    } catch (error) {
        logger.error({ err: error }, 'Erreur récupération historique points');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/loyalty/:clientId/score - Score d'engagement
loyaltyRouter.get("/:clientId/score", requireAuth, async (req, res) => {
    try {
        const { clientId } = req.params;
        const score = await storage.calculateEngagementScore(clientId);
        res.json({ score });
    } catch (error) {
        logger.error({ err: error }, 'Erreur calcul score');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/loyalty/:clientId/bonus - Ajouter bonus manuel (admin only)
loyaltyRouter.post("/:clientId/bonus", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.LOYALTY), async (req, res) => {
    try {
        const { clientId } = req.params;
        const { points, description } = req.body;

        if (!points || !description) {
            return res.status(400).json({ error: "Points et description requis" });
        }

        await storage.addLoyaltyPoints(clientId, points, 'BONUS', description);
        await storage.calculateEngagementScore(clientId);

        // Notify
        const wsInstance = getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "LOYALTY_UPDATE", payload: { type: 'bonus_added', clientId, points } });
        }

        res.json({ success: true, message: `${points} points ajoutés` });
    } catch (error) {
        logger.error({ err: error }, 'Erreur ajout bonus');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

export default loyaltyRouter;
