/**
 * @module routes/regularisation/stats
 * Routes API pour les statistiques de régularisation.
 */

import type { Express } from "express";
import { createLogger } from "../../lib/logger";
import { db } from "../../db";
import { tachesRegularisation } from "@shared/schema";
import { tachesRegularisationCoffreCaisse } from "@shared/schema/coffre";
import { sql } from "drizzle-orm";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import {
  StatutTacheRegularisation,
  Priorite,
  STATUT_TACHE_REGULARISATION_LABELS,
  PRIORITE_LABELS,
} from "@shared/enum/status-constants";

const logger = createLogger('Routes:Regularisation:Stats');

/**
 * Enregistre les routes de statistiques des régularisations.
 */
export function registerRegularisationStatsRoutes(app: Express): void {
  /**
   * GET /api/admin/regularisations/stats
   * Statistiques globales des tâches de régularisation
   */
  app.get(
    "/api/admin/regularisations/stats",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VIEW, Subjects.REGULARISATION),
    async (_req, res) => {
      try {
        const coffreStats = await db
          .select({
            statut: tachesRegularisation.statut,
            priorite: tachesRegularisation.priorite,
            count: sql<number>`count(*)::int`,
            totalMontant: sql<string>`COALESCE(SUM(${tachesRegularisation.montantEcart}::numeric), 0)::text`,
          })
          .from(tachesRegularisation)
          .groupBy(tachesRegularisation.statut, tachesRegularisation.priorite);

        const coffreCaisseStats = await db
          .select({
            statut: tachesRegularisationCoffreCaisse.statut,
            priorite: tachesRegularisationCoffreCaisse.priorite,
            count: sql<number>`count(*)::int`,
            totalMontant: sql<string>`COALESCE(SUM(${tachesRegularisationCoffreCaisse.montantEcart}::numeric), 0)::text`,
          })
          .from(tachesRegularisationCoffreCaisse)
          .groupBy(tachesRegularisationCoffreCaisse.statut, tachesRegularisationCoffreCaisse.priorite);

        const statsByStatut: Record<string, { count: number; montant: number }> = {};
        const statsByPriorite: Record<string, { count: number; montant: number }> = {};

        let totalOpen = 0;
        let totalResolved = 0;
        let totalCritical = 0;
        let totalMontantEcart = 0;

        const processStats = (stats: typeof coffreStats) => {
          for (const row of stats) {
            const statut = row.statut;
            const priorite = row.priorite;
            const count = row.count;
            const montant = Number(row.totalMontant) || 0;

            if (!statsByStatut[statut]) statsByStatut[statut] = { count: 0, montant: 0 };
            statsByStatut[statut].count += count;
            statsByStatut[statut].montant += montant;

            if (!statsByPriorite[priorite]) statsByPriorite[priorite] = { count: 0, montant: 0 };
            statsByPriorite[priorite].count += count;
            statsByPriorite[priorite].montant += montant;

            if (statut === StatutTacheRegularisation.OPEN || statut === StatutTacheRegularisation.IN_PROGRESS) {
              totalOpen += count;
              totalMontantEcart += montant;
            }
            if (statut === StatutTacheRegularisation.RESOLVED || statut === StatutTacheRegularisation.ESCALATED) {
              totalResolved += count;
            }
            if (priorite === Priorite.CRITICAL) {
              totalCritical += count;
            }
          }
        };

        processStats(coffreStats);
        processStats(coffreCaisseStats);

        res.json({
          summary: {
            totalOpen,
            totalResolved,
            totalCritical,
            totalMontantEcart,
          },
          byStatut: Object.entries(statsByStatut).map(([statut, data]) => ({
            statut,
            statutLabel: STATUT_TACHE_REGULARISATION_LABELS[statut as keyof typeof STATUT_TACHE_REGULARISATION_LABELS] || statut,
            ...data,
          })),
          byPriorite: Object.entries(statsByPriorite).map(([priorite, data]) => ({
            priorite,
            prioriteLabel: PRIORITE_LABELS[priorite as keyof typeof PRIORITE_LABELS] || priorite,
            ...data,
          })),
        });
      } catch (error: any) {
        logger.error({ err: error }, 'Erreur stats régularisations');
        res.status(500).json({ error: error.message || "Erreur interne" });
      }
    }
  );
}
