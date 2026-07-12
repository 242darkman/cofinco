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

import { sessionOpeningService } from "../../services/caisse/session-opening-service";
export const operationsCoffreRouter = Router();
const logger = createLogger('Routes:Coffre:operations-routes');
const service = new TransfertCoffreService();

// Apply authentication middleware to all routes in this router
operationsCoffreRouter.use(requireAuth);

operationsCoffreRouter.post(
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
      const userId = req.user!.id;

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

operationsCoffreRouter.get("/mouvements", attachAbility, requireAbility(Actions.VIEW, Subjects.COFFRE), async (req, res) => {
  try {
    const agenceId = req.query.agenceId as string;
    if (!agenceId) return res.status(400).json({ error: "Missing agenceId" });

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;

    // 1. Récupérer le coffre-fort de l'agence (nouveau système unifié)
    const [coffre] = await db.select()
      .from(schema.coffresForts)
      .where(eq(schema.coffresForts.ownerId, agenceId));

    if (!coffre) {
      return res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } });
    }

    // 2. Build date conditions
    const dateConditions = [];
    if (dateFrom) {
      dateConditions.push(sql`${schema.mouvementsFinanciers.dateOperation} >= ${dateFrom}`);
    }
    if (dateTo) {
      dateConditions.push(sql`${schema.mouvementsFinanciers.dateOperation} <= ${dateTo + 'T23:59:59'}`);
    }

    const conditions = and(
        eq(schema.mouvementsFinanciers.agenceId, agenceId),
        ...(dateConditions.length > 0 ? dateConditions : []),
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

operationsCoffreRouter.post(
  "/transferts/:id/validate-opening",
  attachAbility,
  requireAbility(Actions.CREATE, Subjects.COFFRE_TRANSFERT),
  async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user;

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


