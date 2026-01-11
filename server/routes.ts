import type { Express } from "express";
import { registerAuthRoutes } from "./routes/auth";
import { registerClientRoutes } from "./routes/clients";
import { registerFinanceRoutes } from "./routes/finance";
import { registerTontineRoutes } from "./routes/tontines";
import { registerOperationsRoutes } from "./routes/operations";
import { registerSettingsRoutes } from "./routes/settings";
import { registerDashboardRoutes } from "./routes/dashboard";
import { hrRouter } from "./routes/hr";
import { registerMobileMoneyRoutes } from "./mobile-money-service";
import { registerStockMarketRoutes } from "./stock-market-service";
import { registerMessagesRoutes } from "./routes/messages";
import { createServer, type Server } from "http";
import { setupWebSocket, setWsInstance } from "./ws-server";
import { registerAccountingRoutes } from "./routes/accounting";
import { registerRbacRoutes } from "./routes/rbac";
import { registerAgencesRoutes } from "./routes/agences";
import { registerEmployesRoutes } from "./routes/employes";
import loyaltyRouter from "./routes/loyalty";
import { registerOtpRoutes } from "./routes/otp";
import { registerConfigRoutes, registerSecurityConfigRoutes } from "./routes/config";
import { registerComptesRoutes } from "./routes/comptes";
import { registerReevaluationRoutes } from "./routes/reevaluations";

import { coffreRouter } from "./routes/coffre";
import { caisseAgentRouter } from "./routes/caisse-agent";

export function registerRoutes(app: Express): Server {
  // ... existing routes
  app.use("/api/coffre", coffreRouter);
  app.use("/api/caisse-agent", caisseAgentRouter);
  // Register modular routes
  registerAuthRoutes(app);
  registerClientRoutes(app);
  registerFinanceRoutes(app);
  registerComptesRoutes(app); // Comptes microfinance (dépôt, retrait, blocage, transfert)
  registerTontineRoutes(app);
  registerOperationsRoutes(app); // Agents, prospection
  registerDashboardRoutes(app); // Dashboard statistics
  registerMessagesRoutes(app); // Messaging System
  app.use("/api/hr", hrRouter); // HR Module
  app.use("/api/loyalty", loyaltyRouter); // Loyalty Points System

  registerSettingsRoutes(app); // System settings, reset
  
  // Accounting Module
  registerAccountingRoutes(app);

  // RBAC Module (Roles & Permissions)
  registerRbacRoutes(app);

  // Agences Module (Multi-agency management)
  registerAgencesRoutes(app);

  // Employes Module (nouvelle architecture users/employes)
  registerEmployesRoutes(app);
  
  // OTP Module
  registerOtpRoutes(app);

  // Config Module (Durees suggerees, frequences)
  registerConfigRoutes(app);

  // Security Config Module (OTP bypass, presence verification)
  registerSecurityConfigRoutes(app);

  // Reevaluation Module (Credit reevaluation workflow)
  registerReevaluationRoutes(app);

  // External Services
  registerMobileMoneyRoutes(app);
  registerStockMarketRoutes(app);

  // Other specific legacy or minor routes can be added here or in another module
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
      console.error("Error reading version:", error);
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
