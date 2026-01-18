import { Express, Request, Response, NextFunction } from 'express';
import session from 'express-session';
import bcrypt from 'bcrypt';
import { storage } from './storage';
import type { User } from '@shared/schema';
import { SystemRole, normalizeRole as normalizeSystemRole } from '@shared/types/roles';
import pgSession from 'connect-pg-simple';
import pg from 'pg';

const PostgresStore = pgSession(session);
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

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

export async function setupAuth(app: Express) {
  const isProduction = process.env.NODE_ENV === 'production';

  // Trust first proxy (nginx, Cloudflare, etc.)
  app.set('trust proxy', 1);

  // Create session table SQL (inline to avoid file read issues in production bundle)
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

  // Ensure session table exists before starting (synchronous)
  try {
    await pool.query(createTableSQL);
    await pool.query(createIndexSQL);
    console.log('[Auth] Session table ready');
  } catch (err) {
    console.error("Failed to create session table:", err);
  }

  sessionMiddleware = session({
    store: new PostgresStore({
      pool,
      tableName: 'session',
      createTableIfMissing: false, // We create it manually above
    }),
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

  app.use(sessionMiddleware);
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

export function requireRole(...roles: Array<SystemRole | string>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId || !req.session.user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }
    
    const userRole = normalizeSystemRole(req.session.user.role);
    const normalizedAllowedRoles = roles
      .map((role) => normalizeSystemRole(role))
      .filter((role): role is SystemRole => !!role);

    if (!userRole || !normalizedAllowedRoles.includes(userRole)) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    next();
  };
}

export async function loginUser(username: string, password: string): Promise<User | null> {
  const user = await storage.getUserByUsername(username);
  if (!user || !user.password) return null;
  
  const isValid = await comparePasswords(password, user.password);
  if (!isValid) return null;
  
  return user;
}

export async function registerUser(userData: {
  username: string;
  password: string;
  nom: string;
  prenom?: string | null;
  email?: string | null;
  telephone?: string | null;
  photoProfile?: string | null;
  role?: string;
  statut?: string;
}): Promise<User> {
  const hashedPassword = await hashPassword(userData.password);
  return storage.createUser({
    ...userData,
    role: userData.role as SystemRole | undefined,
    password: hashedPassword,
  });
}
