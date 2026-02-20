import type { Express } from "express";
import * as schema from "@shared/schema";
import {
  insertCreditSchema,
  insertDemandeCreditSchema,
  insertEnqueteCreditSchema,
  insertFactureSchema,
  insertSessionCaisseSchema,
  insertOperationCaisseSchema,
  insertCaisseSchema,
  insertCaisseTransfertSchema,
  insertCreditPlanSchema,
  mouvementsFinanciers,
  comptes,
  creditRefundRequests,
  sessionsCaisse,
  operationsCaisse,
  clients,
  demandesCredit,
  credits,
  coffresForts,
  transactionsCompte,
  enquetesCredit,
  professions,
  activityTypes
} from "@shared/schema";
import { storage } from "../storage";
import { createMouvementFinancier } from "../services/ledger";
import { postGlForMouvement } from "../services/accounting-posting-service";
import { getComptesByClient } from "../storage/finance";
import { DecaissementInsufficientFundsError, InsufficientFundsError } from "../storage/errors";

import { isCoffreCaisseError } from "../services/coffre/coffre-errors";
// State Machine errors for proper error handling
import { CreditTransitionError } from "@shared/machines/credit-workflow";
import { DemandeTransitionError } from "@shared/machines/demande-workflow";
import { createLogger } from "../lib/logger";

const logger = createLogger('Finance');
import {
  StatutCompte,
  StatutCredit,
  StatutDemande,
  StatutTransfertCaisse,
  StatutClient,
  StatutEnquete,
  StatutCaisse,
  TypeCompte,
  DureeUnite as DureeUniteEnum,
  FrequenceRemboursement,
} from "@shared/enum/status-constants";
import { requireAuth } from "../auth";
import { requireAgenceAccess, requireAgenceIdAccess } from "../middleware";
import { attachAbility, requireAbility, requireDisbursement, hasAbility, Actions, Subjects } from "../authorization";
import { logAudit } from "../audit";
import { normalizeKeysDeep, coerceValueToSchema } from "./utils";
import { dispatchDomainEvent } from "../services/notifications/domain-events/event-registry";
import { generateCreditReminderSchedule } from "../services/notifications/credit-reminder-service";
import { db } from "../db";
import { z } from "zod";
import {
  validerCoherenceFrequenceDuree,
  calculerNombreEcheances,
  type FrequenceRemboursement as FrequenceRemboursementType,
  type DureeUnite
} from "@shared/config/credit-durations";
import { getWsInstance } from "../ws-server";
import { eq, desc, and, sql, count, inArray } from "drizzle-orm";
import { SystemRole, isAdminRole, normalizeRole } from "@shared/types/roles";
import * as sessionService from "../services/caisse/session-service";
import { sessionOpeningService } from "../services/caisse/session-opening-service";
import { sessionClosingService } from "../services/caisse/session-closing-service";
import { accessControlService } from "../services/caisse/access-control-service";
import { countSuggestionService } from "../services/caisse/count-suggestion-service";
import { isIncomingOperation, isOutgoingOperation, getOperationDelta, CAISSE_IN_OPERATIONS } from "@shared/config/caisse-operations";
import { paymentService } from "../services/mobile-money/payment-service";
import { MethodePaiement } from "@shared/enum/status-constants";
import { D, roundMoney } from "../lib/money";
import { currencySymbol } from "@shared/config/currency";
import { generateCreditSchedule } from "../storage/finance";

export function registerFinanceRoutes(app: Express) {
  // ============================================================
  // Credit Plans Routes
  // ============================================================

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

  app.post("/api/credit-plans", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.PLAN_CREDIT), requireAgenceAccess(), async (req, res) => {
    try {
      const data = normalizeKeysDeep(req.body) as any;
      const { fees, ...planData } = data;

      if (!planData.nom) return res.status(400).json({ message: "Le nom est obligatoire" });
      if (!planData.taux_interet && !planData.tauxInteret) return res.status(400).json({ message: "Le taux d'intérêt est obligatoire" });

      planData.createdBy = (req as any).user?.id;
      planData.updatedBy = (req as any).user?.id;

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

  app.patch("/api/credit-plans/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.PLAN_CREDIT), async (req, res) => {
    try {
      const data = normalizeKeysDeep(req.body) as any;
      const { fees, expectedVersion, ...planData } = data;

      planData.updatedBy = (req as any).user?.id;

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
  app.post("/api/credit-plans/preview-schedule", requireAuth, async (req, res) => {
    try {
      // Simple rate-limit: max 10 requests per 30s per user
      const userId = (req as any).user?.id || "anon";
      const now = Date.now();
      const window = 30_000;
      const maxRequests = 10;
      const timestamps = (previewLimiter.get(userId) || []).filter(t => now - t < window);
      if (timestamps.length >= maxRequests) {
        return res.status(429).json({ message: "Trop de requêtes. Réessayez dans quelques secondes." });
      }
      timestamps.push(now);
      previewLimiter.set(userId, timestamps);
      const { D: toDecimal } = await import("../lib/money");
      const { generateSchedule } = await import("../services/credit-plan");
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

  // Credits
  app.get("/api/credits", requireAuth, requireAgenceAccess("agenceId"), async (req, res) => {
    // req.agenceFilter est injecté par requireAgenceAccess avec l'agenceId
    const agenceFilter = req.agenceFilter as { agenceId?: string } | null;

    const filter: { agenceId?: string; clientId?: string } = agenceFilter ? { agenceId: agenceFilter.agenceId } : {};

    if (req.query.clientId) {
      filter.clientId = req.query.clientId as string;
    }

    const options = {
      search: req.query.search as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      statut: req.query.statut as string | undefined,
    };

    const result = await storage.getAllCredits(filter, options);

    res.json({
      data: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  });

  // Create credit (roles: admin, chef, credit only)
  app.post("/api/credits", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.CREDIT), requireAgenceAccess(), async (req, res) => {
     try {
       const data = normalizeKeysDeep(req.body) as any;
       
       // Generate ID and credit number uniquely
       if (!data.id) {
         const { randomUUID } = await import('crypto'); 
         data.id = randomUUID();
       }

       if (!data.numeroCredit) {
          // Use the generated ID as requested by user
          // "on pourra utilisé l'id du credit"
          data.numeroCredit = `CRED-${data.id.substring(0, 8).toUpperCase()}`;
       }

       const parsed = insertCreditSchema.parse(data);
       
       // Vérifier que le client appartient à l'agence de l'utilisateur
       const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;
       if (agenceFilter?.agenceId) {
         const client = await storage.getClient(parsed.clientId);
         // Si le client n'existe pas ou n'est pas de la bonne agence => Refusé
         if (!client || client.agenceId !== agenceFilter.agenceId) {
           return res.status(403).json({ message: "Accès refusé : ce client appartient à une autre agence" });
         }
       }
       
       const credit = await storage.createCredit(parsed);
       
       await logAudit(
          req,
          "CREATE_CREDIT",
          "credit",
          credit.id,
          undefined,
          "success",
          "low"
       );

       // Notify Credit Update
       const wsInstance = getWsInstance();
       if (wsInstance) {
          wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: 'credit_new', id: credit.id } });
       }

       res.status(201).json(credit);
     } catch (e) {
       res.status(400).json({ message: "Invalid data" });
     }
  });

  // Décaissement de crédit (crée le crédit + gère le canal de décaissement)
  // Canaux supportés: ACCOUNT (compte courant), CASH (espèces caisse), MOBILE_MONEY
  // CASL: Requires 'disburse' or channel-specific permission on Credit
  // Uses requireDisbursement() which handles channel-specific permission checks
  app.post("/api/credits/decaissement", requireAuth, attachAbility, requireDisbursement(), requireAgenceAccess(), async (req, res) => {
    try {
      const data = normalizeKeysDeep(req.body) as any;
      const user = req.session.user;

      // Valider les données requises
      if (!data.demandeId) {
        return res.status(400).json({ message: "L'ID de la demande est requis" });
      }

      // 1. Récupérer la demande et vérifier son statut
      const demande = await storage.getDemandeCredit(data.demandeId);
      if (!demande) {
        return res.status(404).json({ message: "Demande de crédit non trouvée" });
      }

      // Only APPROVED and APPROVED_AFTER_REEVALUATION are eligible for disbursement
      const statutsEligiblesDecaissement = [StatutDemande.APPROVED, StatutDemande.APPROVED_AFTER_REEVALUATION] as string[];
      if (!demande.statut || !statutsEligiblesDecaissement.includes(demande.statut)) {
        return res.status(400).json({ message: `La demande doit être approuvée pour être décaissée (statut actuel: ${demande.statut})` });
      }

      // 2. Récupérer le compte courant du client
      const comptesClient = await getComptesByClient(demande.clientId);
      const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;

      const compteCourant = comptesClient.find((c: any) => {
        const isCompteCourant = c.typeCompte === TypeCompte.CURRENT;
        const isActif = c.statut === StatutCompte.ACTIVE;

        // Vérifier l'agence si nécessaire
        if (agenceFilter?.agenceId) {
          return isCompteCourant && isActif && c.agenceId === agenceFilter.agenceId;
        }
        return isCompteCourant && isActif;
      });

      if (!compteCourant) {
        return res.status(400).json({
          message: "Le client n'a pas de compte courant actif dans cette agence. Impossible de décaisser."
        });
      }

      // 3. Générer les données du crédit
      const { randomUUID } = await import('crypto');
      const creditId = randomUUID();
      const numeroCredit = `CRED-${creditId.substring(0, 8).toUpperCase()}`;
      const montantDecaissement = parseFloat(demande.montantApprouve?.toString() || demande.montantDemande.toString());

      // Canal de décaissement (ACCOUNT par défaut pour rétrocompatibilité)
      const disbursementChannel = data.disbursementChannel || data.channel || 'ACCOUNT';
      const validChannels = ['ACCOUNT', 'CASH', 'MOBILE_MONEY'];
      if (!validChannels.includes(disbursementChannel)) {
        return res.status(400).json({ message: `Canal de décaissement invalide: ${disbursementChannel}. Valeurs acceptées: ${validChannels.join(', ')}` });
      }

      // Déterminer si c'est un décaissement immédiat ou programmé
      const decaissementImmediat = data.decaissementImmediat !== false; // true par défaut
      const dateDecaissement = data.dateDebut || new Date().toISOString().split('T')[0];
      const aujourdhui = new Date().toISOString().split('T')[0];
      const estProgramme = !decaissementImmediat || dateDecaissement > aujourdhui;

      // Récupérer les infos client pour les notifications
      const client = await storage.getClient(demande.clientId);
      const clientName = client ? `${client.prenom || ''} ${client.nom || ''}`.trim() : 'Client';

      // 4. Déterminer le statut initial du crédit selon le canal
      let statutInitial: string;
      let disbursementStatus: string | null = null;

      if (disbursementChannel === 'CASH') {
        // Canal ESPÈCES: Le crédit attend le décaissement physique par le caissier
        statutInitial = StatutCredit.WAITING_DISBURSEMENT;
        disbursementStatus = 'PENDING';
      } else if (disbursementChannel === 'MOBILE_MONEY') {
        // Canal MOBILE_MONEY: En attente du callback API (à implémenter)
        statutInitial = estProgramme ? StatutCredit.PENDING : StatutCredit.ACTIVE;
        disbursementStatus = 'PROCESSING';
      } else {
        // Canal ACCOUNT (par défaut): Flux existant
        // Pour décaissement immédiat: créer en PENDING d'abord, activer APRÈS succès du ledger
        // Ceci garantit qu'on peut annuler (PENDING→CANCELLED) si le transfert échoue
        statutInitial = StatutCredit.PENDING;
        disbursementStatus = estProgramme ? null : 'PENDING';
      }

      // 5. Créer le crédit
      const creditData = {
        id: creditId,
        clientId: demande.clientId,
        numeroCredit,
        montant: montantDecaissement.toString(),
        taux: demande.tauxInteret,
        duree: data.duree || demande.nombreEcheances || demande.dureeValeur,
        typeCredit: demande.typeCredit || 'PERSONAL',
        objetCredit: demande.objetCredit,
        demandeId: demande.id,
        creditPlanId: demande.creditPlanId || null,
        statut: statutInitial,
        echeance: demande.frequenceRemboursement,
        dateDebut: new Date(dateDecaissement),
        dateFin: data.dateFin ? new Date(data.dateFin) : null,
        dateSolvabilite: data.dateSolvabilite ? new Date(data.dateSolvabilite) : null,
        soldeRestant: data.soldeRestant || roundMoney(D(montantDecaissement).times(D(1).plus(D(demande.tauxInteret).div(100)))),
        agenceId: compteCourant.agenceId,
        // Nouveaux champs multi-canal
        disbursementChannel: disbursementChannel as any,
        disbursementStatus: disbursementStatus as any,
      };

      // Guard: Cancel any orphan credits from previous failed disbursement attempts
      const existingCreditsForDemande = await db.select({ id: credits.id, statut: credits.statut })
        .from(credits)
        .where(eq(credits.demandeId, demande.id));

      for (const existing of existingCreditsForDemande) {
        if (existing.statut === StatutCredit.PENDING || existing.statut === StatutCredit.WAITING_DISBURSEMENT) {
          await storage.updateCredit(existing.id, { statut: StatutCredit.CANCELLED as any });
          logger.warn({ creditId: existing.id, demandeId: demande.id }, 'Cancelled orphan credit from previous failed disbursement');
        } else if (existing.statut === StatutCredit.ACTIVE) {
          // An active credit already exists for this demande — prevent duplicate
          return res.status(409).json({
            message: `Un crédit actif (${existing.id}) existe déjà pour cette demande. Décaissement impossible.`
          });
        }
      }

      const parsed = insertCreditSchema.parse(creditData);
      const credit = await storage.createCredit(parsed);

      let nouveauSolde = parseFloat(compteCourant.soldeCourant || '0');
      let message = '';

      // 6. Traitement selon le canal de décaissement
      switch (disbursementChannel) {
        case 'CASH':
          // ===== CANAL ESPÈCES =====
          // Ne pas toucher à l'argent maintenant
          // Émettre une notification WebSocket vers le dashboard caisse
          const wsInstance = getWsInstance();
          if (wsInstance) {
            // Notification spécifique pour le dashboard caisse
            wsInstance.broadcast({
              type: "CAISSE_UPDATE",
              payload: {
                subtype: 'NEW_LOAN_DISBURSEMENT',
                creditId: credit.id,
                numeroCredit,
                clientName,
                clientId: demande.clientId,
                montant: montantDecaissement,
                agenceId: compteCourant.agenceId,
                timestamp: new Date().toISOString()
              }
            });
          }
          message = `Ordre de paiement envoyé à la caisse. Le client ${clientName} doit se présenter au guichet pour récupérer ${montantDecaissement.toLocaleString()} ${currencySymbol()}.`;
          break;

        case 'MOBILE_MONEY':
          // ===== CANAL MOBILE MONEY =====
          // TODO: Intégrer avec le Payment Gateway (Orange Money, MTN MoMo, etc.)
          // Pour l'instant, on simule un succès
          message = `Paiement Mobile Money initié pour ${montantDecaissement.toLocaleString()} ${currencySymbol()}. Le client recevra une notification SMS.`;
          // Note: Dans une implémentation réelle, on appellerait PaymentGateway.disburse()
          // et le statut passerait à ACTIVE après le callback de confirmation
          break;

        case 'ACCOUNT':
        default:
          // ===== CANAL COMPTE (flux existant) =====
          if (!estProgramme) {
            try {
              const result = await storage.createDecaissementWithLedger({
                creditId: credit.id,
                compteId: compteCourant.id,
                montant: montantDecaissement.toString(),
                numeroCredit
              }, user?.id);

              nouveauSolde += montantDecaissement;

              // Succès: Activer le crédit et marquer le décaissement comme complété
              await storage.updateCredit(credit.id, {
                statut: StatutCredit.ACTIVE as any,
                disbursementStatus: 'COMPLETED' as any,
                disbursedAt: new Date(),
                disbursedBy: user?.id
              });

              // Générer l'échéancier automatiquement à l'activation
              try {
                await generateCreditSchedule(credit.id);
              } catch (scheduleErr) {
                logger.warn({ err: scheduleErr, creditId: credit.id }, 'Échéancier non généré (non bloquant)');
              }

              // Score event: INITIAL_SCORE for newly disbursed credit
              try {
                const { recordScoreEvent } = await import('../services/scoring-engine');
                await recordScoreEvent({
                  clientId: demande.clientId,
                  agenceId: credit.agenceId ?? undefined,
                  eventType: 'INITIAL_SCORE',
                  refId: credit.id,
                  refType: 'credit',
                  montant: montantDecaissement,
                  createdBy: user?.id,
                });
              } catch (scoreErr) {
                logger.warn({ err: scoreErr, creditId: credit.id }, 'Score event INITIAL_SCORE failed (non-blocking)');
              }

            } catch (err: any) {
              logger.error({ err, creditId: credit.id }, 'Erreur Ledger lors du décaissement');

              // ROLLBACK: Annuler le crédit créé puisque le transfert a échoué
              // (PENDING → CANCELLED est autorisé par la state machine)
              try {
                await storage.updateCredit(credit.id, {
                  statut: StatutCredit.CANCELLED as any,
                  disbursementStatus: 'PENDING' as any
                });
                logger.info({ creditId: credit.id }, 'Crédit annulé après échec du décaissement');
              } catch (cleanupErr) {
                logger.error({ err: cleanupErr, creditId: credit.id }, 'Échec annulation crédit orphelin');
              }

              // Re-throw business errors (coffre guards, insufficient funds) as-is
              // so the outer catch can handle them with structured responses
              if (isCoffreCaisseError(err) || err instanceof DecaissementInsufficientFundsError) {
                throw err;
              }
              throw new Error(`Erreur lors du décaissement effectif: ${err.message}`);
            }
          }
          message = estProgramme
            ? `Décaissement programmé pour le ${new Date(dateDecaissement).toLocaleDateString('fr-FR')}. Crédit ${numeroCredit} créé en attente.`
            : `Crédit ${numeroCredit} décaissé. ${montantDecaissement.toLocaleString()} ${currencySymbol()} crédités sur le compte ${compteCourant.numeroCompte}`;
          break;
      }

      // 7. Mettre à jour le statut de la demande
      await storage.updateDemandeCredit(demande.id, { statut: StatutDemande.DISBURSED });

      // 8. Log audit
      await logAudit(
        req,
        disbursementChannel === 'CASH' ? "DECAISSEMENT_CASH_INITIE" :
        disbursementChannel === 'MOBILE_MONEY' ? "DECAISSEMENT_MOMO_INITIE" :
        estProgramme ? "DECAISSEMENT_PROGRAMME" : "DECAISSEMENT_CREDIT",
        "credit",
        credit.id,
        {
          demandeId: demande.id,
          montant: montantDecaissement,
          compteId: compteCourant.id,
          numeroCredit,
          programme: estProgramme,
          dateDecaissement: estProgramme ? dateDecaissement : null,
          disbursementChannel,
          disbursementStatus
        },
        "success",
        "high"
      );

      // 9. Broadcast updates (sauf pour CASH qui a déjà été notifié)
      const wsInstanceBroadcast = getWsInstance();
      const userAgence = user?.agence;
      if (wsInstanceBroadcast && userAgence) {
        wsInstanceBroadcast.broadcastToAgency(userAgence, {
          type: "CREDIT_UPDATE",
          payload: {
            type: 'credit_decaissement',
            id: credit.id,
            programme: estProgramme,
            disbursementChannel
          }
        });
        wsInstanceBroadcast.broadcastToAgency(userAgence, { type: "DASHBOARD_UPDATE", payload: {} });

        // Activité live avec info sur le canal
        const channelLabel = disbursementChannel === 'CASH' ? '(Espèces)' :
                            disbursementChannel === 'MOBILE_MONEY' ? '(Mobile Money)' : '';
        wsInstanceBroadcast.broadcastToAgency(userAgence, {
          type: "LIVE_ACTIVITY",
          payload: {
            action: disbursementChannel === 'CASH'
              ? `Décaissement en attente ${channelLabel}: ${montantDecaissement.toLocaleString()} ${currencySymbol()} pour ${clientName}`
              : estProgramme
                ? `Décaissement programmé: ${montantDecaissement.toLocaleString()} ${currencySymbol()} → ${compteCourant.numeroCompte} (${dateDecaissement})`
                : `Décaissement ${channelLabel}: ${montantDecaissement.toLocaleString()} ${currencySymbol()} → ${compteCourant.numeroCompte}`,
            user: user?.nom || 'Système',
            type: 'credit',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Domain event: credit disbursed
      dispatchDomainEvent({
        type: "CREDIT_DISBURSED",
        data: {
          creditId: credit.id,
          numeroCredit,
          clientId: demande.clientId,
          clientName,
          montant: montantDecaissement,
          channel: disbursementChannel,
          agenceId: compteCourant.agenceId,
          disbursedByUserId: user?.id,
        },
        timestamp: new Date(),
      });

      // Generate SMS reminder schedules for this credit's repayment dates
      generateCreditReminderSchedule(credit.id).catch((err: unknown) => {
        logger.error({ err, creditId: credit.id }, 'Failed to generate credit reminders');
      });

      res.status(201).json({
        success: true,
        credit: credit,
        compteCourant: (estProgramme || disbursementChannel === 'CASH') ? null : {
          id: compteCourant.id,
          numero: compteCourant.numeroCompte,
          nouveauSolde
        },
        programme: estProgramme,
        dateDecaissement: estProgramme ? dateDecaissement : null,
        disbursementChannel,
        disbursementStatus,
        message
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur décaissement crédit');

      // Gestion d'erreur structurée pour le workflow de réapprovisionnement
      if (error instanceof InsufficientFundsError) {
        return res.status(error.httpStatus).json({
          success: false,
          error: error.toJSON(),
        });
      }

      if (error instanceof DecaissementInsufficientFundsError) {
        return res.status(error.httpStatus).json({
          success: false,
          error: error.data,
        });
      }

      // Guard errors (CoffreInsufficientFunds, CoffreInactif, CoffreSoldeMinimum, CoffrePlafondJournalier, etc.)
      if (isCoffreCaisseError(error)) {
        return res.status(error.httpStatus).json({
          success: false,
          error: error.data,
        });
      }

      res.status(500).json({
        success: false,
        message: error.message || "Erreur lors du décaissement"
      });
    }
  });

  // =====================================================
  // DÉCAISSEMENT CAISSE - Endpoints pour le workflow asynchrone
  // =====================================================

  /**
   * GET /api/credits/pending-disbursements
   * Liste les crédits en attente de décaissement physique à la caisse
   */
  app.get("/api/credits/pending-disbursements", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.CREDIT), requireAgenceAccess(), async (req, res) => {
    try {
      const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
      const caisseId = req.query.caisseId as string | undefined;
      const pendingDisbursements = await storage.getPendingLoanDisbursements(agenceFilter?.agenceId, caisseId);

      res.json({
        success: true,
        data: pendingDisbursements.map(item => ({
          ...(item.credit as Record<string, unknown>),
          client: item.client
        })),
        count: pendingDisbursements.length
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur récupération décaissements en attente');
      res.status(500).json({
        success: false,
        message: error.message || "Erreur lors de la récupération des décaissements en attente"
      });
    }
  });

  /**
   * POST /api/credits/:id/caisse-payout
   * Exécute le décaissement physique par le caissier
   * C'est ce bouton "Décaisser" qui sort l'argent et active le prêt
   */
  app.post("/api/credits/:id/caisse-payout", requireAuth, attachAbility, requireAbility(Actions.DISBURSE_CASH, Subjects.CREDIT), requireAgenceAccess(), async (req, res) => {
    try {
      const { id: creditId } = req.params;
      const data = normalizeKeysDeep(req.body) as any;
      const user = req.session.user;

      if (!user?.id) {
        return res.status(401).json({ message: "Utilisateur non authentifié" });
      }

      // Vérifier que le caissier a une session ouverte
      if (!data.sessionCaisseId) {
        return res.status(400).json({ message: "L'ID de la session de caisse est requis" });
      }

      // Exécuter le décaissement
      const result = await storage.processLoanCashPayout({
        creditId,
        sessionCaisseId: data.sessionCaisseId,
        paymentReference: data.paymentReference || data.receiptNumber
      }, user.id);

      const shouldAutoCloseSession = Boolean(data.closeSessionAfterDisbursement);
      if (shouldAutoCloseSession) {
        try {
          await sessionService.closeSessionTemporarily({
            sessionId: data.sessionCaisseId,
            closedBy: user.id,
            observation: "Fermeture automatique après décaissement crédit urgent",
            ipAddress: req.ip,
            userAgent: req.get("User-Agent"),
          });
        } catch (closeError: any) {
          logger.error({ err: closeError, sessionId: data.sessionCaisseId }, 'Auto-clôture session après décaissement crédit échouée');
        }
      }

      // Log audit
      await logAudit(
        req,
        "DECAISSEMENT_CAISSE_EXECUTE",
        "credit",
        creditId,
        {
          sessionCaisseId: data.sessionCaisseId,
          paymentReference: data.paymentReference,
          montant: result.credit.montant,
          numeroCredit: result.credit.numeroCredit
        },
        "success",
        "high"
      );

      // Broadcast updates
      const wsInstance = getWsInstance();
      const userAgence = user?.agence;
      if (wsInstance) {
        // Notification globale pour la caisse
        wsInstance.broadcast({
          type: "CAISSE_UPDATE",
          payload: {
            subtype: 'LOAN_DISBURSEMENT_COMPLETED',
            creditId,
            numeroCredit: result.credit.numeroCredit,
            montant: result.credit.montant,
            timestamp: new Date().toISOString()
          }
        });

        // Notification crédit
        if (userAgence) {
          wsInstance.broadcastToAgency(userAgence, {
            type: "CREDIT_UPDATE",
            payload: {
              type: 'credit_activated',
              id: creditId
            }
          });
          wsInstance.broadcastToAgency(userAgence, { type: "DASHBOARD_UPDATE", payload: {} });
          wsInstance.broadcastToAgency(userAgence, {
            type: "LIVE_ACTIVITY",
            payload: {
              action: `Décaissement espèces effectué: ${parseFloat(result.credit.montant).toLocaleString()} ${currencySymbol()} - Crédit ${result.credit.numeroCredit} activé`,
              user: user?.nom || 'Caissier',
              type: 'credit',
              timestamp: new Date().toISOString()
            }
          });
        }
      }

      res.json({
        success: true,
        credit: result.credit,
        mouvement: result.mouvement,
        echeances: result.echeances,
        message: `Crédit ${result.credit.numeroCredit} décaissé et activé avec succès.`
      });

    } catch (error: any) {
      logger.error({ err: error }, 'Erreur décaissement caisse');

      if (error instanceof InsufficientFundsError) {
        return res.status(error.httpStatus).json({
          success: false,
          error: error.toJSON(),
        });
      }

      if (error instanceof DecaissementInsufficientFundsError) {
        return res.status(error.httpStatus).json({
          success: false,
          error: error.data,
        });
      }

      if (isCoffreCaisseError(error)) {
        return res.status(error.httpStatus).json({
          success: false,
          error: error.data,
        });
      }

      res.status(500).json({
        success: false,
        message: error.message || "Erreur lors du décaissement caisse"
      });
    }
  });

  /**
   * POST /api/credits/:id/cancel-disbursement
   * Annule un décaissement en attente (si le client ne se présente pas)
   */
  app.post("/api/credits/:id/cancel-disbursement", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.CREDIT), requireAgenceAccess(), async (req, res) => {
    try {
      const { id: creditId } = req.params;
      const data = normalizeKeysDeep(req.body) as any;
      const user = req.session.user;

      const credit = await storage.getCredit(creditId);
      if (!credit) {
        return res.status(404).json({ message: "Crédit non trouvé" });
      }

      if (credit.statut !== 'WAITING_DISBURSEMENT') {
        return res.status(400).json({
          message: `Impossible d'annuler: le crédit n'est pas en attente de décaissement (statut: ${credit.statut})`
        });
      }

      // Mettre à jour le crédit
      const updatedCredit = await storage.updateCredit(creditId, {
        statut: StatutCredit.CANCELLED,
        disbursementStatus: 'COMPLETED' as any // Completed = processed (even if cancelled)
      });

      // Mettre à jour la demande associée si elle existe
      if (credit.demandeId) {
        await storage.updateDemandeCredit(credit.demandeId, {
          statut: StatutDemande.REJECTED,
          motifRejet: 'Décaissement annulé',
          dateRejet: new Date()
        });
      }

      // Log audit
      await logAudit(
        req,
        "DECAISSEMENT_ANNULE",
        "credit",
        creditId,
        {
          raison: data.raison || "Client non présenté",
          numeroCredit: credit.numeroCredit
        },
        "success",
        "medium"
      );

      // Broadcast
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "CAISSE_UPDATE",
          payload: {
            subtype: 'LOAN_DISBURSEMENT_CANCELLED',
            creditId,
            timestamp: new Date().toISOString()
          }
        });
      }

      res.json({
        success: true,
        credit: updatedCredit,
        message: `Décaissement du crédit ${credit.numeroCredit} annulé.`
      });

    } catch (error: any) {
      logger.error({ err: error }, 'Erreur annulation décaissement');
      res.status(500).json({
        success: false,
        message: error.message || "Erreur lors de l'annulation"
      });
    }
  });

  /**
   * POST /api/credits/batch-disburse/validate
   * Validation préalable des crédits avant décaissement groupé
   * Retourne les crédits valides et invalides avec raisons
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
  
  app.get("/api/credits/:id/echeances", requireAuth, requireAgenceAccess(), async (req, res) => {
    const echeances = await storage.getEcheancesByCredit(req.params.id);
    res.json(echeances);
  });

  app.get("/api/credits/:id/echeances/prochaine", requireAuth, requireAgenceAccess(), async (req, res) => {
    const echeance = await storage.getProchaineEcheance(req.params.id);
    // Si pas d'échéance trouvée (toutes payées ou aucune générée), on renvoie null ou 204
    if (!echeance) return res.json(null);
    
    // Enrichir avec des infos utiles pour le frontend si besoin
    res.json(echeance);
  });

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


  // Aggregation endpoint for dashboard badges
  app.get("/api/demandes-credit/counts", requireAuth, requireAgenceAccess("agenceId"), async (req, res) => {
      try {
        const agenceFilter = req.agenceFilter as { agenceId?: string } | null;

        // Base query - only select status and count
        const query = db.select({
            status: demandesCredit.statut,
            count: count()
        })
        .from(demandesCredit)
        .groupBy(demandesCredit.statut);

        // Apply Agency Filter - utilise directement l'agenceId (plus sûr)
        if (agenceFilter?.agenceId) {
             query.where(eq(demandesCredit.agenceId, agenceFilter.agenceId));
        }
        
        const results = await query;

        // Map to frontend tabs using standardized EN enum values
        // toProcess = PENDING_FEES
        // investigation = READY_FOR_INVESTIGATION + UNDER_INVESTIGATION + INVESTIGATION_COMPLETE
        // approval = PENDING_APPROVAL
        // commission = APPROVED + APPROVED_AFTER_REEVALUATION
        // reevaluation = REEVALUATION_IN_PROGRESS

        const mapping = {
            toProcess: 0,
            investigation: 0,
            approval: 0,
            commission: 0,
            reevaluation: 0,
            archives: 0
        };

        for (const row of results) {
            const s = row.status || '';
            const c = Number(row.count);

            if ([StatutDemande.PENDING_FEES].includes(s as any)) {
                mapping.toProcess += c;
            } else if ([StatutDemande.READY_FOR_INVESTIGATION, StatutDemande.UNDER_INVESTIGATION, StatutDemande.INVESTIGATION_COMPLETE].includes(s as any)) {
                mapping.investigation += c;
            } else if (s === StatutDemande.PENDING_APPROVAL) {
                mapping.approval += c;
            } else if ([StatutDemande.APPROVED, StatutDemande.APPROVED_AFTER_REEVALUATION].includes(s as any)) {
                mapping.commission += c;
            } else if (s === StatutDemande.REEVALUATION_IN_PROGRESS) {
                mapping.reevaluation += c;
            } else if ([StatutDemande.REJECTED, StatutDemande.CANCELLED, StatutDemande.DEFINITIVELY_REJECTED, StatutDemande.DELETED].includes(s as any)) {
                mapping.archives += c;
            }
        }

        res.json(mapping);
      } catch (error: any) {
          logger.error({ err: error }, 'Error fetching credit counts');
          res.status(500).json({ message: "Erreur lors du comptage des dossiers" });
      }
  });

  app.get("/api/demandes-credit", requireAuth, requireAgenceAccess("agenceId"), async (req, res) => {
      const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
      const includeDeleted = req.query.includeDeleted === 'true';
      const filter = agenceFilter ? { agenceId: agenceFilter.agenceId, includeDeleted } : { includeDeleted };

      const demandes = await storage.getAllDemandes(filter);

      res.json(demandes);
  });

  // Create demande credit (roles: admin, chef, credit, superviseur, terrain)
  app.post("/api/demandes-credit", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.DEMANDE_CREDIT), requireAgenceAccess(), async (req, res) => {
      const data = normalizeKeysDeep(req.body) as any;

      // Auto-generate numeroDemande if not provided
      if (!data.numeroDemande) {
          // Format: DEM-YYYYMMDD-XXXX
          const dateStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
          const { randomInt } = await import('crypto');
          const randomSuffix = randomInt(1000, 10000).toString();
          data.numeroDemande = `DEM-${dateStr}-${randomSuffix}`;
      }

      // Validation coherence frequence/duree
      if (data.frequenceRemboursement && data.dureeValeur && data.dureeUnite) {
        const resultatValidation = validerCoherenceFrequenceDuree(
          data.frequenceRemboursement as FrequenceRemboursementType,
          Number(data.dureeValeur),
          data.dureeUnite as DureeUnite
        );

        if (!resultatValidation.isValid) {
          return res.status(400).json({
            message: resultatValidation.debugMessage || "Durée invalide pour cette fréquence",
            code: resultatValidation.errorCode || "INVALID_DURATION_FREQUENCY"
          });
        }

        // Calculer automatiquement le nombre d'echeances
        data.nombreEcheances = calculerNombreEcheances(
          data.frequenceRemboursement as FrequenceRemboursementType,
          Number(data.dureeValeur),
          data.dureeUnite as DureeUnite
        );
      }

      // Nettoyage des champs numériques optionnels (évite "invalid input syntax for type numeric: ''")
      const optionalNumericFields = ['revenusMensuels', 'revenuJournalier', 'chargesMensuelles', 'montantApprouve', 'montantFraisEngagement'];
      for (const field of optionalNumericFields) {
        if (data[field] === "") {
          data[field] = null;
        }
      }

      // Always enforce the client's agency
      if (data.clientId) {
        const client = await storage.getClient(data.clientId);
        if (client) {
          data.agenceId = client.agenceId;
        }
      }

      // Validation du plan de crédit si fourni
      if (data.creditPlanId) {
        const plan = await storage.getCreditPlan(data.creditPlanId);
        if (!plan) {
          return res.status(400).json({ message: "Plan de crédit introuvable" });
        }
        if (!plan.isActive) {
          return res.status(400).json({ message: "Ce plan de crédit n'est plus actif" });
        }
        const now = new Date();
        if (plan.effectiveFrom && new Date(plan.effectiveFrom) > now) {
          return res.status(400).json({ message: "Ce plan n'est pas encore en vigueur" });
        }
        if (plan.effectiveTo && new Date(plan.effectiveTo) < now) {
          return res.status(400).json({ message: "Ce plan de crédit a expiré" });
        }
        const montant = parseFloat(data.montantDemande);
        if (plan.montantMin && montant < parseFloat(plan.montantMin)) {
          return res.status(400).json({ message: `Montant minimum pour ce plan : ${plan.montantMin}` });
        }
        if (plan.montantMax && montant > parseFloat(plan.montantMax)) {
          return res.status(400).json({ message: `Montant maximum pour ce plan : ${plan.montantMax}` });
        }
      }

      const parsed = insertDemandeCreditSchema.parse(data);

      // Vérifier agence du client
      const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;
      if (agenceFilter?.agenceId) {
        const client = await storage.getClient(parsed.clientId);
        if (!client || client.agenceId !== agenceFilter.agenceId) {
          return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
        }
      }

      const demande = await storage.createDemandeCredit(parsed);
      
      
      // Notify Admins
       const wsInstance = getWsInstance();
      const userAgence = req.session.user?.agence;

      if (wsInstance && userAgence) {
         // Broadcast only to this agency
         wsInstance.broadcastToAgency(userAgence, {
            type: "NOTIFICATION",
            payload: {
               message: `Nouvelle demande de crédit #${demande.id}`,
               targetRole: "admin"
            }
         });
         // Update Dashboard & Credits List
         wsInstance.broadcastToAgency(userAgence, { type: "DASHBOARD_UPDATE", payload: {} });
         wsInstance.broadcastToAgency(userAgence, { type: "CREDIT_UPDATE", payload: {} });
         
         // Activité en temps réel
         wsInstance.broadcastToAgency(userAgence, {
           type: "LIVE_ACTIVITY",
           payload: {
             action: `Nouveau crédit: ${Number(parsed.montantDemande || 0).toLocaleString()} ${currencySymbol()}`,
             user: req.session.user?.nom || 'Système',
             type: 'credit',
             timestamp: new Date().toISOString()
           }
         });
      }
      
      // Domain event: credit request created
      dispatchDomainEvent({
        type: "CREDIT_REQUEST_CREATED",
        data: {
          demandeId: demande.id,
          numeroDemande: demande.numeroDemande,
          clientId: parsed.clientId,
          montantDemande: Number(parsed.montantDemande || 0),
          agenceId: req.session.user?.agenceId,
          createdByUserId: req.session.user?.id,
          createdByName: req.session.user?.nom,
        },
        timestamp: new Date(),
      });

      res.json(demande);
  });

  app.patch("/api/demandes-credit/:id", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.DEMANDE_CREDIT), async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = normalizeKeysDeep(req.body) as any;

      // Verify existence
      const existing = await storage.getDemandeCredit(id);
      if (!existing) return res.status(404).json({ message: "Demande non trouvée" });

      let updated;

      // Auto-set dateRejet when status is REJECTED or DEFINITIVELY_REJECTED
      if (updateData.statut === StatutDemande.REJECTED || updateData.statut === StatutDemande.DEFINITIVELY_REJECTED) {
        if (!updateData.dateRejet) {
          updateData.dateRejet = new Date();
        }
      }

      // Auto-transition: UNDER_INVESTIGATION → INVESTIGATION_COMPLETE → PENDING_APPROVAL → APPROVED
      // When approving from investigation status, automatically route through intermediate states
      if (updateData.statut === StatutDemande.APPROVED && existing.statut === StatutDemande.UNDER_INVESTIGATION) {
        updated = await db.transaction(async (tx) => {
          await storage.updateDemandeCredit(id, { statut: StatutDemande.INVESTIGATION_COMPLETE }, tx);
          await storage.updateDemandeCredit(id, { statut: StatutDemande.PENDING_APPROVAL }, tx);
          return await storage.updateDemandeCredit(id, updateData, tx);
        });
      }
      // Auto-transition: INVESTIGATION_COMPLETE → PENDING_APPROVAL → APPROVED
      else if (updateData.statut === StatutDemande.APPROVED && existing.statut === StatutDemande.INVESTIGATION_COMPLETE) {
        updated = await db.transaction(async (tx) => {
          await storage.updateDemandeCredit(id, { statut: StatutDemande.PENDING_APPROVAL }, tx);
          return await storage.updateDemandeCredit(id, updateData, tx);
        });
      }
      // Logic for Refund on Rejection
      else if (updateData.statut === StatutDemande.REJECTED && updateData.montantRemboursement && Number(updateData.montantRemboursement) > 0) {
          const refundAmount = Number(updateData.montantRemboursement);

          updated = await db.transaction(async (tx) => {
            // 1. Validation
            if (!existing.fraisEngagementPayes) {
               throw new Error("Aucun frais n'a été payé pour cette demande.");
            }
            const maxRefund = Number(existing.montantFraisEngagement || 0);
            if (refundAmount > maxRefund) {
               throw new Error(`Le montant du remboursement (${refundAmount}) ne peut pas excéder les frais payés (${maxRefund}).`);
            }

            // 2. Create Refund Request (Wait for approval/payment)
            await storage.createCreditRefundRequest({
              demandeId: existing.id,
              clientId: existing.clientId,
              agenceId: req.session.user?.agenceId!, // Validated by middleware
              montantEncaisse: existing.montantFraisEngagement?.toString() || '0',
              montantRemboursable: refundAmount.toString(),
              montantNonRemboursable: (maxRefund - refundAmount).toString(),
              statut: 'SUBMITTED', // Ready for approval/payment
              motifRejetCredit: updateData.motifRejet,
              motifRemboursement: "Remboursement suite rejet", // Default
              makerId: req.session.user?.id,
              makerAt: new Date(),
            }, tx);

            // 3. Update Demande Status (State Machine guard in storage layer)
            // Motif Rejet Update
            if (updateData.motifRejet) {
                 updateData.motifRejet += ` (Remboursement de ${refundAmount} ${currencySymbol()} en attente)`;
            }

            return await storage.updateDemandeCredit(id, updateData, tx);
          });
      } else {
          // Normal update (State Machine guard in storage layer)
          updated = await storage.updateDemandeCredit(id, updateData);
      }

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({
            type: "CREDIT_UPDATE",
            payload: {
              type: 'demande_updated',
              id,
              statut: updateData.statut
            }
          });

           // Si approuvée, notifier en temps réel + SMS
           if (updateData.statut === StatutDemande.APPROVED) {
              const userAgence = req.session.user?.agence;
              if (userAgence) {
                wsInstance.broadcastToAgency(userAgence, {
                  type: "LIVE_ACTIVITY",
                  payload: {
                    action: `Crédit Approuvé: #${existing.numeroDemande}`,
                    user: req.session.user?.nom || 'Système',
                    type: 'validation',
                    timestamp: new Date().toISOString()
                  }
                });
              }

              // Dispatch domain event for credit approval notification
              const montantNotification = existing.montantApprouve || existing.montantDemande;
              if (existing.clientId && montantNotification) {
                dispatchDomainEvent({
                  type: "CREDIT_APPROVED",
                  data: {
                    demandeId: existing.id,
                    numeroDemande: existing.numeroDemande,
                    clientId: existing.clientId,
                    montantApprouve: Number(montantNotification),
                    agenceId: req.session.user?.agenceId,
                    approvedByUserId: req.user?.id,
                  },
                  timestamp: new Date(),
                });
              }
           }

           // Si rejetée, notifier le client
           if (updateData.statut === StatutDemande.REJECTED && existing.clientId) {
              dispatchDomainEvent({
                type: "CREDIT_REJECTED",
                data: {
                  demandeId: existing.id,
                  numeroDemande: existing.numeroDemande,
                  clientId: existing.clientId,
                  motifRejet: updateData.motifRejet,
                  agenceId: req.session.user?.agenceId,
                  rejectedByUserId: req.user?.id,
                },
                timestamp: new Date(),
              });
           }
      }

      res.json(updated);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur mise à jour demande crédit');

      // State Machine error: return 400 with clear message
      if (error instanceof DemandeTransitionError) {
        return res.status(400).json({
          code: error.code,
          message: error.message,
          fromStatus: error.fromStatus,
          toStatus: error.toStatus
        });
      }

      res.status(500).json({ message: error.message || "Erreur lors de la mise à jour de la demande" });
    }
  });

  app.delete("/api/demandes-credit/:id", requireAuth, attachAbility, requireAbility(Actions.DELETE, Subjects.DEMANDE_CREDIT), async (req, res) => {
      const success = await storage.deleteDemandeCredit(req.params.id);
      if (!success) return res.status(404).json({ message: "Demande non trouvée" });
      
       const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: 'demande_deleted', id: req.params.id } });
      }
      
      res.json({ success: true });
  });

  app.put("/api/demandes-credit/:id/cancel", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.DEMANDE_CREDIT), async (req, res) => {
    try {
      const { motif } = req.body;
      // State Machine guard is in storage.cancelDemandeCredit
      const demande = await storage.cancelDemandeCredit(req.params.id, motif);

      if (!demande) return res.status(404).json({ message: "Demande non trouvée" });

      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: 'demande_cancelled', id: req.params.id } });
      }

      res.json(demande);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur annulation demande crédit');

      // State Machine error: return 400 with clear message
      if (error instanceof DemandeTransitionError) {
        return res.status(400).json({
          code: error.code,
          message: error.message,
          fromStatus: error.fromStatus,
          toStatus: error.toStatus
        });
      }

      res.status(500).json({ message: error.message || "Erreur lors de l'annulation de la demande" });
    }
  });

  // Assign investigation — creates enquête with ASSIGNED status, demande stays at READY_FOR_INVESTIGATION
  app.post("/api/demandes-credit/:id/start-investigation", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.DEMANDE_CREDIT), async (req, res) => {
    try {
      const { id } = req.params;
      const data = normalizeKeysDeep(req.body) as Record<string, any>;
      const assignedAgentId = data.agentId || data.assignedAgentId;
      const priority = data.priority || "MEDIUM";
      const dueDate = data.dueDate;

      // Get demande
      const demande = await storage.getDemandeCredit(id);
      if (!demande) {
        return res.status(404).json({ message: "Demande non trouvée" });
      }

      // Verify status is READY_FOR_INVESTIGATION
      if (demande.statut !== StatutDemande.READY_FOR_INVESTIGATION) {
        return res.status(400).json({
          message: `Cette demande ne peut pas démarrer une enquête (statut actuel: ${demande.statut}). Seules les demandes en attente d'enquête peuvent démarrer.`
        });
      }

      if (!assignedAgentId) {
        return res.status(400).json({ message: "Veuillez sélectionner un agent terrain pour l'enquête." });
      }

      // Create the enquête record with agent assignment (statut = ASSIGNED)
      // The demande stays at READY_FOR_INVESTIGATION until the agent starts the investigation
      const enqueteValues: Record<string, any> = {
        clientId: demande.clientId,
        demandeId: id,
        montantDemande: demande.montantDemande?.toString() || "0",
        objetCredit: demande.objetCredit || "À définir",
        assignedAgentId,
        assignedAt: new Date(),
        assignedBy: req.session?.user?.id,
        priority,
        statut: "ASSIGNED",
        ...(dueDate && { dueDate: new Date(dueDate) }),
      };

      const [enquete] = await db
        .insert(enquetesCredit)
        .values(enqueteValues as any)
        .returning();

      const wsInstance = getWsInstance();
      if (wsInstance) {
        // Broadcast to all for badge/list updates
        wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: 'investigation_assigned', id, agentId: assignedAgentId } });
        // Targeted notification to the assigned agent for instant visibility
        wsInstance.sendToUser(assignedAgentId, {
          type: "CREDIT_UPDATE",
          payload: { type: 'enquete_assigned_to_me', enqueteId: enquete.id, demandeId: id, priority },
        });
      }

      // Domain event: investigation assigned/started
      dispatchDomainEvent({
        type: "CREDIT_INVESTIGATION_ASSIGNED",
        data: {
          demandeId: id,
          numeroDemande: demande.numeroDemande,
          clientId: demande.clientId,
          agentId: assignedAgentId,
          agentName: req.session.user?.nom || 'Agent',
          agenceId: req.session.user?.agenceId,
        },
        timestamp: new Date(),
      });

      // Schedule deadline reminders for the agent (J-3, J-1, J, J+1)
      if (dueDate && enquete.id) {
        try {
          const { generateInvestigationReminderSchedule } = await import("../services/notifications/investigation-reminder-service");
          const count = await generateInvestigationReminderSchedule(enquete.id);
          if (count > 0) {
            logger.info({ enqueteId: enquete.id, reminderCount: count }, "Investigation reminders scheduled");
          }
        } catch (reminderErr) {
          // Non-blocking: reminder scheduling failure should not break assignment
          logger.warn({ err: reminderErr, enqueteId: enquete.id }, "Failed to schedule investigation reminders");
        }
      }

      res.json({ success: true, demande, enquete });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur démarrage enquête');
      res.status(500).json({ message: error.message || "Erreur lors du démarrage de l'enquête" });
    }
  });

  // Reassign investigation — change the agent on an existing enquête (only if not yet started)
  app.post("/api/demandes-credit/:id/reassign-investigation", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.DEMANDE_CREDIT), async (req, res) => {
    try {
      const { id } = req.params;
      const data = normalizeKeysDeep(req.body) as Record<string, any>;
      const newAgentId = data.agentId || data.assignedAgentId;
      const priority = data.priority;
      const dueDate = data.dueDate;

      if (!newAgentId) {
        return res.status(400).json({ message: "Veuillez sélectionner un agent terrain." });
      }

      // Get demande
      const demande = await storage.getDemandeCredit(id);
      if (!demande) {
        return res.status(404).json({ message: "Demande non trouvée" });
      }

      // Allow reassignment for READY_FOR_INVESTIGATION (assigned but agent hasn't started)
      // or UNDER_INVESTIGATION (agent started but hasn't progressed)
      const allowedReassignStatuses = [StatutDemande.READY_FOR_INVESTIGATION, StatutDemande.UNDER_INVESTIGATION];
      if (!allowedReassignStatuses.includes(demande.statut as any)) {
        return res.status(400).json({ message: "Cette demande ne peut pas être réassignée dans son statut actuel." });
      }

      // Find the existing enquête for this demande
      const [existingEnquete] = await db
        .select()
        .from(enquetesCredit)
        .where(eq(enquetesCredit.demandeId, id))
        .orderBy(desc(enquetesCredit.createdAt))
        .limit(1);

      if (!existingEnquete) {
        return res.status(404).json({ message: "Aucune enquête trouvée pour cette demande." });
      }

      // Only allow reassignment if the agent hasn't started (no startedAt, status is not IN_PROGRESS/SUBMITTED)
      const blockedStatuses = ["IN_PROGRESS", "SUBMITTED", "REVIEWED", "CLOSED"];
      if (existingEnquete.statut && blockedStatuses.includes(existingEnquete.statut)) {
        return res.status(400).json({ message: "L'agent a déjà commencé l'enquête. La réassignation n'est plus possible." });
      }

      // Cancel old reminders
      try {
        const { cancelInvestigationReminders } = await import("../services/notifications/investigation-reminder-service");
        await cancelInvestigationReminders(existingEnquete.id, "Réassignation de l'enquête");
      } catch {
        // Non-blocking
      }

      // Update the enquête with new agent, reset to ASSIGNED
      const updateValues: Record<string, any> = {
        assignedAgentId: newAgentId,
        assignedAt: new Date(),
        assignedBy: req.session?.user?.id,
        statut: "ASSIGNED",
        startedAt: null,
        updatedAt: new Date(),
      };
      if (priority) updateValues.priority = priority;
      if (dueDate) updateValues.dueDate = new Date(dueDate);

      const [updated] = await db
        .update(enquetesCredit)
        .set(updateValues)
        .where(eq(enquetesCredit.id, existingEnquete.id))
        .returning();

      // If demande was UNDER_INVESTIGATION (agent had started), reset to READY_FOR_INVESTIGATION
      if (demande.statut === StatutDemande.UNDER_INVESTIGATION) {
        await storage.updateDemandeCredit(id, {
          statut: StatutDemande.READY_FOR_INVESTIGATION,
        });
      }

      // Schedule new reminders
      if ((dueDate || existingEnquete.dueDate) && updated.id) {
        try {
          const { generateInvestigationReminderSchedule } = await import("../services/notifications/investigation-reminder-service");
          await generateInvestigationReminderSchedule(updated.id);
        } catch {
          // Non-blocking
        }
      }

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: 'investigation_reassigned', id, agentId: newAgentId } });
      }

      res.json({ success: true, enquete: updated });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur réassignation enquête');
      res.status(500).json({ message: error.message || "Erreur lors de la réassignation" });
    }
  });

  // Validate investigation - changes status from INVESTIGATION_COMPLETE to PENDING_APPROVAL
  app.post("/api/demandes-credit/:id/validate-investigation", requireAuth, attachAbility, requireAbility(Actions.APPROVE, Subjects.DEMANDE_CREDIT), async (req, res) => {
    try {
      const { id } = req.params;

      // Get demande
      const demande = await storage.getDemandeCredit(id);
      if (!demande) {
        return res.status(404).json({ message: "Demande non trouvée" });
      }

      // Verify status is INVESTIGATION_COMPLETE
      if (demande.statut !== StatutDemande.INVESTIGATION_COMPLETE) {
        return res.status(400).json({
          message: `Cette demande ne peut pas être validée (statut actuel: ${demande.statut}). Seules les demandes avec enquête terminée peuvent être validées.`
        });
      }

      // Update status to PENDING_APPROVAL
      const updated = await storage.updateDemandeCredit(id, {
        statut: StatutDemande.PENDING_APPROVAL,
      });

      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: 'investigation_validated', id, statut: StatutDemande.PENDING_APPROVAL } });
      }

      // Audit log
      await logAudit(req, "VALIDATE_INVESTIGATION", "demande_credit", id, {
        previousStatut: demande.statut,
        newStatut: StatutDemande.PENDING_APPROVAL,
      }, "success", "medium");

      res.json({ success: true, demande: updated });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur validation enquête');
      res.status(500).json({ message: error.message || "Erreur lors de la validation de l'enquête" });
    }
  });

  // Reject a credit application from Commission Crédit phase
  app.post("/api/demandes/:id/reject-from-commission", requireAuth, attachAbility, requireAbility(Actions.REJECT, Subjects.DEMANDE_CREDIT), async (req, res) => {
    try {
      const { id } = req.params;
      const { motif_rejet } = req.body;

      // Validation
      if (!motif_rejet || typeof motif_rejet !== 'string') {
        return res.status(400).json({ message: "Le motif de rejet est requis" });
      }

      if (motif_rejet.trim().length < 10) {
        return res.status(400).json({ message: "Le motif de rejet doit contenir au moins 10 caractères" });
      }

      if (motif_rejet.length > 500) {
        return res.status(400).json({ message: "Le motif de rejet ne peut pas dépasser 500 caractères" });
      }

      // Get demande
      const demande = await storage.getDemandeCredit(id);
      if (!demande) {
        return res.status(404).json({ message: "Demande non trouvée" });
      }

      // Verify status is eligible for commission rejection
      const statutsEligiblesCommission = [StatutDemande.APPROVED, StatutDemande.APPROVED_AFTER_REEVALUATION] as string[];
      if (!demande.statut || !statutsEligiblesCommission.includes(demande.statut)) {
        return res.status(400).json({
          message: `Cette demande ne peut pas être rejetée depuis la commission (statut actuel: ${demande.statut}). Seules les demandes approuvées peuvent être rejetées à cette étape.`
        });
      }

      // Update demande status to REJECTED
      const updated = await storage.updateDemandeCredit(id, {
        statut: StatutDemande.REJECTED,
        motifRejet: motif_rejet.trim(),
        dateRejet: new Date()
      });

      // Log audit
      await logAudit(
        req,
        "REJECT_FROM_COMMISSION",
        "demande_credit",
        id,
        {
          numeroDemande: demande.numeroDemande,
          motifRejet: motif_rejet.trim(),
          statusAvant: StatutDemande.APPROVED,
          statusApres: StatutDemande.REJECTED
        },
        "success",
        "high"
      );

      // Notify via WebSocket
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({ 
          type: "CREDIT_UPDATE", 
          payload: { 
            type: 'demande_rejected_from_commission', 
            id,
            motif: motif_rejet.trim()
          } 
        });

        const userAgence = req.session.user?.agence;
        if (userAgence) {
          wsInstance.broadcastToAgency(userAgence, {
            type: "LIVE_ACTIVITY",
            payload: {
              action: `Demande rejetée en commission: ${demande.numeroDemande}`,
              user: req.session.user?.nom || 'Système',
              type: 'validation',
              timestamp: new Date().toISOString()
            }
          });
        }
      }

      res.json({ 
        success: true,
        message: "Demande rejetée avec succès",
        demande: updated
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur rejet commission');
      res.status(500).json({ message: error.message || "Erreur lors du rejet de la demande" });
    }
  });

  app.post("/api/demandes-credit/:id/payer-frais", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.CAISSE_OPERATION), async (req, res) => {
      try {
          const data = normalizeKeysDeep(req.body) as any;
          const user = req.session.user;
          const isMobileMoney = data.methodePaiement === MethodePaiement.MOBILE_MONEY;
          const provider = data.provider?.toUpperCase() as 'MTN' | 'AIRTEL' | undefined;

          // Validation Agence: Le client doit payer dans SON agence
          const demande = await storage.getDemandeCredit(req.params.id);
          if (!demande) return res.status(404).json({ message: "Demande introuvable" });

          const client = await storage.getClient(demande.clientId);
          if (!client) return res.status(404).json({ message: "Client introuvable" });

          // ═══════════════════════════════════════════════════════════════════
          // MOBILE MONEY FLOW (Asynchrone - MTN MoMo / Airtel Money)
          // ═══════════════════════════════════════════════════════════════════
          if (isMobileMoney && provider) {
              // Validation du numéro de téléphone
              const phone = data.phone || data.numeroTelephone || client.telephone;
              if (!phone) {
                  return res.status(400).json({ message: "Numéro de téléphone requis pour le paiement Mobile Money" });
              }

              // Initier la collection Mobile Money
              const paymentIntent = await paymentService.initiateCollection({
                  provider,
                  amount: parseFloat(data.montant),
                  phone,
                  clientId: client.id,
                  agenceId: client.agenceId || undefined,
                  description: `Frais d'engagement - Demande ${demande.numeroDemande}`,
                  idempotencyKey: data.idempotencyKey,
                  metadata: {
                      type: 'ENGAGEMENT_FEE',
                      demandeId: req.params.id,
                      numeroDemande: demande.numeroDemande,
                  }
              }, user?.id);

              // Retourner le payment intent pour le suivi côté frontend
              return res.json({
                  paymentPending: true,
                  paymentIntent: paymentIntent,
                  message: `Veuillez confirmer le paiement de ${data.montant} ${currencySymbol()} sur votre téléphone ${provider}`
              });
          }

          // ═══════════════════════════════════════════════════════════════════
          // CASH / VIREMENT FLOW (Synchrone)
          // ═══════════════════════════════════════════════════════════════════
          let sessionCaisseId: string | undefined;
          let activeSession: any = undefined;

          if (user) {
              // Admin override
              const normalizedRole = normalizeRole(user.role);
              if (data.sessionCaisseId && (normalizedRole === SystemRole.ADMIN || normalizedRole === SystemRole.CHEF_AGENCE)) {
                  activeSession = await storage.getSessionCaisse(data.sessionCaisseId);
                  if (activeSession && !activeSession.closedAt) {
                      sessionCaisseId = activeSession.id;
                  }
              }

              // Default to user's active session if not overridden or invalid
              if (!sessionCaisseId) {
                  activeSession = await storage.getActiveSessionForUser(user.id);
                  if (activeSession) {
                      sessionCaisseId = activeSession.id;
                  }
              }
          }

          if (!sessionCaisseId) {
              return res.status(400).json({ message: "Aucune caisse ouverte. Vous devez ouvrir votre caisse pour encaisser des frais." });
          }

          // Validation agence
          if (activeSession) {
             const sessionAgenceId = activeSession.agenceId;
             const clientAgenceId = client.agenceId;

             if (sessionAgenceId && clientAgenceId && sessionAgenceId !== clientAgenceId) {
                 return res.status(403).json({ message: "Le client est affilié à une autre agence. Encaissement refusé." });
             }
          }

          const result = await storage.payerFraisEngagement({
              demandeId: req.params.id,
              montant: data.montant.toString(),
              methodePaiement: data.methodePaiement || 'Espèces',
              sessionCaisseId,
              idempotencyKey: data.idempotencyKey
          }, user?.id);

          const wsInstance = getWsInstance();
          if (wsInstance) {
              wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: 'demande_frais_payes', id: req.params.id } });
              if (user?.agence) {
                  wsInstance.broadcastToAgency(user.agence, { type: "DASHBOARD_UPDATE", payload: {} });
              }
          }

          res.json(result);
      } catch (error: any) {
          logger.error({ err: error }, 'Erreur paiement frais');
          res.status(400).json({ message: error.message });
      }
  });

  // ═══════════════════════════════════════════════════════════════════
  // ENVOYER EN CAISSE — Frais d'engagement (CASH seulement)
  // ═══════════════════════════════════════════════════════════════════
  app.post("/api/demandes-credit/:id/envoyer-caisse", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.CAISSE_OPERATION), async (req, res) => {
    try {
      const { id: demandeId } = req.params;
      const user = req.session.user;
      if (!user) return res.status(401).json({ message: "Non authentifié" });

      // 1. Validate demande
      const demande = await storage.getDemandeCredit(demandeId);
      if (!demande) return res.status(404).json({ message: "Demande introuvable" });

      if ((demande as any).fraisPaye) {
        return res.status(400).json({ message: "Les frais sont déjà payés pour cette demande" });
      }

      // 2. Get client info
      const client = await storage.getClient(demande.clientId);
      if (!client) return res.status(404).json({ message: "Client introuvable" });

      const agenceId = client.agenceId;
      if (!agenceId) return res.status(400).json({ message: "Agence du client introuvable" });

      // 3. Compute fee amount
      const montant = parseFloat(
        (demande as any).montantFraisEngagement
        || (Number(demande.montantDemande || 0) * 0.10).toString()
      );

      if (!montant || montant <= 0) {
        return res.status(400).json({ message: "Montant des frais invalide" });
      }

      // 4. Check no duplicate pending request
      const { caissePaymentRequests } = await import("@shared/schema");
      const { eq: eqOp, and: andOp } = await import("drizzle-orm");
      const [existing] = await db
        .select({ id: caissePaymentRequests.id })
        .from(caissePaymentRequests)
        .where(andOp(
          eqOp(caissePaymentRequests.sourceType, "demande_credit"),
          eqOp(caissePaymentRequests.sourceId, demandeId),
          eqOp(caissePaymentRequests.statut, "PENDING"),
        ));

      if (existing) {
        return res.status(409).json({ message: "Une demande de paiement est déjà en attente pour cette demande de crédit" });
      }

      // 5. Create caisse payment request
      const { createCaisseRequest } = await import("../services/caisse-queue-service");

      const request = await createCaisseRequest({
        category: "ENGAGEMENT_FEE",
        direction: "IN",
        agenceId,
        sourceType: "demande_credit",
        sourceId: demandeId,
        clientId: client.id,
        montant,
        label: `Frais d'engagement - ${demande.numeroDemande}`,
        description: `Frais de dossier crédit ${montant.toLocaleString('fr-FR')} ${currencySymbol()} pour ${client.nom} ${client.prenom || ''}`.trim(),
        metadata: {
          numeroDemande: demande.numeroDemande,
          montantCredit: demande.montantDemande,
          clientNom: client.nom,
          clientPrenom: client.prenom,
        },
        createdBy: user.id,
      });

      res.json({
        success: true,
        requestId: request.id,
        message: "Demande envoyée en caisse",
      });
    } catch (error: any) {
      logger.error({ err: error }, "Erreur envoi en caisse frais engagement");
      res.status(400).json({ message: error.message || "Erreur lors de l'envoi en caisse" });
    }
  });

  // Check caisse payment status for multiple credit demands (batch)
  app.get("/api/demandes-credit/caisse-statuses", requireAuth, async (req, res) => {
    try {
      const idsParam = req.query.ids as string;
      if (!idsParam) return res.json({});

      const ids = idsParam.split(",").filter(Boolean).slice(0, 50);
      if (ids.length === 0) return res.json({});

      const { caissePaymentRequests } = await import("@shared/schema");
      const { eq: eqOp, and: andOp, inArray: inArrayOp } = await import("drizzle-orm");

      const rows = await db
        .select({
          sourceId: caissePaymentRequests.sourceId,
          statut: caissePaymentRequests.statut,
        })
        .from(caissePaymentRequests)
        .where(andOp(
          eqOp(caissePaymentRequests.sourceType, "demande_credit"),
          inArrayOp(caissePaymentRequests.sourceId, ids),
          eqOp(caissePaymentRequests.statut, "PENDING"),
        ));

      const result: Record<string, { hasPending: boolean }> = {};
      for (const row of rows) {
        result[row.sourceId] = { hasPending: true };
      }

      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, "Erreur vérification statuts caisse demandes");
      res.status(500).json({ message: error.message || "Erreur interne" });
    }
  });

  // Initiate refund for already rejected demande
  app.post("/api/demandes-credit/:id/initiate-refund", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.REMBOURSEMENT), async (req, res) => {
    try {
      const { id } = req.params;
      const data = normalizeKeysDeep(req.body) as { montantRemboursement: number; motif?: string };
      const user = req.session.user;

      if (!user) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      // 1. Validate demande exists and is rejected
      const demande = await storage.getDemandeCredit(id);
      if (!demande) {
        return res.status(404).json({ message: "Demande non trouvée" });
      }

      const isRejected = demande.statut === StatutDemande.REJECTED ||
                         demande.statut === StatutDemande.DEFINITIVELY_REJECTED;

      if (!isRejected) {
        return res.status(400).json({ message: "La demande n'est pas en statut rejeté" });
      }

      // 2. Validate fees were paid
      if (!demande.fraisEngagementPayes) {
        return res.status(400).json({ message: "Aucun frais n'a été payé pour cette demande" });
      }

      // 3. Validate refund amount
      const refundAmount = Number(data.montantRemboursement);
      const maxRefund = Number(demande.montantFraisEngagement || 0);

      if (isNaN(refundAmount) || refundAmount <= 0) {
        return res.status(400).json({ message: "Montant de remboursement invalide" });
      }

      if (refundAmount > maxRefund) {
        return res.status(400).json({
          message: `Le montant (${refundAmount}) ne peut pas excéder les frais payés (${maxRefund})`
        });
      }

      // 4. Check if a refund request already exists for this demande
      const existingRefunds = await db.select()
        .from(creditRefundRequests)
        .where(and(
          eq(creditRefundRequests.demandeId, id),
          inArray(creditRefundRequests.statut, ['SUBMITTED', 'APPROVED', 'PENDING_CAISSE'])
        ));

      if (existingRefunds.length > 0) {
        return res.status(400).json({
          message: "Une demande de remboursement est déjà en cours pour ce dossier"
        });
      }

      // 5. Create Refund Request
      const refundRequest = await storage.createCreditRefundRequest({
        demandeId: demande.id,
        clientId: demande.clientId,
        agenceId: user.agenceId!,
        montantEncaisse: demande.montantFraisEngagement?.toString() || '0',
        montantRemboursable: refundAmount.toString(),
        montantNonRemboursable: (maxRefund - refundAmount).toString(),
        statut: 'SUBMITTED',
        motifRejetCredit: demande.motifRejet || undefined,
        motifRemboursement: data.motif || "Remboursement suite rejet de la demande",
        makerId: user.id,
        makerAt: new Date(),
      });

      // 6. Notify via WebSocket
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "CREDIT_UPDATE",
          payload: { type: 'refund_created', demandeId: id, refundId: refundRequest.id }
        });
        if (user.agence) {
          wsInstance.broadcastToAgency(user.agence, {
            type: "LIVE_ACTIVITY",
            payload: {
              action: `Demande remboursement créée: ${refundAmount.toLocaleString('fr-FR')} ${currencySymbol()}`,
              user: user.nom || 'Système',
              type: 'finance',
              timestamp: new Date().toISOString()
            }
          });
        }
      }

      res.json({
        success: true,
        message: "Demande de remboursement créée avec succès",
        refund: refundRequest
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur création remboursement');
      res.status(500).json({ message: error.message || "Erreur lors de la création du remboursement" });
    }
  });

  // Get refund status for a demande
  app.get("/api/demandes-credit/:id/refund-status", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      // Find any refund request for this demande (not cancelled/rejected)
      const refunds = await db.select()
        .from(creditRefundRequests)
        .where(eq(creditRefundRequests.demandeId, id))
        .orderBy(desc(creditRefundRequests.createdAt));

      // Find the most relevant refund (paid > in progress > none)
      const activeRefund = refunds.find(r =>
        ['PAID', 'PENDING_CAISSE', 'APPROVED', 'SUBMITTED'].includes(r.statut)
      );

      if (!activeRefund) {
        return res.json({ refund: null });
      }

      res.json({
        refund: {
          id: activeRefund.id,
          statut: activeRefund.statut,
          montantRemboursable: Number(activeRefund.montantRemboursable),
          montantEncaisse: Number(activeRefund.montantEncaisse),
          paymentMethod: activeRefund.paymentMethod,
          paidAt: activeRefund.paidAt,
          createdAt: activeRefund.createdAt
        }
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur récupération statut remboursement');
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/demandes-credit/:id/enquete", requireAuth, async (req, res) => {
      const enquetes = await storage.getEnqueteByDemandeId(req.params.id);
      if (!enquetes || enquetes.length === 0) return res.status(404).json({ message: "Enquête non trouvée" });
      // Return the most recent enquête for this demande
      res.json(enquetes[0]);
  });

  // Obtenir le détail du scoring pour une demande
  app.get("/api/demandes-credit/:id/scoring", requireAuth, async (req, res) => {
    try {
      const demande = await storage.getDemandeCredit(req.params.id);
      if (!demande) {
        return res.status(404).json({ message: "Demande non trouvée" });
      }

      const { calculerScoreMicrofinance } = await import('../services/microfinance-scoring');

      // Convertir la durée en mois
      let dureeMois = demande.dureeValeur || 1;
      if (demande.dureeUnite === DureeUniteEnum.DAY) {
        dureeMois = Math.ceil(dureeMois / 30);
      } else if (demande.dureeUnite === DureeUniteEnum.WEEK) {
        dureeMois = Math.ceil(dureeMois / 4);
      }

      const scoringResult = await calculerScoreMicrofinance({
        clientId: demande.clientId,
        montantDemande: parseFloat(demande.montantDemande?.toString() || '0'),
        dureeMois,
        revenuMensuel: demande.revenusMensuels ? parseFloat(demande.revenusMensuels.toString()) : undefined,
        chargesMensuelles: demande.chargesMensuelles ? parseFloat(demande.chargesMensuelles.toString()) : undefined
      });

      res.json({
        demandeId: demande.id,
        numeroDemande: demande.numeroDemande,
        ...scoringResult
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur calcul scoring');
      res.status(500).json({ message: error.message || "Erreur lors du calcul du scoring" });
    }
  });

  // Recalculer le score d'une demande
  app.post("/api/demandes-credit/:id/recalculer-score", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.DEMANDE_CREDIT), async (req, res) => {
    try {
      const demande = await storage.getDemandeCredit(req.params.id);
      if (!demande) {
        return res.status(404).json({ message: "Demande non trouvée" });
      }

      const { calculerScoreMicrofinance } = await import('../services/microfinance-scoring');
      const { recalculateClientScore } = await import('../services/scoring-engine');

      // Convertir la durée en mois
      let dureeMois = demande.dureeValeur || 1;
      if (demande.dureeUnite === DureeUniteEnum.DAY) {
        dureeMois = Math.ceil(dureeMois / 30);
      } else if (demande.dureeUnite === DureeUniteEnum.WEEK) {
        dureeMois = Math.ceil(dureeMois / 4);
      }

      const scoringResult = await calculerScoreMicrofinance({
        clientId: demande.clientId,
        montantDemande: parseFloat(demande.montantDemande?.toString() || '0'),
        dureeMois,
        revenuMensuel: demande.revenusMensuels ? parseFloat(demande.revenusMensuels.toString()) : undefined,
        chargesMensuelles: demande.chargesMensuelles ? parseFloat(demande.chargesMensuelles.toString()) : undefined
      });

      // Mettre à jour le score de la demande
      await storage.updateDemandeCredit(demande.id, {
        scoreCredit: scoringResult.score
      });

      // Recalculer le score global du client via le scoring engine
      await recalculateClientScore(demande.clientId);

      res.json({
        message: "Score recalculé avec succès",
        nouveauScore: scoringResult.score,
        grade: scoringResult.grade,
        recommendation: scoringResult.recommendation,
        details: scoringResult.details
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur recalcul scoring');
      res.status(500).json({ message: error.message || "Erreur lors du recalcul du scoring" });
    }
  });

  // Timeline d'une demande
  app.get("/api/demandes-credit/:id/timeline", requireAuth, async (req, res) => {
      try {
          // Allow fetching timeline for deleted/archived requests
          const demande = await storage.getDemandeCredit(req.params.id, true);
          if (!demande) return res.status(404).json({ message: "Demande non trouvée" });

          const timeline = [];

          // 1. Demande Créée
          if (demande.createdAt) {
              timeline.push({
                  id: 'creation',
                  type: 'DEMANDE',
                  date: demande.createdAt,
                  titre: 'Demande Créée',
                  description: `Dossier N° ${demande.numeroDemande} initié`,
                  statut: 'Créée'
              });
          }

          // 2. Frais
          if (demande.fraisEngagementPayes) {
             timeline.push({
                 id: 'frais',
                 type: 'FRAIS',
                 date: demande.updatedAt || demande.createdAt,
                 titre: 'Frais Payés',
                 description: 'Frais de dossier réglés',
                 statut: 'PAID'
             });
          }

          // 3. Enquête
          const enquetes = await storage.getEnqueteByDemandeId(demande.id);
          const enquete = enquetes?.[0];
          if (enquete) {
              const enqueteStatus = enquete.statut || StatutEnquete.IN_PROGRESS;

              timeline.push({
                  id: 'enquete_start',
                  type: 'ENQUETE',
                  date: enquete.createdAt,
                  titre: 'Enquête Terrain',
                  description: `Enquête assignée (${enquete.typeActivite || 'Activité'})`,
                  statut: enqueteStatus
              });
          }

          // 4. Decision (Comité)
          // Check if status implies approval or rejection using enum constants
          const decisionStatuses = [
            StatutDemande.APPROVED,
            StatutDemande.APPROVED_AFTER_REEVALUATION,
            StatutDemande.REJECTED,
            StatutDemande.DEFINITIVELY_REJECTED
          ];
          const isDecided = decisionStatuses.includes(demande.statut as any);
          if (isDecided || demande.dateRejet) {
              const isRejected = demande.statut === StatutDemande.REJECTED || demande.statut === StatutDemande.DEFINITIVELY_REJECTED;
              timeline.push({
                  id: 'decision',
                  type: 'DECISION',
                  date: demande.dateRejet || demande.updatedAt || new Date(),
                  titre: isRejected ? 'Demande Rejetée' : 'Approbation Comité',
                  description: isRejected ? (demande.motifRejet || 'Dossier rejeté') : `Montant approuvé: ${demande.montantApprouve || demande.montantDemande}`,
                  statut: demande.statut
              });
          }

          // 5. Décaissement (Link via Credit)
          // Use direct DB query as storage method might be missing for this specific lookup
          const [credit] = await db.select().from(credits).where(eq(credits.demandeId, demande.id));
          
          if (credit) {
              timeline.push({
                 id: 'decaissement',
                 type: 'DECAISSEMENT',
                 date: credit.dateDebut || credit.createdAt || new Date(),
                 titre: 'Crédit Décaissé',
                 description: `Crédit N° ${credit.numeroCredit} actif.`,
                 statut: StatutDemande.DISBURSED
              });
          }

          // 6. Suppression
          if (demande.deletedAt) {
              timeline.push({
                  id: 'suppression',
                  type: 'SUPPRESSION',
                  date: demande.deletedAt,
                  titre: 'Demande Supprimée',
                  description: 'Le dossier a été supprimé.',
                  statut: StatutDemande.DELETED
              });
          }

          // Sort by date
          timeline.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

          res.json({ success: true, timeline, demande });

      } catch (error: any) {
          logger.error({ err: error }, 'Timeline error');
          res.status(500).json({ message: error.message });
      }
  });

  // Enquetes (roles: admin, chef, credit, superviseur)
  app.get("/api/enquetes-credit", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.DEMANDE_CREDIT), async (req, res) => {
      // Return both completed/in-progress enquetes AND demandes ready for investigation
      // Actually, for now, let's just return enquetes. Frontend can merge if needed, 
      // or we can handle it here.
      // But standard pattern is:
      const enquetes = await storage.getAllEnquetes();
      res.json(enquetes);
  });

  app.post("/api/enquetes-credit", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.DEMANDE_CREDIT), async (req, res) => {
      try {
          const data = normalizeKeysDeep(req.body) as any;
          logger.info({ rawDemandeId: req.body.demandeId, normalizedDemandeId: data.demandeId }, 'Enquete create - demandeId check');

          const parsed = insertEnqueteCreditSchema.parse(data);
          logger.info({ parsedDemandeId: parsed.demandeId }, 'Enquete create - after parse');

          // Ensure status is ASSIGNED if an agent is selected but status is default
          if (parsed.assignedAgentId && (!parsed.statut || parsed.statut === 'PENDING_ASSIGNMENT')) {
             parsed.statut = 'ASSIGNED';
          }

          const enquete = await storage.createEnqueteCredit(parsed);
          logger.info({ enqueteId: enquete.id, enqueteDemandeId: enquete.demandeId }, 'Enquete created');

          // Update Demande Status - Marquer l'enquête comme terminée
          // Workflow: READY_FOR_INVESTIGATION -> UNDER_INVESTIGATION -> INVESTIGATION_COMPLETE
          // Quand on enregistre le formulaire d'enquête, l'enquête est TERMINÉE
          if (enquete.demandeId) {
              logger.info({ demandeId: enquete.demandeId, newStatut: StatutDemande.INVESTIGATION_COMPLETE }, 'Updating demande status');
              await storage.updateDemandeCredit(enquete.demandeId, { statut: StatutDemande.INVESTIGATION_COMPLETE as any });
              logger.info('Demande status updated successfully');
          } else {
              logger.warn({ enqueteId: enquete.id }, 'No demandeId on enquete - status not updated');
          }

          // Cancel deadline reminders — enquête terminée
          try {
            const { cancelInvestigationReminders } = await import("../services/notifications/investigation-reminder-service");
            await cancelInvestigationReminders(enquete.id, "Enquête terminée");
          } catch {
            // Non-blocking
          }

          // Notify Credit Update
          const wsInstance = getWsInstance();
          if (wsInstance) {
              wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: 'enquete_new', demandeId: parsed.demandeId } });
          }

          // Note: Domain event CREDIT_INVESTIGATION_ASSIGNED est maintenant envoyé
          // lors du démarrage de l'enquête (start-investigation endpoint)

          res.json(enquete);
      } catch (error: any) {
          logger.error({ err: error }, 'Enquete create error');
          res.status(500).json({
              message: error.message || 'Erreur lors de la création de l\'enquête',
              code: 'ENQUETE_CREATE_ERROR'
          });
      }
  });

  // Agent starts an investigation — transitions enquête ASSIGNED → IN_PROGRESS, demande READY_FOR_INVESTIGATION → UNDER_INVESTIGATION
  app.post("/api/enquetes-credit/:id/demarrer", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session?.user?.id;

      // Load enquête
      const [enquete] = await db
        .select()
        .from(enquetesCredit)
        .where(eq(enquetesCredit.id, id))
        .limit(1);

      if (!enquete) {
        return res.status(404).json({ message: "Enquête non trouvée" });
      }

      // The assigned agent can start, OR a supervisor acting on their behalf
      if (enquete.assignedAgentId !== userId) {
        const role = normalizeRole(req.session?.user?.role);
        const canSupervise = role === SystemRole.ADMIN || role === SystemRole.CHEF_AGENCE || role === SystemRole.SUPERVISEUR;
        if (!canSupervise) {
          return res.status(403).json({ message: "Vous n'êtes pas l'agent assigné à cette enquête." });
        }
      }

      // Only ASSIGNED enquêtes can be started
      if (enquete.statut !== "ASSIGNED") {
        return res.status(400).json({ message: `Cette enquête ne peut pas être démarrée (statut actuel: ${enquete.statut}).` });
      }

      // Update enquête to IN_PROGRESS
      const [updated] = await db
        .update(enquetesCredit)
        .set({
          statut: "IN_PROGRESS",
          startedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(enquetesCredit.id, id))
        .returning();

      // Update demande status to UNDER_INVESTIGATION
      if (enquete.demandeId) {
        await storage.updateDemandeCredit(enquete.demandeId, {
          statut: StatutDemande.UNDER_INVESTIGATION,
        });
      }

      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: 'investigation_started', id, demandeId: enquete.demandeId, agentId: enquete.assignedAgentId } });
      }

      res.json({ success: true, enquete: updated });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur démarrage enquête par agent');
      res.status(500).json({ message: error.message || "Erreur lors du démarrage de l'enquête" });
    }
  });

  // Agent-specific: list my assigned investigations with client info
  // Admin supervision: pass ?agentUserId=<users.id> to view a specific agent's investigations
  app.get("/api/enquetes-credit/mes-enquetes", requireAuth, async (req, res) => {
    try {
      const sessionUserId = req.session?.user?.id;
      if (!sessionUserId) return res.status(401).json({ message: "Non authentifié" });

      // Allow supervisors (admin, chef agence, superviseur, or users with supervision permissions) to query a specific agent's investigations
      const agentUserId = req.query.agentUserId as string | undefined;
      let targetUserId = sessionUserId;
      if (agentUserId) {
        const role = normalizeRole(req.session?.user?.role);
        const canSupervise = role === SystemRole.ADMIN || role === SystemRole.CHEF_AGENCE || role === SystemRole.SUPERVISEUR;
        if (canSupervise) {
          targetUserId = agentUserId;
        }
      }

      const results = await db.select({
        enquete: enquetesCredit,
        client: clients,
        userNom: schema.users.nom,
        userPrenom: schema.users.prenom,
        userTelephone: schema.users.telephone,
        professionNom: professions.nom,
        activityTypeNom: activityTypes.nom,
      })
        .from(enquetesCredit)
        .leftJoin(clients, eq(enquetesCredit.clientId, clients.id))
        .leftJoin(schema.users, eq(clients.userId, schema.users.id))
        .leftJoin(professions, eq(clients.professionId, professions.id))
        .leftJoin(activityTypes, eq(clients.activityTypeId, activityTypes.id))
        .where(eq(enquetesCredit.assignedAgentId, targetUserId))
        .orderBy(desc(enquetesCredit.createdAt));

      const data = results.map(r => ({
        ...r.enquete,
        client: r.userNom ? {
          nom: r.userNom,
          prenom: r.userPrenom,
          telephone: r.userTelephone,
          adresseDomicile: r.client?.adresseDomicile,
          // Activity & revenue fields from client profile (for pre-filling investigation form)
          typeActivite: r.activityTypeNom || null,
          revenuMensuel: r.client?.revenuMensuel,
          revenuJournalier: r.client?.revenuJournalier,
          typeRevenu: r.client?.typeRevenu,
          profession: r.professionNom || r.client?.professionAutreTexte || null,
          lieuActivite: r.client?.lieuActivite,
        } : null,
      }));

      res.json({ success: true, data });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur récupération enquêtes agent');
      res.status(500).json({ message: error.message || "Erreur" });
    }
  });

  // Agent submits investigation data on an existing IN_PROGRESS enquête
  app.patch("/api/enquetes-credit/:id/soumettre", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session?.user?.id;
      if (!userId) return res.status(401).json({ message: "Non authentifié" });

      const [enquete] = await db.select().from(enquetesCredit).where(eq(enquetesCredit.id, id)).limit(1);
      if (!enquete) return res.status(404).json({ message: "Enquête non trouvée" });

      // Only the assigned agent or a supervisor can submit
      if (enquete.assignedAgentId !== userId) {
        const role = normalizeRole(req.session?.user?.role);
        const canSupervise = role === SystemRole.ADMIN || role === SystemRole.CHEF_AGENCE || role === SystemRole.SUPERVISEUR;
        if (!canSupervise) {
          return res.status(403).json({ message: "Vous n'êtes pas autorisé à soumettre cette enquête." });
        }
      }

      // Only IN_PROGRESS enquêtes can be submitted
      if (enquete.statut !== "IN_PROGRESS") {
        return res.status(400).json({ message: `Cette enquête ne peut pas être soumise (statut actuel: ${enquete.statut}).` });
      }

      const data = normalizeKeysDeep(req.body) as any;

      const updatePayload: Record<string, any> = {
        statut: "SUBMITTED",
        submittedAt: new Date(),
        updatedAt: new Date(),
      };

      // Investigation data fields
      if (data.categorieActivite) updatePayload.categorieActivite = data.categorieActivite;
      if (data.typeActivite) updatePayload.typeActivite = data.typeActivite;
      if (data.ancienneteActivite != null) updatePayload.ancienneteActivite = parseInt(data.ancienneteActivite) || 0;
      if (data.objetCredit) updatePayload.objetCredit = data.objetCredit;
      if (data.revenuMensuel) updatePayload.revenuMensuel = data.revenuMensuel.toString();
      if (data.typeRevenu) updatePayload.typeRevenu = data.typeRevenu;
      if (data.revenuJournalier) updatePayload.revenuJournalier = data.revenuJournalier.toString();
      if (data.joursTravailMois != null) updatePayload.joursTravailMois = parseInt(data.joursTravailMois) || 26;
      if (data.chargesMensuelles) updatePayload.chargesMensuelles = data.chargesMensuelles.toString();
      if (data.autresCredits) updatePayload.autresCredits = data.autresCredits;
      if (data.garantiesProposees) updatePayload.garantiesProposees = data.garantiesProposees;
      if (data.photosActivite) updatePayload.photosActivite = data.photosActivite;
      if (data.documentsJustificatifs) updatePayload.documentsJustificatifs = data.documentsJustificatifs;
      if (data.observations) updatePayload.observations = data.observations;

      // Agent recommendation
      if (data.agentRecommendation) updatePayload.agentRecommendation = data.agentRecommendation;
      if (data.recommendedAmount) updatePayload.recommendedAmount = data.recommendedAmount.toString();
      if (data.riskLevel) updatePayload.riskLevel = data.riskLevel;
      if (data.riskFactors) updatePayload.riskFactors = data.riskFactors;

      // Geo data
      if (data.geoLatitude != null) updatePayload.geoLatitude = data.geoLatitude.toString();
      if (data.geoLongitude != null) updatePayload.geoLongitude = data.geoLongitude.toString();
      if (data.geoAccuracy != null) updatePayload.geoAccuracy = data.geoAccuracy.toString();
      if (data.geoTimestamp) updatePayload.geoTimestamp = new Date(data.geoTimestamp);

      const [updated] = await db.update(enquetesCredit).set(updatePayload).where(eq(enquetesCredit.id, id)).returning();

      // Update the associated demande status to INVESTIGATION_COMPLETE
      if (enquete.demandeId) {
        await storage.updateDemandeCredit(enquete.demandeId, {
          statut: StatutDemande.INVESTIGATION_COMPLETE,
        });
      }

      // Cancel deadline reminders — enquête soumise
      try {
        const { cancelInvestigationReminders } = await import("../services/notifications/investigation-reminder-service");
        await cancelInvestigationReminders(id, "Enquête soumise par l'agent");
      } catch {
        // Non-blocking
      }

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: 'investigation_submitted', id, demandeId: enquete.demandeId, agentId: enquete.assignedAgentId } });
      }

      res.json({ success: true, enquete: updated });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur soumission enquête agent');
      res.status(500).json({ message: error.message || "Erreur lors de la soumission de l'enquête" });
    }
  });

  app.post("/api/enquetes-credit/:id/valider", requireAuth, attachAbility, requireAbility(Actions.APPROVE, Subjects.DEMANDE_CREDIT), async (req, res) => {
      const { decision, montant_approuve, commentaire, raison } = req.body;

      const enquete = await storage.getEnqueteCredit(req.params.id);
      if (!enquete) return res.status(404).json({ message: "Enquête non trouvée" });

      // IDEMPOTENCE CHECK: Verify enquete is not already processed
      const terminalStatuses = [StatutEnquete.APPROVED, StatutEnquete.REJECTED, StatutEnquete.REDUCED];
      if (terminalStatuses.includes(enquete.statut as any)) {
          return res.status(409).json({
              message: "Cette enquête a déjà été traitée",
              statut_actuel: enquete.statut,
              code: "ALREADY_PROCESSED"
          });
      }

      const decisionLower = decision?.toLowerCase?.() || decision;
      const statutEnquete = decisionLower === 'approved'
        ? StatutEnquete.APPROVED
        : decisionLower === 'rejected'
          ? StatutEnquete.REJECTED
          : StatutEnquete.REDUCED;

      const updatedEnquete = await storage.updateEnqueteCredit(req.params.id, {
          statut: statutEnquete,
          recommandation: commentaire || raison // Store comment
      });

      // Update Demande status - Workflow: UNDER_INVESTIGATION -> INVESTIGATION_COMPLETE -> PENDING_APPROVAL
      // The enquête validation moves the demande to PENDING_APPROVAL for committee decision
      if (enquete.demandeId) {
          // Step 1: Transition to INVESTIGATION_COMPLETE (enquête terminée)
          await storage.updateDemandeCredit(enquete.demandeId, {
              statut: StatutDemande.INVESTIGATION_COMPLETE as any
          });

          // Step 2: Transition to PENDING_APPROVAL (en attente d'approbation par le comité)
          await storage.updateDemandeCredit(enquete.demandeId, {
              statut: StatutDemande.PENDING_APPROVAL as any,
              montantApprouve: montant_approuve ? montant_approuve.toString() : undefined
          });

          // Notify
          const wsInstance = getWsInstance();
          if (wsInstance) {
               wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: 'demande_updated', id: enquete.demandeId, statut: StatutDemande.PENDING_APPROVAL } });
          }
      }

      res.json(updatedEnquete);
  });

  // Remboursements avec allocation FIFO automatique
  app.post("/api/remboursements", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.REMBOURSEMENT), async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body) as any;
        const user = req.session.user;
        
        // Get active session if user is caissier
        let sessionCaisseId: string | undefined;
        if (user) {
          const activeSession = await storage.getActiveSessionForUser(user.id);
          if (activeSession) {
            sessionCaisseId = activeSession.id;
          }
        }
        
        // Import de la nouvelle fonction avec allocation FIFO
        const { createRemboursementWithAllocation } = await import("../storage/finance-enhanced");
        
        // Utiliser la nouvelle fonction avec allocation automatique
        const result = await createRemboursementWithAllocation({
          creditId: data.creditId,
          montant: data.montant,
          methodePaiement: data.methodePaiement || 'Espèces',
          sessionCaisseId,
          observations: data.observations,
          idempotencyKey: data.idempotencyKey,
          allocationOptions: data.allocationOptions || {
            strategy: 'FIFO',
            applyToFutureInstallments: true,
            createCreditBalance: true
          }
        }, user?.id);
        
        // Les notifications WebSocket sont maintenant gérées dans createRemboursementWithAllocation
        // mais on garde la compatibilité pour le dashboard
        const wsInstance = getWsInstance();
        const userAgence = user?.agence;

        if (wsInstance && userAgence) {
            wsInstance.broadcastToAgency(userAgence, { type: "DASHBOARD_UPDATE", payload: {} });
        }

        // Score events: credit repayment + credit fully paid
        try {
            const credit = await storage.getCredit(data.creditId);
            if (credit?.clientId) {
                const { recordScoreEvent } = await import('../services/scoring-engine');
                await recordScoreEvent({
                    clientId: credit.clientId,
                    agenceId: userAgence,
                    eventType: 'CREDIT_REMBOURSEMENT',
                    refId: result.remboursement.id,
                    refType: 'remboursement',
                    montant: Number(data.montant),
                    createdBy: user?.id,
                });

                // CREDIT_SOLDE bonus when credit is fully paid off
                if (credit.statut === 'PAID' || credit.statut === 'CLOSED' || Number(credit.soldeRestant) === 0) {
                    await recordScoreEvent({
                        clientId: credit.clientId,
                        agenceId: userAgence,
                        eventType: 'CREDIT_SOLDE',
                        refId: `solde-${data.creditId}`,
                        refType: 'credit',
                        montant: Number(credit.montant),
                        createdBy: user?.id,
                    });
                }
            }
        } catch (err) {
            logger.error({ err }, 'Scoring event error (credit repayment)');
        }

        // Retourner la réponse enrichie avec les allocations
        res.json({
          ...result.remboursement,
          mouvement_id: result.mouvement.id,
          allocations: result.allocationResult.allocations,
          overpayment_amount: result.allocationResult.overpaymentAmount,
          total_allocated: result.allocationResult.totalAllocated,
          credit_balance: result.allocationResult.creditBalance
        });
      } catch (error: any) {
        logger.error({ err: error }, 'Error creating remboursement with allocation');
        res.status(400).json({ message: error.message || 'Erreur lors du remboursement' });
      }
  });

  app.get("/api/credits/:id/remboursements", requireAuth, async (req, res) => {
      const rembs = await storage.getRemboursementsByCredit(req.params.id);
      res.json(rembs);
  });

  // Récupérer les allocations d'un remboursement
  app.get("/api/remboursements/:id/allocations", requireAuth, async (req, res) => {
      try {
        const { getRepaymentAllocations } = await import("../services/repayment-allocation-service");
        const allocations = await getRepaymentAllocations(req.params.id);
        res.json(allocations);
      } catch (error: any) {
        logger.error({ err: error }, 'Error fetching repayment allocations');
        res.status(500).json({ message: error.message || 'Erreur lors de la récupération des allocations' });
      }
  });

  // Extourner un remboursement et ses allocations
  app.post("/api/remboursements/:id/reverse", requireAuth, attachAbility, requireAbility(Actions.REVERSE, Subjects.REMBOURSEMENT), async (req, res) => {
      try {
        const { reason } = req.body;
        const user = req.session.user;

        if (!reason || reason.trim().length < 5) {
          return res.status(400).json({ message: 'Une raison valide est requise pour l\'extourne (min. 5 caractères)' });
        }

        const { reverseRemboursement } = await import("../storage/finance-enhanced");
        const result = await reverseRemboursement(req.params.id, reason, user?.id);

        if (!result.success) {
          return res.status(400).json({ message: result.message });
        }

        // Log audit
        await logAudit(
          req,
          "REMBOURSEMENT_REVERSED",
          "remboursement",
          req.params.id,
          { reason },
          "success",
          "high"
        );

        res.json(result);
      } catch (error: any) {
        logger.error({ err: error }, 'Error reversing repayment');
        res.status(500).json({ message: error.message || 'Erreur lors de l\'extourne du remboursement' });
      }
  });

  // Marquer manuellement les échéances en retard (pour tests/admin)
  app.post("/api/admin/mark-late-installments", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.SYSTEM), async (req, res) => {
      try {
        const { markLateInstallments } = await import("../services/repayment-allocation-service");
        const result = await markLateInstallments();
        
        res.json({
          success: true,
          message: `${result.markedCount} échéance(s) marquée(s) en retard`,
          markedCount: result.markedCount,
          affectedCredits: result.creditIds.length
        });
      } catch (error: any) {
        logger.error({ err: error }, 'Error marking late installments');
        res.status(500).json({ message: error.message || 'Erreur lors du marquage des échéances en retard' });
      }
  });

  // ============================================================================
  // COMPTES ENDPOINTS - See /api/comptes in server/routes/comptes.ts
  // All account operations (create, deposit, withdrawal, block, unblock, transfer)
  // are now handled by the unified comptes routes.
  // ============================================================================

  // Caisse Management
  app.get("/api/agences/:id/caisses", requireAuth, requireAgenceAccess(), async (req, res) => {
      const caisses = await storage.getCaissesByAgence(req.params.id);
      
      // Enrichir avec le statut "Occupé" en temps réel
      // Une caisse est occupée si elle a une session active (closedAt IS NULL)
      const activeSessions = await storage.getActiveSessions();
      
      const enrichedCaisses = await Promise.all(caisses.map(async (c) => {
         const activeSession = activeSessions.find(s => s.caisseId === c.id && !s.closedAt);
         let currentSolde = "0";

         if (activeSession) {
            // Calculate real-time balance for active session
            const ops = await storage.getOperationsBySession(activeSession.id);
            let solde = Number(activeSession.montantOuverture || 0);

            for (const op of ops) {
                const montant = Number(op.montant || 0);

                // Use centralized helper functions from caisse-operations.ts
                const delta = getOperationDelta(op.typeOperation, montant, {
                    reference: op.reference,
                    description: op.description
                });
                solde += delta;
            }
            currentSolde = solde.toString();
         } else {
            // Get balance from last closed session
            const lastClosedSession = await storage.getLastClosedSession(c.id);
            if (lastClosedSession) {
               // Priority: montantReporte (funds kept for next day) > caisse.solde > declared amount
               // montantReporte is set during the closing workflow when cashier decides to keep funds
               // IMPORTANT: Use Number() to check actual value, not string truthiness ("0" is truthy!)
               // IMPORTANT: Exposer les valeurs négatives pour que le frontend puisse les détecter et proposer une correction
               const montantReporte = Number(lastClosedSession.montantReporte || 0);
               const soldeCaisse = Number(c.solde || 0);
               const montantDeclare = Number(lastClosedSession.montantFermetureDeclare || 0);
               const montantTheorique = Number(lastClosedSession.montantFermetureTheorique || 0);

               if (montantReporte !== 0) {
                  currentSolde = montantReporte.toString();
               } else if (soldeCaisse !== 0) {
                  currentSolde = soldeCaisse.toString();
               } else if (montantDeclare !== 0) {
                  currentSolde = montantDeclare.toString();
               } else if (montantTheorique !== 0) {
                  currentSolde = montantTheorique.toString();
               } else {
                  currentSolde = "0";
               }
            } else {
               // No closed session, use caisse.solde directly
               currentSolde = c.solde || "0";
            }
         }

         const assignments = await storage.getCaisseAssignmentsEnriched(c.id);
         return {
             ...c,
             solde: currentSolde,
             isOccupied: !!activeSession,
             occupiedBy: activeSession ? activeSession.caissierId : null,
             sessionId: activeSession ? activeSession.id : null,
             assignments: assignments.map(a => a.userId),
             assignmentsDetails: assignments,
         };
      }));

      res.json(enrichedCaisses);
  });

  app.get("/api/caisses", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), async (req, res) => {
      // Admin only: Get ALL caisses
      const caisses = await storage.getAllCaisses();
      const activeSessions = await storage.getActiveSessions();

      // Build agence name map for enrichment
      const allAgences = await storage.getAllAgences();
      const agenceMap = new Map(allAgences.map(a => [a.id, a.nom]));

      const enrichedCaisses = await Promise.all(caisses.map(async (c) => {
         const activeSession = activeSessions.find(s => s.caisseId === c.id && !s.closedAt);
         let currentSolde = "0";

         if (activeSession) {
            // Calculate real-time balance using Ledger SENS (Source of Truth)
            // This fixes discrepancies where some operation types were missing from the hardcoded list
            const ops = await storage.getOperationsBySessionWithSens(activeSession.id);
            let solde = Number(activeSession.montantOuverture || 0);

            for (const op of ops) {
                const montant = Number(op.montant || 0);
                // Support both old FR and new EN values
                if (op.sens === 'CREDIT' || op.sens === 'Crédit') {
                    solde += montant;
                } else if (op.sens === 'DEBIT' || op.sens === 'Débit') {
                    solde -= montant;
                }
            }
            currentSolde = solde.toString();
         } else {
            // Get balance from last closed session
            const lastClosedSession = await storage.getLastClosedSession(c.id);
            if (lastClosedSession) {
               // Priority: montantReporte (funds kept for next day) > caisse.solde > declared amount
               // IMPORTANT: Use Number() to check actual value, not string truthiness ("0" is truthy!)
               // IMPORTANT: Exposer les valeurs négatives pour détection frontend
               const montantReporte = Number(lastClosedSession.montantReporte || 0);
               const soldeCaisse = Number(c.solde || 0);
               const montantDeclare = Number(lastClosedSession.montantFermetureDeclare || 0);
               const montantTheorique = Number(lastClosedSession.montantFermetureTheorique || 0);

               if (montantReporte !== 0) {
                  currentSolde = montantReporte.toString();
               } else if (soldeCaisse !== 0) {
                  currentSolde = soldeCaisse.toString();
               } else if (montantDeclare !== 0) {
                  currentSolde = montantDeclare.toString();
               } else if (montantTheorique !== 0) {
                  currentSolde = montantTheorique.toString();
               } else {
                  currentSolde = "0";
               }
            } else {
               // No closed session, use caisse.solde directly
               currentSolde = c.solde || "0";
            }
         }

         const assignments = await storage.getCaisseAssignmentsEnriched(c.id);
         return {
             ...c,
             solde: currentSolde,
             agenceNom: agenceMap.get(c.agenceId) || null,
             isOccupied: !!activeSession,
             occupiedBy: activeSession ? activeSession.caissierId : null,
             sessionId: activeSession ? activeSession.id : null,
             assignments: assignments.map(a => a.userId),
             assignmentsDetails: assignments,
         };
      }));

      res.json(enrichedCaisses);
  });

  app.post("/api/caisses/:id/assign", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), requireAgenceAccess(), async (req, res) => {
      const { id } = req.params;
      const { userIds } = req.body; // Expect array of user IDs
      
      if (!Array.isArray(userIds)) {
          return res.status(400).json({ message: "userIds must be an array" });
      }

      await storage.setCaisseAssignments(id, userIds, req.session.user!.id);
      res.json({ success: true });
  });

  app.post("/api/caisses", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), requireAgenceAccess(), async (req, res) => {
      const data = normalizeKeysDeep(req.body) as any;
      const user = req.session.user!;
      
      const isAdmin = isAdminRole(user.role);
      
      // If admin, use provided agenceId (validate it exists?)
      // If not admin, FORCE user's agenceId
      if (!isAdmin) {
          data.agenceId = user.agenceId;
      } else {
          // Admin must provide agenceId
          if (!data.agenceId) {
             return res.status(400).json({ message: "L'agence est obligatoire pour la création par un administrateur." });
          }
      }

      const parsed = insertCaisseSchema.parse(data);
      const caisse = await storage.createCaisse(parsed);
      res.status(201).json(caisse);
  });

  app.delete("/api/caisses/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), async (req, res) => {
    const { id } = req.params;
    const user = req.session.user!;

    const caisse = await storage.getCaisse(id);
    if (!caisse) return res.status(404).json({ message: "Caisse non trouvée" });

    // Check Agency Access
    if (!isAdminRole(user.role) && caisse.agenceId !== user.agenceId) {
        return res.status(403).json({ message: "Accès refusé à cette agence" });
    }

    const deleted = await storage.deleteCaisse(id);
    if (!deleted) {
        return res.status(409).json({ message: "Impossible de supprimer cette caisse car elle a déjà été utilisée (historique présent)." });
    }

    res.json({ success: true });
  });

  app.get("/api/sessions-caisse/active", requireAuth, async (req, res) => {
      const user = req.session.user!;
      const session = await storage.getActiveSessionForUser(user.id);
      res.json(session || null);
  });

  /**
   * GET /api/sessions-caisse/my-caisses
   * Récupère les caisses assignées à l'utilisateur avec leur solde disponible
   * Utilisé par le dashboard pour afficher le solde quand aucune session n'est active
   * NOTE: This route MUST be defined BEFORE /api/sessions-caisse/:id to avoid route conflict
   */
  app.get("/api/sessions-caisse/my-caisses", requireAuth, async (req, res) => {
    const user = req.session.user!;
    const caisses = await storage.getUserAssignedCaissesWithBalance(user.id);
    res.json(caisses);
  });

  app.get("/api/sessions-caisse", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE_SESSION), requireAgenceIdAccess(), async (req, res) => {
      // Use requireAgenceIdAccess for more robust agence filtering (uses UUIDs from userAgences)
      const agenceId = req.selectedAgenceId || req.query.agenceId as string;
      const requestedStatut = req.query.statut as string;

      const filter = { 
        agence: agenceId,
        statut: requestedStatut
      };
      
      const sessions = await storage.getAllSessionsCaisse(filter);
      res.json(sessions);
  });

  /**
   * GET /api/sessions-caisse/closing
   * Récupère les sessions en cours de fermeture pour l'agence (supervision)
   * NOTE: This route MUST be defined BEFORE /api/sessions-caisse/:id to avoid route conflict
   */
  app.get("/api/sessions-caisse/closing", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE_SESSION), async (req, res) => {
    const user = req.session.user!;
    const agenceId = (req.query.agenceId as string) || user.agenceId;

    if (!agenceId) {
      return res.status(400).json({ message: "L'agence est requise" });
    }

    const sessions = await sessionClosingService.getClosingSessionsForAgence(agenceId);
    res.json(sessions);
  });

  /**
   * GET /api/sessions-caisse/pending
   * Récupère la session en attente (REQUESTING_FUNDS ou FUNDS_DISPATCHED) de l'utilisateur
   * NOTE: This route MUST be defined BEFORE /api/sessions-caisse/:id to avoid route conflict
   */
  app.get("/api/sessions-caisse/pending", requireAuth, async (req, res) => {
    const user = req.session.user!;
    const session = await sessionOpeningService.getPendingSession(user.id);
    res.json(session || null);
  });

  /**
   * Sessions à risque (inactives depuis trop longtemps)
   * NOTE: This route MUST be defined BEFORE /api/sessions-caisse/:id to avoid route conflict
   */
  app.get("/api/sessions-caisse/risky", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE_SESSION), async (req, res) => {
      try {
          const riskySessions = await sessionService.getRiskySessions();
          res.json(riskySessions);
      } catch (error: any) {
          logger.error({ err: error }, 'Erreur récupération sessions à risque');
          res.status(500).json({ message: error.message });
      }
  });

  /**
   * Sessions avec écarts significatifs (monitoring)
   * NOTE: This route MUST be defined BEFORE /api/sessions-caisse/:id to avoid route conflict
   */
  app.get("/api/sessions-caisse/ecarts", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE_SESSION), async (req, res) => {
      try {
          const threshold = req.query.threshold ? Number(req.query.threshold) : undefined;
          const sessionsWithEcarts = await sessionService.getSessionsWithSignificantEcarts(threshold);
          res.json(sessionsWithEcarts);
      } catch (error: any) {
          logger.error({ err: error }, 'Erreur récupération écarts');
          res.status(500).json({ message: error.message });
      }
  });

  /**
   * Fermer les sessions expirées (route admin pour déclencher manuellement ou via cron)
   * NOTE: This route MUST be defined BEFORE /api/sessions-caisse/:id to avoid route conflict
   */
  app.post("/api/sessions-caisse/close-expired", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE_SESSION), async (req, res) => {
      try {
          const timeoutHours = req.body.timeoutHours ? Number(req.body.timeoutHours) : 12;
          const closedSessions = await sessionService.closeExpiredSessions(timeoutHours);

          // Notifier via WebSocket
          const wsInstance = getWsInstance();
          if (wsInstance && closedSessions.length > 0) {
              closedSessions.forEach(s => {
                  wsInstance.broadcast({
                      type: "SESSION_TIMEOUT",
                      payload: { sessionId: s.sessionId, caisseId: s.caisseId }
                  });
              });
              wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
          }

          res.json({
              success: true,
              closedCount: closedSessions.length,
              closedSessions
          });
      } catch (error: any) {
          logger.error({ err: error }, 'Erreur fermeture sessions expirées');
          res.status(500).json({ message: error.message });
      }
  });

  app.get("/api/sessions-caisse/:id", requireAuth, async (req, res) => {
      const session = await storage.getSessionCaisse(req.params.id);
      if (!session) return res.status(404).json({ message: "Session introuvable" });
      
      const operations = await storage.getOperationsBySession(req.params.id);
      res.json({ ...session, operations });
  });

  app.get("/api/sessions-caisse/caissier/:id", requireAuth, async (req, res) => {
      try {
          const sessions = await storage.getSessionsByCaissier(req.params.id);
          res.json(sessions);
      } catch (error: any) {
          res.status(500).json({ message: error.message });
      }
  });

  // Session caisse (roles: admin, chef, caisse, et autres si assignés)
  // Utilise le service atomique pour éviter les race conditions
  app.post("/api/sessions-caisse", requireAuth, async (req, res) => {
      // 1. Validate Roles & Assignments
      const user = req.session.user;
      if (!user) return res.status(401).json({ message: "Non authentifié" });

      const normalizedRole = normalizeRole(user.role);
      const isManager = normalizedRole === SystemRole.ADMIN || normalizedRole === SystemRole.CHEF_AGENCE;

      const data = normalizeKeysDeep(req.body) as any;

      // Validation basique des données requises
      if (!data.caisseId) {
          return res.status(400).json({ message: "Vous devez sélectionner une caisse physique." });
      }

      // Check Assignment if not Manager
      if (!isManager) {
          const assignments = await storage.getCaisseAssignments(data.caisseId);
          const isAssigned = assignments.some(a => a.userId === user.id);

          if (!isAssigned) {
              return res.status(403).json({ message: "Accès refusé. Vous n'êtes pas assigné à cette caisse." });
          }
      }

      // 2. Utiliser le service atomique pour l'ouverture de session
      // Ce service gère les race conditions, la validation du billetage et l'audit
      const result = await sessionService.openSessionAtomic({
          caissierId: data.caissierId || user.id,
          caisseId: data.caisseId,
          agenceId: data.agenceId,
          soldeInitial: data.soldeInitial || "0",
          billetageOuverture: data.billetageOuverture || {},
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
      });

      if (!result.success) {
          // Mapper les codes d'erreur vers les codes HTTP appropriés
          const statusMap: Record<string, number> = {
              CAISSE_OCCUPIED: 409,
              USER_HAS_SESSION: 409,
              INVALID_BILLETAGE: 400,
              DB_ERROR: 500,
          };
          const status = statusMap[result.errorCode || 'DB_ERROR'] || 500;
          return res.status(status).json({
              message: result.error,
              errorCode: result.errorCode
          });
      }

      // 3. Update UI real-time
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "CAISSE_UPDATE", payload: { caisseId: data.caisseId } });
          wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
      }

      // 4. Log d'audit (déjà fait dans le service, mais on peut ajouter un log supplémentaire ici)
      await logAudit(
          req,
          "SESSION_OPENED",
          "caisse",
          result.session.id,
          { caisseId: data.caisseId, soldeInitial: result.session.montantOuverture },
          "success",
          "low"
      );

      res.json(result.session);
  });

  // Clôture de session
  app.post("/api/sessions-caisse/:id/close", requireAuth, async (req, res) => {
      const { id } = req.params;
      const user = req.session.user!;
      
      const session = await storage.getSessionCaisse(id);
      if (!session) return res.status(404).json({ message: "Session introuvable" });

      // Permission check: User must be the owner OR Admin/Chef
      const normalizedRole = normalizeRole(user.role);
      const isManager = normalizedRole === SystemRole.ADMIN || normalizedRole === SystemRole.CHEF_AGENCE;
      if (session.caissierId !== user.id && !isManager) {
          return res.status(403).json({ message: "Vous n'avez pas l'autorisation de fermer cette session" });
      }

      const data = normalizeKeysDeep(req.body) as any;
      const billetageFermeture = data.billetageFermeture || {};
      const observations = data.observations;

      // 1. Calculate Real Balance from Billetage
      let soldeReel = 0;
      // Define values for cash counting (should ideally be shared constant)
      const VALUES: Record<string, number> = {
          'billets_10000': 10000, 'billets_5000': 5000, 'billets_1000': 1000, 'billets_500': 500,
          'billets_200': 200, 'billets_100': 100, 'billets_50': 50,
          'pieces_20': 20, 'pieces_10': 10, 'pieces_5': 5
      };

      for (const [key, count] of Object.entries(billetageFermeture)) {
          if (VALUES[key]) {
              soldeReel += (Number(count) || 0) * VALUES[key];
          }
      }

      // 2. Calculate Theoretical Balance (Initial + Ops)
      // This logic should be robust. For now, we trust the frontend 'soldeTheorique' if provided, BUT better to recalculate.
      // Let's recalculate for security.
      const ops = await storage.getOperationsBySession(id);
      let soldeTheorique = Number(session.montantOuverture);
      
      // Add Operations
      for (const op of ops) {
          const montant = Number(op.montant);

          // Use centralized helper functions from caisse-operations.ts
          const delta = getOperationDelta(op.typeOperation, montant, {
              reference: op.reference,
              description: op.description
          });
          soldeTheorique += delta;
      }

      // Add Transfers (IN/OUT)
      // Pending implementation of Transfer logic affecting session balance directly?
      // For MVP closure, we assume Ops cover most. If Transfers exist, they should generate Ops or be queried.
      // Let's assume for now Ops are the source of truth.

      // 3. Calculate Ecart
      const ecart = soldeReel - soldeTheorique;

      // 4. Update Session
      const closedSession = await storage.closeSessionCaisse(id, {
          soldeReel: soldeReel.toString(),
          ecart: ecart.toString(),
          billetageFermeture,
          observations
      });

      // Update UI real-time
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "CAISSE_UPDATE", payload: { caisseId: session.caisseId } });
          wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
      }

      res.json(closedSession);
  });

  // ============================================================================
  // ROUTES DE MONITORING ET HEARTBEAT (Production)
  // ============================================================================

  // Heartbeat - mise à jour de l'activité de la session
  app.post("/api/sessions-caisse/:id/heartbeat", requireAuth, async (req, res) => {
      const { id } = req.params;
      const user = req.session.user!;

      // Vérifier que l'utilisateur est propriétaire de la session
      const session = await storage.getSessionCaisse(id);
      if (!session) {
          return res.status(404).json({ message: "Session introuvable" });
      }
      if (session.caissierId !== user.id) {
          return res.status(403).json({ message: "Non autorisé" });
      }

      const success = await sessionService.updateSessionHeartbeat(id);

      if (success) {
          res.json({ success: true, timestamp: new Date().toISOString() });
      } else {
          res.status(400).json({ success: false, message: "Session non active" });
      }
  });

  // Forcer la fermeture d'une session (admin)
  app.post("/api/sessions-caisse/:id/force-close", requireAuth, attachAbility, requireAbility(Actions.CLOSE_SESSION, Subjects.CAISSE_SESSION), async (req, res) => {
      const { id } = req.params;
      const user = req.session.user!;

      const session = await storage.getSessionCaisse(id);
      if (!session) {
          return res.status(404).json({ message: "Session introuvable" });
      }
      if (session.closedAt) {
          return res.status(400).json({ message: "Session déjà fermée" });
      }

      const result = await sessionService.closeSessionAtomic({
          sessionId: id,
          billetageFermeture: {},
          soldeReel: "0",
          observations: `Fermeture forcée par ${user.nom || user.username} - ${req.body.reason || 'Sans raison spécifiée'}`,
          closedBy: user.id,
          closedReason: "admin",
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
      });

      if (!result.success) {
          return res.status(500).json({ message: result.error });
      }

      // Update UI real-time
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "CAISSE_UPDATE", payload: { caisseId: session.caisseId } });
          wsInstance.broadcast({ type: "SESSION_FORCE_CLOSED", payload: { sessionId: id } });
          wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
      }

      res.json(result.session);
  });

  // ============================================================================

  app.get("/api/caisses/status", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE), async (req, res) => {
    const agenceId = req.query.agenceId as string;
    const caisses = await storage.getCaissesWithStatus(agenceId);
    res.json(caisses);
  });

  // Opérations caisse du jour — toutes les opérations de la CAISSE pour aujourd'hui
  // Permet d'afficher les transactions récentes même si la session a été rouverte
  // NOTE: Le solde de session est calculé séparément via les données de session
  app.get("/api/operations-caisse/today", requireAuth, async (req, res) => {
      try {
        const user = req.session.user!;

        // Récupérer la session active de l'utilisateur pour obtenir la caisse_id
        const activeSession = await storage.getActiveSessionForUser(user.id);

        if (!activeSession) {
          return res.json([]); // Pas de session active, pas d'opérations
        }

        // Récupérer la caisse_id depuis la session
        const caisseId = activeSession.caisse_id || activeSession.caisseId;

        if (!caisseId) {
          return res.json([]);
        }

        // Retourner les opérations du jour pour cette CAISSE (toutes sessions confondues)
        const operations = await storage.getOperationsCaisseToday(caisseId);

        res.json(operations);
      } catch (error: any) {
        logger.error({ err: error }, 'Erreur récupération opérations du jour');
        res.status(500).json({ message: error.message });
      }
  });

  // Récupérer les opérations par sessionId (pour les rapports)
  app.get("/api/operations-caisse", requireAuth, async (req, res) => {
      try {
        const { sessionId } = req.query;

        if (!sessionId || typeof sessionId !== 'string') {
          return res.status(400).json({ message: "sessionId requis" });
        }

        const operations = await storage.getOperationsBySession(sessionId);
        res.json(operations);
      } catch (error: any) {
        logger.error({ err: error }, 'Erreur récupération opérations par session');
        res.status(500).json({ message: error.message });
      }
  });

  // Opération caisse (roles: admin, chef, caisse)
  app.post("/api/operations-caisse", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.CAISSE_OPERATION), async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body) as any;
        const user = req.session.user!;
        
        // Ownership check
        const session = await storage.getSessionCaisse(data.sessionId);
        if (!session) return res.status(404).json({ message: "Session introuvable" });
        
        const normalizedRole = normalizeRole(user.role);
        const isManager = normalizedRole === SystemRole.ADMIN || normalizedRole === SystemRole.CHEF_AGENCE;
        if (session.caissierId !== user.id && !isManager) {
            return res.status(403).json({ message: "Vous n'avez pas l'autorisation d'ajouter des opérations à cette session" });
        }

        const parsed = insertOperationCaisseSchema.parse(data);

        // Targeted Account Resolution
        let targetCompteId = data.compteId;
        
        // Auto-resolve account if not provided but client is
        if (!targetCompteId && parsed.clientId) {
             const opType = (parsed.typeOperation || '').toLowerCase();
             
             // Check if operation implies an account interaction
             const impliesAccount = 
                opType.includes('versement') || 
                opType.includes('retrait') || 
                opType.includes('dépôt') || 
                opType.includes('depot') ||
                opType.includes('compte');

             if (impliesAccount) {
                 const clientAccounts = await storage.getComptesByClient(parsed.clientId);
                 
                 // Smart matching based on operation name
                 let targetType: string | undefined;
                 if (opType.includes('courant')) targetType = TypeCompte.CURRENT;
                 else if (opType.includes('bloqué') || opType.includes('bloque')) targetType = TypeCompte.BLOCKED;
                 else if (opType.includes('épargne') || opType.includes('epargne')) targetType = TypeCompte.SAVINGS;
                 
                 let foundAccount;
                 if (targetType) {
                     foundAccount = clientAccounts.find(c => c.typeCompte === targetType && c.statut === StatutCompte.ACTIVE);
                 } else {
                     // Default fallback (usually Epargne)
                     foundAccount = clientAccounts.find(c => c.typeCompte === TypeCompte.SAVINGS && c.statut === StatutCompte.ACTIVE) || clientAccounts[0];
                 }

                 if (foundAccount) {
                     targetCompteId = foundAccount.id;
                 } else {
                     // Only strictly block if we identified a specific target type that is missing
                     // For generic operations like "Encaissement Divers" creating a movement is enough?
                     // But "Versement Courant" MUST fail if no Courant account.
                     if (targetType) {
                         return res.status(400).json({ message: `Aucun compte ${targetType} actif trouvé pour ce client.` });
                     }
                     // Else fallback to generic operation without account update (just cash movement)
                 }
             }
        }

        // --- NEW LEDGER FLOW ---
        // We use the unified function if we have a target Account OR if it's a generic operation we want tracked
        // For now, we assume ALL operations via this endpoint should be robust.
        
        const hasAccountImpact = !!targetCompteId;

        // ====== BUSINESS LOGIC: Block Debit Operations on Frozen Accounts ======
        if (hasAccountImpact && targetCompteId) {
            const opType = (parsed.typeOperation || '').toLowerCase();
            const isDebitOperation = opType.includes('retrait');
            
            if (isDebitOperation) {
                const targetAccount = await storage.getCompte(targetCompteId);
                if (targetAccount?.blocageActif) {
                    return res.status(403).json({ 
                        message: `Ce compte est gelé (${targetAccount.blocageMotif || 'Blocage administratif'}). Les retraits ne sont pas autorisés.` 
                    });
                }
                // Also check if client is frozen
                if (parsed.clientId) {
                    const client = await storage.getClient(parsed.clientId);
                    if (client && [StatutClient.INACTIVE, StatutClient.SUSPENDED].includes(client.statut as any)) {
                        return res.status(403).json({
                            message: `Client ${client.statut}. Les opérations de débit ne sont pas autorisées.`
                        });
                    }
                }
            }
        }
        // ====== END BUSINESS LOGIC ======

        if (hasAccountImpact) {
            const { operation, transaction, mouvement } = await storage.createCashTransactionWithLedger({
                sessionId: parsed.sessionId,
                typeOperation: parsed.typeOperation,
                montant: parsed.montant.toString(),
                methodePaiement: parsed.methodePaiement || 'Espèces',
                clientId: parsed.clientId || undefined,
                compteId: targetCompteId,
                description: parsed.description || undefined,
                idempotencyKey: parsed.idempotencyKey || undefined
            }, user.id);

            // Side Effects (Scoring, WS)
            try {
                const isSavingsDeposit = ['DEPOSIT_SAVINGS', 'SAVINGS_DEPOSIT'].includes(parsed.typeOperation);
                if (parsed.clientId && isSavingsDeposit && parsed.montant) {
                    const { recordScoreEvent } = await import('../services/scoring-engine');
                    await recordScoreEvent({
                        clientId: parsed.clientId,
                        agenceId: session.agenceId,
                        eventType: 'EPARGNE_DEPOT',
                        refId: operation.id,
                        refType: 'operation_caisse',
                        montant: Number(parsed.montant),
                        createdBy: user.id,
                    });
                }

                const wsInstance = getWsInstance();
                if (wsInstance) {
                    if (parsed.clientId) wsInstance.broadcast({ type: "CLIENT_UPDATE", payload: { clientId: parsed.clientId } });
                    if (transaction) wsInstance.broadcast({ type: "COMPTE_UPDATE", payload: { compteId: transaction.compteId, newSolde: Number(transaction.soldeApres) } });
                    
                    wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
                    wsInstance.broadcast({ type: "CAISSE_UPDATE", payload: { caisseId: session.caisseId } });
                }
            } catch (err) {
                logger.error({ err }, 'Post-operation side-effects error');
            }

            res.json(operation);

        } else {
            // Fallback for Operations WITHOUT Account impact (e.g. "Divers", "Frais divers" not linked to account)
            // We use the simpler ledger function that only touches Session + Ledger
            const { operation } = await storage.createOperationCaisseWithLedger({
                sessionId: parsed.sessionId,
                typeOperation: parsed.typeOperation,
                montant: parsed.montant.toString(),
                methodePaiement: parsed.methodePaiement || 'Espèces',
                clientId: parsed.clientId || undefined,
                description: parsed.description || undefined,
                idempotencyKey: parsed.idempotencyKey || undefined
            }, user.id);

            res.json(operation);
        }

      } catch (error: any) {
        logger.error({ err: error }, 'Error creating operation');
        res.status(400).json({ message: error.message || "Erreur lors de la création de l'opération" });
      }
  });

  // Update Opération caisse (PATCH)
  app.patch("/api/operations-caisse/:id", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.CAISSE_OPERATION), async (req, res) => {
      try {
        const { id } = req.params;
        const data = normalizeKeysDeep(req.body) as any;
        
        const updated = await storage.updateOperationCaisse(id, data);
        if (!updated) {
             return res.status(404).json({ message: "Opération introuvable" });
        }
        
        // Notify updates
             if (updated.clientId) {
                const wsInstance = getWsInstance();
                if (wsInstance) {
                    wsInstance.broadcast({ type: "CLIENT_UPDATE", payload: { clientId: updated.clientId } });
                    wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
                }
             }
             res.json(updated);
      } catch (error: any) {
         logger.error({ err: error }, 'Error updating operation');
         res.status(400).json({ message: error.message || "Erreur lors de la mise à jour" });
      }
  });

  // Update credit (roles: admin, chef, credit)
  // State Machine guard is in storage.updateCredit
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

  // Factures - Basic logic
  app.get("/api/factures", requireAuth, async (req, res) => {
      const factures = await storage.getAllFactures();
      res.json(factures);
  });

  // Get single facture with lines and client info
  app.get("/api/factures/:id", requireAuth, async (req, res) => {
    try {
      const facture = await storage.getFacture(req.params.id);
      if (!facture) {
        return res.status(404).json({ message: "Facture non trouvée" });
      }

      // Get invoice lines
      const lignes = await storage.getLignesByFacture(facture.id);
      
      // Get client info if available
      let client = null;
      if (facture.clientId) {
        client = await storage.getClient(facture.clientId);
      }

      // Get modele info if available
      let modele = null;
      if (facture.modeleId) {
        modele = await storage.getModeleFacture(facture.modeleId);
      }

      res.json({
        ...facture,
        lignes,
        client,
        modele
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur récupération facture');
      res.status(500).json({ message: error.message || "Erreur lors de la récupération de la facture" });
    }
  });

  // Create facture (roles: admin, chef, comptable)
  app.post("/api/factures", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.INVOICE), async (req, res) => {
      const data = normalizeKeysDeep(req.body);
      const parsed = insertFactureSchema.parse(data);
      const facture = await storage.createFacture(parsed);
      res.json(facture);
  });
  // Caisse Transferts (Treasury)
  app.get("/api/caisse-transferts", requireAuth, requireAgenceAccess("agenceId"), async (req, res) => {
    const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
    const transfers = await storage.getCaisseTransferts(agenceFilter?.agenceId);
    res.json(transfers);
  });

  // Initier un transfert
  app.post("/api/caisse-transferts", requireAuth, attachAbility, requireAbility(Actions.TRANSFER, Subjects.CAISSE), async (req, res) => {
    try {
      const data = normalizeKeysDeep(req.body as any) as any;
      
      // 1. Vérification session active émetteur
      const sessionSource = await storage.getSessionCaisse(data.sessionId);
      if (!sessionSource || sessionSource.closedAt) {
         return res.status(400).json({ message: "Session source invalide ou fermée" });
      }

      // Permission check: User must be owner or manager
      const user = req.session.user!;
      const normalizedRole = normalizeRole(user.role);
      const isManager = normalizedRole === SystemRole.ADMIN || normalizedRole === SystemRole.CHEF_AGENCE;
      if (sessionSource.caissierId !== user.id && !isManager) {
          return res.status(403).json({ message: "Vous n'avez pas l'autorisation d'initier un transfert depuis cette session" });
      }

      // 2. Vérification solde disponible (Temps réel)
      const soldeActuel = Number(sessionSource.montantFermetureDeclare || sessionSource.montantFermetureTheorique); 
      // Note: soldeReel est souvent null si pas cloturé, on utilise le théorique par défaut.
      // Idéalement on recalcule: Initial + Entrées - Sorties
      // Pour l'instant on se base sur le frontend mais le backend DOIT vérifier.
      
      // Calculer solde théorique courant
      const ops = await storage.getOperationsBySession(sessionSource.id);
      const computedSolde = ops.reduce((acc, op) => {
         // Ajuster selon type ('depot' vs 'retrait')
         // Simplification: le frontend envoie le montant, on verifie juste grossièrement ici ou on fait confiance au process
         return acc; 
      }, Number(sessionSource.montantOuverture));

      // Pour simplifier dans cette étape, on fait confiance au solde théorique stocké s'il est à jour, 
      // ou on vérifie juste que montant < solde (si on avait la logique de calcul de solde ici).
      
      // Creation
      const rawData = insertCaisseTransfertSchema.parse({
        ...(data as any),
        agenceSourceId: sessionSource.agenceId, // Force l'agence source
        createdBy: req.session.user!.id
      });

      const transfert = await storage.createCaisseTransfert(rawData);

      // Notification WS à l'agence de destination
      const wsInstance = getWsInstance();
      if (wsInstance) {
          // Trouver le nom de l'agence destination pour cibler (TODO: mapper ID vers Nom ou utiliser ID dans WS)
          // Pour l'instant on broadcast global ou on essaie de cibler.
          // On envoie un event 'caisse-update' générique
          wsInstance.broadcast({ type: "CAISSE_UPDATE", payload: { type: 'transfert_new', id: transfert.id } });
      }

      res.status(201).json(transfert);
    } catch (e: any) {
      res.status(400).json({ message: e.message || "Erreur création transfert" });
    }
  });

  // Recevoir/Valider un transfert
  app.patch("/api/caisse-transferts/:id/recevoir", requireAuth, attachAbility, requireAbility(Actions.TRANSFER, Subjects.CAISSE), async (req, res) => {
      const { id } = req.params;
      const { sessionId } = req.body; // Session qui reçoit

      const sessionDest = await storage.getSessionCaisse(sessionId);
      if (!sessionDest || sessionDest.closedAt) {
          return res.status(400).json({ message: "Vous devez avoir une session ouverte pour recevoir des fonds" });
      }

      const transfert = await storage.getCaisseTransfert(id);
      if (!transfert || transfert.statut !== StatutTransfertCaisse.PENDING) {
          return res.status(400).json({ message: "Transfert non disponible" });
      }

      // Valider
      const updated = await storage.updateCaisseTransfert(id, {
          statut: StatutTransfertCaisse.VALIDATED,
          sessionDestId: sessionDest.id,
          dateValidation: new Date(),
          validatedBy: req.session.user!.id
      });

      // Créer les opérations miroirs
      // 1. Sortie chez l'expéditeur (Transfert caisse - Sortant)
      await storage.createOperationCaisse({
          sessionId: transfert.sessionSourceId,
          typeOperation: 'CASH_TRANSFER',
          montant: transfert.montant,
          reference: `TRF-OUT-${transfert.reference}`,
          description: `Transfert vers ${sessionDest.agenceId} (Ref: ${transfert.reference})`,
          methodePaiement: 'TRANSFER',
          createdBy: req.session.user!.id
      });

      // 2. Entrée chez le destinataire (Transfert caisse - Entrant)
      await storage.createOperationCaisse({
          sessionId: sessionDest.id,
          typeOperation: 'CASH_TRANSFER',
          montant: transfert.montant,
          reference: `TRF-IN-${transfert.reference}`,
          description: `Réception transfert de ${transfert.sessionSourceId} (Ref: ${transfert.reference})`,
          methodePaiement: 'TRANSFER',
          createdBy: req.session.user!.id
      });

      // Notify users
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "CAISSE_UPDATE", payload: { type: 'transfert_validated', id } });
      }

      res.json(updated);
  });
  
  // Annuler un transfert
  app.post("/api/caisse-transferts/:id/annuler", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), async (req, res) => {
      const { id } = req.params;
      const transfert = await storage.getCaisseTransfert(id);

      if (!transfert || transfert.statut !== StatutTransfertCaisse.PENDING) {
          return res.status(400).json({ message: "Transfert ne peut pas être annulé" });
      }

      // Seul l'émetteur ou un admin peut annuler
      // Implementation simplifiée...

      const updated = await storage.updateCaisseTransfert(id, {
          statut: StatutTransfertCaisse.CANCELLED
      });
      
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "CAISSE_UPDATE", payload: { type: 'transfert_cancelled', id } });
      }
      
      res.json(updated);
  });

  // ============================================================================
  // MOUVEMENTS FINANCIERS API (Phase 3 - Unified Ledger Endpoints)
  // ============================================================================

  /**
   * GET /api/mouvements - Global ledger feed with filtering
   */
  app.get("/api/mouvements", requireAuth, requireAgenceAccess(), async (req, res) => {
    try {
      const { sourceModule, clientId, compteId, creditId, sessionCaisseId, from, to, limit } = req.query;

      const filter: any = {};
      if (sourceModule) filter.sourceModule = sourceModule as string;
      if (clientId) filter.clientId = clientId as string;
      if (compteId) filter.compteId = compteId as string;
      if (creditId) filter.creditId = creditId as string;
      if (sessionCaisseId) filter.sessionCaisseId = sessionCaisseId as string;
      if (from) filter.from = new Date(from as string);
      if (to) filter.to = new Date(to as string);
      if (limit) filter.limit = parseInt(limit as string, 10);

      const mouvements = await storage.getMouvementsFinanciers(filter);
      res.json(mouvements);
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching mouvements');
      res.status(500).json({ message: error.message || 'Erreur serveur' });
    }
  });

  /**
   * GET /api/comptes/:id/mouvements - Movements for a specific savings account
   */
  app.get("/api/comptes/:id/mouvements", requireAuth, async (req, res) => {
    try {
      const mouvements = await storage.getMouvementsFinanciers({
        compteId: req.params.id,
        limit: 100
      });
      res.json(mouvements);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/credits/:id/mouvements - Movements for a specific credit
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

  /**
   * GET /api/sessions-caisse/:id/mouvements - Movements for a cash session
   */
  app.get("/api/sessions-caisse/:id/mouvements", requireAuth, async (req, res) => {
    try {
      const mouvements = await storage.getMouvementsFinanciers({
        sessionCaisseId: req.params.id,
        limit: 100
      });
      res.json(mouvements);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // CREDIT REFUND WORKFLOW API
  // ============================================================================

  /**
   * GET /api/finance/credit-refunds - List refunds with filters
   */
  app.get("/api/finance/credit-refunds", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.REMBOURSEMENT), requireAgenceAccess("agenceId"), async (req, res) => {
    try {
      const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
      let query = db.select({
        refund: creditRefundRequests,
        demande: demandesCredit,
        client: {
          id: clients.id,
          nom: schema.users.nom,
          prenom: schema.users.prenom,
          phone: schema.users.telephone,
        }
      })
      .from(creditRefundRequests)
      .innerJoin(demandesCredit, eq(creditRefundRequests.demandeId, demandesCredit.id))
      .innerJoin(clients, eq(creditRefundRequests.clientId, clients.id))
      .innerJoin(schema.users, eq(clients.userId, schema.users.id));

      const conditions = [];
      if (agenceFilter?.agenceId) {
        conditions.push(eq(creditRefundRequests.agenceId, agenceFilter.agenceId));
      }

      if (req.query.statut) {
        conditions.push(eq(creditRefundRequests.statut, req.query.statut as typeof creditRefundRequests.statut.enumValues[number]));
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      
      const results = await query.orderBy(desc(creditRefundRequests.createdAt));
      res.json(results);
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching refunds');
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/finance/credit-refunds/pending/count - Count pending refunds (SUBMITTED + APPROVED)
   * Used for sidebar badge notification
   */
  app.get("/api/finance/credit-refunds/pending/count", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.REMBOURSEMENT), requireAgenceAccess("agenceId"), async (req, res) => {
    try {
      const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
      const conditions = [
        // Count both SUBMITTED (needs approval) and APPROVED (needs payment)
        sql`${creditRefundRequests.statut} IN ('SUBMITTED', 'APPROVED')`
      ];

      if (agenceFilter?.agenceId) {
        conditions.push(eq(creditRefundRequests.agenceId, agenceFilter.agenceId));
      }

      const [result] = await db
        .select({ count: count() })
        .from(creditRefundRequests)
        .where(and(...conditions));

      res.json({ count: result?.count || 0 });
    } catch (error: any) {
      logger.error({ err: error }, 'Error counting pending refunds');
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/finance/credit-refunds/:id - Get Single Refund Details
   */
  app.get("/api/finance/credit-refunds/:id", requireAuth, async (req, res) => {
     try {
        const refund = await storage.getCreditRefundRequest(req.params.id);
        if (!refund) return res.status(404).json({ message: "Refund request not found" });
        res.json(refund);
     } catch (error: any) {
        res.status(500).json({ message: error.message });
     }
  });

  /**
   * POST /api/finance/credit-refunds/:id/approve - Approve Refund Request
   * Requires N+1 Validation (Checker must be different from Maker)
   */
  app.post("/api/finance/credit-refunds/:id/approve", requireAuth, attachAbility, requireAbility(Actions.APPROVE, Subjects.REMBOURSEMENT), async (req, res) => {
     try {
       const user = req.session.user!;
       const refund = await storage.getCreditRefundRequest(req.params.id);
       
       if (!refund) return res.status(404).json({ message: "Refund request not found" });
       
       if (refund.statut !== 'SUBMITTED') {
         return res.status(400).json({ message: `Cannot approve refund in status '${refund.statut}'` });
       }

       if (refund.makerId === user.id && !isAdminRole(user.role)) {
         return res.status(403).json({ message: "Segregation of Duties: Maker cannot approve their own request." });
       }

       const updated = await storage.updateCreditRefundRequest(refund.id, {
         statut: 'APPROVED',
         checkerId: user.id,
         checkerAt: new Date(),
         checkerDecision: 'APPROVED'
       });
       
       // Log Audit
       await logAudit(req, "APPROVE_REFUND", "credit_refund", refund.id, {}, "success", "medium");

       // Domain event: refund approved
       dispatchDomainEvent({
         type: "CREDIT_REFUND_APPROVED",
         data: {
           refundId: refund.id,
           reference: refund.id.substring(0, 8).toUpperCase(),
           clientId: refund.clientId,
           montant: Number(refund.montantRemboursable || 0),
           agenceId: refund.agenceId,
         },
         timestamp: new Date(),
       });

       // WebSocket: notify for real-time badge update
       const wsInstance = getWsInstance();
       if (wsInstance) {
         wsInstance.broadcast({
           type: "CREDIT_UPDATE",
           payload: { type: 'refund_approved', refundId: refund.id, demandeId: refund.demandeId }
         });
       }

       res.json(updated);
     } catch (error: any) {
       res.status(500).json({ message: error.message });
     }
  });

  /**
   * POST /api/finance/credit-refunds/:id/pay - Execute Payment (Cash, Account or Mobile Money)
   *
   * Flow:
   * - ACCOUNT: Direct transfer to client's current account (immediate)
   * - CASH/MOBILE_MONEY: Requires caisse validation - sets status to PENDING_CAISSE
   */
  app.post("/api/finance/credit-refunds/:id/pay", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.REMBOURSEMENT), async (req, res) => {
    const { method, sessionCaisseId, provider, phoneNumber } = req.body; // method: 'CASH' | 'ACCOUNT' | 'MOBILE_MONEY'
    const user = req.session.user!;

    try {
       const refundId = req.params.id;

       // Get refund first
       const [refundData] = await db
          .select()
          .from(creditRefundRequests)
          .where(eq(creditRefundRequests.id, refundId));

       if (!refundData) {
          return res.status(404).json({ message: "Remboursement non trouvé" });
       }
        if (refundData.statut !== 'APPROVED') {
           return res.status(400).json({ message: `Le remboursement doit être approuvé avant paiement (statut actuel: ${refundData.statut})` });
        }

        // Validate MOBILE_MONEY requirements
        if (method === 'MOBILE_MONEY') {
          if (!provider || !['MTN', 'AIRTEL'].includes(provider)) {
            return res.status(400).json({ message: "Opérateur mobile requis (MTN ou AIRTEL)" });
          }
          if (!phoneNumber || phoneNumber.trim().length < 8) {
            return res.status(400).json({ message: "Numéro de téléphone valide requis pour le paiement Mobile Money" });
          }
        }

        // Validate ACCOUNT requirements: pre-check active current account
        if (method === 'ACCOUNT') {
          const clientAccounts = await storage.getComptesByClient(refundData.clientId);
          const courantAccount = clientAccounts.find(c => c.typeCompte === TypeCompte.CURRENT && c.statut === StatutCompte.ACTIVE);
          if (!courantAccount) {
            return res.status(400).json({ message: "Le client n'a aucun compte courant actif. Veuillez choisir un autre mode de paiement." });
          }
        }

        // For CASH or MOBILE_MONEY: Set to PENDING_CAISSE and notify caisse
        if (method === 'CASH' || method === 'MOBILE_MONEY') {
          // Update to PENDING_CAISSE status
           await db.update(creditRefundRequests).set({
              statut: 'PENDING_CAISSE',
              paymentMethod: method,
              ...(method === 'MOBILE_MONEY' ? {
                mobileMoneyProvider: provider,
                mobileMoneyPhone: phoneNumber.trim(),
              } : {}),
              updatedAt: new Date()
           }).where(eq(creditRefundRequests.id, refundId));

          // CASH: Create caisse payment request (queue)
          if (method === 'CASH' && refundData.agenceId) {
            const { createCaisseRequest } = await import("../services/caisse-queue-service");
            const clientInfo = refundData.clientId ? await storage.getClient(refundData.clientId) : null;

            await createCaisseRequest({
              category: "FEE_REFUND",
              direction: "OUT",
              agenceId: refundData.agenceId,
              sourceType: "credit_refund",
              sourceId: refundId,
              clientId: refundData.clientId || undefined,
              montant: Number(refundData.montantRemboursable),
              label: `Restitution frais dossier`,
              description: clientInfo
                ? `Remboursement ${Number(refundData.montantRemboursable).toLocaleString('fr-FR')} ${currencySymbol()} à ${clientInfo.nom} ${clientInfo.prenom || ''}`.trim()
                : undefined,
              metadata: {
                demandeId: refundData.demandeId,
                clientNom: clientInfo?.nom,
                clientPrenom: clientInfo?.prenom,
              },
              createdBy: user.id,
            });
          }

          // Log Audit
          await logAudit(req, "REFUND_PENDING_CAISSE", "credit_refund", refundId, { method }, "success", "medium");

          // Broadcast WebSocket notification for caisse
          const wsInstance = getWsInstance();
          if (wsInstance) {
             wsInstance.broadcast({
                type: "REFUND_PENDING_CAISSE",
                payload: {
                   refundId,
                   method,
                   amount: refundData.montantRemboursable,
                   agenceId: refundData.agenceId,
                   clientId: refundData.clientId
                }
             });
          }

          const updated = await storage.getCreditRefundRequest(refundId);
          return res.json({
             ...(updated as Record<string, unknown>),
             message: method === 'CASH'
                ? 'Remboursement envoyé en caisse. Le caissier traitera le paiement.'
                : 'Remboursement Mobile Money en attente de validation caisse.'
          });
       }

       // For ACCOUNT: Execute immediate payment (existing flow)
       await db.transaction(async (tx) => {
          // 1. Lock and Get Refund
          const [refundDataLocked] = await tx
             .select()
             .from(creditRefundRequests)
             .where(eq(creditRefundRequests.id, refundId));

          if (!refundDataLocked) throw new Error("Refund not found");
          if (refundDataLocked.statut !== 'APPROVED') throw new Error("Refund must be APPROVED before payment");

          const amount = Number(refundDataLocked.montantRemboursable);

          // 2. Prepare Ledger Transaction
          let mouvement;
          let paymentRefString = '';

          // Credit Client Account (ACCOUNT method only at this point)
          const clientAccounts = await storage.getComptesByClient(refundDataLocked.clientId);
          const courantAccount = clientAccounts.find(c => c.typeCompte === TypeCompte.CURRENT && c.statut === StatutCompte.ACTIVE);
          if (!courantAccount) throw new Error("No active current account found for client");

          // Get client for agency info
          const client = await storage.getClient(refundDataLocked.clientId);
          if (!client) throw new Error("Client not found");

          // CRITICAL: Always use the CLIENT'S agency for the source of funds
          const sourceAgenceId = client.agenceId;
          if (!sourceAgenceId) throw new Error("Client has no agency assigned");

          // Identify Agency Safe (Coffre-Fort) for Source of Funds
          const [agencyCoffre] = await tx.select()
              .from(coffresForts)
              .where(eq(coffresForts.ownerId, sourceAgenceId));
          if (!agencyCoffre) throw new Error("Agency safe not found for refund source");

          // Check Safe Balance
          const safeBalance = Number(agencyCoffre.solde || 0);
          const refundAmount = Number(amount);
          if (safeBalance < refundAmount) {
              throw new Error(`Insufficient funds in agency safe (Required: ${refundAmount}, Available: ${safeBalance})`);
          }

          // DEBIT SAFE (Source)
          await tx.update(coffresForts)
            .set({
                solde: sql`${coffresForts.solde} - ${refundAmount}`,
                updatedAt: new Date()
            })
            .where(eq(coffresForts.id, agencyCoffre.id));

          // Create Debit Mouvement (Coffre)
          const coffreMouvement = await createMouvementFinancier(tx, {
            montant: refundAmount.toString(),
            sens: 'DEBIT',
            sourceModule: 'COFFRE',
            typePaiement: 'FEE_REFUND',
            methodePaiement: 'TRANSFER',
            sourceId: agencyCoffre.id,
            agenceId: refundDataLocked.agenceId,
            metadata: {
                type: 'REFUND_SOURCE',
                refundId: refundDataLocked.id,
                coffreId: agencyCoffre.id,
                description: `Source pour rbt frais (Ref: ${refundDataLocked.id})`
            }
          }, user.id);

          // CREDIT CLIENT ACCOUNT (Destination)
          mouvement = await createMouvementFinancier(tx, {
            montant: refundAmount.toString(),
            sens: 'CREDIT',
            sourceModule: 'SYSTEME',
            typePaiement: 'FEE_REFUND',
            methodePaiement: 'TRANSFER',
            clientId: refundDataLocked.clientId,
            compteId: courantAccount.id,
            metadata: {
                type: 'REFUND_PAYMENT',
                refundId: refundDataLocked.id,
                demandeId: refundDataLocked.demandeId,
                sourceMouvementId: coffreMouvement.id
            }
          }, user.id);

          // Update Client Account Balance
          const [updatedAccount] = await tx.update(comptes)
              .set({
                  soldeCourant: sql`${comptes.soldeCourant} + ${refundAmount}`,
                  updatedAt: new Date()
              })
              .where(eq(comptes.id, courantAccount.id))
              .returning();

          // Create Transaction Record
          await tx.insert(transactionsCompte).values({
            compteId: courantAccount.id,
            mouvementId: mouvement.id,
            typePaiement: 'DEPOSIT_CURRENT',
            sens: 'CREDIT', // Refund is money coming in
            montant: refundAmount.toString(),
            soldeApres: updatedAccount.soldeCourant,
            methodePaiement: 'TRANSFER',
            observations: `Remboursement Frais Dossier (Ref: ${refundDataLocked.id})`,
            createdBy: user.id
          });

          // GL Posting for coffre debit (STRICT — failure rolls back transaction)
          if (!refundDataLocked.agenceId) {
            throw new Error(`GL posting impossible: no agenceId on refund ${refundDataLocked.id}`);
          }
          await postGlForMouvement(tx, coffreMouvement, refundDataLocked.agenceId, user.id, {
            refundId: refundDataLocked.id,
            type: 'REFUND_SOURCE',
          });

          // GL Posting for client account credit (STRICT)
          await postGlForMouvement(tx, mouvement, refundDataLocked.agenceId, user.id, {
            refundId: refundDataLocked.id,
            type: 'REFUND_PAYMENT',
          });

          paymentRefString = `VIREMENT-${mouvement.reference}`;

          // Update Refund Status to PAID
          await tx.update(creditRefundRequests).set({
             statut: 'PAID',
             paidAt: new Date(),
             paidBy: user.id,
             paymentMethod: method,
             paymentReference: paymentRefString,
             mouvementId: mouvement.id
          }).where(eq(creditRefundRequests.id, refundDataLocked.id));
          
       });

       const updated = await storage.getCreditRefundRequest(refundId);

       // Domain event: refund paid (ACCOUNT method)
       if (updated) {
         dispatchDomainEvent({
           type: "CREDIT_REFUND_PAID",
           data: {
             refundId: updated.id,
             reference: updated.id.substring(0, 8).toUpperCase(),
             clientId: updated.clientId,
             montant: Number(updated.montantRemboursable || 0),
             agenceId: updated.agenceId,
           },
           timestamp: new Date(),
         });
       }

       res.json(updated);

    } catch (error: any) {
       logger.error({ err: error }, 'Payment error');
       res.status(500).json({ message: error.message });
    }
  });

  /**
   * POST /api/finance/credit-refunds/:id/validate-caisse - Caisse validates and executes Cash/Mobile Money payment
   *
   * This endpoint is called by caisse staff to confirm a PENDING_CAISSE refund.
   * It requires an active caisse session and executes the actual payment.
   */
  app.post("/api/finance/credit-refunds/:id/validate-caisse", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.CAISSE_OPERATION), async (req, res) => {
    const { sessionCaisseId } = req.body;
    const user = req.session.user!;

    try {
       const refundId = req.params.id;

       // Validate session caisse is required for cash payments
       if (!sessionCaisseId) {
          return res.status(400).json({ message: "Session caisse requise pour valider le paiement" });
       }

       await db.transaction(async (tx) => {
           // 1. Get and validate refund
           const [refundData] = await tx
              .select()
              .from(creditRefundRequests)
              .where(eq(creditRefundRequests.id, refundId));

           if (!refundData) throw new Error("Remboursement non trouvé");
           if (refundData.statut !== 'PENDING_CAISSE') {
              throw new Error(`Le remboursement doit être en attente de caisse (statut actuel: ${refundData.statut})`);
           }

           const amount = Number(refundData.montantRemboursable);
           const paymentMethod = refundData.paymentMethod || 'CASH';

           // 2. Validate session
           const [session] = await tx.select().from(sessionsCaisse).where(eq(sessionsCaisse.id, sessionCaisseId));
           if (!session || session.closedAt) {
              throw new Error("Session caisse invalide ou fermée");
           }

           // 3. Create caisse operation (outgoing payment)
           const [op] = await tx.insert(operationsCaisse).values({
             sessionId: sessionCaisseId,
             typeOperation: 'WITHDRAWAL_CURRENT',
             montant: amount.toString(),
             methodePaiement: paymentMethod === 'MOBILE_MONEY' ? 'MOBILE_MONEY' : 'CASH',
             reference: `REFUND-${refundData.id.substring(0,8)}`,
             description: `Remboursement Frais ${paymentMethod === 'MOBILE_MONEY' ? 'Mobile Money' : 'Espèces'} (Ref: ${refundData.id})`,
             clientId: refundData.clientId,
             createdBy: user.id
           }).returning();

           // 4. Create ledger mouvement — pass correct methodePaiement and provider for GL routing
           const mouvementMethode = paymentMethod === 'MOBILE_MONEY' ? 'MOBILE_MONEY' : 'CASH';
           const mouvementProvider = paymentMethod === 'MOBILE_MONEY' ? (refundData.mobileMoneyProvider || undefined) : undefined;

           const mouvement = await createMouvementFinancier(tx, {
             montant: amount.toString(),
             sens: 'DEBIT',
             sourceModule: 'CAISSE',
             sourceId: op.id,
             typePaiement: 'FEE_REFUND',
             methodePaiement: mouvementMethode,
             ...(mouvementProvider ? { provider: mouvementProvider } : {}),
             sessionCaisseId: sessionCaisseId,
             clientId: refundData.clientId,
             agenceId: refundData.agenceId,
             metadata: {
                type: 'REFUND_PAYMENT',
                refundId: refundData.id,
                operationId: op.id,
                demandeId: refundData.demandeId,
                method: paymentMethod,
                ...(mouvementProvider ? { provider: mouvementProvider } : {}),
             }
           }, user.id);

           const paymentRefString = paymentMethod === 'MOBILE_MONEY'
              ? `MOMO-${op.reference}`
              : `CASH-${op.reference}`;

           // GL Posting (STRICT — failure rolls back transaction)
           if (!refundData.agenceId) {
             throw new Error(`GL posting impossible: no agenceId on refund ${refundData.id}`);
           }
           await postGlForMouvement(tx, mouvement, refundData.agenceId, user.id, {
             refundId: refundData.id,
             operationId: op.id,
             type: 'REFUND_CAISSE_PAYMENT',
           });

           // 5. For MOBILE_MONEY: trigger automatic payout via MoMo API
           if (paymentMethod === 'MOBILE_MONEY') {
             const momoPhone = refundData.mobileMoneyPhone;
             const momoProvider = refundData.mobileMoneyProvider as 'MTN' | 'AIRTEL';
             if (!momoPhone || !momoProvider) {
               throw new Error("Données Mobile Money manquantes sur la demande de remboursement (opérateur ou numéro)");
             }

             const { paymentService } = await import("../services/mobile-money/payment-service");
             await paymentService.initiatePayout({
               provider: momoProvider,
               amount,
               phone: momoPhone,
               clientId: refundData.clientId,
               agenceId: refundData.agenceId || undefined,
               description: `Restitution frais dossier — ${refundData.id.substring(0,8)}`,
               idempotencyKey: `FEE_REFUND_MOMO_${refundData.id}`,
               metadata: {
                 useCase: 'FEE_REFUND',
                 refundId: refundData.id,
                 demandeId: refundData.demandeId,
               },
             }, user.id);
           }

           // 6. Update refund to PAID
           await tx.update(creditRefundRequests).set({
              statut: 'PAID',
              paidAt: new Date(),
              paidBy: user.id,
              paymentReference: paymentRefString,
              mouvementId: mouvement.id,
              updatedAt: new Date()
           }).where(eq(creditRefundRequests.id, refundData.id));
        });

       // Log audit
       await logAudit(req, "VALIDATE_CAISSE_REFUND", "credit_refund", refundId, { sessionCaisseId }, "success", "medium");

       // Broadcast update
       const wsInstance = getWsInstance();
       if (wsInstance) {
          wsInstance.broadcast({
             type: "REFUND_PAID",
             payload: { refundId }
          });
       }

       const updated = await storage.getCreditRefundRequest(refundId);

       // Domain event: refund paid (CASH/MOBILE_MONEY via caisse)
       if (updated) {
         dispatchDomainEvent({
           type: "CREDIT_REFUND_PAID",
           data: {
             refundId: updated.id,
             reference: updated.id.substring(0, 8).toUpperCase(),
             clientId: updated.clientId,
             montant: Number(updated.montantRemboursable || 0),
             agenceId: updated.agenceId,
           },
           timestamp: new Date(),
         });
       }

       res.json({
          ...(updated as Record<string, unknown>),
          message: 'Paiement validé avec succès. Le remboursement a été effectué.'
       });

    } catch (error: any) {
       logger.error({ err: error }, 'Caisse validation error');
       res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/finance/credit-refunds/pending-caisse - List refunds awaiting caisse validation
   */
  app.get("/api/finance/credit-refunds/pending-caisse", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.REMBOURSEMENT), requireAgenceAccess("agenceId"), async (req, res) => {
    try {
       const agenceFilter = req.agenceFilter as { agenceId?: string } | null;

       const conditions = [eq(creditRefundRequests.statut, 'PENDING_CAISSE')];
       if (agenceFilter?.agenceId) {
          conditions.push(eq(creditRefundRequests.agenceId, agenceFilter.agenceId));
       }

       const results = await db.select({
          refund: creditRefundRequests,
          demande: demandesCredit,
          client: clients
       })
       .from(creditRefundRequests)
       .innerJoin(demandesCredit, eq(creditRefundRequests.demandeId, demandesCredit.id))
       .innerJoin(clients, eq(creditRefundRequests.clientId, clients.id))
       .where(and(...conditions))
       .orderBy(desc(creditRefundRequests.updatedAt));

       res.json(results);
    } catch (error: any) {
       res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/finance/credit-refunds/pending-caisse/count - Count refunds awaiting caisse validation
   */
  app.get("/api/finance/credit-refunds/pending-caisse/count", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.REMBOURSEMENT), requireAgenceAccess("agenceId"), async (req, res) => {
    try {
       const agenceFilter = req.agenceFilter as { agenceId?: string } | null;

       const conditions = [eq(creditRefundRequests.statut, 'PENDING_CAISSE')];
       if (agenceFilter?.agenceId) {
          conditions.push(eq(creditRefundRequests.agenceId, agenceFilter.agenceId));
       }

       const [result] = await db.select({ count: count() })
          .from(creditRefundRequests)
          .where(and(...conditions));

       res.json({ count: result?.count || 0 });
    } catch (error: any) {
       res.status(500).json({ message: error.message });
    }
  });


  // ==========================================
  // CAISSE LIQUIDATION & DELETION
  // ==========================================

  // LIQUIDATION CAISSE
  app.post("/api/caisses/:id/liquidate", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req as any).session?.userId;

      // 1. Get Caisse
      const [caisse] = await db.select().from(schema.caisses).where(eq(schema.caisses.id, id));
      if (!caisse) return res.status(404).json({ error: "Caisse not found" });

      if (caisse.statut === StatutCaisse.CLOSED) {
         // If already closed, check balance. If 0, soft delete.
         if (Number(caisse.solde) === 0) {
            await db.update(schema.caisses).set({ deletedAt: new Date() }).where(eq(schema.caisses.id, id));
            return res.json({ message: "Caisse fermée et vide archivée." });
         }
      }

      // 2. Get Agency Safe (Coffre-Fort)
      const [coffre] = await db.select()
        .from(schema.coffresForts)
        .where(eq(schema.coffresForts.ownerId, caisse.agenceId));
      
      if (!coffre) return res.status(400).json({ error: "Aucun coffre-fort trouvé pour cette agence." });

      // 3. Transfer Balance via Ledger (GL-tracked)
      const amount = Number(caisse.solde);

      await db.transaction(async (tx) => {
        if (amount > 0) {
            // Create mouvement financier via ledger service
            const mouvement = await createMouvementFinancier(tx, {
                montant: amount.toString(),
                sens: "DEBIT",
                sourceModule: "CAISSE",
                sourceId: caisse.id,
                typePaiement: "CAISSE_TO_COFFRE",
                agenceId: caisse.agenceId,
                metadata: {
                    type: "LIQUIDATION_CAISSE",
                    caisseId: caisse.id,
                    coffreId: coffre.id,
                    caisseNom: caisse.nom,
                    description: `Liquidation Caisse ${caisse.nom} -> Coffre`,
                },
            }, userId);

            // Debit Caisse
            await tx.update(schema.caisses)
                .set({ solde: "0" })
                .where(eq(schema.caisses.id, id));

            // Credit Coffre
            await tx.update(schema.coffresForts)
                .set({ solde: sql`${schema.coffresForts.solde} + ${amount}` })
                .where(eq(schema.coffresForts.id, coffre.id));

            // GL Posting (bloquant — échoue si pas de règle comptable)
            if (caisse.agenceId) {
                await postGlForMouvement(tx, mouvement, caisse.agenceId, userId, {
                    type: "LIQUIDATION_CAISSE",
                    caisseId: caisse.id,
                    coffreId: coffre.id,
                });
            }
        }

        // 4. Soft-delete Caisse (preserve audit trail)
        await tx.update(schema.caisses)
            .set({ deletedAt: new Date() })
            .where(eq(schema.caisses.id, id));
      });

      await logAudit(req, "LIQUIDATE", "caisses", id, { amount });

      res.json({ message: "Caisse liquidée et supprimée avec succès." });

    } catch (e: any) {
      logger.error({ err: e }, 'Erreur liquidation');
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================================
  // WORKFLOW SECURISE D'OUVERTURE DE CAISSE (Coffre → Caisse)
  // ============================================================================
  // Règle d'Or: L'argent ne doit jamais apparaître "magiquement".
  // Le solde d'ouverture = solde veille + transfert coffre (tous deux auditables)
  // ============================================================================

  /**
   * POST /api/sessions-caisse/request-opening
   * Phase A: Le caissier demande l'ouverture de sa caisse avec un montant souhaité
   */
  app.post("/api/sessions-caisse/request-opening", requireAuth, async (req, res) => {
    const user = req.session.user!;
    const data = normalizeKeysDeep(req.body) as any;

    // Validation basique
    if (!data.caisseId) {
      return res.status(400).json({ message: "Vous devez sélectionner une caisse physique." });
    }
    if (!data.montantDemande || Number(data.montantDemande) <= 0) {
      return res.status(400).json({ message: "Le montant demandé doit être positif." });
    }

    // Vérifier l'assignation si pas manager (ou si override superviseur valide)
    const normalizedRole = normalizeRole(user.role);
    const isManager = normalizedRole === SystemRole.ADMIN || normalizedRole === SystemRole.CHEF_AGENCE;

    if (!isManager) {
      let hasOverride = false;
      if (data.supervisorOverride) {
        const authStatus = await accessControlService.checkUserAuthorization(user.id, data.caisseId, data.agenceId || user.agenceId);
        hasOverride = authStatus.authorized;
      }
      if (!hasOverride) {
        const assignments = await storage.getCaisseAssignments(data.caisseId);
        const isAssigned = assignments.some(a => a.userId === user.id);
        if (!isAssigned) {
          return res.status(403).json({ message: "Accès refusé. Vous n'êtes pas assigné à cette caisse." });
        }
      }
    }

    const result = await sessionOpeningService.requestSessionOpening({
      caissierId: user.id,
      caisseId: data.caisseId,
      agenceId: data.agenceId || user.agenceId,
      montantDemande: Number(data.montantDemande),
      observations: data.observations,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    if (!result.success) {
      const statusMap: Record<string, number> = {
        CAISSE_OCCUPIED: 409,
        USER_HAS_SESSION: 409,
        INVALID_AMOUNT: 400,
        DB_ERROR: 500,
      };
      const status = statusMap[result.errorCode || 'DB_ERROR'] || 500;
      return res.status(status).json({
        message: result.error,
        errorCode: result.errorCode
      });
    }

    // Notifier via WebSocket
    const wsInstance = getWsInstance();
    if (wsInstance) {
      wsInstance.broadcast({ type: "OPENING_REQUEST_CREATED", payload: { agenceId: data.agenceId || user.agenceId } });
    }

    await logAudit(
      req,
      "SESSION_OPENING_REQUESTED",
      "session_caisse",
      result.session.id,
      { caisseId: data.caisseId, montantDemande: data.montantDemande },
      "success",
      "low"
    );

    res.status(201).json({
      session: result.session,
      transfert: result.transfert,
    });
  });

  /**
   * POST /api/sessions-caisse/open-direct
   * Ouverture directe sans passer par le workflow coffre.
   * Cas d'usage:
   * - Le caissier a un fonds de roulement reporté de la veille
   * - Le caissier souhaite ouvrir sa caisse à 0 FCFA (sans approvisionnement)
   */
  app.post("/api/sessions-caisse/open-direct", requireAuth, async (req, res) => {
    const user = req.session.user!;
    const data = normalizeKeysDeep(req.body) as any;

    // Validation basique
    if (!data.caisseId) {
      return res.status(400).json({ message: "Vous devez sélectionner une caisse physique." });
    }

    // Vérifier l'assignation si pas manager (ou si override superviseur valide)
    const normalizedRole = normalizeRole(user.role);
    const isManager = normalizedRole === SystemRole.ADMIN || normalizedRole === SystemRole.CHEF_AGENCE;

    if (!isManager) {
      let hasOverride = false;
      if (data.supervisorOverride) {
        const authStatus = await accessControlService.checkUserAuthorization(user.id, data.caisseId, data.agenceId || user.agenceId);
        hasOverride = authStatus.authorized;
      }
      if (!hasOverride) {
        const assignments = await storage.getCaisseAssignments(data.caisseId);
        const isAssigned = assignments.some(a => a.userId === user.id);
        if (!isAssigned) {
          return res.status(403).json({ message: "Accès refusé. Vous n'êtes pas assigné à cette caisse." });
        }
      }
    }

    const result = await sessionOpeningService.openDirectWithExistingFunds({
      caissierId: user.id,
      caisseId: data.caisseId,
      agenceId: data.agenceId || user.agenceId,
      observations: data.observations,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    if (!result.success) {
      const statusMap: Record<string, number> = {
        CAISSE_NOT_FOUND: 404,
        CAISSE_OCCUPIED: 409,
        USER_HAS_SESSION: 409,
        DB_ERROR: 500,
      };
      const status = statusMap[result.errorCode || 'DB_ERROR'] || 500;
      return res.status(status).json({
        message: result.error,
        errorCode: result.errorCode
      });
    }

    // Notifier via WebSocket
    const wsInstance = getWsInstance();
    if (wsInstance) {
      wsInstance.broadcast({ type: "CAISSE_UPDATE", payload: { agenceId: data.agenceId || user.agenceId } });
      wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
    }

    await logAudit(
      req,
      "SESSION_DIRECT_OPEN",
      "session_caisse",
      result.session.id,
      { caisseId: data.caisseId, type: "FONDS_REPORTE" },
      "success",
      "low"
    );

    res.status(201).json({
      session: result.session,
    });
  });

  /**
   * POST /api/sessions-caisse/:id/receive-funds
   * Phase C: Le caissier confirme la réception des fonds et ouvre la session
   */
  app.post("/api/sessions-caisse/:id/receive-funds", requireAuth, async (req, res) => {
    const { id } = req.params;
    const user = req.session.user!;
    const data = normalizeKeysDeep(req.body) as any;

    if (!data.billetageReception || Object.keys(data.billetageReception).length === 0) {
      return res.status(400).json({ message: "Le billetage de réception est obligatoire." });
    }

    const result = await sessionOpeningService.receiveFundsAndOpen({
      sessionId: id,
      caissierId: user.id,
      billetageReception: data.billetageReception,
      observations: data.observations,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    if (!result.success) {
      const statusMap: Record<string, number> = {
        SESSION_NOT_FOUND: 404,
        INVALID_STATE: 409,
        PERMISSION_DENIED: 403,
        DB_ERROR: 500,
      };
      const status = statusMap[result.errorCode || 'DB_ERROR'] || 500;
      return res.status(status).json({
        message: result.error,
        errorCode: result.errorCode
      });
    }

    // Notifier via WebSocket
    const wsInstance = getWsInstance();
    if (wsInstance) {
      wsInstance.broadcast({ type: "CAISSE_UPDATE", payload: { caisseId: result.session.caisseId } });
      wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
    }

    await logAudit(
      req,
      "SESSION_OPENED_WITH_FUNDS",
      "session_caisse",
      id,
      { soldeOuverture: result.session.montantOuverture },
      "success",
      "low"
    );

    res.json(result.session);
  });

  /**
   * POST /api/sessions-caisse/:id/cancel-request
   * Annule une demande d'ouverture (uniquement si REQUESTING_FUNDS)
   */
  app.post("/api/sessions-caisse/:id/cancel-request", requireAuth, async (req, res) => {
    const { id } = req.params;
    const user = req.session.user!;
    const data = normalizeKeysDeep(req.body) as any;

    const result = await sessionOpeningService.cancelOpeningRequest({
      sessionId: id,
      userId: user.id,
      reason: data.reason,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    if (!result.success) {
      const statusMap: Record<string, number> = {
        SESSION_NOT_FOUND: 404,
        INVALID_STATE: 409,
        PERMISSION_DENIED: 403,
        DB_ERROR: 500,
      };
      const status = statusMap[result.errorCode || 'DB_ERROR'] || 500;
      return res.status(status).json({
        message: result.error,
        errorCode: result.errorCode
      });
    }

    await logAudit(
      req,
      "SESSION_OPENING_CANCELLED",
      "session_caisse",
      id,
      { reason: data.reason },
      "success",
      "low"
    );

    res.json({ success: true });
  });

  // ============================================================================
  // WORKFLOW SECURISE DE FERMETURE DE CAISSE (Caisse → Coffre)
  // ============================================================================
  // Règle d'Or: L'argent compté physiquement doit correspondre à:
  // MontantVersCoffre + MontantReporte = TotalPhysique
  // ============================================================================

  /**
   * POST /api/sessions-caisse/:id/initiate-close
   * Phase A: Gel de la session - Le caissier initie la fermeture
   */
  app.post("/api/sessions-caisse/:id/initiate-close", requireAuth, async (req, res) => {
    const { id } = req.params;
    const user = req.session.user!;

    const result = await sessionClosingService.initiateClose({
      sessionId: id,
      caissierId: user.id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    if (!result.success) {
      const statusMap: Record<string, number> = {
        SESSION_NOT_FOUND: 404,
        NOT_YOUR_SESSION: 403,
        INVALID_STATUS: 409,
        PENDING_TRANSACTIONS: 409,
        DB_ERROR: 500,
      };
      const status = statusMap[result.errorCode || 'DB_ERROR'] || 500;
      return res.status(status).json({
        message: result.error,
        errorCode: result.errorCode
      });
    }

    await logAudit(
      req,
      "SESSION_CLOSING_INITIATED",
      "session_caisse",
      id,
      { statut: "CLOSING_COUNT" },
      "success",
      "medium"
    );

    res.json(result.session);
  });

  /**
   * POST /api/sessions-caisse/:id/submit-count
   * Phase B: Soumission du comptage à l'aveugle (blind count)
   */
  app.post("/api/sessions-caisse/:id/submit-count", requireAuth, async (req, res) => {
    const { id } = req.params;
    const user = req.session.user!;
    const data = normalizeKeysDeep(req.body) as any;

    // Validation basique
    if (!data.billetageFermeture || typeof data.billetageFermeture !== 'object') {
      return res.status(400).json({ message: "Le billetage est obligatoire" });
    }

    const result = await sessionClosingService.submitCount({
      sessionId: id,
      caissierId: user.id,
      billetageFermeture: data.billetageFermeture,
      ecartJustification: data.ecartJustification,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    if (!result.success) {
      const statusMap: Record<string, number> = {
        SESSION_NOT_FOUND: 404,
        NOT_YOUR_SESSION: 403,
        INVALID_STATUS: 409,
        MISSING_JUSTIFICATION: 400,
        DB_ERROR: 500,
      };
      const status = statusMap[result.errorCode || 'DB_ERROR'] || 500;
      return res.status(status).json({
        message: result.error,
        errorCode: result.errorCode,
        soldeTheorique: result.soldeTheorique,
        montantPhysique: result.montantPhysique,
        ecart: result.ecart,
      });
    }

    await logAudit(
      req,
      "SESSION_COUNT_SUBMITTED",
      "session_caisse",
      id,
      {
        soldeTheorique: result.soldeTheorique,
        montantPhysique: result.montantPhysique,
        ecart: result.ecart,
      },
      "success",
      "medium"
    );

    res.json({
      session: result.session,
      soldeTheorique: result.soldeTheorique,
      montantPhysique: result.montantPhysique,
      ecart: result.ecart,
    });
  });

  /**
   * POST /api/sessions-caisse/:id/finalize-close
   * Phase C: Finalisation - Décision de trésorerie et clôture définitive
   */
  app.post("/api/sessions-caisse/:id/finalize-close", requireAuth, async (req, res) => {
    const { id } = req.params;
    const user = req.session.user!;
    const data = normalizeKeysDeep(req.body) as any;

    // Validation basique
    if (typeof data.montantVersCoffre !== 'number' || typeof data.montantReporte !== 'number') {
      return res.status(400).json({ message: "Les montants de transfert et report sont obligatoires" });
    }

    if (data.montantVersCoffre < 0 || data.montantReporte < 0) {
      return res.status(400).json({ message: "Les montants ne peuvent pas être négatifs" });
    }

    const result = await sessionClosingService.finalizeClose({
      sessionId: id,
      caissierId: user.id,
      montantVersCoffre: data.montantVersCoffre,
      montantReporte: data.montantReporte,
      observations: data.observations,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    if (!result.success) {
      const statusMap: Record<string, number> = {
        SESSION_NOT_FOUND: 404,
        NOT_YOUR_SESSION: 403,
        INVALID_STATUS: 409,
        AMOUNT_MISMATCH: 400,
        COFFRE_NOT_FOUND: 500,
        DB_ERROR: 500,
      };
      const status = statusMap[result.errorCode || 'DB_ERROR'] || 500;
      return res.status(status).json({
        message: result.error,
        errorCode: result.errorCode
      });
    }

    // Notifier via WebSocket
    const wsInstance = getWsInstance();
    if (wsInstance) {
      wsInstance.broadcast({
        type: "CAISSE_UPDATE",
        payload: {
          sessionId: id,
          statut: "CLOSED",
          hasPendingTransfer: !!result.transfert,
        }
      });
    }

    await logAudit(
      req,
      "SESSION_CLOSED",
      "session_caisse",
      id,
      {
        montantVersCoffre: data.montantVersCoffre,
        montantReporte: data.montantReporte,
        closingTransfertId: result.transfert?.id,
      },
      "success",
      "high"
    );

    res.json({
      session: result.session,
      transfert: result.transfert,
    });
  });

  /**
   * POST /api/sessions-caisse/:id/cancel-close
   * Annule le processus de fermeture (uniquement en phase CLOSING_COUNT)
   */
  app.post("/api/sessions-caisse/:id/cancel-close", requireAuth, async (req, res) => {
    const { id } = req.params;
    const user = req.session.user!;
    const data = normalizeKeysDeep(req.body) as any;

    const result = await sessionClosingService.cancelClose({
      sessionId: id,
      caissierId: user.id,
      reason: data.reason,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    if (!result.success) {
      const statusMap: Record<string, number> = {
        SESSION_NOT_FOUND: 404,
        NOT_YOUR_SESSION: 403,
        INVALID_STATUS: 409,
        DB_ERROR: 500,
      };
      const status = statusMap[result.errorCode || 'DB_ERROR'] || 500;
      return res.status(status).json({
        message: result.error,
        errorCode: result.errorCode
      });
    }

    await logAudit(
      req,
      "SESSION_CLOSING_CANCELLED",
      "session_caisse",
      id,
      { reason: data.reason },
      "success",
      "medium"
    );

    res.json(result.session);
  });

  /**
   * POST /api/sessions-caisse/:id/submit-verification
   * Soumettre un comptage de vérification par un second utilisateur (superviseur)
   */
  app.post("/api/sessions-caisse/:id/submit-verification", requireAuth, async (req, res) => {
    const { id } = req.params;
    const user = req.session.user!;
    const data = normalizeKeysDeep(req.body) as any;

    const result = await sessionClosingService.submitVerificationCount({
      sessionId: id,
      verifierId: user.id,
      billetage: data.billetage || data.billetageFermeture || {},
      observations: data.observations,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    if (!result.success) {
      const statusMap: Record<string, number> = {
        SESSION_NOT_FOUND: 404,
        INVALID_STATUS: 409,
        SAME_USER: 403,
        ALREADY_VERIFIED: 409,
        DB_ERROR: 500,
      };
      const status = statusMap[result.errorCode || 'DB_ERROR'] || 500;
      return res.status(status).json({ message: result.error, errorCode: result.errorCode });
    }

    await logAudit(req, "VERIFICATION_COUNT_SUBMITTED", "session_caisse", id, {
      verificationTotal: result.verificationTotal,
      primaryTotal: result.primaryTotal,
      ecartVerification: result.ecartVerification,
      matched: result.matched,
    }, "success", "medium");

    res.json(result);
  });

  /**
   * GET /api/sessions-caisse/:id/counts
   * Récupérer les comptages primaire et de vérification d'une session
   */
  app.get("/api/sessions-caisse/:id/counts", requireAuth, async (req, res) => {
    const { id } = req.params;
    try {
      const counts = await sessionClosingService.getSessionCounts(id);
      res.json(counts);
    } catch (error) {
      logger.error({ err: error }, 'Session counts error');
      res.status(500).json({ error: "Erreur lors de la récupération des comptages" });
    }
  });

  /**
   * GET /api/sessions-caisse/:id/suggest-count
   * Suggère un billetage basé sur les opérations du jour
   */
  app.get("/api/sessions-caisse/:id/suggest-count", requireAuth, async (req, res) => {
    const { id } = req.params;
    try {
      const suggestion = await countSuggestionService.suggestDenominations(id);
      res.json(suggestion);
    } catch (error: any) {
      logger.error({ err: error }, 'Count suggestion error');
      res.status(500).json({ error: error.message || "Erreur lors de la suggestion du billetage" });
    }
  });

  // ============================================================================
  // CAISSE ACCESS CONTROL API
  // ============================================================================

  /**
   * GET /api/access/status/caisse
   * Vérifie si la caisse est accessible selon les horaires d'ouverture
   */
  app.get("/api/access/status/caisse", requireAuth, async (req, res) => {
    try {
      const caisseId = req.query.caisseId as string | undefined;
      const agenceId = req.query.agenceId as string | undefined;

      const status = await accessControlService.checkCaisseAccess(caisseId, agenceId);
      res.json(status);
    } catch (error: any) {
      logger.error({ err: error }, 'Error checking caisse access');
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/caisse/authorization-status
   * Vérifie si l'utilisateur a une autorisation valide pour accéder à la caisse
   */
  app.get("/api/caisse/authorization-status", requireAuth, async (req, res) => {
    try {
      const user = req.session.user!;
      const caisseId = req.query.caisseId as string | undefined;
      const agenceId = (req.query.agenceId as string | undefined) || user.agenceId;

      const status = await accessControlService.checkUserAuthorization(user.id, caisseId, agenceId);
      res.json(status);
    } catch (error: any) {
      logger.error({ err: error }, 'Error checking authorization');
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * POST /api/caisse/access-codes/validate
   * Valide un code de sécurité et crée une autorisation temporaire
   */
  app.post("/api/caisse/access-codes/validate", requireAuth, async (req, res) => {
    try {
      const user = req.session.user!;
      const data = normalizeKeysDeep(req.body) as any;

      if (!data.code) {
        return res.status(400).json({ error: "Le code de sécurité est requis" });
      }

      const result = await accessControlService.validateSecurityCode({
        userId: user.id,
        code: data.code,
        caisseId: data.caisseId,
        agenceId: data.agenceId || user.agenceId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      if (!result.success) {
        return res.status(401).json({ success: false, error: result.error });
      }

      await logAudit(
        req,
        "ACCESS_CODE_VALIDATED",
        "caisse_access",
        result.authorization?.id || '',
        { caisseId: data.caisseId },
        "success",
        "medium"
      );

      res.json({
        success: true,
        authorization: result.authorization,
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Error validating access code');
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/caisse/access-codes/generate
   * Génère un nouveau code de sécurité (admin/chef d'agence seulement)
   */
  app.post("/api/caisse/access-codes/generate", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), async (req, res) => {
    try {
      const user = req.session.user!;
      const data = normalizeKeysDeep(req.body) as any;

      const agenceId = data.agenceId || user.agenceId;
      if (!agenceId) {
        return res.status(400).json({ error: "L'agence est requise" });
      }

      // Calculate expiry date
      let expiresAt: Date | undefined;
      if (data.expiresInHours) {
        expiresAt = new Date(Date.now() + data.expiresInHours * 60 * 60 * 1000);
      } else if (data.expiresAt) {
        expiresAt = new Date(data.expiresAt);
      }

      const result = await accessControlService.generateSecurityCodeForCaisse({
        createdBy: user.id,
        agenceId,
        caisseId: data.caisseId,
        codeType: data.codeType || 'EMERGENCY',
        maxUsages: data.maxUsages ?? 1,
        authorizationDurationHours: data.authorizationDurationHours ?? 4,
        expiresAt,
        description: data.description,
        assignedToUserId: data.assignedToUserId,
      });

      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      // Send notifications to assigned user if requested
      if (data.sendNotification && data.assignedToUserId && result.code) {
        try {
          // Get user info for notifications
          const [assignedUser] = await db.select({
            id: schema.users.id,
            nom: schema.users.nom,
            prenom: schema.users.prenom,
            email: schema.users.email,
            telephone: schema.users.telephone,
          }).from(schema.users).where(eq(schema.users.id, data.assignedToUserId));

          if (assignedUser) {
            const validityLabel = data.expiresInHours ? `${data.expiresInHours}h` : '24h';
            const authLabel = data.authorizationDurationHours ? `${data.authorizationDurationHours}h` : '4h';
            const userName = `${assignedUser.prenom || ''} ${assignedUser.nom || ''}`.trim();
            const codeTypeLabels: Record<string, string> = {
              EMERGENCY: 'Urgence',
              DAILY: 'Journalier',
              PERMANENT: 'Permanent',
            };

            // Send push notification
            const { sendPushToUser } = await import('../services/push-notification-service');
            await sendPushToUser(data.assignedToUserId, {
              title: '🔑 Code d\'accès caisse',
              body: `Votre code: ${result.code} (valide ${validityLabel})`,
              data: {
                type: 'access_code',
                code: result.code,
                expiresAt: expiresAt?.toISOString(),
              },
            });

            // Send SMS and Email via notification service
            const { emitNotificationEvent, sendInAppNotification } = await import('../services/notifications/notification-service');

            const notificationPayload = {
              userName,
              code: result.code,
              validityHours: validityLabel,
              authorizationHours: authLabel,
              codeType: codeTypeLabels[data.codeType] || data.codeType,
              description: data.description || '',
            };

            await emitNotificationEvent(
              'ACCESS_CODE_GENERATED',
              { codeId: result.codeId, assignedTo: data.assignedToUserId },
              {
                smsRecipients: assignedUser.telephone ? [{
                  phone: assignedUser.telephone,
                  templateCode: 'ACCESS_CODE_GENERATED',
                  payload: notificationPayload,
                  userId: assignedUser.id,
                  agenceId,
                }] : undefined,
                emailRecipients: assignedUser.email ? [{
                  email: assignedUser.email,
                  templateCode: 'ACCESS_CODE_GENERATED',
                  payload: notificationPayload,
                  userId: assignedUser.id,
                  agenceId,
                }] : undefined,
                inAppRecipients: [{
                  userId: assignedUser.id,
                  type: 'ACCESS_CODE',
                  titre: '🔑 Code d\'accès caisse',
                  message: `Code: ${result.code} - Valide ${validityLabel}, donne ${authLabel} d'accès`,
                  priorite: 'HIGH',
                  referenceId: result.codeId,
                  referenceType: 'caisse_security_code',
                  expiresAt,
                }],
              }
            );

            logger.info({ userId: data.assignedToUserId, channels: ['push', 'sms', 'email', 'in_app'] }, 'Access code notifications sent');
          }
        } catch (notifErr) {
          // Don't fail the request if notification fails
          logger.warn({ err: notifErr, userId: data.assignedToUserId }, 'Failed to send access code notifications');
        }
      }

      await logAudit(
        req,
        "ACCESS_CODE_GENERATED",
        "caisse_security_code",
        result.codeId || '',
        {
          agenceId,
          caisseId: data.caisseId,
          codeType: data.codeType,
          maxUsages: data.maxUsages,
          assignedToUserId: data.assignedToUserId,
          notificationSent: !!(data.sendNotification && data.assignedToUserId),
        },
        "success",
        "high"
      );

      res.json({
        success: true,
        code: result.code, // Returned only at creation time
        codeId: result.codeId,
        expiresAt,
        notificationSent: !!(data.sendNotification && data.assignedToUserId),
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Error generating access code');
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/caisse/access-codes
   * Liste les codes de sécurité actifs pour une agence
   */
  app.get("/api/caisse/access-codes", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), async (req, res) => {
    try {
      const user = req.session.user!;
      const agenceId = (req.query.agenceId as string) || user.agenceId;

      if (!agenceId) {
        return res.status(400).json({ error: "L'agence est requise" });
      }

      const codes = await accessControlService.getActiveCodesForAgence(agenceId);
      res.json(codes);
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching access codes');
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * DELETE /api/caisse/access-codes/:id
   * Désactive un code de sécurité
   */
  app.delete("/api/caisse/access-codes/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), async (req, res) => {
    try {
      await accessControlService.deactivateSecurityCode(req.params.id);

      await logAudit(
        req,
        "ACCESS_CODE_DEACTIVATED",
        "caisse_security_code",
        req.params.id,
        {},
        "success",
        "medium"
      );

      res.json({ success: true });
    } catch (error: any) {
      logger.error({ err: error }, 'Error deactivating access code');
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/caisse/authorizations
   * Liste les autorisations actives pour une agence
   */
  app.get("/api/caisse/authorizations", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), async (req, res) => {
    try {
      const user = req.session.user!;
      const agenceId = (req.query.agenceId as string) || user.agenceId;

      if (!agenceId) {
        return res.status(400).json({ error: "L'agence est requise" });
      }

      const authorizations = await accessControlService.getActiveAuthorizationsForAgence(agenceId);
      res.json(authorizations);
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching authorizations');
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/caisse/authorizations/:id/revoke
   * Révoque une autorisation active
   */
  app.post("/api/caisse/authorizations/:id/revoke", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), async (req, res) => {
    try {
      const user = req.session.user!;
      const data = normalizeKeysDeep(req.body) as any;

      await accessControlService.revokeAuthorization(
        req.params.id,
        user.id,
        data.reason
      );

      await logAudit(
        req,
        "AUTHORIZATION_REVOKED",
        "caisse_user_authorization",
        req.params.id,
        { reason: data.reason },
        "success",
        "high"
      );

      res.json({ success: true });
    } catch (error: any) {
      logger.error({ err: error }, 'Error revoking authorization');
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * PATCH /api/caisses/:id/operating-hours
   * Met à jour les horaires d'ouverture d'une caisse (admin/chef d'agence)
   */
  app.patch("/api/caisses/:id/operating-hours", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.session.user!;
      const data = normalizeKeysDeep(req.body) as any;

      // Validate operating days if provided
      if (data.operatingDays) {
        if (!Array.isArray(data.operatingDays)) {
          return res.status(400).json({ error: "Les jours d'ouverture doivent être un tableau" });
        }
        const validDays = data.operatingDays.every((d: any) => typeof d === 'number' && d >= 0 && d <= 6);
        if (!validDays) {
          return res.status(400).json({ error: "Les jours doivent être des nombres entre 0 (Dimanche) et 6 (Samedi)" });
        }
      }

      // Validate time format if provided
      const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
      if (data.operatingHoursStart && !timeRegex.test(data.operatingHoursStart)) {
        return res.status(400).json({ error: "Format d'heure de début invalide (HH:MM attendu)" });
      }
      if (data.operatingHoursEnd && !timeRegex.test(data.operatingHoursEnd)) {
        return res.status(400).json({ error: "Format d'heure de fin invalide (HH:MM attendu)" });
      }

      const caisse = await storage.getCaisse(id);
      if (!caisse) {
        return res.status(404).json({ error: "Caisse non trouvée" });
      }

      // Check agency access
      if (!isAdminRole(user.role) && caisse.agenceId !== user.agenceId) {
        return res.status(403).json({ error: "Accès refusé à cette agence" });
      }

      const updateData: any = {};
      if (typeof data.operatingHoursEnabled === 'boolean') {
        updateData.operatingHoursEnabled = data.operatingHoursEnabled;
      }
      if (data.operatingHoursStart) {
        updateData.operatingHoursStart = data.operatingHoursStart;
      }
      if (data.operatingHoursEnd) {
        updateData.operatingHoursEnd = data.operatingHoursEnd;
      }
      if (data.operatingDays) {
        updateData.operatingDays = data.operatingDays;
      }

      const updated = await storage.updateCaisse(id, updateData);

      await logAudit(
        req,
        "CAISSE_OPERATING_HOURS_UPDATED",
        "caisse",
        id,
        updateData,
        "success",
        "medium"
      );

      res.json(updated);
    } catch (error: any) {
      logger.error({ err: error }, 'Error updating operating hours');
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // WEIGHT VERIFICATION (Vérification poids billets)
  // ============================================

  /**
   * POST /api/caisse/verify-weight
   * Verify cash denomination breakdown against actual weight
   */
  app.post("/api/caisse/verify-weight", requireAuth, async (req, res) => {
    try {
      const { billetage, actualWeightGrams } = req.body;

      if (!billetage || typeof billetage !== 'object') {
        return res.status(400).json({ error: "Billetage requis" });
      }
      if (typeof actualWeightGrams !== 'number' || actualWeightGrams < 0) {
        return res.status(400).json({ error: "Poids réel requis (en grammes)" });
      }

      const { verifyBilletageWeight } = await import("@shared/config/denomination-weights");
      const result = verifyBilletageWeight(billetage, actualWeightGrams);

      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Weight verification error');
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/caisse/expected-weight
   * Calculate expected weight for a billetage breakdown (no actual weight needed)
   */
  app.post("/api/caisse/expected-weight", requireAuth, async (req, res) => {
    try {
      const { billetage } = req.body;

      if (!billetage || typeof billetage !== 'object') {
        return res.status(400).json({ error: "Billetage requis" });
      }

      const { calculateExpectedWeight, DENOMINATION_VALUES, ALL_DENOMINATION_WEIGHTS } = await import("@shared/config/denomination-weights");
      const expectedWeight = calculateExpectedWeight(billetage);

      // Also calculate total value
      let totalValue = 0;
      const breakdown: Array<{ denomination: string; count: number; weight: number; value: number }> = [];
      for (const [denom, count] of Object.entries(billetage)) {
        const c = count as number;
        if (c <= 0) continue;
        const normalizedKey = denom.replace(/[^a-z0-9_]/gi, '');
        const val = DENOMINATION_VALUES[normalizedKey] || DENOMINATION_VALUES[denom] || 0;
        const wt = ALL_DENOMINATION_WEIGHTS[normalizedKey] || ALL_DENOMINATION_WEIGHTS[denom] || 0;
        totalValue += val * c;
        breakdown.push({ denomination: denom, count: c, weight: Math.round(wt * c * 100) / 100, value: val * c });
      }

      res.json({
        expectedWeightGrams: expectedWeight,
        totalValue,
        breakdown,
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Expected weight calculation error');
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/caisse/denomination-weights
   * Returns the reference weight table for all denominations
   */
  app.get("/api/caisse/denomination-weights", requireAuth, async (_req, res) => {
    const { ALL_DENOMINATION_WEIGHTS, DENOMINATION_VALUES } = await import("@shared/config/denomination-weights");
    const entries = Object.keys(DENOMINATION_VALUES).map(key => ({
      denomination: key,
      value: DENOMINATION_VALUES[key],
      weightGrams: ALL_DENOMINATION_WEIGHTS[key] || 0,
      type: key.startsWith('billets_') ? 'billet' : 'piece',
    }));
    res.json({ denominations: entries });
  });

  // =====================================================
  // LIQUIDITY CHECK — Double validation UI+Backend
  // =====================================================

  /**
   * GET /api/liquidity/check
   * Pré-vérifie la liquidité avant une opération financière.
   * Permet à l'UI de désactiver les boutons si liquidité insuffisante.
   *
   * Query params:
   * - entityType: "compte" | "session" | "coffre" | "mobile_money"
   * - entityId: UUID de l'entité
   * - amount: Montant à vérifier
   * - operator: "MTN" | "AIRTEL" (requis si entityType=mobile_money)
   * - agenceId: UUID de l'agence (requis si entityType=mobile_money)
   *
   * For cash operations with coffre fallback:
   * - entityType: "cash_availability"
   * - sessionId: UUID de la session caisse
   * - coffreId: UUID du coffre
   * - amount: Montant à vérifier
   */
  app.get("/api/liquidity/check", requireAuth, async (req, res) => {
    try {
      const { entityType, entityId, amount, sessionId, coffreId, operator, agenceId } = req.query as Record<string, string>;

      const montant = parseFloat(amount);
      if (!amount || isNaN(montant) || montant <= 0) {
        return res.status(400).json({ message: "Le montant doit être un nombre positif." });
      }

      const { liquidityGuard } = await import("../services/liquidity-guard");

      // Cash availability check (caisse → coffre cascade)
      if (entityType === "cash_availability") {
        if (!sessionId || !coffreId) {
          return res.status(400).json({ message: "sessionId et coffreId sont requis pour cash_availability." });
        }
        const result = await liquidityGuard.checkCashAvailability(sessionId, coffreId, montant);
        return res.json(result);
      }

      // Mobile Money check
      if (entityType === "mobile_money") {
        if (!operator || !agenceId) {
          return res.status(400).json({ message: "operator et agenceId sont requis pour mobile_money." });
        }
        const result = await liquidityGuard.checkMobileMoneyLiquidity(operator as "MTN" | "AIRTEL", agenceId, montant);
        return res.json(result);
      }

      // Standard entity checks
      if (!entityType || !entityId) {
        return res.status(400).json({ message: "entityType et entityId sont requis." });
      }

      const validTypes = ["compte", "session", "coffre"];
      if (!validTypes.includes(entityType)) {
        return res.status(400).json({ message: `entityType invalide. Valeurs acceptées: ${validTypes.join(", ")}, mobile_money, cash_availability` });
      }

      const result = await liquidityGuard.requireLiquidity(entityType as any, entityId, montant);
      res.json(result);
    } catch (error: any) {
      if (error instanceof InsufficientFundsError) {
        return res.status(200).json({
          allowed: false,
          ...error.toJSON(),
        });
      }
      logger.error({ err: error }, "Erreur vérification liquidité");
      res.status(500).json({ message: error.message || "Erreur lors de la vérification de liquidité" });
    }
  });

}
 
