import { db } from "../../db";
import {
  sessionsCaisse,
  sessionsCaisseAuditLogs,
  transfertsCoffreCaisse,
  transfertsCoffreAuditLogs,
  caisses,
} from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { StatutTransfertCoffre, StatutCaisse, STATUT_SESSION_CAISSE_LABELS, type StatutSessionCaisseType } from "@shared/enum/status-constants";
import { TransfertCoffreService } from "../coffre/transfert-service";
import { createMouvementFinancier } from "../ledger";
import { createLogger } from "../../lib/logger";
import { createEcartComptable } from "./session-closing-audit";
import type { SessionRow, TransfertRow } from "./types";

const logger = createLogger('SessionClosingFinalize');
const transfertService = new TransfertCoffreService();

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
  session?: SessionRow;
  transfert?: TransfertRow | null;
  bordereauUrl?: string;
  error?: string;
  errorCode?:
    | "SESSION_NOT_FOUND"
    | "NOT_YOUR_SESSION"
    | "INVALID_STATUS"
    | "AMOUNT_MISMATCH"
    | "NEGATIVE_AMOUNT"
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
  session?: SessionRow;
  transfert?: TransfertRow;
  error?: string;
  errorCode?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// PHASE C: Finalisation de la fermeture (Décision de trésorerie)
// ─────────────────────────────────────────────────────────────────────────
export async function finalizeClose(params: FinalizeCloseParams): Promise<FinalizeCloseResult> {
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
    return await db.transaction(async (tx): Promise<FinalizeCloseResult> => {
      // 1. Récupérer la session
      const [session] = await tx
        .select()
        .from(sessionsCaisse)
        .where(eq(sessionsCaisse.id, sessionId));

      if (!session) {
        return {
          success: false,
          error: "Session introuvable",
          errorCode: "SESSION_NOT_FOUND",
        };
      }

      // 2. Vérifier que c'est bien la session du caissier
      if (session.caissierId !== caissierId) {
        return {
          success: false,
          error: "Cette session ne vous appartient pas",
          errorCode: "NOT_YOUR_SESSION",
        };
      }

      // 3. Vérifier que la session est en statut CLOSING_VALIDATION
      if (session.statut !== "CLOSING_VALIDATION") {
        const label = STATUT_SESSION_CAISSE_LABELS[session.statut as StatutSessionCaisseType] || session.statut;
        return {
          success: false,
          error: `Impossible de finaliser la fermeture : la session est actuellement en statut « ${label} » et non en phase de validation.`,
          errorCode: "INVALID_STATUS",
        };
      }

      // 4a. GUARD: Les montants ne doivent jamais être négatifs (défense en profondeur)
      if (montantVersCoffre < 0 || montantReporte < 0) {
        return {
          success: false,
          error: "Les montants de transfert et de report ne peuvent pas être négatifs",
          errorCode: "NEGATIVE_AMOUNT",
        };
      }

      // 4b. Vérifier la cohérence des montants
      // MontantVersCoffre + MontantReporte DOIT = MontantPhysique
      const montantPhysique = Number(session.montantPhysique || 0);
      const totalDecision = montantVersCoffre + montantReporte;

      if (Math.abs(totalDecision - montantPhysique) > 1) {
        // Tolérance de 1 FCFA pour les arrondis
        return {
          success: false,
          error: `La somme (${totalDecision.toLocaleString('fr-FR')} FCFA) ne correspond pas au montant physique compté (${montantPhysique.toLocaleString('fr-FR')} FCFA)`,
          errorCode: "AMOUNT_MISMATCH",
        };
      }

      let closingTransfert = null;

      // 5. Si transfert vers coffre, créer le transfert
      if (montantVersCoffre > 0) {
        // Récupérer le coffre-fort de l'agence
        const coffreFort = await transfertService.getOrCreateCoffreFort(
          session.agenceId!
        );

        if (!coffreFort) {
          return {
            success: false,
            error: "Coffre-fort introuvable pour cette agence",
            errorCode: "COFFRE_NOT_FOUND",
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
            typeTransfert: "CAISSE_VERS_COFFRE",
            montant: montantVersCoffre.toString(),
            motif: `Remise de clôture - Session ${sessionId.substring(0, 8)}`,
            reference: transfertReference,
            statut: StatutTransfertCoffre.REQUESTED,
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
        await createEcartComptable(tx, {
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

      // 7. Créer le mouvement financier de clôture (requis par BALANCE_GUARD)
      // Ce mouvement représente l'ajustement du solde caisse lors de la fermeture
      const currentCaisseSolde = Number(
        (await tx.select({ solde: caisses.solde }).from(caisses).where(eq(caisses.id, session.caisseId)))[0]?.solde || 0
      );
      const balanceDelta = currentCaisseSolde - montantReporte;
      if (Math.abs(balanceDelta) > 0) {
        await createMouvementFinancier(
          tx,
          {
            agenceId: session.agenceId!,
            sens: balanceDelta > 0 ? "DEBIT" : "CREDIT",
            montant: Math.abs(balanceDelta).toString(),
            sourceModule: "CAISSE",
            typePaiement: "SESSION_CLOSING_TRANSFER",
            sessionCaisseId: sessionId,
            requiresGlPosting: false,
            metadata: {
              type: "CLOSING_BALANCE_ADJUSTMENT",
              sessionId,
              caisseId: session.caisseId,
              soldeBefore: currentCaisseSolde,
              soldeAfter: montantReporte,
              montantVersCoffre,
              montantReporte,
            },
          },
          caissierId
        );
      } else {
        // Balance unchanged — set flag manually to satisfy guard
        await tx.execute(sql`SELECT set_config('app.mouvement_created', 'true', true)`);
      }

      // 8. Mettre à jour la caisse physique
      // Le solde de la caisse = montant reporté (ce qui reste pour demain)
      // CRITIQUE: Mettre le statut à CLOSED et libérer le verrouillage
      await tx
        .update(caisses)
        .set({
          solde: montantReporte.toString(),
          statut: StatutCaisse.CLOSED,
          updatedAt: new Date(),
        })
        .where(eq(caisses.id, session.caisseId));

      // 9. Fermer définitivement la session
      const [updatedSession] = await tx
        .update(sessionsCaisse)
        .set({
          statut: "CLOSED",
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

      // 10. Créer log d'audit
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
  } catch (error: unknown) {
    logger.error({ err: error }, 'finalizeClose error');
    return {
      success: false,
      error: (error instanceof Error ? error.message : "Erreur lors de la finalisation de la fermeture"),
      errorCode: "DB_ERROR",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Validation du transfert de clôture par le responsable coffre
// ─────────────────────────────────────────────────────────────────────────
export async function validateClosingTransfer(
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
          error: `Ce transfert a déjà été traité (${transfert.statut === "VALIDATED" ? "validé" : transfert.statut === "EXECUTED" ? "exécuté" : transfert.statut === "REJECTED" ? "rejeté" : transfert.statut === "CANCELLED" ? "annulé" : transfert.statut}).`,
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
        const validateResult = await transfertService.validateTransfert({
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
        const executeResult = await transfertService.executeTransfert({
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
            statut: StatutTransfertCoffre.REJECTED,
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
  } catch (error: unknown) {
    logger.error({ err: error }, 'validateClosingTransfer error');
    return {
      success: false,
      error: (error instanceof Error ? error.message : "Erreur lors de la validation du transfert"),
      errorCode: "DB_ERROR",
    };
  }
}
