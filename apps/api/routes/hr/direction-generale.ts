import { Router } from "express";
/**
 * Routes RH — Validations et vues réservées à la direction générale.
 *
 * Monté sous /api/hr par le routeur d'index (hr.ts).
 * Endpoints :
 *   GET    /api/hr/direction-generale
 *   POST   /api/hr/direction-generale
 *   PUT    /api/hr/direction-generale/:id
 *   DELETE /api/hr/direction-generale/:id
 */
import { getAuthUser } from "../../middleware";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { hrService } from "../../services/hr-service";
import { z } from "zod";
import * as hrStorage from "../../storage/hr";

import { logger } from "./shared";

export const directionGeneraleRouter = Router();

/**
 * ========================================
 * DIRECTION GÉNÉRALE (PDG, DGA - Rôles globaux)
 * ========================================
 */

// GET /api/hr/direction-generale - Liste des rôles globaux
/**
 * GET /api/hr/direction-generale
 */
directionGeneraleRouter.get("/direction-generale", getAuthUser, attachAbility, async (req, res) => {
    try {
        const includeHistory = req.query.history === 'true';
        const roles = includeHistory
            ? await hrStorage.getGlobalRolesHistory()
            : await hrStorage.getActiveGlobalRoles();
        res.json(roles);
    } catch (error) {
        logger.error({ err: error }, 'Erreur récupération direction générale');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/direction-generale - Définir un rôle global (PDG, DGA, etc.)
/**
 * POST /api/hr/direction-generale
 */
directionGeneraleRouter.post("/direction-generale", getAuthUser, attachAbility, async (req, res) => {
    try {
        // Only Admin or DirecteurGeneral can manage global roles
        const canManage = req.ability?.can(Actions.MANAGE, Subjects.RH) || false;
        if (!canManage) return res.status(403).json({ error: "Non autorisé" });

        const schema = z.object({
            employeId: z.string().uuid(),
            roleType: z.enum(['PDG', 'DGA', 'SECRETAIRE_GENERAL', 'DIRECTEUR_FINANCIER']),
            titre: z.string().optional().nullable(),
            dateDebut: z.string(),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ errors: parsed.error.errors });

        const role = await hrStorage.createGlobalRole({
            employeId: parsed.data.employeId,
            roleType: parsed.data.roleType,
            titre: parsed.data.titre || null,
            dateDebut: parsed.data.dateDebut,
            statut: 'ACTIVE',
            createdBy: req.user?.id || null,
        });

        await hrService.logAction(
            'org_global_role', role.id, 'created',
            { userId: req.user?.id, userName: req.user?.nom, userRole: req.user?.role },
            undefined, parsed.data, undefined, 'critical'
        );

        res.status(201).json(role);
    } catch (error: any) {
        if (error.constraint === 'idx_ogr_unique_active_role') {
            return res.status(409).json({ error: "Un rôle de ce type est déjà actif. Révoquez-le d'abord." });
        }
        logger.error({ err: error }, 'Erreur création rôle global');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PUT /api/hr/direction-generale/:id - Modifier un rôle global
/**
 * PUT /api/hr/direction-generale/:id
 */
directionGeneraleRouter.put("/direction-generale/:id", getAuthUser, attachAbility, async (req, res) => {
    try {
        const canManage = req.ability?.can(Actions.MANAGE, Subjects.RH) || false;
        if (!canManage) return res.status(403).json({ error: "Non autorisé" });

        const schema = z.object({
            titre: z.string().optional().nullable(),
            dateDebut: z.string().optional(),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ errors: parsed.error.errors });

        const updated = await hrStorage.updateGlobalRole(req.params.id, parsed.data);
        if (!updated) return res.status(404).json({ error: "Rôle non trouvé" });

        await hrService.logAction(
            'org_global_role', req.params.id, 'updated',
            { userId: req.user?.id, userName: req.user?.nom, userRole: req.user?.role },
            undefined, parsed.data, undefined, 'critical'
        );

        res.json(updated);
    } catch (error) {
        logger.error({ err: error }, 'Erreur mise à jour rôle global');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// DELETE /api/hr/direction-generale/:id - Révoquer un rôle global (soft)
/**
 * DELETE /api/hr/direction-generale/:id
 */
directionGeneraleRouter.delete("/direction-generale/:id", getAuthUser, attachAbility, async (req, res) => {
    try {
        const canManage = req.ability?.can(Actions.MANAGE, Subjects.RH) || false;
        if (!canManage) return res.status(403).json({ error: "Non autorisé" });

        const revoked = await hrStorage.revokeGlobalRole(req.params.id);
        if (!revoked) return res.status(404).json({ error: "Rôle non trouvé" });

        await hrService.logAction(
            'org_global_role', req.params.id, 'revoked',
            { userId: req.user?.id, userName: req.user?.nom, userRole: req.user?.role },
            undefined, { statut: 'REVOKED' }, undefined, 'critical'
        );

        res.json(revoked);
    } catch (error) {
        logger.error({ err: error }, 'Erreur révocation rôle global');
        res.status(500).json({ error: "Erreur serveur" });
    }
});
