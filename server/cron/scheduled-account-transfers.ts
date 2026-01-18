import cron from "node-cron";
import { runVirementsProgrammes } from "../services/compte-transfers";

let cronJob: ReturnType<typeof cron.schedule> | null = null;

/**
 * Démarre le cron job pour les virements programmes
 * Exécution quotidienne à 02h30
 */
export function startScheduledAccountTransfersCron() {
  cronJob = cron.schedule("30 2 * * *", async () => {
    console.log("[Virements Programmes] 🚀 Démarrage du job...");
    try {
      const results = await runVirementsProgrammes(new Date());
      const success = results.filter((r) => r.success).length;
      const failed = results.length - success;
      console.log(`[Virements Programmes] 🏁 Terminé: ${success} succès, ${failed} échecs`);
      results
        .filter((r) => !r.success)
        .forEach((r) => console.error(`[Virements Programmes] ❌ ${r.id}: ${r.error}`));
    } catch (error) {
      console.error("[Virements Programmes] ❌ Erreur critique:", error);
    }
  });

  console.log("[Virements Programmes] ⏰ Cron job démarré (02h30)");
}

export function stopScheduledAccountTransfersCron() {
  if (cronJob) {
    cronJob.stop();
    console.log("[Virements Programmes] ⏹️  Cron job arrêté");
  }
}
