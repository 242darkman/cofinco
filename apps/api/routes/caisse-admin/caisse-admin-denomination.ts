import { Actions, Subjects } from "@shared/ability";
import { denominationTemplates } from "@shared/schema/finance";
import { and, desc, eq, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { attachAbility, requireAbility } from "../../authorization";
import { db } from "../../db";
import { createLogger } from "../../lib/logger";
import { billetageSuggestionSchema, saveTemplateSchema } from "./caisse-admin-helpers";

const logger = createLogger('Routes:CaisseAdmin');

export function registerCaisseAdminDenominationRoutes(router: Router) {

  /**
   * GET /api/caisses/denomination-templates
   * Retourne les modèles de billetage, optionnellement filtrés par agence ou caisse.
   */
  router.get(
    "/denomination-templates",
    attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
    async (req, res) => {
      try {
        const { caisseId, typeTemplate } = req.query;
        const conditions = [];
  
        // Filtre agence : non-admin voit uniquement les templates de son agence
        const isGlobalAdmin = req.ability?.can(Actions.MANAGE, 'all');
        const userAgenceId = req.session.user?.agenceId;
        if (!isGlobalAdmin && userAgenceId) {
          conditions.push(eq(denominationTemplates.agenceId, userAgenceId));
        } else if (req.query.agenceId) {
          conditions.push(eq(denominationTemplates.agenceId, req.query.agenceId as string));
        }
  
        if (caisseId) conditions.push(eq(denominationTemplates.caisseId, caisseId as string));
        if (typeTemplate) conditions.push(eq(denominationTemplates.typeTemplate, typeTemplate as string));
  
        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  
        const templates = await db
          .select({
            id: denominationTemplates.id,
            nom: denominationTemplates.nom,
            description: denominationTemplates.description,
            agenceId: denominationTemplates.agenceId,
            caisseId: denominationTemplates.caisseId,
            billetage: denominationTemplates.billetage,
            totalCalcule: denominationTemplates.totalCalcule,
            typeTemplate: denominationTemplates.typeTemplate,
            usageCount: denominationTemplates.usageCount,
            lastUsedAt: denominationTemplates.lastUsedAt,
            createdAt: denominationTemplates.createdAt,
          })
          .from(denominationTemplates)
          .where(whereClause)
          .orderBy(desc(denominationTemplates.usageCount), desc(denominationTemplates.createdAt));
  
        res.json(templates);
      } catch (error: any) {
        logger.error({ err: error }, 'Erreur récupération denomination templates');
        res.status(500).json({ error: error.message || "Erreur interne" });
      }
    }
  );
  

  /**
   * POST /api/caisses/denomination-templates
   * Crée un nouveau modèle de billetage.
   */
  router.post(
    "/denomination-templates",
    attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE),
    async (req, res) => {
      try {
        const { nom, description, agenceId, caisseId, billetage, typeTemplate } = req.body;
  
        if (!nom || !billetage) {
          return res.status(400).json({ error: "Nom et billetage requis" });
        }
  
        // Calculate total from billetage
        const totalCalcule = Object.entries(billetage).reduce((sum, [denom, count]) => {
          return sum + (parseInt(denom) * (count as number));
        }, 0);
  
        const userId = req.user?.id;
  
        const [created] = await db.insert(denominationTemplates).values({
          nom,
          description: description || null,
          agenceId: agenceId || null,
          caisseId: caisseId || null,
          billetage,
          totalCalcule: totalCalcule.toString(),
          typeTemplate: typeTemplate || 'GENERAL',
          createdBy: userId,
        }).returning();
  
        res.status(201).json(created);
      } catch (error: any) {
        logger.error({ err: error }, 'Erreur création denomination template');
        res.status(500).json({ error: error.message || "Erreur interne" });
      }
    }
  );
  

  /**
   * POST /api/caisses/denomination-templates/:id/use
   * Marque un modèle comme utilisé (incrémente le compteur d'utilisation).
   */
  router.post(
    "/denomination-templates/:id/use",
    attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
    async (req, res) => {
      try {
        const { id } = req.params;
  
        const [updated] = await db.update(denominationTemplates)
          .set({
            usageCount: sql`${denominationTemplates.usageCount} + 1`,
            lastUsedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(denominationTemplates.id, id))
          .returning();
  
        if (!updated) {
          return res.status(404).json({ error: "Modèle non trouvé" });
        }
  
        res.json(updated);
      } catch (error: any) {
        logger.error({ err: error }, 'Erreur marquage utilisation template');
        res.status(500).json({ error: error.message || "Erreur interne" });
      }
    }
  );
  

  /**
   * POST /api/caisses/billetage/suggestion
   * Génère une suggestion de billetage prédictive basée sur l'historique
   */
  router.post(
    "/billetage/suggestion",
    attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
    async (req, res) => {
      try {
        const validation = billetageSuggestionSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            error: "Données invalides",
            details: validation.error.format(),
          });
        }
  
        const { caisseId, targetAmount, ...options } = validation.data;
        const { predictiveBilletageService } = await import("../../services/caisse/predictive-billetage-service");
  
        const suggestion = await predictiveBilletageService.getSuggestion({
          caisseId,
          targetAmount,
          options,
        });
  
        res.json(suggestion);
      } catch (error: any) {
        logger.error({ err: error }, 'Erreur suggestion billetage');
        res.status(500).json({ error: error.message || "Erreur interne" });
      }
    }
  );
  

  /**
   * GET /api/caisses/billetage/patterns/:caisseId
   * Récupère les patterns historiques d'une caisse
   */
  router.get(
    "/billetage/patterns/:caisseId",
    attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
    async (req, res) => {
      try {
        const { caisseId } = req.params;
        const { predictiveBilletageService } = await import("../../services/caisse/predictive-billetage-service");
  
        const pattern = await predictiveBilletageService.analyzeHistoricalPattern(caisseId);
  
        res.json(pattern);
      } catch (error: any) {
        logger.error({ err: error }, 'Erreur analyse patterns billetage');
        res.status(500).json({ error: error.message || "Erreur interne" });
      }
    }
  );
  

  /**
   * GET /api/caisses/billetage/templates
   * Récupère les templates de billetage fréquemment utilisés
   */
  router.get(
    "/billetage/templates",
    attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
    async (req, res) => {
      try {
        const agenceId = req.query.agenceId as string || req.session.user?.agenceId;
        const caisseId = req.query.caisseId as string | undefined;
  
        const { denominationTemplateService } = await import("../../services/caisse/denomination-template-service");
  
        const templates = await denominationTemplateService.getFrequentTemplates(agenceId, caisseId);
  
        res.json(templates);
      } catch (error: any) {
        logger.error({ err: error }, 'Erreur récupération templates billetage');
        res.status(500).json({ error: error.message || "Erreur interne" });
      }
    }
  );
  

  /**
   * POST /api/caisses/billetage/templates
   * Sauvegarde un template de billetage personnalisé
   */
  router.post(
    "/billetage/templates",
    attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE),
    async (req, res) => {
      try {
        const validation = saveTemplateSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            error: "Données invalides",
            details: validation.error.format(),
          });
        }
  
        const userId = req.session.user!.id;
        const { denominationTemplateService } = await import("../../services/caisse/denomination-template-service");
  
        const template = await denominationTemplateService.saveTemplate({
          ...validation.data,
          createdBy: userId,
        });
  
        res.status(201).json({
          ...template,
          message: 'Template sauvegardé avec succès',
        });
      } catch (error: any) {
        logger.error({ err: error }, 'Erreur sauvegarde template billetage');
        res.status(500).json({ error: error.message || "Erreur interne" });
      }
    }
  );
  
  // ============================================================================
  // ROUTES - TRANSFERT DE GARDE (HANDOVER)
  // ============================================================================
  
  const initiateHandoverSchema = z.object({
    sessionId: z.string().uuid(),
    toCaissierId: z.string().uuid(),
    montantCompte: z.number().positive(),
    billetage: z.record(z.string(), z.number().int().min(0)).optional(),
    motif: z.string().optional(),
    observations: z.string().optional(),
  });
  
  const confirmHandoverSchema = z.object({
    montantVerifie: z.number().nonnegative(),
    billetage: z.record(z.string(), z.number().int().min(0)).optional(),
    observations: z.string().optional(),
    ecartJustification: z.string().optional(),
  });
  
  const cancelHandoverSchema = z.object({
    reason: z.string().min(5, "La raison doit contenir au moins 5 caractères"),
  });
  
  const approveHandoverSchema = z.object({
    comment: z.string().optional(),
  });
  
}
