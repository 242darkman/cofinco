import { Router } from "express";
/**
 * Routes RH — Rapports et analytique RH.
 *
 * Monté sous /api/hr par le routeur d'index (hr.ts).
 * Endpoints :
 *   GET    /api/hr/analytics
 *   GET    /api/hr/stats
 *   GET    /api/hr/reports/registre-personnel
 *   GET    /api/hr/reports/bilan-social
 */
import { db } from "../../db";
import { demandesConges, sanctions, candidatures, bulletinsPaie, employes, departments, jobPositions } from "@shared/schema";
import { StatutCandidature, StatutConge, StatutUser, StatutVisiteTerrain, StatutArchive } from "@shared/enum/status-constants";
import { eq, and, gte, sql, count } from "drizzle-orm";
import { getAuthUser } from "../../middleware";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { storage } from "../../storage";
import * as hrStorage from "../../storage/hr";
import { successResponse, errorResponse } from "./shared";

export const rapportsRouter = Router();

/**
 * GET /api/hr/analytics
 */
rapportsRouter.get("/analytics", getAuthUser, attachAbility, async (req, res) => {
    try {
        // 1. Effectifs par département (via jobPositions -> departments)
        const deptStats = await db
            .select({
                departement: departments.name,
                total: count(),
            })
            .from(employes)
            .leftJoin(jobPositions, eq(employes.jobPositionId, jobPositions.id))
            .leftJoin(departments, eq(jobPositions.departmentId, departments.id))
            .where(eq(employes.statut, StatutUser.ACTIVE))
            .groupBy(departments.name);

        // 2. Tendances congés mensuels (6 derniers mois)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const congesTrends = await db
            .select({
                mois: sql<string>`TO_CHAR(${demandesConges.dateDebut}, 'YYYY-MM')`,
                type: demandesConges.type,
                total: count(),
            })
            .from(demandesConges)
            .where(gte(demandesConges.dateDebut, sixMonthsAgo.toISOString().split('T')[0]))
            .groupBy(sql`TO_CHAR(${demandesConges.dateDebut}, 'YYYY-MM')`, demandesConges.type);

        // 3. Masse salariale mensuelle (6 derniers mois)
        const masseSalariale = await db
            .select({
                mois: bulletinsPaie.mois,
                total: sql<string>`COALESCE(SUM(CAST(${bulletinsPaie.salaireNet} AS NUMERIC)), 0)`,
            })
            .from(bulletinsPaie)
            .where(and(
                eq(bulletinsPaie.statut, 'PAID'),
                gte(bulletinsPaie.mois, sixMonthsAgo.toISOString().slice(0, 7))
            ))
            .groupBy(bulletinsPaie.mois);

        // 4. Distribution sanctions par gravité
        const sanctionsDistrib = await db
            .select({
                gravite: sanctions.gravite,
                total: count(),
            })
            .from(sanctions)
            .groupBy(sanctions.gravite);

        // 5. KPI cards
        const [totalEmployes] = await db
            .select({ total: count() })
            .from(employes)
            .where(eq(employes.statut, StatutUser.ACTIVE));

        const [postesOuverts] = await db
            .select({ total: count() })
            .from(candidatures)
            .where(eq(candidatures.statut, StatutCandidature.PENDING));

        // Taux rotation (terminés sur 12 mois / total)
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        const [departures] = await db
            .select({ total: count() })
            .from(employes)
            .where(and(
                eq(employes.statut, StatutUser.INACTIVE),
                gte(employes.updatedAt, oneYearAgo)
            ));

        const totalEmp = totalEmployes?.total || 0;
        const totalDepartures = departures?.total || 0;
        const tauxRotation = totalEmp > 0 ? ((totalDepartures / totalEmp) * 100).toFixed(1) : '0';

        res.json({
            effectifsParDepartement: deptStats.map(d => ({
                departement: d.departement || 'Non assigné',
                total: d.total,
            })),
            congesTendances: congesTrends.map(c => ({
                mois: c.mois,
                type: c.type,
                total: c.total,
            })),
            masseSalariale: masseSalariale.map(m => ({
                mois: m.mois,
                total: parseFloat(m.total),
            })),
            sanctionsDistribution: sanctionsDistrib.map(s => ({
                gravite: s.gravite,
                total: s.total,
            })),
            kpis: {
                totalEmployes: totalEmp,
                tauxRotation: parseFloat(tauxRotation),
                postesOuverts: postesOuverts?.total || 0,
            },
        });
    } catch (error) {
        logger.error({ err: error }, 'Erreur analytics RH');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

/**
 * ========================================
 * STATISTIQUES RH
 * ========================================
 */

// GET /api/hr/stats - Statistiques globales RH
/**
 * GET /api/hr/stats
 */
rapportsRouter.get("/stats", getAuthUser, attachAbility, async (req, res) => {
  try {
    const stats = await storage.getHrStats();

    // Add additional stats for the new features
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().toISOString().slice(0, 7);

    // Leave stats
    const [leaveStats] = await db
      .select({
        pending: sql<number>`COUNT(*) FILTER (WHERE statut = 'PENDING')::int`,
        approved: sql<number>`COUNT(*) FILTER (WHERE statut = 'APPROVED')::int`,
        rejected: sql<number>`COUNT(*) FILTER (WHERE statut = 'REJECTED')::int`,
      })
      .from(demandesConges)
      .where(
        sql`EXTRACT(YEAR FROM date_debut) = ${currentYear}`
      );

    // Payroll stats for current month
    const [payrollStats] = await db
      .select({
        draft: sql<number>`COUNT(*) FILTER (WHERE statut = 'DRAFT')::int`,
        validated: sql<number>`COUNT(*) FILTER (WHERE statut = 'VALIDATED')::int`,
        paid: sql<number>`COUNT(*) FILTER (WHERE statut = 'PAID')::int`,
        totalNet: sql<number>`COALESCE(SUM(salaire_net::numeric) FILTER (WHERE statut = 'PAID'), 0)::int`,
      })
      .from(bulletinsPaie)
      .where(eq(bulletinsPaie.mois, currentMonth));

    res.json(successResponse({
      ...stats,
      leaves: leaveStats,
      payroll: {
        ...payrollStats,
        month: currentMonth,
      },
    }));
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération stats RH');
    res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
  }
});

// =============================================================================
// HR REPORTS
// =============================================================================

// GET /api/hr/reports/registre-personnel
/**
 * GET /api/hr/reports/registre-personnel
 */
rapportsRouter.get("/reports/registre-personnel", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.VIEW, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const filters: { statut?: string; departmentId?: string; agenceId?: string } = {};
        if (req.query.statut) filters.statut = req.query.statut as string;
        if (req.query.departmentId) filters.departmentId = req.query.departmentId as string;
        if (req.query.agenceId) filters.agenceId = req.query.agenceId as string;
        const data = await hrStorage.getRegistrePersonnel(Object.keys(filters).length > 0 ? filters : undefined);
        res.json(data);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération registre du personnel");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/reports/bilan-social
/**
 * GET /api/hr/reports/bilan-social
 */
rapportsRouter.get("/reports/bilan-social", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.VIEW, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
        const data = await hrStorage.getBilanSocial(year);
        res.json(data);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération bilan social");
        res.status(500).json({ error: "Erreur serveur" });
    }
});
