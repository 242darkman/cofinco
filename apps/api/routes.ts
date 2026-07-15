import type { Express } from "express";
import { createLogger } from "./lib/logger";
import { registerAuthCoreRoutes } from "./routes/auth/core";
import { registerAuthProfileRoutes } from "./routes/auth/profile";
import { registerAuthSessionRoutes } from "./routes/auth/session";
import { registerAuthRefreshRoutes } from "./routes/auth/refresh";
import { registerAuthPasswordResetRoutes } from "./routes/auth/password-reset";
import { registerAuthPinRoutes } from "./routes/auth/pin";
import { registerAuthActiveSessionsRoutes } from "./routes/auth/sessions-actives";
import { registerAuthAgencyRoutes } from "./routes/auth/agences-roles";
import { registerUsersRoutes } from "./routes/users";
import { registerUsersPermissionsRoutes } from "./routes/users-permissions";
import { registerUsersRolesRoutes } from "./routes/users-roles";
import { registerSessionsRoutes } from "./routes/sessions";
import { registerAuditLogsRoutes } from "./routes/audit-logs";
import { registerAdminDashboardRoutes } from "./routes/admin-dashboard";
import { registerClientRoutes } from "./routes/clients";
import { registerFinanceRoutes } from "./routes/finance";
import { registerTontineRoutes } from "./routes/tontines";
import { registerOperationsRoutes } from "./routes/operations";
import { registerTrackingRoutes } from "./routes/tracking";
import { registerAgentModulesRoutes } from "./routes/agent-modules";
import { registerSettingsRoutes } from "./routes/settings";
import { registerDashboardRoutes } from "./routes/dashboard";
import { hrRouter } from "./routes/hr";
import { registerMobileMoneyRoutes } from "./mobile-money-service";
import { registerConversationsRoutes } from "./routes/conversations";
import { createServer, type Server } from "node:http";
import { setupWebSocket, setWsInstance } from "./ws-server";
import { registerAccountingRoutes } from "./routes/accounting";
import { registerTreasuryRoutes } from "./routes/treasury";
import { transactionsRouter } from "./routes/transactions";
import { registerRbacRoutes } from "./routes/rbac";
import { registerAgencesRoutes } from "./routes/agences";
import { registerEmployesRoutes } from "./routes/employes";
import { registerDepartmentsRoutes } from "./routes/departments";
import { registerOtpRoutes } from "./routes/otp";
import { registerConfigRoutes, registerSecurityConfigRoutes } from "./routes/config";
import { registerBrandingRoutes } from "./routes/branding";
import { registerComptesRoutes } from "./routes/comptes";
import { registerReevaluationRoutes } from "./routes/reevaluations";
import { registerNotificationsRoutes } from "./routes/notifications";
import { registerPushRoutes } from "./routes/push";
import { registerTenantRoutes } from "./routes/tenant";

import { coffreRouter } from "./routes/coffre";
import { caisseAgentRouter } from "./routes/caisse-agent";
import { caisseAdminRouter } from "./routes/caisse-admin";
import { maintenanceRouter } from "./routes/maintenance";
import { checkMaintenanceMode } from "./middleware/maintenance";
import { transfertsInterCoffresRouter } from "./routes/transferts-inter-coffres";
import { evacuationCoffreRouter } from "./routes/evacuation-coffre";
import { registerStoragePublicRoutes } from "./routes/storage/public";
import { registerStorageDocumentsRoutes } from "./routes/storage/documents";
import { registerStorageEntitiesRoutes } from "./routes/storage/entities";
import { registerRegularisationListRoutes } from "./routes/regularisation/list";
import { registerRegularisationStatsRoutes } from "./routes/regularisation/stats";
import { registerRegularisationDetailsRoutes } from "./routes/regularisation/details";
import { registerRegularisationActionsRoutes } from "./routes/regularisation/actions";

import { registerPaymentsWebhooksRoutes } from "./routes/payments/webhooks";
import { registerPaymentsCollectionRoutes } from "./routes/payments/collection";
import { registerPaymentsPayoutRoutes } from "./routes/payments/payout";
import { registerPaymentsReconciliationRoutes } from "./routes/payments/reconciliation";
import { registerPaymentsManagementRoutes } from "./routes/payments/management";

import { paymentsTestRouter } from "./routes/payments-test";
import balancesRouter from "./routes/balances";
import permissionAnalyticsRouter from "./routes/permission-analytics";
import { registerMonitoringDashboardRoutes } from "./routes/monitoring/dashboard";
import { registerMonitoringAlertsRoutes } from "./routes/monitoring/alerts";
import { registerMonitoringReconciliationRoutes } from "./routes/monitoring/reconciliation";
import { registerMonitoringSystemRoutes } from "./routes/monitoring/system";
import { registerKpiRoutes } from "./routes/kpi";
import { registerSyncHeartbeatRoutes } from "./routes/sync/heartbeat";
import { registerSyncPushRoutes } from "./routes/sync/push";
import { registerSyncPullRoutes } from "./routes/sync/pull";
import { syncJournalRouter } from "./routes/sync-journal";
import { registerArrondissementsRoutes } from "./routes/zones/arrondissements";
import { registerMarchesRoutes } from "./routes/zones/marches";
import { registerProspectionPrimesRoutes } from "./routes/prospections/primes";
import { registerProspectionPrimeConfigRoutes } from "./routes/prospections/prime-config";
import { registerVilleRoutes } from "./routes/villes";
import { registerCatalogRoutes } from "./routes/catalog";
import { scoringAdminRouter } from "./routes/scoring-admin";
import { enforceTenantFeatures } from "./middleware/tenant-features";

const logger = createLogger('Routes');

export function registerRoutes(app: Express): Server {
  // Apply Maintenance Middleware globally
  app.use(checkMaintenanceMode);
  app.use(enforceTenantFeatures);

  // ... existing routes
  app.use("/api/coffre", coffreRouter);
  app.use("/api/caisse-agent", caisseAgentRouter);
  app.use("/api/caisses", caisseAdminRouter); // Advanced caisse admin operations
  app.use("/api/maintenance-mode", maintenanceRouter);
  app.use("/api/transferts-inter-coffres", transfertsInterCoffresRouter);
  app.use("/api/evacuations-coffre", evacuationCoffreRouter);
  app.use("/api/transactions", transactionsRouter);

  // Regularisation (Admin only)
  registerRegularisationListRoutes(app);
  registerRegularisationStatsRoutes(app);
  registerRegularisationDetailsRoutes(app);
  registerRegularisationActionsRoutes(app);

  // Mobile Money Payments & Webhooks
  registerPaymentsWebhooksRoutes(app);
  registerPaymentsCollectionRoutes(app);
  registerPaymentsPayoutRoutes(app);
  registerPaymentsReconciliationRoutes(app);
  registerPaymentsManagementRoutes(app);

  // Pour les tests en dev
  app.use("/api/payments-test", paymentsTestRouter); // Test endpoints (dev only)

  // Storage API
  registerStoragePublicRoutes(app);
  registerStorageDocumentsRoutes(app);
  registerStorageEntitiesRoutes(app);

  // Balances routes (unified source of truth)
  app.use("/api/balances", balancesRouter);

  // Register modular routes
  registerAuthCoreRoutes(app);
  registerAuthSessionRoutes(app);
  registerAuthRefreshRoutes(app);
  registerAuthPasswordResetRoutes(app);
  registerAuthPinRoutes(app);
  registerAuthProfileRoutes(app);
  registerAuthActiveSessionsRoutes(app);
  registerAuthAgencyRoutes(app);
  registerUsersRoutes(app);
  registerUsersPermissionsRoutes(app);
  registerUsersRolesRoutes(app);
  registerSessionsRoutes(app);
  registerAuditLogsRoutes(app);
  registerAdminDashboardRoutes(app);
  registerClientRoutes(app);
  registerFinanceRoutes(app);
  registerComptesRoutes(app); // Comptes microfinance (dépôt, retrait, blocage, transfert)
  registerTontineRoutes(app);
  registerOperationsRoutes(app); // Agents, prospection
  registerTrackingRoutes(app); // GPS tracking batch sync + sessions
  registerArrondissementsRoutes(app); // Arrondissements CRUD
  registerMarchesRoutes(app); // Marchés CRUD
  registerProspectionPrimesRoutes(app); // Prospection primes management
  registerProspectionPrimeConfigRoutes(app); // Prospection primes config
  registerVilleRoutes(app); // Départements & Villes reference data
  registerCatalogRoutes(app); // Catalog Module (sectors, professions, activity types)
  registerAgentModulesRoutes(app); // Agent sub-modules (commissions, planning, objectifs, etc.)
  registerDashboardRoutes(app); // Dashboard statistics
  registerConversationsRoutes(app); // Messaging System V2 (Conversations)
  registerNotificationsRoutes(app); // Notifications System (caisse + general)
  registerPushRoutes(app); // Push Notifications (Web Push API)
  app.use("/api/hr", hrRouter); // HR Module

  registerSettingsRoutes(app); // System settings, reset
  
  // Accounting Module
  registerAccountingRoutes(app);

  // Treasury Module v2 (Encaisse canonique basée sur GL)
  registerTreasuryRoutes(app);

  // RBAC Module (Roles & Permissions)
  registerRbacRoutes(app);

  // Permission Analytics (Admin only)
  app.use("/api/admin/permission-analytics", permissionAnalyticsRouter);

  // Scoring Admin (audit log, states, CSV exports)
  app.use("/api/admin/scoring", scoringAdminRouter);

  // Agences Module (Multi-agency management)
  registerAgencesRoutes(app);

  // Employes Module (nouvelle architecture users/employes)
  registerEmployesRoutes(app);

  // Departments & Job Positions Module
  registerDepartmentsRoutes(app);

  // OTP Module
  registerOtpRoutes(app);

  // Config Module (Durees suggerees, frequences)
  registerConfigRoutes(app);

  // Security Config Module (OTP bypass, presence verification)
  registerSecurityConfigRoutes(app);

  // Branding Module (app name, logo, theme colors)
  registerBrandingRoutes(app);

  // Tenant Configuration (Feature Flags, White-label variables)
  registerTenantRoutes(app);

  // Reevaluation Module (Credit reevaluation workflow)
  registerReevaluationRoutes(app);

  // Financial Monitoring Module (alerts, reconciliation, real-time monitoring)
  registerMonitoringDashboardRoutes(app);
  registerMonitoringAlertsRoutes(app);
  registerMonitoringReconciliationRoutes(app);
  registerMonitoringSystemRoutes(app);

  // KPI Module (Indicateurs clés de performance et pilotage)
  registerKpiRoutes(app);

  // Sync Heartbeat Module (real-time connection status)
  registerSyncHeartbeatRoutes(app);
  registerSyncPushRoutes(app);
  registerSyncPullRoutes(app);

  // Offline-Native Sync Journal (ECDSA-signed journal entries, device keys, COBAC audit)
  app.use("/api/sync", syncJournalRouter);

  // External Services
  registerMobileMoneyRoutes(app);

  // System Version Endpoint
  app.get("/api/version", async (req, res) => {
    try {
      const { readFile } = await import("fs/promises");
      const { join } = await import("path");
      
      const packagePath = join(process.cwd(), "package.json");
      const content = await readFile(packagePath, "utf-8");
      const pkg = JSON.parse(content);
      
      res.json({ 
        version: pkg.version || "1.0.0",
        environment: process.env.NODE_ENV || "development"
      });
    } catch (error) {
      logger.error({ err: error }, 'Error reading version');
      res.status(500).json({ version: "unknown" });
    }
  });

  // System Health Check Endpoint - vérifie la santé réelle du système
  app.get("/api/health", async (req, res) => {
    const startTime = Date.now();

    // Vérification de la base de données
    let databaseStatus: 'healthy' | 'warning' | 'error' = 'error';
    let dbResponseTime = 0;
    let dbError: string | null = null;

    try {
      const dbStart = Date.now();
      const { db } = await import("./db");
      await db.execute("SELECT 1");
      dbResponseTime = Date.now() - dbStart;

      if (dbResponseTime < 100) {
        databaseStatus = 'healthy';
      } else if (dbResponseTime < 500) {
        databaseStatus = 'warning';
      } else {
        databaseStatus = 'warning';
      }
    } catch (error) {
      databaseStatus = 'error';
      dbError = error instanceof Error ? error.message : 'Erreur de connexion DB';
    }

    // Vérification de la sécurité
    let securityStatus: 'secure' | 'attention' = 'secure';
    const securityChecks = {
      httpsEnabled: req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV !== 'production',
      rateLimitingEnabled: true, // Configuré dans index.ts
      helmetEnabled: true, // Configuré dans index.ts
    };

    if (!securityChecks.httpsEnabled && process.env.NODE_ENV === 'production') {
      securityStatus = 'attention';
    }

    // Informations mémoire du serveur
    const memoryUsage = process.memoryUsage();
    const memoryUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
    const memoryTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
    const memoryPercent = Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100);

    // Uptime du serveur
    const uptimeSeconds = Math.floor(process.uptime());
    const uptimeFormatted = `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m`;

    const totalResponseTime = Date.now() - startTime;

    res.json({
      status: databaseStatus === 'healthy' && securityStatus === 'secure' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      responseTime: totalResponseTime,
      database: {
        status: databaseStatus,
        responseTime: dbResponseTime,
        error: dbError
      },
      security: {
        status: securityStatus,
        checks: securityChecks
      },
      server: {
        uptime: uptimeFormatted,
        uptimeSeconds,
        memory: {
          used: memoryUsedMB,
          total: memoryTotalMB,
          percent: memoryPercent
        },
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || 'development'
      }
    });
  });

  const httpServer = createServer(app);
  
  // Setup WebSocket
  const wsServer = setupWebSocket(httpServer);
  setWsInstance(wsServer);

  return httpServer;
}
