import { db } from "../../db";
import {
  sessionsCaisse,
  sessionsCaisseAuditLogs,
  transfertsCoffreCaisse,
  caisses,
  comptageBillets,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { StatutTransfertCoffre, StatutCaisse, STATUT_SESSION_CAISSE_LABELS, type StatutSessionCaisseType } from "@shared/enum/status-constants";
import { TransfertCoffreService } from "../coffre/transfert-service";
import { calculateBilletageTotal } from "./session-service";
import { getWsInstance } from "../../ws-server";
import { createLogger } from "../../lib/logger";
import { DEFAULT_SESSION_TIMEOUT_HOURS } from "./session-opening-constants";
import type { SessionRow } from "./types";

const logger = createLogger('SessionOpeningReceipt');
const transfertService = new TransfertCoffreService();

export interface ReceiveFundsParams {
  sessionId: string;
  caissierId: string;
  billetageReception: Record<string, number>;
  observations?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface ReceiveFundsResult {
  success: boolean;
  session?: SessionRow;
  error?: string;
  errorCode?: string;
}

/**
 * PHASE C: Confirmation de réception et ouverture par le caissier
 */
export async function receiveFundsAndOpen(
  params: ReceiveFundsParams
): Promise<ReceiveFundsResult> {
  const {
    sessionId,
    caissierId,
    billetageReception,
    observations,
    ipAddress,
    userAgent,
  } = params;

  try {
    return await db.transaction(async (tx) => {
      // 1. Récupérer la session et vérifier l'état
      const [session] = await tx
        .select()
        .from(sessionsCaisse)
        .where(eq(sessionsCaisse.id, sessionId))
        .for("update");

      if (!session) {
        return {
          success: false,
          error: "Session introuvable",
          errorCode: "SESSION_NOT_FOUND",
        };
      }

      if (session.statut !== "FUNDS_DISPATCHED") {
        const label = STATUT_SESSION_CAISSE_LABELS[session.statut as StatutSessionCaisseType] || session.statut;
        const guidance: Record<string, string> = {
          REQUESTING_FUNDS: "Les fonds n'ont pas encore été envoyés par le coffre. Veuillez patienter.",
          OPEN: "Cette session est déjà ouverte.",
          CLOSING_COUNT: "Cette session est en cours de fermeture.",
          CLOSING_VALIDATION: "Cette session est en cours de fermeture.",
          CLOSED: "Cette session est déjà fermée.",
        };
        const detail = guidance[session.statut] || "";
        return {
          success: false,
          error: `Impossible de confirmer la réception des fonds : la session est actuellement en statut « ${label} ». ${detail}`.trim(),
          errorCode: "INVALID_STATE",
        };
      }

      if (session.caissierId !== caissierId) {
        return {
          success: false,
          error: "Vous n'êtes pas le caissier de cette session",
          errorCode: "PERMISSION_DENIED",
        };
      }

      // 2. Calculer le montant reçu depuis le billetage
      const montantRecu = calculateBilletageTotal(billetageReception);

      // 3. Calculer le solde d'ouverture total
      // RÈGLE D'OR: soldeOuverture = soldeVeille + montantRecu
      const soldeVeille = Number(session.soldeVeille || 0);
      const soldeOuverture = soldeVeille + montantRecu;

      // GUARD: Une caisse ne doit JAMAIS ouvrir avec un solde négatif
      if (soldeOuverture < 0) {
        return {
          success: false,
          error: `Impossible d'ouvrir la session : le solde d'ouverture serait négatif (${soldeOuverture.toLocaleString('fr-FR')} FCFA). Le solde résiduel de la veille (${soldeVeille.toLocaleString('fr-FR')} FCFA) est incohérent. Contactez la supervision.`,
          errorCode: "NEGATIVE_OPENING_BALANCE",
        };
      }

      // 4. Exécuter le transfert du coffre (si pas déjà exécuté)
      if (session.openingTransfertId) {
        // Vérifier le statut actuel du transfert
        const [currentTransfert] = await tx
          .select()
          .from(transfertsCoffreCaisse)
          .where(eq(transfertsCoffreCaisse.id, session.openingTransfertId));

        if (currentTransfert) {
          // Si le transfert est déjà exécuté, on skip l'exécution
          // (cas où le chef d'agence a validé ET exécuté directement depuis le dashboard coffre)
          if (currentTransfert.statut === StatutTransfertCoffre.EXECUTED) {
            logger.info('Transfert already executed, continuing session opening');
          } else if (currentTransfert.statut === StatutTransfertCoffre.VALIDATED) {
            // Transfert validé mais pas encore exécuté - on l'exécute
            const execResult = await transfertService.executeTransfert({
              transfertId: session.openingTransfertId,
              executorId: caissierId,
              sessionId: sessionId,
              billetage: billetageReception,
              ipAddress,
              userAgent,
            });

            if (!execResult.success) {
              return {
                success: false,
                error: `Erreur lors de l'exécution du transfert: ${'error' in execResult ? execResult.error : 'Unknown error'}`,
                errorCode: 'errorCode' in execResult ? execResult.errorCode : 'EXECUTE_ERROR',
              };
            }
          } else {
            // Statut inattendu
            return {
              success: false,
              error: `Le transfert est dans un état inattendu: ${currentTransfert.statut}. Il doit être VALIDATED ou EXECUTED.`,
              errorCode: 'INVALID_TRANSFER_STATUS',
            };
          }
        }
      }

      // 5. Calculer le timeout de la session
      const timeoutAt = new Date();
      timeoutAt.setHours(
        timeoutAt.getHours() + DEFAULT_SESSION_TIMEOUT_HOURS
      );

      // 6. Mettre à jour la session → OPEN
      const [updatedSession] = await tx
        .update(sessionsCaisse)
        .set({
          statut: "OPEN",
          openedAt: new Date(),
          fundsReceivedAt: new Date(),
          // IMPORTANT: Le solde d'ouverture est CALCULÉ, jamais saisi manuellement
          montantOuverture: soldeOuverture.toString(),
          montantFermetureTheorique: soldeOuverture.toString(),
          billetageOuverture: billetageReception,
          billetageReception,
          observations: observations || session.observations,
          lastActivity: new Date(),
          timeoutAt,
          connectionStatus: "CONNECTED",
          updatedAt: new Date(),
        })
        .where(eq(sessionsCaisse.id, sessionId))
        .returning();

      // 7. Mettre à jour le solde et le STATUT de la caisse physique
      await tx
        .update(caisses)
        .set({
          solde: soldeOuverture.toString(),
          statut: StatutCaisse.OPEN, // CRITIQUE: Synchroniser le statut avec la session
          updatedAt: new Date(),
        })
        .where(eq(caisses.id, session.caisseId));

      // 8. Enregistrer le Billetage d'Ouverture dans comptage_billets
      const billetageTotal = calculateBilletageTotal(billetageReception);
      await tx.insert(comptageBillets).values({
        sessionId: sessionId,
        typeComptage: "OUVERTURE",
        billets10000: billetageReception["10000"] || 0,
        billets5000: billetageReception["5000"] || 0,
        billets2000: billetageReception["2000"] || 0,
        billets1000: billetageReception["1000"] || 0,
        billets500: billetageReception["500"] || 0,
        pieces250: billetageReception["250"] || 0,
        pieces100: billetageReception["100"] || 0,
        pieces50: billetageReception["50"] || 0,
        pieces25: billetageReception["25"] || 0,
        totalCalcule: billetageTotal.toString(),
        totalDeclare: billetageTotal.toString(),
        observations: "Billetage d'ouverture de session",
      });

      // 9. Détecter un éventuel écart entre montant demandé et montant reçu
      const montantDemande = Number(session.montantDemande || 0);
      const ecartReception = montantRecu - montantDemande;
      const hasEcart = Math.abs(ecartReception) > 1; // Tolérance de 1 FCFA

      // 10. Log d'audit
      await tx.insert(sessionsCaisseAuditLogs).values({
        sessionId,
        action: "OPENED",
        statutAvant: "FUNDS_DISPATCHED",
        statutApres: "OPEN",
        details: {
          soldeVeille,
          montantDemande,
          montantRecu,
          soldeOuverture,
          billetageReception,
          openingTransfertId: session.openingTransfertId,
          ecartReception: hasEcart ? ecartReception : null,
        },
        userId: caissierId,
        ipAddress,
        userAgent,
      });

      // 11. Notifications WebSocket en temps réel
      try {
        const ws = getWsInstance();
        if (ws && session.agenceId) {
          // Notifier le dashboard caisse
          ws.broadcastToAggregate('caisse', session.caisseId, {
            type: 'CAISSE_UPDATE',
            payload: {
              caisseId: session.caisseId,
              type: 'SESSION_OPENED',
              sessionId: updatedSession.id,
              newBalance: soldeOuverture,
            }
          });

          // Notifier le coffre que la session est ouverte
          ws.broadcastToAggregate('coffre', session.agenceId, {
            type: 'REALTIME_EVENT',
            payload: {
              aggregateType: 'coffre',
              aggregateId: session.agenceId,
              event: 'SESSION_OPENED',
              sessionId: updatedSession.id,
              caisseId: session.caisseId,
            }
          });

          // Activité en temps réel pour toute l'agence
          ws.broadcastToAgency(session.agenceId, {
            type: 'LIVE_ACTIVITY',
            payload: {
              action: `Session caisse ouverte: ${soldeOuverture.toLocaleString()} FCFA`,
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
        session: {
          ...updatedSession,
          ecartReception: hasEcart ? ecartReception : null,
        },
      };
    });
  } catch (error: unknown) {
    logger.error({ err: error }, 'Error in receiveFundsAndOpen');
    return {
      success: false,
      error: (error instanceof Error ? error.message : "Erreur interne"),
      errorCode: "DB_ERROR",
    };
  }
}
