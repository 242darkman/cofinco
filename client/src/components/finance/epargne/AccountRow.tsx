import React from 'react';
import { MoreHorizontal, Lock, TrendingUp, TrendingDown, Eye, AlertTriangle, Banknote } from 'lucide-react';
import Badge from '../../ui/Badge';
import { getAccountUiConfig, getAccountBalance, getRealBalance, getPendingDepositAmount } from '../../../lib/account-config';
import { formatClientName } from '../../../lib/format';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { IconButton } from '../../ui';

// Mapping EN -> FR pour les types de compte
const TYPE_COMPTE_LABELS: Record<string, string> = {
  'CURRENT': 'Courant',
  'SAVINGS': 'Épargne',
  'BLOCKED': 'Bloqué',
  // Legacy FR values (for backwards compatibility)
  'Courant': 'Courant',
  'Épargne': 'Épargne',
  'Bloqué': 'Bloqué',
};

const getTypeCompteLabel = (type: string): string => {
  return TYPE_COMPTE_LABELS[type] || type;
};

interface AccountRowProps {
  account: any;
  onManage: (account: any) => void;
  onTransaction: (account: any, type: 'Dépôt' | 'Retrait') => void;
  onAction?: (action: string, account: any) => void;
}

const AccountRow: React.FC<AccountRowProps> = ({ account, onManage, onTransaction, onAction }) => {
  const uiConfig = getAccountUiConfig(account, 'staff');
  const balance = getAccountBalance(account);
  const realBalance = getRealBalance(account);
  const pendingAmount = getPendingDepositAmount(account);
  const isPending = uiConfig.isPendingActivation;
  
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

  const clientName = formatClientName(account.clients?.nom, account.clients?.prenom);
  const initials = getInitials(account.clients?.nom || '?', account.clients?.prenom);
  const avatarColor = getAvatarColor(clientName || 'Inconnu');
  const clientPhotoUrl = account.clients?.photoUrl;

  return (
    <div
      className="group flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-surface-base hover:bg-slate-800/50 border-b border-edge transition-colors cursor-pointer gap-4 sm:gap-0"
      onClick={() => onManage(account)}
    >
      {/* Client & Account Info */}
      <div className="flex items-center gap-4 flex-1 min-w-0">
        {clientPhotoUrl ? (
          <img
            src={clientPhotoUrl}
            alt={clientName || 'Client'}
            className="w-10 h-10 rounded-full object-cover shrink-0 shadow-lg ring-2 ring-slate-900"
          />
        ) : (
          <div className={`w-10 h-10 rounded-full ${avatarColor} flex items-center justify-center text-white text-xs font-bold tracking-wider shrink-0 shadow-lg ring-2 ring-slate-900`}>
            {initials}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-white font-medium text-sm truncate">{clientName}</h3>
            {/* Mobile Only: Status Pill */}
             <div className="sm:hidden">
              <Badge 
                value={uiConfig.statusLabel} 
                className={`${uiConfig.badgeClassName} !bg-opacity-10 !border-opacity-20`}
                icon={uiConfig.isLocked ? <Lock size={10}/> : undefined}
                size="sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-slate-500 font-mono tracking-wide">{account.numeroCompte}</span>
            <span className="hidden sm:inline-flex text-[10px] text-slate-600 border border-slate-700/50 px-1.5 rounded bg-slate-800/50">
               {getTypeCompteLabel(account.typeCompte || '')}
            </span>
          </div>
        </div>
      </div>

      {/* Financials & Status (Desktop) */}
      <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto mt-2 sm:mt-0">

        {/* Balance */}
        <div className="text-right">
             {isPending ? (
               // PENDING_ACTIVATION: Show grayed out "virtual" amount with lock icon
               <div className="flex items-center gap-2">
                 <Lock size={14} className="text-slate-500" />
                 <span className="text-slate-500 font-mono tracking-tight line-through decoration-slate-600">
                   {pendingAmount.toLocaleString('fr-FR')} <span className="text-xs ml-0.5">FCFA</span>
                 </span>
               </div>
             ) : (
               <div className="text-emerald-400 font-bold font-mono tracking-tight">
                  {realBalance.toLocaleString('fr-FR')} <span className="text-xs text-slate-500 ml-0.5">FCFA</span>
               </div>
             )}
             {isPending ? (
               <div className="text-[10px] text-amber-500 hidden sm:block font-medium">
                 Non encaissé
               </div>
             ) : uiConfig.interestRate > 0 ? (
                <div className="text-[10px] text-slate-500 hidden sm:block">
                   Taux: {uiConfig.interestRate}%
                </div>
             ) : null}
        </div>

        {/* Status Desktop */}
        <div className="hidden sm:flex items-center justify-center w-24">
             <Badge 
                value={uiConfig.statusLabel} 
                className={`${uiConfig.badgeClassName} px-3 py-1 !rounded-full !bg-opacity-10 !border-opacity-20 font-medium`}
                icon={uiConfig.isLocked ? <Lock size={12}/> : undefined}
              />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
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
    </div>
  );
};

export default AccountRow;
