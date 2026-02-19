import type { Express } from "express";
import { createLogger } from "../lib/logger";
import { departements, villes, pays } from "@shared/schema";
import { regions } from "@shared/schema/geography";
import { requireAuth } from "../auth";
import { db } from "../db";
import { eq, and, ilike, desc, sql } from "drizzle-orm";

const logger = createLogger("Villes");

export function registerVilleRoutes(app: Express) {

  // ===== PAYS =====

  // GET /api/pays - List active countries
  app.get("/api/pays", requireAuth, async (req, res) => {
    try {
      const { actif, search } = req.query as Record<string, string>;
      const conditions = [];

      if (actif !== "false") {
        conditions.push(eq(pays.isActive, true));
      }
      if (search && search.trim().length >= 1) {
        conditions.push(ilike(pays.nomFr, `${search.trim()}%`));
      }

      const rows = await db
        .select({
          id: pays.id,
          nomFr: pays.nomFr,
          nomEn: pays.nomEn,
          iso2: pays.iso2,
          iso3: pays.iso3,
          indicatifTel: pays.indicatifTel,
          isHighRiskAml: pays.isHighRiskAml,
        })
        .from(pays)
        .where(conditions.length > 0 ? and(...conditions) : eq(pays.isActive, true))
        .orderBy(pays.nomFr);

      res.json(rows);
    } catch (error) {
      logger.error({ err: error }, "Error listing pays");
      res.status(500).json({ message: "Erreur lors du chargement des pays" });
    }
  });

  // ===== REGIONS (ADM1) =====

  // GET /api/regions - List regions (ADM1), optionally filter by paysId
  app.get("/api/regions", requireAuth, async (req, res) => {
    try {
      const { actif, paysId, pays_id } = req.query as Record<string, string>;
      const filterPaysId = paysId || pays_id;
      const conditions = [];

      if (filterPaysId) {
        conditions.push(eq(regions.paysId, filterPaysId));
      }
      if (actif === "true") {
        conditions.push(eq(regions.actif, true));
      } else if (actif === "false") {
        conditions.push(eq(regions.actif, false));
      }

      const rows = await db
        .select({
          id: regions.id,
          nom: regions.nom,
          nomAscii: regions.nomAscii,
          code: regions.code,
          paysId: regions.paysId,
          paysNom: pays.nomFr,
          paysIso2: pays.iso2,
          latitude: regions.latitude,
          longitude: regions.longitude,
          population: regions.population,
          actif: regions.actif,
        })
        .from(regions)
        .leftJoin(pays, eq(regions.paysId, pays.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(regions.nom);

      res.json(rows);
    } catch (error) {
      logger.error({ err: error }, "Error listing regions");
      res.status(500).json({ message: "Erreur lors du chargement des régions" });
    }
  });

  // GET /api/regions/:id - Get single region
  app.get("/api/regions/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const [region] = await db
        .select({
          id: regions.id,
          nom: regions.nom,
          nomAscii: regions.nomAscii,
          code: regions.code,
          paysId: regions.paysId,
          paysNom: pays.nomFr,
          paysIso2: pays.iso2,
          latitude: regions.latitude,
          longitude: regions.longitude,
          population: regions.population,
          actif: regions.actif,
        })
        .from(regions)
        .leftJoin(pays, eq(regions.paysId, pays.id))
        .where(eq(regions.id, id));

      if (!region) {
        return res.status(404).json({ message: "Région non trouvée" });
      }

      res.json(region);
    } catch (error) {
      logger.error({ err: error }, "Error fetching region");
      res.status(500).json({ message: "Erreur lors du chargement de la région" });
    }
  });

  // ===== DEPARTEMENTS (ADM2) =====

  // GET /api/departements - List departements (ADM2), filter by regionId/paysId
  app.get("/api/departements", requireAuth, async (req, res) => {
    try {
      const { actif, regionId, region_id, paysId, pays_id } = req.query as Record<string, string>;
      const filterRegionId = regionId || region_id;
      const filterPaysId = paysId || pays_id;
      const conditions = [];

      if (filterRegionId) {
        conditions.push(eq(departements.regionId, filterRegionId));
      }
      if (filterPaysId) {
        conditions.push(eq(departements.paysId, filterPaysId));
      }
      if (actif === "true") {
        conditions.push(eq(departements.actif, true));
      } else if (actif === "false") {
        conditions.push(eq(departements.actif, false));
      }

      const rows = await db
        .select({
          id: departements.id,
          nom: departements.nom,
          nomAscii: departements.nomAscii,
          code: departements.code,
          regionId: departements.regionId,
          regionNom: regions.nom,
          paysId: departements.paysId,
          latitude: departements.latitude,
          longitude: departements.longitude,
          population: departements.population,
          actif: departements.actif,
        })
        .from(departements)
        .leftJoin(regions, eq(departements.regionId, regions.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(departements.nom);

      res.json(rows);
    } catch (error) {
      logger.error({ err: error }, "Error listing departements");
      res.status(500).json({ message: "Erreur lors du chargement des départements" });
    }
  });

  // ===== LOCALITIES (unified villes + districts) =====

  // GET /api/localities - Merged list of villes (cities) + departements (districts)
  // with "CITY wins" deduplication: if a name exists as both city and district
  // for the same country, only the city is returned.
  app.get("/api/localities", requireAuth, async (req, res) => {
    try {
      const {
        pays_id, paysId: paysIdQ,
        search, limit: limitQ,
      } = req.query as Record<string, string>;

      const filterPaysId = pays_id || paysIdQ;
      if (!filterPaysId) {
        return res.status(400).json({ message: "paysId est requis" });
      }

      const maxRows = limitQ ? Math.min(parseInt(limitQ, 10), 500) : 500;
      const searchTerm = search?.trim();
      const searchFilter = searchTerm && searchTerm.length >= 2
        ? sql`AND nom ILIKE ${searchTerm + '%'}`
        : sql``;

      const rows = await db.execute(sql`
        WITH city_names AS (
          SELECT LOWER(nom) as norm_name, pays_id, region_id
          FROM villes
          WHERE pays_id = ${filterPaysId} AND actif = true
        )
        SELECT * FROM (
          SELECT
            v.id,
            'CITY' as type,
            v.nom as name,
            r.nom as "regionName",
            v.population,
            v.is_chef_lieu as "isChefLieu"
          FROM villes v
          LEFT JOIN regions r ON r.id = v.region_id
          WHERE v.pays_id = ${filterPaysId} AND v.actif = true
            ${searchFilter}

          UNION ALL

          SELECT
            d.id,
            'DISTRICT' as type,
            d.nom as name,
            r.nom as "regionName",
            d.population,
            false as "isChefLieu"
          FROM departements d
          LEFT JOIN regions r ON r.id = d.region_id
          WHERE d.pays_id = ${filterPaysId} AND d.actif = true
            ${searchFilter}
            AND NOT EXISTS (
              SELECT 1 FROM city_names cn
              WHERE cn.norm_name = LOWER(d.nom)
                AND cn.pays_id = d.pays_id
            )
        ) merged
        ORDER BY population DESC NULLS LAST, name
        LIMIT ${maxRows}
      `);

      res.json(rows.rows);
    } catch (error) {
      logger.error({ err: error }, "Error listing localities");
      res.status(500).json({ message: "Erreur lors du chargement des localités" });
    }
  });

  // ===== VILLES =====

  // GET /api/villes - List villes with worldwide support
  // Supports: regionId, paysId, search, limit
  app.get("/api/villes", requireAuth, async (req, res) => {
    try {
      const {
        region_id, regionId: regionIdQ,
        pays_id, paysId: paysIdQ,
        actif, search, limit: limitQ,
      } = req.query as Record<string, string>;

      const filterRegionId = region_id || regionIdQ;
      const filterPaysId = pays_id || paysIdQ;
      const conditions = [];

      if (filterRegionId) {
        conditions.push(eq(villes.regionId, filterRegionId));
      }
      if (filterPaysId) {
        conditions.push(eq(villes.paysId, filterPaysId));
      }
      if (actif === "true") {
        conditions.push(eq(villes.actif, true));
      } else if (actif === "false") {
        conditions.push(eq(villes.actif, false));
      }
      if (search && search.trim().length >= 2) {
        conditions.push(ilike(villes.nom, `${search.trim()}%`));
      }

      const maxRows = limitQ ? Math.min(parseInt(limitQ, 10), 200) : 200;

      const rows = await db
        .select({
          id: villes.id,
          nom: villes.nom,
          regionId: villes.regionId,
          regionNom: regions.nom,
          paysId: villes.paysId,
          latitude: villes.latitude,
          longitude: villes.longitude,
          population: villes.population,
          isChefLieu: villes.isChefLieu,
          featureCode: villes.featureCode,
          actif: villes.actif,
          createdAt: villes.createdAt,
        })
        .from(villes)
        .leftJoin(regions, eq(villes.regionId, regions.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(villes.population), villes.nom)
        .limit(maxRows);

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
          regionId: villes.regionId,
          regionNom: regions.nom,
          paysId: villes.paysId,
          paysNom: pays.nomFr,
          latitude: villes.latitude,
          longitude: villes.longitude,
          population: villes.population,
          isChefLieu: villes.isChefLieu,
          featureCode: villes.featureCode,
          timezone: villes.timezone,
          actif: villes.actif,
          createdAt: villes.createdAt,
        })
        .from(villes)
        .leftJoin(regions, eq(villes.regionId, regions.id))
        .leftJoin(pays, eq(villes.paysId, pays.id))
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
