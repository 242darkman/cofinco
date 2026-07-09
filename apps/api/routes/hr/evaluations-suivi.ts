import { Router } from "express";
/**
 * Routes RH — Évaluations de performance : notation, finalisation et suivi.
 *
 * Monté sous /api/hr par le routeur d'index (hr.ts).
 * Endpoints :
 *   POST   /api/hr/evaluations/:id/manager-eval
 *   PATCH  /api/hr/evaluations/:id/finalize
 *   GET    /api/hr/evaluations/analytics/history
 *   GET    /api/hr/evaluations/analytics/campaign-summary
 */
import { db } from "../../db";
import { employes, evaluations } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getAuthUser } from "../../middleware";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { getWsInstance } from "../../ws-server";
import { generateCampaignEvaluations, computeEvaluationScore, finalizeEvaluation } from "../../services/evaluation-service";
import * as hrStorage from "../../storage/hr";

export const evaluationsSuiviRouter = Router();

// POST /api/hr/evaluations/:id/manager-eval
/**
 * POST /api/hr/evaluations/:id/manager-eval
 */
evaluationsSuiviRouter.post("/evaluations/:id/manager-eval", getAuthUser, attachAbility, async (req, res) => {
    try {
        const user = (req as any).user;
        const eval_ = await hrStorage.getEvaluationById(req.params.id);
        if (!eval_) return res.status(404).json({ error: "Évaluation introuvable" });

        // Vérifier que l'utilisateur est le manager ou RH
        const isRH = req.ability?.can(Actions.MANAGE, Subjects.RH);
        if (!isRH) {
            const [emp] = await db.select().from(employes).where(eq(employes.userId, user.id));
            if (!emp || emp.id !== eval_.managerId) {
                return res.status(403).json({ error: "Non autorisé à évaluer cet employé" });
            }
        }

        const { responses, commentaire, recommandation } = req.body;
        if (!responses?.length) return res.status(400).json({ error: "Les réponses sont requises" });

        // Sauvegarder les réponses
        await hrStorage.batchUpsertResponses(eval_.id, "MANAGER", responses);

        // Calculer le score
        const score = await computeEvaluationScore(eval_.id, "MANAGER");

        // Mettre à jour l'évaluation
        await hrStorage.updateEvaluation(eval_.id, {
            managerEvalStatus: "COMPLETED",
            managerEvalSubmittedAt: new Date(),
            managerEvalScore: score.toFixed(2),
            managerCommentaire: commentaire || null,
            recommandation: recommandation || null,
            statut: "MANAGER_REVIEW",
        });

        const wsInstance = getWsInstance();
        wsInstance?.broadcast({ type: 'HR_UPDATE', payload: { entity: 'evaluation', action: 'updated', id: eval_.id } });

        res.json({ success: true, score });
    } catch (error) {
        logger.error({ err: error }, "Erreur soumission évaluation manager");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PATCH /api/hr/evaluations/:id/finalize
/**
 * PATCH /api/hr/evaluations/:id/finalize
 */
evaluationsSuiviRouter.patch("/evaluations/:id/finalize", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });

        const { actionPlan, trainingRecommendations, recommandation } = req.body;
        const eval_ = await hrStorage.getEvaluationById(req.params.id);
        if (!eval_) return res.status(404).json({ error: "Évaluation introuvable" });

        // Mettre à jour le plan d'action si fourni
        if (actionPlan !== undefined || trainingRecommendations !== undefined || recommandation !== undefined) {
            await hrStorage.updateEvaluation(eval_.id, {
                ...(actionPlan !== undefined && { actionPlan }),
                ...(trainingRecommendations !== undefined && { trainingRecommendations }),
                ...(recommandation !== undefined && { recommandation }),
            });
        }

        const finalScore = await finalizeEvaluation(eval_.id);

        const wsInstance = getWsInstance();
        wsInstance?.broadcast({ type: 'HR_UPDATE', payload: { entity: 'evaluation', action: 'updated', id: eval_.id } });

        res.json({ success: true, finalScore });
    } catch (error) {
        logger.error({ err: error }, "Erreur finalisation évaluation");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/evaluations/analytics/history
/**
 * GET /api/hr/evaluations/analytics/history
 */
evaluationsSuiviRouter.get("/evaluations/analytics/history", getAuthUser, attachAbility, async (req, res) => {
    try {
        const { employeId } = req.query;
        if (!employeId) return res.status(400).json({ error: "employeId requis" });
        const history = await hrStorage.getEmployeeEvaluationHistory(employeId as string);
        res.json(history);
    } catch (error) {
        logger.error({ err: error }, "Erreur historique évaluations");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/evaluations/analytics/campaign-summary
/**
 * GET /api/hr/evaluations/analytics/campaign-summary
 */
evaluationsSuiviRouter.get("/evaluations/analytics/campaign-summary", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.VIEW, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const { campaignId } = req.query;
        if (!campaignId) return res.status(400).json({ error: "campaignId requis" });

        const evals = await hrStorage.getEvaluations({ campaignId: campaignId as string });
        const total = evals.length;
        const finalized = evals.filter(e => e.statut === "FINALIZED").length;
        const selfCompleted = evals.filter(e => e.selfEvalStatus === "COMPLETED").length;
        const managerCompleted = evals.filter(e => e.managerEvalStatus === "COMPLETED").length;
        const scores = evals.filter(e => e.finalScore).map(e => parseFloat(e.finalScore!));
        const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null;

        const byRecommandation: Record<string, number> = {};
        evals.filter(e => e.recommandation).forEach(e => {
            byRecommandation[e.recommandation!] = (byRecommandation[e.recommandation!] || 0) + 1;
        });

        res.json({ total, finalized, selfCompleted, managerCompleted, avgScore, byRecommandation });
    } catch (error) {
        logger.error({ err: error }, "Erreur summary campagne");
        res.status(500).json({ error: "Erreur serveur" });
    }
});
