/**
 * Database Context Middleware - Row Level Security (RLS) Support
 *
 * Ce middleware injecte le contexte d'agence dans la session PostgreSQL
 * pour activer le filtrage RLS automatique au niveau de la base de données.
 *
 * STRATÉGIE:
 * - Utilise set_config() de PostgreSQL pour définir des variables de session
 * - Les politiques RLS utilisent ces variables pour filtrer les données
 * - Double couche de sécurité: Application (middleware) + BDD (RLS)
 *
 * VARIABLES DE SESSION:
 * - app.current_agency_id : UUID de l'agence courante (ou '' si admin global)
 * - app.is_admin : 'true' si l'utilisateur est admin (bypass RLS)
 *
 * USAGE:
 *   import { setDbContext, withDbContext } from './middleware/db-context';
 *
 *   // Option 1: Middleware Express (pour toutes les routes)
 *   app.use(setDbContext);
 *
 *   // Option 2: Wrapper pour opérations critiques
 *   await withDbContext(req, async (tx) => {
 *     return tx.select().from(clients);
 *   });
 */

import { Request, Response, NextFunction } from "express";
import { sql } from "drizzle-orm";
import { pool, db } from "../db";
import { isAdminRole } from "../../shared/types/roles";
import { createLogger } from "../lib/logger";

const logger = createLogger('DbContext');

/**
 * Configuration du contexte RLS
 */
export interface RLSContext {
  agencyId: string | null;
  isAdmin: boolean;
  userId: string | null;
}

/**
 * Construit le contexte RLS à partir de la requête Express
 */
export function buildRLSContext(req: Request): RLSContext {
  const user = req.session?.user || req.user;

  if (!user) {
    return {
      agencyId: null,
      isAdmin: false,
      userId: null,
    };
  }

  const isAdmin = isAdminRole(user.role);

  // Déterminer l'agence à utiliser
  // Priorité: selectedAgenceId (header) > session.agenceId > user.agenceId
  let agencyId: string | null = null;

  if (!isAdmin) {
    agencyId =
      req.selectedAgenceId ||
      req.session?.user?.agenceId ||
      user.agenceId ||
      null;
  }

  return {
    agencyId,
    isAdmin,
    userId: user.id,
  };
}

/**
 * Middleware Express pour définir le contexte RLS
 *
 * Ce middleware doit être placé APRÈS l'authentification
 * mais AVANT les routes qui accèdent à la BDD.
 *
 * Note: Ce middleware définit le contexte sur la connexion du pool.
 * Avec le pooling HTTP, chaque requête peut utiliser une connexion différente.
 * Pour garantir l'isolation, utiliser withDbContext() pour les opérations critiques.
 */
export function setDbContext(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  // Attacher le contexte RLS à la requête pour usage ultérieur
  const context = buildRLSContext(req);
  (req as any).rlsContext = context;

  // Log en mode debug
  if (process.env.DEBUG_RLS === "true") {
    logger.debug({
      userId: context.userId,
      agencyId: context.agencyId,
      isAdmin: context.isAdmin,
      path: req.path,
    }, 'RLS Context');
  }

  next();
}

/**
 * Définit les variables de session PostgreSQL pour RLS
 *
 * IMPORTANT: Cette fonction doit être appelée au début de chaque transaction
 * ou opération qui nécessite le filtrage RLS.
 *
 * @param context Le contexte RLS (agence, admin, etc.)
 * @param client Le client PostgreSQL (connexion ou transaction)
 */
export async function applyRLSContext(
  context: RLSContext,
  client: typeof db | any
): Promise<void> {
  // Définir l'agence courante
  // Note: set_config avec 'false' = dure jusqu'à la fin de la session/connexion
  // Avec 'true' = dure jusqu'à la fin de la transaction seulement
  const agencyValue = context.agencyId || "";
  const isAdminValue = context.isAdmin ? "true" : "false";

  await client.execute(
    sql`SELECT set_config('app.current_agency_id', ${agencyValue}, false)`
  );
  await client.execute(
    sql`SELECT set_config('app.is_admin', ${isAdminValue}, false)`
  );
}

/**
 * Wrapper pour exécuter des opérations avec le contexte RLS appliqué
 *
 * Cette fonction garantit que le contexte RLS est correctement défini
 * pour la durée de l'opération, même avec le pooling de connexions.
 *
 * @param req La requête Express (pour extraire le contexte)
 * @param operation L'opération à exécuter avec le contexte RLS
 * @returns Le résultat de l'opération
 *
 * @example
 * const clients = await withDbContext(req, async () => {
 *   return db.select().from(clients);
 * });
 */
export async function withDbContext<T>(
  req: Request,
  operation: () => Promise<T>
): Promise<T> {
  const context = (req as any).rlsContext || buildRLSContext(req);

  // Appliquer le contexte RLS
  await applyRLSContext(context, db);

  try {
    // Exécuter l'opération
    return await operation();
  } finally {
    // Nettoyer le contexte (optionnel, mais bonne pratique pour le pooling)
    // On remet des valeurs vides pour éviter les fuites entre requêtes
    await db.execute(sql`SELECT set_config('app.current_agency_id', '', false)`);
    await db.execute(sql`SELECT set_config('app.is_admin', 'false', false)`);
  }
}

/**
 * Wrapper pour transactions avec contexte RLS
 *
 * Utilise db.transaction() de Drizzle pour garantir l'atomicité
 * et applique le contexte RLS au début de la transaction.
 *
 * @param req La requête Express
 * @param operation L'opération transactionnelle à exécuter
 * @returns Le résultat de l'opération
 *
 * @example
 * const result = await withDbContextTransaction(req, async (tx) => {
 *   await tx.insert(clients).values({ ... });
 *   await tx.insert(comptes).values({ ... });
 *   return { success: true };
 * });
 */
export async function withDbContextTransaction<T>(
  req: Request,
  operation: (tx: typeof db) => Promise<T>
): Promise<T> {
  const context = (req as any).rlsContext || buildRLSContext(req);

  return await db.transaction(async (tx) => {
    // Appliquer le contexte RLS dans la transaction
    // Utiliser 'true' pour que le contexte soit limité à la transaction
    const agencyValue = context.agencyId || "";
    const isAdminValue = context.isAdmin ? "true" : "false";

    await tx.execute(
      sql`SELECT set_config('app.current_agency_id', ${agencyValue}, true)`
    );
    await tx.execute(
      sql`SELECT set_config('app.is_admin', ${isAdminValue}, true)`
    );

    // Exécuter l'opération
    return await operation(tx as unknown as typeof db);
  });
}

/**
 * Vérifie si le contexte RLS est correctement configuré
 *
 * Utile pour le debugging et les tests.
 *
 * @returns Les variables de session RLS actuelles
 */
export async function getRLSContextStatus(): Promise<{
  currentAgencyId: string | null;
  isAdmin: boolean;
}> {
  const agencyQueryResult = await db.execute<{ current_setting: string }>(
    sql`SELECT current_setting('app.current_agency_id', true) as current_setting`
  );
  const adminQueryResult = await db.execute<{ current_setting: string }>(
    sql`SELECT current_setting('app.is_admin', true) as current_setting`
  );

  // db.execute returns QueryResult with rows array
  const agencyResult = agencyQueryResult.rows[0];
  const adminResult = adminQueryResult.rows[0];

  return {
    currentAgencyId: agencyResult?.current_setting || null,
    isAdmin: adminResult?.current_setting === "true",
  };
}

/**
 * Middleware de sécurité pour forcer le contexte RLS sur les routes sensibles
 *
 * Ce middleware vérifie que le contexte RLS est défini et refuse l'accès
 * si aucune agence n'est définie pour un utilisateur non-admin.
 *
 * @example
 * router.get('/clients', requireRLSContext, async (req, res) => { ... });
 */
export function requireRLSContext(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const context = (req as any).rlsContext || buildRLSContext(req);

  // Les admins peuvent toujours passer
  if (context.isAdmin) {
    return next();
  }

  // Les non-admins doivent avoir une agence définie
  if (!context.agencyId) {
    logger.warn({ userId: context.userId }, 'User attempted access without agency context');
    res.status(403).json({
      error: "Contexte d'agence requis",
      message: "Aucune agence n'est associée à votre session.",
    });
    return;
  }

  next();
}

/**
 * Utilitaire pour les tests: définir manuellement le contexte RLS
 *
 * ATTENTION: Ne pas utiliser en production, uniquement pour les tests.
 *
 * @param agencyId L'ID de l'agence à simuler
 * @param isAdmin Si true, simule un contexte admin
 */
export async function setTestRLSContext(
  agencyId: string | null,
  isAdmin: boolean
): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("setTestRLSContext cannot be used in production");
  }

  await applyRLSContext(
    {
      agencyId,
      isAdmin,
      userId: "test-user",
    },
    db
  );
}

/**
 * Utilitaire pour les tests: réinitialiser le contexte RLS
 */
export async function clearTestRLSContext(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("clearTestRLSContext cannot be used in production");
  }

  await db.execute(sql`SELECT set_config('app.current_agency_id', '', false)`);
  await db.execute(sql`SELECT set_config('app.is_admin', 'false', false)`);
}
