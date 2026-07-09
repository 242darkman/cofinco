/**
 * Routes comptes — segment /comptes (partie comptes-transferts).
 *
 * Enregistré par l'index comptes.ts dans l'ordre historique.
 * Endpoints :
 *   GET    /api/comptes/transferts/stats
 */
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { requireAgenceAccess, requireAgenceIdAccess, validateAgenceIdAction } from "../../middleware";
import { mouvementsFinanciers, operationsCaisse, transactionsCompte } from "@shared/schema/finance";
import { aliasedTable, and, eq, gte, lte, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { comptes, produitsCompte, insertProduitCompteSchema, clients, users, virementsProgrammes } from "@shared/schema";
import { logger } from "./shared";

export function registerComptesTransfertsRoutes(app: Express) {
  /**
   * GET /api/comptes/transferts/stats - Statistiques des virements instantanés
   */
  /**
   * GET /api/comptes/transferts/stats
   */
  app.get(
    "/api/comptes/transferts/stats",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VIEW, Subjects.COMPTE),
    requireAgenceIdAccess(),
    async (req, res) => {
      try {
        const txOut = aliasedTable(transactionsCompte, "tx_out");
        const sourceCompte = aliasedTable(comptes, "source_compte");
        const txIn = aliasedTable(transactionsCompte, "tx_in");
        const destCompte = aliasedTable(comptes, "dest_compte");

        const agenceConditions: any[] = [];
        if (req.selectedAgenceId) {
          agenceConditions.push(
            or(
              eq(sourceCompte.agenceId, req.selectedAgenceId),
              eq(destCompte.agenceId, req.selectedAgenceId)
            )
          );
        }

        const baseConditions = [
          eq(mouvementsFinanciers.methodePaiement, "TRANSFER"),
          ...agenceConditions,
        ];

        // Global stats
        const [globalStats] = await db
          .select({
            totalCount: sql<number>`count(*)`.mapWith(Number),
            totalAmount: sql<number>`COALESCE(sum(${mouvementsFinanciers.montant}::numeric), 0)`.mapWith(Number),
            postedCount: sql<number>`sum(case when ${mouvementsFinanciers.statut} = 'POSTED' then 1 else 0 end)`.mapWith(Number),
            reversedCount: sql<number>`sum(case when ${mouvementsFinanciers.statut} = 'REVERSED' then 1 else 0 end)`.mapWith(Number),
          })
          .from(mouvementsFinanciers)
          .leftJoin(txOut, and(
            eq(txOut.mouvementId, mouvementsFinanciers.id),
            eq(txOut.typePaiement, "TRANSFER_OUT"),
          ))
          .leftJoin(txIn, and(
            eq(txIn.mouvementId, mouvementsFinanciers.id),
            eq(txIn.typePaiement, "TRANSFER_IN"),
          ))
          .leftJoin(sourceCompte, eq(txOut.compteId, sourceCompte.id))
          .leftJoin(destCompte, eq(txIn.compteId, destCompte.id))
          .where(and(...baseConditions));

        // Monthly stats (current month)
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const [monthlyStats] = await db
          .select({
            monthCount: sql<number>`count(*)`.mapWith(Number),
            monthAmount: sql<number>`COALESCE(sum(${mouvementsFinanciers.montant}::numeric), 0)`.mapWith(Number),
          })
          .from(mouvementsFinanciers)
          .leftJoin(txOut, and(
            eq(txOut.mouvementId, mouvementsFinanciers.id),
            eq(txOut.typePaiement, "TRANSFER_OUT"),
          ))
          .leftJoin(txIn, and(
            eq(txIn.mouvementId, mouvementsFinanciers.id),
            eq(txIn.typePaiement, "TRANSFER_IN"),
          ))
          .leftJoin(sourceCompte, eq(txOut.compteId, sourceCompte.id))
          .leftJoin(destCompte, eq(txIn.compteId, destCompte.id))
          .where(and(
            ...baseConditions,
            gte(mouvementsFinanciers.dateOperation, startOfMonth),
          ));

        // Previous month for trend comparison
        const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);

        const [prevMonthStats] = await db
          .select({
            prevMonthCount: sql<number>`count(*)`.mapWith(Number),
            prevMonthAmount: sql<number>`COALESCE(sum(${mouvementsFinanciers.montant}::numeric), 0)`.mapWith(Number),
          })
          .from(mouvementsFinanciers)
          .leftJoin(txOut, and(
            eq(txOut.mouvementId, mouvementsFinanciers.id),
            eq(txOut.typePaiement, "TRANSFER_OUT"),
          ))
          .leftJoin(txIn, and(
            eq(txIn.mouvementId, mouvementsFinanciers.id),
            eq(txIn.typePaiement, "TRANSFER_IN"),
          ))
          .leftJoin(sourceCompte, eq(txOut.compteId, sourceCompte.id))
          .leftJoin(destCompte, eq(txIn.compteId, destCompte.id))
          .where(and(
            ...baseConditions,
            gte(mouvementsFinanciers.dateOperation, startOfPrevMonth),
            lte(mouvementsFinanciers.dateOperation, endOfPrevMonth),
          ));

        const prevAmount = prevMonthStats?.prevMonthAmount || 0;
        const currAmount = monthlyStats?.monthAmount || 0;
        let trend = 0;
        if (prevAmount > 0) {
          trend = ((currAmount - prevAmount) / prevAmount) * 100;
        } else if (currAmount > 0) {
          trend = 100;
        }

        res.json({
          totalCount: globalStats?.totalCount || 0,
          totalAmount: globalStats?.totalAmount || 0,
          postedCount: globalStats?.postedCount || 0,
          reversedCount: globalStats?.reversedCount || 0,
          monthCount: monthlyStats?.monthCount || 0,
          monthAmount: monthlyStats?.monthAmount || 0,
          trend: Math.round(trend),
          trendUp: trend >= 0,
        });
      } catch (error: any) {
        logger.error({ err: error }, 'Error fetching transfer stats');
        res.status(500).json({ message: "Erreur lors du chargement des statistiques" });
      }
    }
  );
}
