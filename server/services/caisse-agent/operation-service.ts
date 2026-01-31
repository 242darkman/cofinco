/**
 * OperationService - Création et gestion des opérations terrain
 */

import { db } from "../../db";
import {
  operationsTerrain,
  operationsTerrainAuditLogs,
  caissesAgent,
  agentsTerrain,
  clients,
  caisses,
  users,
  employes,
  evenementsOutbox,
  type OperationTerrain,
  type CreateCollectCashInput,
  type CreateSettlementCashInput,
  type CancelOperationInput,
  type OperationTerrainWithRelations,
} from "@shared/schema";
import { eq, and, isNull, desc, gte, lte, sql, count } from "drizzle-orm";
import { caisseAgentService } from "./caisse-agent-service";
import { StatutCaisseAgent } from "@shared/enum/status-constants";
import { normalizeRole, SystemRole } from "@shared/types/roles";

/**
 * Génère une référence unique pour une opération terrain
 */
function generateOperationReference(type: "COLLECT" | "SETTLE"): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const time = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, "0");

  const prefix = type === "COLLECT" ? "OPT-COL" : "OPT-SET";
  return `${prefix}-${year}${month}${day}-${time}${random}`;
}

export class OperationService {
  /**
   * Crée une opération de collecte cash
   */
  async createCollectCash(
    params: CreateCollectCashInput & { submittedBy: string }
  ): Promise<{
    success: boolean;
    operation?: OperationTerrain;
    error?: string;
    errorCode?: string;
  }> {
    return await db.transaction(async (tx) => {
      // 1. Vérifier idempotency
      if (params.idempotencyKey) {
        const [existing] = await tx
          .select()
          .from(operationsTerrain)
          .where(eq(operationsTerrain.idempotencyKey, params.idempotencyKey));

        if (existing) {
          return { success: true, operation: existing };
        }
      }

      // 2. Récupérer/vérifier la caisse agent
      let caisseAgent = await caisseAgentService.getCaisseAgentByAgentId(params.agentId);

      // Créer la caisse si elle n'existe pas
      if (!caisseAgent) {
        const createResult = await caisseAgentService.createCaisseAgent({
          agentId: params.agentId,
          createdBy: params.submittedBy,
        });

        if (!createResult.success || !createResult.caisseAgent) {
          return {
            success: false,
            error: createResult.error || "Impossible de créer la caisse agent",
            errorCode: createResult.errorCode || "CAISSE_CREATE_ERROR",
          };
        }

        caisseAgent = createResult.caisseAgent;
      }

      if (caisseAgent.statut !== StatutCaisseAgent.ACTIVE) {
        return {
          success: false,
          error: "Caisse agent inactive",
          errorCode: "CAISSE_INACTIVE",
        };
      }

      // 3. Vérifier le client
      const [client] = await tx
        .select()
        .from(clients)
        .where(eq(clients.id, params.clientId));

      if (!client) {
        return {
          success: false,
          error: "Client non trouvé",
          errorCode: "CLIENT_NOT_FOUND",
        };
      }

      // 4. Générer la référence
      const reference = generateOperationReference("COLLECT");

      // 5. Créer l'opération
      const [operation] = await tx
        .insert(operationsTerrain)
        .values({
          reference,
          idempotencyKey: params.idempotencyKey,
          type: "COLLECT_CASH",
          agentId: params.agentId,
          caisseAgentId: caisseAgent.id,
          clientId: params.clientId,
          montant: params.montant.toString(),
          devise: "XOF",
          statut: "SUBMITTED",
          submittedBy: params.submittedBy,
          submittedAt: new Date(),
          metadata: {
            typePaiementClient: params.typePaiementClient,
            creditId: params.creditId,
            compteId: params.compteId,
            tontineId: params.tontineId,
            numeroRecu: params.numeroRecu,
            observations: params.observations,
            latitude: params.latitude,
            longitude: params.longitude,
          },
        })
        .returning();

      // 6. Log audit
      await tx.insert(operationsTerrainAuditLogs).values({
        operationId: operation.id,
        action: "SUBMITTED",
        statutAvant: null,
        statutApres: "SUBMITTED",
        details: {
          type: "COLLECT_CASH",
          montant: params.montant.toString(),
          clientId: params.clientId,
          typePaiementClient: params.typePaiementClient,
        },
        userId: params.submittedBy,
      });

      // 7. Broadcast event for real-time updates (badge, list)
      await tx.insert(evenementsOutbox).values({
        type: "OPERATION_TERRAIN_CREATED" as any,
        aggregateType: "operation_terrain",
        aggregateId: operation.id,
        payload: {
          operationId: operation.id,
          type: "COLLECT_CASH",
          montant: params.montant.toString(),
          agentId: params.agentId,
          statut: "SUBMITTED",
        },
      });

      return { success: true, operation };
    });
  }

  /**
   * Crée une opération de remise cash
   */
  async createSettlementCash(
    params: CreateSettlementCashInput & { submittedBy: string }
  ): Promise<{
    success: boolean;
    operation?: OperationTerrain;
    error?: string;
    errorCode?: string;
  }> {
    return await db.transaction(async (tx) => {
      // 1. Vérifier idempotency
      if (params.idempotencyKey) {
        const [existing] = await tx
          .select()
          .from(operationsTerrain)
          .where(eq(operationsTerrain.idempotencyKey, params.idempotencyKey));

        if (existing) {
          return { success: true, operation: existing };
        }
      }

      // 2. Récupérer la caisse agent
      const caisseAgent = await caisseAgentService.getCaisseAgentByAgentId(params.agentId);

      if (!caisseAgent) {
        return {
          success: false,
          error: "Caisse agent non trouvée",
          errorCode: "CAISSE_NOT_FOUND",
        };
      }

      if (caisseAgent.statut !== StatutCaisseAgent.ACTIVE) {
        return {
          success: false,
          error: "Caisse agent inactive",
          errorCode: "CAISSE_INACTIVE",
        };
      }

      // 3. Vérifier le solde disponible
      const balanceCheck = await caisseAgentService.hasSufficientBalance(
        params.agentId,
        params.montant
      );

      if (!balanceCheck.sufficient) {
        return {
          success: false,
          error: balanceCheck.error || "Solde insuffisant",
          errorCode: "INSUFFICIENT_BALANCE",
        };
      }

      // 4. Vérifier la caisse destination
      const [caisseDestination] = await tx
        .select()
        .from(caisses)
        .where(eq(caisses.id, params.destinationCaisseId));

      if (!caisseDestination) {
        return {
          success: false,
          error: "Caisse destination non trouvée",
          errorCode: "DESTINATION_NOT_FOUND",
        };
      }

      // 5. Générer la référence
      const reference = generateOperationReference("SETTLE");

      // 6. Créer l'opération
      const [operation] = await tx
        .insert(operationsTerrain)
        .values({
          reference,
          idempotencyKey: params.idempotencyKey,
          type: "SETTLEMENT_CASH",
          agentId: params.agentId,
          caisseAgentId: caisseAgent.id,
          destinationCaisseId: params.destinationCaisseId,
          montant: params.montant.toString(),
          devise: "XOF",
          statut: "SUBMITTED",
          submittedBy: params.submittedBy,
          submittedAt: new Date(),
          metadata: {
            observations: params.observations,
            sessionCaisseId: params.sessionCaisseId,
            billetage: params.billetage,
          },
        })
        .returning();

      // 7. Log audit
      await tx.insert(operationsTerrainAuditLogs).values({
        operationId: operation.id,
        action: "SUBMITTED",
        statutAvant: null,
        statutApres: "SUBMITTED",
        details: {
          type: "SETTLEMENT_CASH",
          montant: params.montant.toString(),
          destinationCaisseId: params.destinationCaisseId,
          soldeDisponibleAvant: balanceCheck.disponible,
        },
        userId: params.submittedBy,
      });

      // 8. Broadcast event for real-time updates (badge, list)
      await tx.insert(evenementsOutbox).values({
        type: "OPERATION_TERRAIN_CREATED" as any,
        aggregateType: "operation_terrain",
        aggregateId: operation.id,
        payload: {
          operationId: operation.id,
          type: "SETTLEMENT_CASH",
          montant: params.montant.toString(),
          agentId: params.agentId,
          statut: "SUBMITTED",
        },
      });

      return { success: true, operation };
    });
  }

  /**
   * Annule une opération (seulement si SUBMITTED)
   */
  async cancelOperation(params: CancelOperationInput): Promise<{
    success: boolean;
    operation?: OperationTerrain;
    error?: string;
    errorCode?: string;
  }> {
    return await db.transaction(async (tx) => {
      // 1. Récupérer l'opération avec verrouillage
      const [operation] = await tx
        .select()
        .from(operationsTerrain)
        .where(eq(operationsTerrain.id, params.operationId))
        .for("update");

      if (!operation) {
        return {
          success: false,
          error: "Opération non trouvée",
          errorCode: "NOT_FOUND",
        };
      }

      // 2. Vérifier le statut
      if (operation.statut !== "SUBMITTED") {
        return {
          success: false,
          error: `Impossible d'annuler: statut actuel ${operation.statut}`,
          errorCode: "INVALID_STATUS",
        };
      }

      // 3. Vérifier les permissions (soit l'agent qui a soumis, soit un admin)
      // Pour l'instant on permet juste l'annulation

      // 4. Mettre à jour l'opération
      const [updated] = await tx
        .update(operationsTerrain)
        .set({
          statut: "CANCELLED",
          cancelledBy: params.cancelledBy,
          cancelledAt: new Date(),
          cancellationReason: params.cancellationReason,
          updatedAt: new Date(),
        })
        .where(eq(operationsTerrain.id, operation.id))
        .returning();

      // 5. Log audit
      await tx.insert(operationsTerrainAuditLogs).values({
        operationId: operation.id,
        action: "CANCELLED",
        statutAvant: "SUBMITTED",
        statutApres: "CANCELLED",
        details: {
          reason: params.cancellationReason,
        },
        userId: params.cancelledBy,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      });

      return { success: true, operation: updated };
    });
  }

  /**
   * Récupère une opération par son ID
   */
  async getOperationById(operationId: string): Promise<OperationTerrain | null> {
    const [operation] = await db
      .select()
      .from(operationsTerrain)
      .where(eq(operationsTerrain.id, operationId));

    return operation || null;
  }

  /**
   * Récupère une opération avec toutes ses relations
   */
  async getOperationWithRelations(operationId: string): Promise<OperationTerrainWithRelations | null> {
    const [operation] = await db
      .select()
      .from(operationsTerrain)
      .where(eq(operationsTerrain.id, operationId));

    if (!operation) {
      return null;
    }

    // Récupérer les relations (agentsTerrain -> employes -> users pour nom/prenom)
    const [agentData] = await db
      .select({
        id: agentsTerrain.id,
        nom: users.nom,
        prenom: users.prenom,
      })
      .from(agentsTerrain)
      .leftJoin(employes, eq(agentsTerrain.employeId, employes.id))
      .leftJoin(users, eq(employes.userId, users.id))
      .where(eq(agentsTerrain.id, operation.agentId));

    const agent = agentData ? {
      ...agentData,
      nom: agentData.nom || "",
      prenom: agentData.prenom || ""
    } : undefined;

    let client = null;
    if (operation.clientId) {
      // Client identity (nom/prenom) is in users table via userId
      const [clientData] = await db
        .select({
          id: clients.id,
          nom: users.nom,
          prenom: users.prenom,
        })
        .from(clients)
        .leftJoin(users, eq(clients.userId, users.id))
        .where(eq(clients.id, operation.clientId));
      client = clientData ? {
        ...clientData,
        nom: clientData.nom || "",
        prenom: clientData.prenom || ""
      } : null;
    }

    let destinationCaisse = null;
    if (operation.destinationCaisseId) {
      const [caisseData] = await db
        .select({
          id: caisses.id,
          nom: caisses.nom,
        })
        .from(caisses)
        .where(eq(caisses.id, operation.destinationCaisseId));
      destinationCaisse = caisseData || null;
    }

    const [submitterData] = await db
      .select({
        id: users.id,
        nom: users.nom,
        prenom: users.prenom,
      })
      .from(users)
      .where(eq(users.id, operation.submittedBy));

    const submitter = submitterData ? {
      ...submitterData,
      nom: submitterData.nom || "",
      prenom: submitterData.prenom || ""
    } : undefined;

    let approver = null;
    if (operation.approvedBy) {
      const [approverData] = await db
        .select({
          id: users.id,
          nom: users.nom,
          prenom: users.prenom,
        })
        .from(users)
        .where(eq(users.id, operation.approvedBy));
      approver = approverData ? {
        ...approverData,
        nom: approverData.nom || "",
        prenom: approverData.prenom || ""
      } : null;
    }

    return {
      ...operation,
      agent,
      client,
      destinationCaisse,
      submitter,
      approver,
    };
  }

  /**
   * Liste les opérations avec filtres et pagination
   * Admin/Superviseur: toutes les agences
   * Autres rôles: uniquement leur agence de rattachement
   */
  async getOperations(
    filters: {
      agentId?: string;
      clientId?: string;
      caisseAgentId?: string;
      statut?: "SUBMITTED" | "APPROVED" | "SETTLED" | "REJECTED" | "CANCELLED";
      type?: "COLLECT_CASH" | "SETTLEMENT_CASH";
      dateFrom?: Date;
      dateTo?: Date;
      limit?: number;
      offset?: number;
    },
    userId?: string,
    userRole?: string,
    agenceId?: string | null
  ): Promise<{ operations: OperationTerrainWithRelations[]; total: number }> {
    const conditions = [];

    if (filters.agentId) {
      conditions.push(eq(operationsTerrain.agentId, filters.agentId));
    }
    if (filters.clientId) {
      conditions.push(eq(operationsTerrain.clientId, filters.clientId));
    }
    if (filters.caisseAgentId) {
      conditions.push(eq(operationsTerrain.caisseAgentId, filters.caisseAgentId));
    }
    if (filters.statut) {
      conditions.push(eq(operationsTerrain.statut, filters.statut));
    }
    if (filters.type) {
      conditions.push(eq(operationsTerrain.type, filters.type));
    }
    if (filters.dateFrom) {
      conditions.push(gte(operationsTerrain.submittedAt, filters.dateFrom));
    }
    if (filters.dateTo) {
      conditions.push(lte(operationsTerrain.submittedAt, filters.dateTo));
    }

    // Filtre par agence: seul ADMIN voit toutes les agences
    // SUPERVISEUR voit uniquement son agence de rattachement
    const normalizedUserRole = normalizeRole(userRole);
    const isGlobalAdmin = normalizedUserRole === SystemRole.ADMIN;
    const needsAgencyFilter = !isGlobalAdmin && agenceId;

    let baseQuery;
    if (needsAgencyFilter) {
      // Join avec employes pour filtrer par agence
      baseQuery = db
        .select({
          operation: operationsTerrain,
        })
        .from(operationsTerrain)
        .innerJoin(agentsTerrain, eq(operationsTerrain.agentId, agentsTerrain.id))
        .innerJoin(employes, eq(agentsTerrain.employeId, employes.id))
        .where(
          and(
            eq(employes.agenceId, agenceId!),
            conditions.length > 0 ? and(...conditions) : undefined
          )
        );
    } else {
      baseQuery = db
        .select({
          operation: operationsTerrain,
        })
        .from(operationsTerrain)
        .where(conditions.length > 0 ? and(...conditions) : undefined);
    }

    // Count total avec même filtre
    let countResult;
    if (needsAgencyFilter) {
      const [result] = await db
        .select({ count: count() })
        .from(operationsTerrain)
        .innerJoin(agentsTerrain, eq(operationsTerrain.agentId, agentsTerrain.id))
        .innerJoin(employes, eq(agentsTerrain.employeId, employes.id))
        .where(
          and(
            eq(employes.agenceId, agenceId!),
            conditions.length > 0 ? and(...conditions) : undefined
          )
        );
      countResult = result;
    } else {
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const [result] = await db
        .select({ count: count() })
        .from(operationsTerrain)
        .where(whereClause);
      countResult = result;
    }

    // Fetch operations
    const operations = await baseQuery
      .orderBy(desc(operationsTerrain.submittedAt))
      .limit(filters.limit || 50)
      .offset(filters.offset || 0)
      .then((results) => results.map((r) => r.operation));

    // Enrichir avec les relations (version simplifiée pour la liste)
    // Note: agentsTerrain -> employes -> users pour nom/prenom
    // Note: clients -> users pour nom/prenom
    const enrichedOperations = await Promise.all(
      operations.map(async (op) => {
        const [agentData] = await db
          .select({
            id: agentsTerrain.id,
            nom: users.nom,
            prenom: users.prenom,
          })
          .from(agentsTerrain)
          .leftJoin(employes, eq(agentsTerrain.employeId, employes.id))
          .leftJoin(users, eq(employes.userId, users.id))
          .where(eq(agentsTerrain.id, op.agentId));

        const agent = agentData ? {
          ...agentData,
          nom: agentData.nom || "",
          prenom: agentData.prenom || ""
        } : undefined;

        let client = null;
        if (op.clientId) {
          const [clientData] = await db
            .select({
              id: clients.id,
              nom: users.nom,
              prenom: users.prenom,
            })
            .from(clients)
            .leftJoin(users, eq(clients.userId, users.id))
            .where(eq(clients.id, op.clientId));
          client = clientData ? {
            ...clientData,
            nom: clientData.nom || "",
            prenom: clientData.prenom || ""
          } : null;
        }

        let destinationCaisse = null;
        if (op.destinationCaisseId) {
          const [caisseData] = await db
            .select({
              id: caisses.id,
              nom: caisses.nom,
            })
            .from(caisses)
            .where(eq(caisses.id, op.destinationCaisseId));
          destinationCaisse = caisseData || null;
        }

        const [submitterData] = await db
          .select({
            id: users.id,
            nom: users.nom,
            prenom: users.prenom,
          })
          .from(users)
          .where(eq(users.id, op.submittedBy));

        const submitter = submitterData ? {
            ...submitterData,
            nom: submitterData.nom || "",
            prenom: submitterData.prenom || ""
        } : undefined;

        return {
          ...op,
          agent,
          client,
          destinationCaisse,
          submitter,
        } as OperationTerrainWithRelations;
      })
    );

    return {
      operations: enrichedOperations,
      total: Number(countResult?.count || 0),
    };
  }

  /**
   * Récupère les logs d'audit d'une opération
   */
  async getOperationAuditLogs(operationId: string) {
    return db
      .select()
      .from(operationsTerrainAuditLogs)
      .where(eq(operationsTerrainAuditLogs.operationId, operationId))
      .orderBy(desc(operationsTerrainAuditLogs.timestamp));
  }

  /**
   * Récupère le nombre d'opérations en attente de validation
   * Admin/Superviseur: toutes les agences
   * Autres rôles: uniquement leur agence de rattachement
   */
  async getPendingOperationsCount(
    userId?: string,
    userRole?: string,
    agenceId?: string | null
  ): Promise<{ count: number }> {
    // Si pas de user, retourner 0 (ne devrait pas arriver car endpoint protégé)
    if (!userId) {
      return { count: 0 };
    }

    // Seul ADMIN voit toutes les opérations de toutes les agences
    // SUPERVISEUR et autres rôles voient uniquement leur agence
    const normalizedUserRole = normalizeRole(userRole);
    const isGlobalAdmin = normalizedUserRole === SystemRole.ADMIN;

    if (isGlobalAdmin) {
      const [result] = await db
        .select({ val: count() })
        .from(operationsTerrain)
        .where(eq(operationsTerrain.statut, "SUBMITTED"));

      return { count: Number(result?.val || 0) };
    }

    // Pour SUPERVISEUR et autres rôles, filtrer par agence via l'agent
    if (!agenceId) {
      return { count: 0 };
    }

    const [result] = await db
      .select({ val: count() })
      .from(operationsTerrain)
      .innerJoin(agentsTerrain, eq(operationsTerrain.agentId, agentsTerrain.id))
      .innerJoin(employes, eq(agentsTerrain.employeId, employes.id))
      .where(
        and(
          eq(operationsTerrain.statut, "SUBMITTED"),
          eq(employes.agenceId, agenceId)
        )
      );

    return { count: Number(result?.val || 0) };
  }
}

// Export singleton
export const operationService = new OperationService();
