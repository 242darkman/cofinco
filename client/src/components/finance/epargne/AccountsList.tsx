import React from 'react';
import { Search, MoreHorizontal, Lock, TrendingUp, TrendingDown, Eye, Banknote } from 'lucide-react';
import { ResponsiveTable } from '../../ui';
import { getAccountUiConfig, getAccountBalance, getRealBalance, getPendingDepositAmount } from '../../../lib/account-config';
import { formatClientName, resolveStorageUrl } from '../../../lib/format';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  StatutCompte,
  type StatutCompteType,
  TypeCompte,
  type TypeCompteType,
} from '@shared/enum/status-constants';

// Mapping EN -> FR pour les types de compte
const TYPE_COMPTE_LABELS: Record<string, string> = {
  'CURRENT': 'Courant',
  'SAVINGS': 'Épargne',
  'BLOCKED': 'Bloqué',
  'Courant': 'Courant',
  'Épargne': 'Épargne',
  'Bloqué': 'Bloqué',
};

const getTypeCompteLabel = (type: string): string => {
  return TYPE_COMPTE_LABELS[type] || type;
};

interface Compte {
  id: string;
  numeroCompte: string;
  typeCompte: string;
  solde: number;
  soldeCourant?: number;
  statut: string;
  clientId: string;
  createdAt?: string;
  dateOuverture?: string;
  tauxInteret?: number;
  clients: {
    id: string;
    nom: string;
    prenom?: string;
    phone?: string;
    telephone?: string;
    photoUrl?: string;
  } | null;
}

interface AccountsListProps {
  data: Compte[];
  /** Account type filter - uses enum values from TypeCompte */
  type: TypeCompteType;
  onManage: (account: Compte) => void;
  onTransaction: (account: Compte, type: 'Dépôt' | 'Retrait') => void;
  loading?: boolean;
  /** Optional status filter - uses enum values from StatutCompte */
  statusFilter?: StatutCompteType | 'all';
}

/** Status filter options using standardized enum values */
export const ACCOUNT_STATUS_FILTER_OPTIONS = [
  { value: 'all' as const, label: 'Tous les statuts' },
  { value: StatutCompte.ACTIVE, label: 'Actif' },
  { value: StatutCompte.PENDING_ACTIVATION, label: "En attente d'activation" },
  { value: StatutCompte.PENDING_PAYMENT, label: 'En attente de paiement' },
  { value: StatutCompte.PENDING_APPROVAL, label: 'En attente de validation' },
  { value: StatutCompte.PENDING_PAYMENT_AND_APPROVAL, label: 'En attente paiement & validation' },
  { value: StatutCompte.SUSPENDED, label: 'Suspendu' },
  { value: StatutCompte.CLOSED, label: 'Clôturé' },
] as const;

export default function AccountsList({ data, type, onManage, onTransaction, loading, statusFilter = 'all' }: AccountsListProps) {
  // Filter data by status if filter is set
  const displayedData = statusFilter === 'all'
    ? data
    : data.filter(account => account.statut === statusFilter);

  // Generate initials for avatar
  const getInitials = (nom: string, prenom?: string) => {
    return `${nom?.charAt(0) || ''}${prenom?.charAt(0) || ''}`.toUpperCase();
  };
  
  // Deterministic color for avatar based on name
  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 
      'bg-amber-500', 'bg-rose-500', 'bg-cyan-500'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <ResponsiveTable
      data={displayedData}
      loading={loading}
      density="compact"
      columns={[
        {
          key: 'client_compte',
          label: 'Client / Compte',
          primary: true,
          format: (_, account) => {
            const clientName = formatClientName(account.clients?.nom, account.clients?.prenom);
            const initials = getInitials(account.clients?.nom || '?', account.clients?.prenom);
            const avatarColor = getAvatarColor(clientName || 'Inconnu');
            const photoUrl = resolveStorageUrl(account.clients?.photoUrl);

            return (
              <div className="flex items-center gap-3 min-w-0">
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt={clientName}
                    className="w-8 h-8 rounded-full object-cover shrink-0 shadow-sm ring-1 ring-slate-900/50 bg-slate-100 dark:bg-slate-800"
                  />
                ) : (
                  <div className={`w-8 h-8 rounded-full ${avatarColor} flex items-center justify-center text-white text-[10px] font-bold tracking-wider shrink-0 shadow-sm ring-1 ring-slate-900/50`}>
                    {initials}
                  </div>
                )}
                <div className="min-w-0">
                    <h3 className="text-slate-900 dark:text-white font-medium text-xs truncate">{clientName}</h3>
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-500 font-mono tracking-wide">{account.numeroCompte}</span>
                        <span className="text-[9px] text-slate-500 border border-slate-200 dark:border-slate-700/50 px-1 rounded bg-slate-100 dark:bg-slate-800/50">
                          {getTypeCompteLabel(account.typeCompte)}
                        </span>
                    </div>
                </div>
              </div>
            );
          }
        },
        {
          key: 'solde',
          label: 'Solde',
          align: 'right',
          headerAlign: 'right',
          format: (_, account) => {
            const uiConfig = getAccountUiConfig(account, 'staff');
            const realBalance = getRealBalance(account);
            const pendingAmount = getPendingDepositAmount(account);
            const isPending = uiConfig.isPendingActivation;

            if (isPending) {
              return (
                <div className="flex flex-col items-end">
                  <div className="flex items-center justify-end gap-1">
                    <Lock size={10} className="text-slate-400" />
                    <span className="font-mono text-slate-400 line-through tracking-tight text-xs">{pendingAmount.toLocaleString('fr-FR')} <span className="text-[9px]">FCFA</span></span>
                  </div>
                  <div className="text-[9px] text-amber-500 font-medium">Non encaissé</div>
                </div>
              );
            }

            return (
              <div className="flex flex-col items-end">
                <div className="font-bold text-emerald-600 dark:text-emerald-400 font-mono tracking-tight text-xs">{realBalance.toLocaleString('fr-FR')} <span className="text-[9px] text-slate-400">FCFA</span></div>
                {type === TypeCompte.SAVINGS && (account.tauxInteret || 0) > 0 && (
                  <div className="text-[9px] text-slate-400">Taux: {account.tauxInteret}%</div>
                )}
              </div>
            );
          }
        },
        {
          key: 'statut',
          label: 'Statut',
          format: (_, account) => {
            const uiConfig = getAccountUiConfig(account, 'staff');
            return (
               <span className={`text-[10px] px-2 py-0.5 rounded-full border ${uiConfig.badgeClassName} !bg-opacity-10 !border-opacity-20 font-medium whitespace-nowrap flex items-center w-fit gap-1`}>
                 {uiConfig.isLocked && <Lock size={8} />}
                 {uiConfig.statusLabel}
               </span>
            );
          }
        }
      ]}
      actions={(account) => {
        const uiConfig = getAccountUiConfig(account, 'staff');
        const isPending = uiConfig.isPendingActivation;
        
        return (
          <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                  <button className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded transition-colors outline-none focus:ring-2 focus:ring-blue-500/50">
                      <MoreHorizontal size={16} />
                  </button>
              </DropdownMenu.Trigger>
              
              <DropdownMenu.Portal>
                  <DropdownMenu.Content 
                      className="min-w-[160px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl p-1 z-50 animate-in fade-in zoom-in-95 duration-100"
                      sideOffset={5}
                      align="end"
                  >
                      <DropdownMenu.Item 
                          onSelect={() => onManage(account)}
                          className="group flex items-center px-2 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded outline-none cursor-pointer"
                      >
                          <Eye className="mr-2 h-3.5 w-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-white" />
                          Voir Détails
                      </DropdownMenu.Item>
                      
                      <DropdownMenu.Separator className="h-px bg-slate-200 dark:bg-slate-800 my-1" />

                      {isPending ? (
                        <DropdownMenu.Item
                          onSelect={() => onTransaction(account, 'Dépôt')}
                          className="group flex items-center px-2 py-1.5 text-xs text-amber-600 dark:text-amber-500 hover:text-amber-700 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded outline-none cursor-pointer font-medium"
                        >
                          <Banknote className="mr-2 h-3.5 w-3.5" />
                          Encaisser le dépôt initial
                        </DropdownMenu.Item>
                      ) : (
                        <>
                          <DropdownMenu.Item
                              onSelect={() => onTransaction(account, 'Dépôt')}
                              disabled={!uiConfig.canReceive}
                              className="group flex items-center px-2 py-1.5 text-xs text-emerald-600 dark:text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                              <TrendingUp className="mr-2 h-3.5 w-3.5" />
                              Faire un Dépôt
                          </DropdownMenu.Item>

                          <DropdownMenu.Item
                              onSelect={() => onTransaction(account, 'Retrait')}
                              disabled={!uiConfig.canTransferOut}
                              className="group flex items-center px-2 py-1.5 text-xs text-blue-600 dark:text-blue-500 hover:text-blue-700 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                              <TrendingDown className="mr-2 h-3.5 w-3.5" />
                              Faire un Retrait
                          </DropdownMenu.Item>
                        </>
                      )}
                  </DropdownMenu.Content>
              </DropdownMenu.Portal>
          </DropdownMenu.Root>
        );
      }}
      onRowClick={(account) => onManage(account)}
      emptyMessage="Aucun compte trouvé"
      mobileBreakpoint="lg"
    />
  );
}
