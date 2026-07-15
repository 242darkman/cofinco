import { Router } from "express";
import { z } from "zod";
import { db } from "../../db";
import { createLogger } from "../../lib/logger";
import { deviceKeys, offlineJournalEntries } from "@shared/schema/device-keys";
import { eq, and, desc } from "drizzle-orm";
import { signLimits } from "../../services/sync-journal/crypto-utils";
import { OFFLINE_LIMITS } from "../../services/sync-journal/offline-limits";
import { recordDeviceSyncState } from "../../services/sync-journal/sync-state";
import { requireAuth } from "../../auth";

const logger = createLogger('Routes:SyncJournal:Handshake');

export const handshakeRouter = Router();

const handshakeSchema = z.object({
  deviceId: z.string().min(1),
  deviceKeyId: z.string().min(1),
  lastConfirmedSequence: z.number().int().min(0),
  chainHeadHash: z.string(),
  pendingCount: z.number().int().min(0),
  clientVersion: z.string().optional(),
});

handshakeRouter.post('/handshake', requireAuth, async (req, res) => {
  try {
    const data = handshakeSchema.parse(req.body);
    const agentId = req.user!.id;

    // Verify device key exists and is active
    const [deviceKey] = await db
      .select()
      .from(deviceKeys)
      .where(and(
        eq(deviceKeys.id, data.deviceKeyId),
        eq(deviceKeys.agentId, agentId)
      ));

    if (!deviceKey) {
      return res.status(401).json({ error: 'Unknown device key. Please re-register.' });
    }

    if (deviceKey.status === 'revoked') {
      return res.status(403).json({ error: 'Device key has been revoked.', revokedAt: deviceKey.revokedAt });
    }

    // Get last confirmed server sequence for this device
    const [lastConfirmed] = await db
      .select()
      .from(offlineJournalEntries)
      .where(and(
        eq(offlineJournalEntries.agentId, agentId),
        eq(offlineJournalEntries.deviceId, data.deviceId),
        eq(offlineJournalEntries.status, 'confirmed')
      ))
      .orderBy(desc(offlineJournalEntries.serverTimestamp))
      .limit(1);

    // Compteur d'opérations en attente déclaré par l'appareil (best effort,
    // alimente l'indicateur « données incomplètes » de l'écran KPI)
    await recordDeviceSyncState({
      deviceId: data.deviceId,
      agentId,
      agenceId: req.user?.agenceId ?? null,
      pendingCount: data.pendingCount,
      event: 'handshake',
    });

    // Get all revoked keys for this agent (client needs to know)
    const revokedKeys = await db
      .select({ id: deviceKeys.id, revokedAt: deviceKeys.revokedAt })
      .from(deviceKeys)
      .where(and(
        eq(deviceKeys.agentId, agentId),
        eq(deviceKeys.status, 'revoked')
      ));

    // Limites offline — source de vérité : services/sync-journal/offline-limits
    // (les mêmes valeurs sont appliquées côté serveur au rejeu du journal)
    const offlineLimits = {
      ...OFFLINE_LIMITS,
      allowedOperationTypes: [...OFFLINE_LIMITS.allowedOperationTypes],
      lastUpdated: Date.now(),
    };

    // Signature HMAC serveur : opaque pour le client (qui n'a pas le secret),
    // elle permet au serveur de reconnaître ses propres limites en audit.
    const limitsSignature = signLimits(offlineLimits);

    res.json({
      serverTime: Date.now(),
      serverHeadSequence: lastConfirmed?.serverSequence || '0',
      revokedKeys: revokedKeys.map(k => ({ id: k.id, revokedAt: k.revokedAt })),
      offlineLimits: { ...offlineLimits, serverSignature: limitsSignature },
      keyStatus: deviceKey.status,
      keyExpiresAt: deviceKey.expiresAt,
    });
  } catch (error: any) {
    logger.error('Handshake error:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid handshake data', details: error.errors });
    }
    res.status(500).json({ error: 'Handshake failed' });
  }
});
