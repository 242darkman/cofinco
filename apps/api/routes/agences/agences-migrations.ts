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


export function registerAgencesMigrationsRoutes(app: Express) {
  app.post("/api/agences/:id/migrations", attachAbility, requireAbility(Actions.MANAGE, Subjects.AGENCE), async (req, res) => {
    try {
      const { id } = req.params;
      const {
        targetAgenceClients,
        targetAgenceEmployes,
        targetAgenceCoffre,
        scheduledAt
      } = req.body;
      const userId = req.session?.userId;

      // Vérifier que l'agence source existe et est active
      const [sourceAgence] = await db
        .select()
        .from(agences)
        .where(eq(agences.id, id));

      if (!sourceAgence) {
        return res.status(404).json({ error: "Agence source non trouvée" });
      }

      if (sourceAgence.statut === StatutAgence.CLOSED) {
        return res.status(400).json({ error: "Cette agence est déjà fermée" });
      }

      // Créer la migration
      const migration = await agencyMigrationService.createMigration({
        sourceAgencyId: id,
        targetClientsAgencyId: targetAgenceClients,
        targetEmployeesAgencyId: targetAgenceEmployes,
        targetTreasuryAgencyId: targetAgenceCoffre,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        createdBy: userId
      });

      await logAudit(req, "MIGRATE_CREATE", "agences", id, { migrationId: migration.id, reference: migration.reference });

      res.status(201).json(migration);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur POST /api/agences/:id/migrations');
      if (error instanceof MigrationError) {
        return res.status(400).json({ error: error.message, code: error.code, details: error.details });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/agences/migrations/:id/dry-run - Simulation de migration
  app.post("/api/agences/migrations/:id/dry-run", attachAbility, requireAbility(Actions.MANAGE, Subjects.AGENCE), async (req, res) => {
    try {
      const { id } = req.params;

      const result = await agencyMigrationService.runDryRun(id);

      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur POST /api/agences/migrations/:id/dry-run');
      if (error instanceof MigrationError) {
        return res.status(400).json({ error: error.message, code: error.code });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/agences/migrations/:id/submit - Soumettre pour exécution
  app.post("/api/agences/migrations/:id/submit", attachAbility, requireAbility(Actions.MANAGE, Subjects.AGENCE), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session?.userId;

      await agencyMigrationService.submitMigration(id, userId);

      const migration = await agencyMigrationService.getMigrationStatus(id);

      await logAudit(req, "MIGRATE_SUBMIT", "agency_migrations", id, { status: migration?.statut });

      res.json(migration);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur POST /api/agences/migrations/:id/submit');
      if (error instanceof MigrationError) {
        return res.status(400).json({ error: error.message, code: error.code });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/agences/migrations/:id/execute - Exécuter immédiatement
  app.post("/api/agences/migrations/:id/execute", attachAbility, requireAbility(Actions.MANAGE, Subjects.AGENCE), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session?.userId;
      const ipAddress = req.ip;
      const userAgent = req.get("User-Agent");

      // Vérifier le statut
      const migration = await agencyMigrationService.getMigrationStatus(id);
      if (!migration) {
        return res.status(404).json({ error: "Migration non trouvée" });
      }

      const executableStatuses = [MIGRATION_STATUS.PENDING, MIGRATION_STATUS.SCHEDULED, MIGRATION_STATUS.FAILED] as const;
      if (!executableStatuses.includes(migration.statut as typeof executableStatuses[number])) {
        return res.status(400).json({
          error: `La migration ne peut pas être exécutée (statut actuel: ${migration.statut})`,
          code: "INVALID_STATUS"
        });
      }

      // Lancer l'exécution en arrière-plan
      agencyMigrationService.processMigration(id, { userId, ipAddress, userAgent }).catch(err => {
        logger.error({ err }, 'Background Migration Failed');
      });

      await logAudit(req, "MIGRATE_EXECUTE", "agency_migrations", id, {});

      res.json({ message: "Migration démarrée", migrationId: id });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur POST /api/agences/migrations/:id/execute');
      if (error instanceof MigrationError) {
        return res.status(400).json({ error: error.message, code: error.code });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/agences/migrations/:id/cancel - Annuler une migration
  app.post("/api/agences/migrations/:id/cancel", attachAbility, requireAbility(Actions.MANAGE, Subjects.AGENCE), async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const userId = req.session?.userId;

      await agencyMigrationService.cancelMigration(id, reason || "Annulée par l'administrateur", userId);

      const migration = await agencyMigrationService.getMigrationStatus(id);

      await logAudit(req, "MIGRATE_CANCEL", "agency_migrations", id, { reason });

      res.json(migration);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur POST /api/agences/migrations/:id/cancel');
      if (error instanceof MigrationError) {
        return res.status(400).json({ error: error.message, code: error.code });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/agences/migrations/:id/rollback - Rollback d'une migration complétée
  app.post("/api/agences/migrations/:id/rollback", attachAbility, requireAbility(Actions.MANAGE, Subjects.AGENCE), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session?.userId;
      const ipAddress = req.ip;

      const result = await agencyMigrationService.rollbackMigration(id, { userId, ipAddress });

      await logAudit(req, "MIGRATE_ROLLBACK", "agency_migrations", id, { report: result.report });

      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur POST /api/agences/migrations/:id/rollback');
      if (error instanceof MigrationError) {
        const status = error.code === "NOT_FOUND" ? 404 : error.code === "ROLLBACK_EXPIRED" ? 410 : 400;
        return res.status(status).json({ error: error.message, code: error.code, details: error.details });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/agences/migrations/:id/status - Statut de migration
  app.get("/api/agences/migrations/:id/status", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      const migration = await agencyMigrationService.getMigrationStatus(id);

      if (!migration) {
        return res.status(404).json({ error: "Migration non trouvée" });
      }

      res.json(migration);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur GET /api/agences/migrations/:id/status');
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/agences/migrations/:id/pre-flight-checks - Résultats des vérifications
  app.get("/api/agences/migrations/:id/pre-flight-checks", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      const checks = await agencyMigrationService.getMigrationPreFlightChecks(id);

      res.json(checks);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur GET /api/agences/migrations/:id/pre-flight-checks');
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/agences/migrations/:id/audit-logs - Logs d'audit
  app.get("/api/agences/migrations/:id/audit-logs", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      const logs = await agencyMigrationService.getMigrationAuditLogs(id);

      res.json(logs);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur GET /api/agences/migrations/:id/audit-logs');
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/agences/migrations/:id/entities - Entités migrées
  app.get("/api/agences/migrations/:id/entities", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { type } = req.query;

      const entities = await agencyMigrationService.getMigrationEntityLogs(id, type as string | undefined);

      res.json(entities);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur GET /api/agences/migrations/:id/entities');
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/agences/migrations/:id/report - Télécharger le rapport
  app.get("/api/agences/migrations/:id/report", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      const migration = await agencyMigrationService.getMigrationStatus(id);

      if (!migration) {
        return res.status(404).json({ error: "Migration non trouvée" });
      }

      if (!migration.report) {
        return res.status(400).json({ error: "Aucun rapport disponible pour cette migration" });
      }

      // Retourner le rapport JSON (peut être transformé en PDF côté client ou via un service dédié)
      res.json({
        reference: migration.reference,
        sourceAgencyId: migration.sourceAgencyId,
        status: migration.statut,
        report: migration.report,
        completedAt: migration.completedAt
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur GET /api/agences/migrations/:id/report');
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/agences/:id/migrations - Liste des migrations d'une agence
  app.get("/api/agences/:id/migrations", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      const migrations = await db
        .select()
        .from(agencyMigrations)
        .where(eq(agencyMigrations.sourceAgencyId, id))
        .orderBy(desc(agencyMigrations.createdAt));

      res.json(migrations);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur GET /api/agences/:id/migrations');
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // LEGACY ROUTE (Backward Compatibility)
  // ============================================

  // POST /api/agences/:id/migrate - Ancienne route (redirige vers la nouvelle)
  app.post("/api/agences/:id/migrate", attachAbility, requireAbility(Actions.MANAGE, Subjects.AGENCE), async (req, res) => {
    try {
      const { id } = req.params;
      const { targetAgenceClients, targetAgenceEmployes, targetAgenceCoffre } = req.body;
      const userId = req.session?.userId;

      // Créer la migration
      const migration = await agencyMigrationService.createMigration({
        sourceAgencyId: id,
        targetClientsAgencyId: targetAgenceClients,
        targetEmployeesAgencyId: targetAgenceEmployes,
        targetTreasuryAgencyId: targetAgenceCoffre,
        createdBy: userId
      });

      // Soumettre immédiatement
      await agencyMigrationService.submitMigration(migration.id, userId);

      // Lancer l'exécution
      agencyMigrationService.processMigration(migration.id, { userId }).catch((err: any) => {
        logger.error({ err }, 'Background Migration Failed');
      });

      await logAudit(req, "MIGRATE", "agences", id, { migrationId: migration.id });

      res.status(201).json(migration);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur POST /api/agences/:id/migrate');
      if (error instanceof MigrationError) {
        return res.status(400).json({ error: error.message, code: error.code, details: error.details });
      }
      res.status(500).json({ error: error.message });
    }
  });
}
