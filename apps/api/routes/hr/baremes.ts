import { Router } from "express";
/**
 * Routes RH — Barèmes salariaux.
 *
 * Monté sous /api/hr par le routeur d'index (hr.ts).
 * Endpoints :
 *   GET    /api/hr/salary-rates/history/:employeId
 *   POST   /api/hr/salary-rates/change
 *   GET    /api/hr/salary-rates/current/:employeId
 */
import { db } from "../../db";
import { employes, salaryRateHistory } from "@shared/schema";
import { eq, desc, and, sql, isNull } from "drizzle-orm";
import { getAuthUser } from "../../middleware";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { users } from "@shared/schema";
import { getWsInstance } from "../../ws-server";

import { logger } from "./shared";

export const baremesRouter = Router();

/**
 * ========================================
 * SALARY RATE HISTORY (Historique taux)
 * ========================================
 */

// GET /api/hr/salary-rates/history/:employeId - Historique des taux d'un employé
/**
 * GET /api/hr/salary-rates/history/:employeId
 */
baremesRouter.get("/salary-rates/history/:employeId", getAuthUser, attachAbility, async (req, res) => {
    try {
        const { employeId } = req.params;

        const history = await db.select({
            rate: salaryRateHistory,
            createdByName: sql<string>`(SELECT u.username FROM users u WHERE u.id = ${salaryRateHistory.createdBy})`,
        })
            .from(salaryRateHistory)
            .where(eq(salaryRateHistory.employeId, employeId))
            .orderBy(desc(salaryRateHistory.effectiveFrom));

        res.json(history.map(h => ({ ...h.rate, createdByName: h.createdByName })));
    } catch (error) {
        logger.error({ err: error }, 'Erreur récupération historique taux');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/salary-rates/change - Créer un changement de taux
/**
 * POST /api/hr/salary-rates/change
 */
baremesRouter.post("/salary-rates/change", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        const { employeId, salaireBase, tauxHoraire, tauxJournalier, modeCalcul, effectiveFrom, motifChangement } = req.body;

        if (!employeId || !salaireBase || !effectiveFrom) {
            return res.status(400).json({ error: "employeId, salaireBase et effectiveFrom requis" });
        }

        const userId = (req.user as any)?.id;
        const effectiveDate = new Date(effectiveFrom);

        // Close the current rate (set effectiveTo to day before new rate)
        const prevDay = new Date(effectiveDate);
        prevDay.setDate(prevDay.getDate() - 1);

        await db.update(salaryRateHistory)
            .set({ effectiveTo: prevDay.toISOString().split('T')[0] })
            .where(and(
                eq(salaryRateHistory.employeId, employeId),
                isNull(salaryRateHistory.effectiveTo)
            ));

        // Create new rate record
        const [newRate] = await db.insert(salaryRateHistory).values({
            employeId,
            salaireBase: salaireBase.toString(),
            tauxHoraire: tauxHoraire?.toString() || null,
            tauxJournalier: tauxJournalier?.toString() || null,
            modeCalcul: modeCalcul || 'MONTHLY',
            effectiveFrom: effectiveFrom,
            effectiveTo: null,
            motifChangement,
            createdBy: userId,
        }).returning();

        // Also update the employee's current rates
        await db.update(employes)
            .set({
                salaireBase: parseInt(salaireBase),
                tauxHoraire: tauxHoraire ? parseInt(tauxHoraire) : null,
                tauxJournalier: tauxJournalier ? parseInt(tauxJournalier) : null,
                modeCalculPaie: modeCalcul || 'MONTHLY',
            })
            .where(eq(employes.id, employeId));

        // Broadcast update
        const wsInstance = getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "HR_UPDATE", payload: { entity: 'salary_rate', action: 'changed', employeId } });
        }

        res.status(201).json(newRate);
    } catch (error) {
        logger.error({ err: error }, 'Erreur création changement taux');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/salary-rates/current/:employeId - Taux actuel d'un employé
/**
 * GET /api/hr/salary-rates/current/:employeId
 */
baremesRouter.get("/salary-rates/current/:employeId", getAuthUser, attachAbility, async (req, res) => {
    try {
        const { employeId } = req.params;

        const [current] = await db.select()
            .from(salaryRateHistory)
            .where(and(
                eq(salaryRateHistory.employeId, employeId),
                isNull(salaryRateHistory.effectiveTo)
            ))
            .limit(1);

        res.json(current || null);
    } catch (error) {
        logger.error({ err: error }, 'Erreur récupération taux actuel');
        res.status(500).json({ error: "Erreur serveur" });
    }
});
