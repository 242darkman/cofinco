/**
 * @module routes/regularisation/list
 * Routes API pour la liste des tâches de régularisation.
 */

import type { Express } from "express";
import { createLogger } from "../../lib/logger";
import { z } from "zod";
import { db } from "../../db";
import { tachesRegularisation, users } from "@shared/schema";
import { tachesRegularisationCoffreCaisse } from "@shared/schema/coffre";
import { and, eq, desc, sql, gte, lte } from "drizzle-orm";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import {
  STATUT_TACHE_REGULARISATION_LABELS,
  TYPE_TACHE_REGULARISATION_LABELS,
  PRIORITE_LABELS,
} from "@shared/enum/status-constants";

const logger = createLogger('Routes:Regularisation:List');

const listQuerySchema = z.object({
  statut: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "ESCALATED"]).optional(),
  type: z.enum([
    "ECART_RECEPTION",
    "RECONCILIATION_EN_ATTENTE",
    "VIREMENT_PROG_ECHEC",
    "VIREMENT_AUTO_ECHEC",
    "ECART_COFFRE_CAISSE",
  ]).optional(),
  priorite: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).optional(),
  source: z.enum(["all", "coffre", "coffre-caisse"]).optional().default("all"),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
  assignedToMe: z.coerce.boolean().optional().default(false),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

/**
 * Enregistre les routes pour lister les régularisations.
 */
export function registerRegularisationListRoutes(app: Express): void {
  /**
   * GET /api/admin/regularisations
   * Liste toutes les tâches de régularisation avec filtres
   */
  app.get(
    "/api/admin/regularisations",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VIEW, Subjects.REGULARISATION),
    async (req, res) => {
      try {
        const parsed = listQuerySchema.safeParse(req.query);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Paramètres invalides",
            details: parsed.error.flatten(),
          });
        }

        const { statut, type, priorite, source, limit, offset, assignedToMe, dateFrom, dateTo } = parsed.data;
        const userId = req.session?.user?.id;

        const buildConditions = (table: typeof tachesRegularisation | typeof tachesRegularisationCoffreCaisse) => {
          const conditions: any[] = [];

          if (statut) conditions.push(eq(table.statut, statut));
          if (type) conditions.push(eq(table.type, type));
          if (priorite) conditions.push(eq(table.priorite, priorite));
          if (assignedToMe && userId) conditions.push(eq(table.assignedTo, userId));
          if (dateFrom) conditions.push(gte(table.createdAt, new Date(dateFrom)));
          if (dateTo) conditions.push(lte(table.createdAt, new Date(dateTo)));

          return conditions.length > 0 ? and(...conditions) : undefined;
        };

        const results: any[] = [];

        if (source === "all" || source === "coffre") {
          const coffreConditions = buildConditions(tachesRegularisation);
          const coffreTasks = await db
            .select({
              id: tachesRegularisation.id,
              type: tachesRegularisation.type,
              description: tachesRegularisation.description,
              montantEcart: tachesRegularisation.montantEcart,
              statut: tachesRegularisation.statut,
              priorite: tachesRegularisation.priorite,
              assignedTo: tachesRegularisation.assignedTo,
              assignedToName: users.nom,
              dateEcheance: tachesRegularisation.dateEcheance,
              resolution: tachesRegularisation.resolution,
              resolvedBy: tachesRegularisation.resolvedBy,
              resolvedAt: tachesRegularisation.resolvedAt,
              transfertId: tachesRegularisation.transfertId,
              createdAt: tachesRegularisation.createdAt,
              updatedAt: tachesRegularisation.updatedAt,
            })
            .from(tachesRegularisation)
            .leftJoin(users, eq(tachesRegularisation.assignedTo, users.id))
            .where(coffreConditions)
            .orderBy(
              desc(sql`CASE ${tachesRegularisation.priorite}
                WHEN 'CRITICAL' THEN 1
                WHEN 'HIGH' THEN 2
                WHEN 'NORMAL' THEN 3
                WHEN 'LOW' THEN 4
              END`),
              desc(tachesRegularisation.createdAt)
            );

          for (const task of coffreTasks) {
            results.push({
              ...task,
              source: "coffre",
              typeLabel: TYPE_TACHE_REGULARISATION_LABELS[task.type as keyof typeof TYPE_TACHE_REGULARISATION_LABELS] || task.type,
              statutLabel: STATUT_TACHE_REGULARISATION_LABELS[task.statut as keyof typeof STATUT_TACHE_REGULARISATION_LABELS] || task.statut,
              prioriteLabel: PRIORITE_LABELS[task.priorite as keyof typeof PRIORITE_LABELS] || task.priorite,
            });
          }
        }

        if (source === "all" || source === "coffre-caisse") {
          const coffreCaisseConditions = buildConditions(tachesRegularisationCoffreCaisse);
          const coffreCaisseTasks = await db
            .select({
              id: tachesRegularisationCoffreCaisse.id,
              type: tachesRegularisationCoffreCaisse.type,
              description: tachesRegularisationCoffreCaisse.description,
              montantEcart: tachesRegularisationCoffreCaisse.montantEcart,
              statut: tachesRegularisationCoffreCaisse.statut,
              priorite: tachesRegularisationCoffreCaisse.priorite,
              assignedTo: tachesRegularisationCoffreCaisse.assignedTo,
              assignedToName: users.nom,
              dateEcheance: tachesRegularisationCoffreCaisse.dateEcheance,
              resolution: tachesRegularisationCoffreCaisse.resolution,
              resolvedBy: tachesRegularisationCoffreCaisse.resolvedBy,
              resolvedAt: tachesRegularisationCoffreCaisse.resolvedAt,
              transfertId: tachesRegularisationCoffreCaisse.transfertId,
              createdAt: tachesRegularisationCoffreCaisse.createdAt,
              updatedAt: tachesRegularisationCoffreCaisse.updatedAt,
            })
            .from(tachesRegularisationCoffreCaisse)
            .leftJoin(users, eq(tachesRegularisationCoffreCaisse.assignedTo, users.id))
            .where(coffreCaisseConditions)
            .orderBy(
              desc(sql`CASE ${tachesRegularisationCoffreCaisse.priorite}
                WHEN 'CRITICAL' THEN 1
                WHEN 'HIGH' THEN 2
                WHEN 'NORMAL' THEN 3
                WHEN 'LOW' THEN 4
              END`),
              desc(tachesRegularisationCoffreCaisse.createdAt)
            );

          for (const task of coffreCaisseTasks) {
            results.push({
              ...task,
              source: "coffre-caisse",
              dateEcheance: task.dateEcheance ? task.dateEcheance.toISOString() : null,
              typeLabel: TYPE_TACHE_REGULARISATION_LABELS[task.type as keyof typeof TYPE_TACHE_REGULARISATION_LABELS] || task.type,
              statutLabel: STATUT_TACHE_REGULARISATION_LABELS[task.statut as keyof typeof STATUT_TACHE_REGULARISATION_LABELS] || task.statut,
              prioriteLabel: PRIORITE_LABELS[task.priorite as keyof typeof PRIORITE_LABELS] || task.priorite,
            });
          }
        }

        results.sort((a, b) => {
          const priorityOrder = { CRITICAL: 1, HIGH: 2, NORMAL: 3, LOW: 4 };
          const aPriority = priorityOrder[a.priorite as keyof typeof priorityOrder] || 5;
          const bPriority = priorityOrder[b.priorite as keyof typeof priorityOrder] || 5;

          if (aPriority !== bPriority) return aPriority - bPriority;

          const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bDate - aDate;
        });

        const total = results.length;
        const paginatedResults = results.slice(offset, offset + limit);

        res.json({
          data: paginatedResults,
          pagination: {
            total,
            limit,
            offset,
            totalPages: Math.ceil(total / limit),
            currentPage: Math.floor(offset / limit) + 1,
          },
        });
      } catch (error: any) {
        logger.error({ err: error }, 'Erreur liste régularisations');
        res.status(500).json({ error: error.message || "Erreur interne" });
      }
    }
  );
}
