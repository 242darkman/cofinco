import { generateCreditSchedule } from "./credits";
import { getModeleFactureByCode, incrementModeleFactureNumero } from "./factures";
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




  

  

  export interface EnrichedCreditClient {
    nom?: string | null;
    prenom?: string | null;
    telephone?: string | null;
    photoProfile?: string | null;
  }


  export type EnrichedCredit = Credit & {
    montantPrincipal: number;
    nombreEcheancesTotal: number;
    nombreEcheancesPayees: number;
    joursRetard: number;
    clients?: EnrichedCreditClient;
  };


  /**
   * Enrich credit data with calculated fields (installments, delays, etc.)
   */
  export function enrichCreditData(credit: Credit, client?: EnrichedCreditClient): EnrichedCredit {
    let jours_retard = 0;
    let nombre_echeances_payees = 0;

    const dPrincipal = D(credit.montant);
    const principal = dPrincipal.toNumber();
    const totalEcheances = credit.duree || 1;
    const dTotalDu = D(credit.totalDu);
    const totalWithInterest = dTotalDu.toNumber();
    const dInstallmentAmount = dTotalDu.div(totalEcheances);
    const installmentAmount = dInstallmentAmount.toNumber();

    const dSoldeRestant = D(credit.soldeRestant);
    const soldeRestant = dSoldeRestant.toNumber();
    const totalPaid = Math.max(0, dTotalDu.minus(dSoldeRestant).toNumber());

    // Nombre d'échéances complètement payées = montant total payé / montant échéance
    if (installmentAmount > 0) {
      nombre_echeances_payees = Math.floor(totalPaid / installmentAmount);
    }

    // Calcul du retard uniquement pour les crédits actifs non soldés
    if (credit.dateDebut && (credit.statut === StatutCredit.ACTIVE || credit.statut === StatutCredit.LATE)) {
        // Normaliser les dates à minuit pour éviter les problèmes de timezone
        const start = new Date(credit.dateDebut);
        start.setHours(0, 0, 0, 0);

        const now = new Date();
        now.setHours(0, 0, 0, 0);

        // Convertir la fréquence en jours (approximation pour calcul de retard)
        // BI_MONTHLY = bimensuel = 2x/mois ≈ 15 jours
        let frequencyDays = 30; // Par défaut Mensuel
        switch (credit.echeance) {
          case FrequenceRemboursement.DAILY:
            frequencyDays = 1; break;
          case FrequenceRemboursement.WEEKLY:
            frequencyDays = 7; break;
          case FrequenceRemboursement.BI_MONTHLY:
            frequencyDays = 15; break;
          case FrequenceRemboursement.QUARTERLY:
            frequencyDays = 90; break;
        }

        // Si crédit totalement remboursé, pas de retard
        if (D(totalPaid).gte(dTotalDu.minus(0.01)) || nombre_echeances_payees >= totalEcheances) {
          jours_retard = 0;
        } else {
          // La prochaine échéance due est celle après les échéances déjà payées
          const nextInstallmentNumber = nombre_echeances_payees + 1;

          // Calcul de la date de la prochaine échéance
          const nextDueDate = new Date(start);
          nextDueDate.setDate(nextDueDate.getDate() + (nextInstallmentNumber * frequencyDays));

          // Retard = nombre de jours depuis que l'échéance est passée
          if (now > nextDueDate) {
            const diffTime = now.getTime() - nextDueDate.getTime();
            jours_retard = Math.floor(diffTime / (1000 * 60 * 60 * 24));
          }
        }
    }


    // Calcul de la prochaine échéance si manquante
    let prochaine_echeance_calc = credit.prochaineEcheance;
    if (!prochaine_echeance_calc && credit.dateDebut && (credit.statut === StatutCredit.ACTIVE || credit.statut === StatutCredit.LATE)) {
        const start = new Date(credit.dateDebut);
        start.setHours(0, 0, 0, 0);

        let frequencyDays = 30;
        switch (credit.echeance) {
          case FrequenceRemboursement.DAILY:
            frequencyDays = 1; break;
          case FrequenceRemboursement.WEEKLY:
            frequencyDays = 7; break;
          case FrequenceRemboursement.BI_MONTHLY:
            frequencyDays = 15; break; // bimensuel = 2x/mois
          case FrequenceRemboursement.QUARTERLY:
            frequencyDays = 90; break;
        }

        const nextInstallmentNumber = nombre_echeances_payees + 1;
        const nextDueDate = new Date(start);
        nextDueDate.setDate(nextDueDate.getDate() + (nextInstallmentNumber * frequencyDays));
        prochaine_echeance_calc = nextDueDate;
    }

    return {
      ...credit,
      montantPrincipal: principal,
      nombreEcheancesTotal: totalEcheances,
      nombreEcheancesPayees: nombre_echeances_payees,
      joursRetard: jours_retard,
      prochaineEcheance: prochaine_echeance_calc,
      montantEcheance: credit.montantEcheance || installmentAmount.toString(),
      clients: client ? {
        nom: client.nom,
        prenom: client.prenom,
        telephone: client.telephone,
        photoProfile: client.photoProfile,
      } : undefined
    };
  }

  
  export interface PaginatedCredits {
    data: EnrichedCredit[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }


  

  /**
   * Enrich account data with aliases for frontend compatibility
   */
  export function enrichCompteData(compte: Compte): any {
    return {
      ...compte,
      // Snake case and generic aliases for frontend compatibility
      numero_compte: compte.numeroCompte,
      type_compte: compte.typeCompte,
      solde_courant: compte.soldeCourant,
      solde: Number(compte.soldeCourant) || 0, // Alias for frontend logic
      client_id: compte.clientId,
      agence_id: compte.agenceId,
      blocage_actif: compte.blocageActif,
      blocage_motif: compte.blocageMotif,
      created_at: compte.createdAt,
      date_ouverture: compte.createdAt, // Alias for frontend (snake_case)
      dateOuverture: compte.createdAt, // Alias for frontend (camelCase)
    };
  }


/**
 * Métadonnées pour opérations par chèque
 */
export interface CheckMetadata {
  numeroCheque: string;
  banqueEmettrice: string;
  dateEmission?: string;
  titulaireCheque?: string;
}


/**
 * Métadonnées pour opérations par virement
 */
export interface TransferMetadata {
  banqueOrigine: string;
  numeroCompteOrigine?: string;
  referenceVirement?: string;
  nomEmetteur?: string;
}


/**
 * Données de vérification de présence physique (remplace l'OTP)
 */
export interface PhysicalVerificationData {
  verificationMethod: 'piece_identite' | 'reconnaissance_visuelle' | 'signature';
  identityConfirmed: boolean;
  responsibilityAccepted: boolean;
  agentNotes?: string;
  confirmedAt: string;
  passwordVerified?: boolean;
}