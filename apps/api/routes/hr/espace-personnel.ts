import { Router } from "express";
/**
 * Routes RH — Espace personnel de l'employé connecté : mes demandes, alertes et compteurs.
 *
 * Monté sous /api/hr par le routeur d'index (hr.ts).
 * Endpoints :
 *   GET    /api/hr/pending-count
 *   GET    /api/hr/mon-espace/unread-count
 *   GET    /api/hr/alerts
 *   GET    /api/hr/alerts/stats
 *   POST   /api/hr/alerts/:id/acknowledge
 *   POST   /api/hr/alerts/:id/dismiss
 *   GET    /api/hr/alerts/config
 *   PUT    /api/hr/alerts/config/:type
 *   GET    /api/hr/my/dashboard
 *   GET    /api/hr/my/presence
 *   GET    /api/hr/my/evaluations
 *   GET    /api/hr/my/profile
 *   PUT    /api/hr/my/profile
 */
import { db } from "../../db";
import { demandesConges, bulletinsPaie, employes, evaluations, hrDocumentRequests } from "@shared/schema";
import { eq, and, sql, count, isNull } from "drizzle-orm";
import { getAuthUser } from "../../middleware";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { users } from "@shared/schema";
import * as hrStorage from "../../storage/hr";

import { logger } from "./shared";

export const espacePersonnelRouter = Router();

// =============================================================================
// PENDING COUNT (for sidebar badge)
// =============================================================================
/**
 * GET /api/hr/pending-count
 */
espacePersonnelRouter.get("/pending-count", getAuthUser, attachAbility, async (req, res) => {
    try {
        // Only return counts for users who can access HR module
        if (!req.ability?.can(Actions.VIEW, Subjects.RH)) {
            return res.json({ pendingConges: 0, pendingDocuments: 0, total: 0 });
        }

        const [congesResult] = await db
            .select({ count: sql<number>`COUNT(*)::int` })
            .from(demandesConges)
            .where(eq(demandesConges.statut, "PENDING"));

        const [docsResult] = await db
            .select({ count: sql<number>`COUNT(*)::int` })
            .from(hrDocumentRequests)
            .where(eq(hrDocumentRequests.statut, "PENDING"));

        const pendingConges = congesResult?.count ?? 0;
        const pendingDocuments = docsResult?.count ?? 0;

        res.json({
            pendingConges,
            pendingDocuments,
            total: pendingConges + pendingDocuments,
        });
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération pending count RH");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// =============================================================================
// MON ESPACE — UNREAD COUNT (employee badge)
// =============================================================================

// GET /api/hr/mon-espace/unread-count — unread bulletins + new completed documents
/**
 * GET /api/hr/mon-espace/unread-count
 */
espacePersonnelRouter.get("/mon-espace/unread-count", getAuthUser, attachAbility, async (req, res) => {
    try {
        const user = (req as any).user;
        const [emp] = await db.select({ id: employes.id }).from(employes).where(eq(employes.userId, user.id)).limit(1);
        if (!emp) return res.json({ unreadBulletins: 0, newDocuments: 0, total: 0 });

        const [bulletinsResult] = await db
            .select({ count: sql<number>`COUNT(*)::int` })
            .from(bulletinsPaie)
            .where(and(
                eq(bulletinsPaie.employeId, emp.id),
                sql`${bulletinsPaie.statut} IN ('VALIDATED', 'PAID')`,
                isNull(bulletinsPaie.viewedAt),
            ));

        const [docsResult] = await db
            .select({ count: sql<number>`COUNT(*)::int` })
            .from(hrDocumentRequests)
            .where(and(
                eq(hrDocumentRequests.employeId, emp.id),
                eq(hrDocumentRequests.statut, "COMPLETED"),
                isNull(hrDocumentRequests.viewedAt),
            ));

        const unreadBulletins = bulletinsResult?.count ?? 0;
        const newDocuments = docsResult?.count ?? 0;

        res.json({ unreadBulletins, newDocuments, total: unreadBulletins + newDocuments });
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération unread count Mon Espace");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// =============================================================================
// HR ALERTS
// =============================================================================

// GET /api/hr/alerts
/**
 * GET /api/hr/alerts
 */
espacePersonnelRouter.get("/alerts", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.VIEW, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const user = (req as any).user;
        const alerts = await hrStorage.getUpcomingAlerts(30, user.agenceId);
        res.json(alerts);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération alertes");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/alerts/stats
/**
 * GET /api/hr/alerts/stats
 */
espacePersonnelRouter.get("/alerts/stats", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.VIEW, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const user = (req as any).user;
        const stats = await hrStorage.getAlertStats(user.agenceId);
        res.json(stats);
    } catch (error) {
        logger.error({ err: error }, "Erreur stats alertes");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/alerts/:id/acknowledge
/**
 * POST /api/hr/alerts/:id/acknowledge
 */
espacePersonnelRouter.post("/alerts/:id/acknowledge", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const user = (req as any).user;
        const alert = await hrStorage.acknowledgeAlert(req.params.id, user.id);
        if (!alert) return res.status(404).json({ error: "Alerte introuvable" });
        res.json(alert);
    } catch (error) {
        logger.error({ err: error }, "Erreur acknowledge alerte");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/alerts/:id/dismiss
/**
 * POST /api/hr/alerts/:id/dismiss
 */
espacePersonnelRouter.post("/alerts/:id/dismiss", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const user = (req as any).user;
        const { reason } = req.body;
        const alert = await hrStorage.dismissAlert(req.params.id, user.id, reason);
        if (!alert) return res.status(404).json({ error: "Alerte introuvable" });
        res.json(alert);
    } catch (error) {
        logger.error({ err: error }, "Erreur dismiss alerte");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/alerts/config
/**
 * GET /api/hr/alerts/config
 */
espacePersonnelRouter.get("/alerts/config", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const configs = await hrStorage.getAlertConfigs();
        res.json(configs);
    } catch (error) {
        logger.error({ err: error }, "Erreur config alertes");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PUT /api/hr/alerts/config/:type
/**
 * PUT /api/hr/alerts/config/:type
 */
espacePersonnelRouter.put("/alerts/config/:type", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const config = await hrStorage.updateAlertConfig(req.params.type, req.body);
        if (!config) return res.status(404).json({ error: "Config introuvable" });
        res.json(config);
    } catch (error) {
        logger.error({ err: error }, "Erreur MAJ config alerte");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// ================================================
// MON ESPACE - Portail employé self-service
// ================================================

// GET /api/hr/my/dashboard
/**
 * GET /api/hr/my/dashboard
 */
espacePersonnelRouter.get("/my/dashboard", getAuthUser, attachAbility, async (req, res) => {
    try {
        const user = (req as any).user;
        const [emp] = await db.select().from(employes).where(eq(employes.userId, user.id));
        if (!emp) return res.status(404).json({ error: "Profil employé introuvable" });
        const dashboard = await hrStorage.getMyDashboard(emp.id);
        res.json(dashboard);
    } catch (error) {
        logger.error({ err: error }, "Erreur dashboard Mon Espace");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/my/presence
/**
 * GET /api/hr/my/presence
 */
espacePersonnelRouter.get("/my/presence", getAuthUser, attachAbility, async (req, res) => {
    try {
        const user = (req as any).user;
        const [emp] = await db.select().from(employes).where(eq(employes.userId, user.id));
        if (!emp) return res.status(404).json({ error: "Profil employé introuvable" });
        const { mois } = req.query as { mois?: string };
        const presenceList = await hrStorage.getMyPresence(emp.id, mois);
        res.json(presenceList);
    } catch (error) {
        logger.error({ err: error }, "Erreur présence Mon Espace");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/my/evaluations
/**
 * GET /api/hr/my/evaluations
 */
espacePersonnelRouter.get("/my/evaluations", getAuthUser, attachAbility, async (req, res) => {
    try {
        const user = (req as any).user;
        const [emp] = await db.select().from(employes).where(eq(employes.userId, user.id));
        if (!emp) return res.status(404).json({ error: "Profil employé introuvable" });
        const evals = await hrStorage.getMyEvaluations(emp.id);
        res.json(evals);
    } catch (error) {
        logger.error({ err: error }, "Erreur évaluations Mon Espace");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/my/profile
/**
 * GET /api/hr/my/profile
 */
espacePersonnelRouter.get("/my/profile", getAuthUser, attachAbility, async (req, res) => {
    try {
        const user = (req as any).user;
        const [emp] = await db.select({
            situationFamiliale: employes.situationFamiliale,
            nombreEnfantsCharge: employes.nombreEnfantsCharge,
            paymentMethod: employes.paymentMethod,
            paymentDetails: employes.paymentDetails,
            bankName: employes.bankName,
            bankCode: employes.bankCode,
            branchCode: employes.branchCode,
            bankAccountNumber: employes.bankAccountNumber,
            accountKey: employes.accountKey,
        }).from(employes).where(eq(employes.userId, user.id));
        if (!emp) return res.status(404).json({ error: "Profil employé introuvable" });
        res.json(emp);
    } catch (error) {
        logger.error({ err: error }, "Erreur lecture profil Mon Espace");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PUT /api/hr/my/profile
/**
 * PUT /api/hr/my/profile
 */
espacePersonnelRouter.put("/my/profile", getAuthUser, attachAbility, async (req, res) => {
    try {
        const user = (req as any).user;
        const [emp] = await db.select().from(employes).where(eq(employes.userId, user.id));
        if (!emp) return res.status(404).json({ error: "Profil employé introuvable" });
        const updated = await hrStorage.updateMyProfile(emp.id, req.body);
        if (!updated) return res.status(404).json({ error: "Mise à jour échouée" });
        res.json(updated);
    } catch (error) {
        logger.error({ err: error }, "Erreur mise à jour profil Mon Espace");
        res.status(500).json({ error: "Erreur serveur" });
    }
});
