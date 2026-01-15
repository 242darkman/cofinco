import { db } from "../db";
import { comptes, versementsAutomatiques, mouvementsFinanciers, transactionsCompte } from "@shared/schema";
import { eq, and, lte, sql } from "drizzle-orm";

/**
 * Calcule la prochaine date de versement automatique
 */
export function calculateNextTransferDate(
  frequence: string,
  jour: number,
  dernierVersement?: Date
): Date {
  const base = dernierVersement || new Date();
  const next = new Date(base);
  
  switch (frequence) {
    case 'Journalier':
      next.setDate(next.getDate() + 1);
      break;
    case 'Hebdomadaire':
      next.setDate(next.getDate() + 7);
      // Ajuster au jour de la semaine spécifié (1=Lundi, 7=Dimanche)
      if (jour >= 1 && jour <= 7) {
        const currentDay = next.getDay() || 7;
        const diff = jour - currentDay;
        next.setDate(next.getDate() + diff);
      }
      break;
    case 'Bimensuel':
      next.setDate(next.getDate() + 14);
      break;
    case 'Mensuel':
      next.setMonth(next.getMonth() + 1);
      // S'assurer que le jour est valide (max 28 pour éviter les problèmes de fin de mois)
      next.setDate(Math.min(jour, 28));
      break;
    case 'Trimestriel':
      next.setMonth(next.getMonth() + 3);
      next.setDate(Math.min(jour, 28));
      break;
    default:
      // Par défaut, mensuel
      next.setMonth(next.getMonth() + 1);
      next.setDate(Math.min(jour, 28));
  }
  
  return next;
}

/**
 * Exécute un versement automatique pour un compte donné
 */
export async function executeAutomaticTransfer(
  compteId: string,
  userId: string
): Promise<{ success: boolean; mouvementId?: string; error?: string }> {
  try {
    // 1. Récupérer le compte destination
    const [compteDest] = await db
      .select()
      .from(comptes)
      .where(eq(comptes.id, compteId))
      .limit(1);
    
    if (!compteDest) {
      return { success: false, error: "Compte destination non trouvé" };
    }
    
    // 2. Vérifier que le versement auto est actif
    if (!compteDest.versementAutoActif) {
      return { success: false, error: "Versement automatique non actif" };
    }
    
    // 3. Vérifier qu'il y a un compte source
    if (!compteDest.compteSourceId) {
      return { success: false, error: "Aucun compte source configuré" };
    }
    
    // 4. Récupérer le compte source
    const [compteSource] = await db
      .select()
      .from(comptes)
      .where(eq(comptes.id, compteDest.compteSourceId))
      .limit(1);
    
    if (!compteSource) {
      return { success: false, error: "Compte source non trouvé" };
    }
    
    // 5. Vérifier que le compte source est actif
    if (compteSource.statut !== 'Actif') {
      return { success: false, error: `Compte source ${compteSource.statut}` };
    }
    
    // 6. Vérifier que le compte destination est actif
    if (compteDest.statut !== 'Actif') {
      return { success: false, error: `Compte destination ${compteDest.statut}` };
    }
    
    // 7. Vérifier le solde suffisant
    const montantVersement = Number(compteDest.versementAutoMontant || 0);
    const soldeSource = Number(compteSource.soldeCourant || 0);
    
    if (soldeSource < montantVersement) {
      return { 
        success: false, 
        error: `Solde insuffisant: ${soldeSource} FCFA disponible, ${montantVersement} FCFA requis` 
      };
    }
    
    // 8. Execute transfer in a transaction with proper ledger tracking
    const mouvementId = await db.transaction(async (tx) => {
      // Create mouvement financier for the transfer
      const [mouvement] = await tx.insert(mouvementsFinanciers).values({
        montant: compteDest.versementAutoMontant!,
        sens: "Débit",
        sourceModule: "VERSEMENT_AUTO",
        compteId: compteSource.id,
        reference: `VA-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        metadata: {
          description: `Versement automatique ${compteDest.versementAutoFrequence} - ${compteSource.numeroCompte} → ${compteDest.numeroCompte}`,
          typeOperation: "Transfert interne",
          compteDestId: compteDest.id
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
        typePaiement: "Transfert Sortant",
        montant: compteDest.versementAutoMontant!,
        soldeApres: nouveauSoldeSource,
        methodePaiement: "Virement",
        observations: `Versement automatique vers ${compteDest.numeroCompte}`,
      });
      
      await tx.insert(transactionsCompte).values({
        compteId: compteDest.id,
        mouvementId: mouvement.id,
        typePaiement: "Transfert Entrant",
        montant: compteDest.versementAutoMontant!,
        soldeApres: nouveauSoldeDest,
        methodePaiement: "Virement",
        observations: `Versement automatique depuis ${compteSource.numeroCompte}`,
      });
      
      // Record in versements_automatiques history
      await tx.insert(versementsAutomatiques).values({
        compteSourceId: compteSource.id,
        compteDestId: compteDest.id,
        montant: compteDest.versementAutoMontant!,
        statut: 'success',
        dateExecution: new Date(),
        datePlanifiee: compteDest.prochainVersementAuto || new Date(),
        mouvementId: mouvement.id,
        tentatives: 1,
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
    
    return { success: true, mouvementId };
    
  } catch (error) {
    console.error('[Automatic Transfer] Erreur:', error);
    
    // Enregistrer l'échec dans l'historique
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
          statut: 'failed',
          dateExecution: null,
          datePlanifiee: compteDest.prochainVersementAuto || new Date(),
          mouvementId: null,
          erreur: error instanceof Error ? error.message : 'Erreur inconnue',
          tentatives: 1,
        });
      }
    } catch (logError) {
      console.error('[Automatic Transfer] Erreur lors de l\'enregistrement de l\'échec:', logError);
    }
    
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Erreur inconnue' 
    };
  }
}

/**
 * Récupère tous les comptes avec versement auto à exécuter
 */
export async function getComptesWithPendingTransfers(): Promise<typeof comptes.$inferSelect[]> {
  const now = new Date();
  
  return await db
    .select()
    .from(comptes)
    .where(
      and(
        eq(comptes.versementAutoActif, true),
        lte(comptes.prochainVersementAuto, now),
        eq(comptes.statut, 'Actif')
      )
    );
}
