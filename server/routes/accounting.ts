import type { Express } from "express";
import { storage } from "../storage";
import { insertCompteSchema, insertEcritureSchema, insertJournalSchema, insertDeclarationTvaSchema } from "@shared/schema";
import { normalizeKeysDeep, addSnakeCaseAliasesDeep } from "./utils";
import { requireAuth, requireRole } from "../auth";
import { SystemRole } from "@shared/types/roles";
import { z } from "zod";
import { getWsInstance } from "../ws-server";

export function registerAccountingRoutes(app: Express) {

  // 1. Plan Comptable (roles: admin, chef, comptable)
  app.get("/api/comptabilite/comptes", requireAuth, requireRole(SystemRole.ADMIN, SystemRole.CHEF_AGENCE, SystemRole.COMPTABLE), async (_req, res) => {
    const comptes = await storage.getAllComptes();
    res.json(addSnakeCaseAliasesDeep(comptes));
  });

  app.get("/api/comptabilite/plan-ohada", requireAuth, requireRole(SystemRole.ADMIN, SystemRole.CHEF_AGENCE, SystemRole.COMPTABLE), async (_req, res) => {
    // Alias for same endpoint if needed by legacy calls
    const comptes = await storage.getAllComptes();
    res.json(addSnakeCaseAliasesDeep(comptes));
  });

  // Create compte (roles: admin, comptable)
  app.post("/api/comptabilite/comptes", requireAuth, requireRole(SystemRole.ADMIN, SystemRole.COMPTABLE), async (req, res) => {
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
  app.get("/api/comptabilite/journaux", requireAuth, requireRole(SystemRole.ADMIN, SystemRole.CHEF_AGENCE, SystemRole.COMPTABLE), async (_req, res) => {
    const journaux = await storage.getAllJournaux();
    res.json(addSnakeCaseAliasesDeep(journaux));
  });

  // Create journal (roles: admin, comptable)
  app.post("/api/comptabilite/journaux", requireAuth, requireRole(SystemRole.ADMIN, SystemRole.COMPTABLE), async (req, res) => {
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
  app.get("/api/comptabilite/ecritures", requireAuth, requireRole(SystemRole.ADMIN, SystemRole.CHEF_AGENCE, SystemRole.COMPTABLE), async (req, res) => {
    const filter = {
      journalId: req.query.journalId as string,
      dateDebut: req.query.dateDebut as string,
      dateFin: req.query.dateFin as string
    };
    const ecritures = await storage.getAllEcritures(filter);
    res.json(addSnakeCaseAliasesDeep(ecritures));
  });

  // Create écriture (roles: admin, comptable)
  app.post("/api/comptabilite/ecritures", requireAuth, requireRole(SystemRole.ADMIN, SystemRole.COMPTABLE), async (req, res) => {
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
  app.get("/api/comptabilite/grand-livre/:compteId", requireAuth, requireRole(SystemRole.ADMIN, SystemRole.CHEF_AGENCE, SystemRole.COMPTABLE), async (req, res) => {
    const { compteId } = req.params;
    const dateDebut = req.query.dateDebut as string || new Date().getFullYear() + '-01-01';
    const dateFin = req.query.dateFin as string || new Date().toISOString().split('T')[0];

    const mouvements = await storage.getGrandLivre(compteId, dateDebut, dateFin);
    res.json(addSnakeCaseAliasesDeep(mouvements));
  });

  // 5. TVA (roles: admin, chef, comptable)
  app.get("/api/comptabilite/declarations-tva", requireAuth, requireRole(SystemRole.ADMIN, SystemRole.CHEF_AGENCE, SystemRole.COMPTABLE), async (_req, res) => {
    const declarations = await storage.getDeclarationsTva();
    res.json(addSnakeCaseAliasesDeep(declarations));
  });

  // Create déclaration TVA (roles: admin, comptable)
  app.post("/api/comptabilite/declarations-tva", requireAuth, requireRole(SystemRole.ADMIN, SystemRole.COMPTABLE), async (req, res) => {
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
  app.get("/api/comptabilite/balance", requireAuth, requireRole(SystemRole.ADMIN, SystemRole.CHEF_AGENCE, SystemRole.COMPTABLE), async (req, res) => {
    const dateDebut = req.query.dateDebut as string || new Date().getFullYear() + '-01-01';
    const dateFin = req.query.dateFin as string || new Date().toISOString().split('T')[0];
    const balance = await storage.getBalance(dateDebut, dateFin);
    res.json(addSnakeCaseAliasesDeep(balance));
  });

  // 7. Stats Journaux (roles: admin, chef, comptable)
  app.get("/api/comptabilite/journaux-stats", requireAuth, requireRole(SystemRole.ADMIN, SystemRole.CHEF_AGENCE, SystemRole.COMPTABLE), async (_req, res) => {
    const stats = await storage.getJournauxStats();
    res.json(addSnakeCaseAliasesDeep(stats));
  });

  // 8. Bilan Synthetique (roles: admin, chef, comptable)
  app.get("/api/comptabilite/bilan-synthetique", requireAuth, requireRole(SystemRole.ADMIN, SystemRole.CHEF_AGENCE, SystemRole.COMPTABLE), async (req, res) => {
    const dateFin = req.query.dateFin as string || new Date().toISOString().split('T')[0];
    const bilan = await storage.getBilan(dateFin);
    res.json(bilan);
  });

  // 9. Tableau de Trésorerie (roles: admin, chef, comptable)
  app.get("/api/comptabilite/tableau-tresorerie", requireAuth, requireRole(SystemRole.ADMIN, SystemRole.CHEF_AGENCE, SystemRole.COMPTABLE), async (req, res) => {
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
  app.get("/api/comptabilite/tafire", requireAuth, requireRole(SystemRole.ADMIN, SystemRole.CHEF_AGENCE, SystemRole.COMPTABLE), async (req, res) => {
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
}
