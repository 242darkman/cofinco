import { generateCreditSchedule } from "./credits";
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




      export async function getFacture(id: string): Promise<Facture | undefined> {
        const [facture] = await db.select().from(factures).where(eq(factures.id, id));
        return facture || undefined;
    }

    
    export async function getFactureByNumero(numero: string): Promise<Facture | undefined> {
        const [facture] = await db.select().from(factures).where(eq(factures.numero, numero));
        return facture || undefined;
    }

    
    export async function getFacturesByClient(clientId: string): Promise<Facture[]> {
        return db.select().from(factures).where(eq(factures.clientId, clientId));
    }

    
    export async function getFacturesByAgent(agentId: string): Promise<Facture[]> {
        return db.select().from(factures).where(eq(factures.agentId, agentId));
    }

    
    export async function getAllFactures(): Promise<Facture[]> {
        return db.select().from(factures).orderBy(desc(factures.createdAt));
    }

    
    export async function createFacture(insertFacture: InsertFacture): Promise<Facture> {
        const [facture] = await db.insert(factures).values(insertFacture).returning();
        return facture;
    }

    
    export async function updateFacture(id: string, updateData: Partial<InsertFacture>): Promise<Facture | undefined> {
        const [facture] = await db.update(factures).set({ ...updateData, updatedAt: new Date() }).where(eq(factures.id, id)).returning();
        return facture || undefined;
    }

    
        export async function getLignesByFacture(factureId: string): Promise<LigneFacture[]> {
        return db.select().from(lignesFactures).where(eq(lignesFactures.factureId, factureId));
    }

    
    export async function createLigneFacture(insertLigne: InsertLigneFacture): Promise<LigneFacture> {
        const [ligne] = await db.insert(lignesFactures).values(insertLigne).returning();
        return ligne;
    }


        export async function getModeleFacture(id: string): Promise<ModeleFacture | undefined> {
        const [modele] = await db.select().from(modelesFactures).where(eq(modelesFactures.id, id));
        return modele || undefined;
    }


    export async function getModeleFactureByCode(code: string): Promise<ModeleFacture | undefined> {
        const [modele] = await db.select().from(modelesFactures).where(eq(modelesFactures.code, code));
        return modele || undefined;
    }


    export async function getAllModelesFactures(): Promise<ModeleFacture[]> {
        return db.select().from(modelesFactures);
    }

    
    export async function createModeleFacture(insertModele: InsertModeleFacture): Promise<ModeleFacture> {
        const [modele] = await db.insert(modelesFactures).values(insertModele).returning();
        return modele;
    }


    export async function updateModeleFacture(id: string, updateData: Partial<InsertModeleFacture>): Promise<ModeleFacture | undefined> {
        const [modele] = await db.update(modelesFactures).set({ ...updateData, updatedAt: new Date() }).where(eq(modelesFactures.id, id)).returning();
        return modele || undefined;
    }

    
    export async function incrementModeleFactureNumero(id: string): Promise<number> {
      // Simple incrementation in DB or returning next value
      // This might require a transaction to be safe
      const [model] = await db.select().from(modelesFactures).where(eq(modelesFactures.id, id));
      if (!model) return 0;
      const nextNum = (model.dernierNumero || 0) + 1;
      await db.update(modelesFactures).set({ dernierNumero: nextNum }).where(eq(modelesFactures.id, id));
      return nextNum;
    }