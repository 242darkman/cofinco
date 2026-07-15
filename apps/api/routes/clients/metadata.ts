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

export function registerClientMetadataRoutes(app: Express) {


  // Client Tags
  app.get("/api/clients/:id/tags", requireAuth, attachAbility, async (req, res) => {
      if (!(await verifyClientAccess(req, req.params.id))) {
        return res.status(403).json({ message: "Accès non autorisé à ce client" });
      }
      const tags = await getClientTags(req.params.id);
      res.json(tags);
  });


  app.post("/api/clients/:id/tags", requireAuth, attachAbility, async (req, res) => {
     if (!(await verifyClientAccess(req, req.params.id))) {
       return res.status(403).json({ message: "Accès non autorisé à ce client" });
     }
     const ct = await addClientTag({ ...req.body, clientId: req.params.id });
     res.json(ct);
  });


  app.delete("/api/clients/:id/tags/:tagId", requireAuth, attachAbility, async (req, res) => {
     if (!(await verifyClientAccess(req, req.params.id))) {
       return res.status(403).json({ message: "Accès non autorisé à ce client" });
     }
     await removeClientTag(req.params.id, req.params.tagId);
     res.sendStatus(200);
  });


  // Tags global
  app.get("/api/tags", requireAuth, async (req, res) => {
      const tags = await getAllTags();
      res.json(tags);
  });


  app.post("/api/tags", requireAuth, async (req, res) => {
      const tag = await createTag(req.body);
      res.json(tag);
  });


  app.delete("/api/tags/:id", requireAuth, async (req, res) => {
      await deleteTag(req.params.id);
      res.sendStatus(200);
  });


  // Client Activities
  app.get("/api/clients/:id/activities", requireAuth, attachAbility, async (req, res) => {
      if (!(await verifyClientAccess(req, req.params.id))) {
        return res.status(403).json({ message: "Accès non autorisé à ce client" });
      }
      const acts = await getClientActivities(req.params.id);
      res.json(acts);
  });


  app.post("/api/clients/:id/activities", requireAuth, attachAbility, async (req, res) => {
      if (!(await verifyClientAccess(req, req.params.id))) {
        return res.status(403).json({ message: "Accès non autorisé à ce client" });
      }
      const act = await logClientActivity({ ...req.body, clientId: req.params.id, userId: req.session.user!.id });
      res.json(act);
  });
}
