import { db } from "../db";
import { evenementsOutbox } from "@shared/schema";
import { eq, isNull, asc, sql } from "drizzle-orm";
import { getWsInstance } from "../ws-server";

let isRunning = false;
let pollInterval: NodeJS.Timeout | null = null;
const POLL_INTERVAL_MS = 500; // Poll every 500ms
const MAX_EVENTS_PER_BATCH = 50;
const MAX_RETRIES = 5;

export interface OutboxEvent {
  id: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: any;
  createdAt: Date;
  tentative: number;
}

/**
 * Process unpublished events from the outbox
 */
async function processOutboxEvents(): Promise<number> {
  try {
    // 1. Select unpublished events (ordered by creation date)
    const events = await db.select()
      .from(evenementsOutbox)
      .where(isNull(evenementsOutbox.publishedAt))
      .orderBy(asc(evenementsOutbox.createdAt))
      .limit(MAX_EVENTS_PER_BATCH);

    if (events.length === 0) {
      return 0;
    }

    const wsInstance = getWsInstance();
    let publishedCount = 0;

    for (const event of events) {
      try {
        // 2. Mark as published FIRST (ensures DB consistency before broadcast)
        // This prevents the race condition where we broadcast but fail to mark as published
        const [updated] = await db.update(evenementsOutbox)
          .set({ publishedAt: new Date() })
          .where(eq(evenementsOutbox.id, event.id))
          .returning();

        if (!updated) {
          // Event was likely already processed by another worker instance
          continue;
        }

        // 3. Then broadcast to WebSocket (after DB confirm)
        if (wsInstance) {
          // Build the channel name: {aggregateType}:{aggregateId}
          const channel = `${event.aggregateType}:${event.aggregateId}`;

          wsInstance.broadcast({
            type: "REALTIME_EVENT" as any,
            payload: {
              channel,
              eventType: event.type,
              aggregateType: event.aggregateType,
              aggregateId: event.aggregateId,
              data: event.payload,
              timestamp: event.createdAt,
            }
          });
        }

        publishedCount++;
      } catch (error: any) {
        // Increment retry counter and record error
        const newTentative = (event.tentative || 0) + 1;
        
        if (newTentative >= MAX_RETRIES) {
          // Mark as failed permanently by setting error
          await db.update(evenementsOutbox)
            .set({ 
              tentative: newTentative,
              erreur: `Max retries exceeded: ${error.message}`
            })
            .where(eq(evenementsOutbox.id, event.id));
          console.error(`[Outbox] Event ${event.id} failed permanently:`, error.message);
        } else {
          await db.update(evenementsOutbox)
            .set({ 
              tentative: newTentative,
              erreur: error.message
            })
            .where(eq(evenementsOutbox.id, event.id));
        }
      }
    }

    if (publishedCount > 0) {
      console.log(`[Outbox] Published ${publishedCount} events`);
    }

    return publishedCount;
  } catch (error: any) {
    console.error("[Outbox] Error processing events:", error.message);
    return 0;
  }
}

/**
 * Start the outbox worker
 */
export function startOutboxWorker(): void {
  if (isRunning) {
    console.log("[Outbox] Worker already running");
    return;
  }

  isRunning = true;
  console.log("[Outbox] Worker started");

  // Initial run
  processOutboxEvents();

  // Set up polling
  pollInterval = setInterval(async () => {
    if (isRunning) {
      await processOutboxEvents();
    }
  }, POLL_INTERVAL_MS);
}

/**
 * Stop the outbox worker
 */
export function stopOutboxWorker(): void {
  if (!isRunning) {
    return;
  }

  isRunning = false;
  
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  console.log("[Outbox] Worker stopped");
}

/**
 * Get worker status
 */
export function isOutboxWorkerRunning(): boolean {
  return isRunning;
}

/**
 * Get count of pending events
 */
export async function getPendingEventsCount(): Promise<number> {
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(evenementsOutbox)
    .where(isNull(evenementsOutbox.publishedAt));
  return Number(result[0]?.count || 0);
}

/**
 * Get count of failed events
 */
export async function getFailedEventsCount(): Promise<number> {
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(evenementsOutbox)
    .where(
      sql`${evenementsOutbox.publishedAt} IS NULL AND ${evenementsOutbox.tentative} >= ${MAX_RETRIES}`
    );
  return Number(result[0]?.count || 0);
}

/**
 * Retry failed events (reset tentative counter)
 */
export async function retryFailedEvents(): Promise<number> {
  const result = await db.update(evenementsOutbox)
    .set({ tentative: 0, erreur: null })
    .where(
      sql`${evenementsOutbox.publishedAt} IS NULL AND ${evenementsOutbox.tentative} >= ${MAX_RETRIES}`
    )
    .returning();
  
  return result.length;
}

export default {
  startOutboxWorker,
  stopOutboxWorker,
  isOutboxWorkerRunning,
  getPendingEventsCount,
  getFailedEventsCount,
  retryFailedEvents,
};
