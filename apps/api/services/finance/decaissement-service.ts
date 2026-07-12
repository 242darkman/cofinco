/**
 * @module services/finance/decaissement-service
 * Service gérant la logique métier des décaissements de crédits.
 */

import { storage } from "../../storage";
import { db } from "../../db";
import { getWsInstance } from "../../ws-server";
import { initiatePayout } from "../mobile-money/payment-service";
import { createLogger } from "../../lib/logger";
import { generateCreditSchedule } from "../../storage/finance";
import { currencySymbol } from "@shared/config/currency";
import { StatutCreditDz, DisbursementStatusDz } from "@shared/enum/enums";
import { StatutCredit } from "@shared/enum/status-constants";
import { DecaissementInsufficientFundsError, InsufficientFundsError } from "../../storage/errors";
import { isCoffreCaisseError } from "../coffre/coffre-errors";

const logger = createLogger('Services:Finance:Decaissement');

export interface DecaissementParams {
  credit: any;
  demande: any;
  compteCourant: any;
  montantDecaissement: number;
  numeroCredit: string;
  clientName: string;
  estProgramme: boolean;
  dateDecaissement: string;
  user: any;
  provider?: string; // Pour Mobile Money
}

export interface DecaissementResult {
  message: string;
  nouveauSolde: number;
}

/**
 * Traite un décaissement en espèces (CASH)
 */
export async function processCashDisbursement({
  credit,
  demande,
  compteCourant,
  montantDecaissement,
  numeroCredit,
  clientName
}: DecaissementParams): Promise<DecaissementResult> {
  const wsInstance = getWsInstance();
  if (wsInstance) {
    wsInstance.broadcast({
      type: "CAISSE_UPDATE",
      payload: {
        subtype: 'NEW_LOAN_DISBURSEMENT',
        creditId: credit.id,
        numeroCredit,
        clientName,
        clientId: demande.clientId,
        montant: montantDecaissement,
        agenceId: compteCourant.agenceId,
        timestamp: new Date().toISOString()
      }
    });
  }

  return {
    message: `Ordre de paiement envoyé à la caisse. Le client ${clientName} doit se présenter au guichet pour récupérer ${montantDecaissement.toLocaleString()} ${currencySymbol()}.`,
    nouveauSolde: parseFloat(compteCourant.soldeCourant || '0')
  };
}

/**
 * Traite un décaissement via Mobile Money
 */
export async function processMobileMoneyDisbursement({
  credit,
  demande,
  compteCourant,
  montantDecaissement,
  numeroCredit,
  user,
  provider
}: DecaissementParams): Promise<DecaissementResult> {
  const client = await storage.getClient(demande.clientId);
  const mobilePhone = client?.telephone;

  if (!mobilePhone) {
    await storage.updateCredit(credit.id, { statut: StatutCredit.CANCELLED as StatutCreditDz, disbursementStatus: 'FAILED' as DisbursementStatusDz });
    throw new Error("Le client n'a pas de numéro de téléphone enregistré. Décaissement Mobile Money impossible.");
  }

  if (!provider || !['MTN', 'AIRTEL'].includes(provider)) {
    await storage.updateCredit(credit.id, { statut: StatutCredit.CANCELLED as StatutCreditDz, disbursementStatus: 'FAILED' as DisbursementStatusDz });
    throw new Error("Opérateur Mobile Money requis (MTN ou AIRTEL).");
  }

  try {
    const payoutIntent = await initiatePayout({
      provider: provider as "MTN" | "AIRTEL",
      amount: montantDecaissement,
      phone: mobilePhone,
      clientId: demande.clientId,
      compteId: compteCourant.id,
      creditId: credit.id,
      description: `Décaissement crédit ${numeroCredit}`,
      agenceId: compteCourant.agenceId || undefined,
      idempotencyKey: `disburse-${credit.id}`,
    }, user?.id);

    logger.info({ creditId: credit.id, intentId: payoutIntent.id, provider }, 'Mobile Money disbursement initiated');

    return {
      message: `Paiement Mobile Money ${provider} initié pour ${montantDecaissement.toLocaleString()} ${currencySymbol()} vers ${mobilePhone}. Le crédit sera activé après confirmation du transfert.`,
      nouveauSolde: parseFloat(compteCourant.soldeCourant || '0')
    };
  } catch (payoutError) {
    logger.error({ err: payoutError, creditId: credit.id }, 'Mobile Money disbursement failed');
    await storage.updateCredit(credit.id, { statut: StatutCredit.CANCELLED as StatutCreditDz, disbursementStatus: 'FAILED' as DisbursementStatusDz });
    const errorMsg = payoutError instanceof Error ? payoutError.message : 'Erreur inconnue';
    throw new Error(`Échec du décaissement Mobile Money: ${errorMsg}`);
  }
}

/**
 * Traite un décaissement par virement sur compte courant (ACCOUNT)
 */
export async function processAccountDisbursement({
  credit,
  demande,
  compteCourant,
  montantDecaissement,
  numeroCredit,
  estProgramme,
  dateDecaissement,
  user
}: DecaissementParams): Promise<DecaissementResult> {
  let nouveauSolde = parseFloat(compteCourant.soldeCourant || '0');
  
  if (estProgramme) {
    return {
      message: `Décaissement programmé pour le ${new Date(dateDecaissement).toLocaleDateString('fr-FR')}. Crédit ${numeroCredit} créé en attente.`,
      nouveauSolde
    };
  }

  try {
    await storage.createDecaissementWithLedger({
      creditId: credit.id,
      compteId: compteCourant.id,
      montant: montantDecaissement.toString(),
      numeroCredit
    }, user?.id);

    nouveauSolde += montantDecaissement;

    await storage.updateCredit(credit.id, {
      statut: StatutCredit.ACTIVE as StatutCreditDz,
      disbursementStatus: 'COMPLETED' as DisbursementStatusDz,
      disbursedAt: new Date(),
      disbursedBy: user?.id
    });

    try {
      await generateCreditSchedule(credit.id);
    } catch (scheduleErr) {
      logger.error({ err: scheduleErr, creditId: credit.id }, 'Échec génération échéancier — crédit rétrogradé à PENDING');
      await storage.updateCredit(credit.id, {
        statut: StatutCredit.PENDING as StatutCreditDz,
        disbursementStatus: 'FAILED' as DisbursementStatusDz,
      });
      throw new Error("Le décaissement a été effectué mais la génération de l'échéancier a échoué. Le crédit est en attente de correction manuelle.");
    }

    try {
      const { recordScoreEvent } = await import('../scoring-engine');
      await recordScoreEvent({
        clientId: demande.clientId,
        agenceId: credit.agenceId ?? undefined,
        eventType: 'INITIAL_SCORE',
        refId: credit.id,
        refType: 'credit',
        montant: montantDecaissement,
        createdBy: user?.id,
      });
    } catch (scoreErr) {
      logger.warn({ err: scoreErr, creditId: credit.id }, 'Score event INITIAL_SCORE failed (non-blocking)');
    }

    return {
      message: `Crédit ${numeroCredit} décaissé. ${montantDecaissement.toLocaleString()} ${currencySymbol()} crédités sur le compte ${compteCourant.numeroCompte}`,
      nouveauSolde
    };
  } catch (err: any) {
    logger.error({ err, creditId: credit.id }, 'Erreur Ledger lors du décaissement');

    try {
      await storage.updateCredit(credit.id, {
        statut: StatutCredit.CANCELLED as StatutCreditDz,
        disbursementStatus: 'PENDING' as DisbursementStatusDz
      });
      logger.info({ creditId: credit.id }, 'Crédit annulé après échec du décaissement');
    } catch (cleanupErr) {
      logger.error({ err: cleanupErr, creditId: credit.id }, 'Échec annulation crédit orphelin');
    }

    if (isCoffreCaisseError(err) || err instanceof DecaissementInsufficientFundsError || err instanceof InsufficientFundsError) {
      throw err;
    }
    
    if (err.message && err.message.includes("génération de l'échéancier a échoué")) {
      throw err;
    }

    throw new Error(`Erreur lors du décaissement effectif: ${err.message}`);
  }
}
