import type { Express } from "express";
import { createLogger } from "./lib/logger";
import { registerAuthRoutes } from "./routes/auth";
import { registerClientRoutes } from "./routes/clients";
import { registerFinanceRoutes } from "./routes/finance";
import { registerTontineRoutes } from "./routes/tontines";
import { registerOperationsRoutes } from "./routes/operations";
import { registerAgentModulesRoutes } from "./routes/agent-modules";
import { registerSettingsRoutes } from "./routes/settings";
import { registerDashboardRoutes } from "./routes/dashboard";
import { hrRouter } from "./routes/hr";
import { registerMobileMoneyRoutes } from "./mobile-money-service";
import { registerMessagesRoutes } from "./routes/messages";
import { registerConversationsRoutes } from "./routes/conversations";
import { createServer, type Server } from "http";
import { setupWebSocket, setWsInstance } from "./ws-server";
import { registerAccountingRoutes } from "./routes/accounting";
import { registerTreasuryRoutes } from "./routes/treasury";
import { transactionsRouter } from "./routes/transactions";
import { registerRbacRoutes } from "./routes/rbac";
import { registerAgencesRoutes } from "./routes/agences";
import { registerEmployesRoutes } from "./routes/employes";
import { registerDepartmentsRoutes } from "./routes/departments";
import loyaltyRouter from "./routes/loyalty";
import { registerOtpRoutes } from "./routes/otp";
import { registerConfigRoutes, registerSecurityConfigRoutes } from "./routes/config";
import { registerComptesRoutes } from "./routes/comptes";
import { registerReevaluationRoutes } from "./routes/reevaluations";
import { registerNotificationsRoutes } from "./routes/notifications";
import { registerPushRoutes } from "./routes/push";

import { coffreRouter } from "./routes/coffre";
import { caisseAgentRouter } from "./routes/caisse-agent";
import { caisseAdminRouter } from "./routes/caisse-admin";
import { maintenanceRouter } from "./routes/maintenance";
import { checkMaintenanceMode } from "./middleware/maintenance";
import { transfertsInterCoffresRouter } from "./routes/transferts-inter-coffres";
import storageRouter from "./routes/storage";
import { regularisationRouter } from "./routes/regularisation";
import { paymentsRouter, webhooksRouter } from "./routes/payments";
import { paymentsTestRouter } from "./routes/payments-test";
import balancesRouter from "./routes/balances";
import permissionAnalyticsRouter from "./routes/permission-analytics";
import { registerMonitoringRoutes } from "./routes/monitoring";
import syncRouter from "./routes/sync";
import { registerZoneManagementRoutes } from "./routes/zone-management";
import { registerProspectionPrimesRoutes } from "./routes/prospection-primes";
import { registerVilleRoutes } from "./routes/villes";

const logger = createLogger('Routes');

export function registerRoutes(app: Express): Server {
  // Apply Maintenance Middleware globally
  app.use(checkMaintenanceMode);

  // ... existing routes
  app.use("/api/coffre", coffreRouter);
  app.use("/api/caisse-agent", caisseAgentRouter);
  app.use("/api/caisses", caisseAdminRouter); // Advanced caisse admin operations
  app.use("/api/maintenance-mode", maintenanceRouter);
  app.use("/api/transferts-inter-coffres", transfertsInterCoffresRouter);
  app.use("/api/transactions", transactionsRouter);

  // Admin - Regularisation Module (gestion des tâches de régularisation)
  app.use("/api/admin/regularisations", regularisationRouter);

  // Mobile Money Payments & Webhooks
  app.use("/api/payments", paymentsRouter);
  app.use("/api/webhooks", webhooksRouter); // Webhooks MTN/Airtel (router dédié, sans auth)
  app.use("/api/payments-test", paymentsTestRouter); // Test endpoints (dev only)

  // Storage routes (unified)
  app.use("/api/storage", storageRouter);

  // Balances routes (unified source of truth)
  app.use("/api/balances", balancesRouter);

  // Register modular routes
  registerAuthRoutes(app);
  registerClientRoutes(app);
  registerFinanceRoutes(app);
  registerComptesRoutes(app); // Comptes microfinance (dépôt, retrait, blocage, transfert)
  registerTontineRoutes(app);
  registerOperationsRoutes(app); // Agents, prospection
  registerZoneManagementRoutes(app); // Arrondissements & Marchés CRUD
  registerProspectionPrimesRoutes(app); // Prospection primes management
  registerVilleRoutes(app); // Départements & Villes reference data
  registerAgentModulesRoutes(app); // Agent sub-modules (commissions, planning, objectifs, etc.)
  registerDashboardRoutes(app); // Dashboard statistics
  registerMessagesRoutes(app); // Messaging System (Legacy v1)
  registerConversationsRoutes(app); // Messaging System V2 (Conversations)
  registerNotificationsRoutes(app); // Notifications System (caisse + general)
  registerPushRoutes(app); // Push Notifications (Web Push API)
  app.use("/api/hr", hrRouter); // HR Module
  app.use("/api/loyalty", loyaltyRouter); // Loyalty Points System

  registerSettingsRoutes(app); // System settings, reset
  
  // Accounting Module
  registerAccountingRoutes(app);

  // Treasury Module v2 (Encaisse canonique basée sur GL)
  registerTreasuryRoutes(app);

  // RBAC Module (Roles & Permissions)
  registerRbacRoutes(app);

  // Permission Analytics (Admin only)
  app.use("/api/admin/permission-analytics", permissionAnalyticsRouter);

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

  // Reevaluation Module (Credit reevaluation workflow)
  registerReevaluationRoutes(app);

  // Financial Monitoring Module (alerts, reconciliation, real-time monitoring)
  registerMonitoringRoutes(app);

  // Sync Heartbeat Module (real-time connection status)
  app.use("/api/sync", syncRouter);

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
