import type { Express } from "express";
import { registerAgentClassementRoutes } from "./agent-modules/agent-classement";
import { registerAgentCommissionsRoutes } from "./agent-modules/agent-commissions";
import { registerAgentCommunicationsRoutes } from "./agent-modules/agent-communications";
import { registerAgentFormationsRoutes } from "./agent-modules/agent-formations";
import { registerAgentIncidentsRoutes } from "./agent-modules/agent-incidents";
import { registerAgentMaterielRoutes } from "./agent-modules/agent-materiel";
import { registerAgentObjectifsRoutes } from "./agent-modules/agent-objectifs";
import { registerAgentPlanningRoutes } from "./agent-modules/agent-planning";
import { registerAgentRapportsRoutes } from "./agent-modules/agent-rapports";

export function registerAgentModulesRoutes(app: Express) {
  registerAgentClassementRoutes(app);
  registerAgentCommissionsRoutes(app);
  registerAgentObjectifsRoutes(app);
  registerAgentPlanningRoutes(app);
  registerAgentRapportsRoutes(app);
  registerAgentIncidentsRoutes(app);
  registerAgentMaterielRoutes(app);
  registerAgentCommunicationsRoutes(app);
  registerAgentFormationsRoutes(app);
}
