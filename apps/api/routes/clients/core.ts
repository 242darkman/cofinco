import type { Express } from "express";

import { registerClientCreateRoutes } from "./core-create";
import { registerClientNotificationRoutes } from "./core-notifications";
import { registerClientReadRoutes } from "./core-read";
import { registerClientUserLinkRoutes } from "./core-user-link";
import { registerClientValidationRoutes } from "./core-validation";
import { registerClientWriteRoutes } from "./core-write";

export function registerClientCoreRoutes(app: Express) {
  registerClientReadRoutes(app);
  registerClientCreateRoutes(app);
  registerClientWriteRoutes(app);
  registerClientValidationRoutes(app);
  registerClientUserLinkRoutes(app);
  registerClientNotificationRoutes(app);
}
