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
  requireRole,
  requireAgenceIdAccess,
  validateAgenceIdAction,
} from "../middleware";

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

// Maintenance mode
export { checkMaintenanceMode } from "./maintenance";
