/**
 * Routes API pour la gestion des tâches de régularisation
 * Utilisé par le dashboard admin pour suivre et résoudre les anomalies financières
 */

import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { tachesRegularisation, transfertsInterCoffres, users } from "@shared/schema";
import { tachesRegularisationCoffreCaisse, transfertsCoffreCaisse } from "@shared/schema/coffre";
import { and, eq, desc, sql, inArray, isNull, isNotNull, or, gte, lte } from "drizzle-orm";
import { requireAuth } from "../auth";
import { attachAbility, requireAbility } from "../authorization";
import { Actions, Subjects } from "@shared/ability";
import {
  StatutTacheRegularisation,
  TypeTacheRegularisation,
  Priorite,
  STATUT_TACHE_REGULARISATION_LABELS,
  TYPE_TACHE_REGULARISATION_LABELS,
  PRIORITE_LABELS,
} from "@shared/enum/status-constants";

export const regularisationRouter = Router();

// Middleware d'authentification
regularisationRouter.use(requireAuth);

// ============================================================================
// SCHÉMAS DE VALIDATION
// ============================================================================

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

const resolveSchema = z.object({
  resolution: z.string().min(10, "La résolution doit contenir au moins 10 caractères"),
  newStatut: z.enum(["RESOLVED", "ESCALATED"]).optional().default("RESOLVED"),
});

const assignSchema = z.object({
  assignedTo: z.string().uuid("ID utilisateur invalide"),
});

const updatePrioriteSchema = z.object({
  priorite: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]),
});

// ============================================================================
// ROUTES - LISTE DES TÂCHES
// ============================================================================

/**
 * GET /api/admin/regularisations
 * Liste toutes les tâches de régularisation avec filtres
 */
regularisationRouter.get(
  "/",
  attachAbility, requireAbility(Actions.VIEW, Subjects.REGULARISATION),
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
      const userId = (req as any).session?.user?.id;

      // Construire les conditions de filtrage pour les deux sources
      const buildConditions = (table: typeof tachesRegularisation | typeof tachesRegularisationCoffreCaisse) => {
        const conditions: any[] = [];

        if (statut) {
          conditions.push(eq(table.statut, statut));
        }
        if (type) {
          conditions.push(eq(table.type, type));
        }
        if (priorite) {
          conditions.push(eq(table.priorite, priorite));
        }
        if (assignedToMe && userId) {
          conditions.push(eq(table.assignedTo, userId));
        }
        if (dateFrom) {
          conditions.push(gte(table.createdAt, new Date(dateFrom)));
        }
        if (dateTo) {
          conditions.push(lte(table.createdAt, new Date(dateTo)));
        }

        return conditions.length > 0 ? and(...conditions) : undefined;
      };

      const results: Array<{
        id: string;
        source: "coffre" | "coffre-caisse";
        type: string;
        typeLabel: string;
        description: string;
        montantEcart: string | null;
        statut: string;
        statutLabel: string;
        priorite: string;
        prioriteLabel: string;
        assignedTo: string | null;
        assignedToName: string | null;
        dateEcheance: string | null;
        resolution: string | null;
        resolvedBy: string | null;
        resolvedAt: Date | null;
        transfertId: string | null;
        createdAt: Date | null;
        updatedAt: Date | null;
      }> = [];

      // Requête pour tachesRegularisation (inter-coffres et virements programmés)
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

      // Requête pour tachesRegularisationCoffreCaisse
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

      // Tri global par priorité puis date
      results.sort((a, b) => {
        const priorityOrder = { CRITICAL: 1, HIGH: 2, NORMAL: 3, LOW: 4 };
        const aPriority = priorityOrder[a.priorite as keyof typeof priorityOrder] || 5;
        const bPriority = priorityOrder[b.priorite as keyof typeof priorityOrder] || 5;

        if (aPriority !== bPriority) return aPriority - bPriority;

        const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bDate - aDate;
      });

      // Pagination
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
      console.error("Erreur liste régularisations:", error);
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

/**
 * GET /api/admin/regularisations/stats
 * Statistiques globales des tâches de régularisation
 */
regularisationRouter.get(
  "/stats",
  attachAbility, requireAbility(Actions.VIEW, Subjects.REGULARISATION),
  async (req, res) => {
    try {
      // Stats pour tachesRegularisation
      const coffreStats = await db
        .select({
          statut: tachesRegularisation.statut,
          priorite: tachesRegularisation.priorite,
          count: sql<number>`count(*)::int`,
          totalMontant: sql<string>`COALESCE(SUM(${tachesRegularisation.montantEcart}::numeric), 0)::text`,
        })
        .from(tachesRegularisation)
        .groupBy(tachesRegularisation.statut, tachesRegularisation.priorite);

      // Stats pour tachesRegularisationCoffreCaisse
      const coffreCaisseStats = await db
        .select({
          statut: tachesRegularisationCoffreCaisse.statut,
          priorite: tachesRegularisationCoffreCaisse.priorite,
          count: sql<number>`count(*)::int`,
          totalMontant: sql<string>`COALESCE(SUM(${tachesRegularisationCoffreCaisse.montantEcart}::numeric), 0)::text`,
        })
        .from(tachesRegularisationCoffreCaisse)
        .groupBy(tachesRegularisationCoffreCaisse.statut, tachesRegularisationCoffreCaisse.priorite);

      // Agrégation des stats
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

          // Par statut
          if (!statsByStatut[statut]) {
            statsByStatut[statut] = { count: 0, montant: 0 };
          }
          statsByStatut[statut].count += count;
          statsByStatut[statut].montant += montant;

          // Par priorité
          if (!statsByPriorite[priorite]) {
            statsByPriorite[priorite] = { count: 0, montant: 0 };
          }
          statsByPriorite[priorite].count += count;
          statsByPriorite[priorite].montant += montant;

          // Totaux
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
      console.error("Erreur stats régularisations:", error);
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

/**
 * GET /api/admin/regularisations/:source/:id
 * Détails d'une tâche de régularisation
 */
regularisationRouter.get(
  "/:source/:id",
  attachAbility, requireAbility(Actions.VIEW, Subjects.REGULARISATION),
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

          // Récupérer le transfert associé si présent
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

          // Récupérer le transfert coffre-caisse associé si présent
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

      res.json({
        task,
        transfert,
      });
    } catch (error: any) {
      console.error("Erreur détails régularisation:", error);
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

/**
 * POST /api/admin/regularisations/:source/:id/resolve
 * Marquer une tâche comme résolue
 */
regularisationRouter.post(
  "/:source/:id/resolve",
  attachAbility, requireAbility(Actions.VIEW, Subjects.REGULARISATION),
  async (req, res) => {
    try {
      const { source, id } = req.params;
      const userId = (req as any).session?.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      if (source !== "coffre" && source !== "coffre-caisse") {
        return res.status(400).json({ error: "Source invalide (coffre ou coffre-caisse)" });
      }

      const parsed = resolveSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Données invalides",
          details: parsed.error.flatten(),
        });
      }

      const { resolution, newStatut } = parsed.data;

      if (source === "coffre") {
        const [task] = await db
          .select()
          .from(tachesRegularisation)
          .where(eq(tachesRegularisation.id, id));

        if (!task) {
          return res.status(404).json({ error: "Tâche non trouvée" });
        }

        if (task.statut === StatutTacheRegularisation.RESOLVED || task.statut === StatutTacheRegularisation.ESCALATED) {
          return res.status(400).json({ error: "Cette tâche est déjà résolue" });
        }

        const [updated] = await db
          .update(tachesRegularisation)
          .set({
            statut: newStatut,
            resolution,
            resolvedBy: userId,
            resolvedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(tachesRegularisation.id, id))
          .returning();

        res.json({ success: true, task: updated });
      } else {
        const [task] = await db
          .select()
          .from(tachesRegularisationCoffreCaisse)
          .where(eq(tachesRegularisationCoffreCaisse.id, id));

        if (!task) {
          return res.status(404).json({ error: "Tâche non trouvée" });
        }

        if (task.statut === StatutTacheRegularisation.RESOLVED || task.statut === StatutTacheRegularisation.ESCALATED) {
          return res.status(400).json({ error: "Cette tâche est déjà résolue" });
        }

        const [updated] = await db
          .update(tachesRegularisationCoffreCaisse)
          .set({
            statut: newStatut,
            resolution,
            resolvedBy: userId,
            resolvedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(tachesRegularisationCoffreCaisse.id, id))
          .returning();

        res.json({ success: true, task: updated });
      }
    } catch (error: any) {
      console.error("Erreur résolution régularisation:", error);
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

/**
 * POST /api/admin/regularisations/:source/:id/assign
 * Assigner une tâche à un utilisateur
 */
regularisationRouter.post(
  "/:source/:id/assign",
  attachAbility, requireAbility(Actions.VIEW, Subjects.REGULARISATION),
  async (req, res) => {
    try {
      const { source, id } = req.params;

      if (source !== "coffre" && source !== "coffre-caisse") {
        return res.status(400).json({ error: "Source invalide (coffre ou coffre-caisse)" });
      }

      const parsed = assignSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Données invalides",
          details: parsed.error.flatten(),
        });
      }

      const { assignedTo } = parsed.data;

      // Vérifier que l'utilisateur existe
      const [user] = await db.select().from(users).where(eq(users.id, assignedTo));
      if (!user) {
        return res.status(404).json({ error: "Utilisateur non trouvé" });
      }

      if (source === "coffre") {
        const [updated] = await db
          .update(tachesRegularisation)
          .set({
            assignedTo,
            statut: StatutTacheRegularisation.IN_PROGRESS,
            updatedAt: new Date(),
          })
          .where(eq(tachesRegularisation.id, id))
          .returning();

        if (!updated) {
          return res.status(404).json({ error: "Tâche non trouvée" });
        }

        res.json({ success: true, task: updated });
      } else {
        const [updated] = await db
          .update(tachesRegularisationCoffreCaisse)
          .set({
            assignedTo,
            statut: StatutTacheRegularisation.IN_PROGRESS,
            updatedAt: new Date(),
          })
          .where(eq(tachesRegularisationCoffreCaisse.id, id))
          .returning();

        if (!updated) {
          return res.status(404).json({ error: "Tâche non trouvée" });
        }

        res.json({ success: true, task: updated });
      }
    } catch (error: any) {
      console.error("Erreur assignation régularisation:", error);
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

/**
 * PATCH /api/admin/regularisations/:source/:id/priorite
 * Modifier la priorité d'une tâche
 */
regularisationRouter.patch(
  "/:source/:id/priorite",
  attachAbility, requireAbility(Actions.MANAGE, Subjects.REGULARISATION),
  async (req, res) => {
    try {
      const { source, id } = req.params;

      if (source !== "coffre" && source !== "coffre-caisse") {
        return res.status(400).json({ error: "Source invalide (coffre ou coffre-caisse)" });
      }

      const parsed = updatePrioriteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Données invalides",
          details: parsed.error.flatten(),
        });
      }

      const { priorite } = parsed.data;

      if (source === "coffre") {
        const [updated] = await db
          .update(tachesRegularisation)
          .set({
            priorite,
            updatedAt: new Date(),
          })
          .where(eq(tachesRegularisation.id, id))
          .returning();

        if (!updated) {
          return res.status(404).json({ error: "Tâche non trouvée" });
        }

        res.json({ success: true, task: updated });
      } else {
        const [updated] = await db
          .update(tachesRegularisationCoffreCaisse)
          .set({
            priorite,
            updatedAt: new Date(),
          })
          .where(eq(tachesRegularisationCoffreCaisse.id, id))
          .returning();

        if (!updated) {
          return res.status(404).json({ error: "Tâche non trouvée" });
        }

        res.json({ success: true, task: updated });
      }
    } catch (error: any) {
      console.error("Erreur mise à jour priorité:", error);
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

export default regularisationRouter;
