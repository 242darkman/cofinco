import { Router as createRouter } from "express";
import { createLogger } from "../../lib/logger";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { db } from "../../db";
import { eq, and, desc } from "drizzle-orm";

const logger = createLogger('Routes:Notifications:Admin');

export const adminNotificationsRouter = createRouter();

adminNotificationsRouter.get("/metrics", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.AUDIT_LOG), async (req, res) => {
  try {
    const { getNotificationMetrics } = await import("../../services/notifications/audit/notification-audit");
    const metrics = await getNotificationMetrics();
    res.json(metrics);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching notification metrics');
    res.status(500).json({ error: "Erreur" });
  }
});

adminNotificationsRouter.get("/outbox", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.AUDIT_LOG), async (req, res) => {
  try {
    const { status, channel, limit = "50", offset = "0" } = req.query;

    const { notificationJobs } = await import("@shared/schema");
    const conditions: any[] = [];

    if (status && typeof status === "string") {
      conditions.push(eq(notificationJobs.status, status as any));
    }
    if (channel && typeof channel === "string") {
      conditions.push(eq(notificationJobs.channel, channel as any));
    }

    const result = await db
      .select({
        id: notificationJobs.id,
        channel: notificationJobs.channel,
        templateCode: notificationJobs.templateCode,
        status: notificationJobs.status,
        attempts: notificationJobs.attempts,
        maxAttempts: notificationJobs.maxAttempts,
        lastError: notificationJobs.lastError,
        correlationId: notificationJobs.correlationId,
        createdAt: notificationJobs.createdAt,
        processedAt: notificationJobs.processedAt,
      })
      .from(notificationJobs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(notificationJobs.createdAt))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching outbox');
    res.status(500).json({ error: "Erreur" });
  }
});

adminNotificationsRouter.get("/failed", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.AUDIT_LOG), async (req, res) => {
  try {
    const { getRecentFailedJobs } = await import("../../services/notifications/audit/notification-audit");
    const limit = parseInt((req.query.limit as string) || "20");
    const jobs = await getRecentFailedJobs(limit);
    res.json(jobs);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching failed jobs');
    res.status(500).json({ error: "Erreur" });
  }
});

adminNotificationsRouter.post("/retry-dead-letter", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.AUDIT_LOG), async (req, res) => {
  try {
    const { retryDeadLetterJobs } = await import("../../services/notifications/notification-worker");
    const count = await retryDeadLetterJobs();
    res.json({ success: true, retriedCount: count });
  } catch (error) {
    logger.error({ err: error }, 'Error retrying dead-letter');
    res.status(500).json({ error: "Erreur" });
  }
});

adminNotificationsRouter.post("/retry-job/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.AUDIT_LOG), async (req, res) => {
  try {
    const { id } = req.params;
    const { retrySingleJob } = await import("../../services/notifications/notification-worker");
    const retried = await retrySingleJob(id);
    if (!retried) {
      return res.status(404).json({ error: "Job non trouvé ou statut non éligible (DEAD_LETTER ou FAILED requis)" });
    }
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error retrying job');
    res.status(500).json({ error: "Erreur" });
  }
});

adminNotificationsRouter.get("/settings", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.AUDIT_LOG), async (req, res) => {
  try {
    const { getNotificationSettingsForAgency } = await import("../../services/notifications/notification-service");
    const agenceId = req.query.agenceId as string | undefined;
    const settings = await getNotificationSettingsForAgency(agenceId);
    res.json(settings || {});
  } catch (error) {
    logger.error({ err: error }, 'Error fetching notification settings');
    res.status(500).json({ error: "Erreur" });
  }
});

adminNotificationsRouter.put("/settings", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.AUDIT_LOG), async (req, res) => {
  try {
    const { notificationSettings } = await import("@shared/schema");
    const { agenceId, ...settings } = req.body;

    if (agenceId) {
      const [existing] = await db
        .select()
        .from(notificationSettings)
        .where(eq(notificationSettings.agenceId, agenceId))
        .limit(1);

      if (existing) {
        const [updated] = await db
          .update(notificationSettings)
          .set({ ...settings, updatedAt: new Date() })
          .where(eq(notificationSettings.id, existing.id))
          .returning();
        return res.json(updated);
      }

      const [created] = await db
        .insert(notificationSettings)
        .values({ agenceId, ...settings })
        .returning();
      return res.json(created);
    }

    const { isNull: isNullOp } = await import("drizzle-orm");
    const [existing] = await db
      .select()
      .from(notificationSettings)
      .where(isNullOp(notificationSettings.agenceId))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(notificationSettings)
        .set({ ...settings, updatedAt: new Date() })
        .where(eq(notificationSettings.id, existing.id))
        .returning();
      return res.json(updated);
    }

    const [created] = await db
      .insert(notificationSettings)
      .values(settings)
      .returning();
    res.json(created);
  } catch (error) {
    logger.error({ err: error }, 'Error updating notification settings');
    res.status(500).json({ error: "Erreur" });
  }
});
