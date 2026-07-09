import { Router } from "express";
/**
 * Routes RH — Bulletins de paie : génération PDF et distribution aux employés.
 *
 * Monté sous /api/hr par le routeur d'index (hr.ts).
 * Endpoints :
 *   GET    /api/hr/bulletins
 *   GET    /api/hr/bulletins/:id
 *   POST   /api/hr/bulletins
 *   POST   /api/hr/bulletins/:id/mark-read
 */
import { db } from "../../db";
import { bulletinsPaie, presences, employes, leaveBalances, jobPositions, payslipLines, conventionsCollectives, qualificationCoefficients, salaryPaymentJobs } from "@shared/schema";
import { systemSettings } from "@shared/schema/settings";
import { agences } from "@shared/schema/agences";
import { StatutCandidature, StatutConge, StatutUser, StatutVisiteTerrain, StatutArchive } from "@shared/enum/status-constants";
import { eq, desc, and, gte, lte, isNull } from "drizzle-orm";
import { getAuthUser } from "../../middleware";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { users } from "@shared/schema";
import { getWsInstance } from "../../ws-server";
import { logger, computeAnciennete } from "./shared";

export const bulletinsRouter = Router();

/**
 * ========================================
 * BULLETINS DE PAIE
 * ========================================
 */

// GET /api/hr/bulletins - Liste des bulletins de paie
/**
 * GET /api/hr/bulletins
 */
bulletinsRouter.get("/bulletins", getAuthUser, attachAbility, async (req, res) => {
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
/**
 * GET /api/hr/bulletins/:id
 */
bulletinsRouter.get("/bulletins/:id", getAuthUser, attachAbility, async (req, res) => {
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

// POST /api/hr/bulletins - Archiver un bulletin de paie
/**
 * POST /api/hr/bulletins
 */
bulletinsRouter.post("/bulletins", getAuthUser, attachAbility, requireAbility(Actions.CREATE, Subjects.PAIE), async (req, res) => {
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

// POST /api/hr/bulletins/:id/mark-read — employee marks bulletin as viewed
/**
 * POST /api/hr/bulletins/:id/mark-read
 */
bulletinsRouter.post("/bulletins/:id/mark-read", getAuthUser, attachAbility, async (req, res) => {
    try {
        const user = (req as any).user;
        const bulletinId = parseInt(req.params.id);
        if (isNaN(bulletinId)) return res.status(400).json({ error: "ID invalide" });

        const [emp] = await db.select({ id: employes.id }).from(employes).where(eq(employes.userId, user.id)).limit(1);
        if (!emp) return res.status(403).json({ error: "Profil employé introuvable" });

        // Only mark as read if it belongs to the employee and not already read
        await db.update(bulletinsPaie)
            .set({ viewedAt: new Date() })
            .where(and(
                eq(bulletinsPaie.id, bulletinId),
                eq(bulletinsPaie.employeId, emp.id),
                isNull(bulletinsPaie.viewedAt),
            ));

        res.json({ ok: true });
    } catch (error) {
        logger.error({ err: error }, "Erreur mark-read bulletin");
        res.status(500).json({ error: "Erreur serveur" });
    }
});
