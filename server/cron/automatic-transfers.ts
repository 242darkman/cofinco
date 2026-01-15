import cron from 'node-cron';
import { executeAutomaticTransfer, getComptesWithPendingTransfers } from '../services/automatic-transfers-service';

let cronJob: ReturnType<typeof cron.schedule> | null = null;

/**
 * Démarre le cron job pour les versements automatiques
 * Exécution quotidienne à 2h du matin
 */
export function startAutomaticTransfersCron() {
  // Exécuter tous les jours à 2h du matin
  cronJob = cron.schedule('0 2 * * *', async () => {
    console.log('[Automatic Transfers] 🚀 Démarrage du job de versements automatiques...');
    
    try {
      // Récupérer tous les comptes avec versement auto à exécuter
      const comptesAvecVersement = await getComptesWithPendingTransfers();
      
      console.log(`[Automatic Transfers] 📊 ${comptesAvecVersement.length} transfert(s) à exécuter`);
      
      if (comptesAvecVersement.length === 0) {
        console.log('[Automatic Transfers] ✅ Aucun transfert à exécuter');
        return;
      }
      
      let success = 0;
      let failed = 0;
      const errors: { compteId: string; error: string }[] = [];
      
      // Exécuter les transferts un par un
      for (const compte of comptesAvecVersement) {
        try {
          const result = await executeAutomaticTransfer(
            compte.id,
            'SYSTEM' // User ID système pour les cron jobs
          );
          
          if (result.success) {
            success++;
            console.log(`[Automatic Transfers] ✅ Transfert réussi pour compte ${compte.numeroCompte} (${result.mouvementId})`);
          } else {
            failed++;
            errors.push({ compteId: compte.id, error: result.error || 'Erreur inconnue' });
            console.error(`[Automatic Transfers] ❌ Échec pour compte ${compte.numeroCompte}:`, result.error);
          }
        } catch (error) {
          failed++;
          const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
          errors.push({ compteId: compte.id, error: errorMessage });
          console.error(`[Automatic Transfers] ❌ Exception pour compte ${compte.numeroCompte}:`, error);
        }
        
        // Petite pause entre chaque transfert pour éviter la surcharge
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      console.log(`[Automatic Transfers] 🏁 Terminé: ${success} succès, ${failed} échecs`);
      
      if (errors.length > 0) {
        console.log('[Automatic Transfers] 📋 Détails des échecs:');
        errors.forEach(({ compteId, error }) => {
          console.log(`  - Compte ${compteId}: ${error}`);
        });
      }
      
    } catch (error) {
      console.error('[Automatic Transfers] ❌ Erreur critique:', error);
    }
  });
  
  console.log('[Automatic Transfers] ⏰ Cron job démarré (exécution quotidienne à 2h du matin)');
}

/**
 * Arrête le cron job
 */
export function stopAutomaticTransfersCron() {
  if (cronJob) {
    cronJob.stop();
    console.log('[Automatic Transfers] ⏹️  Cron job arrêté');
  }
}

/**
 * Exécute manuellement le job (pour tests)
 */
export async function runAutomaticTransfersManually() {
  console.log('[Automatic Transfers] 🔧 Exécution manuelle démarrée...');
  
  try {
    const comptesAvecVersement = await getComptesWithPendingTransfers();
    
    console.log(`[Automatic Transfers] 📊 ${comptesAvecVersement.length} transfert(s) à exécuter`);
    
    const results = [];
    
    for (const compte of comptesAvecVersement) {
      const result = await executeAutomaticTransfer(compte.id, 'SYSTEM');
      results.push({
        compteId: compte.id,
        numeroCompte: compte.numeroCompte,
        ...result
      });
    }
    
    return results;
  } catch (error) {
    console.error('[Automatic Transfers] ❌ Erreur lors de l\'exécution manuelle:', error);
    throw error;
  }
}
