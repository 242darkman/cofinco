/**
 * Routes finance — segment /credit-plans (partie credit-plans).
 *
 * Enregistré par l'index finance.ts dans l'ordre historique.
 * Endpoints :
 *   GET    /api/credit-plans
 *   GET    /api/credit-plans/:id
 *   POST   /api/credit-plans
 *   PATCH  /api/credit-plans/:id
 *   DELETE /api/credit-plans/:id
 *   POST   /api/credit-plans/preview-schedule
 */
import type { Express } from "express";
import { insertCreditPlanSchema } from "@shared/schema";
import { storage } from "../../storage";
import { requireAuth } from "../../auth";
import { requireAgenceAccess, requireAgenceIdAccess } from "../../middleware";
import { attachAbility, requireAbility, requireDisbursement, hasAbility, Actions, Subjects } from "../../authorization";
import { logAudit } from "../../audit";
import { normalizeKeysDeep, coerceValueToSchema } from "../utils";
import { D, roundMoney } from "../../lib/money";
import { logger } from "./shared";

export function registerCreditPlansRoutes(app: Express) {
  // ============================================================
  // Credit Plans Routes
  // ============================================================
  /**
   * GET /api/credit-plans
   */
  app.get("/api/credit-plans", requireAuth, async (req, res) => {
    try {
      const filter: { isActive?: boolean; agenceId?: string } = {};
      if (req.query.isActive === "true") filter.isActive = true;
      if (req.query.agenceId) filter.agenceId = String(req.query.agenceId);

      const plans = await storage.getAllCreditPlans(filter);
      res.json(plans);
    } catch (err: any) {
      logger.error(err, "Erreur GET /api/credit-plans");
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  /**
   * GET /api/credit-plans/:id
   */
  app.get("/api/credit-plans/:id", requireAuth, async (req, res) => {
    try {
      const plan = await storage.getCreditPlan(req.params.id);
      if (!plan) return res.status(404).json({ message: "Plan non trouvé" });
      res.json(plan);
    } catch (err: any) {
      logger.error(err, "Erreur GET /api/credit-plans/:id");
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  /**
   * POST /api/credit-plans
   */
  app.post("/api/credit-plans", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.PLAN_CREDIT), requireAgenceAccess(), async (req, res) => {
    try {
      const data = normalizeKeysDeep(req.body) as any;
      const { fees, ...planData } = data;

      if (!planData.nom) return res.status(400).json({ message: "Le nom est obligatoire" });
      if (!planData.taux_interet && !planData.tauxInteret) return res.status(400).json({ message: "Le taux d'intérêt est obligatoire" });

      planData.createdBy = req.user?.id;
      planData.updatedBy = req.user?.id;

      const parsed = insertCreditPlanSchema.parse(planData);
      const plan = await storage.createCreditPlan(parsed, fees || []);
      await logAudit(req, "CREATE_CREDIT_PLAN", "credit_plan", plan.id, { nom: plan.nom, feesCount: (fees || []).length }, "success", "medium");
      res.status(201).json(plan);
    } catch (err: any) {
      logger.error(err, "Erreur POST /api/credit-plans");
      if (err.name === "ZodError") return res.status(400).json({ message: "Données invalides", details: err.errors });
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  /**
   * PATCH /api/credit-plans/:id
   */
  app.patch("/api/credit-plans/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.PLAN_CREDIT), async (req, res) => {
    try {
      const data = normalizeKeysDeep(req.body) as any;
      const { fees, expectedVersion, ...planData } = data;

      planData.updatedBy = req.user?.id;

      const plan = await storage.updateCreditPlan(
        req.params.id,
        planData,
        fees,
        expectedVersion,
      );
      if (!plan) return res.status(404).json({ message: "Plan non trouvé" });
      await logAudit(req, "UPDATE_CREDIT_PLAN", "credit_plan", req.params.id, { nom: plan.nom, version: plan.version }, "success", "medium");
      res.json(plan);
    } catch (err: any) {
      if (err.message?.startsWith("CONFLICT")) {
        return res.status(409).json({ message: "Ce plan a été modifié par un autre utilisateur. Rechargez et réessayez." });
      }
      logger.error(err, "Erreur PATCH /api/credit-plans/:id");
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  /**
   * DELETE /api/credit-plans/:id
   */
  app.delete("/api/credit-plans/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.PLAN_CREDIT), async (req, res) => {
    try {
      const success = await storage.deleteCreditPlan(req.params.id);
      if (!success) return res.status(404).json({ message: "Plan non trouvé" });
      await logAudit(req, "DEACTIVATE_CREDIT_PLAN", "credit_plan", req.params.id, {}, "success", "medium");
      res.json({ success: true });
    } catch (err: any) {
      logger.error(err, "Erreur DELETE /api/credit-plans/:id");
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  // Preview schedule (accepts full plan config, no save needed)
  const previewLimiter = new Map<string, number[]>();
  /**
   * POST /api/credit-plans/preview-schedule
   */
  app.post("/api/credit-plans/preview-schedule", requireAuth, async (req, res) => {
    try {
      // Simple rate-limit: max 10 requests per 30s per user
      const userId = req.user?.id || "anon";
      const now = Date.now();
      const window = 30_000;
      const maxRequests = 10;
      const timestamps = (previewLimiter.get(userId) || []).filter(t => now - t < window);
      if (timestamps.length >= maxRequests) {
        return res.status(429).json({ message: "Trop de requêtes. Réessayez dans quelques secondes." });
      }
      timestamps.push(now);
      previewLimiter.set(userId, timestamps);
      const { D: toDecimal } = await import("../../lib/money");
      const { generateSchedule } = await import("../../services/credit-plan");
      const { planConfig, principal, disbursementDate } = req.body;

      if (!planConfig || !principal || !disbursementDate) {
        return res.status(400).json({ message: "planConfig, principal et disbursementDate sont requis" });
      }

      const principalNum = Number(principal);
      if (!Number.isFinite(principalNum) || principalNum <= 0) {
        return res.status(400).json({ message: "Le montant du capital doit être un nombre positif" });
      }

      const disbDate = new Date(disbursementDate);
      if (isNaN(disbDate.getTime())) {
        return res.status(400).json({ message: "Date de décaissement invalide" });
      }

      let customFirst: Date | undefined;
      if (req.body.customFirstDueDate) {
        customFirst = new Date(req.body.customFirstDueDate);
        if (isNaN(customFirst.getTime())) {
          return res.status(400).json({ message: "Date de première échéance invalide" });
        }
        if (customFirst <= disbDate) {
          return res.status(400).json({ message: "La date de première échéance doit être postérieure au décaissement" });
        }
      }

      const result = generateSchedule({
        principal: toDecimal(principal),
        disbursementDate: disbDate,
        plan: planConfig,
        fees: req.body.fees || [],
        customFirstDueDate: customFirst,
      });

      // Serialize Decimal values to strings for JSON
      const serialized = {
        rows: result.rows.map(r => ({
          number: r.number,
          date: r.date.toISOString().slice(0, 10),
          capitalPayment: r.capitalPayment.toFixed(0),
          interestPayment: r.interestPayment.toFixed(0),
          feePayment: r.feePayment.toFixed(0),
          totalPayment: r.totalPayment.toFixed(0),
          balanceAfter: r.balanceAfter.toFixed(0),
        })),
        summary: {
          totalCapital: result.summary.totalCapital.toFixed(0),
          totalInterest: result.summary.totalInterest.toFixed(0),
          totalFees: result.summary.totalFees.toFixed(0),
          totalDue: result.summary.totalDue.toFixed(0),
          numberOfInstallments: result.summary.numberOfInstallments,
        },
        upfrontFees: result.upfrontFees.map(f => ({
          feeType: f.feeType,
          label: f.label,
          amount: f.amount.toFixed(0),
          collectionMode: f.collectionMode,
        })),
      };

      res.json(serialized);
    } catch (err: any) {
      // Engine throws user-facing messages for known validation errors
      const isValidationError = err.message && !err.message.includes("Cannot read") && !err.message.includes("undefined");
      if (isValidationError) {
        return res.status(400).json({ message: err.message });
      }
      logger.error(err, "Erreur POST /api/credit-plans/preview-schedule");
      res.status(500).json({ message: "Erreur de calcul de l'échéancier" });
    }
  });
}
