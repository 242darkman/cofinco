import { Router } from "express";
import { createLogger } from "../lib/logger";
import { TransfertCoffreService } from "../services/coffre/transfert-service";

const logger = createLogger('Routes:Coffre');
import { idempotencyMiddleware } from "../middleware/idempotency";
import { z } from "zod";
import { SystemRole, isAdminRole, normalizeRole } from "@shared/types/roles";
import { db } from "../db";
import { configCoffreFort } from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import * as schema from "@shared/schema";
import { storage } from "../storage";

import { requireAuth } from "../auth";
import { attachAbility, requireAbility } from "../authorization";
import { Actions, Subjects } from "@shared/ability";
import { dispatchDomainEvent } from "../services/notifications/domain-events/event-registry";
import { handleInsufficientFundsError } from "../middleware/financial-validation";

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
coffreRouter.post(
  "/approvisionnement",
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

      // Verify Admin Role (or at least Manager)
      const userRole = (req as any).user?.role;
      const normalizedRole = normalizeRole(userRole);
      if (!(normalizedRole === SystemRole.ADMIN || normalizedRole === SystemRole.CHEF_AGENCE)) {
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
coffreRouter.post(
  "/transferts/:id/reverse",
  attachAbility,
  requireAbility(Actions.MANAGE, Subjects.COFFRE),
  idempotencyMiddleware("reverse-transfert"),
  async (req, res) => {
    try {
      const reverseSchema = z.object({
        reason: z.string().min(10, "Le motif doit faire au moins 10 caractères"),
      });
      const { reason } = reverseSchema.parse(req.body);
      const userId = (req as any).user?.id;

      // 1. Load original transfer
      const [original] = await db
        .select()
        .from(schema.transfertsCoffreCaisse)
        .where(eq(schema.transfertsCoffreCaisse.id, req.params.id));

      if (!original) {
        return res.status(404).json({ error: "Transfert non trouvé" });
      }
      if (original.statut !== "EXECUTED") {
        return res.status(400).json({ error: `Seuls les transferts exécutés peuvent être annulés (statut actuel: ${original.statut})` });
      }
      if (original.verrouille) {
        return res.status(400).json({ error: "Ce transfert est verrouillé et ne peut pas être annulé" });
      }

      // 2. Check time limit: only within 24 hours of execution
      const executedAt = original.executedAt ? new Date(original.executedAt) : null;
      if (executedAt) {
        const hoursElapsed = (Date.now() - executedAt.getTime()) / (1000 * 60 * 60);
        if (hoursElapsed > 24) {
          return res.status(400).json({ error: "L'annulation n'est possible que dans les 24h suivant l'exécution" });
        }
      }

      // 3. Determine reverse direction
      const reverseType = original.typeTransfert === "COFFRE_VERS_CAISSE"
        ? "CAISSE_VERS_COFFRE"
        : "COFFRE_VERS_CAISSE";

      // 4. Create compensating transfer (auto-validated + auto-executed)
      const result = await service.createTransfert({
        agenceId: original.agenceId,
        caisseId: original.caisseId,
        typeTransfert: reverseType,
        montant: Number(original.montant),
        motif: `[ANNULATION] ${reason} (réf. originale: ${original.reference})`,
        commentaire: JSON.stringify({
          isReversal: true,
          originalTransfertId: original.id,
          originalReference: original.reference,
          reversalReason: reason,
        }),
        requestedBy: userId,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      if (!result.success) {
        return res.status(400).json(result);
      }

      const newTransfert = (result as any).transfert;

      // 5. Auto-validate the compensating transfer
      await service.validateTransfert({
        transfertId: newTransfert.id,
        validatorId: userId,
        approved: true,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      // 6. Auto-execute the compensating transfer
      const execResult = await service.executeTransfert({
        transfertId: newTransfert.id,
        executorId: userId,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      // 7. Lock the original transfer and link to reversal
      await db.update(schema.transfertsCoffreCaisse)
        .set({
          verrouille: true,
          updatedAt: new Date(),
          // Add reversal metadata for audit trail
          commentaire: original.commentaire
            ? `${original.commentaire}\n\n[ANNULÉ] Transfert compensatoire: ${newTransfert.reference} - ${reason}`
            : `[ANNULÉ] Transfert compensatoire: ${newTransfert.reference} - ${reason}`
        })
        .where(eq(schema.transfertsCoffreCaisse.id, original.id));

      // 8. Create audit log for original transfer cancellation
      await db.insert(schema.transfertsCoffreAuditLogs).values({
        transfertId: original.id,
        action: "REVERSED",
        statutAvant: "EXECUTED",
        statutApres: "EXECUTED_REVERSED",
        details: {
          reason,
          reversalTransfertId: newTransfert.id,
          reversalReference: newTransfert.reference,
          reversalMontant: Number(original.montant),
          reversalDirection: reverseType,
        },
        userId,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      dispatchDomainEvent({
        type: "TRANSFER_REVERSED",
        data: {
          originalTransfertId: original.id,
          originalReference: original.reference,
          reversalTransfertId: newTransfert.id,
          reversalReference: newTransfert.reference,
          typeTransfert: reverseType,
          montant: Number(original.montant),
          agenceId: original.agenceId,
          reversedByUserId: userId,
          reason,
        },
        timestamp: new Date(),
      });

      res.json({
        success: true,
        message: "Transfert annulé avec succès via compensation",
        originalTransfert: original.reference,
        reversalTransfert: newTransfert,
        execResult,
      });
    } catch (e: any) {
      logger.error({ err: e }, 'Erreur annulation transfert');
      res.status(400).json({ error: e.message });
    }
  }
);

// 5. SUPERVISION TREASURY (Super-Admin)
coffreRouter.get("/supervision", attachAbility, requireAbility(Actions.MANAGE, Subjects.COFFRE), async (req, res) => {
  try {
    // 1. Get all safes with Agency Info
    const allCoffres = await db.select({
        id: schema.coffresForts.id,
        nom: schema.coffresForts.nom,
        solde: schema.coffresForts.solde,
        agenceId: schema.coffresForts.ownerId,
        agenceNom: schema.agences.nom,
        ville: schema.villes.nom,
    })
    .from(schema.coffresForts)
    .leftJoin(schema.agences, eq(schema.coffresForts.ownerId, schema.agences.id))
    .leftJoin(schema.villes, eq(schema.agences.villeId, schema.villes.id));

    // 2. Calculate Global Stats
    const totalSolde = allCoffres.reduce((acc, c) => acc + Number(c.solde), 0);

    // 3. Breakdown by Agency
    const breakdown = allCoffres.map(c => ({
        agenceId: c.agenceId,
        agenceNom: c.agenceNom,
        ville: c.ville,
        solde: Number(c.solde)
    })).sort((a, b) => b.solde - a.solde);

    // 4. History - Supports period: "today" | "7d" | "30d" | "1y" (default: "30d")
    // Supports "historyFor" query param to fetch history for specific agencies (comma separated IDs)
    const historyFor = (req.query.historyFor as string)?.split(',').filter(Boolean);
    const period = (req.query.period as string) || '30d';

    // Calculate date range based on period
    const sinceDate = new Date();
    let bucketCount: number;
    let bucketType: 'hour' | 'day' | 'month';

    switch (period) {
      case 'today':
        sinceDate.setHours(0, 0, 0, 0);
        bucketCount = 24;
        bucketType = 'hour';
        break;
      case '7d':
        sinceDate.setDate(sinceDate.getDate() - 7);
        bucketCount = 7;
        bucketType = 'day';
        break;
      case '1y':
        sinceDate.setFullYear(sinceDate.getFullYear() - 1);
        bucketCount = 12;
        bucketType = 'month';
        break;
      default: // '30d'
        sinceDate.setDate(sinceDate.getDate() - 30);
        bucketCount = 30;
        bucketType = 'day';
        break;
    }

    // If specific agencies requested, filter coffreIds. Otherwise use all.
    let targetCoffreIds = allCoffres.map(c => c.id);
    if (historyFor && historyFor.length > 0) {
       targetCoffreIds = allCoffres.filter(c => historyFor.includes(c.agenceId!)).map(c => c.id);
    }

    // Safety check: if no coffres, return empty history
    let history: any[] = [];

    if (targetCoffreIds.length > 0) {
        const movements = await db.select({
            date: schema.mouvementsFinanciers.dateOperation,
            montant: schema.mouvementsFinanciers.montant,
            sens: schema.mouvementsFinanciers.sens,
            sourceId: schema.mouvementsFinanciers.sourceId,
            metadata: schema.mouvementsFinanciers.metadata
        })
        .from(schema.mouvementsFinanciers)
        .where(
            and(
                sql`${schema.mouvementsFinanciers.dateOperation} >= ${sinceDate}`,
                // Check if sourceId OR metadata->destinationId matches any TARGET coffre
                sql`(${schema.mouvementsFinanciers.sourceId} IN ${targetCoffreIds} OR ${schema.mouvementsFinanciers.metadata}->>'destinationId' IN ${targetCoffreIds})`
            )
        )
        .orderBy(desc(schema.mouvementsFinanciers.dateOperation));

        // Map coffreId to agenceId for grouping
        const coffreToAgence = allCoffres.reduce((acc, c) => {
            acc[c.id] = c.agenceId!;
            return acc;
        }, {} as Record<string, string>);

        // Helper to get bucket key from a Date
        const getBucketKey = (d: Date): string => {
            if (bucketType === 'hour') return d.toISOString().slice(0, 13); // "2026-01-26T14"
            if (bucketType === 'month') return d.toISOString().slice(0, 7);  // "2026-01"
            return d.toISOString().split('T')[0]; // "2026-01-26"
        };

        // Net change by bucket AND agence
        const bucketAgencyChange: Record<string, Record<string, number>> = {};

        movements.forEach(m => {
            const bucketKey = getBucketKey(new Date(m.date!));
            const amount = Number(m.montant);

            if (!bucketAgencyChange[bucketKey]) bucketAgencyChange[bucketKey] = {};

            const destId = (m.metadata as any)?.destinationId;
            const srcId = m.sourceId;

            if (targetCoffreIds.includes(destId)) {
                const agId = coffreToAgence[destId];
                bucketAgencyChange[bucketKey][agId] = (bucketAgencyChange[bucketKey][agId] || 0) + amount;
            }
            if (targetCoffreIds.includes(srcId as string)) {
                const agId = coffreToAgence[srcId as string];
                bucketAgencyChange[bucketKey][agId] = (bucketAgencyChange[bucketKey][agId] || 0) - amount;
            }
        });

        // Current totals for the TARGETED agencies
        const currentBalances = allCoffres
            .filter(c => targetCoffreIds.includes(c.id))
            .reduce((acc, c) => {
                acc[c.agenceId!] = (acc[c.agenceId!] || 0) + Number(c.solde);
                return acc;
            }, {} as Record<string, number>);

        // Reconstruct history going backwards from now
        const now = new Date();
        const runningBalances = { ...currentBalances };
        const relevantAgIds = Object.keys(currentBalances);

        for (let i = 0; i < bucketCount; i++) {
            const bucketDate = new Date(now);
            if (bucketType === 'hour') {
                bucketDate.setHours(now.getHours() - i, 0, 0, 0);
            } else if (bucketType === 'month') {
                bucketDate.setMonth(now.getMonth() - i);
                bucketDate.setDate(1);
            } else {
                bucketDate.setDate(now.getDate() - i);
            }
            const bucketKey = getBucketKey(bucketDate);

            const totalBalance = Object.values(runningBalances).reduce((a, b) => a + b, 0);

            history.push({
                date: bucketType === 'hour' ? bucketDate.toISOString() : bucketKey,
                balance: totalBalance,
                ...runningBalances
            });

            // Go back in time: subtract this bucket's net change
            const changes = bucketAgencyChange[bucketKey] || {};
            relevantAgIds.forEach(id => {
                runningBalances[id] -= (changes[id] || 0);
            });
        }

        history.reverse();
    }

    res.json({
        globalBalance: totalSolde, // Always return global current balance
        breakdown, // Always return full breakdown
        history // Returns history for the requested agencies (or all if none specified)
    });

  } catch (e: any) {
    logger.error({ err: e }, 'Supervision Error');
    res.status(500).json({ error: e.message });
  }
});

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
            OR ${schema.mouvementsFinanciers.sourceId} = ${coffre.id}
            OR ${schema.mouvementsFinanciers.typePaiement}::text = 'SAFE_SUPPLY'
            OR ${schema.mouvementsFinanciers.typePaiement}::text = 'CREDIT_DISBURSEMENT'
            OR ${schema.mouvementsFinanciers.typePaiement}::text = 'TRANSFER_OUT'
            OR ${schema.mouvementsFinanciers.metadata}->>'type' = 'APPROVISIONNEMENT_EXTERNE'
            OR ${schema.mouvementsFinanciers.metadata}->>'type' = 'REFUND_SOURCE'
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
    logger.error({ err: e }, 'Error fetching coffre movements');
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
    if (!isAdminRole(userRole)) {
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

// ============================================================================
// WORKFLOW SECURISE D'OUVERTURE DE CAISSE (Coffre → Caisse)
// Routes pour le responsable coffre
// ============================================================================

// Importer le service d'ouverture
import { sessionOpeningService } from "../services/caisse/session-opening-service";

/**
 * GET /coffre/pending-opening-requests
 * Liste les demandes d'ouverture de caisse en attente pour une agence
 */
coffreRouter.get(
  "/pending-opening-requests",
  attachAbility,
  requireAbility(Actions.CREATE, Subjects.COFFRE_TRANSFERT),
  async (req, res) => {
    try {
      const user = (req as any).user;
      const agenceId = (req.query.agenceId as string) || user?.agenceId;

      if (!agenceId) {
        return res.status(400).json({ error: "agenceId requis" });
      }

      const requests = await sessionOpeningService.getPendingOpeningRequests(agenceId);
      res.json(requests);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }
);

/**
 * POST /coffre/transferts/:id/validate-opening
 * Phase B: Le responsable coffre valide ou rejette une demande d'ouverture
 */
coffreRouter.post(
  "/transferts/:id/validate-opening",
  attachAbility,
  requireAbility(Actions.CREATE, Subjects.COFFRE_TRANSFERT),
  async (req, res) => {
    try {
      const { id } = req.params;
      const user = (req as any).user;

      if (!user?.id) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      const validationSchema = z.object({
        approved: z.boolean(),
        reasonRejection: z.string().optional(),
        billetage: z.record(z.string(), z.number()).optional(),
      });

      const body = validationSchema.parse(req.body);

      // Validation: si rejet, raison obligatoire
      if (!body.approved && !body.reasonRejection) {
        return res.status(400).json({ error: "La raison du rejet est obligatoire" });
      }

      const result = await sessionOpeningService.validateOpeningTransfer({
        transfertId: id,
        validatorId: user.id,
        approved: body.approved,
        reasonRejection: body.reasonRejection,
        billetage: body.billetage,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      if (!result.success) {
        const statusMap: Record<string, number> = {
          TRANSFERT_NOT_FOUND: 404,
          NOT_OPENING_FUND: 400,
          INVALID_TRANSITION: 409,
          SAME_USER_FORBIDDEN: 403,
          SESSION_NOT_FOUND: 404,
          DB_ERROR: 500,
        };
        const status = statusMap[result.errorCode || 'DB_ERROR'] || 500;
        return res.status(status).json({
          error: result.error,
          errorCode: result.errorCode
        });
      }

      res.json({
        success: true,
        session: result.session,
        transfert: result.transfert,
      });
    } catch (e: any) {
      if (e.name === 'ZodError') {
        return res.status(400).json({ error: "Données invalides", details: e.errors });
      }
      res.status(500).json({ error: e.message });
    }
  }
);
