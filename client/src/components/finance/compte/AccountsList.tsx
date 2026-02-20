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
    telephone?: string;
    photoProfile?: string;
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
      'bg-status-info', 'bg-status-success', 'bg-accent', 
      'bg-status-warning', 'bg-status-danger', 'bg-accent-secondary'
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
            const photoUrl = resolveStorageUrl(account.clients?.photoProfile);

            return (
              <div className="flex items-center gap-3 min-w-0">
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt={clientName}
                    className="w-8 h-8 rounded-full object-cover shrink-0 shadow-sm ring-1 ring-edge/50 bg-surface-muted"
                  />
                ) : (
                  <div className={`w-8 h-8 rounded-full ${avatarColor} flex items-center justify-center text-white text-[10px] font-bold tracking-wider shrink-0 shadow-sm ring-1 ring-edge/50`}>
                    {initials}
                  </div>
                )}
                <div className="min-w-0">
                    <h3 className="text-content-primary font-medium text-xs truncate">{clientName}</h3>
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-content-muted font-mono tracking-wide">{account.numeroCompte}</span>
                        <span className="text-[9px] text-content-muted border border-edge-subtle px-1 rounded bg-surface-muted/50">
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
                    <Lock size={10} className="text-content-muted" />
                    <span className="font-mono text-content-muted line-through tracking-tight text-xs">{pendingAmount.toLocaleString('fr-FR')} <span className="text-[9px]">FCFA</span></span>
                  </div>
                  <div className="text-[9px] text-status-warning font-medium">Non encaissé</div>
                </div>
              );
            }

            return (
              <div className="flex flex-col items-end">
                <div className="font-bold text-status-success font-mono tracking-tight text-xs">{realBalance.toLocaleString('fr-FR')} <span className="text-[9px] text-content-muted">FCFA</span></div>
                {type === TypeCompte.SAVINGS && (account.tauxInteret || 0) > 0 && (
                  <div className="text-[9px] text-content-muted">Taux: {account.tauxInteret}%</div>
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
                  <button className="p-1 hover:bg-surface-muted text-content-muted hover:text-content-muted rounded transition-colors outline-none focus:ring-2 focus:ring-status-info/50">
                      <MoreHorizontal size={16} />
                  </button>
              </DropdownMenu.Trigger>
              
              <DropdownMenu.Portal>
                  <DropdownMenu.Content 
                      className="min-w-[160px] bg-surface border border-edge rounded-lg shadow-xl p-1 z-50 animate-in fade-in zoom-in-95 duration-100"
                      sideOffset={5}
                      align="end"
                  >
                      <DropdownMenu.Item 
                          onSelect={() => onManage(account)}
                          className="group flex items-center px-2 py-1.5 text-xs text-content-muted hover:text-content-primary hover:bg-surface-muted rounded outline-none cursor-pointer"
                      >
                          <Eye className="mr-2 h-3.5 w-3.5 text-content-muted group-hover:text-content-primary" />
                          Voir Détails
                      </DropdownMenu.Item>
                      
                      <DropdownMenu.Separator className="h-px bg-surface-subtle my-1" />

                      {isPending ? (
                        <DropdownMenu.Item
                          onSelect={() => onTransaction(account, 'Dépôt')}
                          className="group flex items-center px-2 py-1.5 text-xs text-status-warning hover:text-status-warning hover:bg-status-warning-bg rounded outline-none cursor-pointer font-medium"
                        >
                          <Banknote className="mr-2 h-3.5 w-3.5" />
                          Encaisser le dépôt initial
                        </DropdownMenu.Item>
                      ) : (
                        <>
                          <DropdownMenu.Item
                              onSelect={() => onTransaction(account, 'Dépôt')}
                              disabled={!uiConfig.canReceive}
                              className="group flex items-center px-2 py-1.5 text-xs text-status-success hover:text-status-success hover:bg-status-success-bg rounded outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                              <TrendingUp className="mr-2 h-3.5 w-3.5" />
                              Faire un Dépôt
                          </DropdownMenu.Item>

                          <DropdownMenu.Item
                              onSelect={() => onTransaction(account, 'Retrait')}
                              disabled={!uiConfig.canTransferOut}
                              className="group flex items-center px-2 py-1.5 text-xs text-status-info hover:text-status-info hover:bg-status-info-bg rounded outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
