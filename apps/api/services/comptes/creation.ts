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
import { createCompteWithInitialDeposit } from "./creation-avec-depot";
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
