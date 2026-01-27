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
import { SystemRole, normalizeRole as normalizeSystemRole } from '@shared/types/roles';
import pgSession from 'connect-pg-simple';
import pg from 'pg';

// ============================================
// Session Store Configuration
// ============================================
// Supports both Redis (production haute charge) and PostgreSQL (dev/small prod)
// Redis is auto-selected when REDIS_URL env var is set

const PostgresStore = pgSession(session);
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Type for session store - either Redis or PostgreSQL
 */
type SessionStore = session.Store;

/**
 * Creates the appropriate session store based on environment configuration.
 *
 * Priority:
 * 1. Redis (if REDIS_URL is set) - Recommended for production
 * 2. PostgreSQL (fallback) - Good for dev/small deployments
 *
 * @returns Promise<SessionStore> The configured session store
 */
async function createSessionStore(): Promise<SessionStore> {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    try {
      // Dynamic import to avoid requiring redis when not used
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { createClient } = await import('redis') as any;
      const { default: RedisStore } = await import('connect-redis') as any;

      const redisClient = createClient({ url: redisUrl });

      redisClient.on('error', (err: Error) => {
        console.error('[Redis] Connection error:', err);
      });

      redisClient.on('connect', () => {
        console.log('[Redis] Connected successfully');
      });

      await redisClient.connect();

      console.log('[Auth] Using Redis session store (high performance mode)');

      return new RedisStore({
        client: redisClient,
        prefix: 'cofin:sess:',
        ttl: 30 * 60, // 30 minutes in seconds
      });
    } catch (error) {
      console.warn('[Auth] Redis connection failed, falling back to PostgreSQL:', error);
      // Fall through to PostgreSQL
    }
  }

  // PostgreSQL fallback
  console.log('[Auth] Using PostgreSQL session store');
  return new PostgresStore({
    pool,
    tableName: 'session',
    createTableIfMissing: false, // We create it manually in setupAuth
  });
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
    console.log('[Auth] PostgreSQL session table ready');
  } catch (err) {
    console.error("Failed to create session table:", err);
  }

  // Create the appropriate session store (Redis or PostgreSQL)
  const store = await createSessionStore();

  // Detect which store we're using
  sessionStoreType = process.env.REDIS_URL ? 'redis' : 'postgresql';

  sessionMiddleware = session({
    store,
    secret: process.env.SESSION_SECRET || 'cofin-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    rolling: true, // Refresh session with every request
    name: isProduction ? '__Host-cofin_sess' : 'cofin_sess', // __Host- prefix requires Secure attribute
    proxy: true,
    cookie: {
      secure: isProduction, // __Host- requires true, but localhost dev might be http
      httpOnly: true,
      maxAge: 30 * 60 * 1000, // 30 minutes
      sameSite: 'lax',
      // Don't set domain - let browser handle it automatically
    },
  });

  // Skip session middleware for webhook endpoints (external providers like MTN/Airtel)
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/webhooks')) {
      return next();
    }
    return sessionMiddleware!(req, res, next);
  });

  console.log(`[Auth] Session middleware configured (store: ${sessionStoreType})`);
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
  (req as any).user = req.session.user;
  next();
}

export const ROLES = SystemRole;

// NOTE: requireRole has been replaced by requireAbility from server/authorization
// Use: attachAbility, requireAbility(Actions.X, Subjects.Y) instead

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
