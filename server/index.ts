import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { setupAuth, hashPassword } from "./auth";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { log, logError, logWarn } from "./logger";
import { scheduleAuditPurge } from "./audit";
import { sessionActivityMiddleware, scheduleSessionCleanup } from "./session-tracker";
import { setDbContext } from "./middleware/db-context";
import {
  helmetConfig,
  authLimiter,
  apiLimiter,
  sensitiveOpsLimiter,
  uploadLimiter,
  hideServerInfo,
  additionalSecurityHeaders,
} from "./middleware/security";
import { startOutboxWorker, stopOutboxWorker } from "./services/outbox-worker";
import { startNotificationWorker } from "./services/notifications/notification-worker";
import { startSessionCleanupCron, stopSessionCleanupCron } from "./cron/session-cleanup";
import { startAutomaticTransfersCron } from "./cron/automatic-transfers";
import { startScheduledAccountTransfersCron } from "./cron/scheduled-account-transfers";
import { startScheduledDisbursementsCron } from "./cron/scheduled-disbursements";
import { SystemRole } from "@shared/types/roles";
import { startAutomaticRepaymentsCron } from "./cron/automatic-repayments";
import { startCreditStatusUpdateCron } from "./cron/update-credit-status";
import { startScheduledMigrationsCron } from "./cron/scheduled-migrations";
import { startPaymentReconciliationCron } from "./cron/payment-reconciliation";
import { StorageService } from "./services/storage-service";

const app = express();
// const httpServer = createServer(app); // Removed to avoid duplicate server creation

// Trust proxy for proper rate limiting behind reverse proxy
app.set('trust proxy', 1);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// ========== SECURITY MIDDLEWARE (Bank-grade) ==========
// All security configuration is centralized in ./middleware/security.ts

// 1. Hide server info (remove X-Powered-By, Server headers)
app.use(hideServerInfo);

// 2. Helmet security headers (CSP, HSTS, XSS protection, etc.)
app.use(helmetConfig);

// 3. Additional security headers (Permissions-Policy, Cache-Control for API)
app.use(additionalSecurityHeaders);

// ========== COMPRESSION (Gzip/Brotli for slow connections) ==========
// Reduces payload size by 60-80% - Critical for 3G/slow networks
app.use(compression({
  level: 6, // Good balance between speed and compression ratio
  threshold: 1024, // Only compress responses > 1KB
  filter: (req, _res) => {
    // Don't compress WebSocket upgrade requests
    if (req.headers.upgrade === 'websocket') {
      return false;
    }
    // Don't compress already compressed content types
    const contentType = req.headers['accept'] || '';
    if (contentType.includes('image/') || contentType.includes('video/')) {
      return false;
    }
    // Use compression's default filter for everything else
    return compression.filter(req, _res);
  }
}));

// ========== RATE LIMITING (Protection against brute force & DDoS) ==========
// Limiters configured in ./middleware/security.ts with the following limits:
// - authLimiter: 5 attempts / 15 min (login endpoints)
// - apiLimiter: 200 requests / 15 min (general API)
// - sensitiveOpsLimiter: 20 ops / min (financial transactions)
// - uploadLimiter: 30 uploads / min (file uploads)

app.use("/api/", apiLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/credits", sensitiveOpsLimiter);
app.use("/api/remboursements", sensitiveOpsLimiter);
app.use("/api/transactions-epargne", sensitiveOpsLimiter);
app.use("/api/transferts", sensitiveOpsLimiter);
app.use("/api/storage/entity/upload", uploadLimiter);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
    limit: "10mb",
  }),
);

app.use(express.urlencoded({ extended: false, limit: "10mb" }));

// Auth setup moved to async block below

// Session activity tracking middleware (updates last_activity in active_sessions)
// Note: sessionActivityMiddleware will be added after setupAuth in the async block

// log, logError, logWarn are now imported from ./logger
export { log, logError, logWarn } from "./logger";

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});


(async () => {
  // Setup auth first (creates session table and middleware)
  await setupAuth(app);

  // Initialize MinIO storage buckets
  try {
    await StorageService.initializeBuckets();
  } catch (error) {
    logWarn('MinIO bucket initialization failed - file uploads may not work', 'storage');
  }

  // Session activity tracking middleware (must be after auth setup)
  app.use(sessionActivityMiddleware);

  // RLS Database Context middleware (builds context for Row Level Security)
  // Note: The actual RLS enforcement requires using withDbContext() or withDbContextTransaction()
  // in route handlers for critical operations. This middleware just prepares the context.
  app.use(setDbContext);

  // Schedule automatic audit log purge (every 3 months retention)
  scheduleAuditPurge();

  // Schedule session cleanup (remove expired sessions every 5 minutes)
  scheduleSessionCleanup();

  const httpServer = registerRoutes(app);

  // Start the outbox worker for reliable real-time event publishing
  startOutboxWorker();
  log('[Outbox] Real-time event worker started');

  // Start the notification delivery worker (SMS/Email queue processor)
  startNotificationWorker();
  log('[NotifWorker] Notification delivery worker started');

  // Start the caisse session cleanup cron job (closes expired sessions, monitors risky ones)
  startSessionCleanupCron();
  log('[Cron] Caisse session cleanup job started');

  // Start the automatic transfers cron job (daily at 2 AM)
  startAutomaticTransfersCron();
  startScheduledAccountTransfersCron();
  log('[Cron] Automatic transfers job started');

  // Start the scheduled disbursements cron job (daily at 9 AM)
  startScheduledDisbursementsCron();
  startAutomaticRepaymentsCron(); // Start Auto Repayments
  startCreditStatusUpdateCron(); // Start Credit Status Update
  startScheduledMigrationsCron(); // Start Agency Migration Scheduler
  startPaymentReconciliationCron(); // Start Mobile Money Payment Reconciliation
  log('[Cron] Scheduled disbursements job started');
  log('[Cron] Automatic repayments job started');
  log('[Cron] Credit status update job started');
  log('[Cron] Scheduled agency migrations job started');
  log('[Cron] Payment reconciliation job started');

  // Start Account Cleanup Cron
  const { accountCleanup } = await import("./services/account-cleanup");
  accountCleanup.start();
  log('[Cron] Account cleanup job started');

  // Initialize Interest Scheduler (Daily Accrual & Monthly Capitalization)
  // Auto-starts jobs in constructor
  const { interestScheduler } = await import("./services/interest-scheduler");
  log('[Cron] Interest Scheduler initialized');

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
// Force reload Mon Jan 12 11:32:54 CET 2026
