import type { Express, Request, Response } from "express";
import { tontines, holidayDates, holidayCalendars, contributionsTontine, tontineDistributionRequests, tontinePenalites, membresTontine, tontineTurns, tontineSchedules, users, clients } from "@shared/schema";
import { storage } from "../../storage";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { db } from "../../db";
import { eq, asc, and, sql } from "drizzle-orm";
import { createLogger } from "../../lib/logger";
import { z } from "zod";
import { formatDateKey } from "../../services/credit-plan/calendar-utils";
import { generateTontineSchedulePreview, type TontineCalendarConfig } from "../../services/tontine-schedule-engine";

const logger = createLogger('Routes:TontinesDashboard');

export function registerTontineDashboardRoutes(app: Express) {
  app.get("/api/tontines/:id/reconciliation", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.TONTINE), async (req, res) => {
    try {
      const tontineId = req.params.id;

      // 1. Load tontine solde
      const [tontine] = await db
        .select({ id: tontines.id, nom: tontines.nom, solde: tontines.solde })
        .from(tontines)
        .where(eq(tontines.id, tontineId));

      if (!tontine) {
        return res.status(404).json({ message: "Tontine introuvable" });
      }

      // 2. SUM contributions POSTED
      const [contribResult] = await db
        .select({ total: sql<string>`COALESCE(SUM(${contributionsTontine.montant}::numeric), 0)` })
        .from(contributionsTontine)
        .where(
          and(
            eq(contributionsTontine.tontineId, tontineId),
            eq(contributionsTontine.statutTransaction, "POSTED")
          )
        );

      // 3. SUM distributions SUCCESS/PARTIAL (from distribution requests)
      const [distribResult] = await db
        .select({ total: sql<string>`COALESCE(SUM(${tontineDistributionRequests.amountPaid}::numeric), 0)` })
        .from(tontineDistributionRequests)
        .where(
          and(
            eq(tontineDistributionRequests.tontineId, tontineId),
            sql`${tontineDistributionRequests.status} IN ('SUCCESS', 'PARTIAL')`
          )
        );

      // 4. SUM penalties PAID (now tracked through ledger)
      const [penaltyResult] = await db
        .select({ total: sql<string>`COALESCE(SUM(${tontinePenalites.montant}::numeric), 0)` })
        .from(tontinePenalites)
        .where(
          and(
            eq(tontinePenalites.tontineId, tontineId),
            sql`${tontinePenalites.statut} IN ('PAID', 'paye')`
          )
        );

      const soldeCourant = Number(tontine.solde || "0");
      const totalContributions = Number(contribResult.total);
      const totalDistributions = Number(distribResult.total);
      const totalPenalties = Number(penaltyResult.total);

      // Expected = contributions + penalties - distributions
      const soldeCalcule = totalContributions + totalPenalties - totalDistributions;
      const ecart = Math.abs(soldeCourant - soldeCalcule);
      const isReconciled = ecart < 0.01;

      // 5. Per-member check
      const memberChecks = await db
        .select({
          membreId: membresTontine.id,
          clientId: membresTontine.clientId,
          totalCotisationsStored: membresTontine.totalCotisations,
          totalCotisationsComputed: sql<string>`COALESCE(SUM(${contributionsTontine.montant}::numeric), 0)`,
        })
        .from(membresTontine)
        .leftJoin(
          contributionsTontine,
          and(
            eq(contributionsTontine.membreId, membresTontine.id),
            eq(contributionsTontine.statutTransaction, "POSTED")
          )
        )
        .where(eq(membresTontine.tontineId, tontineId))
        .groupBy(membresTontine.id, membresTontine.clientId, membresTontine.totalCotisations);

      const memberDiscrepancies = memberChecks
        .filter((m) => {
          const stored = Number(m.totalCotisationsStored || "0");
          const computed = Number(m.totalCotisationsComputed);
          return Math.abs(stored - computed) >= 0.01;
        })
        .map((m) => ({
          membreId: m.membreId,
          clientId: m.clientId,
          stored: Number(m.totalCotisationsStored || "0"),
          computed: Number(m.totalCotisationsComputed),
          ecart: Number(m.totalCotisationsStored || "0") - Number(m.totalCotisationsComputed),
        }));

      res.json({
        tontineId,
        tontineName: tontine.nom,
        soldeCourant,
        soldeCalcule,
        ecart,
        isReconciled,
        details: {
          totalContributions,
          totalDistributions,
          totalPenalties,
        },
        memberDiscrepancies,
        memberDiscrepancyCount: memberDiscrepancies.length,
        checkedAt: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erreur réconciliation";
      logger.error({ message }, 'TontineReconciliation error');
      res.status(500).json({ message });
    }
  });


  app.get("/api/tontines/:id/echeances", requireAuth, async (req: Request, res: Response) => {
    try {
      const tontineId = req.params.id;

      // Find the active cycle
      const cycle = await storage.getActiveCycle(tontineId);

      if (!cycle) {
        return res.json([]);
      }

      // Get all turns for this cycle with beneficiary info
      const turns = await db
        .select({
          turnNumber: tontineTurns.turnNumber,
          dueDate: tontineTurns.dueDate,
          status: tontineTurns.status,
          beneficiaryMemberId: tontineTurns.beneficiaryMemberId,
          amountExpected: tontineTurns.amountExpected,
          amountPaidOut: tontineTurns.amountPaidOut,
          clientNom: users.nom,
          clientPrenom: users.prenom,
        })
        .from(tontineTurns)
        .leftJoin(membresTontine, eq(tontineTurns.beneficiaryMemberId, membresTontine.id))
        .leftJoin(clients, eq(membresTontine.clientId, clients.id))
        .leftJoin(users, eq(clients.userId, users.id))
        .where(and(eq(tontineTurns.tontineId, tontineId), eq(tontineTurns.cycleId, cycle.id)))
        .orderBy(asc(tontineTurns.turnNumber));

      // Get schedule contribution counts keyed by periodNumber
      const schedules = await db
        .select({
          periodNumber: tontineSchedules.periodNumber,
          membersPaidCount: tontineSchedules.membersPaidCount,
          totalCollected: tontineSchedules.totalCollected,
          scheduleStatus: tontineSchedules.status,
        })
        .from(tontineSchedules)
        .where(and(eq(tontineSchedules.tontineId, tontineId), eq(tontineSchedules.cycleId, cycle.id)))
        .orderBy(asc(tontineSchedules.periodNumber));

      const scheduleMap = new Map(schedules.map((s) => [s.periodNumber, s]));

      const echeances = turns.map((turn) => {
        const sched = scheduleMap.get(turn.turnNumber);
        const beneficiaire = turn.clientNom
          ? `${turn.clientNom} ${turn.clientPrenom || ""}`.trim()
          : null;

        return {
          tour: turn.turnNumber,
          date: turn.dueDate,
          beneficiaire,
          statut: turn.status,
          contributions_recues: sched?.membersPaidCount ?? 0,
          contributions_attendues: cycle.membersCount,
          montant_attendu: turn.amountExpected,
          montant_verse: turn.amountPaidOut,
          total_collecte: sched?.totalCollected ?? "0",
        };
      });

      res.json(echeances);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erreur chargement échéances";
      logger.error({ err: error }, 'Erreur chargement échéances');
      res.status(500).json({ message });
    }
  });

  // --- RETIRABLE ---

  // Calculate retirable amount for a member
  app.get("/api/tontines/:id/dashboard", requireAuth, async (req: Request, res: Response) => {
    try {
      // Get tontine with stats
      const tontine = await storage.getTontine(req.params.id);
      if (!tontine) {
        return res.status(404).json({ message: "Tontine non trouvée" });
      }
      
      // Get current cycle
      let currentCycle = null;
      if (tontine.currentCycleId) {
        currentCycle = await storage.getCycleById(tontine.currentCycleId) || null;
      }
      
      // Get next turn
      let nextTurn = null;
      if (currentCycle) {
        nextTurn = await storage.getNextScheduledTurn(currentCycle.id) || null;
      }
      // Get pending distribution requests
      const pendingCount = await storage.getPendingDistributionCount(req.params.id);

      res.json({
        tontine,
        currentCycle,
        nextTurn,
        pendingDistributions: pendingCount,
        stats: {
          potCollecte: currentCycle?.potCollected || tontine.solde || "0",
          potDistribue: currentCycle?.potDistributed || "0",
          membresActifs: currentCycle?.membersCount || tontine.membresActuels || 0,
        },
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur dashboard tontine');
      res.status(500).json({ message: error.message || "Erreur dashboard" });
    }
  });

  // ============================================================================
  // HOLIDAY CALENDARS (read-only list for selectors)
  // ============================================================================

  app.get("/api/holiday-calendars", requireAuth, async (_req: Request, res: Response) => {
    try {
      const calendars = await db.select({
        id: holidayCalendars.id,
        nom: holidayCalendars.nom,
        description: holidayCalendars.description,
      })
        .from(holidayCalendars)
        .where(eq(holidayCalendars.isActive, true))
        .orderBy(asc(holidayCalendars.nom));
      res.json(calendars);
    } catch (error: any) {
      logger.error({ err: error }, "Erreur chargement holiday calendars");
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // SCHEDULE PREVIEW (read-only, no persistence)
  // ============================================================================

  const schedulePreviewSchema = z.object({
    startDate: z.string(),
    config: z.object({
      firstContributionRule: z.string().default("ON_START_DATE"),
      gracePeriodContribution: z.coerce.number().default(0),
      collectionCalendarMode: z.string().default("ALL_DAYS"),
      weekdaysMask: z.coerce.number().default(127),
      shiftNonWorkingDay: z.string().default("NEXT"),
      timezone: z.string().default("Africa/Brazzaville"),
      frequence: z.string(),
      intervalleCotisation: z.coerce.number().default(1),
      preferredWeekday: z.coerce.number().nullable().optional(),
      distributionType: z.string().default("ROTATIVE_SUSU"),
      payoutFrequency: z.string().default("SAME_AS_CONTRIBUTION"),
      payoutDayRule: z.string().nullable().optional(),
      nombreMembres: z.coerce.number().min(1),
    }),
    holidayCalendarId: z.string().uuid().optional(),
    customFirstDate: z.string().optional(),
  });

  app.post("/api/tontine-schedule/preview", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = schedulePreviewSchema.parse(req.body);

      // Load holidays if a calendar is specified
      let holidays: Set<string> | undefined;
      if (parsed.holidayCalendarId) {
        const dates = await db.select({ date: holidayDates.date })
          .from(holidayDates)
          .where(eq(holidayDates.calendarId, parsed.holidayCalendarId));
        holidays = new Set(dates.map(d => typeof d.date === "string" ? d.date : formatDateKey(new Date(d.date))));
      }
      
      const startDate = new Date(parsed.startDate);
      const customFirst = parsed.customFirstDate ? new Date(parsed.customFirstDate) : undefined;

      const preview = generateTontineSchedulePreview(
        startDate,
        parsed.config as TontineCalendarConfig,
        holidays,
        customFirst,
      );

      res.json(preview);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Données invalides", errors: error.errors });
      }
      logger.error({ err: error }, 'Erreur preview schedule tontine');
      res.status(500).json({ message: error.message || "Erreur génération preview" });
    }
  });
}
