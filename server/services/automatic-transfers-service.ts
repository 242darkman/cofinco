import crypto from "crypto";
import { db } from "../db";
import { comptes, versementsAutomatiques, mouvementsFinanciers, transactionsCompte, tachesRegularisationCoffreCaisse } from "@shared/schema";
import { eq, and, lte, sql } from "drizzle-orm";
import {
  StatutCompte,
  FrequenceVirement,
  FrequenceVirementType,
  TypeTacheRegularisation,
  Priorite,
} from "@shared/enum/status-constants";
import { createLogger } from "../lib/logger";

const logger = createLogger('AutoTransfer');

/** Génère une référence unique avec crypto.randomUUID() */
const generateReference = () =>
  `VA-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

/**
 * Calcule la prochaine date de versement automatique
 * Utilise les fréquences EN standardisées (FrequenceVirement)
 */
export function calculateNextTransferDate(
  frequence: string,
  jour: number,
  dernierVersement?: Date
): Date {
  const base = dernierVersement || new Date();
  const next = new Date(base);

  switch (frequence as FrequenceVirementType) {
    case FrequenceVirement.DAILY:
      next.setDate(next.getDate() + 1);
      break;
    case FrequenceVirement.WEEKLY:
      next.setDate(next.getDate() + 7);
      // Ajuster au jour de la semaine spécifié (1=Lundi, 7=Dimanche)
      if (jour >= 1 && jour <= 7) {
        const currentDay = next.getDay() || 7;
        const diff = jour - currentDay;
        next.setDate(next.getDate() + diff);
      }
      break;
    case FrequenceVirement.MONTHLY:
      next.setMonth(next.getMonth() + 1);
      // S'assurer que le jour est valide (max 28 pour éviter les problèmes de fin de mois)
      next.setDate(Math.min(jour, 28));
      break;
    case FrequenceVirement.ONCE:
      // Pas de prochaine exécution pour les virements uniques
      return next;
    default:
      // Par défaut, mensuel
      next.setMonth(next.getMonth() + 1);
      next.setDate(Math.min(jour, 28));
  }

  return next;
}

/**
 * Exécute un versement automatique pour un compte donné
 * @param maxRetries Nombre maximum de tentatives (défaut: 3)
 */
export async function executeAutomaticTransfer(
  compteId: string,
  userId: string,
  maxRetries: number = 3
): Promise<{ success: boolean; mouvementId?: string; error?: string; attempts?: number }> {
  let lastError: string = 'Erreur inconnue';
  let attempts = 0;

  // Logique de retry avec backoff exponentiel
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    attempts = attempt;

    try {
      // 1. Récupérer le compte destination
      const [compteDest] = await db
        .select()
        .from(comptes)
        .where(eq(comptes.id, compteId))
        .limit(1);

      if (!compteDest) {
        return { success: false, error: "Compte destination non trouvé", attempts };
      }

      // 2. Vérifier que le versement auto est actif
      if (!compteDest.versementAutoActif) {
        return { success: false, error: "Versement automatique non actif", attempts };
      }

      // 3. Vérifier qu'il y a un compte source
      if (!compteDest.compteSourceId) {
        return { success: false, error: "Aucun compte source configuré", attempts };
      }

      // 4. Récupérer le compte source
      const [compteSource] = await db
        .select()
        .from(comptes)
        .where(eq(comptes.id, compteDest.compteSourceId))
        .limit(1);

      if (!compteSource) {
        return { success: false, error: "Compte source non trouvé", attempts };
      }

      // 5. Vérifier que le compte source est actif
      if (compteSource.statut !== StatutCompte.ACTIVE) {
        return { success: false, error: `Compte source ${compteSource.statut}`, attempts };
      }

      // 6. Vérifier que le compte destination est actif
      if (compteDest.statut !== StatutCompte.ACTIVE) {
        return { success: false, error: `Compte destination ${compteDest.statut}`, attempts };
      }

      // 7. Vérifier le solde suffisant
      const montantVersement = Number(compteDest.versementAutoMontant || 0);
      const soldeSource = Number(compteSource.soldeCourant || 0);

      if (soldeSource < montantVersement) {
        return {
          success: false,
          error: `Solde insuffisant: ${soldeSource} FCFA disponible, ${montantVersement} FCFA requis`,
          attempts,
        };
      }

      // 8. Générer une référence unique avec crypto.randomUUID()
      const reference = generateReference();

      // 9. Execute transfer in a transaction with proper ledger tracking
      const mouvementId = await db.transaction(async (tx) => {
        // Create mouvement financier for the transfer
        const [mouvement] = await tx.insert(mouvementsFinanciers).values({
          montant: compteDest.versementAutoMontant!,
          sens: "DEBIT",
          sourceModule: "VERSEMENT_AUTO",
          compteId: compteSource.id,
          reference,
          metadata: {
            description: `Versement automatique ${compteDest.versementAutoFrequence} - ${compteSource.numeroCompte} → ${compteDest.numeroCompte}`,
            typeOperation: "Transfert interne",
            compteDestId: compteDest.id,
            attempt,
          },
          createdBy: userId,
          agenceId: compteDest.agenceId || undefined,
        }).returning();

        // Update account balances atomically
        const nouveauSoldeSource = (soldeSource - montantVersement).toString();
        const soldeDest = Number(compteDest.soldeCourant || 0);
        const nouveauSoldeDest = (soldeDest + montantVersement).toString();

        await tx
          .update(comptes)
          .set({ soldeCourant: nouveauSoldeSource })
          .where(eq(comptes.id, compteSource.id));

        await tx
          .update(comptes)
          .set({ soldeCourant: nouveauSoldeDest })
          .where(eq(comptes.id, compteDest.id));

        // Create transaction records for both accounts
        await tx.insert(transactionsCompte).values({
          compteId: compteSource.id,
          mouvementId: mouvement.id,
          typePaiement: "TRANSFER_OUT",
          sens: "DEBIT",
          montant: compteDest.versementAutoMontant!,
          soldeApres: nouveauSoldeSource,
          methodePaiement: "TRANSFER",
          observations: `Versement automatique vers ${compteDest.numeroCompte}`,
        });

        await tx.insert(transactionsCompte).values({
          compteId: compteDest.id,
          mouvementId: mouvement.id,
          typePaiement: "TRANSFER_IN",
          sens: "CREDIT",
          montant: compteDest.versementAutoMontant!,
          soldeApres: nouveauSoldeDest,
          methodePaiement: "TRANSFER",
          observations: `Versement automatique depuis ${compteSource.numeroCompte}`,
        });

        // Record in versements_automatiques history
        await tx.insert(versementsAutomatiques).values({
          compteSourceId: compteSource.id,
          compteDestId: compteDest.id,
          montant: compteDest.versementAutoMontant!,
          statut: 'SUCCESS',
          dateExecution: new Date(),
          datePlanifiee: compteDest.prochainVersementAuto || new Date(),
          mouvementId: mouvement.id,
          tentatives: attempt,
        });

        return mouvement.id;
      });

      // 10. Mettre à jour les dates du compte
      const prochainVersement = calculateNextTransferDate(
        compteDest.versementAutoFrequence!,
        compteDest.versementAutoJour || 28,
        new Date()
      );

      await db
        .update(comptes)
        .set({
          dernierVersementAuto: new Date(),
          prochainVersementAuto: prochainVersement,
        })
        .where(eq(comptes.id, compteId));

      return { success: true, mouvementId, attempts };

    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Erreur inconnue';
      logger.error({ attempt, maxRetries, error: lastError }, 'Transfer attempt failed');

      // Si ce n'est pas la dernière tentative, attendre avec backoff exponentiel
      if (attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt) * 100; // 200ms, 400ms, 800ms...
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  // Toutes les tentatives ont échoué - enregistrer l'échec
  logger.error({ maxRetries, compteId }, 'All transfer attempts failed');

  try {
    const [compteDest] = await db
      .select()
      .from(comptes)
      .where(eq(comptes.id, compteId))
      .limit(1);

    if (compteDest && compteDest.compteSourceId) {
      await db.insert(versementsAutomatiques).values({
        compteSourceId: compteDest.compteSourceId,
        compteDestId: compteId,
        montant: compteDest.versementAutoMontant || '0',
        statut: 'FAILED',
        dateExecution: null,
        datePlanifiee: compteDest.prochainVersementAuto || new Date(),
        mouvementId: null,
        erreur: `${lastError} (après ${maxRetries} tentatives)`,
        tentatives: maxRetries,
      });

      // Créer une tâche de régularisation pour le versement automatique échoué
      await db.insert(tachesRegularisationCoffreCaisse).values({
        type: TypeTacheRegularisation.VIREMENT_AUTO_ECHEC,
        description: `Versement automatique échoué pour compte ${compteDest.numeroCompte}: ${lastError}`,
        montantEcart: compteDest.versementAutoMontant || '0',
        priorite: Priorite.HIGH,
        dateEcheance: new Date(Date.now() + 24 * 60 * 60 * 1000), // J+1
      });
    }
  } catch (logError) {
    logger.error({ err: logError }, 'Error recording failure');
  }

  return {
    success: false,
    error: lastError,
    attempts,
  };
}

/**
 * Récupère tous les comptes avec versement auto à exécuter
 * Note: Le filtrage par statut est fait en mémoire pour supporter les valeurs legacy
 */
export async function getComptesWithPendingTransfers(): Promise<typeof comptes.$inferSelect[]> {
  const now = new Date();

  // Récupérer tous les comptes avec versement auto actif et date d'exécution passée
  const comptesWithPendingAuto = await db
    .select()
    .from(comptes)
    .where(
      and(
        eq(comptes.versementAutoActif, true),
        lte(comptes.prochainVersementAuto, now)
      )
    );

  // Filtrer les comptes actifs
  return comptesWithPendingAuto.filter(compte => compte.statut === StatutCompte.ACTIVE);
}
