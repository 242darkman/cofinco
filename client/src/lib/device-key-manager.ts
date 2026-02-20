/**
 * Device Key Manager
 *
 * Handles the lifecycle of ECDSA P-256 device keys for offline journal signing.
 * Called during login/initialization to ensure a valid signing key is available.
 *
 * Flow:
 * 1. Check if an active key exists in IndexedDB for this agent
 * 2. If yes, load it into memory (setActiveSigningKey)
 * 3. If no, generate a new key pair, store locally, register with server
 * 4. Check if rotation is needed (key expiring within 7 days)
 *
 * @module device-key-manager
 */

import {
  generateDeviceKeyPair,
  setActiveSigningKey,
  clearSigningKey,
} from './offline-crypto';
import {
  getActiveDeviceKey,
  storeDeviceKey,
  markKeyServerRegistered,
  needsKeyRotation,
  rotateDeviceKey,
} from './journal-service';
import { getOrCreateFingerprint } from './device-fingerprint';
import { isNetworkUsable } from './networkManager';

/**
 * Initialize the device signing key for the current agent.
 * This should be called after successful login or session restore.
 *
 * - If a valid key exists locally, loads it
 * - If no key exists, generates one and attempts server registration
 * - If key needs rotation, generates a new one
 */
export async function initializeDeviceKey(agentId: string): Promise<void> {
  const agentIdNum = parseInt(agentId, 10) || 0;

  // 1. Try to load existing active key
  const existingKey = await getActiveDeviceKey(agentId);

  if (existingKey) {
    // Load into memory
    setActiveSigningKey(existingKey.privateKey, existingKey.keyId);

    // Check if rotation needed
    const needsRotation = await needsKeyRotation(agentId);
    if (needsRotation && isNetworkUsable()) {
      // Rotate in background (non-blocking)
      performKeyRotation(agentId, existingKey.keyId).catch((err) => {
        console.warn('[DeviceKeyManager] Key rotation failed (will retry):', err);
      });
    }

    // Ensure key is registered with server (may have failed previously)
    if (!existingKey.publicKeyJwk) return;
    registerKeyWithServer(existingKey.keyId, existingKey.publicKeyJwk).catch(() => {});

    return;
  }

  // 2. No active key — generate a new one
  const { keyId, publicKeyJwk, keyPair } = await generateDeviceKeyPair();

  // Store in IndexedDB (private key stays in CryptoKey, non-extractable)
  await storeDeviceKey(keyId, publicKeyJwk, keyPair.privateKey, agentId);

  // Activate in memory
  setActiveSigningKey(keyPair.privateKey, keyId);

  // 3. Register public key with server (if online)
  if (isNetworkUsable()) {
    await registerKeyWithServer(keyId, publicKeyJwk);
  }
}

/**
 * Clean up device key state on logout.
 */
export function teardownDeviceKey(): void {
  clearSigningKey();
}

/**
 * Register a device public key with the server.
 */
async function registerKeyWithServer(
  keyId: string,
  publicKeyJwk: JsonWebKey
): Promise<void> {
  try {
    const { full: deviceFingerprint } = getOrCreateFingerprint();

    const response = await fetch('/api/sync/devices/register-key', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyId,
        publicKeyJwk,
        deviceFingerprint,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });

    if (response.ok) {
      await markKeyServerRegistered(keyId);
      if (import.meta.env.DEV) console.log('[DeviceKeyManager] Key registered with server:', keyId.slice(0, 12) + '...');
    } else {
      console.warn('[DeviceKeyManager] Server key registration failed:', response.status);
    }
  } catch (err) {
    console.warn('[DeviceKeyManager] Server key registration error (will retry on next sync):', err);
  }
}

/**
 * Rotate the active key: generate new, mark old as rotated.
 */
async function performKeyRotation(agentId: string, oldKeyId: string): Promise<void> {
  const { keyId: newKeyId, publicKeyJwk, keyPair } = await generateDeviceKeyPair();

  await rotateDeviceKey(oldKeyId, newKeyId, publicKeyJwk, keyPair.privateKey, agentId);

  // Activate new key
  setActiveSigningKey(keyPair.privateKey, newKeyId);

  // Register new key with server
  await registerKeyWithServer(newKeyId, publicKeyJwk);

  if (import.meta.env.DEV) console.log('[DeviceKeyManager] Key rotated:', oldKeyId.slice(0, 12) + '... → ' + newKeyId.slice(0, 12) + '...');
}
