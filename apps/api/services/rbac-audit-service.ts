/**
 * RBAC Audit Service
 * ==================
 *
 * Service pour l'audit trail des modifications RBAC.
 * Ce fichier est un "barrel file" qui réexporte les fonctionnalités découpées pour la maintenabilité.
 */

export * from './rbac-audit/feature-flags.service';
export * from './rbac-audit/critical-permissions.service';
export * from './rbac-audit/logging.service';
export * from './rbac-audit/history.service';
export * from './rbac-audit/explain.service';
export * from './rbac-audit/revert.service';
