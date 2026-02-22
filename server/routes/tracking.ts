import type { Express } from "express";
import { createLogger } from "../lib/logger";
import { z } from "zod";
import { db } from "../db";
import { eq, and, gte, lte, asc, desc, sql } from "drizzle-orm";
import { agentLocationLogs, trackingSessions } from "@shared/schema";
import { requireAuth } from "../auth";
import { SystemRole, normalizeRole } from "@shared/types/roles";
import { logAudit } from "../lib/logger";

const logger = createLogger('Routes:Tracking');

// ─── Validation schemas ─────────────────────────────────────────

const batchPointSchema = z.object({
  clientPointId: z.string().uuid(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(10000),
  altitude: z.number().nullable().optional(),
  speed: z.number().nullable().optional(),
  heading: z.number().nullable().optional(),
  timestamp: z.number().positive(),
  agentId: z.string().uuid(),
  agencyId: z.string().uuid().nullable().optional(),
  sessionId: z.string().min(1),
  dayKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  batteryLevel: z.number().int().min(0).max(100).optional(),
  activityType: z.string().optional(),
});

const syncBatchSchema = z.object({
  sessionId: z.string().min(1),
  agentId: z.string().uuid(),
  agencyId: z.string().uuid().nullable().optional(),
  dayKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  points: z.array(batchPointSchema).min(1).max(200),
});

const sessionsQuerySchema = z.object({
  agent_id: z.string().uuid(),
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
});

// ─── Routes ──────────────────────────────────────────────────────

export function registerTrackingRoutes(app: Express) {

  /**
   * POST /api/tracking/batch
   * Receive a batch of GPS points from the client and persist them.
   */
  app.post("/api/tracking/batch", requireAuth, async (req, res) => {
    try {
      const currentUser = req.user;
      const userRole = normalizeRole(currentUser?.role);

      // Only agents, supervisors, and admins can submit tracking data
      const allowed = [SystemRole.AGENT_TERRAIN, SystemRole.SUPERVISEUR, SystemRole.CHEF_AGENCE, SystemRole.ADMIN];
      if (!userRole || !allowed.includes(userRole)) {
        return res.status(403).json({ message: "Non autorise" });
      }

      const parsed = syncBatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Donnees invalides",
          errors: parsed.error.errors,
        });
      }

      const batch = parsed.data;

      // Security: agents can only submit their own data
      if (userRole === SystemRole.AGENT_TERRAIN && batch.agentId !== String(currentUser!.id)) {
        return res.status(403).json({ message: "Impossible de soumettre des donnees pour un autre agent" });
      }

      // Insert points in bulk — ON CONFLICT DO NOTHING for idempotent retries
      const values = batch.points.map((p) => ({
        agentId: p.agentId,
        clientPointId: p.clientPointId,
        latitude: String(p.latitude),
        longitude: String(p.longitude),
        accuracy: p.accuracy != null ? String(p.accuracy) : null,
        altitude: p.altitude != null ? String(p.altitude) : null,
        speed: p.speed != null ? String(p.speed) : null,
        heading: p.heading != null ? String(p.heading) : null,
        source: "batch_sync" as const,
        batteryLevel: p.batteryLevel ?? null,
        activityType: p.activityType ?? null,
        sessionId: p.sessionId,
        dayKey: p.dayKey,
        capturedAt: new Date(p.timestamp),
      }));

      // Count existing points before insert (for dedup accounting)
      const existingCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(agentLocationLogs)
        .where(
          sql`${agentLocationLogs.agentId} = ${batch.agentId}
              AND ${agentLocationLogs.clientPointId} IN (${sql.join(
            batch.points.map((p) => sql`${p.clientPointId}`),
            sql`,`,
          )})`,
        );
      const alreadyExisted = existingCount[0]?.count ?? 0;

      await db.insert(agentLocationLogs).values(values).onConflictDoNothing();

      const received = batch.points.length;
      const deduped = alreadyExisted;
      const inserted = received - deduped;

      // Upsert session summary
      const existingSession = await db
        .select()
        .from(trackingSessions)
        .where(eq(trackingSessions.sessionId, batch.sessionId))
        .limit(1);

      if (existingSession.length > 0) {
        await db
          .update(trackingSessions)
          .set({
            pointCount: sql`${trackingSessions.pointCount} + ${inserted}`,
            endedAt: new Date(batch.points[batch.points.length - 1].timestamp),
          })
          .where(eq(trackingSessions.sessionId, batch.sessionId));
      } else {
        await db.insert(trackingSessions).values({
          sessionId: batch.sessionId,
          agentId: batch.agentId,
          agencyId: batch.agencyId || null,
          dayKey: batch.dayKey,
          startedAt: new Date(batch.points[0].timestamp),
          endedAt: new Date(batch.points[batch.points.length - 1].timestamp),
          pointCount: inserted,
          totalDistanceM: "0",
        });
      }

      logger.info(
        { agentId: batch.agentId, sessionId: batch.sessionId, received, inserted, deduped },
        "Batch tracking sync received",
      );

      res.json({ received, inserted, deduped, synced: inserted });
    } catch (error) {
      logger.error({ err: error }, "Error processing tracking batch");
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  /**
   * GET /api/tracking/sessions
   * List tracking sessions for an agent within a date range.
   */
  app.get("/api/tracking/sessions", requireAuth, async (req, res) => {
    try {
      const parsed = sessionsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Parametres invalides",
          errors: parsed.error.errors,
        });
      }

      const { agent_id } = parsed.data;
      const currentUser = req.user;
      const userRole = normalizeRole(currentUser?.role);

      // Security: agents can only view their own sessions
      const canSupervise = [SystemRole.ADMIN, SystemRole.CHEF_AGENCE, SystemRole.SUPERVISEUR].includes(userRole!);
      if (!canSupervise && String(currentUser!.id) !== agent_id) {
        return res.status(403).json({ message: "Acces non autorise" });
      }

      const conditions = [eq(trackingSessions.agentId, agent_id)];
      if (parsed.data.start) {
        conditions.push(gte(trackingSessions.startedAt, new Date(parsed.data.start)));
      }
      if (parsed.data.end) {
        conditions.push(lte(trackingSessions.startedAt, new Date(parsed.data.end)));
      }

      const sessions = await db
        .select()
        .from(trackingSessions)
        .where(and(...conditions))
        .orderBy(desc(trackingSessions.startedAt))
        .limit(100);

      // Cast numeric totalDistanceM from string → number for JSON consumers
      res.json(sessions.map((s) => ({
        ...s,
        totalDistanceM: Number(s.totalDistanceM) || 0,
      })));
    } catch (error) {
      logger.error({ err: error }, "Error fetching tracking sessions");
      res.status(500).json({ message: "Erreur serveur" });
    }
  });
}
