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



    export async function getSessionCaisse(id: string): Promise<any | undefined> {
    const results = await db.select({
      session: sessionsCaisse,
      caisse_nom: caisses.nom,
      caissier_nom: users.nom,
      caissier_prenom: users.prenom
    })
    .from(sessionsCaisse)
    .leftJoin(caisses, eq(sessionsCaisse.caisseId, caisses.id))
    .leftJoin(users, eq(sessionsCaisse.caissierId, users.id))
    .where(eq(sessionsCaisse.id, id));

    if (results.length === 0) return undefined;

    const r = results[0];
    return {
      ...r.session,
      computedStatus: computeSessionStatus(r.session),
      caisseNom: r.caisse_nom || 'Caisse Inconnue',
      caissierNom: `${r.caissier_nom || ''} ${r.caissier_prenom || ''}`.trim() || 'Caissier Inconnu',
    };
  }


  export async function getActiveSessionForUser(userId: string): Promise<any | undefined> {
    const results = await db.select({
      session: sessionsCaisse,
      caisse_nom: caisses.nom,
      caissier_nom: users.nom,
      caissier_prenom: users.prenom
    })
    .from(sessionsCaisse)
    .leftJoin(caisses, eq(sessionsCaisse.caisseId, caisses.id))
    .leftJoin(users, eq(sessionsCaisse.caissierId, users.id))
    .where(and(
      eq(sessionsCaisse.caissierId, userId),
      inArray(sessionsCaisse.statut, ["OPEN", "CLOSING_COUNT", "CLOSING_VALIDATION"] as StatutSessionCaisseDz[]),
      isNull(sessionsCaisse.deletedAt)
    ));

    if (results.length === 0) return undefined;
    
    const r = results[0];
    return {
      ...r.session,
      computedStatus: computeSessionStatus(r.session),
      caisseNom: r.caisse_nom || 'Caisse Inconnue',
      caissierNom: `${r.caissier_nom || ''} ${r.caissier_prenom || ''}`.trim() || 'Moi',
    };
  }


  export async function getActiveSessions(): Promise<SessionCaisse[]> {
    return db.select().from(sessionsCaisse).where(
      and(notInArray(sessionsCaisse.statut, [...SESSION_TERMINAL_STATUSES]), isNull(sessionsCaisse.deletedAt))
    );
  }


  export async function getAllSessionsCaisse(filter: { agence?: string; statut?: string } = {}): Promise<any[]> {
    let query = db.select({
      session: sessionsCaisse,
      caissier_nom: users.nom,
      caissier_prenom: users.prenom,
      caisse_nom: caisses.nom,
      agence_nom: agences.nom,
      agence_code: agences.codeAgence
    })
    .from(sessionsCaisse)
    .leftJoin(users, eq(sessionsCaisse.caissierId, users.id))
    .leftJoin(caisses, eq(sessionsCaisse.caisseId, caisses.id))
    .leftJoin(agences, eq(sessionsCaisse.agenceId, agences.id));

    const conditions = [];

    if (filter.agence) {
      conditions.push(eq(sessionsCaisse.agenceId, filter.agence));
    }

    if (filter.statut) {
      const normalized = filter.statut.toUpperCase();
      const now = new Date();
      if (normalized === StatutCaisseAgent.OPEN) {
        conditions.push(
          and(
            notInArray(sessionsCaisse.statut, [...SESSION_TERMINAL_STATUSES]),
            isNull(sessionsCaisse.deletedAt),
            or(isNull(sessionsCaisse.timeoutAt), gte(sessionsCaisse.timeoutAt, now))
          )
        );
      } else if (normalized === "TIMED_OUT" || normalized === "TIMEOUT") {
        conditions.push(and(notInArray(sessionsCaisse.statut, [...SESSION_TERMINAL_STATUSES]), isNull(sessionsCaisse.deletedAt), lt(sessionsCaisse.timeoutAt, now)));
      } else if (normalized === StatutCaisseAgent.CLOSED) {
        conditions.push(inArray(sessionsCaisse.statut, [...SESSION_TERMINAL_STATUSES]));
      }
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const results = await query.orderBy(desc(sessionsCaisse.openedAt));

    return results.map(r => ({
      ...r.session,
      computedStatus: computeSessionStatus(r.session),
      caissierNom: `${r.caissier_nom || ''} ${r.caissier_prenom || ''}`.trim() || 'Caissier Inconnu',
      caisseNom: r.caisse_nom,
      agenceNom: r.agence_nom || 'Agence Inconnue',
      agenceCode: r.agence_code,
    }));
  }


  export async function createSessionCaisse(insertSession: InsertSessionCaisse): Promise<SessionCaisse> {
    const [session] = await db.insert(sessionsCaisse).values(insertSession).returning();
    return session;
  }


  export async function updateSessionCaisse(id: string, updateData: Partial<InsertSessionCaisse>): Promise<SessionCaisse | undefined> {
    const [session] = await db.update(sessionsCaisse).set(updateData).where(eq(sessionsCaisse.id, id)).returning();
    return session || undefined;
  }


  export async function updateUserConnectionStatus(userId: string, status: 'CONNECTED' | 'DISCONNECTED'): Promise<void> {
    // Only update if there is an active session for this user
    await db.update(sessionsCaisse)
      .set({ connectionStatus: status })
      .where(and(
        eq(sessionsCaisse.caissierId, userId),
        notInArray(sessionsCaisse.statut, [...SESSION_TERMINAL_STATUSES]),
        isNull(sessionsCaisse.deletedAt)
      ));
  }


  export async function closeSessionCaisse(id: string, closeData: { soldeReel: string; ecart: string; billetageFermeture: any; observations?: string }): Promise<SessionCaisse | undefined> {
    const [session] = await db.update(sessionsCaisse)
      .set({
        montantFermetureDeclare: closeData.soldeReel,
        ecart: closeData.ecart,
        billetageFermeture: closeData.billetageFermeture,
        observations: closeData.observations,
        closedAt: new Date(),
      })
      .where(eq(sessionsCaisse.id, id))
      .returning();
    return session || undefined;
  }


  export async function getSessionsByCaissier(caissierId: string): Promise<SessionCaisse[]> {
    return db.select().from(sessionsCaisse).where(eq(sessionsCaisse.caissierId, caissierId)).orderBy(desc(sessionsCaisse.openedAt));
  }


  /**
   * Get the last closed session for a caisse
   * Returns the most recent session that has been closed (closedAt IS NOT NULL)
   */
  export async function getLastClosedSession(caisseId: string): Promise<SessionCaisse | undefined> {
    const [session] = await db.select()
      .from(sessionsCaisse)
      .where(and(
        eq(sessionsCaisse.caisseId, caisseId),
        eq(sessionsCaisse.statut, "CLOSED")
      ))
      .orderBy(desc(sessionsCaisse.closedAt))
      .limit(1);
    return session || undefined;
  }


    export async function getCaisse(id: string): Promise<Caisse | undefined> {
    const [caisse] = await db.select().from(caisses).where(eq(caisses.id, id));
    return caisse || undefined;
  }


  export async function getCaissesByAgence(agenceId: string): Promise<Caisse[]> {
    // Only support UUID-based agenceId filtering
    return db.select().from(caisses).where(eq(caisses.agenceId, agenceId));
  }


  export async function getAllCaisses(): Promise<Caisse[]> {
    return db.select().from(caisses);
  }


  export async function getCaissesWithStatus(agenceId?: string): Promise<any[]> {
    let query = db.select({
      caisse: caisses,
      session: sessionsCaisse,
      caissier_nom: users.nom,
      caissier_prenom: users.prenom
    })
    .from(caisses)
    .leftJoin(sessionsCaisse, and(
      eq(caisses.id, sessionsCaisse.caisseId),
      notInArray(sessionsCaisse.statut, [...SESSION_TERMINAL_STATUSES]),
      isNull(sessionsCaisse.deletedAt)
    ))
    .leftJoin(users, eq(sessionsCaisse.caissierId, users.id));

    if (agenceId) {
      query = query.where(eq(caisses.agenceId, agenceId)) as any;
    }

    const results = await query;
    return results.map(r => ({
      ...r.caisse,
      activeSession: r.session ? {
        ...r.session,
        computedStatus: computeSessionStatus(r.session),
        caissierNom: `${r.caissier_nom || ''} ${r.caissier_prenom || ''}`.trim()
      } : null
    }));
  }


  export async function createCaisse(caisse: InsertCaisse): Promise<Caisse> {
    const [newCaisse] = await db.insert(caisses).values(caisse).returning();
    return newCaisse;
  }


  export async function updateCaisse(id: string, caisse: Partial<InsertCaisse>): Promise<Caisse | undefined> {
    const [updated] = await db.update(caisses).set(caisse).where(eq(caisses.id, id)).returning();
    return updated || undefined;
  }


  export async function deleteCaisse(id: string): Promise<boolean> {
    // 1. Check if caisse has usage history (sessions)
    const [usage] = await db.select({ count: count() }).from(sessionsCaisse).where(eq(sessionsCaisse.caisseId, id));
    
    if (usage && usage.count > 0) {
        return false; // Cannot delete used caisse
    }

    // 2. Clear assignments
    await db.delete(caisseAssignations).where(eq(caisseAssignations.caisseId, id));

    // 3. Soft delete Caisse (preserve audit trail)
    const result = await db.update(caisses).set({ deletedAt: new Date() }).where(eq(caisses.id, id)).returning();
    return result.length > 0;
  }


  export async function getCaisseAssignments(caisseId: string): Promise<CaisseAssignation[]> {
      return db.select().from(caisseAssignations).where(eq(caisseAssignations.caisseId, caisseId));
  }


  export async function getCaisseAssignmentsEnriched(caisseId: string) {
      return db.select({
        id: caisseAssignations.id,
        userId: caisseAssignations.userId,
        assignedAt: caisseAssignations.assignedAt,
        nom: users.nom,
        prenom: users.prenom,
        photoProfile: users.photoProfile,
      })
      .from(caisseAssignations)
      .innerJoin(users, eq(caisseAssignations.userId, users.id))
      .where(eq(caisseAssignations.caisseId, caisseId));
  }


  export async function getUserCaisseAssignments(userId: string): Promise<CaisseAssignation[]> {
      return db.select().from(caisseAssignations).where(eq(caisseAssignations.userId, userId));
  }


  /**
   * Get user's assigned caisses with available balance
   * Balance = montantReporte from last closed session OR caisse.solde
   */
  export async function getUserAssignedCaissesWithBalance(userId: string): Promise<any[]> {
    // 1. Get user's assignments
    const assignments = await db.select().from(caisseAssignations).where(eq(caisseAssignations.userId, userId));

    if (assignments.length === 0) return [];

    // 2. Get caisse details for each assignment
    const caisseIds = assignments.map(a => a.caisseId);
    const caissesData = await db.select().from(caisses).where(inArray(caisses.id, caisseIds));

    // 3. For each caisse, get last closed session to determine available balance
    const result = await Promise.all(caissesData.map(async (caisse) => {
      // Check if there's an active session on this caisse
      const [activeSession] = await db.select()
        .from(sessionsCaisse)
        .where(and(
          eq(sessionsCaisse.caisseId, caisse.id),
          notInArray(sessionsCaisse.statut, [...SESSION_TERMINAL_STATUSES]),
          isNull(sessionsCaisse.deletedAt)
        ));

      // Get last closed session for balance info
      const [lastClosedSession] = await db.select()
        .from(sessionsCaisse)
        .where(and(
          eq(sessionsCaisse.caisseId, caisse.id),
          sql`${sessionsCaisse.closedAt} IS NOT NULL`
        ))
        .orderBy(desc(sessionsCaisse.closedAt))
        .limit(1);

      // Calculate available balance (using Number() for proper comparison)
      let availableBalance = 0;
      let balanceSource = 'none';

      if (lastClosedSession) {
        const montantReporte = Number(lastClosedSession.montantReporte || 0);
        const soldeCaisse = Number(caisse.solde || 0);
        const montantDeclare = Number(lastClosedSession.montantFermetureDeclare || 0);

        if (montantReporte > 0) {
          availableBalance = montantReporte;
          balanceSource = 'montantReporte';
        } else if (soldeCaisse > 0) {
          availableBalance = soldeCaisse;
          balanceSource = 'caisse.solde';
        } else if (montantDeclare > 0) {
          availableBalance = montantDeclare;
          balanceSource = 'montantDeclare';
        }
      } else {
        // No closed session, use caisse.solde directly
        availableBalance = Number(caisse.solde || 0);
        balanceSource = 'caisse.solde';
      }

      return {
        ...caisse,
        availableBalance,
        balanceSource,
        isOccupied: !!activeSession,
        occupiedBy: activeSession?.caissierId || null,
        activeSessionId: activeSession?.id || null,
        lastClosedAt: lastClosedSession?.closedAt || null,
      };
    }));

    return result;
  }


  export async function setCaisseAssignments(caisseId: string, userIds: string[], assignedBy: string): Promise<void> {
      // Transaction to replace assignments
      await db.transaction(async (tx) => {
          // 1. Delete existing
          await tx.delete(caisseAssignations).where(eq(caisseAssignations.caisseId, caisseId));
          
          // 2. Insert new
          if (userIds.length > 0) {
              const records = userIds.map(userId => ({
                  caisseId,
                  userId,
                  assignedBy
              }));
              await tx.insert(caisseAssignations).values(records);
          }
      });
  }


        export async function getComptageBillets(id: string): Promise<ComptageBillets | undefined> {
        const [comptage] = await db.select().from(comptageBillets).where(eq(comptageBillets.id, id));
        return comptage || undefined;
    }

    export async function getComptagesBySession(sessionId: string): Promise<ComptageBillets[]> {
         return db.select().from(comptageBillets).where(eq(comptageBillets.sessionId, sessionId));
    }

    export async function createComptageBillets(insertComptage: InsertComptageBillets): Promise<ComptageBillets> {
        const [comptage] = await db.insert(comptageBillets).values(insertComptage).returning();
        return comptage;
    }

    

        export async function getCaisseTransfert(id: string): Promise<CaisseTransfert | undefined> {
        const [transfert] = await db.select().from(caisseTransferts).where(eq(caisseTransferts.id, id));
        return transfert || undefined;
    }


    export async function getCaisseTransferts(agenceId?: string): Promise<any[]> {
        const sourceAgence = aliasedTable(agences, "source_agence");
        const destAgence = aliasedTable(agences, "dest_agence");

        const selection = {
            ...getTableColumns(caisseTransferts),
            created_by_username: users.username,
            created_by_nom: users.nom,
            created_by_prenom: users.prenom,
            agence_source_nom: sourceAgence.nom,
            agence_dest_nom: destAgence.nom
        };

        let query = db.select(selection)
            .from(caisseTransferts)
            .leftJoin(users, eq(caisseTransferts.createdBy, users.id))
            .leftJoin(sourceAgence, eq(caisseTransferts.agenceSourceId, sourceAgence.id))
            .leftJoin(destAgence, eq(caisseTransferts.agenceDestId, destAgence.id));

        if (agenceId) {
            query = query.where(or(
                eq(caisseTransferts.agenceSourceId, agenceId), 
                eq(caisseTransferts.agenceDestId, agenceId)
            )) as any;
        }
        
        return query.orderBy(desc(caisseTransferts.dateCreation));
    }


    export async function getCaisseTransfertsByAgence(agenceId: string): Promise<any[]> {
         return getCaisseTransferts(agenceId);
    }


    export async function createCaisseTransfert(insertData: InsertCaisseTransfert): Promise<CaisseTransfert> {
        const [transfert] = await db.insert(caisseTransferts).values(insertData).returning();
        return transfert;
    }


    export async function updateCaisseTransfert(id: string, updateData: Partial<InsertCaisseTransfert>): Promise<CaisseTransfert | undefined> {
        const [transfert] = await db.update(caisseTransferts).set({ ...updateData }).where(eq(caisseTransferts.id, id)).returning();
        return transfert || undefined;
    }