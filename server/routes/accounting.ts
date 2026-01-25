import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { insertCompteSchema, insertEcritureSchema, insertJournalSchema, insertDeclarationTvaSchema } from "@shared/schema";
import { normalizeKeysDeep, addSnakeCaseAliasesDeep } from "./utils";
import { requireAuth } from "../auth";
import { attachAbility, requireAbility } from "../authorization";
import { Actions, Subjects } from "@shared/ability";
import { z } from "zod";
import { getWsInstance } from "../ws-server";
import accountingPostingService from "../services/accounting-posting-service";
import { db } from "../db";
import { glPeriods, glPostingLinks, ecritures, lignesEcritures, planComptable, journaux } from "@shared/schema";
import { eq, and, desc, asc } from "drizzle-orm";

export function registerAccountingRoutes(app: Express) {

  // 1. Plan Comptable (roles: admin, chef, comptable)
  app.get("/api/comptabilite/comptes", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (_req, res) => {
    const comptes = await storage.getAllComptes();
    res.json(addSnakeCaseAliasesDeep(comptes));
  });

  app.get("/api/comptabilite/plan-ohada", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (_req, res) => {
    // Alias for same endpoint if needed by legacy calls
    const comptes = await storage.getAllComptes();
    res.json(addSnakeCaseAliasesDeep(comptes));
  });

  // Create compte (roles: admin, comptable)
  app.post("/api/comptabilite/comptes", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req, res) => {
    try {
      const data = insertCompteSchema.parse(normalizeKeysDeep(req.body));
      const compte = await storage.createCompte(data);

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "ACCOUNTING_UPDATE", payload: { type: 'compte_new', id: compte.id } });
      }

      res.json(addSnakeCaseAliasesDeep(compte));
    } catch (e) {
      res.status(400).json({ message: "Invalid data" });
    }
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
    } catch (e) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  // 3. Ecritures (roles: admin, chef, comptable)
  app.get("/api/comptabilite/ecritures", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req, res) => {
    const filter = {
      journalId: req.query.journalId as string,
      dateDebut: req.query.dateDebut as string,
      dateFin: req.query.dateFin as string
    };
    const ecritures = await storage.getAllEcritures(filter);
    res.json(addSnakeCaseAliasesDeep(ecritures));
  });

  // Create écriture (roles: admin, comptable)
  app.post("/api/comptabilite/ecritures", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req, res) => {
    try {
      const body = normalizeKeysDeep(req.body) as any;
      // Validate Header
      const headerData = insertEcritureSchema.parse(body);

      // Validate Lines
      const lignesData = z.array(z.any()).parse(body.lignes);

      const ecriture = await storage.createEcriture(headerData, lignesData);

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "ACCOUNTING_UPDATE", payload: { type: 'ecriture_new', id: ecriture.id } });
      }

      res.json(addSnakeCaseAliasesDeep(ecriture));
    } catch (e) {
      console.error(e);
      res.status(400).json({ message: "Invalid data", error: e });
    }
  });

  // 4. Grand Livre (roles: admin, chef, comptable)
  app.get("/api/comptabilite/grand-livre/:compteId", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req, res) => {
    const { compteId } = req.params;
    const dateDebut = req.query.dateDebut as string || new Date().getFullYear() + '-01-01';
    const dateFin = req.query.dateFin as string || new Date().toISOString().split('T')[0];

    const mouvements = await storage.getGrandLivre(compteId, dateDebut, dateFin);
    res.json(addSnakeCaseAliasesDeep(mouvements));
  });

  // 5. TVA (roles: admin, chef, comptable)
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
    } catch (e) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  // 6. Balance (roles: admin, chef, comptable)
  app.get("/api/comptabilite/balance", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req, res) => {
    const dateDebut = req.query.dateDebut as string || new Date().getFullYear() + '-01-01';
    const dateFin = req.query.dateFin as string || new Date().toISOString().split('T')[0];
    const balance = await storage.getBalance(dateDebut, dateFin);
    res.json(addSnakeCaseAliasesDeep(balance));
  });

  // 7. Stats Journaux (roles: admin, chef, comptable)
  app.get("/api/comptabilite/journaux-stats", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (_req, res) => {
    const stats = await storage.getJournauxStats();
    res.json(addSnakeCaseAliasesDeep(stats));
  });

  // 8. Bilan Synthetique (roles: admin, chef, comptable)
  app.get("/api/comptabilite/bilan-synthetique", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req, res) => {
    const dateFin = req.query.dateFin as string || new Date().toISOString().split('T')[0];
    const bilan = await storage.getBilan(dateFin);
    res.json(bilan);
  });

  // 9. Tableau de Trésorerie (roles: admin, chef, comptable)
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

      const calcNetFlow = (comptes: any[]) => comptes.reduce((sum, c) =>
        sum + (c.total_debit || 0) - (c.total_credit || 0), 0);

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
    } catch (error) {
      console.error('Erreur tableau trésorerie:', error);
      res.status(500).json({ message: 'Erreur calcul trésorerie' });
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

      const getNetBalance = (balance: any[], prefixes: string[]) =>
        balance
          .filter(c => prefixes.some(p => c.numero_compte.startsWith(p)))
          .reduce((sum, c) => sum + (c.solde_debiteur || 0) - (c.solde_crediteur || 0), 0);

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
    } catch (error) {
      console.error('Erreur TAFIRE:', error);
      res.status(500).json({ message: 'Erreur calcul TAFIRE' });
    }
  });

  // ============================================================================
  // NEW ENDPOINTS - ENHANCED ACCOUNTING WITH POSTING ENGINE
  // ============================================================================

  // 11. Grand Livre V2 - With Running Balance (roles: admin, chef, comptable)
  app.get("/api/comptabilite/v2/grand-livre/:compteId", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: Request, res: Response) => {
    try {
      const { compteId } = req.params;
      const agenceId = (req as any).user?.agenceId;

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
    } catch (error: any) {
      console.error('Erreur Grand Livre V2:', error);
      res.status(500).json({ message: error.message || 'Erreur récupération grand livre' });
    }
  });

  // 12. Balance V2 - Enhanced Trial Balance (roles: admin, chef, comptable)
  app.get("/api/comptabilite/v2/balance", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: Request, res: Response) => {
    try {
      const agenceId = (req as any).user?.agenceId;

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
    } catch (error: any) {
      console.error('Erreur Balance V2:', error);
      res.status(500).json({ message: error.message || 'Erreur calcul balance' });
    }
  });

  // 13. Periods Management (roles: admin, chef, comptable)
  app.get("/api/comptabilite/periods", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: Request, res: Response) => {
    try {
      const agenceId = (req as any).user?.agenceId;

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
    } catch (error: any) {
      console.error('Erreur récupération périodes:', error);
      res.status(500).json({ message: error.message || 'Erreur récupération périodes' });
    }
  });

  // 14. Close Period (roles: admin, comptable)
  app.post("/api/comptabilite/periods/close", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.COMPTABILITE), async (req: Request, res: Response) => {
    try {
      const agenceId = (req as any).user?.agenceId;
      const userId = (req as any).user?.id;

      if (!agenceId) {
        return res.status(400).json({ message: "Agence non définie" });
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
    } catch (error: any) {
      console.error('Erreur clôture période:', error);
      res.status(400).json({ message: error.message || 'Erreur clôture période' });
    }
  });

  // 15. Reverse Entry (Extourne) (roles: admin, comptable)
  app.post("/api/comptabilite/entries/:ecritureId/reverse", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.COMPTABILITE), async (req: Request, res: Response) => {
    try {
      const { ecritureId } = req.params;
      const agenceId = (req as any).user?.agenceId;
      const userId = (req as any).user?.id;

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
    } catch (error: any) {
      console.error('Erreur extourne:', error);
      res.status(400).json({ message: error.message || 'Erreur extourne' });
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
    } catch (error: any) {
      console.error('Erreur détail écriture:', error);
      res.status(500).json({ message: error.message || 'Erreur récupération écriture' });
    }
  });

  // 17. Check if Source is Posted (roles: admin, chef, comptable)
  app.get("/api/comptabilite/posting-status/:sourceType/:sourceId", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: Request, res: Response) => {
    try {
      const { sourceType, sourceId } = req.params;
      const agenceId = (req as any).user?.agenceId;

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
    } catch (error: any) {
      console.error('Erreur vérification posting:', error);
      res.status(500).json({ message: error.message || 'Erreur vérification' });
    }
  });

  // 18. Get Posted Entries by Source Type (roles: admin, chef, comptable)
  app.get("/api/comptabilite/entries-by-source/:sourceType", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: Request, res: Response) => {
    try {
      const { sourceType } = req.params;
      const agenceId = (req as any).user?.agenceId;

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
    } catch (error: any) {
      console.error('Erreur récupération écritures par source:', error);
      res.status(500).json({ message: error.message || 'Erreur récupération' });
    }
  });

  // 19. Manual Post Entry (roles: admin, comptable)
  // For manual accounting entries (not auto-posted from business transactions)
  app.post("/api/comptabilite/v2/ecritures", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: Request, res: Response) => {
    try {
      const agenceId = (req as any).user?.agenceId;
      const userId = (req as any).user?.id;

      if (!agenceId) {
        return res.status(400).json({ message: "Agence non définie" });
      }

      const { journalCode, dateEcriture, libelle, lignes } = req.body;

      if (!journalCode || !dateEcriture || !libelle || !lignes || !Array.isArray(lignes)) {
        return res.status(400).json({ message: "Données manquantes: journalCode, dateEcriture, libelle, lignes requis" });
      }

      // Validate lines have accounts
      const processedLines = [];
      for (const ligne of lignes) {
        if (!ligne.numeroCompte && !ligne.compteId) {
          return res.status(400).json({ message: "Chaque ligne doit avoir un compte" });
        }

        // Get account if only number provided
        let compteId = ligne.compteId;
        let numeroCompte = ligne.numeroCompte;

        if (!compteId && numeroCompte) {
          const [compte] = await db
            .select()
            .from(planComptable)
            .where(eq(planComptable.numeroCompte, numeroCompte))
            .limit(1);

          if (!compte) {
            return res.status(400).json({ message: `Compte non trouvé: ${numeroCompte}` });
          }
          compteId = compte.id;
        } else if (compteId && !numeroCompte) {
          const [compte] = await db
            .select()
            .from(planComptable)
            .where(eq(planComptable.id, compteId))
            .limit(1);

          if (!compte) {
            return res.status(400).json({ message: `Compte non trouvé: ${compteId}` });
          }
          numeroCompte = compte.numeroCompte;
        }

        processedLines.push({
          compteId,
          numeroCompte,
          libelle: ligne.libelle || libelle,
          debit: parseFloat(ligne.debit || 0),
          credit: parseFloat(ligne.credit || 0),
          refExterne: ligne.refExterne
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
        userId
      });

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "ACCOUNTING_UPDATE",
          payload: { type: 'ecriture_new', id: result.ecritureId, numeroPiece: result.numeroPiece }
        });
      }

      res.json({
        success: true,
        ...result
      });
    } catch (error: any) {
      console.error('Erreur création écriture manuelle:', error);
      res.status(400).json({ message: error.message || 'Erreur création écriture' });
    }
  });
}
