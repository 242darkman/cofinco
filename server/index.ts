import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { setupAuth, hashPassword } from "./auth";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { log, logError, logWarn } from "./logger";
import { scheduleAuditPurge } from "./audit";
import { sessionActivityMiddleware, scheduleSessionCleanup } from "./session-tracker";
import { startOutboxWorker, stopOutboxWorker } from "./services/outbox-worker";
import { startSessionCleanupCron, stopSessionCleanupCron } from "./cron/session-cleanup";
import { startAutomaticTransfersCron } from "./cron/automatic-transfers";
import { startScheduledAccountTransfersCron } from "./cron/scheduled-account-transfers";
import { startScheduledDisbursementsCron } from "./cron/scheduled-disbursements";
import { SystemRole } from "@shared/types/roles";
import { startAutomaticRepaymentsCron } from "./cron/automatic-repayments";
import { startCreditStatusUpdateCron } from "./cron/update-credit-status";
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

// ========== SECURITY HEADERS (Bank-grade) ==========
// Note: In development, unsafe-inline/unsafe-eval are needed for React/Vite HMR
// In production builds, CSP can be stricter with nonce-based policies
const isProduction = process.env.NODE_ENV === 'production';

app.use(helmet({
  contentSecurityPolicy: isProduction ? {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "https://unpkg.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", "https:", "wss:"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: [],
    },
  } : {
    // Development mode - allow inline for HMR
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "https://unpkg.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      connectSrc: ["'self'", "https:", "wss:"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  // Additional security headers
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  noSniff: true,
  xssFilter: true,
}));

// ========== RATE LIMITING (Protection against brute force) ==========
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // 500 requests per window
  message: { error: "Trop de requêtes, veuillez réessayer plus tard" },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 login attempts per window
  message: { error: "Trop de tentatives de connexion, veuillez réessayer dans 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

const sensitiveOperationsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 sensitive operations per minute
  message: { error: "Opération trop fréquente, veuillez patienter" },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/", generalLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/credits", sensitiveOperationsLimiter);
app.use("/api/remboursements", sensitiveOperationsLimiter);
app.use("/api/transactions-epargne", sensitiveOperationsLimiter);

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

// Function to seed admin user on startup
async function seedAdminUser() {
  try {
    const existingAdmin = await db.select().from(users).where(eq(users.username, 'admin'));
    
    if (existingAdmin.length === 0) {
      log('Creating admin user...', 'seed');
      const hashedPassword = await hashPassword('admin123');
      
      await db.insert(users).values({
        username: 'admin',
        password: hashedPassword,
        nom: 'Administrateur',
        prenom: 'Système',
        email: 'admin@cofin.com',
        role: SystemRole.ADMIN,
        agence: 'Siège',
        statut: 'Actif',
      });
      
      log('Admin user created: admin/admin123', 'seed');
    }
  } catch (error) {
    logError('Error seeding admin user', error instanceof Error ? error : undefined, 'seed');
  }
}

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

  // Schedule automatic audit log purge (every 3 months retention)
  scheduleAuditPurge();

  // Schedule session cleanup (remove expired sessions every 5 minutes)
  scheduleSessionCleanup();

  const httpServer = registerRoutes(app);

  // Start the outbox worker for reliable real-time event publishing
  startOutboxWorker();
  log('[Outbox] Real-time event worker started');

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
  log('[Cron] Scheduled disbursements job started');
  log('[Cron] Automatic repayments job started');
  log('[Cron] Credit status update job started');

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
