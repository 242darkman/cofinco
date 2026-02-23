/**
 * ============================================
 * COFINCO Authentication & Session Management
 * ============================================
 *
 * Architecture Overview:
 * ----------------------
 * This module handles authentication, session management, and role-based access control.
 *
 * Authentication Flow:
 * 1. User submits credentials to POST /api/auth/login
 * 2. Credentials are validated against users table (bcrypt hash)
 * 3. Effective role is determined via getEffectiveRole() in routes/auth.ts:
 *    - Checks userRoles table for isPrimary=true (multi-role architecture V3)
 *    - Default fallback: CLIENT
 * 4. Session is created and stored (Redis or PostgreSQL)
 * 5. Session tracking record is created in active_sessions table
 *
 * Multi-Role Architecture V3:
 * ---------------------------
 * Users can now have multiple roles via the user_roles table (source de vérité unique):
 * - One role is marked isPrimary (used by default)
 * - Roles can be scoped to specific agences (agenceId)
 * - employes.roleSystem has been REMOVED - userRoles is the only source
 *
 * Session Storage Strategy:
 * -------------------------
 * - Redis (if REDIS_URL is set): High performance, recommended for production
 * - PostgreSQL (fallback): Good for dev/small deployments
 * - Automatic fallback if Redis connection fails
 *
 * Security Features:
 * ------------------
 * - bcrypt password hashing (cost factor 10)
 * - HTTP-only, Secure cookies in production
 * - Session rolling (refreshes TTL on every request)
 * - Brute force protection via login_attempts table
 * - Account locking after failed attempts
 * - Session activity tracking with throttling
 *
 * Related Files:
 * --------------
 * - routes/auth.ts: Login/logout endpoints, getEffectiveRole()
 * - session-tracker.ts: Active session monitoring
 * - audit.ts: Login attempt logging
 * - shared/schema/auth.ts: users, userRoles, activeSessions tables
 * - shared/types/roles.ts: SystemRole enum and helpers
 *
 * Environment Variables:
 * ----------------------
 * - SESSION_SECRET: Secret for signing session cookies (required in production)
 * - REDIS_URL: Redis connection URL (optional, enables Redis session store)
 * - DATABASE_URL: PostgreSQL connection URL
 * - NODE_ENV: 'production' enables secure cookies and __Host- prefix
 */

import { Express, Request, Response, NextFunction } from 'express';
import session from 'express-session';
import bcrypt from 'bcrypt';
import { storage } from './storage';
import type { User } from '@shared/schema';
import { SystemRole } from '@shared/types/roles';
import pgSession from 'connect-pg-simple';
import pg from 'pg';
import { createLogger } from './lib/logger';

const logger = createLogger('Auth');

// ============================================
// Session Configuration for Microfinance
// ============================================
//
// Security considerations for financial applications:
// - Inactivity timeout: Balance between security and UX
// - Rolling sessions: Reset timer on each activity
// - Absolute timeout: Force re-auth after max time (implemented via session-tracker)
//
// Industry standards:
// - Banking apps: 15-30 min inactivity
// - Microfinance (field agents): 2-4 hours (longer due to rural connectivity)
// - Back-office admin: 1-2 hours
//
// Our configuration:
// - 2 hours inactivity (rolling) - Good for field agents with intermittent connectivity
// - Session refreshes on every request (rolling: true)
// - Absolute timeout of 12 hours handled by session-tracker

/**
 * Session timeout configuration (in milliseconds)
 */
export const SESSION_CONFIG = {
  /** Inactivity timeout - session expires after this time without activity */
  INACTIVITY_TIMEOUT_MS: 2 * 60 * 60 * 1000, // 2 hours

  /** Same value in seconds for Redis TTL */
  INACTIVITY_TIMEOUT_SEC: 2 * 60 * 60, // 2 hours

  /** Absolute session timeout - force re-login regardless of activity (handled by session-tracker) */
  ABSOLUTE_TIMEOUT_MS: 12 * 60 * 60 * 1000, // 12 hours (workday)

  /** Warning before session expires (shown to user) */
  WARNING_BEFORE_EXPIRY_MS: 5 * 60 * 1000, // 5 minutes
} as const;

// ============================================
// Session Store Configuration
// ============================================
// Supports both Redis (production haute charge) and PostgreSQL (dev/small prod)
// Redis is auto-selected when REDIS_URL env var is set

const PostgresStore = pgSession(session);

// Pool dédié aux sessions avec configuration robuste
// Séparé du pool principal pour éviter les contentions
const sessionPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  // Sizing pour les sessions
  max: 10,                        // Maximum de connexions pour les sessions
  min: 2,                         // Minimum maintenu
  // Timeouts stricts
  idleTimeoutMillis: 60000,       // Fermer après 1 min d'inactivité
  connectionTimeoutMillis: 5000,  // 5s max pour se connecter
  // Résilience
  allowExitOnIdle: false,
});

// Gestion des erreurs du pool de session
sessionPool.on('error', (err) => {
  logger.error({ err: err.message }, '[Session Pool] Unexpected error on idle client');
});

sessionPool.on('connect', () => {
  logger.debug('[Session Pool] New client connected');
});

// Alias pour compatibilité (utilisé par le session store)
const pool = sessionPool;

/**
 * Type for session store - either Redis or PostgreSQL
 */
type SessionStore = session.Store;

// Variable pour suivre le client Redis (pour reconnexion)
let redisClient: any = null;

/**
 * Creates the appropriate session store based on environment configuration.
 *
 * Priority:
 * 1. Redis (if REDIS_URL is set) - Recommended for production (10x plus rapide)
 * 2. PostgreSQL (fallback) - Good for dev/small deployments
 *
 * @returns Promise<SessionStore> The configured session store
 */
async function createSessionStore(): Promise<SessionStore> {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    try {
      const { createClient } = await import('redis') as any;
      const { default: RedisStore } = await import('connect-redis') as any;

      // Configuration Redis robuste avec reconnexion automatique
      redisClient = createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries: number) => {
            if (retries > 10) {
              logger.error('[Redis] Max reconnection attempts reached');
              return new Error('Max reconnection attempts reached');
            }
            // Délai exponentiel: 100ms, 200ms, 400ms, ... max 30s
            const delay = Math.min(100 * Math.pow(2, retries), 30000);
            logger.warn({ retries, delay }, '[Redis] Reconnecting...');
            return delay;
          },
          connectTimeout: 10000, // 10s timeout
        },
      });

      // Gestion des événements Redis
      redisClient.on('error', (err: Error) => {
        logger.error({ err: err.message }, '[Redis] Connection error');
      });

      redisClient.on('connect', () => {
        logger.info('[Redis] Connected successfully');
      });

      redisClient.on('reconnecting', () => {
        logger.warn('[Redis] Reconnecting...');
      });

      redisClient.on('ready', () => {
        logger.info('[Redis] Ready to accept commands');
      });

      await redisClient.connect();

      logger.info('[Session] Using Redis store (high performance mode)');

      return new RedisStore({
        client: redisClient,
        prefix: 'cofin:sess:',
        ttl: SESSION_CONFIG.INACTIVITY_TIMEOUT_SEC,
        // Désactiver les touches pour éviter les race conditions
        disableTouch: false,
      });
    } catch (error) {
      logger.warn({ err: error }, '[Redis] Connection failed, falling back to PostgreSQL');
    }
  }

  // PostgreSQL fallback avec gestion d'erreur améliorée
  logger.info('[Session] Using PostgreSQL store');

  const pgStore = new PostgresStore({
    pool,
    tableName: 'session',
    createTableIfMissing: false,
    pruneSessionInterval: 60,
    errorLog: (err: Error) => {
      logger.error({ err: err.message }, '[Session Store] PostgreSQL error');
    },
  });

  pgStore.on('error', (err: Error) => {
    logger.error({ err: err.message }, '[Session Store] Store error event');
  });

  return pgStore;
}

/**
 * Ferme proprement le client Redis (pour graceful shutdown)
 */
export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    logger.info('[Redis] Closing connection...');
    await redisClient.quit();
    logger.info('[Redis] Connection closed');
  }
}

/**
 * Retourne le client Redis connecté (ou null si PostgreSQL store est utilisé).
 * Utilisé par session-tracker pour détruire les clés Redis directement.
 */
export function getRedisClient(): any | null {
  return redisClient;
}

declare module 'express-session' {
  interface SessionData {
    userId: string;
    user: {
      id: string;
      username: string;
      nom: string;
      prenom: string | null;
      role: SystemRole;
      agence?: string | null;
      agenceId?: string;
      email?: string;
      telephone?: string;
      mustChangePassword?: boolean;
      statut?: string;
      photoProfile?: string | null;
    };
    caisseAuthorized?: boolean;
    caisseAuthExpiry?: number;
  }
}

export let sessionMiddleware: any;

/**
 * Session store type indicator - useful for debugging and monitoring
 */
export let sessionStoreType: 'redis' | 'postgresql' = 'postgresql';

export async function setupAuth(app: Express) {
  const isProduction = process.env.NODE_ENV === 'production';

  // Trust first proxy (nginx, Cloudflare, etc.)
  app.set('trust proxy', 1);

  // Create PostgreSQL session table (needed even with Redis for fallback)
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
    ) WITH (OIDS=FALSE);
  `;

  const createIndexSQL = `
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
  `;

  // Ensure session table exists before starting
  try {
    await pool.query(createTableSQL);
    await pool.query(createIndexSQL);
    logger.info('PostgreSQL session table ready');
  } catch (err) {
    logger.error({ err }, 'Failed to create session table');
  }

  // Create the appropriate session store (Redis or PostgreSQL)
  const store = await createSessionStore();

  // Detect which store we're using
  sessionStoreType = process.env.REDIS_URL ? 'redis' : 'postgresql';

  // Configuration de session robuste
  if (!process.env.SESSION_SECRET && isProduction) {
    logger.error('FATAL: SESSION_SECRET must be set in production. Refusing to start with default secret.');
    process.exit(1);
  }
  const sessionSecret = process.env.SESSION_SECRET || 'dev-only-secret-do-not-use-in-prod';

  sessionMiddleware = session({
    store,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true, // Refresh session with every request (réinitialise le maxAge)
    name: isProduction ? '__Host-cofin_sess' : 'cofin_sess',
    proxy: true,
    cookie: {
      secure: isProduction,
      httpOnly: true,
      maxAge: SESSION_CONFIG.INACTIVITY_TIMEOUT_MS, // 2 heures (rolling réinitialise à chaque requête)
      sameSite: 'lax', // Permet les redirections depuis sites externes
      path: '/', // S'assurer que le cookie est envoyé pour toutes les routes
    },
    // Gérer les erreurs de session sans crasher le serveur
    unset: 'destroy', // Détruire la session quand req.session = null
  });

  // Wrapper pour gérer les erreurs de session
  const safeSessionMiddleware = (req: any, res: any, next: any) => {
    sessionMiddleware(req, res, (err: any) => {
      if (err) {
        logger.error({ err: err.message, path: req.path }, '[Session] Middleware error');
        // Ne pas crasher - continuer sans session
        return next();
      }
      next();
    });
  };

  // Skip session middleware for webhook endpoints (external providers like MTN/Airtel)
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/webhooks')) {
      return next();
    }
    return safeSessionMiddleware(req, res, next);
  });

  logger.info({ sessionStoreType }, 'Session middleware configured');
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePasswords(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId || !req.session.user) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  // Populate req.user for route handlers
  req.user = req.session.user;
  next();
}

export const ROLES = SystemRole;

export async function loginUser(username: string, password: string): Promise<User | null> {
  const user = await storage.getUserByUsername(username);
  if (!user || !user.password) return null;
  
  const isValid = await comparePasswords(password, user.password);
  if (!isValid) return null;
  
  return user;
}

/**
 * Register a new user.
 * Note: Role is now managed via userRoles table, not users.role
 * Use createEmployeWithUser in storage/employes.ts for employees with roles.
 */
export async function registerUser(userData: {
  username: string;
  password: string;
  nom: string;
  prenom?: string | null;
  email?: string | null;
  telephone?: string | null;
  photoProfile?: string | null;
  statut?: string;
}): Promise<User> {
  const hashedPassword = await hashPassword(userData.password);
  return storage.createUser({
    ...userData,
    password: hashedPassword,
  });
}
