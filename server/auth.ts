import { Express, Request, Response, NextFunction } from 'express';
import session from 'express-session';
import bcrypt from 'bcrypt';
import { storage } from './storage';
import type { User } from '@shared/schema';
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
      role: string;
      agence: string | null;
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

export function setupAuth(app: Express) {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Trust first proxy (Replit's reverse proxy)
  app.set('trust proxy', 1);
  
  sessionMiddleware = session({
    store: new PostgresStore({
      pool,
      tableName: 'session',
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || 'cofin-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    name: 'cofin.sid',
    proxy: true,
    cookie: {
      secure: isProduction,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: isProduction ? 'none' : 'lax',
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

// Standard role names (full French names)
export const ROLES = {
  ADMIN: 'Administrateur',
  CHEF: 'Chef d\'Agence',
  CAISSE: 'Agent Caisse',
  TERRAIN: 'Agent Terrain',
  COMPTABLE: 'Comptable',
  CREDIT: 'Gestionnaire Crédit',
  SUPERVISEUR: 'Superviseur',
} as const;

// Normalize legacy short role names to standard full names
function normalizeRole(role: string): string {
  const legacyMap: Record<string, string> = {
    'admin': ROLES.ADMIN,
    'chef': ROLES.CHEF,
    'caisse': ROLES.CAISSE,
    'terrain': ROLES.TERRAIN,
    'comptable': ROLES.COMPTABLE,
    'credit': ROLES.CREDIT,
    'superviseur': ROLES.SUPERVISEUR,
  };
  return legacyMap[role.toLowerCase()] || role;
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId || !req.session.user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }
    
    // Normalize user role and allowed roles to standard names
    const userRole = normalizeRole(req.session.user.role);
    const normalizedAllowedRoles = roles.map(normalizeRole);
    
    if (!normalizedAllowedRoles.includes(userRole)) {
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
  agence?: string | null;
  statut?: string;
}): Promise<User> {
  const hashedPassword = await hashPassword(userData.password);
  return storage.createUser({
    ...userData,
    password: hashedPassword,
  });
}
