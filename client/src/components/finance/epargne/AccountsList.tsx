import React from 'react';
import { Search, MoreHorizontal, Lock, TrendingUp, TrendingDown, Eye, Banknote } from 'lucide-react';
import { getAccountUiConfig, getAccountBalance, getRealBalance, getPendingDepositAmount } from '../../../lib/account-config';
import { formatClientName } from '../../../lib/format';
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
  numero_compte: string;
  numeroCompte?: string; // Compatibility
  type_compte: string;
  typeCompte?: string; // Compatibility
  solde: number;
  soldeCourant?: number;
  solde_courant?: number;
  statut: string;
  client_id: string;
  clientId?: string;
  created_at?: string;
  createdAt?: string;
  date_ouverture?: string;
  taux_interet?: number;
  tauxInteret?: number;
  clients: {
    id: string;
    nom: string;
    prenom?: string;
    phone?: string;
    telephone?: string;
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
  { value: StatutCompte.PENDING_ACTIVATION, label: 'En attente' },
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

  if (loading) {
     return (
        <div className="p-12 flex justify-center items-center">
           <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
     );
  }

  if (data.length === 0) {
      return (
         <div className="p-12 text-center text-content-muted flex flex-col items-center">
            <Search size={48} className="opacity-20 mb-4" />
            <p className="text-lg font-medium">Aucun compte trouvé</p>
         </div>
      );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* HEADER DU TABLEAU (Labels des colonnes) */}
      <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-semibold text-content-muted uppercase tracking-wider bg-surface-muted/50 border-b border-edge rounded-t-xl hidden sm:grid">
        <div className="col-span-5 pl-14">Client / Compte</div>
        <div className="col-span-3 text-right">Solde</div>
        <div className="col-span-3">Statut</div>
        <div className="col-span-1 text-center">Actions</div>
      </div>

      {/* LISTE DES COMPTES */}
      <div className="space-y-2">
        {displayedData.map((account) => {
          const uiConfig = getAccountUiConfig(account, 'staff');
          const balance = getAccountBalance(account);
          const realBalance = getRealBalance(account);
          const pendingAmount = getPendingDepositAmount(account);
          const isPending = uiConfig.isPendingActivation;
          const clientName = formatClientName(account.clients?.nom, account.clients?.prenom);
          const initials = getInitials(account.clients?.nom || '?', account.clients?.prenom);
          const avatarColor = getAvatarColor(clientName || 'Inconnu');

          return (
            <div key={account.id} 
                 onClick={() => onManage(account)}
                 className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center p-4 bg-surface-base hover:bg-slate-800/50 rounded-xl hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-700 cursor-pointer shadow-sm sm:shadow-none"
            >
            
              {/* 1. INFO CLIENT */}
              <div className="col-span-1 sm:col-span-5 flex items-center gap-4 min-w-0">
                 <div className={`w-10 h-10 rounded-full ${avatarColor} flex items-center justify-center text-white text-xs font-bold tracking-wider shrink-0 shadow-lg ring-2 ring-slate-900`}>
                  {initials}
                </div>
                <div className="min-w-0">
                    <h3 className="text-white font-medium text-sm truncate">{clientName}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-500 font-mono tracking-wide">{account.numero_compte}</span>
                        <span className="text-[10px] text-slate-600 border border-slate-700/50 px-1.5 rounded bg-slate-800/50">
                        {getTypeCompteLabel(account.type_compte || account.typeCompte || '')}
                        </span>
                    </div>
                </div>
              </div>

              {/* Mobile Layout Adjustment Wrapper */}
              <div className="col-span-1 sm:hidden flex justify-between items-center border-t border-slate-800 pt-3 mt-1">
                 {/* Mobile Status */}
                 <span className={`text-xs px-2.5 py-0.5 rounded-full border ${uiConfig.badgeClassName} !bg-opacity-10 !border-opacity-20 whitespace-nowrap`}>
                   {uiConfig.statusLabel}
                 </span>

                 {/* Mobile Balance */}
                 <div className="text-right">
                    {isPending ? (
                      <div className="flex items-center gap-1">
                        <Lock size={12} className="text-slate-500" />
                        <span className="font-mono text-slate-500 line-through">{pendingAmount.toLocaleString('fr-FR')} FCFA</span>
                      </div>
                    ) : (
                      <div className="font-bold text-white">{realBalance.toLocaleString('fr-FR')} FCFA</div>
                    )}
                 </div>
              </div>

              {/* 2. SOLDE (Alignement Droite strict) - Desktop */}
              <div className="hidden sm:block col-span-3 text-right">
                {isPending ? (
                  <>
                    <div className="flex items-center justify-end gap-1">
                      <Lock size={12} className="text-slate-500" />
                      <span className="font-mono text-slate-500 line-through tracking-tight">{pendingAmount.toLocaleString('fr-FR')} <span className="text-xs">FCFA</span></span>
                    </div>
                    <div className="text-[10px] text-amber-500 font-medium">Non encaissé</div>
                  </>
                ) : (
                  <>
                    <div className="font-bold text-emerald-400 font-mono tracking-tight">{realBalance.toLocaleString('fr-FR')} <span className="text-xs text-slate-500">FCFA</span></div>
                    {type === TypeCompte.SAVINGS && (account.taux_interet || 0) > 0 && (
                      <div className="text-[10px] text-slate-500">Taux: {account.taux_interet}%</div>
                    )}
                  </>
                )}
              </div>

              {/* 3. STATUT (Badge pill) - Desktop */}
              <div className="hidden sm:flex col-span-3 justify-start">
                 <span className={`text-xs px-2.5 py-1 rounded-full border ${uiConfig.badgeClassName} !bg-opacity-10 !border-opacity-20 font-medium whitespace-nowrap flex items-center gap-1.5`}>
                   {uiConfig.isLocked && <Lock size={10} />}
                   {uiConfig.statusLabel}
                 </span>
              </div>

              {/* 4. ACTIONS */}
              <div className="hidden sm:flex col-span-1 justify-center" onClick={(e) => e.stopPropagation()}>
                <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                        <button className="p-2 hover:bg-slate-700/50 text-slate-400 hover:text-white rounded-lg transition-colors outline-none focus:ring-2 focus:ring-blue-500/50">
                            <MoreHorizontal size={20} />
                        </button>
                    </DropdownMenu.Trigger>
                    
                    <DropdownMenu.Portal>
                        <DropdownMenu.Content 
                            className="min-w-[180px] bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1 z-50 animate-in fade-in zoom-in-95 duration-100"
                            sideOffset={5}
                            align="end"
                        >
                            <DropdownMenu.Item 
                                onSelect={() => onManage(account)}
                                className="group flex items-center px-2 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg outline-none cursor-pointer"
                            >
                                <Eye className="mr-2 h-4 w-4 text-slate-400 group-hover:text-white" />
                                Voir Détails
                            </DropdownMenu.Item>
                            
                            <DropdownMenu.Separator className="h-px bg-slate-800 my-1" />

                            {isPending ? (
                              // PENDING_ACTIVATION: Show "Encaisser Dépôt" as primary action
                              <DropdownMenu.Item
                                onSelect={() => onTransaction(account, 'Dépôt')}
                                className="group flex items-center px-2 py-2 text-sm text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg outline-none cursor-pointer font-medium"
                              >
                                <Banknote className="mr-2 h-4 w-4" />
                                Encaisser le dépôt initial
                              </DropdownMenu.Item>
                            ) : (
                              <>
                                <DropdownMenu.Item
                                    onSelect={() => onTransaction(account, 'Dépôt')}
                                    disabled={!uiConfig.canReceive}
                                    className="group flex items-center px-2 py-2 text-sm text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <TrendingUp className="mr-2 h-4 w-4" />
                                    Faire un Dépôt
                                </DropdownMenu.Item>

                                <DropdownMenu.Item
                                    onSelect={() => onTransaction(account, 'Retrait')}
                                    disabled={!uiConfig.canTransferOut}
                                    className="group flex items-center px-2 py-2 text-sm text-blue-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <TrendingDown className="mr-2 h-4 w-4" />
                                    Faire un Retrait
                                </DropdownMenu.Item>
                              </>
                            )}
                        </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination is handled by parent component via API */}
    </div>
  );
}
