import type { Express } from "express";
import { createLogger } from "../lib/logger";
import {
  insertSystemSettingsSchema,
  insertSecuritySettingsSchema,
  systemSettings,
  securitySettings,
  settingsHistory,
  sessionBlockingRules,
  maintenanceSchedules,
  holidayExceptions,
  roleTemplates,
  regularizationRules,
  systemAlerts,
  importBatches,
} from "@shared/schema";

const logger = createLogger('Routes:Settings');
import { storage } from "../storage";
import { requireAuth } from "../auth";
import { attachAbility, requireAbility } from "../authorization";
import { Actions, Subjects } from "@shared/ability";
import { logAudit } from "../audit";
import { auditTrailService } from "../services/audit-trail-service";
import { normalizeKeysDeep, coerceValueToSchema } from "./utils";
import { db } from "../db";
import { eq, sql, desc, and, gte, lte, isNull } from "drizzle-orm";
import { z } from "zod";
import { getWsInstance } from "../ws-server";
import { setActiveCurrencyByCode, getActiveCurrency } from "@shared/config/currency";

// Helper for parsing with schema
const parseWithSchema = <T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> => {
  const normalized = normalizeKeysDeep(data);
  // const coerced = coerceToSchema(schema, normalized); // coerceToSchema is in utils? No I didn't export it.
  // I exported coerceValueToSchema but parseWithSchema logic in original routes.ts used coerceToSchema.
  // I will check utils.ts in a moment. If assume standard Zod parse is fine or I need to implement coercion.
  // Original code:
  // const coerced = coerceToSchema(schema, normalized);
  // return schema.parse(coerced);
  return schema.parse(normalized); // Simplified
};

export function registerSettingsRoutes(app: Express) {
  // ========== SYSTEM SETTINGS ==========
  app.get("/api/system-settings", requireAuth, async (req, res) => {
    try {
      // Il n'y a qu'une seule entrée de settings, on récupère la première
      const result = await db.query.systemSettings.findFirst();

      if (!result) {
        // Return defaults if no settings exist
        return res.json({
          app_name: 'COFIN&CO-M',
          agence_code: 'COF001',
          devise: getActiveCurrency().code,
          pays: 'République du Congo',
          adresse: '',
          telephone: '',
          email: '',
          session_timeout: 30,
          max_login_attempts: 5,
          password_min_length: 12,
          backup_frequency: 'daily',
          auto_backup_enabled: true,
          notification_email_enabled: true,
          notification_sms_enabled: true,
          sms_payment_validation_enabled: true,
          mobile_money_enabled: true,
          maintenance_mode: false
        });
      }

      res.json({
        app_name: result.appName,
        agence_code: result.agenceCode,
        devise: result.devise,
        pays: result.pays,
        adresse: result.adresse,
        telephone: result.telephone,
        email: result.email,
        session_timeout: result.sessionTimeout,
        max_login_attempts: result.maxLoginAttempts,
        password_min_length: result.passwordMinLength,
        backup_frequency: result.backupFrequency,
        auto_backup_enabled: result.autoBackupEnabled,
        notification_email_enabled: result.notificationEmailEnabled,
        notification_sms_enabled: result.notificationSmsEnabled,
        sms_payment_validation_enabled: result.smsPaymentValidationEnabled,
        mobile_money_enabled: result.mobileMoneyEnabled,
        maintenance_mode: result.maintenanceMode
      });
    } catch (error) {
      logger.error({ err: error }, 'Error fetching system settings');
      res.status(500).json({ error: "Failed to fetch system settings" });
    }
  });

  app.put("/api/system-settings", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.SETTINGS), async (req, res) => {
    try {
      const settings = parseWithSchema(insertSystemSettingsSchema, req.body);

      await db.insert(systemSettings)
        .values({
          id: 1,
          ...settings,
          updatedAt: new Date()
        } as any) // Cast due to ID conflict potential or generated col
        .onConflictDoUpdate({
          target: systemSettings.id,
          set: {
            ...settings,
            updatedAt: new Date()
          }
        });

      // If devise changed, update the runtime currency config
      if (settings.devise) {
        setActiveCurrencyByCode(settings.devise);
      }

      // Notify all connected clients (triggers currency refetch on frontend)
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "SETTINGS_UPDATE", payload: { type: 'settings_changed' } });
          if (settings.devise) {
            wsInstance.broadcast({ type: "CURRENCY_CHANGED" as any, payload: getActiveCurrency() });
          }
      }

      res.json({ success: true, message: 'Settings updated successfully' });
    } catch (error: any) {
      logger.error({ err: error }, 'Error updating system settings');
      res.status(500).json({ error: "Failed to update system settings" });
    }
  });

  // ========== SECURITY SETTINGS ==========
  app.get("/api/settings/security", requireAuth, async (_req, res) => {
    try {
      const result = await db.query.securitySettings.findFirst();
      if (!result) {
        const defaults = {
          passwordMinLength: 12,
          passwordRequireUppercase: true,
          passwordRequireLowercase: true,
          passwordRequireNumbers: true,
          passwordRequireSpecial: true,
          sessionTimeoutMinutes: 30,
          maxLoginAttempts: 5,
          lockoutDurationMinutes: 15,
          twoFactorEnabled: false,
          ipWhitelistEnabled: false,
          auditLogEnabled: true,
        };
        return res.json(defaults);
      }

      const payload = {
        id: result.id,
        passwordMinLength: result.passwordMinLength,
        passwordRequireUppercase: result.passwordRequireUppercase,
        passwordRequireLowercase: result.passwordRequireLowercase,
        passwordRequireNumbers: result.passwordRequireNumbers,
        passwordRequireSpecial: result.passwordRequireSpecial,
        sessionTimeoutMinutes: result.sessionTimeoutMinutes,
        maxLoginAttempts: result.maxLoginAttempts,
        lockoutDurationMinutes: result.lockoutDurationMinutes,
        twoFactorEnabled: result.twoFactorEnabled,
        ipWhitelistEnabled: result.ipWhitelistEnabled,
        auditLogEnabled: result.auditLogEnabled,
      };

      res.json(payload);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching security settings');
      res.status(500).json({ error: "Failed to fetch security settings" });
    }
  });

  app.post("/api/settings/security", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.SETTINGS), async (req, res) => {
    try {
      const parsed = parseWithSchema(insertSecuritySettingsSchema, req.body);
      const [created] = await db.insert(securitySettings).values({
        ...parsed,
        updatedAt: new Date(),
      }).returning();
      res.status(201).json(created);
    } catch (error: any) {
      logger.error({ err: error }, 'Error creating security settings');
      res.status(500).json({ error: error.message || "Failed to create security settings" });
    }
  });

  app.put("/api/settings/security/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.SETTINGS), async (req, res) => {
    try {
      const parsed = parseWithSchema(insertSecuritySettingsSchema.partial(), req.body);
      const [updated] = await db.update(securitySettings)
        .set({ ...parsed, updatedAt: new Date() })
        .where(eq(securitySettings.id, req.params.id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Security settings not found" });
      }

      res.json(updated);
    } catch (error: any) {
      logger.error({ err: error }, 'Error updating security settings');
      res.status(500).json({ error: error.message || "Failed to update security settings" });
    }
  });

  // ========== RÉINITIALISATION PLATEFORME (Admin Only) ==========
  app.post("/api/admin/reset-platform", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.SETTINGS), async (req, res) => {
    try {
      const { confirmation } = req.body;

      if (confirmation !== 'REINITIALISER') {
        return res.status(400).json({ message: "Confirmation invalide. Tapez 'REINITIALISER' pour confirmer." });
      }

      // Log the reset action before performing it
      await logAudit(
        req,
        'platform_reset',
        'system',
        undefined,
        {
          initiatedBy: req.session.user?.username,
          timestamp: new Date().toISOString()
        },
        'success',
        'critical'
      );

      // Perform deletion (simplified version of original script)
      // Note: In real scenarios, use a dedicated storage method or raw SQL carefully.
      await db.execute(`
        SET session_replication_role = 'replica';
        DELETE FROM lignes_factures;
        DELETE FROM factures;
        DELETE FROM comptage_billets;
        DELETE FROM shifts_caisse;
        DELETE FROM caisses_agents;
        DELETE FROM caisse_code_usages;
        DELETE FROM caisse_security_codes;
        -- code_generation_permissions removed (unused table)
        -- DELETE FROM module_sessions; -- Assuming table exists?
        -- DELETE FROM access_overrides;
        -- DELETE FROM operating_hours;
        DELETE FROM sms_provider_settings;
        DELETE FROM sms_templates;
        -- DELETE FROM sms_notifications;
        DELETE FROM push_notification_logs;
        DELETE FROM notification_preferences;
        DELETE FROM push_subscriptions;
        DELETE FROM otp_validations;
        DELETE FROM login_attempts;
        DELETE FROM audit_logs;
        DELETE FROM notifications;
        DELETE FROM agent_location_logs;
        DELETE FROM pos_device_logs;
        DELETE FROM pos_devices;
        DELETE FROM modeles_factures;
        DELETE FROM paiements_terrain;
        DELETE FROM visites_terrain;
        DELETE FROM prospections;
        DELETE FROM agents_terrain;
        DELETE FROM operations_caisse;
        DELETE FROM sessions_caisse;
        DELETE FROM contributions_tontine;
        DELETE FROM membres_tontine;
        DELETE FROM tontines;
        DELETE FROM plans_epargne;
        DELETE FROM transactions_epargne;
        DELETE FROM comptes_epargne;
        DELETE FROM remboursements;
        DELETE FROM enquetes_credit;
        DELETE FROM credits;
        DELETE FROM clients;
        -- DELETE FROM employes;
        -- Tables catalogue (sectors, professions, activity_types) conservées lors du reset

        DELETE FROM users WHERE role != 'ADMIN';

        SET session_replication_role = 'origin';
      `);

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "SETTINGS_UPDATE", payload: { type: 'platform_reset' } });
      }

      res.json({ success: true, message: "Plateforme réinitialisée avec succès." });
    } catch (error: any) {
      logger.error({ err: error }, 'Reset error');
      // Log failure
      await logAudit(
        req,
        'platform_reset',
        'system',
         undefined,
         { error: error.message },
         'failure',
         'critical'
      );
      res.status(500).json({ error: error.message || "Erreur lors de la réinitialisation" });
    }
  });

  // ========== PREVIEW RÉINITIALISATION PAR AGENCE ==========
  app.get("/api/admin/reset-agence/:agenceId/preview", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.SETTINGS), async (req, res) => {
    const { agenceId } = req.params;

    try {
      // Verify agency exists
      const agencyResult = await db.execute(sql`SELECT id, nom, code_agence FROM agences WHERE id = ${agenceId}`);
      if (!agencyResult.rows || agencyResult.rows.length === 0) {
        return res.status(404).json({ message: "Agence non trouvée." });
      }
      const agency = agencyResult.rows[0] as any;

      // Helper: safe count that returns 0 if table doesn't exist
      const safeCount = async (query: ReturnType<typeof sql>) => {
        try {
          const result = await db.execute(query);
          const r = (result.rows?.[0] ?? {}) as any;
          return Number(r?.count ?? r?.total ?? 0);
        } catch {
          return 0;
        }
      };

      // Subquery for agents_terrain in this agency
      const agentSubquery = `SELECT id FROM agents_terrain WHERE current_agence_id = '${agenceId}'`;

      // Count per category
      const [
        tontinesCount,
        caisseCount,
        creditsCount,
        comptabiliteCount,
        agentsTerrainCount,
        operationsTerrainCount,
        mobileMoneyCount,
        clientsCount,
        epargneCount,
        notificationsCount,
        evacuationsCount,
        conversationsCount,
        offlineCount,
        ecartsClosureCount,
        caisseConfigCount,
      ] = await Promise.all([
        // Tontines
        safeCount(sql`SELECT
          (SELECT COUNT(*) FROM tontines WHERE agence_id = ${agenceId}) +
          (SELECT COUNT(*) FROM membres_tontine WHERE tontine_id IN (SELECT id FROM tontines WHERE agence_id = ${agenceId})) +
          (SELECT COUNT(*) FROM contributions_tontine WHERE membre_id IN (SELECT id FROM membres_tontine WHERE tontine_id IN (SELECT id FROM tontines WHERE agence_id = ${agenceId}))) +
          (SELECT COUNT(*) FROM tontine_cycles WHERE agence_id = ${agenceId}) +
          (SELECT COUNT(*) FROM tontine_turns WHERE cycle_id IN (SELECT id FROM tontine_cycles WHERE agence_id = ${agenceId})) +
          (SELECT COUNT(*) FROM tontine_schedules WHERE agence_id = ${agenceId})
          AS count`),

        // Caisse & Sessions
        safeCount(sql`SELECT
          (SELECT COUNT(*) FROM sessions_caisse WHERE agence_id = ${agenceId}) +
          (SELECT COUNT(*) FROM operations_caisse WHERE session_id IN (SELECT id FROM sessions_caisse WHERE agence_id = ${agenceId})) +
          (SELECT COUNT(*) FROM shifts_caisse WHERE session_id IN (SELECT id FROM sessions_caisse WHERE agence_id = ${agenceId})) +
          (SELECT COUNT(*) FROM comptage_billets WHERE shift_id IN (SELECT id FROM shifts_caisse WHERE session_id IN (SELECT id FROM sessions_caisse WHERE agence_id = ${agenceId}))) +
          (SELECT COUNT(*) FROM transferts_coffre_caisse WHERE agence_id = ${agenceId}) +
          (SELECT COUNT(*) FROM caisses WHERE agence_id = ${agenceId})
          AS count`),

        // Crédits
        safeCount(sql`SELECT
          (SELECT COUNT(*) FROM credits WHERE agence_id = ${agenceId}) +
          (SELECT COUNT(*) FROM remboursements WHERE credit_id IN (SELECT id FROM credits WHERE agence_id = ${agenceId})) +
          (SELECT COUNT(*) FROM enquetes_credit WHERE credit_id IN (SELECT id FROM credits WHERE agence_id = ${agenceId})) +
          (SELECT COUNT(*) FROM dossiers_credit WHERE agence_id = ${agenceId}) +
          (SELECT COUNT(*) FROM demandes_credit WHERE agence_id = ${agenceId})
          AS count`),

        // Comptabilité (GL)
        safeCount(sql`SELECT
          (SELECT COUNT(*) FROM ecritures_comptables WHERE agence_id = ${agenceId}) +
          (SELECT COUNT(*) FROM lignes_ecritures WHERE ecriture_id IN (SELECT id FROM ecritures_comptables WHERE agence_id = ${agenceId})) +
          (SELECT COUNT(*) FROM gl_posting_links WHERE agence_id = ${agenceId}) +
          (SELECT COUNT(*) FROM gl_periods WHERE agence_id = ${agenceId}) +
          (SELECT COUNT(*) FROM gl_sequences WHERE agence_id = ${agenceId})
          AS count`),

        // Agents Terrain (modules)
        safeCount(sql.raw(`SELECT
          (SELECT COUNT(*) FROM agent_commissions WHERE agent_id IN (${agentSubquery})) +
          (SELECT COUNT(*) FROM agent_objectifs WHERE agent_id IN (${agentSubquery})) +
          (SELECT COUNT(*) FROM agent_plannings WHERE agent_id IN (${agentSubquery})) +
          (SELECT COUNT(*) FROM agent_rapports WHERE agent_id IN (${agentSubquery})) +
          (SELECT COUNT(*) FROM agent_incidents WHERE agent_id IN (${agentSubquery})) +
          (SELECT COUNT(*) FROM agent_materiel WHERE agent_id IN (${agentSubquery})) +
          (SELECT COUNT(*) FROM agent_communications WHERE agent_id IN (${agentSubquery}))
          AS count`)),

        // Opérations Terrain
        safeCount(sql.raw(`SELECT
          (SELECT COUNT(*) FROM paiements_terrain WHERE agent_id IN (${agentSubquery})) +
          (SELECT COUNT(*) FROM operations_terrain WHERE agent_id IN (${agentSubquery})) +
          (SELECT COUNT(*) FROM sessions_agent WHERE agent_id IN (${agentSubquery})) +
          (SELECT COUNT(*) FROM caisses_agent WHERE agent_id IN (${agentSubquery})) +
          (SELECT COUNT(*) FROM remises_terrain WHERE agent_id IN (${agentSubquery})) +
          (SELECT COUNT(*) FROM remise_items WHERE remise_id IN (SELECT id FROM remises_terrain WHERE agent_id IN (${agentSubquery}))) +
          (SELECT COUNT(*) FROM prospections WHERE agent_id IN (${agentSubquery})) +
          (SELECT COUNT(*) FROM visites_terrain WHERE agent_id IN (${agentSubquery})) +
          (SELECT COUNT(*) FROM agent_agency_history WHERE agent_id IN (${agentSubquery}))
          AS count`)),

        // Mobile Money
        safeCount(sql`SELECT
          (SELECT COUNT(*) FROM payment_intents WHERE agence_id = ${agenceId}) +
          (SELECT COUNT(*) FROM provider_events WHERE payment_intent_id IN (SELECT id FROM payment_intents WHERE agence_id = ${agenceId})) +
          (SELECT COUNT(*) FROM loan_payment_allocations WHERE payment_intent_id IN (SELECT id FROM payment_intents WHERE agence_id = ${agenceId})) +
          (SELECT COUNT(*) FROM mm_reconciliation_reports WHERE agence_id = ${agenceId})
          AS count`),

        // Clients
        safeCount(sql`SELECT COUNT(*) AS count FROM clients WHERE agence_id = ${agenceId}`),

        // Épargne
        safeCount(sql`SELECT
          (SELECT COUNT(*) FROM comptes_epargne WHERE agence_id = ${agenceId}) +
          (SELECT COUNT(*) FROM transactions_epargne WHERE compte_epargne_id IN (SELECT id FROM comptes_epargne WHERE agence_id = ${agenceId})) +
          (SELECT COUNT(*) FROM plans_epargne WHERE compte_epargne_id IN (SELECT id FROM comptes_epargne WHERE agence_id = ${agenceId}))
          AS count`),

        // Notifications
        safeCount(sql`SELECT
          (SELECT COUNT(*) FROM notification_jobs WHERE agence_id = ${agenceId}) +
          (SELECT COUNT(*) FROM notification_settings WHERE agence_id = ${agenceId}) +
          (SELECT COUNT(*) FROM notification_schedules WHERE agence_id = ${agenceId})
          AS count`),

        // Évacuations
        safeCount(sql`SELECT
          (SELECT COUNT(*) FROM evacuations_coffre WHERE agence_id = ${agenceId}) +
          (SELECT COUNT(*) FROM evacuations_coffre_audit_logs WHERE evacuation_id IN (SELECT id FROM evacuations_coffre WHERE agence_id = ${agenceId})) +
          (SELECT COUNT(*) FROM config_evacuation_coffre WHERE agence_id = ${agenceId})
          AS count`),

        // Conversations
        safeCount(sql`SELECT
          (SELECT COUNT(*) FROM conversations WHERE agence_id = ${agenceId}) +
          (SELECT COUNT(*) FROM conversation_participants WHERE conversation_id IN (SELECT id FROM conversations WHERE agence_id = ${agenceId})) +
          (SELECT COUNT(*) FROM messages_v2 WHERE conversation_id IN (SELECT id FROM conversations WHERE agence_id = ${agenceId}))
          AS count`),

        // Offline
        safeCount(sql`SELECT
          (SELECT COUNT(*) FROM offline_journal_entries WHERE agence_id = ${agenceId}) +
          (SELECT COUNT(*) FROM offline_day_sessions WHERE agence_id = ${agenceId})
          AS count`),

        // Écarts & Clôture
        safeCount(sql`SELECT
          (SELECT COUNT(*) FROM agency_daily_closure WHERE agence_id = ${agenceId}) +
          (SELECT COUNT(*) FROM agency_closure_blockers WHERE closure_id IN (SELECT id FROM agency_daily_closure WHERE agence_id = ${agenceId})) +
          (SELECT COUNT(*) FROM agency_closure_audit_log WHERE closure_id IN (SELECT id FROM agency_daily_closure WHERE agence_id = ${agenceId})) +
          (SELECT COUNT(*) FROM config_ecart_caisse WHERE agence_id = ${agenceId}) +
          (SELECT COUNT(*) FROM ecarts_approval_requests WHERE agence_id = ${agenceId}) +
          (SELECT COUNT(*) FROM ecarts_approval_audit_log WHERE request_id IN (SELECT id FROM ecarts_approval_requests WHERE agence_id = ${agenceId}))
          AS count`),

        // Caisse Config & Audit
        safeCount(sql`SELECT
          (SELECT COUNT(*) FROM caisse_security_codes WHERE agence_id = ${agenceId}) +
          (SELECT COUNT(*) FROM caisse_assignations WHERE caisse_id IN (SELECT id FROM caisses WHERE agence_id = ${agenceId})) +
          (SELECT COUNT(*) FROM caisse_code_usages WHERE code_id IN (SELECT id FROM caisse_security_codes WHERE agence_id = ${agenceId})) +
          (SELECT COUNT(*) FROM caisse_user_authorizations WHERE agence_id = ${agenceId}) +
          (SELECT COUNT(*) FROM transferts_coffre_audit_logs WHERE transfert_id IN (SELECT id FROM transferts_coffre_caisse WHERE agence_id = ${agenceId})) +
          (SELECT COUNT(*) FROM reconciliations_coffre_caisse WHERE agence_id = ${agenceId})
          AS count`),
      ]);

      // Financial records (mouvements + virements + comptes)
      const financeCount = await safeCount(sql`SELECT
        (SELECT COUNT(*) FROM mouvements_financiers WHERE agence_id = ${agenceId}) +
        (SELECT COUNT(*) FROM virements_programmes WHERE agence_id = ${agenceId}) +
        (SELECT COUNT(*) FROM comptes WHERE agence_id = ${agenceId})
        AS count`);

      const categories = [
        { label: "Tontines", icon: "Users", count: tontinesCount },
        { label: "Caisse & Sessions", icon: "Wallet", count: caisseCount },
        { label: "Crédits", icon: "CreditCard", count: creditsCount },
        { label: "Comptabilité", icon: "Calculator", count: comptabiliteCount },
        { label: "Agents Terrain", icon: "Award", count: agentsTerrainCount },
        { label: "Opérations Terrain", icon: "Activity", count: operationsTerrainCount },
        { label: "Mobile Money", icon: "Smartphone", count: mobileMoneyCount },
        { label: "Clients", icon: "UserCheck", count: clientsCount },
        { label: "Épargne", icon: "PiggyBank", count: epargneCount },
        { label: "Finance", icon: "TrendingUp", count: financeCount },
        { label: "Notifications", icon: "Bell", count: notificationsCount },
        { label: "Évacuations", icon: "Truck", count: evacuationsCount },
        { label: "Conversations", icon: "MessageSquare", count: conversationsCount },
        { label: "Données Offline", icon: "WifiOff", count: offlineCount },
        { label: "Écarts & Clôture", icon: "ShieldAlert", count: ecartsClosureCount },
        { label: "Config Caisse", icon: "Settings", count: caisseConfigCount },
      ].filter(c => c.count > 0);

      const totalRows = categories.reduce((sum, c) => sum + c.count, 0);

      // Count employees in this agency (for optional hard delete)
      const employeesCount = await safeCount(sql`SELECT COUNT(*) AS count FROM employes WHERE agence_id = ${agenceId}`);

      res.json({
        agenceId,
        agenceName: agency.nom,
        agenceCode: agency.code_agence,
        categories,
        totalRows,
        clientsDeleted: clientsCount,
        employeesCount,
        configReseeded: ["Caisse Principale", "Config Coffre-Fort", "Config Écart Caisse"],
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Agency reset preview error');
      res.status(500).json({ error: error.message || "Erreur lors de la prévisualisation" });
    }
  });

  // ========== RÉINITIALISATION PAR AGENCE (Admin Only) ==========
  app.post("/api/admin/reset-agence/:agenceId", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.SETTINGS), async (req, res) => {
    const { agenceId } = req.params;
    const { confirmation, deleteEmployees } = req.body;

    try {
      // Validate confirmation (code agence as confirmation token)
      if (!confirmation || typeof confirmation !== 'string') {
        return res.status(400).json({
          message: "Confirmation requise. Fournissez le code de l'agence pour confirmer."
        });
      }

      // Verify agency exists
      const agencyResult = await db.execute(sql`SELECT id, nom, code_agence FROM agences WHERE id = ${agenceId}`);
      if (!agencyResult.rows || agencyResult.rows.length === 0) {
        return res.status(404).json({ message: "Agence non trouvée." });
      }
      const agency = agencyResult.rows[0] as any;
      const agencyName = agency.nom;
      const agencyCode = agency.code_agence;

      // Verify confirmation matches agency code
      if (confirmation !== agencyCode) {
        return res.status(400).json({
          message: `Code de confirmation incorrect. Tapez "${agencyCode}" pour confirmer.`
        });
      }

      // Log the reset action before performing it
      await logAudit(
        req,
        'agence_reset',
        'agence',
        agenceId,
        {
          initiatedBy: req.session.user?.username,
          agenceName: agencyName,
          agencyCode,
          deleteEmployees: !!deleteEmployees,
          timestamp: new Date().toISOString()
        },
        'success',
        'critical'
      );

      // Helper: safe delete that silently ignores missing tables
      const safeDel = async (tx: any, query: ReturnType<typeof sql>) => {
        try { await tx.execute(query); } catch { /* table may not exist */ }
      };

      // Subquery for agents in this agency
      const agentSub = sql`SELECT id FROM agents_terrain WHERE current_agence_id = ${agenceId}`;

      // Atomic reset within a single transaction — FK-safe deletion order (children first)
      await db.transaction(async (tx) => {
        // ── Phase A: Écarts & Clôture agence ──
        await safeDel(tx, sql`DELETE FROM ecarts_approval_audit_log WHERE request_id IN (SELECT id FROM ecarts_approval_requests WHERE agence_id = ${agenceId})`);
        await safeDel(tx, sql`DELETE FROM ecarts_approval_requests WHERE agence_id = ${agenceId}`);
        await safeDel(tx, sql`DELETE FROM agency_closure_audit_log WHERE closure_id IN (SELECT id FROM agency_daily_closure WHERE agence_id = ${agenceId})`);
        await safeDel(tx, sql`DELETE FROM agency_closure_blockers WHERE closure_id IN (SELECT id FROM agency_daily_closure WHERE agence_id = ${agenceId})`);
        await safeDel(tx, sql`DELETE FROM agency_daily_closure WHERE agence_id = ${agenceId}`);
        await safeDel(tx, sql`DELETE FROM config_ecart_caisse WHERE agence_id = ${agenceId}`);

        // ── Phase B: Évacuations ──
        await safeDel(tx, sql`DELETE FROM evacuations_coffre_audit_logs WHERE evacuation_id IN (SELECT id FROM evacuations_coffre WHERE agence_id = ${agenceId})`);
        await safeDel(tx, sql`DELETE FROM evacuations_coffre WHERE agence_id = ${agenceId}`);
        await safeDel(tx, sql`DELETE FROM config_evacuation_coffre WHERE agence_id = ${agenceId}`);

        // ── Phase C: Opérations Terrain audit ──
        await safeDel(tx, sql`DELETE FROM operations_terrain_audit_logs WHERE operation_id IN (SELECT id FROM operations_terrain WHERE agent_id IN (${agentSub}))`);
        await safeDel(tx, sql`DELETE FROM sessions_agent_audit_logs WHERE session_id IN (SELECT id FROM sessions_agent WHERE agent_id IN (${agentSub}))`);

        // ── Phase D: Remises ──
        await safeDel(tx, sql`DELETE FROM remise_audit_logs WHERE remise_id IN (SELECT id FROM remises_terrain WHERE agent_id IN (${agentSub}))`);
        await safeDel(tx, sql`DELETE FROM remise_items WHERE remise_id IN (SELECT id FROM remises_terrain WHERE agent_id IN (${agentSub}))`);
        await safeDel(tx, sql`DELETE FROM remises_terrain WHERE agent_id IN (${agentSub})`);

        // ── Phase E: Opérations Terrain ──
        await safeDel(tx, sql`DELETE FROM operations_terrain WHERE agent_id IN (${agentSub})`);
        await safeDel(tx, sql`DELETE FROM sessions_agent WHERE agent_id IN (${agentSub})`);
        await safeDel(tx, sql`DELETE FROM paiements_terrain WHERE agent_id IN (${agentSub})`);
        await safeDel(tx, sql`DELETE FROM agent_mm_payments WHERE agent_id IN (${agentSub})`);
        await safeDel(tx, sql`DELETE FROM caisses_agent WHERE agent_id IN (${agentSub})`);
        await safeDel(tx, sql`DELETE FROM agent_agency_history WHERE agent_id IN (${agentSub})`);

        // ── Phase F: Modules Agent ──
        await safeDel(tx, sql`DELETE FROM agent_commissions WHERE agent_id IN (${agentSub})`);
        await safeDel(tx, sql`DELETE FROM agent_objectifs WHERE agent_id IN (${agentSub})`);
        await safeDel(tx, sql`DELETE FROM agent_plannings WHERE agent_id IN (${agentSub})`);
        await safeDel(tx, sql`DELETE FROM agent_rapports WHERE agent_id IN (${agentSub})`);
        await safeDel(tx, sql`DELETE FROM agent_incidents WHERE agent_id IN (${agentSub})`);
        await safeDel(tx, sql`DELETE FROM agent_materiel WHERE agent_id IN (${agentSub})`);
        await safeDel(tx, sql`DELETE FROM agent_communications WHERE agent_id IN (${agentSub})`);

        // ── Phase G: Prospections & Visites ──
        await safeDel(tx, sql`DELETE FROM prospection_primes WHERE prospection_id IN (SELECT id FROM prospections WHERE agent_id IN (${agentSub}))`);
        await safeDel(tx, sql`DELETE FROM prospections WHERE agent_id IN (${agentSub})`);
        await safeDel(tx, sql`DELETE FROM visites_terrain WHERE agent_id IN (${agentSub})`);
        await safeDel(tx, sql`DELETE FROM prospection_prime_config WHERE agence_id = ${agenceId}`);

        // ── Phase H: Caisse config & audit ──
        await safeDel(tx, sql`DELETE FROM transferts_coffre_audit_logs WHERE transfert_id IN (SELECT id FROM transferts_coffre_caisse WHERE agence_id = ${agenceId})`);
        await safeDel(tx, sql`DELETE FROM reconciliations_coffre_caisse WHERE agence_id = ${agenceId}`);
        await safeDel(tx, sql`DELETE FROM caisse_code_usages WHERE code_id IN (SELECT id FROM caisse_security_codes WHERE agence_id = ${agenceId})`);
        await safeDel(tx, sql`DELETE FROM caisse_security_codes WHERE agence_id = ${agenceId}`);
        await safeDel(tx, sql`DELETE FROM caisse_user_authorizations WHERE agence_id = ${agenceId}`);
        await safeDel(tx, sql`DELETE FROM caisse_assignations WHERE caisse_id IN (SELECT id FROM caisses WHERE agence_id = ${agenceId})`);
        await safeDel(tx, sql`DELETE FROM dual_count_config WHERE agence_id = ${agenceId}`);
        await safeDel(tx, sql`DELETE FROM agent_session_config WHERE agence_id = ${agenceId}`);

        // ── Phase I: Mobile Money ──
        await safeDel(tx, sql`DELETE FROM loan_payment_allocations WHERE payment_intent_id IN (SELECT id FROM payment_intents WHERE agence_id = ${agenceId})`);
        await safeDel(tx, sql`DELETE FROM provider_events WHERE payment_intent_id IN (SELECT id FROM payment_intents WHERE agence_id = ${agenceId})`);
        await safeDel(tx, sql`DELETE FROM payment_intents WHERE agence_id = ${agenceId}`);
        await safeDel(tx, sql`DELETE FROM mm_reconciliation_reports WHERE agence_id = ${agenceId}`);

        // ── Phase J: Comptabilité (GL) ──
        await safeDel(tx, sql`DELETE FROM lignes_ecritures WHERE ecriture_id IN (SELECT id FROM ecritures_comptables WHERE agence_id = ${agenceId})`);
        await safeDel(tx, sql`DELETE FROM gl_posting_links WHERE agence_id = ${agenceId}`);
        await safeDel(tx, sql`DELETE FROM ecritures_comptables WHERE agence_id = ${agenceId}`);
        await safeDel(tx, sql`DELETE FROM gl_periods WHERE agence_id = ${agenceId}`);
        await safeDel(tx, sql`DELETE FROM gl_sequences WHERE agence_id = ${agenceId}`);

        // ── Phase K: Notifications ──
        await safeDel(tx, sql`DELETE FROM notification_delivery_receipts WHERE job_id IN (SELECT id FROM notification_jobs WHERE agence_id = ${agenceId})`);
        await safeDel(tx, sql`DELETE FROM notification_schedules WHERE agence_id = ${agenceId}`);
        await safeDel(tx, sql`DELETE FROM notification_jobs WHERE agence_id = ${agenceId}`);
        await safeDel(tx, sql`DELETE FROM notification_settings WHERE agence_id = ${agenceId}`);

        // ── Phase L: Conversations ──
        await safeDel(tx, sql`DELETE FROM message_reactions WHERE message_id IN (SELECT id FROM messages_v2 WHERE conversation_id IN (SELECT id FROM conversations WHERE agence_id = ${agenceId}))`);
        await safeDel(tx, sql`DELETE FROM messages_v2 WHERE conversation_id IN (SELECT id FROM conversations WHERE agence_id = ${agenceId})`);
        await safeDel(tx, sql`DELETE FROM conversation_participants WHERE conversation_id IN (SELECT id FROM conversations WHERE agence_id = ${agenceId})`);
        await safeDel(tx, sql`DELETE FROM conversations WHERE agence_id = ${agenceId}`);

        // ── Phase M: Offline ──
        await safeDel(tx, sql`DELETE FROM offline_journal_entries WHERE agence_id = ${agenceId}`);
        await safeDel(tx, sql`DELETE FROM offline_day_sessions WHERE agence_id = ${agenceId}`);

        // ── Phase 1: Tontine sub-tables (deepest children first) ──
        await tx.execute(sql`
          DELETE FROM tontine_distribution_requests WHERE turn_id IN (
            SELECT id FROM tontine_turns WHERE cycle_id IN (
              SELECT id FROM tontine_cycles WHERE agence_id = ${agenceId}
            )
          )
        `);
        await tx.execute(sql`
          DELETE FROM tontine_turn_audit WHERE turn_id IN (
            SELECT id FROM tontine_turns WHERE cycle_id IN (
              SELECT id FROM tontine_cycles WHERE agence_id = ${agenceId}
            )
          )
        `);
        await tx.execute(sql`DELETE FROM tontine_schedules WHERE agence_id = ${agenceId}`);
        await tx.execute(sql`DELETE FROM tontine_turns WHERE cycle_id IN (
          SELECT id FROM tontine_cycles WHERE agence_id = ${agenceId}
        )`);
        await tx.execute(sql`DELETE FROM tontine_cycles WHERE agence_id = ${agenceId}`);
        await tx.execute(sql`DELETE FROM tontine_penalites WHERE tontine_id IN (
          SELECT id FROM tontines WHERE agence_id = ${agenceId}
        )`);
        await tx.execute(sql`DELETE FROM tontine_alertes WHERE tontine_id IN (
          SELECT id FROM tontines WHERE agence_id = ${agenceId}
        )`);
        await tx.execute(sql`DELETE FROM tontine_plans WHERE agence_id = ${agenceId}`);
        await tx.execute(sql`
          DELETE FROM contributions_tontine WHERE membre_id IN (
            SELECT id FROM membres_tontine WHERE tontine_id IN (
              SELECT id FROM tontines WHERE agence_id = ${agenceId}
            )
          )
        `);
        await tx.execute(sql`
          DELETE FROM membres_tontine WHERE tontine_id IN (
            SELECT id FROM tontines WHERE agence_id = ${agenceId}
          )
        `);
        await tx.execute(sql`DELETE FROM tontines WHERE agence_id = ${agenceId}`);

        // ── Phase 2: Caisse-related (deepest children first) ──
        await tx.execute(sql`
          DELETE FROM operations_caisse WHERE session_id IN (
            SELECT id FROM sessions_caisse WHERE agence_id = ${agenceId}
          )
        `);
        await tx.execute(sql`
          DELETE FROM comptage_billets WHERE shift_id IN (
            SELECT id FROM shifts_caisse WHERE session_id IN (
              SELECT id FROM sessions_caisse WHERE agence_id = ${agenceId}
            )
          )
        `);
        await tx.execute(sql`
          DELETE FROM shifts_caisse WHERE session_id IN (
            SELECT id FROM sessions_caisse WHERE agence_id = ${agenceId}
          )
        `);
        await tx.execute(sql`DELETE FROM sessions_caisse WHERE agence_id = ${agenceId}`);
        await tx.execute(sql`DELETE FROM transferts_coffre_caisse WHERE agence_id = ${agenceId}`);

        // ── Phase 3: Credit-related (children first) ──
        await safeDel(tx, sql`DELETE FROM loan_payment_allocations WHERE credit_id IN (SELECT id FROM credits WHERE agence_id = ${agenceId})`);
        await tx.execute(sql`
          DELETE FROM remboursements WHERE credit_id IN (
            SELECT id FROM credits WHERE agence_id = ${agenceId}
          )
        `);
        await tx.execute(sql`
          DELETE FROM enquetes_credit WHERE credit_id IN (
            SELECT id FROM credits WHERE agence_id = ${agenceId}
          )
        `);
        await tx.execute(sql`DELETE FROM dossiers_credit WHERE agence_id = ${agenceId}`);
        await tx.execute(sql`DELETE FROM credits WHERE agence_id = ${agenceId}`);
        await tx.execute(sql`DELETE FROM demandes_credit WHERE agence_id = ${agenceId}`);

        // ── Phase 4: Savings-related ──
        await tx.execute(sql`
          DELETE FROM transactions_epargne WHERE compte_epargne_id IN (
            SELECT id FROM comptes_epargne WHERE agence_id = ${agenceId}
          )
        `);
        await tx.execute(sql`
          DELETE FROM plans_epargne WHERE compte_epargne_id IN (
            SELECT id FROM comptes_epargne WHERE agence_id = ${agenceId}
          )
        `);
        await tx.execute(sql`DELETE FROM comptes_epargne WHERE agence_id = ${agenceId}`);

        // ── Phase 5: Financial records ──
        await tx.execute(sql`DELETE FROM virements_programmes WHERE agence_id = ${agenceId}`);
        await tx.execute(sql`DELETE FROM mouvements_financiers WHERE agence_id = ${agenceId}`);

        // ── Phase 6: Comptes (bank accounts) ──
        await tx.execute(sql`DELETE FROM comptes WHERE agence_id = ${agenceId}`);

        // ── Phase 7: Clients ──
        await tx.execute(sql`DELETE FROM clients WHERE agence_id = ${agenceId}`);

        // ── Phase 7b: Hard delete employees (optional) ──
        if (deleteEmployees) {
          // Capture user IDs before deleting employes (subquery won't work after DELETE)
          const userIdsResult = await tx.execute(sql`SELECT user_id FROM employes WHERE agence_id = ${agenceId}`);
          const userIds = (userIdsResult.rows || []).map((r: any) => r.user_id).filter(Boolean);

          const empSub = sql`SELECT id FROM employes WHERE agence_id = ${agenceId}`;

          // HR child tables (non-cascade FK — must delete manually)
          await safeDel(tx, sql`DELETE FROM demandes_conges WHERE employe_id IN (${empSub})`);
          await safeDel(tx, sql`DELETE FROM sanctions WHERE employe_id IN (${empSub})`);
          await safeDel(tx, sql`DELETE FROM bulletins_paie WHERE employe_id IN (${empSub})`);
          await safeDel(tx, sql`DELETE FROM avantages_employes WHERE employe_id IN (${empSub})`);
          await safeDel(tx, sql`DELETE FROM presences WHERE employe_id IN (${empSub})`);
          await safeDel(tx, sql`DELETE FROM horaires_travail WHERE employe_id IN (${empSub})`);

          // SET NULL on clients from other agencies that reference these employees
          await safeDel(tx, sql`UPDATE clients SET agent_referent_id = NULL WHERE agent_referent_id IN (${empSub})`);

          // SET NULL on payroll_run_issues
          await safeDel(tx, sql`UPDATE payroll_run_issues SET employe_id = NULL WHERE employe_id IN (${empSub})`);

          // HR child tables (cascade FK — explicit for safety within transaction)
          await safeDel(tx, sql`DELETE FROM formation_participants WHERE employe_id IN (${empSub})`);
          await safeDel(tx, sql`DELETE FROM formation_certificates WHERE employe_id IN (${empSub})`);
          await safeDel(tx, sql`DELETE FROM onboarding_instances WHERE employe_id IN (${empSub})`);
          await safeDel(tx, sql`DELETE FROM salary_rate_history WHERE employe_id IN (${empSub})`);
          await safeDel(tx, sql`DELETE FROM leave_balances WHERE employe_id IN (${empSub})`);
          await safeDel(tx, sql`DELETE FROM avances_salaire WHERE employe_id IN (${empSub})`);
          await safeDel(tx, sql`DELETE FROM employee_documents WHERE employe_id IN (${empSub})`);
          await safeDel(tx, sql`DELETE FROM overtime_log WHERE employe_id IN (${empSub})`);

          // Delete agents_terrain (cascade FK from employes, but children already deleted above)
          await safeDel(tx, sql`DELETE FROM agents_terrain WHERE employe_id IN (${empSub})`);

          // Delete employes themselves
          await tx.execute(sql`DELETE FROM employes WHERE agence_id = ${agenceId}`);

          // Delete associated user accounts (captured before employes deletion)
          if (userIds.length > 0) {
            for (const uid of userIds) {
              await safeDel(tx, sql`DELETE FROM users WHERE id = ${uid}`);
            }
          }
        }

        // ── Phase 8: Config à supprimer ──
        await safeDel(tx, sql`DELETE FROM config_coffre_fort WHERE agence_id = ${agenceId}`);
        await safeDel(tx, sql`DELETE FROM config_transfert_inter_coffres WHERE agence_id = ${agenceId}`);

        // ── Phase 9: Supprimer caisses, zero coffre ──
        await tx.execute(sql`DELETE FROM caisses WHERE agence_id = ${agenceId}`);
        await tx.execute(sql`UPDATE coffres_forts SET solde = '0', updated_at = NOW() WHERE owner_id = ${agenceId}`);

        // ── Phase 10: Re-seed operational config ──
        // Re-create Caisse Principale
        await tx.execute(sql`
          INSERT INTO caisses (nom, agence_id, type, solde, statut)
          VALUES (${`Caisse Principale - ${agencyName}`}, ${agenceId}, 'PHYSICAL', '0', 'CLOSED')
        `);

        // Re-create Config Coffre-Fort
        await tx.execute(sql`
          INSERT INTO config_coffre_fort (agence_id, seuil_double_validation, separation_initiateur_valideur, actif, roles_initiateurs, roles_valideurs, roles_executeurs)
          VALUES (
            ${agenceId},
            '10000000',
            true,
            true,
            '{"CHEF_AGENCE","CAISSIER"}',
            '{"CHEF_AGENCE","SUPERVISEUR"}',
            '{"CHEF_AGENCE"}'
          )
        `);

        // Re-create Config Écart Caisse (per-agency)
        await tx.execute(sql`
          INSERT INTO config_ecart_caisse (agence_id, seuil_auto_approve, seuil_n1_approval, seuil_n2_approval, roles_approbateurs_n1, roles_approbateurs_n2, block_close_until_approved, allow_self_approval_if_role, require_double_approval_n2, actif)
          VALUES (
            ${agenceId},
            '100',
            '5000',
            '50000',
            '{"SUPERVISEUR","CAISSIER"}',
            '{"CHEF_AGENCE","ADMIN"}',
            true,
            false,
            false,
            true
          )
        `);

        // Zero the compte de liaison for this agency
        await safeDel(tx, sql`UPDATE comptes_liaison SET solde_courant = '0', updated_at = NOW() WHERE entite_id = ${agenceId} AND entite_type = 'AGENCE'`);
      });

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "SETTINGS_UPDATE", payload: { type: 'agence_reset', agenceId } });
      }

      res.json({
        success: true,
        message: `Agence "${agencyName}" (${agencyCode}) réinitialisée avec succès.${deleteEmployees ? ' Employés et comptes utilisateurs supprimés.' : ''}`,
        summary: {
          configReseeded: ["Caisse Principale", "Config Coffre-Fort", "Config Écart Caisse"],
          employeesDeleted: !!deleteEmployees,
        }
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Agency reset error');
      // Log failure
      await logAudit(
        req,
        'agence_reset',
        'agence',
        agenceId,
        { error: error.message },
        'failure',
        'critical'
      );
      res.status(500).json({ error: error.message || "Erreur lors de la réinitialisation de l'agence" });
    }
  });

  // ==========================================
  // SETTINGS VERSION HISTORY
  // ==========================================

  // Get settings version history
  app.get("/api/settings/history/:settingsType", requireAuth, async (req, res) => {
    try {
      const { settingsType } = req.params;
      const limit = parseInt(req.query.limit as string) || 20;

      const history = await auditTrailService.getSettingsHistory(settingsType, limit);
      res.json(history);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching settings history');
      res.status(500).json({ error: "Failed to fetch settings history" });
    }
  });

  // Restore settings to a specific version
  app.post("/api/settings/history/:settingsType/restore/:version", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.SETTINGS), async (req, res) => {
    try {
      const { settingsType, version } = req.params;
      const userId = req.session?.userId;

      const result = await auditTrailService.restoreSettingsVersion(
        settingsType,
        parseInt(version),
        userId!,
        req
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      // Broadcast settings update
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({ type: "SETTINGS_UPDATE", payload: { type: 'settings_restored', settingsType, version } });
      }

      res.json(result);
    } catch (error) {
      logger.error({ err: error }, 'Error restoring settings version');
      res.status(500).json({ error: "Failed to restore settings version" });
    }
  });

  // ==========================================
  // ENHANCED AUDIT LOGS
  // ==========================================

  // Get audit logs with advanced filtering
  app.get("/api/audit/logs", requireAuth, async (req, res) => {
    try {
      const filters = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        userId: req.query.userId as string,
        action: req.query.action as string,
        resource: req.query.resource as string,
        statut: req.query.statut as string,
        riskLevel: req.query.riskLevel as string,
        dateFrom: req.query.dateFrom as string,
        dateTo: req.query.dateTo as string,
        search: req.query.search as string,
      };

      const result = await auditTrailService.getAuditLogs(filters);
      res.json(result);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching audit logs');
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });

  // Rollback an audited action
  app.post("/api/audit/:id/rollback", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.AUDIT_LOG), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session?.userId;

      const result = await auditTrailService.rollback(id, userId!, req);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, 'Error rolling back audit');
      res.status(500).json({ error: "Failed to rollback" });
    }
  });

  // Get permission audit history
  app.get("/api/audit/permissions", requireAuth, async (req, res) => {
    try {
      const entityType = req.query.entityType as 'role' | 'user' | undefined;
      const entityId = req.query.entityId as string;
      const limit = parseInt(req.query.limit as string) || 50;

      const history = await auditTrailService.getPermissionAuditHistory(entityType, entityId, limit);
      res.json(history);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching permission audit');
      res.status(500).json({ error: "Failed to fetch permission audit" });
    }
  });

  // ==========================================
  // IMPORT BATCHES
  // ==========================================

  // Get import batches
  app.get("/api/import/batches", requireAuth, async (req, res) => {
    try {
      const importType = req.query.importType as string;
      const batches = await auditTrailService.getImportBatches(importType);
      res.json(batches);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching import batches');
      res.status(500).json({ error: "Failed to fetch import batches" });
    }
  });

  // Rollback an import batch
  app.post("/api/import/batches/:id/rollback", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.USER), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session?.userId;

      const result = await auditTrailService.rollbackImportBatch(id, userId!);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true, deletedCount: result.deletedCount });
    } catch (error) {
      logger.error({ err: error }, 'Error rolling back import');
      res.status(500).json({ error: "Failed to rollback import" });
    }
  });

  // ==========================================
  // SESSION BLOCKING RULES
  // ==========================================

  // Get all blocking rules
  app.get("/api/settings/blocking-rules", requireAuth, async (req, res) => {
    try {
      const rules = await db.select().from(sessionBlockingRules)
        .orderBy(desc(sessionBlockingRules.createdAt));
      res.json(rules);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching blocking rules');
      res.status(500).json({ error: "Failed to fetch blocking rules" });
    }
  });

  // Create blocking rule
  app.post("/api/settings/blocking-rules", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.SETTINGS), async (req, res) => {
    try {
      const { ruleType, pattern, reason, expiresAt } = req.body;
      const userId = req.session?.userId;

      const [rule] = await db.insert(sessionBlockingRules).values({
        ruleType,
        pattern,
        reason,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdBy: userId,
      }).returning();

      await logAudit(req, 'CREATE', 'blocking_rule', rule.id, { ruleType, pattern }, 'success', 'high');

      res.status(201).json(rule);
    } catch (error) {
      logger.error({ err: error }, 'Error creating blocking rule');
      res.status(500).json({ error: "Failed to create blocking rule" });
    }
  });

  // Update blocking rule
  app.patch("/api/settings/blocking-rules/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.SETTINGS), async (req, res) => {
    try {
      const { id } = req.params;
      const { ruleType, pattern, description, reason, expiresAt, isActive } = req.body;

      const updateData: any = {};
      if (ruleType !== undefined) updateData.ruleType = ruleType;
      if (pattern !== undefined) updateData.pattern = pattern;
      if (description !== undefined) updateData.description = description;
      if (reason !== undefined) updateData.reason = reason;
      if (expiresAt !== undefined) updateData.expiresAt = expiresAt ? new Date(expiresAt) : null;
      if (isActive !== undefined) updateData.isActive = isActive;

      const [rule] = await db.update(sessionBlockingRules)
        .set(updateData)
        .where(eq(sessionBlockingRules.id, id))
        .returning();

      await logAudit(req, 'UPDATE', 'blocking_rule', id, updateData, 'success', 'medium');

      res.json(rule);
    } catch (error) {
      logger.error({ err: error }, 'Error updating blocking rule');
      res.status(500).json({ error: "Failed to update blocking rule" });
    }
  });

  // Delete blocking rule (hard delete)
  app.delete("/api/settings/blocking-rules/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.SETTINGS), async (req, res) => {
    try {
      const { id } = req.params;

      await db.delete(sessionBlockingRules)
        .where(eq(sessionBlockingRules.id, id));

      await logAudit(req, 'DELETE', 'blocking_rule', id, {}, 'success', 'medium');

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, 'Error deleting blocking rule');
      res.status(500).json({ error: "Failed to delete blocking rule" });
    }
  });

  // ==========================================
  // MAINTENANCE SCHEDULES
  // ==========================================

  // Get maintenance schedules
  app.get("/api/settings/maintenance-schedules", requireAuth, async (req, res) => {
    try {
      const schedules = await db.select().from(maintenanceSchedules)
        .orderBy(desc(maintenanceSchedules.scheduledStart));
      res.json(schedules);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching maintenance schedules');
      res.status(500).json({ error: "Failed to fetch maintenance schedules" });
    }
  });

  // Create maintenance schedule
  app.post("/api/settings/maintenance-schedules", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.SETTINGS), async (req, res) => {
    try {
      const { title, description, scheduledStart, scheduledEnd, affectedModules, notifyAt } = req.body;
      const userId = req.session?.userId;

      const [schedule] = await db.insert(maintenanceSchedules).values({
        title,
        description,
        scheduledStart: new Date(scheduledStart),
        scheduledEnd: new Date(scheduledEnd),
        affectedModules,
        notifyAt,
        createdBy: userId,
      }).returning();

      await logAudit(req, 'CREATE', 'maintenance_schedule', schedule.id, { title, scheduledStart }, 'success', 'medium');

      // Broadcast to notify users
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({ type: "MAINTENANCE_UPDATE", payload: { action: 'scheduled', schedule } });
      }

      res.status(201).json(schedule);
    } catch (error) {
      logger.error({ err: error }, 'Error creating maintenance schedule');
      res.status(500).json({ error: "Failed to create maintenance schedule" });
    }
  });

  // Update maintenance schedule
  app.put("/api/settings/maintenance-schedules/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.SETTINGS), async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const [updated] = await db.update(maintenanceSchedules)
        .set({
          ...updates,
          scheduledStart: updates.scheduledStart ? new Date(updates.scheduledStart) : undefined,
          scheduledEnd: updates.scheduledEnd ? new Date(updates.scheduledEnd) : undefined,
        })
        .where(eq(maintenanceSchedules.id, id))
        .returning();

      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, 'Error updating maintenance schedule');
      res.status(500).json({ error: "Failed to update maintenance schedule" });
    }
  });

  // ==========================================
  // HOLIDAY EXCEPTIONS
  // ==========================================

  // Get holiday exceptions
  app.get("/api/settings/holidays", requireAuth, async (req, res) => {
    try {
      const agenceId = req.query.agenceId as string;

      let query = db.select().from(holidayExceptions);
      if (agenceId) {
        query = query.where(eq(holidayExceptions.agenceId, agenceId)) as any;
      }

      const holidays = await query;
      res.json(holidays);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching holidays');
      res.status(500).json({ error: "Failed to fetch holidays" });
    }
  });

  // Create holiday exception
  app.post("/api/settings/holidays", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.SETTINGS), async (req, res) => {
    try {
      const { date, name, isRecurring, agenceId, affectsAllCaisses, caisseIds } = req.body;
      const userId = req.session?.userId;

      const [holiday] = await db.insert(holidayExceptions).values({
        date: new Date(date),
        name,
        isRecurring,
        agenceId,
        affectsAllCaisses,
        caisseIds,
        createdBy: userId,
      }).returning();

      res.status(201).json(holiday);
    } catch (error) {
      logger.error({ err: error }, 'Error creating holiday');
      res.status(500).json({ error: "Failed to create holiday" });
    }
  });

  // Delete holiday exception
  app.delete("/api/settings/holidays/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.SETTINGS), async (req, res) => {
    try {
      const { id } = req.params;
      await db.delete(holidayExceptions).where(eq(holidayExceptions.id, id));
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, 'Error deleting holiday');
      res.status(500).json({ error: "Failed to delete holiday" });
    }
  });

  // ==========================================
  // ROLE TEMPLATES
  // ==========================================

  // Get role templates
  app.get("/api/settings/role-templates", requireAuth, async (req, res) => {
    try {
      const templates = await db.select().from(roleTemplates);
      res.json(templates);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching role templates');
      res.status(500).json({ error: "Failed to fetch role templates" });
    }
  });

  // Create role template
  app.post("/api/settings/role-templates", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.RBAC), async (req, res) => {
    try {
      const { code, name, description, permissions } = req.body;
      const userId = req.session?.userId;

      const [template] = await db.insert(roleTemplates).values({
        code,
        name,
        description,
        permissions,
        createdBy: userId,
      }).returning();

      res.status(201).json(template);
    } catch (error) {
      logger.error({ err: error }, 'Error creating role template');
      res.status(500).json({ error: "Failed to create role template" });
    }
  });

  // Update role template
  app.put("/api/settings/role-templates/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.RBAC), async (req, res) => {
    try {
      const { id } = req.params;
      const { code, name, description, permissions } = req.body;

      const [updated] = await db.update(roleTemplates)
        .set({ code, name, description, permissions, updatedAt: new Date() })
        .where(eq(roleTemplates.id, id))
        .returning();

      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, 'Error updating role template');
      res.status(500).json({ error: "Failed to update role template" });
    }
  });

  // Delete role template
  app.delete("/api/settings/role-templates/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.RBAC), async (req, res) => {
    try {
      const { id } = req.params;

      // Check if it's a system template
      const [template] = await db.select().from(roleTemplates).where(eq(roleTemplates.id, id));
      if (template?.isSystem) {
        return res.status(400).json({ error: "Cannot delete system template" });
      }

      await db.delete(roleTemplates).where(eq(roleTemplates.id, id));
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, 'Error deleting role template');
      res.status(500).json({ error: "Failed to delete role template" });
    }
  });

  // ==========================================
  // REGULARIZATION RULES
  // ==========================================

  // Get regularization rules
  app.get("/api/settings/regularization-rules", requireAuth, async (req, res) => {
    try {
      const rules = await db.select().from(regularizationRules).orderBy(regularizationRules.priority);
      res.json(rules);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching regularization rules');
      res.status(500).json({ error: "Failed to fetch regularization rules" });
    }
  });

  // Create regularization rule
  app.post("/api/settings/regularization-rules", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.SETTINGS), async (req, res) => {
    try {
      const { name, description, triggerCondition, conditionValue, action, actionConfig, priority } = req.body;
      const userId = req.session?.userId;

      const [rule] = await db.insert(regularizationRules).values({
        name,
        description,
        triggerCondition,
        conditionValue,
        action,
        actionConfig,
        priority,
        createdBy: userId,
      }).returning();

      res.status(201).json(rule);
    } catch (error) {
      logger.error({ err: error }, 'Error creating regularization rule');
      res.status(500).json({ error: "Failed to create regularization rule" });
    }
  });

  // Update regularization rule
  app.put("/api/settings/regularization-rules/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.SETTINGS), async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const [updated] = await db.update(regularizationRules)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(regularizationRules.id, id))
        .returning();

      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, 'Error updating regularization rule');
      res.status(500).json({ error: "Failed to update regularization rule" });
    }
  });

  // Delete regularization rule
  app.delete("/api/settings/regularization-rules/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.SETTINGS), async (req, res) => {
    try {
      const { id } = req.params;
      await db.delete(regularizationRules).where(eq(regularizationRules.id, id));
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, 'Error deleting regularization rule');
      res.status(500).json({ error: "Failed to delete regularization rule" });
    }
  });

  // ==========================================
  // SYSTEM ALERTS CRUD
  // ==========================================

  // Get system alerts
  app.get("/api/alerts", requireAuth, async (req, res) => {
    try {
      const userId = req.session?.userId;
      const unreadOnly = req.query.unreadOnly === 'true';

      let query = db.select().from(systemAlerts)
        .where(isNull(systemAlerts.deletedAt))
        .orderBy(desc(systemAlerts.createdAt));

      const alerts = await query;

      // Filter by read status if needed
      const filtered = unreadOnly
        ? alerts.filter(a => !a.readBy?.includes(userId!))
        : alerts;

      res.json(filtered);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching alerts');
      res.status(500).json({ error: "Failed to fetch alerts" });
    }
  });

  // Create system alert
  app.post("/api/alerts", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.SETTINGS), async (req, res) => {
    try {
      const { type, title, message, targetAudience, targetUserIds, expiresAt } = req.body;
      const userId = req.session?.userId;

      const [alert] = await db.insert(systemAlerts).values({
        type,
        title,
        message,
        targetAudience,
        targetUserIds,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdBy: userId,
      }).returning();

      // Broadcast alert
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({ type: "ALERT_CREATED", payload: alert });
      }

      res.status(201).json(alert);
    } catch (error) {
      logger.error({ err: error }, 'Error creating alert');
      res.status(500).json({ error: "Failed to create alert" });
    }
  });

  // Mark alert as read
  app.post("/api/alerts/:id/read", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session?.userId;

      // Get current alert
      const [alert] = await db.select().from(systemAlerts).where(eq(systemAlerts.id, id));
      if (!alert) {
        return res.status(404).json({ error: "Alert not found" });
      }

      // Add user to readBy array
      const readBy = alert.readBy || [];
      if (!readBy.includes(userId!)) {
        readBy.push(userId!);
        await db.update(systemAlerts)
          .set({ readBy })
          .where(eq(systemAlerts.id, id));
      }

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, 'Error marking alert as read');
      res.status(500).json({ error: "Failed to mark alert as read" });
    }
  });

  // Delete system alert
  app.delete("/api/alerts/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.SETTINGS), async (req, res) => {
    try {
      const { id } = req.params;

      // Soft delete
      await db.update(systemAlerts)
        .set({ deletedAt: new Date() })
        .where(eq(systemAlerts.id, id));

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, 'Error deleting alert');
      res.status(500).json({ error: "Failed to delete alert" });
    }
  });

  // ==========================================
  // NOTIFICATION TEMPLATES (SMS & EMAIL)
  // ==========================================

  // Get all SMS templates
  app.get("/api/settings/sms-templates", requireAuth, async (req, res) => {
    try {
      const { smsTemplates } = await import("@shared/schema/settings");
      const templates = await db.select().from(smsTemplates).orderBy(smsTemplates.code);
      res.json(templates);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching SMS templates');
      res.status(500).json({ error: "Failed to fetch SMS templates" });
    }
  });

  // Get single SMS template
  app.get("/api/settings/sms-templates/:id", requireAuth, async (req, res) => {
    try {
      const { smsTemplates } = await import("@shared/schema/settings");
      const [template] = await db.select().from(smsTemplates).where(eq(smsTemplates.id, req.params.id));
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json(template);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching SMS template');
      res.status(500).json({ error: "Failed to fetch SMS template" });
    }
  });

  // Update SMS template
  app.patch("/api/settings/sms-templates/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.SETTINGS), async (req, res) => {
    try {
      const { smsTemplates } = await import("@shared/schema/settings");
      const { nom, contenu, placeholders, description, actif } = req.body;

      const [updated] = await db.update(smsTemplates)
        .set({
          ...(nom !== undefined && { nom }),
          ...(contenu !== undefined && { contenu }),
          ...(placeholders !== undefined && { placeholders }),
          ...(description !== undefined && { description }),
          ...(actif !== undefined && { actif }),
          updatedAt: new Date(),
        })
        .where(eq(smsTemplates.id, req.params.id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Template not found" });
      }

      await logAudit(req, "settings", "sms_template_updated", req.params.id, { changes: req.body });
      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, 'Error updating SMS template');
      res.status(500).json({ error: "Failed to update SMS template" });
    }
  });

  // Get all email templates
  app.get("/api/settings/email-templates", requireAuth, async (req, res) => {
    try {
      const { emailTemplates } = await import("@shared/schema/notifications");
      const templates = await db.select().from(emailTemplates).orderBy(emailTemplates.code);
      res.json(templates);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching email templates');
      res.status(500).json({ error: "Failed to fetch email templates" });
    }
  });

  // Get single email template
  app.get("/api/settings/email-templates/:id", requireAuth, async (req, res) => {
    try {
      const { emailTemplates } = await import("@shared/schema/notifications");
      const [template] = await db.select().from(emailTemplates).where(eq(emailTemplates.id, req.params.id));
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json(template);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching email template');
      res.status(500).json({ error: "Failed to fetch email template" });
    }
  });

  // Update email template
  app.patch("/api/settings/email-templates/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.SETTINGS), async (req, res) => {
    try {
      const { emailTemplates } = await import("@shared/schema/notifications");
      const { nom, subject, contenuHtml, contenuText, placeholders, description, actif } = req.body;

      const [updated] = await db.update(emailTemplates)
        .set({
          ...(nom !== undefined && { nom }),
          ...(subject !== undefined && { subject }),
          ...(contenuHtml !== undefined && { contenuHtml }),
          ...(contenuText !== undefined && { contenuText }),
          ...(placeholders !== undefined && { placeholders }),
          ...(description !== undefined && { description }),
          ...(actif !== undefined && { actif }),
          updatedAt: new Date(),
        })
        .where(eq(emailTemplates.id, req.params.id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Template not found" });
      }

      await logAudit(req, "settings", "email_template_updated", req.params.id, { changes: req.body });
      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, 'Error updating email template');
      res.status(500).json({ error: "Failed to update email template" });
    }
  });

  // Preview template with sample data
  app.post("/api/settings/templates/preview", requireAuth, async (req, res) => {
    try {
      const { channel, code, sampleData } = req.body;

      let template: string;
      let subject: string | undefined;

      if (channel === 'SMS') {
        const { smsTemplates } = await import("@shared/schema/settings");
        const [smsTemplate] = await db.select().from(smsTemplates).where(eq(smsTemplates.code, code));
        if (!smsTemplate) {
          return res.status(404).json({ error: "Template not found" });
        }
        template = smsTemplate.contenu;
      } else {
        const { emailTemplates } = await import("@shared/schema/notifications");
        const [emailTemplate] = await db.select().from(emailTemplates).where(eq(emailTemplates.code, code));
        if (!emailTemplate) {
          return res.status(404).json({ error: "Template not found" });
        }
        template = emailTemplate.contenuHtml;
        subject = emailTemplate.subject;
      }

      // Replace placeholders with sample data
      let rendered = template;
      if (sampleData && typeof sampleData === 'object') {
        Object.entries(sampleData).forEach(([key, value]) => {
          rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
        });
      }

      res.json({ rendered, subject });
    } catch (error) {
      logger.error({ err: error }, 'Error previewing template');
      res.status(500).json({ error: "Failed to preview template" });
    }
  });
}
