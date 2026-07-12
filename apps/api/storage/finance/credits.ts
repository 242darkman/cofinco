import { getModeleFactureByCode, incrementModeleFactureNumero } from "./factures";
import { enrichCreditData, PaginatedCredits, CheckMetadata, TransferMetadata, PhysicalVerificationData } from "./misc";
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



    export async function getCredit(id: string): Promise<Credit & { fraisEngagementPayes?: boolean } | undefined> {
    const [result] = await db.select({
      credit: credits,
      demande: demandesCredit
    })
    .from(credits)
    .leftJoin(demandesCredit, eq(credits.demandeId, demandesCredit.id))
    .where(eq(credits.id, id));

    if (!result) return undefined;

    return {
      ...enrichCreditData(result.credit),
      fraisEngagementPayes: result.demande?.fraisEngagementPayes || false
    };
  }

  
  export async function getCreditsByClient(clientId: string): Promise<Credit[]> {
    const results = await db.select().from(credits).where(eq(credits.clientId, clientId)).orderBy(desc(credits.createdAt));
    return results.map(credit => enrichCreditData(credit));
  }


  export async function getAllCredits(
    filter: { agence?: string; agenceId?: string; clientId?: string } = {},
    options: { search?: string; page?: number; limit?: number; statut?: string } = {}
  ): Promise<PaginatedCredits> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const offset = (page - 1) * limit;

    const conditions = [];

    // Utilisation de agenceId directement si fourni (plus sûr)
    if (filter.agenceId && filter.agenceId !== "all") {
      conditions.push(eq(clients.agenceId, filter.agenceId));
    } else if (filter.agence && filter.agence !== "all") {
      // Repli : rechercher agenceId par nom si agence est un nom
      const [agenceRecord] = await db.select({ id: agences.id })
        .from(agences)
        .where(eq(agences.nom, filter.agence))
        .limit(1);
      if (agenceRecord) {
        conditions.push(eq(clients.agenceId, agenceRecord.id));
      }
    }

    if (filter.clientId) {
      conditions.push(eq(credits.clientId, filter.clientId));
    }

    if (options.statut) {
      conditions.push(eq(credits.statut, options.statut as StatutCreditType));
    }

    if (options.search && options.search.trim()) {
      const searchTerm = `%${options.search.trim().toLowerCase()}%`;
      conditions.push(
        or(
          sql`LOWER(${users.nom}) LIKE ${searchTerm}`,
          sql`LOWER(${users.prenom}) LIKE ${searchTerm}`,
          sql`LOWER(${credits.numeroCredit}) LIKE ${searchTerm}`,
          sql`LOWER(${users.telephone}) LIKE ${searchTerm}`
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Comptage du total
    const countQuery = db.select({ count: count() })
      .from(credits)
      .leftJoin(clients, eq(credits.clientId, clients.id))
      .leftJoin(users, eq(clients.userId, users.id));

    const countResult = whereClause
      ? await countQuery.where(whereClause)
      : await countQuery;

    const total = countResult[0]?.count || 0;

    // Récupération des données avec pagination
    let dataQuery = db.select({
      credit: credits,
      client: clients,
      user: users
    })
    .from(credits)
    .leftJoin(clients, eq(credits.clientId, clients.id))
    .leftJoin(users, eq(clients.userId, users.id))
    .orderBy(desc(credits.createdAt))
    .limit(limit)
    .offset(offset)
    .$dynamic();

    if (whereClause) {
      dataQuery = dataQuery.where(whereClause);
    }

    const results = await dataQuery;
    const data = results.map(({ credit, client, user }) =>
      enrichCreditData(credit, {
        ...client,
        nom: user?.nom,
        prenom: user?.prenom,
        telephone: user?.telephone,
        photoProfile: user?.photoProfile,
      })
    );

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  
  export async function createCredit(insertCredit: InsertCredit): Promise<Credit> {
    const [credit] = await db.insert(credits).values(insertCredit).returning();
    return credit;
  }

  
  export async function updateCredit(id: string, updateData: Partial<InsertCredit>): Promise<Credit | undefined> {
    // Garde de machine à état : Valider la transition de statut s'il est mis à jour
    if (updateData.statut) {
      const [currentCredit] = await db.select({ statut: credits.statut }).from(credits).where(eq(credits.id, id));
      if (currentCredit) {
        // validateCreditTransition lève une CreditTransitionError si la transition est invalide
        validateCreditTransition(currentCredit.statut, updateData.statut);
      }
    }

    const [credit] = await db.update(credits).set({ ...updateData, updatedAt: new Date() }).where(eq(credits.id, id)).returning();
    return credit || undefined;
  }


    export async function createEcheances(echeances: InsertEcheanceCredit[]): Promise<EcheanceCredit[]> {
    if (echeances.length === 0) return [];
    
    // L'utilisation de returning() avec des insertions multiples dépend du pilote, mais Drizzle PG le supporte.
    const results = await db.insert(echeancesCredits).values(echeances).returning();
    return results;
  }


  export async function getEcheancesByCredit(creditId: string): Promise<EcheanceCredit[]> {
    return db.select()
      .from(echeancesCredits)
      .where(eq(echeancesCredits.creditId, creditId))
      .orderBy(asc(echeancesCredits.dateEcheance));
  }


  export async function getProchaineEcheance(creditId: string): Promise<EcheanceCredit | undefined> {
    const [result] = await db.select()
      .from(echeancesCredits)
      // On cherche la première échéance qui n'est pas complètement payée (UPCOMING ou LATE)
      // On exclut celles qui sont PAID
      .where(and(
        eq(echeancesCredits.creditId, creditId),
        ne(echeancesCredits.statut, 'PAID'), 
        ne(echeancesCredits.statut, 'SETTLED')
      ))
      .orderBy(asc(echeancesCredits.dateEcheance))
      .limit(1);
      
    return result;
  }


  export async function updateEcheance(id: string, updateData: Partial<InsertEcheanceCredit>): Promise<EcheanceCredit | undefined> {
    const [updated] = await db.update(echeancesCredits)
      .set(updateData)
      .where(eq(echeancesCredits.id, id))
      .returning();
    return updated;
  }


  export async function getAllCreditPlans(filter: { isActive?: boolean, agenceId?: string } = {}): Promise<(UserCreditPlan & { fees: CreditPlanFee[] })[]> {
    const conditions = [];
    if (filter.isActive !== undefined) conditions.push(eq(creditPlans.isActive, filter.isActive));
    if (filter.agenceId) conditions.push(eq(creditPlans.agenceId, filter.agenceId));

    const plans = await db.select().from(creditPlans)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(creditPlans.createdAt));

    if (plans.length === 0) return [];

    const planIds = plans.map(p => p.id);
    const fees = await db.select().from(creditPlanFees)
      .where(inArray(creditPlanFees.planId, planIds))
      .orderBy(creditPlanFees.sortOrder);

    const feesByPlan = new Map<string, CreditPlanFee[]>();
    for (const fee of fees) {
      const list = feesByPlan.get(fee.planId) || [];
      list.push(fee);
      feesByPlan.set(fee.planId, list);
    }

    return plans.map(p => ({ ...p, fees: feesByPlan.get(p.id) || [] }));
  }


  export async function getCreditPlan(id: string): Promise<(UserCreditPlan & { fees: CreditPlanFee[] }) | undefined> {
    const [plan] = await db.select().from(creditPlans).where(eq(creditPlans.id, id));
    if (!plan) return undefined;

    const fees = await db.select().from(creditPlanFees)
      .where(eq(creditPlanFees.planId, id))
      .orderBy(creditPlanFees.sortOrder);

    return { ...plan, fees };
  }


  export async function createCreditPlan(
    plan: InsertCreditPlan,
    fees: InsertCreditPlanFee[] = [],
  ): Promise<UserCreditPlan & { fees: CreditPlanFee[] }> {
    return await db.transaction(async (tx) => {
      const [newPlan] = await tx.insert(creditPlans).values(plan).returning();

      const insertedFees: CreditPlanFee[] = [];
      if (fees.length > 0) {
        const feesWithPlanId = fees.map((f, i) => ({ ...f, planId: newPlan.id, sortOrder: i }));
        const result = await tx.insert(creditPlanFees).values(feesWithPlanId).returning();
        insertedFees.push(...result);
      }

      return { ...newPlan, fees: insertedFees };
    });
  }


  export async function updateCreditPlan(
    id: string,
    plan: Partial<InsertCreditPlan>,
    fees?: InsertCreditPlanFee[],
    expectedVersion?: number,
  ): Promise<(UserCreditPlan & { fees: CreditPlanFee[] }) | undefined> {
    return await db.transaction(async (tx) => {
      // Verrouillage optimiste
      if (expectedVersion !== undefined) {
        const [existing] = await tx.select({ version: creditPlans.version }).from(creditPlans).where(eq(creditPlans.id, id));
        if (!existing || existing.version !== expectedVersion) {
          throw new Error("CONFLICT: Le plan a ete modifie par un autre utilisateur");
        }
      }

      const updateData = {
        ...plan,
        version: sql`${creditPlans.version} + 1`,
        updatedAt: new Date(),
      };
      const [updated] = await tx.update(creditPlans).set(updateData).where(eq(creditPlans.id, id)).returning();
      if (!updated) return undefined;

      // Remplacement des frais si fournis
      let resultFees: CreditPlanFee[];
      if (fees !== undefined) {
        await tx.delete(creditPlanFees).where(eq(creditPlanFees.planId, id));
        resultFees = [];
        if (fees.length > 0) {
          const feesWithPlanId = fees.map((f, i) => ({ ...f, planId: id, sortOrder: i }));
          resultFees = await tx.insert(creditPlanFees).values(feesWithPlanId).returning();
        }
      } else {
        resultFees = await tx.select().from(creditPlanFees)
          .where(eq(creditPlanFees.planId, id))
          .orderBy(creditPlanFees.sortOrder);
      }

      return { ...updated, fees: resultFees };
    });
  }


  export async function deleteCreditPlan(id: string): Promise<boolean> {
    const result = await db.update(creditPlans).set({ isActive: false }).where(eq(creditPlans.id, id)).returning();
    return result.length > 0;
  }

  
    export async function getDemandeCredit(id: string, includeDeleted = false): Promise<DemandeCredit | undefined> {
    const conditions = [eq(demandesCredit.id, id)];
    if (!includeDeleted) {
      conditions.push(sql`${demandesCredit.deletedAt} IS NULL`);
    }

    const results = await db.select({
      demande: demandesCredit,
      client: clients,
      user: users,
      agence: agences
    })
    .from(demandesCredit)
    .leftJoin(clients, eq(demandesCredit.clientId, clients.id))
    .leftJoin(users, eq(clients.userId, users.id))
    .leftJoin(agences, eq(clients.agenceId, agences.id))
    .where(and(...conditions));

    if (!results.length) return undefined;

    const { demande, client, user, agence } = results[0];
    return {
      ...demande,
      clients: client ? {
        id: client.id,
        nom: user?.nom,
        prenom: user?.prenom,
        email: user?.email,
        telephone: user?.telephone,
        photoProfile: user?.photoProfile,
        tauxRemboursement: Number(client.tauxRemboursement) || 0,
        creditTotal: Number(client.creditTotal) || 0,
        agence: agence?.nom,
        agenceId: client.agenceId,
      } : undefined
    } as DemandeCredit;
  }

  
  export async function getDemandesByClient(clientId: string): Promise<DemandeCredit[]> {
    return db.select().from(demandesCredit)
      .where(and(eq(demandesCredit.clientId, clientId), sql`${demandesCredit.deletedAt} IS NULL`))
      .orderBy(desc(demandesCredit.createdAt));
  }

  
  export async function getAllDemandes(filter: { agence?: string, agenceId?: string, includeDeleted?: boolean } = {}): Promise<DemandeCredit[]> {
    const conditions = [];

    if (!filter.includeDeleted) {
        conditions.push(sql`${demandesCredit.deletedAt} IS NULL`);
    }

    // Utilisation de agenceId directement si fourni (plus sûr)
    if (filter.agenceId && filter.agenceId !== "all") {
      conditions.push(eq(clients.agenceId, filter.agenceId));
    } else if (filter.agence && filter.agence !== "all") {
      // Repli : rechercher l'agenceId par nom
      const [agenceRecord] = await db.select({ id: agences.id })
        .from(agences)
        .where(eq(agences.nom, filter.agence))
        .limit(1);
      if (agenceRecord) {
        conditions.push(eq(clients.agenceId, agenceRecord.id));
      }
    }

    let baseQuery = db.select({
      demande: demandesCredit,
      client: clients,
      user: users,
      agence: agences
    })
    .from(demandesCredit)
    .leftJoin(clients, eq(demandesCredit.clientId, clients.id))
    .leftJoin(users, eq(clients.userId, users.id))
    .leftJoin(agences, eq(clients.agenceId, agences.id))
    .$dynamic();

    if (conditions.length > 0) {
      baseQuery = baseQuery.where(and(...conditions));
    }

    const results = await baseQuery.orderBy(desc(demandesCredit.createdAt));

    return results.map(({ demande, client, user, agence }) => ({
      ...demande,
      numeroDemande: demande.numeroDemande,
      clients: client ? {
        id: client.id,
        nom: user?.nom,
        prenom: user?.prenom,
        email: user?.email,
        telephone: user?.telephone,
        photoProfile: user?.photoProfile,
        tauxRemboursement: Number(client.tauxRemboursement) || 0,
        creditTotal: Number(client.creditTotal) || 0,
        agence: agence?.nom,
        agenceId: client.agenceId,
        revenuMensuel: client.revenuMensuel,
        revenuJournalier: client.revenuJournalier,
        typeRevenu: client.typeRevenu,
      } : undefined
    })) as DemandeCredit[];
  }

  
  export async function createDemandeCredit(insertDemande: InsertDemandeCredit): Promise<DemandeCredit> {
    // Import dynamique pour éviter les dépendances circulaires
    const { calculerScoreMicrofinance } = await import('../../services/microfinance-scoring');
    const { recalculateClientScore } = await import('../../services/scoring-engine');

    // Calculer automatiquement le score de crédit
    let scoreCredit: number | null = null;
    try {
      // Convertir la durée en mois selon l'unité
      let dureeMois = insertDemande.dureeValeur || 1;
      if (insertDemande.dureeUnite === DureeUnite.DAY) {
        dureeMois = Math.ceil(dureeMois / 30);
      } else if (insertDemande.dureeUnite === DureeUnite.WEEK) {
        dureeMois = Math.ceil(dureeMois / 4);
      }

      const scoringResult = await calculerScoreMicrofinance({
        clientId: insertDemande.clientId,
        montantDemande: parseFloat(insertDemande.montantDemande?.toString() || '0'),
        dureeMois,
        revenuMensuel: insertDemande.revenusMensuels ? parseFloat(insertDemande.revenusMensuels.toString()) : undefined,
        chargesMensuelles: insertDemande.chargesMensuelles ? parseFloat(insertDemande.chargesMensuelles.toString()) : undefined
      });

      scoreCredit = scoringResult.score;

      // Recalculer le score global du client via le scoring engine
      await recalculateClientScore(insertDemande.clientId).catch((err: any) => logger.error({ err }, 'Error updating client score'));
    } catch (error) {
      logger.error({ err: error }, 'Error calculating credit score');
      // Continuer sans score en cas d'erreur
    }

    // Forcer le statut "PENDING_FEES" - les frais d'engagement sont obligatoires avant toute enquête
    const demandeAvecStatut = {
      ...insertDemande,
      statut: StatutDemande.PENDING_FEES as StatutDemandeDz, // Toujours "PENDING_FEES" à la création
      fraisEngagementPayes: false,
      scoreCredit: scoreCredit ?? insertDemande.scoreCredit ?? null
    };
    const [demande] = await db.insert(demandesCredit).values(demandeAvecStatut).returning();
    return demande;
  }

  
  export async function updateDemandeCredit(id: string, updateData: Partial<InsertDemandeCredit>, tx?: PgTransaction<any, any, any>): Promise<DemandeCredit | undefined> {
    // Garde de machine à état : Valider la transition de statut s'il est mis à jour
    if (updateData.statut) {
      const [currentDemande] = await (tx || db).select({ statut: demandesCredit.statut }).from(demandesCredit).where(eq(demandesCredit.id, id));
      if (currentDemande && currentDemande.statut) {
        // validateDemandeTransition lève une DemandeTransitionError si la transition est invalide
        validateDemandeTransition(currentDemande.statut, updateData.statut);
      }
    }

    const [demande] = await (tx || db).update(demandesCredit).set(updateData).where(eq(demandesCredit.id, id)).returning();
    return demande || undefined;
  }


  export async function deleteDemandeCredit(id: string): Promise<boolean> {
    const [demande] = await db.update(demandesCredit)
      .set({ 
        deletedAt: new Date(),
        statut: StatutDemande.DELETED 
      })
      .where(eq(demandesCredit.id, id))
      .returning();
    return !!demande;
  }


  export async function cancelDemandeCredit(id: string, motif?: string): Promise<DemandeCredit | undefined> {
    // Garde de machine à état : Valider la transition vers 'CANCELLED'
    const [currentDemande] = await db.select({ statut: demandesCredit.statut }).from(demandesCredit).where(eq(demandesCredit.id, id));
    if (currentDemande && currentDemande.statut) {
      // validateDemandeTransition lève une DemandeTransitionError si la transition est invalide
      validateDemandeTransition(currentDemande.statut, StatutDemande.CANCELLED);
    }

    const [demande] = await db.update(demandesCredit)
      .set({
        statut: StatutDemande.CANCELLED as StatutDemandeDz,
        motifRejet: motif // On utilise motifRejet pour stocker la raison de l'annulation
      })
      .where(eq(demandesCredit.id, id))
      .returning();
    return demande || undefined;
  }

  
    export async function getEnqueteCredit(id: string): Promise<EnqueteCredit | undefined> {
    const [enquete] = await db.select().from(enquetesCredit).where(eq(enquetesCredit.id, id));
    return enquete || undefined;
  }


  export async function getEnqueteByDemandeId(demandeId: string): Promise<EnqueteCredit[]> {
    return db.select().from(enquetesCredit).where(eq(enquetesCredit.demandeId, demandeId)).orderBy(desc(enquetesCredit.createdAt));
  }

  
  export async function getEnquetesByClient(clientId: string): Promise<EnqueteCredit[]> {
    return db.select().from(enquetesCredit).where(eq(enquetesCredit.clientId, clientId)).orderBy(desc(enquetesCredit.createdAt));
  }

  
  export async function getAllEnquetes(): Promise<EnqueteCredit[]> {
    const results = await db.select({
      enquete: enquetesCredit,
      client: clients,
      user: users
    })
    .from(enquetesCredit)
    .leftJoin(clients, eq(enquetesCredit.clientId, clients.id))
    .leftJoin(users, eq(clients.userId, users.id))
    .orderBy(desc(enquetesCredit.createdAt));
    
    return results.map(({ enquete, client, user }) => ({
      ...enquete,
      clients: client ? {
        nom: user?.nom,
        prenom: user?.prenom,
        telephone: user?.telephone,
        photoProfile: user?.photoProfile
      } : undefined
    })) as EnqueteCredit[];
  }

  
  export async function createEnqueteCredit(insertEnquete: InsertEnqueteCredit): Promise<EnqueteCredit> {
    const [enquete] = await db.insert(enquetesCredit).values(insertEnquete).returning();
    return enquete;
  }

  
  export async function updateEnqueteCredit(id: string, updateData: Partial<InsertEnqueteCredit>): Promise<EnqueteCredit | undefined> {
    const [enquete] = await db.update(enquetesCredit).set(updateData).where(eq(enquetesCredit.id, id)).returning();
    return enquete || undefined;
  }

  
    export async function getRemboursement(id: string): Promise<Remboursement | undefined> {
    const [remboursement] = await db.select().from(remboursements).where(eq(remboursements.id, id));
    return remboursement || undefined;
  }

  
  export async function getRemboursementsByCredit(creditId: string): Promise<Remboursement[]> {
    return db.select().from(remboursements).where(eq(remboursements.creditId, creditId)).orderBy(desc(remboursements.dateRemboursement));
  }

  
  export async function createRemboursement(insertRemboursement: InsertRemboursement): Promise<Remboursement> {
    const [remboursement] = await db.insert(remboursements).values(insertRemboursement).returning();
    return remboursement;
  }



/**
 * Create a new Credit Refund Request
 */
export async function createCreditRefundRequest(
  data: InsertCreditRefundRequest, 
  tx?: PgTransaction<any, any, any>
): Promise<CreditRefundRequest> {
  const [request] = await (tx || db)
    .insert(creditRefundRequests)
    .values(data)
    .returning();
  return request;
}


/**
 * Get a Credit Refund Request by ID
 */
export async function getCreditRefundRequest(
  id: string, 
  tx?: PgTransaction<any, any, any>
): Promise<CreditRefundRequest | undefined> {
  const [request] = await (tx || db)
    .select()
    .from(creditRefundRequests)
    .where(eq(creditRefundRequests.id, id));
  return request;
}


/**
 * Update a Credit Refund Request
 */
export async function updateCreditRefundRequest(
  id: string, 
  updateData: Partial<CreditRefundRequest>,
  tx?: PgTransaction<any, any, any>
): Promise<CreditRefundRequest> {
  const [updated] = await (tx || db)
    .update(creditRefundRequests)
    .set({ ...updateData, updatedAt: new Date() })
    .where(eq(creditRefundRequests.id, id))
    .returning();
  return updated;
}


/**
 * Automatically generate payment schedule for a credit using the plan engine.
 */
export async function generateCreditSchedule(
  creditId: string,
  tx?: PgTransaction<any, any, any>
): Promise<EcheanceCredit[]> {
  const executor = tx || db;

  // 1. Récupérer le crédit
  const [credit] = await executor.select().from(credits).where(eq(credits.id, creditId));
  if (!credit) throw new Error("Credit not found for schedule generation");

  // 2. Vérifier si l'échéancier existe déjà
  const existing = await executor.select().from(echeancesCredits).where(eq(echeancesCredits.creditId, creditId));
  if (existing.length > 0) return existing;

  // 3. Générer en utilisant le moteur de plan de crédit
  const { generateSchedule } = await import("../../services/credit-plan");
  const startDate = new Date(credit.dateDebut || Date.now());

  if (!credit.creditPlanId) {
    throw new Error("Impossible de générer l'échéancier : aucun plan de crédit associé (creditPlanId manquant)");
  }

  const plan = await getCreditPlan(credit.creditPlanId);
  if (!plan) {
    throw new Error(`Plan de crédit introuvable : ${credit.creditPlanId}`);
  }

  const planConfig: import("../../services/credit-plan/types").PlanConfig = {
    dureeValeur: plan.dureeValeur,
    dureeUnite: plan.dureeUnite as "DAY" | "WEEK" | "MONTH",
    frequenceRemboursement: plan.frequenceRemboursement as FrequenceRemboursementDz,
    tauxInteret: plan.tauxInteret,
    interestMethod: plan.interestMethod as InterestMethodDz,
    interestRatePeriod: plan.interestRatePeriod as InterestRatePeriodDz,
    dayCountConvention: plan.dayCountConvention as DayCountConventionDz,
    interestRoundingMode: plan.interestRoundingMode as RoundingModeDz,
    interestRoundingUnit: plan.interestRoundingUnit,
    amortizationType: plan.amortizationType as AmortizationTypeDz,
    firstDueRule: plan.firstDueRule as FirstDueRuleDz,
    gracePeriodDays: plan.gracePeriodDays,
    preferredWeekday: plan.preferredWeekday,
    calendarMode: plan.calendarMode as CalendarModeDz,
    weekdaysMask: plan.weekdaysMask,
    shiftNonWorkingDay: plan.shiftNonWorkingDay as ShiftNonWorkingDayDz,
    allowManualFirstDueDate: plan.allowManualFirstDueDate,
  };

  const feeConfigs: import("../../services/credit-plan/types").FeeConfig[] = plan.fees
    .filter((f) => f.isActive)
    .map((f) => ({
      feeType: f.feeType,
      label: f.label,
      calcType: f.calcType as "FIXED" | "PERCENTAGE",
      value: f.value,
      minAmount: f.minAmount,
      maxAmount: f.maxAmount,
      collectionMode: f.collectionMode as FeeCollectionModeDz,
    }));

  const result = generateSchedule({
    principal: D(credit.montant),
    disbursementDate: startDate,
    plan: planConfig,
    fees: feeConfigs,
  });

  const schedule: InsertEcheanceCredit[] = result.rows.map((row: any) => ({
    creditId: credit.id,
    numeroEcheance: row.number,
    dateEcheance: row.date,
    montantCapital: roundMoney(row.capitalPayment),
    montantInteret: roundMoney(row.interestPayment),
    montantTotal: roundMoney(row.totalPayment),
    statut: 'UPCOMING',
    sequence: row.number,
  }));

  if (schedule.length === 0) return [];

  const inserted = await executor.insert(echeancesCredits).values(schedule).returning();

  // Mettre à jour le crédit avec le vrai totalDu et soldeRestant issus du moteur d'échéancier
  const totalDu = roundMoney(result.summary.totalDue);
  await executor.update(credits).set({
    totalDu,
    soldeRestant: totalDu,
    montantEcheance: schedule.length > 0 ? schedule[0].montantTotal : null,
  }).where(eq(credits.id, creditId));

  return inserted;
}