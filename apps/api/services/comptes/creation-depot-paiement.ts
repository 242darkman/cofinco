import {
  deriveSensFromType
} from "@shared/config/transaction-labels";
import {
  accountOpeningRequests,
  clients,
  compteAgencesHistorique,
  comptes,
  evenementsOutbox,
  mouvementsFinanciers,
  operationsCaisse,
  produitsCompte,
  transactionsCompte,
  type Compte,
  type Facture,
  type TransactionCompte
} from "@shared/schema";
import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import {
  createFactureForDepotInitial
} from "../../storage/finance";
import { postGlForMouvement } from "../accounting-posting-service";
import {
  generateReference,
  updateSessionSolde
} from "../ledger";

// Import standardized status constants
import {
  getTypePaiementForCompte,
  StatutCompte as StatutCompteConst,
  TypeCompte as TypeCompteEnum
} from "@shared/enum/status-constants";
import { allocateOpeningPayment, clientHasCompteOfType, generateNumeroCompte, recomputeAccountStatus } from "./helpers";
import { CompteError, MotifBlocage, TypeCompte, type CreateCompteData, type OpeningSnapshot } from "./types";

/**
 * Paiement du dépôt initial d’un compte en attente.
 * Extrait pour respecter la limite de 400 lignes (code déplacé verbatim).
 */
/**
 * Process opening payment for a pending account (supports partial/cumulative payments).
 * Uses the immutable openingSnapshot from the account, NOT the current product config.
 * Fee is allocated first, then remainder goes to initial deposit.
 * After payment, recomputeAccountStatus() determines the new status.
 */
export async function payerDepotInitialCompte(
  compteId: string,
  data: {
    montant: number;
    sessionCaisseId?: string;
    userId: string;
    methodePaiement?: 'CASH' | 'MOBILE_MONEY' | 'TRANSFER';
    operateurMobile?: string; // MTN | AIRTEL
    compteSourceId?: string; // Required for TRANSFER
  }
): Promise<{ compte: Compte; transaction: TransactionCompte; facture: Facture; remainingOpeningFee: number; remainingDeposit: number }> {

  const result = await db.transaction(async (tx) => {
    // 1. Verify Account
    const [compte] = await tx.select()
      .from(comptes)
      .where(eq(comptes.id, compteId));

    if (!compte) {
      throw new Error("Compte introuvable");
    }

    const pendingStatuses = [
      StatutCompteConst.PENDING_PAYMENT,
      StatutCompteConst.PENDING_PAYMENT_AND_APPROVAL,
      StatutCompteConst.PENDING_ACTIVATION, // Legacy support
    ];
    if (!(pendingStatuses as readonly string[]).includes(compte.statut)) {
      throw new Error("Ce compte n'est pas en attente de paiement");
    }

    if (data.montant <= 0) {
      throw new Error("Le montant doit être supérieur à 0");
    }

    const paymentMethod = data.methodePaiement || "CASH";

    // Validate payment method requirements
    if (paymentMethod === 'TRANSFER') {
      if (!data.compteSourceId) throw new Error("Compte source requis pour un virement");
    } else if ((paymentMethod as string) !== 'TRANSFER' && !data.sessionCaisseId) {
      throw new Error("Session de caisse requise pour ce mode de paiement");
    }

    // 2. Read opening snapshot from account (immutable — NOT from product)
    const snapshot = (compte as any).openingSnapshot as OpeningSnapshot | null;
    const currentPaidFee = parseFloat((compte as any).paidOpeningFee || "0");
    const currentPaidDeposit = parseFloat((compte as any).paidInitialDeposit || "0");
    const currentSolde = parseFloat(compte.soldeCourant || "0");

    // Allocate payment: fee first, then deposit
    let feePayment = 0;
    let depositPayment = data.montant;

    if (snapshot) {
      const alloc = allocateOpeningPayment(data.montant, snapshot, currentPaidFee, currentPaidDeposit);
      feePayment = alloc.feePayment;
      depositPayment = alloc.depositPayment;
    }

    // 2b. If TRANSFER, debit the source account atomically
    if (paymentMethod === 'TRANSFER') {
      const [compteSource] = await tx.select().from(comptes).where(eq(comptes.id, data.compteSourceId!));
      if (!compteSource) throw new Error("Compte source introuvable");

      const soldeSource = parseFloat(compteSource.soldeCourant);
      if (soldeSource < data.montant) {
        throw new Error(`Solde insuffisant sur le compte source. Disponible: ${soldeSource.toLocaleString()} F, Requis: ${data.montant.toLocaleString()} F`);
      }

      await tx.update(comptes)
        .set({
          soldeCourant: (soldeSource - data.montant).toString(),
          updatedAt: new Date(),
        })
        .where(eq(comptes.id, data.compteSourceId!));
    }

    // 3. Create OPENING_FEE mouvement + GL posting (if fee portion > 0)
    let feeMouvementId: string | undefined;
    let depositMouvementId: string | undefined;

    if (feePayment > 0) {
      const feeReference = generateReference("FRAIS");

      const [feeMouvement] = await tx.insert(mouvementsFinanciers).values({
        reference: feeReference,
        sourceModule: "COMPTE",
        sens: "CREDIT",
        montant: feePayment.toString(),
        dateOperation: new Date(),
        clientId: compte.clientId,
        compteId: compte.id,
        agenceId: compte.agenceId,
        sessionCaisseId: data.sessionCaisseId || null,
        methodePaiement: paymentMethod,
        typePaiement: "OPENING_FEE",
        createdBy: data.userId,
        statut: "POSTED",
        requiresGlPosting: true,
        glPostingStatus: "PENDING",
        metadata: {
          description: "Frais d'ouverture de compte",
          ...(data.operateurMobile ? { provider: data.operateurMobile } : {}),
        },
      } as any).returning();

      feeMouvementId = feeMouvement.id;

      // Fee transaction record (not on account balance — goes to revenue)
      await tx.insert(transactionsCompte).values({
        compteId: compte.id,
        mouvementId: feeMouvement.id,
        typePaiement: "OPENING_FEE",
        sens: "DEBIT",
        montant: feePayment.toString(),
        soldeApres: currentSolde.toString(),
        statut: "POSTED",
        methodePaiement: paymentMethod,
        observations: `Frais d'ouverture — ${feePayment.toLocaleString()} F`,
        createdBy: data.userId,
      } as any);

      // GL posting for fee
      try {
        await postGlForMouvement(tx, feeMouvement, compte.agenceId!, data.userId,
          data.operateurMobile ? { provider: data.operateurMobile } : undefined
        );
        await tx.update(mouvementsFinanciers)
          .set({ glPostingStatus: "POSTED" })
          .where(eq(mouvementsFinanciers.id, feeMouvement.id));
      } catch (err) {
        console.error("[OPENING] GL posting failed for opening fee:", err);
        await tx.update(mouvementsFinanciers)
          .set({ glPostingStatus: "FAILED" })
          .where(eq(mouvementsFinanciers.id, feeMouvement.id));
      }
    }

    // 4. Create INITIAL_DEPOSIT mouvement for the deposit portion
    let transaction: TransactionCompte;
    const newSolde = currentSolde + depositPayment;

    if (depositPayment > 0) {
      const depositRef = generateReference("EPARGNE");
      const [depositMouvement] = await tx.insert(mouvementsFinanciers).values({
        reference: depositRef,
        sourceModule: "COMPTE",
        sens: "CREDIT",
        montant: depositPayment.toString(),
        dateOperation: new Date(),
        clientId: compte.clientId,
        compteId: compte.id,
        agenceId: compte.agenceId,
        sessionCaisseId: data.sessionCaisseId || null,
        methodePaiement: paymentMethod,
        typePaiement: "INITIAL_DEPOSIT",
        createdBy: data.userId,
        statut: "POSTED",
        requiresGlPosting: true,
        glPostingStatus: "PENDING",
        metadata: {
          description: "Dépôt initial - Ouverture compte",
          ...(data.operateurMobile ? { provider: data.operateurMobile } : {}),
        },
      } as any).returning();

      depositMouvementId = depositMouvement.id;

      // Deposit transaction record
      [transaction] = await tx.insert(transactionsCompte).values({
        compteId: compte.id,
        mouvementId: depositMouvement.id,
        typePaiement: "INITIAL_DEPOSIT",
        sens: "CREDIT",
        montant: depositPayment.toString(),
        soldeApres: newSolde.toString(),
        methodePaiement: paymentMethod,
        observations: "Dépôt initial - Ouverture de compte",
        createdBy: data.userId,
      } as any).returning();

      // GL posting for deposit
      try {
        await postGlForMouvement(tx, depositMouvement, compte.agenceId!, data.userId,
          data.operateurMobile ? { provider: data.operateurMobile } : undefined
        );
        await tx.update(mouvementsFinanciers)
          .set({ glPostingStatus: "POSTED" })
          .where(eq(mouvementsFinanciers.id, depositMouvement.id));
      } catch (err) {
        console.error("[OPENING] GL posting failed for initial deposit:", err);
        await tx.update(mouvementsFinanciers)
          .set({ glPostingStatus: "FAILED" })
          .where(eq(mouvementsFinanciers.id, depositMouvement.id));
      }
    } else {
      // Fee-only payment (no deposit portion) — still need a transaction record
      const feeOnlyRef = generateReference("FRAIS");
      [transaction] = await tx.insert(transactionsCompte).values({
        compteId: compte.id,
        typePaiement: "OPENING_FEE",
        sens: "DEBIT",
        montant: feePayment.toString(),
        soldeApres: currentSolde.toString(),
        methodePaiement: paymentMethod,
        observations: `Paiement frais d'ouverture — ${feePayment.toLocaleString()} F`,
        createdBy: data.userId,
      } as any).returning();
    }

    // 5. Update cumulative totals + recompute status
    const newPaidFee = currentPaidFee + feePayment;
    const newPaidDeposit = currentPaidDeposit + depositPayment;

    const newStatus = recomputeAccountStatus({
      openingSnapshot: snapshot,
      paidOpeningFee: newPaidFee.toString(),
      paidInitialDeposit: newPaidDeposit.toString(),
      isApproved: (compte as any).isApproved || false,
    });

    const [updatedCompte] = await tx.update(comptes)
      .set({
        statut: newStatus,
        soldeCourant: newSolde.toString(),
        paidOpeningFee: newPaidFee.toString(),
        paidInitialDeposit: newPaidDeposit.toString(),
        updatedAt: new Date(),
      } as any)
      .where(eq(comptes.id, compteId))
      .returning();

    // 6. Update Session Balance + Create Operation Caisse (only for physical money)
    if (paymentMethod !== 'TRANSFER' && data.sessionCaisseId) {
      await updateSessionSolde(tx, data.sessionCaisseId, data.montant);

      const caisseOpMouvementId = depositMouvementId || feeMouvementId || null;
      await tx.insert(operationsCaisse).values({
        sessionId: data.sessionCaisseId,
        mouvementId: caisseOpMouvementId,
        typeOperation: "INITIAL_DEPOSIT",
        montant: data.montant.toString(),
        methodePaiement: paymentMethod,
        reference: `DEP-INIT-${compte.numeroCompte}`,
        description: feePayment > 0
          ? `Ouverture compte ${compte.numeroCompte} (frais: ${feePayment.toLocaleString()} F + dépôt: ${depositPayment.toLocaleString()} F)`
          : `Dépôt initial - Compte ${compte.numeroCompte}`,
        clientId: compte.clientId,
        createdBy: data.userId
      });
    }

    // Compute remaining amounts
    const remainingFee = snapshot ? Math.max(0, snapshot.openingFee - newPaidFee) : 0;
    const remainingDeposit = snapshot && snapshot.initialDepositRequired
      ? Math.max(0, snapshot.minInitialDeposit - newPaidDeposit)
      : 0;

    return { compte: updatedCompte, transaction, remainingOpeningFee: remainingFee, remainingDeposit };
  });

  // 8. Generate Receipt
  const facture = await createFactureForDepotInitial({
    compteId: result.compte.id,
    numeroCompte: result.compte.numeroCompte,
    clientId: result.compte.clientId,
    montant: data.montant.toString(),
    typeCompte: result.compte.typeCompte,
    modePaiement: data.methodePaiement || 'CASH',
    transactionId: result.transaction.id,
    agentId: data.userId,
  });

  return { ...result, facture };
}
