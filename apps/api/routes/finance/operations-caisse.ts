/**
 * Routes finance — segment /operations-caisse (partie operations-caisse).
 *
 * Enregistré par l'index finance.ts dans l'ordre historique.
 * Endpoints :
 *   GET    /api/operations-caisse/today
 *   GET    /api/operations-caisse
 *   POST   /api/operations-caisse
 *   PATCH  /api/operations-caisse/:id
 */
import type { Express } from "express";
import { insertOperationCaisseSchema } from "@shared/schema";
import { storage } from "../../storage";
import { getComptesByClient } from "../../storage/finance";
import { StatutCompte, StatutClient, TypeCompte } from "@shared/enum/status-constants";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility, requireDisbursement, hasAbility, Actions, Subjects } from "../../authorization";
import { logAudit } from "../../audit";
import { normalizeKeysDeep, coerceValueToSchema } from "../utils";
import { z } from "zod";
import { getWsInstance } from "../../ws-server";
import { logger } from "./shared";

export function registerOperationsCaisseRoutes(app: Express) {
  // Opérations caisse du jour — toutes les opérations de la CAISSE pour aujourd'hui
  // Permet d'afficher les transactions récentes même si la session a été rouverte
  // NOTE: Le solde de session est calculé séparément via les données de session
  /**
   * GET /api/operations-caisse/today
   */
  app.get("/api/operations-caisse/today", requireAuth, async (req, res) => {
      try {
        const user = req.session.user!;

        // Récupérer la session active de l'utilisateur pour obtenir la caisse_id
        const activeSession = await storage.getActiveSessionForUser(user.id);

        if (!activeSession) {
          return res.json([]); // Pas de session active, pas d'opérations
        }

        // Récupérer la caisse_id depuis la session
        const caisseId = activeSession.caisse_id || activeSession.caisseId;

        if (!caisseId) {
          return res.json([]);
        }

        // Retourner les opérations du jour pour cette CAISSE (toutes sessions confondues)
        const operations = await storage.getOperationsCaisseToday(caisseId);

        res.json(operations);
      } catch (error: any) {
        logger.error({ err: error }, 'Erreur récupération opérations du jour');
        res.status(500).json({ message: error.message });
      }
  });

  // Récupérer les opérations par sessionId (pour les rapports)
  /**
   * GET /api/operations-caisse
   */
  app.get("/api/operations-caisse", requireAuth, async (req, res) => {
      try {
        const { sessionId } = req.query;

        if (!sessionId || typeof sessionId !== 'string') {
          return res.status(400).json({ message: "sessionId requis" });
        }

        const operations = await storage.getOperationsBySession(sessionId);
        res.json(operations);
      } catch (error: any) {
        logger.error({ err: error }, 'Erreur récupération opérations par session');
        res.status(500).json({ message: error.message });
      }
  });

  // Opération caisse (roles: admin, chef, caisse)
  /**
   * POST /api/operations-caisse
   */
  app.post("/api/operations-caisse", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.CAISSE_OPERATION), async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body) as any;
        const user = req.session.user!;
        
        // Ownership check
        const session = await storage.getSessionCaisse(data.sessionId);
        if (!session) return res.status(404).json({ message: "Session introuvable" });
        
        const isManager = req.ability?.can(Actions.MANAGE, Subjects.CAISSE) || req.ability?.can(Actions.MANAGE, 'all');
        if (session.caissierId !== user.id && !isManager) {
            return res.status(403).json({ message: "Vous n'avez pas l'autorisation d'ajouter des opérations à cette session" });
        }

        const parsed = insertOperationCaisseSchema.parse(data);

        // ====== SERVER-SIDE AMOUNT VALIDATION ======
        const montantNum = Number(parsed.montant);
        const MIN_OPERATION_AMOUNT = 100;
        const MAX_OPERATION_AMOUNT = 100_000_000_000; // 100 milliards FCFA

        if (isNaN(montantNum) || montantNum < MIN_OPERATION_AMOUNT) {
            return res.status(400).json({
                message: `Le montant minimum est de ${MIN_OPERATION_AMOUNT.toLocaleString('fr-FR')} FCFA.`
            });
        }
        if (montantNum > MAX_OPERATION_AMOUNT) {
            return res.status(400).json({
                message: `Le montant maximum est de ${MAX_OPERATION_AMOUNT.toLocaleString('fr-FR')} FCFA.`
            });
        }
        // ====== END AMOUNT VALIDATION ======

        // Targeted Account Resolution
        let targetCompteId = data.compteId;
        
        // Auto-resolve account if not provided but client is
        if (!targetCompteId && parsed.clientId) {
             const opType = (parsed.typeOperation || '').toLowerCase();
             
             // Check if operation implies an account interaction
             const impliesAccount = 
                opType.includes('versement') || 
                opType.includes('retrait') || 
                opType.includes('dépôt') || 
                opType.includes('depot') ||
                opType.includes('compte');

             if (impliesAccount) {
                 const clientAccounts = await storage.getComptesByClient(parsed.clientId);
                 
                 // Smart matching based on operation name
                 let targetType: string | undefined;
                 if (opType.includes('courant')) targetType = TypeCompte.CURRENT;
                 else if (opType.includes('bloqué') || opType.includes('bloque')) targetType = TypeCompte.BLOCKED;
                 else if (opType.includes('épargne') || opType.includes('epargne')) targetType = TypeCompte.SAVINGS;
                 
                 let foundAccount;
                 if (targetType) {
                     foundAccount = clientAccounts.find(c => c.typeCompte === targetType && c.statut === StatutCompte.ACTIVE);
                 } else {
                     // Default fallback: prefer active SAVINGS, then CURRENT, then any active account
                     const typePriority = [TypeCompte.SAVINGS, TypeCompte.CURRENT, TypeCompte.BLOCKED];
                     const activeAccounts = clientAccounts.filter(c => c.statut === StatutCompte.ACTIVE);
                     foundAccount = typePriority.reduce<typeof activeAccounts[0] | undefined>(
                       (found, type) => found || activeAccounts.find(c => c.typeCompte === type),
                       undefined
                     ) || activeAccounts[0];
                 }

                 if (foundAccount) {
                     targetCompteId = foundAccount.id;
                 } else {
                     // Only strictly block if we identified a specific target type that is missing
                     // For generic operations like "Encaissement Divers" creating a movement is enough?
                     // But "Versement Courant" MUST fail if no Courant account.
                     if (targetType) {
                         return res.status(400).json({ message: `Aucun compte ${targetType} actif trouvé pour ce client.` });
                     }
                     // Else fallback to generic operation without account update (just cash movement)
                 }
             }
        }

        // --- NEW LEDGER FLOW ---
        // We use the unified function if we have a target Account OR if it's a generic operation we want tracked
        // For now, we assume ALL operations via this endpoint should be robust.
        
        const hasAccountImpact = !!targetCompteId;

        // ====== BUSINESS LOGIC: Block Debit Operations on Frozen Accounts ======
        if (hasAccountImpact && targetCompteId) {
            const opType = (parsed.typeOperation || '').toLowerCase();
            const isDebitOperation = opType.includes('retrait');
            
            if (isDebitOperation) {
                const targetAccount = await storage.getCompte(targetCompteId);
                if (targetAccount?.blocageActif) {
                    return res.status(403).json({
                        message: `Ce compte est gelé (${targetAccount.blocageMotif || 'Blocage administratif'}). Les retraits ne sont pas autorisés.`
                    });
                }
                // Check sufficient balance for withdrawals
                if (targetAccount) {
                    const solde = parseFloat(targetAccount.soldeCourant || '0');
                    if (montantNum > solde) {
                        return res.status(400).json({
                            message: `Solde insuffisant. Solde disponible: ${solde.toLocaleString('fr-FR')} FCFA, montant demandé: ${montantNum.toLocaleString('fr-FR')} FCFA.`
                        });
                    }
                }
                // Also check if client is frozen
                if (parsed.clientId) {
                    const client = await storage.getClient(parsed.clientId);
                    if (client && ([StatutClient.INACTIVE, StatutClient.SUSPENDED] as readonly string[]).includes(client.statut)) {
                        return res.status(403).json({
                            message: `Client ${client.statut}. Les opérations de débit ne sont pas autorisées.`
                        });
                    }
                }
            }
        }
        // ====== END BUSINESS LOGIC ======

        if (hasAccountImpact) {
            const { operation, transaction, mouvement } = await storage.createCashTransactionWithLedger({
                sessionId: parsed.sessionId,
                typeOperation: parsed.typeOperation,
                montant: parsed.montant.toString(),
                methodePaiement: parsed.methodePaiement || 'Espèces',
                clientId: parsed.clientId || undefined,
                compteId: targetCompteId,
                description: parsed.description || undefined,
                idempotencyKey: parsed.idempotencyKey || undefined
            }, user.id);

            // Side Effects (Scoring, WS)
            try {
                const isSavingsDeposit = ['DEPOSIT_SAVINGS', 'SAVINGS_DEPOSIT'].includes(parsed.typeOperation);
                if (parsed.clientId && isSavingsDeposit && parsed.montant) {
                    const { recordScoreEvent } = await import('../services/scoring-engine');
                    await recordScoreEvent({
                        clientId: parsed.clientId,
                        agenceId: session.agenceId || undefined,
                        eventType: 'EPARGNE_DEPOT',
                        refId: operation.id,
                        refType: 'operation_caisse',
                        montant: Number(parsed.montant),
                        createdBy: user.id,
                    });
                }

                const wsInstance = getWsInstance();
                if (wsInstance) {
                    if (parsed.clientId) wsInstance.broadcast({ type: "CLIENT_UPDATE", payload: { clientId: parsed.clientId } });
                    if (transaction) wsInstance.broadcast({ type: "COMPTE_UPDATE", payload: { compteId: transaction.compteId, newSolde: Number(transaction.soldeApres) } });
                    
                    wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
                    wsInstance.broadcast({ type: "CAISSE_UPDATE", payload: { caisseId: session.caisseId } });
                }
            } catch (err) {
                logger.error({ err }, 'Post-operation side-effects error');
            }

            res.json(operation);

        } else {
            // Fallback for Operations WITHOUT Account impact (e.g. "Divers", "Frais divers" not linked to account)
            // We use the simpler ledger function that only touches Session + Ledger
            const { operation } = await storage.createOperationCaisseWithLedger({
                sessionId: parsed.sessionId,
                typeOperation: parsed.typeOperation,
                montant: parsed.montant.toString(),
                methodePaiement: parsed.methodePaiement || 'Espèces',
                clientId: parsed.clientId || undefined,
                description: parsed.description || undefined,
                idempotencyKey: parsed.idempotencyKey || undefined
            }, user.id);

            res.json(operation);
        }

      } catch (error: any) {
        logger.error({ err: error }, 'Error creating operation');
        res.status(400).json({ message: error.message || "Erreur lors de la création de l'opération" });
      }
  });

  // Update Opération caisse (PATCH)
  // Only allow updating non-financial fields (description/metadata annotations).
  // Financial fields (montant, typeOperation, statut, sessionId, etc.) are immutable
  // after creation — changes must go through the reversal/contrepassation flow.
  const patchOperationSchema = z.object({
    description: z.string().max(500).optional(),
    metadata: z.record(z.unknown()).optional(),
  }).strict();
  /**
   * PATCH /api/operations-caisse/:id
   */
  app.patch("/api/operations-caisse/:id", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.CAISSE_OPERATION), async (req, res) => {
      try {
        const { id } = req.params;
        const data = normalizeKeysDeep(req.body);
        const parsed = patchOperationSchema.parse(data);

        if (Object.keys(parsed).length === 0) {
          return res.status(400).json({ message: "Aucun champ modifiable fourni" });
        }

        const updated = await storage.updateOperationCaisse(id, parsed);
        if (!updated) {
             return res.status(404).json({ message: "Opération introuvable" });
        }

        await logAudit(req, "UPDATE_OPERATION_CAISSE", "operation_caisse", id, {
          fields: Object.keys(parsed),
          reference: updated.reference,
        }, "success", "low");

        // Notify updates
             if (updated.clientId) {
                const wsInstance = getWsInstance();
                if (wsInstance) {
                    wsInstance.broadcast({ type: "CLIENT_UPDATE", payload: { clientId: updated.clientId } });
                    wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
                }
             }
             res.json(updated);
      } catch (error: any) {
         if (error instanceof z.ZodError) {
           return res.status(400).json({ message: "Champs non autorisés ou invalides", errors: error.errors });
         }
         logger.error({ err: error }, 'Error updating operation');
         res.status(400).json({ message: error.message || "Erreur lors de la mise à jour" });
      }
  });
}
