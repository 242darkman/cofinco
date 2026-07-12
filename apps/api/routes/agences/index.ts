import type { Express } from "express";
import { registerAgencesUsersRoutes } from "./agences-users";
import { registerAgencesLifecycleRoutes } from "./agences-lifecycle";
import { registerAgencesMigrationsRoutes } from "./agences-migrations";
import { registerAgencesCoreRoutes } from "./agences-core";

export function registerAgencesRoutes(app: Express) {
  registerAgencesUsersRoutes(app);
  registerAgencesLifecycleRoutes(app);
  registerAgencesMigrationsRoutes(app);
  registerAgencesCoreRoutes(app);
}
