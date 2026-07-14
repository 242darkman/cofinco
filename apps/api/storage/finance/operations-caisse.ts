/**
 * Requêtes sur les opérations de caisse (table operations_caisse).
 * Extrait de operations.ts pour respecter la limite de 400 lignes.
 */
import {
  operationsCaisse,
  sessionsCaisse,
  mouvementsFinanciers,
  clients,
  users,
  type OperationCaisse,
  type InsertOperationCaisse,
} from "@shared/schema";
import { TypeOperationCaisse, StatutTransaction } from "@shared/enum/status-constants";
import type { TypeOperationCaisseDz } from "@shared/enum/enums";
import { db } from "../../db";
import { eq, desc, and, gte, lte, inArray, isNull, getTableColumns } from "drizzle-orm";

export async function getOperationsBySession(sessionId: string) {
    const results = await db.select({
      id: operationsCaisse.id,
      sessionId: operationsCaisse.sessionId,
      mouvementId: operationsCaisse.mouvementId,
      typeOperation: operationsCaisse.typeOperation,
      statut: operationsCaisse.statut,
      montant: operationsCaisse.montant,
      methodePaiement: operationsCaisse.methodePaiement,
      reference: operationsCaisse.reference,
      idempotencyKey: operationsCaisse.idempotencyKey,
      description: operationsCaisse.description,
      clientId: operationsCaisse.clientId,
      presenceVerification: operationsCaisse.presenceVerification,
      metadata: operationsCaisse.metadata,
      createdBy: operationsCaisse.createdBy,
      createdAt: operationsCaisse.createdAt,
      annulledAt: operationsCaisse.annulledAt,
      reversedAt: operationsCaisse.reversedAt,
      updatedAt: operationsCaisse.updatedAt,
      deletedAt: operationsCaisse.deletedAt,
      reversalOfId: operationsCaisse.reversalOfId,
      reversalReason: operationsCaisse.reversalReason,
      reversedByUserId: operationsCaisse.reversedByUserId,
      // Client info (nom/prenom/telephone sont dans la table users, pas clients)
      client_nom: users.nom,
      client_prenom: users.prenom,
      client_telephone: users.telephone,
    })
    .from(operationsCaisse)
    .leftJoin(clients, eq(operationsCaisse.clientId, clients.id))
    .leftJoin(users, eq(clients.userId, users.id))
    .where(eq(operationsCaisse.sessionId, sessionId))
    .orderBy(desc(operationsCaisse.createdAt));

    return results;
  }

  /**
   * Récupère toutes les opérations d'une CAISSE physique (toutes sessions confondues)
   * Permet de voir l'historique complet de la machine, pas seulement la session active
   * Limité aux opérations du jour pour performance
   */
  export async function getOperationsByCaisse(caisseId: string): Promise<OperationCaisse[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Récupérer toutes les sessions de cette caisse
    const sessions = await db.select({ id: sessionsCaisse.id })
      .from(sessionsCaisse)
      .where(eq(sessionsCaisse.caisseId, caisseId));

    if (sessions.length === 0) return [];

    const sessionIds = sessions.map(s => s.id);

    // Récupérer les opérations VALIDES de ces sessions (du jour)
    // Exclure les opérations annulées/supprimées pour ne pas polluer les calculs de solde
    return db.select()
      .from(operationsCaisse)
      .where(
        and(
          inArray(operationsCaisse.sessionId, sessionIds),
          gte(operationsCaisse.createdAt, today),
          isNull(operationsCaisse.annulledAt),
          isNull(operationsCaisse.deletedAt)
        )
      )
      .orderBy(desc(operationsCaisse.createdAt));
  }

  export async function getAllOperationsCaisse(): Promise<OperationCaisse[]> {
    return db.select().from(operationsCaisse).orderBy(desc(operationsCaisse.createdAt));
  }

  export async function getOperationsCaisseByDateRange(start: Date, end: Date): Promise<OperationCaisse[]> {
    return db.select().from(operationsCaisse)
      .where(and(gte(operationsCaisse.createdAt, start), lte(operationsCaisse.createdAt, end)))
      .orderBy(desc(operationsCaisse.createdAt));
  }

  /**
   * Get today's operations for a specific caisse (all sessions)
   * Returns operations with client info, filtered by today's date
   */
  export async function getOperationsCaisseToday(caisseId: string) {
    // Get start of today (midnight)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get all sessions for this caisse
    const sessionsForCaisse = await db.select({ id: sessionsCaisse.id })
      .from(sessionsCaisse)
      .where(eq(sessionsCaisse.caisseId, caisseId));

    const sessionIds = sessionsForCaisse.map(s => s.id);

    if (sessionIds.length === 0) {
      return [];
    }

    // Query operations with client info, filtering by today and caisse sessions
    const results = await db.select({
      id: operationsCaisse.id,
      sessionId: operationsCaisse.sessionId,
      mouvementId: operationsCaisse.mouvementId,
      typeOperation: operationsCaisse.typeOperation,
      statut: operationsCaisse.statut,
      montant: operationsCaisse.montant,
      methodePaiement: operationsCaisse.methodePaiement,
      reference: operationsCaisse.reference,
      idempotencyKey: operationsCaisse.idempotencyKey,
      description: operationsCaisse.description,
      clientId: operationsCaisse.clientId,
      presenceVerification: operationsCaisse.presenceVerification,
      metadata: operationsCaisse.metadata,
      createdBy: operationsCaisse.createdBy,
      createdAt: operationsCaisse.createdAt,
      annulledAt: operationsCaisse.annulledAt,
      reversedAt: operationsCaisse.reversedAt,
      updatedAt: operationsCaisse.updatedAt,
      deletedAt: operationsCaisse.deletedAt,
      reversalOfId: operationsCaisse.reversalOfId,
      reversalReason: operationsCaisse.reversalReason,
      reversedByUserId: operationsCaisse.reversedByUserId,
      // Client info
      client_nom: users.nom,
      client_prenom: users.prenom,
      client_telephone: users.telephone,
    })
    .from(operationsCaisse)
    .leftJoin(clients, eq(operationsCaisse.clientId, clients.id))
    .leftJoin(users, eq(clients.userId, users.id))
    .where(and(
      inArray(operationsCaisse.sessionId, sessionIds),
      gte(operationsCaisse.createdAt, today),
      isNull(operationsCaisse.deletedAt),
      // Exclure les opérations annulées
      isNull(operationsCaisse.annulledAt),
      // Inclure seulement les opérations avec statut POSTED (finalisées)
      eq(operationsCaisse.statut, StatutTransaction.POSTED)
    ))
    .orderBy(desc(operationsCaisse.createdAt));

    return results;
  }

  // Aide pour le calcul précis du solde en utilisant le sens du grand livre
  export async function getOperationsBySessionWithSens(sessionId: string) {
    return db.select({
        ...getTableColumns(operationsCaisse),
        sens: mouvementsFinanciers.sens
    })
    .from(operationsCaisse)
    .leftJoin(mouvementsFinanciers, eq(operationsCaisse.mouvementId, mouvementsFinanciers.id))
    .where(eq(operationsCaisse.sessionId, sessionId));
  }

  export async function getOperationsByClientAndDateRange(clientId: string, start: Date, end: Date, type?: string): Promise<OperationCaisse[]> {
    const conditions = [
      eq(operationsCaisse.clientId, clientId),
      gte(operationsCaisse.createdAt, start),
      lte(operationsCaisse.createdAt, end)
    ];

    if (type) {
      // Handle generic Filtre de types by mapping to actual typeOperationCaisseEnum values
      if (type === 'retrait') {
        // For operationsCaisse table, withdrawal types
        conditions.push(eq(operationsCaisse.typeOperation, TypeOperationCaisse.SAVINGS_WITHDRAWAL));
      } else if (type === 'depot') {
        // For operationsCaisse table, deposit types
        conditions.push(eq(operationsCaisse.typeOperation, TypeOperationCaisse.SAVINGS_DEPOSIT));
      } else {
        // Valeur d'énumération directe (e.g., CREDIT_DISBURSEMENT, CREDIT_REPAYMENT, etc.)
        conditions.push(eq(operationsCaisse.typeOperation, type as TypeOperationCaisseDz));
      }
    }

    return db.select().from(operationsCaisse)
      .where(and(...conditions))
      .orderBy(desc(operationsCaisse.createdAt));
  }

  export async function createOperationCaisse(insertOperation: InsertOperationCaisse): Promise<OperationCaisse> {
    const [operation] = await db.insert(operationsCaisse).values(insertOperation).returning();
    return operation;
  }

  export async function updateOperationCaisse(id: string, updateData: Partial<InsertOperationCaisse>): Promise<OperationCaisse | undefined> {
    const [operation] = await db.update(operationsCaisse).set(updateData).where(eq(operationsCaisse.id, id)).returning();
    return operation || undefined;
  }
