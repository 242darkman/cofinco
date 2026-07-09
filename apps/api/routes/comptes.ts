/**
 * Routes comptes — index.
 *
 * Module découpé par domaine (AGENTS.md §8 : 400 lignes max). Chaque
 * sous-module enregistre ses chemins complets sur l'application Express ;
 * l'ordre d'appel préserve l'ordre d'enregistrement historique.
 *
 * Sous-modules :
 *   - comptes/comptes.ts
 *   - comptes/accounts.ts
 *   - comptes/comptes-pending-activation.ts
 *   - comptes/clients.ts
 *   - comptes/produits-compte.ts
 *   - comptes/comptes-transferts-programmes.ts
 *   - comptes/comptes-transferts-programmes-2.ts
 *   - comptes/comptes-bloques.ts
 *   - comptes/comptes-detail.ts
 *   - comptes/comptes-detail-2.ts
 *   - comptes/comptes-detail-3.ts
 *   - comptes/comptes-detail-4.ts
 *   - comptes/comptes-operations.ts
 *   - comptes/comptes-admin.ts
 *   - comptes/closure-requests.ts
 *   - comptes/comptes-detail-5.ts
 *   - comptes/opening-requests.ts
 *   - comptes/comptes-transferts.ts
 */
import type { Express } from "express";
import { registerComptesBaseRoutes } from "./comptes/comptes";
import { registerAccountsRoutes } from "./comptes/accounts";
import { registerComptesPendingActivationRoutes } from "./comptes/comptes-pending-activation";
import { registerClientsRoutes } from "./comptes/clients";
import { registerProduitsCompteRoutes } from "./comptes/produits-compte";
import { registerComptesTransfertsProgrammesRoutes } from "./comptes/comptes-transferts-programmes";
import { registerComptesTransfertsProgrammes2Routes } from "./comptes/comptes-transferts-programmes-2";
import { registerComptesBloquesRoutes } from "./comptes/comptes-bloques";
import { registerComptesDetailRoutes } from "./comptes/comptes-detail";
import { registerComptesDetail2Routes } from "./comptes/comptes-detail-2";
import { registerComptesDetail3Routes } from "./comptes/comptes-detail-3";
import { registerComptesDetail4Routes } from "./comptes/comptes-detail-4";
import { registerComptesOperationsRoutes } from "./comptes/comptes-operations";
import { registerComptesAdminRoutes } from "./comptes/comptes-admin";
import { registerClosureRequestsRoutes } from "./comptes/closure-requests";
import { registerComptesDetail5Routes } from "./comptes/comptes-detail-5";
import { registerOpeningRequestsRoutes } from "./comptes/opening-requests";
import { registerComptesTransfertsRoutes } from "./comptes/comptes-transferts";

export function registerComptesRoutes(app: Express) {
  registerComptesBaseRoutes(app);
  registerAccountsRoutes(app);
  registerComptesPendingActivationRoutes(app);
  registerClientsRoutes(app);
  registerProduitsCompteRoutes(app);
  registerComptesTransfertsProgrammesRoutes(app);
  registerComptesTransfertsProgrammes2Routes(app);
  registerComptesBloquesRoutes(app);
  registerComptesDetailRoutes(app);
  registerComptesDetail2Routes(app);
  registerComptesDetail3Routes(app);
  registerComptesDetail4Routes(app);
  registerComptesOperationsRoutes(app);
  registerComptesAdminRoutes(app);
  registerClosureRequestsRoutes(app);
  registerComptesDetail5Routes(app);
  registerOpeningRequestsRoutes(app);
  registerComptesTransfertsRoutes(app);
}
