import { db } from "../../../db";
import { notificationSettings, smsProviderSettings } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import type { NotificationSettings } from "@shared/schema";

// ============================================================================
// TYPES
// ============================================================================

export type Channel = "SMS" | "EMAIL" | "PUSH" | "IN_APP";

export interface RoutingDecision {
  channels: Channel[];
  smsProvider?: string; // "mtn" | "legacy" | null
}

// ============================================================================
// ROUTING POLICY
// ============================================================================

/**
 * Determine which channels to use based on notification settings.
 * Respects global and per-agency configuration.
 *
 * @param agenceId - Optional agency ID for agency-specific settings
 * @param preferredChannel - Optional preferred channel (overrides policy for this request)
 */
export async function resolveChannels(
  agenceId?: string,
  preferredChannel?: Channel
): Promise<RoutingDecision> {
  const settings = await getEffectiveSettings(agenceId);

  if (!settings) {
    // No settings found -- default to SMS only
    return { channels: ["SMS"], smsProvider: undefined };
  }

  // If a specific channel is requested, use it (if enabled)
  if (preferredChannel) {
    if (isChannelEnabled(settings, preferredChannel)) {
      return {
        channels: [preferredChannel],
        smsProvider: preferredChannel === "SMS" ? await resolveSmsProviderName() : undefined,
      };
    }
    // Requested channel not enabled -- fall through to policy
  }

  // Apply fallback policy
  const channels: Channel[] = [];

  switch (settings.fallbackPolicy) {
    case "SMS_ONLY":
      if (settings.smsEnabled) channels.push("SMS");
      break;

    case "EMAIL_ONLY":
      if (settings.emailEnabled) channels.push("EMAIL");
      break;

    case "SMS_THEN_EMAIL":
      if (settings.smsEnabled) channels.push("SMS");
      if (settings.emailEnabled) channels.push("EMAIL");
      break;

    case "EMAIL_THEN_SMS":
      if (settings.emailEnabled) channels.push("EMAIL");
      if (settings.smsEnabled) channels.push("SMS");
      break;

    default:
      if (settings.smsEnabled) channels.push("SMS");
      break;
  }

  const hasSms = channels.includes("SMS");
  return {
    channels,
    smsProvider: hasSms ? await resolveSmsProviderName() : undefined,
  };
}

/**
 * Determine the OTP delivery channel based on settings.
 */
export async function resolveOtpChannel(
  agenceId?: string
): Promise<"SMS" | "EMAIL"> {
  const settings = await getEffectiveSettings(agenceId);
  return settings?.otpChannel === "EMAIL" ? "EMAIL" : "SMS";
}

// ============================================================================
// HELPERS
// ============================================================================

function isChannelEnabled(
  settings: NotificationSettings,
  channel: Channel
): boolean {
  switch (channel) {
    case "SMS":
      return settings.smsEnabled;
    case "EMAIL":
      return settings.emailEnabled;
    case "PUSH":
      return settings.pushEnabled;
    case "IN_APP":
      return true; // Always enabled
    default:
      return false;
  }
}

/**
 * Get effective notification settings: agency-specific if exists, else global.
 */
async function getEffectiveSettings(
  agenceId?: string
): Promise<NotificationSettings | null> {
  if (agenceId) {
    const [agencySettings] = await db
      .select()
      .from(notificationSettings)
      .where(eq(notificationSettings.agenceId, agenceId))
      .limit(1);
    if (agencySettings) return agencySettings;
  }

  const [globalSettings] = await db
    .select()
    .from(notificationSettings)
    .where(isNull(notificationSettings.agenceId))
    .limit(1);

  return globalSettings || null;
}

/**
 * Determine which SMS provider to use.
 * Checks for active MTN provider first, then falls back to legacy.
 */
async function resolveSmsProviderName(): Promise<string> {
  const [mtnProvider] = await db
    .select()
    .from(smsProviderSettings)
    .where(
      and(
        eq(smsProviderSettings.providerName, "mtn"),
        eq(smsProviderSettings.isActive, true)
      )
    )
    .limit(1);

  if (mtnProvider) {
    return "mtn";
  }

  // Check for any other active primary provider
  const [primaryProvider] = await db
    .select()
    .from(smsProviderSettings)
    .where(
      and(
        eq(smsProviderSettings.isPrimary, true),
        eq(smsProviderSettings.isActive, true)
      )
    )
    .limit(1);

  return primaryProvider?.provider || "none";
}
