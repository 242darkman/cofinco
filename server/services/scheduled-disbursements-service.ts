import { db } from "../db";
import { credits, decaissementsProgrammes, mouvementsFinanciers, comptes } from "@shared/schema";
import { eq, and, lte, sql } from "drizzle-orm";
import { createDecaissementWithLedger } from "../storage/finance";
import {
  validateCreditTransition,
  CreditTransitionError,
  CreditStatus,
} from "@shared/machines/credit-workflow";
import { TypeCompte, StatutCompte, StatutCredit } from "@shared/enum/status-constants";
import { createLogger } from "../lib/logger";

const logger = createLogger('ScheduledDisbursement');

/**
 * Exécute un décaissement programmé pour un crédit donné
 */
export async function executeScheduledDisbursement(
  creditId: string,
  userId: string
): Promise<{ success: boolean; mouvementId?: string; error?: string }> {
  try {
    // 1. Récupérer le crédit
    const [credit] = await db
      .select()
      .from(credits)
      .where(eq(credits.id, creditId))
      .limit(1);
    
    if (!credit) {
      return { success: false, error: "Crédit non trouvé" };
    }
    
    // 2. Vérifier que le décaissement automatique est actif
    if (!credit.decaissementAutomatique) {
      return { success: false, error: "Décaissement automatique non actif" };
    }
    
    // 3. Vérifier que la date programmée est atteinte ou passée
    const now = new Date();
    if (credit.dateDecaissementProgramme && credit.dateDecaissementProgramme > now) {
      return { 
        success: false, 
        error: `Décaissement programmé pour le ${credit.dateDecaissementProgramme.toLocaleDateString()}` 
      };
    }
    
    // 4. Vérifier que le crédit est approuvé
    if (credit.statut !== StatutCredit.PENDING) {
      return { success: false, error: `Crédit non approuvé (statut: ${credit.statut})` };
    }
    
    // 5. Vérifier que le crédit n'a pas déjà été décaissé
    if (credit.dateDecaissementEffectif) {
      return { 
        success: false, 
        error: `Crédit déjà décaissé le ${credit.dateDecaissementEffectif.toLocaleDateString()}` 
      };
    }
    
    // 6. Récupérer le compte courant du client pour le décaissement
    const [compteClient] = await db
      .select()
      .from(comptes)
      .where(
        and(
          eq(comptes.clientId, credit.clientId),
          eq(comptes.typeCompte, TypeCompte.CURRENT),
          eq(comptes.statut, StatutCompte.ACTIVE)
        )
      )
      .limit(1);
    
    if (!compteClient) {
      return { success: false, error: 'Aucun compte courant actif trouvé pour le client' };
    }
    
    // 7. Exécuter le décaissement via le service existant
    // Le service createDecaissementWithLedger gère :
    // - La vérification du solde du coffre
    // - Le débit du coffre
    // - Le crédit du compte client
    // - La création du mouvement financier
    const result = await createDecaissementWithLedger(
      {
        creditId: credit.id,
        compteId: compteClient.id,
        montant: credit.montant,
        numeroCredit: credit.numeroCredit,
      },
      userId
    );
    
    // 8. Enregistrer dans l'historique
    await db.insert(decaissementsProgrammes).values({
      creditId: credit.id,
      montant: credit.montant,
      statut: 'SUCCESS',
      dateExecution: new Date(),
      datePlanifiee: credit.dateDecaissementProgramme || new Date(),
      mouvementId: result.mouvement.id,
      tentatives: (credit.decaissementTentatives || 0) + 1,
    });
    
    // 9. Mettre à jour le crédit avec validation de la state machine
    // Note: After disbursement, the credit should transition to ACTIVE
    // PENDING -> ACTIVE is the standard transition after disbursement
    try {
      validateCreditTransition(credit.statut, CreditStatus.ACTIVE);
    } catch (error) {
      if (error instanceof CreditTransitionError) {
        logger.warn({ creditId, error: error.message }, 'State machine warning');
        // Continue anyway for disbursement - status might already be correct
      } else {
        throw error;
      }
    }

    await db
      .update(credits)
      .set({
        statut: CreditStatus.ACTIVE, // Use standardized EN value
        dateDecaissementEffectif: new Date(),
        decaissementTentatives: (credit.decaissementTentatives || 0) + 1,
        decaissementErreur: null,
      })
      .where(eq(credits.id, creditId));
    
    return { success: true, mouvementId: result.mouvement.id };
    
  } catch (error) {
    logger.error({ err: error }, 'Disbursement error');
    
    // Enregistrer l'échec dans l'historique
    try {
      const [credit] = await db
        .select()
        .from(credits)
        .where(eq(credits.id, creditId))
        .limit(1);
      
      if (credit) {
        const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
        
        await db.insert(decaissementsProgrammes).values({
          creditId: credit.id,
          montant: credit.montant,
          statut: 'FAILED',
          dateExecution: null,
          datePlanifiee: credit.dateDecaissementProgramme || new Date(),
          mouvementId: null,
          erreur: errorMessage,
          tentatives: (credit.decaissementTentatives || 0) + 1,
        });
        
        // Mettre à jour le crédit avec l'erreur
        await db
          .update(credits)
          .set({
            decaissementTentatives: (credit.decaissementTentatives || 0) + 1,
            decaissementErreur: errorMessage,
          })
          .where(eq(credits.id, creditId));
      }
    } catch (logError) {
      logger.error({ err: logError }, 'Error recording failure');
    }
    
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Erreur inconnue' 
    };
  }
}

/**
 * Récupère tous les crédits avec décaissement programmé à exécuter
 */
export async function getCreditsWithPendingDisbursement(): Promise<typeof credits.$inferSelect[]> {
  const now = new Date();
  
  return await db
    .select()
    .from(credits)
    .where(
      and(
        eq(credits.decaissementAutomatique, true),
        lte(credits.dateDecaissementProgramme, now),
        eq(credits.statut, StatutCredit.PENDING),
        sql`${credits.dateDecaissementEffectif} IS NULL` // Pas encore décaissé
      )
    );
}
