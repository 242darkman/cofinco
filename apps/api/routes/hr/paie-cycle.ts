/**
 * Routes RH — Cycle de paie : génération, validation, planification et relance des runs.
 *
 * Monté sous /api/hr par le routeur d'index (hr.ts).
 * Endpoints :
 *   POST   /api/hr/paie/generate
 *   PATCH  /api/hr/paie/validate
 *   POST   /api/hr/paie/schedule
 *   POST   /api/hr/paie/rerun
 */
import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { bulletinsPaie, employes, BulletinStatus, generatePayrollSchema, payrollRuns, PayrollRunStatus } from "@shared/schema";
import { eq, and, count } from "drizzle-orm";
import { getAuthUser } from "../../middleware";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { hrService } from "../../services/hr-service";
import { postRunEngagement, postRunPayment, reverseRunGL, postAdvancePaymentGL } from "../../services/hr-accounting-service";
import { generatePayrollRun } from "../../services/payroll-engine";
import { users } from "@shared/schema";
import { normalizePhone } from "@shared/utils/phone";
import { broadcastHrUpdate, successResponse, errorResponse, generatePdfsAndSendEmails } from "./shared";

export const paieCycleRouter = Router();

// POST /api/hr/paie/generate - Générer un run de paie pour un mois
/**
 * POST /api/hr/paie/generate
 */
paieCycleRouter.post("/paie/generate", getAuthUser, attachAbility, requireAbility(Actions.GENERATE, Subjects.PAIE), async (req, res) => {
    try {
        const { mois } = req.body;
        const userId = req.user?.id;
        const agenceId = req.user?.agenceId;

        const validation = generatePayrollSchema.safeParse({ mois });
        if (!validation.success) {
          return res.status(400).json(errorResponse('VALIDATION_ERROR', 'Format de mois invalide (YYYY-MM attendu)'));
        }

        const result = await generatePayrollRun(mois, userId!, agenceId || undefined);

        await hrService.logAction(
          'payroll_run',
          String(result.run.id),
          'generated',
          {
            userId: req.user?.id,
            userName: req.user?.nom,
            userRole: req.user?.role,
            agenceId: req.user?.agenceId ?? undefined,
          },
          null,
          { generated: result.generated, skipped: result.skipped, issues: result.issues, runId: result.run.id, version: result.run.version },
          undefined,
          'info'
        );

        broadcastHrUpdate(
          {
            entity: 'payroll_run',
            action: 'generated',
            id: String(result.run.id),
            agenceId: agenceId ?? undefined,
            extra: { month: mois, count: result.generated, skipped: result.skipped, version: result.run.version },
          },
          req.user ? { id: req.user.id, name: req.user.nom || '' } : undefined
        );

        res.status(201).json(successResponse({
          message: `${result.generated} fiches de paie générées (${result.skipped} ignorées, ${result.issues} alertes)`,
          run: result.run,
          generated: result.generated,
          skipped: result.skipped,
          issues: result.issues,
          bulletins: result.bulletins,
        }));
    } catch (error) {
        logger.error({ err: error }, 'Erreur génération paie');
        res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
    }
});

// PATCH /api/hr/paie/validate - Valider un run de paie (DRAFT → VALIDATED + GL engagement)
/**
 * PATCH /api/hr/paie/validate
 */
paieCycleRouter.patch("/paie/validate", getAuthUser, attachAbility, requireAbility(Actions.APPROVE, Subjects.PAIE), async (req, res) => {
  try {
    const { runId } = req.body;

    if (!runId) {
      return res.status(400).json(errorResponse('VALIDATION_ERROR', 'runId requis'));
    }

    const userId = req.user?.id || "system";

    // Get the run
    const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId));
    if (!run) {
      return res.status(404).json(errorResponse('NOT_FOUND', 'Run non trouvé'));
    }
    if (run.status !== PayrollRunStatus.DRAFT) {
      return res.status(400).json(errorResponse('INVALID_STATUS', `Le run est en statut ${run.status}, seul DRAFT peut être validé`));
    }

    // Resolve agenceId: run > user > first available
    const agenceId = run.agenceId || req.user?.agenceId;

    // Update run status
    await db.update(payrollRuns).set({
      status: PayrollRunStatus.VALIDATED,
      validatedBy: userId,
      validatedAt: new Date(),
    }).where(eq(payrollRuns.id, runId));

    // Update all bulletins to VALIDATED
    const updated = await db
      .update(bulletinsPaie)
      .set({ statut: BulletinStatus.VALIDATED })
      .where(
        and(
          eq(bulletinsPaie.payrollRunId, runId),
          eq(bulletinsPaie.statut, BulletinStatus.DRAFT),
          eq(bulletinsPaie.cancelled, false)
        )
      )
      .returning();

    // Post ventilated GL entries
    let glResult = null;
    if (agenceId) {
      const freshRun = (await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId)))[0];
      glResult = await postRunEngagement(freshRun, agenceId, userId);
      if (glResult.errors.length > 0) {
        logger.warn({ runId, errors: glResult.errors }, 'GL engagement posted with warnings');
      }
    }

    await hrService.logAction(
      'payroll_run',
      String(runId),
      'validated',
      {
        userId: req.user?.id,
        userName: req.user?.nom,
        userRole: req.user?.role,
        agenceId: req.user?.agenceId ?? undefined,
      },
      { statut: PayrollRunStatus.DRAFT },
      { statut: PayrollRunStatus.VALIDATED, bulletinsValidated: updated.length }
    );

    broadcastHrUpdate(
      {
        entity: 'payroll_run',
        action: 'validated',
        id: String(runId),
        extra: { count: updated.length },
      },
      req.user ? { id: req.user.id, name: req.user.nom || '' } : undefined
    );

    // Générer les PDFs et envoyer par email (fire-and-forget, non-bloquant)
    if (updated.length > 0) {
      generatePdfsAndSendEmails(runId, updated, agenceId || undefined).catch(err => {
        logger.warn({ err, runId }, 'Erreur génération PDF / envoi email bulletins');
      });
    }

    res.json(successResponse({
      validated: updated.length,
      bulletins: updated,
      glErrors: glResult?.errors || [],
    }));
  } catch (error) {
    logger.error({ err: error }, 'Erreur validation paie');
    res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
  }
});

// POST /api/hr/paie/schedule - Programmer un paiement batch pour une date future
/**
 * POST /api/hr/paie/schedule
 */
paieCycleRouter.post("/paie/schedule", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.PAIE), async (req, res) => {
  try {
    const { runId, scheduledAt } = req.body;

    if (!runId || !scheduledAt) {
      return res.status(400).json(errorResponse('VALIDATION_ERROR', 'runId et scheduledAt requis'));
    }

    const scheduledDate = new Date(scheduledAt);
    if (scheduledDate <= new Date()) {
      return res.status(400).json(errorResponse('VALIDATION_ERROR', 'La date programmée doit être dans le futur'));
    }

    const userId = req.user?.id || "system";

    const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId));
    if (!run) {
      return res.status(404).json(errorResponse('NOT_FOUND', 'Run non trouvé'));
    }
    if (run.status !== PayrollRunStatus.VALIDATED) {
      return res.status(400).json(errorResponse('INVALID_STATUS', `Le run est en statut ${run.status}, seul VALIDATED peut être programmé`));
    }

    const agenceId = run.agenceId || req.user?.agenceId;

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

    const { createPaymentJobs } = await import("../services/salary-payment-service");

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
      executionMode: "SCHEDULED",
      scheduledAt: scheduledDate,
      agenceId: agenceId || undefined,
      userId,
    });

    await hrService.logAction(
      'payroll_run', String(runId), 'scheduled',
      { userId: req.user?.id, userName: req.user?.nom, userRole: req.user?.role },
      { statut: PayrollRunStatus.VALIDATED },
      { scheduledAt: scheduledDate, totalJobs: jobsResult.total },
      undefined, 'warning'
    );

    res.json(successResponse({
      scheduled: jobsResult.total,
      scheduledAt: scheduledDate,
    }));
  } catch (error) {
    logger.error({ err: error }, 'Erreur programmation paie');
    res.status(500).json(errorResponse('SERVER_ERROR', error instanceof Error ? error.message : 'Erreur serveur'));
  }
});

// POST /api/hr/paie/rerun - Re-run: contrepasser + recalculer
/**
 * POST /api/hr/paie/rerun
 */
paieCycleRouter.post("/paie/rerun", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.PAIE), async (req: Request, res: Response) => {
  try {
    const { runId, reason } = req.body;
    const userId = req.user?.id!;
    const agenceId = req.user?.agenceId;

    if (!runId || !reason) {
      return res.status(400).json(errorResponse('VALIDATION_ERROR', 'runId et reason requis'));
    }

    const [oldRun] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId));
    if (!oldRun) {
      return res.status(404).json(errorResponse('NOT_FOUND', 'Run non trouvé'));
    }

    if (oldRun.status === PayrollRunStatus.CLOSED) {
      return res.status(400).json(errorResponse('INVALID_STATUS', 'Impossible de re-run un run clôturé'));
    }

    // 1. Reverse GL entries if the run was validated or paid
    if (agenceId && (oldRun.status === PayrollRunStatus.VALIDATED || oldRun.status === PayrollRunStatus.PAID)) {
      await reverseRunGL(oldRun, reason, agenceId, userId);
    }

    // 2. Cancel old run and its bulletins
    await db.update(payrollRuns).set({
      status: PayrollRunStatus.CANCELLED,
      cancelledAt: new Date(),
      cancelledReason: reason,
    }).where(eq(payrollRuns.id, runId));

    await db.update(bulletinsPaie).set({
      cancelled: true,
      cancelledAt: new Date(),
      cancelledReason: `Re-run: ${reason}`,
    }).where(eq(bulletinsPaie.payrollRunId, runId));

    // 3. Generate new run
    const newResult = await generatePayrollRun(oldRun.period, userId, agenceId || undefined);

    await hrService.logAction(
      'payroll_run',
      String(runId),
      'rerun',
      {
        userId: req.user?.id,
        userName: req.user?.nom,
        userRole: req.user?.role,
        agenceId: req.user?.agenceId ?? undefined,
      },
      { oldRunId: runId, oldVersion: oldRun.version, status: oldRun.status },
      { newRunId: newResult.run.id, newVersion: newResult.run.version, reason },
      reason,
      'critical'
    );

    res.json(successResponse({
      message: `Re-run effectué. Ancien run #${runId} annulé, nouveau run #${newResult.run.id} v${newResult.run.version} créé.`,
      oldRunId: runId,
      newRun: newResult.run,
      generated: newResult.generated,
      skipped: newResult.skipped,
      issues: newResult.issues,
    }));
  } catch (error) {
    logger.error({ err: error }, 'Erreur re-run paie');
    res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
  }
});
