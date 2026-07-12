import { Router } from "express";
import { z } from "zod";
import { createLogger } from "../../lib/logger";

const logger = createLogger('Routes:TransfertsInterCoffresWorkflow');
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import {
  submitTransfert,
  approveTransfert,
  cancelTransfert
} from "../../services/transfert-inter-coffres/transfert-validation";
import {
  dispatchTransfert,
  receiveTransfert
} from "../../services/transfert-inter-coffres/transfert-workflow";
import { broadcastTransfertUpdate } from "./utils";

export const transfertsWorkflowRouter = Router();

// POST /transferts/:id/submit - Soumettre un transfert
transfertsWorkflowRouter.post("/:id/submit", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role ?? '';

    if (!userId) {
      return res.status(401).json({ success: false, error: "Non authentifié" });
    }

    const result = await submitTransfert({
      transfertId: id,
      userId,
      userRole,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    broadcastTransfertUpdate('SUBMITTED', id, { statut: 'SUBMITTED' });
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur POST /transferts/:id/submit');
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /transferts/:id/approve - Approuver un transfert
transfertsWorkflowRouter.post("/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;
    const { level } = req.query;
    const userId = req.user?.id;
    const userRole = req.user?.role ?? '';

    if (!userId) {
      return res.status(401).json({ success: false, error: "Non authentifié" });
    }

    const schema = z.object({
      approved: z.boolean(),
      commentaire: z.string().optional(),
      rejectionReason: z.string().optional(),
    });

    const data = schema.parse(req.body);
    const approvalLevel = level === "2" ? 2 : 1;

    const result = await approveTransfert({
      transfertId: id,
      level: approvalLevel,
      ...data,
      userId,
      userRole,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    broadcastTransfertUpdate(data.approved ? `APPROVED_L${approvalLevel}` : 'REJECTED', id, {
      statut: result.data?.statut,
    });
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur POST /transferts/:id/approve');
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /transferts/:id/reject - Rejeter un transfert (alias pour approve avec approved=false)
transfertsWorkflowRouter.post("/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;
    const { level } = req.query;
    const userId = req.user?.id;
    const userRole = req.user?.role ?? '';

    if (!userId) {
      return res.status(401).json({ success: false, error: "Non authentifié" });
    }

    const schema = z.object({
      reason: z.string().min(10),
    });

    const { reason } = schema.parse(req.body);
    const approvalLevel = level === "2" ? 2 : 1;

    const result = await approveTransfert({
      transfertId: id,
      level: approvalLevel,
      approved: false,
      rejectionReason: reason,
      userId,
      userRole,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    broadcastTransfertUpdate('REJECTED', id, { statut: 'REJECTED' });
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur POST /transferts/:id/reject');
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /transferts/:id/dispatch - Dispatcher un transfert
transfertsWorkflowRouter.post("/:id/dispatch", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role ?? '';

    if (!userId) {
      return res.status(401).json({ success: false, error: "Non authentifié" });
    }

    const schema = z.object({
      heureDepart: z.string().optional(),
      commentaire: z.string().optional(),
    });

    const data = schema.parse(req.body);

    const result = await dispatchTransfert({
      transfertId: id,
      ...data,
      userId,
      userRole,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    if (!result.success) {
      // Retourner 409 Conflict pour les erreurs de concurrence
      if (result.errorCode === "TIC_CONFLICT" || result.errorCode === "TIC_024") {
        return res.status(409).json(result);
      }
      return res.status(400).json(result);
    }

    broadcastTransfertUpdate('DISPATCHED', id, { statut: 'IN_TRANSIT' });
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur POST /transferts/:id/dispatch');
    // Gérer les erreurs de verrouillage PostgreSQL (lock_not_available)
    if (error.code === "55P03") {
      return res.status(409).json({ 
        success: false, 
        errorCode: "TIC_CONFLICT",
        error: "Ce transfert est en cours de traitement par un autre utilisateur." 
      });
    }
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /transferts/:id/receive - Réceptionner un transfert
transfertsWorkflowRouter.post("/:id/receive", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role ?? '';

    if (!userId) {
      return res.status(401).json({ success: false, error: "Non authentifié" });
    }

    const schema = z.object({
      montantRecu: z.number().positive(),
      conforme: z.boolean(),
      commentaire: z.string().optional(),
      motifEcart: z.string().optional(),
      heureReception: z.string().optional(),
    });

    const data = schema.parse(req.body);

    const result = await receiveTransfert({
      transfertId: id,
      ...data,
      userId,
      userRole,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    if (!result.success) {
      // Retourner 409 Conflict pour les erreurs de concurrence
      if (result.errorCode === "TIC_CONFLICT") {
        return res.status(409).json(result);
      }
      return res.status(400).json(result);
    }

    broadcastTransfertUpdate('RECEIVED', id, {
      statut: data.conforme ? 'RECEIVED' : 'RECEIVED_WITH_DISCREPANCY',
      conforme: data.conforme,
    });
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur POST /transferts/:id/receive');
    // Gérer les erreurs de verrouillage PostgreSQL (lock_not_available)
    if (error.code === "55P03") {
      return res.status(409).json({ 
        success: false, 
        errorCode: "TIC_CONFLICT",
        error: "Ce transfert est en cours de traitement par un autre utilisateur." 
      });
    }
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /transferts/:id/cancel - Annuler un transfert
transfertsWorkflowRouter.post("/:id/cancel", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role ?? '';

    if (!userId) {
      return res.status(401).json({ success: false, error: "Non authentifié" });
    }

    const schema = z.object({
      reason: z.string().min(10),
    });

    const { reason } = schema.parse(req.body);

    const result = await cancelTransfert({
      transfertId: id,
      reason,
      userId,
      userRole,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    broadcastTransfertUpdate('CANCELLED', id, { statut: 'CANCELLED' });
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur POST /transferts/:id/cancel');
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /transferts/bulk-approve - Approuver en lot
transfertsWorkflowRouter.post("/bulk-approve", async (req, res) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role ?? '';
    if (!userId) return res.status(401).json({ success: false, error: "Non authentifié" });

    const schema = z.object({
      transfertIds: z.array(z.string().uuid()).min(1).max(50),
      level: z.number().min(1).max(2),
      commentaire: z.string().optional(),
    });
    const { transfertIds, level, commentaire } = schema.parse(req.body);

    const results: Array<{ id: string; success: boolean; error?: string }> = [];
    for (const tid of transfertIds) {
      try {
        const result = await approveTransfert({
          transfertId: tid,
          level: level as 1 | 2,
          approved: true,
          commentaire,
          userId,
          userRole,
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        });
        results.push({ id: tid, success: result.success, error: result.error });
        if (result.success) broadcastTransfertUpdate(`APPROVED_L${level}`, tid);
      } catch (e: any) {
        results.push({ id: tid, success: false, error: e.message });
      }
    }

    const succeeded = results.filter(r => r.success).length;
    res.json({ success: true, data: { total: transfertIds.length, succeeded, failed: transfertIds.length - succeeded, results } });
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur POST /transferts/bulk-approve');
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /transferts/bulk-reject - Rejeter en lot
transfertsWorkflowRouter.post("/bulk-reject", async (req, res) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role ?? '';
    if (!userId) return res.status(401).json({ success: false, error: "Non authentifié" });

    const schema = z.object({
      transfertIds: z.array(z.string().uuid()).min(1).max(50),
      level: z.number().min(1).max(2),
      reason: z.string().min(10),
    });
    const { transfertIds, level, reason } = schema.parse(req.body);

    const results: Array<{ id: string; success: boolean; error?: string }> = [];
    for (const tid of transfertIds) {
      try {
        const result = await approveTransfert({
          transfertId: tid,
          level: level as 1 | 2,
          approved: false,
          rejectionReason: reason,
          userId,
          userRole,
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        });
        results.push({ id: tid, success: result.success, error: result.error });
        if (result.success) broadcastTransfertUpdate('REJECTED', tid);
      } catch (e: any) {
        results.push({ id: tid, success: false, error: e.message });
      }
    }

    const succeeded = results.filter(r => r.success).length;
    res.json({ success: true, data: { total: transfertIds.length, succeeded, failed: transfertIds.length - succeeded, results } });
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur POST /transferts/bulk-reject');
    res.status(400).json({ success: false, error: error.message });
  }
});
