/**
 * Caisse Agent Services - Point d'entrée principal
 *
 * Ce module expose les services pour la gestion des caisses agent
 * et le workflow d'approbation des opérations terrain.
 */

export { CaisseAgentService, caisseAgentService } from "./caisse-agent-service";
export { OperationService, operationService } from "./operation-service";
export { ApprovalService, approvalService } from "./approval-service";
export { RemiseSettlementService, remiseSettlementService } from "./remise-settlement-service";
// Re-export if needed in the future, but currently nothing needed here since the class was removed
export { SessionAgentService, sessionAgentService } from "./session-agent-service";
export { AgentGlProvisioningService, agentGlProvisioningService } from "./agent-gl-provisioning-service";

// Re-export des types utiles
export type {
  CaisseAgent,
  CaisseAgentSummary,
  OperationTerrain,
  OperationTerrainWithRelations,
  CreateCollectCashInput,
  CreateSettlementCashInput,
  ApproveOperationInput,
  RejectOperationInput,
  CancelOperationInput,
  OperationTerrainMetadata,
  SessionAgent,
  AgentAgencyHistory,
  AgentSessionConfig,
} from "@shared/schema";
