/**
 * Opérations de caisse et transferts inter-caisses avec flux ledger.
 *
 * - createCashTransactionWithLedger
 * - validateTransfertWithLedger
 */
import { randomInt } from "crypto";

import type {
  MethodePaiementDz,
  TypeOperationCaisseDz,
  TypePaiementTerrainDz,
} from "@shared/enum/enums";
import {
  getTypePaiementForCompte,
} from "@shared/enum/status-constants";
import {
  caisses,
  caisseTransferts,
  comptes,
  operationsCaisse,
  sessionsCaisse,
  transactionsCompte,
  type CaisseTransfert,
  type OperationCaisse,
  type TransactionCompte,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { AccountingRuleNotFoundError, postGlForMouvement } from "../../../services/accounting-posting-service";
import {
  createMouvementEvents,
  createMouvementFinancier,
  executeWithLedger,
  updateCompteSolde,
  updateSessionSolde,
  validateUserId,
  type MouvementFinancier,
  type SensMouvement,
} from "../../../services/ledger";
import { InsufficientFundsError } from "../../errors";
import { logger } from "./shared";


/**
 * Créer une transaction cash unifiée avec le flux ledger complet.
 * - Met à jour le compte (si applicable)
 * - Met à jour la session
 * - Met à jour le solde de la caisse (suivi temps réel)
 * - Crée l'entrée ledger
 * - Crée l'enregistrement de transaction (si applicable)
 * - Crée l'enregistrement d'opération
 *
 * IMPORTANT : Cette fonction est le point d'entrée principal pour toutes
 * les opérations de caisse client. Elle garantit :
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
  // Import de la configuration centralisée
  const {
    isIncomingOperation,
    isOutgoingOperation,
  } = await import("@shared/config/caisse-operations");

  const montantNum = parseFloat(data.montant);
  if (!Number.isFinite(montantNum) || montantNum <= 0) {
    throw new Error("Le montant doit être un nombre positif");
  }

  // Déterminer la direction via la configuration centralisée
  const isIncoming = isIncomingOperation(data.typeOperation);
  const isOutgoing = isOutgoingOperation(data.typeOperation);

  let sens: SensMouvement;
  let cashDelta: number; // Impact sur la session cash (+ = entrée, - = sortie)
  let accountDelta: number = 0; // Impact sur le compte client (+ = crédit, - = débit)

  if (isIncoming) {
    sens = "CREDIT"; // Argent entrant dans l'institution
    cashDelta = montantNum;
    accountDelta = montantNum; // Compte client crédité (sa créance augmente)
  } else if (isOutgoing) {
    sens = "DEBIT"; // Argent sortant de l'institution
    cashDelta = -montantNum;
    accountDelta = -montantNum; // Compte client débité (sa créance diminue)
  } else {
    // Opération neutre ou inconnue — erreur
    throw new Error(`Type d'opération non reconnu: ${data.typeOperation}. Utiliser un type valide (Versement, Retrait, etc.)`);
  }

  // Vérifier le compte si fourni
  let compte: any;
  if (data.compteId) {
    const [foundCompte] = await db.select().from(comptes).where(eq(comptes.id, data.compteId));
    if (!foundCompte) throw new Error(`Compte ${data.compteId} non trouvé`);

    // Validation du solde pour les retraits (pré-vol + updateCompteSolde applique à l'écriture)
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

  // Vérifier le solde de caisse pour les retraits (pré-vol + updateSessionSolde applique à l'écriture)
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
      // Note : updateSessionSolde met à jour automatiquement caisses.solde pour maintenir la cohérence
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
 * Valider un transfert inter-caisses avec double entrée ledger complète (Débit Source / Crédit Dest).
 */
export async function validateTransfertWithLedger(
  transfertId: string, 
  sessionDestId: string, 
  userId: string
): Promise<CaisseTransfert> {
  return await db.transaction(async (tx) => {
    // 1. Récupérer le transfert
    const [transfert] = await tx.select().from(caisseTransferts).where(eq(caisseTransferts.id, transfertId));
    if (!transfert) throw new Error("Transfert non trouvé");
    if (transfert.statut !== 'PENDING') throw new Error("Transfert déjà traité");

    // 2. Récupérer les sessions
    const [sessionSource] = await tx.select().from(sessionsCaisse).where(eq(sessionsCaisse.id, transfert.sessionSourceId));
    const [sessionDest] = await tx.select().from(sessionsCaisse).where(eq(sessionsCaisse.id, sessionDestId));

    if (!sessionSource) throw new Error("Session source introuvable (archivée ou supprimée?)");
    if (!sessionDest) throw new Error("Session destination introuvable");
    if (sessionDest.closedAt) throw new Error("La session de destination doit être ouverte");

    // Vérification des fonds suffisants (pré-vol ; updateSessionSolde applique aussi à l'écriture)
    const currentSolde = Number(sessionSource.montantFermetureTheorique || sessionSource.montantOuverture || 0);
    const amount = Number(transfert.montant);

    if (currentSolde < amount) {
        throw new InsufficientFundsError("session", sessionSource.id, currentSolde, amount);
    }

    // 3. Traiter la SOURCE (DÉBIT / SORTIE)
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

    // Posting GL pour le mouvement source
    if (sessionSource.agenceId) {
      try {
        await postGlForMouvement(tx, mouvementSource, sessionSource.agenceId, userId, {
          transfertId: transfert.id,
          direction: "OUT",
        });
      } catch (error) {
        if (error instanceof AccountingRuleNotFoundError) {
          logger.warn({ mouvementId: mouvementSource.id, error: error.message }, "Pas de règle GL pour transfert OUT");
        } else {
          throw error;
        }
      }
    }

    // 4. Traiter la DESTINATION (CRÉDIT / ENTRÉE)
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

    // Posting GL pour le mouvement destination
    if (sessionDest.agenceId) {
      try {
        await postGlForMouvement(tx, mouvementDest, sessionDest.agenceId, userId, {
          transfertId: transfert.id,
          direction: "IN",
        });
      } catch (error) {
        if (error instanceof AccountingRuleNotFoundError) {
          logger.warn({ mouvementId: mouvementDest.id, error: error.message }, "Pas de règle GL pour transfert IN");
        } else {
          throw error;
        }
      }
    }

    // 5. Mettre à jour le statut du transfert
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
