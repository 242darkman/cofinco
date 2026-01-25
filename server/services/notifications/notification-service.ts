import { db } from "../../db";
import {
  notificationJobs,
  notifications,
  notificationSettings,
} from "@shared/schema";
import { eq, isNull } from "drizzle-orm";
import { getWsInstance } from "../../ws-server";
import { v4 as uuidv4 } from "uuid";

// ============================================================================
// TYPES
// ============================================================================

export interface NotificationRequest {
  channel: "SMS" | "EMAIL" | "PUSH" | "IN_APP";
  templateCode: string;
  recipient: string; // phone number, email, or userId
  payload: Record<string, unknown>;
  userId?: string;
  agenceId?: string;
  correlationId?: string; // Auto-generated if omitted
  maxAttempts?: number;
}

export interface InAppNotificationParams {
  userId: string;
  type: string;
  titre: string;
  message: string;
  lien?: string;
  priorite?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  referenceId?: string;
  referenceType?: string;
  expiresAt?: Date;
}

export interface NotificationEventOptions {
  smsRecipients?: Array<{
    phone: string;
    templateCode: string;
    payload: Record<string, unknown>;
    userId?: string;
    agenceId?: string;
  }>;
  emailRecipients?: Array<{
    email: string;
    templateCode: string;
    payload: Record<string, unknown>;
    userId?: string;
    agenceId?: string;
  }>;
  inAppRecipients?: Array<InAppNotificationParams>;
}

// ============================================================================
// NOTIFICATION SERVICE (Facade)
// ============================================================================

/**
 * Enqueue a notification job for async delivery by the notification worker.
 * Uses correlationId for idempotent delivery.
 * Accepts an optional Drizzle transaction for atomicity.
 */
export async function enqueueNotification(
  req: NotificationRequest,
  tx?: typeof db
): Promise<string> {
  const database = tx || db;
  const correlationId = req.correlationId || uuidv4();

  await database
    .insert(notificationJobs)
    .values({
      channel: req.channel,
      templateCode: req.templateCode,
      recipient: req.recipient,
      payload: req.payload,
      status: "QUEUED",
      attempts: 0,
      maxAttempts: req.maxAttempts ?? 3,
      nextAttemptAt: new Date(),
      correlationId,
      agenceId: req.agenceId,
      userId: req.userId,
    })
    .onConflictDoNothing(); // Idempotent on correlationId unique constraint

  return correlationId;
}

/**
 * Create an in-app notification (immediate write + WebSocket broadcast).
 * This is NOT queued -- it writes directly to the `notifications` table.
 */
export async function sendInAppNotification(
  params: InAppNotificationParams,
  tx?: typeof db
) {
  const database = tx || db;

  const [notification] = await database
    .insert(notifications)
    .values({
      userId: params.userId,
      type: params.type,
      titre: params.titre,
      message: params.message,
      lien: params.lien,
      priorite: params.priorite || "NORMAL",
      referenceId: params.referenceId,
      referenceType: params.referenceType,
      expiresAt: params.expiresAt,
    })
    .returning();

  // Broadcast via WebSocket to the target user
  try {
    const wsInstance = getWsInstance();
    if (wsInstance && params.userId) {
      wsInstance.sendToUser(params.userId, {
        type: "NOTIFICATION" as any,
        payload: {
          action: "created",
          notification,
        },
      });
    }
  } catch {
    // Non-blocking: WS broadcast failure should not affect notification creation
  }

  return notification;
}

/**
 * Emit a domain event that triggers multiple notifications.
 * Resolves routing policy (enabled channels from settings) and enqueues accordingly.
 *
 * @param eventType - Domain event name (for logging/audit)
 * @param data - Raw event data (for logging/audit)
 * @param options - Recipients per channel
 * @param tx - Optional Drizzle transaction for atomicity
 */
export async function emitNotificationEvent(
  eventType: string,
  data: Record<string, unknown>,
  options: NotificationEventOptions,
  tx?: typeof db
): Promise<string[]> {
  const correlationIds: string[] = [];

  // Load global notification settings
  const settings = await getGlobalNotificationSettings();
  const smsEnabled = settings?.smsEnabled ?? true;
  const emailEnabled = settings?.emailEnabled ?? false;

  // Enqueue SMS notifications
  if (smsEnabled && options.smsRecipients) {
    for (const sms of options.smsRecipients) {
      const cId = await enqueueNotification(
        {
          channel: "SMS",
          templateCode: sms.templateCode,
          recipient: sms.phone,
          payload: sms.payload,
          userId: sms.userId,
          agenceId: sms.agenceId,
        },
        tx
      );
      correlationIds.push(cId);
    }
  }

  // Enqueue Email notifications
  if (emailEnabled && options.emailRecipients) {
    for (const email of options.emailRecipients) {
      const cId = await enqueueNotification(
        {
          channel: "EMAIL",
          templateCode: email.templateCode,
          recipient: email.email,
          payload: email.payload,
          userId: email.userId,
          agenceId: email.agenceId,
        },
        tx
      );
      correlationIds.push(cId);
    }
  }

  // Send in-app notifications immediately (not queued)
  if (options.inAppRecipients) {
    for (const inApp of options.inAppRecipients) {
      await sendInAppNotification(inApp, tx);
    }
  }

  return correlationIds;
}

/**
 * Get notification settings for an agency (falls back to global if not set).
 */
export async function getNotificationSettingsForAgency(agenceId?: string) {
  if (agenceId) {
    const [agencySettings] = await db
      .select()
      .from(notificationSettings)
      .where(eq(notificationSettings.agenceId, agenceId))
      .limit(1);
    if (agencySettings) return agencySettings;
  }

  return getGlobalNotificationSettings();
}

/**
 * Get global notification settings (agenceId IS NULL).
 */
export async function getGlobalNotificationSettings() {
  const [globalSettings] = await db
    .select()
    .from(notificationSettings)
    .where(isNull(notificationSettings.agenceId))
    .limit(1);
  return globalSettings || null;
}
