import { db, pool } from "../db";
import { evenementsOutbox } from "@shared/schema";
import { eq, isNull, asc, sql } from "drizzle-orm";
import { getWsInstance } from "../ws-server";
import { createLogger } from "../lib/logger";
import { markKpiDirtyForDates } from "./kpi/kpi-refresh-worker";
import type pg from "pg";

const logger = createLogger('Outbox');

let isRunning = false;
let pollInterval: NodeJS.Timeout | null = null;
let listenClient: pg.PoolClient | null = null;
const POLL_INTERVAL_MS = 5000; // Reduced polling frequency (NOTIFY handles immediate dispatch)
const MAX_EVENTS_PER_BATCH = 50;
const MAX_RETRIES = 5;
const NOTIFY_CHANNEL = 'outbox_events';

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
    // Dates d'opération des événements publiés : une opération antidatée
    // (rejeu offline) invalide le snapshot KPI de SA période
    const kpiDirtyDates: Array<Date | string | undefined> = [];

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
        const payloadDate = (event.payload as Record<string, unknown> | null)?.['dateOperation'];
        kpiDirtyDates.push(
          typeof payloadDate === 'string' || payloadDate instanceof Date
            ? payloadDate
            : event.createdAt ?? undefined,
        );
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
          logger.error({ eventId: event.id, error: error.message }, 'Event failed permanently');
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
      logger.info({ count: publishedCount }, 'Published events');
      // Marquage dirty par période concernée : la date d'opération de chaque
      // événement détermine le snapshot à recalculer (le worker KPI debounce).
      markKpiDirtyForDates(kpiDirtyDates);
    }

    return publishedCount;
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error processing events');
    return 0;
  }
}

/**
 * Start the outbox worker with NOTIFY/LISTEN + polling fallback.
 *
 * NOTIFY/LISTEN provides instant event processing (~0ms latency).
 * Polling runs as a fallback in case LISTEN misses an event (connection drops).
 */
export function startOutboxWorker(): void {
  if (isRunning) {
    logger.debug('Worker already running');
    return;
  }

  isRunning = true;
  logger.info('Worker started (NOTIFY/LISTEN + polling fallback)');

  // Initial run
  processOutboxEvents();

  // Set up NOTIFY/LISTEN for instant event processing
  setupNotifyListener().catch((err) => {
    logger.warn({ error: err.message }, 'NOTIFY/LISTEN setup failed, using polling only');
  });

  // Set up polling as fallback (reduced frequency since NOTIFY handles most cases)
  pollInterval = setInterval(async () => {
    if (isRunning) {
      await processOutboxEvents();
    }
  }, POLL_INTERVAL_MS);
}

/**
 * Set up PostgreSQL LISTEN on the outbox channel.
 * When a NOTIFY is received, immediately process pending events.
 */
async function setupNotifyListener(): Promise<void> {
  try {
    listenClient = await pool.connect();

    listenClient.on('notification', async (msg) => {
      if (msg.channel === NOTIFY_CHANNEL && isRunning) {
        // Process events immediately on notification
        await processOutboxEvents();
      }
    });

    listenClient.on('error', (err) => {
      logger.warn({ error: err.message }, 'LISTEN client error, reconnecting...');
      cleanupListenClient();
      // Reconnect after a short delay
      setTimeout(() => {
        if (isRunning) {
          setupNotifyListener().catch(() => {});
        }
      }, 2000);
    });

    await listenClient.query(`LISTEN ${NOTIFY_CHANNEL}`);
    logger.info(`Listening on channel "${NOTIFY_CHANNEL}" for instant event dispatch`);
  } catch (err: any) {
    cleanupListenClient();
    throw err;
  }
}

function cleanupListenClient(): void {
  if (listenClient) {
    try {
      listenClient.release();
    } catch {
      // Ignore release errors
    }
    listenClient = null;
  }
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

  cleanupListenClient();

  logger.info('Worker stopped');
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
