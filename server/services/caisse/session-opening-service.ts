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
} from "@shared/schema";
import { eq, and, isNull, inArray, desc } from "drizzle-orm";
import { StatutTransfertCoffre } from "@shared/enum/status-constants";
import { TransfertCoffreService } from "../coffre/transfert-service";
import { calculateBilletageTotal } from "./session-service";
import { getWsInstance } from "../../ws-server";

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
        const reference = `OUV-${Date.now().toString().slice(-6)}-${Math.random()
          .toString(36)
          .slice(2, 5)
          .toUpperCase()}`;

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
          console.error("[SessionOpeningService] WebSocket notification failed:", wsError);
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
      console.error("Error in requestSessionOpening:", error);
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
            error: `Le transfert doit être en statut 'REQUESTED' (actuel: ${transfert.statut})`,
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
          console.error("[SessionOpeningService] WebSocket notification failed:", wsError);
        }

        return {
          success: true,
          session: updatedSession,
          transfert: updatedTransfert,
        };
      });
    } catch (error: any) {
      console.error("Error in validateOpeningTransfer:", error);
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
          return {
            success: false,
            error: `Session dans un état invalide: ${session.statut}. Attendu: FUNDS_DISPATCHED`,
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
              console.log("[SessionOpeningService] Transfert déjà exécuté, on continue l'ouverture de session");
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

        // 7. Mettre à jour le solde de la caisse physique
        await tx
          .update(caisses)
          .set({
            solde: soldeOuverture.toString(),
            updatedAt: new Date(),
          })
          .where(eq(caisses.id, session.caisseId));

        // 8. Détecter un éventuel écart entre montant demandé et montant reçu
        const montantDemande = Number(session.montantDemande || 0);
        const ecartReception = montantRecu - montantDemande;
        const hasEcart = Math.abs(ecartReception) > 1; // Tolérance de 1 FCFA

        // 9. Log d'audit
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

        // 10. Notifications WebSocket en temps réel
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
          console.error("[SessionOpeningService] WebSocket notification failed:", wsError);
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
      console.error("Error in receiveFundsAndOpen:", error);
      return {
        success: false,
        error: error.message || "Erreur interne",
        errorCode: "DB_ERROR",
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Annulation d'une demande par le caissier (uniquement si REQUESTING_FUNDS)
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

        // 3. Vérifier l'état (uniquement REQUESTING_FUNDS peut être annulé)
        if (session.statut !== "REQUESTING_FUNDS") {
          return {
            success: false,
            error: `Seules les demandes en attente peuvent être annulées (état actuel: ${session.statut})`,
            errorCode: "INVALID_STATE",
          };
        }

        // 4. Annuler le transfert associé
        if (session.openingTransfertId) {
          await this.transfertService.cancelTransfert({
            transfertId: session.openingTransfertId,
            cancelledBy: userId,
            reason: reason || "Annulé par le caissier",
            ipAddress,
            userAgent,
          });
        }

        // 5. Fermer la session
        await tx
          .update(sessionsCaisse)
          .set({
            closedAt: new Date(),
            observations: `Demande annulée: ${reason || "À la demande du caissier"}`,
            updatedAt: new Date(),
          })
          .where(eq(sessionsCaisse.id, sessionId));

        // 6. Log d'audit
        await tx.insert(sessionsCaisseAuditLogs).values({
          sessionId,
          action: "REQUEST_CANCELLED",
          statutAvant: "REQUESTING_FUNDS",
          statutApres: "CLOSED",
          details: { reason },
          userId,
          ipAddress,
          userAgent,
        });

        return { success: true };
      });
    } catch (error: any) {
      console.error("Error in cancelOpeningRequest:", error);
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
  // OUVERTURE DIRECTE: Avec fonds reporté existants (sans coffre)
  // ─────────────────────────────────────────────────────────────────────────
  /**
   * Permet d'ouvrir une session directement avec le solde existant de la caisse
   * (fonds reporté de la veille) sans passer par le workflow coffre.
   *
   * Cas d'usage: Le caissier a laissé un fonds de roulement lors de la fermeture
   * et souhaite reprendre son travail sans approvisionnement supplémentaire.
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
        // 1. Récupérer la caisse et vérifier qu'elle a un solde > 0
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
        if (soldeExistant <= 0) {
          return {
            success: false,
            error: "La caisse n'a pas de fonds reporté. Veuillez demander un approvisionnement au coffre.",
            errorCode: "NO_EXISTING_FUNDS",
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
            soldeVeille: soldeExistant.toString(), // Le solde vient de la veille (fonds reporté)
            billetageOuverture: {}, // Pas de billetage à compter, c'est le fonds reporté
            openedAt: new Date(),
            timeoutAt,
            observations: observations
              ? `[Ouverture directe] ${observations}`
              : "[Ouverture directe avec fonds reporté]",
            lastActivity: new Date(),
          })
          .returning();

        // 6. Log d'audit
        await tx.insert(sessionsCaisseAuditLogs).values({
          sessionId: newSession.id,
          action: "DIRECT_OPEN",
          userId: caissierId,
          statutAvant: null,
          statutApres: "OPEN",
          details: {
            soldeExistant,
            type: "FONDS_REPORTE",
            message: "Ouverture directe avec le fonds reporté de la veille",
          },
          ipAddress,
          userAgent,
        });

        // 7. Notification WebSocket en temps réel
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
                action: `Session ouverte (fonds reporté): ${soldeExistant.toLocaleString()} FCFA`,
                type: 'session',
                timestamp: new Date().toISOString()
              }
            });
          }
        } catch (wsError) {
          console.error("[SessionOpeningService] WebSocket notification failed:", wsError);
        }

        return {
          success: true,
          session: newSession,
        };
      });
    } catch (error: any) {
      console.error("Error in openDirectWithExistingFunds:", error);
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
