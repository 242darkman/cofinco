import type { Express } from "express";
import { createLogger } from "../../lib/logger";
import { logAudit } from "../../lib/logger";
import {
  arrondissements,
  marches,
  villes,
  prospections,
  insertArrondissementSchema,
} from "@shared/schema";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { normalizeKeysDeep } from "../utils";
import { db } from "../../db";
import { eq, and, sql } from "drizzle-orm";
import { getWsInstance } from "../../ws-server";
import { notDeleted } from "../../storage/query-helpers";

const logger = createLogger("Routes:Arrondissements");

export function registerArrondissementsRoutes(app: Express) {
  /**
   * GET /api/arrondissements
   * Liste des arrondissements (filtrage optionnel par statut actif)
   */
  app.get(
    "/api/arrondissements",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VIEW, Subjects.ARRONDISSEMENT),
    async (req, res) => {
      try {
        const { actif, ville_id, villeId: villeIdParam } = req.query as Record<string, string>;
        const filterVilleId = ville_id || villeIdParam;
        const conditions = [notDeleted(arrondissements)];

        if (filterVilleId) {
          conditions.push(eq(arrondissements.villeId, filterVilleId));
        }
        if (actif === "true") {
          conditions.push(eq(arrondissements.actif, true));
        } else if (actif === "false") {
          conditions.push(eq(arrondissements.actif, false));
        }

        const rows = await db
          .select({
            id: arrondissements.id,
            nom: arrondissements.nom,
            villeId: arrondissements.villeId,
            villeNom: villes.nom,
            actif: arrondissements.actif,
            createdAt: arrondissements.createdAt,
            updatedAt: arrondissements.updatedAt,
          })
          .from(arrondissements)
          .leftJoin(villes, eq(arrondissements.villeId, villes.id))
          .where(and(...conditions))
          .orderBy(villes.nom, arrondissements.nom);

        res.json(rows);
      } catch (error) {
        logger.error({ err: error }, "Erreur lors du chargement des arrondissements");
        res.status(500).json({ message: "Erreur lors du chargement des arrondissements" });
      }
    }
  );

  /**
   * POST /api/arrondissements
   * Créer un nouvel arrondissement
   */
  app.post(
    "/api/arrondissements",
    requireAuth,
    attachAbility,
    requireAbility(Actions.CREATE, Subjects.ARRONDISSEMENT),
    async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body) as Record<string, any>;
        const parsed = insertArrondissementSchema.parse(data);

        const [row] = await db
          .insert(arrondissements)
          .values(parsed)
          .returning();

        logAudit("CREATE_ARRONDISSEMENT", {
          userId: req.session?.user?.id,
          entityType: "arrondissement",
          entityId: row.id,
          changes: { nom: parsed.nom, villeId: parsed.villeId },
        });

        const ws = getWsInstance();
        if (ws) {
          ws.broadcast({
            type: "OPERATIONS_UPDATE",
            payload: { type: "arrondissement_new", id: row.id },
          });
        }

        res.status(201).json(row);
      } catch (error) {
        logger.error({ err: error }, "Erreur lors de la création de l'arrondissement");
        res.status(500).json({ message: "Erreur lors de la création de l'arrondissement" });
      }
    }
  );

  /**
   * PATCH /api/arrondissements/:id
   * Mettre à jour un arrondissement existant
   */
  app.patch(
    "/api/arrondissements/:id",
    requireAuth,
    attachAbility,
    requireAbility(Actions.EDIT, Subjects.ARRONDISSEMENT),
    async (req, res) => {
      try {
        const { id } = req.params;
        const data = normalizeKeysDeep(req.body) as Record<string, any>;

        const [existing] = await db
          .select()
          .from(arrondissements)
          .where(and(eq(arrondissements.id, id), notDeleted(arrondissements)));

        if (!existing) {
          return res.status(404).json({ message: "Arrondissement non trouvé" });
        }

        const updates: Record<string, any> = {};
        if (typeof data.nom === "string") updates.nom = data.nom;
        if (typeof data.villeId === "string") updates.villeId = data.villeId;
        if (typeof data.actif === "boolean") updates.actif = data.actif;
        updates.updatedAt = new Date();

        const [row] = await db
          .update(arrondissements)
          .set(updates)
          .where(eq(arrondissements.id, id))
          .returning();

        logAudit("UPDATE_ARRONDISSEMENT", {
          userId: req.session?.user?.id,
          entityType: "arrondissement",
          entityId: id,
          changes: updates,
        });

        res.json(row);
      } catch (error) {
        logger.error({ err: error }, "Erreur lors de la modification de l'arrondissement");
        res.status(500).json({ message: "Erreur lors de la modification de l'arrondissement" });
      }
    }
  );

  /**
   * DELETE /api/arrondissements/:id
   * Désactiver logiquement un arrondissement (soft delete)
   */
  app.delete(
    "/api/arrondissements/:id",
    requireAuth,
    attachAbility,
    requireAbility(Actions.DELETE, Subjects.ARRONDISSEMENT),
    async (req, res) => {
      try {
        const { id } = req.params;

        // Vérification des prospects liés
        const [linkedCount] = await db
          .select({ count: sql<number>`count(*)` })
          .from(prospections)
          .where(
            and(
              eq(prospections.arrondissementId, id),
              notDeleted(prospections)
            )
          );

        if (linkedCount && Number(linkedCount.count) > 0) {
          return res.status(409).json({
            message: `Impossible de supprimer: ${linkedCount.count} prospect(s) lié(s) à cet arrondissement`,
          });
        }

        // Vérification des marchés liés et actifs
        const [linkedMarches] = await db
          .select({ count: sql<number>`count(*)` })
          .from(marches)
          .where(
            and(
              eq(marches.arrondissementId, id),
              notDeleted(marches),
              eq(marches.actif, true)
            )
          );

        if (linkedMarches && Number(linkedMarches.count) > 0) {
          return res.status(409).json({
            message: `Impossible de supprimer: ${linkedMarches.count} marché(s) actif(s) dans cet arrondissement`,
          });
        }

        const [row] = await db
          .update(arrondissements)
          .set({ actif: false, deletedAt: new Date(), updatedAt: new Date() })
          .where(eq(arrondissements.id, id))
          .returning();

        if (!row) {
          return res.status(404).json({ message: "Arrondissement non trouvé" });
        }

        logAudit("DELETE_ARRONDISSEMENT", {
          userId: req.session?.user?.id,
          entityType: "arrondissement",
          entityId: id,
        });

        res.json({ message: "Arrondissement désactivé", data: row });
      } catch (error) {
        logger.error({ err: error }, "Erreur lors de la désactivation de l'arrondissement");
        res.status(500).json({ message: "Erreur lors de la suppression de l'arrondissement" });
      }
    }
  );
}
