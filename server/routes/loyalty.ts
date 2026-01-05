import { Router } from "express";
import { storage } from "../storage";
import { requireAuth } from "../auth";
import { requireRole } from "../middleware";

const loyaltyRouter = Router();

// GET /api/loyalty/:clientId/points - Historique des points
loyaltyRouter.get("/:clientId/points", requireAuth, async (req, res) => {
    try {
        const { clientId } = req.params;
        const history = await storage.getLoyaltyHistory(clientId);
        res.json(history);
    } catch (error) {
        console.error("Erreur récupération historique points:", error);
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
        console.error("Erreur calcul score:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/loyalty/:clientId/bonus - Ajouter bonus manuel (admin only)
loyaltyRouter.post("/:clientId/bonus", requireAuth, requireRole(['admin', 'rh']), async (req, res) => {
    try {
        const { clientId } = req.params;
        const { points, description } = req.body;
        
        if (!points || !description) {
            return res.status(400).json({ error: "Points et description requis" });
        }
        
        await storage.addLoyaltyPoints(clientId, points, 'BONUS', description);
        await storage.calculateEngagementScore(clientId);
        
        // Notify
        const wsInstance = require("../ws-server").getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "LOYALTY_UPDATE", payload: { type: 'bonus_added', clientId, points } });
        }
        
        res.json({ success: true, message: `${points} points ajoutés` });
    } catch (error) {
        console.error("Erreur ajout bonus:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

export default loyaltyRouter;
