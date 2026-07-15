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
 * Création de compte avec dépôt initial (workflow complet).
 * Extrait pour respecter la limite de 400 lignes (code déplacé verbatim).
 */
/**
 * Create a new account with status driven by product config snapshot.
 *
 * Status is determined by recomputeAccountStatus() based on:
 * - openingFee > 0 → need payment
 * - initialDepositRequired && minInitialDeposit > 0 → need deposit
 * - requiresApproval → need maker-checker approval
 *
 * Supports partial payments (fee allocated first, then deposit).
 * Transfer payments are processed atomically at creation.
 * Cash/Mobile Money: account created in pending status, cashier collects later.
 */
export async function createCompteWithInitialDeposit(
  data: {
    clientId: string;
    typeCompte: TypeCompte;
    agenceId: string;
    produitId?: string;
    montantInitial: number;
    modePaiement: 'CASH' | 'TRANSFER' | 'MOBILE_MONEY';
    compteSourceId?: string; // Required for Transfer
    operateurMobile?: string; // MTN | AIRTEL
    telephoneMobileMoney?: string;
    referenceTransaction?: string;
    blocageActif?: boolean;
    blocageMotif?: MotifBlocage;
    blocageReference?: string;
    blocageFin?: string; // ISO date string
  },
  userId: string
): Promise<{ compte: Compte; transaction?: TransactionCompte; facture?: Facture; openingRequest?: any }> {

  return await db.transaction(async (tx) => {
    // 0. Read product config and build immutable snapshot
    let snapshot: OpeningSnapshot = {
      openingFee: 0,
      minInitialDeposit: 0,
      initialDepositRequired: false,
      requiresApproval: false,
      maintenanceFee: 0,
      closingFee: 0,
      produitCode: '',
      produitNom: '',
    };

    if (data.produitId) {
      const [produit] = await tx
        .select({
          code: produitsCompte.code,
          nom: produitsCompte.nom,
          frais: produitsCompte.frais,
          regles: produitsCompte.regles,
        })
        .from(produitsCompte)
        .where(eq(produitsCompte.id, data.produitId));

      if (produit) {
        snapshot.produitCode = produit.code;
        snapshot.produitNom = produit.nom;

        if (produit.frais && typeof produit.frais === "object") {
          const fraisObj = produit.frais as Record<string, unknown>;
          snapshot.openingFee = Number(fraisObj.ouverture) || 0;
          snapshot.maintenanceFee = Number(fraisObj.tenue) || 0;
          snapshot.closingFee = Number(fraisObj.cloture) || 0;
        }
        if (produit.regles && typeof produit.regles === "object") {
          const reglesObj = produit.regles as Record<string, unknown>;
          snapshot.initialDepositRequired = Boolean(reglesObj.depotInitialObligatoire);
          snapshot.minInitialDeposit = Number(reglesObj.depotInitialMinimum) || 0;
          snapshot.requiresApproval = Boolean(reglesObj.validationOuvertureRequise);
        }
      }
    }

    // 1. Allocate initial payment (if any) — fee first, then deposit
    //    ONLY for TRANSFER (atomic debit from source account).
    //    CASH/MOBILE_MONEY: payment collected later (caisse or pawaPay webhook).
    let paidOpeningFee = 0;
    let paidInitialDeposit = 0;

    if (data.modePaiement === 'TRANSFER' && data.montantInitial > 0) {
      const alloc = allocateOpeningPayment(data.montantInitial, snapshot, 0, 0);
      paidOpeningFee = alloc.feePayment;
      paidInitialDeposit = alloc.depositPayment;
    }

    // 2. Compute initial status
    const statut = recomputeAccountStatus({
      openingSnapshot: snapshot,
      paidOpeningFee: paidOpeningFee.toString(),
      paidInitialDeposit: paidInitialDeposit.toString(),
      isApproved: false, // Never approved at creation
    });

    // 3. Generate Account Number
    const numeroCompte = await generateNumeroCompte(data.typeCompte);

    // 4. Create Account with snapshot
    const [compte] = await tx.insert(comptes).values({
      clientId: data.clientId,
      agenceId: data.agenceId,
      typeCompte: data.typeCompte,
      produitId: data.produitId,
      numeroCompte,
      statut: statut,
      soldeCourant: '0',
      openingSnapshot: snapshot,
      paidOpeningFee: paidOpeningFee.toString(),
      paidInitialDeposit: paidInitialDeposit.toString(),
      isApproved: false,
      blocageActif: data.blocageActif || data.typeCompte === TypeCompteEnum.BLOCKED,
      blocageMotif: data.blocageMotif,
      blocageReference: data.blocageReference,
      blocageDebut: (data.blocageActif || data.typeCompte === TypeCompteEnum.BLOCKED) ? new Date() : null,
      blocageFin: data.blocageFin ? new Date(data.blocageFin) : null,
      createdBy: userId,
    } as any).returning();

    // 5. Agency History
    await tx.insert(compteAgencesHistorique).values({
      compteId: compte.id,
      agenceId: data.agenceId,
      dateDebut: new Date(),
      motif: "Création du compte",
      transferePar: userId,
    });

    // 6. If approval required, create opening request
    if (snapshot.requiresApproval) {
      const [openingRequest] = await tx.insert(accountOpeningRequests).values({
        compteId: compte.id,
        initiatedBy: userId,
        openingFeeAmount: snapshot.openingFee.toString(),
        initialDepositAmount: data.montantInitial.toString(),
        produitId: data.produitId || null,
      }).returning();

      // Outbox event for real-time updates (Validations Center)
      await tx.insert(evenementsOutbox).values({
        type: "MOUVEMENT_STATUT_CHANGE",
        aggregateType: "compte",
        aggregateId: compte.id,
        payload: {
          compteId: compte.id,
          action: "OPENING_REQUESTED",
          requestId: openingRequest.id,
          initiatedBy: userId,
        },
      });

      // If no payment needed, return early (approval-only flow)
      if (data.montantInitial <= 0) {
        return { compte, openingRequest };
      }
    }

    // 7. Handle Transfer Payment (process atomically)
    if (data.modePaiement === 'TRANSFER' && data.montantInitial > 0) {
      if (!data.compteSourceId) throw new Error('Compte source requis pour virement');

      // A. Verify Source Account
      const [compteSource] = await tx.select()
        .from(comptes)
        .where(eq(comptes.id, data.compteSourceId));

      if (!compteSource) throw new Error('Compte source introuvable');

      const soldeSource = parseFloat(compteSource.soldeCourant);
      if (soldeSource < data.montantInitial) {
        throw new Error(`Solde insuffisant. Disponible: ${soldeSource}, Requis: ${data.montantInitial}`);
      }

      // B. Debit source account by full amount
      await tx.update(comptes)
        .set({
          soldeCourant: (soldeSource - data.montantInitial).toString(),
          updatedAt: new Date(),
        })
        .where(eq(comptes.id, data.compteSourceId));

      // C. Opening fee mouvement + GL (if fee portion > 0)
      if (paidOpeningFee > 0) {
        const feeRef = generateReference("FRAIS");
        const [feeMouvement] = await tx.insert(mouvementsFinanciers).values({
          reference: feeRef,
          sourceModule: "COMPTE",
          sens: "CREDIT",
          montant: paidOpeningFee.toString(),
          dateOperation: new Date(),
          clientId: data.clientId,
          compteId: compte.id,
          agenceId: data.agenceId,
          methodePaiement: "TRANSFER",
          typePaiement: "OPENING_FEE",
          createdBy: userId,
          statut: "POSTED",
          requiresGlPosting: true,
          glPostingStatus: "PENDING",
          metadata: { description: "Frais d'ouverture de compte (virement)", sourceCompte: compteSource.numeroCompte },
        } as any).returning();

        // Fee transaction on source account
        await tx.insert(transactionsCompte).values({
          compteId: data.compteSourceId,
          mouvementId: feeMouvement.id,
          typePaiement: "OPENING_FEE",
          sens: "DEBIT",
          montant: paidOpeningFee.toString(),
          soldeApres: (soldeSource - paidOpeningFee).toString(),
          methodePaiement: "TRANSFER",
          observations: `Frais d'ouverture — ${paidOpeningFee.toLocaleString()} F (virement)`,
          createdBy: userId,
        } as any);

        // GL posting
        try {
          await postGlForMouvement(tx, feeMouvement, data.agenceId, userId);
          await tx.update(mouvementsFinanciers)
            .set({ glPostingStatus: "POSTED" })
            .where(eq(mouvementsFinanciers.id, feeMouvement.id));
        } catch (err) {
          console.error("[OPENING] GL posting failed for transfer opening fee:", err);
          await tx.update(mouvementsFinanciers)
            .set({ glPostingStatus: "FAILED" })
            .where(eq(mouvementsFinanciers.id, feeMouvement.id));
        }
      }

      // D. Deposit mouvement (deposit portion only)
      if (paidInitialDeposit > 0) {
        const depositRef = generateReference("EPARGNE");
        const [depositMouvement] = await tx.insert(mouvementsFinanciers).values({
          reference: depositRef,
          dateOperation: new Date(),
          montant: paidInitialDeposit.toString(),
          sens: 'CREDIT',
          statut: 'POSTED',
          methodePaiement: 'TRANSFER',
          sourceModule: 'COMPTE',
          compteId: compte.id,
          clientId: data.clientId,
          agenceId: data.agenceId,
          typePaiement: "INITIAL_DEPOSIT",
          createdBy: userId,
          requiresGlPosting: true,
          glPostingStatus: "PENDING",
          metadata: { description: `Virement ouverture depuis ${compteSource.numeroCompte}` },
        } as any).returning();

        // GL for deposit
        try {
          await postGlForMouvement(tx, depositMouvement, data.agenceId, userId, {
            compteSourceNumero: compteSource.numeroCompte,
            compteDestNumero: compte.numeroCompte,
            description: `Virement ouverture depuis ${compteSource.numeroCompte}`,
          });
          await tx.update(mouvementsFinanciers)
            .set({ glPostingStatus: "POSTED" })
            .where(eq(mouvementsFinanciers.id, depositMouvement.id));
        } catch (err) {
          console.error("[OPENING] GL posting failed for transfer initial deposit:", err);
          await tx.update(mouvementsFinanciers)
            .set({ glPostingStatus: "FAILED" })
            .where(eq(mouvementsFinanciers.id, depositMouvement.id));
        }

        // E. Transaction on source account (debit deposit portion)
        await tx.insert(transactionsCompte).values({
          compteId: data.compteSourceId,
          mouvementId: depositMouvement.id,
          typePaiement: 'INTERNAL_TRANSFER',
          sens: 'DEBIT',
          montant: paidInitialDeposit.toString(),
          soldeApres: (soldeSource - data.montantInitial).toString(),
          methodePaiement: 'TRANSFER',
          observations: `Virement vers nouveau compte ${compte.numeroCompte}`,
          createdBy: userId,
        } as any);

        // F. Transaction on new account (credit deposit portion)
        const [transaction] = await tx.insert(transactionsCompte).values({
          compteId: compte.id,
          mouvementId: depositMouvement.id,
          typePaiement: 'INITIAL_DEPOSIT',
          sens: 'CREDIT',
          montant: paidInitialDeposit.toString(),
          soldeApres: paidInitialDeposit.toString(),
          methodePaiement: 'TRANSFER',
          observations: paidOpeningFee > 0
            ? `Dépôt initial (après frais ${paidOpeningFee.toLocaleString()} F)`
            : 'Dépôt initial - Ouverture de compte',
          createdBy: userId,
        } as any).returning();

        // G. Update new account balance (deposit portion only)
        await tx.update(comptes)
          .set({
            soldeCourant: paidInitialDeposit.toString(),
            updatedAt: new Date(),
          })
          .where(eq(comptes.id, compte.id));

        // H. Generate Receipt
        const facture = await createFactureForDepotInitial({
          compteId: compte.id,
          numeroCompte: compte.numeroCompte,
          clientId: data.clientId,
          montant: data.montantInitial.toString(),
          typeCompte: data.typeCompte,
          modePaiement: 'TRANSFER',
          transactionId: transaction.id,
          agentId: userId,
        });

        const [updatedCompte] = await tx.select().from(comptes).where(eq(comptes.id, compte.id));
        return { compte: updatedCompte!, transaction, facture };
      }
    }

    // 8. Cash/Mobile Money — no transaction yet, cashier collects later
    return { compte };
  });
}
