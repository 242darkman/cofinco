import type { Express } from "express";
import { caisseNotificationsRouter } from "./caisse";
import { userNotificationsRouter } from "./user";
import { adminNotificationsRouter } from "./admin";
import { webhooksNotificationsRouter } from "./webhooks";

export function registerNotificationsRoutes(app: Express) {
  app.use("/api/notifications-caisse", caisseNotificationsRouter);
  app.use("/api/notifications", userNotificationsRouter);
  app.use("/api/notifications/admin", adminNotificationsRouter);
  app.use("/api/webhooks/mtn", webhooksNotificationsRouter);
}
