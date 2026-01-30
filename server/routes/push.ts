/**
 * Push Notifications Routes
 * Endpoints for Web Push API subscription management
 */

import type { Express } from "express";
import { createLogger } from "../lib/logger";
import { requireAuth } from "../auth";

const logger = createLogger('Routes:Push');
import {
  savePushSubscription,
  removePushSubscription,
  getUserSubscriptions,
  getVapidPublicKey,
  isPushConfigured,
  generateVapidKeys,
} from "../services/push-notification-service";
import { z } from "zod";

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
  expirationTime: z.number().nullable().optional(),
});

export function registerPushRoutes(app: Express) {
  /**
   * GET /api/push/vapid-public-key
   * Get VAPID public key for client subscription
   */
  app.get("/api/push/vapid-public-key", (req, res) => {
    const publicKey = getVapidPublicKey();

    if (!publicKey) {
      return res.status(503).json({
        error: "Push notifications not configured",
        configured: false,
      });
    }

    res.json({
      publicKey,
      configured: true,
    });
  });

  /**
   * GET /api/push/status
   * Check if push notifications are available
   */
  app.get("/api/push/status", (req, res) => {
    res.json({
      configured: isPushConfigured(),
      publicKey: getVapidPublicKey() || null,
    });
  });

  /**
   * POST /api/push/subscribe
   * Register a push subscription for the authenticated user
   */
  app.post("/api/push/subscribe", requireAuth, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Non autorisé" });
      }

      if (!isPushConfigured()) {
        return res.status(503).json({
          error: "Push notifications not configured on server",
        });
      }

      const subscription = subscriptionSchema.parse(req.body);
      const deviceInfo = req.headers["user-agent"] || undefined;

      const saved = await savePushSubscription(
        req.user.id,
        subscription,
        deviceInfo
      );

      res.status(201).json({
        success: true,
        subscription: {
          id: saved.id,
          endpoint: saved.endpoint,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "Invalid subscription data",
          details: error.errors,
        });
      }
      logger.error({ err: error }, 'Error saving subscription');
      res.status(500).json({ error: "Failed to save subscription" });
    }
  });

  /**
   * DELETE /api/push/unsubscribe
   * Remove a push subscription
   */
  app.delete("/api/push/unsubscribe", requireAuth, async (req, res) => {
    try {
      const { endpoint } = req.body;

      if (!endpoint) {
        return res.status(400).json({ error: "Endpoint required" });
      }

      await removePushSubscription(endpoint);

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, 'Error removing subscription');
      res.status(500).json({ error: "Failed to remove subscription" });
    }
  });

  /**
   * GET /api/push/subscriptions
   * Get user's active push subscriptions
   */
  app.get("/api/push/subscriptions", requireAuth, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Non autorisé" });
      }

      const subscriptions = await getUserSubscriptions(req.user.id);

      res.json(
        subscriptions.map((sub) => ({
          id: sub.id,
          endpoint: sub.endpoint,
          deviceInfo: sub.deviceInfo,
          createdAt: sub.createdAt,
        }))
      );
    } catch (error) {
      logger.error({ err: error }, 'Error fetching subscriptions');
      res.status(500).json({ error: "Failed to fetch subscriptions" });
    }
  });

  /**
   * POST /api/push/test
   * Send a test push notification (dev only)
   */
  app.post("/api/push/test", requireAuth, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Non autorisé" });
      }

      if (process.env.NODE_ENV === "production") {
        return res.status(403).json({ error: "Not available in production" });
      }

      const { sendPushToUser } = await import(
        "../services/push-notification-service"
      );

      const result = await sendPushToUser(req.user.id, {
        title: "Test Notification",
        body: "Cette notification est un test de COFIN&CO-M!",
        icon: "/icons/icon-192.png",
        data: {
          type: "test",
          timestamp: new Date().toISOString(),
        },
      });

      res.json({
        success: true,
        sent: result.sent,
        failed: result.failed,
      });
    } catch (error) {
      logger.error({ err: error }, 'Error sending test');
      res.status(500).json({ error: "Failed to send test notification" });
    }
  });

  /**
   * POST /api/push/generate-vapid-keys
   * Generate new VAPID keys (admin setup utility)
   */
  app.post("/api/push/generate-vapid-keys", requireAuth, async (req, res) => {
    try {
      // This should only be used during initial setup
      if (process.env.NODE_ENV === "production" && isPushConfigured()) {
        return res.status(403).json({
          error: "VAPID keys already configured in production",
        });
      }

      const keys = generateVapidKeys();

      res.json({
        message: "Add these keys to your environment variables",
        publicKey: keys.publicKey,
        privateKey: keys.privateKey,
        envFormat: `VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}`,
      });
    } catch (error) {
      logger.error({ err: error }, 'Error generating VAPID keys');
      res.status(500).json({ error: "Failed to generate VAPID keys" });
    }
  });
}
