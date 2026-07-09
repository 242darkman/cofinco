import type { Express } from "express";
import { db } from "../db";
import { eq, and, desc, asc, ilike, sql, or } from "drizzle-orm";
import { sectors, professions, activityTypes, professionSectors, professionActivityTypes, sectorActivityTypes } from "@shared/schema";
import { createLogger } from "../lib/logger";
import { requireAuth } from "../auth";

const logger = createLogger('Catalog');

export function registerCatalogRoutes(app: Express) {
  // GET /api/catalog/options — Dynamic filtering
  // Query params: profession_id, sector_id, activity_type_id
  // Returns filtered lists based on junction tables
  app.get("/api/catalog/options", requireAuth, async (req, res) => {
    try {
      const professionId = req.query.profession_id as string | undefined;
      const sectorId = req.query.sector_id as string | undefined;
      const activityTypeId = req.query.activity_type_id as string | undefined;

      // Base: all active items
      let professionsResult = await db.select({
        id: professions.id,
        code: professions.code,
        nom: professions.nom,
      }).from(professions).where(eq(professions.actif, true)).orderBy(asc(professions.sortOrder), asc(professions.nom));

      let sectorsResult = await db.select({
        id: sectors.id,
        code: sectors.code,
        nom: sectors.nom,
        parentId: sectors.parentId,
      }).from(sectors).where(eq(sectors.actif, true)).orderBy(asc(sectors.sortOrder), asc(sectors.nom));

      let activityTypesResult = await db.select({
        id: activityTypes.id,
        code: activityTypes.code,
        nom: activityTypes.nom,
      }).from(activityTypes).where(eq(activityTypes.actif, true)).orderBy(asc(activityTypes.sortOrder));

      // If profession_id is provided, filter sectors and activityTypes to compatible ones
      if (professionId) {
        const compatibleSectors = await db.select({
          sectorId: professionSectors.sectorId,
          weight: professionSectors.weight,
          isDefault: professionSectors.isDefault,
        }).from(professionSectors).where(eq(professionSectors.professionId, professionId));

        const compatibleActivities = await db.select({
          activityTypeId: professionActivityTypes.activityTypeId,
          weight: professionActivityTypes.weight,
          isDefault: professionActivityTypes.isDefault,
        }).from(professionActivityTypes).where(eq(professionActivityTypes.professionId, professionId));

        if (compatibleSectors.length > 0) {
          const sectorIds = new Set(compatibleSectors.map(s => s.sectorId));
          // Also include parent sectors of matched sectors
          const matchedSectors = sectorsResult.filter(s => sectorIds.has(s.id));
          const parentIds = new Set(matchedSectors.filter(s => s.parentId).map(s => s.parentId!));
          sectorsResult = sectorsResult.filter(s => sectorIds.has(s.id) || parentIds.has(s.id));
        }

        if (compatibleActivities.length > 0) {
          const activityIds = new Set(compatibleActivities.map(a => a.activityTypeId));
          activityTypesResult = activityTypesResult.filter(a => activityIds.has(a.id));
        }
      }

      // If sector_id is provided, filter professions and activityTypes
      if (sectorId) {
        const compatibleProfs = await db.select({
          professionId: professionSectors.professionId,
        }).from(professionSectors).where(eq(professionSectors.sectorId, sectorId));

        const compatibleActivities = await db.select({
          activityTypeId: sectorActivityTypes.activityTypeId,
        }).from(sectorActivityTypes).where(eq(sectorActivityTypes.sectorId, sectorId));

        if (compatibleProfs.length > 0) {
          const profIds = new Set(compatibleProfs.map(p => p.professionId));
          professionsResult = professionsResult.filter(p => profIds.has(p.id));
        }

        if (compatibleActivities.length > 0) {
          const activityIds = new Set(compatibleActivities.map(a => a.activityTypeId));
          activityTypesResult = activityTypesResult.filter(a => activityIds.has(a.id));
        }
      }

      // If activity_type_id is provided, filter professions and sectors
      if (activityTypeId) {
        const compatibleProfs = await db.select({
          professionId: professionActivityTypes.professionId,
        }).from(professionActivityTypes).where(eq(professionActivityTypes.activityTypeId, activityTypeId));

        const compatibleSectors = await db.select({
          sectorId: sectorActivityTypes.sectorId,
        }).from(sectorActivityTypes).where(eq(sectorActivityTypes.activityTypeId, activityTypeId));

        if (compatibleProfs.length > 0) {
          const profIds = new Set(compatibleProfs.map(p => p.professionId));
          professionsResult = professionsResult.filter(p => profIds.has(p.id));
        }

        if (compatibleSectors.length > 0) {
          const sectorIds = new Set(compatibleSectors.map(s => s.sectorId));
          const matchedSectors = sectorsResult.filter(s => sectorIds.has(s.id));
          const parentIds = new Set(matchedSectors.filter(s => s.parentId).map(s => s.parentId!));
          sectorsResult = sectorsResult.filter(s => sectorIds.has(s.id) || parentIds.has(s.id));
        }
      }

      // Add parent names to sectors
      const sectorMap = new Map(sectorsResult.map(s => [s.id, s]));
      const sectorsWithParent = sectorsResult.map(s => ({
        ...s,
        parentNom: s.parentId ? sectorMap.get(s.parentId)?.nom || null : null,
      }));

      res.json({
        professions: professionsResult,
        sectors: sectorsWithParent,
        activityTypes: activityTypesResult,
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching catalog options');
      res.status(500).json({ message: error.message || "Erreur" });
    }
  });

  // GET /api/catalog/search — Autocomplete search for professions
  app.get("/api/catalog/search", requireAuth, async (req, res) => {
    try {
      const q = (req.query.q as string || '').trim();
      const type = req.query.type as string || 'profession';
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

      if (!q || q.length < 2) {
        return res.json([]);
      }

      if (type === 'profession') {
        const results = await db.select({
          id: professions.id,
          code: professions.code,
          nom: professions.nom,
        })
        .from(professions)
        .where(and(
          eq(professions.actif, true),
          or(
            ilike(professions.nom, `%${q}%`),
            sql`${professions.keywords} @> ARRAY[${q.toLowerCase()}]::text[]`
          )
        ))
        .orderBy(asc(professions.sortOrder), asc(professions.nom))
        .limit(limit);

        return res.json(results);
      }

      if (type === 'sector') {
        const results = await db.select({
          id: sectors.id,
          code: sectors.code,
          nom: sectors.nom,
          parentId: sectors.parentId,
        })
        .from(sectors)
        .where(and(
          eq(sectors.actif, true),
          or(
            ilike(sectors.nom, `%${q}%`),
            sql`${sectors.keywords} @> ARRAY[${q.toLowerCase()}]::text[]`
          )
        ))
        .orderBy(asc(sectors.sortOrder), asc(sectors.nom))
        .limit(limit);

        return res.json(results);
      }

      res.json([]);
    } catch (error: any) {
      logger.error({ err: error }, 'Error searching catalog');
      res.status(500).json({ message: error.message || "Erreur" });
    }
  });
}
