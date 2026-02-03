/**
 * Caisse Access Control Service
 *
 * Manages operating hours verification and security code validation
 * for caisse access outside normal operating hours.
 */

import { db } from "../../db";
import { eq, and, gt, isNull, or, sql } from "drizzle-orm";
import { caisses, caisseSecurityCodes, caisseUserAuthorizations, caisseCodeUsages } from "@shared/schema";
import * as bcrypt from "bcrypt";

// ============================================================================
// Types
// ============================================================================

interface AccessStatus {
  accessible: boolean;
  reason: 'WITHIN_HOURS' | 'OUTSIDE_HOURS' | 'DISABLED' | 'AUTHORIZED';
  message: string;
  operatingHours?: { open: string; close: string };
  nextOpening?: { day: string; time: string };
  closingTime?: string;
}

interface AuthorizationStatus {
  authorized: boolean;
  reason: 'VALID_AUTHORIZATION' | 'NO_AUTHORIZATION' | 'EXPIRED' | 'REVOKED';
  expiresAt?: string;
  grantedAt?: string;
}

interface ValidateCodeParams {
  userId: string;
  code: string;
  caisseId?: string;
  agenceId?: string;
  ipAddress?: string;
  userAgent?: string;
}

interface ValidateCodeResult {
  success: boolean;
  error?: string;
  authorization?: {
    id: string;
    expiresAt: Date;
  };
}

interface GenerateCodeParams {
  createdBy: string;
  agenceId: string;
  caisseId?: string;
  codeType?: 'EMERGENCY' | 'DAILY' | 'PERMANENT';
  maxUsages?: number;
  authorizationDurationHours?: number;
  expiresAt?: Date;
  description?: string;
  assignedToUserId?: string;
}

interface GenerateCodeResult {
  success: boolean;
  code?: string;
  codeId?: string;
  error?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

const DAYS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function getCurrentTimeInMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function isWithinOperatingHours(
  operatingHoursStart: string,
  operatingHoursEnd: string,
  operatingDays: number[]
): boolean {
  const now = new Date();
  const currentDay = now.getDay(); // 0 = Sunday
  const currentMinutes = getCurrentTimeInMinutes();

  // Check if today is an operating day
  if (!operatingDays.includes(currentDay)) {
    return false;
  }

  const startMinutes = parseTimeToMinutes(operatingHoursStart);
  const endMinutes = parseTimeToMinutes(operatingHoursEnd);

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

function getNextOpeningInfo(operatingDays: number[], operatingHoursStart: string): { day: string; time: string } {
  const now = new Date();
  const currentDay = now.getDay();
  const currentMinutes = getCurrentTimeInMinutes();
  const startMinutes = parseTimeToMinutes(operatingHoursStart);

  // Check if we can open later today
  if (operatingDays.includes(currentDay) && currentMinutes < startMinutes) {
    return { day: "Aujourd'hui", time: operatingHoursStart };
  }

  // Find next operating day
  for (let i = 1; i <= 7; i++) {
    const nextDay = (currentDay + i) % 7;
    if (operatingDays.includes(nextDay)) {
      const dayName = i === 1 ? 'Demain' : DAYS_FR[nextDay];
      return { day: dayName, time: operatingHoursStart };
    }
  }

  return { day: 'Inconnu', time: operatingHoursStart };
}

function generateSecurityCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding I, O, 0, 1 for clarity
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Check if caisse is accessible based on operating hours
 */
export async function checkCaisseAccess(
  caisseId?: string,
  agenceId?: string
): Promise<AccessStatus> {
  // If no caisse specified, return accessible (will be handled by authorization check)
  if (!caisseId) {
    return {
      accessible: true,
      reason: 'DISABLED',
      message: 'Aucune caisse spécifiée',
    };
  }

  const caisse = await db.select().from(caisses).where(eq(caisses.id, caisseId)).then(r => r[0]);

  if (!caisse) {
    return {
      accessible: false,
      reason: 'OUTSIDE_HOURS',
      message: 'Caisse non trouvée',
    };
  }

  // If operating hours control is disabled, always accessible
  if (!caisse.operatingHoursEnabled) {
    return {
      accessible: true,
      reason: 'DISABLED',
      message: 'Contrôle des horaires désactivé',
    };
  }

  const operatingDays = (caisse.operatingDays as number[]) || [1, 2, 3, 4, 5];
  const operatingHoursStart = caisse.operatingHoursStart || '08:00';
  const operatingHoursEnd = caisse.operatingHoursEnd || '17:00';

  if (isWithinOperatingHours(operatingHoursStart, operatingHoursEnd, operatingDays)) {
    return {
      accessible: true,
      reason: 'WITHIN_HOURS',
      message: 'Dans les horaires d\'ouverture',
      operatingHours: { open: operatingHoursStart, close: operatingHoursEnd },
      closingTime: operatingHoursEnd,
    };
  }

  const nextOpening = getNextOpeningInfo(operatingDays, operatingHoursStart);

  return {
    accessible: false,
    reason: 'OUTSIDE_HOURS',
    message: 'Hors des horaires d\'ouverture',
    operatingHours: { open: operatingHoursStart, close: operatingHoursEnd },
    nextOpening,
  };
}

/**
 * Check if user has a valid authorization for caisse access
 */
export async function checkUserAuthorization(
  userId: string,
  caisseId?: string,
  agenceId?: string
): Promise<AuthorizationStatus> {
  const now = new Date();

  // Build conditions for finding a valid authorization
  const conditions = [
    eq(caisseUserAuthorizations.userId, userId),
    gt(caisseUserAuthorizations.expiresAt, now),
    isNull(caisseUserAuthorizations.revokedAt),
  ];

  // Check for caisse-specific or agence-wide authorization
  if (caisseId) {
    conditions.push(
      or(
        eq(caisseUserAuthorizations.caisseId, caisseId),
        isNull(caisseUserAuthorizations.caisseId) // Agence-wide authorization
      ) as any
    );
  }

  const authorization = await db
    .select()
    .from(caisseUserAuthorizations)
    .where(and(...conditions))
    .orderBy(sql`${caisseUserAuthorizations.expiresAt} DESC`)
    .then(r => r[0]);

  if (!authorization) {
    return {
      authorized: false,
      reason: 'NO_AUTHORIZATION',
    };
  }

  return {
    authorized: true,
    reason: 'VALID_AUTHORIZATION',
    expiresAt: authorization.expiresAt.toISOString(),
    grantedAt: authorization.grantedAt.toISOString(),
  };
}

/**
 * Validate a security code and create an authorization if valid
 */
export async function validateSecurityCode(params: ValidateCodeParams): Promise<ValidateCodeResult> {
  const { userId, code, caisseId, agenceId, ipAddress, userAgent } = params;

  // Find matching active codes
  const conditions = [
    eq(caisseSecurityCodes.active, true),
  ];

  // Filter by caisse or agence if specified
  if (caisseId) {
    conditions.push(
      or(
        eq(caisseSecurityCodes.caisseId, caisseId),
        isNull(caisseSecurityCodes.caisseId)
      ) as any
    );
  }

  if (agenceId) {
    conditions.push(
      or(
        eq(caisseSecurityCodes.agenceId, agenceId),
        isNull(caisseSecurityCodes.agenceId)
      ) as any
    );
  }

  const activeCodes = await db
    .select()
    .from(caisseSecurityCodes)
    .where(and(...conditions));

  // Check each code (we store hashes, so we need to compare)
  let matchedCode: typeof activeCodes[0] | null = null;

  for (const codeRecord of activeCodes) {
    // Check if code is expired
    if (codeRecord.expiresAt && codeRecord.expiresAt < new Date()) {
      continue;
    }

    // Check if max usages reached
    if (codeRecord.maxUsages !== null && (codeRecord.usageCount || 0) >= codeRecord.maxUsages) {
      continue;
    }

    // Compare code hash
    const isMatch = await bcrypt.compare(code.toUpperCase(), codeRecord.codeHash);
    if (isMatch) {
      matchedCode = codeRecord;
      break;
    }
  }

  if (!matchedCode) {
    // Log failed attempt
    await db.insert(caisseCodeUsages).values({
      codeId: null,
      userId,
      success: false,
      ipAddress,
      userAgent,
      failureReason: 'Code invalide ou expiré',
    });

    return {
      success: false,
      error: 'Code invalide ou expiré',
    };
  }

  // Calculate authorization expiry
  const authDuration = matchedCode.authorizationDurationHours || 4;
  const expiresAt = new Date(Date.now() + authDuration * 60 * 60 * 1000);

  // Create authorization in a transaction
  const result = await db.transaction(async (tx) => {
    // Create authorization
    const [authorization] = await tx.insert(caisseUserAuthorizations).values({
      userId,
      caisseId: matchedCode!.caisseId || caisseId,
      agenceId: matchedCode!.agenceId || agenceId,
      codeId: matchedCode!.id,
      reason: 'Code de sécurité validé',
      expiresAt,
      ipAddress,
      userAgent,
    }).returning();

    // Log successful usage
    await tx.insert(caisseCodeUsages).values({
      codeId: matchedCode!.id,
      userId,
      success: true,
      authorizationId: authorization.id,
      ipAddress,
      userAgent,
    });

    // Increment usage count
    await tx.update(caisseSecurityCodes)
      .set({ usageCount: (matchedCode!.usageCount || 0) + 1 })
      .where(eq(caisseSecurityCodes.id, matchedCode!.id));

    return authorization;
  });

  return {
    success: true,
    authorization: {
      id: result.id,
      expiresAt: result.expiresAt,
    },
  };
}

/**
 * Generate a new security code
 */
export async function generateSecurityCodeForCaisse(params: GenerateCodeParams): Promise<GenerateCodeResult> {
  const {
    createdBy,
    agenceId,
    caisseId,
    codeType = 'EMERGENCY',
    maxUsages = 1,
    authorizationDurationHours = 4,
    expiresAt,
    description,
    assignedToUserId,
  } = params;

  // Generate a random 8-character code
  const plainCode = generateSecurityCode();

  // Hash the code for storage
  const codeHash = await bcrypt.hash(plainCode, 10);

  // Default expiry: 24 hours from now if not specified
  const codeExpiresAt = expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000);

  const [codeRecord] = await db.insert(caisseSecurityCodes).values({
    codeHash,
    agenceId,
    caisseId,
    codeType,
    maxUsages,
    authorizationDurationHours,
    expiresAt: codeExpiresAt,
    createdBy,
    description,
    agentId: assignedToUserId, // Store assigned user in agentId field
    active: true,
  }).returning();

  return {
    success: true,
    code: plainCode, // Return plain code only at creation time
    codeId: codeRecord.id,
  };
}

/**
 * Revoke a user's authorization
 */
export async function revokeAuthorization(
  authorizationId: string,
  revokedBy: string,
  reason?: string
): Promise<boolean> {
  await db.update(caisseUserAuthorizations)
    .set({
      revokedAt: new Date(),
      revokedBy,
      revokeReason: reason,
    })
    .where(eq(caisseUserAuthorizations.id, authorizationId));

  return true;
}

/**
 * Deactivate a security code
 */
export async function deactivateSecurityCode(codeId: string): Promise<boolean> {
  await db.update(caisseSecurityCodes)
    .set({ active: false })
    .where(eq(caisseSecurityCodes.id, codeId));

  return true;
}

/**
 * Get active authorizations for an agence (admin view)
 */
export async function getActiveAuthorizationsForAgence(agenceId: string) {
  const now = new Date();

  return db.select()
    .from(caisseUserAuthorizations)
    .where(and(
      eq(caisseUserAuthorizations.agenceId, agenceId),
      gt(caisseUserAuthorizations.expiresAt, now),
      isNull(caisseUserAuthorizations.revokedAt)
    ));
}

/**
 * Get active security codes for an agence (admin view)
 */
export async function getActiveCodesForAgence(agenceId: string) {
  const now = new Date();

  return db.select({
    id: caisseSecurityCodes.id,
    caisseId: caisseSecurityCodes.caisseId,
    agenceId: caisseSecurityCodes.agenceId,
    codeType: caisseSecurityCodes.codeType,
    maxUsages: caisseSecurityCodes.maxUsages,
    usageCount: caisseSecurityCodes.usageCount,
    authorizationDurationHours: caisseSecurityCodes.authorizationDurationHours,
    expiresAt: caisseSecurityCodes.expiresAt,
    description: caisseSecurityCodes.description,
    createdAt: caisseSecurityCodes.createdAt,
    active: caisseSecurityCodes.active,
  })
    .from(caisseSecurityCodes)
    .where(and(
      eq(caisseSecurityCodes.agenceId, agenceId),
      eq(caisseSecurityCodes.active, true),
      or(
        isNull(caisseSecurityCodes.expiresAt),
        gt(caisseSecurityCodes.expiresAt, now)
      )
    ));
}

/**
 * Cleanup expired security codes
 * Deactivates codes that have expired or reached max usages
 * Returns the number of codes cleaned up
 */
export async function cleanupExpiredCodes(): Promise<{ deactivated: number; deleted: number }> {
  const now = new Date();
  let deactivated = 0;
  let deleted = 0;

  // Get all active codes that are expired or fully used
  const expiredCodes = await db
    .select()
    .from(caisseSecurityCodes)
    .where(eq(caisseSecurityCodes.active, true));

  for (const code of expiredCodes) {
    const isExpired = code.expiresAt && code.expiresAt < now;
    const isFullyUsed = code.maxUsages !== null && (code.usageCount || 0) >= code.maxUsages;

    if (isExpired || isFullyUsed) {
      await db.update(caisseSecurityCodes)
        .set({ active: false })
        .where(eq(caisseSecurityCodes.id, code.id));
      deactivated++;
    }
  }

  // Optionally delete very old inactive codes (older than 90 days)
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const oldCodes = await db
    .select({ id: caisseSecurityCodes.id })
    .from(caisseSecurityCodes)
    .where(and(
      eq(caisseSecurityCodes.active, false),
      sql`${caisseSecurityCodes.createdAt} < ${ninetyDaysAgo}`
    ));

  if (oldCodes.length > 0) {
    // First delete related usages
    for (const code of oldCodes) {
      await db.delete(caisseCodeUsages).where(eq(caisseCodeUsages.codeId, code.id));
    }
    // Then delete the codes
    const result = await db.delete(caisseSecurityCodes)
      .where(and(
        eq(caisseSecurityCodes.active, false),
        sql`${caisseSecurityCodes.createdAt} < ${ninetyDaysAgo}`
      ));
    deleted = oldCodes.length;
  }

  return { deactivated, deleted };
}

/**
 * Cleanup expired user authorizations
 * Marks expired authorizations and returns count
 */
export async function cleanupExpiredAuthorizations(): Promise<number> {
  const now = new Date();

  // Get count of expired but not-yet-marked authorizations
  const expired = await db
    .select({ id: caisseUserAuthorizations.id })
    .from(caisseUserAuthorizations)
    .where(and(
      sql`${caisseUserAuthorizations.expiresAt} < ${now}`,
      isNull(caisseUserAuthorizations.revokedAt)
    ));

  // We don't delete them, just let them naturally expire
  // The checkUserAuthorization function already filters by expiresAt
  return expired.length;
}

/**
 * Get statistics about access codes for an agency
 */
export async function getAccessCodeStats(agenceId: string) {
  const now = new Date();

  const codes = await db
    .select()
    .from(caisseSecurityCodes)
    .where(eq(caisseSecurityCodes.agenceId, agenceId));

  const active = codes.filter(c => c.active && (!c.expiresAt || c.expiresAt > now));
  const expired = codes.filter(c => c.expiresAt && c.expiresAt < now);
  const fullyUsed = codes.filter(c => c.maxUsages !== null && (c.usageCount || 0) >= c.maxUsages);

  return {
    total: codes.length,
    active: active.length,
    expired: expired.length,
    fullyUsed: fullyUsed.length,
    revoked: codes.filter(c => !c.active).length,
  };
}

export const accessControlService = {
  checkCaisseAccess,
  checkUserAuthorization,
  validateSecurityCode,
  generateSecurityCodeForCaisse,
  revokeAuthorization,
  deactivateSecurityCode,
  getActiveAuthorizationsForAgence,
  getActiveCodesForAgence,
  cleanupExpiredCodes,
  cleanupExpiredAuthorizations,
  getAccessCodeStats,
};
