// Export all modules
export * from "./pays";
export * from "./geography";
export * from "./villes-reference";
export * from "./auth";
export * from "./departments";
export * from "./catalog";
// employes is imported by hr.ts, so we export it explicitly to avoid conflicts
export { employes, insertEmployeSchema, type InsertEmploye, type Employe, type EmployeWithUser } from "./employes";
// New multi-agency types re-exported from hr.ts via wildcard
export * from "./clients";
export * from "./settings";
export * from "./finance";
export * from "./tontines";
export * from "./coffre";
export * from "./conversations";
export * from "./operations";
export * from "./transferts";
export * from "./hr";
export * from "./accounting";
export * from "./analytique";
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
export * from "./scoring";
export * from "./deployment";

// Relations are defined in relations.ts (imports specific files to avoid circular deps)
export * from "./relations";
