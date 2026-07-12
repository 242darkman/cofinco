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



        export async function getUpcomingEcheances(filter: { agenceId?: string; agence?: string } = {}): Promise<{ client: string; amount: number; date: string; status: string }[]> {
        // 1. Get active credits
        const conditions = [
            eq(credits.statut, StatutCredit.ACTIVE),
            gt(credits.soldeRestant, "0")
        ];

        // Utilisation de agenceId directement si fourni (plus sûr)
        if (filter.agenceId) {
            conditions.push(eq(clients.agenceId, filter.agenceId));
        } else if (filter.agence) {
            // Repli : rechercher l'agenceId par nom
            const [agenceRecord] = await db.select({ id: agences.id })
              .from(agences)
              .where(eq(agences.nom, filter.agence))
              .limit(1);
            if (agenceRecord) {
              conditions.push(eq(clients.agenceId, agenceRecord.id));
            }
        }

        // P3.5: Add LIMIT to prevent unbounded query on large datasets
        const activeCredits = await db.select({
            credit: credits,
            client: clients,
            user: users
        })
        .from(credits)
        .innerJoin(clients, eq(credits.clientId, clients.id))
        .innerJoin(users, eq(clients.userId, users.id))
        .where(and(...conditions))
        .orderBy(credits.prochaineEcheance)
        .limit(100);
        const upcomingPayments: { client: string; amount: number; date: string; status: string }[] = [];
        const now = new Date();

        for (const { credit, client, user } of activeCredits) {
            if (!credit.dateDebut || !credit.montant || !credit.duree || !clients) continue;

            const dateDebut = new Date(credit.dateDebut);
            // Simplified calculation: Monthly payment = Amount / Duration
            const mensualite = D(credit.montant).div(credit.duree).toDecimalPlaces(0).toNumber();

            // Find next payment date
            let nextDate = new Date(dateDebut);
            
            // Simple iteration to find the next due date
            for (let i = 1; i <= credit.duree; i++) {
                nextDate = new Date(dateDebut);
                nextDate.setMonth(dateDebut.getMonth() + i);
                
                const diffTime = nextDate.getTime() - now.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

                // If date is within [Now - 5 days, Now + 30 days]
                if (diffDays >= -5 && diffDays <= 30) {
                     upcomingPayments.push({
                        client: `${user?.nom} ${user?.prenom}`,
                        amount: mensualite,
                        date: nextDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
                        status: diffDays < 0 ? 'due' : 'pending' 
                     });
                     break; // Only show the IMMEDIATE next one
                }
            }
        }
        
        // P3.5: Limit results for dashboard display
        return upcomingPayments.slice(0, 20).sort((a, b) => 0);
    }


        export async function getDureesSuggerees(frequence?: string): Promise<DureeSuggeree[]> {
        let query = db.select().from(dureesSuggerees).where(eq(dureesSuggerees.actif, true));

        if (frequence) {
            query = db.select().from(dureesSuggerees).where(
                and(
                    eq(dureesSuggerees.actif, true),
                    eq(dureesSuggerees.frequence, frequence as FrequenceRemboursementDz)
                )
            );
        }

        return query.orderBy(dureesSuggerees.ordre);
    }


    export async function getDureeSuggereeRecommandee(frequence: string): Promise<DureeSuggeree | undefined> {
        const [duree] = await db.select().from(dureesSuggerees).where(
            and(
                eq(dureesSuggerees.actif, true),
                eq(dureesSuggerees.frequence, frequence as FrequenceRemboursementDz),
                eq(dureesSuggerees.estRecommandee, true)
            )
        );
        return duree || undefined;
    }


    export async function createDureeSuggeree(insertDuree: InsertDureeSuggeree): Promise<DureeSuggeree> {
        const [duree] = await db.insert(dureesSuggerees).values(insertDuree).returning();
        return duree;
    }


    export async function updateDureeSuggeree(id: string, updateData: Partial<InsertDureeSuggeree>): Promise<DureeSuggeree | undefined> {
        const [duree] = await db.update(dureesSuggerees).set(updateData).where(eq(dureesSuggerees.id, id)).returning();
        return duree || undefined;
    }


    export async function deleteDureeSuggeree(id: string): Promise<boolean> {
        await db.update(dureesSuggerees).set({ actif: false }).where(eq(dureesSuggerees.id, id));
        return true;
    }