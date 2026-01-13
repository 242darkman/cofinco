import { Router } from "express";
import { TransfertCoffreService } from "../services/coffre/transfert-service";
import { idempotencyMiddleware } from "../middleware/idempotency";
import { z } from "zod";
import { db } from "../db";
import { configCoffreFort } from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import * as schema from "@shared/schema";
import { storage } from "../storage";

import { requireAuth } from "../auth";

export const coffreRouter = Router();
const service = new TransfertCoffreService();

// Apply authentication middleware to all routes in this router
coffreRouter.use(requireAuth);

// 1. Créer une demande de transfert

// 1. Créer une demande de transfert
coffreRouter.post(
  "/transferts",
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
      const userId = (req as any).user?.id || req.body.userId; // Fallback dev

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

      res.status(201).json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Invalid Request" });
    }
  }
);

// 1.b Approvisionnement Externe du Coffre (ADMIN)
coffreRouter.post(
  "/approvisionnement",
  idempotencyMiddleware("coffre-approvisionnement"),
  async (req, res) => {
    try {
      const validationSchema = z.object({
        agenceId: z.string().uuid(),
        montant: z.number().positive(),
        motif: z.string().min(3),
        description: z.string().optional(),
        idempotencyKey: z.string().optional(),
      });

      const body = validationSchema.parse(req.body);
      
      // Verify Admin Role (or at least Manager)
      const userRole = (req as any).user?.role;
      // Adaptez selon vos rôles : Admin, Chef Agence, etc.
      if (!["Administrateur", "admin", "Chef Agence"].includes(userRole)) {
         return res.status(403).json({ error: "Action réservée aux administrateurs" });
      }

      const userId = (req as any).user?.id || req.body.userId;

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
// 9. Lister les mouvements du coffre
coffreRouter.get("/mouvements", async (req, res) => {
  try {
    const agenceId = req.query.agenceId as string;
    if (!agenceId) return res.status(400).json({ error: "Missing agenceId" });

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    // 1. Récupérer le coffre-fort de l'agence (nouveau système unifié)
    const [coffre] = await db.select()
      .from(schema.coffresForts)
      .where(eq(schema.coffresForts.ownerId, agenceId));

    if (!coffre) {
      return res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } });
    }

    // 2. Query Mouvements
    // Criteria:
    // - Agence ID matches
    // - AND (
    //    metadata->caisseId == coffre.id (Transfers)
    //    OR typePaiement == 'Approvisionnement coffre' (External Provisioning)
    //    OR typePaiement == 'Versement coffre' (Manual Deposits specific to safe?)
    // )
    
    const conditions = and(
        eq(schema.mouvementsFinanciers.agenceId, agenceId),
        sql`(${schema.mouvementsFinanciers.metadata}->>'coffreId' = ${coffre.id} 
            OR ${schema.mouvementsFinanciers.metadata}->>'caisseId' = ${coffre.id}
            OR ${schema.mouvementsFinanciers.typePaiement} = 'Approvisionnement coffre'
            OR ${schema.mouvementsFinanciers.metadata}->>'type' = 'APPROVISIONNEMENT_EXTERNE'
            OR ${schema.mouvementsFinanciers.metadata}->>'type' = 'TRANSFERT_INTER_COFFRES')`
    );

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
        .from(schema.mouvementsFinanciers)
        .where(conditions);
    
    const movements = await db.select()
        .from(schema.mouvementsFinanciers)
        .where(conditions)
        .orderBy(desc(schema.mouvementsFinanciers.dateOperation))
        .limit(limit)
        .offset(offset);

    // Enrichir avec infos utilisateur
    const enriched = await Promise.all(movements.map(async (m) => {
        let user = null;
        if (m.createdBy) {
            [user] = await db.select({ nom: schema.users.nom, prenom: schema.users.prenom })
                .from(schema.users)
                .where(eq(schema.users.id, m.createdBy));
        }
        return { ...m, initiator: user };
    }));

    res.json({
        data: enriched,
        pagination: {
            page,
            limit,
            total: Number(countResult?.count || 0),
            totalPages: Math.ceil(Number(countResult?.count || 0) / limit),
        }
    });

  } catch (e: any) {
    console.error("Error fetching coffre movements:", e);
    res.status(500).json({ error: e.message });
  }
});

// 7. Récupérer le solde (Migré vers coffresForts)
coffreRouter.get("/stats", async (req, res) => {
  try {
    const agenceId = req.query.agenceId as string;
    if (!agenceId) return res.status(400).json({ error: "Missing agenceId" });

    // Récupérer le coffre-fort de l'agence depuis la nouvelle table unifiée
    const [coffre] = await db.select()
      .from(schema.coffresForts)
      .where(eq(schema.coffresForts.ownerId, agenceId));

    if (!coffre) {
      // Essayer de trouver le coffre du siège si c'est le siège
      const [coffreSiege] = await db.select()
        .from(schema.coffresForts)
        .where(eq(schema.coffresForts.ownerType, "SIEGE"));
      
      if (coffreSiege) {
        return res.json({ solde: Number(coffreSiege.solde), coffreId: coffreSiege.id, code: coffreSiege.code });
      }
      return res.json({ solde: 0 });
    }

    res.json({ solde: Number(coffre.solde), coffreId: coffre.id, code: coffre.code });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 8. Récupérer la configuration
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
