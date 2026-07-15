import type { Express } from "express";
import { registerClientStatsRoutes } from "./clients/stats";
import { registerClientAlertsRoutes } from "./clients/alerts";
import { registerClientScoringRoutes } from "./clients/scoring";
import { registerClientMetadataRoutes } from "./clients/metadata";
import { registerClientFinanceRoutes } from "./clients/finance";
import { registerClientCompteRoutes } from "./clients/finance-comptes";
import { registerClientAuthRoutes } from "./clients/auth";
import { registerClientCoreRoutes } from "./clients/core";

export function registerClientRoutes(app: Express) {
  registerClientStatsRoutes(app);
  registerClientAlertsRoutes(app);
  registerClientScoringRoutes(app);
  registerClientMetadataRoutes(app);
  registerClientFinanceRoutes(app);
  registerClientCompteRoutes(app);
  registerClientAuthRoutes(app);
  registerClientCoreRoutes(app);
}
