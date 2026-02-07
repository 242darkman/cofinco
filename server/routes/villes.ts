import type { Express } from "express";
import { createLogger } from "../lib/logger";
import { departements, villes } from "@shared/schema";
import { requireAuth } from "../auth";
import { db } from "../db";
import { eq, and } from "drizzle-orm";

const logger = createLogger("Villes");

export function registerVilleRoutes(app: Express) {
  // GET /api/departements - List all departements
  app.get("/api/departements", requireAuth, async (req, res) => {
    try {
      const { actif } = req.query;
      const conditions = [];

      if (actif === "true") {
        conditions.push(eq(departements.actif, true));
      } else if (actif === "false") {
        conditions.push(eq(departements.actif, false));
      }

      const rows = await db
        .select()
        .from(departements)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(departements.nom);

      res.json(rows);
    } catch (error) {
      logger.error({ err: error }, "Error listing departements");
      res.status(500).json({ message: "Erreur lors du chargement des départements" });
    }
  });

  // GET /api/villes - List villes (optionally filter by departementId, actif)
  app.get("/api/villes", requireAuth, async (req, res) => {
    try {
      const { departement_id, departementId, actif } = req.query as Record<string, string>;
      const filterDeptId = departement_id || departementId;
      const conditions = [];

      if (filterDeptId) {
        conditions.push(eq(villes.departementId, filterDeptId));
      }
      if (actif === "true") {
        conditions.push(eq(villes.actif, true));
      } else if (actif === "false") {
        conditions.push(eq(villes.actif, false));
      }

      const rows = await db
        .select({
          id: villes.id,
          nom: villes.nom,
          departementId: villes.departementId,
          departementNom: departements.nom,
          latitude: villes.latitude,
          longitude: villes.longitude,
          isChefLieu: villes.isChefLieu,
          actif: villes.actif,
          createdAt: villes.createdAt,
        })
        .from(villes)
        .leftJoin(departements, eq(villes.departementId, departements.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(villes.nom);

      res.json(rows);
    } catch (error) {
      logger.error({ err: error }, "Error listing villes");
      res.status(500).json({ message: "Erreur lors du chargement des villes" });
    }
  });

  // GET /api/villes/:id - Get single ville
  app.get("/api/villes/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const [ville] = await db
        .select({
          id: villes.id,
          nom: villes.nom,
          departementId: villes.departementId,
          departementNom: departements.nom,
          latitude: villes.latitude,
          longitude: villes.longitude,
          isChefLieu: villes.isChefLieu,
          actif: villes.actif,
          createdAt: villes.createdAt,
        })
        .from(villes)
        .leftJoin(departements, eq(villes.departementId, departements.id))
        .where(eq(villes.id, id));

      if (!ville) {
        return res.status(404).json({ message: "Ville non trouvée" });
      }

      res.json(ville);
    } catch (error) {
      logger.error({ err: error }, "Error fetching ville");
      res.status(500).json({ message: "Erreur lors du chargement de la ville" });
    }
  });
}
