import type { Express, Request, Response } from "express";
import { createLogger } from "../../lib/logger";

// @ts-ignore
const logger = createLogger('Routes:Accounting:Ohada');

import { Actions, Subjects } from "@shared/ability";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { toHttpError } from "../utils";

import {
  bilanToMarkdown,
  compteResultatToMarkdown,
  generateBilan,
  generateCompteResultat,
  generateJournalCentralisateur,
  generateLivreInventaire,
  generateTrialBalance,
  journalCentralisateurToMarkdown,
  livreInventaireToMarkdown,
} from "../../services/gl-reporting-service";

import { exportComptable } from "../../services/export-comptable-service";

import { AuthenticatedRequest } from "./accounting-types";

export function registerAccountingReportsOhadaRoutes(app: Express) {

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

}
