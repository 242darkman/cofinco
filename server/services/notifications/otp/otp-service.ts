import crypto from "crypto";
import { db } from "../../../db";
import { otpCodes, notificationSettings } from "@shared/schema";
import { eq, and, gte, sql, isNull, desc } from "drizzle-orm";
import { enqueueNotification } from "../notification-service";
import { resolveOtpChannel } from "../policy/routing-policy";
import { logNotificationEvent } from "../audit/notification-audit";

// ============================================================================
// CONFIGURATION
// ============================================================================

const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const OTP_MAX_ATTEMPTS_DEFAULT = 3;

/**
 * HMAC secret from env, with a dev fallback (NEVER use fallback in production).
 */
function getHmacSecret(): string {
  const secret = process.env.OTP_HMAC_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("OTP_HMAC_SECRET environment variable is required in production");
    }
    return "dev-otp-secret-NOT-FOR-PRODUCTION";
  }
  return secret;
}

// ============================================================================
// TYPES
// ============================================================================

export interface RequestOtpParams {
  userId?: string;
  destination: string; // Phone number or email
  channel?: "SMS" | "EMAIL";
  purpose:
    | "PASSWORD_RESET"
    | "TRANSFER_VALIDATION"
    | "CREDIT_VALIDATION"
    | "SECURITY_CHANGE"
    | "CAISSE_OPERATION";
  templatePayload?: Record<string, unknown>;
  agenceId?: string;
  ipAddress?: string;
}

export interface RequestOtpResult {
  otpId: string;
  expiresAt: Date;
  debugCode?: string; // Only in non-production environments
}

export interface VerifyOtpParams {
  destination: string;
  purpose:
    | "PASSWORD_RESET"
    | "TRANSFER_VALIDATION"
    | "CREDIT_VALIDATION"
    | "SECURITY_CHANGE"
    | "CAISSE_OPERATION";
  code: string;
}

export interface VerifyOtpResult {
  valid: boolean;
  attemptsRemaining?: number;
  error?: string;
}

// ============================================================================
// CRYPTO PRIMITIVES
// ============================================================================

/**
 * Generate a cryptographically secure 6-digit OTP code.
 */
export function generateOtpCode(): string {
  const min = Math.pow(10, OTP_LENGTH - 1); // 100000
  const max = Math.pow(10, OTP_LENGTH) - 1; // 999999
  return crypto.randomInt(min, max + 1).toString();
}

/**
 * Generate a random salt (16 bytes hex).
 */
export function generateSalt(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Hash an OTP code with HMAC-SHA256 using the secret + salt.
 */
export function hashOtp(code: string, salt: string): string {
  const secret = getHmacSecret();
  return crypto
    .createHmac("sha256", secret)
    .update(salt + code)
    .digest("hex");
}

/**
 * Verify an OTP code against a stored hash using timing-safe comparison.
 */
export function verifyOtpHash(
  code: string,
  salt: string,
  storedHash: string
): boolean {
  const candidateHash = hashOtp(code, salt);
  const a = Buffer.from(candidateHash, "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ============================================================================
// RATE LIMITING
// ============================================================================

/**
 * Check OTP rate limits for a destination + purpose.
 * Returns null if OK, or an error message string if rate-limited.
 */
export async function checkOtpRateLimit(
  destination: string,
  purpose: string,
  agenceId?: string
): Promise<string | null> {
  // Load settings for rate limits
  let settings: { otpMaxPerMinute: number; otpMaxPerDay: number } | null = null;

  if (agenceId) {
    const [agencySettings] = await db
      .select({
        otpMaxPerMinute: notificationSettings.otpMaxPerMinute,
        otpMaxPerDay: notificationSettings.otpMaxPerDay,
      })
      .from(notificationSettings)
      .where(eq(notificationSettings.agenceId, agenceId))
      .limit(1);
    if (agencySettings) settings = agencySettings;
  }

  if (!settings) {
    const [globalSettings] = await db
      .select({
        otpMaxPerMinute: notificationSettings.otpMaxPerMinute,
        otpMaxPerDay: notificationSettings.otpMaxPerDay,
      })
      .from(notificationSettings)
      .where(isNull(notificationSettings.agenceId))
      .limit(1);
    settings = globalSettings || { otpMaxPerMinute: 3, otpMaxPerDay: 20 };
  }

  const now = new Date();
  const oneMinuteAgo = new Date(now.getTime() - 60_000);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Per-minute rate limit
  const [minuteResult] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.destination, destination),
        eq(otpCodes.purpose, purpose as any),
        gte(otpCodes.createdAt, oneMinuteAgo)
      )
    );

  if (minuteResult && minuteResult.count >= settings.otpMaxPerMinute) {
    return "Trop de demandes OTP. Veuillez attendre une minute.";
  }

  // Per-day rate limit
  const [dayResult] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.destination, destination),
        eq(otpCodes.purpose, purpose as any),
        gte(otpCodes.createdAt, todayStart)
      )
    );

  if (dayResult && dayResult.count >= settings.otpMaxPerDay) {
    return "Quota OTP journalier atteint pour cette destination.";
  }

  return null;
}

// ============================================================================
// OTP REQUEST (Generate + Persist + Enqueue Notification)
// ============================================================================

/**
 * Request a new OTP code.
 *
 * Flow:
 * 1. Check rate limits
 * 2. Generate code + salt + hash
 * 3. Persist hash in otp_codes (never store plaintext)
 * 4. Enqueue SMS/EMAIL notification for delivery
 * 5. Return otpId + expiresAt (+ debugCode in dev)
 */
export async function requestOtp(
  params: RequestOtpParams
): Promise<RequestOtpResult> {
  // 1. Rate limit check
  const rateLimitError = await checkOtpRateLimit(
    params.destination,
    params.purpose,
    params.agenceId
  );
  if (rateLimitError) {
    throw new OtpRateLimitError(rateLimitError);
  }

  // 2. Resolve delivery channel
  const channel =
    params.channel || (await resolveOtpChannel(params.agenceId));

  // 3. Generate OTP
  const code = generateOtpCode();
  const salt = generateSalt();
  const codeHash = hashOtp(code, salt);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  // 4. Persist (hash only, never plaintext)
  const [otpRecord] = await db
    .insert(otpCodes)
    .values({
      userId: params.userId,
      destination: params.destination,
      channel,
      purpose: params.purpose,
      codeHash,
      salt,
      expiresAt,
      attempts: 0,
      maxAttempts: OTP_MAX_ATTEMPTS_DEFAULT,
      ipAddress: params.ipAddress,
    })
    .returning();

  // 5. Enqueue notification for delivery
  const templateCode = channel === "EMAIL" ? "OTP_CODE_EMAIL" : "OTP_CODE";
  await enqueueNotification({
    channel,
    templateCode,
    recipient: params.destination,
    payload: {
      code,
      purpose: params.purpose,
      expiresMinutes: OTP_TTL_MS / 60_000,
      ...(params.templatePayload || {}),
    },
    userId: params.userId,
    agenceId: params.agenceId,
    correlationId: `otp-${otpRecord.id}`,
  });

  logNotificationEvent("info", "OTP requested", {
    correlationId: `otp-${otpRecord.id}`,
    channel,
    recipient: params.destination,
    status: "QUEUED",
  });

  // 6. Return result
  const result: RequestOtpResult = {
    otpId: otpRecord.id,
    expiresAt,
  };

  // Only expose code in non-production for debugging
  if (process.env.NODE_ENV !== "production") {
    result.debugCode = code;
  }

  return result;
}

// ============================================================================
// OTP VERIFICATION
// ============================================================================

/**
 * Verify an OTP code.
 *
 * Flow:
 * 1. Find the most recent non-consumed, non-expired OTP for destination+purpose
 * 2. Check max attempts
 * 3. Verify hash with timingSafeEqual
 * 4. If invalid: increment attempts
 * 5. If valid: mark consumedAt
 */
export async function verifyOtp(
  params: VerifyOtpParams
): Promise<VerifyOtpResult> {
  const now = new Date();

  // 1. Find the latest valid OTP
  const [otpRecord] = await db
    .select()
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.destination, params.destination),
        eq(otpCodes.purpose, params.purpose as any),
        isNull(otpCodes.consumedAt),
        gte(otpCodes.expiresAt, now)
      )
    )
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);

  if (!otpRecord) {
    return {
      valid: false,
      error: "Code invalide ou expiré.",
    };
  }

  // 2. Check max attempts
  if (otpRecord.attempts >= otpRecord.maxAttempts) {
    return {
      valid: false,
      error: "Nombre maximum de tentatives atteint.",
    };
  }

  // 3. Verify hash
  const isValid = verifyOtpHash(params.code, otpRecord.salt, otpRecord.codeHash);

  if (!isValid) {
    // 4. Increment attempts
    const newAttempts = otpRecord.attempts + 1;
    await db
      .update(otpCodes)
      .set({ attempts: newAttempts })
      .where(eq(otpCodes.id, otpRecord.id));

    const remaining = otpRecord.maxAttempts - newAttempts;

    logNotificationEvent("warn", "OTP verification failed", {
      correlationId: `otp-${otpRecord.id}`,
      channel: otpRecord.channel,
      recipient: otpRecord.destination,
      status: "INVALID",
    });

    return {
      valid: false,
      attemptsRemaining: remaining,
      error:
        remaining > 0
          ? `Code invalide. ${remaining} tentative(s) restante(s).`
          : "Nombre maximum de tentatives atteint.",
    };
  }

  // 5. Mark as consumed
  await db
    .update(otpCodes)
    .set({ consumedAt: now })
    .where(eq(otpCodes.id, otpRecord.id));

  logNotificationEvent("info", "OTP verified successfully", {
    correlationId: `otp-${otpRecord.id}`,
    channel: otpRecord.channel,
    recipient: otpRecord.destination,
    status: "CONSUMED",
  });

  return { valid: true };
}

// ============================================================================
// CUSTOM ERRORS
// ============================================================================

export class OtpRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OtpRateLimitError";
  }
}
