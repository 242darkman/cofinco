/**
 * SessionAgentService - Gestion du cycle de vie des sessions agent terrain
 *
 * Cycle: REQUESTING_FUNDS → ACTIVE → CLOSING → CLOSED
 *
 * Chaque transition génère:
 * - Des mouvements financiers (mouvementsFinanciers)
 * - Des écritures GL (via postGlForMouvement)
 * - Des logs d'audit (sessionsAgentAuditLogs)
 * - Des événements WebSocket
 *
 * Le provisioning (dispatch de fonds) peut être direct ou avec approbation
 * selon la configuration par agence (agentSessionConfig).
 */

import { db } from "../../db";
import { eq, and, or, isNull, sql, desc, ne } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  sessionsAgent,
  sessionsAgentAuditLogs,
  agentAgencyHistory,
  agentSessionConfig,
  operationsTerrain,
  operationsTerrainAuditLogs,
  caissesAgent,
  agentsTerrain,
  mouvementsFinanciers,
  caisses,
  agences,
  planComptable,
  users,
  paiementsTerrain,
  credits,
  comptes,
  remboursements,
  transactionsCompte,
  contributionsTontine,
  sessionsCaisse,
  operationsCaisse,
  type SessionAgent,
  type AgentSessionConfig,
} from "@shared/schema";
import { StatutTransaction, TypeOperationCaisse } from "@shared/enum/status-constants";
import { generateReference, updateCreditSolde, updateSessionSolde } from "../ledger";
import { postGlForMouvement } from "../accounting-posting-service";
import { agentGlProvisioningService } from "./agent-gl-provisioning-service";
import { createLogger } from "../../lib/logger";
import { getWsInstance } from "../../ws-server";

const logger = createLogger('SessionAgentService');

// ============================================================================
// TYPES
// ============================================================================

interface SessionResult {
  success: boolean;
  session?: SessionAgent;
  error?: string;
  errorCode?: string;
}

export interface RequestSessionInput {
  agentId: string;
  agenceId: string;
  montantDemande: number;
  sourceCaisseId?: string;
  createdBy: string;
  observations?: string;
}

export interface DispatchFundsInput {
  sessionId: string;
  montantProvisionne: number;
  sourceCaisseId: string;
  dispatchedBy: string;
}

export interface InitiateCloseInput {
  sessionId: string;
  montantPhysique: number;
  billetage?: Record<string, number>;
  destinationCaisseId: string;
  closedBy: string;
  observations?: string;
}

export interface FinalizeCloseInput {
  sessionId: string;
  montantRetourne: number;
  finalizedBy: string;
  ecartJustification?: string;
}

export interface CloseWithRemiseInput {
  sessionId: string;
  montantPhysique: number;
  billetage?: Record<string, number>;
  destinationCaisseId: string;
  closedBy: string;
  observations?: string;
  ecartJustification?: string;
}

export interface TransferAgencyInput {
  agentId: string;
  newAgenceId: string;
  reason: string;
  transferredBy: string;
}

// ============================================================================
// SERVICE
// ============================================================================

export class SessionAgentService {
  /**
   * Phase 1: Agent demande une session avec provisionnement
   * → REQUESTING_FUNDS
   */
  async requestSession(params: RequestSessionInput): Promise<SessionResult> {
    try {
      return await db.transaction(async (tx) => {
        // 1. Vérifier que l'agent existe et est actif
        const [agent] = await tx
          .select()
          .from(agentsTerrain)
          .where(and(eq(agentsTerrain.id, params.agentId), isNull(agentsTerrain.deletedAt)));

        if (!agent) {
          return { success: false, error: "Agent non trouvé", errorCode: "AGENT_NOT_FOUND" };
        }

        // 2. Vérifier qu'il n'a pas de session non-clôturée
        // (la contrainte unique le garantit aussi, mais erreur plus claire)
        const [existingSession] = await tx
          .select({ id: sessionsAgent.id, statut: sessionsAgent.statut })
          .from(sessionsAgent)
          .where(and(
            eq(sessionsAgent.agentId, params.agentId),
            ne(sessionsAgent.statut, "CLOSED"),
          ))
          .limit(1);

        if (existingSession) {
          return {
            success: false,
            error: `Session active existante (statut: ${existingSession.statut})`,
            errorCode: "SESSION_ALREADY_EXISTS",
          };
        }

        // 3. Vérifier la caisse agent (créer si absente)
        let [caisseAgent] = await tx
          .select()
          .from(caissesAgent)
          .where(and(eq(caissesAgent.agentId, params.agentId), isNull(caissesAgent.deletedAt)));

        if (!caisseAgent) {
          [caisseAgent] = await tx
            .insert(caissesAgent)
            .values({ agentId: params.agentId, createdBy: params.createdBy })
            .returning();
        }

        // 4. Auto-provisionner le sous-compte GL si nécessaire
        const glResult = await agentGlProvisioningService.provisionOrGetGlAccount(
          tx,
          params.agentId,
          params.agenceId,
        );

        // 5. Créer la session
        const [session] = await tx
          .insert(sessionsAgent)
          .values({
            agentId: params.agentId,
            caisseAgentId: caisseAgent.id,
            agenceId: params.agenceId,
            glAccountId: glResult.glAccountId,
            glAccountNumber: glResult.glAccountNumber,
            statut: "REQUESTING_FUNDS",
            montantDemande: String(params.montantDemande),
            fundRequestedAt: new Date(),
            sourceCaisseId: params.sourceCaisseId,
            observations: params.observations,
            createdBy: params.createdBy,
          })
          .returning();

        // 6. Audit log
        await tx.insert(sessionsAgentAuditLogs).values({
          sessionId: session.id,
          action: "REQUESTED",
          statutApres: "REQUESTING_FUNDS",
          details: {
            montantDemande: params.montantDemande,
            sourceCaisseId: params.sourceCaisseId,
            glAccountNumber: glResult.glAccountNumber,
            glAccountIsNew: glResult.isNew,
          },
          userId: params.createdBy,
        });

        logger.info(
          { sessionId: session.id, agentId: params.agentId, glAccount: glResult.glAccountNumber },
          'Agent session requested',
        );

        this.broadcastSessionUpdate(session);
        return { success: true, session };
      });
    } catch (error: any) {
      logger.error({ err: error, agentId: params.agentId }, 'Error requesting session');
      return { success: false, error: error.message, errorCode: "INTERNAL_ERROR" };
    }
  }

  /**
   * Phase 2: Dispatcher les fonds (Caisse agence → Agent)
   * → ACTIVE
   *
   * Crée une opération PROVISIONING + écriture GL:
   *   D: Agent GL sub-account (573xxx)
   *   C: Caisse agence GL (521)
   */
  async dispatchFunds(params: DispatchFundsInput): Promise<SessionResult> {
    try {
      return await db.transaction(async (tx) => {
        // 1. Verrouiller la session
        const [session] = await tx
          .select()
          .from(sessionsAgent)
          .where(eq(sessionsAgent.id, params.sessionId))
          .for("update");

        if (!session) {
          return { success: false, error: "Session non trouvée", errorCode: "NOT_FOUND" };
        }

        if (session.statut !== "REQUESTING_FUNDS") {
          return {
            success: false,
            error: `Statut invalide: ${session.statut} (attendu: REQUESTING_FUNDS)`,
            errorCode: "INVALID_STATUS",
          };
        }

        // 2. Vérifier liquidité de la caisse source
        const [sourceCaisse] = await tx
          .select()
          .from(caisses)
          .where(eq(caisses.id, params.sourceCaisseId))
          .for("update");

        if (!sourceCaisse) {
          return { success: false, error: "Caisse source non trouvée", errorCode: "CAISSE_NOT_FOUND" };
        }

        if (parseFloat(sourceCaisse.solde ?? "0") < params.montantProvisionne) {
          return {
            success: false,
            error: `Liquidité insuffisante en caisse: ${sourceCaisse.solde} < ${params.montantProvisionne}`,
            errorCode: "INSUFFICIENT_FUNDS",
          };
        }

        // 3. Créer l'opération PROVISIONING
        const reference = generateReference("CAISSE_AGENT" as any);
        const [operation] = await tx
          .insert(operationsTerrain)
          .values({
            reference,
            type: "PROVISIONING",
            agentId: session.agentId,
            caisseAgentId: session.caisseAgentId,
            montant: String(params.montantProvisionne),
            statut: "APPROVED", // Direct approval
            submittedBy: params.dispatchedBy,
            submittedAt: new Date(),
            approvedBy: params.dispatchedBy,
            approvedAt: new Date(),
            postedAt: new Date(),
            sessionAgentId: session.id,
            metadata: {
              sessionCaisseId: params.sourceCaisseId,
              observations: `Provisionnement session ${session.id}`,
            },
          })
          .returning();

        // 4. Créer mouvement financier (agent side)
        const refAgent = generateReference("CAISSE_AGENT" as any);
        const [mouvementAgent] = await tx
          .insert(mouvementsFinanciers)
          .values({
            dateOperation: new Date(),
            montant: String(params.montantProvisionne),
            sens: "DEBIT",
            statut: StatutTransaction.POSTED,
            methodePaiement: "CASH",
            reference: refAgent,
            agentId: session.agentId,
            typePaiement: "AGENT_PROVISIONING" as any,
            sourceModule: "CAISSE_AGENT" as any,
            sourceTable: "operations_terrain",
            sourceId: operation.id,
            agenceId: session.agenceId,
            requiresGlPosting: true,
            createdBy: params.dispatchedBy,
            metadata: {
              operationType: "PROVISIONING",
              sessionAgentId: session.id,
              caisseAgentId: session.caisseAgentId,
            },
          })
          .returning();

        // 5. Post GL for agent mouvement: D 573xxx / C 521
        const glResult = await postGlForMouvement(
          tx,
          mouvementAgent,
          session.agenceId,
          params.dispatchedBy,
          { eventType: "AGENT_PROVISIONING" },
        );

        if (glResult) {
          await tx
            .update(mouvementsFinanciers)
            .set({ glPostingStatus: "POSTED" })
            .where(eq(mouvementsFinanciers.id, mouvementAgent.id));
        }

        // 6. Update caisse agent balance
        await tx
          .update(caissesAgent)
          .set({
            soldeValide: sql`${caissesAgent.soldeValide} + ${params.montantProvisionne}`,
            updatedAt: new Date(),
          })
          .where(eq(caissesAgent.id, session.caisseAgentId));

        // 7. Caisse source: create mouvement + operationCaisse + update session solde
        // Fetch agent name for description
        const [agentUser] = await tx
          .select({ nom: users.nom, prenom: users.prenom })
          .from(users)
          .where(eq(users.id, session.agentId));
        const agentDisplayName = agentUser
          ? `${agentUser.prenom || ''} ${agentUser.nom || ''}`.trim()
          : session.agentId;

        // Find the active caisse session for the source caisse
        const [activeSessionCaisse] = await tx
          .select()
          .from(sessionsCaisse)
          .where(and(
            eq(sessionsCaisse.caisseId, params.sourceCaisseId),
            isNull(sessionsCaisse.closedAt),
          ))
          .for("update");

        if (!activeSessionCaisse) {
          return {
            success: false,
            error: "Aucune session caisse active pour la caisse source",
            errorCode: "NO_ACTIVE_SESSION",
          };
        }

        // 7a. Create caisse-side mouvement (CREDIT = money leaves caisse)
        const refCaisse = generateReference("CAISSE" as any);
        const [mouvementCaisse] = await tx
          .insert(mouvementsFinanciers)
          .values({
            dateOperation: new Date(),
            montant: String(params.montantProvisionne),
            sens: "CREDIT",
            statut: StatutTransaction.POSTED,
            methodePaiement: "CASH",
            reference: refCaisse,
            agentId: session.agentId,
            sessionCaisseId: activeSessionCaisse.id,
            typePaiement: "AGENT_PROVISIONING" as any,
            sourceModule: "CAISSE" as any,
            sourceTable: "operations_terrain",
            sourceId: operation.id,
            agenceId: session.agenceId,
            glPostingStatus: "SKIPPED", // GL already posted on agent mouvement
            createdBy: params.dispatchedBy,
            metadata: {
              operationType: "AGENT_PROVISIONING",
              sessionAgentId: session.id,
              caisseAgentId: session.caisseAgentId,
            },
          })
          .returning();

        // 7b. Create operationCaisse record (for caisse history)
        await tx.insert(operationsCaisse).values({
          sessionId: activeSessionCaisse.id,
          mouvementId: mouvementCaisse.id,
          typeOperation: "AGENT_PROVISIONING" as any,
          statut: StatutTransaction.POSTED,
          montant: String(params.montantProvisionne),
          methodePaiement: "CASH",
          reference: refCaisse,
          description: `Approvisionnement agent ${agentDisplayName}`,
          createdBy: params.dispatchedBy,
          metadata: {
            sessionAgentId: session.id,
            agentId: session.agentId,
          },
        });

        // 7c. Update session caisse solde (debit = money leaves)
        await updateSessionSolde(tx, activeSessionCaisse.id, -params.montantProvisionne);

        // 8. Update operation with posted mouvement
        await tx
          .update(operationsTerrain)
          .set({ postedMouvementCaisseAgentId: mouvementAgent.id })
          .where(eq(operationsTerrain.id, operation.id));

        // 9. Update session → ACTIVE
        const [updatedSession] = await tx
          .update(sessionsAgent)
          .set({
            statut: "ACTIVE",
            montantProvisionne: String(params.montantProvisionne),
            fundDispatchedAt: new Date(),
            fundDispatchedBy: params.dispatchedBy,
            sourceCaisseId: params.sourceCaisseId,
            provisioningOperationId: operation.id,
            openedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(sessionsAgent.id, session.id))
          .returning();

        // 10. Audit log
        await tx.insert(sessionsAgentAuditLogs).values({
          sessionId: session.id,
          action: "PROVISIONED",
          statutAvant: "REQUESTING_FUNDS",
          statutApres: "ACTIVE",
          details: {
            montantProvisionne: params.montantProvisionne,
            sourceCaisseId: params.sourceCaisseId,
            sessionCaisseId: activeSessionCaisse.id,
            mouvementAgentId: mouvementAgent.id,
            mouvementCaisseId: mouvementCaisse.id,
            operationId: operation.id,
            glNumeroPiece: glResult?.numeroPiece,
          },
          userId: params.dispatchedBy,
        });

        logger.info(
          { sessionId: session.id, montant: params.montantProvisionne },
          'Agent session funded and activated',
        );

        // Broadcast WebSocket events
        this.broadcastSessionUpdate(updatedSession);
        // Also broadcast CAISSE_UPDATE so the caisse dashboard refreshes
        // operations, session balance, and supervision views in real-time
        this.broadcastCaisseUpdate(updatedSession.agenceId, {
          domainEvent: 'AGENT_PROVISIONING',
          caisseId: params.sourceCaisseId,
          montant: params.montantProvisionne,
          agentId: session.agentId,
        });

        return { success: true, session: updatedSession };
      });
    } catch (error: any) {
      logger.error({ err: error, sessionId: params.sessionId }, 'Error dispatching funds');
      return { success: false, error: error.message, errorCode: "INTERNAL_ERROR" };
    }
  }

  /**
   * Phase 3: Agent initie la clôture (déclare comptage physique)
   * → CLOSING
   */
  async initiateClose(params: InitiateCloseInput): Promise<SessionResult> {
    try {
      return await db.transaction(async (tx) => {
        const [session] = await tx
          .select()
          .from(sessionsAgent)
          .where(eq(sessionsAgent.id, params.sessionId))
          .for("update");

        if (!session) {
          return { success: false, error: "Session non trouvée", errorCode: "NOT_FOUND" };
        }

        if (session.statut !== "ACTIVE") {
          return {
            success: false,
            error: `Statut invalide: ${session.statut} (attendu: ACTIVE)`,
            errorCode: "INVALID_STATUS",
          };
        }

        // Calculer le solde théorique depuis la caisse agent
        const [caisseAgent] = await tx
          .select({ soldeValide: caissesAgent.soldeValide })
          .from(caissesAgent)
          .where(eq(caissesAgent.id, session.caisseAgentId));

        const montantTheorique = parseFloat(caisseAgent?.soldeValide ?? "0");
        const ecart = params.montantPhysique - montantTheorique;

        const [updatedSession] = await tx
          .update(sessionsAgent)
          .set({
            statut: "CLOSING",
            closingInitiatedAt: new Date(),
            montantPhysique: String(params.montantPhysique),
            montantTheorique: String(montantTheorique),
            ecart: String(ecart),
            billetageFermeture: params.billetage,
            destinationCaisseId: params.destinationCaisseId,
            observations: params.observations || session.observations,
            updatedAt: new Date(),
          })
          .where(eq(sessionsAgent.id, session.id))
          .returning();

        await tx.insert(sessionsAgentAuditLogs).values({
          sessionId: session.id,
          action: "CLOSING_INITIATED",
          statutAvant: "ACTIVE",
          statutApres: "CLOSING",
          details: {
            montantPhysique: params.montantPhysique,
            montantTheorique,
            ecart,
            billetage: params.billetage,
            destinationCaisseId: params.destinationCaisseId,
          },
          userId: params.closedBy,
        });

        logger.info(
          { sessionId: session.id, ecart, montantPhysique: params.montantPhysique, montantTheorique },
          'Agent session closing initiated',
        );

        this.broadcastSessionUpdate(updatedSession);
        return { success: true, session: updatedSession };
      });
    } catch (error: any) {
      logger.error({ err: error, sessionId: params.sessionId }, 'Error initiating close');
      return { success: false, error: error.message, errorCode: "INTERNAL_ERROR" };
    }
  }

  /**
   * Phase 4: Finaliser la clôture (retour fonds + gestion écart)
   * → CLOSED
   *
   * GL entries:
   *   D: Caisse agence (521)  /  C: Agent GL (573xxx) — pour le montant retourné
   *   + écriture d'écart si surplus ou déficit
   */
  async finalizeClose(params: FinalizeCloseInput): Promise<SessionResult> {
    try {
      return await db.transaction(async (tx) => {
        const [session] = await tx
          .select()
          .from(sessionsAgent)
          .where(eq(sessionsAgent.id, params.sessionId))
          .for("update");

        if (!session) {
          return { success: false, error: "Session non trouvée", errorCode: "NOT_FOUND" };
        }

        if (session.statut !== "CLOSING") {
          return {
            success: false,
            error: `Statut invalide: ${session.statut} (attendu: CLOSING)`,
            errorCode: "INVALID_STATUS",
          };
        }

        if (!session.destinationCaisseId) {
          return { success: false, error: "Caisse destination non définie", errorCode: "MISSING_DESTINATION" };
        }

        const montantRetourne = params.montantRetourne;
        const ecart = parseFloat(session.ecart ?? "0");

        // 1. Créer opération SESSION_CLOSE
        const reference = generateReference("CAISSE_AGENT" as any);
        const [closeOperation] = await tx
          .insert(operationsTerrain)
          .values({
            reference,
            type: "SESSION_CLOSE",
            agentId: session.agentId,
            caisseAgentId: session.caisseAgentId,
            destinationCaisseId: session.destinationCaisseId,
            montant: String(montantRetourne),
            statut: "APPROVED",
            submittedBy: params.finalizedBy,
            submittedAt: new Date(),
            approvedBy: params.finalizedBy,
            approvedAt: new Date(),
            postedAt: new Date(),
            sessionAgentId: session.id,
            metadata: {
              observations: `Clôture session ${session.id}`,
              ecart: String(ecart),
              ecartJustification: params.ecartJustification,
            },
          })
          .returning();

        // 2. Créer mouvement financier: retour fonds agent → caisse
        if (montantRetourne > 0) {
          const refReturn = generateReference("CAISSE_AGENT" as any);
          const [mouvementReturn] = await tx
            .insert(mouvementsFinanciers)
            .values({
              dateOperation: new Date(),
              montant: String(montantRetourne),
              sens: "CREDIT",
              statut: StatutTransaction.POSTED,
              methodePaiement: "CASH",
              reference: refReturn,
              agentId: session.agentId,
              typePaiement: "AGENT_SESSION_CLOSE" as any,
              sourceModule: "CAISSE_AGENT" as any,
              sourceTable: "operations_terrain",
              sourceId: closeOperation.id,
              agenceId: session.agenceId,
              requiresGlPosting: true,
              createdBy: params.finalizedBy,
              metadata: {
                operationType: "SESSION_CLOSE",
                sessionAgentId: session.id,
              },
            })
            .returning();

          // 3. Post GL: D 521 / C 573xxx
          const glResult = await postGlForMouvement(
            tx,
            mouvementReturn,
            session.agenceId,
            params.finalizedBy,
            { eventType: "AGENT_SESSION_CLOSE" },
          );

          if (glResult) {
            await tx
              .update(mouvementsFinanciers)
              .set({ glPostingStatus: "POSTED" })
              .where(eq(mouvementsFinanciers.id, mouvementReturn.id));
          }

          // Update close operation with posted mouvement
          await tx
            .update(operationsTerrain)
            .set({
              postedMouvementCaisseAgentId: mouvementReturn.id,
            })
            .where(eq(operationsTerrain.id, closeOperation.id));
        }

        // 4. Handle ecart (if any)
        if (ecart !== 0) {
          const isDeficit = ecart < 0;
          const ecartAbs = Math.abs(ecart);
          const eventType = isDeficit ? "AGENT_ECART_DEFICIT" : "AGENT_ECART_SURPLUS";

          const refEcart = generateReference("CAISSE_AGENT" as any);
          const [mouvementEcart] = await tx
            .insert(mouvementsFinanciers)
            .values({
              dateOperation: new Date(),
              montant: String(ecartAbs),
              sens: isDeficit ? "CREDIT" : "DEBIT",
              statut: StatutTransaction.POSTED,
              methodePaiement: "CASH",
              reference: refEcart,
              agentId: session.agentId,
              typePaiement: eventType as any,
              sourceModule: "CAISSE_AGENT" as any,
              sourceTable: "sessions_agent",
              sourceId: session.id,
              agenceId: session.agenceId,
              requiresGlPosting: true,
              createdBy: params.finalizedBy,
              metadata: {
                operationType: eventType,
                sessionAgentId: session.id,
                ecart,
                ecartJustification: params.ecartJustification,
              },
            })
            .returning();

          const glEcartResult = await postGlForMouvement(
            tx,
            mouvementEcart,
            session.agenceId,
            params.finalizedBy,
            { eventType },
          );

          if (glEcartResult) {
            await tx
              .update(mouvementsFinanciers)
              .set({ glPostingStatus: "POSTED" })
              .where(eq(mouvementsFinanciers.id, mouvementEcart.id));
          }

          logger.info(
            { sessionId: session.id, ecart, eventType },
            'Cash discrepancy recorded',
          );
        }

        // 5. Update caisse agent balance (set to 0 — everything returned or accounted for)
        const [caisseAgent] = await tx
          .select({ soldeValide: caissesAgent.soldeValide })
          .from(caissesAgent)
          .where(eq(caissesAgent.id, session.caisseAgentId))
          .for("update");

        const currentBalance = parseFloat(caisseAgent?.soldeValide ?? "0");
        await tx
          .update(caissesAgent)
          .set({
            soldeValide: sql`${caissesAgent.soldeValide} - ${currentBalance}`,
            updatedAt: new Date(),
          })
          .where(eq(caissesAgent.id, session.caisseAgentId));

        // 6. Update destination caisse balance
        if (montantRetourne > 0) {
          await tx
            .update(caisses)
            .set({
              solde: sql`${caisses.solde} + ${montantRetourne}`,
              updatedAt: new Date(),
            })
            .where(eq(caisses.id, session.destinationCaisseId));
        }

        // 7. Finalize session → CLOSED
        const [updatedSession] = await tx
          .update(sessionsAgent)
          .set({
            statut: "CLOSED",
            montantRetourne: String(montantRetourne),
            ecartJustification: params.ecartJustification || session.ecartJustification,
            closingOperationId: closeOperation.id,
            closedAt: new Date(),
            closedBy: params.finalizedBy,
            updatedAt: new Date(),
          })
          .where(eq(sessionsAgent.id, session.id))
          .returning();

        // 8. Audit log
        await tx.insert(sessionsAgentAuditLogs).values({
          sessionId: session.id,
          action: "CLOSED",
          statutAvant: "CLOSING",
          statutApres: "CLOSED",
          details: {
            montantRetourne,
            ecart,
            ecartJustification: params.ecartJustification,
            destinationCaisseId: session.destinationCaisseId,
            closeOperationId: closeOperation.id,
          },
          userId: params.finalizedBy,
        });

        logger.info(
          { sessionId: session.id, montantRetourne, ecart },
          'Agent session closed',
        );

        this.broadcastSessionUpdate(updatedSession);
        if (session.destinationCaisseId) {
          this.broadcastCaisseUpdate(updatedSession.agenceId, {
            domainEvent: 'AGENT_RETURN',
            caisseId: session.destinationCaisseId,
            agentId: session.agentId,
          });
        }
        return { success: true, session: updatedSession };
      });
    } catch (error: any) {
      logger.error({ err: error, sessionId: params.sessionId }, 'Error finalizing close');
      return { success: false, error: error.message, errorCode: "INTERNAL_ERROR" };
    }
  }

  /**
   * Clôture directe avec remise (ACTIVE → CLOSED en une seule étape)
   * Combine initiateClose + finalizeClose sans état intermédiaire CLOSING.
   *
   * GL entries:
   *   D: Caisse agence (521)  /  C: Agent GL (573xxx) — pour le montant retourné
   *   + écriture d'écart si surplus ou déficit
   */
  async closeWithRemise(params: CloseWithRemiseInput): Promise<SessionResult> {
    try {
      return await db.transaction(async (tx) => {
        // 1. Lock session
        const [session] = await tx
          .select()
          .from(sessionsAgent)
          .where(eq(sessionsAgent.id, params.sessionId))
          .for("update");

        if (!session) {
          return { success: false, error: "Session non trouvée", errorCode: "NOT_FOUND" };
        }

        if (session.statut !== "ACTIVE") {
          return {
            success: false,
            error: `Statut invalide: ${session.statut} (attendu: ACTIVE)`,
            errorCode: "INVALID_STATUS",
          };
        }

        // 2. Calculate theoretical balance & ecart
        const [caisseAgent] = await tx
          .select({ soldeValide: caissesAgent.soldeValide })
          .from(caissesAgent)
          .where(eq(caissesAgent.id, session.caisseAgentId))
          .for("update");

        const montantTheorique = parseFloat(caisseAgent?.soldeValide ?? "0");
        const ecart = params.montantPhysique - montantTheorique;
        const montantRetourne = params.montantPhysique;

        // 3. Create SESSION_CLOSE operation
        const reference = generateReference("CAISSE_AGENT" as any);
        const [closeOperation] = await tx
          .insert(operationsTerrain)
          .values({
            reference,
            type: "SESSION_CLOSE",
            agentId: session.agentId,
            caisseAgentId: session.caisseAgentId,
            destinationCaisseId: params.destinationCaisseId,
            montant: String(montantRetourne),
            statut: "APPROVED",
            submittedBy: params.closedBy,
            submittedAt: new Date(),
            approvedBy: params.closedBy,
            approvedAt: new Date(),
            postedAt: new Date(),
            sessionAgentId: session.id,
            metadata: {
              observations: params.observations || `Clôture directe session ${session.id}`,
              ecart: String(ecart),
              ecartJustification: params.ecartJustification,
            },
          })
          .returning();

        // 4. Financial movement: return funds agent → caisse
        if (montantRetourne > 0) {
          const refReturn = generateReference("CAISSE_AGENT" as any);
          const [mouvementReturn] = await tx
            .insert(mouvementsFinanciers)
            .values({
              dateOperation: new Date(),
              montant: String(montantRetourne),
              sens: "CREDIT",
              statut: StatutTransaction.POSTED,
              methodePaiement: "CASH",
              reference: refReturn,
              agentId: session.agentId,
              typePaiement: "AGENT_SESSION_CLOSE" as any,
              sourceModule: "CAISSE_AGENT" as any,
              sourceTable: "operations_terrain",
              sourceId: closeOperation.id,
              agenceId: session.agenceId,
              requiresGlPosting: true,
              createdBy: params.closedBy,
              metadata: {
                operationType: "SESSION_CLOSE",
                sessionAgentId: session.id,
              },
            })
            .returning();

          // GL: D 521 / C 573xxx
          const glResult = await postGlForMouvement(
            tx,
            mouvementReturn,
            session.agenceId,
            params.closedBy,
            { eventType: "AGENT_SESSION_CLOSE" },
          );

          if (glResult) {
            await tx
              .update(mouvementsFinanciers)
              .set({ glPostingStatus: "POSTED" })
              .where(eq(mouvementsFinanciers.id, mouvementReturn.id));
          }

          await tx
            .update(operationsTerrain)
            .set({ postedMouvementCaisseAgentId: mouvementReturn.id })
            .where(eq(operationsTerrain.id, closeOperation.id));
        }

        // 5. Handle ecart (surplus/deficit)
        if (ecart !== 0) {
          const isDeficit = ecart < 0;
          const ecartAbs = Math.abs(ecart);
          const eventType = isDeficit ? "AGENT_ECART_DEFICIT" : "AGENT_ECART_SURPLUS";

          const refEcart = generateReference("CAISSE_AGENT" as any);
          const [mouvementEcart] = await tx
            .insert(mouvementsFinanciers)
            .values({
              dateOperation: new Date(),
              montant: String(ecartAbs),
              sens: isDeficit ? "CREDIT" : "DEBIT",
              statut: StatutTransaction.POSTED,
              methodePaiement: "CASH",
              reference: refEcart,
              agentId: session.agentId,
              typePaiement: eventType as any,
              sourceModule: "CAISSE_AGENT" as any,
              sourceTable: "sessions_agent",
              sourceId: session.id,
              agenceId: session.agenceId,
              requiresGlPosting: true,
              createdBy: params.closedBy,
              metadata: {
                operationType: eventType,
                sessionAgentId: session.id,
                ecart,
                ecartJustification: params.ecartJustification,
              },
            })
            .returning();

          const glEcartResult = await postGlForMouvement(
            tx,
            mouvementEcart,
            session.agenceId,
            params.closedBy,
            { eventType },
          );

          if (glEcartResult) {
            await tx
              .update(mouvementsFinanciers)
              .set({ glPostingStatus: "POSTED" })
              .where(eq(mouvementsFinanciers.id, mouvementEcart.id));
          }

          logger.info(
            { sessionId: session.id, ecart, eventType },
            'Cash discrepancy recorded (direct close)',
          );
        }

        // 6. Auto-settle all PENDING paiements for this session
        //    → impacte les comptes clients (crédits, épargne, tontines)
        const pendingPaiements = await tx
          .select({ paiement: paiementsTerrain })
          .from(operationsTerrain)
          .innerJoin(
            paiementsTerrain,
            eq(operationsTerrain.postedPaiementTerrainId, paiementsTerrain.id),
          )
          .where(
            and(
              eq(operationsTerrain.sessionAgentId, session.id),
              eq(paiementsTerrain.statut, "PENDING"),
              isNull(paiementsTerrain.deletedAt),
            ),
          )
          .for("update", { of: paiementsTerrain });

        let settledCount = 0;
        for (const { paiement } of pendingPaiements) {
          const montant = parseFloat(paiement.montant);
          let clientMouvement: any = null;

          // --- Credit repayment ---
          if (paiement.creditId) {
            const [credit] = await tx
              .select()
              .from(credits)
              .where(eq(credits.id, paiement.creditId));
            if (credit) {
              const ref = generateReference("CREDIT");
              const [mvt] = await tx
                .insert(mouvementsFinanciers)
                .values({
                  dateOperation: new Date(),
                  montant: paiement.montant,
                  sens: "CREDIT",
                  statut: StatutTransaction.POSTED,
                  methodePaiement: "CASH",
                  reference: ref,
                  agentId: paiement.agentId,
                  clientId: paiement.clientId,
                  creditId: paiement.creditId,
                  typePaiement: TypeOperationCaisse.CREDIT_REPAYMENT,
                  sourceModule: "CREDIT",
                  sourceTable: "paiements_terrain",
                  sourceId: paiement.id,
                  agenceId: session.agenceId,
                  createdBy: params.closedBy,
                  metadata: { settledFromSessionClose: true, sessionId: session.id },
                })
                .returning();
              clientMouvement = mvt;
              await updateCreditSolde(tx, paiement.creditId, -montant);
              await tx.insert(remboursements).values({
                creditId: paiement.creditId,
                mouvementId: mvt.id,
                montant: paiement.montant,
                dateRemboursement: new Date(),
                statut: StatutTransaction.POSTED,
                methodePaiement: "CASH",
                observations: paiement.observations,
                createdBy: params.closedBy,
              });
            }
          // --- Account deposit (epargne/courant) ---
          } else if (paiement.compteId) {
            const [compte] = await tx
              .select()
              .from(comptes)
              .where(eq(comptes.id, paiement.compteId));
            if (compte) {
              const ref = generateReference("EPARGNE");
              const [mvt] = await tx
                .insert(mouvementsFinanciers)
                .values({
                  dateOperation: new Date(),
                  montant: paiement.montant,
                  sens: "CREDIT",
                  statut: StatutTransaction.POSTED,
                  methodePaiement: "CASH",
                  reference: ref,
                  agentId: paiement.agentId,
                  clientId: paiement.clientId,
                  compteId: paiement.compteId,
                  typePaiement: paiement.typePaiement,
                  sourceModule: "EPARGNE",
                  sourceTable: "paiements_terrain",
                  sourceId: paiement.id,
                  agenceId: session.agenceId,
                  createdBy: params.closedBy,
                  metadata: { settledFromSessionClose: true, sessionId: session.id },
                })
                .returning();
              clientMouvement = mvt;
              await tx
                .update(comptes)
                .set({
                  soldeCourant: sql`${comptes.soldeCourant} + ${montant}`,
                  updatedAt: new Date(),
                })
                .where(eq(comptes.id, paiement.compteId));
              await tx.insert(transactionsCompte).values({
                compteId: paiement.compteId,
                mouvementId: mvt.id,
                typePaiement: paiement.typePaiement,
                sens: "CREDIT",
                statut: StatutTransaction.POSTED,
                montant: paiement.montant,
                methodePaiement: "CASH",
                observations: paiement.observations,
                createdBy: params.closedBy,
              });
            }
          // --- Tontine contribution ---
          } else if (paiement.tontineId) {
            const refTontine = generateReference("TONTINE");
            const [mvt] = await tx
              .insert(mouvementsFinanciers)
              .values({
                dateOperation: new Date(),
                montant: paiement.montant,
                sens: "CREDIT",
                statut: StatutTransaction.POSTED,
                methodePaiement: "CASH",
                reference: refTontine,
                agentId: paiement.agentId,
                clientId: paiement.clientId,
                tontineId: paiement.tontineId,
                typePaiement: TypeOperationCaisse.TONTINE_CONTRIBUTION,
                sourceModule: "TONTINE",
                sourceTable: "paiements_terrain",
                sourceId: paiement.id,
                agenceId: session.agenceId,
                createdBy: params.closedBy,
                metadata: { settledFromSessionClose: true, sessionId: session.id },
              })
              .returning();
            clientMouvement = mvt;
            const refContrib = generateReference("CONTRIBUTION" as any);
            await tx.insert(contributionsTontine).values({
              tontineId: paiement.tontineId,
              clientId: paiement.clientId,
              mouvementId: mvt.id,
              typeOperation: TypeOperationCaisse.TONTINE_CONTRIBUTION,
              montant: paiement.montant,
              methodePaiement: "CASH",
              statutTransaction: StatutTransaction.POSTED,
              reference: refContrib,
              observations: paiement.observations,
              createdBy: params.closedBy,
            });
          }

          // Update paiement status → POSTED
          await tx
            .update(paiementsTerrain)
            .set({
              statut: StatutTransaction.POSTED,
              settledAt: new Date(),
              postedMouvementClientId: clientMouvement?.id || null,
              updatedAt: new Date(),
            })
            .where(eq(paiementsTerrain.id, paiement.id));

          // GL posting for client-side movement (inside transaction for atomicity)
          if (clientMouvement && paiement.agenceId) {
            await postGlForMouvement(
              tx,
              clientMouvement,
              paiement.agenceId,
              params.closedBy,
              {
                source: "session_close",
                typePaiement: paiement.typePaiement,
              },
            );
          }

          settledCount++;
        }

        if (settledCount > 0) {
          logger.info(
            { sessionId: session.id, settledCount },
            'Auto-settled pending payments during session close',
          );
        }

        // 7. Zero out agent caisse balance
        const currentBalance = parseFloat(caisseAgent?.soldeValide ?? "0");
        await tx
          .update(caissesAgent)
          .set({
            soldeValide: sql`${caissesAgent.soldeValide} - ${currentBalance}`,
            updatedAt: new Date(),
          })
          .where(eq(caissesAgent.id, session.caisseAgentId));

        // 8. Credit destination caisse
        if (montantRetourne > 0) {
          await tx
            .update(caisses)
            .set({
              solde: sql`${caisses.solde} + ${montantRetourne}`,
              updatedAt: new Date(),
            })
            .where(eq(caisses.id, params.destinationCaisseId));
        }

        // 9. Update session → CLOSED (skip CLOSING intermediate state)
        const [updatedSession] = await tx
          .update(sessionsAgent)
          .set({
            statut: "CLOSED",
            closingInitiatedAt: new Date(),
            montantPhysique: String(params.montantPhysique),
            montantTheorique: String(montantTheorique),
            ecart: String(ecart),
            billetageFermeture: params.billetage,
            destinationCaisseId: params.destinationCaisseId,
            montantRetourne: String(montantRetourne),
            ecartJustification: params.ecartJustification || null,
            closingOperationId: closeOperation.id,
            closedAt: new Date(),
            closedBy: params.closedBy,
            observations: params.observations || session.observations,
            updatedAt: new Date(),
          })
          .where(eq(sessionsAgent.id, session.id))
          .returning();

        // 10. Audit log
        await tx.insert(sessionsAgentAuditLogs).values({
          sessionId: session.id,
          action: "DIRECT_CLOSED",
          statutAvant: "ACTIVE",
          statutApres: "CLOSED",
          details: {
            montantPhysique: params.montantPhysique,
            montantTheorique,
            montantRetourne,
            ecart,
            ecartJustification: params.ecartJustification,
            billetage: params.billetage,
            destinationCaisseId: params.destinationCaisseId,
            closeOperationId: closeOperation.id,
            settledPaiementsCount: settledCount,
          },
          userId: params.closedBy,
        });

        logger.info(
          { sessionId: session.id, montantRetourne, ecart },
          'Agent session directly closed with remise',
        );

        this.broadcastSessionUpdate(updatedSession);
        if (params.destinationCaisseId) {
          this.broadcastCaisseUpdate(updatedSession.agenceId, {
            domainEvent: 'AGENT_RETURN',
            caisseId: params.destinationCaisseId,
            agentId: session.agentId,
          });
        }
        return { success: true, session: updatedSession };
      });
    } catch (error: any) {
      logger.error({ err: error, sessionId: params.sessionId }, 'Error closing with remise');
      return { success: false, error: error.message, errorCode: "INTERNAL_ERROR" };
    }
  }

  /**
   * Transférer un agent vers une autre agence (Mode A: nouveau sous-compte GL)
   */
  async transferAgency(params: TransferAgencyInput): Promise<SessionResult> {
    try {
      return await db.transaction(async (tx) => {
        // 1. Vérifier aucune session non-CLOSED
        const [activeSession] = await tx
          .select({ id: sessionsAgent.id, statut: sessionsAgent.statut })
          .from(sessionsAgent)
          .where(and(
            eq(sessionsAgent.agentId, params.agentId),
            ne(sessionsAgent.statut, "CLOSED"),
          ))
          .limit(1);

        if (activeSession) {
          return {
            success: false,
            error: `Session active existante (${activeSession.statut}). Clôturer avant transfert.`,
            errorCode: "SESSION_ACTIVE",
          };
        }

        // 2. Vérifier solde caisse agent = 0
        const [caisseAgent] = await tx
          .select({ soldeValide: caissesAgent.soldeValide })
          .from(caissesAgent)
          .innerJoin(agentsTerrain, eq(caissesAgent.agentId, agentsTerrain.id))
          .where(and(eq(caissesAgent.agentId, params.agentId), isNull(caissesAgent.deletedAt)));

        if (caisseAgent && parseFloat(caisseAgent.soldeValide) !== 0) {
          return {
            success: false,
            error: `Solde agent non nul: ${caisseAgent.soldeValide}. Doit être 0 pour transfert.`,
            errorCode: "NON_ZERO_BALANCE",
          };
        }

        // 3. Clôturer l'assignation courante
        await tx
          .update(agentAgencyHistory)
          .set({ dateTo: new Date() })
          .where(and(
            eq(agentAgencyHistory.agentId, params.agentId),
            isNull(agentAgencyHistory.dateTo),
          ));

        // 4. Provisionner nouveau sous-compte GL dans la nouvelle agence
        const glResult = await agentGlProvisioningService.provisionOrGetGlAccount(
          tx,
          params.agentId,
          params.newAgenceId,
        );

        // provisionOrGetGlAccount already updates agentsTerrain and creates history

        logger.info(
          { agentId: params.agentId, newAgenceId: params.newAgenceId, glAccount: glResult.glAccountNumber },
          'Agent transferred to new agency',
        );

        // Broadcast agent update for real-time sync
        try {
          const ws = getWsInstance();
          if (ws) {
            ws.broadcast({
              type: "AGENT_MODULES_UPDATE",
              payload: {
                entity: "terrain",
                agentId: params.agentId,
                action: "TRANSFER_AGENCY",
                newAgenceId: params.newAgenceId,
              },
            });
          }
        } catch {
          // Non-critical
        }

        // Return a synthetic session result
        return {
          success: true,
          session: undefined, // No session created — just the transfer
        };
      });
    } catch (error: any) {
      logger.error({ err: error, agentId: params.agentId }, 'Error transferring agency');
      return { success: false, error: error.message, errorCode: "INTERNAL_ERROR" };
    }
  }

  // ============================================================================
  // QUERY METHODS
  // ============================================================================

  /**
   * Get active (non-CLOSED) session for an agent
   */
  async getActiveSession(agentId: string): Promise<SessionAgent | null> {
    const [session] = await db
      .select()
      .from(sessionsAgent)
      .where(and(
        eq(sessionsAgent.agentId, agentId),
        ne(sessionsAgent.statut, "CLOSED"),
      ))
      .limit(1);
    return session ?? null;
  }

  /**
   * Get session by ID
   */
  async getSessionById(sessionId: string): Promise<SessionAgent | null> {
    const [session] = await db
      .select()
      .from(sessionsAgent)
      .where(eq(sessionsAgent.id, sessionId))
      .limit(1);
    return session ?? null;
  }

  /**
   * List sessions with filters
   */
  async listSessions(filters: {
    agentId?: string;
    agenceId?: string;
    sourceCaisseId?: string;
    statut?: string;
    limit?: number;
    offset?: number;
  }) {
    const conditions = [];
    if (filters.agentId) conditions.push(eq(sessionsAgent.agentId, filters.agentId));
    if (filters.agenceId) conditions.push(eq(sessionsAgent.agenceId, filters.agenceId));
    if (filters.statut) conditions.push(eq(sessionsAgent.statut, filters.statut as any));
    // Filter by target caisse: show sessions targeting this caisse OR with no specific target
    if (filters.sourceCaisseId) {
      conditions.push(
        or(
          eq(sessionsAgent.sourceCaisseId, filters.sourceCaisseId),
          isNull(sessionsAgent.sourceCaisseId),
        )!
      );
    }

    const rows = await db
      .select({
        session: sessionsAgent,
        agentNom: users.nom,
        agentPrenom: users.prenom,
      })
      .from(sessionsAgent)
      .leftJoin(users, eq(sessionsAgent.agentId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(sessionsAgent.createdAt))
      .limit(filters.limit ?? 50)
      .offset(filters.offset ?? 0);

    return rows.map(r => ({
      ...r.session,
      agentNom: r.agentNom,
      agentPrenom: r.agentPrenom,
    }));
  }

  /**
   * Get audit logs for a session
   */
  async getSessionAuditLogs(sessionId: string) {
    return db
      .select()
      .from(sessionsAgentAuditLogs)
      .where(eq(sessionsAgentAuditLogs.sessionId, sessionId))
      .orderBy(desc(sessionsAgentAuditLogs.timestamp));
  }

  /**
   * Get agency history for an agent
   */
  async getAgencyHistory(agentId: string) {
    return db
      .select()
      .from(agentAgencyHistory)
      .where(eq(agentAgencyHistory.agentId, agentId))
      .orderBy(desc(agentAgencyHistory.dateFrom));
  }

  /**
   * Get agent session config for an agency (with defaults)
   */
  async getSessionConfig(agenceId: string): Promise<AgentSessionConfig | null> {
    const [config] = await db
      .select()
      .from(agentSessionConfig)
      .where(eq(agentSessionConfig.agenceId, agenceId))
      .limit(1);
    return config ?? null;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private broadcastSessionUpdate(session: SessionAgent) {
    try {
      const ws = getWsInstance();
      if (ws) {
        ws.broadcastToAgency(session.agenceId, {
          type: "SESSION_AGENT_UPDATE",
          payload: {
            sessionId: session.id,
            agentId: session.agentId,
            agenceId: session.agenceId,
            statut: session.statut,
            updatedAt: session.updatedAt,
          },
        });
      }
    } catch {
      // WebSocket broadcast is non-critical
    }
  }

  private broadcastCaisseUpdate(agenceId: string, payload: Record<string, unknown>) {
    try {
      const ws = getWsInstance();
      if (ws) {
        ws.broadcastToAgency(agenceId, {
          type: "CAISSE_UPDATE",
          payload,
        });
      }
    } catch {
      // WebSocket broadcast is non-critical
    }
  }
}

export const sessionAgentService = new SessionAgentService();
