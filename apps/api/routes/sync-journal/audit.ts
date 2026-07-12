import { Router } from "express";
import { db } from "../../db";
import { createLogger } from "../../lib/logger";
import { deviceKeys, offlineJournalEntries, offlineDaySessions } from "@shared/schema/device-keys";
import { eq, and } from "drizzle-orm";
import { OfflineAnomalyDetector } from "../../services/offline-anomaly-detector";
import { computeEntryHash, verifyEcdsaSignature } from "../../services/sync-journal/crypto-utils";
import { requireAuth } from "../../auth";

const logger = createLogger('Routes:SyncJournal:Audit');

export const auditRouter = Router();

auditRouter.get('/audit/offline-day', requireAuth, async (req, res) => {
  try {
    const agentId = req.query.agentId as string;
    const date = req.query.date as string;

    if (!agentId || !date) {
      return res.status(400).json({ error: 'agentId and date are required' });
    }

    // Only admins/supervisors can access audit data
    const requesterRole = req.user!.role;
    const allowedRoles = ['ADMIN', 'CHEF_AGENCE', 'SUPERVISEUR', 'COMPTABLE'];
    if (!allowedRoles.includes(requesterRole)) {
      return res.status(403).json({ error: 'Insufficient permissions for audit access' });
    }

    // Get the day session
    const [session] = await db
      .select()
      .from(offlineDaySessions)
      .where(and(
        eq(offlineDaySessions.agentId, agentId),
        eq(offlineDaySessions.date, date)
      ));

    // Get all journal entries for that day
    const entries = await db
      .select()
      .from(offlineJournalEntries)
      .where(and(
        eq(offlineJournalEntries.agentId, agentId),
        eq(offlineJournalEntries.offlineSessionDate, date)
      ))
      .orderBy(offlineJournalEntries.clientTimestamp);

    // Verify chain integrity across the day's entries
    let chainValid = true;
    let allSignaturesValid = true;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      // Verify hash
      const expectedHash = computeEntryHash(
        parseInt(entry.clientSequence),
        entry.id,
        entry.eventType,
        entry.payloadHash,
        entry.previousHash,
        entry.clientTimestamp.getTime()
      );

      if (expectedHash !== entry.entryHash) {
        chainValid = false;
        break;
      }

      // Verify chain link
      if (i > 0 && entry.previousHash !== entries[i - 1].entryHash) {
        chainValid = false;
        break;
      }

      // Verify signature
      const [key] = await db
        .select()
        .from(deviceKeys)
        .where(eq(deviceKeys.id, entry.deviceKeyId));

      if (key) {
        const sigValid = await verifyEcdsaSignature(
          entry.entryHash,
          entry.signature,
          key.publicKeyJwk as JsonWebKey
        );
        if (!sigValid) {
          allSignaturesValid = false;
        }
      }
    }

    // Run anomaly detection on the day's entries
    const anomalies = await OfflineAnomalyDetector.analyzeDay(entries, agentId);

    res.json({
      session: session || null,
      journal: entries.map(e => ({
        sequence: e.clientSequence,
        type: e.eventType,
        timestamp: e.clientTimestamp,
        serverTimestamp: e.serverTimestamp,
        hash: e.entryHash,
        signature: e.signature,
        status: e.status,
        payload: e.payload,
        operationRef: e.operationRef,
        metadata: e.metadata,
      })),
      chainValid,
      allSignaturesValid,
      reconciledStatus: session?.status || 'not_found',
      entryCount: entries.length,
      anomalies,
    });
  } catch (error) {
    logger.error({ err: error }, 'Audit offline-day error');
    res.status(500).json({ error: 'Audit reconstruction failed' });
  }
});
