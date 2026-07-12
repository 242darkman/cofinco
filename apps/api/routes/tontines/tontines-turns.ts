import type { Express, Request, Response } from "express";
import { tontines, tontineCycles, tontineTurns, tontineSchedules, membresTontine, tontineTurnAudit, TontineTurnAuditActionType } from "@shared/schema";
import { storage } from "../../storage";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { getWsInstance } from "../../ws-server";
import { db } from "../../db";
import { eq, sql } from "drizzle-orm";
import { createLogger } from "../../lib/logger";
import tontineProductionService from "../../services/tontine-production-service";

const logger = createLogger('Routes:TontinesTurns');

export function registerTontineTurnsRoutes(app: Express) {
  // List turns for a cycle
  app.get("/api/tontines/:id/cycles/:cycleId/turns", requireAuth, async (req: Request, res: Response) => {
    try {
      const turns = await storage.getTurnsByCycle(req.params.id, req.params.cycleId);
      res.json(turns);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur chargement tours');
      res.status(500).json({ message: error.message || "Erreur chargement tours" });
    }
  });

  // Reorder turns
  app.post("/api/tontines/:id/cycles/:cycleId/turns/reorder", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE), async (req: Request, res: Response) => {
    try {
      const agenceId = req.user?.agenceId || (req.session.user as any)?.agenceId;
      const userId = req.session.user?.id;

      if (!agenceId) {
        return res.status(400).json({ message: "Agence non définie" });
      }

      const { newOrder, reason } = req.body;

      if (!newOrder || !Array.isArray(newOrder)) {
        return res.status(400).json({ message: "newOrder requis (array)" });
      }

      if (!reason || reason.trim().length === 0) {
        return res.status(400).json({ message: "Motif de réorganisation requis" });
      }

      const result = await tontineProductionService.reorderTurns({
        tontineId: req.params.id,
        cycleId: req.params.cycleId,
        agenceId,
        userId: userId!,
        newOrder,
        reason,
      });

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "TONTINE_UPDATE",
          payload: {
            type: 'turns_reordered',
            tontineId: req.params.id,
            cycleId: req.params.cycleId,
            affectedTurns: result.affectedTurns,
          }
        });
      }

      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur réorganisation tours');
      res.status(400).json({ message: error.message || "Erreur réorganisation tours" });
    }
  });

  // Get turn audit history
  app.get("/api/tontines/:id/cycles/:cycleId/audit", requireAuth, async (req: Request, res: Response) => {
    try {
      const audits = await storage.getTurnAuditByCycle(req.params.id, req.params.cycleId);
      res.json(audits);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur chargement audit');
      res.status(500).json({ message: error.message || "Erreur chargement audit" });
    }
  });

  // Lock/unlock a turn
  app.post("/api/tontines/:id/turns/:turnId/lock", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE), async (req: Request, res: Response) => {
    try {
      const { lock, reason } = req.body;
      const isLock = lock !== false; // default to lock

      const [turn] = await db
        .select()
        .from(tontineTurns)
        .where(eq(tontineTurns.id, req.params.turnId))
        .limit(1);

      if (!turn) return res.status(404).json({ message: "Tour non trouvé" });
      if (turn.tontineId !== req.params.id) return res.status(400).json({ message: "Tour n'appartient pas à cette tontine" });

      const [updated] = await db
        .update(tontineTurns)
        .set({
          isLocked: isLock,
          lockedAt: isLock ? new Date() : null,
          lockedReason: isLock ? (reason || "Verrouillé manuellement") : null,
          updatedAt: new Date(),
        })
        .where(eq(tontineTurns.id, req.params.turnId))
        .returning();

      // Audit trail
      await db.insert(tontineTurnAudit).values({
        tontineId: req.params.id,
        cycleId: turn.cycleId,
        actionType: isLock ? TontineTurnAuditActionType.LOCK : TontineTurnAuditActionType.UNLOCK,
        performedBy: req.session.user!.id,
        details: { turnId: turn.id, turnNumber: turn.turnNumber, reason },
      } as any);

      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "TONTINE_UPDATE",
          payload: { type: "turn_lock_changed", tontineId: req.params.id, turnId: turn.id, isLocked: isLock },
        });
      }

      res.json(updated);
    } catch (error: any) {
      logger.error({ err: error }, "Erreur lock/unlock tour");
      res.status(400).json({ message: error.message || "Erreur lock/unlock" });
    }
  });

  // Skip a turn
  app.post("/api/tontines/:id/cycles/:cycleId/turns/:turnId/skip", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE), async (req: Request, res: Response) => {
    try {
      const agenceId = req.user?.agenceId || (req.session.user as any)?.agenceId;
      const userId = req.session.user?.id;

      if (!agenceId) return res.status(400).json({ message: "Agence non définie" });

      const { reason } = req.body;
      if (!reason || reason.trim().length === 0) {
        return res.status(400).json({ message: "Motif requis pour sauter un tour" });
      }

      const result = await tontineProductionService.skipTurn({
        tontineId: req.params.id,
        cycleId: req.params.cycleId,
        turnId: req.params.turnId,
        agenceId,
        userId: userId!,
        reason,
      });

      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "TONTINE_UPDATE",
          payload: { type: "turn_skipped", tontineId: req.params.id, turnId: req.params.turnId },
        });
      }

      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, "Erreur skip tour");
      res.status(400).json({ message: error.message || "Erreur skip tour" });
    }
  });

  // Request a swap between two turns
  app.post("/api/tontines/:id/cycles/:cycleId/turns/swap", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE), async (req: Request, res: Response) => {
    try {
      const agenceId = req.user?.agenceId || (req.session.user as any)?.agenceId;
      const userId = req.session.user?.id;

      if (!agenceId) return res.status(400).json({ message: "Agence non définie" });

      const { turnIdA, turnIdB, reason } = req.body;
      if (!turnIdA || !turnIdB) return res.status(400).json({ message: "turnIdA et turnIdB requis" });
      if (!reason || reason.trim().length === 0) return res.status(400).json({ message: "Motif requis" });

      const result = await tontineProductionService.requestTurnSwap({
        tontineId: req.params.id,
        cycleId: req.params.cycleId,
        turnIdA,
        turnIdB,
        agenceId,
        userId: userId!,
        reason,
      });

      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "TONTINE_UPDATE",
          payload: { type: result.swapped ? "turns_swapped" : "swap_requested", tontineId: req.params.id },
        });
      }

      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, "Erreur swap tours");
      res.status(400).json({ message: error.message || "Erreur swap tours" });
    }
  });

  // Approve a pending swap
  app.post("/api/tontines/:id/swap/:auditId/approve", requireAuth, attachAbility, requireAbility(Actions.APPROVE, Subjects.TONTINE), async (req: Request, res: Response) => {
    try {
      const agenceId = req.user?.agenceId || (req.session.user as any)?.agenceId;
      const userId = req.session.user?.id;

      if (!agenceId) return res.status(400).json({ message: "Agence non définie" });

      const result = await tontineProductionService.approveSwap({
        tontineId: req.params.id,
        auditId: req.params.auditId,
        agenceId,
        userId: userId!,
      });

      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "TONTINE_UPDATE",
          payload: { type: "swap_approved", tontineId: req.params.id },
        });
      }

      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, "Erreur approbation swap");
      res.status(400).json({ message: error.message || "Erreur approbation swap" });
    }
  });

  // Reject a pending swap
  app.post("/api/tontines/:id/swap/:auditId/reject", requireAuth, attachAbility, requireAbility(Actions.APPROVE, Subjects.TONTINE), async (req: Request, res: Response) => {
    try {
      const userId = req.session.user?.id;
      const { reason } = req.body || {};

      // Update the audit entry status to REJECTED
      const [updated] = await db
        .update(tontineTurnAudit)
        .set({
          status: 'REJECTED',
          metadata: sql`COALESCE(${tontineTurnAudit.metadata}, '{}'::jsonb) || jsonb_build_object('rejectedBy', ${userId}, 'rejectedAt', ${new Date().toISOString()}, 'rejectReason', ${reason || 'Rejeté manuellement'})`,
        } as any)
        .where(eq(tontineTurnAudit.id, req.params.auditId))
        .returning();

      if (!updated) return res.status(404).json({ message: "Entrée d'audit non trouvée" });

      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "TONTINE_UPDATE",
          payload: { type: "swap_rejected", tontineId: req.params.id },
        });
      }

      res.json({ success: true, audit: updated });
    } catch (error: any) {
      logger.error({ err: error }, "Erreur rejet swap");
      res.status(400).json({ message: error.message || "Erreur rejet swap" });
    }
  });
}
