import { Express } from "express";
import { createLogger } from "../../lib/logger";
import { db } from "../../db";

const logger = createLogger('Routes:Agences');
import { agences, userAgences, users, coffresForts, comptesLiaison, userRoles } from "@shared/schema";
import { employes } from "@shared/schema/employes";
import { clients } from "@shared/schema/clients";
import { eq, and, ilike, or, desc, asc, sql, ne, isNull } from "drizzle-orm";
import { villes } from "@shared/schema/operations";
import { regions } from "@shared/schema/geography";
import { pays as paysTable } from "@shared/schema/pays";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { logAudit } from "../../audit";
import * as coffresQueries from "../../services/transfert-inter-coffres/coffres-queries";
import * as coffresOperations from "../../services/transfert-inter-coffres/coffres-operations";
import * as coffresCreation from "../../services/transfert-inter-coffres/coffres-creation";
import {
  agencyMigrations,
  migrationPreFlightChecks,
  migrationAuditLogs,
  migrationEntityLogs,
  MIGRATION_STATUS
} from "@shared/schema/agency_migration";
import { agencyMigrationService, MigrationError } from "../../services/agency-migration";
import { getWsInstance } from "../../ws-server";
import { TypeAgence, StatutAgence, AGENCY_STATUS_TRANSITIONS, StatutUser, StatutClient } from "@shared/enum/status-constants";
import { agencyStatusHistory } from "@shared/schema/agences";
import { getAgencyActivationChecklist } from "../../services/agency-checklist";
import { currencyCode } from "@shared/config/currency";
import { normalizePhone } from "@shared/utils/phone";


export function registerAgencesLifecycleRoutes(app: Express) {
  // Helper: validate transition
  function isValidTransition(from: string, to: string): boolean {
    const allowed = AGENCY_STATUS_TRANSITIONS[from as keyof typeof AGENCY_STATUS_TRANSITIONS];
    return Array.isArray(allowed) && allowed.includes(to as any);
  }

  app.post("/api/agences/:id/submit", attachAbility, requireAbility(Actions.EDIT, Subjects.AGENCE), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session?.userId;
      const { comment } = req.body || {};

      const [agency] = await db.select().from(agences).where(eq(agences.id, id));
      if (!agency) return res.status(404).json({ error: "Agence non trouvée" });
      if (!isValidTransition(agency.statut, StatutAgence.PENDING_APPROVAL)) {
        return res.status(400).json({
          error: `Transition invalide: ${agency.statut} → PENDING_APPROVAL`,
          currentStatus: agency.statut,
        });
      }

      // Basic data completeness check
      const missing: string[] = [];
      if (!agency.codeAgence) missing.push("Code agence");
      if (!agency.nom) missing.push("Nom");
      if (!agency.typeAgence) missing.push("Type d'agence");
      if (!agency.villeId) missing.push("Ville");
      if (missing.length > 0) {
        return res.status(400).json({
          error: "Données incomplètes pour la soumission",
          missingFields: missing,
        });
      }

      await db.transaction(async (tx) => {
        await tx.update(agences)
          .set({ statut: StatutAgence.PENDING_APPROVAL, updatedAt: new Date() })
          .where(eq(agences.id, id));

        await tx.insert(agencyStatusHistory).values({
          agenceId: id,
          fromStatus: agency.statut,
          toStatus: StatutAgence.PENDING_APPROVAL,
          changedBy: userId!,
          reason: comment || null,
        });
      });

      await logAudit(req, "SUBMIT_APPROVAL", "agences", id, {
        fromStatus: agency.statut,
        toStatus: StatutAgence.PENDING_APPROVAL,
        comment,
      });

      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({ type: "AGENCE_UPDATE", payload: { type: 'agence_submitted', id } });
      }

      res.json({ message: "Agence soumise pour validation", status: StatutAgence.PENDING_APPROVAL });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur POST /api/agences/:id/submit');
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/agences/:id/activate - Activate agency (PENDING_APPROVAL → ACTIVE or SUSPENDED → ACTIVE)
  app.post("/api/agences/:id/activate", attachAbility, requireAbility(Actions.APPROVE, Subjects.AGENCE), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session?.userId;

      const [agency] = await db.select().from(agences).where(eq(agences.id, id));
      if (!agency) return res.status(404).json({ error: "Agence non trouvée" });

      // Allow activation from PENDING_APPROVAL or reactivation from SUSPENDED
      const targetStatus = StatutAgence.ACTIVE;
      if (!isValidTransition(agency.statut, targetStatus)) {
        return res.status(400).json({
          error: `Transition invalide: ${agency.statut} → ACTIVE`,
          currentStatus: agency.statut,
        });
      }

      // Run full checklist
      const checklist = await getAgencyActivationChecklist(id);
      if (!checklist.ready) {
        const failedItems = checklist.items.filter(i => i.required && !i.passed);
        return res.status(400).json({
          error: "La checklist d'activation n'est pas complète",
          checklist,
          failedItems: failedItems.map(i => ({
            key: i.key,
            label: i.label,
            details: i.details,
          })),
        });
      }

      await db.transaction(async (tx) => {
        await tx.update(agences)
          .set({
            statut: targetStatus,
            activatedAt: new Date(),
            activatedBy: userId!,
            suspendedAt: null,
            suspendedReason: null,
            updatedAt: new Date(),
          })
          .where(eq(agences.id, id));

        await tx.insert(agencyStatusHistory).values({
          agenceId: id,
          fromStatus: agency.statut,
          toStatus: targetStatus,
          changedBy: userId!,
          checklistSnapshot: checklist,
        });
      });

      await logAudit(req, "ACTIVATE", "agences", id, {
        fromStatus: agency.statut,
        toStatus: targetStatus,
        checklistSnapshot: checklist,
      }, "success", "high");

      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({ type: "AGENCE_UPDATE", payload: { type: 'agence_activated', id } });
      }

      res.json({ message: "Agence activée avec succès", status: targetStatus });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur POST /api/agences/:id/activate');
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/agences/:id/reject - Reject and send back to draft (PENDING_APPROVAL → DRAFT)
  app.post("/api/agences/:id/reject", attachAbility, requireAbility(Actions.APPROVE, Subjects.AGENCE), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session?.userId;
      const { reason } = req.body || {};

      if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
        return res.status(400).json({ error: "Une raison est obligatoire pour le rejet" });
      }

      const [agency] = await db.select().from(agences).where(eq(agences.id, id));
      if (!agency) return res.status(404).json({ error: "Agence non trouvée" });
      if (agency.statut !== StatutAgence.PENDING_APPROVAL) {
        return res.status(400).json({
          error: `Seule une agence en attente de validation peut être rejetée (statut actuel: ${agency.statut})`,
          currentStatus: agency.statut,
        });
      }

      await db.transaction(async (tx) => {
        await tx.update(agences)
          .set({ statut: StatutAgence.DRAFT, updatedAt: new Date() })
          .where(eq(agences.id, id));

        await tx.insert(agencyStatusHistory).values({
          agenceId: id,
          fromStatus: StatutAgence.PENDING_APPROVAL,
          toStatus: StatutAgence.DRAFT,
          changedBy: userId!,
          reason: reason.trim(),
        });
      });

      await logAudit(req, "REJECT", "agences", id, {
        fromStatus: StatutAgence.PENDING_APPROVAL,
        toStatus: StatutAgence.DRAFT,
        reason: reason.trim(),
      });

      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({ type: "AGENCE_UPDATE", payload: { type: 'agence_rejected', id } });
      }

      res.json({ message: "Agence renvoyée en brouillon", status: StatutAgence.DRAFT });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur POST /api/agences/:id/reject');
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/agences/:id/suspend - Suspend agency (ACTIVE → SUSPENDED)
  app.post("/api/agences/:id/suspend", attachAbility, requireAbility(Actions.SUSPEND, Subjects.AGENCE), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session?.userId;
      const { reason } = req.body || {};

      if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
        return res.status(400).json({ error: "Une raison est obligatoire pour la suspension" });
      }

      const [agency] = await db.select().from(agences).where(eq(agences.id, id));
      if (!agency) return res.status(404).json({ error: "Agence non trouvée" });
      if (!isValidTransition(agency.statut, StatutAgence.SUSPENDED)) {
        return res.status(400).json({
          error: `Transition invalide: ${agency.statut} → SUSPENDED`,
          currentStatus: agency.statut,
        });
      }

      await db.transaction(async (tx) => {
        await tx.update(agences)
          .set({
            statut: StatutAgence.SUSPENDED,
            suspendedAt: new Date(),
            suspendedReason: reason.trim(),
            updatedAt: new Date(),
          })
          .where(eq(agences.id, id));

        await tx.insert(agencyStatusHistory).values({
          agenceId: id,
          fromStatus: agency.statut,
          toStatus: StatutAgence.SUSPENDED,
          changedBy: userId!,
          reason: reason.trim(),
        });
      });

      await logAudit(req, "SUSPEND", "agences", id, {
        fromStatus: agency.statut,
        toStatus: StatutAgence.SUSPENDED,
        reason: reason.trim(),
      }, "success", "high");

      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({ type: "AGENCE_UPDATE", payload: { type: 'agence_suspended', id } });
      }

      res.json({ message: "Agence suspendue", status: StatutAgence.SUSPENDED });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur POST /api/agences/:id/suspend');
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/agences/:id/close - Close agency (ACTIVE → CLOSING_PENDING or CLOSING_PENDING → CLOSED)
  app.post("/api/agences/:id/close", attachAbility, requireAbility(Actions.MANAGE, Subjects.AGENCE), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session?.userId;
      const { reason } = req.body || {};

      if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
        return res.status(400).json({ error: "Une raison est obligatoire pour la clôture" });
      }

      const [agency] = await db.select().from(agences).where(eq(agences.id, id));
      if (!agency) return res.status(404).json({ error: "Agence non trouvée" });

      // Determine target: ACTIVE/SUSPENDED → CLOSING_PENDING, CLOSING_PENDING → CLOSED
      let targetStatus: string;
      if (agency.statut === StatutAgence.CLOSING_PENDING) {
        targetStatus = StatutAgence.CLOSED;
      } else if (isValidTransition(agency.statut, StatutAgence.CLOSING_PENDING)) {
        targetStatus = StatutAgence.CLOSING_PENDING;
      } else {
        return res.status(400).json({
          error: `Impossible de clôturer depuis le statut: ${agency.statut}`,
          currentStatus: agency.statut,
        });
      }

      // For final CLOSED: check no active clients/employees
      if (targetStatus === StatutAgence.CLOSED) {
        const [activeUsers] = await db
          .select({ count: sql<number>`count(*)` })
          .from(userAgences)
          .where(and(eq(userAgences.agenceId, id), eq(userAgences.actif, true)));

        if (Number(activeUsers?.count || 0) > 0) {
          return res.status(400).json({
            error: "Impossible de clôturer: des utilisateurs sont encore assignés à cette agence",
          });
        }
      }

      await db.transaction(async (tx) => {
        await tx.update(agences)
          .set({ statut: targetStatus, updatedAt: new Date() })
          .where(eq(agences.id, id));

        await tx.insert(agencyStatusHistory).values({
          agenceId: id,
          fromStatus: agency.statut,
          toStatus: targetStatus,
          changedBy: userId!,
          reason: reason.trim(),
        });
      });

      await logAudit(req, "CLOSE", "agences", id, {
        fromStatus: agency.statut,
        toStatus: targetStatus,
        reason: reason.trim(),
      }, "success", "high");

      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({ type: "AGENCE_UPDATE", payload: { type: 'agence_closed', id } });
      }

      res.json({ message: targetStatus === StatutAgence.CLOSED ? "Agence clôturée" : "Clôture initiée", status: targetStatus });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur POST /api/agences/:id/close');
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/agences/:id/checklist - Get activation checklist status
  app.get("/api/agences/:id/checklist", attachAbility, requireAbility(Actions.VIEW, Subjects.AGENCE), async (req, res) => {
    try {
      const { id } = req.params;

      const [agency] = await db.select({ id: agences.id }).from(agences).where(eq(agences.id, id));
      if (!agency) return res.status(404).json({ error: "Agence non trouvée" });

      const checklist = await getAgencyActivationChecklist(id);
      res.json(checklist);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur GET /api/agences/:id/checklist');
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/agences/:id/status-history - Get status transition history
  app.get("/api/agences/:id/status-history", attachAbility, requireAbility(Actions.VIEW, Subjects.AGENCE), async (req, res) => {
    try {
      const { id } = req.params;

      const history = await db
        .select({
          id: agencyStatusHistory.id,
          fromStatus: agencyStatusHistory.fromStatus,
          toStatus: agencyStatusHistory.toStatus,
          reason: agencyStatusHistory.reason,
          checklistSnapshot: agencyStatusHistory.checklistSnapshot,
          createdAt: agencyStatusHistory.createdAt,
          changedByName: sql<string>`COALESCE(${users.nom} || ' ' || COALESCE(${users.prenom}, ''), 'Système')`,
        })
        .from(agencyStatusHistory)
        .leftJoin(users, eq(agencyStatusHistory.changedBy, users.id))
        .where(eq(agencyStatusHistory.agenceId, id))
        .orderBy(desc(agencyStatusHistory.createdAt));

      res.json(history);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur GET /api/agences/:id/status-history');
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // AGENCY MIGRATION ROUTES (V2 - Production Ready)
  // ============================================

  // POST /api/agences/:id/migrations - Créer une nouvelle migration
}
