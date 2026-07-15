import type { Express, Request } from "express";
import { verifyClientAccess, checkClientScoreAccess } from "./helpers";

import { createLogger } from "../../lib/logger";

import { insertTagSchema, insertClientTagSchema, insertClientActivitySchema, clientTags, clientActivities, users, clients, agences, professions, membresTontine, mouvementsFinanciers, comptes, credits, tontines, remboursements, contributionsTontine, clientDocumentSchema, clientDocumentsArraySchema, enquetesCredit, demandesCredit, creditPlans, type ClientDocument } from "@shared/schema";

import { getTransactionLabel } from "@shared/config/transaction-labels";

const logger = createLogger('Routes:Clients');

import {
  StatutCompte,
  StatutCredit,
  StatutDemande,
  StatutClient,
  SegmentClient,
  TypeCompte,
  MethodePaiement,
  getTypePaiementForCompte,
} from "@shared/enum/status-constants";

import { StorageService } from '../../services/storage-service';

import { storage } from "../../storage";

import { getClientTags, addClientTag, removeClientTag, createTag, deleteTag, getAllTags, logClientActivity, getClientActivities, getClientByUserId, getClientWithUser, getClientStats, createClientApiSchema, updateClientApiSchema, type ClientFull } from "../../storage/clients";

import { requireAuth, hashPassword } from "../../auth";

import { attachAbility, requireAbility, requireAnyAbility } from "../../authorization";

import { Actions, Subjects } from "@shared/ability";

import { SystemRole } from "@shared/types/roles";

import { requireAgenceAccess, validateAgenceAction, requireAgenceIdAccess, validateAgenceIdAction } from "../../middleware";

import { logAudit } from "../../audit";

import { normalizeKeysDeep, coerceValueToSchema, parsePagination, paginateResponse } from "../utils";

import { recalculateClientScore, recordScoreEvent, getScoreHistory, getScoreState, getScoreTrend, getAgencyScoreStats, getScorePercentile } from "../../services/scoring-engine";

import { z } from "zod";

import { db } from "../../db";

import { eq, sql, or, isNull, and, gte, lte, desc } from "drizzle-orm";

import { getComptesByClient, getCreditsByClient, getDemandesByClient } from "../../storage/finance";

import { autoCreateCourantAccount } from "../../services/comptes";

import { dispatchDomainEvent } from "../../services/notifications/domain-events/event-registry";

import { evaluateClientAlerts, resolveClientAlert, resolveAllClientAlerts, snoozeClientAlert, getAlertsSummary, getAlertsSummaryPaginated, KNOWN_ALERT_TYPES } from "../../services/client-alerts";

import { normalizePhone } from "@shared/utils/phone";

function getTransactionIcon(sourceModule: string, typePaiement?: string): string {
    const type = (typePaiement || sourceModule || '').toLowerCase();
    if (type.includes('crédit') || type.includes('credit')) return 'credit-card';
    if (type.includes('épargne') || type.includes('epargne')) return 'piggy-bank';
    if (type.includes('tontine')) return 'users';
    if (type.includes('retrait')) return 'arrow-up-right';
    if (type.includes('dépôt') || type.includes('depot') || type.includes('versement')) return 'arrow-down-left';
    if (type.includes('remboursement')) return 'refresh-cw';
    if (type.includes('décaissement') || type.includes('decaissement')) return 'banknote';
    return 'activity';
}

export function registerClientScoringRoutes(app: Express) {


  // Recalculate Score (full recalc from real data + audit event)
  app.post("/api/clients/:id/score", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.LOYALTY), async (req, res) => {
      try {
        if (!await checkClientScoreAccess(req, res)) return;
        const result = await recalculateClientScore(req.params.id, {
          source: "manual",
          createdBy: req.session.user?.id,
        });
        res.json(result);
      } catch (error) {
          logger.error({ err: error }, 'Score calculation error');
          res.status(500).json({ message: "Score calculation failed" });
      }
  });


  // Score event history (audit trail)
  app.get("/api/clients/:id/score-history", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.LOYALTY), async (req, res) => {
      try {
        if (!await checkClientScoreAccess(req, res)) return;
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
        const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
        const result = await getScoreHistory(req.params.id, limit, offset);
        res.json(result);
      } catch (error) {
          logger.error({ err: error }, 'Score history error');
          res.status(500).json({ message: "Failed to fetch score history" });
      }
  });


  // Score state (current component breakdown)
  app.get("/api/clients/:id/score-state", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.LOYALTY), async (req, res) => {
      try {
        if (!await checkClientScoreAccess(req, res)) return;
        const state = await getScoreState(req.params.id);
        if (!state) return res.status(404).json({ message: "Score state not found" });
        res.json(state);
      } catch (error) {
          logger.error({ err: error }, 'Score state error');
          res.status(500).json({ message: "Failed to fetch score state" });
      }
  });


  // Score trend (monthly evolution)
  app.get("/api/clients/:id/score-trend", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.LOYALTY), async (req, res) => {
      try {
        if (!await checkClientScoreAccess(req, res)) return;
        const months = Math.min(24, Math.max(1, parseInt(req.query.months as string) || 12));
        const trend = await getScoreTrend(req.params.id, months);
        res.json(trend);
      } catch (error) {
          logger.error({ err: error }, 'Score trend error');
          res.status(500).json({ message: "Failed to fetch score trend" });
      }
  });


  // Score percentile (ranking within agency)
  app.get("/api/clients/:id/score-percentile", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.LOYALTY), async (req, res) => {
      try {
        if (!await checkClientScoreAccess(req, res)) return;
        const percentile = await getScorePercentile(req.params.id);
        if (!percentile) return res.status(404).json({ message: "Score state not found" });
        res.json(percentile);
      } catch (error) {
          logger.error({ err: error }, 'Score percentile error');
          res.status(500).json({ message: "Failed to fetch score percentile" });
      }
  });


  // Manual bonus/malus (admin only — requires MANAGE on LOYALTY subject)
  app.post("/api/clients/:id/score-bonus", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.LOYALTY), async (req, res) => {
      try {
        if (!await checkClientScoreAccess(req, res)) return;
        const clientId = req.params.id;
        const { points, description } = req.body;

        if (!points || !description) {
            return res.status(400).json({ error: "Points et description requis" });
        }

        if (Math.abs(points) > 200) {
            return res.status(400).json({ error: "Bonus/malus limité à ±200 points" });
        }

        const eventType = points > 0 ? 'BONUS_MANUEL' : 'MALUS_MANUEL';
        const result = await recordScoreEvent({
            clientId,
            eventType,
            refId: `${eventType.toLowerCase()}-${clientId}-${Date.now()}`,
            refType: 'manual',
            montant: Math.abs(points),
            reason: description,
            createdBy: req.session.user!.id,
        });

        // SCORE_UPDATED is already broadcast by recalculateClientScore()
        const wsServer = await import("../../ws-server");
        const wsInstance = wsServer.getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "CLIENT_UPDATE", payload: { clientId } });
        }

        res.json({
            success: true,
            message: `${points} points ajoutés`,
            scoreGlobal: result.result.scoreGlobal,
            segment: result.result.segment,
        });
      } catch (error) {
          logger.error({ err: error }, 'Erreur ajout bonus');
          res.status(500).json({ error: "Erreur serveur" });
      }
  });
}
