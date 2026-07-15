import { Router } from "express";
import { createLogger } from "../../lib/logger";
import { TransfertCoffreService } from "../../services/coffre/transfert-service";
import { idempotencyMiddleware } from "../../middleware/idempotency";
import { z } from "zod";
import { db } from "../../db";
import { configCoffreFort, transfertsInterCoffres, coffresForts, agences } from "@shared/schema";
import { eq, and, sql, desc, inArray, gte, lte } from "drizzle-orm";
import * as schema from "@shared/schema";
import { storage } from "../../storage";

import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { dispatchDomainEvent } from "../../services/notifications/domain-events/event-registry";
import { handleInsufficientFundsError } from "../../middleware/financial-validation";
import { getSnapshotHistory, getSnapshotDateRange } from "../../services/coffre/snapshot-service";

export const configCoffreRouter = Router();
const logger = createLogger('Routes:Coffre:config-routes');
const service = new TransfertCoffreService();

// Apply authentication middleware to all routes in this router
configCoffreRouter.use(requireAuth);

configCoffreRouter.get("/config", attachAbility, requireAbility(Actions.VIEW, Subjects.COFFRE), async (req, res) => {
  try {
    const agenceId = req.query.agenceId as string;
    if (!agenceId) return res.status(400).json({ error: "Missing agenceId" });

    // Vérifier les permissions si nécessaire (ici ouvert en lecture authentifiée)

    const [config] = await db.select()
      .from(configCoffreFort)
      .where(eq(configCoffreFort.agenceId, agenceId));

    if (!config) {
      // Configuration par défaut si non trouvée ? Ou 404
      // Pour l'instant, on retourne null ou une config par défaut
      return res.json({
        seuilDoubleValidation: "1000000",
        separationInitiateurValideur: true,
        actif: true
      });
    }

    res.json(config);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 8. Mettre à jour la configuration (ADMIN ONLY)
configCoffreRouter.put("/config", attachAbility, requireAbility(Actions.MANAGE, Subjects.COFFRE), async (req, res) => {
  try {
    const schema = z.object({
      agenceId: z.string().uuid(),
      // Sécurité & Workflow
      seuilDoubleValidation: z.string().optional(),
      separationInitiateurValideur: z.boolean().optional(),
      verouillageApresEchec: z.boolean().optional(),
      horairesOuverture: z.object({ debut: z.string(), fin: z.string() }).optional(),
      joursOuvrables: z.array(z.string()).optional(),
      tentativesMaxParJour: z.string().optional(),

      // Limites
      montantMaxTransfert: z.string().optional().nullable(),
      montantMinTransfert: z.string().optional(),
      plafondJournalierSortant: z.string().optional().nullable(),
      plafondJournalierEntrant: z.string().optional().nullable(),

      // Alertes
      seuilSoldeMin: z.string().optional(),
      seuilSoldeCritique: z.string().optional(),
      alerteEmailActif: z.boolean().optional(),

      // Audit
      justificatifObligatoire: z.boolean().optional(),
      billetageObligatoireSiMontantSup: z.string().optional().nullable(),
      comptageDoublePersonne: z.boolean().optional(),

       actif: z.boolean().optional(),
    });

    const body = schema.parse(req.body);

    // Vérification agence : non-admin restreint à sa propre agence
    const isGlobalAdmin = req.ability?.can(Actions.MANAGE, 'all');
    if (!isGlobalAdmin) {
      const userAgenceId = req.session.user?.agenceId;
      if (body.agenceId !== userAgenceId) {
        return res.status(403).json({ error: "Accès interdit: configuration d'une autre agence" });
      }
    }

    // Check if exists
    const [existing] = await db.select()
      .from(configCoffreFort)
      .where(eq(configCoffreFort.agenceId, body.agenceId));

    let result;
    if (existing) {
      const [updated] = await db.update(configCoffreFort)
        .set({
          ...body,
          updatedAt: new Date(),
        })
        .where(eq(configCoffreFort.id, existing.id))
        .returning();
      result = updated;
    } else {
      const [created] = await db.insert(configCoffreFort)
        .values({
          ...body,
          seuilDoubleValidation: body.seuilDoubleValidation || "1000000",
        })
        .returning();
      result = created;
    }

    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// WORKFLOW SECURISE D'OUVERTURE DE CAISSE (Coffre → Caisse)
// Routes pour le responsable coffre
// ============================================================================

// Importer le service d'ouverture

/**
 * GET /coffre/pending-opening-requests
 * Liste les demandes d'ouverture de caisse en attente pour une agence
 */

