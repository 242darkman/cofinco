import { Router } from "express";
/**
 * Routes RH — Feuilles de temps, allocation du temps et assiduité.
 *
 * Monté sous /api/hr par le routeur d'index (hr.ts).
 * Endpoints :
 *   GET    /api/hr/attendance/analytics/:employeId
 *   GET    /api/hr/attendance/export/:employeId
 *   GET    /api/hr/timesheets
 *   GET    /api/hr/timesheets/:id
 *   POST   /api/hr/timesheets
 *   PUT    /api/hr/timesheets/:id/entries
 *   DELETE /api/hr/timesheets/:id/entries/:entryId
 *   PATCH  /api/hr/timesheets/:id/submit
 *   PATCH  /api/hr/timesheets/:id/approve
 *   PATCH  /api/hr/timesheets/:id/reject
 *   GET    /api/hr/time-allocation/:employeId
 */
import { db } from "../../db";
import { presences, employes } from "@shared/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { getAuthUser } from "../../middleware";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { users } from "@shared/schema";
import * as hrStorage from "../../storage/hr";

export const attendanceRouter = Router();

// GET /api/hr/attendance/analytics/:employeId - Statistiques de présence étendues
/**
 * GET /api/hr/attendance/analytics/:employeId
 */
attendanceRouter.get("/attendance/analytics/:employeId", getAuthUser, attachAbility, async (req, res) => {
  try {
    const { employeId } = req.params;
    const { year, month } = req.query;

    const targetYear = year ? parseInt(year as string) : new Date().getFullYear();
    const targetMonth = month ? parseInt(month as string) : undefined;

    // Construire la plage de dates
    let startDate: string;
    let endDate: string;

    if (targetMonth) {
      startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
      const lastDay = new Date(targetYear, targetMonth, 0).getDate();
      endDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${lastDay}`;
    } else {
      startDate = `${targetYear}-01-01`;
      endDate = `${targetYear}-12-31`;
    }

    // Récupérer toutes les présences dans la période
    const presenceRecords = await db.select()
      .from(presences)
      .where(and(
        eq(presences.employeId, employeId),
        gte(presences.date, startDate),
        lte(presences.date, endDate)
      ))
      .orderBy(presences.date);

    // Calculer les statistiques
    let totalDays = 0;
    let presentDays = 0;
    let absentDays = 0;
    let lateDays = 0;
    let totalHoursWorked = 0;
    let totalOvertimeHours = 0;

    const monthlyStats: Record<string, {
      present: number;
      absent: number;
      late: number;
      hoursWorked: number;
    }> = {};

    const dailyData: Array<{
      date: string;
      status: string;
      heureArrivee?: string;
      heureDepart?: string;
      heuresTravaillees?: number;
    }> = [];

    for (const record of presenceRecords) {
      totalDays++;
      const hours = Number(record.heuresTravaillees) || 0;
      totalHoursWorked += hours;

      const monthKey = record.date.substring(0, 7);
      if (!monthlyStats[monthKey]) {
        monthlyStats[monthKey] = { present: 0, absent: 0, late: 0, hoursWorked: 0 };
      }

      if (record.statut === 'PRESENT' || record.statut === 'ON_BREAK' || record.statut === 'CLOCKED_OUT') {
        presentDays++;
        monthlyStats[monthKey].present++;
        monthlyStats[monthKey].hoursWorked += hours;

        // Vérifier si en retard (arrivée après 8h30)
        if (record.heureArrivee) {
          const arrivalTime = new Date(record.heureArrivee);
          const arrivalHour = arrivalTime.getHours();
          const arrivalMinute = arrivalTime.getMinutes();
          if (arrivalHour > 8 || (arrivalHour === 8 && arrivalMinute > 30)) {
            lateDays++;
            monthlyStats[monthKey].late++;
          }
        }

        // Heures supplémentaires (au-delà de 8h)
        if (hours > 8) {
          totalOvertimeHours += hours - 8;
        }
      } else if (record.statut === 'ABSENT') {
        absentDays++;
        monthlyStats[monthKey].absent++;
      }

      dailyData.push({
        date: record.date,
        status: record.statut || 'UNKNOWN',
        heureArrivee: record.heureArrivee ? record.heureArrivee.toISOString() : undefined,
        heureDepart: record.heureDepart ? record.heureDepart.toISOString() : undefined,
        heuresTravaillees: hours,
      });
    }

    // Calculer le taux de présence
    const attendanceRate = totalDays > 0 ? (presentDays / totalDays) * 100 : 0;
    const avgHoursPerDay = presentDays > 0 ? totalHoursWorked / presentDays : 0;

    res.json({
      employeId,
      period: { year: targetYear, month: targetMonth },
      summary: {
        totalDays,
        presentDays,
        absentDays,
        lateDays,
        attendanceRate: Math.round(attendanceRate * 100) / 100,
        totalHoursWorked: Math.round(totalHoursWorked * 100) / 100,
        avgHoursPerDay: Math.round(avgHoursPerDay * 100) / 100,
        overtimeHours: Math.round(totalOvertimeHours * 100) / 100,
      },
      monthlyBreakdown: monthlyStats,
      dailyData,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération analytics présence');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/hr/attendance/export/:employeId - Export des données de présence
/**
 * GET /api/hr/attendance/export/:employeId
 */
attendanceRouter.get("/attendance/export/:employeId", getAuthUser, attachAbility, async (req, res) => {
  try {
    const { employeId } = req.params;
    const { year, month, format } = req.query;

    const targetYear = year ? parseInt(year as string) : new Date().getFullYear();
    const targetMonth = month ? parseInt(month as string) : undefined;

    let startDate: string;
    let endDate: string;

    if (targetMonth) {
      startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
      const lastDay = new Date(targetYear, targetMonth, 0).getDate();
      endDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${lastDay}`;
    } else {
      startDate = `${targetYear}-01-01`;
      endDate = `${targetYear}-12-31`;
    }

    // Récupérer l'employé avec les infos utilisateur
    const [employeResult] = await db.select({
      employe: employes,
      nom: users.nom,
      prenom: users.prenom,
    })
      .from(employes)
      .leftJoin(users, eq(employes.userId, users.id))
      .where(eq(employes.id, employeId))
      .limit(1);

    if (!employeResult) {
      return res.status(404).json({ error: "Employé non trouvé" });
    }

    const employeNom = employeResult.nom || 'Inconnu';
    const employePrenom = employeResult.prenom || '';

    // Récupérer les présences
    const records = await db.select()
      .from(presences)
      .where(and(
        eq(presences.employeId, employeId),
        gte(presences.date, startDate),
        lte(presences.date, endDate)
      ))
      .orderBy(presences.date);

    if (format === 'csv') {
      const header = 'Date,Statut,Heure Arrivée,Heure Départ,Heures Travaillées,Observations\n';
      const rows = records.map(r =>
        `${r.date},${r.statut},${r.heureArrivee || ''},${r.heureDepart || ''},${r.heuresTravaillees || ''},${r.commentaire || ''}`
      ).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=presence_${employeNom}_${targetYear}${targetMonth || ''}.csv`);
      return res.send(header + rows);
    }

    res.json({
      employe: { id: employeResult.employe.id, nom: employeNom, prenom: employePrenom },
      period: { year: targetYear, month: targetMonth },
      records,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erreur export présence');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ================================================
// FEUILLES DE TEMPS - Timesheets
// ================================================

// GET /api/hr/timesheets
/**
 * GET /api/hr/timesheets
 */
attendanceRouter.get("/timesheets", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.VIEW, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const { employeId, statut, semaine } = req.query as { employeId?: string; statut?: string; semaine?: string };
        const sheets = await hrStorage.getTimesheets({ employeId, statut, semaine });
        res.json(sheets);
    } catch (error) {
        logger.error({ err: error }, "Erreur liste feuilles de temps");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/timesheets/:id
/**
 * GET /api/hr/timesheets/:id
 */
attendanceRouter.get("/timesheets/:id", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.VIEW, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const sheet = await hrStorage.getTimesheetById(req.params.id);
        if (!sheet) return res.status(404).json({ error: "Feuille de temps introuvable" });
        res.json(sheet);
    } catch (error) {
        logger.error({ err: error }, "Erreur détail feuille de temps");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/timesheets
/**
 * POST /api/hr/timesheets
 */
attendanceRouter.post("/timesheets", getAuthUser, attachAbility, async (req, res) => {
    try {
        const user = (req as any).user;
        // Any authenticated user can create their own timesheet
        const sheet = await hrStorage.createOrGetTimesheet(req.body);
        res.status(201).json(sheet);
    } catch (error) {
        logger.error({ err: error }, "Erreur création feuille de temps");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PUT /api/hr/timesheets/:id/entries
/**
 * PUT /api/hr/timesheets/:id/entries
 */
attendanceRouter.put("/timesheets/:id/entries", getAuthUser, attachAbility, async (req, res) => {
    try {
        const entry = await hrStorage.upsertTimeEntry({
            feuilleTempsId: req.params.id,
            ...req.body,
        });
        res.json(entry);
    } catch (error) {
        logger.error({ err: error }, "Erreur upsert entrée temps");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// DELETE /api/hr/timesheets/:id/entries/:entryId
/**
 * DELETE /api/hr/timesheets/:id/entries/:entryId
 */
attendanceRouter.delete("/timesheets/:id/entries/:entryId", getAuthUser, attachAbility, async (req, res) => {
    try {
        await hrStorage.deleteTimeEntry(req.params.entryId);
        res.json({ success: true });
    } catch (error) {
        logger.error({ err: error }, "Erreur suppression entrée temps");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PATCH /api/hr/timesheets/:id/submit
/**
 * PATCH /api/hr/timesheets/:id/submit
 */
attendanceRouter.patch("/timesheets/:id/submit", getAuthUser, attachAbility, async (req, res) => {
    try {
        const sheet = await hrStorage.submitTimesheet(req.params.id);
        res.json(sheet);
    } catch (error) {
        logger.error({ err: error }, "Erreur soumission feuille de temps");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PATCH /api/hr/timesheets/:id/approve
/**
 * PATCH /api/hr/timesheets/:id/approve
 */
attendanceRouter.patch("/timesheets/:id/approve", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const user = (req as any).user;
        const sheet = await hrStorage.approveTimesheet(req.params.id, user.id);
        if (!sheet) return res.status(404).json({ error: "Feuille de temps introuvable" });
        res.json(sheet);
    } catch (error) {
        logger.error({ err: error }, "Erreur approbation feuille de temps");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PATCH /api/hr/timesheets/:id/reject
/**
 * PATCH /api/hr/timesheets/:id/reject
 */
attendanceRouter.patch("/timesheets/:id/reject", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const { motif } = req.body;
        const sheet = await hrStorage.rejectTimesheet(req.params.id, motif || '');
        res.json(sheet);
    } catch (error) {
        logger.error({ err: error }, "Erreur rejet feuille de temps");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/time-allocation/:employeId
/**
 * GET /api/hr/time-allocation/:employeId
 */
attendanceRouter.get("/time-allocation/:employeId", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.VIEW, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const { from, to } = req.query as { from?: string; to?: string };
        const allocation = await hrStorage.getEmployeeTimeAllocation(req.params.employeId, from, to);
        res.json(allocation);
    } catch (error) {
        logger.error({ err: error }, "Erreur allocation temps employé");
        res.status(500).json({ error: "Erreur serveur" });
    }
});
