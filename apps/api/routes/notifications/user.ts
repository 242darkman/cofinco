import { Router as createRouter } from "express";
import { createLogger } from "../../lib/logger";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { db } from "../../db";
import { notifications } from "@shared/schema";
import { eq, and, or, desc, isNull, gte, sql } from "drizzle-orm";
import { getWsInstance } from "../../ws-server";

const logger = createLogger('Routes:Notifications:User');

export const userNotificationsRouter = createRouter();

userNotificationsRouter.get("/", requireAuth, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Non autorisé" });

    const { unreadOnly, type, limit = "50" } = req.query;

    const conditions = [eq(notifications.userId, req.user.id)];

    if (unreadOnly === "true") {
      conditions.push(eq(notifications.lue, false));
    }

    if (type && typeof type === "string") {
      conditions.push(eq(notifications.type, type));
    }

    conditions.push(
      or(
        isNull(notifications.expiresAt),
        gte(notifications.expiresAt, new Date())
      )!
    );

    const result = await db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(parseInt(limit as string));

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching notifications');
    res.status(500).json({ error: "Erreur" });
  }
});

userNotificationsRouter.post("/", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.NOTIFICATION), async (req, res) => {
  try {
    const { userId, type, titre, message, lien, priorite, referenceId, referenceType, expiresAt } = req.body;

    const [notification] = await db
      .insert(notifications)
      .values({
        userId,
        type,
        titre,
        message,
        lien,
        priorite: priorite || "NORMAL",
        referenceId,
        referenceType,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      })
      .returning();

    const wsInstance = getWsInstance();
    if (wsInstance && userId) {
      wsInstance.sendToUser(userId, {
        type: "NOTIFICATION",
        payload: {
          action: "created",
          notification,
        },
      });
    }

    res.status(201).json(notification);
  } catch (error) {
    logger.error({ err: error }, 'Error creating notification');
    res.status(500).json({ error: "Erreur" });
  }
});

userNotificationsRouter.patch("/:id/read", requireAuth, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Non autorisé" });

    const { id } = req.params;

    const [updated] = await db
      .update(notifications)
      .set({ lue: true })
      .where(and(
        eq(notifications.id, id),
        eq(notifications.userId, req.user.id)
      ))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Notification non trouvée" });
    }

    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, 'Error marking notification as read');
    res.status(500).json({ error: "Erreur" });
  }
});

userNotificationsRouter.post("/mark-all-read", requireAuth, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Non autorisé" });

    await db
      .update(notifications)
      .set({ lue: true })
      .where(and(
        eq(notifications.userId, req.user.id),
        eq(notifications.lue, false)
      ));

    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error marking all as read');
    res.status(500).json({ error: "Erreur" });
  }
});

userNotificationsRouter.get("/unread-count", requireAuth, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Non autorisé" });

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(
        eq(notifications.userId, req.user.id),
        eq(notifications.lue, false),
        or(
          isNull(notifications.expiresAt),
          gte(notifications.expiresAt, new Date())
        )
      ));

    res.json({ count: Number(result?.count || 0) });
  } catch (error) {
    logger.error({ err: error }, 'Error counting unread');
    res.status(500).json({ error: "Erreur" });
  }
});
