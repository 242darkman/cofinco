/**
 * CASL Authorization Middleware
 * =============================
 * Express middleware for attaching and checking CASL abilities.
 */

import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, subject as caslSubject } from '@casl/ability';
import {
  AppAbility,
  Action,
  Subject,
  Actions,
  Subjects,
} from './types';
import {
  buildAbilityForUser,
  createAbilityFromRules,
  canDisburse,
  AbilityContext,
} from './ability';
import { createLogger } from '../lib/logger';
import { db } from '../db';
import { users, userRoles } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { SystemRole, isPlatformOperator } from '@shared/types/roles';

const logger = createLogger('Authorization');

/**
 * Extend Express Request to include ability
 */
declare global {
  namespace Express {
    interface Request {
      ability?: AppAbility;
      abilityContext?: AbilityContext;
    }
  }
}

/**
 * Middleware: Attach CASL Ability to request
 *
 * MUST be called after requireAuth middleware.
 * Builds the user's ability and attaches it to req.ability.
 *
 * Usage:
 *   app.use(requireAuth);
 *   app.use(attachAbility);
 *   // or for specific routes:
 *   app.post('/api/foo', requireAuth, attachAbility, requireAbility('create', 'Foo'), handler);
 */
export async function attachAbility(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Ensure user is authenticated
    if (!req.session?.user?.id) {
      res.status(401).json({ error: 'Non authentifié' });
      return;
    }

    const context: AbilityContext = {
      userId: req.session.user.id,
      agenceIdActive: req.session.user.agenceId,
    };

    // Build ability
    const abilityResponse = await buildAbilityForUser(context);

    // Create ability instance
    const ability = createAbilityFromRules(abilityResponse.caslRules);

    // Attach to request
    req.ability = ability;
    req.abilityContext = context;

    next();
  } catch (error) {
    logger.error({ err: error }, 'Error building ability');
    res.status(500).json({ error: 'Erreur lors de la vérification des permissions' });
  }
}

/**
 * Middleware factory: Require specific ability
 *
 * Creates a middleware that checks if the user has the specified ability.
 * Returns 403 Forbidden if the check fails.
 *
 * Usage:
 *   app.post('/api/credits', requireAuth, attachAbility, requireAbility('create', 'Credit'), handler);
 *
 * @param action - The action to check (e.g., 'create', 'disburse')
 * @param subjectType - The subject type (e.g., 'Credit', 'User')
 * @param getSubject - Optional function to get the subject instance from request for field-level checks
 */
export function requireAbility(
  action: Action,
  subjectType: Subject,
  getSubject?: (req: Request) => Record<string, any> | null
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Ensure ability is attached
      if (!req.ability) {
        // Try to build ability if not attached
        if (req.session?.user?.id) {
          await attachAbility(req, res, () => {});
        }

        if (!req.ability) {
          res.status(401).json({ error: 'Non authentifié' });
          return;
        }
      }

      // Get subject instance if provider function is given
      let subjectInstance: any = subjectType;
      if (getSubject) {
        const instance = getSubject(req);
        if (instance) {
          subjectInstance = caslSubject(subjectType, instance);
        }
      }

      // Check ability
      if (!req.ability.can(action, subjectInstance)) {
        res.status(403).json({
          error: 'Accès refusé',
          message: `Vous n'avez pas la permission de ${translateAction(action)} sur ${translateSubject(subjectType)}`,
          required: { action, subject: subjectType },
        });
        return;
      }

      next();
    } catch (error) {
      if (error instanceof ForbiddenError) {
        res.status(403).json({
          error: 'Accès refusé',
          message: error.message,
        });
        return;
      }
      logger.error({ err: error }, 'Error checking ability');
      res.status(500).json({ error: 'Erreur lors de la vérification des permissions' });
    }
  };
}

/**
 * Middleware factory: Require ANY of the specified abilities
 *
 * Usage:
 *   app.post('/api/foo', requireAuth, attachAbility, requireAnyAbility([
 *     { action: 'create', subject: 'Foo' },
 *     { action: 'manage', subject: 'Foo' },
 *   ]), handler);
 */
export function requireAnyAbility(
  abilities: Array<{ action: Action; subject: Subject }>
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.ability) {
        if (req.session?.user?.id) {
          await attachAbility(req, res, () => {});
        }

        if (!req.ability) {
          res.status(401).json({ error: 'Non authentifié' });
          return;
        }
      }

      const hasAny = abilities.some(({ action, subject }) =>
        req.ability!.can(action, subject)
      );

      if (!hasAny) {
        res.status(403).json({
          error: 'Accès refusé',
          message: 'Vous n\'avez aucune des permissions requises',
          required: abilities,
        });
        return;
      }

      next();
    } catch (error) {
      logger.error({ err: error }, 'Error checking abilities');
      res.status(500).json({ error: 'Erreur lors de la vérification des permissions' });
    }
  };
}

/**
 * Middleware factory: Require ALL of the specified abilities
 */
export function requireAllAbilities(
  abilities: Array<{ action: Action; subject: Subject }>
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.ability) {
        if (req.session?.user?.id) {
          await attachAbility(req, res, () => {});
        }

        if (!req.ability) {
          res.status(401).json({ error: 'Non authentifié' });
          return;
        }
      }

      const missing = abilities.filter(({ action, subject }) =>
        !req.ability!.can(action, subject)
      );

      if (missing.length > 0) {
        res.status(403).json({
          error: 'Accès refusé',
          message: 'Permissions manquantes',
          missing: missing.map(m => `${m.action} sur ${m.subject}`),
        });
        return;
      }

      next();
    } catch (error) {
      logger.error({ err: error }, 'Error checking all abilities');
      res.status(500).json({ error: 'Erreur lors de la vérification des permissions' });
    }
  };
}

/**
 * Middleware factory: Check disbursement permission by channel
 *
 * Specialized middleware for the credit disbursement route.
 * Checks channel-specific permissions with fallbacks.
 *
 * Usage:
 *   app.post('/api/credits/decaissement', requireAuth, attachAbility, requireDisbursement(), handler);
 */
export function requireDisbursement() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.ability) {
        if (req.session?.user?.id) {
          await attachAbility(req, res, () => {});
        }

        if (!req.ability) {
          res.status(401).json({ error: 'Non authentifié' });
          return;
        }
      }

      // Get channel from request body
      const channel = (req.body.disbursementChannel || req.body.channel || 'ACCOUNT') as 'CASH' | 'ACCOUNT' | 'MOBILE_MONEY';

      // Check disbursement permission with fallbacks
      if (!canDisburse(req.ability, channel)) {
        const channelLabels: Record<string, string> = {
          'CASH': 'espèces',
          'ACCOUNT': 'compte',
          'MOBILE_MONEY': 'Mobile Money',
        };

        res.status(403).json({
          error: 'Accès refusé',
          message: `Vous n'avez pas la permission de décaisser par ${channelLabels[channel] || channel}`,
          channel,
        });
        return;
      }

      next();
    } catch (error) {
      logger.error({ err: error }, 'Error checking disbursement permission');
      res.status(500).json({ error: 'Erreur lors de la vérification des permissions' });
    }
  };
}

/**
 * Middleware factory: Check if user can reset another user's password
 *
 * Additional ABAC check: prevent non-super-admin from resetting another admin's password.
 *
 * Usage:
 *   app.post('/api/users/:id/reset-password', requireAuth, attachAbility, requireResetPassword(), handler);
 */
export function requireResetPassword() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.ability) {
        if (req.session?.user?.id) {
          await attachAbility(req, res, () => {});
        }

        if (!req.ability) {
          res.status(401).json({ error: 'Non authentifié' });
          return;
        }
      }

      // Check basic reset_password permission
      if (!req.ability.can(Actions.RESET_PASSWORD, Subjects.USER) &&
          !req.ability.can(Actions.MANAGE, Subjects.USER) &&
          !req.ability.can(Actions.MANAGE, Subjects.ALL)) {
        res.status(403).json({
          error: 'Accès refusé',
          message: 'Vous n\'avez pas la permission de réinitialiser les mots de passe',
        });
        return;
      }

      // ABAC check: prevent non-admin from resetting an admin's password
      const targetUserId = req.params.id;
      if (targetUserId) {
        const [targetUser] = await db
          .select({ role: userRoles.role })
          .from(userRoles)
          .where(and(eq(userRoles.userId, targetUserId), eq(userRoles.isPrimary, true)));

        if (targetUser) {
          const isTargetAdmin = targetUser.role === SystemRole.ADMIN;
          const isRequesterSuperAdmin = req.ability?.can(Actions.MANAGE, Subjects.ALL);

          if (isTargetAdmin && !isRequesterSuperAdmin) {
            res.status(403).json({
              error: 'Accès refusé',
              message: 'Seul un administrateur peut réinitialiser le mot de passe d\'un autre administrateur',
            });
            return;
          }
        }
      }

      next();
    } catch (error) {
      logger.error({ err: error }, 'Error checking reset password permission');
      res.status(500).json({ error: 'Erreur lors de la vérification des permissions' });
    }
  };
}

/**
 * Helper: Check if request has ability (non-middleware)
 *
 * Useful for conditional logic within route handlers.
 *
 * Usage:
 *   if (hasAbility(req, 'manage', 'Credit')) {
 *     // Include sensitive data
 *   }
 */
export function hasAbility(req: Request, action: Action, subject: Subject): boolean {
  if (!req.ability) return false;
  return req.ability.can(action, subject);
}

/**
 * Middleware: réserve un endpoint à l'opérateur plateforme (éditeur).
 *
 * Contrairement à `requireAbility`, ce garde est basé sur le RÔLE, pas sur les
 * abilities CASL : l'admin tenant possède « manage all » et passerait sinon.
 * À appliquer aux endpoints d'exploitation (reset agence, maintenance,
 * provisioning tenant…). Doit suivre `requireAuth`.
 *
 * Usage :
 *   app.post('/api/admin/reset-agence/:id', requireAuth, requirePlatformOperator(), handler);
 */
export function requirePlatformOperator() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.session?.user?.role;
    if (!isPlatformOperator(role)) {
      res.status(403).json({ error: "Action réservée à l'opérateur plateforme." });
      return;
    }
    next();
  };
}

/**
 * Helper: Assert ability or throw
 *
 * Throws ForbiddenError if check fails.
 *
 * Usage:
 *   try {
 *     assertAbility(req, 'delete', 'Credit');
 *   } catch (e) {
 *     // Handle forbidden
 *   }
 */
export function assertAbility(req: Request, action: Action, subject: Subject): void {
  if (!req.ability) {
    throw new Error('No ability attached to request');
  }
  ForbiddenError.from(req.ability).throwUnlessCan(action, subject);
}

/**
 * Translate action to French for error messages
 */
function translateAction(action: Action): string {
  const translations: Partial<Record<Action, string>> = {
    [Actions.VIEW]: 'consulter',
    [Actions.CREATE]: 'créer',
    [Actions.EDIT]: 'modifier',
    [Actions.DELETE]: 'supprimer',
    [Actions.MANAGE]: 'gérer',
    [Actions.APPROVE]: 'approuver',
    [Actions.REJECT]: 'rejeter',
    [Actions.EXPORT]: 'exporter',
    [Actions.DISBURSE]: 'décaisser',
    [Actions.DISBURSE_CASH]: 'décaisser en espèces',
    [Actions.DISBURSE_ACCOUNT]: 'décaisser sur compte',
    [Actions.DISBURSE_MOMO]: 'décaisser par Mobile Money',
    [Actions.RESET_PASSWORD]: 'réinitialiser le mot de passe',
  };
  return translations[action] || action;
}

/**
 * Translate subject to French for error messages
 */
function translateSubject(subject: Subject): string {
  const translations: Partial<Record<Subject, string>> = {
    [Subjects.USER]: 'les utilisateurs',
    [Subjects.CLIENT]: 'les clients',
    [Subjects.CREDIT]: 'les crédits',
    [Subjects.COMPTE]: 'les comptes',
    [Subjects.CAISSE]: 'la caisse',
    [Subjects.COFFRE]: 'le coffre-fort',
    [Subjects.TONTINE]: 'les tontines',
    [Subjects.COMPTABILITE]: 'la comptabilité',
    [Subjects.RH]: 'les ressources humaines',
    [Subjects.AGENT_TERRAIN]: 'les agents terrain',
    [Subjects.ALL]: 'toutes les ressources',
  };
  return translations[subject] || subject;
}

/**
 * Combine multiple middleware functions
 * Useful for applying attachAbility + requireAbility in one call
 */
export function withAbility(action: Action, subject: Subject) {
  return [attachAbility, requireAbility(action, subject)];
}

/**
 * Combine attachAbility + requireDisbursement
 */
export function withDisbursementCheck() {
  return [attachAbility, requireDisbursement()];
}

/**
 * Combine attachAbility + requireResetPassword
 */
export function withResetPasswordCheck() {
  return [attachAbility, requireResetPassword()];
}
