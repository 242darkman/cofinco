import { Router } from "express";
/**
 * Routes RH — Évaluations de performance : campagnes, notation et finalisation.
 *
 * Monté sous /api/hr par le routeur d'index (hr.ts).
 * Endpoints :
 *   GET    /api/hr/evaluations/templates
 *   POST   /api/hr/evaluations/templates
 *   PUT    /api/hr/evaluations/templates/:id
 *   DELETE /api/hr/evaluations/templates/:id
 *   GET    /api/hr/evaluations/campaigns
 *   POST   /api/hr/evaluations/campaigns
 *   PATCH  /api/hr/evaluations/campaigns/:id/status
 *   GET    /api/hr/evaluations
 *   GET    /api/hr/evaluations/:id
 *   GET    /api/hr/evaluations/:id/comparison
 *   POST   /api/hr/evaluations/:id/self-eval
 */
import { db } from "../../db";
import { employes, evaluationCriteria, evaluationCampaigns, evaluations } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getAuthUser } from "../../middleware";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { getWsInstance } from "../../ws-server";
import { generateCampaignEvaluations, computeEvaluationScore, finalizeEvaluation } from "../../services/evaluation-service";
import * as hrStorage from "../../storage/hr";

export const evaluationsRouter = Router();

// =============================================================================
// EVALUATION TEMPLATES
// =============================================================================

// GET /api/hr/evaluations/templates
/**
 * GET /api/hr/evaluations/templates
 */
evaluationsRouter.get("/evaluations/templates", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.VIEW, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const templates = await hrStorage.getEvaluationTemplates({ actif: true });
        res.json(templates);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération templates évaluation");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/evaluations/templates
/**
 * POST /api/hr/evaluations/templates
 */
evaluationsRouter.post("/evaluations/templates", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const { criteria, ...templateData } = req.body;

        if (!templateData.nom) return res.status(400).json({ error: "Le nom est requis" });
        if (!criteria?.length) return res.status(400).json({ error: "Au moins un critère est requis" });

        const totalPoids = criteria.reduce((sum: number, c: any) => sum + (c.poids || 0), 0);
        if (totalPoids !== 100) return res.status(400).json({ error: `Le total des poids doit être 100% (actuel: ${totalPoids}%)` });

        const user = (req as any).user;
        const template = await hrStorage.createEvaluationTemplate(
            { ...templateData, createdBy: user.id, agenceId: user.agenceId },
            criteria
        );
        res.status(201).json(template);
    } catch (error) {
        logger.error({ err: error }, "Erreur création template évaluation");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PUT /api/hr/evaluations/templates/:id
/**
 * PUT /api/hr/evaluations/templates/:id
 */
evaluationsRouter.put("/evaluations/templates/:id", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const { criteria, ...templateData } = req.body;

        if (criteria) {
            const totalPoids = criteria.reduce((sum: number, c: any) => sum + (c.poids || 0), 0);
            if (totalPoids !== 100) return res.status(400).json({ error: `Le total des poids doit être 100% (actuel: ${totalPoids}%)` });
        }

        const template = await hrStorage.updateEvaluationTemplate(req.params.id, templateData, criteria);
        if (!template) return res.status(404).json({ error: "Template introuvable" });
        res.json(template);
    } catch (error) {
        logger.error({ err: error }, "Erreur modification template évaluation");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// DELETE /api/hr/evaluations/templates/:id
/**
 * DELETE /api/hr/evaluations/templates/:id
 */
evaluationsRouter.delete("/evaluations/templates/:id", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        await hrStorage.deleteEvaluationTemplate(req.params.id);
        res.json({ success: true });
    } catch (error) {
        logger.error({ err: error }, "Erreur suppression template évaluation");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// =============================================================================
// EVALUATION CAMPAIGNS
// =============================================================================

// GET /api/hr/evaluations/campaigns
/**
 * GET /api/hr/evaluations/campaigns
 */
evaluationsRouter.get("/evaluations/campaigns", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.VIEW, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const { statut } = req.query;
        const campaigns = await hrStorage.getEvaluationCampaigns({ statut: statut as string });
        res.json(campaigns);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération campagnes");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/evaluations/campaigns
/**
 * POST /api/hr/evaluations/campaigns
 */
evaluationsRouter.post("/evaluations/campaigns", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const user = (req as any).user;

        const campaign = await hrStorage.createEvaluationCampaign({
            ...req.body,
            createdBy: user.id,
            agenceId: user.agenceId,
        });

        // Générer les évaluations si la campagne est directement activée
        if (campaign.statut === "ACTIVE") {
            const result = await generateCampaignEvaluations(campaign.id);
            return res.status(201).json({ ...campaign, generated: result.created });
        }

        res.status(201).json(campaign);
    } catch (error) {
        logger.error({ err: error }, "Erreur création campagne");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PATCH /api/hr/evaluations/campaigns/:id/status
/**
 * PATCH /api/hr/evaluations/campaigns/:id/status
 */
evaluationsRouter.patch("/evaluations/campaigns/:id/status", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const { statut } = req.body;
        if (!statut) return res.status(400).json({ error: "Statut requis" });

        const campaign = await hrStorage.updateEvaluationCampaign(req.params.id, { statut });
        if (!campaign) return res.status(404).json({ error: "Campagne introuvable" });

        // Si activation, générer les évaluations
        if (statut === "ACTIVE") {
            const result = await generateCampaignEvaluations(campaign.id);
            return res.json({ ...campaign, generated: result.created });
        }

        res.json(campaign);
    } catch (error) {
        logger.error({ err: error }, "Erreur changement statut campagne");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// =============================================================================
// EVALUATIONS (Individual)
// =============================================================================

// GET /api/hr/evaluations
/**
 * GET /api/hr/evaluations
 */
evaluationsRouter.get("/evaluations", getAuthUser, attachAbility, async (req, res) => {
    try {
        const user = (req as any).user;
        const { campaignId, employeId, statut } = req.query;
        const isRH = req.ability?.can(Actions.MANAGE, Subjects.RH);

        // Trouver l'employé correspondant à l'utilisateur connecté
        const [currentEmploye] = await db.select().from(employes).where(eq(employes.userId, user.id));

        const filters: any = {};
        if (campaignId) filters.campaignId = campaignId;
        if (statut) filters.statut = statut;

        if (isRH) {
            if (employeId) filters.employeId = employeId;
        } else if (currentEmploye) {
            // Les managers voient les évaluations de leur équipe
            const isManager = await db.select({ id: employes.id }).from(employes).where(eq(employes.managerId, currentEmploye.id)).limit(1);
            if (isManager.length > 0) {
                filters.managerId = currentEmploye.id;
            } else {
                filters.employeId = currentEmploye.id;
            }
        } else {
            return res.json([]);
        }

        const evals = await hrStorage.getEvaluations(filters);
        res.json(evals);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération évaluations");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/evaluations/:id
/**
 * GET /api/hr/evaluations/:id
 */
evaluationsRouter.get("/evaluations/:id", getAuthUser, attachAbility, async (req, res) => {
    try {
        const eval_ = await hrStorage.getEvaluationById(req.params.id);
        if (!eval_) return res.status(404).json({ error: "Évaluation introuvable" });

        // Charger les critères du template de la campagne
        const [campaign] = await db.select().from(evaluationCampaigns).where(eq(evaluationCampaigns.id, eval_.campaignId));
        const criteria = campaign?.templateId
            ? await db.select().from(evaluationCriteria).where(eq(evaluationCriteria.templateId, campaign.templateId)).orderBy(evaluationCriteria.ordre)
            : [];

        // Charger les réponses
        const responses = await hrStorage.getEvaluationResponses(eval_.id);

        res.json({ ...eval_, criteria, responses, campaign });
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération évaluation");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/evaluations/:id/comparison
/**
 * GET /api/hr/evaluations/:id/comparison
 */
evaluationsRouter.get("/evaluations/:id/comparison", getAuthUser, attachAbility, async (req, res) => {
    try {
        const eval_ = await hrStorage.getEvaluationById(req.params.id);
        if (!eval_) return res.status(404).json({ error: "Évaluation introuvable" });

        const [campaign] = await db.select().from(evaluationCampaigns).where(eq(evaluationCampaigns.id, eval_.campaignId));
        const criteria = campaign?.templateId
            ? await db.select().from(evaluationCriteria).where(eq(evaluationCriteria.templateId, campaign.templateId)).orderBy(evaluationCriteria.ordre)
            : [];

        const selfResponses = await hrStorage.getEvaluationResponses(eval_.id, "SELF");
        const managerResponses = await hrStorage.getEvaluationResponses(eval_.id, "MANAGER");

        const selfMap = new Map(selfResponses.map(r => [r.criteriaId, r]));
        const managerMap = new Map(managerResponses.map(r => [r.criteriaId, r]));

        const comparison = criteria.map(c => ({
            criteriaId: c.id,
            libelle: c.libelle,
            categorie: c.categorie,
            poids: c.poids,
            selfRating: selfMap.get(c.id)?.rating || null,
            selfComment: selfMap.get(c.id)?.commentaire || null,
            managerRating: managerMap.get(c.id)?.rating || null,
            managerComment: managerMap.get(c.id)?.commentaire || null,
            gap: (selfMap.get(c.id)?.rating && managerMap.get(c.id)?.rating)
                ? (selfMap.get(c.id)!.rating - managerMap.get(c.id)!.rating)
                : null,
        }));

        res.json({
            evaluation: eval_,
            comparison,
            selfScore: eval_.selfEvalScore,
            managerScore: eval_.managerEvalScore,
            finalScore: eval_.finalScore,
        });
    } catch (error) {
        logger.error({ err: error }, "Erreur comparaison évaluation");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/evaluations/:id/self-eval
/**
 * POST /api/hr/evaluations/:id/self-eval
 */
evaluationsRouter.post("/evaluations/:id/self-eval", getAuthUser, attachAbility, async (req, res) => {
    try {
        const user = (req as any).user;
        const eval_ = await hrStorage.getEvaluationById(req.params.id);
        if (!eval_) return res.status(404).json({ error: "Évaluation introuvable" });

        // Vérifier que l'utilisateur est bien l'employé
        const [emp] = await db.select().from(employes).where(eq(employes.userId, user.id));
        if (!emp || emp.id !== eval_.employeId) {
            return res.status(403).json({ error: "Vous ne pouvez compléter que votre propre auto-évaluation" });
        }

        const { responses, commentaire } = req.body;
        if (!responses?.length) return res.status(400).json({ error: "Les réponses sont requises" });

        // Sauvegarder les réponses
        await hrStorage.batchUpsertResponses(eval_.id, "SELF", responses);

        // Calculer le score
        const score = await computeEvaluationScore(eval_.id, "SELF");

        // Mettre à jour l'évaluation
        await hrStorage.updateEvaluation(eval_.id, {
            selfEvalStatus: "COMPLETED",
            selfEvalSubmittedAt: new Date(),
            selfEvalScore: score.toFixed(2),
            selfCommentaire: commentaire || null,
            statut: eval_.managerEvalStatus === "COMPLETED" ? "MANAGER_REVIEW" : "SELF_COMPLETED",
        });

        const wsInstance = getWsInstance();
        wsInstance?.broadcast({ type: 'HR_UPDATE', payload: { entity: 'evaluation', action: 'updated', id: eval_.id } });

        res.json({ success: true, score });
    } catch (error) {
        logger.error({ err: error }, "Erreur soumission auto-évaluation");
        res.status(500).json({ error: "Erreur serveur" });
    }
});
