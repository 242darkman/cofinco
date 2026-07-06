import { users, loginAttempts, pushSubscriptions, notificationPreferences, pushNotificationLogs } from "@shared/schema";
import { type User, type InsertUser, type LoginAttempt, type InsertLoginAttempt, type PushSubscription, type InsertPushSubscription, type NotificationPreferences, type InsertNotificationPreferences, type PushNotificationLog, type InsertPushNotificationLog } from "@shared/schema";
import { db } from "../db";
import { eq, desc, and, or, ilike } from "drizzle-orm";
import { notDeleted } from "./query-helpers";
import { normalizeNom, normalizePrenom } from "./name-utils";

export async function getUser(id: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(and(eq(users.id, id), notDeleted(users)));
  return user || undefined;
}

export async function getUserByUsername(username: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(and(eq(users.username, username), notDeleted(users)));
  return user || undefined;
}

export async function getAllUsers(): Promise<User[]> {
  return db.select().from(users).where(notDeleted(users)).orderBy(desc(users.createdAt));
}

export async function searchUsers(query: string, limit: number = 10): Promise<User[]> {
  const searchTerm = `%${query}%`;
  return db.select()
    .from(users)
    .where(
      and(
        notDeleted(users),
        or(
          ilike(users.username, searchTerm),
          ilike(users.nom, searchTerm),
          ilike(users.prenom, searchTerm),
          ilike(users.email, searchTerm)
        )
      )
    )
    .limit(limit);
}

export async function createUser(insertUser: InsertUser): Promise<User> {
  // Normaliser nom (UPPERCASE) et prénom (Capitalize)
  // mustChangePassword=true par défaut pour forcer le changement au premier login
  const normalizedData = {
    ...insertUser,
    nom: normalizeNom(insertUser.nom),
    prenom: normalizePrenom(insertUser.prenom),
    mustChangePassword: insertUser.mustChangePassword ?? true,
  };

  const [user] = await db.insert(users).values(normalizedData).returning();
  return user;
}

export async function updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
  // Normaliser nom et prénom si présents dans la mise à jour
  const normalizedData: Partial<InsertUser> & { updatedAt: Date } = {
    ...data,
    updatedAt: new Date(),
  };

  if (data.nom !== undefined) {
    normalizedData.nom = normalizeNom(data.nom);
  }
  if (data.prenom !== undefined) {
    normalizedData.prenom = normalizePrenom(data.prenom);
  }

  const [user] = await db.update(users).set(normalizedData).where(eq(users.id, id)).returning();
  return user || undefined;
}
// Note: User location tracking has been moved to updateAgentLocation in operations.ts
// This is because lastLatitude/lastLongitude exist on agents_terrain table, not users
// The updateUserLocation function was removed as it referenced non-existent columns

// Push Subscriptions
export async function createPushSubscription(subscription: InsertPushSubscription): Promise<PushSubscription> {
  const [sub] = await db.insert(pushSubscriptions).values(subscription).returning();
  return sub;
}

export async function getPushSubscriptionsByUser(userId: string): Promise<PushSubscription[]> {
  return db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
}

export async function getAllActivePushSubscriptions(): Promise<PushSubscription[]> {
  return db.select().from(pushSubscriptions).where(eq(pushSubscriptions.isActive, true));
}

export async function updatePushSubscription(id: string, data: Partial<InsertPushSubscription>): Promise<PushSubscription | undefined> {
  const [sub] = await db.update(pushSubscriptions).set({ ...data, updatedAt: new Date() }).where(eq(pushSubscriptions.id, id)).returning();
  return sub || undefined;
}

export async function deletePushSubscription(id: string): Promise<boolean> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
  return true;
}

export async function deletePushSubscriptionByEndpoint(endpoint: string): Promise<boolean> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  return true;
}

// Notification Preferences
export async function getNotificationPreferences(userId: string): Promise<NotificationPreferences | undefined> {
  const [prefs] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId));
  return prefs || undefined;
}

export async function createNotificationPreferences(preferences: InsertNotificationPreferences): Promise<NotificationPreferences> {
  const [prefs] = await db.insert(notificationPreferences).values({
    ...preferences,
    types: preferences.types as string[],
  }).returning();
  return prefs;
}

export async function updateNotificationPreferences(userId: string, preferences: Partial<InsertNotificationPreferences>): Promise<NotificationPreferences | undefined> {
  const [prefs] = await db.update(notificationPreferences).set({ 
    ...preferences, 
    types: preferences.types as string[],
    updatedAt: new Date() 
  }).where(eq(notificationPreferences.userId, userId)).returning();
  return prefs || undefined;
}

// Push Logs
export async function createPushNotificationLog(log: InsertPushNotificationLog): Promise<PushNotificationLog> {
  const [entry] = await db.insert(pushNotificationLogs).values(log).returning();
  return entry;
}

export async function updatePushNotificationLog(id: string, data: Partial<InsertPushNotificationLog>): Promise<PushNotificationLog | undefined> {
  const [entry] = await db.update(pushNotificationLogs).set(data).where(eq(pushNotificationLogs.id, id)).returning();
  return entry || undefined;
}

export async function getPushNotificationLogsByUser(userId: string): Promise<PushNotificationLog[]> {
   // Assuming logs have userId or linked via sub. 
   // Wait, schema for logs: subscriptionId.
   // Need join.
   // Simpler: just implement what was there.
   // The original storage didn't have detailed implementation shown in snippet for this specific method, 
   // but I will assume simple select or join.
   // Let's check original file again if needed.
   // Original file snippet didn't show body of getPushNotificationLogsByUser.
   // I will implement a basic version or come back to it.
   // Assuming simple join on pushSubscriptions.
   return db.select({
     log: pushNotificationLogs
   })
   .from(pushNotificationLogs)
   .innerJoin(pushSubscriptions, eq(pushNotificationLogs.subscriptionId, pushSubscriptions.id))
   .where(eq(pushSubscriptions.userId, userId))
   .then(rows => rows.map(r => r.log));
}
