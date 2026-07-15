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

export const transfertsCoffreRouter = Router();
const logger = createLogger('Routes:Coffre:transferts-routes');
const service = new TransfertCoffreService();

// Apply authentication middleware to all routes in this router
transfertsCoffreRouter.use(requireAuth);

// 1. Créer une demande de transfert
transfertsCoffreRouter.post(
  "/transferts",
  attachAbility,
  requireAbility(Actions.INIT_TRANSFER, Subjects.COFFRE),
  idempotencyMiddleware("create-transfert"),
  async (req, res) => {
    try {
      const validationSchema = z.object({
        caisseId: z.string().uuid(),
        typeTransfert: z.enum(["COFFRE_VERS_CAISSE", "CAISSE_VERS_COFFRE"]),
        montant: z.number().positive(),
        motif: z.string().min(3),
        commentaire: z.string().optional(),
        idempotencyKey: z.string().optional(),
        billetage: z.record(z.string(), z.number()).optional(),
        agenceId: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()), // Rend optionnel pour inférence
      });

      const body = validationSchema.parse(req.body);

      // Inférence de l'agenceId si manquant
      if (!body.agenceId) {
        const [caisse] = await db.select().from(schema.caisses).where(eq(schema.caisses.id, body.caisseId));
        if (!caisse) {
          return res.status(400).json({ error: "Caisse introuvable" });
        }
        body.agenceId = caisse.agenceId;
      }
      const userId = req.user?.id || req.body.userId; // Fallback dev

      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const result = await service.createTransfert({
        ...body,
        agenceId: body.agenceId!,
        requestedBy: userId,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      if (!result.success) {
        return res.status(400).json(result);
      }

      // Domain event: transfer requested
      const createdTransfert = (result as any).transfert;
      dispatchDomainEvent({
        type: "TRANSFER_REQUESTED",
        data: {
          transfertId: createdTransfert?.id || req.body.idempotencyKey,
          reference: createdTransfert?.reference || "",
          typeTransfert: body.typeTransfert,
          montant: body.montant,
          agenceId: body.agenceId!,
          requestedByUserId: userId,
        },
        timestamp: new Date(),
      });

      res.status(201).json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Invalid Request" });
    }
  }
);

// 1.b Approvisionnement Externe du Coffre (ADMIN)
transfertsCoffreRouter.post(
  "/approvisionnement",
  attachAbility,
  requireAbility(Actions.MANAGE, Subjects.COFFRE),
  idempotencyMiddleware("coffre-approvisionnement"),
  async (req, res) => {
    try {
      const validationSchema = z.object({
        agenceId: z.string().uuid(),
        montant: z.coerce.number().positive(),
        motif: z.string().min(3),
        description: z.string().optional(),
        idempotencyKey: z.string().optional(),
      });

      const body = validationSchema.parse(req.body);

      const userId = req.user?.id || req.body.userId;

      const result = await storage.provisionCoffreWithLedger({
        agenceId: body.agenceId,
        montant: body.montant.toString(),
        motif: body.motif,
        description: body.description,
        idempotencyKey: body.idempotencyKey
      }, userId);

      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Invalid Request" });
    }
  }
);

// 2. Valider (ou Rejeter) un transfert
transfertsCoffreRouter.post(
  "/transferts/:id/validate",
  attachAbility,
  requireAbility(Actions.VALIDATE_TRANSFER, Subjects.COFFRE),
  async (req, res) => {
    try {
      const schema = z.object({
        approved: z.boolean(),
        reasonRejection: z.string().optional(),
      });

      const { approved, reasonRejection } = schema.parse(req.body);
      const userId = req.user?.id || req.body.userId;

      const result = await service.validateTransfert({
        transfertId: req.params.id,
        validatorId: userId,
        approved,
        reasonRejection,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      if (!result.success) {
        return res.status(400).json(result);
      }

      // Domain event: transfer validated or rejected
      const valTransfert = (result as any).transfert;
      if (approved) {
        dispatchDomainEvent({
          type: "TRANSFER_VALIDATED",
          data: {
            transfertId: req.params.id,
            reference: valTransfert?.reference || "",
            montant: Number(valTransfert?.montant || 0),
            agenceId: valTransfert?.agenceId || "",
            validatedByUserId: userId,
          },
          timestamp: new Date(),
        });
      } else {
        dispatchDomainEvent({
          type: "TRANSFER_REJECTED",
          data: {
            transfertId: req.params.id,
            reference: valTransfert?.reference || "",
            montant: Number(valTransfert?.montant || 0),
            reason: reasonRejection,
            agenceId: valTransfert?.agenceId || "",
            rejectedByUserId: userId,
          },
          timestamp: new Date(),
        });
      }

      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

// 3. Exécuter un transfert
transfertsCoffreRouter.post(
  "/transferts/:id/execute",
  attachAbility,
  requireAbility(Actions.EXECUTE_TRANSFER, Subjects.COFFRE),
  idempotencyMiddleware("execute-transfert"),
  async (req, res) => {
    try {
      const schema = z.object({
        sessionId: z.string().uuid().optional(),
        billetage: z.record(z.string(), z.number()).optional(),
      });

      const body = schema.parse(req.body);
      const userId = req.user?.id || req.body.userId;

      const result = await service.executeTransfert({
        transfertId: req.params.id,
        executorId: userId,
        sessionId: body.sessionId,
        billetage: body.billetage,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      if (!result.success) {
        return res.status(400).json(result);
      }

      // Domain event: transfer executed
      const execTransfert = (result as any).transfert;
      dispatchDomainEvent({
        type: "TRANSFER_EXECUTED",
        data: {
          transfertId: req.params.id,
          reference: execTransfert?.reference || "",
          typeTransfert: execTransfert?.typeTransfert || "",
          montant: Number(execTransfert?.montant || 0),
          agenceId: execTransfert?.agenceId || "",
          executedByUserId: userId,
        },
        timestamp: new Date(),
      });

      res.json(result);
    } catch (e: any) {
      if (handleInsufficientFundsError(e, res)) return;
      res.status(400).json({ error: e.message });
    }
  }
);

// 4. Annuler un transfert
transfertsCoffreRouter.post(
  "/transferts/:id/cancel",
  attachAbility,
  requireAbility(Actions.CANCEL, Subjects.COFFRE_TRANSFERT),
  async (req, res) => {
    try {
      const schema = z.object({
        reason: z.string(),
      });
      const { reason } = schema.parse(req.body);
      const userId = req.user?.id || req.body.userId;

      const result = await service.cancelTransfert({
        transfertId: req.params.id,
        cancelledBy: userId,
        reason,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      if (!result.success) {
        return res.status(400).json(result);
      }

      // Domain event: transfer cancelled
      const cancelledTransfert = (result as any).transfert;
      dispatchDomainEvent({
        type: "TRANSFER_CANCELLED",
        data: {
          transfertId: req.params.id,
          reference: cancelledTransfert?.reference || "",
          typeTransfert: cancelledTransfert?.typeTransfert || "",
          montant: Number(cancelledTransfert?.montant || 0),
          agenceId: cancelledTransfert?.agenceId || "",
          reason,
          cancelledByUserId: userId,
        },
        timestamp: new Date(),
      });

      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

// 4b. Annuler un transfert EXECUTÉ (crée un transfert compensatoire en sens inverse)

transfertsCoffreRouter.get("/transferts", attachAbility, requireAbility(Actions.VIEW, Subjects.COFFRE_TRANSFERT), async (req, res) => {
  try {
    const agenceId = req.query.agenceId as string;
    if (!agenceId) return res.status(400).json({ error: "Missing agenceId" });

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await service.listTransferts({
      agenceId,
      statut: req.query.statut as string,
      typeTransfert: req.query.typeTransfert as string,
      page,
      limit,
    });

    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 6. Détails d'un transfert
transfertsCoffreRouter.get("/transferts/:id", attachAbility, requireAbility(Actions.VIEW, Subjects.COFFRE_TRANSFERT), async (req, res) => {
  try {
    const details = await service.getTransfertDetails(req.params.id);
    if (!details) return res.status(404).json({ error: "Not found" });

    const audits = await service.getTransfertAuditLogs(req.params.id);

    res.json({ ...details, audits });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
// 9. Lister les mouvements du coffre

