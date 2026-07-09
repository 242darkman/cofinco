/**
 * Routes comptes — segment /comptes (partie comptes-admin).
 *
 * Enregistré par l'index comptes.ts dans l'ordre historique.
 * Endpoints :
 *   GET    /api/comptes/admin/reconcile-sens
 *   POST   /api/comptes/:id/suspend
 *   POST   /api/comptes/:id/unsuspend
 *   POST   /api/comptes/:id/closure/initiate
 */
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { logAudit } from "../../audit";
import { normalizeKeysDeep } from "../utils";
import comptesService, { CompteError, suspendCompte, unsuspendCompte } from "../../services/comptes";
import {
  initiateClosureCompte,
  approveClosureCompte,
  cancelClosureCompte,
  getClosureRequest,
  getPendingClosureRequests,
  getClosureFeeForCompte,
  createClosureMoMoPayout,
} from "../../services/compte-closure";
import { mouvementsFinanciers, operationsCaisse, transactionsCompte } from "@shared/schema/finance";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { comptes, produitsCompte, insertProduitCompteSchema, clients, users, virementsProgrammes } from "@shared/schema";
import { getWsInstance } from "../../ws-server";
import type {
  TypeCompteDz,
  SuspensionReasonDz,
  ClosurePayoutMethodDz,
  StatutTransactionDz,
} from "@shared/enum/enums";
import { dispatchDomainEvent } from "../../services/notifications/domain-events/event-registry";
import { logger, suspendSchema, unsuspendSchema, initiateClosureSchema } from "./shared";

export function registerComptesAdminRoutes(app: Express) {
  // ============================================================================
  // RECONCILIATION ENDPOINT
  // ============================================================================

  /**
   * GET /api/comptes/admin/reconcile-sens
   * Vérifie la cohérence entre sens et typePaiement dans transactions_compte
   * Retourne les anomalies détectées et optionnellement les corrige
   */
  /**
   * GET /api/comptes/admin/reconcile-sens
   */
  app.get(
    "/api/comptes/admin/reconcile-sens",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.ALL),
    async (req, res) => {
      try {
        const { fix } = req.query;
        const shouldFix = fix === 'true';

        // Import deriveSensFromType for verification
        const { deriveSensFromType } = await import("@shared/config/transaction-labels");
        const { transactionsCompte } = await import("@shared/schema/finance");

        // Get all transactions with their current sens and typePaiement
        const allTransactions = await db
          .select({
            id: transactionsCompte.id,
            sens: transactionsCompte.sens,
            typePaiement: transactionsCompte.typePaiement,
            compteId: transactionsCompte.compteId,
            createdAt: transactionsCompte.createdAt,
          })
          .from(transactionsCompte)
          .orderBy(desc(transactionsCompte.createdAt));

        // Check for anomalies
        const anomalies: Array<{
          id: string;
          compteId: string;
          typePaiement: string;
          currentSens: string | null;
          expectedSens: string;
          createdAt: Date | null;
        }> = [];

        const stats = {
          total: allTransactions.length,
          withSens: 0,
          withoutSens: 0,
          correct: 0,
          incorrect: 0,
        };

        for (const tx of allTransactions) {
          const expectedSens = deriveSensFromType(tx.typePaiement);

          if (!tx.sens) {
            stats.withoutSens++;
            anomalies.push({
              id: tx.id,
              compteId: tx.compteId,
              typePaiement: tx.typePaiement,
              currentSens: null,
              expectedSens,
              createdAt: tx.createdAt,
            });
          } else {
            stats.withSens++;
            if (tx.sens === expectedSens) {
              stats.correct++;
            } else {
              stats.incorrect++;
              anomalies.push({
                id: tx.id,
                compteId: tx.compteId,
                typePaiement: tx.typePaiement,
                currentSens: tx.sens,
                expectedSens,
                createdAt: tx.createdAt,
              });
            }
          }
        }

        // Fix anomalies if requested
        let fixedCount = 0;
        if (shouldFix && anomalies.length > 0) {
          for (const anomaly of anomalies) {
            await db
              .update(transactionsCompte)
              .set({ sens: anomaly.expectedSens as "DEBIT" | "CREDIT" })
              .where(eq(transactionsCompte.id, anomaly.id));
            fixedCount++;
          }

          await logAudit(
            req,
            "RECONCILE_SENS",
            "transactions_compte",
            "bulk",
            { fixedCount, anomaliesCount: anomalies.length },
            "success",
            "medium"
          );
        }

        res.json({
          success: true,
          stats,
          anomaliesCount: anomalies.length,
          anomalies: anomalies.slice(0, 100), // Limit to first 100 for response size
          hasMore: anomalies.length > 100,
          fixed: shouldFix ? fixedCount : 0,
          message: shouldFix
            ? `${fixedCount} transactions corrigées`
            : `${anomalies.length} anomalies détectées. Ajoutez ?fix=true pour corriger.`,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Erreur interne";
        logger.error({ err: error }, 'Error in reconciliation');
        res.status(500).json({ success: false, message });
      }
    }
  );

  // ============================================================================
  // ACCOUNT LIFECYCLE: SUSPENSION / UNSUSPENSION
  // ============================================================================

  /**
   * POST /api/comptes/:id/suspend - Suspendre un compte
   */
  /**
   * POST /api/comptes/:id/suspend
   */
  app.post(
    "/api/comptes/:id/suspend",
    requireAuth,
    attachAbility,
    requireAbility(Actions.SUSPEND, Subjects.COMPTE),
    async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body);
        const parsed = suspendSchema.parse(data);
        const user = req.session.user;

        const compte = await suspendCompte(
          {
            compteId: req.params.id,
            reasonCode: parsed.reasonCode as SuspensionReasonDz,
            reasonText: parsed.reasonText,
            autoLift: parsed.autoLift,
            endDate: parsed.endDate ? new Date(parsed.endDate) : undefined,
            reviewRequired: parsed.reviewRequired,
          },
          user!.id
        );

        await logAudit(
          req,
          "SUSPEND_COMPTE",
          "compte",
          req.params.id,
          { reasonCode: parsed.reasonCode, autoLift: parsed.autoLift },
          "success",
          "high"
        );

        dispatchDomainEvent({
          type: "ACCOUNT_SUSPENDED",
          data: {
            compteId: compte.id,
            numeroCompte: compte.numeroCompte,
            typeCompte: compte.typeCompte,
            clientId: compte.clientId,
            reasonCode: parsed.reasonCode,
            agenceId: compte.agenceId || undefined,
          },
          timestamp: new Date(),
          agenceId: compte.agenceId || undefined,
        });

        res.json({ ...compte, message: "Compte suspendu avec succès" });
      } catch (error: any) {
        if (error instanceof CompteError) {
          return res.status(400).json({ message: error.message, code: error.code });
        }
        logger.error({ err: error }, 'Error suspending compte');
        res.status(500).json({ message: error.message || "Erreur serveur" });
      }
    }
  );

  /**
   * POST /api/comptes/:id/unsuspend - Lever la suspension d'un compte
   */
  /**
   * POST /api/comptes/:id/unsuspend
   */
  app.post(
    "/api/comptes/:id/unsuspend",
    requireAuth,
    attachAbility,
    requireAbility(Actions.UNSUSPEND, Subjects.COMPTE),
    async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body);
        const parsed = unsuspendSchema.parse(data);
        const user = req.session.user;

        const compte = await unsuspendCompte(
          req.params.id,
          parsed.motif,
          user!.id
        );

        await logAudit(
          req,
          "UNSUSPEND_COMPTE",
          "compte",
          req.params.id,
          { motif: parsed.motif },
          "success",
          "high"
        );

        dispatchDomainEvent({
          type: "ACCOUNT_UNSUSPENDED",
          data: {
            compteId: compte.id,
            numeroCompte: compte.numeroCompte,
            typeCompte: compte.typeCompte,
            clientId: compte.clientId,
            agenceId: compte.agenceId || undefined,
          },
          timestamp: new Date(),
          agenceId: compte.agenceId || undefined,
        });

        const wsInstance = getWsInstance();
        if (wsInstance && user?.agence) {
          wsInstance.broadcastToAgency(user.agence, {
            type: "NOTIFICATION",
            payload: {
              message: `Compte ${compte.numeroCompte} réactivé`,
              type: "success",
            },
          });
        }

        res.json({ ...compte, message: "Suspension levée avec succès" });
      } catch (error: any) {
        if (error instanceof CompteError) {
          return res.status(400).json({ message: error.message, code: error.code });
        }
        logger.error({ err: error }, 'Error unsuspending compte');
        res.status(500).json({ message: error.message || "Erreur serveur" });
      }
    }
  );

  // ============================================================================
  // ACCOUNT LIFECYCLE: CLOSURE (Maker-Checker)
  // ============================================================================

  /**
   * POST /api/comptes/:id/closure/initiate - Initier une demande de clôture (maker)
   */
  /**
   * POST /api/comptes/:id/closure/initiate
   */
  app.post(
    "/api/comptes/:id/closure/initiate",
    requireAuth,
    attachAbility,
    requireAbility(Actions.CLOSE_INITIATE, Subjects.COMPTE),
    async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body);
        const parsed = initiateClosureSchema.parse(data);
        const user = req.session.user;

        const request = await initiateClosureCompte(
          {
            compteId: req.params.id,
            reason: parsed.reason,
            payoutMethod: parsed.payoutMethod as ClosurePayoutMethodDz,
            payoutPhoneNumber: parsed.payoutPhoneNumber,
          },
          user!.id
        );

        await logAudit(
          req,
          "INITIATE_CLOSURE",
          "compte",
          req.params.id,
          { requestId: request.id, payoutMethod: parsed.payoutMethod },
          "success",
          "critical"
        );

        dispatchDomainEvent({
          type: "CLOSURE_INITIATED",
          data: {
            compteId: req.params.id,
            requestId: request.id,
            payoutMethod: parsed.payoutMethod,
            payoutAmount: request.payoutAmount,
          },
          timestamp: new Date(),
        });

        res.json({
          ...request,
          message: "Demande de clôture soumise. En attente d'approbation.",
        });
      } catch (error: any) {
        if (error instanceof CompteError) {
          return res.status(400).json({ message: error.message, code: error.code });
        }
        logger.error({ err: error }, 'Error initiating closure');
        res.status(500).json({ message: error.message || "Erreur serveur" });
      }
    }
  );
}
