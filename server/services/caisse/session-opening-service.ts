/**
 * Service de Workflow Sécurisé d'Ouverture de Caisse (Coffre → Caisse)
 *
 * Implémente le workflow en 3 phases:
 * - Phase A: Demande d'ouverture par le caissier (REQUESTING_FUNDS)
 * - Phase B: Validation par le responsable coffre (FUNDS_DISPATCHED)
 * - Phase C: Confirmation de réception par le caissier (OPEN)
 *
 * RÈGLE D'OR: L'argent ne doit jamais apparaître "magiquement".
 * Le solde d'ouverture = solde veille + transfert coffre (tous deux auditables)
 */

import { db } from "../../db";
import {
  sessionsCaisse,
  sessionsCaisseAuditLogs,
  transfertsCoffreCaisse,
  transfertsCoffreAuditLogs,
  caisses,
  users,
  coffresForts,
  configCoffreFort,
  comptageBillets,
  mouvementsFinanciers,
  operationsCaisse,
} from "@shared/schema";
import { eq, and, isNull, inArray, desc } from "drizzle-orm";
import { StatutTransfertCoffre, StatutCaisse, StatutTransaction, STATUT_SESSION_CAISSE_LABELS, type StatutSessionCaisseType } from "@shared/enum/status-constants";
import { TransfertCoffreService } from "../coffre/transfert-service";
import { calculateBilletageTotal } from "./session-service";
import { getWsInstance } from "../../ws-server";
import { updateCoffreBalance, updateCaisseBalance } from "../coffre/coffre-guard";
import { balanceService } from "../balance-service";
import { createLogger } from "../../lib/logger";
import { postGlForMouvement, AccountingRuleNotFoundError } from "../accounting-posting-service";

const logger = createLogger('SessionOpening');

// ============================================================================
// TYPES
// ============================================================================

interface RequestOpeningParams {
  caissierId: string;
  caisseId: string;
  agenceId: string;
  montantDemande: number;
  observations?: string;
  ipAddress?: string;
  userAgent?: string;
}

interface RequestOpeningResult {
  success: boolean;
  session?: any;
  transfert?: any;
  error?: string;
  errorCode?:
    | "CAISSE_OCCUPIED"
    | "USER_HAS_SESSION"
    | "INVALID_AMOUNT"
    | "COFFRE_NOT_FOUND"
    | "DB_ERROR";
}

interface ValidateOpeningParams {
  transfertId: string;
  validatorId: string;
  approved: boolean;
  reasonRejection?: string;
  billetage?: Record<string, number>;
  ipAddress?: string;
  userAgent?: string;
}

interface ValidateOpeningResult {
  success: boolean;
  session?: any;
  transfert?: any;
  error?: string;
  errorCode?: string;
}

interface ReceiveFundsParams {
  sessionId: string;
  caissierId: string;
  billetageReception: Record<string, number>;
  observations?: string;
  ipAddress?: string;
  userAgent?: string;
}

interface ReceiveFundsResult {
  success: boolean;
  session?: any;
  error?: string;
  errorCode?: string;
}

interface CancelRequestParams {
  sessionId: string;
  userId: string;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

// ============================================================================
// CONSTANTES
// ============================================================================

const DEFAULT_REQUEST_EXPIRY_HOURS = 4; // Expiration de la demande après 4h
const DEFAULT_SESSION_TIMEOUT_HOURS = 12;

// ============================================================================
// SERVICE
// ============================================================================

export class SessionOpeningService {
  private transfertService = new TransfertCoffreService();

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE A: Demande d'ouverture par le caissier
  // ─────────────────────────────────────────────────────────────────────────
  async requestSessionOpening(
    params: RequestOpeningParams
  ): Promise<RequestOpeningResult> {
    const {
      caissierId,
      caisseId,
      agenceId,
      montantDemande,
      observations,
      ipAddress,
      userAgent,
    } = params;

    // Validation: Montant positif
    if (montantDemande <= 0) {
      return {
        success: false,
        error: "Le montant demandé doit être positif",
        errorCode: "INVALID_AMOUNT",
      };
    }

    try {
      return await db.transaction(async (tx) => {
        // 1. Vérifier qu'aucune session n'est ouverte sur cette caisse
        const existingCaisseSession = await tx
          .select()
          .from(sessionsCaisse)
          .where(
            and(
              eq(sessionsCaisse.caisseId, caisseId),
              isNull(sessionsCaisse.closedAt),
              inArray(sessionsCaisse.statut, [
                "REQUESTING_FUNDS",
                "FUNDS_DISPATCHED",
                "OPEN",
              ] as any)
            )
          )
          .limit(1);

        if (existingCaisseSession.length > 0) {
          throw new Error("CAISSE_OCCUPIED");
        }

        // 2. Vérifier que le caissier n'a pas d'autre session active
        const existingUserSession = await tx
          .select()
          .from(sessionsCaisse)
          .where(
            and(
              eq(sessionsCaisse.caissierId, caissierId),
              isNull(sessionsCaisse.closedAt),
              inArray(sessionsCaisse.statut, [
                "REQUESTING_FUNDS",
                "FUNDS_DISPATCHED",
                "OPEN",
              ] as any)
            )
          )
          .limit(1);

        if (existingUserSession.length > 0) {
          throw new Error("USER_HAS_SESSION");
        }

        // 3. Récupérer le solde veille de la caisse physique
        const [caisse] = await tx
          .select()
          .from(caisses)
          .where(eq(caisses.id, caisseId));

        if (!caisse) {
          throw new Error("CAISSE_NOT_FOUND");
        }

        const soldeVeille = Number(caisse.solde || 0);

        // 4. Récupérer ou créer le coffre-fort de l'agence
        const coffreFort = await this.transfertService.getOrCreateCoffreFort(
          agenceId
        );

        // 5. Calculer l'expiration de la demande
        const requestExpiresAt = new Date();
        requestExpiresAt.setHours(
          requestExpiresAt.getHours() + DEFAULT_REQUEST_EXPIRY_HOURS
        );

        // 6. Créer la session en état REQUESTING_FUNDS
        const [session] = await tx
          .insert(sessionsCaisse)
          .values({
            caissierId,
            caisseId,
            agenceId,
            statut: "REQUESTING_FUNDS" as any,
            montantOuverture: "0", // Sera calculé à la Phase C
            montantFermetureTheorique: "0",
            montantDemande: montantDemande.toString(),
            soldeVeille: soldeVeille.toString(),
            fundsRequestedAt: new Date(),
            requestExpiresAt,
            observations,
            connectionStatus: "DISCONNECTED",
          })
          .returning();

        // 7. Créer le transfert COFFRE_VERS_CAISSE
        const { randomBytes } = require('crypto');
        const reference = `OUV-${Date.now().toString().slice(-6)}-${randomBytes(3).toString('hex').slice(0, 3).toUpperCase()}`;

        const [transfert] = await tx
          .insert(transfertsCoffreCaisse)
          .values({
            agenceId,
            typeTransfert: "COFFRE_VERS_CAISSE" as any,
            coffreId: coffreFort.id,
            caisseId,
            montant: montantDemande.toString(),
            motif: `Approvisionnement ouverture caisse - Session ${session.id}`,
            reference,
            statut: StatutTransfertCoffre.REQUESTED as any,
            requestedBy: caissierId,
            requestedAt: new Date(),
            sessionOuvertureId: session.id,
            isOpeningFund: true,
          })
          .returning();

        // 8. Lier le transfert à la session
        await tx
          .update(sessionsCaisse)
          .set({ openingTransfertId: transfert.id })
          .where(eq(sessionsCaisse.id, session.id));

        // 9. Créer log d'audit session
        await tx.insert(sessionsCaisseAuditLogs).values({
          sessionId: session.id,
          action: "FUNDS_REQUESTED",
          statutApres: "REQUESTING_FUNDS",
          details: {
            montantDemande,
            soldeVeille,
            transfertId: transfert.id,
            caisseId,
            agenceId,
            coffreId: coffreFort.id,
          },
          userId: caissierId,
          ipAddress,
          userAgent,
        });

        // 10. Créer log d'audit transfert
        await tx.insert(transfertsCoffreAuditLogs).values({
          transfertId: transfert.id,
          action: "CREATED",
          statutApres: StatutTransfertCoffre.REQUESTED,
          details: {
            typeTransfert: "COFFRE_VERS_CAISSE",
            montant: montantDemande,
            isOpeningFund: true,
            sessionId: session.id,
          },
          userId: caissierId,
          ipAddress,
          userAgent,
        });

        // 11. Notification WebSocket au coffre (demande en attente)
        try {
          const ws = getWsInstance();
          if (ws) {
            // Notifier le coffre d'une nouvelle demande d'ouverture
            ws.broadcastToAggregate('coffre', agenceId, {
              type: 'REALTIME_EVENT',
              payload: {
                aggregateType: 'coffre',
                aggregateId: agenceId,
                event: 'OPENING_REQUEST_CREATED',
                transfertId: transfert.id,
                sessionId: session.id,
                montant: montantDemande,
                caisseId,
              }
            });

            // Activité en temps réel
            ws.broadcastToAgency(agenceId, {
              type: 'LIVE_ACTIVITY',
              payload: {
                action: `Demande d'ouverture: ${montantDemande.toLocaleString()} FCFA`,
                type: 'request',
                timestamp: new Date().toISOString()
              }
            });
          }
        } catch (wsError) {
          logger.error({ err: wsError }, 'WebSocket notification failed');
        }

        return {
          success: true,
          session: { ...session, openingTransfertId: transfert.id },
          transfert,
        };
      });
    } catch (error: any) {
      if (error.message === "CAISSE_OCCUPIED") {
        return {
          success: false,
          error: "Cette caisse est déjà occupée ou a une demande en cours",
          errorCode: "CAISSE_OCCUPIED",
        };
      }
      if (error.message === "USER_HAS_SESSION") {
        return {
          success: false,
          error: "Vous avez déjà une session ouverte ou une demande en cours",
          errorCode: "USER_HAS_SESSION",
        };
      }
      if (error.message === "CAISSE_NOT_FOUND") {
        return {
          success: false,
          error: "Caisse non trouvée",
          errorCode: "DB_ERROR",
        };
      }
      logger.error({ err: error }, 'Error in requestSessionOpening');
      return {
        success: false,
        error: error.message || "Erreur interne",
        errorCode: "DB_ERROR",
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE B: Validation par le responsable coffre
  // ─────────────────────────────────────────────────────────────────────────
  async validateOpeningTransfer(
    params: ValidateOpeningParams
  ): Promise<ValidateOpeningResult> {
    const {
      transfertId,
      validatorId,
      approved,
      reasonRejection,
      billetage,
      ipAddress,
      userAgent,
    } = params;

    try {
      return await db.transaction(async (tx) => {
        // 1. Récupérer le transfert et vérifier qu'il s'agit d'un transfert d'ouverture
        const [transfert] = await tx
          .select()
          .from(transfertsCoffreCaisse)
          .where(eq(transfertsCoffreCaisse.id, transfertId))
          .for("update");

        if (!transfert) {
          return {
            success: false,
            error: "Transfert non trouvé",
            errorCode: "TRANSFERT_NOT_FOUND",
          };
        }

        if (!transfert.isOpeningFund) {
          return {
            success: false,
            error:
              "Ce transfert n'est pas un approvisionnement d'ouverture. Utilisez la route standard.",
            errorCode: "NOT_OPENING_FUND",
          };
        }

        if (transfert.statut !== StatutTransfertCoffre.REQUESTED) {
          return {
            success: false,
            error: `Ce transfert ne peut plus être validé car il a déjà été ${transfert.statut === "VALIDATED" ? "validé" : transfert.statut === "EXECUTED" ? "exécuté" : transfert.statut === "REJECTED" ? "rejeté" : transfert.statut === "CANCELLED" ? "annulé" : "traité"}.`,
            errorCode: "INVALID_TRANSITION",
          };
        }

        // 2. Vérifier la règle de séparation initiateur/valideur
        const [config] = await tx
          .select()
          .from(configCoffreFort)
          .where(eq(configCoffreFort.agenceId, transfert.agenceId));

        if (
          config?.separationInitiateurValideur &&
          transfert.requestedBy === validatorId
        ) {
          return {
            success: false,
            error: "Vous ne pouvez pas valider votre propre demande",
            errorCode: "SAME_USER_FORBIDDEN",
          };
        }

        // 3. Récupérer la session associée
        const [session] = transfert.sessionOuvertureId
          ? await tx
              .select()
              .from(sessionsCaisse)
              .where(eq(sessionsCaisse.id, transfert.sessionOuvertureId))
              .for("update")
          : [null];

        if (!session) {
          return {
            success: false,
            error: "Session d'ouverture associée non trouvée",
            errorCode: "SESSION_NOT_FOUND",
          };
        }

        const newStatut = approved
          ? StatutTransfertCoffre.VALIDATED
          : StatutTransfertCoffre.REJECTED;

        // 4. Mettre à jour le transfert
        const [updatedTransfert] = await tx
          .update(transfertsCoffreCaisse)
          .set({
            statut: newStatut as any,
            validatedBy: validatorId,
            validatedAt: new Date(),
            reasonRejection: approved ? null : reasonRejection,
            billetage: billetage || transfert.billetage,
            updatedAt: new Date(),
          })
          .where(eq(transfertsCoffreCaisse.id, transfertId))
          .returning();

        // 5. Mettre à jour la session selon le résultat
        let updatedSession;
        if (approved) {
          // Approuvé: passer la session en FUNDS_DISPATCHED
          [updatedSession] = await tx
            .update(sessionsCaisse)
            .set({
              statut: "FUNDS_DISPATCHED" as any,
              fundsDispatchedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(sessionsCaisse.id, session.id))
            .returning();

          // Log audit session
          await tx.insert(sessionsCaisseAuditLogs).values({
            sessionId: session.id,
            action: "FUNDS_DISPATCHED",
            statutAvant: "REQUESTING_FUNDS",
            statutApres: "FUNDS_DISPATCHED",
            details: {
              transfertId,
              montant: transfert.montant,
              validatedBy: validatorId,
              billetage,
            },
            userId: validatorId,
            ipAddress,
            userAgent,
          });
        } else {
          // Rejeté: fermer la session
          [updatedSession] = await tx
            .update(sessionsCaisse)
            .set({
              closedAt: new Date(),
              observations: `Demande rejetée: ${reasonRejection || "Non spécifié"}`,
              updatedAt: new Date(),
            })
            .where(eq(sessionsCaisse.id, session.id))
            .returning();

          // Log audit session
          await tx.insert(sessionsCaisseAuditLogs).values({
            sessionId: session.id,
            action: "FUNDS_REJECTED",
            statutAvant: "REQUESTING_FUNDS",
            statutApres: "CLOSED",
            details: {
              transfertId,
              reasonRejection,
              validatedBy: validatorId,
            },
            userId: validatorId,
            ipAddress,
            userAgent,
          });
        }

        // 6. Log audit transfert
        await tx.insert(transfertsCoffreAuditLogs).values({
          transfertId,
          action: approved ? "VALIDATED" : "REJECTED",
          statutAvant: StatutTransfertCoffre.REQUESTED,
          statutApres: newStatut,
          details: {
            approved,
            reasonRejection,
            isOpeningFund: true,
            sessionId: session.id,
          },
          userId: validatorId,
          ipAddress,
          userAgent,
        });

        // 7. Notification WebSocket au caissier
        try {
          const ws = getWsInstance();
          if (ws && transfert.agenceId) {
            if (approved) {
              // Notifier le caissier que les fonds sont prêts
              ws.broadcastToAggregate('caisse', transfert.caisseId, {
                type: 'CAISSE_UPDATE',
                payload: {
                  caisseId: transfert.caisseId,
                  type: 'FUNDS_DISPATCHED',
                  sessionId: session.id,
                  montant: Number(transfert.montant),
                }
              });
            } else {
              // Notifier le caissier du rejet
              ws.broadcastToAggregate('caisse', transfert.caisseId, {
                type: 'CAISSE_UPDATE',
                payload: {
                  caisseId: transfert.caisseId,
                  type: 'FUNDS_REJECTED',
                  sessionId: session.id,
                  reason: reasonRejection,
                }
              });
            }

            // Activité en temps réel
            ws.broadcastToAgency(transfert.agenceId, {
              type: 'LIVE_ACTIVITY',
              payload: {
                action: approved
                  ? `Fonds validés: ${Number(transfert.montant).toLocaleString()} FCFA`
                  : `Demande rejetée: ${reasonRejection || 'Non spécifié'}`,
                type: approved ? 'validation' : 'rejection',
                timestamp: new Date().toISOString()
              }
            });
          }
        } catch (wsError) {
          logger.error({ err: wsError }, 'WebSocket notification failed');
        }

        return {
          success: true,
          session: updatedSession,
          transfert: updatedTransfert,
        };
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Error in validateOpeningTransfer');
      return {
        success: false,
        error: error.message || "Erreur interne",
        errorCode: "DB_ERROR",
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE C: Confirmation de réception et ouverture par le caissier
  // ─────────────────────────────────────────────────────────────────────────
  async receiveFundsAndOpen(
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
              const execResult = await this.transfertService.executeTransfert({
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
            statut: "OPEN" as any,
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
    } catch (error: any) {
      logger.error({ err: error }, 'Error in receiveFundsAndOpen');
      return {
        success: false,
        error: error.message || "Erreur interne",
        errorCode: "DB_ERROR",
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Annulation d'une demande par le caissier (REQUESTING_FUNDS ou FUNDS_DISPATCHED)
  // Si les fonds ont déjà été envoyés (FUNDS_DISPATCHED), le transfert est
  // annulé et les fonds sont restitués au coffre-fort (historisé des deux côtés).
  // ─────────────────────────────────────────────────────────────────────────
  async cancelOpeningRequest(params: CancelRequestParams): Promise<{
    success: boolean;
    error?: string;
    errorCode?: string;
  }> {
    const { sessionId, userId, reason, ipAddress, userAgent } = params;

    try {
      return await db.transaction(async (tx) => {
        // 1. Récupérer la session
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

        // 2. Vérifier que c'est bien le caissier de cette session
        if (session.caissierId !== userId) {
          return {
            success: false,
            error: "Vous n'êtes pas le caissier de cette session",
            errorCode: "PERMISSION_DENIED",
          };
        }

        // 3. Vérifier l'état (REQUESTING_FUNDS ou FUNDS_DISPATCHED peuvent être annulés)
        const statutActuel = session.statut;
        if (statutActuel !== "REQUESTING_FUNDS" && statutActuel !== "FUNDS_DISPATCHED") {
          const label = STATUT_SESSION_CAISSE_LABELS[statutActuel as StatutSessionCaisseType] || statutActuel;
          const guidance: Record<string, string> = {
            OPEN: "La session est déjà ouverte et ne peut plus être annulée.",
            CLOSING_COUNT: "La session est en cours de fermeture.",
            CLOSING_VALIDATION: "La session est en cours de fermeture.",
            CLOSED: "Cette session est déjà fermée.",
          };
          const detail = guidance[statutActuel] || "";
          return {
            success: false,
            error: `Impossible d'annuler la demande : la session est actuellement en statut « ${label} ». ${detail}`.trim(),
            errorCode: "INVALID_STATE",
          };
        }

        const isFundsDispatched = statutActuel === "FUNDS_DISPATCHED";
        const cancelReason = reason || "Annulé par le caissier";

        // Variables hoistées pour être accessibles dans la section WS (étape 7)
        let coffreBalanceAfterReversal: number | null = null;
        let caisseBalanceAfterReversal: number | null = null;
        let reversalCoffreId: string | null = null;
        let reversalMontant = 0;

        // 4. Annuler le transfert associé et restituer les fonds au coffre si nécessaire
        if (session.openingTransfertId) {
          // Récupérer le transfert dans la transaction pour le traiter directement
          const [transfert] = await tx
            .select()
            .from(transfertsCoffreCaisse)
            .where(eq(transfertsCoffreCaisse.id, session.openingTransfertId))
            .for("update");

          if (transfert) {
            const montant = Number(transfert.montant);
            const wasExecuted = transfert.statut === StatutTransfertCoffre.EXECUTED || !!transfert.executedAt;
            const isCoffreSource = transfert.typeTransfert === "COFFRE_VERS_CAISSE";
            reversalMontant = montant;
            reversalCoffreId = transfert.coffreId;
            if (wasExecuted && isCoffreSource && montant > 0) {
              // Re-créditer le coffre-fort (annuler le débit)
              const coffreResult = await updateCoffreBalance(tx, transfert.coffreId, +montant);
              coffreBalanceAfterReversal = Number(coffreResult.solde);

              // Re-débiter la caisse (annuler le crédit)
              const caisseResult = await updateCaisseBalance(tx, transfert.caisseId, -montant);
              caisseBalanceAfterReversal = Number(caisseResult.solde);

              // Créer les mouvements d'annulation dans le ledger
              const refPrefix = `ANN-${Date.now().toString().slice(-6)}`;

              const [mouvementCoffreCredit] = await tx.insert(mouvementsFinanciers).values({
                montant: montant.toString(),
                sens: "CREDIT",
                sourceModule: "TRANSFERT",
                agenceId: transfert.agenceId,
                reference: `${refPrefix}-COFFRE-CREDIT`,
                idempotencyKey: `${transfert.id}-cancel-coffre-credit`,
                statut: StatutTransaction.POSTED,
                dateOperation: new Date(),
                metadata: {
                  transfertId: transfert.id,
                  coffreId: transfert.coffreId,
                  type: "RESTITUTION_COFFRE",
                  description: `Restitution coffre: annulation ouverture caisse — ${cancelReason}`,
                  categorie: "Annulation Transfert",
                  sessionId,
                },
              }).returning();

              const [mouvementCaisseDebit] = await tx.insert(mouvementsFinanciers).values({
                montant: montant.toString(),
                sens: "DEBIT",
                sourceModule: "TRANSFERT",
                agenceId: transfert.agenceId,
                reference: `${refPrefix}-CAISSE-DEBIT`,
                idempotencyKey: `${transfert.id}-cancel-caisse-debit`,
                statut: StatutTransaction.POSTED,
                dateOperation: new Date(),
                metadata: {
                  transfertId: transfert.id,
                  caisseId: transfert.caisseId,
                  type: "RESTITUTION_CAISSE",
                  description: `Reprise fonds caisse: annulation ouverture — ${cancelReason}`,
                  categorie: "Annulation Transfert",
                  sessionId,
                },
              }).returning();

              // Post GL entries for reversal mouvements (non-blocking)
              const agenceId = transfert.agenceId;
              if (agenceId) {
                for (const mouvement of [mouvementCoffreCredit, mouvementCaisseDebit]) {
                  try {
                    const glResult = await postGlForMouvement(tx, mouvement, agenceId, userId, {
                      operationType: 'RESTITUTION',
                      sessionId,
                    });
                    if (glResult) {
                      logger.info({ mouvementId: mouvement.id, numeroPiece: glResult.numeroPiece }, 'GL posted for session cancellation');
                    }
                    await tx
                      .update(mouvementsFinanciers)
                      .set({ glPostingStatus: "POSTED" })
                      .where(eq(mouvementsFinanciers.id, mouvement.id));
                  } catch (glError: unknown) {
                    const message = glError instanceof Error ? glError.message : "Unknown GL error";
                    const status = glError instanceof AccountingRuleNotFoundError ? "SKIPPED" : "FAILED";
                    logger.warn({ mouvementId: mouvement.id, error: message }, `GL ${status.toLowerCase()} for session cancellation`);
                    await tx
                      .update(mouvementsFinanciers)
                      .set({ glPostingStatus: status, glPostingError: message })
                      .where(eq(mouvementsFinanciers.id, mouvement.id));
                  }
                }
              }
            }

            // Annuler le transfert (REQUESTED/VALIDATED/EXECUTED → CANCELLED)
            await tx
              .update(transfertsCoffreCaisse)
              .set({
                statut: StatutTransfertCoffre.CANCELLED,
                reasonRejection: isFundsDispatched
                  ? `Restitution coffre-fort: ${cancelReason}`
                  : cancelReason,
                updatedAt: new Date(),
              })
              .where(eq(transfertsCoffreCaisse.id, session.openingTransfertId));

            // Audit côté transfert
            await tx.insert(transfertsCoffreAuditLogs).values({
              transfertId: session.openingTransfertId,
              action: wasExecuted ? "RESTITUTION_EXECUTED" : (isFundsDispatched ? "RESTITUTION_COFFRE" : "CANCELLED"),
              statutAvant: transfert.statut,
              statutApres: StatutTransfertCoffre.CANCELLED,
              details: {
                reason: cancelReason,
                restitution: isFundsDispatched || wasExecuted,
                reversed: wasExecuted,
                montant,
                caisseId: transfert.caisseId,
                coffreId: transfert.coffreId,
                sessionId,
              },
              userId,
              ipAddress,
              userAgent,
            });
          }
        }

        // 4b. Annuler toutes les opérations liées à cette session
        //     Sans ceci, les opérations POSTED de la session annulée polluent
        //     le dashboard caisse des sessions suivantes sur la même caisse physique.
        await tx
          .update(operationsCaisse)
          .set({
            statut: StatutTransaction.CANCELLED as any,
            annulledAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(operationsCaisse.sessionId, sessionId));

        // 5. Fermer la session
        //    IMPORTANT: Remettre à zéro les montants et openedAt car la caisse n'a jamais
        //    réellement ouvert. Sans ceci, la query dashboard comptabilise un solde fantôme
        //    via montantFermetureTheorique de la session.
        await tx
          .update(sessionsCaisse)
          .set({
            statut: "CLOSED" as any,
            closedAt: new Date(),
            openedAt: null,
            montantOuverture: "0",
            montantFermetureTheorique: "0",
            observations: isFundsDispatched
              ? `Ouverture annulée après envoi des fonds: ${cancelReason}. Fonds restitués au coffre-fort.`
              : `Demande annulée: ${cancelReason}`,
            updatedAt: new Date(),
          })
          .where(eq(sessionsCaisse.id, sessionId));

        // 6. Log d'audit côté session
        await tx.insert(sessionsCaisseAuditLogs).values({
          sessionId,
          action: isFundsDispatched ? "OPENING_CANCELLED_FUNDS_RETURNED" : "REQUEST_CANCELLED",
          statutAvant: statutActuel,
          statutApres: "CLOSED",
          details: {
            reason: cancelReason,
            restitution: isFundsDispatched,
            montant: isFundsDispatched ? Number(session.montantDemande) : undefined,
          },
          userId,
          ipAddress,
          userAgent,
        });

        // 7. Notifications temps réel (caisse + coffre + agence)
        try {
          const ws = getWsInstance();
          if (ws && session.agenceId) {
            const cancelType = isFundsDispatched ? 'OPENING_CANCELLED_FUNDS_RETURNED' : 'OPENING_CANCELLED';
            const montant = Number(session.montantDemande || 0);

            // A. Notifier le hook WS dédié caisse (toasts + callbacks onCaisseUpdate)
            ws.broadcastToAggregate('caisse', session.caisseId, {
              type: 'CAISSE_UPDATE',
              payload: {
                caisseId: session.caisseId,
                type: cancelType,
                sessionId,
                montant,
                restitution: isFundsDispatched,
              }
            });

            // B. Invalider les queries caisse pour TOUS les clients de l'agence
            //    (WebSocketContext gère CAISSE_UPDATE → invalidate sessions, active, pending, etc.)
            ws.broadcastToAgency(session.agenceId, {
              type: 'CAISSE_UPDATE',
              payload: {
                caisseId: session.caisseId,
                type: cancelType,
                sessionId,
                montant,
                restitution: isFundsDispatched,
              }
            });

            // C. Invalider les queries coffre pour TOUS les clients de l'agence
            //    (WebSocketContext gère REALTIME_EVENT coffre → invalidate transferts, stats, mouvements)
            ws.broadcastToAgency(session.agenceId, {
              type: 'REALTIME_EVENT',
              payload: {
                aggregateType: 'coffre',
                aggregateId: session.agenceId,
                event: cancelType,
                sessionId,
                caisseId: session.caisseId,
                montant,
                restitution: isFundsDispatched,
              }
            });

            // D. Activité en temps réel (fil d'activité agence)
            ws.broadcastToAgency(session.agenceId, {
              type: 'LIVE_ACTIVITY',
              payload: {
                action: isFundsDispatched
                  ? `Ouverture annulée — Fonds restitués au coffre: ${montant.toLocaleString()} FCFA`
                  : `Demande d'ouverture annulée par le caissier`,
                type: 'cancellation',
                timestamp: new Date().toISOString(),
              }
            });

            // E. BALANCE_UPDATED pour le dashboard principal (encaisse disponible)
            //    Sans ceci, le dashboard ne rafraîchit pas en temps réel après annulation
            if (coffreBalanceAfterReversal !== null && reversalCoffreId) {
              balanceService.broadcastBalanceUpdate({
                entityType: 'coffre',
                entityId: reversalCoffreId,
                agenceId: session.agenceId,
                newBalance: coffreBalanceAfterReversal,
                previousBalance: coffreBalanceAfterReversal - reversalMontant,
                mouvementRef: `ANN-COFFRE-${session.id}`,
                sourceModule: 'TRANSFERT',
                typePaiement: 'RESTITUTION_COFFRE',
              });
            }
            if (caisseBalanceAfterReversal !== null) {
              balanceService.broadcastBalanceUpdate({
                entityType: 'caisse',
                entityId: session.caisseId,
                agenceId: session.agenceId,
                newBalance: caisseBalanceAfterReversal,
                previousBalance: caisseBalanceAfterReversal + reversalMontant,
                mouvementRef: `ANN-CAISSE-${session.id}`,
                sourceModule: 'TRANSFERT',
                typePaiement: 'RESTITUTION_CAISSE',
              });
            }
          }
        } catch (wsError) {
          logger.error({ err: wsError }, 'WebSocket notification failed');
        }

        return { success: true };
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Error in cancelOpeningRequest');
      return {
        success: false,
        error: error.message || "Erreur interne",
        errorCode: "DB_ERROR",
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Récupérer la session en attente d'un utilisateur
  // ─────────────────────────────────────────────────────────────────────────
  async getPendingSession(userId: string) {
    const [session] = await db
      .select()
      .from(sessionsCaisse)
      .where(
        and(
          eq(sessionsCaisse.caissierId, userId),
          isNull(sessionsCaisse.closedAt),
          inArray(sessionsCaisse.statut, [
            "REQUESTING_FUNDS",
            "FUNDS_DISPATCHED",
          ] as any)
        )
      )
      .limit(1);

    if (!session) return null;

    // Enrichir avec les infos du transfert
    let transfert = null;
    if (session.openingTransfertId) {
      [transfert] = await db
        .select()
        .from(transfertsCoffreCaisse)
        .where(eq(transfertsCoffreCaisse.id, session.openingTransfertId));
    }

    // Enrichir avec les infos de la caisse
    const [caisse] = await db
      .select()
      .from(caisses)
      .where(eq(caisses.id, session.caisseId));

    return {
      ...session,
      transfert,
      caisse,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Récupérer les demandes d'ouverture en attente (pour le dashboard coffre)
  // ─────────────────────────────────────────────────────────────────────────
  async getPendingOpeningRequests(agenceId: string) {
    const requests = await db
      .select({
        transfert: transfertsCoffreCaisse,
        session: sessionsCaisse,
      })
      .from(transfertsCoffreCaisse)
      .innerJoin(
        sessionsCaisse,
        eq(transfertsCoffreCaisse.sessionOuvertureId, sessionsCaisse.id)
      )
      .where(
        and(
          eq(transfertsCoffreCaisse.agenceId, agenceId),
          eq(transfertsCoffreCaisse.isOpeningFund, true),
          eq(transfertsCoffreCaisse.statut, StatutTransfertCoffre.REQUESTED as any)
        )
      )
      .orderBy(desc(transfertsCoffreCaisse.createdAt));

    // Enrichir avec les noms des caissiers et des caisses
    const enriched = await Promise.all(
      requests.map(async (req) => {
        const [caissier] = await db
          .select({ nom: users.nom, prenom: users.prenom })
          .from(users)
          .where(eq(users.id, req.session.caissierId));

        const [caisse] = await db
          .select({ nom: caisses.nom })
          .from(caisses)
          .where(eq(caisses.id, req.transfert.caisseId));

        return {
          ...req,
          caissierNom: caissier?.nom,
          caissierPrenom: caissier?.prenom,
          caisseNom: caisse?.nom,
        };
      })
    );

    return enriched;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // OUVERTURE DIRECTE: Sans passer par le workflow coffre
  // ─────────────────────────────────────────────────────────────────────────
  /**
   * Permet d'ouvrir une session directement sans passer par le workflow coffre.
   *
   * Cas d'usage:
   * - Le caissier a un fonds de roulement reporté de la veille
   * - Le caissier souhaite ouvrir sa caisse à 0 FCFA (sans approvisionnement)
   */
  async openDirectWithExistingFunds(params: {
    caissierId: string;
    caisseId: string;
    agenceId: string;
    observations?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{
    success: boolean;
    session?: any;
    error?: string;
    errorCode?: string;
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
              isNull(sessionsCaisse.closedAt),
              inArray(sessionsCaisse.statut, [
                "REQUESTING_FUNDS",
                "FUNDS_DISPATCHED",
                "OPEN",
                "CLOSING_COUNT",
                "CLOSING_VALIDATION",
              ] as any)
            )
          )
          .limit(1);

        if (existingCaisseSession.length > 0) {
          return {
            success: false,
            error: "Cette caisse a déjà une session active",
            errorCode: "CAISSE_OCCUPIED",
          };
        }

        // 3. Vérifier que le caissier n'a pas d'autre session active
        const existingUserSession = await tx
          .select()
          .from(sessionsCaisse)
          .where(
            and(
              eq(sessionsCaisse.caissierId, caissierId),
              isNull(sessionsCaisse.closedAt),
              inArray(sessionsCaisse.statut, [
                "REQUESTING_FUNDS",
                "FUNDS_DISPATCHED",
                "OPEN",
                "CLOSING_COUNT",
                "CLOSING_VALIDATION",
              ] as any)
            )
          )
          .limit(1);

        if (existingUserSession.length > 0) {
          return {
            success: false,
            error: "Vous avez déjà une session active",
            errorCode: "USER_HAS_SESSION",
          };
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
            statut: "OPEN" as any,
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
    } catch (error: any) {
      logger.error({ err: error }, 'Error in openDirectWithExistingFunds');
      return {
        success: false,
        error: error.message || "Erreur interne",
        errorCode: "DB_ERROR",
      };
    }
  }
}

// Export singleton
export const sessionOpeningService = new SessionOpeningService();
