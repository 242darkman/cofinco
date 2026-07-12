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
 * Crée un nouveau compte avec validation des règles métier
 */
export async function createCompte(
  data: CreateCompteData,
  userId?: string
): Promise<typeof comptes.$inferSelect> {
  // 1. Vérifier que le client n'a pas déjà ce type de compte
  const hasExisting = await clientHasCompteOfType(data.clientId, data.typeCompte);
  if (hasExisting) {
    throw new CompteError(
      `Le client possède déjà un compte ${data.typeCompte}`,
      "DUPLICATE_ACCOUNT_TYPE"
    );
  }

  // 2. Vérifier que le client existe
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, data.clientId));
  if (!client) {
    throw new CompteError("Client non trouvé", "CLIENT_NOT_FOUND");
  }

  // 3. Créer le compte dans une transaction
  return await db.transaction(async (tx) => {
    const numeroCompte = generateNumeroCompte(data.typeCompte);

    // Create account with standardized EN status
    const [compte] = await tx
      .insert(comptes)
      .values({
        clientId: data.clientId,
        agenceId: data.agenceId,
        produitId: data.produitId,
        numeroCompte,
        typeCompte: data.typeCompte,
        statut: StatutCompteConst.ACTIVE,
        soldeCourant: (data.soldeInitial || 0).toString(),
        blocageActif: data.blocageActif || data.typeCompte === TypeCompteEnum.BLOCKED,
        blocageMotif: data.blocageMotif,
        blocageReference: data.blocageReference,
        blocageDebut: data.blocageActif ? new Date() : null,
        createdBy: userId,
      })
      .returning();

    // Create initial agency history record
    await tx.insert(compteAgencesHistorique).values({
      compteId: compte.id,
      agenceId: data.agenceId,
      dateDebut: new Date(),
      motif: "Création du compte",
      transferePar: userId,
    });

    // If there's an initial deposit, create mouvement
    if (data.soldeInitial && data.soldeInitial > 0) {
      const initialDepositTypePaiement = getTypePaiementForCompte(data.typeCompte, true);

      // Create mouvement
      const reference = `EPG-INIT-${Date.now()}-${randomBytes(4).toString('hex').slice(0, 6).toUpperCase()}`;
      const [mouvement] = await tx
        .insert(mouvementsFinanciers)
        .values({
          reference,
          sourceModule: "EPARGNE",
          sens: "CREDIT",
          montant: data.soldeInitial.toString(),
          dateOperation: new Date(),
          clientId: data.clientId,
          compteId: compte.id,
          agenceId: data.agenceId,
          methodePaiement: "CASH",
          typePaiement: initialDepositTypePaiement,
          createdBy: userId,
        })
        .returning();

      // Create transaction record with derived sens
      await tx.insert(transactionsCompte).values({
        compteId: compte.id,
        mouvementId: mouvement.id,
        typePaiement: initialDepositTypePaiement,
        sens: deriveSensFromType(initialDepositTypePaiement),
        montant: data.soldeInitial.toString(),
        soldeApres: data.soldeInitial.toString(),
        methodePaiement: "CASH",
        observations: "Dépôt initial à la création",
        createdBy: userId,
      });

      // Create outbox events
      await tx.insert(evenementsOutbox).values({
        type: "MOUVEMENT_CREE",
        aggregateType: "compte",
        aggregateId: compte.id,
        payload: {
          mouvementId: mouvement.id,
          compteId: compte.id,
          montant: data.soldeInitial,
          type: "INITIAL_DEPOSIT",
        },
      });

      await tx.insert(evenementsOutbox).values({
        type: "SOLDE_COMPTE_CHANGE",
        aggregateType: "compte",
        aggregateId: compte.id,
        payload: {
          compteId: compte.id,
          nouveauSolde: data.soldeInitial.toString(),
          ancienSolde: "0",
        },
      });

      // Notify client channel
      await tx.insert(evenementsOutbox).values({
        type: "MOUVEMENT_CREE",
        aggregateType: "client",
        aggregateId: data.clientId,
        payload: {
          type: "COMPTE_CREE",
          compteId: compte.id,
          typeCompte: data.typeCompte,
          numeroCompte,
        },
      });
    }

    return compte;
  });
}

// ============================================================================
// AUTO-CREATE COURANT ACCOUNT (replaces legacy createClientAccount)
// ============================================================================

/**
 * Auto-create a CURRENT account for a new client using the product system.
 * Looks up the first active CURRENT product, creates account via createCompteWithInitialDeposit.
 * If product has fees, account will be PENDING_PAYMENT and a caisse request is created.
 */
export async function autoCreateCourantAccount(
  clientId: string,
  agenceId: string,
  userId: string
): Promise<{ compte: Compte; isPending: boolean }> {
  // 1. Look up default active CURRENT product
  const [defaultProduct] = await db
    .select({ id: produitsCompte.id })
    .from(produitsCompte)
    .where(
      and(
        eq(produitsCompte.typeCompte, TypeCompteEnum.CURRENT),
        eq(produitsCompte.actif, true)
      )
    )
    .limit(1);

  if (!defaultProduct) {
    throw new Error("Aucun produit Compte Courant actif trouvé. Impossible de créer automatiquement le compte.");
  }

  // 2. Create via the modern product-aware function (montantInitial=0)
  const result = await createCompteWithInitialDeposit(
    {
      clientId,
      typeCompte: TypeCompteEnum.CURRENT,
      agenceId,
      produitId: defaultProduct.id,
      montantInitial: 0,
      modePaiement: 'CASH',
    },
    userId
  );

  // 3. Determine if account needs payment
  const pendingStatuses = [
    StatutCompteConst.PENDING_PAYMENT,
    StatutCompteConst.PENDING_PAYMENT_AND_APPROVAL,
  ];
  const isPending = (pendingStatuses as readonly string[]).includes(result.compte.statut);

  // 4. If pending, create a caisse payment request for activation
  if (isPending) {
    const { createCaisseRequest } = await import("../caisse-queue-service");
    const snapshot = (result.compte as any).openingSnapshot as OpeningSnapshot | null;
    const totalDue = snapshot
      ? (snapshot.openingFee + (snapshot.initialDepositRequired ? snapshot.minInitialDeposit : 0))
      : 0;

    if (totalDue > 0) {
      await createCaisseRequest({
        category: "ACCOUNT_ACTIVATION",
        direction: "IN",
        agenceId,
        sourceType: "compte",
        sourceId: result.compte.id,
        clientId,
        montant: totalDue,
        label: `Activation compte ${result.compte.numeroCompte}`,
        description: `Frais d'ouverture — Compte Courant (auto-créé)`,
        metadata: {
          compteId: result.compte.id,
          numeroCompte: result.compte.numeroCompte,
          typeCompte: TypeCompteEnum.CURRENT,
          montantTotal: totalDue,
          autoCreated: true,
        },
        createdBy: userId,
      });
    }
  }

  return { compte: result.compte, isPending };
}

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

