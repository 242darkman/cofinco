/**
 * Server Middleware Exports
 *
 * Point d'entrée centralisé pour tous les middlewares du serveur.
 */

// Authentication & Authorization (from parent middleware.ts)
export {
  getAuthUser,
  requireAgenceAccess,
  validateAgenceAction,
  requireAgenceIdAccess,
  validateAgenceIdAction,
} from "../middleware";

// NOTE: requireRole has been removed - use requireAbility from server/authorization instead
// Import: import { attachAbility, requireAbility } from "../authorization"
// Usage: attachAbility, requireAbility(Actions.X, Subjects.Y)

// Database Context (RLS)
export {
  setDbContext,
  withDbContext,
  withDbContextTransaction,
  requireRLSContext,
  buildRLSContext,
  applyRLSContext,
  getRLSContextStatus,
  setTestRLSContext,
  clearTestRLSContext,
  type RLSContext,
} from "./db-context";

// Idempotency
export { idempotencyMiddleware } from "./idempotency";

// ETag conditional responses
export { etagMiddleware } from "./etag";

// Maintenance mode
export { checkMaintenanceMode } from "./maintenance";

// Agency Scope Documentation & Helpers
export {
  ROUTES_REQUIRING_AGENCY_SCOPE,
  ROUTES_EXEMPT_FROM_AGENCY_SCOPE,
  requiresAgencyScope,
  getAgencyScopeConfig,
  type AgencyScopeRoute,
  type AgencyExemptRoute,
} from "./agency-scope";
