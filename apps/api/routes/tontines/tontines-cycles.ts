import type { Express, Request, Response } from "express";
import { tontines, tontineCycles, tontineTurns, tontineSchedules, membresTontine, tontineTurnAudit, TontineTurnAuditActionType } from "@shared/schema";
import { storage } from "../../storage";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { normalizeKeysDeep } from "../utils";
import { getWsInstance } from "../../ws-server";
import { db } from "../../db";
import { eq, and, asc, sql } from "drizzle-orm";
import { createLogger } from "../../lib/logger";
import tontineProductionService from "../../services/tontine-production-service";
import tontineLifecycleService from "../../services/tontine-lifecycle-service";
import { generateTontineSchedulePreview, type TontineCalendarConfig } from "../../services/tontine-schedule-engine";
import { dispatchDomainEvent } from "../../services/notifications/domain-events/event-registry";
import { generateTontineReminderSchedule } from "../../services/notifications/tontine-reminder-service";

const logger = createLogger('Routes:TontinesCycles');

export function registerTontineCyclesRoutes(app: Express) {
  app.get("/api/tontines/:id/cycles", requireAuth, async (req: Request, res: Response) => {
    try {
      const cycles = await storage.getCyclesByTontine(req.params.id);

      res.json(cycles);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur chargement cycles');
      res.status(500).json({ message: error.message || "Erreur chargement cycles" });
    }
  });

  // Generate a new cycle (with schedules and turns)
  app.post("/api/tontines/:id/cycles/generate", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.TONTINE), async (req: Request, res: Response) => {
    try {
      const agenceId = req.user?.agenceId || (req.session.user as any)?.agenceId;
      const userId = req.session.user?.id;

      if (!agenceId) {
        return res.status(400).json({ message: "Agence non définie" });
      }

      const { startDate, randomSeed } = req.body;

      const result = await tontineProductionService.generateCycle({
        tontineId: req.params.id,
        agenceId,
        userId: userId!,
        startDate: startDate ? new Date(startDate) : undefined,
        randomSeed: randomSeed ? parseInt(randomSeed) : undefined,
      });

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "TONTINE_UPDATE",
          payload: {
            type: 'cycle_generated',
            tontineId: req.params.id,
            cycleId: result.cycleId,
            turnsCount: result.turnsCreated,
          }
        });
      }

      // Domain event: cycle started — notify all members
      const tontineForCycle = await storage.getTontine(req.params.id);
      if (tontineForCycle) {
        // Get cycle number from DB
        const [cycleData] = await db
          .select({ cycleNumber: tontineCycles.cycleNumber })
          .from(tontineCycles)
          .where(eq(tontineCycles.id, result.cycleId))
          .limit(1);

        dispatchDomainEvent({
          type: "TONTINE_CYCLE_STARTED",
          data: {
            tontineId: req.params.id,
            tontineName: tontineForCycle.nom,
            cycleNumber: cycleData?.cycleNumber || 1,
            startDate: startDate
              ? new Date(startDate).toLocaleDateString("fr-FR")
              : new Date().toLocaleDateString("fr-FR"),
            membersCount: result.turnsCreated || 0,
            agenceId,
          },
          timestamp: new Date(),
        });

        // Generate SMS reminder schedules for all active members
        generateTontineReminderSchedule(req.params.id).catch((err: unknown) => {
          logger.error({ err, tontineId: req.params.id }, 'TontineReminder failed to generate reminders');
        });
      }

      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur génération cycle');
      res.status(400).json({ message: error.message || "Erreur génération cycle" });
    }
  });

  // Get cycle details
  app.get("/api/tontines/:id/cycles/:cycleId", requireAuth, async (req: Request, res: Response) => {
    try {
      const cycle = await storage.getCycle(req.params.id, req.params.cycleId);

      if (!cycle) {
        return res.status(404).json({ message: "Cycle non trouvé" });
      }

      res.json(cycle);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur chargement cycle');
      res.status(500).json({ message: error.message || "Erreur chargement cycle" });
    }
  });

  // Close a cycle
  app.post("/api/tontines/:id/cycles/:cycleId/close", requireAuth, attachAbility, requireAbility(Actions.CLOSE, Subjects.TONTINE), async (req: Request, res: Response) => {
    try {
      const userId = req.session.user?.id;

      const updated = await storage.closeCycle(req.params.id, req.params.cycleId, userId!);

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "TONTINE_UPDATE",
          payload: { type: 'cycle_closed', tontineId: req.params.id, cycleId: req.params.cycleId }
        });
      }

      res.json(updated);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur clôture cycle');
      res.status(400).json({ message: error.message || "Erreur clôture cycle" });
    }
  });

  // --- CYCLE END REPORT (B12) ---

  app.get("/api/tontines/:id/cycles/:cycleId/report", requireAuth, async (req: Request, res: Response) => {
    try {
      const report = await tontineProductionService.generateCycleEndReport(
        req.params.id,
        req.params.cycleId,
      );
      res.json(report);
    } catch (error: any) {
      logger.error({ err: error }, "Erreur rapport cycle");
      res.status(500).json({ message: error.message || "Erreur rapport cycle" });
    }
  });

  // --- SCHEDULES ---

  // List schedules for a cycle
  app.get("/api/tontines/:id/cycles/:cycleId/schedules", requireAuth, async (req: Request, res: Response) => {
    try {
      const schedules = await storage.getSchedulesByCycle(req.params.id, req.params.cycleId);

      res.json(schedules);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur chargement schedules');
      res.status(500).json({ message: error.message || "Erreur chargement schedules" });
    }
  });

  // --- ECHEANCES (Calendar) ---
  // Returns turn-level schedule data for the frontend TontineCalendar component.
  // Uses the active (OPEN) cycle's turns joined with beneficiary info.
}
