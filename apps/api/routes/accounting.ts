import type { Express } from "express";
import { registerAccountingAnalytiqueRoutes } from "./accounting/accounting-analytique";
import { registerAccountingCobacRoutes } from "./accounting/accounting-cobac";
import { registerAccountingConsolidationRoutes } from "./accounting/accounting-consolidation";
import { registerAccountingCoreRoutes } from "./accounting/accounting-core";
import { registerAccountingDsfRoutes } from "./accounting/accounting-dsf";
import { registerAccountingEcrituresRoutes } from "./accounting/accounting-ecritures";
import { registerAccountingEngagementsProvisionsRoutes } from "./accounting/accounting-engagements-provisions";
import { registerAccountingExercicesRoutes } from "./accounting/accounting-exercices";
import { registerAccountingFecRoutes } from "./accounting/accounting-fec";
import { registerAccountingImmobilisationsRoutes } from "./accounting/accounting-immobilisations";
import { registerAccountingLettrageRoutes } from "./accounting/accounting-lettrage";
import { registerAccountingRapprochementRoutes } from "./accounting/accounting-rapprochement";
import { registerAccountingReportsRoutes } from "./accounting/accounting-reports";
import { registerAccountingReportsOhadaRoutes } from "./accounting/accounting-reports-ohada";

export function registerAccountingRoutes(app: Express) {
  registerAccountingCoreRoutes(app);
  registerAccountingEcrituresRoutes(app);
  registerAccountingFecRoutes(app);
  registerAccountingReportsRoutes(app);
  registerAccountingReportsOhadaRoutes(app);
  registerAccountingConsolidationRoutes(app);
  registerAccountingLettrageRoutes(app);
  registerAccountingRapprochementRoutes(app);
  registerAccountingImmobilisationsRoutes(app);
  registerAccountingExercicesRoutes(app);
  registerAccountingCobacRoutes(app);
  registerAccountingDsfRoutes(app);
  registerAccountingAnalytiqueRoutes(app);
  registerAccountingEngagementsProvisionsRoutes(app);
}
