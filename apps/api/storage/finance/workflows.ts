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



/**
 * Create a transaction épargne with full ledger flow
 * - Creates mouvement_financier
 * - Updates compte solde
 * - Creates transaction_epargne with mouvement_id
 * - Publishes outbox events
 */
export async function createTransactionCompteWithLedger(data: {
  compteId: string;
  typeTransaction: "DEPOSIT" | "WITHDRAWAL" | "INTEREST" | "FEE" | "ADJUSTMENT";
  montant: string;
  methodePaiement: string;
  sessionCaisseId?: string;
  observations?: string;
  idempotencyKey?: string;
}, userId?: string): Promise<{ transaction: TransactionCompte; mouvement: MouvementFinancier }> {

  // Determine sens based on transaction type

  const isDebit = ["WITHDRAWAL", "FEE"].includes(data.typeTransaction);
  const sens: SensMouvement = isDebit ? "DEBIT" : "CREDIT";
  const delta = isDebit ? -parseFloat(data.montant) : parseFloat(data.montant);

  // Get compte for clientId
  const [compte] = await db.select().from(comptes).where(eq(comptes.id, data.compteId));
  if (!compte) throw new Error(`Compte ${data.compteId} not found`);

  // Map typeTransaction to typePaiement terrain enum values
  const typePaiement = (() => {
    switch (data.typeTransaction) {
      case "DEPOSIT":
        return getTypePaiementForCompte(compte.typeCompte, true);
      case "WITHDRAWAL":
        return getTypePaiementForCompte(compte.typeCompte, false);
      case "FEE":
        return "ADJUSTMENT" as const;
      case "ADJUSTMENT":
        return "ADJUSTMENT" as const;
      case "INTEREST":
        return "INTEREST_PAYMENT" as const;
    }
  })();

  return executeWithLedger(
    "EPARGNE",
    {
      montant: data.montant,
      sens,
      clientId: compte.clientId,
      compteId: data.compteId,
      agenceId: compte.agenceId || undefined,
      sessionCaisseId: data.sessionCaisseId,
      methodePaiement: data.methodePaiement,
      typePaiement,
      idempotencyKey: data.idempotencyKey,
    },
    async (tx, mouvement) => {
      // 1. Mettre à jour le solde du compte
      const nouveauSolde = await updateCompteSolde(tx, data.compteId, delta);

      // 2. Mettre à jour le solde de la session de caisse si applicable
      let nouveauSoldeSession: string | undefined;
      if (data.sessionCaisseId) {
        // For deposits, cash comes in; for withdrawals, cash goes out
        const sessionDelta = isDebit ? -parseFloat(data.montant) : parseFloat(data.montant);
        nouveauSoldeSession = await updateSessionSolde(tx, data.sessionCaisseId, sessionDelta);
      }

      // 3. Validate userId
      const validatedUserId = await validateUserId(tx, userId);

      // 4. Create transaction épargne
      const [transaction] = await tx.insert(transactionsCompte).values({
        compteId: data.compteId,
        mouvementId: mouvement.id,
        typePaiement,
        sens,
        montant: data.montant,
        soldeApres: nouveauSolde,
        methodePaiement: data.methodePaiement as MethodePaiementDz,
        observations: data.observations,
        createdBy: validatedUserId,
      }).returning();

      return {
        result: transaction,
        additionalEventData: {
          nouveauSoldeCompte: nouveauSolde,
          nouveauSoldeSession,
        },
      };
    },
    userId
  ).then(({ result, mouvement }) => ({ transaction: result, mouvement }));
}


/**
 * Create an operation caisse with full ledger flow
 * Supports metadata for checks/transfers and physical presence verification
 */
export async function createOperationCaisseWithLedger(data: {
  sessionId: string;
  typeOperation: string;
  montant: string;
  methodePaiement: string;
  clientId?: string;
  description?: string;
  idempotencyKey?: string;
  // Nouvelles données pour métadonnées chèques/virements
  checkMetadata?: CheckMetadata;
  transferMetadata?: TransferMetadata;
  // Données de vérification de présence physique
  presenceVerification?: PhysicalVerificationData;
}, userId?: string): Promise<{ operation: OperationCaisse; mouvement: MouvementFinancier }> {

  // Determine sens based on operation type
  const opLower = data.typeOperation.toLowerCase();
  const isDebit = opLower.startsWith("retrait") ||
                  opLower.startsWith("décaissement") ||
                  opLower.startsWith("sort") || // Sortie
                  opLower.startsWith("frais");

  const sens: SensMouvement = isDebit ? "DEBIT" : "CREDIT";
  const sessionDelta = isDebit ? -parseFloat(data.montant) : parseFloat(data.montant);

  // Get session for agenceId
  const [session] = await db.select().from(sessionsCaisse).where(eq(sessionsCaisse.id, data.sessionId));
  if (!session) throw new Error(`Session ${data.sessionId} not found`);

  // Generate reference
  const timestamp = Date.now().toString().slice(-8);
  const reference = `OP-${timestamp}-${randomInt(0, 1000).toString().padStart(3, '0')}`;

  // Construire les métadonnées
  const metadata: Record<string, unknown> = {};
  if (data.checkMetadata) {
    metadata.check = data.checkMetadata;
  }
  if (data.transferMetadata) {
    metadata.transfer = data.transferMetadata;
  }

  return executeWithLedger(
    "CAISSE",
    {
      montant: data.montant,
      sens,
      clientId: data.clientId,
      sessionCaisseId: data.sessionId,
      agenceId: session.agenceId || undefined,
      methodePaiement: data.methodePaiement,
      idempotencyKey: data.idempotencyKey,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    },
    async (tx, mouvement) => {
      // 1. Update session solde théorique
      const nouveauSolde = await updateSessionSolde(tx, data.sessionId, sessionDelta);

      // 2. Validate userId
      const validatedUserId = await validateUserId(tx, userId);

      // 3. Create operation caisse with metadata
      const [operation] = await tx.insert(operationsCaisse).values({
        sessionId: data.sessionId,
        mouvementId: mouvement.id,
        typeOperation: data.typeOperation as TypeOperationCaisseDz,
        montant: data.montant,
        methodePaiement: data.methodePaiement as MethodePaiementDz,
        reference,
        description: data.description,
        clientId: data.clientId,
        createdBy: validatedUserId,
        idempotencyKey: data.idempotencyKey,
        // Stocker les métadonnées chèques/virements
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        // Stocker la vérification de présence physique
        presenceVerification: data.presenceVerification || undefined,
      }).returning();

      return {
        result: operation,
        additionalEventData: {
          nouveauSoldeSession: nouveauSolde,
        },
      };
    },
    userId
  ).then(({ result, mouvement }) => ({ operation: result, mouvement }));
}


/**
 * Create a remboursement with full ledger flow
 */
export async function createRemboursementWithLedger(data: {
  creditId: string;
  montant: string;
  methodePaiement: string;
  sessionCaisseId?: string;
  observations?: string;
  idempotencyKey?: string;
}, userId?: string): Promise<{ remboursement: Remboursement; mouvement: MouvementFinancier }> {
  
  // Get credit for clientId
  const [credit] = await db.select().from(credits).where(eq(credits.id, data.creditId));
  if (!credit) throw new Error(`Credit ${data.creditId} not found`);

  // Force Session for Cash
  if (data.methodePaiement === 'CASH' && !data.sessionCaisseId) {
      throw new Error("Une session de caisse active est requise pour les remboursements en espèces");
  }

  return executeWithLedger(
    "CREDIT",
    {
      montant: data.montant,
      sens: "CREDIT", // Money coming in
      clientId: credit.clientId,
      creditId: data.creditId,
      agenceId: credit.agenceId || undefined,
      sessionCaisseId: data.sessionCaisseId,
      methodePaiement: data.methodePaiement,
      typePaiement: "CREDIT_REPAYMENT",
      idempotencyKey: data.idempotencyKey,
    },
    async (tx, mouvement) => {
      // 1. Update credit solde restant (decrease by payment amount)
      const nouveauSolde = await updateCreditSolde(tx, data.creditId, -parseFloat(data.montant));

      // 2. Update session caisse if applicable
      let nouveauSoldeSession: string | undefined;
      if (data.sessionCaisseId) {
        nouveauSoldeSession = await updateSessionSolde(tx, data.sessionCaisseId, parseFloat(data.montant));
      }

      // 3. Validate userId
      const validatedUserId = await validateUserId(tx, userId);

      // 4. Create remboursement
      const [remboursement] = await tx.insert(remboursements).values({
        creditId: data.creditId,
        mouvementId: mouvement.id,
        montant: data.montant,
        dateRemboursement: new Date(),
        methodePaiement: data.methodePaiement as MethodePaiementDz,
        observations: data.observations,
        createdBy: validatedUserId,
        idempotencyKey: data.idempotencyKey,
      }).returning();

      return {
        result: remboursement,
        additionalEventData: {
          nouveauSoldeCredit: nouveauSolde,
          nouveauSoldeSession,
        },
      };
    },
    userId
  ).then(async ({ result, mouvement }) => {
    // Generate receipt for the repayment
    const facture = await createFactureForRemboursement({
      creditId: data.creditId,
      numeroCredit: credit.numeroCredit,
      clientId: credit.clientId,
      montant: data.montant,
      agentId: userId,
      sessionCaisseId: data.sessionCaisseId,
    });
    
    return { remboursement: result, mouvement, facture };
  });
}


/**
 * Payer les frais d'engagement pour une demande de crédit
 * Génère automatiquement une facture/reçu après paiement
 */
export async function payerFraisEngagement(data: {
  demandeId: string;
  montant: string;
  methodePaiement: string;
  sessionCaisseId?: string;
  idempotencyKey?: string;
}, userId?: string): Promise<{ demande: DemandeCredit; operation: OperationCaisse; mouvement: MouvementFinancier; facture: Facture }> {
  
  // 1. Récupérer la demande
  const [demande] = await db.select().from(demandesCredit).where(eq(demandesCredit.id, data.demandeId));
  if (!demande) throw new Error(`Demande ${data.demandeId} non trouvée`);
  if (demande.fraisEngagementPayes) throw new Error(`Les frais ont déjà été payés pour cette demande`);

  // Force Session for Cash
  if (data.methodePaiement === 'CASH' && !data.sessionCaisseId) {
      throw new Error("Une session de caisse active est requise pour le paiement des frais en espèces");
  }

  // Get agenceId from session caisse if available (for GL posting)
  let agenceId: string | undefined;
  if (data.sessionCaisseId) {
    const [session] = await db
      .select({ agenceId: sessionsCaisse.agenceId })
      .from(sessionsCaisse)
      .where(eq(sessionsCaisse.id, data.sessionCaisseId))
      .limit(1);
    agenceId = session?.agenceId || undefined;
  }

  const ledgerResult = await executeWithLedger(
    "CREDIT",
    {
      montant: data.montant,
      sens: "CREDIT", // L'argent entre dans l'institution
      clientId: demande.clientId,
      sessionCaisseId: data.sessionCaisseId,
      methodePaiement: data.methodePaiement,
      typePaiement: "ENGAGEMENT_FEE",
      idempotencyKey: data.idempotencyKey,
      agenceId, // Pass agenceId to ledger for GL posting
    },
    async (tx, mouvement) => {
      // 2. Mettre à jour la demande
      const [updatedDemande] = await tx.update(demandesCredit)
        .set({ 
          fraisEngagementPayes: true, 
          montantFraisEngagement: data.montant,
          statut: StatutDemande.READY_FOR_INVESTIGATION
        })
        .where(eq(demandesCredit.id, data.demandeId))
        .returning();

      // 3. Mettre à jour la session caisse si applicable
      let nouveauSoldeSession: string | undefined;
      if (data.sessionCaisseId) {
        nouveauSoldeSession = await updateSessionSolde(tx, data.sessionCaisseId, parseFloat(data.montant));
      }

      // 4. Validate userId
      const validatedUserId = await validateUserId(tx, userId);

      // 5. Créer l'opération caisse
      const reference = `FRAIS-${demande.numeroDemande}-${Date.now()}`;
      const [operation] = await tx.insert(operationsCaisse).values({
        sessionId: data.sessionCaisseId!,
        mouvementId: mouvement.id,
        typeOperation: TypeOperationCaisse.ENGAGEMENT_FEE,
        montant: data.montant,
        methodePaiement: data.methodePaiement as MethodePaiementDz,
        reference,
        description: `Paiement frais d'engagement demande ${demande.numeroDemande}`,
        clientId: demande.clientId,
        createdBy: validatedUserId,
        idempotencyKey: data.idempotencyKey,
      }).returning();

      return {
        result: { demande: updatedDemande, operation, validatedUserId },
        additionalEventData: {
          nouveauSoldeSession,
        },
      };
    },
    userId
  );

  // 6. Create facture/receipt AFTER successful payment (outside transaction for simplicity)
  const facture = await createFactureForFraisEngagement({
    demandeId: data.demandeId,
    numeroDemande: demande.numeroDemande,
    clientId: demande.clientId,
    montant: data.montant,
    agentId: ledgerResult.result.validatedUserId,
    operationCaisseId: ledgerResult.result.operation.id,
    sessionCaisseId: data.sessionCaisseId,
  });

  return {
    demande: ledgerResult.result.demande,
    operation: ledgerResult.result.operation,
    mouvement: ledgerResult.mouvement,
    facture,
  };
}


/**
 * Create a facture (invoice/receipt) for credit engagement fees
 * This is called automatically after successful fee payment
 */
export async function createFactureForFraisEngagement(data: {
  demandeId: string;
  numeroDemande: string;
  clientId: string;
  montant: string;
  agentId?: string;
  operationCaisseId?: string;
  sessionCaisseId?: string;
}): Promise<Facture> {
  // 1. Get or create the "FRAIS_ENGAGEMENT" template
  let modele = await getModeleFactureByCode("FRAIS_ENGAGEMENT");
  
  if (!modele) {
    // Create default template if not exists
    [modele] = await db.insert(modelesFactures).values({
      nom: "Reçu Frais d'Engagement",
      code: "FRAIS_ENGAGEMENT",
      description: "Reçu de paiement des frais d'engagement pour demande de crédit",
      typeDocument: TypeDocument.RECEIPT,
      prefixeNumero: "REC",
      dernierNumero: 0,
      mentionsLegales: "Ce reçu atteste du paiement des frais d'engagement. Ce document ne constitue pas une approbation de crédit.",
      afficherTva: false,
      isActive: true,
    }).returning();
  }
  
  // 2. Increment invoice number
  const nextNum = await incrementModeleFactureNumero(modele.id);
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const numeroFacture = `${modele.prefixeNumero}-${dateStr}-${String(nextNum).padStart(4, '0')}`;
  
  // 3. Get shift from session if available
  let shiftId: string | undefined;
  if (data.sessionCaisseId) {
    const [session] = await db.select().from(sessionsCaisse).where(eq(sessionsCaisse.id, data.sessionCaisseId));
    // Note: SessionsCaisse doesn't have a direct shiftId, we skip shift linking for now
  }
  
  // 4. Create the facture
  const montantTotal = parseFloat(data.montant);
  const [facture] = await db.insert(factures).values({
    numero: numeroFacture,
    modeleId: modele.id,
    clientId: data.clientId,
    agentId: data.agentId,
    dateFacture: new Date(),
    sousTotal: data.montant,
    montantTva: "0",
    montantTotal: data.montant,
    montantPaye: data.montant,
    statut: StatutFacture.PAID,
    modePaiement: "CASH",
    operationCaisseId: data.operationCaisseId,
    notes: `Frais d'engagement pour demande de crédit ${data.numeroDemande}`,
  }).returning();

  // 5. Create ligne facture
  await db.insert(lignesFactures).values({
    factureId: facture.id,
    description: `Frais d'engagement - Demande de crédit N° ${data.numeroDemande}`,
    quantite: 1,
    prixUnitaire: data.montant,
    montant: data.montant,
    typeOperation: "ENGAGEMENT_FEE",
    referenceId: data.demandeId,
  });
  
  return facture;
}


/**
 * Create a receipt for account deposit
 */
export async function createFactureForDepot(data: {
  compteId: string;
  numeroCompte: string;
  clientId: string;
  montant: string;
  typeCompte: string;
  agentId?: string;
  operationCaisseId?: string;
  sessionCaisseId?: string;
  transactionId?: string; // ← NOUVEAU: Pour lier la facture à la transaction
}): Promise<Facture> {
  // Mapping TypeCompte (EN) vers code facture
  const codeMap: Record<string, string> = {
    [TypeCompte.SAVINGS]: 'DEPOT_EPARGNE',
    [TypeCompte.CURRENT]: 'DEPOT_COURANT',
    [TypeCompte.BLOCKED]: 'DEPOT_BLOQUE',
  };
  const code = codeMap[data.typeCompte] || 'DEPOT_EPARGNE';
  
  let modele = await getModeleFactureByCode(code);
  if (!modele) {
    const prefixMap: Record<string, string> = {
      'DEPOT_EPARGNE': 'DEP-EPG',
      'DEPOT_COURANT': 'DEP-CRT',
      'DEPOT_BLOQUE': 'DEP-BLQ',
    };
    [modele] = await db.insert(modelesFactures).values({
      nom: `Reçu Dépôt ${data.typeCompte}`,
      code,
      description: `Reçu de dépôt sur compte ${data.typeCompte.toLowerCase()}`,
      typeDocument: TypeDocument.RECEIPT,
      prefixeNumero: prefixMap[code],
      dernierNumero: 0,
      mentionsLegales: "Ce reçu atteste du dépôt effectué sur votre compte.",
      afficherTva: false,
      isActive: true,
    }).returning();
  }
  
  const nextNum = await incrementModeleFactureNumero(modele.id);
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const numeroFacture = `${modele.prefixeNumero}-${dateStr}-${String(nextNum).padStart(4, '0')}`;
  
  const [facture] = await db.insert(factures).values({
    numero: numeroFacture,
    modeleId: modele.id,
    clientId: data.clientId,
    agentId: data.agentId,
    dateFacture: new Date(),
    sousTotal: data.montant,
    montantTva: "0",
    montantTotal: data.montant,
    montantPaye: data.montant,
    statut: StatutFacture.PAID,
    modePaiement: "CASH",
    operationCaisseId: data.operationCaisseId,
    notes: `Dépôt sur compte ${data.typeCompte} N° ${data.numeroCompte}`,
  }).returning();

  await db.insert(lignesFactures).values({
    factureId: facture.id,
    description: `Dépôt - Compte ${data.typeCompte} N° ${data.numeroCompte}`,
    quantite: 1,
    prixUnitaire: data.montant,
    montant: data.montant,
    typeOperation: data.typeCompte === TypeCompte.CURRENT ? "DEPOSIT_CURRENT" :
                   data.typeCompte === TypeCompte.BLOCKED ? "DEPOSIT_BLOCKED" : "DEPOSIT_SAVINGS",
    referenceId: data.compteId,
  });
  
  // ← NOUVEAU: Lier la facture à la transaction
  if (data.transactionId) {
    await db.update(transactionsCompte)
      .set({ factureId: facture.id })
      .where(eq(transactionsCompte.id, data.transactionId));
  }
  
  return facture;
}


/**
 * Create a receipt for account withdrawal
 */
export async function createFactureForRetrait(data: {
  compteId: string;
  numeroCompte: string;
  clientId: string;
  montant: string;
  typeCompte: string;
  agentId?: string;
  operationCaisseId?: string;
  sessionCaisseId?: string;
  transactionId?: string; // ← NOUVEAU
}): Promise<Facture> {
  // Mapping TypeCompte (EN) vers code facture
  const codeMap: Record<string, string> = {
    [TypeCompte.SAVINGS]: 'RETRAIT_EPARGNE',
    [TypeCompte.CURRENT]: 'RETRAIT_COURANT',
    [TypeCompte.BLOCKED]: 'RETRAIT_BLOQUE',
  };
  const code = codeMap[data.typeCompte] || 'RETRAIT_EPARGNE';
  
  let modele = await getModeleFactureByCode(code);
  if (!modele) {
    const prefixMap: Record<string, string> = {
      'RETRAIT_EPARGNE': 'RET-EPG',
      'RETRAIT_COURANT': 'RET-CRT',
      'RETRAIT_BLOQUE': 'RET-BLQ',
    };
    [modele] = await db.insert(modelesFactures).values({
      nom: `Reçu Retrait ${data.typeCompte}`,
      code,
      description: `Reçu de retrait sur compte ${data.typeCompte.toLowerCase()}`,
      typeDocument: TypeDocument.RECEIPT,
      prefixeNumero: prefixMap[code],
      dernierNumero: 0,
      mentionsLegales: "Ce reçu atteste du retrait effectué sur votre compte.",
      afficherTva: false,
      isActive: true,
    }).returning();
  }
  
  const nextNum = await incrementModeleFactureNumero(modele.id);
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const numeroFacture = `${modele.prefixeNumero}-${dateStr}-${String(nextNum).padStart(4, '0')}`;
  
  const [facture] = await db.insert(factures).values({
    numero: numeroFacture,
    modeleId: modele.id,
    clientId: data.clientId,
    agentId: data.agentId,
    dateFacture: new Date(),
    sousTotal: data.montant,
    montantTva: "0",
    montantTotal: data.montant,
    montantPaye: data.montant,
    statut: StatutFacture.PAID,
    modePaiement: "CASH",
    operationCaisseId: data.operationCaisseId,
    notes: `Retrait sur compte ${data.typeCompte} N° ${data.numeroCompte}`,
  }).returning();

  await db.insert(lignesFactures).values({
    factureId: facture.id,
    description: `Retrait - Compte ${data.typeCompte} N° ${data.numeroCompte}`,
    quantite: 1,
    prixUnitaire: data.montant,
    montant: data.montant,
    typeOperation: data.typeCompte === TypeCompte.CURRENT ? "WITHDRAWAL_CURRENT" :
                   data.typeCompte === TypeCompte.BLOCKED ? "WITHDRAWAL_BLOCKED" : "WITHDRAWAL_SAVINGS",
    referenceId: data.compteId,
  });
  
  // ← NOUVEAU: Lier la facture à la transaction
  if (data.transactionId) {
    await db.update(transactionsCompte)
      .set({ factureId: facture.id })
      .where(eq(transactionsCompte.id, data.transactionId));
  }
  
  return facture;
}


/**
 * Create a receipt for credit repayment
 */
export async function createFactureForRemboursement(data: {
  creditId: string;
  numeroCredit: string;
  clientId: string;
  montant: string;
  agentId?: string;
  operationCaisseId?: string;
  sessionCaisseId?: string;
  remboursementId?: string; // ← NOUVEAU
}): Promise<Facture> {
  let modele = await getModeleFactureByCode('REMBOURSEMENT_CREDIT');
  if (!modele) {
    [modele] = await db.insert(modelesFactures).values({
      nom: "Reçu Remboursement Crédit",
      code: 'REMBOURSEMENT_CREDIT',
      description: "Reçu de remboursement de crédit",
      typeDocument: TypeDocument.RECEIPT,
      prefixeNumero: 'RMB-CRD',
      dernierNumero: 0,
      mentionsLegales: "Ce reçu atteste du remboursement effectué sur votre crédit.",
      afficherTva: false,
      isActive: true,
    }).returning();
  }
  
  const nextNum = await incrementModeleFactureNumero(modele.id);
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const numeroFacture = `${modele.prefixeNumero}-${dateStr}-${String(nextNum).padStart(4, '0')}`;
  
  const [facture] = await db.insert(factures).values({
    numero: numeroFacture,
    modeleId: modele.id,
    clientId: data.clientId,
    agentId: data.agentId,
    dateFacture: new Date(),
    sousTotal: data.montant,
    montantTva: "0",
    montantTotal: data.montant,
    montantPaye: data.montant,
    statut: StatutFacture.PAID,
    modePaiement: "CASH",
    operationCaisseId: data.operationCaisseId,
    notes: `Remboursement crédit N° ${data.numeroCredit}`,
  }).returning();

  await db.insert(lignesFactures).values({
    factureId: facture.id,
    description: `Remboursement - Crédit N° ${data.numeroCredit}`,
    quantite: 1,
    prixUnitaire: data.montant,
    montant: data.montant,
    typeOperation: "CREDIT_REPAYMENT",
    referenceId: data.creditId,
  });
  
  return facture;
}


/**
 * Create a receipt for tontine contribution
 */
export async function createFactureForContributionTontine(data: {
  tontineId: string;
  nomTontine: string;
  clientId: string;
  montant: string;
  tourNumero: number;
  agentId?: string;
  operationCaisseId?: string;
  sessionCaisseId?: string;
}): Promise<Facture> {
  let modele = await getModeleFactureByCode('CONTRIBUTION_TONTINE');
  if (!modele) {
    [modele] = await db.insert(modelesFactures).values({
      nom: "Reçu Contribution Tontine",
      code: 'CONTRIBUTION_TONTINE',
      description: "Reçu de contribution tontine",
      typeDocument: TypeDocument.RECEIPT,
      prefixeNumero: 'CTB-TON',
      dernierNumero: 0,
      mentionsLegales: "Ce reçu atteste de votre contribution à la tontine.",
      afficherTva: false,
      isActive: true,
    }).returning();
  }
  
  const nextNum = await incrementModeleFactureNumero(modele.id);
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const numeroFacture = `${modele.prefixeNumero}-${dateStr}-${String(nextNum).padStart(4, '0')}`;
  
  const [facture] = await db.insert(factures).values({
    numero: numeroFacture,
    modeleId: modele.id,
    clientId: data.clientId,
    agentId: data.agentId,
    dateFacture: new Date(),
    sousTotal: data.montant,
    montantTva: "0",
    montantTotal: data.montant,
    montantPaye: data.montant,
    statut: StatutFacture.PAID,
    modePaiement: "CASH",
    operationCaisseId: data.operationCaisseId,
    notes: `Contribution tontine "${data.nomTontine}" - Tour ${data.tourNumero}`,
  }).returning();

  await db.insert(lignesFactures).values({
    factureId: facture.id,
    description: `Contribution - Tontine "${data.nomTontine}" - Tour ${data.tourNumero}`,
    quantite: 1,
    prixUnitaire: data.montant,
    montant: data.montant,
    typeOperation: "TONTINE_CONTRIBUTION",
    referenceId: data.tontineId,
  });
  
  return facture;
}


/**
 * Provision the Safe (Coffre-Fort) from an external source (Bank, Capital, etc.)
 * Uses the new unified coffresForts table.
 */
export async function provisionCoffreWithLedger(data: {
    agenceId: string;
    montant: string;
    motif: string;
    description?: string;
    idempotencyKey?: string;
}, userId?: string): Promise<{ mouvement: MouvementFinancier }> {
    
    // 1. Find Agency Safe from coffresForts (new unified table)
    const [coffre] = await db.select().from(coffresForts).where(
        eq(coffresForts.ownerId, data.agenceId)
    );

    // Fallback to siege coffre if agency coffre not found
    let targetCoffre = coffre;
    if (!targetCoffre) {
        const [coffreSiege] = await db.select().from(coffresForts).where(
            eq(coffresForts.ownerType, "SIEGE")
        );
        targetCoffre = coffreSiege;
    }

    if (!targetCoffre) throw new Error("Aucun coffre-fort trouvé pour cette agence");

    // 2. Execute Ledger Transaction
    return executeWithLedger(
        "CAISSE", 
        {
            montant: data.montant,
            sens: "CREDIT", // Money IN
            agenceId: data.agenceId,
            typePaiement: "SAFE_SUPPLY",
            methodePaiement: "OTHER",
            metadata: {
                description: data.description || data.motif || "Approvisionnement Externe",
                motif: data.motif,
                type: "APPROVISIONNEMENT_EXTERNE",
                coffreId: targetCoffre.id,
                coffreCode: targetCoffre.code
            },
            idempotencyKey: data.idempotencyKey
        },
        async (tx, mouvement) => {
             // 3. Guard: verrouille le coffre + vérifie plafond entrant
             const { soldeBefore } = await assertCoffreCanCredit(
                 tx, targetCoffre.id, parseFloat(data.montant),
                 { userId: userId || "system", operationType: "APPROVISIONNEMENT_COFFRE" }
             );

             // 4. Mise à jour atomique du solde (row déjà verrouillée)
             const { solde: newSolde } = await updateCoffreBalance(tx, targetCoffre.id, parseFloat(data.montant));

             return {
                 result: true,
                 additionalEventData: {
                     nouveauSoldeCoffre: newSolde
                 }
             };
        },
        userId
    ).then(({ mouvement }) => {
        // Broadcast coffre balance update for real-time UI
        try {
            const montant = parseFloat(data.montant);
            const previousBalance = parseFloat(targetCoffre.solde || "0");
            balanceService.broadcastBalanceUpdate({
                entityType: 'coffre',
                entityId: targetCoffre.id,
                agenceId: data.agenceId,
                newBalance: previousBalance + montant,
                previousBalance,
                mouvementRef: mouvement.reference || mouvement.id,
                sourceModule: 'APPROVISIONNEMENT',
                typePaiement: 'SAFE_SUPPLY',
            });
        } catch (e) {
            logger.error({ err: e }, 'Error broadcasting coffre supply');
        }
        return { mouvement };
    });
}


/**
 * Execute a Credit Disbursement (Decaissement) via Ledger
 * Uses the new unified coffresForts table.
 */
export async function createDecaissementWithLedger(data: {
    creditId: string;
    compteId: string;
    montant: string;
    numeroCredit: string;
}, userId?: string): Promise<{ credit: Credit; mouvement: MouvementFinancier }> {
    
    // 1. Use Helper
    const [credit] = await db.select().from(credits).where(eq(credits.id, data.creditId));
    if (!credit) throw new Error("Crédit non trouvé");

    // 2. Find Agency Safe (coffresForts - new unified table)
    if (!credit.agenceId) throw new Error("Le crédit n'est lié à aucune agence");

    const [coffre] = await db.select().from(coffresForts).where(
        eq(coffresForts.ownerId, credit.agenceId)
    );

    // Fallback to siege coffre if agency coffre not found
    let targetCoffre = coffre;
    if (!targetCoffre) {
        const [coffreSiege] = await db.select().from(coffresForts).where(
            eq(coffresForts.ownerType, "SIEGE")
        );
        targetCoffre = coffreSiege;
    }

    if (!targetCoffre) throw new Error("Aucun coffre-fort trouvé pour cette agence");

    const montant = parseFloat(data.montant);
    const coffreId = targetCoffre.id;

    return executeWithLedger(
        "CREDIT",
        {
            montant: data.montant,
            sens: "DEBIT", // Money leaving the institution (to user account)
            clientId: credit.clientId,
            creditId: data.creditId,
            compteId: data.compteId, // Target Account
            methodePaiement: "TRANSFER", // Internal Transfer
            typePaiement: "CREDIT_DISBURSEMENT",
            agenceId: credit.agenceId, // Pass the agency ID for history filtering
            referenceExterne: data.numeroCredit,
            metadata: {
                description: `Décaissement crédit ${data.numeroCredit}`,
                coffreId,
                coffreCode: targetCoffre.code,
            }
        },
        async (tx, mouvement) => {
             // SYSCOHADA : la mise à disposition sur compte client ne déplace PAS de cash physique.
             // Le coffre n'est PAS débité — seul le compte client (4111) est crédité en GL.
             // Le cash ne sortira du coffre que lorsque le client retirera effectivement.
             // On log le coffreId pour traçabilité mais sans modifier son solde.
             logger.info({ coffreId, montant, creditId: data.creditId },
                 'Décaissement sur compte : mise à disposition sans mouvement de cash (coffre non débité)');

             // Mise à jour du compte Balance (Credit the user's account)
             const nouveauSoldeCompte = await updateCompteSolde(tx, data.compteId, parseFloat(data.montant));

             // Création de l'enregistrement de transaction (for account history)
             await tx.insert(transactionsCompte).values({
                 compteId: data.compteId,
                 mouvementId: mouvement.id,
                 typePaiement: "CREDIT_DISBURSEMENT",
                 sens: "CREDIT", // Loan disbursement is money coming in
                 montant: data.montant,
                 soldeApres: nouveauSoldeCompte,
                 methodePaiement: "TRANSFER",
                 observations: `Décaissement crédit ${data.numeroCredit}`,
             });

             return {
                 result: credit,
                 additionalEventData: {
                     nouveauSoldeCompte
                 }
             };
        },
        userId
    ).then(({ result, mouvement }) => {
        // Pas de broadcast coffre : la mise à disposition sur compte ne touche pas le coffre physique.
        // Le client pourra retirer plus tard (WITHDRAWAL_CURRENT : D 4111 / C 521).
        return { credit: result, mouvement };
    }).then(async (result) => {
        // Generate repayment schedule (echeancier) — obligatoire
        await generateCreditSchedule(data.creditId);
        return result;
    });
}


/**
 * Process a Cash Loan Disbursement by the Cashier
 * This is called when the cashier clicks "Pay" on a pending loan disbursement.
 *
 * Steps:
 * 1. Verify caisse session is open
 * 2. Verify sufficient balance in the coffre
 * 3. Verify credit is in WAITING_DISBURSEMENT status
 * 4. Debit the coffre (cash goes out)
 * 5. Update credit status to ACTIVE
 * 6. Generate repayment schedule (echeancier)
 *
 * @param data - Disbursement details
 * @param userId - The cashier performing the operation
 */
export async function processLoanCashPayout(data: {
    creditId: string;
    sessionCaisseId: string;
    paymentReference?: string; // Receipt number
}, userId: string): Promise<{
    credit: Credit;
    mouvement: MouvementFinancier;
    echeances?: any[];
}> {
    // 1. Validate credit exists and is in correct state
    const [credit] = await db.select().from(credits).where(eq(credits.id, data.creditId));
    if (!credit) {
        throw new Error("Crédit non trouvé");
    }

    if (credit.statut !== 'WAITING_DISBURSEMENT') {
        throw new Error(`Ce crédit n'est pas en attente de décaissement (statut actuel: ${credit.statut})`);
    }

    if (credit.disbursementChannel !== 'CASH') {
        throw new Error(`Ce crédit n'est pas configuré pour un décaissement en espèces (canal: ${credit.disbursementChannel})`);
    }

    if (credit.disbursementStatus !== 'PENDING') {
        throw new Error(`Le décaissement n'est pas en attente (statut: ${credit.disbursementStatus})`);
    }

    // 2. Validate caisse session
    const [session] = await db.select().from(sessionsCaisse).where(eq(sessionsCaisse.id, data.sessionCaisseId));
    if (!session) {
        throw new Error("Session de caisse non trouvée");
    }

    if (session.statut !== 'OPEN') {
        throw new Error("La session de caisse n'est pas ouverte");
    }

    // 3. Find the coffre for the agency
    if (!credit.agenceId) {
        throw new Error("Le crédit n'est lié à aucune agence");
    }

    const [coffre] = await db.select().from(coffresForts).where(
        eq(coffresForts.ownerId, credit.agenceId)
    );

    let targetCoffre = coffre;
    if (!targetCoffre) {
        const [coffreSiege] = await db.select().from(coffresForts).where(
            eq(coffresForts.ownerType, "SIEGE")
        );
        targetCoffre = coffreSiege;
    }

    if (!targetCoffre) {
        throw new Error("Aucun coffre-fort trouvé pour cette agence");
    }

    const montant = parseFloat(credit.montant);
    const coffreId = targetCoffre.id;

    // Get client info for the ledger entry (need to join with users for nom/prenom)
    const [clientWithUser] = await db.select({
        client: clients,
        user: { nom: users.nom, prenom: users.prenom }
    })
    .from(clients)
    .leftJoin(users, eq(clients.userId, users.id))
    .where(eq(clients.id, credit.clientId));

    // Execute the disbursement with ledger
    return executeWithLedger(
        "CAISSE",
        {
            montant: credit.montant,
            sens: "DEBIT", // Money leaving the caisse
            clientId: credit.clientId,
            creditId: data.creditId,
            sessionCaisseId: data.sessionCaisseId,
            methodePaiement: "CASH",
            typePaiement: "CREDIT_DISBURSEMENT",
            agenceId: credit.agenceId,
            referenceExterne: data.paymentReference || `LOAN-${credit.numeroCredit}`,
            metadata: {
                description: `Décaissement prêt ${credit.numeroCredit} - ${clientWithUser?.user?.nom || ''} ${clientWithUser?.user?.prenom || ''}`,
                coffreId, // Kept for reference but not operationally debited
                coffreCode: targetCoffre.code,
                channel: 'CASH'
            }
        },
        async (tx, mouvement) => {
            // GL-backed liquidity guard: verify funds via GL before proceeding
            // Note: updateSessionSolde also enforces zero-negative as a safety net
            const { liquidityGuard } = await import("../../services/liquidity-guard");
            await liquidityGuard.requireLiquidity("session", data.sessionCaisseId, montant, tx);

            // Debit the Session (and physical Caisse) atomically
            const newSessionSolde = await updateSessionSolde(tx, data.sessionCaisseId, -montant);

            // Create caisse operation record
            await tx.insert(operationsCaisse).values({
                sessionId: data.sessionCaisseId,
                typeOperation: 'CREDIT_DISBURSEMENT',
                montant: credit.montant,
                methodePaiement: 'CASH',
                clientId: credit.clientId,
                mouvementId: mouvement.id,
                reference: `LOAN-${credit.numeroCredit}-${Date.now()}`,
                description: `Décaissement prêt ${credit.numeroCredit}`,
            });

            // Update credit to ACTIVE
            const [updatedCredit] = await tx.update(credits)
                .set({
                    statut: 'ACTIVE' as StatutCreditDz,
                    disbursementStatus: 'COMPLETED' as DisbursementStatusDz,
                    paymentReference: data.paymentReference,
                    disbursedAt: new Date(),
                    disbursedBy: userId,
                    dateDebut: new Date(), // Start date is now (when cash is handed over)
                    updatedAt: new Date()
                })
                .where(eq(credits.id, data.creditId))
                .returning();

            return {
                result: updatedCredit,
                additionalEventData: {
                    nouveauSoldeSession: newSessionSolde
                }
            };
        },
        userId
    ).then(async ({ result, mouvement }) => {
        // Generate repayment schedule (echeancier) — obligatoire
        const echeances = await generateCreditSchedule(data.creditId);
        return {
            credit: result as Credit,
            mouvement,
            echeances
        };
    });
}


/**
 * Create a unified Cash Transaction with full ledger flow.
 * - Updates Account (if applicable)
 * - Updates Session
 * - Updates Caisse balance (real-time tracking)
 * - Creates Ledger Entry
 * - Creates Transaction Record (if applicable)
 * - Creates Operation Record
 *
 * IMPORTANT: Cette fonction est le point d'entrée principal pour toutes
 * les opérations de caisse client. Elle garantit:
 * - Double-entry bookkeeping (mouvementsFinanciers)
 * - Mise à jour atomique de tous les soldes
 * - Traçabilité complète
 */
export async function createCashTransactionWithLedger(data: {
  sessionId: string;
  typeOperation: string;
  montant: string;
  methodePaiement: string;
  clientId?: string;
  compteId?: string;
  description?: string;
  idempotencyKey?: string;
}, userId?: string): Promise<{
  operation: OperationCaisse;
  transaction?: TransactionCompte;
  mouvement: MouvementFinancier;
  soldes?: {
    sessionApres: string;
    compteApres?: string;
    caisseApres?: string;
  };
}> {
  // Import centralized config
  const {
    isIncomingOperation,
    isOutgoingOperation,
    getSensMouvement,
    getVersementOperation,
    getRetraitOperation
  } = await import("@shared/config/caisse-operations");

  const montantNum = parseFloat(data.montant);
  if (!Number.isFinite(montantNum) || montantNum <= 0) {
    throw new Error("Le montant doit être un nombre positif");
  }

  // Determine direction using centralized config
  const isIncoming = isIncomingOperation(data.typeOperation);
  const isOutgoing = isOutgoingOperation(data.typeOperation);

  let sens: SensMouvement;
  let cashDelta: number; // Impact on Cash Session (+ = entrée, - = sortie)
  let accountDelta: number = 0; // Impact on Client Account (+ = crédit, - = débit)

  if (isIncoming) {
    sens = "CREDIT"; // Argent entrant dans l'institution
    cashDelta = montantNum;
    accountDelta = montantNum; // Compte client crédité (sa créance augmente)
  } else if (isOutgoing) {
    sens = "DEBIT"; // Argent sortant de l'institution
    cashDelta = -montantNum;
    accountDelta = -montantNum; // Compte client débité (sa créance diminue)
  } else {
    // Opération neutre ou inconnue - erreur
    throw new Error(`Type d'opération non reconnu: ${data.typeOperation}. Utiliser un type valide (Versement, Retrait, etc.)`);
  }

  // Vérifier le compte si fourni
  let compte: any;
  if (data.compteId) {
    const [foundCompte] = await db.select().from(comptes).where(eq(comptes.id, data.compteId));
    if (!foundCompte) throw new Error(`Compte ${data.compteId} non trouvé`);

    // Validation du solde pour les retraits (pre-flight + updateCompteSolde enforces at write time)
    if (isOutgoing) {
      const soldeActuel = parseFloat(foundCompte.soldeCourant || "0");
      if (soldeActuel < montantNum) {
        throw new InsufficientFundsError("compte", data.compteId!, soldeActuel, montantNum);
      }

      // Vérifier si le compte n'est pas bloqué
      if (foundCompte.blocageActif) {
        throw new Error(`Compte bloqué. Motif: ${foundCompte.blocageMotif || "Non spécifié"}`);
      }
    }

    compte = foundCompte;
  }

  // Récupérer la session avec la caisse associée
  const [session] = await db
    .select({
      session: sessionsCaisse,
      caisse: caisses
    })
    .from(sessionsCaisse)
    .leftJoin(caisses, eq(sessionsCaisse.caisseId, caisses.id))
    .where(eq(sessionsCaisse.id, data.sessionId));

  if (!session?.session) throw new Error(`Session ${data.sessionId} non trouvée`);
  if (session.session.closedAt) throw new Error("La session de caisse est fermée");

  // Vérifier le solde de caisse pour les retraits (pre-flight + updateSessionSolde enforces at write time)
  if (isOutgoing && session.caisse) {
    const soldeCaisse = parseFloat(session.caisse.solde || "0");
    if (soldeCaisse < montantNum) {
      throw new InsufficientFundsError("caisse", session.caisse.id, soldeCaisse, montantNum);
    }
  }

  // Générer la référence unique
  const timestamp = Date.now().toString().slice(-8);
  const refRandom = randomInt(0, 1000).toString().padStart(3, "0");
  const opReference = `OP-${timestamp}-${refRandom}`;

  // Exécution atomique via le ledger
  return executeWithLedger(
    "CAISSE",
    {
      montant: data.montant,
      sens,
      clientId: data.clientId,
      compteId: data.compteId,
      sessionCaisseId: data.sessionId,
      agenceId: session.session.agenceId || undefined,
      methodePaiement: data.methodePaiement,
      typePaiement: data.typeOperation as TypePaiementTerrainDz,
      idempotencyKey: data.idempotencyKey,
      referenceExterne: opReference,
      metadata: {
        caisseId: session.session.caisseId,
        typeOperation: data.typeOperation,
        description: data.description,
      },
    },
    async (tx, mouvement) => {
      // 1. Mettre à jour le solde de la session (théorique) ET le solde caisse (syncCaisseBalance=true par défaut)
      // Note: updateSessionSolde met à jour automatiquement caisses.solde pour maintenir la cohérence
      const nouveauSoldeSession = await updateSessionSolde(tx, data.sessionId, cashDelta);
      // nouveauSoldeCaisse est maintenant synchronisé avec nouveauSoldeSession via updateSessionSolde

      // 2. Mettre à jour le compte client si applicable
      let nouveauSoldeCompte: string | undefined;
      let transaction: TransactionCompte | undefined;

      if (data.compteId && compte) {
        nouveauSoldeCompte = await updateCompteSolde(tx, data.compteId, accountDelta);

        // Déterminer le type de transaction selon le type de compte
        const transType = getTypePaiementForCompte(compte.typeCompte, accountDelta > 0);

        const validatedUserIdForTx = await validateUserId(tx, userId);

        // Créer l'enregistrement de transaction compte
        const [createdTx] = await tx.insert(transactionsCompte).values({
          compteId: data.compteId,
          mouvementId: mouvement.id,
          typePaiement: transType,
          sens: accountDelta > 0 ? "CREDIT" : "DEBIT",
          montant: data.montant,
          soldeApres: nouveauSoldeCompte,
          methodePaiement: data.methodePaiement as MethodePaiementDz,
          observations: data.description || `Opération Caisse: ${data.typeOperation}`,
          createdBy: validatedUserIdForTx,
        }).returning();
        transaction = createdTx;
      }

      // 4. Créer l'opération de caisse
      const validatedUserIdForOp = await validateUserId(tx, userId);

      const [operation] = await tx.insert(operationsCaisse).values({
        sessionId: data.sessionId,
        mouvementId: mouvement.id,
        typeOperation: data.typeOperation as TypeOperationCaisseDz,
        montant: data.montant,
        methodePaiement: data.methodePaiement as MethodePaiementDz,
        reference: opReference,
        description: data.description,
        clientId: data.clientId,
        createdBy: validatedUserIdForOp,
        idempotencyKey: data.idempotencyKey,
        statut: "POSTED",
      }).returning();

      return {
        result: {
          operation,
          transaction,
          soldes: {
            sessionApres: nouveauSoldeSession,
            compteApres: nouveauSoldeCompte,
            // caisseApres est maintenant synchronisé avec sessionApres via updateSessionSolde
            caisseApres: nouveauSoldeSession,
          },
        },
        additionalEventData: {
          nouveauSoldeSession,
          nouveauSoldeCompte,
        },
      };
    },
    userId
  ).then(({ result, mouvement }) => ({
    operation: result.operation,
    transaction: result.transaction,
    mouvement,
    soldes: result.soldes,
  }));
}


/**
 * Validate a transfer with full ledger dual-entry (Debit Source / Credit Dest)
 */
export async function validateTransfertWithLedger(
  transfertId: string, 
  sessionDestId: string, 
  userId: string
): Promise<CaisseTransfert> {
  return await db.transaction(async (tx) => {
    // 1. Get Transfer
    const [transfert] = await tx.select().from(caisseTransferts).where(eq(caisseTransferts.id, transfertId));
    if (!transfert) throw new Error("Transfert non trouvé");
    if (transfert.statut !== 'PENDING') throw new Error("Transfert déjà traité");

    // 2. Get Sessions
    const [sessionSource] = await tx.select().from(sessionsCaisse).where(eq(sessionsCaisse.id, transfert.sessionSourceId));
    const [sessionDest] = await tx.select().from(sessionsCaisse).where(eq(sessionsCaisse.id, sessionDestId));

    if (!sessionSource) throw new Error("Session source introuvable (archivée ou supprimée?)");
    if (!sessionDest) throw new Error("Session destination introuvable");
    if (sessionDest.closedAt) throw new Error("La session de destination doit être ouverte");

    // Vérification des fonds suffisants (pre-flight; updateSessionSolde also enforces at write time)
    const currentSolde = Number(sessionSource.montantFermetureTheorique || sessionSource.montantOuverture || 0);
    const amount = Number(transfert.montant);

    if (currentSolde < amount) {
        throw new InsufficientFundsError("session", sessionSource.id, currentSolde, amount);
    }

    // 3. Process SOURCE (DEBIT / OUT)
    const refSource = `TRF-OUT-${transfert.reference}`;
    const mouvementSource = await createMouvementFinancier(tx, {
      montant: transfert.montant,
      sens: "DEBIT",
      sourceModule: "TRANSFERT",
      sessionCaisseId: sessionSource.id,
      agenceId: sessionSource.agenceId || undefined,
      typePaiement: "TRANSFER_OUT",
      referenceExterne: refSource,
      methodePaiement: "TRANSFER",
      metadata: {
        description: `Transfert vers ${sessionDest.caisseId} (Ref: ${transfert.reference})`
      }
    }, userId);

    const soldeSource = await updateSessionSolde(tx, sessionSource.id, -parseFloat(transfert.montant));

    await tx.insert(operationsCaisse).values({
      sessionId: sessionSource.id,
      mouvementId: mouvementSource.id,
      typeOperation: "CASH_TRANSFER",
      montant: transfert.montant,
      methodePaiement: "TRANSFER",
      reference: refSource,
      description: `Transfert émis vers ${sessionDest.caisseId}`,
      createdBy: userId
    });

    await createMouvementEvents(tx, mouvementSource, {
      nouveauSoldeSession: soldeSource
    });

    // GL posting for source mouvement
    if (sessionSource.agenceId) {
      try {
        await postGlForMouvement(tx, mouvementSource, sessionSource.agenceId, userId, {
          transfertId: transfert.id,
          direction: "OUT",
        });
      } catch (error) {
        if (error instanceof AccountingRuleNotFoundError) {
          logger.warn({ mouvementId: mouvementSource.id, error: error.message }, "No GL rule for transfer OUT");
        } else {
          throw error;
        }
      }
    }

    // 4. Process DEST (CREDIT / IN)
    const refDest = `TRF-IN-${transfert.reference}`;
    const mouvementDest = await createMouvementFinancier(tx, {
      montant: transfert.montant,
      sens: "CREDIT",
      sourceModule: "TRANSFERT",
      sessionCaisseId: sessionDest.id,
      agenceId: sessionDest.agenceId || undefined,
      typePaiement: "TRANSFER_IN",
      referenceExterne: refDest,
      methodePaiement: "TRANSFER",
      metadata: {
        description: `Réception transfert de ${sessionSource.caisseId} (Ref: ${transfert.reference})`
      }
    }, userId);

    const soldeDest = await updateSessionSolde(tx, sessionDest.id, parseFloat(transfert.montant));

    await tx.insert(operationsCaisse).values({
      sessionId: sessionDest.id,
      mouvementId: mouvementDest.id,
      typeOperation: "CASH_TRANSFER",
      montant: transfert.montant,
      methodePaiement: "TRANSFER",
      reference: refDest,
      description: `Transfert reçu de ${sessionSource.caisseId}`,
      createdBy: userId
    });

    await createMouvementEvents(tx, mouvementDest, {
       nouveauSoldeSession: soldeDest
    });

    // GL posting for dest mouvement
    if (sessionDest.agenceId) {
      try {
        await postGlForMouvement(tx, mouvementDest, sessionDest.agenceId, userId, {
          transfertId: transfert.id,
          direction: "IN",
        });
      } catch (error) {
        if (error instanceof AccountingRuleNotFoundError) {
          logger.warn({ mouvementId: mouvementDest.id, error: error.message }, "No GL rule for transfer IN");
        } else {
          throw error;
        }
      }
    }

    // 5. Update Transfer Status
    const [updatedTransfert] = await tx.update(caisseTransferts)
      .set({
        statut: 'VALIDATED',
        sessionDestId: sessionDest.id,
        dateValidation: new Date(),
        validatedBy: userId
      })
      .where(eq(caisseTransferts.id, transfertId))
      .returning();

    return updatedTransfert;
  });
}


/**
 * Create a receipt for initial deposit during account opening
 */
export async function createFactureForDepotInitial(data: {
  compteId: string;
  numeroCompte: string;
  clientId: string;
  montant: string;
  typeCompte: string;
  modePaiement: string;
  transactionId?: string;
  agentId?: string;
}): Promise<Facture> {
  let modele = await getModeleFactureByCode('DEPOT_INITIAL');
  
  if (!modele) {
    [modele] = await db.insert(modelesFactures).values({
      nom: "Reçu Dépôt Initial - Ouverture de Compte",
      code: 'DEPOT_INITIAL',
      description: "Reçu de dépôt initial lors de l'ouverture de compte",
      typeDocument: TypeDocument.RECEIPT,
      prefixeNumero: 'DI',
      dernierNumero: 0,
      mentionsLegales: "Ce reçu atteste du dépôt initial effectué lors de l'ouverture de votre compte.",
      afficherTva: false,
      isActive: true,
    }).returning();
  }
  
  const nextNum = await incrementModeleFactureNumero(modele.id);
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const numeroFacture = `${modele.prefixeNumero}-${dateStr}-${String(nextNum).padStart(4, '0')}`;
  
  const [facture] = await db.insert(factures).values({
    numero: numeroFacture,
    modeleId: modele.id,
    clientId: data.clientId,
    agentId: data.agentId,
    dateFacture: new Date(),
    sousTotal: data.montant,
    montantTva: "0",
    montantTotal: data.montant,
    montantPaye: data.montant,
    statut: StatutFacture.PAID,
    modePaiement: data.modePaiement,
    notes: `Dépôt initial - Ouverture compte ${data.typeCompte} N° ${data.numeroCompte}`,
  }).returning();
  
  await db.insert(lignesFactures).values({
    factureId: facture.id,
    description: `Dépôt Initial - Compte ${data.typeCompte} N° ${data.numeroCompte}`,
    quantite: 1,
    prixUnitaire: data.montant,
    montant: data.montant,
    typeOperation: "INITIAL_DEPOSIT",
    referenceId: data.compteId,
  });
  
  // Link facture to transaction
  if (data.transactionId) {
    await db.update(transactionsCompte)
      .set({ factureId: facture.id })
      .where(eq(transactionsCompte.id, data.transactionId));
  }
  
  return facture;
}