/**
 * CASL Condition Resolver
 * =======================
 *
 * Resolves template variables in CASL conditions.
 * Supports MongoDB-style query operators and dynamic variable interpolation.
 *
 * ## Supported Variables
 *
 * Context variables (from user session):
 * - ${userId} - Current user's ID
 * - ${agenceId} - Current active agency ID
 * - ${role} - Current user's primary role
 * - ${roles} - All user roles (array)
 *
 * Temporal variables (computed at runtime):
 * - ${now} - Current timestamp (ISO string)
 * - ${startOfDay} - Start of current day (00:00:00)
 * - ${endOfDay} - End of current day (23:59:59)
 * - ${startOfWeek} - Start of current week (Monday 00:00:00)
 * - ${startOfMonth} - First day of current month
 * - ${startOfYear} - First day of current year
 *
 * ## MongoDB Operators Supported
 *
 * Comparison:
 * - $eq, $ne - Equal, not equal
 * - $gt, $gte - Greater than, greater or equal
 * - $lt, $lte - Less than, less or equal
 * - $in, $nin - In array, not in array
 *
 * Logical:
 * - $and - All conditions must match
 * - $or - Any condition must match
 * - $not - Inverts condition
 *
 * @example
 * ```typescript
 * const resolver = new ConditionResolver({
 *   userId: 'user-123',
 *   agenceId: 'agency-456',
 * });
 *
 * const conditions = {
 *   createdBy: '${userId}',
 *   amount: { $lte: 1000000 },
 *   status: { $in: ['PENDING', 'REVIEW'] }
 * };
 *
 * const resolved = resolver.resolve(conditions);
 * // { createdBy: 'user-123', amount: { $lte: 1000000 }, status: { $in: ['PENDING', 'REVIEW'] } }
 * ```
 */

import { SystemRole } from '@shared/types/roles';
import { createLogger } from '../lib/logger';

const logger = createLogger('RBAC:ConditionResolver');

/**
 * Context for resolving condition variables
 */
export interface ConditionContext {
  userId: string;
  agenceId?: string;
  role?: SystemRole;
  roles?: SystemRole[];
  // Additional custom variables
  [key: string]: any;
}

/**
 * CASL condition structure (MongoDB-style)
 */
export type CaslConditions = Record<string, any>;

/**
 * Supported MongoDB operators
 */
const MONGO_OPERATORS = [
  '$eq', '$ne', '$gt', '$gte', '$lt', '$lte',
  '$in', '$nin', '$and', '$or', '$not', '$exists',
  '$regex', '$size', '$all', '$elemMatch'
] as const;

type MongoOperator = typeof MONGO_OPERATORS[number];

/**
 * Condition Resolver class
 */
export class ConditionResolver {
  private context: ConditionContext;
  private temporalVars: Record<string, string>;

  constructor(context: ConditionContext) {
    this.context = context;
    this.temporalVars = this.computeTemporalVariables();
  }

  /**
   * Compute temporal variables based on current time
   */
  private computeTemporalVariables(): Record<string, string> {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const startOfWeek = new Date(now);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    return {
      now: now.toISOString(),
      startOfDay: startOfDay.toISOString(),
      endOfDay: endOfDay.toISOString(),
      startOfWeek: startOfWeek.toISOString(),
      startOfMonth: startOfMonth.toISOString(),
      startOfYear: startOfYear.toISOString(),
    };
  }

  /**
   * Get a variable value from context or temporal vars
   */
  private getVariable(varName: string): any {
    // Check temporal variables first
    if (varName in this.temporalVars) {
      return this.temporalVars[varName];
    }

    // Check context
    if (varName in this.context) {
      return this.context[varName];
    }

    // Variable not found - return undefined
    logger.warn({ varName }, 'Unknown variable');
    return undefined;
  }

  /**
   * Replace template variables in a string
   * Supports ${varName} syntax
   */
  private interpolateString(value: string): any {
    // Check if entire string is a variable
    const fullVarMatch = value.match(/^\$\{(\w+)\}$/);
    if (fullVarMatch) {
      return this.getVariable(fullVarMatch[1]);
    }

    // Replace embedded variables
    return value.replace(/\$\{(\w+)\}/g, (_, varName) => {
      const varValue = this.getVariable(varName);
      return varValue !== undefined ? String(varValue) : `\${${varName}}`;
    });
  }

  /**
   * Recursively resolve conditions
   */
  private resolveValue(value: any): any {
    // Null/undefined pass through
    if (value === null || value === undefined) {
      return value;
    }

    // String interpolation
    if (typeof value === 'string') {
      return this.interpolateString(value);
    }

    // Array - resolve each element
    if (Array.isArray(value)) {
      return value.map(item => this.resolveValue(item));
    }

    // Object - could be operator or nested conditions
    if (typeof value === 'object') {
      const result: Record<string, any> = {};

      for (const [key, val] of Object.entries(value)) {
        // Check if key is a MongoDB operator
        if (MONGO_OPERATORS.includes(key as MongoOperator)) {
          result[key] = this.resolveValue(val);
        } else {
          result[key] = this.resolveValue(val);
        }
      }

      return result;
    }

    // Primitives (number, boolean) pass through
    return value;
  }

  /**
   * Resolve all template variables in conditions
   *
   * @param conditions - CASL conditions with template variables
   * @returns Resolved conditions ready for CASL
   */
  resolve(conditions: CaslConditions): CaslConditions {
    if (!conditions || typeof conditions !== 'object') {
      return conditions;
    }

    return this.resolveValue(conditions);
  }

  /**
   * Validate that all required variables are present in context
   *
   * @param conditions - Conditions to validate
   * @returns Array of missing variable names
   */
  validateVariables(conditions: CaslConditions): string[] {
    const missing: string[] = [];
    const varPattern = /\$\{(\w+)\}/g;

    const checkValue = (value: any) => {
      if (typeof value === 'string') {
        let match;
        while ((match = varPattern.exec(value)) !== null) {
          const varName = match[1];
          if (
            !(varName in this.context) &&
            !(varName in this.temporalVars) &&
            !missing.includes(varName)
          ) {
            missing.push(varName);
          }
        }
      } else if (Array.isArray(value)) {
        value.forEach(checkValue);
      } else if (value && typeof value === 'object') {
        Object.values(value).forEach(checkValue);
      }
    };

    checkValue(conditions);
    return missing;
  }
}

/**
 * Create a condition resolver with the given context
 */
export function createConditionResolver(context: ConditionContext): ConditionResolver {
  return new ConditionResolver(context);
}

/**
 * Quick resolve helper - creates resolver and resolves in one step
 */
export function resolveConditions(
  conditions: CaslConditions,
  context: ConditionContext
): CaslConditions {
  const resolver = new ConditionResolver(context);
  return resolver.resolve(conditions);
}

/**
 * Parse a template condition from the database
 * and apply variable values
 */
export function applyConditionTemplate(
  templateSchema: CaslConditions,
  variables: Record<string, any>,
  context: ConditionContext
): CaslConditions {
  // First, replace template variables (from template definition)
  const withTemplateVars = JSON.parse(
    JSON.stringify(templateSchema).replace(
      /\$(\w+)/g,
      (_, varName) => {
        if (varName in variables) {
          const value = variables[varName];
          return typeof value === 'string' ? value : JSON.stringify(value);
        }
        return `$${varName}`;
      }
    )
  );

  // Then, resolve context variables (from runtime)
  const resolver = new ConditionResolver(context);
  return resolver.resolve(withTemplateVars);
}
