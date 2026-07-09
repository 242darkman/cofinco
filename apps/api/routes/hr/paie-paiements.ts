import { Router } from "express";
/**
 * Routes RH — Exécution des paiements de salaires : virements, lots, confirmation et suivi des jobs.
 *
 * Monté sous /api/hr par le routeur d'index (hr.ts).
 * Endpoints :
 *   PATCH  /api/hr/paie/pay
 *   PATCH  /api/hr/paie/confirm-payment
 *   PATCH  /api/hr/paie/retry-payment
 *   PATCH  /api/hr/paie/cancel-payment
 *   GET    /api/hr/paie/payment-jobs/:runId
 *   GET    /api/hr/paie/batches/:id
 *   PATCH  /api/hr/paie/batches/:id/status
 *   PATCH  /api/hr/paie/batches/:batchId/items/:itemId
 */
import { db } from "../../db";
import { bulletinsPaie, employes, BulletinStatus, avantagesEmployes, agentObjectifs, payrollRuns, PayrollRunStatus, payrollPaymentBatches, payrollBatchItems } from "@shared/schema";
import { eq, and, count, isNull } from "drizzle-orm";
import { getAuthUser } from "../../middleware";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { hrService } from "../../services/hr-service";
import { users } from "@shared/schema";
import * as hrStorage from "../../storage/hr";
import { normalizePhone } from "@shared/utils/phone";
import { logger, broadcastHrUpdate, successResponse, errorResponse } from "./shared";

export const paiePaiementsRouter = Router();

// PATCH /api/hr/paie/pay - Payer un run de paie (VALIDATED → PENDING/PROCESSING via salary_payment_jobs)
/**
 * PATCH /api/hr/paie/pay
 */
paiePaiementsRouter.patch("/paie/pay", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.PAIE), async (req, res) => {
  try {
    const { runId } = req.body;

    if (!runId) {
      return res.status(400).json(errorResponse('VALIDATION_ERROR', 'runId requis'));
    }

    const userId = req.user?.id || "system";

    const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId));
    if (!run) {
      return res.status(404).json(errorResponse('NOT_FOUND', 'Run non trouvé'));
    }
    if (run.status !== PayrollRunStatus.VALIDATED) {
      return res.status(400).json(errorResponse('INVALID_STATUS', `Le run est en statut ${run.status}, seul VALIDATED peut être payé`));
    }

    const agenceId = run.agenceId || req.user?.agenceId;

    // Get all validated bulletins with employee payment method + phone
    const allBulletins = await db
      .select({
        bulletin: bulletinsPaie,
        paymentMethod: employes.paymentMethod,
        phone: users.telephone,
        employeNom: users.nom,
        employePrenom: users.prenom,
      })
      .from(bulletinsPaie)
      .innerJoin(employes, eq(bulletinsPaie.employeId, employes.id))
      .innerJoin(users, eq(employes.userId, users.id))
      .where(
        and(
          eq(bulletinsPaie.payrollRunId, runId),
          eq(bulletinsPaie.statut, BulletinStatus.VALIDATED),
          eq(bulletinsPaie.cancelled, false)
        )
      );

    if (allBulletins.length === 0) {
      return res.status(400).json(errorResponse('NO_BULLETINS', 'Aucun bulletin validé à payer'));
    }

    // Create salary payment jobs via the service
    const { createPaymentJobs, processQueuedJob, getJobsByRunId } = await import("../../services/salary-payment-service");

    const jobsResult = await createPaymentJobs({
      runId,
      bulletins: allBulletins.map(b => ({
        bulletinId: b.bulletin.id,
        employeId: b.bulletin.employeId,
        paymentMethod: b.paymentMethod || "CASH",
        salaireNet: Number(b.bulletin.salaireNet),
        employeNom: b.employeNom || undefined,
        employePrenom: b.employePrenom || undefined,
        msisdn: normalizePhone(b.phone) || b.phone || undefined,
      })),
      executionMode: "IMMEDIATE",
      agenceId: agenceId || undefined,
      userId,
    });

    // Process CASH jobs immediately (create caisse requests)
    for (const job of jobsResult.cashJobs) {
      try {
        await processQueuedJob(job);
      } catch (err) {
        logger.error({ jobId: job.id, err }, "Erreur traitement job CASH immédiat");
      }
    }

    // Process TRANSFER/CHECK jobs immediately (mark as PROCESSING for manual confirmation)
    for (const job of jobsResult.manualJobs) {
      try {
        await processQueuedJob(job);
      } catch (err) {
        logger.error({ jobId: job.id, err }, "Erreur traitement job TRANSFER/CHECK immédiat");
      }
    }

    // Process MOBILE_MONEY jobs immediately (initiate payouts)
    for (const job of jobsResult.momoJobs) {
      try {
        await processQueuedJob(job);
      } catch (err) {
        logger.error({ jobId: job.id, err }, "Erreur traitement job MOBILE_MONEY immédiat");
      }
    }

    // Mark objective prizes as paid for this period
    try {
      const eligible = await db.select().from(agentObjectifs).where(and(
        eq(agentObjectifs.periode, run.period),
        eq(agentObjectifs.primeStatut, "ELIGIBLE"),
        isNull(agentObjectifs.deletedAt),
      ));
      for (const obj of eligible) {
        await db.update(agentObjectifs).set({
          primeStatut: "PAID",
          updatedAt: new Date(),
        }).where(eq(agentObjectifs.id, obj.id));
        if (obj.avantageEmployeId) {
          await db.update(avantagesEmployes)
            .set({ statut: "SUSPENDED" })
            .where(eq(avantagesEmployes.id, obj.avantageEmployeId));
        }
      }
      if (eligible.length > 0) {
        logger.info({ period: run.period, count: eligible.length }, "Marked objective prizes as PAID");
      }
    } catch (prizeErr) {
      logger.error({ err: prizeErr }, "Failed to mark objective prizes as paid (non-blocking)");
    }

    const totalCash = jobsResult.cashJobs.reduce((s, j) => s + Number(j.amount), 0);
    const totalMomo = jobsResult.momoJobs.reduce((s, j) => s + Number(j.amount), 0);
    const totalManual = jobsResult.manualJobs.reduce((s, j) => s + Number(j.amount), 0);

    await hrService.logAction(
      'payroll_run',
      String(runId),
      'paid',
      {
        userId: req.user?.id,
        userName: req.user?.nom,
        userRole: req.user?.role,
        agenceId: req.user?.agenceId ?? undefined,
      },
      { statut: PayrollRunStatus.VALIDATED },
      {
        cashJobs: jobsResult.cashJobs.length,
        momoJobs: jobsResult.momoJobs.length,
        manualJobs: jobsResult.manualJobs.length,
        totalJobs: jobsResult.total,
        totalCash,
        totalMomo,
        totalManual,
      },
      undefined,
      'critical'
    );

    broadcastHrUpdate(
      {
        entity: 'payroll_run',
        action: 'paid',
        id: String(runId),
        extra: {
          count: allBulletins.length,
          total: totalCash + totalMomo + totalManual,
          pendingCaisse: jobsResult.cashJobs.length,
          momoPayouts: jobsResult.momoJobs.length,
          manualConfirmation: jobsResult.manualJobs.length,
        },
      },
      req.user ? { id: req.user.id, name: req.user.nom || '' } : undefined
    );

    res.json(successResponse({
      cashJobs: jobsResult.cashJobs.length,
      momoJobs: jobsResult.momoJobs.length,
      manualJobs: jobsResult.manualJobs.length,
      totalJobs: jobsResult.total,
      totalCash,
      totalMomo,
      totalManual,
    }));
  } catch (error) {
    logger.error({ err: error }, 'Erreur paiement paie');
    res.status(500).json(errorResponse('SERVER_ERROR', error instanceof Error ? error.message : 'Erreur serveur'));
  }
});

// PATCH /api/hr/paie/confirm-payment - Confirmation manuelle (TRANSFER/CHECK)
/**
 * PATCH /api/hr/paie/confirm-payment
 */
paiePaiementsRouter.patch("/paie/confirm-payment", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.PAIE), async (req, res) => {
  try {
    const { jobIds, reference } = req.body;
    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json(errorResponse('VALIDATION_ERROR', 'jobIds requis (tableau non vide)'));
    }

    const userId = req.user?.id || "system";
    const { confirmManualPayment } = await import("../../services/salary-payment-service");
    const result = await confirmManualPayment(jobIds, userId, reference);

    res.json(successResponse(result));
  } catch (error) {
    logger.error({ err: error }, 'Erreur confirmation paiement');
    res.status(500).json(errorResponse('SERVER_ERROR', error instanceof Error ? error.message : 'Erreur serveur'));
  }
});

// PATCH /api/hr/paie/retry-payment - Relance d'un job FAILED
/**
 * PATCH /api/hr/paie/retry-payment
 */
paiePaiementsRouter.patch("/paie/retry-payment", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.PAIE), async (req, res) => {
  try {
    const { jobIds } = req.body;
    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json(errorResponse('VALIDATION_ERROR', 'jobIds requis'));
    }

    const userId = req.user?.id || "system";
    const { retryJobs } = await import("../../services/salary-payment-service");
    const result = await retryJobs(jobIds, userId);

    res.json(successResponse(result));
  } catch (error) {
    logger.error({ err: error }, 'Erreur retry paiement');
    res.status(500).json(errorResponse('SERVER_ERROR', error instanceof Error ? error.message : 'Erreur serveur'));
  }
});

// PATCH /api/hr/paie/cancel-payment - Annulation d'un job
/**
 * PATCH /api/hr/paie/cancel-payment
 */
paiePaiementsRouter.patch("/paie/cancel-payment", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.PAIE), async (req, res) => {
  try {
    const { jobIds } = req.body;
    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json(errorResponse('VALIDATION_ERROR', 'jobIds requis'));
    }

    const userId = req.user?.id || "system";
    const { cancelJobs } = await import("../../services/salary-payment-service");
    const result = await cancelJobs(jobIds, userId);

    res.json(successResponse(result));
  } catch (error) {
    logger.error({ err: error }, 'Erreur annulation paiement');
    res.status(500).json(errorResponse('SERVER_ERROR', error instanceof Error ? error.message : 'Erreur serveur'));
  }
});

// GET /api/hr/paie/payment-jobs/:runId - Liste les jobs de paiement d'un run
/**
 * GET /api/hr/paie/payment-jobs/:runId
 */
paiePaiementsRouter.get("/paie/payment-jobs/:runId", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.PAIE), async (req, res) => {
  try {
    const runId = parseInt(req.params.runId);
    if (isNaN(runId)) {
      return res.status(400).json(errorResponse('VALIDATION_ERROR', 'runId invalide'));
    }

    const { getJobsByRunId } = await import("../../services/salary-payment-service");
    const jobs = await getJobsByRunId(runId);

    res.json(successResponse({ jobs }));
  } catch (error) {
    logger.error({ err: error }, 'Erreur lecture payment jobs');
    res.status(500).json(errorResponse('SERVER_ERROR', error instanceof Error ? error.message : 'Erreur serveur'));
  }
});

// GET /api/hr/paie/batches/:id - Détail d'un batch
/**
 * GET /api/hr/paie/batches/:id
 */
paiePaiementsRouter.get("/paie/batches/:id", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.VIEW, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const batch = await hrStorage.getPaymentBatchById(req.params.id);
        if (!batch) return res.status(404).json({ error: "Batch introuvable" });
        res.json(batch);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération batch");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PATCH /api/hr/paie/batches/:id/status - Changer statut d'un batch
/**
 * PATCH /api/hr/paie/batches/:id/status
 */
paiePaiementsRouter.patch("/paie/batches/:id/status", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.PAIE), async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const user = (req as any).user;
        const { statut, referenceExterne, notes } = req.body;

        if (!statut) return res.status(400).json({ error: "Le statut est requis" });

        const updateData: any = { statut };
        if (statut === 'SENT_TO_BANK') {
            updateData.sentAt = new Date();
            updateData.sentBy = user.id;
        } else if (statut === 'CONFIRMED') {
            updateData.confirmedAt = new Date();
            updateData.confirmedBy = user.id;
        }
        if (referenceExterne !== undefined) updateData.referenceExterne = referenceExterne;
        if (notes !== undefined) updateData.notes = notes;

        const [updated] = await db.update(payrollPaymentBatches)
            .set(updateData)
            .where(eq(payrollPaymentBatches.id, req.params.id))
            .returning();

        if (!updated) return res.status(404).json({ error: "Batch introuvable" });

        // If confirmed, mark all pending items as PAID
        if (statut === 'CONFIRMED') {
            await db.update(payrollBatchItems)
                .set({ statut: 'PAID', paidAt: new Date() })
                .where(and(
                    eq(payrollBatchItems.batchId, req.params.id),
                    eq(payrollBatchItems.statut, 'PENDING')
                ));
        }

        res.json(updated);
    } catch (error) {
        logger.error({ err: error }, "Erreur changement statut batch");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PATCH /api/hr/paie/batches/:batchId/items/:itemId - Marquer un item paid/failed
/**
 * PATCH /api/hr/paie/batches/:batchId/items/:itemId
 */
paiePaiementsRouter.patch("/paie/batches/:batchId/items/:itemId", getAuthUser, attachAbility, requireAbility(Actions.EDIT, Subjects.PAIE), async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const { statut, failureReason } = req.body;

        const updateData: any = { statut };
        if (statut === 'PAID') updateData.paidAt = new Date();
        if (failureReason) updateData.failureReason = failureReason;

        const [updated] = await db.update(payrollBatchItems)
            .set(updateData)
            .where(eq(payrollBatchItems.id, req.params.itemId))
            .returning();

        if (!updated) return res.status(404).json({ error: "Item introuvable" });
        res.json(updated);
    } catch (error) {
        logger.error({ err: error }, "Erreur mise à jour item batch");
        res.status(500).json({ error: "Erreur serveur" });
    }
});
