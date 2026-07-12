import { Router } from "express";
import { z } from "zod";
import { db } from "../../db";
import { createLogger } from "../../lib/logger";
import { deviceKeys } from "@shared/schema/device-keys";
import { eq } from "drizzle-orm";
import { requireAuth } from "../../auth";

const logger = createLogger('Routes:SyncJournal:Devices');

export const devicesRouter = Router();

const registerKeySchema = z.object({
  keyId: z.string().min(1),
  publicKeyJwk: z.record(z.unknown()),
  deviceFingerprint: z.string().min(1),
  expiresAt: z.string().datetime().optional(),
});

const revokeKeySchema = z.object({
  keyId: z.string().min(1),
  reason: z.string().min(1),
});

devicesRouter.post('/register-key', requireAuth, async (req, res) => {
  try {
    const data = registerKeySchema.parse(req.body);
    const agentId = req.user!.id;

    // Check if key already registered
    const [existing] = await db
      .select()
      .from(deviceKeys)
      .where(eq(deviceKeys.id, data.keyId));

    if (existing) {
      return res.json({ status: 'already_registered', keyId: data.keyId });
    }

    await db.insert(deviceKeys).values({
      id: data.keyId,
      agentId,
      deviceFingerprint: data.deviceFingerprint,
      publicKeyJwk: data.publicKeyJwk,
      status: 'active',
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
    });

    logger.info(`Device key registered: ${data.keyId} for agent ${agentId}`);

    res.json({ status: 'registered', keyId: data.keyId });
  } catch (error: any) {
    logger.error('Key registration error:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid key data', details: error.errors });
    }
    res.status(500).json({ error: 'Key registration failed' });
  }
});

devicesRouter.post('/revoke-key', requireAuth, async (req, res) => {
  try {
    const data = revokeKeySchema.parse(req.body);
    const requesterId = req.user!.id;

    // Only admins/supervisors can revoke keys
    const requesterRole = req.user!.role;
    const allowedRoles = ['ADMIN', 'CHEF_AGENCE', 'SUPERVISEUR'];
    if (!allowedRoles.includes(requesterRole)) {
      return res.status(403).json({ error: 'Insufficient permissions to revoke device keys' });
    }

    const [key] = await db
      .select()
      .from(deviceKeys)
      .where(eq(deviceKeys.id, data.keyId));

    if (!key) {
      return res.status(404).json({ error: 'Key not found' });
    }

    if (key.status === 'revoked') {
      return res.json({ status: 'already_revoked', keyId: data.keyId });
    }

    await db
      .update(deviceKeys)
      .set({
        status: 'revoked',
        revokedAt: new Date(),
        revokeReason: data.reason,
      })
      .where(eq(deviceKeys.id, data.keyId));

    logger.warn(`Device key revoked: ${data.keyId}, reason: ${data.reason}, by: ${requesterId}`);

    res.json({ status: 'revoked', keyId: data.keyId });
  } catch (error: any) {
    logger.error('Key revocation error:', error);
    res.status(500).json({ error: 'Key revocation failed' });
  }
});
