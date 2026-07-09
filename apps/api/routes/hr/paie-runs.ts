/**
 * Routes RH — Consultation des runs de paie, bulletins individuels et configuration de la paie.
 *
 * Monté sous /api/hr par le routeur d'index (hr.ts).
 * Endpoints :
 *   GET    /api/hr/paie/config
 *   PUT    /api/hr/paie/config
 *   GET    /api/hr/paie/runs
 *   GET    /api/hr/paie/runs/:id
 *   GET    /api/hr/paie/my
 *   GET    /api/hr/paie/runs/:runId/transfer-preview
 *   POST   /api/hr/paie/runs/:runId/generate-transfer
 *   GET    /api/hr/paie/runs/:runId/transfer-files
 *   POST   /api/hr/paie/runs/:runId/generate-transfer-xlsx
 *   POST   /api/hr/paie/runs/:runId/create-batches
 *   GET    /api/hr/paie/runs/:runId/batches
 */
import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { bulletinsPaie, payrollConfig, BulletinStatus, updatePayrollConfigSchema, payrollRuns, payrollRunIssues } from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { getAuthUser } from "../../middleware";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { storage } from "../../storage";
import { getTransferPreview, generateTransferFile, generateTransferXlsx, createPaymentBatches } from "../../services/payroll-transfer-service";
import * as hrStorage from "../../storage/hr";
import { logger, broadcastHrUpdate, successResponse, errorResponse } from "./shared";

export const paieRunsRouter = Router();

// GET /api/hr/paie/config - Configuration de la paie (supports ?agenceId=X for multi-agency)
/**
 * GET /api/hr/paie/config
 */
paieRunsRouter.get("/paie/config", getAuthUser, attachAbility, async (req, res) => {
  try {
    const agenceId = (req.query.agenceId as string) || req.user?.agenceId;
    // Try agency-specific config first, then global
    let config = null;
    if (agenceId) {
      const [agencyConfig] = await db.select().from(payrollConfig)
        .where(and(eq(payrollConfig.agenceId, agenceId), eq(payrollConfig.isActive, true)))
        .orderBy(desc(payrollConfig.effectiveFrom)).limit(1);
      config = agencyConfig || null;
    }
    if (!config) {
      const [globalConfig] = await db.select().from(payrollConfig)
        .where(and(sql`${payrollConfig.agenceId} IS NULL`, eq(payrollConfig.isActive, true)))
        .orderBy(desc(payrollConfig.effectiveFrom)).limit(1);
      config = globalConfig || null;
    }

    if (!config) {
      return res.status(404).json(errorResponse('NOT_FOUND', 'Configuration paie non trouvée'));
    }

    res.json(successResponse(config));
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération config paie');
    res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
  }
});

// PUT /api/hr/paie/config - Créer ou mettre à jour la configuration paie
/**
 * PUT /api/hr/paie/config
 */
paieRunsRouter.put("/paie/config", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
  try {
    const user = req.user!;
    const agenceId = req.body.agenceId || user.agenceId || null;

    const parsed = updatePayrollConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(errorResponse('VALIDATION_ERROR', 'Données invalides', parsed.error.flatten()));
    }

    const data = parsed.data;

    // Validate IPR brackets if provided: must be sorted, no gaps, last bracket max = null
    if (data.iprBrackets && data.iprBrackets.length > 0) {
      const sorted = [...data.iprBrackets].sort((a, b) => a.min - b.min);
      for (let i = 0; i < sorted.length; i++) {
        if (i < sorted.length - 1 && sorted[i].max === null) {
          return res.status(400).json(errorResponse('VALIDATION_ERROR', 'Seule la dernière tranche peut avoir un maximum nul'));
        }
        if (i === sorted.length - 1 && sorted[i].max !== null) {
          return res.status(400).json(errorResponse('VALIDATION_ERROR', 'La dernière tranche doit avoir un maximum nul (illimité)'));
        }
        if (i > 0 && sorted[i].min !== (sorted[i - 1].max! + 1)) {
          return res.status(400).json(errorResponse('VALIDATION_ERROR', `Trou dans le barème entre ${sorted[i - 1].max} et ${sorted[i].min}`));
        }
      }
    }

    // Check for existing active config for this scope
    const existingConditions = agenceId
      ? and(eq(payrollConfig.agenceId, agenceId), eq(payrollConfig.isActive, true))
      : and(sql`${payrollConfig.agenceId} IS NULL`, eq(payrollConfig.isActive, true));

    const [existing] = await db
      .select()
      .from(payrollConfig)
      .where(existingConditions)
      .orderBy(desc(payrollConfig.effectiveFrom))
      .limit(1);

    let result;
    if (existing) {
      // Update existing config
      [result] = await db
        .update(payrollConfig)
        .set({
          ...(data.cnssEmployeeRate !== undefined && { cnssEmployeeRate: data.cnssEmployeeRate.toFixed(4) }),
          ...(data.cnssEmployerRate !== undefined && { cnssEmployerRate: data.cnssEmployerRate.toFixed(4) }),
          ...(data.iprBrackets !== undefined && { iprBrackets: data.iprBrackets }),
          ...(data.transportAllowance !== undefined && { transportAllowance: data.transportAllowance }),
          ...(data.housingAllowance !== undefined && { housingAllowance: data.housingAllowance }),
          ...(data.overtimeRate !== undefined && { overtimeRate: data.overtimeRate.toFixed(2) }),
          ...(data.nightShiftRate !== undefined && { nightShiftRate: data.nightShiftRate.toFixed(2) }),
          ...(data.holidayRate !== undefined && { holidayRate: data.holidayRate.toFixed(2) }),
          ...(data.lateGraceMinutes !== undefined && { lateGraceMinutes: data.lateGraceMinutes }),
          ...(data.allowOvertime !== undefined && { allowOvertime: data.allowOvertime }),
          ...(data.defaultHeureDebut !== undefined && { defaultHeureDebut: data.defaultHeureDebut }),
          ...(data.defaultHeureFin !== undefined && { defaultHeureFin: data.defaultHeureFin }),
          ...(data.defaultPauseMinutes !== undefined && { defaultPauseMinutes: data.defaultPauseMinutes }),
          ...(data.mmSalaryFeeOption !== undefined && { mmSalaryFeeOption: data.mmSalaryFeeOption }),
          updatedAt: new Date(),
        })
        .where(eq(payrollConfig.id, existing.id))
        .returning();
    } else {
      // Create new config
      [result] = await db
        .insert(payrollConfig)
        .values({
          agenceId,
          cnssEmployeeRate: (data.cnssEmployeeRate ?? 0.05).toFixed(4),
          cnssEmployerRate: (data.cnssEmployerRate ?? 0.09).toFixed(4),
          iprBrackets: data.iprBrackets ?? [
            { min: 0, max: 524000, rate: 0 },
            { min: 524001, max: 1428000, rate: 0.15 },
            { min: 1428001, max: 2700000, rate: 0.30 },
            { min: 2700001, max: null, rate: 0.40 },
          ],
          transportAllowance: data.transportAllowance ?? 50000,
          housingAllowance: data.housingAllowance ?? 0,
          overtimeRate: (data.overtimeRate ?? 1.5).toFixed(2),
          nightShiftRate: (data.nightShiftRate ?? 1.25).toFixed(2),
          holidayRate: (data.holidayRate ?? 2.0).toFixed(2),
          lateGraceMinutes: data.lateGraceMinutes ?? 5,
          allowOvertime: data.allowOvertime ?? true,
          defaultHeureDebut: data.defaultHeureDebut ?? "08:00",
          defaultHeureFin: data.defaultHeureFin ?? "17:00",
          defaultPauseMinutes: data.defaultPauseMinutes ?? 60,
          mmSalaryFeeOption: data.mmSalaryFeeOption ?? "COMPANY_ABSORBS",
          createdBy: user.id,
        })
        .returning();
    }

    // Log config change to history
    await hrStorage.logPayrollConfigChange({
      payrollConfigId: result.id,
      agenceId: agenceId || null,
      changedBy: user.id,
      changeType: existing ? 'UPDATED' : 'CREATED',
      oldValues: existing || null,
      newValues: result,
    });

    // Broadcast update
    broadcastHrUpdate({ entity: 'paie', action: existing ? 'updated' : 'created', id: result.id });

    res.json(successResponse(result));
  } catch (error) {
    logger.error({ err: error }, 'Erreur mise à jour config paie');
    res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
  }
});

// GET /api/hr/paie/runs - Lister les runs de paie
/**
 * GET /api/hr/paie/runs
 */
paieRunsRouter.get("/paie/runs", getAuthUser, attachAbility, async (req: Request, res: Response) => {
  try {
    const agenceId = req.user?.agenceId;
    const { period } = req.query;

    let conditions = agenceId
      ? eq(payrollRuns.agenceId, agenceId)
      : sql`1=1`;

    if (period && typeof period === 'string') {
      conditions = and(conditions, eq(payrollRuns.period, period))!;
    }

    const runs = await db
      .select()
      .from(payrollRuns)
      .where(conditions)
      .orderBy(desc(payrollRuns.createdAt));

    res.json(successResponse(runs));
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération runs paie');
    res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
  }
});

// GET /api/hr/paie/runs/:id - Détail d'un run avec bulletins
/**
 * GET /api/hr/paie/runs/:id
 */
paieRunsRouter.get("/paie/runs/:id", getAuthUser, attachAbility, async (req: Request, res: Response) => {
  try {
    const runId = parseInt(req.params.id);
    const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId));
    if (!run) {
      return res.status(404).json(errorResponse('NOT_FOUND', 'Run non trouvé'));
    }

    const bulletins = await db
      .select()
      .from(bulletinsPaie)
      .where(eq(bulletinsPaie.payrollRunId, runId));

    const issues = await db
      .select()
      .from(payrollRunIssues)
      .where(eq(payrollRunIssues.payrollRunId, runId));

    res.json(successResponse({ run, bulletins, issues }));
  } catch (error) {
    logger.error({ err: error }, 'Erreur détail run paie');
    res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
  }
});

// GET /api/hr/paie/my - Mes fiches de paie
/**
 * GET /api/hr/paie/my
 */
paieRunsRouter.get("/paie/my", getAuthUser, attachAbility, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: "Non authentifié" });

        // Résoudre l'employeId à partir du userId
        const employe = await storage.getEmployeByUserId(userId);
        if (!employe) {
            logger.warn({ userId, userName: req.user?.nom }, 'Mes bulletins: aucun profil employé trouvé pour cet utilisateur');
            return res.status(404).json({ error: "Profil employé non trouvé" });
        }

        logger.info({
            userId,
            employeId: employe.id,
            employeStatut: employe.statut,
            employeAgenceId: employe.agenceId,
        }, 'Mes bulletins: recherche des bulletins');

        const allBulletins = await storage.getBulletins(employe.id);
        // N'afficher que les bulletins validés ou payés (pas les brouillons)
        const bulletins = allBulletins.filter(
            (b: any) => b.statut !== BulletinStatus.DRAFT
        );

        logger.info({
            userId,
            employeId: employe.id,
            bulletinsCount: bulletins.length,
            totalCount: allBulletins.length,
        }, `Mes bulletins: ${bulletins.length} visible(s) sur ${allBulletins.length}`);

        res.json(bulletins);
    } catch (error) {
        logger.error({ err: error }, 'Erreur récupération mes bulletins');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// =============================================================================
// PAYROLL TRANSFER FILES
// =============================================================================

// GET /api/hr/paie/runs/:runId/transfer-preview
/**
 * GET /api/hr/paie/runs/:runId/transfer-preview
 */
paieRunsRouter.get("/paie/runs/:runId/transfer-preview", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const preview = await getTransferPreview(parseInt(req.params.runId));
        res.json(preview);
    } catch (error) {
        logger.error({ err: error }, "Erreur aperçu virement");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/paie/runs/:runId/generate-transfer
/**
 * POST /api/hr/paie/runs/:runId/generate-transfer
 */
paieRunsRouter.post("/paie/runs/:runId/generate-transfer", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.PAIE), async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const user = (req as any).user;
        const result = await generateTransferFile(parseInt(req.params.runId), user.id);
        res.json(result);
    } catch (error: any) {
        logger.error({ err: error }, "Erreur génération fichier virement");
        res.status(400).json({ error: error.message || "Erreur lors de la génération" });
    }
});

// GET /api/hr/paie/runs/:runId/transfer-files
/**
 * GET /api/hr/paie/runs/:runId/transfer-files
 */
paieRunsRouter.get("/paie/runs/:runId/transfer-files", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.VIEW, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const files = await hrStorage.getTransferFiles(parseInt(req.params.runId));
        res.json(files);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération fichiers virement");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// =============================================================================
// PAYMENT BATCHES
// =============================================================================

// POST /api/hr/paie/runs/:runId/generate-transfer-xlsx - Générer XLSX
/**
 * POST /api/hr/paie/runs/:runId/generate-transfer-xlsx
 */
paieRunsRouter.post("/paie/runs/:runId/generate-transfer-xlsx", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.PAIE), async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const user = (req as any).user;
        const result = await generateTransferXlsx(parseInt(req.params.runId), user.id);

        // Send XLSX as downloadable file
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="virement_${req.params.runId}.xlsx"`);
        res.send(result.xlsxBuffer);
    } catch (error: any) {
        logger.error({ err: error }, "Erreur génération fichier virement XLSX");
        res.status(400).json({ error: error.message || "Erreur lors de la génération" });
    }
});

// POST /api/hr/paie/runs/:runId/create-batches - Créer batches (1 par banque)
/**
 * POST /api/hr/paie/runs/:runId/create-batches
 */
paieRunsRouter.post("/paie/runs/:runId/create-batches", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.PAIE), async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const user = (req as any).user;
        const transferFileId = req.body.transferFileId || null;
        const result = await createPaymentBatches(parseInt(req.params.runId), transferFileId, user.id);
        res.status(201).json(result);
    } catch (error: any) {
        logger.error({ err: error }, "Erreur création batches de paiement");
        res.status(400).json({ error: error.message || "Erreur serveur" });
    }
});

// GET /api/hr/paie/runs/:runId/batches - Liste batches d'un run
/**
 * GET /api/hr/paie/runs/:runId/batches
 */
paieRunsRouter.get("/paie/runs/:runId/batches", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.VIEW, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const batches = await hrStorage.getPaymentBatches(parseInt(req.params.runId));
        res.json(batches);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération batches");
        res.status(500).json({ error: "Erreur serveur" });
    }
});
