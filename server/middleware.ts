import { Request, Response, NextFunction } from 'express';
import { db } from './db';
import { userAgences, agences } from '../shared/schema';
import { eq, and } from 'drizzle-orm';
import { SystemRole, isAdminRole, normalizeRole } from '../shared/types/roles';

// Extend Express Request type to include user property and agency filter
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        nom: string;
        prenom: string | null;
        role: SystemRole;
        agence: string | null;
        email?: string;
        telephone?: string;
      };
      // Filtre pré-calculé à passer directement aux requêtes Drizzle/SQL
      // Ex: { agence: "Siège" } ou null si admin
      agenceFilter?: { [key: string]: any } | null;
      // L'ID de l'agence sélectionnée (provient du header X-Agence-Id)
      selectedAgenceId?: string | null;
    }
  }
}

/**
 * Middleware to authenticate user and attach user object to request
 * This is similar to requireAuth but also adds req.user for convenience
 */
export function getAuthUser(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId || !req.session.user) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  
  // Attach user to request for easy access in route handlers
  req.user = req.session.user;
  
  next();
}

/**
 * Middleware pour restreindre l'accès aux données de l'agence de l'utilisateur.
 * - Les administrateurs ont accès à tout (agenceFilter = null).
 * - Les autres rôles sont restreints à leur propre agence.
 * 
 * @param entityAgenceField Le nom du champ 'agence' dans l'entité visée (défaut: 'agence')
 */
export function requireAgenceAccess(entityAgenceField: string = "agence") {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId || !req.session.user) {
        return res.status(401).json({ error: 'Non authentifié' });
    }
    
    // Ensure req.user is populated
    req.user = req.session.user;

    const userRole = req.user.role;
    const userAgence = req.user.agence;

    // 1. Administrateurs : Accès global
    if (isAdminRole(userRole)) {
      req.agenceFilter = null; // Pas de filtre
      return next();
    }

    // 2. Utilisateurs sans agence définie : Accès bloqué par sécurité
    if (!userAgence) {
      console.warn(`[Security] User ${req.user.username} (${userRole}) has no agence assigned. Access denied.`);
      return res.status(403).json({ 
          error: 'Accès refusé', 
          message: 'Aucune agence assignée à votre compte.' 
      });
    }

    // 3. Autres rôles : Filtrage strict par agence
    // On injecte le filtre que les routes devront utiliser
    req.agenceFilter = { [entityAgenceField]: userAgence };
    
    // console.log(`[AgenceFilter] User: ${req.user.username}, Role: ${userRole} -> Filter: ${JSON.stringify(req.agenceFilter)}`);

    next();
  };
}

/**
 * Middleware pour vérifier si l'utilisateur a le droit d'effectuer une action sur une agence cible.
 * Utile pour les créations/modifications où l'agence est passée dans le body.
 * 
 * @param bodyAgenceField Le champ dans req.body qui contient l'agence cible (défaut: 'agence')
 */
export function validateAgenceAction(bodyAgenceField: string = "agence") {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.user) return res.status(401).send("Unauthorized");
    req.user = req.session.user;

    // Admin bypass
    if (isAdminRole(req.user.role)) {
      return next();
    }

    const targetAgence = req.body[bodyAgenceField];

    // Si une agence est spécifiée et différente de celle de l'utilisateur => Interdit
    if (targetAgence && targetAgence !== req.user.agence) {
      return res.status(403).json({
          error: "Action non autorisée",
          message: `Vous ne pouvez pas agir sur l'agence '${targetAgence}'.`
      });
    }

    // Force l'agence du user dans le body si non spécifiée (ou pour écraser tentative malveillante si on voulait être strict)
    // Ici on complète juste si manquant pour faciliter la création
    if (!targetAgence && req.user.agence) {
        req.body[bodyAgenceField] = req.user.agence;
    }

    next();
  };
}
/**
 * Middleware pour vérifier le rôle de l'utilisateur.
 * @param allowedRoles Liste des rôles autorisés
 */
export function requireRole(allowedRoles: Array<SystemRole | string>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId || !req.session.user) {
        return res.status(401).json({ error: 'Non authentifié' });
    }

    // Ensure req.user is populated
    req.user = req.session.user;

    // Normalize roles (handle undefined roles as 'agent' or similar if needed)
    const userRole = normalizeRole(req.user.role);
    const normalizedAllowedRoles = allowedRoles
      .map((role) => normalizeRole(role))
      .filter((role): role is SystemRole => !!role);

    if (!userRole || !normalizedAllowedRoles.includes(userRole)) {
        if (isAdminRole(req.user.role)) {
             return next();
        }
        return res.status(403).json({ error: 'Accès refusé. Rôle insuffisant.' });
    }

    next();
  };
}

/**
 * Middleware pour le filtrage multi-agences basé sur le header X-Agence-Id.
 *
 * Ce middleware:
 * 1. Lit le header X-Agence-Id envoyé par le client
 * 2. Vérifie que l'utilisateur a accès à cette agence (via user_agences)
 * 3. Injecte req.selectedAgenceId pour filtrer les requêtes
 *
 * Pour les admins: peut accéder à n'importe quelle agence
 * Pour les autres: doit être affecté à l'agence via user_agences
 */
export function requireAgenceIdAccess() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId || !req.session.user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    req.user = req.session.user;
    const userId = req.session.userId;
    const userRole = req.user.role;

    // Lire l'agence sélectionnée depuis le header
    const selectedAgenceId = req.headers['x-agence-id'] as string | undefined;

    // Si aucune agence sélectionnée
    if (!selectedAgenceId) {
      // Pour les admins: pas de filtre (accès global)
    if (isAdminRole(userRole)) {
      req.selectedAgenceId = null;
      req.agenceFilter = null;
      return next();
    }

      // Pour les autres: récupérer l'agence principale
      try {
        const [primaryAgence] = await db
          .select({ agenceId: userAgences.agenceId })
          .from(userAgences)
          .where(and(
            eq(userAgences.userId, userId),
            eq(userAgences.isPrimary, true),
            eq(userAgences.actif, true)
          ))
          .limit(1);

        if (primaryAgence) {
          req.selectedAgenceId = primaryAgence.agenceId;
          req.agenceFilter = { agenceId: primaryAgence.agenceId };
        } else {
          // Aucune agence principale, vérifier s'il y a au moins une agence
          const [anyAgence] = await db
            .select({ agenceId: userAgences.agenceId })
            .from(userAgences)
            .where(and(
              eq(userAgences.userId, userId),
              eq(userAgences.actif, true)
            ))
            .limit(1);

          if (anyAgence) {
            req.selectedAgenceId = anyAgence.agenceId;
            req.agenceFilter = { agenceId: anyAgence.agenceId };
          } else {
            console.warn(`[Security] User ${req.user.username} has no agences assigned.`);
            return res.status(403).json({
              error: 'Accès refusé',
              message: 'Aucune agence assignée à votre compte.'
            });
          }
        }
      } catch (err) {
        console.error('[AgenceIdAccess] Error fetching user agences:', err);
        return res.status(500).json({ error: 'Erreur interne' });
      }

      return next();
    }

    // Une agence est sélectionnée: vérifier l'accès
    // Admins: accès à toutes les agences
    // Admins: accès à toutes les agences
    if (isAdminRole(userRole)) {
      if (selectedAgenceId === 'all') {
        req.selectedAgenceId = null;
        req.agenceFilter = null;
      } else {
        req.selectedAgenceId = selectedAgenceId;
        req.agenceFilter = { agenceId: selectedAgenceId };
      }
      return next();
    }

    // Vérifier que l'utilisateur a accès à cette agence
    try {
      const [userAgence] = await db
        .select()
        .from(userAgences)
        .where(and(
          eq(userAgences.userId, userId),
          eq(userAgences.agenceId, selectedAgenceId),
          eq(userAgences.actif, true)
        ))
        .limit(1);

      if (!userAgence) {
        console.warn(`[Security] User ${req.user.username} tried to access agence ${selectedAgenceId} without permission`);
        return res.status(403).json({
          error: 'Accès refusé',
          message: 'Vous n\'avez pas accès à cette agence.'
        });
      }

      req.selectedAgenceId = selectedAgenceId;
      req.agenceFilter = { agenceId: selectedAgenceId };
      next();
    } catch (err) {
      console.error('[AgenceIdAccess] Error verifying agence access:', err);
      return res.status(500).json({ error: 'Erreur interne' });
    }
  };
}

/**
 * Middleware pour valider l'agenceId dans le body lors des créations/modifications.
 * Force l'agenceId de l'agence sélectionnée si non spécifié.
 */
export function validateAgenceIdAction() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.user) return res.status(401).send("Unauthorized");
    req.user = req.session.user;

    const userRole = req.user.role;
    const targetAgenceId = req.body.agenceId;

    // Admin: peut spécifier n'importe quelle agence
    if (isAdminRole(userRole)) {
      // Si pas d'agenceId dans le body mais une agence sélectionnée, l'injecter
      if (!targetAgenceId && req.selectedAgenceId) {
        req.body.agenceId = req.selectedAgenceId;
      }
      return next();
    }

    // Vérifier que l'agenceId cible correspond à l'agence sélectionnée
    if (targetAgenceId && targetAgenceId !== req.selectedAgenceId) {
      return res.status(403).json({
        error: "Action non autorisée",
        message: "Vous ne pouvez pas créer d'entité pour une autre agence."
      });
    }

    // Injecter l'agenceId de l'agence sélectionnée si non spécifié
    if (!targetAgenceId && req.selectedAgenceId) {
      req.body.agenceId = req.selectedAgenceId;
    }

    next();
  };
}
