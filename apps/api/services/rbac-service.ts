/**
 * RBAC Service - Centralized service for role-based access control
 * 
 * Cette façade regroupe toutes les fonctionnalités RBAC qui ont été découpées
 * en modules spécifiques pour une meilleure maintenabilité.
 */

export * from './rbac/versioning.service';
export * from './rbac/catalog.service';
export * from './rbac/role-permissions.service';
export * from './rbac/user-overrides.service';
export * from './rbac/effective-permissions.service';
export * from './rbac/helpers.service';
export * from './rbac/conflicts.service';
export * from './rbac/simulation.service';
export * from './rbac/crud.service';
