/**
 * Push Notification Service
 * Implements Web Push API for browser push notifications
 */

import webPush from "web-push";
import { db } from "../db";
import { pushSubscriptions, pushNotificationLogs, users, userRoles } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { currencySymbol } from "@shared/config/currency";

const logger = createLogger('Push');

// VAPID keys - should be set in environment variables
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:contact@example.com";

// Configure web-push if VAPID keys are available
let pushConfigured = false;

export function initializePushService() {
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    try {
      webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
      pushConfigured = true;
      logger.info('Web Push service initialized');
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize Web Push');
    }
  } else {
    logger.info('VAPID keys not configured - push notifications disabled');
  }
}

export function isPushConfigured(): boolean {
  return pushConfigured;
}

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

/**
 * Generate new VAPID keys (utility for setup)
 */
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  const keys = webPush.generateVAPIDKeys();
  return {
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
  };
}

interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  expirationTime?: number | null;
}

/**
 * Save a push subscription for a user
 */
export async function savePushSubscription(
  userId: string,
  subscription: PushSubscriptionData,
  deviceInfo?: string
) {
  // Check if subscription already exists
  const [existing] = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, subscription.endpoint))
    .limit(1);

  if (existing) {
    // Update existing subscription
    const [updated] = await db
      .update(pushSubscriptions)
      .set({
        userId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        expirationTime: subscription.expirationTime
          ? new Date(subscription.expirationTime)
          : null,
        deviceInfo,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(pushSubscriptions.id, existing.id))
      .returning();

    return updated;
  }

  // Create new subscription
  const [created] = await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      expirationTime: subscription.expirationTime
        ? new Date(subscription.expirationTime)
        : null,
      deviceInfo,
      isActive: true,
    })
    .returning();

  return created;
}

/**
 * Remove a push subscription
 */
export async function removePushSubscription(endpoint: string) {
  await db
    .update(pushSubscriptions)
    .set({ isActive: false })
    .where(eq(pushSubscriptions.endpoint, endpoint));
}

/**
 * Get all active subscriptions for a user
 */
export async function getUserSubscriptions(userId: string) {
  return db
    .select()
    .from(pushSubscriptions)
    .where(
      and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.isActive, true))
    );
}

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  image?: string;
  tag?: string;
  data?: Record<string, any>;
  actions?: Array<{ action: string; title: string; icon?: string }>;
  requireInteraction?: boolean;
  silent?: boolean;
}

/**
 * Send push notification to a specific subscription
 */
async function sendToSubscription(
  subscription: {
    id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  },
  payload: PushPayload
): Promise<{ success: boolean; error?: string }> {
  if (!pushConfigured) {
    return { success: false, error: "Push notifications not configured" };
  }

  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
  };

  try {
    await webPush.sendNotification(
      pushSubscription,
      JSON.stringify(payload),
      {
        TTL: 86400, // 24 hours
        urgency: "normal",
      }
    );

    // Log success
    await db.insert(pushNotificationLogs).values({
      subscriptionId: subscription.id,
      title: payload.title,
      body: payload.body,
      statut: "sent",
    });

    return { success: true };
  } catch (error: any) {
    const errorMessage = error.message || "Unknown error";

    // Log failure
    await db.insert(pushNotificationLogs).values({
      subscriptionId: subscription.id,
      title: payload.title,
      body: payload.body,
      statut: "failed",
      error: errorMessage,
    });

    // Handle expired/invalid subscriptions
    if (error.statusCode === 404 || error.statusCode === 410) {
      // Subscription no longer valid, mark as inactive
      await db
        .update(pushSubscriptions)
        .set({ isActive: false })
        .where(eq(pushSubscriptions.id, subscription.id));
    }

    return { success: false, error: errorMessage };
  }
}

/**
 * Send push notification to a user (all their devices)
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  const subscriptions = await getUserSubscriptions(userId);

  let sent = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      const result = await sendToSubscription(sub, payload);
      if (result.success) {
        sent++;
      } else {
        failed++;
      }
    })
  );

  return { sent, failed };
}

/**
 * Send push notification to multiple users
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  let totalSent = 0;
  let totalFailed = 0;

  await Promise.all(
    userIds.map(async (userId) => {
      const { sent, failed } = await sendPushToUser(userId, payload);
      totalSent += sent;
      totalFailed += failed;
    })
  );

  return { sent: totalSent, failed: totalFailed };
}

/**
 * Send push notification to all users with a specific role
 */
export async function sendPushToRole(
  role: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  const usersWithRole = await db
    .select({ id: userRoles.userId })
    .from(userRoles)
    .where(eq(userRoles.role, role as any));

  const userIds = usersWithRole.map((u) => u.id);
  return sendPushToUsers(userIds, payload);
}

// ============================================
// NOTIFICATION TEMPLATES
// ============================================

export async function sendCreditApprovedPush(
  userId: string,
  creditNumber: string,
  amount: number
) {
  return sendPushToUser(userId, {
    title: "Crédit Approuvé! 🎉",
    body: `Votre demande de crédit #${creditNumber} de ${amount.toLocaleString()} ${currencySymbol()} a été approuvée.`,
    icon: "/icons/credit-approved.png",
    tag: `credit-approved-${creditNumber}`,
    data: {
      type: "credit_approved",
      creditNumber,
      amount,
      url: "/finance/credits",
    },
    actions: [
      { action: "view", title: "Voir détails" },
    ],
  });
}

export async function sendPaymentReminderPush(
  userId: string,
  dueDate: string,
  amount: number
) {
  return sendPushToUser(userId, {
    title: "Rappel d'échéance",
    body: `Votre échéance de ${amount.toLocaleString()} ${currencySymbol()} est prévue pour le ${dueDate}.`,
    icon: "/icons/payment-reminder.png",
    tag: `payment-reminder-${dueDate}`,
    data: {
      type: "payment_reminder",
      dueDate,
      amount,
      url: "/finance/credits",
    },
    requireInteraction: true,
  });
}

export async function sendTontineReminderPush(
  userId: string,
  tontineName: string,
  meetingDate: string,
  amount: number
) {
  return sendPushToUser(userId, {
    title: `Rappel Tontine: ${tontineName}`,
    body: `Réunion prévue le ${meetingDate}. Cotisation: ${amount.toLocaleString()} ${currencySymbol()}`,
    icon: "/icons/tontine.png",
    tag: `tontine-${tontineName}`,
    data: {
      type: "tontine_reminder",
      tontineName,
      meetingDate,
      amount,
      url: "/finance/tontines",
    },
  });
}

export async function sendNewMessagePush(
  userId: string,
  senderName: string,
  messagePreview: string
) {
  return sendPushToUser(userId, {
    title: `Message de ${senderName}`,
    body: messagePreview.length > 100 ? messagePreview.substring(0, 97) + "..." : messagePreview,
    icon: "/icons/message.png",
    tag: `message-${senderName}`,
    data: {
      type: "new_message",
      senderName,
      url: "/messages",
    },
    actions: [
      { action: "reply", title: "Répondre" },
      { action: "view", title: "Voir" },
    ],
  });
}
