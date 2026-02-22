import type { Express, Request, Response } from "express";
import { createLogger } from "../lib/logger";
import { storage } from "../storage";

const logger = createLogger('Routes:Accounting');
import { insertJournalSchema, insertDeclarationTvaSchema } from "@shared/schema";
import { normalizeKeysDeep, toHttpError, getErrorMessage, manualEntrySchema } from "./utils";
import { requireAuth } from "../auth";
import { attachAbility, requireAbility } from "../authorization";
import { Actions, Subjects } from "@shared/ability";
import { getWsInstance } from "../ws-server";
import accountingPostingService from "../services/accounting-posting-service";
import {
  generateJournalCentralisateur, journalCentralisateurToMarkdown,
  generateBilan, bilanToMarkdown,
  generateCompteResultat, compteResultatToMarkdown,
  generateLivreInventaire, livreInventaireToMarkdown,
  generateTrialBalance,
} from "../services/gl-reporting-service";
import { calculateProvisions, getProvisionSummary } from "../services/provision-service";
import { lettrerLignes, delettrerLignes, autoLettrage, getLignesNonLettrees, getBalanceAgee } from "../services/lettrage-service";
import { generateFEC, previewFEC } from "../services/fec-export-service";
import { clotureExercice, executeClotureStep, getClotureStatus } from "../services/exercice-cloture-service";
import { createRapprochement, importBankLines, autoMatch, manualMatch, unmatch, completeRapprochement, getRapprochementDetail, listRapprochements } from "../services/rapprochement-bancaire-service";
import { calculateAmortissements, getAmortissementSummary } from "../services/amortissement-service";
import { exportComptable } from "../services/export-comptable-service";
import { calculateCobacRatios, getCurrentRatios, getRatiosHistory, getSeuils, updateSeuil } from "../services/cobac-ratios-service";
import { generateDsf, getDsf, listDsf, validateDsf } from "../services/dsf-service";
import { getBalanceAnalytique, getCompteResultatAnalytique } from "../services/analytique-service";
import { syncEngagementsFromCredits, createEngagement, updateEngagement, getEtatEngagements, listEngagements } from "../services/engagements-hors-bilan-service";
import { generateConsolidatedBilan, generateConsolidatedCompteResultat, generateConsolidationReport } from "../services/consolidation-service";
import { generateTafire } from "../services/tafire-service";
import { runCobacReporting } from "../cron/cobac-reporting-scheduler";
import { db } from "../db";
import { glPeriods, glPostingLinks, ecritures, lignesEcritures, planComptable, journaux, mouvementsFinanciers, accountingRules, provisionsCredits, exercices, immobilisations, amortissements } from "@shared/schema";
import { centresCouts, lignesProduits, clesRepartition, clesRepartitionLignes } from "@shared/schema/analytique";
import { eq, and, desc, asc, sql, count, gte, lte, ne } from "drizzle-orm";
import { SystemRole } from "@shared/types/roles";

/** Typed Express Request with authenticated user from requireAuth middleware */
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    nom: string;
    prenom: string | null;
    role: SystemRole;
    agence?: string | null;
    agenceId?: string | null;
    email?: string;
    telephone?: string;
  };
}

export function registerAccountingRoutes(app: Express) {

  // 1. Plan Comptable (roles: admin, chef, comptable)
  app.get("/api/comptabilite/comptes", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (_req, res) => {
    const comptes = await storage.getAllComptesComptables();
    res.json(comptes);
  });

  app.get("/api/comptabilite/plan-ohada", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (_req, res) => {
    // Return accounts with real-time calculated balances
    const comptes = await storage.getAllComptesComptablesWithBalances();
    res.json(comptes);
  });

  // 2. Journaux (roles: admin, chef, comptable)
  app.get("/api/comptabilite/journaux", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (_req, res) => {
    const journaux = await storage.getAllJournaux();
    res.json(journaux);
  });

  // Create journal (roles: admin, comptable)
  app.post("/api/comptabilite/journaux", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req, res) => {
    try {
      const data = insertJournalSchema.parse(normalizeKeysDeep(req.body));
      const journal = await storage.createJournal(data);

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "ACCOUNTING_UPDATE", payload: { type: 'journal_new', id: journal.id } });
      }

      res.json(journal);
    } catch (error: unknown) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message, details: err.details });
    }
  });

  // 3. TVA (roles: admin, chef, comptable)
  app.get("/api/comptabilite/declarations-tva", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (_req, res) => {
    const declarations = await storage.getDeclarationsTva();
    res.json(declarations);
  });

  // Create déclaration TVA (roles: admin, comptable)
  app.post("/api/comptabilite/declarations-tva", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req, res) => {
    try {
      const data = insertDeclarationTvaSchema.parse(normalizeKeysDeep(req.body));
      const declaration = await storage.createDeclarationTva(data);

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "ACCOUNTING_UPDATE", payload: { type: 'tva_new', id: declaration.id } });
      }

      res.json(declaration);
    } catch (error: unknown) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message, details: err.details });
    }
  });

  // 4. Stats Journaux (roles: admin, chef, comptable)
  app.get("/api/comptabilite/journaux-stats", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (_req, res) => {
    const stats = await storage.getJournauxStats();
    res.json(stats);
  });

  // 5. Compte de Résultat (roles: admin, chef, comptable)
  app.get("/api/comptabilite/compte-resultat", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req, res) => {
    const exercice = req.query.exercice as string || String(new Date().getFullYear());
    const dateDebut = `${exercice}-01-01`;
    const dateFin = `${exercice}-12-31`;

    try {
      const balance = await storage.getBalance(dateDebut, dateFin);

      // Classe 6 = Charges, Classe 7 = Produits (OHADA)
      const charges = balance
        .filter(c => c.numero_compte.startsWith('6'))
        .map(c => ({
          numero_compte: c.numero_compte,
          intitule: c.intitule,
          montant: c.total_debit - c.total_credit
        }))
        .filter(c => c.montant !== 0)
        .sort((a, b) => a.numero_compte.localeCompare(b.numero_compte));

      const produits = balance
        .filter(c => c.numero_compte.startsWith('7'))
        .map(c => ({
          numero_compte: c.numero_compte,
          intitule: c.intitule,
          montant: c.total_credit - c.total_debit
        }))
        .filter(c => c.montant !== 0)
        .sort((a, b) => a.numero_compte.localeCompare(b.numero_compte));

      const totalCharges = charges.reduce((sum, c) => sum + c.montant, 0);
      const totalProduits = produits.reduce((sum, c) => sum + c.montant, 0);
      const resultatNet = totalProduits - totalCharges;
      const margeNette = totalProduits > 0 ? (resultatNet / totalProduits) * 100 : 0;

      res.json({
        exercice,
        charges,
        produits,
        totalCharges,
        totalProduits,
        resultatNet,
        margeNette,
        type: resultatNet >= 0 ? 'benefice' : 'perte'
      });
    } catch (error: unknown) {
      logger.error({ err: error }, 'Erreur compte de résultat');
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // 9b. Écritures filtrées par journal (roles: admin, chef, comptable)
  app.get("/api/comptabilite/journaux/:journalId/ecritures", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req, res) => {
    try {
      const { journalId } = req.params;
      const dateDebut = req.query.dateDebut as string;
      const dateFin = req.query.dateFin as string;

      const entries = await storage.getAllEcritures({
        journalId,
        dateDebut,
        dateFin
      });

      res.json(entries);
    } catch (error: unknown) {
      logger.error({ err: error }, 'Erreur écritures journal');
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // 10. Tableau de Trésorerie (roles: admin, chef, comptable)
  app.get("/api/comptabilite/tableau-tresorerie", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req, res) => {
    const dateDebut = req.query.dateDebut as string || new Date().getFullYear() + '-01-01';
    const dateFin = req.query.dateFin as string || new Date().toISOString().split('T')[0];

    try {
      // Calcul basé sur les mouvements des comptes de trésorerie (classe 5)
      const balance = await storage.getBalance(dateDebut, dateFin);

      // Filtrer par type de compte pour catégoriser les flux
      const tresorerieComptes = balance.filter(c => c.numero_compte.startsWith('5'));
      const chargesComptes = balance.filter(c => c.numero_compte.startsWith('6'));
      const produitsComptes = balance.filter(c => c.numero_compte.startsWith('7'));
      const immosComptes = balance.filter(c => c.numero_compte.startsWith('2'));
      const capitauxComptes = balance.filter(c => c.numero_compte.startsWith('1'));

      const calcNetFlow = (comptes: Array<Record<string, unknown>>) => comptes.reduce((sum, c) =>
        sum + (Number(c.total_debit) || 0) - (Number(c.total_credit) || 0), 0);

      const result = {
        exploitation: [
          { categorie: 'Exploitation', libelle: 'Encaissements clients', montant: Math.abs(calcNetFlow(produitsComptes)), type: 'entree' as const },
          { categorie: 'Exploitation', libelle: 'Décaissements fournisseurs', montant: Math.abs(calcNetFlow(chargesComptes.filter(c => c.numero_compte.startsWith('60') || c.numero_compte.startsWith('61')))), type: 'sortie' as const },
          { categorie: 'Exploitation', libelle: 'Charges de personnel', montant: Math.abs(calcNetFlow(chargesComptes.filter(c => c.numero_compte.startsWith('66')))), type: 'sortie' as const },
          { categorie: 'Exploitation', libelle: 'Impôts et taxes', montant: Math.abs(calcNetFlow(chargesComptes.filter(c => c.numero_compte.startsWith('64')))), type: 'sortie' as const },
        ],
        investissement: [
          { categorie: 'Investissement', libelle: 'Acquisitions immobilisations', montant: Math.abs(calcNetFlow(immosComptes.filter(c => c.solde_debiteur > 0))), type: 'sortie' as const },
          { categorie: 'Investissement', libelle: 'Cessions immobilisations', montant: Math.abs(calcNetFlow(immosComptes.filter(c => c.solde_crediteur > 0))), type: 'entree' as const },
        ],
        financement: [
          { categorie: 'Financement', libelle: 'Augmentation capital', montant: Math.abs(calcNetFlow(capitauxComptes.filter(c => c.numero_compte.startsWith('10')))), type: 'entree' as const },
          { categorie: 'Financement', libelle: 'Emprunts', montant: Math.abs(calcNetFlow(capitauxComptes.filter(c => c.numero_compte.startsWith('16') && c.solde_crediteur > 0))), type: 'entree' as const },
          { categorie: 'Financement', libelle: 'Remboursement emprunts', montant: Math.abs(calcNetFlow(capitauxComptes.filter(c => c.numero_compte.startsWith('16') && c.solde_debiteur > 0))), type: 'sortie' as const },
          { categorie: 'Financement', libelle: 'Dividendes versés', montant: 0, type: 'sortie' as const },
        ],
        soldeDebut: calcNetFlow(tresorerieComptes.filter(() => false)), // Placeholder - would need historical data
        soldeFin: calcNetFlow(tresorerieComptes)
      };

      res.json(result);
    } catch (error: unknown) {
      logger.error({ err: error }, 'Erreur tableau trésorerie');
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // 10. TAFIRE (Tableau Financier des Ressources et Emplois) — OHADA complet
  app.get("/api/comptabilite/tafire", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const exercice = parseInt(req.query.exercice as string) || new Date().getFullYear();
      const agenceId = req.query.consolide === 'true' ? null : (req.user?.agenceId || req.query.agenceId as string);

      if (!agenceId && req.query.consolide !== 'true') {
        return res.status(400).json({ message: "agenceId requis (ou consolide=true)" });
      }

      const result = await generateTafire(exercice, agenceId);
      res.json(result);
    } catch (error) {
      logger.error({ err: error }, 'Erreur TAFIRE');
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // ============================================================================
  // NEW ENDPOINTS - ENHANCED ACCOUNTING WITH POSTING ENGINE
  // ============================================================================

  // 11. Grand Livre V2 - With Running Balance (roles: admin, chef, comptable)
  app.get("/api/comptabilite/v2/grand-livre/:compteId", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: Request, res: Response) => {
    try {
      const { compteId } = req.params;
      const agenceId = (req as AuthenticatedRequest).user?.agenceId;

      if (!agenceId) {
        return res.status(400).json({ message: "Agence non définie" });
      }

      const dateDebut = req.query.dateDebut as string || new Date().getFullYear() + '-01-01';
      const dateFin = req.query.dateFin as string || new Date().toISOString().split('T')[0];
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 50;

      const result = await accountingPostingService.getGrandLivre(
        compteId,
        agenceId,
        dateDebut,
        dateFin,
        page,
        pageSize
      );

      res.json(result);
    } catch (error: unknown) {
      logger.error({ err: error }, 'Erreur Grand Livre');
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // 12. Balance V2 - Enhanced Trial Balance (roles: admin, chef, comptable)
  app.get("/api/comptabilite/v2/balance", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: Request, res: Response) => {
    try {
      const agenceId = (req as AuthenticatedRequest).user?.agenceId;

      if (!agenceId) {
        return res.status(400).json({ message: "Agence non définie" });
      }

      const dateDebut = req.query.dateDebut as string || new Date().getFullYear() + '-01-01';
      const dateFin = req.query.dateFin as string || new Date().toISOString().split('T')[0];
      const classe = req.query.classe ? parseInt(req.query.classe as string) : undefined;

      const result = await accountingPostingService.getBalance(
        agenceId,
        dateDebut,
        dateFin,
        classe
      );

      res.json(result);
    } catch (error: unknown) {
      logger.error({ err: error }, 'Erreur Balance');
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // 12b. Bilan V2 - Computed from GL Posting Service (roles: admin, chef, comptable)
  app.get("/api/comptabilite/v2/bilan", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: Request, res: Response) => {
    try {
      const agenceId = (req as AuthenticatedRequest).user?.agenceId;

      if (!agenceId) {
        return res.status(400).json({ message: "Agence non définie" });
      }

      const dateFin = req.query.dateFin as string || new Date().toISOString().split('T')[0];

      // Get all balances from inception to dateFin
      const balanceData = await accountingPostingService.getBalance(
        agenceId,
        '2000-01-01',
        dateFin
      );

      const entries = balanceData.entries;

      // Helper: net balance for given prefixes (debit - credit)
      const getNetBalance = (prefixes: string[]) =>
        entries
          .filter(e => prefixes.some(p => e.numeroCompte.startsWith(p)))
          .reduce((sum, e) => sum + e.soldeDebiteur - e.soldeCrediteur, 0);

      // OHADA Bilan structure
      // Actif (normally debit balances)
      const actifImmobilise = getNetBalance(['2']);
      const actifCirculant = getNetBalance(['3', '41', '42', '43', '44', '45', '46', '47']);
      const tresorerieActif = getNetBalance(['5']);

      // Passif (normally credit balances, so we negate)
      const capitauxPropres = -getNetBalance(['1']);
      const dettesFinancieres = -getNetBalance(['16']);
      const passifCirculant = -getNetBalance(['40', '42', '43', '44', '48', '49']);

      const actifTotal = Math.max(0, actifImmobilise) + Math.max(0, actifCirculant) + Math.max(0, tresorerieActif);
      const passifTotal = Math.max(0, capitauxPropres) + Math.max(0, dettesFinancieres) + Math.max(0, passifCirculant);

      res.json({
        actif: {
          immobilise: Math.max(0, actifImmobilise),
          circulant: Math.max(0, actifCirculant),
          tresorerie: Math.max(0, tresorerieActif),
          total: actifTotal,
        },
        passif: {
          capitaux: Math.max(0, capitauxPropres),
          dettes: Math.max(0, dettesFinancieres),
          circulant: Math.max(0, passifCirculant),
          total: passifTotal,
        },
        isEquilibre: Math.abs(actifTotal - passifTotal) < 1,
        dateFin,
      });
    } catch (error: unknown) {
      logger.error({ err: error }, 'Erreur Bilan');
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // 13. Periods Management (roles: admin, chef, comptable)
  app.get("/api/comptabilite/periods", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: Request, res: Response) => {
    try {
      const agenceId = (req as AuthenticatedRequest).user?.agenceId;

      if (!agenceId) {
        return res.status(400).json({ message: "Agence non définie" });
      }

      const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();

      const periods = await db
        .select()
        .from(glPeriods)
        .where(and(eq(glPeriods.agenceId, agenceId), eq(glPeriods.year, year)))
        .orderBy(asc(glPeriods.month));

      res.json(periods);
    } catch (error: unknown) {
      logger.error({ err: error }, 'Erreur récupération périodes');
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // 14. Close Period (roles: admin, comptable)
  app.post("/api/comptabilite/periods/close", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.COMPTABILITE), async (req: Request, res: Response) => {
    try {
      const user = (req as AuthenticatedRequest).user;
      const agenceId = user?.agenceId;
      const userId = user?.id;

      if (!agenceId || !userId) {
        return res.status(400).json({ message: "Agence ou utilisateur non défini" });
      }

      const { year, month, notes } = req.body;

      if (!year || !month) {
        return res.status(400).json({ message: "Année et mois requis" });
      }

      await accountingPostingService.closePeriod({
        agenceId,
        year: parseInt(year),
        month: parseInt(month),
        userId,
        notes
      });

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({ type: "ACCOUNTING_UPDATE", payload: { type: 'period_closed', year, month } });
      }

      res.json({ success: true, message: `Période ${month}/${year} clôturée` });
    } catch (error: unknown) {
      logger.error({ err: error }, 'Erreur clôture période');
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // 15. Reverse Entry (Extourne) (roles: admin, comptable)
  app.post("/api/comptabilite/entries/:ecritureId/reverse", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.COMPTABILITE), async (req: Request, res: Response) => {
    try {
      const { ecritureId } = req.params;
      const agenceId = (req as AuthenticatedRequest).user?.agenceId;
      const userId = (req as AuthenticatedRequest).user?.id;

      if (!agenceId) {
        return res.status(400).json({ message: "Agence non définie" });
      }

      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({ message: "Motif d'extourne requis" });
      }

      const result = await accountingPostingService.reverseEntry({
        ecritureId,
        reason,
        userId,
        agenceId
      });

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "ACCOUNTING_UPDATE",
          payload: {
            type: 'entry_reversed',
            originalId: result.originalEcritureId,
            reversalId: result.reversalEcritureId
          }
        });
      }

      res.json(result);
    } catch (error: unknown) {
      logger.error({ err: error }, 'Erreur extourne');
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // 16. Get Entry Details with Lines (roles: admin, chef, comptable)
  app.get("/api/comptabilite/entries/:ecritureId", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: Request, res: Response) => {
    try {
      const { ecritureId } = req.params;

      // Get entry header
      const [entry] = await db
        .select()
        .from(ecritures)
        .where(eq(ecritures.id, ecritureId))
        .limit(1);

      if (!entry) {
        return res.status(404).json({ message: "Écriture non trouvée" });
      }

      // Get journal info
      const [journal] = await db
        .select()
        .from(journaux)
        .where(eq(journaux.id, entry.journalId))
        .limit(1);

      // Get lines
      const lines = await db
        .select({
          id: lignesEcritures.id,
          compteId: lignesEcritures.compteId,
          numeroCompte: lignesEcritures.numeroCompte,
          compteIntitule: planComptable.intitule,
          libelle: lignesEcritures.libelle,
          debit: lignesEcritures.debit,
          credit: lignesEcritures.credit,
          refExterne: lignesEcritures.refExterne,
        })
        .from(lignesEcritures)
        .leftJoin(planComptable, eq(lignesEcritures.compteId, planComptable.id))
        .where(eq(lignesEcritures.ecritureId, ecritureId))
        .orderBy(desc(lignesEcritures.debit));

      // Calculate totals
      const totalDebit = lines.reduce((sum, l) => sum + parseFloat(l.debit), 0);
      const totalCredit = lines.reduce((sum, l) => sum + parseFloat(l.credit), 0);

      res.json({
        ...(entry as Record<string, unknown>),
        journal: journal ? journal : null,
        lignes: lines,
        total_debit: totalDebit,
        total_credit: totalCredit,
        is_balanced: Math.abs(totalDebit - totalCredit) < 0.01
      });
    } catch (error: unknown) {
      logger.error({ err: error }, 'Erreur détail écriture');
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // 17. Check if Source is Posted (roles: admin, chef, comptable)
  app.get("/api/comptabilite/posting-status/:sourceType/:sourceId", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: Request, res: Response) => {
    try {
      const { sourceType, sourceId } = req.params;
      const agenceId = (req as AuthenticatedRequest).user?.agenceId;

      if (!agenceId) {
        return res.status(400).json({ message: "Agence non définie" });
      }

      const [link] = await db
        .select()
        .from(glPostingLinks)
        .where(and(
          eq(glPostingLinks.agenceId, agenceId),
          eq(glPostingLinks.sourceType, sourceType),
          eq(glPostingLinks.sourceId, sourceId)
        ))
        .limit(1);

      if (link) {
        // Get entry details
        const [entry] = await db
          .select()
          .from(ecritures)
          .where(eq(ecritures.id, link.ecritureId))
          .limit(1);

        res.json({
          posted: true,
          ecritureId: link.ecritureId,
          numeroPiece: entry?.numeroPiece,
          statut: entry?.statut,
          dateEcriture: entry?.dateEcriture
        });
      } else {
        res.json({ posted: false });
      }
    } catch (error: unknown) {
      logger.error({ err: error }, 'Erreur vérification posting');
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // 18. Get Posted Entries by Source Type (roles: admin, chef, comptable)
  app.get("/api/comptabilite/entries-by-source/:sourceType", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: Request, res: Response) => {
    try {
      const { sourceType } = req.params;
      const agenceId = (req as AuthenticatedRequest).user?.agenceId;

      if (!agenceId) {
        return res.status(400).json({ message: "Agence non définie" });
      }

      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 50;
      const offset = (page - 1) * pageSize;

      const entries = await db
        .select({
          id: ecritures.id,
          dateEcriture: ecritures.dateEcriture,
          numeroPiece: ecritures.numeroPiece,
          libelle: ecritures.libelle,
          statut: ecritures.statut,
          sourceType: ecritures.sourceType,
          sourceId: ecritures.sourceId,
          metadata: ecritures.metadata,
          journalCode: journaux.code,
          journalIntitule: journaux.intitule,
        })
        .from(ecritures)
        .leftJoin(journaux, eq(ecritures.journalId, journaux.id))
        .where(and(
          eq(ecritures.agenceId, agenceId),
          eq(ecritures.sourceType, sourceType)
        ))
        .orderBy(desc(ecritures.dateEcriture))
        .limit(pageSize)
        .offset(offset);

      res.json(entries);
    } catch (error: unknown) {
      logger.error({ err: error }, 'Erreur récupération écritures par source');
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // 19. Manual Post Entry (roles: admin, comptable)
  // For manual accounting entries (not auto-posted from business transactions)
  app.post("/api/comptabilite/v2/ecritures", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: Request, res: Response) => {
    try {
      const agenceId = (req as AuthenticatedRequest).user?.agenceId;
      const userId = (req as AuthenticatedRequest).user?.id;

      if (!agenceId) {
        return res.status(400).json({ code: "VALIDATION_ERROR", message: "Agence non définie" });
      }

      // Strict Zod validation — replaces loose req.body destructuring
      const parsed = manualEntrySchema.parse(req.body);
      const { journalCode, dateEcriture, libelle, lignes } = parsed;

      // Resolve account IDs / numbers from DB
      const processedLines = [];
      for (const ligne of lignes) {
        let compteId = ligne.compteId;
        let numeroCompte = ligne.numeroCompte;

        if (!compteId && numeroCompte) {
          const [compte] = await db
            .select()
            .from(planComptable)
            .where(eq(planComptable.numeroCompte, numeroCompte))
            .limit(1);

          if (!compte) {
            return res.status(400).json({ code: "NOT_FOUND", message: `Compte non trouvé: ${numeroCompte}` });
          }
          compteId = compte.id;
        } else if (compteId && !numeroCompte) {
          const [compte] = await db
            .select()
            .from(planComptable)
            .where(eq(planComptable.id, compteId))
            .limit(1);

          if (!compte) {
            return res.status(400).json({ code: "NOT_FOUND", message: `Compte non trouvé: ${compteId}` });
          }
          numeroCompte = compte.numeroCompte;
        }

        processedLines.push({
          compteId: compteId!,
          numeroCompte: numeroCompte!,
          libelle: ligne.libelle || libelle,
          debit: ligne.debit,
          credit: ligne.credit,
          refExterne: ligne.refExterne,
        });
      }

      // Generate unique source ID for manual entries
      const { randomBytes } = require('crypto');
      const manualSourceId = `manual-${Date.now()}-${randomBytes(5).toString('hex').slice(0, 9)}`;

      const result = await accountingPostingService.postEntry({
        agenceId,
        sourceType: "MANUAL",
        sourceId: manualSourceId,
        journalCode,
        entryDate: new Date(dateEcriture),
        description: libelle,
        lines: processedLines,
        metadata: { manualEntry: true },
        userId,
      });

      // WebSocket notification is handled by postEntry() internally

      res.json({
        success: true,
        ...result,
      });
    } catch (error: unknown) {
      logger.error({ err: error }, 'Erreur création écriture manuelle');
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message, details: err.details });
    }
  });

  // ============================================================================
  // OHADA REPORTING ENDPOINTS (GL Reporting Service)
  // ============================================================================

  // 20. Journal Centralisateur Mensuel (roles: admin, chef, comptable)
  app.get("/api/comptabilite/reports/journal-centralisateur", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: Request, res: Response) => {
    try {
      const agenceId = (req as AuthenticatedRequest).user?.agenceId;
      if (!agenceId) return res.status(400).json({ message: "Agence non définie" });

      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;

      const data = await generateJournalCentralisateur(agenceId, year, month);

      if (req.query.format === "markdown") {
        res.type("text/markdown").send(journalCentralisateurToMarkdown(data));
      } else {
        res.json(data);
      }
    } catch (error: unknown) {
      logger.error({ err: error }, 'Erreur journal centralisateur');
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // 21. Balance des Comptes / Trial Balance (roles: admin, chef, comptable)
  app.get("/api/comptabilite/reports/balance", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: Request, res: Response) => {
    try {
      const agenceId = (req as AuthenticatedRequest).user?.agenceId;
      if (!agenceId) return res.status(400).json({ message: "Agence non définie" });

      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;

      const data = await generateTrialBalance(agenceId, year, month);
      res.json(data);
    } catch (error: unknown) {
      logger.error({ err: error }, 'Erreur balance des comptes');
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // 22. Bilan OHADA (roles: admin, chef, comptable)
  app.get("/api/comptabilite/reports/bilan", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: Request, res: Response) => {
    try {
      const agenceId = (req as AuthenticatedRequest).user?.agenceId;
      if (!agenceId) return res.status(400).json({ message: "Agence non définie" });

      const dateArret = req.query.dateArret as string || new Date().toISOString().split('T')[0];

      const data = await generateBilan(agenceId, dateArret);

      if (req.query.format === "markdown") {
        res.type("text/markdown").send(bilanToMarkdown(data));
      } else {
        res.json(data);
      }
    } catch (error: unknown) {
      logger.error({ err: error }, 'Erreur bilan OHADA');
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // 23. Compte de Résultat OHADA (roles: admin, chef, comptable)
  app.get("/api/comptabilite/reports/compte-resultat", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: Request, res: Response) => {
    try {
      const agenceId = (req as AuthenticatedRequest).user?.agenceId;
      if (!agenceId) return res.status(400).json({ message: "Agence non définie" });

      const exercice = req.query.exercice as string || String(new Date().getFullYear());
      const dateDebut = req.query.dateDebut as string || `${exercice}-01-01`;
      const dateFin = req.query.dateFin as string || `${exercice}-12-31`;

      const data = await generateCompteResultat(agenceId, dateDebut, dateFin);

      if (req.query.format === "markdown") {
        res.type("text/markdown").send(compteResultatToMarkdown(data));
      } else {
        res.json(data);
      }
    } catch (error: unknown) {
      logger.error({ err: error }, 'Erreur compte de résultat OHADA');
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // 24. Livre d'Inventaire (roles: admin, chef, comptable)
  app.get("/api/comptabilite/reports/livre-inventaire", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: Request, res: Response) => {
    try {
      const agenceId = (req as AuthenticatedRequest).user?.agenceId;
      if (!agenceId) return res.status(400).json({ message: "Agence non définie" });

      const dateInventaire = req.query.dateInventaire as string || new Date().toISOString().split('T')[0];

      const data = await generateLivreInventaire(agenceId, dateInventaire);

      if (req.query.format === "markdown") {
        res.type("text/markdown").send(livreInventaireToMarkdown(data));
      } else {
        res.json(data);
      }
    } catch (error: unknown) {
      logger.error({ err: error }, 'Erreur livre d\'inventaire');
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // ============================================================================
  // TOMBSTONE ROUTES — Legacy endpoints removed, return 410 Gone
  // ============================================================================

  // ============================================================================
  // COVERAGE & OBSERVABILITY
  // ============================================================================

  /**
   * GET /api/comptabilite/coverage/report
   * Returns GL posting coverage statistics:
   * - Counts by glPostingStatus (PENDING, POSTED, FAILED, SKIPPED)
   * - Coverage percentage (POSTED / total requiring GL)
   * - List of FAILED mouvements with error details
   * - Accounting rules inventory
   */
  app.get("/api/comptabilite/coverage/report", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      // 1. Count mouvements by GL posting status
      const statusCounts = await db
        .select({
          glPostingStatus: mouvementsFinanciers.glPostingStatus,
          count: count(),
        })
        .from(mouvementsFinanciers)
        .groupBy(mouvementsFinanciers.glPostingStatus);

      const statusMap: Record<string, number> = {};
      for (const row of statusCounts) {
        statusMap[row.glPostingStatus || "UNKNOWN"] = row.count;
      }

      const posted = statusMap["POSTED"] || 0;
      const failed = statusMap["FAILED"] || 0;
      const pending = statusMap["PENDING"] || 0;
      const skipped = statusMap["SKIPPED"] || 0;
      const unknown = statusMap["UNKNOWN"] || 0;
      const total = posted + failed + pending + skipped + unknown;
      const requiresGl = posted + failed + pending; // Those that should have GL
      const coveragePercent = requiresGl > 0 ? Math.round((posted / requiresGl) * 10000) / 100 : 100;

      // 2. Get FAILED mouvements (most recent 50)
      const failedMouvements = await db
        .select({
          id: mouvementsFinanciers.id,
          reference: mouvementsFinanciers.reference,
          sourceModule: mouvementsFinanciers.sourceModule,
          typePaiement: mouvementsFinanciers.typePaiement,
          montant: mouvementsFinanciers.montant,
          sens: mouvementsFinanciers.sens,
          glPostingError: mouvementsFinanciers.glPostingError,
          createdAt: mouvementsFinanciers.createdAt,
        })
        .from(mouvementsFinanciers)
        .where(eq(mouvementsFinanciers.glPostingStatus, "FAILED"))
        .orderBy(desc(mouvementsFinanciers.createdAt))
        .limit(50);

      // 3. Accounting rules inventory
      const rules = await db
        .select({
          code: accountingRules.code,
          name: accountingRules.name,
          sourceType: accountingRules.sourceType,
          eventType: accountingRules.eventType,
          journalCode: accountingRules.journalCode,
          debitAccount: accountingRules.debitAccount,
          creditAccount: accountingRules.creditAccount,
          active: accountingRules.active,
        })
        .from(accountingRules)
        .orderBy(asc(accountingRules.code));

      // 4. Coverage by source module
      const moduleBreakdown = await db
        .select({
          sourceModule: mouvementsFinanciers.sourceModule,
          glPostingStatus: mouvementsFinanciers.glPostingStatus,
          count: count(),
        })
        .from(mouvementsFinanciers)
        .groupBy(mouvementsFinanciers.sourceModule, mouvementsFinanciers.glPostingStatus);

      const byModule: Record<string, Record<string, number>> = {};
      for (const row of moduleBreakdown) {
        const mod = row.sourceModule || "UNKNOWN";
        if (!byModule[mod]) byModule[mod] = {};
        byModule[mod][row.glPostingStatus || "UNKNOWN"] = row.count;
      }

      res.json({
        success: true,
        data: {
          summary: {
            total,
            posted,
            failed,
            pending,
            skipped,
            unknown,
            coveragePercent,
            requiresGl,
          },
          byModule,
          failedMouvements,
          rules,
          generatedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error({ err: error }, 'Coverage report generation failed');
      res.status(500).json({ success: false, error: "Failed to generate coverage report" });
    }
  });

  // ======================================================================
  // PROVISIONS
  // ======================================================================

  // List provisions with filters
  app.get("/api/comptabilite/provisions", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const { periodeDate, categorie, page = '1', limit = '50' } = req.query;
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);

      let query = db.select().from(provisionsCredits).where(eq(provisionsCredits.agenceId, agenceId)).$dynamic();

      if (periodeDate) {
        query = query.where(eq(provisionsCredits.periodeDate, periodeDate as string));
      }
      if (categorie) {
        query = query.where(eq(provisionsCredits.categorie, categorie as string));
      }

      const provisions = await query
        .orderBy(desc(provisionsCredits.periodeDate))
        .limit(limitNum)
        .offset((pageNum - 1) * limitNum);

      res.json({ data: provisions, page: pageNum, limit: limitNum });
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Calculate provisions manually
  app.post("/api/comptabilite/provisions/calculate", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.body.agenceId;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const periodeDate = req.body.periodeDate ? new Date(req.body.periodeDate) : new Date();
      const result = await calculateProvisions(agenceId, periodeDate, req.user?.id);

      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Provision summary (PAR report)
  app.get("/api/comptabilite/provisions/summary", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const periodeDate = req.query.periodeDate as string | undefined;
      const result = await getProvisionSummary(agenceId, periodeDate);

      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // ======================================================================
  // LETTRAGE
  // ======================================================================

  // Lettrer lignes
  app.post("/api/comptabilite/lettrage", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const { ligneIds } = req.body;
      if (!ligneIds || !Array.isArray(ligneIds) || ligneIds.length < 2) {
        return res.status(400).json({ message: "ligneIds doit contenir au moins 2 IDs" });
      }

      const result = await lettrerLignes(ligneIds, req.user!.id);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Dé-lettrer
  app.delete("/api/comptabilite/lettrage/:key", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const { key } = req.params;
      const { compteId } = req.query;
      if (!compteId) return res.status(400).json({ message: "compteId requis" });

      const result = await delettrerLignes(key, compteId as string);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Auto-lettrage
  app.post("/api/comptabilite/lettrage/auto/:compteId", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const { compteId } = req.params;
      const agenceId = req.user?.agenceId || req.body.agenceId;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const result = await autoLettrage(compteId, agenceId, req.user!.id);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Lignes non lettrées
  app.get("/api/comptabilite/lettrage/non-lettrees/:compteId", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const { compteId } = req.params;
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const result = await getLignesNonLettrees(compteId, agenceId);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Balance âgée
  app.get("/api/comptabilite/balance-agee/:compteId", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const { compteId } = req.params;
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const dateRef = req.query.dateReference ? new Date(req.query.dateReference as string) : undefined;
      const result = await getBalanceAgee(compteId, agenceId, dateRef);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // ======================================================================
  // FEC EXPORT
  // ======================================================================

  // Download FEC file
  app.get("/api/comptabilite/fec/:exerciceId/download", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const { exerciceId } = req.params;
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const siren = req.query.siren as string | undefined;
      const fec = await generateFEC(agenceId, exerciceId, siren);

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fec.filename}"`);
      res.send(fec.content);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Preview FEC
  app.get("/api/comptabilite/fec/:exerciceId/preview", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const { exerciceId } = req.params;
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const limit = parseInt(req.query.limit as string || '50');
      const result = await previewFEC(agenceId, exerciceId, limit);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // ======================================================================
  // CLOTURE EXERCICE
  // ======================================================================

  // Launch exercice closing
  app.post("/api/comptabilite/exercices/:id/cloture", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const agenceId = req.user?.agenceId || req.body.agenceId;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      // Only admin can close exercice
      if (req.user?.role !== SystemRole.ADMIN && req.user?.role !== SystemRole.DIRECTOR) {
        return res.status(403).json({ message: "Seul un administrateur peut clôturer un exercice" });
      }

      const result = await clotureExercice(id, agenceId, req.user!.id);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Get closing status
  app.get("/api/comptabilite/exercices/:id/cloture/status", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const result = await getClotureStatus(id);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Execute specific closing step (retry)
  app.post("/api/comptabilite/exercices/:id/cloture/step", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const { step } = req.body;
      const agenceId = req.user?.agenceId || req.body.agenceId;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });
      if (!step) return res.status(400).json({ message: "step requis" });

      const result = await executeClotureStep(id, agenceId, step, req.user!.id);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // ======================================================================
  // RAPPROCHEMENT BANCAIRE
  // ======================================================================

  // List reconciliation sessions
  app.get("/api/comptabilite/rapprochements", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const result = await listRapprochements(agenceId);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Create reconciliation session
  app.post("/api/comptabilite/rapprochements", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.body.agenceId;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const { compteGl, period, soldeBanqueDebut, soldeBanqueFin } = req.body;
      if (!compteGl || !period) return res.status(400).json({ message: "compteGl et period requis" });

      const result = await createRapprochement({
        agenceId,
        compteGl,
        period,
        soldeBanqueDebut: parseFloat(soldeBanqueDebut || '0'),
        soldeBanqueFin: parseFloat(soldeBanqueFin || '0'),
        userId: req.user!.id,
      });
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Get reconciliation detail
  app.get("/api/comptabilite/rapprochements/:id", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const result = await getRapprochementDetail(req.params.id);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Import bank statement lines
  app.post("/api/comptabilite/rapprochements/:id/import", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const { lines, fileName } = req.body;
      if (!lines || !Array.isArray(lines)) return res.status(400).json({ message: "lines (array) requis" });

      const result = await importBankLines(req.params.id, lines, fileName);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Auto-match
  app.post("/api/comptabilite/rapprochements/:id/auto-match", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const result = await autoMatch(req.params.id);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Manual match
  app.post("/api/comptabilite/rapprochements/:id/match", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const { glLineId, bankLineId } = req.body;
      if (!glLineId || !bankLineId) return res.status(400).json({ message: "glLineId et bankLineId requis" });

      await manualMatch(glLineId, bankLineId);
      res.json({ success: true });
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Unmatch
  app.post("/api/comptabilite/rapprochements/:id/unmatch", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const { lineId } = req.body;
      if (!lineId) return res.status(400).json({ message: "lineId requis" });

      await unmatch(lineId);
      res.json({ success: true });
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Complete reconciliation
  app.post("/api/comptabilite/rapprochements/:id/complete", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      await completeRapprochement(req.params.id, req.user!.id);
      res.json({ success: true });
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // ======================================================================
  // IMMOBILISATIONS & AMORTISSEMENTS
  // ======================================================================

  // List immobilisations
  app.get("/api/comptabilite/immobilisations", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const { categorie, statut } = req.query;
      let query = db.select().from(immobilisations).where(eq(immobilisations.agenceId, agenceId)).$dynamic();

      if (categorie) query = query.where(eq(immobilisations.categorie, categorie as string));
      if (statut) query = query.where(eq(immobilisations.statut, statut as string));

      const result = await query.orderBy(asc(immobilisations.code));
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Create immobilisation
  app.post("/api/comptabilite/immobilisations", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.body.agenceId;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const data = req.body;
      const valeurAcquisition = parseFloat(data.valeurAcquisition || '0');
      const valeurResiduelle = parseFloat(data.valeurResiduelle || '0');
      const cumulAmortissements = parseFloat(data.cumulAmortissements || '0');

      const [created] = await db.insert(immobilisations).values({
        agenceId,
        code: data.code,
        designation: data.designation,
        categorie: data.categorie,
        compteImmobilisation: data.compteImmobilisation,
        compteAmortissement: data.compteAmortissement,
        dateAcquisition: data.dateAcquisition,
        dateMiseEnService: data.dateMiseEnService,
        valeurAcquisition: valeurAcquisition.toFixed(2),
        valeurResiduelle: valeurResiduelle.toFixed(2),
        dureeAmortissementMois: parseInt(data.dureeAmortissementMois),
        methodeAmortissement: data.methodeAmortissement || 'LINEAIRE',
        tauxAmortissement: data.tauxAmortissement,
        cumulAmortissements: cumulAmortissements.toFixed(2),
        valeurNetteComptable: (valeurAcquisition - cumulAmortissements).toFixed(2),
        fournisseur: data.fournisseur,
        numeroFacture: data.numeroFacture,
        localisation: data.localisation,
        description: data.description,
        createdBy: req.user!.id,
      }).returning();

      res.json(created);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Get immobilisation detail with amortissement history
  app.get("/api/comptabilite/immobilisations/:id", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const [immo] = await db.select().from(immobilisations).where(eq(immobilisations.id, req.params.id)).limit(1);
      if (!immo) return res.status(404).json({ message: "Immobilisation non trouvée" });

      const history = await db.select().from(amortissements)
        .where(eq(amortissements.immobilisationId, req.params.id))
        .orderBy(asc(amortissements.periodeDate));

      res.json({ ...immo, amortissements: history });
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Calculate amortissements manually
  app.post("/api/comptabilite/amortissements/calculate", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.body.agenceId;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const periodeDate = req.body.periodeDate ? new Date(req.body.periodeDate) : new Date();
      const result = await calculateAmortissements(agenceId, periodeDate, req.user?.id);

      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Amortissement summary
  app.get("/api/comptabilite/amortissements/summary", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const result = await getAmortissementSummary(agenceId);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // ======================================================================
  // EXPORT COMPTABLE (SAGE / CIEL / EBP)
  // ======================================================================

  app.get("/api/comptabilite/export/:exerciceId/:format", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const { exerciceId, format } = req.params;
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const validFormats = ['SAGE', 'CIEL', 'EBP'];
      const upperFormat = format.toUpperCase();
      if (!validFormats.includes(upperFormat)) {
        return res.status(400).json({ message: `Format invalide. Formats supportés: ${validFormats.join(', ')}` });
      }

      const result = await exportComptable(agenceId, exerciceId, upperFormat as any);

      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.content);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // ======================================================================
  // RATIOS PRUDENTIELS COBAC
  // ======================================================================

  // Calculate COBAC ratios
  app.post("/api/comptabilite/cobac/calculate", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.body.agenceId;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const periodeDate = req.body.periodeDate ? new Date(req.body.periodeDate) : new Date();
      const result = await calculateCobacRatios(agenceId, periodeDate, req.user?.id);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Get current ratios
  app.get("/api/comptabilite/cobac/current", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const result = await getCurrentRatios(agenceId);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Get ratios history
  app.get("/api/comptabilite/cobac/history", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const fromDate = req.query.fromDate as string || `${new Date().getFullYear()}-01-01`;
      const toDate = req.query.toDate as string || new Date().toISOString().split('T')[0];

      const result = await getRatiosHistory(agenceId, fromDate, toDate);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Get COBAC thresholds
  app.get("/api/comptabilite/cobac/seuils", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (_req, res) => {
    try {
      const result = await getSeuils();
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Update a threshold
  app.patch("/api/comptabilite/cobac/seuils/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const { seuilMinimum, seuilWarning, seuilMaximum } = req.body;
      const result = await updateSeuil(req.params.id, { seuilMinimum, seuilWarning, seuilMaximum });
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // ======================================================================
  // DSF (Déclaration Statistique et Fiscale)
  // ======================================================================

  // Generate DSF
  app.post("/api/comptabilite/dsf/generate", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.body.agenceId;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const { exerciceId } = req.body;
      if (!exerciceId) return res.status(400).json({ message: "exerciceId requis" });

      const result = await generateDsf(agenceId, exerciceId, req.user?.id);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // List DSF declarations
  app.get("/api/comptabilite/dsf", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const result = await listDsf(agenceId);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Get DSF detail
  app.get("/api/comptabilite/dsf/:id", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const result = await getDsf(req.params.id);
      if (!result) return res.status(404).json({ message: "DSF non trouvée" });
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Validate DSF
  app.post("/api/comptabilite/dsf/:id/validate", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const result = await validateDsf(req.params.id, req.user!.id);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // ======================================================================
  // COMPTABILITE ANALYTIQUE
  // ======================================================================

  // Balance analytique (by centre or produit)
  app.get("/api/comptabilite/analytique/balance", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const dateDebut = req.query.dateDebut as string || `${new Date().getFullYear()}-01-01`;
      const dateFin = req.query.dateFin as string || new Date().toISOString().split('T')[0];
      const groupBy = req.query.groupBy as 'centre_cout' | 'ligne_produit' || 'centre_cout';

      const result = await getBalanceAnalytique(agenceId, dateDebut, dateFin, groupBy);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Compte de résultat analytique
  app.get("/api/comptabilite/analytique/compte-resultat", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const dateDebut = req.query.dateDebut as string || `${new Date().getFullYear()}-01-01`;
      const dateFin = req.query.dateFin as string || new Date().toISOString().split('T')[0];
      const centreCoutId = req.query.centreCoutId as string | undefined;
      const ligneProduitId = req.query.ligneProduitId as string | undefined;

      const result = await getCompteResultatAnalytique(agenceId, dateDebut, dateFin, centreCoutId, ligneProduitId);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // CRUD: Centres de coûts
  app.get("/api/comptabilite/analytique/centres", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      const result = await db.select().from(centresCouts)
        .where(agenceId ? eq(centresCouts.agenceId, agenceId) : sql`true`)
        .orderBy(centresCouts.code);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  app.post("/api/comptabilite/analytique/centres", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.body.agenceId;
      const { code, intitule, typeCenter, responsable } = req.body;
      if (!code || !intitule) return res.status(400).json({ message: "code et intitule requis" });

      const [result] = await db.insert(centresCouts).values({
        agenceId, code, intitule, typeCenter, responsable,
      }).returning();
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // CRUD: Lignes de produits
  app.get("/api/comptabilite/analytique/produits", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      const result = await db.select().from(lignesProduits)
        .where(agenceId ? eq(lignesProduits.agenceId, agenceId) : sql`true`)
        .orderBy(lignesProduits.code);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  app.post("/api/comptabilite/analytique/produits", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.body.agenceId;
      const { code, intitule, categorie } = req.body;
      if (!code || !intitule) return res.status(400).json({ message: "code et intitule requis" });

      const [result] = await db.insert(lignesProduits).values({
        agenceId, code, intitule, categorie,
      }).returning();
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // CRUD: Clés de répartition
  app.get("/api/comptabilite/analytique/cles", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      const keys = await db.select().from(clesRepartition)
        .where(agenceId ? eq(clesRepartition.agenceId, agenceId) : sql`true`)
        .orderBy(clesRepartition.code);

      // Load lines for each key
      const result = [];
      for (const key of keys) {
        const lignes = await db.select().from(clesRepartitionLignes)
          .where(eq(clesRepartitionLignes.cleId, key.id));
        result.push({ ...key, lignes });
      }
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  app.post("/api/comptabilite/analytique/cles", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.body.agenceId;
      const { code, intitule, lignes } = req.body;
      if (!code || !intitule) return res.status(400).json({ message: "code et intitule requis" });

      const [key] = await db.insert(clesRepartition).values({
        agenceId, code, intitule,
      }).returning();

      if (lignes && Array.isArray(lignes)) {
        for (const ligne of lignes) {
          await db.insert(clesRepartitionLignes).values({
            cleId: key.id,
            centreCoutId: ligne.centreCoutId,
            pourcentage: ligne.pourcentage,
          });
        }
      }

      res.json(key);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // ======================================================================
  // ENGAGEMENTS HORS BILAN
  // ======================================================================

  // Sync from credits
  app.post("/api/comptabilite/engagements/sync", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.body.agenceId;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const result = await syncEngagementsFromCredits(agenceId);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // List engagements
  app.get("/api/comptabilite/engagements", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const filters = {
        sousClasse: req.query.sousClasse as string | undefined,
        statut: req.query.statut as string | undefined,
        creditId: req.query.creditId as string | undefined,
      };

      const result = await listEngagements(agenceId, filters);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Create engagement manually
  app.post("/api/comptabilite/engagements", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.body.agenceId;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const result = await createEngagement({
        ...req.body,
        agenceId,
        createdBy: req.user?.id,
      });
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Update engagement
  app.patch("/api/comptabilite/engagements/:id", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const result = await updateEngagement(req.params.id, req.body);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // État des engagements hors bilan
  app.get("/api/comptabilite/engagements/etat", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const dateRef = req.query.dateReference as string | undefined;
      const result = await getEtatEngagements(agenceId, dateRef);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // ======================================================================
  // CONSOLIDATION MULTI-AGENCES (F11)
  // ======================================================================

  // Consolidated Bilan
  app.get("/api/comptabilite/consolidation/bilan", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const dateFin = req.query.dateFin as string || new Date().toISOString().split('T')[0];
      const result = await generateConsolidatedBilan(dateFin);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Consolidated Compte de Résultat
  app.get("/api/comptabilite/consolidation/compte-resultat", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const year = parseInt(req.query.exercice as string) || new Date().getFullYear();
      const dateDebut = req.query.dateDebut as string || `${year}-01-01`;
      const dateFin = req.query.dateFin as string || `${year}-12-31`;
      const result = await generateConsolidatedCompteResultat(dateDebut, dateFin);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Full consolidation report (bilan + CR + trial balance)
  app.get("/api/comptabilite/consolidation/report", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const year = parseInt(req.query.exercice as string) || new Date().getFullYear();
      const dateFin = req.query.dateFin as string || `${year}-12-31`;
      const result = await generateConsolidationReport(dateFin);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // ======================================================================
  // COBAC AUTO-REPORTING TRIGGER (F13)
  // ======================================================================

  // Manually trigger COBAC ratio calculation for all agencies
  app.post("/api/comptabilite/cobac/run-all", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.COMPTABILITE), async (_req: AuthenticatedRequest, res) => {
    try {
      const result = await runCobacReporting();
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // ======================================================================
  // LEGACY DEPRECATION
  // ======================================================================

  const legacyTombstone = (_req: Request, res: Response) => {
    res.set("Deprecation", "true");
    res.set("Sunset", new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString());
    logger.warn({ method: _req.method, url: _req.originalUrl }, 'Legacy endpoint called');
    res.status(410).json({
      code: "ENDPOINT_DEPRECATED",
      message: "Cette route est supprimée. Utilisez /api/comptabilite/v2/ecritures pour les écritures.",
    });
  };

  app.post("/api/comptabilite/ecritures", requireAuth, legacyTombstone);
  app.get("/api/comptabilite/ecritures", requireAuth, legacyTombstone);
  app.post("/api/comptabilite/comptes", requireAuth, legacyTombstone);
  app.get("/api/comptabilite/grand-livre/:compteId", requireAuth, legacyTombstone);
  app.get("/api/comptabilite/balance", requireAuth, legacyTombstone);
  app.get("/api/comptabilite/bilan-synthetique", requireAuth, legacyTombstone);
}
