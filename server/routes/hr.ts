import { Router, type Request, type Response } from "express";
import { createLogger } from "../lib/logger";
import { db } from "../db";

const logger = createLogger('Routes:HR');
import {
  demandesConges,
  formations,
  formationParticipants,
  sanctions,
  candidatures,
  bulletinsPaie,
  horairesTravail,
  presences,
  employes,
  leaveBalances,
  payrollConfig,
  hrAuditLog,
  LeaveStatus,
  BulletinStatus,
  createLeaveRequestSchema,
  generatePayrollSchema,
  avancesSalaire,
  insertAvanceSalaireSchema,
  StatutAvance,
  employeeDocuments,
  insertEmployeeDocumentSchema,
  TypeDocument,
  StatutDocument,
  formationCertificates,
  updatePayrollConfigSchema,
  shiftTemplates,
  salaryRateHistory,
  sanctionEscalationRules,
  hiringApprovalConfig,
  hiringApprovals,
  departments,
  jobPositions,
  avantages,
  avantagesEmployes,
  agentObjectifs,
  payslipLines,
  payrollRuns,
  PayrollRunStatus,
  payrollRunIssues,
  conventionsCollectives,
  qualificationCoefficients,
  evaluationTemplates,
  evaluationCriteria,
  evaluationCampaigns,
  evaluations,
  evaluationResponses,
  hrAlertConfig,
  hrAlerts,
  payrollTransferFiles,
  hrDocumentRequests,
  insertHrDocumentRequestSchema,
  HrDocumentRequestStatus,
  jobOffers,
  JobOfferStatus,
  payrollPaymentBatches,
  payrollBatchItems,
  bankReconciliationSessions,
  bankReconciliationLines,
  salaryPaymentJobs,
} from "@shared/schema";
import { agentsTerrain, agentPlannings } from "@shared/schema";
import { systemSettings } from "@shared/schema/settings";
import { agences } from "@shared/schema/agences";
import { normalizeRole } from "@shared/types/roles";
import { StatutCandidature, StatutConge, StatutUser, StatutVisiteTerrain, StatutArchive } from "@shared/enum/status-constants";
import { eq, desc, and, gte, lte, sql, count, isNull } from "drizzle-orm";
import { getAuthUser } from "server/middleware";
import { attachAbility, requireAbility } from "../authorization";
import { Actions, Subjects } from "@shared/ability";
import { storage } from "server/storage";
import { hrService } from "../services/hr-service";
import { hiringApprovalService } from "../services/hiring-approval-service";
import { sanctionEscalationService } from "../services/sanction-escalation-service";
import { onboardingService } from "../services/onboarding-service";
import { postRunEngagement, postRunPayment, reverseRunGL, postAdvancePaymentGL } from "../services/hr-accounting-service";
import { generatePayrollRun } from "../services/payroll-engine";
import { generatePayslipPdf, type PayslipPdfData } from "../services/payslip-pdf-service";
import { users } from "@shared/schema";
import { getWsInstance } from "../ws-server";
import { z } from "zod";
import { dispatchDomainEvent } from "../services/notifications/domain-events/event-registry";
import { currencySymbol } from "@shared/config/currency";
import { enqueueNotification } from "../services/notifications/notification-service";
import multer from "multer";
import { importEmployees, parseCsv } from "../services/hr-import-service";
import { StorageService } from "../services/storage-service";
import { generateCampaignEvaluations, computeEvaluationScore, finalizeEvaluation } from "../services/evaluation-service";
import { getTransferPreview, generateTransferFile, generateTransferXlsx, createPaymentBatches } from "../services/payroll-transfer-service";
import * as hrStorage from "../storage/hr";
import { scoreCandidature, scoreAllCandidatures } from "../services/candidature-scoring-service";

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Seuls les fichiers CSV sont acceptés"));
    }
  },
});

const docUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Type de fichier non supporté (PDF, JPG, PNG, DOC acceptés)"));
    }
  },
});

const bankStatementUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv") || file.originalname.endsWith(".txt")) {
      cb(null, true);
    } else {
      cb(new Error("Seuls les fichiers CSV/TXT sont acceptés"));
    }
  },
});

export const hrRouter = Router();

// ============================================
// HELPER: Standardized HR WebSocket broadcast
// ============================================
interface HrEventPayload {
  entity: 'employe' | 'conge' | 'presence' | 'paie' | 'bulletin' | 'formation' | 'sanction' | 'avantage' | 'candidature' | 'organigramme' | 'payroll_run';
  action: 'created' | 'updated' | 'approved' | 'rejected' | 'paid' | 'deleted' | 'assigned' | 'generated' | 'validated';
  id: string | number;
  agenceId?: string;
  employeId?: string;
  extra?: Record<string, any>;
}

function broadcastHrUpdate(payload: HrEventPayload, actor?: { id: string; name: string }) {
  const wsInstance = getWsInstance();
  if (!wsInstance) return;

  const fullPayload = {
    ...payload,
    timestamp: new Date().toISOString(),
    actor,
  };

  wsInstance.broadcast({ type: 'HR_UPDATE', payload: fullPayload });
}

// Simplified broadcast without actor (backward compatibility)
function broadcastHrEvent(payload: Partial<HrEventPayload>) {
  const wsInstance = getWsInstance();
  if (!wsInstance) return;

  wsInstance.broadcast({
    type: 'HR_UPDATE',
    payload: {
      ...payload,
      timestamp: new Date().toISOString(),
    },
  });
}

// ============================================
// HELPER: API Response format
// ============================================
function successResponse<T>(data: T, meta?: any) {
  return { success: true, data, ...(meta && { meta }) };
}

function errorResponse(code: string, message: string, details?: any) {
  return { success: false, code, message, ...(details && { details }) };
}

const normalizeRoleToken = (role?: string | null): string | undefined => {
  if (!role) return undefined;
  const normalized = normalizeRole(role);
  if (normalized) return normalized;
  return role.trim().toLowerCase();
};

const roleIn = (role: string | null | undefined, allowed: string[]): boolean => {
  const roleToken = normalizeRoleToken(role);
  if (!roleToken) return false;
  const allowedTokens = allowed
    .map((value) => normalizeRoleToken(value))
    .filter((value): value is string => !!value);
  return allowedTokens.includes(roleToken);
};

// ============================================
// HELPER: Calculate ancienneté (seniority) from dateEmbauche
// ============================================

function computeAnciennete(dateEmbauche: string | null, refDate?: string): string | null {
  if (!dateEmbauche) return null;
  const start = new Date(dateEmbauche);
  const end = refDate ? new Date(refDate) : new Date();
  if (isNaN(start.getTime())) return null;

  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  if (months < 0) { years--; months += 12; }

  if (years > 0 && months > 0) return `${years} an${years > 1 ? 's' : ''} ${months} mois`;
  if (years > 0) return `${years} an${years > 1 ? 's' : ''}`;
  if (months > 0) return `${months} mois`;
  return 'Moins d\'1 mois';
}

// ============================================
// HELPER: Generate payslip PDFs + send emails after validation
// ============================================

type BulletinRow = typeof bulletinsPaie.$inferSelect;

async function generatePdfsAndSendEmails(
  runId: number | string,
  bulletins: BulletinRow[],
  agenceId?: string
): Promise<void> {
  if (bulletins.length === 0) return;

  // 1. Fetch shared data (company settings, agence)
  const [settings] = await db.select().from(systemSettings);
  const company = settings ? {
    appName: settings.appName,
    adresse: settings.adresse,
    telephone: settings.telephone,
    niu: settings.niu || null,
    rccm: settings.rccm || null,
  } : null;

  // 2. Fetch all employee + user data for this batch
  const employeIds = bulletins.map(b => b.employeId);
  const employeRows = await db
    .select({ employe: employes, user: users })
    .from(employes)
    .innerJoin(users, eq(employes.userId, users.id))
    .where(sql`${employes.id} IN ${employeIds}`);
  type EmpRow = (typeof employeRows)[number];
  const employeMap = new Map<string, EmpRow>(employeRows.map((r: EmpRow) => [r.employe.id, r]));

  // 3. Fetch all payslip lines for all bulletins in one query
  const bulletinIds = bulletins.map(b => b.id);
  const allLines = await db
    .select()
    .from(payslipLines)
    .where(sql`${payslipLines.bulletinId} IN ${bulletinIds}`)
    .orderBy(payslipLines.sortOrder);
  const linesByBulletin = new Map<number, (typeof allLines[number])[]>();
  for (const line of allLines) {
    const arr = linesByBulletin.get(line.bulletinId) || [];
    arr.push(line);
    linesByBulletin.set(line.bulletinId, arr);
  }

  const formatCurrency = (val: string | number) => {
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    return new Intl.NumberFormat('fr-FR').format(num || 0);
  };

  // 4. Process each bulletin: generate PDF → store → enqueue email
  for (const bulletin of bulletins) {
    try {
      const empData = employeMap.get(bulletin.employeId);
      if (!empData?.user?.email) continue;

      const bulletinLines = linesByBulletin.get(bulletin.id) || [];

      // Fetch agence for this employee
      let agenceInfo = null;
      if (empData.employe.agenceId) {
        const [ag] = await db.select().from(agences).where(eq(agences.id, empData.employe.agenceId));
        agenceInfo = ag ? { nom: ag.nom, adresse: ag.adresse, telephone: ag.telephone } : null;
      }

      // Fetch job title
      let jobTitle = null;
      if (empData.employe.jobPositionId) {
        const [jp] = await db.select().from(jobPositions).where(eq(jobPositions.id, empData.employe.jobPositionId));
        jobTitle = jp?.name || null;
      }

      // Fetch leave balance
      let leaves = null;
      const year = parseInt(bulletin.mois.split('-')[0]);
      const [lb] = await db.select().from(leaveBalances).where(
        and(eq(leaveBalances.employeId, empData.employe.id), eq(leaveBalances.year, year))
      );
      if (lb) {
        leaves = { acquired: lb.acquired || 0, used: lb.used || 0, balance: (lb.acquired || 0) - (lb.used || 0) };
      }

      // Convention collective (via categorie + coefficient)
      let ccLabel: string | null = null;
      if (empData.employe.categorie && empData.employe.coefficient) {
        const [qc] = await db.select().from(qualificationCoefficients)
          .where(and(
            eq(qualificationCoefficients.categorie, empData.employe.categorie),
            eq(qualificationCoefficients.coefficient, empData.employe.coefficient)
          ))
          .limit(1);
        if (qc?.conventionCollectiveId) {
          const [cc] = await db.select().from(conventionsCollectives)
            .where(eq(conventionsCollectives.id, qc.conventionCollectiveId));
          ccLabel = cc?.libelle || null;
        }
      }

      // Ancienneté
      const anciennete = computeAnciennete(empData.employe.dateEmbauche, bulletin.mois + '-01');

      // Heures travaillées du mois
      let htData = null;
      const [yStr, mStr] = bulletin.mois.split('-');
      const mStart = `${yStr}-${mStr}-01`;
      const lastD = new Date(Number(yStr), Number(mStr), 0).getDate();
      const mEnd = `${yStr}-${mStr}-${String(lastD).padStart(2, '0')}`;
      const pRows = await db.select().from(presences).where(
        and(eq(presences.employeId, empData.employe.id), gte(presences.date, mStart), lte(presences.date, mEnd))
      );
      if (pRows.length > 0) {
        htData = {
          joursTravailles: pRows.filter(p => p.statut === 'PRESENT' || p.statut === 'LATE').length,
          heuresNormales: pRows.reduce((s, p) => s + (p.heuresTravaillees || 0), 0),
          heuresSupplementaires: pRows.reduce((s, p) => s + (p.heuresSupplementaires || 0), 0),
        };
      }

      // Build PDF data
      const pdfData: PayslipPdfData = {
        bulletin: {
          id: bulletin.id,
          mois: bulletin.mois,
          salaireBrut: bulletin.salaireBrut,
          salaireNet: bulletin.salaireNet,
          totalChargesSalariales: bulletin.totalChargesSalariales,
          totalChargesPatronales: bulletin.totalChargesPatronales,
          irpp: bulletin.irpp,
          totalRetenues: bulletin.totalRetenues,
          salaireBaseSnapshot: bulletin.salaireBaseSnapshot,
          version: bulletin.version,
          statut: bulletin.statut || 'VALIDATED',
          datePaiement: bulletin.datePaiement,
          createdAt: bulletin.createdAt?.toISOString() || new Date().toISOString(),
        },
        lines: bulletinLines.map(l => ({
          code: l.code,
          libelle: l.libelle,
          category: l.category,
          base: l.base,
          taux: l.taux,
          montantGain: l.montantGain || 0,
          montantRetenue: l.montantRetenue || 0,
          montantPatronal: l.montantPatronal || 0,
          sortOrder: l.sortOrder,
        })),
        employe: {
          matricule: empData.employe.matricule,
          nom: empData.user.nom || '',
          prenom: empData.user.prenom || null,
          typeContrat: empData.employe.typeContrat,
          dateEmbauche: empData.employe.dateEmbauche,
          dateSortie: empData.employe.dateSortie || null,
          numeroCnss: empData.employe.numeroCnss,
          categorie: empData.employe.categorie || null,
          coefficient: empData.employe.coefficient || null,
          paymentMethod: empData.employe.paymentMethod || 'CASH',
          jobTitle,
          anciennete,
          conventionCollective: ccLabel,
        },
        company,
        agence: agenceInfo,
        leaves,
        heuresTravaillees: htData,
      };

      // Generate PDF
      const pdfBuffer = await generatePayslipPdf(pdfData);

      // Store in MinIO (private bucket)
      const pdfFilename = `bulletin_${empData.employe.matricule || empData.employe.id}_${bulletin.mois}_v${bulletin.version}.pdf`;
      const storageKey = await StorageService.uploadBuffer(
        pdfBuffer, pdfFilename, 'application/pdf', `payslips/${bulletin.mois}`
      );

      // Update bulletin with PDF storage key
      await db.update(bulletinsPaie)
        .set({ pdfUrl: storageKey })
        .where(eq(bulletinsPaie.id, bulletin.id));

      // Enqueue email with PDF attachment reference
      const employeeName = `${empData.user.prenom || ''} ${empData.user.nom || ''}`.trim();
      await enqueueNotification({
        channel: 'EMAIL',
        templateCode: 'BULLETIN_PAIE',
        recipient: empData.user.email,
        payload: {
          employeeName,
          period: bulletin.mois,
          salaireNet: formatCurrency(bulletin.salaireNet),
          _attachments: [{
            storageKey,
            filename: pdfFilename,
            contentType: 'application/pdf',
          }],
        },
        userId: empData.employe.id,
        agenceId: agenceId,
        correlationId: `payslip-${runId}-${bulletin.id}`,
      });

      logger.info({ bulletinId: bulletin.id, email: empData.user.email }, 'Payslip PDF generated and email enqueued');
    } catch (err: any) {
      logger.warn({ err, bulletinId: bulletin.id }, 'Failed to generate/send payslip for employee');
    }
  }
}

/**
 * ========================================
 * ANALYTICS RH
 * ========================================
 */

// GET /api/hr/analytics - Dashboard analytics data
hrRouter.get("/analytics", getAuthUser, async (req, res) => {
    try {
        // 1. Effectifs par département (via jobPositions -> departments)
        const deptStats = await db
            .select({
                departement: departments.name,
                total: count(),
            })
            .from(employes)
            .leftJoin(jobPositions, eq(employes.jobPositionId, jobPositions.id))
            .leftJoin(departments, eq(jobPositions.departmentId, departments.id))
            .where(eq(employes.statut, StatutUser.ACTIVE))
            .groupBy(departments.name);

        // 2. Tendances congés mensuels (6 derniers mois)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const congesTrends = await db
            .select({
                mois: sql<string>`TO_CHAR(${demandesConges.dateDebut}, 'YYYY-MM')`,
                type: demandesConges.type,
                total: count(),
            })
            .from(demandesConges)
            .where(gte(demandesConges.dateDebut, sixMonthsAgo.toISOString().split('T')[0]))
            .groupBy(sql`TO_CHAR(${demandesConges.dateDebut}, 'YYYY-MM')`, demandesConges.type);

        // 3. Masse salariale mensuelle (6 derniers mois)
        const masseSalariale = await db
            .select({
                mois: bulletinsPaie.mois,
                total: sql<string>`COALESCE(SUM(CAST(${bulletinsPaie.salaireNet} AS NUMERIC)), 0)`,
            })
            .from(bulletinsPaie)
            .where(and(
                eq(bulletinsPaie.statut, 'PAID'),
                gte(bulletinsPaie.mois, sixMonthsAgo.toISOString().slice(0, 7))
            ))
            .groupBy(bulletinsPaie.mois);

        // 4. Distribution sanctions par gravité
        const sanctionsDistrib = await db
            .select({
                gravite: sanctions.gravite,
                total: count(),
            })
            .from(sanctions)
            .groupBy(sanctions.gravite);

        // 5. KPI cards
        const [totalEmployes] = await db
            .select({ total: count() })
            .from(employes)
            .where(eq(employes.statut, StatutUser.ACTIVE));

        const [postesOuverts] = await db
            .select({ total: count() })
            .from(candidatures)
            .where(eq(candidatures.statut, StatutCandidature.PENDING));

        // Taux rotation (terminés sur 12 mois / total)
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        const [departures] = await db
            .select({ total: count() })
            .from(employes)
            .where(and(
                eq(employes.statut, StatutUser.INACTIVE),
                gte(employes.updatedAt, oneYearAgo)
            ));

        const totalEmp = totalEmployes?.total || 0;
        const totalDepartures = departures?.total || 0;
        const tauxRotation = totalEmp > 0 ? ((totalDepartures / totalEmp) * 100).toFixed(1) : '0';

        res.json({
            effectifsParDepartement: deptStats.map(d => ({
                departement: d.departement || 'Non assigné',
                total: d.total,
            })),
            congesTendances: congesTrends.map(c => ({
                mois: c.mois,
                type: c.type,
                total: c.total,
            })),
            masseSalariale: masseSalariale.map(m => ({
                mois: m.mois,
                total: parseFloat(m.total),
            })),
            sanctionsDistribution: sanctionsDistrib.map(s => ({
                gravite: s.gravite,
                total: s.total,
            })),
            kpis: {
                totalEmployes: totalEmp,
                tauxRotation: parseFloat(tauxRotation),
                postesOuverts: postesOuverts?.total || 0,
            },
        });
    } catch (error) {
        logger.error({ err: error }, 'Erreur analytics RH');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

/**
 * ========================================
 * DEMANDES DE CONGÉS
 * ========================================
 */

// GET /api/hr/conges - Liste des demandes de congés
hrRouter.get("/conges", getAuthUser, async (req, res) => {
  try {
    const { statut, employeId, dateDebut, dateFin } = req.query;

    let query = db.select().from(demandesConges);

    const conditions = [];
    if (statut) conditions.push(eq(demandesConges.statut, statut as string));
    if (employeId) conditions.push(eq(demandesConges.employeId, employeId as string));

    // RBAC: An employee can only see their own requests unless Admin/RH/Manager/Direction
    // Note: Manager should ideally see only their subordinates, implemented here for simplicity as "all" for Manager role for now, or filtered via frontend + rigorous check later.
    // Ideally: if role === 'manager', fetch subordinates IDs and filter.
    // For now, let's restrict standard 'agent'/'employe'
    const userRole = req.user?.role;
    const restrictedRoles = ['agent', 'employe', 'stagiaire'];

    if (roleIn(userRole, restrictedRoles)) {
        // Résoudre l'employeId à partir du userId
        const employe = await storage.getEmployeByUserId(req.user!.id);
        if (employe) {
            conditions.push(eq(demandesConges.employeId, employe.id));
        } else {
            // Si pas d'employé trouvé, on force une condition impossible pour ne rien retourner
            conditions.push(eq(demandesConges.employeId, '00000000-0000-0000-0000-000000000000'));
        }
    }

    if (dateDebut) conditions.push(gte(demandesConges.dateDebut, dateDebut as string));
    if (dateFin) conditions.push(lte(demandesConges.dateFin, dateFin as string));

    const result = conditions.length > 0
      ? await query.where(and(...conditions)).orderBy(desc(demandesConges.createdAt))
      : await query.orderBy(desc(demandesConges.createdAt));

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération congés');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/conges - Créer une demande de congé
hrRouter.post("/conges", getAuthUser, async (req, res) => {
  try {
    const { employeId, employeNom, type, dateDebut, dateFin, motif } = req.body;

    // Validation basique
    if (!employeId || !type || !dateDebut || !dateFin) {
      return res.status(400).json(errorResponse('VALIDATION_ERROR', 'Champs obligatoires manquants'));
    }

    // Validation: dates
    if (new Date(dateFin) < new Date(dateDebut)) {
      return res.status(400).json(errorResponse(
        'INVALID_DATES',
        'La date de fin doit être postérieure ou égale à la date de début'
      ));
    }

    // Validation: chevauchement et solde
    const validation = await hrService.validateLeaveRequest(employeId, dateDebut, dateFin, type);
    if (!validation.valid) {
      return res.status(400).json(errorResponse(
        validation.code || 'VALIDATION_ERROR',
        validation.error || 'Validation échouée',
        validation.details
      ));
    }

    // Workflow: Direction (PDG/DG) auto-approves
    const userRole = req.user?.role;
    const isDirection = roleIn(userRole, ['direction', 'pdg', 'dg', 'admin']);
    const initialStatus = isDirection ? LeaveStatus.APPROVED : LeaveStatus.PENDING;
    const approuvePar = isDirection ? req.user?.id : null;
    const dateDecision = isDirection ? new Date() : null;

    const [newConge] = await db.insert(demandesConges).values({
      employeId,
      employeNom,
      type,
      dateDebut,
      dateFin,
      motif,
      statut: initialStatus,
      approuvePar: approuvePar,
      dateDecision: dateDecision
    }).returning();

    // Update leave balance (pending days)
    if (initialStatus === LeaveStatus.PENDING) {
      await hrService.onLeaveRequested(employeId, dateDebut, dateFin);
    } else if (initialStatus === LeaveStatus.APPROVED) {
      // Auto-approved: directly update used days
      await hrService.onLeaveApproved(newConge.id);
      // Reconcile: create 'Congé' presence entries
      await hrService.createLeavePresenceEntries(newConge.id);
    }

    // Audit log
    await hrService.logAction(
      'conge',
      newConge.id,
      'created',
      {
        userId: req.user?.id,
        userName: req.user?.nom,
        userRole: req.user?.role,
        agenceId: req.user?.agenceId ?? undefined,
      },
      null,
      newConge
    );

    // Broadcast HR Update
    const daysRequested = hrService.calculateBusinessDays(dateDebut, dateFin);
    broadcastHrUpdate(
      {
        entity: 'conge',
        action: 'created',
        id: newConge.id,
        employeId,
        extra: { daysRequested, status: initialStatus },
      },
      req.user ? { id: req.user.id, name: req.user.nom || '' } : undefined
    );

    // Domain event: leave requested
    dispatchDomainEvent({
      type: "HR_LEAVE_REQUESTED",
      data: {
        congeId: newConge.id,
        employeId,
        employeNom: employeNom || "",
        type,
        dateDebut,
        dateFin,
        daysRequested,
        agenceId: req.user?.agenceId,
      },
      timestamp: new Date(),
    });

    res.status(201).json(successResponse(newConge));
  } catch (error) {
    logger.error({ err: error }, 'Erreur création congé');
    res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
  }
});

// PATCH /api/hr/conges/:id/approve - Approuver une demande
hrRouter.patch("/conges/:id/approve", getAuthUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { commentaire } = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    // RBAC Check
    const allowedRoles = ['ADMIN', 'CHEF_AGENCE', 'SUPERVISEUR'];
    if (!roleIn(userRole, allowedRoles)) {
        return res.status(403).json(errorResponse('FORBIDDEN', 'Non autorisé à approuver'));
    }

    // Get current state for audit
    const [currentConge] = await db.select().from(demandesConges).where(eq(demandesConges.id, parseInt(id)));
    if (!currentConge) {
      return res.status(404).json(errorResponse('NOT_FOUND', 'Demande non trouvée'));
    }

    // Check if already processed
    if (currentConge.statut !== LeaveStatus.PENDING) {
      return res.status(400).json(errorResponse(
        'INVALID_STATUS',
        `Cette demande a déjà été ${currentConge.statut === LeaveStatus.APPROVED ? 'approuvée' : 'traitée'}`
      ));
    }

    // Manager hierarchy check (if manager role)
    if (roleIn(userRole, ['manager'])) {
      const managerEmploye = await storage.getEmployeByUserId(userId!);
      if (managerEmploye) {
        const [targetEmploye] = await db.select().from(employes).where(eq(employes.id, currentConge.employeId));
        if (targetEmploye && targetEmploye.managerId !== managerEmploye.id) {
          // Not a direct report - check if admin override
          if (!roleIn(userRole, ['admin', 'rh', 'direction'])) {
            return res.status(403).json(errorResponse('FORBIDDEN', 'Vous ne pouvez approuver que les demandes de vos subordonnés directs'));
          }
        }
      }
    }

    const [updated] = await db.update(demandesConges)
      .set({
        statut: LeaveStatus.APPROVED,
        approuvePar: userId,
        dateDecision: new Date(),
        commentaire: commentaire || null,
        updatedAt: new Date(),
      })
      .where(eq(demandesConges.id, parseInt(id)))
      .returning();

    // Update leave balance
    await hrService.onLeaveApproved(updated.id);
    // Reconcile: create 'Congé' presence entries
    await hrService.createLeavePresenceEntries(updated.id);

    // Audit log
    await hrService.logAction(
      'conge',
      updated.id,
      'approved',
      {
        userId: req.user?.id,
        userName: req.user?.nom,
        userRole: req.user?.role,
        agenceId: req.user?.agenceId ?? undefined,
      },
      { statut: currentConge.statut },
      { statut: updated.statut, approuvePar: userId, commentaire },
      commentaire
    );

    // Broadcast HR Update
    broadcastHrUpdate(
      {
        entity: 'conge',
        action: 'approved',
        id: updated.id,
        employeId: updated.employeId,
        extra: { approvedBy: req.user?.nom },
      },
      req.user ? { id: req.user.id, name: req.user.nom || '' } : undefined
    );

    // Domain event: leave approved
    dispatchDomainEvent({
      type: "HR_LEAVE_APPROVED",
      data: {
        congeId: updated.id,
        employeId: updated.employeId,
        employeNom: updated.employeNom || "",
        approvedByName: req.user?.nom,
        agenceId: req.user?.agenceId,
      },
      timestamp: new Date(),
    });

    res.json(successResponse(updated));
  } catch (error) {
    logger.error({ err: error }, 'Erreur approbation congé');
    res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
  }
});

// PATCH /api/hr/conges/:id/reject - Refuser une demande
hrRouter.patch("/conges/:id/reject", getAuthUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { commentaire } = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    // Commentaire obligatoire pour un rejet
    if (!commentaire || commentaire.trim().length === 0) {
      return res.status(400).json(errorResponse('VALIDATION_ERROR', 'Un commentaire est obligatoire pour rejeter une demande'));
    }

    // RBAC Check
    const allowedRoles = ['ADMIN', 'CHEF_AGENCE', 'SUPERVISEUR'];
    if (!roleIn(userRole, allowedRoles)) {
        return res.status(403).json(errorResponse('FORBIDDEN', 'Non autorisé à refuser'));
    }

    // Get current state for audit
    const [currentConge] = await db.select().from(demandesConges).where(eq(demandesConges.id, parseInt(id)));
    if (!currentConge) {
      return res.status(404).json(errorResponse('NOT_FOUND', 'Demande non trouvée'));
    }

    // Check if already processed
    if (currentConge.statut !== LeaveStatus.PENDING) {
      return res.status(400).json(errorResponse(
        'INVALID_STATUS',
        `Cette demande a déjà été ${currentConge.statut === LeaveStatus.REJECTED ? 'rejetée' : 'traitée'}`
      ));
    }

    const [updated] = await db.update(demandesConges)
      .set({
        statut: LeaveStatus.REJECTED,
        approuvePar: userId,
        dateDecision: new Date(),
        commentaire: commentaire,
        updatedAt: new Date(),
      })
      .where(eq(demandesConges.id, parseInt(id)))
      .returning();

    // Release pending days in leave balance
    await hrService.onLeaveRejectedOrCancelled(updated.id);

    // Audit log
    await hrService.logAction(
      'conge',
      updated.id,
      'rejected',
      {
        userId: req.user?.id,
        userName: req.user?.nom,
        userRole: req.user?.role,
        agenceId: req.user?.agenceId ?? undefined,
      },
      { statut: currentConge.statut },
      { statut: updated.statut, approuvePar: userId, commentaire },
      commentaire,
      'warning'
    );

    // Broadcast HR Update
    broadcastHrUpdate(
      {
        entity: 'conge',
        action: 'rejected',
        id: updated.id,
        employeId: updated.employeId,
        extra: { rejectedBy: req.user?.nom, reason: commentaire },
      },
      req.user ? { id: req.user.id, name: req.user.nom || '' } : undefined
    );

    // Domain event: leave rejected
    dispatchDomainEvent({
      type: "HR_LEAVE_REJECTED",
      data: {
        congeId: updated.id,
        employeId: updated.employeId,
        employeNom: updated.employeNom || "",
        rejectedByName: req.user?.nom,
        reason: commentaire,
        agenceId: req.user?.agenceId,
      },
      timestamp: new Date(),
    });

    res.json(successResponse(updated));
  } catch (error) {
    logger.error({ err: error }, 'Erreur rejet congé');
    res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
  }
});

// GET /api/hr/conges/balance/:employeId - Solde congés d'un employé
hrRouter.get("/conges/balance/:employeId", getAuthUser, async (req, res) => {
  try {
    const { employeId } = req.params;
    const { year } = req.query;

    const targetYear = year ? parseInt(year as string) : new Date().getFullYear();

    // Get all balances for the employee
    const balances = await hrService.getAllLeaveBalances(employeId);

    // Get current year balance specifically
    const currentYearBalance = balances.find(b => b.year === targetYear);

    // Calculate available balance
    const available = currentYearBalance
      ? (currentYearBalance.acquired || 0) + (currentYearBalance.carryOver || 0) - (currentYearBalance.used || 0) - (currentYearBalance.pending || 0)
      : 0;

    // Per-type breakdown for the year
    const yearStart = `${targetYear}-01-01`;
    const yearEnd = `${targetYear}-12-31`;
    const byTypeRows = await db
      .select({
        type: demandesConges.type,
        statut: demandesConges.statut,
        total: count(),
        jours: sql<string>`COALESCE(SUM(
          EXTRACT(DAY FROM (${demandesConges.dateFin}::date - ${demandesConges.dateDebut}::date + 1))
        ), 0)`,
      })
      .from(demandesConges)
      .where(and(
        eq(demandesConges.employeId, employeId),
        gte(demandesConges.dateDebut, yearStart),
        lte(demandesConges.dateDebut, yearEnd),
      ))
      .groupBy(demandesConges.type, demandesConges.statut);

    // Pivot: group by type with approved/pending counts
    const byTypeMap: Record<string, { approved: number; pending: number; joursApproved: number; joursPending: number }> = {};
    for (const row of byTypeRows) {
      if (!byTypeMap[row.type]) byTypeMap[row.type] = { approved: 0, pending: 0, joursApproved: 0, joursPending: 0 };
      const jours = parseFloat(row.jours);
      if (row.statut === 'APPROVED') {
        byTypeMap[row.type].approved = row.total;
        byTypeMap[row.type].joursApproved = jours;
      } else if (row.statut === 'PENDING') {
        byTypeMap[row.type].pending = row.total;
        byTypeMap[row.type].joursPending = jours;
      }
    }

    const byType = Object.entries(byTypeMap).map(([type, data]) => ({ type, ...data }));

    res.json(successResponse({
      employeId,
      year: targetYear,
      balance: currentYearBalance,
      available,
      allBalances: balances,
      byType,
    }));
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération solde congés');
    res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
  }
});

/**
 * ========================================
 * FORMATIONS
 * ========================================
 */

// GET /api/hr/formations - Liste des formations avec nombre de participants (FIX N+1)
hrRouter.get("/formations", getAuthUser, async (req, res) => {
  try {
    const { statut, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
    const offset = (pageNum - 1) * limitNum;

    // FIX N+1: Use LEFT JOIN with GROUP BY instead of N separate queries
    const baseQuery = db
      .select({
        formation: formations,
        participantCount: sql<number>`COALESCE(COUNT(${formationParticipants.employeId}), 0)::int`.as('participant_count'),
      })
      .from(formations)
      .leftJoin(formationParticipants, eq(formations.id, formationParticipants.formationId))
      .groupBy(formations.id)
      .orderBy(desc(formations.dateDebut))
      .limit(limitNum)
      .offset(offset);

    // Apply filters (exclude soft-deleted + optional status)
    const conditions = [sql`${formations.deletedAt} IS NULL`];
    if (statut) conditions.push(eq(formations.statut, statut as string));
    const result = await baseQuery.where(and(...conditions));

    // Get total count for pagination
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(formations)
      .where(and(...conditions));

    // Format response
    const formattedResult = result.map(r => ({
      ...r.formation,
      participants: r.participantCount,
    }));

    res.json(successResponse(formattedResult, {
      total,
      page: pageNum,
      limit: limitNum,
      hasMore: offset + result.length < total,
    }));
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération formations');
    res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
  }
});

// POST /api/hr/formations - Créer une formation
hrRouter.post("/formations", getAuthUser, async (req, res) => {
  try {
    const { titre, formateur, dateDebut, duree, lieu, description, capaciteMax } = req.body;

    if (!titre || !formateur || !dateDebut || !duree) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    const [newFormation] = await db.insert(formations).values({
      titre,
      formateur,
      dateDebut,
      duree,
      lieu,
      description,
      capaciteMax,
      statut: StatutVisiteTerrain.PLANNED
    }).returning();

    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'formation_new', id: newFormation.id } });
    }

    res.status(201).json(newFormation);
  } catch (error) {
    logger.error({ err: error }, 'Erreur création formation');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/hr/formations/:id/participants - Participants d'une formation
hrRouter.get("/formations/:id/participants", getAuthUser, async (req, res) => {
  try {
    const { id } = req.params;

    const participants = await db.select()
      .from(formationParticipants)
      .where(eq(formationParticipants.formationId, parseInt(id)));

    res.json(participants);
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération participants');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/formations/:id/participants - Ajouter un participant
hrRouter.post("/formations/:id/participants", getAuthUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { employeId, employeNom } = req.body;

    if (!employeId || !employeNom) {
      return res.status(400).json({ error: "employeId et employeNom requis" });
    }

    const formationId = parseInt(id);
    await db.insert(formationParticipants).values({
      formationId,
      employeId,
      employeNom
    });

    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'formation_participant_added', formationId: id } });
    }

    // Cross-broadcast to agent + add to agent planning
    try {
      const [agentRow] = await db.select({ id: agentsTerrain.id, agenceId: agentsTerrain.currentAgenceId })
        .from(agentsTerrain).where(eq(agentsTerrain.employeId, employeId));
      if (agentRow && wsInstance) {
        wsInstance.broadcast({ type: "AGENT_MODULES_UPDATE", payload: { entity: "formation", agentId: agentRow.id } });

        // Add formation to agent's planning/agenda
        const [formation] = await db.select({
          titre: formations.titre,
          dateDebut: formations.dateDebut,
          dateFin: formations.dateFin,
          dureeHeures: formations.dureeHeures,
          lieu: formations.lieu,
        }).from(formations).where(eq(formations.id, formationId));

        if (formation?.dateDebut) {
          const startDate = new Date(formation.dateDebut);
          const endDate = formation.dateFin ? new Date(formation.dateFin) : startDate;
          // Create a planning entry for each day of the formation
          const planningDays: Date[] = [];
          for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            planningDays.push(new Date(d));
          }
          for (const day of planningDays) {
            const datePlanning = day.toISOString().slice(0, 10);
            await db.insert(agentPlannings).values({
              agentId: agentRow.id,
              agenceId: agentRow.agenceId,
              datePlanning,
              heureDebut: "08:00",
              heureFin: formation.dureeHeures && formation.dureeHeures <= 4 ? "12:00" : "17:00",
              typeActivite: "Formation",
              notes: `Formation : ${formation.titre}${formation.lieu ? ` — ${formation.lieu}` : ""}`,
              statut: "PLANNED",
            });
          }
          wsInstance.broadcast({ type: "AGENT_MODULES_UPDATE", payload: { entity: "planning", agentId: agentRow.id } });
        }
      }
    } catch (crossErr) {
      logger.warn({ err: crossErr }, "Cross-broadcast formation→agent failed (non-critical)");
    }

    res.status(201).json({ message: "Participant ajouté" });
  } catch (error) {
    logger.error({ err: error }, 'Erreur ajout participant');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// DELETE /api/hr/formations/:id/participants/:employeId - Retirer un participant
hrRouter.delete("/formations/:id/participants/:employeId", getAuthUser, async (req, res) => {
  try {
    const { id, employeId } = req.params;

    await db.delete(formationParticipants)
      .where(and(
        eq(formationParticipants.formationId, parseInt(id)),
        eq(formationParticipants.employeId, employeId)
      ));

    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'formation_participant_removed', formationId: id } });
    }

    res.json({ message: "Participant retiré" });
  } catch (error) {
    logger.error({ err: error }, 'Erreur retrait participant');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PATCH /api/hr/formations/:id - Mettre à jour formation (tous champs)
hrRouter.patch("/formations/:id", getAuthUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { statut, titre, formateur, dateDebut, dateFin, duree, lieu, description, programme, capaciteMax } = req.body;

    // Build update set dynamically
    const updateData: Record<string, any> = { updatedAt: new Date() };

    if (statut !== undefined) {
      const validStatuts = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
      if (!validStatuts.includes(statut)) {
        return res.status(400).json({ error: "Statut invalide" });
      }
      updateData.statut = statut;
    }
    if (titre !== undefined) updateData.titre = titre;
    if (formateur !== undefined) updateData.formateur = formateur;
    if (dateDebut !== undefined) updateData.dateDebut = dateDebut;
    if (dateFin !== undefined) updateData.dateFin = dateFin;
    if (duree !== undefined) updateData.duree = duree;
    if (lieu !== undefined) updateData.lieu = lieu;
    if (description !== undefined) updateData.description = description;
    if (programme !== undefined) updateData.programme = programme;
    if (capaciteMax !== undefined) updateData.capaciteMax = capaciteMax;

    const [updated] = await db.update(formations)
      .set(updateData)
      .where(eq(formations.id, parseInt(id)))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Formation non trouvée" });
    }

    broadcastHrEvent({ entity: 'formation', action: 'updated', id: updated.id });
    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, 'Erreur mise à jour formation');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// DELETE /api/hr/formations/:id - Supprimer formation (soft delete)
hrRouter.delete("/formations/:id", getAuthUser, async (req, res) => {
  try {
    const { id } = req.params;
    const [updated] = await db.update(formations)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(formations.id, parseInt(id)))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Formation non trouvée" });
    }

    broadcastHrEvent({ entity: 'formation', action: 'deleted', id: updated.id });
    res.json({ message: "Formation supprimée" });
  } catch (error) {
    logger.error({ err: error }, 'Erreur suppression formation');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ============================================
// FORMATION EVALUATIONS & CERTIFICATES
// ============================================

// PATCH /api/hr/formations/:id/participants/:employeId/evaluate - Evaluate a participant
hrRouter.patch("/formations/:id/participants/:employeId/evaluate", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        const formationId = parseInt(req.params.id);
        const { employeId } = req.params;
        const userId = req.user?.id;
        const { scoreEvaluation, evaluation, competencesAcquises, recommandation } = req.body;

        if (scoreEvaluation != null && (scoreEvaluation < 0 || scoreEvaluation > 100)) {
            return res.status(400).json({ error: "Le score doit être entre 0 et 100" });
        }

        const updates: Record<string, any> = { evaluatedAt: new Date(), evaluateurId: userId };
        if (scoreEvaluation != null) updates.scoreEvaluation = scoreEvaluation;
        if (evaluation != null) updates.evaluation = evaluation;
        if (competencesAcquises != null) updates.competencesAcquises = typeof competencesAcquises === 'string' ? competencesAcquises : JSON.stringify(competencesAcquises);
        if (recommandation) updates.recommandation = recommandation;

        const [updated] = await db.update(formationParticipants)
            .set(updates)
            .where(and(
                eq(formationParticipants.formationId, formationId),
                eq(formationParticipants.employeId, employeId)
            ))
            .returning();

        if (!updated) return res.status(404).json({ error: "Participant non trouvé" });

        // Cross-broadcast to agent
        try {
          const [agentRow] = await db.select({ id: agentsTerrain.id })
            .from(agentsTerrain).where(eq(agentsTerrain.employeId, employeId));
          if (agentRow) {
            const wsInstance = getWsInstance();
            if (wsInstance) {
              wsInstance.broadcast({ type: "AGENT_MODULES_UPDATE", payload: { entity: "formation", agentId: agentRow.id } });
            }
          }
        } catch { /* non-critical */ }

        res.json(updated);
    } catch (error) {
        logger.error({ err: error }, 'Erreur évaluation participant');
        res.status(500).json({ error: "Erreur lors de l'évaluation" });
    }
});

// GET /api/hr/formations/:id/certificates - List certificates for a formation
hrRouter.get("/formations/:id/certificates", getAuthUser, async (req, res) => {
    try {
        const formationId = parseInt(req.params.id);
        const certs = await db.select()
            .from(formationCertificates)
            .where(eq(formationCertificates.formationId, formationId))
            .orderBy(desc(formationCertificates.createdAt));
        res.json(certs);
    } catch (error) {
        logger.error({ err: error }, 'Erreur chargement certificats');
        res.status(500).json({ error: "Erreur lors du chargement des certificats" });
    }
});

// POST /api/hr/formations/:id/certificates - Issue a certificate
hrRouter.post("/formations/:id/certificates", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        const formationId = parseInt(req.params.id);
        const userId = req.user?.id;
        const { employeId, employeNom, competences, dateExpiration } = req.body;

        if (!employeId || !employeNom) {
            return res.status(400).json({ error: "employeId et employeNom sont requis" });
        }

        // Get formation title
        const [formation] = await db.select({ titre: formations.titre }).from(formations).where(eq(formations.id, formationId));
        if (!formation) return res.status(404).json({ error: "Formation non trouvée" });

        // Generate unique certificate number: CERT-YYYY-NNNNNN
        const year = new Date().getFullYear();
        const { randomBytes } = require('crypto');
        const random = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
        const numeroCertificat = `CERT-${year}-${random}`;

        const [cert] = await db.insert(formationCertificates).values({
            formationId,
            employeId,
            employeNom,
            numeroCertificat,
            titre: formation.titre,
            competences: competences || null,
            dateExpiration: dateExpiration || null,
            emisPar: userId || null,
        }).returning();

        broadcastHrUpdate({ entity: 'formation', action: 'updated', id: formationId });

        // Cross-broadcast to agent
        try {
          const [agentRow] = await db.select({ id: agentsTerrain.id })
            .from(agentsTerrain).where(eq(agentsTerrain.employeId, employeId));
          if (agentRow) {
            const wsInstance = getWsInstance();
            if (wsInstance) {
              wsInstance.broadcast({ type: "AGENT_MODULES_UPDATE", payload: { entity: "formation", agentId: agentRow.id } });
            }
          }
        } catch { /* non-critical */ }

        res.status(201).json(cert);
    } catch (error: any) {
        if (error.code === '23505') {
            return res.status(409).json({ error: "Un certificat existe déjà pour ce participant dans cette formation" });
        }
        logger.error({ err: error }, 'Erreur émission certificat');
        res.status(500).json({ error: "Erreur lors de l'émission du certificat" });
    }
});

// POST /api/hr/formations/:id/certificates/batch - Issue certificates for all eligible participants
hrRouter.post("/formations/:id/certificates/batch", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        const formationId = parseInt(req.params.id);
        const userId = req.user?.id;
        const { competences, dateExpiration } = req.body;

        // Get formation
        const [formation] = await db.select().from(formations).where(eq(formations.id, formationId));
        if (!formation) return res.status(404).json({ error: "Formation non trouvée" });
        if (formation.statut !== 'COMPLETED') {
            return res.status(400).json({ error: "La formation doit être terminée avant d'émettre des certificats" });
        }

        // Get participants marked present with no existing certificate
        const participants = await db.select()
            .from(formationParticipants)
            .where(and(
                eq(formationParticipants.formationId, formationId),
                eq(formationParticipants.presence, 'Présent')
            ));

        const existingCerts = await db.select({ employeId: formationCertificates.employeId })
            .from(formationCertificates)
            .where(eq(formationCertificates.formationId, formationId));
        const certifiedIds = new Set(existingCerts.map(c => c.employeId));

        const eligible = participants.filter(p => !certifiedIds.has(p.employeId));
        if (eligible.length === 0) {
            return res.json({ issued: 0, message: "Aucun participant éligible" });
        }

        const year = new Date().getFullYear();
        const certs = await db.insert(formationCertificates).values(
            eligible.map(p => ({
                formationId,
                employeId: p.employeId,
                employeNom: p.employeNom,
                numeroCertificat: `CERT-${year}-${require('crypto').randomBytes(4).toString('hex').slice(0, 6).toUpperCase()}`,
                titre: formation.titre,
                competences: competences || null,
                dateExpiration: dateExpiration || null,
                emisPar: userId || null,
            }))
        ).returning();

        broadcastHrUpdate({ entity: 'formation', action: 'updated', id: formationId });

        // Cross-broadcast to all agents who received certificates
        try {
          const employeeIds = certs.map(c => c.employeId);
          const agents = await db.select({ id: agentsTerrain.id, employeId: agentsTerrain.employeId })
            .from(agentsTerrain).where(sql`${agentsTerrain.employeId} IN ${employeeIds}`);
          const wsInstance = getWsInstance();
          if (wsInstance && agents.length > 0) {
            for (const agent of agents) {
              wsInstance.broadcast({ type: "AGENT_MODULES_UPDATE", payload: { entity: "formation", agentId: agent.id } });
            }
          }
        } catch { /* non-critical */ }

        res.status(201).json({ issued: certs.length, certificates: certs });
    } catch (error) {
        logger.error({ err: error }, 'Erreur émission batch certificats');
        res.status(500).json({ error: "Erreur lors de l'émission des certificats" });
    }
});

// PATCH /api/hr/certificates/:id/revoke - Revoke a certificate
hrRouter.patch("/certificates/:id/revoke", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        const { motifRevocation } = req.body;

        if (!motifRevocation || motifRevocation.length < 10) {
            return res.status(400).json({ error: "Motif de révocation requis (10 caractères min)" });
        }

        const [updated] = await db.update(formationCertificates)
            .set({
                statut: 'REVOKED',
                revoquePar: userId,
                revoqueAt: new Date(),
                motifRevocation,
                updatedAt: new Date(),
            })
            .where(eq(formationCertificates.id, id))
            .returning();

        if (!updated) return res.status(404).json({ error: "Certificat non trouvé" });
        res.json(updated);
    } catch (error) {
        logger.error({ err: error }, 'Erreur révocation certificat');
        res.status(500).json({ error: "Erreur lors de la révocation" });
    }
});

// GET /api/hr/employees/:employeId/certificates - All certificates for an employee
hrRouter.get("/employees/:employeId/certificates", getAuthUser, async (req, res) => {
    try {
        const { employeId } = req.params;
        const certs = await db.select()
            .from(formationCertificates)
            .where(eq(formationCertificates.employeId, employeId))
            .orderBy(desc(formationCertificates.dateEmission));
        res.json(certs);
    } catch (error) {
        logger.error({ err: error }, 'Erreur chargement certificats employé');
        res.status(500).json({ error: "Erreur lors du chargement des certificats" });
    }
});

/**
 * ========================================
 * SANCTIONS
 * ========================================
 */

// GET /api/hr/sanctions - Liste des sanctions
hrRouter.get("/sanctions", getAuthUser, async (req, res) => {
  try {
    const { employeId, gravite } = req.query;

    let baseQuery = db.select().from(sanctions);

    let result;
    if (employeId) {
      result = await baseQuery.where(eq(sanctions.employeId, employeId as string)).orderBy(desc(sanctions.date));
    } else if (gravite) {
      result = await baseQuery.where(eq(sanctions.gravite, gravite as string)).orderBy(desc(sanctions.date));
    } else {
      result = await baseQuery.orderBy(desc(sanctions.date));
    }

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération sanctions');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/sanctions - Créer une sanction
hrRouter.post("/sanctions", getAuthUser, async (req, res) => {
  try {
    const { employeId, employeNom, type, motif, date, gravite } = req.body;
    const userId = req.user?.id;
    const agenceId = req.user?.agenceId;

    if (!employeId || !type || !motif || !date || !gravite) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    const [newSanction] = await db.insert(sanctions).values({
      employeId,
      employeNom,
      type,
      motif,
      date,
      gravite,
      emetteurId: userId
    }).returning();

    // Check for escalation rules
    let escalationResult = null;
    try {
      const escalationCheck = await sanctionEscalationService.checkAndApplyEscalation(
        newSanction.id,
        employeId,
        gravite,
        agenceId ?? undefined
      );

      if (escalationCheck.shouldEscalate && escalationCheck.rule) {
        // If auto_apply is true, apply the escalation automatically
        if (escalationCheck.rule.autoApply) {
          escalationResult = await sanctionEscalationService.applyEscalation(
            newSanction.id,
            escalationCheck.rule,
            userId
          );
          logger.info({ sanctionId: newSanction.id, escalation: escalationResult }, 'Sanction auto-escaladée');
        } else {
          // Return escalation warning in response
          escalationResult = {
            warning: true,
            shouldEscalate: true,
            rule: escalationCheck.rule,
            sanctionCount: escalationCheck.sanctionCount,
            message: escalationCheck.message,
          };
        }
      }
    } catch (escErr) {
      logger.error({ err: escErr }, 'Erreur lors de la vérification d\'escalade');
      // Continue without escalation
    }

    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'sanction_new', id: newSanction.id } });
    }

    // Domain event: sanction created
    dispatchDomainEvent({
      type: "HR_SANCTION_CREATED",
      data: {
        sanctionId: newSanction.id,
        employeId,
        employeNom: employeNom || "",
        type,
        gravite,
        motif,
        emetteurId: userId,
        agenceId: req.user?.agenceId,
      },
      timestamp: new Date(),
    });

    res.status(201).json({
      ...newSanction,
      escalation: escalationResult,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erreur création sanction');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PATCH /api/hr/sanctions/:id/status - Advance sanctions workflow
// Workflow: DRAFT -> NOTIFIED -> ACKNOWLEDGED -> APPEALED -> FINAL
const SANCTION_WORKFLOW_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['NOTIFIED'],
  NOTIFIED: ['ACKNOWLEDGED'],
  ACKNOWLEDGED: ['APPEALED', 'FINAL'],
  APPEALED: ['FINAL'],
};

hrRouter.patch("/sanctions/:id/status", getAuthUser, async (req, res) => {
  try {
    const sanctionId = parseInt(req.params.id);
    const { newStatus, appealReason } = req.body;
    const userId = req.user?.id;

    if (!newStatus) {
      return res.status(400).json({ error: "Nouveau statut requis" });
    }

    // Load current sanction
    const [current] = await db.select().from(sanctions).where(eq(sanctions.id, sanctionId));
    if (!current) {
      return res.status(404).json({ error: "Sanction non trouvée" });
    }

    const currentWorkflow = current.statutWorkflow || 'DRAFT';
    const allowedTransitions = SANCTION_WORKFLOW_TRANSITIONS[currentWorkflow] || [];

    if (!allowedTransitions.includes(newStatus)) {
      return res.status(400).json({
        error: `Transition invalide: ${currentWorkflow} → ${newStatus}. Transitions possibles: ${allowedTransitions.join(', ')}`,
      });
    }

    // Build update payload
    const updateData: Record<string, any> = { statutWorkflow: newStatus };

    if (newStatus === 'ACKNOWLEDGED') {
      updateData.acknowledgedAt = new Date();
    } else if (newStatus === 'APPEALED') {
      if (!appealReason?.trim()) {
        return res.status(400).json({ error: "Motif d'appel requis" });
      }
      updateData.appealedAt = new Date();
      updateData.appealReason = appealReason;
    } else if (newStatus === 'FINAL') {
      updateData.finalizedAt = new Date();
      updateData.finalizedBy = userId;
    }

    const [updated] = await db
      .update(sanctions)
      .set(updateData)
      .where(eq(sanctions.id, sanctionId))
      .returning();

    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
      wsInstance.broadcast({
        type: "HR_UPDATE",
        payload: { entity: 'sanction', action: 'updated', id: sanctionId },
      });
    }

    // Domain events for key workflow transitions
    if (newStatus === 'NOTIFIED') {
      dispatchDomainEvent({
        type: "HR_SANCTION_NOTIFIED",
        data: {
          sanctionId,
          employeId: current.employeId,
          employeNom: current.employeNom || "",
          type: current.type,
          gravite: current.gravite,
          agenceId: req.user?.agenceId,
        },
        timestamp: new Date(),
      });
    } else if (newStatus === 'FINAL') {
      dispatchDomainEvent({
        type: "HR_SANCTION_FINALIZED",
        data: {
          sanctionId,
          employeId: current.employeId,
          employeNom: current.employeNom || "",
          type: current.type,
          gravite: current.gravite,
          finalizedBy: userId,
          agenceId: req.user?.agenceId,
        },
        timestamp: new Date(),
      });
    }

    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, 'Erreur mise à jour statut sanction');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PATCH /api/hr/sanctions/:id - Edit sanction fields
hrRouter.patch("/sanctions/:id", getAuthUser, async (req, res) => {
  try {
    const sanctionId = parseInt(req.params.id);
    const { type, motif, date, gravite, employeNom } = req.body;

    const updateData: Record<string, any> = {};
    if (type !== undefined) updateData.type = type;
    if (motif !== undefined) updateData.motif = motif;
    if (date !== undefined) updateData.date = date;
    if (gravite !== undefined) updateData.gravite = gravite;
    if (employeNom !== undefined) updateData.employeNom = employeNom;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "Aucun champ à mettre à jour" });
    }

    const [updated] = await db
      .update(sanctions)
      .set(updateData)
      .where(eq(sanctions.id, sanctionId))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Sanction non trouvée" });
    }

    const wsInstance = getWsInstance();
    if (wsInstance) {
      wsInstance.broadcast({ type: "HR_UPDATE", payload: { entity: 'sanction', action: 'updated', id: sanctionId } });
    }

    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, 'Erreur mise à jour sanction');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// DELETE /api/hr/sanctions/:id - Delete sanction
hrRouter.delete("/sanctions/:id", getAuthUser, async (req, res) => {
  try {
    const sanctionId = parseInt(req.params.id);

    const [deleted] = await db
      .delete(sanctions)
      .where(eq(sanctions.id, sanctionId))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: "Sanction non trouvée" });
    }

    const wsInstance = getWsInstance();
    if (wsInstance) {
      wsInstance.broadcast({ type: "HR_UPDATE", payload: { entity: 'sanction', action: 'deleted', id: sanctionId } });
    }

    res.json({ message: "Sanction supprimée" });
  } catch (error) {
    logger.error({ err: error }, 'Erreur suppression sanction');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/sanctions/:id/document - Upload document for a sanction
hrRouter.post("/sanctions/:id/document", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), docUpload.single('file'), async (req, res) => {
    try {
        const sanctionId = parseInt(req.params.id);
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: "Fichier requis" });
        }

        // Check sanction exists
        const [sanction] = await db.select().from(sanctions).where(eq(sanctions.id, sanctionId));
        if (!sanction) {
            return res.status(404).json({ error: "Sanction non trouvée" });
        }

        // Upload to MinIO
        const storagePath = `sanctions/${sanctionId}`;
        const storageKey = await StorageService.uploadBuffer(
            file.buffer,
            file.originalname,
            file.mimetype,
            storagePath,
            false, // private
        );

        // Get download URL
        const downloadUrl = await StorageService.getPresignedDownloadUrl(storageKey, 86400); // 24h

        // Append to documentsJoints (comma-separated)
        const existingDocs = sanction.documentsJoints || '';
        const newDocs = existingDocs ? `${existingDocs},${storageKey}` : storageKey;

        const [updated] = await db.update(sanctions)
            .set({ documentsJoints: newDocs })
            .where(eq(sanctions.id, sanctionId))
            .returning();

        res.status(201).json({ storageKey, downloadUrl, sanction: updated });
    } catch (error) {
        logger.error({ err: error }, 'Erreur upload document sanction');
        res.status(500).json({ error: "Erreur lors de l'upload du document" });
    }
});

// GET /api/hr/sanctions/:id/documents - Get presigned URLs for sanction documents
hrRouter.get("/sanctions/:id/documents", getAuthUser, async (req, res) => {
    try {
        const sanctionId = parseInt(req.params.id);
        const [sanction] = await db.select().from(sanctions).where(eq(sanctions.id, sanctionId));
        if (!sanction) {
            return res.status(404).json({ error: "Sanction non trouvée" });
        }

        const keys = (sanction.documentsJoints || '').split(',').filter(Boolean);
        const documents = await Promise.all(
            keys.map(async (key) => ({
                key,
                fileName: key.split('/').pop() || key,
                url: await StorageService.getPresignedDownloadUrl(key, 3600),
            }))
        );

        res.json(documents);
    } catch (error) {
        logger.error({ err: error }, 'Erreur récupération documents sanction');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

/**
 * ========================================
 * SANCTION ESCALATION RULES
 * ========================================
 */

// GET /api/hr/sanction-escalation-rules - Liste des règles d'escalade
hrRouter.get("/sanction-escalation-rules", getAuthUser, async (req, res) => {
  try {
    const { agenceId } = req.query;
    const rules = await sanctionEscalationService.getRules(agenceId as string | undefined);
    res.json(rules);
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération règles d\'escalade');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/sanction-escalation-rules - Créer une règle d'escalade
hrRouter.post("/sanction-escalation-rules", getAuthUser, async (req, res) => {
  try {
    const {
      agenceId,
      nom,
      description,
      sanctionCountThreshold,
      periodMonths,
      sourceGravite,
      escalateToGravite,
      notificationRequired,
      autoApply
    } = req.body;

    if (!nom || !sanctionCountThreshold || !sourceGravite || !escalateToGravite) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    const rule = await sanctionEscalationService.upsertRule({
      agenceId,
      nom,
      description,
      sanctionCountThreshold,
      periodMonths,
      sourceGravite,
      escalateToGravite,
      notificationRequired,
      autoApply,
      createdBy: req.user?.id,
    });

    res.status(201).json(rule);
  } catch (error) {
    logger.error({ err: error }, 'Erreur création règle d\'escalade');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PUT /api/hr/sanction-escalation-rules/:id - Mettre à jour une règle
hrRouter.put("/sanction-escalation-rules/:id", getAuthUser, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nom,
      description,
      sanctionCountThreshold,
      periodMonths,
      sourceGravite,
      escalateToGravite,
      notificationRequired,
      autoApply
    } = req.body;

    const rule = await sanctionEscalationService.upsertRule({
      id,
      nom,
      description,
      sanctionCountThreshold,
      periodMonths,
      sourceGravite,
      escalateToGravite,
      notificationRequired,
      autoApply,
    });

    res.json(rule);
  } catch (error) {
    logger.error({ err: error }, 'Erreur mise à jour règle d\'escalade');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// DELETE /api/hr/sanction-escalation-rules/:id - Désactiver une règle
hrRouter.delete("/sanction-escalation-rules/:id", getAuthUser, async (req, res) => {
  try {
    const { id } = req.params;
    await sanctionEscalationService.deleteRule(id);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Erreur suppression règle d\'escalade');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/sanctions/:id/apply-escalation - Appliquer manuellement l'escalade
hrRouter.post("/sanctions/:id/apply-escalation", getAuthUser, async (req, res) => {
  try {
    const sanctionId = parseInt(req.params.id);
    const { ruleId } = req.body;

    // Récupérer la règle
    const rules = await sanctionEscalationService.getRules();
    const rule = rules.find(r => r.id === ruleId);

    if (!rule) {
      return res.status(404).json({ error: "Règle d'escalade non trouvée" });
    }

    const result = await sanctionEscalationService.applyEscalation(
      sanctionId,
      rule,
      req.user?.id
    );

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
      wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'sanction_escalated', id: result.escalatedSanction?.id } });
    }

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Erreur application escalade');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/hr/sanctions/:id/escalation-history - Historique d'escalade
hrRouter.get("/sanctions/:id/escalation-history", getAuthUser, async (req, res) => {
  try {
    const sanctionId = parseInt(req.params.id);
    const history = await sanctionEscalationService.getEscalationHistory(sanctionId);
    res.json(history);
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération historique escalade');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/**
 * ========================================
 * CANDIDATURES
 * ========================================
 */

// GET /api/hr/candidatures - Liste des candidatures
hrRouter.get("/candidatures", getAuthUser, async (req, res) => {
  try {
    const { statut } = req.query;

    const result = statut
      ? await db.select().from(candidatures).where(eq(candidatures.statut, statut as string)).orderBy(desc(candidatures.datePostulation))
      : await db.select().from(candidatures).orderBy(desc(candidatures.datePostulation));

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération candidatures');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/candidatures - Créer une candidature
hrRouter.post("/candidatures", getAuthUser, async (req, res) => {
  try {
    const { nom, prenom, email, telephone, posteVise, experience, formation: formationCand } = req.body;

    if (!nom || !prenom || !email || !posteVise) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    const [newCandidature] = await db.insert(candidatures).values({
      nom,
      prenom,
      email,
      telephone,
      posteVise,
      experience,
      formation: formationCand,
      statut: StatutCandidature.PENDING,
      jobOfferId: req.body.jobOfferId || null,
      source: req.body.source || 'MANUAL',
    }).returning();

    // Auto-score if linked to an offer
    if (newCandidature.jobOfferId) {
        await scoreCandidature(newCandidature.id);
    }

    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'candidature_new', id: newCandidature.id } });
    }

    res.status(201).json(newCandidature);
  } catch (error) {
    logger.error({ err: error }, 'Erreur création candidature');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/hr/candidatures/:id/cv - Get CV download URL
hrRouter.get("/candidatures/:id/cv", getAuthUser, async (req, res) => {
  try {
    const { id } = req.params;
    const [candidature] = await db.select().from(candidatures).where(eq(candidatures.id, parseInt(id))).limit(1);
    if (!candidature || !candidature.cvUrl) {
      return res.status(404).json({ error: "CV non trouvé" });
    }
    const downloadUrl = await StorageService.getPresignedDownloadUrl(candidature.cvUrl, 3600);
    res.json({ url: downloadUrl, filename: candidature.cvUrl.split('/').pop() });
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération CV');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/candidatures/:id/cv - Upload CV
hrRouter.post("/candidatures/:id/cv", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), docUpload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "Fichier requis" });
    }

    const candidature = await db.select().from(candidatures).where(eq(candidatures.id, parseInt(id))).limit(1);
    if (!candidature.length) {
      return res.status(404).json({ error: "Candidature non trouvée" });
    }

    const storageKey = await StorageService.uploadBuffer(
      file.buffer,
      file.originalname,
      file.mimetype,
      `hr/candidatures/${id}/cv`,
      false
    );

    const [updated] = await db.update(candidatures)
      .set({ cvUrl: storageKey, updatedAt: new Date() })
      .where(eq(candidatures.id, parseInt(id)))
      .returning();

    const downloadUrl = await StorageService.getPresignedDownloadUrl(storageKey, 86400);

    res.json({ ...updated, cvDownloadUrl: downloadUrl });
  } catch (error) {
    logger.error({ err: error }, 'Erreur upload CV');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PATCH /api/hr/candidatures/:id - Mettre à jour une candidature
hrRouter.patch("/candidatures/:id", getAuthUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { statut, notes, dateEntretien } = req.body;

    const updates: any = {};
    if (statut) {
      const validStatuts = Object.values(StatutCandidature);
      if (!validStatuts.includes(statut as any)) {
        return res.status(400).json({ error: "Statut invalide" });
      }
      updates.statut = statut;
    }
    if (notes !== undefined) updates.notes = notes;
    if (dateEntretien !== undefined) updates.dateEntretien = dateEntretien;

    const [updated] = await db.update(candidatures)
      .set(updates)
      .where(eq(candidatures.id, parseInt(id)))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Candidature non trouvée" });
    }

    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'candidature_updated', id: updated.id } });
    }

    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, 'Erreur mise à jour candidature');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/**
 * ========================================
 * HIRING APPROVAL WORKFLOW
 * ========================================
 */

// GET /api/hr/hiring-approval/config - Récupérer la config d'approbation
hrRouter.get("/hiring-approval/config", getAuthUser, async (req, res) => {
  try {
    const { agenceId } = req.query;
    if (!agenceId) {
      return res.status(400).json({ error: "agenceId requis" });
    }

    const config = await hiringApprovalService.getConfig(agenceId as string);
    res.json(config || { approvalLevels: [] });
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération config approbation');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/hiring-approval/config - Créer/Mettre à jour la config
hrRouter.post("/hiring-approval/config", getAuthUser, async (req, res) => {
  try {
    const { agenceId, approvalLevels, minSalaryThreshold } = req.body;
    const userId = req.user?.id;

    if (!agenceId || !approvalLevels) {
      return res.status(400).json({ error: "agenceId et approvalLevels requis" });
    }

    const config = await hiringApprovalService.upsertConfig({
      agenceId,
      approvalLevels,
      minSalaryThreshold: minSalaryThreshold ? parseInt(minSalaryThreshold) : undefined,
      createdBy: userId || '',
    });

    res.json(config);
  } catch (error) {
    logger.error({ err: error }, 'Erreur création config approbation');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/hiring-approval/initialize/:candidatureId - Initialiser le workflow
hrRouter.post("/hiring-approval/initialize/:candidatureId", getAuthUser, async (req, res) => {
  try {
    const candidatureId = parseInt(req.params.candidatureId);
    const { agenceId } = req.body;

    if (!agenceId) {
      return res.status(400).json({ error: "agenceId requis" });
    }

    const result = await hiringApprovalService.initializeWorkflow(candidatureId, agenceId);

    // Broadcast update
    const wsInstance = getWsInstance();
    if (wsInstance) {
      wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'hiring_approval_initialized', candidatureId } });
    }

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Erreur initialisation workflow approbation');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/hiring-approval/submit - Soumettre une décision
hrRouter.post("/hiring-approval/submit", getAuthUser, async (req, res) => {
  try {
    const { candidatureId, decision, commentaire } = req.body;
    const approverId = req.user?.id;

    if (!candidatureId || !decision || !approverId) {
      return res.status(400).json({ error: "candidatureId, decision et utilisateur requis" });
    }

    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      return res.status(400).json({ error: "decision doit être APPROVED ou REJECTED" });
    }

    const result = await hiringApprovalService.submitApproval({
      candidatureId,
      approverId,
      decision,
      commentaire,
    });

    // Broadcast update
    const wsInstance = getWsInstance();
    if (wsInstance) {
      wsInstance.broadcast({
        type: "HR_UPDATE",
        payload: {
          type: 'hiring_approval_submitted',
          candidatureId,
          decision,
          finalDecision: result.finalDecision
        }
      });
    }

    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur soumission approbation');
    res.status(400).json({ error: error.message || "Erreur serveur" });
  }
});

// GET /api/hr/hiring-approval/pending - Approbations en attente pour un rôle
hrRouter.get("/hiring-approval/pending", getAuthUser, async (req, res) => {
  try {
    const { role, agenceId } = req.query;

    if (!role) {
      return res.status(400).json({ error: "role requis" });
    }

    const pending = await hiringApprovalService.getPendingApprovals(
      role as string,
      agenceId as string | undefined
    );

    res.json(pending);
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération approbations en attente');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/hr/hiring-approval/status/:candidatureId - Statut du workflow
hrRouter.get("/hiring-approval/status/:candidatureId", getAuthUser, async (req, res) => {
  try {
    const candidatureId = parseInt(req.params.candidatureId);
    const status = await hiringApprovalService.getWorkflowStatus(candidatureId);

    if (!status) {
      return res.status(404).json({ error: "Candidature non trouvée" });
    }

    res.json(status);
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération statut workflow');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/**
 * ========================================
 * ONBOARDING PIPELINE
 * ========================================
 */

// GET /api/hr/onboarding/checklists - Liste des checklists d'onboarding
hrRouter.get("/onboarding/checklists", getAuthUser, async (req, res) => {
  try {
    const { agenceId } = req.query;
    const checklists = await onboardingService.getChecklists(agenceId as string | undefined);
    res.json(checklists);
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération checklists onboarding');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/onboarding/checklists - Créer une checklist
hrRouter.post("/onboarding/checklists", getAuthUser, async (req, res) => {
  try {
    const { agenceId, nom, description, items } = req.body;

    if (!nom || !items) {
      return res.status(400).json({ error: "nom et items requis" });
    }

    const checklist = await onboardingService.upsertChecklist({
      agenceId,
      nom,
      description,
      items,
      createdBy: req.user?.id,
    });

    res.status(201).json(checklist);
  } catch (error) {
    logger.error({ err: error }, 'Erreur création checklist onboarding');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PUT /api/hr/onboarding/checklists/:id - Mettre à jour une checklist
hrRouter.put("/onboarding/checklists/:id", getAuthUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { nom, description, items } = req.body;

    const checklist = await onboardingService.upsertChecklist({
      id,
      nom,
      description,
      items,
    });

    res.json(checklist);
  } catch (error) {
    logger.error({ err: error }, 'Erreur mise à jour checklist onboarding');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// DELETE /api/hr/onboarding/checklists/:id - Supprimer une checklist
hrRouter.delete("/onboarding/checklists/:id", getAuthUser, async (req, res) => {
  try {
    const { id } = req.params;
    await onboardingService.deleteChecklist(id);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Erreur suppression checklist onboarding');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/hr/onboarding/instances - Liste des instances d'onboarding
hrRouter.get("/onboarding/instances", getAuthUser, async (req, res) => {
  try {
    const { candidatureId, employeId, statut, assignedTo } = req.query;
    const instances = await onboardingService.getInstances({
      candidatureId: candidatureId ? parseInt(candidatureId as string) : undefined,
      employeId: employeId as string | undefined,
      statut: statut as string | undefined,
      assignedTo: assignedTo as string | undefined,
    });
    res.json(instances);
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération instances onboarding');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/hr/onboarding/instances/:id - Détail d'une instance
hrRouter.get("/onboarding/instances/:id", getAuthUser, async (req, res) => {
  try {
    const { id } = req.params;
    const instance = await onboardingService.getInstance(id);

    if (!instance) {
      return res.status(404).json({ error: "Instance non trouvée" });
    }

    res.json(instance);
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération instance onboarding');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/onboarding/start - Démarrer l'onboarding pour une candidature
hrRouter.post("/onboarding/start", getAuthUser, async (req, res) => {
  try {
    const { candidatureId, checklistId, assignedTo } = req.body;

    if (!candidatureId || !checklistId) {
      return res.status(400).json({ error: "candidatureId et checklistId requis" });
    }

    const result = await onboardingService.startOnboarding(
      candidatureId,
      checklistId,
      assignedTo || req.user?.id
    );

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
      wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'onboarding_started', candidatureId } });
    }

    res.status(201).json(result);
  } catch (error) {
    logger.error({ err: error }, 'Erreur démarrage onboarding');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/onboarding/instances/:id/complete-item - Compléter un item
hrRouter.post("/onboarding/instances/:id/complete-item", getAuthUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { itemName, notes } = req.body;

    if (!itemName) {
      return res.status(400).json({ error: "itemName requis" });
    }

    const result = await onboardingService.completeItem(id, itemName, req.user?.id, notes);

    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
      wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'onboarding_item_completed', instanceId: id } });
    }

    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur completion item onboarding');
    res.status(400).json({ error: error.message || "Erreur serveur" });
  }
});

// POST /api/hr/onboarding/instances/:id/uncomplete-item - Démarquer un item
hrRouter.post("/onboarding/instances/:id/uncomplete-item", getAuthUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { itemName } = req.body;

    if (!itemName) {
      return res.status(400).json({ error: "itemName requis" });
    }

    const result = await onboardingService.uncompleteItem(id, itemName);
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur démarquage item onboarding');
    res.status(400).json({ error: error.message || "Erreur serveur" });
  }
});

// POST /api/hr/onboarding/convert-to-employee - Convertir candidat en employé
hrRouter.post("/onboarding/convert-to-employee", getAuthUser, async (req, res) => {
  try {
    const { candidatureId, employeData } = req.body;

    if (!candidatureId || !employeData?.agenceId) {
      return res.status(400).json({ error: "candidatureId et employeData.agenceId requis" });
    }

    const result = await onboardingService.createEmployeeFromCandidate(
      candidatureId,
      employeData
    );

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
      wsInstance.broadcast({
        type: "HR_UPDATE",
        payload: { type: 'employee_created_from_candidate', candidatureId, employeId: result.employe?.id }
      });
    }

    res.status(201).json(result);
  } catch (error) {
    logger.error({ err: error }, 'Erreur conversion candidat en employé');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/onboarding/instances/:id/cancel - Annuler l'onboarding
hrRouter.post("/onboarding/instances/:id/cancel", getAuthUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const result = await onboardingService.cancelOnboarding(id, reason);
    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Erreur annulation onboarding');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/**
 * ========================================
 * BULLETINS DE PAIE
 * ========================================
 */

// GET /api/hr/bulletins - Liste des bulletins de paie
hrRouter.get("/bulletins", getAuthUser, async (req, res) => {
  try {
    const { employeId, mois, annee } = req.query;

    let query = db.select().from(bulletinsPaie);

    const conditions = [];
    if (employeId) conditions.push(eq(bulletinsPaie.employeId, employeId as string));
    if (mois && annee) {
      const moisFormat = `${annee}-${String(mois).padStart(2, '0')}`;
      conditions.push(eq(bulletinsPaie.mois, moisFormat));
    }

    const result = conditions.length > 0
      ? await query.where(and(...conditions)).orderBy(desc(bulletinsPaie.mois))
      : await query.orderBy(desc(bulletinsPaie.mois));

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération bulletins');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/hr/bulletins/:id - Détail d'un bulletin avec lignes
hrRouter.get("/bulletins/:id", getAuthUser, async (req, res) => {
  try {
    const bulletinId = parseInt(req.params.id);
    if (isNaN(bulletinId)) {
      return res.status(400).json({ error: 'ID invalide' });
    }

    const [bulletin] = await db
      .select()
      .from(bulletinsPaie)
      .where(eq(bulletinsPaie.id, bulletinId));

    if (!bulletin) {
      return res.status(404).json({ error: 'Bulletin non trouvé' });
    }

    // Fetch payslip lines
    const lines = await db
      .select()
      .from(payslipLines)
      .where(eq(payslipLines.bulletinId, bulletinId))
      .orderBy(payslipLines.sortOrder);

    // Fetch employee + user details
    const [employeData] = await db
      .select({ employe: employes, user: users })
      .from(employes)
      .innerJoin(users, eq(employes.userId, users.id))
      .where(eq(employes.id, bulletin.employeId));

    // Fetch company settings
    const [settings] = await db.select().from(systemSettings);

    // Fetch agence info
    let agence = null;
    if (employeData?.employe.agenceId) {
      const [ag] = await db.select().from(agences).where(eq(agences.id, employeData.employe.agenceId));
      agence = ag || null;
    }

    // Fetch leave balance for current year
    let leaves = null;
    if (employeData) {
      const year = parseInt(bulletin.mois.split('-')[0]);
      const [lb] = await db
        .select()
        .from(leaveBalances)
        .where(
          and(
            eq(leaveBalances.employeId, employeData.employe.id),
            eq(leaveBalances.year, year)
          )
        );
      if (lb) {
        leaves = { acquired: lb.acquired, used: lb.used, balance: (lb.acquired || 0) - (lb.used || 0) };
      }
    }

    // Fetch job position title
    let jobTitle = null;
    if (employeData?.employe.jobPositionId) {
      const [jp] = await db.select().from(jobPositions).where(eq(jobPositions.id, employeData.employe.jobPositionId));
      jobTitle = jp?.name || null;
    }

    // Fetch convention collective via employee's categorie + coefficient
    let conventionCollective: string | null = null;
    if (employeData?.employe.categorie && employeData?.employe.coefficient) {
      const [qc] = await db.select().from(qualificationCoefficients)
        .where(
          and(
            eq(qualificationCoefficients.categorie, employeData.employe.categorie),
            eq(qualificationCoefficients.coefficient, employeData.employe.coefficient)
          )
        )
        .limit(1);
      if (qc?.conventionCollectiveId) {
        const [cc] = await db.select().from(conventionsCollectives)
          .where(eq(conventionsCollectives.id, qc.conventionCollectiveId));
        conventionCollective = cc?.libelle || null;
      }
    }

    // Compute ancienneté
    const anciennete = computeAnciennete(employeData?.employe.dateEmbauche || null, bulletin.mois + '-01');

    // Fetch heures travaillées for the month
    let heuresTravaillees = null;
    if (employeData) {
      const [yearStr, monthStr] = bulletin.mois.split('-');
      const monthStart = `${yearStr}-${monthStr}-01`;
      const lastDay = new Date(Number(yearStr), Number(monthStr), 0).getDate();
      const monthEnd = `${yearStr}-${monthStr}-${String(lastDay).padStart(2, '0')}`;

      const presenceRows = await db.select().from(presences).where(
        and(
          eq(presences.employeId, employeData.employe.id),
          gte(presences.date, monthStart),
          lte(presences.date, monthEnd)
        )
      );

      const joursTravailles = presenceRows.filter(p => p.statut === 'PRESENT' || p.statut === 'LATE').length;
      const heuresNormales = presenceRows.reduce((sum, p) => sum + (p.heuresTravaillees || 0), 0);
      const heuresSupplementaires = presenceRows.reduce((sum, p) => sum + (p.heuresSupplementaires || 0), 0);

      if (presenceRows.length > 0) {
        heuresTravaillees = { joursTravailles, heuresNormales, heuresSupplementaires };
      }
    }

    // Fetch payment fee info from salary_payment_jobs (if paid via MM)
    let paymentFee: { feeOption: string | null; feeAmount: string | null; montantNet: string | null } | null = null;
    const [paymentJob] = await db.select({
      feeOption: salaryPaymentJobs.feeOption,
      feeAmount: salaryPaymentJobs.feeAmount,
      montantNet: salaryPaymentJobs.montantNet,
    }).from(salaryPaymentJobs)
      .where(and(
        eq(salaryPaymentJobs.bulletinId, bulletinId),
        eq(salaryPaymentJobs.status, 'SUCCEEDED'),
      ))
      .limit(1);
    if (paymentJob && paymentJob.feeAmount && Number(paymentJob.feeAmount) > 0) {
      paymentFee = paymentJob;
    }

    res.json({
      bulletin,
      lines,
      paymentFee,
      employe: employeData ? {
        id: employeData.employe.id,
        matricule: employeData.employe.matricule,
        numeroCnss: employeData.employe.numeroCnss,
        dateEmbauche: employeData.employe.dateEmbauche,
        dateSortie: employeData.employe.dateSortie || null,
        typeContrat: employeData.employe.typeContrat,
        categorie: employeData.employe.categorie || null,
        coefficient: employeData.employe.coefficient || null,
        paymentMethod: employeData.employe.paymentMethod || 'CASH',
        paymentDetails: employeData.employe.paymentDetails || null,
        nom: employeData.user.nom,
        prenom: employeData.user.prenom,
        jobTitle,
        anciennete,
        conventionCollective,
      } : null,
      company: settings ? {
        appName: settings.appName,
        adresse: settings.adresse,
        telephone: settings.telephone,
        niu: settings.niu || null,
        cnssMembership: settings.cnssMembership || null,
        rccm: settings.rccm || null,
        logoUrl: settings.logoUrl || null,
      } : null,
      agence: agence ? {
        nom: agence.nom,
        adresse: agence.adresse,
        telephone: agence.telephone,
      } : null,
      leaves,
      heuresTravaillees,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération bulletin détaillé');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/hr/paie/generate - Générer un run de paie pour un mois
hrRouter.post("/paie/generate", getAuthUser, attachAbility, requireAbility(Actions.GENERATE, Subjects.PAIE), async (req, res) => {
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

// GET /api/hr/paie/config - Configuration de la paie
hrRouter.get("/paie/config", getAuthUser, async (req, res) => {
  try {
    const agenceId = req.user?.agenceId;
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
hrRouter.put("/paie/config", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
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

    // Broadcast update
    broadcastHrUpdate({ entity: 'paie', action: existing ? 'updated' : 'created', id: result.id });

    res.json(successResponse(result));
  } catch (error) {
    logger.error({ err: error }, 'Erreur mise à jour config paie');
    res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
  }
});

// PATCH /api/hr/paie/validate - Valider un run de paie (DRAFT → VALIDATED + GL engagement)
hrRouter.patch("/paie/validate", getAuthUser, attachAbility, requireAbility(Actions.APPROVE, Subjects.PAIE), async (req, res) => {
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

// PATCH /api/hr/paie/pay - Payer un run de paie (VALIDATED → PENDING/PROCESSING via salary_payment_jobs)
hrRouter.patch("/paie/pay", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.PAIE), async (req, res) => {
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
        phone: employes.phone,
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
    const { createPaymentJobs, processQueuedJob, getJobsByRunId } = await import("../services/salary-payment-service");

    const jobsResult = await createPaymentJobs({
      runId,
      bulletins: allBulletins.map(b => ({
        bulletinId: b.bulletin.id,
        employeId: b.bulletin.employeId,
        paymentMethod: b.paymentMethod || "CASH",
        salaireNet: Number(b.bulletin.salaireNet),
        employeNom: b.employeNom || undefined,
        employePrenom: b.employePrenom || undefined,
        msisdn: b.phone || undefined,
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

// POST /api/hr/paie/schedule - Programmer un paiement batch pour une date future
hrRouter.post("/paie/schedule", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.PAIE), async (req, res) => {
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
        phone: employes.phone,
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
        msisdn: b.phone || undefined,
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
      undefined, 'medium'
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

// PATCH /api/hr/paie/confirm-payment - Confirmation manuelle (TRANSFER/CHECK)
hrRouter.patch("/paie/confirm-payment", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.PAIE), async (req, res) => {
  try {
    const { jobIds, reference } = req.body;
    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json(errorResponse('VALIDATION_ERROR', 'jobIds requis (tableau non vide)'));
    }

    const userId = req.user?.id || "system";
    const { confirmManualPayment } = await import("../services/salary-payment-service");
    const result = await confirmManualPayment(jobIds, userId, reference);

    res.json(successResponse(result));
  } catch (error) {
    logger.error({ err: error }, 'Erreur confirmation paiement');
    res.status(500).json(errorResponse('SERVER_ERROR', error instanceof Error ? error.message : 'Erreur serveur'));
  }
});

// PATCH /api/hr/paie/retry-payment - Relance d'un job FAILED
hrRouter.patch("/paie/retry-payment", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.PAIE), async (req, res) => {
  try {
    const { jobIds } = req.body;
    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json(errorResponse('VALIDATION_ERROR', 'jobIds requis'));
    }

    const userId = req.user?.id || "system";
    const { retryJobs } = await import("../services/salary-payment-service");
    const result = await retryJobs(jobIds, userId);

    res.json(successResponse(result));
  } catch (error) {
    logger.error({ err: error }, 'Erreur retry paiement');
    res.status(500).json(errorResponse('SERVER_ERROR', error instanceof Error ? error.message : 'Erreur serveur'));
  }
});

// PATCH /api/hr/paie/cancel-payment - Annulation d'un job
hrRouter.patch("/paie/cancel-payment", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.PAIE), async (req, res) => {
  try {
    const { jobIds } = req.body;
    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json(errorResponse('VALIDATION_ERROR', 'jobIds requis'));
    }

    const userId = req.user?.id || "system";
    const { cancelJobs } = await import("../services/salary-payment-service");
    const result = await cancelJobs(jobIds, userId);

    res.json(successResponse(result));
  } catch (error) {
    logger.error({ err: error }, 'Erreur annulation paiement');
    res.status(500).json(errorResponse('SERVER_ERROR', error instanceof Error ? error.message : 'Erreur serveur'));
  }
});

// GET /api/hr/paie/payment-jobs/:runId - Liste les jobs de paiement d'un run
hrRouter.get("/paie/payment-jobs/:runId", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.PAIE), async (req, res) => {
  try {
    const runId = parseInt(req.params.runId);
    if (isNaN(runId)) {
      return res.status(400).json(errorResponse('VALIDATION_ERROR', 'runId invalide'));
    }

    const { getJobsByRunId } = await import("../services/salary-payment-service");
    const jobs = await getJobsByRunId(runId);

    res.json(successResponse({ jobs }));
  } catch (error) {
    logger.error({ err: error }, 'Erreur lecture payment jobs');
    res.status(500).json(errorResponse('SERVER_ERROR', error instanceof Error ? error.message : 'Erreur serveur'));
  }
});

// GET /api/hr/paie/runs - Lister les runs de paie
hrRouter.get("/paie/runs", getAuthUser, async (req: Request, res: Response) => {
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
hrRouter.get("/paie/runs/:id", getAuthUser, async (req: Request, res: Response) => {
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

// POST /api/hr/paie/rerun - Re-run: contrepasser + recalculer
hrRouter.post("/paie/rerun", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.PAIE), async (req: Request, res: Response) => {
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

// GET /api/hr/paie/my - Mes fiches de paie
hrRouter.get("/paie/my", getAuthUser, async (req, res) => {
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

// GET /api/hr/paie/diagnostic - Diagnostic paie pour l'utilisateur connecté
hrRouter.get("/paie/diagnostic", getAuthUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: "Non authentifié" });

        const diagnostic: Record<string, any> = {
            userId,
            userName: req.user?.nom,
            userAgenceId: req.user?.agenceId,
        };

        // 1. Vérifier si l'utilisateur a un profil employé
        const employe = await storage.getEmployeByUserId(userId);
        if (!employe) {
            diagnostic.employe = null;
            diagnostic.probleme = 'AUCUN_PROFIL_EMPLOYE';
            diagnostic.explication = "Cet utilisateur n'a pas de fiche dans la table 'employes'. La paie ne peut pas être générée ni consultée.";
            return res.json(diagnostic);
        }

        diagnostic.employe = {
            id: employe.id,
            statut: employe.statut,
            agenceId: employe.agenceId,
            salaireBase: employe.salaireBase,
            modeCalculPaie: employe.modeCalculPaie,
        };

        // 2. Vérifier le statut
        if (employe.statut !== 'ACTIVE') {
            diagnostic.probleme = 'STATUT_NON_ACTIF';
            diagnostic.explication = `Le statut de l'employé est '${employe.statut}'. Seuls les employés avec statut 'ACTIVE' sont inclus dans la génération de paie.`;
        }

        // 3. Vérifier les bulletins existants
        const bulletins = await storage.getBulletins(employe.id);
        diagnostic.bulletinsCount = bulletins.length;
        diagnostic.bulletins = bulletins.map((b: any) => ({
            id: b.id,
            mois: b.mois,
            statut: b.statut,
            salaireNet: b.salaireNet,
        }));

        // 4. Vérifier la correspondance d'agence avec la config paie
        if (employe.agenceId) {
            const [configAgence] = await db
                .select()
                .from(payrollConfig)
                .where(eq(payrollConfig.agenceId, employe.agenceId))
                .limit(1);
            diagnostic.configPaieAgence = configAgence ? 'OK' : 'MANQUANTE';
            if (!configAgence) {
                diagnostic.probleme = diagnostic.probleme || 'CONFIG_PAIE_MANQUANTE';
                diagnostic.explication = (diagnostic.explication || '') + ` Aucune configuration paie trouvée pour l'agence ${employe.agenceId}.`;
            }
        } else {
            diagnostic.probleme = diagnostic.probleme || 'AGENCE_MANQUANTE';
            diagnostic.explication = (diagnostic.explication || '') + " L'employé n'a pas d'agence assignée (agenceId null). Il sera exclu si le générateur filtre par agence.";
        }

        if (!diagnostic.probleme && bulletins.length === 0) {
            diagnostic.probleme = 'AUCUN_BULLETIN';
            diagnostic.explication = "Le profil employé est correct et actif, mais aucun bulletin n'a été généré. Vérifiez que la génération de paie a été lancée pour l'agence de cet employé.";
        }

        if (!diagnostic.probleme) {
            diagnostic.probleme = null;
            diagnostic.explication = 'Tout semble correct. Les bulletins sont disponibles.';
        }

        res.json(diagnostic);
    } catch (error) {
        logger.error({ err: error }, 'Erreur diagnostic paie');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/bulletins - Archiver un bulletin de paie
hrRouter.post("/bulletins", getAuthUser, async (req, res) => {
  try {
    const {
      employeId,
      employeNom,
      mois,
      salaireBase,
      primeAnciennete,
      primeTransport,
      primeRendement,
      autresPrimes,
      salaireBrut,
      cnssEmploye,
      ipr,
      autresRetenues,
      totalRetenues,
      salaireNet,
      cnssPatronale,
      pdfUrl,
      pdfHash
    } = req.body;

    const userId = req.user?.id;

    if (!employeId || !mois || !salaireBase || !salaireBrut || !salaireNet) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    // Vérifier si bulletin existe déjà pour ce mois
    const existing = await db.select()
      .from(bulletinsPaie)
      .where(and(
        eq(bulletinsPaie.employeId, employeId),
        eq(bulletinsPaie.mois, mois)
      ));

    if (existing.length > 0) {
      return res.status(409).json({ error: "Bulletin déjà existant pour ce mois" });
    }

    const [newBulletin] = await db.insert(bulletinsPaie).values({
      employeId,
      employeNom,
      mois,
      salaireBaseSnapshot: parseInt(salaireBase) || 0,
      salaireBrut,
      totalRetenues,
      salaireNet,
      irpp: ipr || "0",
      totalChargesSalariales: cnssEmploye || "0",
      totalChargesPatronales: cnssPatronale || "0",
      pdfUrl,
      pdfHash,
      genereParId: userId,
      statut: StatutArchive.VALIDATED // Directement validé si archivé manuellement
    }).returning();

    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'bulletin_archived', id: newBulletin.id } });
    }

    res.status(201).json(newBulletin);
  } catch (error) {
    logger.error({ err: error }, 'Erreur archivage bulletin');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/**
 * ========================================
 * STATISTIQUES RH
 * ========================================
 */

// GET /api/hr/stats - Statistiques globales RH
hrRouter.get("/stats", getAuthUser, async (req, res) => {
  try {
    const stats = await storage.getHrStats();

    // Add additional stats for the new features
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().toISOString().slice(0, 7);

    // Leave stats
    const [leaveStats] = await db
      .select({
        pending: sql<number>`COUNT(*) FILTER (WHERE statut = 'PENDING')::int`,
        approved: sql<number>`COUNT(*) FILTER (WHERE statut = 'APPROVED')::int`,
        rejected: sql<number>`COUNT(*) FILTER (WHERE statut = 'REJECTED')::int`,
      })
      .from(demandesConges)
      .where(
        sql`EXTRACT(YEAR FROM date_debut) = ${currentYear}`
      );

    // Payroll stats for current month
    const [payrollStats] = await db
      .select({
        draft: sql<number>`COUNT(*) FILTER (WHERE statut = 'DRAFT')::int`,
        validated: sql<number>`COUNT(*) FILTER (WHERE statut = 'VALIDATED')::int`,
        paid: sql<number>`COUNT(*) FILTER (WHERE statut = 'PAID')::int`,
        totalNet: sql<number>`COALESCE(SUM(salaire_net::numeric) FILTER (WHERE statut = 'PAID'), 0)::int`,
      })
      .from(bulletinsPaie)
      .where(eq(bulletinsPaie.mois, currentMonth));

    res.json(successResponse({
      ...stats,
      leaves: leaveStats,
      payroll: {
        ...payrollStats,
        month: currentMonth,
      },
    }));
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération stats RH');
    res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
  }
});

/**
 * ========================================
 * AUDIT LOG RH
 * ========================================
 */

// GET /api/hr/audit - Historique des actions RH
hrRouter.get("/audit", getAuthUser, async (req, res) => {
  try {
    const { entityType, entityId, limit = '50', page = '1' } = req.query;
    const userRole = req.user?.role;

    // Only admins, RH, and direction can view audit logs
    const allowedRoles = ['admin', 'Administrateur', 'rh', 'direction', 'pdg', 'dg'];
    if (!roleIn(userRole, allowedRoles)) {
      return res.status(403).json(errorResponse('FORBIDDEN', 'Non autorisé à consulter l\'audit'));
    }

    const limitNum = Math.min(100, parseInt(limit as string) || 50);
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const offset = (pageNum - 1) * limitNum;

    const logs = await hrService.getAuditLog(
      entityType as string | undefined,
      entityId as string | undefined,
      limitNum
    );

    res.json(successResponse(logs, {
      page: pageNum,
      limit: limitNum,
    }));
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération audit RH');
    res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
  }
});

/**
 * ========================================
 * AVANTAGES
 * ========================================
 */

// GET /api/hr/avantages - Liste des avantages disponibles
hrRouter.get("/avantages", getAuthUser, async (req, res) => {
    try {
        const avantagesList = await storage.getAllAvantages();
        res.json(avantagesList);
    } catch (error) {
        logger.error({ err: error }, 'Erreur récupération avantages');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/avantages/employe/:id - Avantages d'un employé
hrRouter.get("/avantages/employe/:id", getAuthUser, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await storage.getAvantagesEmploye(id);
        res.json(result);
    } catch (error) {
        logger.error({ err: error }, 'Erreur récupération avantages employé');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/avantages/assign - Assigner un avantage
hrRouter.post("/avantages/assign", getAuthUser, async (req, res) => {
    try {
        const { employeId, avantageId, montant } = req.body;
        if (!employeId || !avantageId || !montant) {
            return res.status(400).json({ error: "Champs manquants" });
        }

        // Check permissions later
        const result = await storage.assignAvantage({
            employeId,
            avantageId: parseInt(avantageId),
            montant: parseInt(montant),
            statut: StatutUser.ACTIVE,
            dateAttribution: new Date().toISOString().split('T')[0]
        });
        // Broadcast HR Update
        const wsInstance = getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'avantage_assigned', employeId } });
        }

        res.status(201).json(result);
    } catch (error) {
        logger.error({ err: error }, 'Erreur assignation avantage');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/avantages - Créer un avantage
hrRouter.post("/avantages", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        const {
            nom, type, montantParDefaut, description, eligibleContrats,
            modeCalcul, pourcentage, plafond, frequence, dateDebut, dateFin,
            imposable, soumisCnss, autoAttribution, categorie
        } = req.body;
        if (!nom || !type) {
            return res.status(400).json({ error: "Nom et type requis" });
        }

        const [created] = await db.insert(avantages).values({
            nom,
            type,
            montantParDefaut: montantParDefaut ? parseInt(montantParDefaut) : 0,
            description: description || null,
            eligibleContrats: eligibleContrats || null,
            modeCalcul: modeCalcul || 'FIXE',
            pourcentage: pourcentage != null ? String(pourcentage) : null,
            plafond: plafond ? parseInt(plafond) : null,
            frequence: frequence || 'MENSUEL',
            dateDebut: dateDebut || null,
            dateFin: dateFin || null,
            imposable: imposable !== undefined ? imposable : true,
            soumisCnss: soumisCnss !== undefined ? soumisCnss : true,
            autoAttribution: autoAttribution || false,
            categorie: categorie || 'AUTRE',
            actif: true,
        }).returning();

        const wsInstance = getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "HR_UPDATE", payload: { entity: 'avantage', action: 'created', id: created.id } });
        }

        res.status(201).json(created);
    } catch (error) {
        logger.error({ err: error }, 'Erreur création avantage');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PATCH /api/hr/avantages/:id - Modifier un avantage
hrRouter.patch("/avantages/:id", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        const avantageId = parseInt(req.params.id);
        const {
            nom, type, montantParDefaut, description, eligibleContrats,
            modeCalcul, pourcentage, plafond, frequence, dateDebut, dateFin,
            imposable, soumisCnss, autoAttribution, categorie
        } = req.body;

        const updates: Record<string, any> = {};
        if (nom !== undefined) updates.nom = nom;
        if (type !== undefined) updates.type = type;
        if (montantParDefaut !== undefined) updates.montantParDefaut = parseInt(montantParDefaut);
        if (description !== undefined) updates.description = description;
        if (eligibleContrats !== undefined) updates.eligibleContrats = eligibleContrats;
        if (modeCalcul !== undefined) updates.modeCalcul = modeCalcul;
        if (pourcentage !== undefined) updates.pourcentage = pourcentage != null ? String(pourcentage) : null;
        if (plafond !== undefined) updates.plafond = plafond ? parseInt(plafond) : null;
        if (frequence !== undefined) updates.frequence = frequence;
        if (dateDebut !== undefined) updates.dateDebut = dateDebut || null;
        if (dateFin !== undefined) updates.dateFin = dateFin || null;
        if (imposable !== undefined) updates.imposable = imposable;
        if (soumisCnss !== undefined) updates.soumisCnss = soumisCnss;
        if (autoAttribution !== undefined) updates.autoAttribution = autoAttribution;
        if (categorie !== undefined) updates.categorie = categorie;

        const [updated] = await db.update(avantages)
            .set(updates)
            .where(eq(avantages.id, avantageId))
            .returning();

        if (!updated) return res.status(404).json({ error: "Avantage non trouvé" });

        res.json(updated);
    } catch (error) {
        logger.error({ err: error }, 'Erreur mise à jour avantage');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// DELETE /api/hr/avantages/:id - Soft-delete un avantage
hrRouter.delete("/avantages/:id", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        const avantageId = parseInt(req.params.id);

        const [deleted] = await db.update(avantages)
            .set({ actif: false, deletedAt: new Date() })
            .where(eq(avantages.id, avantageId))
            .returning();

        if (!deleted) return res.status(404).json({ error: "Avantage non trouvé" });

        res.json({ message: "Avantage supprimé" });
    } catch (error) {
        logger.error({ err: error }, 'Erreur suppression avantage');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

/**
 * ========================================
 * PRESENCE
 * ========================================
 */

// GET /api/hr/presence/today - Stats présence aujourd'hui
hrRouter.get("/presence/today", getAuthUser, async (req, res) => {
    try {
        const stats = await storage.getPresenceAujourdhui();
        res.json(stats);
    } catch (error) {
        logger.error({ err: error }, 'Erreur récupération présence');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/presence/checkin - Pointage Arrivée (avec GPS optionnel)
hrRouter.post("/presence/checkin", getAuthUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: "Non authentifié" });

        // Résoudre l'employeId à partir du userId
        const employe = await storage.getEmployeByUserId(userId);
        if (!employe) {
            return res.status(404).json({ error: "Profil employé non trouvé pour cet utilisateur" });
        }

        // Extract and validate GPS data from request body (optional)
        const { latitude, longitude, accuracy, gpsSource } = req.body || {};
        let gps: { latitude: number; longitude: number; accuracy?: number | null; gpsSource: string } | undefined;

        if (latitude != null || longitude != null) {
          const lat = Number(latitude);
          const lng = Number(longitude);
          const acc = accuracy != null ? Number(accuracy) : null;

          // Basic coordinate validation
          if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return res.status(400).json({ error: "Coordonnées GPS invalides" });
          }

          // Reject Null Island (0,0) — common GPS spoofing indicator
          if (lat === 0 && lng === 0) {
            return res.status(400).json({ error: "Position GPS non disponible (0,0)" });
          }

          // Reject if accuracy is too poor (> 500m)
          if (acc != null && acc > 500) {
            return res.status(400).json({
              error: "Précision GPS insuffisante",
              details: { accuracy: acc, maxAccuracy: 500 },
            });
          }

          gps = { latitude: lat, longitude: lng, accuracy: acc, gpsSource: gpsSource || "gps" };
        }

        const result = await storage.checkIn(employe.id, gps);
        res.json(result);
    } catch (error) {
        logger.error({ err: error }, 'Erreur pointage');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/presence/checkout - Pointage Départ
hrRouter.post("/presence/checkout", getAuthUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: "Non authentifié" });

        // Résoudre l'employeId à partir du userId
        const employe = await storage.getEmployeByUserId(userId);
        if (!employe) {
            return res.status(404).json({ error: "Profil employé non trouvé pour cet utilisateur" });
        }

        const result = await storage.checkOut(employe.id);
        if (!result) return res.status(422).json({ error: "Aucun pointage d'arrivée trouvé pour aujourd'hui" });

        // WebSocket: Notify presence update
        const wsInstance = getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "PRESENCE_UPDATE", payload: { employeId: employe.id } });
        }

        res.json(result);
    } catch (error) {
        logger.error({ err: error }, 'Erreur pointage départ');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/presence/start-break - Début pause
hrRouter.post("/presence/start-break", getAuthUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: "Non authentifié" });

        // Résoudre l'employeId à partir du userId
        const employe = await storage.getEmployeByUserId(userId);
        if (!employe) {
            return res.status(404).json({ error: "Profil employé non trouvé pour cet utilisateur" });
        }

        const result = await storage.startBreak(employe.id);
        if (!result) return res.status(422).json({ error: "Aucun pointage d'arrivée trouvé" });

        // WebSocket: Notify presence update
        const wsInstance = getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "PRESENCE_UPDATE", payload: { employeId: employe.id } });
        }

        res.json(result);
    } catch (error) {
        logger.error({ err: error }, 'Erreur début pause');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/presence/end-break - Fin pause
hrRouter.post("/presence/end-break", getAuthUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: "Non authentifié" });

        // Résoudre l'employeId à partir du userId
        const employe = await storage.getEmployeByUserId(userId);
        if (!employe) {
            return res.status(404).json({ error: "Profil employé non trouvé pour cet utilisateur" });
        }

        const result = await storage.endBreak(employe.id);
        if (!result) return res.status(422).json({ error: "Aucune pause en cours" });

        // WebSocket: Notify presence update
        const wsInstance = getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "PRESENCE_UPDATE", payload: { employeId: employe.id } });
        }

        res.json(result);
    } catch (error) {
        logger.error({ err: error }, 'Erreur fin pause');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/presence/manual - Pointage manuel par un ayant droit
hrRouter.post("/presence/manual", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        const { employeId, date, heureArrivee, heureDepart, pauseDebut, pauseFin, commentaire } = req.body;

        if (!employeId || !heureArrivee) {
            return res.status(400).json({ error: "employeId et heureArrivee sont requis" });
        }

        // Validate time format HH:MM
        const timeRegex = /^\d{2}:\d{2}$/;
        if (!timeRegex.test(heureArrivee)) {
            return res.status(400).json({ error: "Format d'heure invalide (attendu HH:MM)" });
        }
        for (const field of [heureDepart, pauseDebut, pauseFin]) {
            if (field && !timeRegex.test(field)) {
                return res.status(400).json({ error: "Format d'heure invalide (attendu HH:MM)" });
            }
        }

        const targetDate = date || new Date().toISOString().split('T')[0];

        const result = await storage.manualPresenceEntry({
            employeId,
            date: targetDate,
            heureArrivee,
            heureDepart,
            pauseDebut,
            pauseFin,
            commentaire,
        });

        // WebSocket: Notify presence update
        const wsInstance = getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "PRESENCE_UPDATE", payload: { employeId } });
        }

        res.json(result);
    } catch (error) {
        logger.error({ err: error }, 'Erreur pointage manuel');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/presence/by-status/:status - Liste employés par statut
hrRouter.get("/presence/by-status/:status", getAuthUser, async (req, res) => {
    try {
        const { status } = req.params;
        const today = new Date().toISOString().split('T')[0];

        const presencesList = await db.select({
            presence: presences,
            user: users
        })
        .from(presences)
        .innerJoin(employes, eq(presences.employeId, employes.id))
        .innerJoin(users, eq(employes.userId, users.id))
        .where(and(
            eq(presences.date, today),
            eq(presences.statut, status)
        ));

        res.json(presencesList.map(p => ({
            ...p.user,
            heureArrivee: p.presence.heureArrivee,
            heureDepart: p.presence.heureDepart,
            heuresTravaillees: p.presence.heuresTravaillees
        })));
    } catch (error) {
        logger.error({ err: error }, 'Erreur récupération employés par statut');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/attendance/analytics/:employeId - Statistiques de présence étendues
hrRouter.get("/attendance/analytics/:employeId", getAuthUser, async (req, res) => {
  try {
    const { employeId } = req.params;
    const { year, month } = req.query;

    const targetYear = year ? parseInt(year as string) : new Date().getFullYear();
    const targetMonth = month ? parseInt(month as string) : undefined;

    // Construire la plage de dates
    let startDate: string;
    let endDate: string;

    if (targetMonth) {
      startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
      const lastDay = new Date(targetYear, targetMonth, 0).getDate();
      endDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${lastDay}`;
    } else {
      startDate = `${targetYear}-01-01`;
      endDate = `${targetYear}-12-31`;
    }

    // Récupérer toutes les présences dans la période
    const presenceRecords = await db.select()
      .from(presences)
      .where(and(
        eq(presences.employeId, employeId),
        gte(presences.date, startDate),
        lte(presences.date, endDate)
      ))
      .orderBy(presences.date);

    // Calculer les statistiques
    let totalDays = 0;
    let presentDays = 0;
    let absentDays = 0;
    let lateDays = 0;
    let totalHoursWorked = 0;
    let totalOvertimeHours = 0;

    const monthlyStats: Record<string, {
      present: number;
      absent: number;
      late: number;
      hoursWorked: number;
    }> = {};

    const dailyData: Array<{
      date: string;
      status: string;
      heureArrivee?: string;
      heureDepart?: string;
      heuresTravaillees?: number;
    }> = [];

    for (const record of presenceRecords) {
      totalDays++;
      const hours = Number(record.heuresTravaillees) || 0;
      totalHoursWorked += hours;

      const monthKey = record.date.substring(0, 7);
      if (!monthlyStats[monthKey]) {
        monthlyStats[monthKey] = { present: 0, absent: 0, late: 0, hoursWorked: 0 };
      }

      if (record.statut === 'PRESENT' || record.statut === 'ON_BREAK' || record.statut === 'CLOCKED_OUT') {
        presentDays++;
        monthlyStats[monthKey].present++;
        monthlyStats[monthKey].hoursWorked += hours;

        // Vérifier si en retard (arrivée après 8h30)
        if (record.heureArrivee) {
          const arrivalTime = new Date(record.heureArrivee);
          const arrivalHour = arrivalTime.getHours();
          const arrivalMinute = arrivalTime.getMinutes();
          if (arrivalHour > 8 || (arrivalHour === 8 && arrivalMinute > 30)) {
            lateDays++;
            monthlyStats[monthKey].late++;
          }
        }

        // Heures supplémentaires (au-delà de 8h)
        if (hours > 8) {
          totalOvertimeHours += hours - 8;
        }
      } else if (record.statut === 'ABSENT') {
        absentDays++;
        monthlyStats[monthKey].absent++;
      }

      dailyData.push({
        date: record.date,
        status: record.statut || 'UNKNOWN',
        heureArrivee: record.heureArrivee ? record.heureArrivee.toISOString() : undefined,
        heureDepart: record.heureDepart ? record.heureDepart.toISOString() : undefined,
        heuresTravaillees: hours,
      });
    }

    // Calculer le taux de présence
    const attendanceRate = totalDays > 0 ? (presentDays / totalDays) * 100 : 0;
    const avgHoursPerDay = presentDays > 0 ? totalHoursWorked / presentDays : 0;

    res.json({
      employeId,
      period: { year: targetYear, month: targetMonth },
      summary: {
        totalDays,
        presentDays,
        absentDays,
        lateDays,
        attendanceRate: Math.round(attendanceRate * 100) / 100,
        totalHoursWorked: Math.round(totalHoursWorked * 100) / 100,
        avgHoursPerDay: Math.round(avgHoursPerDay * 100) / 100,
        overtimeHours: Math.round(totalOvertimeHours * 100) / 100,
      },
      monthlyBreakdown: monthlyStats,
      dailyData,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération analytics présence');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/hr/attendance/export/:employeId - Export des données de présence
hrRouter.get("/attendance/export/:employeId", getAuthUser, async (req, res) => {
  try {
    const { employeId } = req.params;
    const { year, month, format } = req.query;

    const targetYear = year ? parseInt(year as string) : new Date().getFullYear();
    const targetMonth = month ? parseInt(month as string) : undefined;

    let startDate: string;
    let endDate: string;

    if (targetMonth) {
      startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
      const lastDay = new Date(targetYear, targetMonth, 0).getDate();
      endDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${lastDay}`;
    } else {
      startDate = `${targetYear}-01-01`;
      endDate = `${targetYear}-12-31`;
    }

    // Récupérer l'employé avec les infos utilisateur
    const [employeResult] = await db.select({
      employe: employes,
      nom: users.nom,
      prenom: users.prenom,
    })
      .from(employes)
      .leftJoin(users, eq(employes.userId, users.id))
      .where(eq(employes.id, employeId))
      .limit(1);

    if (!employeResult) {
      return res.status(404).json({ error: "Employé non trouvé" });
    }

    const employeNom = employeResult.nom || 'Inconnu';
    const employePrenom = employeResult.prenom || '';

    // Récupérer les présences
    const records = await db.select()
      .from(presences)
      .where(and(
        eq(presences.employeId, employeId),
        gte(presences.date, startDate),
        lte(presences.date, endDate)
      ))
      .orderBy(presences.date);

    if (format === 'csv') {
      const header = 'Date,Statut,Heure Arrivée,Heure Départ,Heures Travaillées,Observations\n';
      const rows = records.map(r =>
        `${r.date},${r.statut},${r.heureArrivee || ''},${r.heureDepart || ''},${r.heuresTravaillees || ''},${r.commentaire || ''}`
      ).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=presence_${employeNom}_${targetYear}${targetMonth || ''}.csv`);
      return res.send(header + rows);
    }

    res.json({
      employe: { id: employeResult.employe.id, nom: employeNom, prenom: employePrenom },
      period: { year: targetYear, month: targetMonth },
      records,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erreur export présence');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/**
 * ========================================
 * ORGANIGRAMME
 * ========================================
 */

// GET /api/hr/organigramme - Structure hiérarchique
hrRouter.get("/organigramme", getAuthUser, async (req, res) => {
    try {
        const agenceId = req.user?.agenceId || undefined; // Filter by user's agency
        const orgChart = await storage.getOrganigramme(agenceId);
        res.json(orgChart);
    } catch (error) {
        logger.error({ err: error }, 'Erreur récupération organigramme');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PATCH /api/hr/organigramme/reassign - Drag-drop: change employee's manager
hrRouter.patch("/organigramme/reassign", getAuthUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        const userRole = normalizeRole(req.user?.role);
        if (!roleIn(userRole, ['admin', 'rh', 'direction'])) {
            return res.status(403).json({ error: "Non autorisé à modifier la hiérarchie" });
        }

        const schema = z.object({
            employeId: z.string().uuid(),
            newManagerId: z.string().uuid().nullable(),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: "Données invalides", details: parsed.error.flatten() });
        }

        const { employeId, newManagerId } = parsed.data;

        // Prevent self-assignment
        if (employeId === newManagerId) {
            return res.status(400).json({ error: "Un employé ne peut pas être son propre manager" });
        }

        // Prevent circular hierarchy: walk up from newManagerId to ensure employeId isn't an ancestor
        if (newManagerId) {
            let currentId: string | null = newManagerId;
            const visited = new Set<string>();
            while (currentId) {
                if (currentId === employeId) {
                    return res.status(400).json({ error: "Affectation circulaire détectée. Cet employé est déjà un supérieur du manager cible." });
                }
                if (visited.has(currentId)) break;
                visited.add(currentId);
                const [emp] = await db.select({ managerId: employes.managerId }).from(employes).where(eq(employes.id, currentId));
                currentId = emp?.managerId || null;
            }
        }

        await storage.updateEmploye(employeId, { managerId: newManagerId });

        // Audit log
        await db.insert(hrAuditLog).values({
            action: 'reassigned',
            entityType: 'employe',
            entityId: employeId,
            actorUserId: userId!,
            actorName: req.user?.nom || '',
            actorRole: userRole || '',
            newValues: { managerId: newManagerId },
        });

        broadcastHrUpdate(
            { entity: 'organigramme', action: 'updated', id: employeId, extra: { newManagerId } },
            { id: userId!, name: req.user?.nom || '' }
        );

        res.json({ success: true });
    } catch (error) {
        logger.error({ err: error }, 'Erreur reassign organigramme');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

/**
 * ========================================
 * HORAIRES DE TRAVAIL
 * ========================================
 */

// GET /api/hr/horaires/:employeId - Horaires d'un employé
hrRouter.get("/horaires/:employeId", getAuthUser, async (req, res) => {
    try {
        const { employeId } = req.params;
        const horaires = await db.select().from(horairesTravail)
            .where(and(eq(horairesTravail.employeId, employeId), eq(horairesTravail.actif, true)));
        res.json(horaires);
    } catch (error) {
        logger.error({ err: error }, 'Erreur récupération horaires');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/horaires - Créer un horaire
hrRouter.post("/horaires", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.HORAIRE), async (req, res) => {
    try {
        const { employeId, jourSemaine, heureDebut, heureFin, pauseMinutes } = req.body;
        if (!employeId || jourSemaine === undefined || !heureDebut || !heureFin) {
            return res.status(400).json({ error: "Champs manquants" });
        }

        const [horaire] = await db.insert(horairesTravail).values({
            employeId,
            jourSemaine,
            heureDebut,
            heureFin,
            pauseMinutes: pauseMinutes || 60
        }).returning();

        res.status(201).json(horaire);
    } catch (error) {
        logger.error({ err: error }, 'Erreur création horaire');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// DELETE /api/hr/horaires/:id - Supprimer un horaire
hrRouter.delete("/horaires/:id", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.HORAIRE), async (req, res) => {
    try {
        const { id } = req.params;
        await db.update(horairesTravail)
            .set({ actif: false })
            .where(eq(horairesTravail.id, parseInt(id)));
        res.json({ message: "Horaire supprimé" });
    } catch (error) {
        logger.error({ err: error }, 'Erreur suppression horaire');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

/**
 * ========================================
 * SHIFT TEMPLATES (Modèles d'horaires)
 * ========================================
 */

// GET /api/hr/shift-templates - Liste des modèles d'horaires
hrRouter.get("/shift-templates", getAuthUser, async (req, res) => {
    try {
        const { agenceId } = req.query;
        let query = db.select().from(shiftTemplates);

        if (agenceId) {
            query = query.where(eq(shiftTemplates.agenceId, agenceId as string)) as any;
        }

        const templates = await query.orderBy(desc(shiftTemplates.createdAt));
        res.json(templates);
    } catch (error) {
        logger.error({ err: error }, 'Erreur récupération shift templates');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/shift-templates - Créer un modèle d'horaires
hrRouter.post("/shift-templates", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.HORAIRE), async (req, res) => {
    try {
        const { nom, description, agenceId, horaires, isDefault } = req.body;

        if (!nom || !horaires || !Array.isArray(horaires)) {
            return res.status(400).json({ error: "Nom et horaires requis" });
        }

        const userId = (req.user as any)?.id;

        // If setting as default, unset other defaults for this agency
        if (isDefault && agenceId) {
            await db.update(shiftTemplates)
                .set({ isDefault: false })
                .where(and(
                    eq(shiftTemplates.agenceId, agenceId),
                    eq(shiftTemplates.isDefault, true)
                ));
        }

        const [created] = await db.insert(shiftTemplates).values({
            nom,
            description,
            agenceId: agenceId || null,
            horaires,
            createdBy: userId,
            isDefault: isDefault || false,
        }).returning();

        res.status(201).json(created);
    } catch (error) {
        logger.error({ err: error }, 'Erreur création shift template');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/shift-templates/:id/apply/:employeId - Appliquer un modèle à un employé
hrRouter.post("/shift-templates/:id/apply/:employeId", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.HORAIRE), async (req, res) => {
    try {
        const { id, employeId } = req.params;

        // Get template
        const [template] = await db.select().from(shiftTemplates).where(eq(shiftTemplates.id, id));
        if (!template) {
            return res.status(404).json({ error: "Modèle non trouvé" });
        }

        // Deactivate existing schedules for this employee
        await db.update(horairesTravail)
            .set({ actif: false })
            .where(eq(horairesTravail.employeId, employeId));

        // Create new schedules from template
        const horaires = template.horaires as any[];
        const newSchedules = await Promise.all(
            horaires.map(h =>
                db.insert(horairesTravail).values({
                    employeId,
                    jourSemaine: h.jourSemaine,
                    heureDebut: h.heureDebut,
                    heureFin: h.heureFin,
                    pauseMinutes: h.pauseMinutes || 60,
                    actif: true,
                }).returning()
            )
        );

        res.json({
            message: "Modèle appliqué avec succès",
            schedulesCreated: newSchedules.flat()
        });
    } catch (error) {
        logger.error({ err: error }, 'Erreur application shift template');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// DELETE /api/hr/shift-templates/:id - Supprimer un modèle
hrRouter.delete("/shift-templates/:id", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.HORAIRE), async (req, res) => {
    try {
        const { id } = req.params;
        await db.delete(shiftTemplates).where(eq(shiftTemplates.id, id));
        res.json({ message: "Modèle supprimé" });
    } catch (error) {
        logger.error({ err: error }, 'Erreur suppression shift template');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

/**
 * ========================================
 * SALARY RATE HISTORY (Historique taux)
 * ========================================
 */

// GET /api/hr/salary-rates/history/:employeId - Historique des taux d'un employé
hrRouter.get("/salary-rates/history/:employeId", getAuthUser, async (req, res) => {
    try {
        const { employeId } = req.params;

        const history = await db.select({
            rate: salaryRateHistory,
            createdByName: sql<string>`(SELECT u.username FROM users u WHERE u.id = ${salaryRateHistory.createdBy})`,
        })
            .from(salaryRateHistory)
            .where(eq(salaryRateHistory.employeId, employeId))
            .orderBy(desc(salaryRateHistory.effectiveFrom));

        res.json(history.map(h => ({ ...h.rate, createdByName: h.createdByName })));
    } catch (error) {
        logger.error({ err: error }, 'Erreur récupération historique taux');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/salary-rates/change - Créer un changement de taux
hrRouter.post("/salary-rates/change", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        const { employeId, salaireBase, tauxHoraire, tauxJournalier, modeCalcul, effectiveFrom, motifChangement } = req.body;

        if (!employeId || !salaireBase || !effectiveFrom) {
            return res.status(400).json({ error: "employeId, salaireBase et effectiveFrom requis" });
        }

        const userId = (req.user as any)?.id;
        const effectiveDate = new Date(effectiveFrom);

        // Close the current rate (set effectiveTo to day before new rate)
        const prevDay = new Date(effectiveDate);
        prevDay.setDate(prevDay.getDate() - 1);

        await db.update(salaryRateHistory)
            .set({ effectiveTo: prevDay.toISOString().split('T')[0] })
            .where(and(
                eq(salaryRateHistory.employeId, employeId),
                isNull(salaryRateHistory.effectiveTo)
            ));

        // Create new rate record
        const [newRate] = await db.insert(salaryRateHistory).values({
            employeId,
            salaireBase: salaireBase.toString(),
            tauxHoraire: tauxHoraire?.toString() || null,
            tauxJournalier: tauxJournalier?.toString() || null,
            modeCalcul: modeCalcul || 'MONTHLY',
            effectiveFrom: effectiveFrom,
            effectiveTo: null,
            motifChangement,
            createdBy: userId,
        }).returning();

        // Also update the employee's current rates
        await db.update(employes)
            .set({
                salaireBase: parseInt(salaireBase),
                tauxHoraire: tauxHoraire ? parseInt(tauxHoraire) : null,
                tauxJournalier: tauxJournalier ? parseInt(tauxJournalier) : null,
                modeCalculPaie: modeCalcul || 'MONTHLY',
            })
            .where(eq(employes.id, employeId));

        // Broadcast update
        const wsInstance = getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "HR_UPDATE", payload: { entity: 'salary_rate', action: 'changed', employeId } });
        }

        res.status(201).json(newRate);
    } catch (error) {
        logger.error({ err: error }, 'Erreur création changement taux');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/salary-rates/current/:employeId - Taux actuel d'un employé
hrRouter.get("/salary-rates/current/:employeId", getAuthUser, async (req, res) => {
    try {
        const { employeId } = req.params;

        const [current] = await db.select()
            .from(salaryRateHistory)
            .where(and(
                eq(salaryRateHistory.employeId, employeId),
                isNull(salaryRateHistory.effectiveTo)
            ))
            .limit(1);

        res.json(current || null);
    } catch (error) {
        logger.error({ err: error }, 'Erreur récupération taux actuel');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

/**
 * ========================================
 * IMPORT CSV EMPLOYES
 * ========================================
 */

// POST /api/hr/import - Import employees from CSV file
hrRouter.post("/import", getAuthUser, csvUpload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "Aucun fichier CSV fourni" });
        }

        const csvContent = req.file.buffer.toString("utf-8");
        const { agenceId } = req.body || {};

        // Preview mode: parse and validate only
        if (req.query.preview === "true") {
            const { headers, rows } = parseCsv(csvContent);
            return res.json({
                headers,
                totalRows: rows.length,
                preview: rows.slice(0, 10), // First 10 rows
            });
        }

        // Full import
        const result = await importEmployees(csvContent, agenceId);

        // Broadcast HR update
        const wsInstance = getWsInstance();
        if (wsInstance && result.created > 0) {
            wsInstance.broadcast({
                type: "HR_UPDATE",
                payload: { entity: "employe", action: "created", extra: { count: result.created } },
            });
        }

        res.json(result);
    } catch (error) {
        logger.error({ err: error }, 'Erreur import CSV');
        res.status(500).json({ error: "Erreur lors de l'import" });
    }
});

// ============================================
// SALARY ADVANCES (Avances sur Salaire)
// ============================================

// GET /api/hr/avances - List salary advances (filtered by employee for non-RH)
hrRouter.get("/avances", getAuthUser, attachAbility, async (req, res) => {
    try {
        const user = req.user as any;
        const isRH = req.ability?.can(Actions.MANAGE, Subjects.RH);
        const { employeId, statut } = req.query;

        let conditions: any[] = [];

        // Non-RH users can only see their own advances
        if (!isRH && user.employeId) {
            conditions.push(eq(avancesSalaire.employeId, user.employeId));
        } else if (employeId) {
            conditions.push(eq(avancesSalaire.employeId, employeId as string));
        }

        if (statut) {
            conditions.push(eq(avancesSalaire.statut, statut as string));
        }

        const result = await db
            .select({
                avance: avancesSalaire,
                employeNom: sql<string>`COALESCE(${users.prenom} || ' ' || ${users.nom}, 'N/A')`,
                approuveParNom: sql<string>`(SELECT u2.username FROM users u2 WHERE u2.id = ${avancesSalaire.approuvePar})`,
            })
            .from(avancesSalaire)
            .leftJoin(employes, eq(avancesSalaire.employeId, employes.id))
            .leftJoin(users, eq(employes.userId, users.id))
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(avancesSalaire.dateDemande));

        const avances = result.map(r => ({
            ...r.avance,
            employeNom: r.employeNom,
            approuveParNom: r.approuveParNom,
        }));

        res.json(avances);
    } catch (error) {
        logger.error({ err: error }, 'Erreur liste avances');
        res.status(500).json({ error: "Erreur lors du chargement des avances" });
    }
});

// POST /api/hr/avances - Create a salary advance request
hrRouter.post("/avances", getAuthUser, attachAbility, async (req, res) => {
    try {
        const parsed = insertAvanceSalaireSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: "Données invalides", details: parsed.error.flatten() });
        }

        const [avance] = await db.insert(avancesSalaire).values({
            ...parsed.data,
            statut: StatutAvance.PENDING,
        }).returning();

        // Broadcast HR update
        broadcastHrEvent({
            entity: 'paie',
            action: 'created',
            id: avance.id,
            employeId: avance.employeId,
            extra: { type: 'avance', montant: avance.montant },
        });

        res.status(201).json(avance);
    } catch (error) {
        logger.error({ err: error }, 'Erreur création avance');
        res.status(500).json({ error: "Erreur lors de la création de l'avance" });
    }
});

// PATCH /api/hr/avances/:id/approve - Approve a salary advance
hrRouter.patch("/avances/:id/approve", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user as any;

        const [existing] = await db.select().from(avancesSalaire).where(eq(avancesSalaire.id, id));
        if (!existing) return res.status(404).json({ error: "Avance non trouvée" });
        if (existing.statut !== StatutAvance.PENDING) {
            return res.status(400).json({ error: `Impossible d'approuver une avance au statut ${existing.statut}` });
        }

        const [updated] = await db.update(avancesSalaire)
            .set({
                statut: StatutAvance.APPROVED,
                approuvePar: user.id,
                approuveAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(avancesSalaire.id, id))
            .returning();

        broadcastHrEvent({
            entity: 'paie',
            action: 'approved',
            id: updated.id,
            employeId: updated.employeId,
            extra: { type: 'avance', montant: updated.montant },
        });

        res.json(updated);
    } catch (error) {
        logger.error({ err: error }, 'Erreur approbation avance');
        res.status(500).json({ error: "Erreur lors de l'approbation" });
    }
});

// PATCH /api/hr/avances/:id/reject - Reject a salary advance
hrRouter.patch("/avances/:id/reject", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        const { id } = req.params;
        const { motif } = req.body;

        if (!motif) return res.status(400).json({ error: "Le motif de rejet est obligatoire" });

        const [existing] = await db.select().from(avancesSalaire).where(eq(avancesSalaire.id, id));
        if (!existing) return res.status(404).json({ error: "Avance non trouvée" });
        if (existing.statut !== StatutAvance.PENDING) {
            return res.status(400).json({ error: `Impossible de rejeter une avance au statut ${existing.statut}` });
        }

        const user = req.user as any;
        const [updated] = await db.update(avancesSalaire)
            .set({
                statut: StatutAvance.REJECTED,
                rejeteMotif: motif,
                approuvePar: user.id,
                approuveAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(avancesSalaire.id, id))
            .returning();

        broadcastHrEvent({
            entity: 'paie',
            action: 'rejected',
            id: updated.id,
            employeId: updated.employeId,
            extra: { type: 'avance' },
        });

        res.json(updated);
    } catch (error) {
        logger.error({ err: error }, 'Erreur rejet avance');
        res.status(500).json({ error: "Erreur lors du rejet" });
    }
});

// PATCH /api/hr/avances/:id/pay - Mark salary advance as paid
hrRouter.patch("/avances/:id/pay", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        const agenceId = req.user?.agenceId;

        const [existing] = await db.select().from(avancesSalaire).where(eq(avancesSalaire.id, id));
        if (!existing) return res.status(404).json({ error: "Avance non trouvée" });
        if (existing.statut !== StatutAvance.APPROVED) {
            return res.status(400).json({ error: `Impossible de payer une avance au statut ${existing.statut}` });
        }

        // Resolve employee name for GL metadata
        const [emp] = await db.select({ nom: users.nom, prenom: users.prenom })
            .from(employes)
            .leftJoin(users, eq(employes.userId, users.id))
            .where(eq(employes.id, existing.employeId));
        const employeNom = emp ? `${emp.nom || ''} ${emp.prenom || ''}`.trim() : existing.employeId;

        const updated = await db.transaction(async (tx) => {
            const [row] = await tx.update(avancesSalaire)
                .set({
                    statut: StatutAvance.PAID,
                    payeAt: new Date(),
                    updatedAt: new Date(),
                })
                .where(eq(avancesSalaire.id, id))
                .returning();

            // Post GL entry: Debit 4212 (Avances personnel) / Credit 521 (Caisse)
            if (agenceId && userId) {
                try {
                    await postAdvancePaymentGL(row.id, row.montant, employeNom, agenceId, userId);
                } catch (glError) {
                    logger.error({ err: glError, advanceId: id }, 'GL posting failed for advance payment');
                }
            }

            return row;
        });

        broadcastHrUpdate({
            entity: 'paie',
            action: 'paid',
            id: updated.id,
            employeId: updated.employeId,
            extra: { type: 'avance', montant: updated.montant },
        });

        res.json(updated);
    } catch (error) {
        logger.error({ err: error }, 'Erreur paiement avance');
        res.status(500).json({ error: "Erreur lors du paiement" });
    }
});

// PATCH /api/hr/avances/:id/deduct - Mark salary advance as deducted from payroll
hrRouter.patch("/avances/:id/deduct", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        const { id } = req.params;
        const { moisDeduction } = req.body;
        const userId = req.user?.id;
        const agenceId = req.user?.agenceId;

        const [existing] = await db.select().from(avancesSalaire).where(eq(avancesSalaire.id, id));
        if (!existing) return res.status(404).json({ error: "Avance non trouvée" });
        if (existing.statut !== StatutAvance.PAID) {
            return res.status(400).json({ error: `Impossible de déduire une avance au statut ${existing.statut}` });
        }

        // Resolve employee name for GL metadata
        const [emp] = await db.select({ nom: users.nom, prenom: users.prenom })
            .from(employes)
            .leftJoin(users, eq(employes.userId, users.id))
            .where(eq(employes.id, existing.employeId));
        const employeNom = emp ? `${emp.nom || ''} ${emp.prenom || ''}`.trim() : existing.employeId;
        const resolvedMois = moisDeduction || new Date().toISOString().slice(0, 7);

        const updated = await db.transaction(async (tx) => {
            const [row] = await tx.update(avancesSalaire)
                .set({
                    statut: StatutAvance.DEDUCTED,
                    moisDeduction: resolvedMois,
                    updatedAt: new Date(),
                })
                .where(eq(avancesSalaire.id, id))
                .returning();

            // Advance deduction GL is now handled within payroll bulletin (code 4500)
            // No separate GL posting needed here

            return row;
        });

        broadcastHrUpdate({
            entity: 'paie',
            action: 'validated',
            id: updated.id,
            employeId: updated.employeId,
            extra: { type: 'avance_deducted' },
        });

        res.json(updated);
    } catch (error) {
        logger.error({ err: error }, 'Erreur déduction avance');
        res.status(500).json({ error: "Erreur lors de la déduction" });
    }
});

// ============================================================================
// EMPLOYEE DOCUMENTS
// ============================================================================

// GET /api/hr/employees/:employeId/documents - List documents for an employee
hrRouter.get("/employees/:employeId/documents", getAuthUser, attachAbility, requireAbility(Actions.VIEW, Subjects.RH), async (req, res) => {
    try {
        const { employeId } = req.params;
        const docs = await db.select()
            .from(employeeDocuments)
            .where(eq(employeeDocuments.employeId, employeId))
            .orderBy(desc(employeeDocuments.createdAt));

        // Generate presigned URLs for private docs
        const enriched = await Promise.all(docs.map(async (doc) => {
            let url: string | null = null;
            try {
                if (doc.bucket === 'private') {
                    url = await StorageService.getPresignedDownloadUrl(doc.storageKey, 3600);
                } else {
                    url = StorageService.getPublicUrl(doc.storageKey);
                }
            } catch { /* ignore URL generation errors */ }
            return { ...doc, url };
        }));

        res.json(enriched);
    } catch (error) {
        logger.error({ err: error }, 'Erreur chargement documents');
        res.status(500).json({ error: "Erreur lors du chargement des documents" });
    }
});

// POST /api/hr/employees/:employeId/documents - Upload a document with metadata
hrRouter.post("/employees/:employeId/documents", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), docUpload.single('file'), async (req, res) => {
    try {
        const { employeId } = req.params;
        const userId = req.user?.id;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: "Fichier requis" });
        }

        const { typeDocument, categorie, nom, description, dateEmission, dateExpiration } = req.body;

        if (!typeDocument || !nom) {
            return res.status(400).json({ error: "Le type de document et le nom sont requis" });
        }

        // Upload to MinIO (private bucket for employee documents)
        const storagePath = `employe/${employeId}`;
        const storageKey = await StorageService.uploadBuffer(
            file.buffer,
            file.originalname,
            file.mimetype,
            storagePath,
            false, // private
        );

        // Create metadata record
        const [doc] = await db.insert(employeeDocuments).values({
            employeId,
            nom,
            typeDocument,
            categorie: categorie || 'GENERAL',
            description: description || null,
            storageKey,
            bucket: 'private',
            fileName: file.originalname,
            fileSize: file.size,
            mimeType: file.mimetype,
            dateEmission: dateEmission || null,
            dateExpiration: dateExpiration || null,
            statut: 'PENDING',
            ajoutePar: userId || null,
        }).returning();

        res.status(201).json(doc);
    } catch (error) {
        logger.error({ err: error }, 'Erreur upload document');
        res.status(500).json({ error: "Erreur lors de l'ajout du document" });
    }
});

// GET /api/hr/documents/:id/preview-url - Get fresh presigned URL for inline preview
hrRouter.get("/documents/:id/preview-url", getAuthUser, attachAbility, requireAbility(Actions.VIEW, Subjects.RH), async (req, res) => {
    try {
        const { id } = req.params;
        const [doc] = await db.select().from(employeeDocuments).where(eq(employeeDocuments.id, id));
        if (!doc) {
            return res.status(404).json({ error: "Document non trouvé" });
        }
        let url: string | null;
        if (doc.bucket === 'private') {
            url = await StorageService.getPresignedDownloadUrl(doc.storageKey, 3600);
        } else {
            url = StorageService.getPublicUrl(doc.storageKey);
        }
        if (!url) {
            return res.status(404).json({ error: "URL du document non disponible" });
        }
        res.json({ url, mimeType: doc.mimeType, fileName: doc.fileName });
    } catch (error) {
        logger.error({ err: error }, 'Erreur génération URL preview');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PATCH /api/hr/documents/:id - Update document metadata
hrRouter.patch("/documents/:id", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        const { id } = req.params;
        const { nom, typeDocument, categorie, description, dateEmission, dateExpiration } = req.body;

        const updates: Record<string, any> = { updatedAt: new Date() };
        if (nom !== undefined) updates.nom = nom;
        if (typeDocument !== undefined) updates.typeDocument = typeDocument;
        if (categorie !== undefined) updates.categorie = categorie;
        if (description !== undefined) updates.description = description;
        if (dateEmission !== undefined) updates.dateEmission = dateEmission || null;
        if (dateExpiration !== undefined) updates.dateExpiration = dateExpiration || null;

        const [updated] = await db.update(employeeDocuments)
            .set(updates)
            .where(eq(employeeDocuments.id, id))
            .returning();

        if (!updated) return res.status(404).json({ error: "Document non trouvé" });
        res.json(updated);
    } catch (error) {
        logger.error({ err: error }, 'Erreur mise à jour document');
        res.status(500).json({ error: "Erreur lors de la mise à jour" });
    }
});

// PATCH /api/hr/documents/:id/verify - Verify or reject a document
hrRouter.patch("/documents/:id/verify", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        const { statut, motifRejet } = req.body;

        if (!statut || !['VERIFIED', 'REJECTED'].includes(statut)) {
            return res.status(400).json({ error: "Statut invalide (VERIFIED ou REJECTED attendu)" });
        }

        const updates: Record<string, any> = {
            statut,
            verifiePar: userId,
            verifieAt: new Date(),
            updatedAt: new Date(),
        };

        if (statut === 'REJECTED' && motifRejet) {
            updates.motifRejet = motifRejet;
        }

        const [updated] = await db.update(employeeDocuments)
            .set(updates)
            .where(eq(employeeDocuments.id, id))
            .returning();

        if (!updated) return res.status(404).json({ error: "Document non trouvé" });
        res.json(updated);
    } catch (error) {
        logger.error({ err: error }, 'Erreur vérification document');
        res.status(500).json({ error: "Erreur lors de la vérification" });
    }
});

// DELETE /api/hr/documents/:id - Delete a document and its file
hrRouter.delete("/documents/:id", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        const { id } = req.params;

        const [doc] = await db.select().from(employeeDocuments).where(eq(employeeDocuments.id, id));
        if (!doc) return res.status(404).json({ error: "Document non trouvé" });

        // Delete file from storage
        try {
            await StorageService.deleteFile(doc.storageKey, doc.bucket === 'public');
        } catch (storageErr) {
            logger.error({ err: storageErr, storageKey: doc.storageKey }, 'Storage delete failed');
        }

        // Delete metadata
        await db.delete(employeeDocuments).where(eq(employeeDocuments.id, id));

        res.json({ success: true });
    } catch (error) {
        logger.error({ err: error }, 'Erreur suppression document');
        res.status(500).json({ error: "Erreur lors de la suppression" });
    }
});

// =============================================================================
// EVALUATION TEMPLATES
// =============================================================================

// GET /api/hr/evaluations/templates
hrRouter.get("/evaluations/templates", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.READ, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const templates = await hrStorage.getEvaluationTemplates({ actif: true });
        res.json(templates);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération templates évaluation");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/evaluations/templates
hrRouter.post("/evaluations/templates", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const { criteria, ...templateData } = req.body;

        if (!templateData.nom) return res.status(400).json({ error: "Le nom est requis" });
        if (!criteria?.length) return res.status(400).json({ error: "Au moins un critère est requis" });

        const totalPoids = criteria.reduce((sum: number, c: any) => sum + (c.poids || 0), 0);
        if (totalPoids !== 100) return res.status(400).json({ error: `Le total des poids doit être 100% (actuel: ${totalPoids}%)` });

        const user = (req as any).user;
        const template = await hrStorage.createEvaluationTemplate(
            { ...templateData, createdBy: user.id, agenceId: user.agenceId },
            criteria
        );
        res.status(201).json(template);
    } catch (error) {
        logger.error({ err: error }, "Erreur création template évaluation");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PUT /api/hr/evaluations/templates/:id
hrRouter.put("/evaluations/templates/:id", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const { criteria, ...templateData } = req.body;

        if (criteria) {
            const totalPoids = criteria.reduce((sum: number, c: any) => sum + (c.poids || 0), 0);
            if (totalPoids !== 100) return res.status(400).json({ error: `Le total des poids doit être 100% (actuel: ${totalPoids}%)` });
        }

        const template = await hrStorage.updateEvaluationTemplate(req.params.id, templateData, criteria);
        if (!template) return res.status(404).json({ error: "Template introuvable" });
        res.json(template);
    } catch (error) {
        logger.error({ err: error }, "Erreur modification template évaluation");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// DELETE /api/hr/evaluations/templates/:id
hrRouter.delete("/evaluations/templates/:id", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        await hrStorage.deleteEvaluationTemplate(req.params.id);
        res.json({ success: true });
    } catch (error) {
        logger.error({ err: error }, "Erreur suppression template évaluation");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// =============================================================================
// EVALUATION CAMPAIGNS
// =============================================================================

// GET /api/hr/evaluations/campaigns
hrRouter.get("/evaluations/campaigns", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.READ, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const { statut } = req.query;
        const campaigns = await hrStorage.getEvaluationCampaigns({ statut: statut as string });
        res.json(campaigns);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération campagnes");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/evaluations/campaigns
hrRouter.post("/evaluations/campaigns", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const user = (req as any).user;

        const campaign = await hrStorage.createEvaluationCampaign({
            ...req.body,
            createdBy: user.id,
            agenceId: user.agenceId,
        });

        // Générer les évaluations si la campagne est directement activée
        if (campaign.statut === "ACTIVE") {
            const result = await generateCampaignEvaluations(campaign.id);
            return res.status(201).json({ ...campaign, generated: result.created });
        }

        res.status(201).json(campaign);
    } catch (error) {
        logger.error({ err: error }, "Erreur création campagne");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PATCH /api/hr/evaluations/campaigns/:id/status
hrRouter.patch("/evaluations/campaigns/:id/status", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const { statut } = req.body;
        if (!statut) return res.status(400).json({ error: "Statut requis" });

        const campaign = await hrStorage.updateEvaluationCampaign(req.params.id, { statut });
        if (!campaign) return res.status(404).json({ error: "Campagne introuvable" });

        // Si activation, générer les évaluations
        if (statut === "ACTIVE") {
            const result = await generateCampaignEvaluations(campaign.id);
            return res.json({ ...campaign, generated: result.created });
        }

        res.json(campaign);
    } catch (error) {
        logger.error({ err: error }, "Erreur changement statut campagne");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// =============================================================================
// EVALUATIONS (Individual)
// =============================================================================

// GET /api/hr/evaluations
hrRouter.get("/evaluations", getAuthUser, attachAbility, async (req, res) => {
    try {
        const user = (req as any).user;
        const { campaignId, employeId, statut } = req.query;
        const isRH = req.ability?.can(Actions.MANAGE, Subjects.RH);

        // Trouver l'employé correspondant à l'utilisateur connecté
        const [currentEmploye] = await db.select().from(employes).where(eq(employes.userId, user.id));

        const filters: any = {};
        if (campaignId) filters.campaignId = campaignId;
        if (statut) filters.statut = statut;

        if (isRH) {
            if (employeId) filters.employeId = employeId;
        } else if (currentEmploye) {
            // Les managers voient les évaluations de leur équipe
            const isManager = await db.select({ id: employes.id }).from(employes).where(eq(employes.managerId, currentEmploye.id)).limit(1);
            if (isManager.length > 0) {
                filters.managerId = currentEmploye.id;
            } else {
                filters.employeId = currentEmploye.id;
            }
        } else {
            return res.json([]);
        }

        const evals = await hrStorage.getEvaluations(filters);
        res.json(evals);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération évaluations");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/evaluations/:id
hrRouter.get("/evaluations/:id", getAuthUser, attachAbility, async (req, res) => {
    try {
        const eval_ = await hrStorage.getEvaluationById(req.params.id);
        if (!eval_) return res.status(404).json({ error: "Évaluation introuvable" });

        // Charger les critères du template de la campagne
        const [campaign] = await db.select().from(evaluationCampaigns).where(eq(evaluationCampaigns.id, eval_.campaignId));
        const criteria = campaign?.templateId
            ? await db.select().from(evaluationCriteria).where(eq(evaluationCriteria.templateId, campaign.templateId)).orderBy(evaluationCriteria.ordre)
            : [];

        // Charger les réponses
        const responses = await hrStorage.getEvaluationResponses(eval_.id);

        res.json({ ...eval_, criteria, responses, campaign });
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération évaluation");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/evaluations/:id/comparison
hrRouter.get("/evaluations/:id/comparison", getAuthUser, attachAbility, async (req, res) => {
    try {
        const eval_ = await hrStorage.getEvaluationById(req.params.id);
        if (!eval_) return res.status(404).json({ error: "Évaluation introuvable" });

        const [campaign] = await db.select().from(evaluationCampaigns).where(eq(evaluationCampaigns.id, eval_.campaignId));
        const criteria = campaign?.templateId
            ? await db.select().from(evaluationCriteria).where(eq(evaluationCriteria.templateId, campaign.templateId)).orderBy(evaluationCriteria.ordre)
            : [];

        const selfResponses = await hrStorage.getEvaluationResponses(eval_.id, "SELF");
        const managerResponses = await hrStorage.getEvaluationResponses(eval_.id, "MANAGER");

        const selfMap = new Map(selfResponses.map(r => [r.criteriaId, r]));
        const managerMap = new Map(managerResponses.map(r => [r.criteriaId, r]));

        const comparison = criteria.map(c => ({
            criteriaId: c.id,
            libelle: c.libelle,
            categorie: c.categorie,
            poids: c.poids,
            selfRating: selfMap.get(c.id)?.rating || null,
            selfComment: selfMap.get(c.id)?.commentaire || null,
            managerRating: managerMap.get(c.id)?.rating || null,
            managerComment: managerMap.get(c.id)?.commentaire || null,
            gap: (selfMap.get(c.id)?.rating && managerMap.get(c.id)?.rating)
                ? (selfMap.get(c.id)!.rating - managerMap.get(c.id)!.rating)
                : null,
        }));

        res.json({
            evaluation: eval_,
            comparison,
            selfScore: eval_.selfEvalScore,
            managerScore: eval_.managerEvalScore,
            finalScore: eval_.finalScore,
        });
    } catch (error) {
        logger.error({ err: error }, "Erreur comparaison évaluation");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/evaluations/:id/self-eval
hrRouter.post("/evaluations/:id/self-eval", getAuthUser, attachAbility, async (req, res) => {
    try {
        const user = (req as any).user;
        const eval_ = await hrStorage.getEvaluationById(req.params.id);
        if (!eval_) return res.status(404).json({ error: "Évaluation introuvable" });

        // Vérifier que l'utilisateur est bien l'employé
        const [emp] = await db.select().from(employes).where(eq(employes.userId, user.id));
        if (!emp || emp.id !== eval_.employeId) {
            return res.status(403).json({ error: "Vous ne pouvez compléter que votre propre auto-évaluation" });
        }

        const { responses, commentaire } = req.body;
        if (!responses?.length) return res.status(400).json({ error: "Les réponses sont requises" });

        // Sauvegarder les réponses
        await hrStorage.batchUpsertResponses(eval_.id, "SELF", responses);

        // Calculer le score
        const score = await computeEvaluationScore(eval_.id, "SELF");

        // Mettre à jour l'évaluation
        await hrStorage.updateEvaluation(eval_.id, {
            selfEvalStatus: "COMPLETED",
            selfEvalSubmittedAt: new Date(),
            selfEvalScore: score.toFixed(2),
            selfCommentaire: commentaire || null,
            statut: eval_.managerEvalStatus === "COMPLETED" ? "MANAGER_REVIEW" : "SELF_COMPLETED",
        });

        const wsInstance = getWsInstance();
        wsInstance?.broadcast({ type: 'HR_UPDATE', payload: { entity: 'evaluation', action: 'updated', id: eval_.id } });

        res.json({ success: true, score });
    } catch (error) {
        logger.error({ err: error }, "Erreur soumission auto-évaluation");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/evaluations/:id/manager-eval
hrRouter.post("/evaluations/:id/manager-eval", getAuthUser, attachAbility, async (req, res) => {
    try {
        const user = (req as any).user;
        const eval_ = await hrStorage.getEvaluationById(req.params.id);
        if (!eval_) return res.status(404).json({ error: "Évaluation introuvable" });

        // Vérifier que l'utilisateur est le manager ou RH
        const isRH = req.ability?.can(Actions.MANAGE, Subjects.RH);
        if (!isRH) {
            const [emp] = await db.select().from(employes).where(eq(employes.userId, user.id));
            if (!emp || emp.id !== eval_.managerId) {
                return res.status(403).json({ error: "Non autorisé à évaluer cet employé" });
            }
        }

        const { responses, commentaire, recommandation } = req.body;
        if (!responses?.length) return res.status(400).json({ error: "Les réponses sont requises" });

        // Sauvegarder les réponses
        await hrStorage.batchUpsertResponses(eval_.id, "MANAGER", responses);

        // Calculer le score
        const score = await computeEvaluationScore(eval_.id, "MANAGER");

        // Mettre à jour l'évaluation
        await hrStorage.updateEvaluation(eval_.id, {
            managerEvalStatus: "COMPLETED",
            managerEvalSubmittedAt: new Date(),
            managerEvalScore: score.toFixed(2),
            managerCommentaire: commentaire || null,
            recommandation: recommandation || null,
            statut: "MANAGER_REVIEW",
        });

        const wsInstance = getWsInstance();
        wsInstance?.broadcast({ type: 'HR_UPDATE', payload: { entity: 'evaluation', action: 'updated', id: eval_.id } });

        res.json({ success: true, score });
    } catch (error) {
        logger.error({ err: error }, "Erreur soumission évaluation manager");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PATCH /api/hr/evaluations/:id/finalize
hrRouter.patch("/evaluations/:id/finalize", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });

        const { actionPlan, trainingRecommendations, recommandation } = req.body;
        const eval_ = await hrStorage.getEvaluationById(req.params.id);
        if (!eval_) return res.status(404).json({ error: "Évaluation introuvable" });

        // Mettre à jour le plan d'action si fourni
        if (actionPlan !== undefined || trainingRecommendations !== undefined || recommandation !== undefined) {
            await hrStorage.updateEvaluation(eval_.id, {
                ...(actionPlan !== undefined && { actionPlan }),
                ...(trainingRecommendations !== undefined && { trainingRecommendations }),
                ...(recommandation !== undefined && { recommandation }),
            });
        }

        const finalScore = await finalizeEvaluation(eval_.id);

        const wsInstance = getWsInstance();
        wsInstance?.broadcast({ type: 'HR_UPDATE', payload: { entity: 'evaluation', action: 'updated', id: eval_.id } });

        res.json({ success: true, finalScore });
    } catch (error) {
        logger.error({ err: error }, "Erreur finalisation évaluation");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/evaluations/analytics/history
hrRouter.get("/evaluations/analytics/history", getAuthUser, attachAbility, async (req, res) => {
    try {
        const { employeId } = req.query;
        if (!employeId) return res.status(400).json({ error: "employeId requis" });
        const history = await hrStorage.getEmployeeEvaluationHistory(employeId as string);
        res.json(history);
    } catch (error) {
        logger.error({ err: error }, "Erreur historique évaluations");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/evaluations/analytics/campaign-summary
hrRouter.get("/evaluations/analytics/campaign-summary", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.READ, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const { campaignId } = req.query;
        if (!campaignId) return res.status(400).json({ error: "campaignId requis" });

        const evals = await hrStorage.getEvaluations({ campaignId: campaignId as string });
        const total = evals.length;
        const finalized = evals.filter(e => e.statut === "FINALIZED").length;
        const selfCompleted = evals.filter(e => e.selfEvalStatus === "COMPLETED").length;
        const managerCompleted = evals.filter(e => e.managerEvalStatus === "COMPLETED").length;
        const scores = evals.filter(e => e.finalScore).map(e => parseFloat(e.finalScore!));
        const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null;

        const byRecommandation: Record<string, number> = {};
        evals.filter(e => e.recommandation).forEach(e => {
            byRecommandation[e.recommandation!] = (byRecommandation[e.recommandation!] || 0) + 1;
        });

        res.json({ total, finalized, selfCompleted, managerCompleted, avgScore, byRecommandation });
    } catch (error) {
        logger.error({ err: error }, "Erreur summary campagne");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// =============================================================================
// HR ALERTS
// =============================================================================

// GET /api/hr/alerts
hrRouter.get("/alerts", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.READ, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const user = (req as any).user;
        const alerts = await hrStorage.getUpcomingAlerts(30, user.agenceId);
        res.json(alerts);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération alertes");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/alerts/stats
hrRouter.get("/alerts/stats", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.READ, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const user = (req as any).user;
        const stats = await hrStorage.getAlertStats(user.agenceId);
        res.json(stats);
    } catch (error) {
        logger.error({ err: error }, "Erreur stats alertes");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/alerts/:id/acknowledge
hrRouter.post("/alerts/:id/acknowledge", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const user = (req as any).user;
        const alert = await hrStorage.acknowledgeAlert(req.params.id, user.id);
        if (!alert) return res.status(404).json({ error: "Alerte introuvable" });
        res.json(alert);
    } catch (error) {
        logger.error({ err: error }, "Erreur acknowledge alerte");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/alerts/:id/dismiss
hrRouter.post("/alerts/:id/dismiss", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const user = (req as any).user;
        const { reason } = req.body;
        const alert = await hrStorage.dismissAlert(req.params.id, user.id, reason);
        if (!alert) return res.status(404).json({ error: "Alerte introuvable" });
        res.json(alert);
    } catch (error) {
        logger.error({ err: error }, "Erreur dismiss alerte");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/alerts/config
hrRouter.get("/alerts/config", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const configs = await hrStorage.getAlertConfigs();
        res.json(configs);
    } catch (error) {
        logger.error({ err: error }, "Erreur config alertes");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PUT /api/hr/alerts/config/:type
hrRouter.put("/alerts/config/:type", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const config = await hrStorage.updateAlertConfig(req.params.type, req.body);
        if (!config) return res.status(404).json({ error: "Config introuvable" });
        res.json(config);
    } catch (error) {
        logger.error({ err: error }, "Erreur MAJ config alerte");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// =============================================================================
// PAYROLL TRANSFER FILES
// =============================================================================

// GET /api/hr/paie/runs/:runId/transfer-preview
hrRouter.get("/paie/runs/:runId/transfer-preview", getAuthUser, attachAbility, async (req, res) => {
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
hrRouter.post("/paie/runs/:runId/generate-transfer", getAuthUser, attachAbility, async (req, res) => {
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
hrRouter.get("/paie/runs/:runId/transfer-files", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.READ, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const files = await hrStorage.getTransferFiles(parseInt(req.params.runId));
        res.json(files);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération fichiers virement");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// =============================================================================
// HR REPORTS
// =============================================================================

// GET /api/hr/reports/registre-personnel
hrRouter.get("/reports/registre-personnel", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.READ, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const filters: { statut?: string; departmentId?: string; agenceId?: string } = {};
        if (req.query.statut) filters.statut = req.query.statut as string;
        if (req.query.departmentId) filters.departmentId = req.query.departmentId as string;
        if (req.query.agenceId) filters.agenceId = req.query.agenceId as string;
        const data = await hrStorage.getRegistrePersonnel(Object.keys(filters).length > 0 ? filters : undefined);
        res.json(data);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération registre du personnel");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/reports/bilan-social
hrRouter.get("/reports/bilan-social", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.READ, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
        const data = await hrStorage.getBilanSocial(year);
        res.json(data);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération bilan social");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// =============================================================================
// DOCUMENT REQUESTS (Portail Employe)
// =============================================================================

// GET /api/hr/document-requests
hrRouter.get("/document-requests", getAuthUser, attachAbility, async (req, res) => {
    try {
        const user = (req as any).user;
        const mine = req.query.mine === 'true';

        if (mine) {
            // Employé: voir ses propres demandes
            const [emp] = await db.select().from(employes).where(eq(employes.userId, user.id));
            if (!emp) return res.json([]);
            const requests = await hrStorage.getDocumentRequests({ employeId: emp.id });
            return res.json(requests);
        }

        // Admin RH: voir toutes les demandes
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) {
            return res.status(403).json({ error: "Non autorisé" });
        }

        const filters: { statut?: string } = {};
        if (req.query.statut) filters.statut = req.query.statut as string;
        const requests = await hrStorage.getDocumentRequests(filters);
        res.json(requests);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération demandes de documents");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/document-requests
hrRouter.post("/document-requests", getAuthUser, async (req, res) => {
    try {
        const user = (req as any).user;
        const [emp] = await db.select().from(employes).where(eq(employes.userId, user.id));
        if (!emp) {
            return res.status(400).json({ error: "Aucun profil employé associé à votre compte" });
        }

        const { type, motif, details, urgence } = req.body;
        if (!type) {
            return res.status(400).json({ error: "Le type de document est requis" });
        }

        const data = {
            employeId: emp.id,
            employeNom: `${user.nom}${user.prenom ? ' ' + user.prenom : ''}`,
            type,
            motif: motif || null,
            details: details || null,
            urgence: urgence || false,
            statut: HrDocumentRequestStatus.PENDING,
        };

        const result = await hrStorage.createDocumentRequest(data);

        broadcastHrEvent({ entity: 'employe' as any, action: 'created', id: result.id });

        res.status(201).json(result);
    } catch (error) {
        logger.error({ err: error }, "Erreur création demande de document");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PATCH /api/hr/document-requests/:id/process
hrRouter.patch("/document-requests/:id/process", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) {
            return res.status(403).json({ error: "Non autorisé" });
        }

        const user = (req as any).user;
        const { statut, commentaireRh, motifRejet } = req.body;

        if (!statut) {
            return res.status(400).json({ error: "Le statut est requis" });
        }

        const updateData: any = {
            statut,
            traitePar: user.id,
            traiteAt: new Date(),
        };
        if (commentaireRh !== undefined) updateData.commentaireRh = commentaireRh;
        if (motifRejet !== undefined) updateData.motifRejet = motifRejet;

        const result = await hrStorage.updateDocumentRequest(req.params.id, updateData);
        if (!result) {
            return res.status(404).json({ error: "Demande introuvable" });
        }

        broadcastHrEvent({ entity: 'employe' as any, action: 'updated', id: result.id });

        res.json(result);
    } catch (error) {
        logger.error({ err: error }, "Erreur traitement demande de document");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/document-requests/:id/download
hrRouter.get("/document-requests/:id/download", getAuthUser, async (req, res) => {
    try {
        const [request] = await db.select().from(hrDocumentRequests).where(eq(hrDocumentRequests.id, req.params.id));
        if (!request) {
            return res.status(404).json({ error: "Demande introuvable" });
        }
        if (request.statut !== HrDocumentRequestStatus.COMPLETED || !request.documentUrl) {
            return res.status(400).json({ error: "Le document n'est pas encore disponible" });
        }
        res.redirect(request.documentUrl);
    } catch (error) {
        logger.error({ err: error }, "Erreur téléchargement document");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// =============================================================================
// JOB OFFERS / ATS
// =============================================================================

// GET /api/hr/job-offers - Liste des offres
hrRouter.get("/job-offers", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.READ, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const filter: { statut?: string; visibilite?: string } = {};
        if (req.query.statut) filter.statut = req.query.statut as string;
        if (req.query.visibilite) filter.visibilite = req.query.visibilite as string;
        const offers = await hrStorage.getJobOffers(filter);
        res.json(offers);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération offres d'emploi");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/job-offers - Créer une offre
hrRouter.post("/job-offers", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const user = (req as any).user;

        const { jobPositionId, titre, description, competencesRequises, qualificationMinimum,
            experienceMinAnnees, formationRequise, salairePropose, typeContrat, lieu,
            visibilite, dateLimite, poidsCompetences, poidsQualification, poidsExperience,
            postesOuverts } = req.body;

        if (!jobPositionId || !titre) {
            return res.status(400).json({ error: "jobPositionId et titre sont requis" });
        }

        const [offer] = await db.insert(jobOffers).values({
            jobPositionId,
            titre,
            description: description || null,
            competencesRequises: competencesRequises || null,
            qualificationMinimum: qualificationMinimum || null,
            experienceMinAnnees: experienceMinAnnees || 0,
            formationRequise: formationRequise || null,
            salairePropose: salairePropose || null,
            typeContrat: typeContrat || null,
            lieu: lieu || null,
            visibilite: visibilite || 'BOTH',
            statut: 'DRAFT',
            dateLimite: dateLimite || null,
            poidsCompetences: poidsCompetences || 40,
            poidsQualification: poidsQualification || 30,
            poidsExperience: poidsExperience || 30,
            postesOuverts: postesOuverts || 1,
            createdBy: user.id,
            agenceId: user.agenceId || null,
        }).returning();

        const wsInstance = getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'job_offer_created', id: offer.id } });
        }

        res.status(201).json(offer);
    } catch (error) {
        logger.error({ err: error }, "Erreur création offre d'emploi");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/job-offers/internal - Offres publiées visibles en interne
hrRouter.get("/job-offers/internal", getAuthUser, async (req, res) => {
    try {
        const offers = await hrStorage.getInternalJobOffers();
        res.json(offers);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération offres internes");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/job-offers/:id - Détail d'une offre
hrRouter.get("/job-offers/:id", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.READ, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const offer = await hrStorage.getJobOfferById(parseInt(req.params.id));
        if (!offer) return res.status(404).json({ error: "Offre introuvable" });
        res.json(offer);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération offre d'emploi");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PATCH /api/hr/job-offers/:id - Modifier une offre
hrRouter.patch("/job-offers/:id", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });

        const id = parseInt(req.params.id);
        const updateData: any = {};
        const allowedFields = ['titre', 'description', 'competencesRequises', 'qualificationMinimum',
            'experienceMinAnnees', 'formationRequise', 'salairePropose', 'typeContrat', 'lieu',
            'visibilite', 'dateLimite', 'poidsCompetences', 'poidsQualification', 'poidsExperience',
            'postesOuverts', 'jobPositionId'];

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) updateData[field] = req.body[field];
        }
        updateData.updatedAt = new Date();

        const [updated] = await db.update(jobOffers)
            .set(updateData)
            .where(eq(jobOffers.id, id))
            .returning();

        if (!updated) return res.status(404).json({ error: "Offre introuvable" });
        res.json(updated);
    } catch (error) {
        logger.error({ err: error }, "Erreur modification offre d'emploi");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/job-offers/:id/publish - Publier une offre
hrRouter.post("/job-offers/:id/publish", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });

        const id = parseInt(req.params.id);
        const [updated] = await db.update(jobOffers)
            .set({ statut: 'PUBLISHED', datePublication: new Date(), updatedAt: new Date() })
            .where(eq(jobOffers.id, id))
            .returning();

        if (!updated) return res.status(404).json({ error: "Offre introuvable" });

        const wsInstance = getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'job_offer_published', id: updated.id } });
        }

        res.json(updated);
    } catch (error) {
        logger.error({ err: error }, "Erreur publication offre d'emploi");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/job-offers/:id/close - Fermer une offre
hrRouter.post("/job-offers/:id/close", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });

        const id = parseInt(req.params.id);
        const [updated] = await db.update(jobOffers)
            .set({ statut: 'CLOSED', updatedAt: new Date() })
            .where(eq(jobOffers.id, id))
            .returning();

        if (!updated) return res.status(404).json({ error: "Offre introuvable" });
        res.json(updated);
    } catch (error) {
        logger.error({ err: error }, "Erreur fermeture offre d'emploi");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/job-offers/:id/candidatures - Candidatures d'une offre (triées par score)
hrRouter.get("/job-offers/:id/candidatures", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.READ, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const candidaturesList = await hrStorage.getJobOfferCandidatures(parseInt(req.params.id));
        res.json(candidaturesList);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération candidatures de l'offre");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/job-offers/:id/score-all - Re-scorer toutes les candidatures d'une offre
hrRouter.post("/job-offers/:id/score-all", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const scored = await scoreAllCandidatures(parseInt(req.params.id));
        res.json({ scored, message: `${scored} candidature(s) scorée(s)` });
    } catch (error) {
        logger.error({ err: error }, "Erreur scoring candidatures");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/job-offers/:id/apply-internal - Postuler en interne
hrRouter.post("/job-offers/:id/apply-internal", getAuthUser, async (req, res) => {
    try {
        const user = (req as any).user;
        const offerId = parseInt(req.params.id);

        // Vérifier que l'offre existe et est publiée
        const [offer] = await db.select().from(jobOffers).where(eq(jobOffers.id, offerId));
        if (!offer || offer.statut !== 'PUBLISHED') {
            return res.status(400).json({ error: "Offre non disponible" });
        }

        // Vérifier visibilité interne
        if (offer.visibilite === 'EXTERNAL') {
            return res.status(403).json({ error: "Cette offre n'est pas ouverte aux candidatures internes" });
        }

        // Récupérer profil employé
        const [emp] = await db.select().from(employes).where(eq(employes.userId, user.id));
        if (!emp) {
            return res.status(400).json({ error: "Aucun profil employé associé" });
        }

        // Vérifier pas déjà candidaté
        const [existing] = await db.select().from(candidatures)
            .where(and(eq(candidatures.jobOfferId, offerId), eq(candidatures.email, user.email || '')));
        if (existing) {
            return res.status(400).json({ error: "Vous avez déjà postulé à cette offre" });
        }

        // Créer candidature auto-remplie
        const [newCandidature] = await db.insert(candidatures).values({
            nom: user.nom || '',
            prenom: user.prenom || '',
            email: user.email || '',
            telephone: emp.phone || undefined,
            posteVise: offer.titre,
            experience: req.body.experience || null,
            formation: req.body.formation || null,
            datePostulation: new Date().toISOString().split('T')[0],
            statut: 'NEW',
            jobOfferId: offerId,
            source: 'INTERNAL_PORTAL',
        }).returning();

        // Auto-score
        await scoreCandidature(newCandidature.id);

        const wsInstance = getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'candidature_new', id: newCandidature.id } });
        }

        res.status(201).json(newCandidature);
    } catch (error) {
        logger.error({ err: error }, "Erreur candidature interne");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// =============================================================================
// PAYMENT BATCHES
// =============================================================================

// POST /api/hr/paie/runs/:runId/generate-transfer-xlsx - Générer XLSX
hrRouter.post("/paie/runs/:runId/generate-transfer-xlsx", getAuthUser, attachAbility, async (req, res) => {
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
hrRouter.post("/paie/runs/:runId/create-batches", getAuthUser, attachAbility, async (req, res) => {
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
hrRouter.get("/paie/runs/:runId/batches", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.READ, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const batches = await hrStorage.getPaymentBatches(parseInt(req.params.runId));
        res.json(batches);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération batches");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/paie/batches/:id - Détail d'un batch
hrRouter.get("/paie/batches/:id", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.READ, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const batch = await hrStorage.getPaymentBatchById(req.params.id);
        if (!batch) return res.status(404).json({ error: "Batch introuvable" });
        res.json(batch);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération batch");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PATCH /api/hr/paie/batches/:id/status - Changer statut d'un batch
hrRouter.patch("/paie/batches/:id/status", getAuthUser, attachAbility, async (req, res) => {
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
hrRouter.patch("/paie/batches/:batchId/items/:itemId", getAuthUser, attachAbility, async (req, res) => {
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

// =============================================================================
// BANK RECONCILIATION
// =============================================================================

// GET /api/hr/paie/reconciliation - Liste des sessions
hrRouter.get("/paie/reconciliation", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.READ, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const filter: { period?: string; bankName?: string } = {};
        if (req.query.period) filter.period = req.query.period as string;
        if (req.query.bankName) filter.bankName = req.query.bankName as string;
        const sessions = await hrStorage.getReconciliationSessions(filter);
        res.json(sessions);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération sessions rapprochement");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/paie/reconciliation - Créer une session
hrRouter.post("/paie/reconciliation", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const user = (req as any).user;
        const { period, bankName } = req.body;

        if (!period || !bankName) {
            return res.status(400).json({ error: "period et bankName sont requis" });
        }

        const [session] = await db.insert(bankReconciliationSessions).values({
            period,
            bankName,
            statut: 'DRAFT',
            createdBy: user.id,
        }).returning();

        // Auto-populate with transfer lines from matching batches
        const batches = await db.select()
            .from(payrollPaymentBatches)
            .innerJoin(payrollBatchItems, eq(payrollBatchItems.batchId, payrollPaymentBatches.id))
            .where(and(
                eq(payrollPaymentBatches.bankName, bankName),
                sql`EXISTS (SELECT 1 FROM payroll_runs pr WHERE pr.id = ${payrollPaymentBatches.payrollRunId} AND pr.period = ${period})`
            ));

        if (batches.length > 0) {
            await db.insert(bankReconciliationLines).values(
                batches.map(b => ({
                    sessionId: session.id,
                    source: 'TRANSFER' as const,
                    reference: `Virement paie ${period} - ${b.payroll_batch_items.employeNom}`,
                    employeNom: b.payroll_batch_items.employeNom,
                    montant: b.payroll_batch_items.montantNet,
                    batchItemId: b.payroll_batch_items.id,
                    matchStatus: 'UNMATCHED' as const,
                }))
            );
        }

        await hrStorage.updateReconciliationSessionStats(session.id);
        const result = await hrStorage.getReconciliationSessionById(session.id);
        res.status(201).json(result);
    } catch (error) {
        logger.error({ err: error }, "Erreur création session rapprochement");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/paie/reconciliation/:id - Détail d'une session
hrRouter.get("/paie/reconciliation/:id", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.READ, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const session = await hrStorage.getReconciliationSessionById(req.params.id);
        if (!session) return res.status(404).json({ error: "Session introuvable" });
        res.json(session);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération session rapprochement");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/paie/reconciliation/:id/import - Importer relevé bancaire CSV
hrRouter.post("/paie/reconciliation/:id/import", getAuthUser, attachAbility, bankStatementUpload.single('file'), async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });

        if (!req.file) return res.status(400).json({ error: "Fichier requis" });

        const sessionId = req.params.id;
        const [session] = await db.select().from(bankReconciliationSessions)
            .where(eq(bankReconciliationSessions.id, sessionId));
        if (!session) return res.status(404).json({ error: "Session introuvable" });

        // Parse CSV - expect columns: reference/libelle, nom, montant, date_valeur
        const content = req.file.buffer.toString('utf-8');
        const lines = content.split('\n').filter(l => l.trim());

        if (lines.length < 2) {
            return res.status(400).json({ error: "Le fichier doit contenir au moins un en-tête et une ligne de données" });
        }

        const separator = lines[0].includes(';') ? ';' : ',';
        const headers = lines[0].split(separator).map(h => h.trim().toLowerCase().replace(/"/g, ''));

        // Find column indices
        const refIdx = headers.findIndex(h => h.includes('reference') || h.includes('libelle') || h.includes('ref'));
        const nameIdx = headers.findIndex(h => h.includes('nom') || h.includes('beneficiaire') || h.includes('name'));
        const amountIdx = headers.findIndex(h => h.includes('montant') || h.includes('amount') || h.includes('debit'));
        const dateIdx = headers.findIndex(h => h.includes('date') || h.includes('valeur'));

        if (amountIdx === -1) {
            return res.status(400).json({ error: "Colonne montant introuvable dans le fichier" });
        }

        const bankLines = [];
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(separator).map(c => c.trim().replace(/"/g, ''));
            const montant = Math.abs(parseInt(cols[amountIdx]?.replace(/[^\d-]/g, '') || '0'));
            if (montant === 0) continue;

            bankLines.push({
                sessionId,
                source: 'BANK' as const,
                reference: refIdx >= 0 ? cols[refIdx] || null : null,
                employeNom: nameIdx >= 0 ? cols[nameIdx] || null : null,
                montant,
                dateValeur: dateIdx >= 0 ? cols[dateIdx] || null : null,
                matchStatus: 'UNMATCHED' as const,
            });
        }

        if (bankLines.length === 0) {
            return res.status(400).json({ error: "Aucune ligne valide trouvée dans le fichier" });
        }

        await db.insert(bankReconciliationLines).values(bankLines);

        // Update session
        await db.update(bankReconciliationSessions)
            .set({ importFileName: req.file.originalname, statut: 'IN_PROGRESS' })
            .where(eq(bankReconciliationSessions.id, sessionId));

        await hrStorage.updateReconciliationSessionStats(sessionId);
        const result = await hrStorage.getReconciliationSessionById(sessionId);
        res.json(result);
    } catch (error) {
        logger.error({ err: error }, "Erreur import relevé bancaire");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/paie/reconciliation/:id/auto-match - Lancer matching automatique
hrRouter.post("/paie/reconciliation/:id/auto-match", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });

        const sessionId = req.params.id;
        const allLines = await db.select()
            .from(bankReconciliationLines)
            .where(eq(bankReconciliationLines.sessionId, sessionId));

        const transferLines = allLines.filter(l => l.source === 'TRANSFER' && l.matchStatus === 'UNMATCHED');
        const bankLines = allLines.filter(l => l.source === 'BANK' && l.matchStatus === 'UNMATCHED');

        let matchCount = 0;

        for (const tl of transferLines) {
            // Try to find a matching bank line by amount + name similarity
            const match = bankLines.find(bl => {
                if (bl.matchStatus !== 'UNMATCHED') return false;
                // Exact amount match
                if (bl.montant !== tl.montant) return false;
                // Name similarity (optional bonus, not required)
                return true;
            });

            if (match) {
                // Mark both as matched
                await db.update(bankReconciliationLines)
                    .set({ matchStatus: 'MATCHED', matchedWithId: match.id })
                    .where(eq(bankReconciliationLines.id, tl.id));
                await db.update(bankReconciliationLines)
                    .set({ matchStatus: 'MATCHED', matchedWithId: tl.id })
                    .where(eq(bankReconciliationLines.id, match.id));

                // Remove from available pool
                match.matchStatus = 'MATCHED' as any;
                matchCount++;
            }
        }

        await hrStorage.updateReconciliationSessionStats(sessionId);
        const result = await hrStorage.getReconciliationSessionById(sessionId);
        res.json({ matchCount, session: result });
    } catch (error) {
        logger.error({ err: error }, "Erreur matching automatique");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PATCH /api/hr/paie/reconciliation/:id/lines/:lineId - Match/ignore/unmatch manuel
hrRouter.patch("/paie/reconciliation/:id/lines/:lineId", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });

        const { matchStatus, matchedWithId, notes } = req.body;
        const updateData: any = {};

        if (matchStatus) updateData.matchStatus = matchStatus;
        if (matchedWithId !== undefined) updateData.matchedWithId = matchedWithId;
        if (notes !== undefined) updateData.notes = notes;

        // If matching, also update the other line
        if (matchStatus === 'MATCHED' && matchedWithId) {
            await db.update(bankReconciliationLines)
                .set({ matchStatus: 'MATCHED', matchedWithId: req.params.lineId })
                .where(eq(bankReconciliationLines.id, matchedWithId));
        }

        // If unmatching, also unmatch the other line
        if (matchStatus === 'UNMATCHED') {
            const [currentLine] = await db.select()
                .from(bankReconciliationLines)
                .where(eq(bankReconciliationLines.id, req.params.lineId));
            if (currentLine?.matchedWithId) {
                await db.update(bankReconciliationLines)
                    .set({ matchStatus: 'UNMATCHED', matchedWithId: null })
                    .where(eq(bankReconciliationLines.id, currentLine.matchedWithId));
            }
            updateData.matchedWithId = null;
        }

        const [updated] = await db.update(bankReconciliationLines)
            .set(updateData)
            .where(eq(bankReconciliationLines.id, req.params.lineId))
            .returning();

        if (!updated) return res.status(404).json({ error: "Ligne introuvable" });

        await hrStorage.updateReconciliationSessionStats(req.params.id);
        res.json(updated);
    } catch (error) {
        logger.error({ err: error }, "Erreur modification ligne rapprochement");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/paie/reconciliation/:id/complete - Clôturer session
hrRouter.post("/paie/reconciliation/:id/complete", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const user = (req as any).user;

        const [updated] = await db.update(bankReconciliationSessions)
            .set({ statut: 'COMPLETED', completedAt: new Date(), completedBy: user.id })
            .where(eq(bankReconciliationSessions.id, req.params.id))
            .returning();

        if (!updated) return res.status(404).json({ error: "Session introuvable" });
        res.json(updated);
    } catch (error) {
        logger.error({ err: error }, "Erreur clôture session rapprochement");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// ================================================
// PROJETS RH - Gestion du temps projet
// ================================================

// GET /api/hr/projects
hrRouter.get("/projects", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.READ, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const { statut, agenceId } = req.query as { statut?: string; agenceId?: string };
        const projects = await hrStorage.getProjects({ statut, agenceId });
        res.json(projects);
    } catch (error) {
        logger.error({ err: error }, "Erreur liste projets");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/projects
hrRouter.post("/projects", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const user = (req as any).user;
        const project = await hrStorage.createProject({ ...req.body, createdBy: user.id });
        res.status(201).json(project);
    } catch (error) {
        logger.error({ err: error }, "Erreur création projet");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/projects/:id
hrRouter.get("/projects/:id", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.READ, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const project = await hrStorage.getProjectById(req.params.id);
        if (!project) return res.status(404).json({ error: "Projet introuvable" });
        res.json(project);
    } catch (error) {
        logger.error({ err: error }, "Erreur détail projet");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PUT /api/hr/projects/:id
hrRouter.put("/projects/:id", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const project = await hrStorage.updateProject(req.params.id, req.body);
        if (!project) return res.status(404).json({ error: "Projet introuvable" });
        res.json(project);
    } catch (error) {
        logger.error({ err: error }, "Erreur modification projet");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// DELETE /api/hr/projects/:id (soft delete - sets status to CANCELLED)
hrRouter.delete("/projects/:id", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const project = await hrStorage.updateProject(req.params.id, { statut: 'CANCELLED' });
        if (!project) return res.status(404).json({ error: "Projet introuvable" });
        res.json(project);
    } catch (error) {
        logger.error({ err: error }, "Erreur annulation projet");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/projects/:id/members
hrRouter.post("/projects/:id/members", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const member = await hrStorage.addProjectMember({
            projetId: req.params.id,
            ...req.body,
        });
        res.status(201).json(member);
    } catch (error) {
        logger.error({ err: error }, "Erreur ajout membre projet");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// DELETE /api/hr/projects/:id/members/:employeId
hrRouter.delete("/projects/:id/members/:employeId", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        await hrStorage.removeProjectMember(req.params.id, req.params.employeId);
        res.json({ success: true });
    } catch (error) {
        logger.error({ err: error }, "Erreur retrait membre projet");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/projects/:id/cost-summary
hrRouter.get("/projects/:id/cost-summary", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.READ, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const summary = await hrStorage.getProjectCostSummary(req.params.id);
        res.json(summary);
    } catch (error) {
        logger.error({ err: error }, "Erreur résumé coûts projet");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// ================================================
// FEUILLES DE TEMPS - Timesheets
// ================================================

// GET /api/hr/timesheets
hrRouter.get("/timesheets", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.READ, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const { employeId, statut, semaine } = req.query as { employeId?: string; statut?: string; semaine?: string };
        const sheets = await hrStorage.getTimesheets({ employeId, statut, semaine });
        res.json(sheets);
    } catch (error) {
        logger.error({ err: error }, "Erreur liste feuilles de temps");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/timesheets/:id
hrRouter.get("/timesheets/:id", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.READ, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const sheet = await hrStorage.getTimesheetById(req.params.id);
        if (!sheet) return res.status(404).json({ error: "Feuille de temps introuvable" });
        res.json(sheet);
    } catch (error) {
        logger.error({ err: error }, "Erreur détail feuille de temps");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/timesheets
hrRouter.post("/timesheets", getAuthUser, attachAbility, async (req, res) => {
    try {
        const user = (req as any).user;
        // Any authenticated user can create their own timesheet
        const sheet = await hrStorage.createOrGetTimesheet(req.body);
        res.status(201).json(sheet);
    } catch (error) {
        logger.error({ err: error }, "Erreur création feuille de temps");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PUT /api/hr/timesheets/:id/entries
hrRouter.put("/timesheets/:id/entries", getAuthUser, attachAbility, async (req, res) => {
    try {
        const entry = await hrStorage.upsertTimeEntry({
            feuilleTempsId: req.params.id,
            ...req.body,
        });
        res.json(entry);
    } catch (error) {
        logger.error({ err: error }, "Erreur upsert entrée temps");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// DELETE /api/hr/timesheets/:id/entries/:entryId
hrRouter.delete("/timesheets/:id/entries/:entryId", getAuthUser, attachAbility, async (req, res) => {
    try {
        await hrStorage.deleteTimeEntry(req.params.entryId);
        res.json({ success: true });
    } catch (error) {
        logger.error({ err: error }, "Erreur suppression entrée temps");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PATCH /api/hr/timesheets/:id/submit
hrRouter.patch("/timesheets/:id/submit", getAuthUser, attachAbility, async (req, res) => {
    try {
        const sheet = await hrStorage.submitTimesheet(req.params.id);
        res.json(sheet);
    } catch (error) {
        logger.error({ err: error }, "Erreur soumission feuille de temps");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PATCH /api/hr/timesheets/:id/approve
hrRouter.patch("/timesheets/:id/approve", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const user = (req as any).user;
        const sheet = await hrStorage.approveTimesheet(req.params.id, user.id);
        if (!sheet) return res.status(404).json({ error: "Feuille de temps introuvable" });
        res.json(sheet);
    } catch (error) {
        logger.error({ err: error }, "Erreur approbation feuille de temps");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PATCH /api/hr/timesheets/:id/reject
hrRouter.patch("/timesheets/:id/reject", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const { motif } = req.body;
        const sheet = await hrStorage.rejectTimesheet(req.params.id, motif || '');
        res.json(sheet);
    } catch (error) {
        logger.error({ err: error }, "Erreur rejet feuille de temps");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/presence/week - Pointages d'un employé pour une semaine (lien feuille de temps)
hrRouter.get("/presence/week", getAuthUser, async (req, res) => {
    try {
        const { employeId, dateDebut, dateFin } = req.query as { employeId?: string; dateDebut?: string; dateFin?: string };
        if (!employeId || !dateDebut || !dateFin) {
            return res.status(400).json({ error: "employeId, dateDebut et dateFin requis" });
        }
        const records = await hrStorage.getPresenceForWeek(employeId, dateDebut, dateFin);
        res.json(records);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération présences semaine");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/time-allocation/:employeId
hrRouter.get("/time-allocation/:employeId", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.READ, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const { from, to } = req.query as { from?: string; to?: string };
        const allocation = await hrStorage.getEmployeeTimeAllocation(req.params.employeId, from, to);
        res.json(allocation);
    } catch (error) {
        logger.error({ err: error }, "Erreur allocation temps employé");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// ================================================
// MON ESPACE - Portail employé self-service
// ================================================

// GET /api/hr/my/dashboard
hrRouter.get("/my/dashboard", getAuthUser, async (req, res) => {
    try {
        const user = (req as any).user;
        const [emp] = await db.select().from(employes).where(eq(employes.userId, user.id));
        if (!emp) return res.status(404).json({ error: "Profil employé introuvable" });
        const dashboard = await hrStorage.getMyDashboard(emp.id);
        res.json(dashboard);
    } catch (error) {
        logger.error({ err: error }, "Erreur dashboard Mon Espace");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/my/presence
hrRouter.get("/my/presence", getAuthUser, async (req, res) => {
    try {
        const user = (req as any).user;
        const [emp] = await db.select().from(employes).where(eq(employes.userId, user.id));
        if (!emp) return res.status(404).json({ error: "Profil employé introuvable" });
        const { mois } = req.query as { mois?: string };
        const presenceList = await hrStorage.getMyPresence(emp.id, mois);
        res.json(presenceList);
    } catch (error) {
        logger.error({ err: error }, "Erreur présence Mon Espace");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/my/evaluations
hrRouter.get("/my/evaluations", getAuthUser, async (req, res) => {
    try {
        const user = (req as any).user;
        const [emp] = await db.select().from(employes).where(eq(employes.userId, user.id));
        if (!emp) return res.status(404).json({ error: "Profil employé introuvable" });
        const evals = await hrStorage.getMyEvaluations(emp.id);
        res.json(evals);
    } catch (error) {
        logger.error({ err: error }, "Erreur évaluations Mon Espace");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PUT /api/hr/my/profile
hrRouter.put("/my/profile", getAuthUser, async (req, res) => {
    try {
        const user = (req as any).user;
        const [emp] = await db.select().from(employes).where(eq(employes.userId, user.id));
        if (!emp) return res.status(404).json({ error: "Profil employé introuvable" });
        const updated = await hrStorage.updateMyProfile(emp.id, req.body);
        if (!updated) return res.status(404).json({ error: "Mise à jour échouée" });
        res.json(updated);
    } catch (error) {
        logger.error({ err: error }, "Erreur mise à jour profil Mon Espace");
        res.status(500).json({ error: "Erreur serveur" });
    }
});
