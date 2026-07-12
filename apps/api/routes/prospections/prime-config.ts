import type { Express } from "express";
import { createLogger } from "../../lib/logger";
import { logAudit } from "../../lib/logger";
import {
  prospectionPrimeConfig,
  insertProspectionPrimeConfigSchema,
} from "@shared/schema";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { normalizeKeysDeep } from "../utils";
import { db } from "../../db";
import { eq, and, desc } from "drizzle-orm";

const logger = createLogger("Routes:ProspectionPrimeConfig");

export function registerProspectionPrimeConfigRoutes(app: Express) {
  /**
   * GET /api/prospection-prime-config
   * Récupérer la configuration (optionnellement par agenceId)
   */
  app.get(
    "/api/prospection-prime-config",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VIEW, Subjects.PROSPECTION_CONFIG),
    async (req, res) => {
      try {
        const { agence_id, agenceId: agenceIdQ } = req.query as Record<string, string>;
        const filterAgenceId = agence_id || agenceIdQ;

        const conditions = [];
        if (filterAgenceId) {
          conditions.push(eq(prospectionPrimeConfig.agenceId, filterAgenceId));
        }

        const configs = await db
          .select()
          .from(prospectionPrimeConfig)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(prospectionPrimeConfig.createdAt));

        res.json(configs);
      } catch (error) {
        logger.error({ err: error }, "Erreur lors du chargement de la configuration de prime de prospection");
        res.status(500).json({ message: "Erreur lors du chargement de la configuration" });
      }
    }
  );

  /**
   * PATCH /api/prospection-prime-config/:id
   * Mettre à jour une configuration
   */
  app.patch(
    "/api/prospection-prime-config/:id",
    requireAuth,
    attachAbility,
    requireAbility(Actions.EDIT, Subjects.PROSPECTION_CONFIG),
    async (req, res) => {
      try {
        const { id } = req.params;
        const data = normalizeKeysDeep(req.body) as Record<string, any>;

        const [existing] = await db
          .select()
          .from(prospectionPrimeConfig)
          .where(eq(prospectionPrimeConfig.id, id));

        if (!existing) {
          return res.status(404).json({ message: "Configuration non trouvée" });
        }

        const updates: Record<string, any> = {};
        if (typeof data.nom === "string") updates.nom = data.nom;
        if (typeof data.typePrime === "string") updates.typePrime = data.typePrime;
        if (data.montantFixe !== undefined) updates.montantFixe = data.montantFixe === "" ? null : String(data.montantFixe);
        if (data.tauxVariable !== undefined) updates.tauxVariable = data.tauxVariable === "" ? null : String(data.tauxVariable);
        if (typeof data.requireFirstCredit === "boolean") updates.requireFirstCredit = data.requireFirstCredit;
        if (data.requireMinRevenu !== undefined) updates.requireMinRevenu = data.requireMinRevenu === "" ? null : String(data.requireMinRevenu);
        if (typeof data.actif === "boolean") updates.actif = data.actif;
        if (typeof data.effectiveFrom === "string") updates.effectiveFrom = new Date(data.effectiveFrom);
        if (typeof data.effectiveTo === "string") updates.effectiveTo = new Date(data.effectiveTo);
        updates.updatedAt = new Date();

        const [row] = await db
          .update(prospectionPrimeConfig)
          .set(updates)
          .where(eq(prospectionPrimeConfig.id, id))
          .returning();

        logAudit("UPDATE_PROSPECTION_PRIME_CONFIG", {
          userId: req.session?.user?.id,
          entityType: "prospection_prime_config",
          entityId: id,
          changes: updates,
        });

        res.json(row);
      } catch (error) {
        logger.error({ err: error }, "Erreur lors de la modification de la configuration de prime de prospection");
        res.status(500).json({ message: "Erreur lors de la modification de la configuration" });
      }
    }
  );

  /**
   * POST /api/prospection-prime-config
   * Créer une nouvelle configuration
   */
  app.post(
    "/api/prospection-prime-config",
    requireAuth,
    attachAbility,
    requireAbility(Actions.EDIT, Subjects.PROSPECTION_CONFIG),
    async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body) as Record<string, any>;
        // Nettoyer les chaînes vides pour les champs numériques (transformation en null)
        if (data.tauxVariable === "" || data.tauxVariable === undefined) data.tauxVariable = null;
        if (data.requireMinRevenu === "" || data.requireMinRevenu === undefined) data.requireMinRevenu = null;
        if (data.montantFixe === "") data.montantFixe = null;
        
        const parsed = insertProspectionPrimeConfigSchema.parse({
          ...data,
          createdBy: req.session?.user?.id,
        });

        const [row] = await db
          .insert(prospectionPrimeConfig)
          .values(parsed)
          .returning();

        logAudit("CREATE_PROSPECTION_PRIME_CONFIG", {
          userId: req.session?.user?.id,
          entityType: "prospection_prime_config",
          entityId: row.id,
          changes: parsed as Record<string, any>,
        });

        res.status(201).json(row);
      } catch (error) {
        logger.error({ err: error }, "Erreur lors de la création de la configuration de prime de prospection");
        res.status(500).json({ message: "Erreur lors de la création de la configuration" });
      }
    }
  );
}
