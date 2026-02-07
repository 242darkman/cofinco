import { db } from "@/db";
import { notifications } from "@shared/schema/notifications";
import { users } from "@shared/schema/auth";
import { eq, and, desc, isNull, or, gte } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { realtimeService } from "./realtime-service";
import webpush from "web-push";
import { Redis } from "ioredis";

// Configure web-push
webpush.setVapidDetails(
  "mailto:" + (process.env.VAPID_EMAIL || "admin@cofinco.com"),
  process.env.VAPID_PUBLIC_KEY || "",
  process.env.VAPID_PRIVATE_KEY || ""
);

export interface CreateNotificationData {
  userId: string;
  type: string;
  title: string;
  message: string;
  priority?: "low" | "medium" | "high" | "urgent";
  data?: Record<string, any>;
  expiresAt?: Date;
  actionUrl?: string;
  category?: string;
}

export interface NotificationPreferences {
  push: boolean;
  email: boolean;
  sms: boolean;
  inApp: boolean;
  quietHours?: {
    enabled: boolean;
    start: string; // HH:mm format
    end: string; // HH:mm format
  };
}

export class NotificationService {
  private redis: Redis;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
      password: process.env.REDIS_PASSWORD,
    });
  }

  /**
   * Create and send a notification
   */
  async createNotification(data: CreateNotificationData) {
    try {
      // Check user preferences
      const preferences = await this.getUserPreferences(data.userId);
      
      // Check quiet hours
      if (this.isInQuietHours(preferences)) {
        // Queue for later delivery
        await this.queueNotification(data);
        return;
      }

      // Save to database
      const [notification] = await db
        .insert(notifications)
        .values({
          userId: data.userId,
          type: data.type,
          title: data.title,
          message: data.message,
          priority: data.priority || "medium",
          data: data.data,
          expiresAt: data.expiresAt,
          actionUrl: data.actionUrl,
          category: data.category,
          status: "pending",
          createdAt: new Date(),
        })
        .returning();

      // Send via different channels based on preferences
      const sendPromises = [];

      if (preferences.inApp) {
        sendPromises.push(this.sendInAppNotification(notification));
      }

      if (preferences.push) {
        sendPromises.push(this.sendPushNotification(notification));
      }

      if (preferences.email) {
        sendPromises.push(this.queueEmailNotification(notification));
      }

      if (preferences.sms && data.priority === "urgent") {
        sendPromises.push(this.queueSMSNotification(notification));
      }

      await Promise.allSettled(sendPromises);

      // Mark as sent
      await db
        .update(notifications)
        .set({ 
          status: "sent",
          sentAt: new Date(),
        })
        .where(eq(notifications.id, notification.id));

      logger.info(`Notification created and sent for user ${data.userId}`);

      return notification;
    } catch (error) {
      logger.error("Failed to create notification:", error);
      throw error;
    }
  }

  /**
   * Send in-app notification via WebSocket
   */
  private async sendInAppNotification(notification: any) {
    try {
      await realtimeService.sendToUser(notification.userId, {
        type: "NOTIFICATION",
        notification: {
          id: notification.id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          priority: notification.priority,
          data: notification.data,
          actionUrl: notification.actionUrl,
          createdAt: notification.createdAt,
        },
      });
    } catch (error) {
      logger.error("Failed to send in-app notification:", error);
    }
  }

  /**
   * Send push notification to user devices
   */
  private async sendPushNotification(notification: any) {
    try {
      // Get user's push subscriptions
      const subscriptions = await this.getUserPushSubscriptions(notification.userId);

      const payload = JSON.stringify({
        title: notification.title,
        body: notification.message,
        icon: "/icon-192x192.png",
        badge: "/badge-72x72.png",
        tag: notification.type,
        data: {
          notificationId: notification.id,
          actionUrl: notification.actionUrl,
          ...notification.data,
        },
        actions: this.getNotificationActions(notification.type),
        requireInteraction: notification.priority === "urgent",
      });

      const sendPromises = subscriptions.map(async (subscription: any) => {
        try {
          await webpush.sendNotification(subscription, payload);
        } catch (error: any) {
          // Remove invalid subscriptions
          if (error.statusCode === 410) {
            await this.removePushSubscription(subscription.endpoint);
          }
          throw error;
        }
      });

      await Promise.allSettled(sendPromises);
    } catch (error) {
      logger.error("Failed to send push notification:", error);
    }
  }

  /**
   * Queue email notification for background processing
   */
  private async queueEmailNotification(notification: any) {
    try {
      await this.redis.lpush(
        "email_queue",
        JSON.stringify({
          notificationId: notification.id,
          userId: notification.userId,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data,
        })
      );
    } catch (error) {
      logger.error("Failed to queue email notification:", error);
    }
  }

  /**
   * Queue SMS notification for background processing
   */
  private async queueSMSNotification(notification: any) {
    try {
      await this.redis.lpush(
        "sms_queue",
        JSON.stringify({
          notificationId: notification.id,
          userId: notification.userId,
          message: notification.message,
          priority: notification.priority,
        })
      );
    } catch (error) {
      logger.error("Failed to queue SMS notification:", error);
    }
  }

  /**
   * Get user notification preferences
   */
  private async getUserPreferences(userId: string): Promise<NotificationPreferences> {
    try {
      const cacheKey = `notif_prefs:${userId}`;
      const cached = await this.redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }

      // Get from database
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const preferences = user?.notificationPreferences || {
        push: true,
        email: true,
        sms: false,
        inApp: true,
      };

      // Cache for 1 hour
      await this.redis.setex(cacheKey, 3600, JSON.stringify(preferences));

      return preferences as NotificationPreferences;
    } catch (error) {
      logger.error("Failed to get user preferences:", error);
      // Return default preferences
      return {
        push: true,
        email: true,
        sms: false,
        inApp: true,
      };
    }
  }

  /**
   * Check if current time is in user's quiet hours
   */
  private isInQuietHours(preferences: NotificationPreferences): boolean {
    if (!preferences.quietHours?.enabled) {
      return false;
    }

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    
    const { start, end } = preferences.quietHours;
    
    if (start <= end) {
      // Normal case: quiet hours don't cross midnight
      return currentTime >= start && currentTime <= end;
    } else {
      // Quiet hours cross midnight
      return currentTime >= start || currentTime <= end;
    }
  }

  /**
   * Queue notification for later delivery
   */
  private async queueNotification(data: CreateNotificationData) {
    try {
      const deliveryTime = this.calculateDeliveryTime(await this.getUserPreferences(data.userId));
      
      await this.redis.zadd(
        "delayed_notifications",
        deliveryTime.getTime(),
        JSON.stringify(data)
      );
    } catch (error) {
      logger.error("Failed to queue notification:", error);
    }
  }

  /**
   * Calculate next delivery time outside quiet hours
   */
  private calculateDeliveryTime(preferences: NotificationPreferences): Date {
    if (!preferences.quietHours?.enabled) {
      return new Date();
    }

    const now = new Date();
    const endTime = preferences.quietHours.end;
    const [hours, minutes] = endTime.split(":").map(Number);
    
    const deliveryTime = new Date();
    deliveryTime.setHours(hours, minutes, 0, 0);
    
    // If delivery time is in the past, add one day
    if (deliveryTime <= now) {
      deliveryTime.setDate(deliveryTime.getDate() + 1);
    }
    
    return deliveryTime;
  }

  /**
   * Get user's push subscriptions
   */
  private async getUserPushSubscriptions(userId: string): Promise<any[]> {
    try {
      // TODO: Implement push subscription storage
      return [];
    } catch (error) {
      logger.error("Failed to get push subscriptions:", error);
      return [];
    }
  }

  /**
   * Remove invalid push subscription
   */
  private async removePushSubscription(endpoint: string) {
    try {
      // TODO: Implement push subscription removal
    } catch (error) {
      logger.error("Failed to remove push subscription:", error);
    }
  }

  /**
   * Get notification actions based on type
   */
  private getNotificationActions(type: string): any[] {
    switch (type) {
      case "INVESTIGATION_ASSIGNED":
        return [
          { action: "view", title: "Voir détails" },
          { action: "start", title: "Commencer" },
        ];
      case "ACTIVITY_OVERDUE":
        return [
          { action: "view", title: "Voir" },
          { action: "complete", title: "Marquer comme fait" },
        ];
      default:
        return [
          { action: "view", title: "Voir" },
        ];
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string) {
    try {
      await db
        .update(notifications)
        .set({
          status: "read",
          readAt: new Date(),
        })
        .where(
          and(
            eq(notifications.id, notificationId),
            eq(notifications.userId, userId)
          )
        );

      // Update unread count in real-time
      const unreadCount = await this.getUnreadCount(userId);
      
      await realtimeService.sendToUser(userId, {
        type: "NOTIFICATION_READ",
        notificationId,
        unreadCount,
      });
    } catch (error) {
      logger.error("Failed to mark notification as read:", error);
      throw error;
    }
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      const [result] = await db
        .select({ count: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, userId),
            eq(notifications.status, "sent"),
            or(
              isNull(notifications.expiresAt),
              gte(notifications.expiresAt, new Date())
            )
          )
        );

      return result?.count || 0;
    } catch (error) {
      logger.error("Failed to get unread count:", error);
      return 0;
    }
  }

  /**
   * Get user notifications
   */
  async getUserNotifications(
    userId: string,
    limit: number = 20,
    offset: number = 0
  ) {
    try {
      const results = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, userId),
            or(
              isNull(notifications.expiresAt),
              gte(notifications.expiresAt, new Date())
            )
          )
        )
        .orderBy(desc(notifications.createdAt))
        .limit(limit)
        .offset(offset);

      return results;
    } catch (error) {
      logger.error("Failed to get user notifications:", error);
      throw error;
    }
  }

  /**
   * Delete expired notifications
   */
  async cleanupExpiredNotifications() {
    try {
      const deleted = await db
        .delete(notifications)
        .where(
          and(
            notifications.expiresAt !== null,
            notifications.expiresAt < new Date()
          )
        );

      logger.info(`Cleaned up ${deleted} expired notifications`);
    } catch (error) {
      logger.error("Failed to cleanup expired notifications:", error);
    }
  }

  /**
   * Process delayed notifications
   */
  async processDelayedNotifications() {
    try {
      const now = Date.now();
      const notifications = await this.redis.zrangebyscore(
        "delayed_notifications",
        0,
        now
      );

      for (const notificationData of notifications) {
        try {
          const data = JSON.parse(notificationData);
          await this.createNotification(data);
          await this.redis.zrem("delayed_notifications", notificationData);
        } catch (error) {
          logger.error("Failed to process delayed notification:", error);
        }
      }
    } catch (error) {
      logger.error("Failed to process delayed notifications:", error);
    }
  }
}

export const notificationService = new NotificationService();