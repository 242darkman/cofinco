import type { Express, Request, Response } from "express";
import { createLogger } from "../../lib/logger";

import { storage } from "../../storage";

// @ts-ignore - En supposant que createLogger est disponible globalement ou géré comme dans accounting-core.ts
const logger = createLogger('Routes:Accounting:Ecritures');

import { Actions, Subjects } from "@shared/ability";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import accountingPostingService from "../../services/accounting-posting-service";
import { getWsInstance } from "../../ws-server";
import { manualEntrySchema, toHttpError } from "../utils";

import { ecritures, glPostingLinks, journaux, lignesEcritures, planComptable } from "@shared/schema";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";

import { AuthenticatedRequest } from "./accounting-types";

export function registerAccountingEcrituresRoutes(app: Express) {

  // 9b. Écritures filtrées par journal (roles: admin, chef, comptable)
  app.get("/api/comptabilite/journaux/:journalId/ecritures", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req, res) => {
    try {
      const { journalId } = req.params;
      const dateDebut = req.query.dateDebut as string;
      const dateFin = req.query.dateFin as string;
      const isGlobalAdmin = req.ability?.can(Actions.MANAGE, 'all');
      const agenceId = isGlobalAdmin ? undefined : ((req as AuthenticatedRequest).user?.agenceId ?? undefined);

      const entries = await storage.getAllEcritures({
        journalId,
        dateDebut,
        dateFin,
        agenceId,
      });

      res.json(entries);
    } catch (error: unknown) {
      logger.error({ err: error }, 'Erreur écritures journal');
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // 15. Extourne (rôles: admin, comptable)
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

      // Notification
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

  // 16. Détails de l'écriture avec ses lignes (rôles: admin, chef, comptable)
  app.get("/api/comptabilite/entries/:ecritureId", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: Request, res: Response) => {
    try {
      const { ecritureId } = req.params;

      // Obtenir l'entête de l'écriture
      const [entry] = await db
        .select()
        .from(ecritures)
        .where(eq(ecritures.id, ecritureId))
        .limit(1);

      if (!entry) {
        return res.status(404).json({ message: "Écriture non trouvée" });
      }

      // Vérifier que l'écriture appartient à l'agence de l'utilisateur
      const isGlobalAdmin = req.ability?.can(Actions.MANAGE, 'all');
      if (!isGlobalAdmin) {
        const userAgenceId = (req as AuthenticatedRequest).user?.agenceId;
        if (entry.agenceId && entry.agenceId !== userAgenceId) {
          return res.status(403).json({ message: "Accès interdit: écriture d'une autre agence" });
        }
      }

      // Obtenir les informations du journal
      const [journal] = await db
        .select()
        .from(journaux)
        .where(eq(journaux.id, entry.journalId))
        .limit(1);

      // Obtenir les lignes
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

      // Calculer les totaux
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

  // 17. Vérifier si la source est postée (rôles: admin, chef, comptable)
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
        // Obtenir les détails de l'écriture
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

  // 18. Obtenir les écritures postées par type de source (rôles: admin, chef, comptable)
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

  // 19. Saisie manuelle de l'écriture (rôles: admin, comptable)
  // Pour les écritures comptables manuelles (non postées automatiquement depuis les transactions)
  app.post("/api/comptabilite/v2/ecritures", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: Request, res: Response) => {
    try {
      const agenceId = (req as AuthenticatedRequest).user?.agenceId;
      const userId = (req as AuthenticatedRequest).user?.id;

      if (!agenceId) {
        return res.status(400).json({ code: "VALIDATION_ERROR", message: "Agence non définie" });
      }

      // Validation Zod stricte
      const parsed = manualEntrySchema.parse(req.body);
      const { journalCode, dateEcriture, libelle, lignes } = parsed;

      // Résoudre les IDs / numéros de compte depuis la base de données
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

      // Générer un ID source unique pour les saisies manuelles
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

}
