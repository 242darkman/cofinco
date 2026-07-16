/**
 * Limitation de débit des messages WebSocket, par utilisateur.
 *
 * Extrait de `ws-server.ts` : concern isolé et testable (fenêtre glissante,
 * seuil d'avertissement, purge périodique des compteurs). Le serveur importe
 * `checkRateLimit` et `RATE_LIMIT_WINDOW_MS` ; l'état reste privé à ce module.
 */

import { createLogger } from "../lib/logger";

const logger = createLogger("WebSocket:RateLimit");

/** Fenêtre de comptage (ms). */
export const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
/** Nombre maximal de messages autorisés par fenêtre. */
export const RATE_LIMIT_MAX_MESSAGES = 100;
/** Seuil (en nombre de messages) déclenchant un avertissement unique. */
export const RATE_LIMIT_WARNING_THRESHOLD = 80;

/** État de limitation par utilisateur (fenêtre courante). */
const rateLimiters = new Map<string, { count: number; windowStart: number; warned: boolean }>();

/** Résultat d'une vérification de débit. */
export interface RateLimitResult {
  /** Le message est-il autorisé (sous le plafond) ? */
  allowed: boolean;
  /** Messages restants avant le plafond dans la fenêtre courante. */
  remaining: number;
  /** Faut-il émettre l'avertissement (franchissement du seuil, une seule fois) ? */
  warn: boolean;
}

/**
 * Comptabilise un message pour `userId` et indique s'il est autorisé.
 * Ouvre une nouvelle fenêtre si la précédente est expirée.
 */
export function checkRateLimit(userId: string): RateLimitResult {
  const now = Date.now();
  let limiter = rateLimiters.get(userId);

  if (!limiter || now - limiter.windowStart > RATE_LIMIT_WINDOW_MS) {
    // Démarre une nouvelle fenêtre de comptage.
    limiter = { count: 0, windowStart: now, warned: false };
    rateLimiters.set(userId, limiter);
  }

  limiter.count++;

  const remaining = RATE_LIMIT_MAX_MESSAGES - limiter.count;
  const warn = limiter.count >= RATE_LIMIT_WARNING_THRESHOLD && !limiter.warned;

  if (warn) {
    limiter.warned = true;
  }

  return {
    allowed: limiter.count <= RATE_LIMIT_MAX_MESSAGES,
    remaining: Math.max(0, remaining),
    warn,
  };
}

// Purge périodique des compteurs inactifs (deux fenêtres sans activité).
setInterval(() => {
  const now = Date.now();
  rateLimiters.forEach((limiter, userId) => {
    if (now - limiter.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimiters.delete(userId);
    }
  });
}, RATE_LIMIT_WINDOW_MS);

// Trace discrète au démarrage du module (utile au diagnostic).
logger.debug("Rate limiter WebSocket initialisé");
