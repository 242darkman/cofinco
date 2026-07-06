import type { Express } from "express";
import { createLogger } from "../lib/logger";
import { logAudit } from "../lib/logger";
import {
  arrondissements,
  marches,
  villes,
  prospections,
  insertArrondissementSchema,
  insertMarcheSchema,
} from "@shared/schema";
import { requireAuth } from "../auth";
import { attachAbility, requireAbility } from "../authorization";
import { Actions, Subjects } from "@shared/ability";
import { normalizeKeysDeep } from "./utils";
import { db } from "../db";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import { getWsInstance } from "../ws-server";
import { notDeleted } from "../storage/query-helpers";

const logger = createLogger("ZoneManagement");

export function registerZoneManagementRoutes(app: Express) {
  // ============================================================
  // ARRONDISSEMENTS
  // ============================================================

  // GET /api/arrondissements - List arrondissements (optionally filter by actif)
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
        logger.error({ err: error }, "Error listing arrondissements");
        res.status(500).json({ message: "Erreur lors du chargement des arrondissements" });
      }
    }
  );

  // POST /api/arrondissements - Create arrondissement
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
        logger.error({ err: error }, "Error creating arrondissement");
        res.status(500).json({ message: "Erreur lors de la création de l'arrondissement" });
      }
    }
  );

  // PATCH /api/arrondissements/:id - Update arrondissement
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
        logger.error({ err: error }, "Error updating arrondissement");
        res.status(500).json({ message: "Erreur lors de la modification de l'arrondissement" });
      }
    }
  );

  // DELETE /api/arrondissements/:id - Soft deactivate arrondissement
  app.delete(
    "/api/arrondissements/:id",
    requireAuth,
    attachAbility,
    requireAbility(Actions.DELETE, Subjects.ARRONDISSEMENT),
    async (req, res) => {
      try {
        const { id } = req.params;

        // Check for linked prospects
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

        // Also check linked markets
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
        logger.error({ err: error }, "Error deleting arrondissement");
        res.status(500).json({ message: "Erreur lors de la suppression de l'arrondissement" });
      }
    }
  );

  // ============================================================
  // MARCHES
  // ============================================================

  // GET /api/marches - List markets (filter by arrondissementId, actif)
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
        logger.error({ err: error }, "Error listing marches");
        res.status(500).json({ message: "Erreur lors du chargement des marchés" });
      }
    }
  );

  // POST /api/marches - Create market
  app.post(
    "/api/marches",
    requireAuth,
    attachAbility,
    requireAbility(Actions.CREATE, Subjects.ARRONDISSEMENT),
    async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body) as Record<string, any>;
        const parsed = insertMarcheSchema.parse(data);

        // Verify arrondissement exists
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
        logger.error({ err: error }, "Error creating marche");
        res.status(500).json({ message: "Erreur lors de la création du marché" });
      }
    }
  );

  // PATCH /api/marches/:id - Update market
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
          // Verify new arrondissement exists
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
        logger.error({ err: error }, "Error updating marche");
        res.status(500).json({ message: "Erreur lors de la modification du marché" });
      }
    }
  );

  // DELETE /api/marches/:id - Soft deactivate market
  app.delete(
    "/api/marches/:id",
    requireAuth,
    attachAbility,
    requireAbility(Actions.DELETE, Subjects.ARRONDISSEMENT),
    async (req, res) => {
      try {
        const { id } = req.params;

        // Check for linked prospects
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
        logger.error({ err: error }, "Error deleting marche");
        res.status(500).json({ message: "Erreur lors de la suppression du marché" });
      }
    }
  );
}
