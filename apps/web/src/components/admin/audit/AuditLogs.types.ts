/**
 * Types du composant AuditLogs (modèle de données local).
 */

export interface AuditLog {
  id: string;
  timestamp?: string;
  createdAt?: string;
  userEmail?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  resource?: string;
  status?: string;
  ipAddress?: string;
  errorMessage?: string;
}
