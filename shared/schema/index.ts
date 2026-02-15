// Export all modules
export * from "./auth";
export * from "./departments";
// employes is imported by hr.ts, so we export it explicitly to avoid conflicts
export { employes, insertEmployeSchema, type InsertEmploye, type Employe, type EmployeWithUser } from "./employes";
export * from "./clients";
export * from "./settings";
export * from "./finance";
export * from "./tontines";
export * from "./coffre";
export * from "./messages";
export * from "./conversations";
export * from "./operations";
export * from "./transferts";
export * from "./hr";
export * from "./accounting";
export * from "./treasury";
export * from "./remboursement-allocations";
export * from "./agences";
export * from "./caisse-agent";
export * from "./coffres-forts";
export * from "./evacuation-coffre";
export * from "./agency_migration";
export * from "./mobile-money";
export * from "./mm-fee-schedules";
export * from "./dossier-credit";
export * from "./notifications";
export * from "./agent-modules";
export * from "./caisse-closing";
export * from "./idempotency";
export * from "./device-keys";
export * from "./kpi";

// Relations - Need to be defined here or in a separate file to avoid circular dependencies
// if they were in individual files. OR we can put relations in `relations.ts`.
// For now, I will re-export them from where they are OR define them here if they cross boundaries.

// Actually, relations often depend on multiple tables.
// The relations definitions in original schema were:
// `clientsRelations` -> credits, comptesEpargne, membresTontine
// `creditsRelations` -> client, repayments
// etc.
// Since I separated tables, I need to import them all to define relations.
// I will create `relations.ts` in `shared/schema/` and export it in index.

import { relations } from "drizzle-orm";

 
 
import { membresTontine, contributionsTontine, tontines } from "./tontines";
import { factures, lignesFactures, modelesFactures } from "./operations";
// Circular dependency risk if I import from "." inside relations.ts which is exported by "."?
// Better to import from specific files in relations.ts.

export * from "./relations";
