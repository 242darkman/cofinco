import { Router } from "express";
import { db } from "../../db";
import { createLogger } from "../../lib/logger";
import { offlineJournalEntries } from "@shared/schema/device-keys";
import { eq, and, gte } from "drizzle-orm";
import { requireAuth } from "../../auth";

const logger = createLogger('Routes:SyncJournal:Pull');

export const pullRouter = Router();

pullRouter.get('/pull', requireAuth, async (req, res) => {
  try {
    const agentId = req.user!.id;
    const since = req.query.since ? new Date(req.query.since as string) : new Date(0);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    // Get confirmed entries that the client might not have
    const confirmedEntries = await db
      .select({
        id: offlineJournalEntries.id,
        serverSequence: offlineJournalEntries.serverSequence,
        serverTimestamp: offlineJournalEntries.serverTimestamp,
        status: offlineJournalEntries.status,
        rejectReason: offlineJournalEntries.rejectReason,
      })
      .from(offlineJournalEntries)
      .where(and(
        eq(offlineJournalEntries.agentId, agentId),
        gte(offlineJournalEntries.serverTimestamp, since)
      ))
      .orderBy(offlineJournalEntries.serverTimestamp)
      .limit(limit);

    res.json({
      entries: confirmedEntries,
      serverTime: Date.now(),
      hasMore: confirmedEntries.length === limit,
    });
  } catch (error) {
    logger.error({ err: error }, 'Pull sync error');
    res.status(500).json({ error: 'Pull sync failed' });
  }
});
