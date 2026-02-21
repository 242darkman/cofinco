import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import compression from "compression";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { setupAuth } from "./auth";
import { logger, requestLoggerMiddleware } from "./lib/logger";
import { metricsMiddleware, registerMetricsRoute } from "./lib/metrics";
import { scheduleAuditPurge } from "./audit";
import { sessionActivityMiddleware, scheduleSessionCleanup, sessionGuard } from "./session-tracker";
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
import { csrfProtection } from "./middleware/csrf";
import { etagMiddleware } from "./middleware/etag";
import { eq } from "drizzle-orm";
import { startOutboxWorker } from "./services/outbox-worker";
import { startNotificationWorker } from "./services/notifications/notification-worker";
import { startReminderProcessor } from "./services/notifications/reminder-processor";
import { SmtpEmailProvider } from "./services/notifications/providers/email.provider";
import { startSessionCleanupCron } from "./cron/session-cleanup";
import { startAutomaticTransfersCron } from "./cron/automatic-transfers";
import { startScheduledAccountTransfersCron } from "./cron/scheduled-account-transfers";
import { startScheduledDisbursementsCron } from "./cron/scheduled-disbursements";
import { startAutomaticRepaymentsCron } from "./cron/automatic-repayments";
import { startCreditStatusUpdateCron } from "./cron/update-credit-status";
import { startScheduledMigrationsCron } from "./cron/scheduled-migrations";
import { startPaymentReconciliationCron } from "./cron/payment-reconciliation";
import { startTempPermissionExpiryCron } from "./cron/temp-permission-expiry";
import { startBalanceReconciliationCron } from "./cron/balance-reconciliation";
import { startReconciliationReportCron } from "./cron/mm-reconciliation-report";
import { startTreasuryReconciliationCron } from "./cron/treasury-reconciliation";
import { startLateInstallmentsJob } from "./cron/late-installments-job";
import { scheduleGlReconciliationMonitoring } from "./cron/gl-reconciliation-monitor";
import { scheduleAutoFix } from "./cron/gl-auto-fix";
import { startAccessCodeCleanupCron } from "./cron/access-code-cleanup";
import { startDailyIntegrityAuditCron } from "./cron/daily-integrity-audit";
import { startScoreRecalculationCron } from "./cron/score-recalculation";
import { startAutoLiftSuspensionCron } from "./cron/auto-lift-suspension";
import { startInterestAccrualCron } from "./cron/interest-accrual";
import { startHrAlertsGeneratorCron } from "./cron/hr-alerts-generator";
import { StorageService } from "./services/storage-service";

const app = express();

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

// 4. CSRF protection (Origin/Referer validation for state-changing requests)
app.use(csrfProtection);

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

app.use("/api/", (req, res, next) => {
  // Exclude webhook endpoints from rate limiting (external providers)
  if (req.originalUrl.startsWith('/api/webhooks')) {
    return next();
  }
  return apiLimiter(req, res, next);
});
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

// Cookie parser for refresh tokens (remember-me functionality)
app.use(cookieParser());

// Auth setup moved to async block below

// Session activity tracking middleware (updates last_activity in active_sessions)
// Note: sessionActivityMiddleware will be added after setupAuth in the async block

// Pino request logging middleware (replaces manual logging)
app.use(requestLoggerMiddleware());

// Prometheus metrics middleware (collects HTTP metrics)
app.use(metricsMiddleware());

// ETag for conditional GET requests (bandwidth optimization)
app.use("/api", etagMiddleware());

// Register metrics endpoint (/api/metrics) - before auth to allow Prometheus scraping
registerMetricsRoute(app);

// ========== HEALTH CHECK ENDPOINT ==========
// Simple health check that verifies DB connectivity (no auth required)
// Supports both GET (full response) and HEAD (lightweight ping) methods

// HEAD method for lightweight pings (no body, just status)
app.head("/api/health", async (_req, res) => {
  const { checkDatabaseHealth } = await import("./db");
  const dbHealth = await checkDatabaseHealth();
  const httpStatus = dbHealth.healthy ? 200 : 503;
  res.status(httpStatus).end();
});

// GET method for full health check response
app.get("/api/health", async (_req, res) => {
  const startTime = Date.now();
  const { checkDatabaseHealth } = await import("./db");
  const dbHealth = await checkDatabaseHealth();
  const responseTime = Date.now() - startTime;

  const status = dbHealth.healthy ? "healthy" : "unhealthy";
  const httpStatus = dbHealth.healthy ? 200 : 503;

  res.status(httpStatus).json({
    status,
    timestamp: new Date().toISOString(),
    // Server time in ms for client-side latency calculation
    serverTime: Date.now(),
    // Response time of this health check (includes DB ping)
    responseTime,
    version: process.env.npm_package_version || "1.0.0",
    uptime: Math.floor(process.uptime()),
    database: dbHealth,
  });
});

(async () => {
  // Ensure custom SQL functions exist
  // In Docker, db-init handles this via direct PostgreSQL connection (db:5432).
  // Only run here for local dev (npm run dev) where DATABASE_URL points to PostgreSQL directly.
  // Through pgbouncer (port 6432, transaction mode), DDL operations fail and poison the pool.
  const dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl.includes(':6432')) {
    try {
      const { ensureCustomFunctions } = await import("./db");
      await ensureCustomFunctions();
      logger.info('Custom SQL functions ensured');
    } catch (error) {
      logger.warn({ err: error }, 'Custom SQL functions check failed');
    }
  } else {
    logger.info('Skipping ensureCustomFunctions (pgbouncer detected — handled by db-init)');
  }

  // Load currency presets + active currency from DB (overrides compile-time defaults)
  try {
    const { db } = await import("./db");
    const { setActiveCurrencyByCode, setPresetsCache } = await import("@shared/config/currency");
    const { currencyPresets: cpTable } = await import("@shared/schema/settings");

    // Load all active presets into runtime cache
    const presetRows = await db.select().from(cpTable).where(eq(cpTable.actif, true)).orderBy(cpTable.ordre);
    if (presetRows.length > 0) {
      setPresetsCache(presetRows.map((r: typeof cpTable.$inferSelect) => ({
        code: r.code,
        symbol: r.symbol,
        symbolPosition: r.symbolPosition as "before" | "after",
        locale: r.locale,
        decimals: r.decimals,
      })));
      logger.info(`Loaded ${presetRows.length} currency presets from DB`);
    }

    // Set active currency from system_settings
    const row = await db.query.systemSettings.findFirst();
    if (row?.devise && setActiveCurrencyByCode(row.devise)) {
      logger.info(`Currency set to ${row.devise} from system_settings`);
    }
  } catch (error) {
    logger.warn({ err: error }, 'Currency config load failed — using compile-time defaults');
  }

  // GL STRICT mode boot guard
  const glMode = process.env.GL_POSTING_MODE || 'STRICT';
  if (glMode === 'LENIENT') {
    logger.warn('⚠️  GL_POSTING_MODE=LENIENT — les opérations sans règle comptable ne seront PAS bloquées');
  } else {
    logger.info('GL_POSTING_MODE=STRICT — toute opération sans règle comptable sera bloquée avec rollback');
  }

  // Sync RBAC permissions from config to DB (idempotent upsert)
  // Ensures permission codes like comptes.suspend, comptes.close_initiate exist
  // and role_permissions are in sync with shared/config/rbac.ts
  try {
    const { seedRBAC } = await import('../seeds/seed-rbac-logic');
    await seedRBAC();
    logger.info('RBAC permissions synced from config');
  } catch (error) {
    logger.warn({ err: error }, 'RBAC sync failed — permissions may be stale');
  }

  // Setup auth first (creates session table and middleware)
  await setupAuth(app);

  // Initialize MinIO storage buckets
  try {
    await StorageService.initializeBuckets();
  } catch (error) {
    logger.warn('MinIO bucket initialization failed - file uploads may not work');
  }

  // Session activity tracking middleware (must be after auth setup)
  app.use(sessionActivityMiddleware);

  // Global Session Guard - validates session is still active in database for all authenticated API routes
  // Skip: login, logout, /me (handled internally), webhooks (external), public endpoints
  const SESSION_GUARD_SKIP_PATHS = [
    '/api/auth/login',
    '/api/auth/logout',
    '/api/auth/me',
    '/api/auth/refresh', // Remember-me token refresh (no active session required)
    '/api/auth/revoke-remember-me',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/register',
    '/api/webhooks',
    '/api/health',
    '/api/maintenance-mode/status',
    '/api/otp/verify',
  ];

  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    // Skip paths that don't require session validation
    const shouldSkip = SESSION_GUARD_SKIP_PATHS.some(path => req.path.startsWith(path.replace('/api', '')));
    if (shouldSkip) {
      return next();
    }

    // Skip if no session (let the route handler return 401)
    if (!req.session?.userId) {
      return next();
    }

    // Apply session guard for authenticated requests
    return sessionGuard(req, res, next);
  });

  // RLS Database Context middleware (builds context for Row Level Security)
  // Note: The actual RLS enforcement requires using withDbContext() or withDbContextTransaction()
  // in route handlers for critical operations. This middleware just prepares the context.
  app.use(setDbContext);

  // Schedule automatic audit log purge (every 3 months retention)
  scheduleAuditPurge();

  // Schedule session cleanup (remove expired sessions every 5 minutes)
  scheduleSessionCleanup();

  const httpServer = registerRoutes(app);

  // ============================================================
  // CRON JOBS & BACKGROUND WORKERS
  // When DISABLE_CRON_JOBS=true, this instance runs as a pure
  // API server (stateless, horizontally scalable).
  // A dedicated "worker" instance runs with DISABLE_CRON_JOBS=false.
  // ============================================================
  const cronDisabled = process.env.DISABLE_CRON_JOBS === 'true';

  if (cronDisabled) {
    logger.warn('DISABLE_CRON_JOBS=true — running as stateless API server (no cron jobs, no background workers)');
  } else {
    // Start the outbox worker for reliable real-time event publishing
    startOutboxWorker();
    logger.info('Outbox real-time event worker started');

    // Start the notification delivery worker (SMS/Email queue processor)
    startNotificationWorker();
    logger.info('Notification delivery worker started');

    // Start the reminder processor (polls notification_schedules for due reminders)
    startReminderProcessor(60_000); // Every 60 seconds
    logger.info('Scheduled reminder processor started');

    // Verify SMTP email provider connectivity
    const smtpProvider = new SmtpEmailProvider();
    smtpProvider.verify().then(({ ok, message }) => {
      if (ok) {
        logger.info({ provider: 'SMTP' }, message);
      } else {
        logger.warn({ provider: 'SMTP' }, message);
      }
    });

    // Start the caisse session cleanup cron job (closes expired sessions, monitors risky ones)
    startSessionCleanupCron();
    logger.info('Caisse session cleanup job started');

    // Start the automatic transfers cron job (daily at 2 AM)
    startAutomaticTransfersCron();
    startScheduledAccountTransfersCron();
    logger.info('Automatic transfers job started');

    // Start the scheduled disbursements cron job (daily at 9 AM)
    startScheduledDisbursementsCron();
    startAutomaticRepaymentsCron();
    startCreditStatusUpdateCron();
    startScheduledMigrationsCron();
    startPaymentReconciliationCron();
    startTempPermissionExpiryCron();
    startBalanceReconciliationCron();
    startReconciliationReportCron();
    startTreasuryReconciliationCron();
    startAccessCodeCleanupCron();

    // Start GL Reconciliation Monitoring (hourly check)
    scheduleGlReconciliationMonitoring(60);
    logger.info('GL reconciliation monitoring started (hourly)');

    // Start GL Auto-Fix (daily at 3 AM - semi-automatic correction for small discrepancies)
    scheduleAutoFix();
    logger.warn('GL auto-fix enabled: automatically corrects discrepancies < 10k FCFA (daily at 3 AM)');

    // Start Late Installments Job (toutes les heures pour marquer les échéances en retard)
    const lateInstallmentsJob = startLateInstallmentsJob();
    lateInstallmentsJob.start();
    logger.info('Late installments marking job started (hourly)');

    // Start Daily Integrity Audit (4 AM — detects mouvements without GL, balance mismatches)
    startDailyIntegrityAuditCron();
    logger.info('Daily integrity audit cron started (04:00)');

    // Start Auto-Lift Suspension Cron (every 5 min — lifts expired suspensions with autoLift=true)
    startAutoLiftSuspensionCron();
    logger.info('Auto-lift suspension cron started (every 5 min)');

    // Start Interest Accrual Cron (SYSCOHADA art. 46 — D 2718 / C 7071 monthly)
    startInterestAccrualCron();
    logger.info('Interest accrual cron started (1st of month at 02:00)');

    // Start Score Recalculation Cron (weekly — keeps tenure-based scores fresh)
    startScoreRecalculationCron();
    logger.info('Score recalculation cron started (Sunday 03:00)');

    // Start HR Alerts Generator Cron (daily at 06:00 — scans for upcoming HR events)
    startHrAlertsGeneratorCron();
    logger.info('HR alerts generator cron started (daily 06:00)');

    logger.info('All cron jobs started: disbursements, repayments, credit-status, migrations, reconciliation, temp-permissions, balance-reconciliation, mm-reconciliation-report, treasury-reconciliation, gl-reconciliation-monitor, gl-auto-fix, late-installments, daily-integrity-audit, auto-lift-suspension');

    // Start Account Cleanup Cron
    const { accountCleanup } = await import("./services/account-cleanup");
    accountCleanup.start();
    logger.info('Account cleanup job started');

    // Initialize Interest Scheduler (Daily Accrual & Monthly Capitalization)
    const { interestScheduler } = await import("./services/interest-scheduler");
    logger.info('Interest Scheduler initialized');

    // Initialize Maintenance Fee Scheduler (Monthly account maintenance fees)
    const { maintenanceFeeScheduler } = await import("./services/maintenance-fee-scheduler");
    logger.info('Maintenance Fee Scheduler initialized');
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    // Never expose internal error details to clients in production
    const isProduction = process.env.NODE_ENV === 'production';
    const message = isProduction && status >= 500
      ? "Erreur interne du serveur"
      : (err.message || "Internal Server Error");

    logger.error({ err, status }, 'Unhandled error');
    res.status(status).json({ message });
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
      logger.info({ port }, `Server listening on port ${port}`);
    },
  );

  // ========== GRACEFUL SHUTDOWN ==========
  // Properly close all connections when the server is stopped
  const gracefulShutdown = async (signal: string) => {
    logger.info({ signal }, `Received ${signal}. Starting graceful shutdown...`);

    // Stop accepting new connections
    httpServer.close(() => {
      logger.info('HTTP server closed');
    });

    try {
      // Close Redis client (if used)
      const { closeRedisClient } = await import("./auth");
      await closeRedisClient();

      // Close database pool
      const { closePool } = await import("./db");
      await closePool();
      logger.info('All connections closed');

      // Give time for pending requests to complete (max 10 seconds)
      setTimeout(() => {
        logger.warn('Forced shutdown after timeout');
        process.exit(0);
      }, 10000);

      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
})();