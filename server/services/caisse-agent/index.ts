/**
 * Caisse Agent Services - Point d'entrée principal
 *
 * Ce module expose les services pour la gestion des caisses agent
 * et le workflow d'approbation des opérations terrain.
 */

export { CaisseAgentService, caisseAgentService } from "./caisse-agent-service";
export { OperationService, operationService } from "./operation-service";
export { ApprovalService, approvalService } from "./approval-service";

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
} from "@shared/schema";
