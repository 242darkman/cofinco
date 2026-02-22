/**
 * Mobile-safe barrel export
 *
 * Re-exports ONLY pure TypeScript types/utilities that do NOT depend on drizzle-orm.
 * The mobile app should import from '@shared/types/mobile' instead of '@shared/schema'.
 */

// Roles
import { SystemRole as _SystemRole } from './roles';
export {
  SystemRole,
  ROLE_LABELS,
  getRoleLabel,
  getRoleOptions,
  hasRole,
  isSystemRole,
} from './roles';

// Currency
export type { CurrencyConfig } from '../config/currency';
export {
  formatMoney,
  formatMoneyShort,
  parseMoney,
  currencySymbol,
  currencyLabel,
  currencyCode,
  DEFAULT_CURRENCY,
  CURRENCY_PRESETS,
  getActiveCurrency,
  setActiveCurrency,
  setActiveCurrencyByCode,
} from '../config/currency';

// Balance types (pure interfaces, no drizzle)
export type {
  Balance,
  BalanceEntityType,
  BalanceUpdatePayload,
  BalanceUpdateEvent,
  BalanceHistory,
  BalanceHistoryPoint,
  BalanceStats,
} from './balances';

// Status constants (pure TypeScript objects, no pgEnum)
export {
  StatutCompte,
  StatutCredit,
  StatutUser,
  StatutClient,
  TypeCompte,
  StatutAgence,
  TypeAgence,
  StatutProspection,
} from '../enum/status-constants';

// App context (client vs employee mode)
export type AppContext = 'client' | 'employee';

export const CONTEXT_LABELS: Record<AppContext, string> = {
  client: 'Espace Client',
  employee: 'Espace Professionnel',
};

export const CONTEXT_ICONS: Record<AppContext, string> = {
  client: 'person-circle',
  employee: 'briefcase',
};

/** Derive available contexts from role + hasClientRecord */
export function deriveContexts(
  role: string,
  hasClientRecord: boolean
): { availableContexts: AppContext[]; defaultContext: AppContext } {
  const isEmployee = role !== _SystemRole.CLIENT;
  const availableContexts: AppContext[] = [];

  if (isEmployee) availableContexts.push('employee');
  if (hasClientRecord || role === _SystemRole.CLIENT) availableContexts.push('client');

  // Fallback: if nothing matched (shouldn't happen), default to client
  if (availableContexts.length === 0) availableContexts.push('client');

  const defaultContext: AppContext = isEmployee ? 'employee' : 'client';
  return { availableContexts, defaultContext };
}
