/**
 * RemiseSettlementService - Gestion du bordereau de remise
 *
 * Ce service implémente le workflow de remise (settlement):
 * - Les paiements cash collectés ont le statut PENDING_SETTLEMENT après approbation
 * - Le compte client n'est PAS impacté à l'approbation
 * - Seul le solde de l'agent (caissesAgent.soldeValide) est incrémenté
 *
 * À la validation de la REMISE:
 * - Les comptes clients sont impactés (crédit, épargne, tontine)
 * - Les écritures OHADA sont générées
 * - Les paiements passent en statut POSTED
 *
 * Ce workflow garantit que l'argent est physiquement reçu avant d'impacter les comptes.
 */

import { db } from "../../db";
import { createLogger } from "../../lib/logger";

const logger = createLogger('RemiseSettlement');
import {
  remisesTerrain,
  remiseItems,
  remiseAuditLogs,
  paiementsTerrain,
  operationsTerrain,
  caissesAgent,
  mouvementsFinanciers,
  credits,
  comptes,
  evenementsOutbox,
  sessionsCaisse,
  caisses,
  operationsCaisse,
  clients,
  users,
  agentsTerrain,
  employes,
  remboursements,
  transactionsCompte,
  contributionsTontine,
} from "@shared/schema";
import { StatutTransaction, TypeOperationCaisse, StatutRemiseTerrain } from "@shared/enum/status-constants";
import { eq, sql, and, inArray, notInArray, isNull, desc } from "drizzle-orm";

const SESSION_TERMINAL_STATUSES = ["CLOSED", "RECONCILIATION_PENDING", "RECONCILIATION_COMPLETE"] as const;
import { generateReference, updateCreditSolde, updateSessionSolde, type MouvementFinancier } from "../ledger";
import { postFromMouvement } from "../accounting-posting-service";
import type { PgTransaction } from "drizzle-orm/pg-core";

// ============================================================================
// TYPES
// ============================================================================

interface CreateRemiseInput {
  agentId: string;
  caisseDestinationId: string;
  montantDeclare: number;
  paiementIds: string[];
  observations?: string;
  billetage?: Record<string, number>;
  idempotencyKey?: string;
  createdBy: string;
  agenceId?: string;
}

interface ValidateRemiseInput {
  remiseId: string;
  validatedBy: string;
  sessionCaisseId?: string;
  ipAddress?: string;
  userAgent?: string;
}

interface RemiseResult {
  success: boolean;
  remise?: typeof remisesTerrain.$inferSelect;
  items?: (typeof remiseItems.$inferSelect)[];
  error?: string;
  errorCode?: string;
}

interface SettlementResult {
  success: boolean;
  remise?: typeof remisesTerrain.$inferSelect;
  mouvements?: MouvementFinancier[];
  error?: string;
  errorCode?: string;
}

// ============================================================================
// SERVICE
// ============================================================================

export class RemiseSettlementService {
  /**
   * Crée un bordereau de remise avec les paiements sélectionnés
   * Les paiements doivent être en statut PENDING_SETTLEMENT
   */
  async createRemise(params: CreateRemiseInput): Promise<RemiseResult> {
    return await db.transaction(async (tx) => {
      // 1. Vérifier idempotence
      if (params.idempotencyKey) {
        const [existing] = await tx
          .select()
          .from(remisesTerrain)
          .where(eq(remisesTerrain.idempotencyKey, params.idempotencyKey));

        if (existing) {
          const items = await tx.select().from(remiseItems).where(eq(remiseItems.remiseId, existing.id));
          return { success: true, remise: existing, items };
        }
      }

      // 2. Récupérer et verrouiller les paiements
      const paiements = await tx
        .select()
        .from(paiementsTerrain)
        .where(and(
          inArray(paiementsTerrain.id, params.paiementIds),
          eq(paiementsTerrain.statut, "PENDING_SETTLEMENT"),
          isNull(paiementsTerrain.settledRemiseId),
        ))
        .for("update");

      if (paiements.length !== params.paiementIds.length) {
        return {
          success: false,
          error: `Certains paiements ne sont pas éligibles pour remise. Attendus: ${params.paiementIds.length}, Trouvés: ${paiements.length}`,
          errorCode: "INVALID_PAYMENTS",
        };
      }

      // 3. Calculer le montant total des paiements
      const montantCalcule = paiements.reduce((sum, p) => sum + parseFloat(p.montant), 0);

      // 4. Créer le bordereau de remise
      const reference = `REM-${generateReference("REMISE")}`;
      const [remise] = await tx
        .insert(remisesTerrain)
        .values({
          agentId: params.agentId,
          agenceId: params.agenceId,
          caisseDestinationId: params.caisseDestinationId,
          reference,
          idempotencyKey: params.idempotencyKey,
          montantDeclare: params.montantDeclare.toString(),
          montantCalcule: montantCalcule.toString(),
          ecart: (params.montantDeclare - montantCalcule).toString(),
          statut: StatutRemiseTerrain.PENDING,
          billetage: params.billetage,
          observations: params.observations,
        })
        .returning();

      // 5. Créer les items de remise
      const itemsToInsert = paiements.map((p) => ({
        remiseId: remise.id,
        paiementTerrainId: p.id,
        montant: p.montant,
        typePaiement: p.typePaiement,
        clientId: p.clientId,
      }));

      const items = await tx.insert(remiseItems).values(itemsToInsert).returning();

      // 6. Lier les paiements à cette remise (mais pas encore settled)
      await tx
        .update(paiementsTerrain)
        .set({
          remiseId: remise.id,
          updatedAt: new Date(),
        })
        .where(inArray(paiementsTerrain.id, params.paiementIds));

      // 7. Audit log
      await tx.insert(remiseAuditLogs).values({
        remiseId: remise.id,
        action: "CREATED",
        statutAvant: null,
        statutApres: StatutRemiseTerrain.PENDING,
        details: {
          paiementCount: paiements.length,
          montantDeclare: params.montantDeclare,
          montantCalcule,
          paiementIds: params.paiementIds,
        },
        userId: params.createdBy,
      });

      // 8. Outbox event
      await tx.insert(evenementsOutbox).values({
        type: "REMISE_CREATED",
        aggregateType: "remise_terrain",
        aggregateId: remise.id,
        payload: {
          remiseId: remise.id,
          agentId: params.agentId,
          montantDeclare: params.montantDeclare,
          montantCalcule,
          paiementCount: paiements.length,
        },
      });

      return { success: true, remise, items };
    });
  }

  /**
   * Valide et settle une remise - C'EST ICI que les comptes clients sont impactés
   */
  async validateAndSettleRemise(params: ValidateRemiseInput): Promise<SettlementResult> {
    return await db.transaction(async (tx) => {
      // 1. Verrouiller la remise
      const [remise] = await tx
        .select()
        .from(remisesTerrain)
        .where(eq(remisesTerrain.id, params.remiseId))
        .for("update");

      if (!remise) {
        return {
          success: false,
          error: "Remise non trouvée",
          errorCode: "NOT_FOUND",
        };
      }

      // 2. Idempotence - déjà settled?
      if (remise.statut === StatutRemiseTerrain.SETTLED) {
        return { success: true, remise, mouvements: [] };
      }

      // 3. Vérifier statut valide
      if (remise.statut !== StatutRemiseTerrain.PENDING && remise.statut !== StatutRemiseTerrain.VALIDATED) {
        return {
          success: false,
          error: `Impossible de valider: statut actuel ${remise.statut}`,
          errorCode: "INVALID_STATUS",
        };
      }

      // 3b. SoD: Le créateur de la remise ne peut pas être le validateur
      // remise.agentId → agentsTerrain.employeId → employes.userId → users.id
      if (remise.agentId && params.validatedBy) {
        const [agentUser] = await tx
          .select({ userId: employes.userId })
          .from(agentsTerrain)
          .innerJoin(employes, eq(agentsTerrain.employeId, employes.id))
          .where(eq(agentsTerrain.id, remise.agentId));
        if (agentUser?.userId && agentUser.userId === params.validatedBy) {
          return {
            success: false,
            error: "Conflit d'intérêts : le créateur de la remise ne peut pas être le validateur",
            errorCode: "SOD_VIOLATION",
          };
        }
      }

      // 4. Récupérer les items et paiements
      const items = await tx
        .select()
        .from(remiseItems)
        .where(eq(remiseItems.remiseId, remise.id));

      const paiementIds = items.map((i) => i.paiementTerrainId);
      const paiements = await tx
        .select()
        .from(paiementsTerrain)
        .where(inArray(paiementsTerrain.id, paiementIds))
        .for("update");

      // 5. SETTLEMENT: Impacter les comptes clients
      const allMouvements: MouvementFinancier[] = [];

      for (const paiement of paiements) {
        const result = await this.settlePaymentToClient(tx, paiement, remise.id, params.validatedBy);
        if (!result.success) {
          return result;
        }
        if (result.mouvement) {
          allMouvements.push(result.mouvement);
        }

        // Mettre à jour le paiement comme settled
        await tx
          .update(paiementsTerrain)
          .set({
            statut: StatutTransaction.POSTED,
            settledRemiseId: remise.id,
            settledAt: new Date(),
            postedMouvementClientId: result.mouvement?.id || null,
            updatedAt: new Date(),
          })
          .where(eq(paiementsTerrain.id, paiement.id));

        // Mettre à jour l'item de remise
        await tx
          .update(remiseItems)
          .set({
            settledAt: new Date(),
            mouvementClientId: result.mouvement?.id || null,
          })
          .where(eq(remiseItems.paiementTerrainId, paiement.id));
      }

      // 6. Débiter la caisse agent (l'argent sort de la caisse agent)
      const [caisseAgent] = await tx
        .select()
        .from(caissesAgent)
        .where(eq(caissesAgent.agentId, remise.agentId))
        .for("update");

      if (!caisseAgent) {
        return {
          success: false,
          error: "Caisse agent non trouvée",
          errorCode: "CAISSE_NOT_FOUND",
        };
      }

      const montantRemise = parseFloat(remise.montantCalcule);
      if (parseFloat(caisseAgent.soldeValide) < montantRemise) {
        return {
          success: false,
          error: `Solde caisse agent insuffisant: ${caisseAgent.soldeValide} < ${montantRemise}`,
          errorCode: "INSUFFICIENT_BALANCE",
        };
      }

      // Mouvement de sortie caisse agent
      const refCaisseAgent = generateReference("CAISSE_AGENT");
      const [mouvementSortieCaisseAgent] = await tx
        .insert(mouvementsFinanciers)
        .values({
          dateOperation: new Date(),
          montant: remise.montantCalcule,
          sens: "CREDIT", // Crédit = Réduit la créance agent (argent sort)
          statut: StatutTransaction.POSTED,
          methodePaiement: "CASH",
          reference: refCaisseAgent,
          agentId: remise.agentId,
          sourceModule: "CAISSE_AGENT",
          sourceTable: "remises_terrain",
          sourceId: remise.id,
          createdBy: params.validatedBy,
          metadata: {
            operationType: "REMISE_SETTLEMENT",
            remiseId: remise.id,
          },
        })
        .returning();

      allMouvements.push(mouvementSortieCaisseAgent);

      // Débiter solde caisse agent
      await tx
        .update(caissesAgent)
        .set({
          soldeValide: sql`${caissesAgent.soldeValide} - ${montantRemise}`,
          updatedAt: new Date(),
        })
        .where(eq(caissesAgent.id, caisseAgent.id));

      // 7. Créditer la caisse destination (entrée physique)
      const refCaisse = generateReference("CAISSE");
      const [mouvementEntreeCaisse] = await tx
        .insert(mouvementsFinanciers)
        .values({
          dateOperation: new Date(),
          montant: remise.montantCalcule,
          sens: "DEBIT", // Débit = Entrée en caisse physique
          statut: StatutTransaction.POSTED,
          methodePaiement: "CASH",
          reference: refCaisse,
          agentId: remise.agentId,
          sourceModule: "CAISSE",
          sourceTable: "remises_terrain",
          sourceId: remise.id,
          createdBy: params.validatedBy,
          metadata: {
            operationType: "REMISE_SETTLEMENT",
            remiseId: remise.id,
            fromCaisseAgent: caisseAgent.id,
          },
        })
        .returning();

      allMouvements.push(mouvementEntreeCaisse);

      // Mettre à jour la caisse destination
      let targetSessionId = params.sessionCaisseId || null;
      if (!targetSessionId) {
        const [activeCaisseSession] = await tx
          .select({ id: sessionsCaisse.id })
          .from(sessionsCaisse)
          .where(and(
            eq(sessionsCaisse.caisseId, remise.caisseDestinationId!),
            notInArray(sessionsCaisse.statut, [...SESSION_TERMINAL_STATUSES]),
            isNull(sessionsCaisse.deletedAt)
          ))
          .limit(1);
        if (activeCaisseSession) targetSessionId = activeCaisseSession.id;
      }

      if (targetSessionId) {
        await updateSessionSolde(tx, targetSessionId, montantRemise, true);

        // Lookup agent name for description
        const [agentUser] = await tx
          .select({ nom: users.nom, prenom: users.prenom })
          .from(users)
          .where(eq(users.id, remise.agentId));
        const agentDisplayName = agentUser
          ? `${agentUser.prenom || ''} ${agentUser.nom || ''}`.trim()
          : remise.agentId;

        // 7b. Résoudre les noms clients pour le détail embarqué dans le metadata
        const detailPaiements = [];
        for (const paiement of paiements) {
          const [clientData] = await tx
            .select({ nom: clients.nom, prenom: clients.prenom })
            .from(clients)
            .where(eq(clients.id, paiement.clientId));

          const clientName = clientData
            ? `${clientData.prenom || ''} ${clientData.nom || ''}`.trim()
            : 'Client';

          const typePaiementLabel =
            paiement.typePaiement === 'CREDIT_REPAYMENT' ? 'Remb. crédit' :
            paiement.typePaiement === 'DEPOSIT_SAVINGS' ? 'Dépôt épargne' :
            paiement.typePaiement === 'TONTINE_CONTRIBUTION' ? 'Cotisation tontine' :
            paiement.typePaiement;

          detailPaiements.push({
            paiementId: paiement.id,
            clientId: paiement.clientId,
            clientName,
            typePaiement: paiement.typePaiement,
            typePaiementLabel,
            montant: parseFloat(paiement.montant),
          });
        }

        await tx.insert(operationsCaisse).values({
          sessionId: targetSessionId,
          mouvementId: mouvementEntreeCaisse.id,
          typeOperation: TypeOperationCaisse.AGENT_SETTLEMENT,
          statut: StatutTransaction.POSTED,
          montant: remise.montantCalcule,
          methodePaiement: "CASH",
          reference: refCaisse,
          description: `Remise agent terrain - ${agentDisplayName} (${paiements.length} opération${paiements.length > 1 ? 's' : ''})`,
          createdBy: params.validatedBy,
          metadata: {
            remiseId: remise.id,
            agentId: remise.agentId,
            agentName: agentDisplayName,
            paiementCount: paiements.length,
            detailPaiements,
          },
        });
      } else {
        await tx
          .update(caisses)
          .set({
            solde: sql`${caisses.solde} + ${montantRemise}`,
            updatedAt: new Date(),
          })
          .where(eq(caisses.id, remise.caisseDestinationId!));
      }

      // 8. Mettre à jour la remise
      const [updatedRemise] = await tx
        .update(remisesTerrain)
        .set({
          statut: StatutRemiseTerrain.SETTLED,
          validatedAt: new Date(),
          validatedBy: params.validatedBy,
          settledAt: new Date(),
          sessionCaisseId: params.sessionCaisseId,
          mouvementCaisseId: mouvementEntreeCaisse.id,
          updatedAt: new Date(),
        })
        .where(eq(remisesTerrain.id, remise.id))
        .returning();

      // 9. Audit log
      await tx.insert(remiseAuditLogs).values({
        remiseId: remise.id,
        action: "SETTLED",
        statutAvant: remise.statut,
        statutApres: StatutRemiseTerrain.SETTLED,
        details: {
          paiementCount: paiements.length,
          mouvementIds: allMouvements.map((m) => m.id),
          caisseAgentId: caisseAgent.id,
          montantSettled: montantRemise,
        },
        userId: params.validatedBy,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      });

      // 10. Outbox events
      await tx.insert(evenementsOutbox).values({
        type: "REMISE_SETTLED",
        aggregateType: "remise_terrain",
        aggregateId: remise.id,
        payload: {
          remiseId: remise.id,
          agentId: remise.agentId,
          montantSettled: montantRemise,
          paiementCount: paiements.length,
        },
      });

      // Notification changement solde caisse agent
      await tx.insert(evenementsOutbox).values({
        type: "CAISSE_AGENT_SOLDE_CHANGE",
        aggregateType: "caisse_agent",
        aggregateId: caisseAgent.id,
        payload: {
          caisseAgentId: caisseAgent.id,
          agentId: remise.agentId,
          remiseId: remise.id,
          montant: -montantRemise,
        },
      });

      // 11. Poster les écritures comptables OHADA
      await this.postAccountingEntries(tx, updatedRemise, paiements, params.validatedBy);

      return { success: true, remise: updatedRemise, mouvements: allMouvements };
    });
  }

  /**
   * Settle un paiement vers le compte client
   * C'est ici que le crédit/compte/tontine du client est impacté
   */
  private async settlePaymentToClient(
    tx: PgTransaction<any, any, any>,
    paiement: typeof paiementsTerrain.$inferSelect,
    remiseId: string,
    settledBy: string
  ): Promise<SettlementResult & { mouvement?: MouvementFinancier }> {
    const montant = parseFloat(paiement.montant);

    // Selon le type de paiement, impacter le bon compte
    if (paiement.creditId) {
      return await this.settleCreditPayment(tx, paiement, montant, settledBy);
    } else if (paiement.compteId) {
      return await this.settleAccountDeposit(tx, paiement, montant, settledBy);
    } else if (paiement.tontineId) {
      return await this.settleTontineContribution(tx, paiement, montant, settledBy);
    }

    // Paiement divers - pas d'impact compte spécifique
    return { success: true };
  }

  /**
   * Settle un remboursement de crédit
   */
  private async settleCreditPayment(
    tx: PgTransaction<any, any, any>,
    paiement: typeof paiementsTerrain.$inferSelect,
    montant: number,
    settledBy: string
  ): Promise<SettlementResult & { mouvement?: MouvementFinancier }> {
    // Vérifier le crédit
    const [credit] = await tx
      .select()
      .from(credits)
      .where(eq(credits.id, paiement.creditId!));

    if (!credit) {
      return {
        success: false,
        error: `Crédit ${paiement.creditId} non trouvé`,
        errorCode: "CREDIT_NOT_FOUND",
      };
    }

    // Créer mouvement sur le crédit
    const refCredit = generateReference("CREDIT");
    const [mouvementCredit] = await tx
      .insert(mouvementsFinanciers)
      .values({
        dateOperation: new Date(),
        montant: paiement.montant,
        sens: "CREDIT", // Crédit = réduit la dette
        statut: StatutTransaction.POSTED,
        methodePaiement: "CASH",
        reference: refCredit,
        agentId: paiement.agentId,
        clientId: paiement.clientId,
        creditId: paiement.creditId,
        typePaiement: TypeOperationCaisse.CREDIT_REPAYMENT,
        sourceModule: "CREDIT",
        sourceTable: "paiements_terrain",
        sourceId: paiement.id,
        createdBy: settledBy,
        metadata: { settledFromRemise: true },
      })
      .returning();

    // Mettre à jour le solde du crédit
    await updateCreditSolde(tx, paiement.creditId!, -montant);

    // Créer l'entrée dans la table remboursements
    await tx.insert(remboursements).values({
      creditId: paiement.creditId!,
      mouvementId: mouvementCredit.id,
      montant: paiement.montant,
      dateRemboursement: new Date(),
      statut: StatutTransaction.POSTED,
      methodePaiement: "CASH",
      observations: paiement.observations,
      createdBy: settledBy,
    });

    return { success: true, mouvement: mouvementCredit };
  }

  /**
   * Settle un dépôt sur compte épargne/courant
   */
  private async settleAccountDeposit(
    tx: PgTransaction<any, any, any>,
    paiement: typeof paiementsTerrain.$inferSelect,
    montant: number,
    settledBy: string
  ): Promise<SettlementResult & { mouvement?: MouvementFinancier }> {
    // Vérifier le compte
    const [compte] = await tx
      .select()
      .from(comptes)
      .where(eq(comptes.id, paiement.compteId!));

    if (!compte) {
      return {
        success: false,
        error: `Compte ${paiement.compteId} non trouvé`,
        errorCode: "ACCOUNT_NOT_FOUND",
      };
    }

    // Créer mouvement sur le compte
    const refCompte = generateReference("EPARGNE");
    const [mouvementCompte] = await tx
      .insert(mouvementsFinanciers)
      .values({
        dateOperation: new Date(),
        montant: paiement.montant,
        sens: "CREDIT",
        statut: StatutTransaction.POSTED,
        methodePaiement: "CASH",
        reference: refCompte,
        agentId: paiement.agentId,
        clientId: paiement.clientId,
        compteId: paiement.compteId,
        typePaiement: paiement.typePaiement,
        sourceModule: "EPARGNE",
        sourceTable: "paiements_terrain",
        sourceId: paiement.id,
        createdBy: settledBy,
        metadata: { settledFromRemise: true },
      })
      .returning();

    // Mettre à jour le solde du compte
    await tx
      .update(comptes)
      .set({
        soldeCourant: sql`${comptes.soldeCourant} + ${montant}`,
        updatedAt: new Date(),
      })
      .where(eq(comptes.id, paiement.compteId!));

    // Créer l'entrée dans transactionsCompte
    await tx.insert(transactionsCompte).values({
      compteId: paiement.compteId!,
      mouvementId: mouvementCompte.id,
      typePaiement: paiement.typePaiement,
      sens: "CREDIT", // Settlement credits the account
      statut: StatutTransaction.POSTED,
      montant: paiement.montant,
      methodePaiement: "CASH",
      observations: paiement.observations,
      createdBy: settledBy,
    });

    return { success: true, mouvement: mouvementCompte };
  }

  /**
   * Settle une cotisation tontine
   */
  private async settleTontineContribution(
    tx: PgTransaction<any, any, any>,
    paiement: typeof paiementsTerrain.$inferSelect,
    montant: number,
    settledBy: string
  ): Promise<SettlementResult & { mouvement?: MouvementFinancier }> {
    // Créer mouvement pour la tontine
    const refTontine = generateReference("TONTINE");
    const [mouvementTontine] = await tx
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
        createdBy: settledBy,
        metadata: { settledFromRemise: true },
      })
      .returning();

    // Créer l'entrée dans contributionsTontine
    const refContribution = generateReference("CONTRIBUTION");
    await tx.insert(contributionsTontine).values({
      tontineId: paiement.tontineId!,
      clientId: paiement.clientId,
      mouvementId: mouvementTontine.id,
      typeOperation: TypeOperationCaisse.TONTINE_CONTRIBUTION,
      montant: paiement.montant,
      methodePaiement: "CASH",
      statutTransaction: StatutTransaction.POSTED,
      reference: refContribution,
      observations: paiement.observations,
      createdBy: settledBy,
    });

    return { success: true, mouvement: mouvementTontine };
  }

  /**
   * Poste les écritures comptables OHADA pour la remise
   */
  private async postAccountingEntries(
    tx: PgTransaction<any, any, any>,
    remise: typeof remisesTerrain.$inferSelect,
    paiements: (typeof paiementsTerrain.$inferSelect)[],
    postedBy: string
  ): Promise<void> {
    // Regrouper les paiements par type pour les écritures comptables
    const byType = paiements.reduce((acc, p) => {
      const key = p.typePaiement;
      if (!acc[key]) acc[key] = { total: 0, paiements: [] };
      acc[key].total += parseFloat(p.montant);
      acc[key].paiements.push(p);
      return acc;
    }, {} as Record<string, { total: number; paiements: typeof paiements }>);

    for (const [typePaiement, data] of Object.entries(byType)) {
      // Pour chaque paiement, poster à la comptabilité OHADA
      for (const paiement of data.paiements) {
        // Récupérer le mouvement client qui a été créé
        const [mouvementClient] = await tx
          .select()
          .from(mouvementsFinanciers)
          .where(and(
            eq(mouvementsFinanciers.sourceTable, "paiements_terrain"),
            eq(mouvementsFinanciers.sourceId, paiement.id),
            eq(mouvementsFinanciers.clientId, paiement.clientId),
          ))
          .orderBy(desc(mouvementsFinanciers.createdAt))
          .limit(1);

        if (mouvementClient && paiement.agenceId) {
          // STRICT — GL failure rolls back the entire transaction
          await postFromMouvement({
            mouvement: mouvementClient,
            agenceId: paiement.agenceId,
            userId: postedBy,
            additionalMetadata: {
              source: "remise_terrain",
              typePaiement,
            },
          });
        }
      }
    }
  }

  /**
   * Rejette une remise
   */
  async rejectRemise(params: {
    remiseId: string;
    rejectedBy: string;
    rejectionReason: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<RemiseResult> {
    return await db.transaction(async (tx) => {
      const [remise] = await tx
        .select()
        .from(remisesTerrain)
        .where(eq(remisesTerrain.id, params.remiseId))
        .for("update");

      if (!remise) {
        return {
          success: false,
          error: "Remise non trouvée",
          errorCode: "NOT_FOUND",
        };
      }

      if (remise.statut === StatutRemiseTerrain.REJECTED) {
        return { success: true, remise };
      }

      if (remise.statut !== StatutRemiseTerrain.PENDING) {
        return {
          success: false,
          error: `Impossible de rejeter: statut actuel ${remise.statut}`,
          errorCode: "INVALID_STATUS",
        };
      }

      // Délier les paiements de cette remise (ils restent en PENDING_SETTLEMENT)
      await tx
        .update(paiementsTerrain)
        .set({
          remiseId: null,
          updatedAt: new Date(),
        })
        .where(eq(paiementsTerrain.remiseId, remise.id));

      // Supprimer les items
      await tx.delete(remiseItems).where(eq(remiseItems.remiseId, remise.id));

      // Mettre à jour la remise
      const [updatedRemise] = await tx
        .update(remisesTerrain)
        .set({
          statut: StatutRemiseTerrain.REJECTED,
          rejectedAt: new Date(),
          rejectedBy: params.rejectedBy,
          rejectionReason: params.rejectionReason,
          updatedAt: new Date(),
        })
        .where(eq(remisesTerrain.id, remise.id))
        .returning();

      // Audit log
      await tx.insert(remiseAuditLogs).values({
        remiseId: remise.id,
        action: "REJECTED",
        statutAvant: remise.statut,
        statutApres: StatutRemiseTerrain.REJECTED,
        details: {
          reason: params.rejectionReason,
        },
        userId: params.rejectedBy,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      });

      // Outbox event
      await tx.insert(evenementsOutbox).values({
        type: "REMISE_REJECTED",
        aggregateType: "remise_terrain",
        aggregateId: remise.id,
        payload: {
          remiseId: remise.id,
          agentId: remise.agentId,
          reason: params.rejectionReason,
        },
      });

      return { success: true, remise: updatedRemise };
    });
  }

  /**
   * Récupère les paiements éligibles pour remise (PENDING_SETTLEMENT, pas encore liés)
   */
  async getEligiblePaymentsForRemise(agentId: string): Promise<(typeof paiementsTerrain.$inferSelect)[]> {
    return await db
      .select()
      .from(paiementsTerrain)
      .where(and(
        eq(paiementsTerrain.agentId, agentId),
        eq(paiementsTerrain.statut, "PENDING_SETTLEMENT"),
        isNull(paiementsTerrain.settledRemiseId),
        isNull(paiementsTerrain.remiseId),
      ))
      .orderBy(desc(paiementsTerrain.createdAt));
  }

  /**
   * Récupère les remises en attente pour un agent
   */
  async getPendingRemises(agentId: string): Promise<(typeof remisesTerrain.$inferSelect)[]> {
    return await db
      .select()
      .from(remisesTerrain)
      .where(and(
        eq(remisesTerrain.agentId, agentId),
        eq(remisesTerrain.statut, StatutRemiseTerrain.PENDING),
      ))
      .orderBy(desc(remisesTerrain.createdAt));
  }
}

// Export singleton
export const remiseSettlementService = new RemiseSettlementService();
