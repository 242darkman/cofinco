import React, { useState } from 'react';
import { CreditCard, Wallet, Lock, MoreVertical, Copy, Check, TrendingUp, Unlock, AlertTriangle, Ban, XCircle, Clock } from 'lucide-react';
import { Card, Badge } from '../ui';
import { toast } from 'sonner';
import { StatutCompte, type StatutCompteType } from '@shared/enum/status-constants';
import { getStatusLabel, getStatusColor, ACCOUNT_STATUS_LABELS, ACCOUNT_STATUS_COLORS } from '@/lib/status-labels';

interface CompteBancaire {
  id: string;
  clientId: string;
  typeCompte: 'Courant' | 'Épargne' | 'Bloqué';
  numeroCompte: string;
  soldeCourant: string;
  tauxInteret?: number;
  statut: StatutCompteType; // Strict EN only
  blocageActif?: boolean;
  blocageMotif?: string;
  blocageFin?: string;
  dateOuverture?: string;
  createdAt: string;
}

interface AccountCardProps {
  compte: CompteBancaire;
  onEdit?: (compte: CompteBancaire) => void;
  onAction?: (action: 'suspend' | 'unsuspend' | 'close' | 'cancel_closure' | 'history' | 'activate', compte: CompteBancaire) => void;
  canSuspend?: boolean;
  canUnsuspend?: boolean;
  canCloseInitiate?: boolean;
  canCloseCancel?: boolean;
}

export default function AccountCard({ compte, onEdit, onAction, canSuspend = true, canUnsuspend = true, canCloseInitiate = true, canCloseCancel = true }: AccountCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  
  const getCompteIcon = (type: string) => {
    if (type === 'Bloqué') return Lock;
    return type === 'Courant' ? CreditCard : Wallet;
  };

  const Icon = getCompteIcon(compte.typeCompte);
  const isEpargne = compte.typeCompte === 'Épargne';
  const isBloque = compte.typeCompte === 'Bloqué' || compte.blocageActif;
  const solde = Number(compte.soldeCourant) || 0;

  const handleCopyNumber = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(compte.numeroCompte);
    toast.success('Numéro de compte copié !');
  };

  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isPendingPayment = compte.statut === StatutCompte.PENDING_PAYMENT
    || compte.statut === StatutCompte.PENDING_PAYMENT_AND_APPROVAL
    || compte.statut === StatutCompte.PENDING_ACTIVATION;
  const isSuspended = compte.statut === StatutCompte.SUSPENDED;
  const isClosurePending = compte.statut === StatutCompte.CLOSURE_PENDING;
  const isClosed = compte.statut === StatutCompte.CLOSED;
  const isCancelled = compte.statut === StatutCompte.CANCELLED;
  const isTerminal = isClosed || isCancelled;

  const handleMenuAction = (action: 'suspend' | 'unsuspend' | 'close' | 'cancel_closure' | 'history' | 'activate', e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    onAction?.(action, compte);
  };

  return (
    <Card
      variant="default"
      padding="sm"
      className={`hover:border-accent/30 transition-colors group relative overflow-visible ${isBloque ? 'border-status-warning/30' : ''}`}
      onClick={() => onAction?.('history', compte)}
    >
        {/* Decorative background gradient */}
        {isPendingPayment ? (
            <div className="absolute top-0 right-0 w-24 h-24 bg-status-info/5 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none transition-opacity group-hover:opacity-100 opacity-50"></div>
        ) : isBloque ? (
            <div className="absolute top-0 right-0 w-24 h-24 bg-status-warning/5 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none transition-opacity group-hover:opacity-100 opacity-50"></div>
        ) : isEpargne ? (
            <div className="absolute top-0 right-0 w-24 h-24 bg-status-success/5 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none transition-opacity group-hover:opacity-100 opacity-50"></div>
        ) : (
            <div className="absolute top-0 right-0 w-24 h-24 bg-accent/5 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none transition-opacity group-hover:opacity-100 opacity-50"></div>
        )}

      <div className={`flex items-start justify-between mb-3 relative ${showMenu ? 'z-50' : 'z-10'}`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isBloque ? 'bg-status-warning-bg text-status-warning' : isEpargne ? 'bg-status-success-bg text-status-success' : 'bg-accent/10 text-accent'}`}>
            <Icon size={20} />
          </div>
          <div>
            <h4 className="font-semibold text-content-primary text-sm flex items-center gap-1.5">
              {compte.typeCompte}
              {isBloque && <Lock size={12} className="text-status-warning" />}
            </h4>
            <div className="flex items-center gap-2 group/number">
                <p className="text-[10px] text-content-muted font-mono tracking-wider">{compte.numeroCompte}</p>
                <button onClick={handleCopyNumber} className="opacity-0 group-hover/number:opacity-100 transition-opacity text-content-muted hover:text-accent">
                    <Copy size={10} />
                </button>
            </div>
          </div>
        </div>
        
        {/* Kebab Menu */}
        <div className="relative" ref={menuRef}>
            <button 
                onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                className="p-1.5 rounded bg-surface/50 hover:bg-surface-elevated text-content-muted hover:text-content-primary transition"
            >
                <MoreVertical size={16} />
            </button>
            
            {showMenu && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-surface-base border border-edge rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in duration-150">
                    <button onClick={(e) => handleMenuAction('history', e)} className="w-full text-left px-4 py-2 text-sm text-content-secondary hover:bg-surface hover:text-content-primary flex items-center gap-2">
                        <TrendingUp size={14} /> Historique
                    </button>
                    {isPendingPayment && (
                      <>
                        <div className="h-px bg-surface my-1"></div>
                        <button onClick={(e) => handleMenuAction('activate', e)} className="w-full text-left px-4 py-2 text-sm text-status-info hover:bg-status-info-bg flex items-center gap-2">
                          <Wallet size={14} /> Payer & Activer
                        </button>
                      </>
                    )}
                    {!isTerminal && !isClosurePending && !isPendingPayment && (
                      <>
                        <div className="h-px bg-surface my-1"></div>
                        {isSuspended ? (
                          canUnsuspend && (
                            <button onClick={(e) => handleMenuAction('unsuspend', e)} className="w-full text-left px-4 py-2 text-sm text-status-success hover:bg-status-success-bg flex items-center gap-2">
                              <Check size={14} /> Lever la suspension
                            </button>
                          )
                        ) : (
                          canSuspend && (
                            <button onClick={(e) => handleMenuAction('suspend', e)} className="w-full text-left px-4 py-2 text-sm text-status-warning hover:bg-status-warning-bg flex items-center gap-2">
                              <Ban size={14} /> Suspendre
                            </button>
                          )
                        )}
                        {canCloseInitiate && (
                          <button onClick={(e) => handleMenuAction('close', e)} className="w-full text-left px-4 py-2 text-sm text-status-danger hover:bg-status-danger-bg flex items-center gap-2">
                            <XCircle size={14} /> Clôturer
                          </button>
                        )}
                      </>
                    )}
                    {isClosurePending && (
                      <>
                        <div className="h-px bg-surface my-1"></div>
                        <div className="px-4 py-2 text-xs text-status-info flex items-center gap-2">
                          <Clock size={12} /> Clôture en attente d'approbation
                        </div>
                        {canCloseCancel && (
                          <button onClick={(e) => handleMenuAction('cancel_closure', e)} className="w-full text-left px-4 py-2 text-sm text-status-danger hover:bg-status-danger-bg flex items-center gap-2">
                            <XCircle size={14} /> Annuler la clôture
                          </button>
                        )}
                      </>
                    )}
                </div>
            )}
        </div>
      </div>

      <div className="relative">
          <div className="flex justify-between items-end mb-1">
             <p className="text-[10px] text-content-muted uppercase tracking-tight">
               {isBloque ? 'Solde (Bloqué)' : 'Solde Disponible'}
             </p>
             <Badge
                value={getStatusLabel(compte.statut, ACCOUNT_STATUS_LABELS)}
                size="sm"
                className={getStatusColor(compte.statut, ACCOUNT_STATUS_COLORS)}
             />
          </div>
          
          <div className="flex items-baseline gap-1">
              <span className={`text-2xl font-bold tracking-tight ${isBloque ? 'text-status-warning' : 'text-content-primary'}`}>
                {solde.toLocaleString()}
              </span>
              <span className="text-xs font-medium text-content-muted">FCFA</span>
          </div>

          {isEpargne && (compte.tauxInteret || 0) > 0 && (
              <div className="flex items-center gap-1 mt-1">
                  <TrendingUp size={10} className="text-status-success" />
                  <span className="text-[10px] text-status-success font-medium">+{compte.tauxInteret}% d'intérêts</span>
              </div>
          )}

          {isBloque && compte.blocageFin && (
              <div className="flex items-center gap-1 mt-1">
                  <Unlock size={10} className="text-status-warning" />
                  <span className="text-[10px] text-status-warning font-medium">
                    Déblocage: {new Date(compte.blocageFin).toLocaleDateString('fr-FR')}
                  </span>
              </div>
          )}
      </div>
    </Card>
  );
}
