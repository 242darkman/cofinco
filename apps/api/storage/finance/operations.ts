import { generateCreditSchedule } from "./credits";
import { getModeleFactureByCode, incrementModeleFactureNumero } from "./factures";
import { CheckMetadata, TransferMetadata, PhysicalVerificationData } from "./misc";
import {
    credits, demandesCredit, enquetesCredit, remboursements,
    comptes, transactionsCompte, plansEpargne, objectifsEpargne,
    sessionsCaisse, operationsCaisse, caisseSecurityCodes, caisseCodeUsages, comptageBillets,
    factures, lignesFactures, modelesFactures, caisses, clients, agences, caisseAssignations, users,
    dureesSuggerees, mouvementsFinanciers, evenementsOutbox, coffresForts, produitsCompte
  } from "@shared/schema";
import { createLogger } from "../../lib/logger";
import { randomInt, randomBytes } from "crypto";
import { D, roundMoney } from "../../lib/money";


const logger = createLogger('Finance');
import {
  validateCreditTransition,
  CreditTransitionError,
  normalizeCreditStatus,
} from "@shared/machines/credit-workflow";
import {
  validateDemandeTransition,
  DemandeTransitionError,
  normalizeDemandeStatus,
} from "@shared/machines/demande-workflow";
import {
  StatutCompte,
  StatutCredit,
  type StatutCreditType,
  StatutDemande,
  FrequenceRemboursement,
  TypeCompte,
  DureeUnite,
  MethodePaiement,
  TypeOperationCaisse,
  StatutCaisseAgent,
  StatutTransaction,
  TypeTransactionEpargne,
  StatutFacture,
  TypeDocument,
  getTypePaiementForCompte,
} from "@shared/enum/status-constants";
import type {
  StatutDemandeDz,
  StatutCreditDz,
  StatutCompteDz,
  TypeCompteDz,
  MethodePaiementDz,
  TypeOperationCaisseDz,
  TypePaiementTerrainDz,
  SourceModuleDz,
  DisbursementStatusDz,
  DisbursementChannelDz,
  StatutSessionCaisseDz,
  FrequenceRemboursementDz,
  InterestRatePeriodDz,
  DayCountConventionDz,
  RoundingModeDz,
  AmortizationTypeDz,
  FirstDueRuleDz,
  CalendarModeDz,
  ShiftNonWorkingDayDz,
  FeeCollectionModeDz,
  InterestMethodDz,
} from "@shared/enum/enums";
import { DecaissementInsufficientFundsError, InsufficientFundsError, InsufficientFundsErrorData } from "../errors";

// Réexportation pour compatibilité
export { DecaissementInsufficientFundsError, InsufficientFundsError, type InsufficientFundsErrorData };
import {
    type Credit, type InsertCredit, type DemandeCredit, type InsertDemandeCredit,
    type EnqueteCredit, type InsertEnqueteCredit, type Remboursement, type InsertRemboursement,
    type Compte, type InsertCompte, type TransactionCompte, type InsertTransactionCompte,
    type PlanEpargne, type InsertPlanEpargne, type ObjectifEpargne, type InsertObjectifEpargne,
    type SessionCaisse, type InsertSessionCaisse, type OperationCaisse, type InsertOperationCaisse,
    type ComptageBillets, type InsertComptageBillets,
    type Facture, type InsertFacture, type LigneFacture, type InsertLigneFacture,
    type ModeleFacture, type InsertModeleFacture, type Caisse, type InsertCaisse,
    caisseTransferts, type CaisseTransfert, type InsertCaisseTransfert,
    type Agence, type CaisseAssignation,
    type DureeSuggeree, type InsertDureeSuggeree,
    creditPlans, creditPlanFees, type UserCreditPlan, type InsertCreditPlan, type CreditPlanFee, type InsertCreditPlanFee, insertCreditPlanSchema,
    creditRefundRequests, type CreditRefundRequest, type InsertCreditRefundRequest,
    echeancesCredits, type EcheanceCredit, type InsertEcheanceCredit
  } from "@shared/schema";
import { db } from "../../db";
import { eq, desc, and, or, gte, lte, lt, gt, count, inArray, notInArray, sql, getTableColumns, aliasedTable, isNull, isNotNull, asc, ne } from "drizzle-orm";


// Statuts terminaux — alignés avec les contraintes uniques DB sur sessions_caisse
const SESSION_TERMINAL_STATUSES = ["CLOSED", "RECONCILIATION_PENDING", "RECONCILIATION_COMPLETE"] as const;
import type { PgTransaction } from "drizzle-orm/pg-core";
import { computeSessionStatus } from "../../services/caisse/session-status";


  // Types de retrait depuis typePaiementTerrainEnum (EN)
  const WITHDRAWAL_TYPES = [
    TypeOperationCaisse.WITHDRAWAL_SAVINGS,
    TypeOperationCaisse.WITHDRAWAL_CURRENT,
    TypeOperationCaisse.WITHDRAWAL_BLOCKED,
    TypeOperationCaisse.TONTINE_WITHDRAWAL,
  ] as const;


  // Types de dépôt depuis typePaiementTerrainEnum (EN)
  const DEPOSIT_TYPES = [
    TypeOperationCaisse.DEPOSIT_SAVINGS,
    TypeOperationCaisse.DEPOSIT_CURRENT,
    TypeOperationCaisse.DEPOSIT_BLOCKED,
    TypeOperationCaisse.TONTINE_CONTRIBUTION,
  ] as const;
import {
  executeWithLedger,
  updateCompteSolde,
  updateCreditSolde,
  updateSessionSolde,
  updateCaisseSolde,
  createMouvementFinancier,
  createMouvementEvents,
  validateUserId,
  type SensMouvement,
  type MouvementFinancier
} from "../../services/ledger";
import { postGlForMouvement, AccountingRuleNotFoundError } from "../../services/accounting-posting-service";
import {
  assertCoffreCanDebit,
  assertCoffreCanCredit,
  updateCoffreBalance,
} from "../../services/coffre/coffre-guard";
import { balanceService } from "../../services/balance-service";



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


  /**
   * Get movements by client and date range from mouvementsFinanciers (source of truth)
   * Supports generic Filtre de types: 'retrait' for all withdrawals, 'depot' for all deposits
   */
  export async function getMouvementsByClientAndDateRange(
    clientId: string,
    start: Date,
    end: Date,
    type?: 'retrait' | 'depot' | string
  ) {
    const conditions = [
      eq(mouvementsFinanciers.clientId, clientId),
      gte(mouvementsFinanciers.dateOperation, start),
      lte(mouvementsFinanciers.dateOperation, end),
      eq(mouvementsFinanciers.statut, StatutTransaction.POSTED), // Ne compter que les transactions postées
    ];

    if (type) {
      if (type === 'retrait') {
        // Tous les types de retrait
        conditions.push(inArray(mouvementsFinanciers.typePaiement, [...WITHDRAWAL_TYPES]));
      } else if (type === 'depot') {
        // Tous les types de dépôt
        conditions.push(inArray(mouvementsFinanciers.typePaiement, [...DEPOSIT_TYPES]));
      } else {
        // Valeur d'énumération directe
        conditions.push(eq(mouvementsFinanciers.typePaiement, type as TypePaiementTerrainDz));
      }
    }

    return db.select().from(mouvementsFinanciers)
      .where(and(...conditions))
      .orderBy(desc(mouvementsFinanciers.dateOperation));
  }


  export async function createOperationCaisse(insertOperation: InsertOperationCaisse): Promise<OperationCaisse> {
    const [operation] = await db.insert(operationsCaisse).values(insertOperation).returning();
    return operation;
  }


  export async function updateOperationCaisse(id: string, updateData: Partial<InsertOperationCaisse>): Promise<OperationCaisse | undefined> {
    const [operation] = await db.update(operationsCaisse).set(updateData).where(eq(operationsCaisse.id, id)).returning();
    return operation || undefined;
  }


/**
 * Get pending loan disbursements for a specific agency
 * Used by the cashier dashboard to see which loans need to be paid out
 */
export async function getPendingLoanDisbursements(agenceId?: string, caisseId?: string): Promise<Array<{
    credit: Credit;
    client: { id: string; nom: string; prenom: string | null; photoUrl?: string | null };
    demande?: any;
}>> {
    // Build base conditions
    const baseConditions = and(
        eq(credits.statut, 'WAITING_DISBURSEMENT' as StatutCreditDz),
        eq(credits.disbursementChannel, 'CASH' as DisbursementChannelDz),
        eq(credits.disbursementStatus, 'PENDING' as DisbursementStatusDz),
        agenceId ? eq(credits.agenceId, agenceId) : undefined,
        caisseId ? or(eq(credits.targetCaisseId, caisseId), isNull(credits.targetCaisseId)) : undefined,
    );

    const results = await db.select({
        credit: credits,
        clientId: clients.id,
        userNom: users.nom,
        userPrenom: users.prenom,
        userPhotoProfile: users.photoProfile
    })
    .from(credits)
    .innerJoin(clients, eq(credits.clientId, clients.id))
    .leftJoin(users, eq(clients.userId, users.id))
    .where(baseConditions)
    .orderBy(desc(credits.createdAt));

    return results.map(r => ({
        credit: r.credit,
        client: {
            id: r.clientId,
            nom: r.userNom || 'N/A',
            prenom: r.userPrenom,
            photoUrl: r.userPhotoProfile
        }
    }));
}


/**
 * Get mouvements financiers with filtering
 */
export async function getMouvementsFinanciers(filter: {
  sourceModule?: string;
  clientId?: string;
  compteId?: string;
  creditId?: string;
  sessionCaisseId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
} = {}): Promise<MouvementFinancier[]> {
  const conditions = [];

  if (filter.sourceModule) {
    conditions.push(eq(mouvementsFinanciers.sourceModule, filter.sourceModule as SourceModuleDz));
  }
  if (filter.clientId) {
    conditions.push(eq(mouvementsFinanciers.clientId, filter.clientId));
  }
  if (filter.compteId) {
    conditions.push(eq(mouvementsFinanciers.compteId, filter.compteId));
  }
  if (filter.creditId) {
    conditions.push(eq(mouvementsFinanciers.creditId, filter.creditId));
  }
  if (filter.sessionCaisseId) {
    conditions.push(eq(mouvementsFinanciers.sessionCaisseId, filter.sessionCaisseId));
  }
  if (filter.from) {
    conditions.push(gte(mouvementsFinanciers.dateOperation, filter.from));
  }
  if (filter.to) {
    conditions.push(lte(mouvementsFinanciers.dateOperation, filter.to));
  }

  let query = db.select().from(mouvementsFinanciers).$dynamic();

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  query = query.orderBy(desc(mouvementsFinanciers.dateOperation));

  if (filter.limit) {
    query = query.limit(filter.limit);
  }

  return query;
}


/**
 * Get client portfolio (accounts, credits, tontines)
 */
export async function getClientPortfolio(clientId: string): Promise<{
  comptes: Compte[];
  credits: Credit[];
  tontines: any[];
}> {
  const [clientsComptes, creditsResult] = await Promise.all([
    db.select().from(comptes).where(eq(comptes.clientId, clientId)),
    db.select().from(credits).where(eq(credits.clientId, clientId)),
  ]);

  // Get tontines via membresTontine
  const { membresTontine, tontines } = await import("@shared/schema");
  const memberships = await db.select({
    membre: membresTontine,
    tontine: tontines,
  })
    .from(membresTontine)
    .leftJoin(tontines, eq(membresTontine.tontineId, tontines.id))
    .where(eq(membresTontine.clientId, clientId));

  return {
    comptes: clientsComptes,
    credits: creditsResult,
    tontines: memberships.map(m => ({
      ...m.tontine,
      membre: m.membre,
    })),
  };
}