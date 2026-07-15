/**
 * Transactions de comptes et remboursements avec flux ledger.
 *
 * - createTransactionCompteWithLedger
 * - createOperationCaisseWithLedger
 * - createRemboursementWithLedger
 */
import { randomInt } from "crypto";

import type {
  MethodePaiementDz,
  TypeOperationCaisseDz,
} from "@shared/enum/enums";
import {
  getTypePaiementForCompte
} from "@shared/enum/status-constants";
import {
  comptes,
  credits,
  operationsCaisse,
  remboursements,
  sessionsCaisse,
  transactionsCompte,
  type OperationCaisse,
  type Remboursement,
  type TransactionCompte,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { db } from "../../../db";
import {
  executeWithLedger,
  updateCompteSolde,
  updateCreditSolde,
  updateSessionSolde,
  validateUserId,
  type MouvementFinancier,
  type SensMouvement,
} from "../../../services/ledger";
import { CheckMetadata, PhysicalVerificationData, TransferMetadata } from "../misc";
import { createFactureForRemboursement } from "./factures-credits";


/**
 * Créer une transaction compte avec le flux ledger complet.
 * - Crée un mouvement_financier
 * - Met à jour le solde du compte
 * - Crée la transaction avec mouvement_id
 * - Publie les événements outbox
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

  // Déterminer le sens selon le type de transaction
  const isDebit = ["WITHDRAWAL", "FEE"].includes(data.typeTransaction);
  const sens: SensMouvement = isDebit ? "DEBIT" : "CREDIT";
  const delta = isDebit ? -parseFloat(data.montant) : parseFloat(data.montant);

  // Récupérer le compte pour le clientId
  const [compte] = await db.select().from(comptes).where(eq(comptes.id, data.compteId));
  if (!compte) throw new Error(`Compte ${data.compteId} not found`);

  // Mapper typeTransaction vers les valeurs de l'enum typePaiement terrain
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
        // Dépôts : le cash entre ; retraits : le cash sort
        const sessionDelta = isDebit ? -parseFloat(data.montant) : parseFloat(data.montant);
        nouveauSoldeSession = await updateSessionSolde(tx, data.sessionCaisseId, sessionDelta);
      }

      // 3. Valider l'identifiant utilisateur
      const validatedUserId = await validateUserId(tx, userId);

      // 4. Créer la transaction compte
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
 * Créer une opération caisse avec le flux ledger complet.
 * Supporte les métadonnées pour chèques/virements et la vérification de présence physique.
 */
export async function createOperationCaisseWithLedger(data: {
  sessionId: string;
  typeOperation: string;
  montant: string;
  methodePaiement: string;
  clientId?: string;
  description?: string;
  idempotencyKey?: string;
  // Métadonnées chèques/virements
  checkMetadata?: CheckMetadata;
  transferMetadata?: TransferMetadata;
  // Données de vérification de présence physique
  presenceVerification?: PhysicalVerificationData;
}, userId?: string): Promise<{ operation: OperationCaisse; mouvement: MouvementFinancier }> {

  // Déterminer le sens selon le type d'opération
  const opLower = data.typeOperation.toLowerCase();
  const isDebit = opLower.startsWith("retrait") ||
                  opLower.startsWith("décaissement") ||
                  opLower.startsWith("sort") || // Sortie
                  opLower.startsWith("frais");

  const sens: SensMouvement = isDebit ? "DEBIT" : "CREDIT";
  const sessionDelta = isDebit ? -parseFloat(data.montant) : parseFloat(data.montant);

  // Récupérer la session pour l'agenceId
  const [session] = await db.select().from(sessionsCaisse).where(eq(sessionsCaisse.id, data.sessionId));
  if (!session) throw new Error(`Session ${data.sessionId} not found`);

  // Générer la référence
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
      // 1. Mettre à jour le solde théorique de la session
      const nouveauSolde = await updateSessionSolde(tx, data.sessionId, sessionDelta);

      // 2. Valider l'identifiant utilisateur
      const validatedUserId = await validateUserId(tx, userId);

      // 3. Créer l'opération caisse avec métadonnées
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
 * Créer un remboursement avec le flux ledger complet.
 */
export async function createRemboursementWithLedger(data: {
  creditId: string;
  montant: string;
  methodePaiement: string;
  sessionCaisseId?: string;
  observations?: string;
  idempotencyKey?: string;
}, userId?: string): Promise<{ remboursement: Remboursement; mouvement: MouvementFinancier }> {
  
  // Récupérer le crédit pour le clientId
  const [credit] = await db.select().from(credits).where(eq(credits.id, data.creditId));
  if (!credit) throw new Error(`Credit ${data.creditId} not found`);

  // Exiger une session pour les paiements en espèces
  if (data.methodePaiement === 'CASH' && !data.sessionCaisseId) {
      throw new Error("Une session de caisse active est requise pour les remboursements en espèces");
  }

  return executeWithLedger(
    "CREDIT",
    {
      montant: data.montant,
      sens: "CREDIT", // L'argent entre
      clientId: credit.clientId,
      creditId: data.creditId,
      agenceId: credit.agenceId || undefined,
      sessionCaisseId: data.sessionCaisseId,
      methodePaiement: data.methodePaiement,
      typePaiement: "CREDIT_REPAYMENT",
      idempotencyKey: data.idempotencyKey,
    },
    async (tx, mouvement) => {
      // 1. Mettre à jour le solde restant du crédit (diminuer du montant payé)
      const nouveauSolde = await updateCreditSolde(tx, data.creditId, -parseFloat(data.montant));

      // 2. Mettre à jour la session de caisse si applicable
      let nouveauSoldeSession: string | undefined;
      if (data.sessionCaisseId) {
        nouveauSoldeSession = await updateSessionSolde(tx, data.sessionCaisseId, parseFloat(data.montant));
      }

      // 3. Valider l'identifiant utilisateur
      const validatedUserId = await validateUserId(tx, userId);

      // 4. Créer le remboursement
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
    // Générer le reçu pour le remboursement
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
