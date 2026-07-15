import type { Express } from "express";
import { createLogger } from "../../lib/logger";
import { logAudit } from "../../lib/logger";
import {
  marches,
  arrondissements,
  prospections,
  insertMarcheSchema,
} from "@shared/schema";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { normalizeKeysDeep } from "../utils";
import { db } from "../../db";
import { eq, and, sql } from "drizzle-orm";
import { getWsInstance } from "../../ws-server";
import { notDeleted } from "../../storage/query-helpers";

const logger = createLogger("Routes:Marches");

export function registerMarchesRoutes(app: Express) {
  /**
   * GET /api/marches
   * Liste des marchés (filtrage optionnel par arrondissementId et statut actif)
   */
  app.get(
    "/api/marches",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VIEW, Subjects.ARRONDISSEMENT),
    async (req, res) => {
      try {
        const { arrondissement_id, arrondissementId, actif } = req.query as Record<string, string>;
        const filterArrondissement = arrondissement_id || arrondissementId;

        const conditions = [notDeleted(marches)];

        if (filterArrondissement) {
          conditions.push(eq(marches.arrondissementId, filterArrondissement));
        }
        if (actif === "true") {
          conditions.push(eq(marches.actif, true));
        } else if (actif === "false") {
          conditions.push(eq(marches.actif, false));
        }

        const rows = await db
          .select({
            id: marches.id,
            arrondissementId: marches.arrondissementId,
            nom: marches.nom,
            actif: marches.actif,
            createdAt: marches.createdAt,
            updatedAt: marches.updatedAt,
            arrondissementNom: arrondissements.nom,
          })
          .from(marches)
          .leftJoin(arrondissements, eq(marches.arrondissementId, arrondissements.id))
          .where(and(...conditions))
          .orderBy(marches.nom);

        res.json(rows);
      } catch (error) {
        logger.error({ err: error }, "Erreur lors du chargement des marchés");
        res.status(500).json({ message: "Erreur lors du chargement des marchés" });
      }
    }
  );

  /**
   * POST /api/marches
   * Créer un nouveau marché
   */
  app.post(
    "/api/marches",
    requireAuth,
    attachAbility,
    requireAbility(Actions.CREATE, Subjects.ARRONDISSEMENT),
    async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body) as Record<string, any>;
        const parsed = insertMarcheSchema.parse(data);

        // Vérifier que l'arrondissement existe
        const [arrondissement] = await db
          .select()
          .from(arrondissements)
          .where(
            and(
              eq(arrondissements.id, parsed.arrondissementId),
              notDeleted(arrondissements),
              eq(arrondissements.actif, true)
            )
          );

        if (!arrondissement) {
          return res.status(400).json({ message: "Arrondissement non trouvé ou inactif" });
        }

        const [row] = await db.insert(marches).values(parsed).returning();

        logAudit("CREATE_MARCHE", {
          userId: req.session?.user?.id,
          entityType: "marche",
          entityId: row.id,
          changes: { nom: parsed.nom, arrondissementId: parsed.arrondissementId },
        });

        const ws = getWsInstance();
        if (ws) {
          ws.broadcast({
            type: "OPERATIONS_UPDATE",
            payload: { type: "marche_new", id: row.id },
          });
        }

        res.status(201).json(row);
      } catch (error) {
        logger.error({ err: error }, "Erreur lors de la création du marché");
        res.status(500).json({ message: "Erreur lors de la création du marché" });
      }
    }
  );

  /**
   * PATCH /api/marches/:id
   * Mettre à jour un marché existant
   */
  app.patch(
    "/api/marches/:id",
    requireAuth,
    attachAbility,
    requireAbility(Actions.EDIT, Subjects.ARRONDISSEMENT),
    async (req, res) => {
      try {
        const { id } = req.params;
        const data = normalizeKeysDeep(req.body) as Record<string, any>;

        const [existing] = await db
          .select()
          .from(marches)
          .where(and(eq(marches.id, id), notDeleted(marches)));

        if (!existing) {
          return res.status(404).json({ message: "Marché non trouvé" });
        }

        const updates: Record<string, any> = {};
        if (typeof data.nom === "string") updates.nom = data.nom;
        if (typeof data.actif === "boolean") updates.actif = data.actif;
        if (typeof data.arrondissementId === "string") {
          // Vérifier que le nouvel arrondissement existe
          const [arrondissement] = await db
            .select()
            .from(arrondissements)
            .where(
              and(
                eq(arrondissements.id, data.arrondissementId),
                notDeleted(arrondissements),
                eq(arrondissements.actif, true)
              )
            );

          if (!arrondissement) {
            return res.status(400).json({ message: "Arrondissement non trouvé ou inactif" });
          }
          updates.arrondissementId = data.arrondissementId;
        }
        updates.updatedAt = new Date();

        const [row] = await db
          .update(marches)
          .set(updates)
          .where(eq(marches.id, id))
          .returning();

        logAudit("UPDATE_MARCHE", {
          userId: req.session?.user?.id,
          entityType: "marche",
          entityId: id,
          changes: updates,
        });

        res.json(row);
      } catch (error) {
        logger.error({ err: error }, "Erreur lors de la modification du marché");
        res.status(500).json({ message: "Erreur lors de la modification du marché" });
      }
    }
  );

  /**
   * DELETE /api/marches/:id
   * Désactiver logiquement un marché (soft delete)
   */
  app.delete(
    "/api/marches/:id",
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
          .where(and(eq(prospections.marcheId, id), notDeleted(prospections)));

        if (linkedCount && Number(linkedCount.count) > 0) {
          return res.status(409).json({
            message: `Impossible de supprimer: ${linkedCount.count} prospect(s) lié(s) à ce marché`,
          });
        }

        const [row] = await db
          .update(marches)
          .set({ actif: false, deletedAt: new Date(), updatedAt: new Date() })
          .where(eq(marches.id, id))
          .returning();

        if (!row) {
          return res.status(404).json({ message: "Marché non trouvé" });
        }

        logAudit("DELETE_MARCHE", {
          userId: req.session?.user?.id,
          entityType: "marche",
          entityId: id,
        });

        res.json({ message: "Marché désactivé", data: row });
      } catch (error) {
        logger.error({ err: error }, "Erreur lors de la désactivation du marché");
        res.status(500).json({ message: "Erreur lors de la suppression du marché" });
      }
    }
  );
}
