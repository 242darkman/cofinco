/**
 * Utilitaires partagés des routes RH : uploads multer, diffusion WebSocket,
 * réponses normalisées, calcul d'ancienneté et génération des bulletins PDF.
 */
import { createLogger } from "../../lib/logger";
import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { bulletinsPaie, presences, employes, leaveBalances, jobPositions, payslipLines, conventionsCollectives, qualificationCoefficients } from "@shared/schema";
import { systemSettings } from "@shared/schema/settings";
import { agences } from "@shared/schema/agences";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { storage } from "../../storage";
import { generatePayslipPdf } from "../../services/payslip-pdf-service";
import type { PayslipPdfData } from "../../services/payslip-pdf-types";
import { users } from "@shared/schema";
import { getWsInstance } from "../../ws-server";
import { enqueueNotification, sendInAppNotification } from "../../services/notifications/notification-service";
import multer from "multer";
import { StorageService } from "../../services/storage-service";
/** Logger commun aux routes RH. */
export const logger = createLogger("Routes:HR");

export const csvUpload = multer({
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

export const docUpload = multer({
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

export const bankStatementUpload = multer({
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



// ============================================
// HELPER: Standardized HR WebSocket broadcast
// ============================================
export interface HrEventPayload {
  entity: 'employe' | 'conge' | 'presence' | 'paie' | 'bulletin' | 'formation' | 'sanction' | 'avantage' | 'candidature' | 'organigramme' | 'payroll_run' | 'document_request';
  action: 'created' | 'updated' | 'approved' | 'rejected' | 'paid' | 'deleted' | 'assigned' | 'generated' | 'validated';
  id: string | number;
  agenceId?: string;
  employeId?: string;
  extra?: Record<string, any>;
}

export function broadcastHrUpdate(payload: HrEventPayload, actor?: { id: string; name: string }) {
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
export function broadcastHrEvent(payload: Partial<HrEventPayload>) {
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
export function successResponse<T>(data: T, meta?: any) {
  return { success: true, data, ...(meta && { meta }) };
}

export function errorResponse(code: string, message: string, details?: any) {
  return { success: false, code, message, ...(details && { details }) };
}

// ============================================
// HELPER: Calculate ancienneté (seniority) from dateEmbauche
// ============================================

export function computeAnciennete(dateEmbauche: string | null, refDate?: string): string | null {
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

export type BulletinRow = typeof bulletinsPaie.$inferSelect;

export async function generatePdfsAndSendEmails(
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

export const SANCTION_WORKFLOW_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['NOTIFIED'],
  NOTIFIED: ['ACKNOWLEDGED'],
  ACKNOWLEDGED: ['APPEALED', 'FINAL'],
  APPEALED: ['FINAL'],
};
