import { Router } from "express";
/**
 * Routes RH — Sanctions : workflow d'escalade et règles d'escalade automatiques.
 *
 * Monté sous /api/hr par le routeur d'index (hr.ts).
 * Endpoints :
 *   POST   /api/hr/sanctions/:id/document
 *   GET    /api/hr/sanctions/:id/documents
 *   GET    /api/hr/sanction-escalation-rules
 *   POST   /api/hr/sanction-escalation-rules
 *   PUT    /api/hr/sanction-escalation-rules/:id
 *   DELETE /api/hr/sanction-escalation-rules/:id
 *   POST   /api/hr/sanctions/:id/apply-escalation
 *   GET    /api/hr/sanctions/:id/escalation-history
 */
import { db } from "../../db";
import { sanctions } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getAuthUser } from "../../middleware";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { sanctionEscalationService } from "../../services/sanction-escalation-service";
import { getWsInstance } from "../../ws-server";
import { StorageService } from "../../services/storage-service";
import { logger, docUpload } from "./shared";

export const sanctionsWorkflowRouter = Router();

// POST /api/hr/sanctions/:id/document - Upload document for a sanction
/**
 * POST /api/hr/sanctions/:id/document
 */
sanctionsWorkflowRouter.post("/sanctions/:id/document", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), docUpload.single('file'), async (req, res) => {
    try {
        const sanctionId = parseInt(req.params.id);
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: "Fichier requis" });
        }

        // Check sanction exists
        const [sanction] = await db.select().from(sanctions).where(eq(sanctions.id, sanctionId));
        if (!sanction) {
            return res.status(404).json({ error: "Sanction non trouvée" });
        }

        // Upload to MinIO
        const storagePath = `sanctions/${sanctionId}`;
        const storageKey = await StorageService.uploadBuffer(
            file.buffer,
            file.originalname,
            file.mimetype,
            storagePath,
            false, // private
        );

        // Get download URL
        const downloadUrl = await StorageService.getPresignedDownloadUrl(storageKey, 86400); // 24h

        // Append to documentsJoints (comma-separated)
        const existingDocs = sanction.documentsJoints || '';
        const newDocs = existingDocs ? `${existingDocs},${storageKey}` : storageKey;

        const [updated] = await db.update(sanctions)
            .set({ documentsJoints: newDocs })
            .where(eq(sanctions.id, sanctionId))
            .returning();

        res.status(201).json({ storageKey, downloadUrl, sanction: updated });
    } catch (error) {
        logger.error({ err: error }, 'Erreur upload document sanction');
        res.status(500).json({ error: "Erreur lors de l'upload du document" });
    }
});

// GET /api/hr/sanctions/:id/documents - Get presigned URLs for sanction documents
/**
 * GET /api/hr/sanctions/:id/documents
 */
sanctionsWorkflowRouter.get("/sanctions/:id/documents", getAuthUser, attachAbility, async (req, res) => {
    try {
        const sanctionId = parseInt(req.params.id);
        const [sanction] = await db.select().from(sanctions).where(eq(sanctions.id, sanctionId));
        if (!sanction) {
            return res.status(404).json({ error: "Sanction non trouvée" });
        }

        const keys = (sanction.documentsJoints || '').split(',').filter(Boolean);
        const documents = await Promise.all(
            keys.map(async (key) => ({
                key,
                fileName: key.split('/').pop() || key,
                url: await StorageService.getPresignedDownloadUrl(key, 3600),
            }))
        );

        res.json(documents);
    } catch (error) {
        logger.error({ err: error }, 'Erreur récupération documents sanction');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

/**
 * ========================================
 * SANCTION ESCALATION RULES
 * ========================================
 */

// GET /api/hr/sanction-escalation-rules - Liste des règles d'escalade
/**
 * GET /api/hr/sanction-escalation-rules
 */
sanctionsWorkflowRouter.get("/sanction-escalation-rules", getAuthUser, attachAbility, async (req, res) => {
  try {
    const { agenceId } = req.query;
    const rules = await sanctionEscalationService.getRules(agenceId as string | undefined);
    res.json(rules);
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération règles d\'escalade');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/sanction-escalation-rules - Créer une règle d'escalade
/**
 * POST /api/hr/sanction-escalation-rules
 */
sanctionsWorkflowRouter.post("/sanction-escalation-rules", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
  try {
    const {
      agenceId,
      nom,
      description,
      sanctionCountThreshold,
      periodMonths,
      sourceGravite,
      escalateToGravite,
      notificationRequired,
      autoApply
    } = req.body;

    if (!nom || !sanctionCountThreshold || !sourceGravite || !escalateToGravite) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    const rule = await sanctionEscalationService.upsertRule({
      agenceId,
      nom,
      description,
      sanctionCountThreshold,
      periodMonths,
      sourceGravite,
      escalateToGravite,
      notificationRequired,
      autoApply,
      createdBy: req.user?.id,
    });

    res.status(201).json(rule);
  } catch (error) {
    logger.error({ err: error }, 'Erreur création règle d\'escalade');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PUT /api/hr/sanction-escalation-rules/:id - Mettre à jour une règle
/**
 * PUT /api/hr/sanction-escalation-rules/:id
 */
sanctionsWorkflowRouter.put("/sanction-escalation-rules/:id", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nom,
      description,
      sanctionCountThreshold,
      periodMonths,
      sourceGravite,
      escalateToGravite,
      notificationRequired,
      autoApply
    } = req.body;

    const rule = await sanctionEscalationService.upsertRule({
      id,
      nom,
      description,
      sanctionCountThreshold,
      periodMonths,
      sourceGravite,
      escalateToGravite,
      notificationRequired,
      autoApply,
    });

    res.json(rule);
  } catch (error) {
    logger.error({ err: error }, 'Erreur mise à jour règle d\'escalade');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// DELETE /api/hr/sanction-escalation-rules/:id - Désactiver une règle
/**
 * DELETE /api/hr/sanction-escalation-rules/:id
 */
sanctionsWorkflowRouter.delete("/sanction-escalation-rules/:id", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
  try {
    const { id } = req.params;
    await sanctionEscalationService.deleteRule(id);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Erreur suppression règle d\'escalade');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/sanctions/:id/apply-escalation - Appliquer manuellement l'escalade
/**
 * POST /api/hr/sanctions/:id/apply-escalation
 */
sanctionsWorkflowRouter.post("/sanctions/:id/apply-escalation", getAuthUser, attachAbility, requireAbility(Actions.EDIT, Subjects.RH), async (req, res) => {
  try {
    const sanctionId = parseInt(req.params.id);
    const { ruleId } = req.body;

    // Récupérer la règle
    const rules = await sanctionEscalationService.getRules();
    const rule = rules.find(r => r.id === ruleId);

    if (!rule) {
      return res.status(404).json({ error: "Règle d'escalade non trouvée" });
    }

    const result = await sanctionEscalationService.applyEscalation(
      sanctionId,
      rule,
      req.user?.id
    );

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
      wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'sanction_escalated', id: result.escalatedSanction?.id } });
    }

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Erreur application escalade');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/hr/sanctions/:id/escalation-history - Historique d'escalade
/**
 * GET /api/hr/sanctions/:id/escalation-history
 */
sanctionsWorkflowRouter.get("/sanctions/:id/escalation-history", getAuthUser, attachAbility, async (req, res) => {
  try {
    const sanctionId = parseInt(req.params.id);
    const history = await sanctionEscalationService.getEscalationHistory(sanctionId);
    res.json(history);
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération historique escalade');
    res.status(500).json({ error: "Erreur serveur" });
  }
});
