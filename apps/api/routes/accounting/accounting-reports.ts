import type { Express, Request, Response } from "express";
import { createLogger } from "../../lib/logger";

import { storage } from "../../storage";

const logger = createLogger('Routes:Accounting');

import { Actions, Subjects } from "@shared/ability";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { toHttpError } from "../utils";

import accountingPostingService from "../../services/accounting-posting-service";


import { generateTafire } from "../../services/tafire-service";


import { AuthenticatedRequest } from "./accounting-types";



export function registerAccountingReportsRoutes(app: Express) {

  // 5. Compte de Résultat (roles: admin, chef, comptable)
  app.get("/api/comptabilite/compte-resultat", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req, res) => {
    const exercice = req.query.exercice as string || String(new Date().getFullYear());
    const dateDebut = `${exercice}-01-01`;
    const dateFin = `${exercice}-12-31`;

    try {
      const isGlobalAdmin = req.ability?.can(Actions.MANAGE, 'all');
      const agenceId = isGlobalAdmin ? undefined : ((req as AuthenticatedRequest).user?.agenceId ?? undefined);
      const balance = await storage.getBalance(dateDebut, dateFin, agenceId);

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

  // 10. Tableau de Trésorerie (roles: admin, chef, comptable)
  app.get("/api/comptabilite/tableau-tresorerie", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req, res) => {
    const dateDebut = req.query.dateDebut as string || new Date().getFullYear() + '-01-01';
    const dateFin = req.query.dateFin as string || new Date().toISOString().split('T')[0];

    try {
      // Calcul basé sur les mouvements des comptes de trésorerie (classe 5)
      const isGlobalAdmin = req.ability?.can(Actions.MANAGE, 'all');
      const agenceId = isGlobalAdmin ? undefined : ((req as AuthenticatedRequest).user?.agenceId ?? undefined);
      const balance = await storage.getBalance(dateDebut, dateFin, agenceId);

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
        soldeDebut: calcNetFlow(tresorerieComptes.filter(() => false)), // Espace réservé - nécessiterait des données historiques
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
      const isGlobalAdmin = req.ability?.can(Actions.MANAGE, 'all');
      // Seuls les admins globaux peuvent voir la vue consolidée (agenceId = null)
      const agenceId = req.query.consolide === 'true'
        ? (isGlobalAdmin ? null : (req.user?.agenceId ?? null))
        : (req.user?.agenceId || req.query.agenceId as string);

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

  // 11. Grand Livre V2 - Avec solde courant (rôles: admin, chef, comptable)
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

  // 12. Balance V2 - Balance améliorée (rôles: admin, chef, comptable)
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

  // 12b. Bilan V2 - Calculé à partir du service GL Posting (rôles: admin, chef, comptable)
  app.get("/api/comptabilite/v2/bilan", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: Request, res: Response) => {
    try {
      const agenceId = (req as AuthenticatedRequest).user?.agenceId;

      if (!agenceId) {
        return res.status(400).json({ message: "Agence non définie" });
      }

      const dateFin = req.query.dateFin as string || new Date().toISOString().split('T')[0];

      // Obtenir tous les soldes depuis la création jusqu'à dateFin
      const balanceData = await accountingPostingService.getBalance(
        agenceId,
        '2000-01-01',
        dateFin
      );

      const entries = balanceData.entries;

      // Aide: solde net pour les préfixes donnés (débit - crédit)
      const getNetBalance = (prefixes: string[]) =>
        entries
          .filter(e => prefixes.some(p => e.numeroCompte.startsWith(p)))
          .reduce((sum, e) => sum + e.soldeDebiteur - e.soldeCrediteur, 0);

      // Structure du Bilan OHADA
      // Actif (généralement soldes débiteurs)
      const actifImmobilise = getNetBalance(['2']);
      const actifCirculant = getNetBalance(['3', '41', '42', '43', '44', '45', '46', '47']);
      const tresorerieActif = getNetBalance(['5']);

      // Passif (généralement soldes créditeurs, donc on inverse)
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



}
