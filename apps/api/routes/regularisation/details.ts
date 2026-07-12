/**
 * @module routes/regularisation/details
 * Routes API pour consulter le détail d'une tâche de régularisation.
 */

import type { Express } from "express";
import { createLogger } from "../../lib/logger";
import { db } from "../../db";
import { tachesRegularisation, transfertsInterCoffres, users } from "@shared/schema";
import { tachesRegularisationCoffreCaisse, transfertsCoffreCaisse } from "@shared/schema/coffre";
import { eq } from "drizzle-orm";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import {
  STATUT_TACHE_REGULARISATION_LABELS,
  TYPE_TACHE_REGULARISATION_LABELS,
  PRIORITE_LABELS,
} from "@shared/enum/status-constants";

const logger = createLogger('Routes:Regularisation:Details');

/**
 * Enregistre les routes de détails de régularisation.
 */
export function registerRegularisationDetailsRoutes(app: Express): void {
  /**
   * GET /api/admin/regularisations/:source/:id
   * Détails d'une tâche de régularisation
   */
  app.get(
    "/api/admin/regularisations/:source/:id",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VIEW, Subjects.REGULARISATION),
    async (req, res) => {
      try {
        const { source, id } = req.params;

        if (source !== "coffre" && source !== "coffre-caisse") {
          return res.status(400).json({ error: "Source invalide (coffre ou coffre-caisse)" });
        }

        let task: any = null;
        let transfert: any = null;

        if (source === "coffre") {
          const [result] = await db
            .select({
              task: tachesRegularisation,
              assignedUser: users,
            })
            .from(tachesRegularisation)
            .leftJoin(users, eq(tachesRegularisation.assignedTo, users.id))
            .where(eq(tachesRegularisation.id, id));

          if (result) {
            task = result.task;

            if (task.transfertId) {
              const [transfertResult] = await db
                .select()
                .from(transfertsInterCoffres)
                .where(eq(transfertsInterCoffres.id, task.transfertId));
              transfert = transfertResult;
            }

            task = {
              ...task,
              source: "coffre",
              assignedToName: result.assignedUser?.nom || null,
              typeLabel: TYPE_TACHE_REGULARISATION_LABELS[task.type as keyof typeof TYPE_TACHE_REGULARISATION_LABELS] || task.type,
              statutLabel: STATUT_TACHE_REGULARISATION_LABELS[task.statut as keyof typeof STATUT_TACHE_REGULARISATION_LABELS] || task.statut,
              prioriteLabel: PRIORITE_LABELS[task.priorite as keyof typeof PRIORITE_LABELS] || task.priorite,
            };
          }
        } else {
          const [result] = await db
            .select({
              task: tachesRegularisationCoffreCaisse,
              assignedUser: users,
            })
            .from(tachesRegularisationCoffreCaisse)
            .leftJoin(users, eq(tachesRegularisationCoffreCaisse.assignedTo, users.id))
            .where(eq(tachesRegularisationCoffreCaisse.id, id));

          if (result) {
            task = result.task;

            if (task.transfertId) {
              const [transfertResult] = await db
                .select()
                .from(transfertsCoffreCaisse)
                .where(eq(transfertsCoffreCaisse.id, task.transfertId));
              transfert = transfertResult;
            }

            task = {
              ...task,
              source: "coffre-caisse",
              assignedToName: result.assignedUser?.nom || null,
              typeLabel: TYPE_TACHE_REGULARISATION_LABELS[task.type as keyof typeof TYPE_TACHE_REGULARISATION_LABELS] || task.type,
              statutLabel: STATUT_TACHE_REGULARISATION_LABELS[task.statut as keyof typeof STATUT_TACHE_REGULARISATION_LABELS] || task.statut,
              prioriteLabel: PRIORITE_LABELS[task.priorite as keyof typeof PRIORITE_LABELS] || task.priorite,
            };
          }
        }

        if (!task) {
          return res.status(404).json({ error: "Tâche non trouvée" });
        }

        res.json({ task, transfert });
      } catch (error: any) {
        logger.error({ err: error }, 'Erreur détails régularisation');
        res.status(500).json({ error: error.message || "Erreur interne" });
      }
    }
  );
}
