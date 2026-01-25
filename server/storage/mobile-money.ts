/**
 * Mobile Money Storage Layer
 * Couche d'accès données pour les paiements Mobile Money
 */

import { db } from "../db";
import { paymentIntents, providerEvents, type PaymentIntent, type ProviderEvent, type InsertPaymentIntent, type InsertProviderEvent } from "@shared/schema";
import { eq, and, lt, sql, desc, or, isNull } from "drizzle-orm";
import type { PaymentIntentFilter } from "../services/mobile-money/types";

// ============================================
// PAYMENT INTENTS
// ============================================

/**
 * Crée un nouveau payment intent
 */
export async function createPaymentIntent(data: InsertPaymentIntent): Promise<PaymentIntent> {
  const [intent] = await db.insert(paymentIntents).values(data).returning();
  return intent;
}

/**
 * Récupère un payment intent par ID
 */
export async function getPaymentIntent(id: string): Promise<PaymentIntent | undefined> {
  const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, id));
  return intent;
}

/**
 * Récupère un payment intent par external reference (notre UUID)
 */
export async function getPaymentIntentByExternalRef(externalRef: string): Promise<PaymentIntent | undefined> {
  const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.externalRef, externalRef));
  return intent;
}

/**
 * Récupère un payment intent par provider reference
 */
export async function getPaymentIntentByProviderRef(
  provider: string,
  providerRef: string
): Promise<PaymentIntent | undefined> {
  const [intent] = await db
    .select()
    .from(paymentIntents)
    .where(
      and(
        eq(paymentIntents.provider, provider as "MTN" | "AIRTEL"),
        eq(paymentIntents.providerRef, providerRef)
      )
    );
  return intent;
}

/**
 * Récupère un payment intent par idempotency key
 */
export async function getPaymentIntentByIdempotencyKey(idempotencyKey: string): Promise<PaymentIntent | undefined> {
  const [intent] = await db
    .select()
    .from(paymentIntents)
    .where(eq(paymentIntents.idempotencyKey, idempotencyKey));
  return intent;
}

/**
 * Met à jour un payment intent
 */
export async function updatePaymentIntent(
  id: string,
  data: Partial<Omit<PaymentIntent, "id" | "createdAt">>
): Promise<PaymentIntent | undefined> {
  const [updated] = await db
    .update(paymentIntents)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(paymentIntents.id, id))
    .returning();
  return updated;
}

/**
 * Liste les payment intents avec filtres et pagination
 */
export async function listPaymentIntents(filter: PaymentIntentFilter): Promise<{
  data: PaymentIntent[];
  total: number;
}> {
  const { page = 1, limit = 20 } = filter;
  const offset = (page - 1) * limit;

  // Construire les conditions de filtre
  const conditions = [];

  if (filter.agenceId) {
    conditions.push(eq(paymentIntents.agenceId, filter.agenceId));
  }
  if (filter.status) {
    conditions.push(eq(paymentIntents.status, filter.status as any));
  }
  if (filter.provider) {
    conditions.push(eq(paymentIntents.provider, filter.provider as "MTN" | "AIRTEL"));
  }
  if (filter.type) {
    conditions.push(eq(paymentIntents.type, filter.type as "COLLECTION" | "PAYOUT"));
  }
  if (filter.clientId) {
    conditions.push(eq(paymentIntents.clientId, filter.clientId));
  }
  if (filter.from) {
    conditions.push(sql`${paymentIntents.createdAt} >= ${filter.from}`);
  }
  if (filter.to) {
    conditions.push(sql`${paymentIntents.createdAt} <= ${filter.to}`);
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Requête données
  const data = await db
    .select()
    .from(paymentIntents)
    .where(whereClause)
    .orderBy(desc(paymentIntents.createdAt))
    .limit(limit)
    .offset(offset);

  // Requête count
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(paymentIntents)
    .where(whereClause);

  return { data, total: count };
}

/**
 * Récupère les payment intents PENDING depuis plus de X minutes
 * Utilisé par le cron de réconciliation
 */
export async function getPendingIntentsOlderThan(minutes: number): Promise<PaymentIntent[]> {
  const threshold = new Date(Date.now() - minutes * 60 * 1000);

  return db
    .select()
    .from(paymentIntents)
    .where(
      and(
        eq(paymentIntents.status, "PENDING"),
        lt(paymentIntents.initiatedAt, threshold)
      )
    )
    .orderBy(paymentIntents.initiatedAt);
}

/**
 * Récupère les payment intents expirés
 */
export async function getExpiredIntents(): Promise<PaymentIntent[]> {
  const now = new Date();

  return db
    .select()
    .from(paymentIntents)
    .where(
      and(
        eq(paymentIntents.status, "PENDING"),
        lt(paymentIntents.expireAt, now)
      )
    );
}

/**
 * Récupère les payment intents PENDING pour un provider spécifique
 * Utilisé pour la réconciliation via API summary
 */
export async function getPendingIntentsByProvider(
  provider: "MTN" | "AIRTEL"
): Promise<PaymentIntent[]> {
  return db
    .select()
    .from(paymentIntents)
    .where(
      and(
        eq(paymentIntents.status, "PENDING"),
        eq(paymentIntents.provider, provider)
      )
    )
    .orderBy(paymentIntents.initiatedAt);
}

// ============================================
// PROVIDER EVENTS
// ============================================

/**
 * Crée un nouvel événement provider (log webhook)
 */
export async function createProviderEvent(data: InsertProviderEvent): Promise<ProviderEvent> {
  const [event] = await db.insert(providerEvents).values(data).returning();
  return event;
}

/**
 * Récupère un événement provider par ID
 */
export async function getProviderEvent(id: string): Promise<ProviderEvent | undefined> {
  const [event] = await db.select().from(providerEvents).where(eq(providerEvents.id, id));
  return event;
}

/**
 * Récupère les événements non traités
 */
export async function getUnprocessedEvents(): Promise<ProviderEvent[]> {
  return db
    .select()
    .from(providerEvents)
    .where(eq(providerEvents.processed, false))
    .orderBy(providerEvents.receivedAt);
}

/**
 * Marque un événement comme traité
 */
export async function markEventProcessed(
  id: string,
  paymentIntentId?: string,
  error?: string
): Promise<void> {
  await db
    .update(providerEvents)
    .set({
      processed: true,
      processedAt: new Date(),
      paymentIntentId,
      processingError: error,
    })
    .where(eq(providerEvents.id, id));
}

/**
 * Vérifie si un événement avec le même provider + providerRef existe déjà
 * Utilisé pour l'idempotence
 */
export async function eventExists(
  provider: string,
  providerRef: string,
  eventType: string
): Promise<boolean> {
  const [existing] = await db
    .select({ id: providerEvents.id })
    .from(providerEvents)
    .where(
      and(
        eq(providerEvents.provider, provider as "MTN" | "AIRTEL"),
        eq(providerEvents.providerRef, providerRef),
        eq(providerEvents.eventType, eventType),
        eq(providerEvents.processed, true)
      )
    )
    .limit(1);

  return !!existing;
}

/**
 * Récupère les événements pour un payment intent
 */
export async function getEventsForPaymentIntent(paymentIntentId: string): Promise<ProviderEvent[]> {
  return db
    .select()
    .from(providerEvents)
    .where(eq(providerEvents.paymentIntentId, paymentIntentId))
    .orderBy(desc(providerEvents.receivedAt));
}

// ============================================
// STATISTIQUES
// ============================================

/**
 * Statistiques des paiements par provider et statut
 */
export async function getPaymentStats(filter?: {
  agenceId?: string;
  from?: Date;
  to?: Date;
}): Promise<{
  provider: string;
  status: string;
  count: number;
  totalAmount: string;
}[]> {
  const conditions = [];

  if (filter?.agenceId) {
    conditions.push(eq(paymentIntents.agenceId, filter.agenceId));
  }
  if (filter?.from) {
    conditions.push(sql`${paymentIntents.createdAt} >= ${filter.from}`);
  }
  if (filter?.to) {
    conditions.push(sql`${paymentIntents.createdAt} <= ${filter.to}`);
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  return db
    .select({
      provider: paymentIntents.provider,
      status: paymentIntents.status,
      count: sql<number>`count(*)::int`,
      totalAmount: sql<string>`COALESCE(sum(${paymentIntents.amount}), 0)::text`,
    })
    .from(paymentIntents)
    .where(whereClause)
    .groupBy(paymentIntents.provider, paymentIntents.status);
}

export default {
  // Payment Intents
  createPaymentIntent,
  getPaymentIntent,
  getPaymentIntentByExternalRef,
  getPaymentIntentByProviderRef,
  getPaymentIntentByIdempotencyKey,
  updatePaymentIntent,
  listPaymentIntents,
  getPendingIntentsOlderThan,
  getExpiredIntents,
  getPendingIntentsByProvider,

  // Provider Events
  createProviderEvent,
  getProviderEvent,
  getUnprocessedEvents,
  markEventProcessed,
  eventExists,
  getEventsForPaymentIntent,

  // Stats
  getPaymentStats,
};
