import { Router } from "express";
import { TransfertCoffreService } from "../services/coffre/transfert-service";
import { idempotencyMiddleware } from "../middleware/idempotency";
import { z } from "zod";
import { db } from "../db";
import { configCoffreFort } from "@shared/schema";
import { eq } from "drizzle-orm";

export const coffreRouter = Router();
const service = new TransfertCoffreService();

// Middleware auth requis ici (supposé déjà monté au niveau global ou route parent)

// 1. Créer une demande de transfert
coffreRouter.post(
  "/transferts",
  idempotencyMiddleware("create-transfert"),
  async (req, res) => {
    try {
      const schema = z.object({
        caisseId: z.string().uuid(),
        typeTransfert: z.enum(["COFFRE_VERS_CAISSE", "CAISSE_VERS_COFFRE"]),
        montant: z.number().positive(),
        motif: z.string().min(3),
        commentaire: z.string().optional(),
        idempotencyKey: z.string().optional(),
        billetage: z.record(z.string(), z.number()).optional(),
        agenceId: z.string().uuid(), // Idéalement déduit du user/session
      });

      const body = schema.parse(req.body);
      const userId = (req as any).user?.id || req.body.userId; // Fallback dev

      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const result = await service.createTransfert({
        ...body,
        requestedBy: userId,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.status(201).json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Invalid Request" });
    }
  }
);

// 2. Valider (ou Rejeter) un transfert
coffreRouter.post(
  "/transferts/:id/validate",
  async (req, res) => {
    try {
      const schema = z.object({
        approved: z.boolean(),
        reasonRejection: z.string().optional(),
      });

      const { approved, reasonRejection } = schema.parse(req.body);
      const userId = (req as any).user?.id || req.body.userId;

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

      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

// 3. Exécuter un transfert
coffreRouter.post(
  "/transferts/:id/execute",
  idempotencyMiddleware("execute-transfert"),
  async (req, res) => {
    try {
      const schema = z.object({
        sessionId: z.string().uuid().optional(),
        billetage: z.record(z.string(), z.number()).optional(),
      });

      const body = schema.parse(req.body);
      const userId = (req as any).user?.id || req.body.userId;

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

      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

// 4. Annuler un transfert
coffreRouter.post(
  "/transferts/:id/cancel",
  async (req, res) => {
    try {
      const schema = z.object({
        reason: z.string(),
      });
      const { reason } = schema.parse(req.body);
      const userId = (req as any).user?.id || req.body.userId;

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

      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

// 5. Lister les transferts (Filtres)
coffreRouter.get("/transferts", async (req, res) => {
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
coffreRouter.get("/transferts/:id", async (req, res) => {
  try {
    const details = await service.getTransfertDetails(req.params.id);
    if (!details) return res.status(404).json({ error: "Not found" });
    
    const audits = await service.getTransfertAuditLogs(req.params.id);
    
    res.json({ ...details, audits });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
// 7. Récupérer la configuration
coffreRouter.get("/config", async (req, res) => {
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
coffreRouter.put("/config", async (req, res) => {
  try {
    const schema = z.object({
      agenceId: z.string().uuid(),
      seuilDoubleValidation: z.string().optional(), // numeric string
      separationInitiateurValideur: z.boolean().optional(),
      montantMaxTransfert: z.string().optional().nullable(),
      actif: z.boolean().optional(),
    });

    const body = schema.parse(req.body);
    
    // Vérification ROLE ADMIN
    const userRole = (req as any).user?.role;
    if (userRole !== "Administrateur" && userRole !== "admin") {
      return res.status(403).json({ error: "Access denied. Admin only." });
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
