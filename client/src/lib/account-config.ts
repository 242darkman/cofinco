import { PiggyBank, Wallet, Lock } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { StatutCompte } from '@shared/enum/status-constants';

export type AccountType = 'Courant' | 'Épargne' | 'Bloqué';

export interface AccountLike {
  type_compte?: string | null;
  typeCompte?: string | null;
  statut?: string | null;
  blocage_actif?: boolean | null;
  blocageActif?: boolean | null;
  taux_interet?: number | string | null;
  tauxInteret?: number | string | null;
  solde?: number | string | null;
  solde_courant?: number | string | null;
  soldeCourant?: number | string | null;
  produit?: {
    tauxInteret?: number | string | null;
    taux_interet?: number | string | null;
    typeCompte?: string | null;
    type_compte?: string | null;
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
  const rawType = String(account.type_compte || account.typeCompte || '').toLowerCase();
  if (rawType.includes('épargne') || rawType.includes('epargne')) return 'Épargne';
  if (rawType.includes('bloq')) return 'Bloqué';
  return 'Courant';
}

export function getAccountBalance(account: AccountLike): number {
  const value = account.solde ?? account.soldeCourant ?? account.solde_courant ?? 0;
  return Number(value) || 0;
}

export function getAccountInterestRate(account: AccountLike): number {
  const raw =
    account.produit?.tauxInteret ??
    account.produit?.taux_interet ??
    account.taux_interet ??
    account.tauxInteret ??
    0;
  return Number(raw) || 0;
}

import { getStatusLabel, getStatusColor, ACCOUNT_STATUS_LABELS, ACCOUNT_STATUS_COLORS } from './status-labels';

export function getAccountUiConfig(account: AccountLike, role: AccountViewRole = 'client'): AccountUiConfig {
  const type = getAccountType(account);
  const status = String(account.statut || StatutCompte.ACTIVE);
  const isLocked = type === 'Bloqué' || account.blocageActif === true || account.blocage_actif === true;
  const isActive = status === StatutCompte.ACTIVE;
  
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
    canTransferOut: isActive && !isLocked,
    canReceive: isLocked ? true : isActive,
    canUnlock: role === 'staff' && isLocked,
    interestRate,
  };
}

export function getMonthlyInterestEstimate(balance: number, rate: number): number {
  if (!rate || balance <= 0) return 0;
  return Math.max(0, Math.round((balance * rate) / 100 / 12));
}
