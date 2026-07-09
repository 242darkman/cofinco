/**
 * Types for Caisse Access Code Management
 * These types match the backend response from access-control-service
 */

/**
 * Security code as returned by the backend
 * Note: The actual code is only shown once at generation time (returned in GeneratedCodeResult)
 */
export interface SecurityCode {
  id: string;
  caisseId: string | null;
  agenceId: string;
  codeType: 'EMERGENCY' | 'DAILY' | 'PERMANENT';
  maxUsages: number | null;
  usageCount: number;
  authorizationDurationHours: number;
  expiresAt: string;
  description: string | null;
  createdAt: string;
  active: boolean;
  createdBy?: string;
  // Assigned user info
  assignedToUserId?: string | null;
  assignedUserName?: string | null;
}

/**
 * Result from generating a new code
 * The plain code is only returned here, at creation time
 */
export interface GeneratedCodeResult {
  success: boolean;
  code?: string;  // Plain code, only shown once
  codeId?: string;
  error?: string;
}

/**
 * User authorization for caisse access
 * Created when a user validates a security code
 */
export interface CaisseAuthorization {
  id: string;
  userId: string;
  caisseId: string | null;
  agenceId: string | null;
  codeId: string | null;
  reason: string | null;
  grantedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedBy: string | null;
  revokeReason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Legacy type for backwards compatibility
 * @deprecated Use CaisseAuthorization instead
 */
export interface CodePermission {
  id: string;
  userId: string;
  grantedBy: string;
  agence: string | null;
  canGenerateCaisseCodes: boolean;
  maxCodeDurationHours: number;
  isActive: boolean;
  validUntil: string | null;
  createdAt: string;
}

export interface User {
  id: string;
  nom: string;
  email: string;
  role: string;
  agence?: string;
  agenceId?: string;
}
