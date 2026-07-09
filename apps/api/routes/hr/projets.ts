import { Router } from "express";
/**
 * Routes RH — Projets et modèles de shifts pour la planification.
 *
 * Monté sous /api/hr par le routeur d'index (hr.ts).
 * Endpoints :
 *   GET    /api/hr/shift-templates
 *   POST   /api/hr/shift-templates
 *   POST   /api/hr/shift-templates/:id/apply/:employeId
 *   DELETE /api/hr/shift-templates/:id
 *   GET    /api/hr/projects
 *   POST   /api/hr/projects
 *   GET    /api/hr/projects/:id
 *   PUT    /api/hr/projects/:id
 *   DELETE /api/hr/projects/:id
 *   POST   /api/hr/projects/:id/members
 *   DELETE /api/hr/projects/:id/members/:employeId
 *   GET    /api/hr/projects/:id/cost-summary
 */
import { db } from "../../db";
import { horairesTravail, shiftTemplates } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";
import { getAuthUser } from "../../middleware";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import * as hrStorage from "../../storage/hr";

import { logger } from "./shared";

export const projetsRouter = Router();

/**
 * ========================================
 * SHIFT TEMPLATES (Modèles d'horaires)
 * ========================================
 */

// GET /api/hr/shift-templates - Liste des modèles d'horaires
/**
 * GET /api/hr/shift-templates
 */
projetsRouter.get("/shift-templates", getAuthUser, attachAbility, async (req, res) => {
    try {
        const { agenceId } = req.query;
        let query = db.select().from(shiftTemplates);

        if (agenceId) {
            query = query.where(eq(shiftTemplates.agenceId, agenceId as string)) as any;
        }

        const templates = await query.orderBy(desc(shiftTemplates.createdAt));
        res.json(templates);
    } catch (error) {
        logger.error({ err: error }, 'Erreur récupération shift templates');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/shift-templates - Créer un modèle d'horaires
/**
 * POST /api/hr/shift-templates
 */
projetsRouter.post("/shift-templates", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.HORAIRE), async (req, res) => {
    try {
        const { nom, description, agenceId, horaires, isDefault } = req.body;

        if (!nom || !horaires || !Array.isArray(horaires)) {
            return res.status(400).json({ error: "Nom et horaires requis" });
        }

        const userId = (req.user as any)?.id;

        // If setting as default, unset other defaults for this agency
        if (isDefault && agenceId) {
            await db.update(shiftTemplates)
                .set({ isDefault: false })
                .where(and(
                    eq(shiftTemplates.agenceId, agenceId),
                    eq(shiftTemplates.isDefault, true)
                ));
        }

        const [created] = await db.insert(shiftTemplates).values({
            nom,
            description,
            agenceId: agenceId || null,
            horaires,
            createdBy: userId,
            isDefault: isDefault || false,
        }).returning();

        res.status(201).json(created);
    } catch (error) {
        logger.error({ err: error }, 'Erreur création shift template');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/shift-templates/:id/apply/:employeId - Appliquer un modèle à un employé
/**
 * POST /api/hr/shift-templates/:id/apply/:employeId
 */
projetsRouter.post("/shift-templates/:id/apply/:employeId", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.HORAIRE), async (req, res) => {
    try {
        const { id, employeId } = req.params;

        // Get template
        const [template] = await db.select().from(shiftTemplates).where(eq(shiftTemplates.id, id));
        if (!template) {
            return res.status(404).json({ error: "Modèle non trouvé" });
        }

        // Deactivate existing schedules for this employee
        await db.update(horairesTravail)
            .set({ actif: false })
            .where(eq(horairesTravail.employeId, employeId));

        // Create new schedules from template
        const horaires = template.horaires as any[];
        const newSchedules = await Promise.all(
            horaires.map(h =>
                db.insert(horairesTravail).values({
                    employeId,
                    jourSemaine: h.jourSemaine,
                    heureDebut: h.heureDebut,
                    heureFin: h.heureFin,
                    pauseMinutes: h.pauseMinutes || 60,
                    actif: true,
                }).returning()
            )
        );

        res.json({
            message: "Modèle appliqué avec succès",
            schedulesCreated: newSchedules.flat()
        });
    } catch (error) {
        logger.error({ err: error }, 'Erreur application shift template');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// DELETE /api/hr/shift-templates/:id - Supprimer un modèle
/**
 * DELETE /api/hr/shift-templates/:id
 */
projetsRouter.delete("/shift-templates/:id", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.HORAIRE), async (req, res) => {
    try {
        const { id } = req.params;
        await db.delete(shiftTemplates).where(eq(shiftTemplates.id, id));
        res.json({ message: "Modèle supprimé" });
    } catch (error) {
        logger.error({ err: error }, 'Erreur suppression shift template');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// ================================================
// PROJETS RH - Gestion du temps projet
// ================================================

// GET /api/hr/projects
/**
 * GET /api/hr/projects
 */
projetsRouter.get("/projects", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.VIEW, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const { statut, agenceId } = req.query as { statut?: string; agenceId?: string };
        const projects = await hrStorage.getProjects({ statut, agenceId });
        res.json(projects);
    } catch (error) {
        logger.error({ err: error }, "Erreur liste projets");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/projects
/**
 * POST /api/hr/projects
 */
projetsRouter.post("/projects", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const user = (req as any).user;
        const project = await hrStorage.createProject({ ...req.body, createdBy: user.id });
        res.status(201).json(project);
    } catch (error) {
        logger.error({ err: error }, "Erreur création projet");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/projects/:id
/**
 * GET /api/hr/projects/:id
 */
projetsRouter.get("/projects/:id", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.VIEW, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const project = await hrStorage.getProjectById(req.params.id);
        if (!project) return res.status(404).json({ error: "Projet introuvable" });
        res.json(project);
    } catch (error) {
        logger.error({ err: error }, "Erreur détail projet");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PUT /api/hr/projects/:id
/**
 * PUT /api/hr/projects/:id
 */
projetsRouter.put("/projects/:id", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const project = await hrStorage.updateProject(req.params.id, req.body);
        if (!project) return res.status(404).json({ error: "Projet introuvable" });
        res.json(project);
    } catch (error) {
        logger.error({ err: error }, "Erreur modification projet");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// DELETE /api/hr/projects/:id (soft delete - sets status to CANCELLED)
/**
 * DELETE /api/hr/projects/:id
 */
projetsRouter.delete("/projects/:id", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const project = await hrStorage.updateProject(req.params.id, { statut: 'CANCELLED' });
        if (!project) return res.status(404).json({ error: "Projet introuvable" });
        res.json(project);
    } catch (error) {
        logger.error({ err: error }, "Erreur annulation projet");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/projects/:id/members
/**
 * POST /api/hr/projects/:id/members
 */
projetsRouter.post("/projects/:id/members", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const member = await hrStorage.addProjectMember({
            projetId: req.params.id,
            ...req.body,
        });
        res.status(201).json(member);
    } catch (error) {
        logger.error({ err: error }, "Erreur ajout membre projet");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// DELETE /api/hr/projects/:id/members/:employeId
/**
 * DELETE /api/hr/projects/:id/members/:employeId
 */
projetsRouter.delete("/projects/:id/members/:employeId", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        await hrStorage.removeProjectMember(req.params.id, req.params.employeId);
        res.json({ success: true });
    } catch (error) {
        logger.error({ err: error }, "Erreur retrait membre projet");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/projects/:id/cost-summary
/**
 * GET /api/hr/projects/:id/cost-summary
 */
projetsRouter.get("/projects/:id/cost-summary", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.VIEW, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const summary = await hrStorage.getProjectCostSummary(req.params.id);
        res.json(summary);
    } catch (error) {
        logger.error({ err: error }, "Erreur résumé coûts projet");
        res.status(500).json({ error: "Erreur serveur" });
    }
});
