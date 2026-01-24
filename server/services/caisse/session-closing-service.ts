/**
 * Service de Workflow Sécurisé de Fermeture de Caisse (Caisse → Coffre)
 *
 * Implémente le workflow en 3 phases:
 * - Phase A: Gel de la session (CLOSING_COUNT) - Plus de transactions autorisées
 * - Phase B: Comptage à l'aveugle (CLOSING_VALIDATION) - Comparaison avec solde théorique
 * - Phase C: Décision de trésorerie et clôture (CLOSED) - Transfert vers coffre ou report
 *
 * RÈGLE D'OR: L'argent compté physiquement doit correspondre à:
 * MontantVersCoffre + MontantReporte = TotalPhysique
 *
 * CONTRAINTE D'AUDIT: Une fois le comptage soumis, impossible de revenir en arrière
 * pour cacher un écart de caisse.
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
  mouvementsFinanciers,
  operationsCaisse,
  comptageBillets,
} from "@shared/schema";
import { eq, and, isNull, desc, sql, count } from "drizzle-orm";
import { StatutTransfertCoffre, StatutCaisse, isOperationCaisseEntree } from "@shared/enum/status-constants";
import { TransfertCoffreService } from "../coffre/transfert-service";
import { calculateBilletageTotal } from "./session-service";
import { createMouvementFinancier } from "../ledger";

// ============================================================================
// TYPES
// ============================================================================

export interface InitiateCloseParams {
  sessionId: string;
  caissierId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface InitiateCloseResult {
  success: boolean;
  session?: any;
  error?: string;
  errorCode?:
    | "SESSION_NOT_FOUND"
    | "NOT_YOUR_SESSION"
    | "INVALID_STATUS"
    | "PENDING_TRANSACTIONS"
    | "DB_ERROR";
}

export interface SubmitCountParams {
  sessionId: string;
  caissierId: string;
  billetageFermeture: Record<string, number>;
  ecartJustification?: string; // Obligatoire si écart != 0
  ipAddress?: string;
  userAgent?: string;
}

export interface SubmitCountResult {
  success: boolean;
  session?: any;
  soldeTheorique?: number;
  montantPhysique?: number;
  ecart?: number;
  error?: string;
  errorCode?:
    | "SESSION_NOT_FOUND"
    | "NOT_YOUR_SESSION"
    | "INVALID_STATUS"
    | "MISSING_JUSTIFICATION"
    | "DB_ERROR";
}

export interface FinalizeCloseParams {
  sessionId: string;
  caissierId: string;
  montantVersCoffre: number;
  montantReporte: number;
  observations?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface FinalizeCloseResult {
  success: boolean;
  session?: any;
  transfert?: any;
  bordereauUrl?: string;
  error?: string;
  errorCode?:
    | "SESSION_NOT_FOUND"
    | "NOT_YOUR_SESSION"
    | "INVALID_STATUS"
    | "AMOUNT_MISMATCH"
    | "COFFRE_NOT_FOUND"
    | "DB_ERROR";
}

export interface ValidateClosingTransferParams {
  transfertId: string;
  validatorId: string;
  approved: boolean;
  reasonRejection?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface ValidateClosingTransferResult {
  success: boolean;
  session?: any;
  transfert?: any;
  error?: string;
  errorCode?: string;
}

// ============================================================================
// CONSTANTES
// ============================================================================

// Seuil d'écart considéré comme "mineur" (en FCFA)
const ECART_MINEUR_SEUIL = 100;

// ============================================================================
// SERVICE
// ============================================================================

export class SessionClosingService {
  private transfertService = new TransfertCoffreService();

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE A: Initiation de la fermeture (Gel de la session)
  // ─────────────────────────────────────────────────────────────────────────
  async initiateClose(params: InitiateCloseParams): Promise<InitiateCloseResult> {
    const { sessionId, caissierId, ipAddress, userAgent } = params;

    try {
      return await db.transaction(async (tx) => {
        // 1. Récupérer la session
        const [session] = await tx
          .select()
          .from(sessionsCaisse)
          .where(eq(sessionsCaisse.id, sessionId));

        if (!session) {
          return {
            success: false,
            error: "Session introuvable",
            errorCode: "SESSION_NOT_FOUND" as const,
          };
        }

        // 2. Vérifier que c'est bien la session du caissier
        if (session.caissierId !== caissierId) {
          return {
            success: false,
            error: "Cette session ne vous appartient pas",
            errorCode: "NOT_YOUR_SESSION" as const,
          };
        }

        // 3. Vérifier que la session est en statut OPEN
        if (session.statut !== "OPEN") {
          return {
            success: false,
            error: `Impossible de fermer une session en statut ${session.statut}`,
            errorCode: "INVALID_STATUS" as const,
          };
        }

        // 4. Vérifier qu'il n'y a pas de transactions en attente
        const [pendingCount] = await tx
          .select({ count: count() })
          .from(operationsCaisse)
          .where(
            and(
              eq(operationsCaisse.sessionId, sessionId),
              eq(operationsCaisse.statut, "PENDING" as any)
            )
          );

        if (pendingCount && Number(pendingCount.count) > 0) {
          return {
            success: false,
            error: `${pendingCount.count} transaction(s) en attente. Veuillez les traiter avant de fermer.`,
            errorCode: "PENDING_TRANSACTIONS" as const,
          };
        }

        // 5. Calculer le solde théorique de fermeture
        // Solde théorique = Montant d'ouverture + Entrées - Sorties
        const operations = await tx
          .select()
          .from(operationsCaisse)
          .where(eq(operationsCaisse.sessionId, sessionId));

        let totalEntrees = 0;
        let totalSorties = 0;

        for (const op of operations) {
          const montant = Number(op.montant || 0);
          if (isOperationCaisseEntree(op.typeOperation)) {
            totalEntrees += montant;
          } else {
            totalSorties += montant;
          }
        }

        const montantOuverture = Number(session.montantOuverture || 0);
        const soldeTheorique = montantOuverture + totalEntrees - totalSorties;

        console.log("[SessionClosingService] Calcul solde théorique:", {
          montantOuverture,
          totalEntrees,
          totalSorties,
          soldeTheorique,
        });

        // 6. Geler la session (passer en CLOSING_COUNT) avec le solde théorique calculé
        const [updatedSession] = await tx
          .update(sessionsCaisse)
          .set({
            statut: "CLOSING_COUNT" as any,
            closingInitiatedAt: new Date(),
            montantFermetureTheorique: soldeTheorique.toString(),
            lastActivity: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(sessionsCaisse.id, sessionId))
          .returning();

        // 7. Créer log d'audit
        await tx.insert(sessionsCaisseAuditLogs).values({
          sessionId,
          action: "CLOSING_INITIATED",
          userId: caissierId,
          statutAvant: session.statut,
          statutApres: "CLOSING_COUNT",
          details: {
            montantOuverture,
            totalEntrees,
            totalSorties,
            soldeTheorique,
          },
          ipAddress,
          userAgent,
        });

        return {
          success: true,
          session: updatedSession,
        };
      });
    } catch (error: any) {
      console.error("[SessionClosingService] initiateClose error:", error);
      return {
        success: false,
        error: error.message || "Erreur lors de l'initiation de la fermeture",
        errorCode: "DB_ERROR",
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE B: Soumission du comptage à l'aveugle (Blind Count)
  // ─────────────────────────────────────────────────────────────────────────
  async submitCount(params: SubmitCountParams): Promise<SubmitCountResult> {
    const {
      sessionId,
      caissierId,
      billetageFermeture,
      ecartJustification,
      ipAddress,
      userAgent,
    } = params;

    try {
      return await db.transaction(async (tx) => {
        // 1. Récupérer la session
        const [session] = await tx
          .select()
          .from(sessionsCaisse)
          .where(eq(sessionsCaisse.id, sessionId));

        if (!session) {
          return {
            success: false,
            error: "Session introuvable",
            errorCode: "SESSION_NOT_FOUND" as const,
          };
        }

        // 2. Vérifier que c'est bien la session du caissier
        if (session.caissierId !== caissierId) {
          return {
            success: false,
            error: "Cette session ne vous appartient pas",
            errorCode: "NOT_YOUR_SESSION" as const,
          };
        }

        // 3. Vérifier que la session est en statut CLOSING_COUNT
        if (session.statut !== "CLOSING_COUNT") {
          return {
            success: false,
            error: `La session doit être en phase de comptage. Statut actuel: ${session.statut}`,
            errorCode: "INVALID_STATUS" as const,
          };
        }

        // 4. Calculer le montant physique depuis le billetage
        const montantPhysique = calculateBilletageTotal(billetageFermeture);

        // 5. Récupérer le solde théorique
        const soldeTheorique = Number(session.montantFermetureTheorique || 0);

        // 6. Calculer l'écart
        const ecart = montantPhysique - soldeTheorique;

        // 7. Si écart non-nul, vérifier que la justification est fournie
        if (Math.abs(ecart) > 0 && !ecartJustification?.trim()) {
          return {
            success: false,
            error: `Un écart de ${ecart.toLocaleString('fr-FR')} FCFA a été détecté. Une justification est obligatoire.`,
            errorCode: "MISSING_JUSTIFICATION" as const,
            soldeTheorique,
            montantPhysique,
            ecart,
          };
        }

        // 8. Mettre à jour la session avec les données de comptage
        const [updatedSession] = await tx
          .update(sessionsCaisse)
          .set({
            statut: "CLOSING_VALIDATION" as any,
            billetageFermeture,
            montantFermetureDeclare: montantPhysique.toString(),
            montantPhysique: montantPhysique.toString(),
            ecart: ecart.toString(),
            ecartJustification: ecartJustification || null,
            countSubmittedAt: new Date(),
            lastActivity: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(sessionsCaisse.id, sessionId))
          .returning();

        // 9. Enregistrer le Billetage de Fermeture dans comptage_billets
        await tx.insert(comptageBillets).values({
          sessionId: sessionId,
          typeComptage: "FERMETURE",
          billets10000: billetageFermeture["10000"] || 0,
          billets5000: billetageFermeture["5000"] || 0,
          billets2000: billetageFermeture["2000"] || 0,
          billets1000: billetageFermeture["1000"] || 0,
          billets500: billetageFermeture["500"] || 0,
          pieces250: billetageFermeture["250"] || 0,
          pieces100: billetageFermeture["100"] || 0,
          pieces50: billetageFermeture["50"] || 0,
          pieces25: billetageFermeture["25"] || 0,
          totalCalcule: montantPhysique.toString(),
          totalDeclare: montantPhysique.toString(),
          ecart: ecart.toString(),
          observations: ecartJustification || "Billetage de fermeture de session",
        });

        // 10. Créer log d'audit
        await tx.insert(sessionsCaisseAuditLogs).values({
          sessionId,
          action: "COUNT_SUBMITTED",
          userId: caissierId,
          statutAvant: session.statut,
          statutApres: "CLOSING_VALIDATION",
          details: {
            montantPhysique,
            soldeTheorique,
            ecart,
            ecartJustification,
          },
          ipAddress,
          userAgent,
        });

        // 11. Si écart significatif, créer une entrée dans l'historique des écarts
        if (Math.abs(ecart) > ECART_MINEUR_SEUIL) {
          await this.recordEcartAudit(tx, {
            sessionId,
            caissierId,
            agenceId: session.agenceId || undefined,
            soldeTheorique,
            montantPhysique,
            ecart,
            justification: ecartJustification || "",
            ipAddress,
            userAgent,
          });
        }

        return {
          success: true,
          session: updatedSession,
          soldeTheorique,
          montantPhysique,
          ecart,
        };
      });
    } catch (error: any) {
      console.error("[SessionClosingService] submitCount error:", error);
      return {
        success: false,
        error: error.message || "Erreur lors de la soumission du comptage",
        errorCode: "DB_ERROR",
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE C: Finalisation de la fermeture (Décision de trésorerie)
  // ─────────────────────────────────────────────────────────────────────────
  async finalizeClose(params: FinalizeCloseParams): Promise<FinalizeCloseResult> {
    const {
      sessionId,
      caissierId,
      montantVersCoffre,
      montantReporte,
      observations,
      ipAddress,
      userAgent,
    } = params;

    try {
      return await db.transaction(async (tx) => {
        // 1. Récupérer la session
        const [session] = await tx
          .select()
          .from(sessionsCaisse)
          .where(eq(sessionsCaisse.id, sessionId));

        if (!session) {
          return {
            success: false,
            error: "Session introuvable",
            errorCode: "SESSION_NOT_FOUND" as const,
          };
        }

        // 2. Vérifier que c'est bien la session du caissier
        if (session.caissierId !== caissierId) {
          return {
            success: false,
            error: "Cette session ne vous appartient pas",
            errorCode: "NOT_YOUR_SESSION" as const,
          };
        }

        // 3. Vérifier que la session est en statut CLOSING_VALIDATION
        if (session.statut !== "CLOSING_VALIDATION") {
          return {
            success: false,
            error: `La session doit être en phase de validation. Statut actuel: ${session.statut}`,
            errorCode: "INVALID_STATUS" as const,
          };
        }

        // 4. Vérifier la cohérence des montants
        // MontantVersCoffre + MontantReporte DOIT = MontantPhysique
        const montantPhysique = Number(session.montantPhysique || 0);
        const totalDecision = montantVersCoffre + montantReporte;

        if (Math.abs(totalDecision - montantPhysique) > 1) {
          // Tolérance de 1 FCFA pour les arrondis
          return {
            success: false,
            error: `La somme (${totalDecision.toLocaleString('fr-FR')} FCFA) ne correspond pas au montant physique compté (${montantPhysique.toLocaleString('fr-FR')} FCFA)`,
            errorCode: "AMOUNT_MISMATCH" as const,
          };
        }

        let closingTransfert = null;

        // 5. Si transfert vers coffre, créer le transfert
        if (montantVersCoffre > 0) {
          // Récupérer le coffre-fort de l'agence
          const coffreFort = await this.transfertService.getOrCreateCoffreFort(
            session.agenceId!
          );

          if (!coffreFort) {
            return {
              success: false,
              error: "Coffre-fort introuvable pour cette agence",
              errorCode: "COFFRE_NOT_FOUND" as const,
            };
          }

          // Générer une référence unique pour le transfert
          const transfertReference = `TRF-CLS-${Date.now().toString(36).toUpperCase()}-${sessionId.substring(0, 4).toUpperCase()}`;

          // Créer le transfert CAISSE → COFFRE
          const [transfert] = await tx
            .insert(transfertsCoffreCaisse)
            .values({
              agenceId: session.agenceId!,
              coffreId: coffreFort.id,
              caisseId: session.caisseId,
              typeTransfert: "CAISSE_VERS_COFFRE" as any,
              montant: montantVersCoffre.toString(),
              motif: `Remise de clôture - Session ${sessionId.substring(0, 8)}`,
              reference: transfertReference,
              statut: StatutTransfertCoffre.REQUESTED as any,
              requestedBy: caissierId,
              sessionOuvertureId: null,
              isOpeningFund: false,
            })
            .returning();

          closingTransfert = transfert;

          // Log d'audit du transfert
          await tx.insert(transfertsCoffreAuditLogs).values({
            transfertId: transfert.id,
            action: "CREATED",
            userId: caissierId,
            statutApres: StatutTransfertCoffre.REQUESTED,
            details: {
              montant: montantVersCoffre,
              type: "CAISSE_VERS_COFFRE",
              motif: "Remise de clôture",
              sessionId,
            },
            ipAddress,
            userAgent,
          });
        }

        // 6. Si écart non-nul, créer l'écriture comptable d'écart
        const ecart = Number(session.ecart || 0);
        if (Math.abs(ecart) > 0) {
          await this.createEcartComptable(tx, {
            sessionId,
            caissierId,
            agenceId: session.agenceId!,
            caisseId: session.caisseId,
            ecart,
            justification: session.ecartJustification || "",
            ipAddress,
            userAgent,
          });
        }

        // 7. Mettre à jour la caisse physique
        // Le solde de la caisse = montant reporté (ce qui reste pour demain)
        // CRITIQUE: Mettre le statut à CLOSED et libérer le verrouillage
        await tx
          .update(caisses)
          .set({
            solde: montantReporte.toString(),
            statut: StatutCaisse.CLOSED, // CRITIQUE: Synchroniser le statut
            updatedAt: new Date(),
          })
          .where(eq(caisses.id, session.caisseId));

        // 8. Fermer définitivement la session
        const [updatedSession] = await tx
          .update(sessionsCaisse)
          .set({
            statut: "CLOSED" as any,
            closedAt: new Date(),
            closingFinalizedAt: new Date(),
            montantVersCoffre: montantVersCoffre.toString(),
            montantReporte: montantReporte.toString(),
            closingTransfertId: closingTransfert?.id || null,
            coffreValidationStatus: montantVersCoffre > 0 ? "PENDING" : null,
            fundsKeptInCaisse: montantReporte > 0,
            observations: observations
              ? `${session.observations || ""}\n[Clôture] ${observations}`.trim()
              : session.observations,
            lastActivity: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(sessionsCaisse.id, sessionId))
          .returning();

        // 9. Créer log d'audit
        await tx.insert(sessionsCaisseAuditLogs).values({
          sessionId,
          action: "CLOSED",
          userId: caissierId,
          statutAvant: session.statut,
          statutApres: "CLOSED",
          details: {
            montantVersCoffre,
            montantReporte,
            closingTransfertId: closingTransfert?.id,
          },
          ipAddress,
          userAgent,
        });

        return {
          success: true,
          session: updatedSession,
          transfert: closingTransfert,
        };
      });
    } catch (error: any) {
      console.error("[SessionClosingService] finalizeClose error:", error);
      return {
        success: false,
        error: error.message || "Erreur lors de la finalisation de la fermeture",
        errorCode: "DB_ERROR",
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Validation du transfert de clôture par le responsable coffre
  // ─────────────────────────────────────────────────────────────────────────
  async validateClosingTransfer(
    params: ValidateClosingTransferParams
  ): Promise<ValidateClosingTransferResult> {
    const { transfertId, validatorId, approved, reasonRejection, ipAddress, userAgent } =
      params;

    try {
      return await db.transaction(async (tx) => {
        // 1. Récupérer le transfert
        const [transfert] = await tx
          .select()
          .from(transfertsCoffreCaisse)
          .where(eq(transfertsCoffreCaisse.id, transfertId));

        if (!transfert) {
          return {
            success: false,
            error: "Transfert introuvable",
            errorCode: "TRANSFERT_NOT_FOUND",
          };
        }

        // 2. Vérifier que c'est un transfert de fermeture
        if (transfert.typeTransfert !== "CAISSE_VERS_COFFRE") {
          return {
            success: false,
            error: "Ce n'est pas un transfert de fermeture",
            errorCode: "INVALID_TRANSFER_TYPE",
          };
        }

        // 3. Vérifier le statut
        if (transfert.statut !== StatutTransfertCoffre.REQUESTED) {
          return {
            success: false,
            error: `Transfert déjà traité (statut: ${transfert.statut})`,
            errorCode: "ALREADY_PROCESSED",
          };
        }

        // 4. Vérifier que le validateur n'est pas l'initiateur
        if (transfert.requestedBy === validatorId) {
          return {
            success: false,
            error: "Vous ne pouvez pas valider votre propre transfert",
            errorCode: "SELF_VALIDATION",
          };
        }

        // 5. Récupérer la session liée
        const [session] = await tx
          .select()
          .from(sessionsCaisse)
          .where(eq(sessionsCaisse.closingTransfertId, transfertId));

        if (approved) {
          // Valider et exécuter le transfert
          const validateResult = await this.transfertService.validateTransfert({
            transfertId,
            validatorId,
            approved: true,
            ipAddress,
            userAgent,
          });

          if (!validateResult.success) {
            return validateResult;
          }

          // Exécuter le transfert
          const executeResult = await this.transfertService.executeTransfert({
            transfertId,
            executorId: validatorId,
            ipAddress,
            userAgent,
          });

          if (!executeResult.success || !("transfert" in executeResult)) {
            return {
              success: false,
              error: "error" in executeResult ? executeResult.error : "Erreur d'exécution",
              errorCode: "errorCode" in executeResult ? executeResult.errorCode : "EXECUTE_ERROR",
            };
          }

          // Mettre à jour la session
          if (session) {
            await tx
              .update(sessionsCaisse)
              .set({
                coffreValidationStatus: "APPROVED",
                coffreValidatedBy: validatorId,
                coffreValidatedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(sessionsCaisse.id, session.id));
          }

          return {
            success: true,
            session,
            transfert: executeResult.transfert,
          };
        } else {
          // Rejeter le transfert
          await tx
            .update(transfertsCoffreCaisse)
            .set({
              statut: StatutTransfertCoffre.REJECTED as any,
              validatedBy: validatorId,
              validatedAt: new Date(),
              reasonRejection: reasonRejection,
              updatedAt: new Date(),
            })
            .where(eq(transfertsCoffreCaisse.id, transfertId));

          // Mettre à jour la session
          if (session) {
            await tx
              .update(sessionsCaisse)
              .set({
                coffreValidationStatus: "REJECTED",
                coffreValidatedBy: validatorId,
                coffreValidatedAt: new Date(),
                observations: `${session.observations || ""}\n[Coffre Rejet] ${reasonRejection}`.trim(),
                updatedAt: new Date(),
              })
              .where(eq(sessionsCaisse.id, session.id));
          }

          // Log d'audit
          await tx.insert(transfertsCoffreAuditLogs).values({
            transfertId,
            action: "REJECTED",
            userId: validatorId,
            statutAvant: StatutTransfertCoffre.REQUESTED,
            statutApres: StatutTransfertCoffre.REJECTED,
            details: { reasonRejection },
            ipAddress,
            userAgent,
          });

          return {
            success: true,
            session,
            transfert: { ...transfert, statut: StatutTransfertCoffre.REJECTED },
          };
        }
      });
    } catch (error: any) {
      console.error("[SessionClosingService] validateClosingTransfer error:", error);
      return {
        success: false,
        error: error.message || "Erreur lors de la validation du transfert",
        errorCode: "DB_ERROR",
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Annuler le processus de fermeture (revenir à OPEN)
  // Uniquement possible en phase CLOSING_COUNT
  // ─────────────────────────────────────────────────────────────────────────
  async cancelClose(params: {
    sessionId: string;
    caissierId: string;
    reason?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ success: boolean; session?: any; error?: string; errorCode?: string }> {
    const { sessionId, caissierId, reason, ipAddress, userAgent } = params;

    try {
      return await db.transaction(async (tx) => {
        const [session] = await tx
          .select()
          .from(sessionsCaisse)
          .where(eq(sessionsCaisse.id, sessionId));

        if (!session) {
          return { success: false, error: "Session introuvable", errorCode: "SESSION_NOT_FOUND" };
        }

        if (session.caissierId !== caissierId) {
          return { success: false, error: "Cette session ne vous appartient pas", errorCode: "NOT_YOUR_SESSION" };
        }

        // Ne peut annuler que si en CLOSING_COUNT
        if (session.statut !== "CLOSING_COUNT") {
          return {
            success: false,
            error: "Impossible d'annuler la fermeture à ce stade. Le comptage a déjà été validé.",
            errorCode: "INVALID_STATUS",
          };
        }

        const [updatedSession] = await tx
          .update(sessionsCaisse)
          .set({
            statut: "OPEN" as any,
            closingInitiatedAt: null,
            lastActivity: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(sessionsCaisse.id, sessionId))
          .returning();

        await tx.insert(sessionsCaisseAuditLogs).values({
          sessionId,
          action: "CLOSING_CANCELLED",
          userId: caissierId,
          statutAvant: "CLOSING_COUNT",
          statutApres: "OPEN",
          details: { reason },
          ipAddress,
          userAgent,
        });

        return { success: true, session: updatedSession };
      });
    } catch (error: any) {
      return { success: false, error: error.message, errorCode: "DB_ERROR" };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Récupérer les sessions en cours de fermeture (pour supervision)
  // ─────────────────────────────────────────────────────────────────────────
  async getClosingSessionsForAgence(agenceId: string): Promise<any[]> {
    const sessions = await db
      .select({
        session: sessionsCaisse,
        caissier: {
          id: users.id,
          nom: users.nom,
          prenom: users.prenom,
        },
        caisse: {
          id: caisses.id,
          nom: caisses.nom,
        },
      })
      .from(sessionsCaisse)
      .leftJoin(users, eq(sessionsCaisse.caissierId, users.id))
      .leftJoin(caisses, eq(sessionsCaisse.caisseId, caisses.id))
      .where(
        and(
          eq(sessionsCaisse.agenceId, agenceId),
          sql`${sessionsCaisse.statut} IN ('CLOSING_COUNT', 'CLOSING_VALIDATION')`
        )
      )
      .orderBy(desc(sessionsCaisse.closingInitiatedAt));

    return sessions.map((row) => ({
      ...row.session,
      caissierNom: row.caissier ? `${row.caissier.prenom} ${row.caissier.nom}` : null,
      caisseNom: row.caisse?.nom,
    }));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers privés
  // ─────────────────────────────────────────────────────────────────────────

  private async recordEcartAudit(
    tx: any,
    params: {
      sessionId: string;
      caissierId: string;
      agenceId?: string;
      soldeTheorique: number;
      montantPhysique: number;
      ecart: number;
      justification: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<void> {
    // Créer une entrée dans la table d'audit des écarts
    // Note: La table ecarts_caisse_audit doit exister (créée dans la migration)
    try {
      await tx.execute(sql`
        INSERT INTO ecarts_caisse_audit (
          session_id, caissier_id, agence_id,
          solde_theorique, montant_physique, ecart,
          justification, type_ecart, ip_address, user_agent
        ) VALUES (
          ${params.sessionId}, ${params.caissierId}, ${params.agenceId},
          ${params.soldeTheorique}, ${params.montantPhysique}, ${params.ecart},
          ${params.justification}, ${params.ecart > 0 ? "SURPLUS" : "DEFICIT"},
          ${params.ipAddress}, ${params.userAgent}
        )
      `);
    } catch (error) {
      console.warn("[SessionClosingService] Écart audit recording failed (table may not exist):", error);
      // Ne pas bloquer le processus si la table d'audit n'existe pas encore
    }
  }

  private async createEcartComptable(
    tx: any,
    params: {
      sessionId: string;
      caissierId: string;
      agenceId: string;
      caisseId: string;
      ecart: number;
      justification: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<void> {
    const { sessionId, caissierId, agenceId, caisseId, ecart, justification } = params;

    // Déterminer le type d'écriture (produit ou charge exceptionnelle)
    const isExcedent = ecart > 0;
    const montantAbsolu = Math.abs(ecart);

    try {
      // Créer le mouvement financier pour l'écart de caisse
      await createMouvementFinancier(
        tx,
        {
          agenceId,
          sens: isExcedent ? "CREDIT" : "DEBIT",
          montant: montantAbsolu.toString(),
          sourceModule: "CAISSE",
          typePaiement: "INTERNAL_TRANSFER",
          metadata: {
            ecart,
            justification,
            type: isExcedent ? "EXCEDENT_CAISSE" : "DEFICIT_CAISSE",
            sessionId,
          },
        },
        caissierId
      );
    } catch (error) {
      console.error("[SessionClosingService] Écart comptable creation failed:", error);
      // Ne pas bloquer le processus, mais logger l'erreur
    }
  }
}

// Export singleton instance
export const sessionClosingService = new SessionClosingService();
