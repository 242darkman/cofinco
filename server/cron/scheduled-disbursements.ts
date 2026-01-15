import cron from 'node-cron';
import { executeScheduledDisbursement, getCreditsWithPendingDisbursement } from '../services/scheduled-disbursements-service';

let cronJob: ReturnType<typeof cron.schedule> | null = null;

/**
 * Démarre le cron job pour les décaissements programmés
 * Exécution quotidienne à 9h du matin
 */
export function startScheduledDisbursementsCron() {
  // Exécuter tous les jours à 9h du matin
  cronJob = cron.schedule('0 9 * * *', async () => {
    console.log('[Scheduled Disbursements] 🚀 Démarrage du job de décaissements programmés...');
    
    try {
      // Récupérer tous les crédits avec décaissement programmé à exécuter
      const creditsToDisburse = await getCreditsWithPendingDisbursement();
      
      console.log(`[Scheduled Disbursements] 📊 ${creditsToDisburse.length} décaissement(s) à exécuter`);
      
      if (creditsToDisburse.length === 0) {
        console.log('[Scheduled Disbursements] ✅ Aucun décaissement à exécuter');
        return;
      }
      
      let success = 0;
      let failed = 0;
      const errors: { creditId: string; numeroCredit: string; error: string }[] = [];
      
      // Exécuter les décaissements un par un
      for (const credit of creditsToDisburse) {
        try {
          const result = await executeScheduledDisbursement(
            credit.id,
            'SYSTEM' // User ID système pour les cron jobs
          );
          
          if (result.success) {
            success++;
            console.log(`[Scheduled Disbursements] ✅ Décaissement réussi pour crédit ${credit.numeroCredit} (${result.mouvementId})`);
          } else {
            failed++;
            errors.push({ 
              creditId: credit.id, 
              numeroCredit: credit.numeroCredit,
              error: result.error || 'Erreur inconnue' 
            });
            console.error(`[Scheduled Disbursements] ❌ Échec pour crédit ${credit.numeroCredit}:`, result.error);
          }
        } catch (error) {
          failed++;
          const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
          errors.push({ 
            creditId: credit.id, 
            numeroCredit: credit.numeroCredit,
            error: errorMessage 
          });
          console.error(`[Scheduled Disbursements] ❌ Exception pour crédit ${credit.numeroCredit}:`, error);
        }
        
        // Petite pause entre chaque décaissement pour éviter la surcharge
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      console.log(`[Scheduled Disbursements] 🏁 Terminé: ${success} succès, ${failed} échecs`);
      
      if (errors.length > 0) {
        console.log('[Scheduled Disbursements] 📋 Détails des échecs:');
        errors.forEach(({ numeroCredit, error }) => {
          console.log(`  - Crédit ${numeroCredit}: ${error}`);
        });
      }
      
    } catch (error) {
      console.error('[Scheduled Disbursements] ❌ Erreur critique:', error);
    }
  });
  
  console.log('[Scheduled Disbursements] ⏰ Cron job démarré (exécution quotidienne à 9h du matin)');
}

/**
 * Arrête le cron job
 */
export function stopScheduledDisbursementsCron() {
  if (cronJob) {
    cronJob.stop();
    console.log('[Scheduled Disbursements] ⏹️  Cron job arrêté');
  }
}

/**
 * Exécute manuellement le job (pour tests)
 */
export async function runScheduledDisbursementsManually() {
  console.log('[Scheduled Disbursements] 🔧 Exécution manuelle démarrée...');
  
  try {
    const creditsToDisburse = await getCreditsWithPendingDisbursement();
    
    console.log(`[Scheduled Disbursements] 📊 ${creditsToDisburse.length} décaissement(s) à exécuter`);
    
    const results = [];
    
    for (const credit of creditsToDisburse) {
      const result = await executeScheduledDisbursement(credit.id, 'SYSTEM');
      results.push({
        creditId: credit.id,
        numeroCredit: credit.numeroCredit,
        ...result
      });
    }
    
    return results;
  } catch (error) {
    console.error('[Scheduled Disbursements] ❌ Erreur lors de l\'exécution manuelle:', error);
    throw error;
  }
}
