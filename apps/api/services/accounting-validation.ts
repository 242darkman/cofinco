/**
 * Service de validation des règles comptables
 * S'assure qu'une opération peut être enregistrée en GL avant de la commencer
 */

import { db } from '../db';
import { accountingRules } from '@shared/schema';
import { eq, and, or, isNull } from 'drizzle-orm';
import { logger } from '../lib/logger';

/**
 * Vérifie qu'une règle comptable existe pour un type d'opération
 * @throws Error si la règle n'existe pas et GL_POSTING_MODE=STRICT
 */
export async function validateAccountingRule(
  eventType: string,
  agenceId?: string
): Promise<boolean> {
  // Chercher une règle qui correspond au type d'événement
  // et qui est soit globale (agenceId IS NULL) soit spécifique à l'agence
  const whereCondition = agenceId
    ? and(
        eq(accountingRules.eventType, eventType),
        eq(accountingRules.active, true),
        or(
          isNull(accountingRules.agenceId),  // Règle globale
          eq(accountingRules.agenceId, agenceId)  // Règle spécifique à l'agence
        )
      )
    : and(
        eq(accountingRules.eventType, eventType),
        eq(accountingRules.active, true),
        isNull(accountingRules.agenceId)  // Seulement les règles globales
      );

  const rules = await db
    .select()
    .from(accountingRules)
    .where(whereCondition)
    .limit(1);

  const ruleExists = rules.length > 0;

  if (!ruleExists) {
    const errorMessage = `Règle comptable manquante pour l'événement: ${eventType}`;

    // Mode STRICT (défaut): bloquer l'opération
    if (isGLStrictMode()) {
      logger.error({ eventType, agenceId }, errorMessage);
      throw new Error(errorMessage);
    }

    // Mode LENIENT (explicite): logger un warning mais continuer
    logger.warn({ eventType, agenceId }, `${errorMessage} (mode LENIENT - opération autorisée)`);
    return false;
  }

  return true;
}

/**
 * Vérifie si le mode GL strict est activé.
 * STRICT par défaut — seul GL_POSTING_MODE=LENIENT le désactive explicitement.
 */
export function isGLStrictMode(): boolean {
  return process.env.GL_POSTING_MODE !== 'LENIENT';
}

/**
 * Gère l'échec du posting GL selon le mode configuré
 * @throws Error en mode STRICT
 */
export function handleGLPostingFailure(error: unknown, context: Record<string, any>): void {
  const message = error instanceof Error ? error.message : 'Unknown GL error';

  if (isGLStrictMode()) {
    logger.error({ ...context, error: message }, 'GL posting failed in STRICT mode - rolling back');
    throw error; // Rethrow pour déclencher le rollback
  }

  logger.warn({ ...context, error: message }, 'GL posting failed in LENIENT mode - continuing');
}
