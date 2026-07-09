/**
 * Routes comptes — segment /comptes (partie comptes-detail-2).
 *
 * Enregistré par l'index comptes.ts dans l'ordre historique.
 * Endpoints :
 *   POST   /api/comptes/:id/depot-initial
 *   POST   /api/comptes/batch-activate
 */
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { requireAgenceAccess, requireAgenceIdAccess, validateAgenceIdAction } from "../../middleware";
import { logAudit } from "../../audit";
import { normalizeKeysDeep } from "../utils";
import comptesService, { CompteError, suspendCompte, unsuspendCompte } from "../../services/comptes";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { comptes, produitsCompte, insertProduitCompteSchema, clients, users, virementsProgrammes } from "@shared/schema";
import { getWsInstance } from "../../ws-server";
import { StatutCompte, TypeCompte, MethodePaiement, MotifBlocage, SuspensionReason } from "@shared/enum/status-constants";
import { dispatchDomainEvent } from "../../services/notifications/domain-events/event-registry";
import { logger, getRequiredKycTypes } from "./shared";

export function registerComptesDetail2Routes(app: Express) {
  /**
   * POST /api/comptes/:id/depot-initial - Payer le dépôt initial (Activation)
   * Réservé aux caissiers avec session active
   */
  /**
   * POST /api/comptes/:id/depot-initial
   */
  app.post(
    "/api/comptes/:id/depot-initial",
    requireAuth,
    attachAbility,
    requireAbility(Actions.CREATE, Subjects.CAISSE_OPERATION),
    requireAgenceAccess(),
    async (req, res) => {
        try {
            const data = normalizeKeysDeep(req.body) as any;

            // Validation stricte du montant
            if (!data.montant || Number(data.montant) <= 0) {
                return res.status(400).json({ message: "Montant invalide" });
            }

            // KYC pre-check: warn if documents are missing (soft block unless force)
            if (!data.skipKycCheck) {
                const [compte] = await db.select({ clientId: comptes.clientId }).from(comptes).where(eq(comptes.id, req.params.id));
                if (compte?.clientId) {
                    const [client] = await db.select({ documents: clients.documents, typePiece: clients.typePiece }).from(clients).where(eq(clients.id, compte.clientId));
                    const docs: any[] = Array.isArray(client?.documents) ? (client.documents as any[]) : [];
                    const requiredTypes = getRequiredKycTypes(client?.typePiece);
                    const presentTypes = new Set(docs.map(d => (d as any).documentType));
                    const missingRequired = requiredTypes.filter(t => !presentTypes.has(t));
                    if (missingRequired.length > 0) {
                        return res.status(422).json({
                            error: "KYC_INCOMPLETE",
                            message: `Documents KYC manquants: ${missingRequired.join(', ')}`,
                            missingDocuments: missingRequired,
                            canOverride: true,
                        });
                    }
                }
            }

            const methodePaiement = data.methodePaiement || data.modePaiement || 'CASH';
            // Session caisse required for CASH/MOBILE_MONEY, optional for TRANSFER
            if (methodePaiement !== 'TRANSFER' && !data.sessionCaisseId) {
                return res.status(400).json({ message: "Session de caisse requise" });
            }

            const result = await comptesService.payerDepotInitialCompte(
                req.params.id,
                {
                    montant: Number(data.montant),
                    sessionCaisseId: data.sessionCaisseId,
                    userId: req.session.user!.id,
                    methodePaiement: methodePaiement as 'CASH' | 'MOBILE_MONEY' | 'TRANSFER',
                    operateurMobile: data.operateurMobile,
                    compteSourceId: data.compteSourceId,
                }
            );

            // Domain event: account activated
            dispatchDomainEvent({
              type: "ACCOUNT_ACTIVATED",
              data: {
                compteId: result.compte.id,
                numeroCompte: result.compte.numeroCompte,
                typeCompte: result.compte.typeCompte,
                clientId: result.compte.clientId,
                montantDepose: Number(data.montant),
                agenceId: result.compte.agenceId || undefined,
              },
              timestamp: new Date(),
              agenceId: result.compte.agenceId || undefined,
            });

            // Logs & Broadcast...
            await logAudit(req, "DEPOT_INITIAL", "compte", req.params.id, { montant: data.montant }, "success", "high");
             
             // Broadcast temps réel
            const wsInstance = getWsInstance();
            if (wsInstance && req.session.user?.agence) {
              wsInstance.broadcastToAgency(req.session.user.agence, {
                type: "LIVE_ACTIVITY",
                payload: {
                  action: `Activation Compte: ${result.compte.numeroCompte}`,
                  user: req.session.user.nom || "Système",
                  type: "account_activation",
                  timestamp: new Date().toISOString(),
                },
              });
               wsInstance.broadcastToAgency(req.session.user.agence, {
                type: "DASHBOARD_UPDATE",
                payload: {},
              });
              wsInstance.broadcastToAgency(req.session.user.agence, {
                type: "COMPTE_UPDATE",
                payload: { compteId: req.params.id, action: "DEPOT_INITIAL" },
              });
            }

            res.json(result);
        } catch (error: any) {
             logger.error({ err: error }, 'Error depot initial');
             const message = error.message || "Erreur serveur";
             
             if (message.includes("Compte introuvable")) {
                 return res.status(404).json({ message });
             }
             if (message.includes("n'est pas en attente") || message.includes("Montant invalide")) {
                 return res.status(400).json({ message });
             }
             
             res.status(500).json({ message });
        }
    }
  );

  /**
   * POST /api/comptes/batch-activate - Activer plusieurs comptes en attente
   * Permet l'activation groupée de comptes avec un dépôt initial
   */
  /**
   * POST /api/comptes/batch-activate
   */
  app.post(
    "/api/comptes/batch-activate",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.COMPTE),
    async (req, res) => {
      try {
        const { accountIds, sessionCaisseId, skipKycCheck } = req.body;

        if (!Array.isArray(accountIds) || accountIds.length === 0) {
          return res.status(400).json({ message: "Liste de comptes requise" });
        }

        if (!sessionCaisseId) {
          return res.status(400).json({ message: "Session de caisse requise" });
        }

        const results: { success: any[]; failed: any[] } = { success: [], failed: [] };

        for (const accountId of accountIds) {
          try {
            // Récupérer le compte et son montant initial requis
            const [compte] = await db.select().from(comptes).where(eq(comptes.id, accountId));

            if (!compte) {
              results.failed.push({ accountId, error: "Compte non trouvé" });
              continue;
            }

            const batchPendingStatuses = [
              StatutCompte.PENDING_PAYMENT,
              StatutCompte.PENDING_PAYMENT_AND_APPROVAL,
              StatutCompte.PENDING_ACTIVATION, // legacy
            ];
            if (!(batchPendingStatuses as readonly string[]).includes(compte.statut)) {
              results.failed.push({ accountId, numeroCompte: compte.numeroCompte, error: "Compte pas en attente de paiement" });
              continue;
            }

            // Compute remaining amount from opening snapshot (not soldeCourant which is 0 for pending accounts)
            const snapshot = (compte as any).openingSnapshot as { openingFee: number; minInitialDeposit: number; initialDepositRequired: boolean } | null;
            const paidFee = Number((compte as any).paidOpeningFee || 0);
            const paidDeposit = Number((compte as any).paidInitialDeposit || 0);

            let montantInitial: number;
            if (snapshot) {
              const remainingFee = Math.max(0, snapshot.openingFee - paidFee);
              const remainingDeposit = snapshot.initialDepositRequired
                ? Math.max(0, snapshot.minInitialDeposit - paidDeposit)
                : 0;
              montantInitial = remainingFee + remainingDeposit;
            } else {
              // Legacy account without snapshot
              montantInitial = Number(compte.soldeCourant || 0);
            }

            if (montantInitial <= 0) {
              results.failed.push({ accountId, numeroCompte: compte.numeroCompte, error: "Montant initial non défini" });
              continue;
            }

            // KYC check si pas ignoré
            if (!skipKycCheck && compte.clientId) {
              const [client] = await db.select({ documents: clients.documents, typePiece: clients.typePiece }).from(clients).where(eq(clients.id, compte.clientId));
              const docs: any[] = Array.isArray(client?.documents) ? (client.documents as any[]) : [];
              const requiredTypes = getRequiredKycTypes(client?.typePiece);
              const presentTypes = new Set(docs.map(d => (d as any).documentType));
              const missingRequired = requiredTypes.filter(t => !presentTypes.has(t));

              if (missingRequired.length > 0) {
                results.failed.push({
                  accountId,
                  numeroCompte: compte.numeroCompte,
                  error: "KYC incomplet",
                  missingDocuments: missingRequired
                });
                continue;
              }
            }

            // Activer le compte
            const result = await comptesService.payerDepotInitialCompte(accountId, {
              montant: montantInitial,
              sessionCaisseId,
              userId: req.session.user!.id
            });

            results.success.push({
              accountId,
              numeroCompte: result.compte.numeroCompte,
              montant: montantInitial
            });

            // Dispatch event
            dispatchDomainEvent({
              type: "ACCOUNT_ACTIVATED",
              data: {
                compteId: result.compte.id,
                numeroCompte: result.compte.numeroCompte,
                typeCompte: result.compte.typeCompte,
                clientId: result.compte.clientId,
                montantDepose: montantInitial,
                agenceId: result.compte.agenceId || undefined,
                batchActivation: true,
              },
              timestamp: new Date(),
              agenceId: result.compte.agenceId || undefined,
            });

          } catch (error: any) {
            results.failed.push({
              accountId,
              error: error.message || "Erreur d'activation"
            });
          }
        }

        // Broadcast update
        const wsInstance = getWsInstance();
        if (wsInstance && req.session.user?.agence) {
          wsInstance.broadcastToAgency(req.session.user.agence, {
            type: "DASHBOARD_UPDATE",
            payload: { batchActivation: true, count: results.success.length }
          });
          wsInstance.broadcastToAgency(req.session.user.agence, {
            type: "COMPTE_UPDATE",
            payload: { action: "BATCH_ACTIVATION", count: results.success.length },
          });
        }

        res.json({
          success: true,
          activated: results.success.length,
          failed: results.failed.length,
          details: results
        });

      } catch (error: any) {
        logger.error({ err: error }, 'Error batch activation');
        res.status(500).json({ message: error.message || "Erreur serveur" });
      }
    }
  );
}
