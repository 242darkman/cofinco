import type { Express, Request } from "express";

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

export function registerClientAlertsRoutes(app: Express) {


  // ============================================
  // ALERTES CLIENT (Évaluation côté serveur)
  // ============================================

  /**
   * GET /api/alerts/summary
   * Cross-client alert summary for dashboard (lightweight SQL-based)
   */
  app.get("/api/alerts/summary", requireAuth, requireAgenceIdAccess(), async (req, res) => {
    try {
      const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
      const result = await getAlertsSummary(agenceFilter?.agenceId);
      res.set("Cache-Control", "private, max-age=60");
      res.json(result);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching alerts summary');
      res.status(500).json({ message: "Erreur lors du chargement du resume des alertes" });
    }
  });


  /**
   * GET /api/alerts/clients
   * Paginated list of at-risk clients for the AlertsDrawer
   */
  app.get("/api/alerts/clients", requireAuth, requireAgenceIdAccess(), async (req, res) => {
    try {
      const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
      const page = Math.max(1, Number(req.query.page) || 1);
      const perPage = Math.min(50, Math.max(5, Number(req.query.perPage) || 20));
      const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;
      const severityFilter = typeof req.query.severity === "string" ? req.query.severity : undefined;

      const result = await getAlertsSummaryPaginated(agenceFilter?.agenceId, {
        page,
        perPage,
        search: search || undefined,
        severityFilter: severityFilter || undefined,
      });

      res.set("Cache-Control", "private, max-age=30");
      res.json(result);
    } catch (error) {
      logger.error({ err: error }, "Error fetching paginated alert clients");
      res.status(500).json({ message: "Erreur lors du chargement des clients en alerte" });
    }
  });


  /**
   * GET /api/clients/:id/alerts
   * Evaluate and return active alerts for a client (server-side)
   */
  app.get("/api/clients/:id/alerts", requireAuth, requireAgenceIdAccess(), async (req, res) => {
    try {
      if (!z.string().uuid().safeParse(req.params.id).success) {
        return res.status(404).json({ message: "Client not found (Invalid ID)" });
      }

      const client = await storage.getClient(req.params.id);
      if (!client) return res.status(404).json({ message: "Client not found" });

      const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
      if (agenceFilter?.agenceId && client.agenceId !== agenceFilter.agenceId) {
        return res.status(403).json({ message: "Acces refuse : client d'une autre agence" });
      }

      const result = await evaluateClientAlerts(req.params.id);
      res.set("Cache-Control", "private, max-age=30");
      res.json(result);
    } catch (error) {
      logger.error({ err: error }, 'Error evaluating client alerts');
      res.status(500).json({ message: "Erreur lors de l'evaluation des alertes" });
    }
  });


  /**
   * POST /api/clients/:id/alerts/:alertType/resolve
   * Resolve (dismiss) a specific alert type for a client
   */
  app.post("/api/clients/:id/alerts/:alertType/resolve", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.CLIENT), requireAgenceIdAccess(), async (req, res) => {
    try {
      if (!z.string().uuid().safeParse(req.params.id).success) {
        return res.status(404).json({ message: "Client not found (Invalid ID)" });
      }

      const client = await storage.getClient(req.params.id);
      if (!client) return res.status(404).json({ message: "Client not found" });

      const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
      if (agenceFilter?.agenceId && client.agenceId !== agenceFilter.agenceId) {
        return res.status(403).json({ message: "Acces refuse : client d'une autre agence" });
      }

      if (!(KNOWN_ALERT_TYPES as readonly string[]).includes(req.params.alertType)) {
        return res.status(400).json({ message: `Type d'alerte inconnu: ${req.params.alertType}` });
      }

      const user = req.session.user;
      const resolvedByName = user ? `${user.prenom || ""} ${user.nom || ""}`.trim() || undefined : undefined;

      const success = await resolveClientAlert(
        req.params.id,
        req.params.alertType,
        user?.id,
        resolvedByName
      );

      if (!success) {
        return res.status(500).json({ message: "Erreur resolution alerte" });
      }

      await logAudit(
        req,
        "RESOLVE_CLIENT_ALERT",
        "client",
        req.params.id,
        { alertType: req.params.alertType },
        "success",
        "low"
      );

      // Diffuser le changement d'alerte pour une mise à jour de l'UI en temps réel
      const wsServer = await import("../../ws-server");
      const wsInstance = wsServer.getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "CLIENT_UPDATE",
          payload: { clientId: req.params.id, alertsChanged: true },
        });
      }

      res.json({ success: true, resolvedType: req.params.alertType });
    } catch (error) {
      logger.error({ err: error }, 'Error resolving client alert');
      res.status(500).json({ message: "Erreur lors de la resolution de l'alerte" });
    }
  });


  /**
   * POST /api/clients/:id/alerts/resolve-all
   * Resolve all active alerts for a client at once
   */
  app.post("/api/clients/:id/alerts/resolve-all", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.CLIENT), requireAgenceIdAccess(), async (req, res) => {
    try {
      if (!z.string().uuid().safeParse(req.params.id).success) {
        return res.status(404).json({ message: "Client not found (Invalid ID)" });
      }

      const client = await storage.getClient(req.params.id);
      if (!client) return res.status(404).json({ message: "Client not found" });

      const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
      if (agenceFilter?.agenceId && client.agenceId !== agenceFilter.agenceId) {
        return res.status(403).json({ message: "Acces refuse : client d'une autre agence" });
      }

      const alertTypes: string[] = Array.isArray(req.body?.alertTypes) ? req.body.alertTypes : [];
      if (alertTypes.length === 0) {
        return res.status(400).json({ message: "Aucun type d'alerte fourni" });
      }

      const user = req.session.user;
      const resolvedByName = user ? `${user.prenom || ""} ${user.nom || ""}`.trim() || undefined : undefined;

      const success = await resolveAllClientAlerts(
        req.params.id,
        alertTypes,
        user?.id,
        resolvedByName
      );

      if (!success) {
        return res.status(500).json({ message: "Erreur resolution des alertes" });
      }

      await logAudit(
        req,
        "RESOLVE_ALL_CLIENT_ALERTS",
        "client",
        req.params.id,
        { alertTypes },
        "success",
        "low"
      );

      const wsServer = await import("../../ws-server");
      const wsInstance = wsServer.getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "CLIENT_UPDATE",
          payload: { clientId: req.params.id, alertsChanged: true },
        });
      }

      res.json({ success: true, resolvedCount: alertTypes.length });
    } catch (error) {
      logger.error({ err: error }, 'Error resolving all client alerts');
      res.status(500).json({ message: "Erreur lors de la resolution des alertes" });
    }
  });


  /**
   * POST /api/clients/:id/alerts/:alertType/snooze
   * Snooze a specific alert type for 7 days (configurable)
   */
  app.post("/api/clients/:id/alerts/:alertType/snooze", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.CLIENT), requireAgenceIdAccess(), async (req, res) => {
    try {
      if (!z.string().uuid().safeParse(req.params.id).success) {
        return res.status(404).json({ message: "Client not found (Invalid ID)" });
      }

      const client = await storage.getClient(req.params.id);
      if (!client) return res.status(404).json({ message: "Client not found" });

      const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
      if (agenceFilter?.agenceId && client.agenceId !== agenceFilter.agenceId) {
        return res.status(403).json({ message: "Acces refuse : client d'une autre agence" });
      }

      if (!(KNOWN_ALERT_TYPES as readonly string[]).includes(req.params.alertType)) {
        return res.status(400).json({ message: `Type d'alerte inconnu: ${req.params.alertType}` });
      }

      const user = req.session.user;
      const snoozedByName = user ? `${user.prenom || ""} ${user.nom || ""}`.trim() || undefined : undefined;

      const success = await snoozeClientAlert(
        req.params.id,
        req.params.alertType,
        user?.id,
        snoozedByName
      );

      if (!success) {
        return res.status(500).json({ message: "Erreur mise en veille alerte" });
      }

      await logAudit(
        req,
        "SNOOZE_CLIENT_ALERT",
        "client",
        req.params.id,
        { alertType: req.params.alertType },
        "success",
        "low"
      );

      const wsServer = await import("../../ws-server");
      const wsInstance = wsServer.getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "CLIENT_UPDATE",
          payload: { clientId: req.params.id, alertsChanged: true },
        });
      }

      res.json({ success: true, snoozedType: req.params.alertType });
    } catch (error) {
      logger.error({ err: error }, 'Error snoozing client alert');
      res.status(500).json({ message: "Erreur lors de la mise en veille de l'alerte" });
    }
  });
}
