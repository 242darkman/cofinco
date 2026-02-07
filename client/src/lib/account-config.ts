import { PiggyBank, Wallet, Lock } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { StatutCompte } from '@shared/enum/status-constants';

export type AccountType = 'Courant' | 'Épargne' | 'Bloqué';

export interface AccountLike {
  typeCompte?: string | null;
  statut?: string | null;
  blocageActif?: boolean | null;
  tauxInteret?: number | string | null;
  solde?: number | string | null;
  soldeCourant?: number | string | null;
  produit?: {
    tauxInteret?: number | string | null;
    typeCompte?: string | null;
  } | null;
}

export interface AccountUiConfig {
  type: AccountType;
  icon: LucideIcon;
  badgeClassName: string;
  accentClassName: string;
  statusLabel: string;
  isLocked: boolean;
  canTransferOut: boolean;
  canReceive: boolean;
  canUnlock: boolean;
  interestRate: number;
  isPendingActivation?: boolean;
}

export type AccountViewRole = 'client' | 'staff';

const TYPE_STYLES: Record<AccountType, { icon: LucideIcon; badgeClassName: string; accentClassName: string }> = {
  Courant: {
    icon: Wallet,
    badgeClassName: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
    accentClassName: 'text-emerald-400',
  },
  Épargne: {
    icon: PiggyBank,
    badgeClassName: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
    accentClassName: 'text-amber-400',
  },
  Bloqué: {
    icon: Lock,
    badgeClassName: 'bg-red-500/15 text-red-300 border border-red-500/30',
    accentClassName: 'text-red-400',
  },
};

export function getAccountType(account: AccountLike): AccountType {
  const rawType = String(account.typeCompte || '').toLowerCase();
  if (rawType.includes('épargne') || rawType.includes('epargne')) return 'Épargne';
  if (rawType.includes('bloq')) return 'Bloqué';
  return 'Courant';
}

export function getAccountBalance(account: AccountLike): number {
  const value = account.solde ?? account.soldeCourant ?? 0;
  return Number(value) || 0;
}

export function getAccountInterestRate(account: AccountLike): number {
  const raw =
    account.produit?.tauxInteret ??
    account.tauxInteret ??
    0;
  return Number(raw) || 0;
}

import { getStatusLabel, getStatusColor, ACCOUNT_STATUS_LABELS, ACCOUNT_STATUS_COLORS } from './status-labels';

export function getAccountUiConfig(account: AccountLike, role: AccountViewRole = 'client'): AccountUiConfig {
  const type = getAccountType(account);
  const status = String(account.statut || StatutCompte.ACTIVE);
  const isLocked = type === 'Bloqué' || account.blocageActif === true;
  const isActive = status === StatutCompte.ACTIVE;
  const isPendingActivation = status === StatutCompte.PENDING_ACTIVATION;

  // Use centralized labels and colors
  const statusLabel = getStatusLabel(status, ACCOUNT_STATUS_LABELS);

  // Override color if the account is technically "Locked" but active?
  // Actually the pill should reflect the STATUS (Active/Closed),
  // lock icon shows lock state.
  const badgeClassName = getStatusColor(status, ACCOUNT_STATUS_COLORS);

  const interestRate = getAccountInterestRate(account);

  return {
    type,
    icon: TYPE_STYLES[type].icon,
    badgeClassName,
    accentClassName: TYPE_STYLES[type].accentClassName,
    statusLabel,
    isLocked,
    // PENDING_ACTIVATION accounts cannot do transfers - funds are virtual
    canTransferOut: isActive && !isLocked && !isPendingActivation,
    canReceive: isPendingActivation ? true : (isLocked ? true : isActive),
    canUnlock: role === 'staff' && isLocked,
    interestRate,
    isPendingActivation,
  };
}

/**
 * Get the "real" balance for display purposes.
 * PENDING_ACTIVATION accounts show 0 as real balance (funds not yet deposited).
 */
export function getRealBalance(account: AccountLike): number {
  const status = String(account.statut || StatutCompte.ACTIVE);
  if (status === StatutCompte.PENDING_ACTIVATION) {
    return 0; // Virtual funds - not yet encashed
  }
  return getAccountBalance(account);
}

/**
 * Get the pending deposit amount for PENDING_ACTIVATION accounts.
 */
export function getPendingDepositAmount(account: AccountLike): number {
  const status = String(account.statut || StatutCompte.ACTIVE);
  if (status === StatutCompte.PENDING_ACTIVATION) {
    return getAccountBalance(account); // This is the amount to be deposited
  }
  return 0;
}

export function getMonthlyInterestEstimate(balance: number, rate: number): number {
  if (!rate || balance <= 0) return 0;
  return Math.max(0, Math.round((balance * rate) / 100 / 12));
}
