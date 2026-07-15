import { db } from "../../db";
import {
  sessionsCaisse,
  sessionsCaisseAuditLogs,
  caisses,
} from "@shared/schema";
import { eq, and, isNull, notInArray } from "drizzle-orm";
import { StatutCaisse } from "@shared/enum/status-constants";
import { getWsInstance } from "../../ws-server";
import { createLogger } from "../../lib/logger";
import { TERMINAL_STATUSES, DEFAULT_SESSION_TIMEOUT_HOURS } from "./session-opening-constants";
import type { SessionRow } from "./types";

const logger = createLogger('SessionOpeningDirect');

/**
 * OUVERTURE DIRECTE: Sans passer par le workflow coffre
 * Permet d'ouvrir une session directement sans passer par le workflow coffre.
 *
 * Cas d'usage:
 * - Le caissier a un fonds de roulement reporté de la veille
 * - Le caissier souhaite ouvrir sa caisse à 0 FCFA (sans approvisionnement)
 */
export async function openDirectWithExistingFunds(params: {
  caissierId: string;
  caisseId: string;
  agenceId: string;
  observations?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{
  success: boolean;
  session?: SessionRow;
  error?: string;
  errorCode?: string;
  recovered?: boolean;
}> {
  const { caissierId, caisseId, agenceId, observations, ipAddress, userAgent } = params;

  try {
    return await db.transaction(async (tx) => {
      // 1. Récupérer la caisse
      const [caisse] = await tx
        .select()
        .from(caisses)
        .where(eq(caisses.id, caisseId))
        .for("update");

      if (!caisse) {
        return {
          success: false,
          error: "Caisse introuvable",
          errorCode: "CAISSE_NOT_FOUND",
        };
      }

      const soldeExistant = Number(caisse.solde || 0);

      // GUARD: Une caisse ne doit JAMAIS ouvrir avec un solde négatif
      if (soldeExistant < 0) {
        return {
          success: false,
          error: `Impossible d'ouvrir la session : le solde de la caisse est négatif (${soldeExistant.toLocaleString('fr-FR')} FCFA). Contactez la supervision pour corriger le solde avant de réouvrir.`,
          errorCode: "NEGATIVE_OPENING_BALANCE",
        };
      }

      // 2. Vérifier qu'aucune session n'est ouverte sur cette caisse
      const existingCaisseSession = await tx
        .select()
        .from(sessionsCaisse)
        .where(
          and(
            eq(sessionsCaisse.caisseId, caisseId),
            notInArray(sessionsCaisse.statut, [...TERMINAL_STATUSES]),
            isNull(sessionsCaisse.deletedAt)
          )
        )
        .limit(1);

      if (existingCaisseSession.length > 0) {
        const existing = existingCaisseSession[0];

        if (existing.caissierId === caissierId) {
          // Same user, same caisse → recover or force-close stale session
          if (existing.statut === "OPEN") {
            // Already OPEN → recover it (ensure statut + closedAt are consistent)
            await tx
              .update(sessionsCaisse)
              .set({ statut: "OPEN", lastActivity: new Date(), closedAt: null })
              .where(eq(sessionsCaisse.id, existing.id));

            await tx
              .update(caisses)
              .set({ statut: StatutCaisse.OPEN, updatedAt: new Date() })
              .where(eq(caisses.id, caisseId));

            return {
              success: true,
              session: { ...existing, statut: "OPEN", lastActivity: new Date(), closedAt: null },
              recovered: true,
            };
          }

          // Stale intermediate state (REQUESTING_FUNDS, FUNDS_DISPATCHED,
          // CLOSING_COUNT, CLOSING_VALIDATION) → force-close and let a new session be created
          await tx
            .update(sessionsCaisse)
            .set({
              statut: "CLOSED",
              closedAt: new Date(),
              openedAt: null,
              montantOuverture: "0",
              montantFermetureTheorique: "0",
              observations: `[Auto-fermée] Session bloquée en état ${existing.statut}, fermée pour permettre une nouvelle ouverture`,
            })
            .where(eq(sessionsCaisse.id, existing.id));
          // Fall through to create a new session below
        } else {
          return {
            success: false,
            error: "Cette caisse a déjà une session active",
            errorCode: "CAISSE_OCCUPIED",
          };
        }
      }

      // 3. Vérifier que le caissier n'a pas d'autre session active
      const existingUserSession = await tx
        .select()
        .from(sessionsCaisse)
        .where(
          and(
            eq(sessionsCaisse.caissierId, caissierId),
            notInArray(sessionsCaisse.statut, [...TERMINAL_STATUSES]),
            isNull(sessionsCaisse.deletedAt)
          )
        )
        .limit(1);

      if (existingUserSession.length > 0) {
        const existingOnOtherCaisse = existingUserSession[0];

        if (existingOnOtherCaisse.caisseId === caisseId) {
          // Same user, same caisse → recover or force-close
          if (existingOnOtherCaisse.statut === "OPEN") {
            // Recover — ensure statut + closedAt are consistent
            await tx
              .update(sessionsCaisse)
              .set({ statut: "OPEN", lastActivity: new Date(), closedAt: null })
              .where(eq(sessionsCaisse.id, existingOnOtherCaisse.id));

            return {
              success: true,
              session: { ...existingOnOtherCaisse, statut: "OPEN", lastActivity: new Date(), closedAt: null },
              recovered: true,
            };
          }

          // Stale intermediate state → force-close + clear stale fields
          await tx
            .update(sessionsCaisse)
            .set({
              statut: "CLOSED",
              closedAt: new Date(),
              openedAt: null,
              montantOuverture: "0",
              montantFermetureTheorique: "0",
              observations: `[Auto-fermée] Session bloquée en état ${existingOnOtherCaisse.statut}, fermée pour permettre une nouvelle ouverture`,
            })
            .where(eq(sessionsCaisse.id, existingOnOtherCaisse.id));
          // Fall through to create new session
        } else {
          return {
            success: false,
            error: "Vous avez déjà une session active sur une autre caisse",
            errorCode: "USER_HAS_SESSION",
          };
        }
      }

      // 4. Calculer le timeout
      const timeoutAt = new Date();
      timeoutAt.setHours(timeoutAt.getHours() + DEFAULT_SESSION_TIMEOUT_HOURS);

      // 5. Créer la session directement en état OPEN
      const [newSession] = await tx
        .insert(sessionsCaisse)
        .values({
          caissierId,
          caisseId,
          agenceId,
          statut: "OPEN",
          montantOuverture: soldeExistant.toString(),
          montantFermetureTheorique: soldeExistant.toString(), // Initialiser le solde théorique
          soldeVeille: soldeExistant.toString(), // Le solde vient de la veille (fonds reporté)
          billetageOuverture: {}, // Pas de billetage à compter, c'est le fonds reporté
          openedAt: new Date(),
          timeoutAt,
          observations: observations
            ? `[Ouverture directe] ${observations}`
            : soldeExistant > 0
              ? "[Ouverture directe avec fonds reporté]"
              : "[Ouverture directe à 0 FCFA]",
          lastActivity: new Date(),
        })
        .returning();

      // 6. CRITIQUE: Mettre à jour le statut de la caisse
      await tx
        .update(caisses)
        .set({
          statut: StatutCaisse.OPEN,
          updatedAt: new Date(),
        })
        .where(eq(caisses.id, caisseId));

      // 7. Log d'audit
      await tx.insert(sessionsCaisseAuditLogs).values({
        sessionId: newSession.id,
        action: "DIRECT_OPEN",
        userId: caissierId,
        statutAvant: null,
        statutApres: "OPEN",
        details: {
          soldeExistant,
          type: soldeExistant > 0 ? "FONDS_REPORTE" : "OUVERTURE_VIDE",
          message: soldeExistant > 0
            ? "Ouverture directe avec le fonds reporté de la veille"
            : "Ouverture directe à 0 FCFA sans approvisionnement coffre",
        },
        ipAddress,
        userAgent,
      });

      // 8. Notification WebSocket en temps réel
      try {
        const ws = getWsInstance();
        if (ws) {
          // Notifier le dashboard caisse
          ws.broadcastToAggregate('caisse', caisseId, {
            type: 'CAISSE_UPDATE',
            payload: {
              caisseId,
              type: 'SESSION_OPENED',
              sessionId: newSession.id,
              newBalance: soldeExistant,
              openingType: 'DIRECT',
            }
          });

          // Activité en temps réel
          ws.broadcastToAgency(agenceId, {
            type: 'LIVE_ACTIVITY',
            payload: {
              action: soldeExistant > 0
                ? `Session ouverte (fonds reporté): ${soldeExistant.toLocaleString()} FCFA`
                : `Session ouverte à 0 FCFA (sans approvisionnement)`,
              type: 'session',
              timestamp: new Date().toISOString()
            }
          });
        }
      } catch (wsError) {
        logger.error({ err: wsError }, 'WebSocket notification failed');
      }

      return {
        success: true,
        session: newSession,
      };
    });
  } catch (error: unknown) {
    // Contrainte unique DB (race condition — belt-and-suspenders)
    if ((error as { code?: string }).code === "23505") {
      const constraint = (error as { constraint?: string }).constraint || '';
      if (constraint.includes("one_active_per_caisse") || constraint.includes("caisse")) {
        return {
          success: false,
          error: "Cette caisse a déjà une session active.",
          errorCode: "CAISSE_OCCUPIED",
        };
      }
      if (constraint.includes("one_active_per_user") || constraint.includes("user")) {
        return {
          success: false,
          error: "Vous avez déjà une session active sur une autre caisse.",
          errorCode: "USER_HAS_SESSION",
        };
      }
    }
    logger.error({ err: error }, 'Error in openDirectWithExistingFunds');
    return {
      success: false,
      error: (error instanceof Error ? error.message : "Erreur interne"),
      errorCode: "DB_ERROR",
    };
  }
}
