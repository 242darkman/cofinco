import { Router } from "express";
import { createLogger } from "../lib/logger";
import { requireAuth } from "../auth";
import { attachAbility, requireAbility } from "../authorization";
import { Actions, Subjects } from "@shared/ability";

import { listEvacuations, getEvacuationDetails, getAuditLogs, getStatistics } from "../services/evacuation-coffre/queries";
import { createEvacuation } from "../services/evacuation-coffre/creation";
import {
  submitEvacuation,
  approveEvacuation,
  rejectEvacuation,
  prepareEvacuation,
  dispatchEvacuation,
  depositEvacuation,
  reconcileEvacuation,
  cancelEvacuation
} from "../services/evacuation-coffre/workflow";
import { getConfig, updateConfig } from "../services/evacuation-coffre/config";
import {
  createEvacuationSchema,
  rejectEvacuationSchema,
  prepareEvacuationSchema,
  dispatchEvacuationSchema,
  depositEvacuationSchema,
  reconcileEvacuationSchema,
  cancelEvacuationSchema
} from "./evacuation-coffre.schemas";

const logger = createLogger("Routes:EvacuationCoffre");

export const evacuationCoffreRouter = Router();

evacuationCoffreRouter.use(requireAuth);

// ═══════════════════════════════════════════════════════════════════
// EVACUATIONS
// ═══════════════════════════════════════════════════════════════════

// GET / - Liste des évacuations
evacuationCoffreRouter.get("/", async (req, res) => {
  try {
    const { page, limit, statut, coffreSourceId, typeDestination, agenceId, dateDebut, dateFin, search, sortBy, sortOrder } = req.query;

    const result = await listEvacuations({
      page: page ? Number.parseInt(page as string) : undefined,
      limit: limit ? Number.parseInt(limit as string) : undefined,
      statut: statut as string,
      coffreSourceId: coffreSourceId as string,
      typeDestination: typeDestination as string,
      agenceId: agenceId as string,
      dateDebut: dateDebut as string,
      dateFin: dateFin as string,
      search: search as string,
      sortBy: sortBy as string,
      sortOrder: sortOrder as "asc" | "desc",
    });

    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, "Erreur GET /");
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST / - Créer une évacuation (brouillon)
evacuationCoffreRouter.post("/", attachAbility, requireAbility(Actions.CREATE, Subjects.EVACUATION_COFFRE), async (req, res) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role ?? '';

    if (!userId) {
      return res.status(401).json({ success: false, error: "Non authentifié" });
    }

    const data = createEvacuationSchema.parse(req.body);

    const result = await createEvacuation({
      ...data,
      userId,
      userRole,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(201).json(result);
  } catch (error: any) {
    logger.error({ err: error }, "Erreur POST /");
    res.status(400).json({ success: false, error: error.message });
  }
});

// GET /stats - Statistiques
evacuationCoffreRouter.get("/stats", async (req, res) => {
  try {
    const { agenceId } = req.query;
    const result = await getStatistics(agenceId as string);
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, "Erreur GET /stats");
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /config/:agenceId? - Configuration
evacuationCoffreRouter.get("/config/:agenceId?", async (req, res) => {
  try {
    const { agenceId } = req.params;
    const result = await getConfig(agenceId);
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, "Erreur GET /config");
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /config/:agenceId - Mettre à jour configuration
evacuationCoffreRouter.put("/config/:agenceId", attachAbility, requireAbility(Actions.MANAGE, Subjects.EVACUATION_COFFRE), async (req, res) => {
  try {
    const { agenceId } = req.params;
    const result = await updateConfig(agenceId, req.body);
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, "Erreur PUT /config");
    res.status(400).json({ success: false, error: error.message });
  }
});

// GET /:id - Détail d'une évacuation
evacuationCoffreRouter.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await getEvacuationDetails(id);
    if (!result.success) {
      return res.status(404).json(result);
    }
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, "Erreur GET /:id");
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:id/audit-logs - Journal d'audit
evacuationCoffreRouter.get("/:id/audit-logs", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await getAuditLogs(id);
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, "Erreur GET /:id/audit-logs");
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /:id/submit - Soumettre
evacuationCoffreRouter.post("/:id/submit", async (req, res) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role ?? '';
    if (!userId) return res.status(401).json({ success: false, error: "Non authentifié" });

    const result = await submitEvacuation({
      evacuationId: req.params.id,
      userId,
      userRole,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, "Erreur POST /:id/submit");
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /:id/approve - Approuver
evacuationCoffreRouter.post("/:id/approve", attachAbility, requireAbility(Actions.APPROVE, Subjects.EVACUATION_COFFRE), async (req, res) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role ?? '';
    if (!userId) return res.status(401).json({ success: false, error: "Non authentifié" });

    const { commentaire } = req.body || {};

    const result = await approveEvacuation({
      evacuationId: req.params.id,
      userId,
      userRole,
      commentaire,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, "Erreur POST /:id/approve");
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /:id/reject - Rejeter
evacuationCoffreRouter.post("/:id/reject", attachAbility, requireAbility(Actions.REJECT, Subjects.EVACUATION_COFFRE), async (req, res) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role ?? '';
    if (!userId) return res.status(401).json({ success: false, error: "Non authentifié" });

    const { reason } = rejectEvacuationSchema.parse(req.body);

    const result = await rejectEvacuation({
      evacuationId: req.params.id,
      userId,
      userRole,
      reason,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, "Erreur POST /:id/reject");
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /:id/prepare - Préparer (comptage physique, billetage, scellé)
evacuationCoffreRouter.post("/:id/prepare", attachAbility, requireAbility(Actions.PREPARE, Subjects.EVACUATION_COFFRE), async (req, res) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role ?? '';
    if (!userId) return res.status(401).json({ success: false, error: "Non authentifié" });

    const data = prepareEvacuationSchema.parse(req.body);

    const result = await prepareEvacuation({
      evacuationId: req.params.id,
      userId,
      userRole,
      ...data,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, "Erreur POST /:id/prepare");
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /:id/dispatch - Expédier (événement comptable 1: coffre -> transit)
evacuationCoffreRouter.post("/:id/dispatch", attachAbility, requireAbility(Actions.DISPATCH, Subjects.EVACUATION_COFFRE), async (req, res) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role ?? '';
    if (!userId) return res.status(401).json({ success: false, error: "Non authentifié" });

    const data = dispatchEvacuationSchema.parse(req.body);

    const result = await dispatchEvacuation({
      evacuationId: req.params.id,
      userId,
      userRole,
      ...data,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, "Erreur POST /:id/dispatch");
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /:id/deposit - Enregistrer le dépôt (événement comptable 2: transit -> destination)
evacuationCoffreRouter.post("/:id/deposit", attachAbility, requireAbility(Actions.DEPOSIT, Subjects.EVACUATION_COFFRE), async (req, res) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role ?? '';
    if (!userId) return res.status(401).json({ success: false, error: "Non authentifié" });

    const data = depositEvacuationSchema.parse(req.body);

    const result = await depositEvacuation({
      evacuationId: req.params.id,
      userId,
      userRole,
      ...data,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, "Erreur POST /:id/deposit");
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /:id/reconcile - Rapprocher ou signaler un écart
evacuationCoffreRouter.post("/:id/reconcile", attachAbility, requireAbility(Actions.RECONCILE, Subjects.EVACUATION_COFFRE), async (req, res) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role ?? '';
    if (!userId) return res.status(401).json({ success: false, error: "Non authentifié" });

    const data = reconcileEvacuationSchema.parse(req.body);

    const result = await reconcileEvacuation({
      evacuationId: req.params.id,
      userId,
      userRole,
      ...data,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, "Erreur POST /:id/reconcile");
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /:id/cancel - Annuler
evacuationCoffreRouter.post("/:id/cancel", async (req, res) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role ?? '';
    if (!userId) return res.status(401).json({ success: false, error: "Non authentifié" });

    const { reason } = cancelEvacuationSchema.parse(req.body);

    const result = await cancelEvacuation({
      evacuationId: req.params.id,
      userId,
      userRole,
      reason,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, "Erreur POST /:id/cancel");
    res.status(400).json({ success: false, error: error.message });
  }
});
