import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { insertJournalSchema, insertDeclarationTvaSchema } from "@shared/schema";
import { normalizeKeysDeep, addSnakeCaseAliasesDeep, toHttpError, getErrorMessage, manualEntrySchema } from "./utils";
import { requireAuth } from "../auth";
import { attachAbility, requireAbility } from "../authorization";
import { Actions, Subjects } from "@shared/ability";
import { getWsInstance } from "../ws-server";
import accountingPostingService from "../services/accounting-posting-service";
import { db } from "../db";
import { glPeriods, glPostingLinks, ecritures, lignesEcritures, planComptable, journaux, mouvementsFinanciers, accountingRules } from "@shared/schema";
import { eq, and, desc, asc, sql, count } from "drizzle-orm";
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
    res.json(addSnakeCaseAliasesDeep(comptes));
  });

  app.get("/api/comptabilite/plan-ohada", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (_req, res) => {
    const comptes = await storage.getAllComptesComptables();
    res.json(addSnakeCaseAliasesDeep(comptes));
  });

  // 2. Journaux (roles: admin, chef, comptable)
  app.get("/api/comptabilite/journaux", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (_req, res) => {
    const journaux = await storage.getAllJournaux();
    res.json(addSnakeCaseAliasesDeep(journaux));
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

      res.json(addSnakeCaseAliasesDeep(journal));
    } catch (error: unknown) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message, details: err.details });
    }
  });

  // 3. TVA (roles: admin, chef, comptable)
  app.get("/api/comptabilite/declarations-tva", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (_req, res) => {
    const declarations = await storage.getDeclarationsTva();
    res.json(addSnakeCaseAliasesDeep(declarations));
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

      res.json(addSnakeCaseAliasesDeep(declaration));
    } catch (error: unknown) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message, details: err.details });
    }
  });

  // 4. Stats Journaux (roles: admin, chef, comptable)
  app.get("/api/comptabilite/journaux-stats", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (_req, res) => {
    const stats = await storage.getJournauxStats();
    res.json(addSnakeCaseAliasesDeep(stats));
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
      console.error('Erreur compte de résultat:', getErrorMessage(error));
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

      res.json(addSnakeCaseAliasesDeep(entries));
    } catch (error: unknown) {
      console.error('Erreur écritures journal:', getErrorMessage(error));
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
      console.error('Erreur tableau trésorerie:', getErrorMessage(error));
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // 10. TAFIRE (Tableau Financier des Ressources et Emplois) (roles: admin, chef, comptable)
  app.get("/api/comptabilite/tafire", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req, res) => {
    const exercice = parseInt(req.query.exercice as string) || new Date().getFullYear();
    const dateDebut = `${exercice}-01-01`;
    const dateFin = `${exercice}-12-31`;
    const dateDebutN1 = `${exercice - 1}-01-01`;
    const dateFinN1 = `${exercice - 1}-12-31`;

    try {
      const balanceN = await storage.getBalance(dateDebut, dateFin);
      const balanceN1 = await storage.getBalance(dateDebutN1, dateFinN1);

      const getNetBalance = (balance: Array<Record<string, unknown>>, prefixes: string[]) =>
        balance
          .filter(c => prefixes.some(p => String(c.numero_compte || '').startsWith(p)))
          .reduce((sum, c) => sum + (Number(c.solde_debiteur) || 0) - (Number(c.solde_crediteur) || 0), 0);

      const result = {
        ressourcesDurables: [
          { code: 'RA', libelle: 'Capacité d\'autofinancement globale (CAFG)', montantN: Math.abs(getNetBalance(balanceN, ['12', '13'])), montantN1: Math.abs(getNetBalance(balanceN1, ['12', '13'])) },
          { code: 'RB', libelle: 'Cessions d\'immobilisations incorporelles', montantN: Math.abs(getNetBalance(balanceN, ['21'])), montantN1: Math.abs(getNetBalance(balanceN1, ['21'])) },
          { code: 'RC', libelle: 'Cessions d\'immobilisations corporelles', montantN: Math.abs(getNetBalance(balanceN, ['22', '23', '24'])), montantN1: Math.abs(getNetBalance(balanceN1, ['22', '23', '24'])) },
          { code: 'RD', libelle: 'Cessions d\'immobilisations financières', montantN: Math.abs(getNetBalance(balanceN, ['26', '27'])), montantN1: Math.abs(getNetBalance(balanceN1, ['26', '27'])) },
          { code: 'RE', libelle: 'Augmentation des capitaux propres', montantN: Math.abs(getNetBalance(balanceN, ['10'])), montantN1: Math.abs(getNetBalance(balanceN1, ['10'])) },
          { code: 'RF', libelle: 'Augmentation des dettes financières', montantN: Math.abs(getNetBalance(balanceN, ['16'])), montantN1: Math.abs(getNetBalance(balanceN1, ['16'])) },
        ],
        emploisDurables: [
          { code: 'EA', libelle: 'Acquisitions d\'immobilisations incorporelles', montantN: Math.abs(getNetBalance(balanceN, ['21'])), montantN1: Math.abs(getNetBalance(balanceN1, ['21'])) },
          { code: 'EB', libelle: 'Acquisitions d\'immobilisations corporelles', montantN: Math.abs(getNetBalance(balanceN, ['22', '23', '24'])), montantN1: Math.abs(getNetBalance(balanceN1, ['22', '23', '24'])) },
          { code: 'EC', libelle: 'Acquisitions d\'immobilisations financières', montantN: Math.abs(getNetBalance(balanceN, ['26', '27'])), montantN1: Math.abs(getNetBalance(balanceN1, ['26', '27'])) },
          { code: 'ED', libelle: 'Remboursement des emprunts', montantN: 0, montantN1: 0 },
          { code: 'EE', libelle: 'Prélèvements sur le capital', montantN: 0, montantN1: 0 },
          { code: 'EF', libelle: 'Dividendes distribués', montantN: 0, montantN1: 0 },
        ],
        variationBFR: [
          { code: 'VA', libelle: 'Variation des stocks', montantN: getNetBalance(balanceN, ['3']) - getNetBalance(balanceN1, ['3']), montantN1: 0 },
          { code: 'VB', libelle: 'Variation des créances', montantN: getNetBalance(balanceN, ['41']) - getNetBalance(balanceN1, ['41']), montantN1: 0 },
          { code: 'VC', libelle: 'Variation des dettes circulantes', montantN: getNetBalance(balanceN, ['40']) - getNetBalance(balanceN1, ['40']), montantN1: 0 },
        ],
        tresorerie: [
          { code: 'TI', libelle: 'Trésorerie nette au 1er janvier', montantN: getNetBalance(balanceN1, ['5']), montantN1: 0 },
          { code: 'TF', libelle: 'Trésorerie nette au 31 décembre', montantN: getNetBalance(balanceN, ['5']), montantN1: getNetBalance(balanceN1, ['5']) },
        ]
      };

      res.json(result);
    } catch (error: unknown) {
      console.error('Erreur TAFIRE:', getErrorMessage(error));
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
      console.error('Erreur Grand Livre:', getErrorMessage(error));
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
      console.error('Erreur Balance:', getErrorMessage(error));
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
      console.error('Erreur Bilan:', getErrorMessage(error));
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

      res.json(addSnakeCaseAliasesDeep(periods));
    } catch (error: unknown) {
      console.error('Erreur récupération périodes:', getErrorMessage(error));
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
      console.error('Erreur clôture période:', getErrorMessage(error));
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
      console.error('Erreur extourne:', getErrorMessage(error));
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
        ...(addSnakeCaseAliasesDeep(entry) as Record<string, unknown>),
        journal: journal ? addSnakeCaseAliasesDeep(journal) : null,
        lignes: addSnakeCaseAliasesDeep(lines),
        total_debit: totalDebit,
        total_credit: totalCredit,
        is_balanced: Math.abs(totalDebit - totalCredit) < 0.01
      });
    } catch (error: unknown) {
      console.error('Erreur détail écriture:', getErrorMessage(error));
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
      console.error('Erreur vérification posting:', getErrorMessage(error));
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

      res.json(addSnakeCaseAliasesDeep(entries));
    } catch (error: unknown) {
      console.error('Erreur récupération écritures par source:', getErrorMessage(error));
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
      const manualSourceId = `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

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
      console.error('Erreur création écriture manuelle:', getErrorMessage(error));
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message, details: err.details });
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
      console.error("[Coverage] Report generation failed:", error);
      res.status(500).json({ success: false, error: "Failed to generate coverage report" });
    }
  });

  const legacyTombstone = (_req: Request, res: Response) => {
    res.set("Deprecation", "true");
    res.set("Sunset", new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString());
    console.warn(`[DEPRECATED] Legacy endpoint called: ${_req.method} ${_req.originalUrl}`);
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
