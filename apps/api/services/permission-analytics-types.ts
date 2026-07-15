/**
 * Configuration d'exécution des analytics de permissions.
 *
 * Les taux sont exprimés entre 0 et 1 afin de piloter l'échantillonnage sans
 * modifier les appels d'autorisation.
 */
export interface AnalyticsConfig {
  enabled: boolean;
  samplingRateAllowed: number;
  samplingRateDenied: number;
  batchSize: number;
  flushIntervalMs: number;
  retentionDays: number;
}

/**
 * Vérification de permission à journaliser lorsque l'échantillonnage la retient.
 */
export interface PermissionCheckLog {
  userId: string;
  userRole: string;
  permissionCode: string;
  action: string;
  subject: string;
  allowed: boolean;
  deniedReason?: string;
  agenceId?: string;
  resourceId?: string;
  resourceType?: string;
  endpoint?: string;
  ipAddress?: string;
}

/**
 * Statistiques agrégées par permission depuis la vue matérialisée.
 */
export interface PermissionStats {
  permissionCode: string;
  action: string;
  subject: string;
  totalChecks: number;
  allowedCount: number;
  deniedCount: number;
  uniqueUsers: number;
  allowRate: number;
  firstCheck: Date;
  lastCheck: Date;
}

/**
 * Permission existante qui n'apparaît dans aucun log d'utilisation.
 */
export interface UnusedPermission {
  id: string;
  code: string;
  name: string;
  moduleName: string;
  createdAt: Date;
}

/**
 * Permission la plus fréquemment refusée.
 */
export interface PermissionDenialStats {
  permissionCode: string;
  deniedCount: number;
  uniqueUsers: number;
  lastDenied: Date;
}
