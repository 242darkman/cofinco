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

// Register metrics endpoint (/api/metrics) - before auth to allow Prometheus scraping
registerMetricsRoute(app);


(async () => {
  // Ensure custom SQL functions exist (for db:push compatibility)
  const { ensureCustomFunctions } = await import("./db");
  await ensureCustomFunctions();
  logger.info('Custom SQL functions ensured (get_next_piece_number, etc.)');

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
  logger.info('All cron jobs started: disbursements, repayments, credit-status, migrations, reconciliation, temp-permissions, balance-reconciliation, mm-reconciliation-report, treasury-reconciliation');

  // Start Account Cleanup Cron
  const { accountCleanup } = await import("./services/account-cleanup");
  accountCleanup.start();
  logger.info('Account cleanup job started');

  // Initialize Interest Scheduler (Daily Accrual & Monthly Capitalization)
  // Auto-starts jobs in constructor
  const { interestScheduler } = await import("./services/interest-scheduler");
  logger.info('Interest Scheduler initialized');

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
      logger.info({ port }, `Server listening on port ${port}`);
    },
  );
})();