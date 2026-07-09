/**
 * Routes finance — index.
 *
 * Module découpé par domaine (AGENTS.md §8 : 400 lignes max). Chaque
 * sous-module enregistre ses chemins complets sur l'application Express ;
 * l'ordre d'appel préserve l'ordre d'enregistrement historique.
 *
 * Sous-modules :
 *   - finance/credit-plans.ts
 *   - finance/credits.ts
 *   - finance/credits-decaissement.ts
 *   - finance/credits-pending-disbursements.ts
 *   - finance/credits-batch-disburse.ts
 *   - finance/demandes-credit.ts
 *   - finance/demandes-credit-detail.ts
 *   - finance/demandes-credit-detail-2.ts
 *   - finance/demandes.ts
 *   - finance/demandes-credit-detail-3.ts
 *   - finance/demandes-credit-detail-4.ts
 *   - finance/enquetes-credit.ts
 *   - finance/enquetes-credit-detail.ts
 *   - finance/remboursements.ts
 *   - finance/admin.ts
 *   - finance/agences.ts
 *   - finance/caisses.ts
 *   - finance/sessions-caisse.ts
 *   - finance/operations-caisse.ts
 *   - finance/factures.ts
 *   - finance/caisse-transferts.ts
 *   - finance/mouvements.ts
 *   - finance/comptes.ts
 *   - finance/finance.ts
 *   - finance/finance-credit-refunds.ts
 *   - finance/finance-credit-refunds-2.ts
 *   - finance/sessions-caisse-request-opening.ts
 *   - finance/sessions-caisse-detail.ts
 *   - finance/access.ts
 *   - finance/caisse.ts
 *   - finance/caisse-verify-weight.ts
 *   - finance/liquidity.ts
 */
import type { Express } from "express";
import { registerCreditPlansRoutes } from "./finance/credit-plans";
import { registerCreditsRoutes } from "./finance/credits";
import { registerCreditsDecaissementRoutes } from "./finance/credits-decaissement";
import { registerCreditsPendingDisbursementsRoutes } from "./finance/credits-pending-disbursements";
import { registerCreditsBatchDisburseRoutes } from "./finance/credits-batch-disburse";
import { registerDemandesCreditRoutes } from "./finance/demandes-credit";
import { registerDemandesCreditDetailRoutes } from "./finance/demandes-credit-detail";
import { registerDemandesCreditDetail2Routes } from "./finance/demandes-credit-detail-2";
import { registerDemandesRoutes } from "./finance/demandes";
import { registerDemandesCreditDetail3Routes } from "./finance/demandes-credit-detail-3";
import { registerDemandesCreditDetail4Routes } from "./finance/demandes-credit-detail-4";
import { registerEnquetesCreditRoutes } from "./finance/enquetes-credit";
import { registerEnquetesCreditDetailRoutes } from "./finance/enquetes-credit-detail";
import { registerRemboursementsRoutes } from "./finance/remboursements";
import { registerAdminRoutes } from "./finance/admin";
import { registerAgencesRoutes } from "./finance/agences";
import { registerCaissesRoutes } from "./finance/caisses";
import { registerSessionsCaisseRoutes } from "./finance/sessions-caisse";
import { registerOperationsCaisseRoutes } from "./finance/operations-caisse";
import { registerFacturesRoutes } from "./finance/factures";
import { registerCaisseTransfertsRoutes } from "./finance/caisse-transferts";
import { registerMouvementsRoutes } from "./finance/mouvements";
import { registerComptesRoutes } from "./finance/comptes";
import { registerFinanceRoutes } from "./finance/finance";
import { registerFinanceCreditRefundsRoutes } from "./finance/finance-credit-refunds";
import { registerFinanceCreditRefunds2Routes } from "./finance/finance-credit-refunds-2";
import { registerSessionsCaisseRequestOpeningRoutes } from "./finance/sessions-caisse-request-opening";
import { registerSessionsCaisseDetailRoutes } from "./finance/sessions-caisse-detail";
import { registerAccessRoutes } from "./finance/access";
import { registerCaisseRoutes } from "./finance/caisse";
import { registerCaisseVerifyWeightRoutes } from "./finance/caisse-verify-weight";
import { registerLiquidityRoutes } from "./finance/liquidity";

export function registerFinanceRoutes(app: Express) {
  registerCreditPlansRoutes(app);
  registerCreditsRoutes(app);
  registerCreditsDecaissementRoutes(app);
  registerCreditsPendingDisbursementsRoutes(app);
  registerCreditsBatchDisburseRoutes(app);
  registerDemandesCreditRoutes(app);
  registerDemandesCreditDetailRoutes(app);
  registerDemandesCreditDetail2Routes(app);
  registerDemandesRoutes(app);
  registerDemandesCreditDetail3Routes(app);
  registerDemandesCreditDetail4Routes(app);
  registerEnquetesCreditRoutes(app);
  registerEnquetesCreditDetailRoutes(app);
  registerRemboursementsRoutes(app);
  registerAdminRoutes(app);
  registerAgencesRoutes(app);
  registerCaissesRoutes(app);
  registerSessionsCaisseRoutes(app);
  registerOperationsCaisseRoutes(app);
  registerFacturesRoutes(app);
  registerCaisseTransfertsRoutes(app);
  registerMouvementsRoutes(app);
  registerComptesRoutes(app);
  registerFinanceRoutes(app);
  registerFinanceCreditRefundsRoutes(app);
  registerFinanceCreditRefunds2Routes(app);
  registerSessionsCaisseRequestOpeningRoutes(app);
  registerSessionsCaisseDetailRoutes(app);
  registerAccessRoutes(app);
  registerCaisseRoutes(app);
  registerCaisseVerifyWeightRoutes(app);
  registerLiquidityRoutes(app);
}
