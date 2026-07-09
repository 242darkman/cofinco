/**
 * Routes finance — segment /credits (partie credits-batch-disburse).
 *
 * Enregistré par l'index finance.ts dans l'ordre historique.
 * Endpoints :
 *   POST   /api/credits/batch-disburse/validate
 *   POST   /api/credits/batch-disburse
 *   GET    /api/credits/:id
 *   GET    /api/credits/:id/echeances
 *   GET    /api/credits/:id/echeances/prochaine
 *   POST   /api/credits/:id/generate-schedule
 *   GET    /api/credits/:id/remboursements
 *   PATCH  /api/credits/:id
 *   GET    /api/credits/:id/mouvements
 */
import type { Express } from "express";
import * as schema from "@shared/schema";
import { sessionsCaisse, clients, credits } from "@shared/schema";
import { storage } from "../../storage";
import { CreditTransitionError } from "@shared/machines/credit-workflow";
import { StatutCredit } from "@shared/enum/status-constants";
import { requireAuth } from "../../auth";
import { requireAgenceAccess, requireAgenceIdAccess } from "../../middleware";
import { attachAbility, requireAbility, requireDisbursement, hasAbility, Actions, Subjects } from "../../authorization";
import { logAudit } from "../../audit";
import { normalizeKeysDeep, coerceValueToSchema } from "../utils";
import { db } from "../../db";
import { getWsInstance } from "../../ws-server";
import { eq, desc, and, sql, count, inArray } from "drizzle-orm";
import { generateCreditSchedule } from "../../storage/finance";
import { logger } from "./shared";

export function registerCreditsBatchDisburseRoutes(app: Express) {
  /**
   * POST /api/credits/batch-disburse/validate
   * Validation préalable des crédits avant décaissement groupé
   * Retourne les crédits valides et invalides avec raisons
   */
  /**
   * POST /api/credits/batch-disburse/validate
   */
  app.post("/api/credits/batch-disburse/validate", requireAuth, attachAbility, requireAbility(Actions.DISBURSE_CASH, Subjects.CREDIT), requireAgenceAccess(), async (req, res) => {
    try {
      const data = normalizeKeysDeep(req.body) as any;
      const creditIds: string[] = data.creditIds;
      const sessionCaisseId: string = data.sessionCaisseId;

      if (!creditIds || !Array.isArray(creditIds) || creditIds.length === 0) {
        return res.status(400).json({ message: "Liste de crédits requise" });
      }
      if (!sessionCaisseId) {
        return res.status(400).json({ message: "Session de caisse requise" });
      }

      // Récupérer le solde disponible de la session
      const [session] = await db.select({
        id: sessionsCaisse.id,
        montantFermetureTheorique: sessionsCaisse.montantFermetureTheorique,
        statut: sessionsCaisse.statut,
      })
      .from(sessionsCaisse)
      .where(eq(sessionsCaisse.id, sessionCaisseId))
      .limit(1);

      if (!session || session.statut !== 'OPEN') {
        return res.status(400).json({ message: "Session de caisse invalide ou fermée" });
      }

      const soldeDisponible = Number(session.montantFermetureTheorique) || 0;

      const validation: {
        valid: Array<{ creditId: string; montant: number; numeroCredit: string; clientNom: string }>;
        invalid: Array<{ creditId: string; reason: string; numeroCredit?: string }>;
        totalMontant: number;
        soldeDisponible: number;
        fondsInsuffisants: boolean;
      } = {
        valid: [],
        invalid: [],
        totalMontant: 0,
        soldeDisponible,
        fondsInsuffisants: false,
      };

      // Valider chaque crédit
      for (const creditId of creditIds) {
        const [credit] = await db.select().from(schema.credits).where(eq(schema.credits.id, creditId)).limit(1);

        if (!credit) {
          validation.invalid.push({ creditId, reason: "Crédit non trouvé" });
          continue;
        }

        // Vérifier le statut
        if (credit.statut !== StatutCredit.WAITING_DISBURSEMENT) {
          validation.invalid.push({
            creditId,
            numeroCredit: credit.numeroCredit,
            reason: `Statut invalide: ${credit.statut} (doit être WAITING_DISBURSEMENT)`
          });
          continue;
        }

        // Récupérer les infos client via jointure users
        const [clientInfo] = await db.select({ nom: schema.users.nom, prenom: schema.users.prenom })
          .from(schema.clients)
          .innerJoin(schema.users, eq(schema.clients.userId, schema.users.id))
          .where(eq(schema.clients.id, credit.clientId))
          .limit(1);

        const montant = Number(credit.montant) || 0;
        validation.valid.push({
          creditId,
          montant,
          numeroCredit: credit.numeroCredit,
          clientNom: clientInfo ? `${clientInfo.prenom} ${clientInfo.nom}` : 'Inconnu'
        });
        validation.totalMontant += montant;
      }

      // Vérifier si les fonds sont suffisants
      validation.fondsInsuffisants = validation.totalMontant > soldeDisponible;

      res.json({
        success: true,
        validation,
        canProceed: validation.invalid.length === 0 && !validation.fondsInsuffisants,
        message: validation.fondsInsuffisants
          ? `Fonds insuffisants: ${validation.totalMontant.toLocaleString()} nécessaires, ${soldeDisponible.toLocaleString()} disponibles`
          : validation.invalid.length > 0
            ? `${validation.invalid.length} crédit(s) invalide(s)`
            : `${validation.valid.length} crédit(s) prêt(s) pour décaissement`
      });

    } catch (error: any) {
      logger.error({ err: error }, 'Erreur validation batch décaissement');
      res.status(500).json({ success: false, message: error.message || "Erreur de validation" });
    }
  });

  /**
   * POST /api/credits/batch-disburse
   * Décaissement groupé de plusieurs crédits en une seule opération
   */
  /**
   * POST /api/credits/batch-disburse
   */
  app.post("/api/credits/batch-disburse", requireAuth, attachAbility, requireAbility(Actions.DISBURSE_CASH, Subjects.CREDIT), requireAgenceAccess(), async (req, res) => {
    try {
      const data = normalizeKeysDeep(req.body) as any;
      const user = req.session.user;

      if (!user?.id) {
        return res.status(401).json({ message: "Utilisateur non authentifié" });
      }

      const creditIds: string[] = data.creditIds;
      const sessionCaisseId: string = data.sessionCaisseId;

      if (!creditIds || !Array.isArray(creditIds) || creditIds.length === 0) {
        return res.status(400).json({ message: "Liste de crédits requise" });
      }
      if (!sessionCaisseId) {
        return res.status(400).json({ message: "L'ID de la session de caisse est requis" });
      }

      const results: Array<{ creditId: string; success: boolean; message: string; credit?: any }> = [];
      let successCount = 0;
      let failCount = 0;

      for (const creditId of creditIds) {
        try {
          const result = await storage.processLoanCashPayout({
            creditId,
            sessionCaisseId,
            paymentReference: data.paymentReference,
          }, user.id);

          await logAudit(req, "DECAISSEMENT_CAISSE_EXECUTE", "credit", creditId, {
            sessionCaisseId,
            montant: result.credit.montant,
            numeroCredit: result.credit.numeroCredit,
            batchMode: true,
          }, "success", "high");

          results.push({ creditId, success: true, message: "Décaissé", credit: result.credit });
          successCount++;
        } catch (err: any) {
          results.push({ creditId, success: false, message: err.message || "Erreur" });
          failCount++;
        }
      }

      // Broadcast updates once after batch completes
      const wsInstance = getWsInstance();
      if (wsInstance && successCount > 0) {
        wsInstance.broadcast({
          type: "CAISSE_UPDATE",
          payload: { subtype: "BATCH_DISBURSEMENT_COMPLETED", count: successCount },
        });
        wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: "batch_activated", count: successCount } });
        wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
      }

      res.json({
        success: failCount === 0,
        message: `${successCount} décaissé(s), ${failCount} erreur(s)`,
        results,
        successCount,
        failCount,
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur batch décaissement');
      res.status(500).json({ success: false, message: error.message || "Erreur lors du décaissement groupé" });
    }
  });

  /**
   * GET /api/credits/:id
   */
  app.get("/api/credits/:id", requireAuth, requireAgenceAccess(), async (req, res) => {
      const credit = await storage.getCredit(req.params.id);
      if (!credit) return res.status(404).json({ message: "Credit not found" });
      
      // Vérifier accès via client
      const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;
      if (agenceFilter?.agenceId) {
        const client = await storage.getClient(credit.clientId);
        if (!client || client.agenceId !== agenceFilter.agenceId) {
          return res.status(403).json({ message: "Accès refusé : crédit d'une autre agence" });
        }
      }
      
      res.json(credit);
  });

  // --- ECHEANCES CREDIT ---
  
  /**
   * GET /api/credits/:id/echeances
   */
  app.get("/api/credits/:id/echeances", requireAuth, requireAgenceAccess(), async (req, res) => {
    const echeances = await storage.getEcheancesByCredit(req.params.id);
    res.json(echeances);
  });

  /**
   * GET /api/credits/:id/echeances/prochaine
   */
  app.get("/api/credits/:id/echeances/prochaine", requireAuth, requireAgenceAccess(), async (req, res) => {
    const echeance = await storage.getProchaineEcheance(req.params.id);
    // Si pas d'échéance trouvée (toutes payées ou aucune générée), on renvoie null ou 204
    if (!echeance) return res.json(null);
    
    // Enrichir avec des infos utiles pour le frontend si besoin
    res.json(echeance);
  });

  /**
   * POST /api/credits/:id/generate-schedule
   */
  app.post("/api/credits/:id/generate-schedule", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.CREDIT), async (req, res) => {
    try {
      const creditId = req.params.id;
      const credit = await storage.getCredit(creditId);

      if (!credit) return res.status(404).json({ message: "Crédit non trouvé" });
      if (credit.statut !== StatutCredit.ACTIVE && credit.statut !== StatutCredit.LATE) {
        return res.status(400).json({ message: "Le crédit doit être actif pour générer un échéancier" });
      }

      const existing = await storage.getEcheancesByCredit(creditId);
      if (existing.length > 0) {
        return res.status(400).json({ message: "Un échéancier existe déjà pour ce crédit" });
      }

      if (!credit.creditPlanId) {
        return res.status(400).json({ message: "Ce crédit n'a pas de plan de crédit associé. Impossible de générer l'échéancier." });
      }

      await generateCreditSchedule(creditId);
      const created = await storage.getEcheancesByCredit(creditId);
      res.json(created);

    } catch (error: any) {
      logger.error({ err: error }, "Error generating schedule");
      res.status(500).json({ message: error.message || "Erreur lors de la génération de l'échéancier" });
    }
  });

  /**
   * GET /api/credits/:id/remboursements
   */
  app.get("/api/credits/:id/remboursements", requireAuth, async (req, res) => {
      const rembs = await storage.getRemboursementsByCredit(req.params.id);
      res.json(rembs);
  });

  // Update credit (roles: admin, chef, credit)
  // State Machine guard is in storage.updateCredit
  /**
   * PATCH /api/credits/:id
   */
  app.patch("/api/credits/:id", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.CREDIT), async (req, res) => {
    try {
      const data = normalizeKeysDeep(req.body);
      const credit = await storage.getCredit(req.params.id);

      if (!credit) return res.status(404).json({ message: "Crédit non trouvé" });

      // Clean up fields that shouldn't be updated directly usually, but flexible for now
      // Especially crucial for automated repayment toggle

      const updated = await storage.updateCredit(req.params.id, data as any);
      res.json(updated);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur mise à jour crédit');

      // State Machine error: return 400 with clear message
      if (error instanceof CreditTransitionError) {
        return res.status(400).json({
          code: error.code,
          message: error.message,
          fromStatus: error.fromStatus,
          toStatus: error.toStatus
        });
      }

      res.status(400).json({ message: error.message || "Erreur lors de la mise à jour du crédit" });
    }
  });

  /**
   * GET /api/credits/:id/mouvements - Movements for a specific credit
   */
  /**
   * GET /api/credits/:id/mouvements
   */
  app.get("/api/credits/:id/mouvements", requireAuth, async (req, res) => {
    try {
      const mouvements = await storage.getMouvementsFinanciers({
        creditId: req.params.id,
        limit: 100
      });
      res.json(mouvements);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
}
