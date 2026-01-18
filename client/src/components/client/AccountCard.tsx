import React, { useState } from 'react';
import { CreditCard, Wallet, Lock, MoreVertical, Copy, Check, TrendingUp, Unlock, AlertTriangle, Ban, XCircle, FileText } from 'lucide-react';
import { Card, Badge } from '../ui';
import { toast } from 'sonner';

interface CompteBancaire {
  id: string;
  clientId: string;
  typeCompte: 'Courant' | 'Épargne' | 'Bloqué';
  numeroCompte: string;
  soldeCourant: string;
  tauxInteret?: number;
  statut: 'Actif' | 'Fermé' | 'Suspendu' | 'Clôturé' | 'EN_ATTENTE_PAIEMENT';
  blocageActif?: boolean;
  blocageMotif?: string;
  blocageFin?: string;
  dateOuverture?: string;
  createdAt: string;
}

interface AccountCardProps {
  compte: CompteBancaire;
  onEdit?: (compte: CompteBancaire) => void;
  onAction?: (action: 'suspend' | 'close' | 'details' | 'history', compte: CompteBancaire) => void;
}

export default function AccountCard({ compte, onEdit, onAction }: AccountCardProps) {
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

  const handleMenuAction = (action: 'suspend' | 'close' | 'details' | 'history', e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    onAction?.(action, compte);
  };

  return (
    <Card
      variant="default"
      padding="sm"
      className={`hover:border-cyan-500/30 transition-colors group relative overflow-visible ${isBloque ? 'border-amber-500/30' : ''}`}
      onClick={() => onAction?.('history', compte)}
    >
        {/* Decorative background gradient */}
        {isBloque ? (
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none transition-opacity group-hover:opacity-100 opacity-50"></div>
        ) : isEpargne ? (
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none transition-opacity group-hover:opacity-100 opacity-50"></div>
        ) : (
            <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none transition-opacity group-hover:opacity-100 opacity-50"></div>
        )}

      <div className="flex items-start justify-between mb-3 relative z-10">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isBloque ? 'bg-amber-500/10 text-amber-400' : isEpargne ? 'bg-emerald-500/10 text-emerald-400' : 'bg-cyan-500/10 text-cyan-400'}`}>
            <Icon size={20} />
          </div>
          <div>
            <h4 className="font-semibold text-white text-sm flex items-center gap-1.5">
              {compte.typeCompte}
              {isBloque && <Lock size={12} className="text-amber-400" />}
            </h4>
            <div className="flex items-center gap-2 group/number">
                <p className="text-[10px] text-slate-500 font-mono tracking-wider">{compte.numeroCompte}</p>
                <button onClick={handleCopyNumber} className="opacity-0 group-hover/number:opacity-100 transition-opacity text-slate-600 hover:text-cyan-400">
                    <Copy size={10} />
                </button>
            </div>
          </div>
        </div>
        
        {/* Kebab Menu */}
        <div className="relative" ref={menuRef}>
            <button 
                onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                className="p-1.5 rounded bg-slate-800/50 hover:bg-slate-700 text-slate-400 hover:text-white transition"
            >
                <MoreVertical size={16} />
            </button>
            
            {showMenu && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in duration-150">
                    <button onClick={(e) => handleMenuAction('details', e)} className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2">
                        <FileText size={14} /> Détails & RIB
                    </button>
                    <button onClick={(e) => handleMenuAction('history', e)} className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2">
                        <TrendingUp size={14} /> Historique
                    </button>
                    <div className="h-px bg-slate-800 my-1"></div>
                    {compte.statut === 'Actif' ? (
                        <button onClick={(e) => handleMenuAction('suspend', e)} className="w-full text-left px-4 py-2 text-sm text-amber-400 hover:bg-amber-950/30 flex items-center gap-2">
                            <Ban size={14} /> Suspendre
                        </button>
                    ) : (
                        <button onClick={(e) => handleMenuAction('suspend', e)} className="w-full text-left px-4 py-2 text-sm text-emerald-400 hover:bg-emerald-950/30 flex items-center gap-2">
                            <Check size={14} /> Réactiver
                        </button>
                    )}
                     <button onClick={(e) => handleMenuAction('close', e)} className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-950/30 flex items-center gap-2">
                        <XCircle size={14} /> Clôturer
                    </button>
                </div>
            )}
        </div>
      </div>

      <div className="relative z-10">
          <div className="flex justify-between items-end mb-1">
             <p className="text-[10px] text-slate-500 uppercase tracking-tight">
               {isBloque ? 'Solde (Bloqué)' : 'Solde Disponible'}
             </p>
             <Badge 
                value={
                   compte.statut === 'EN_ATTENTE_PAIEMENT' ? 'En attente paiement' :
                   compte.statut === 'Actif' ? 'Actif' :
                   compte.statut === 'Suspendu' ? 'Suspendu' :
                   compte.statut === 'Clôturé' ? 'Clôturé' :
                   compte.statut === 'Fermé' ? 'Fermé' :
                   (compte.statut as string).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())
                } 
                size="sm" 
                variant={
                    compte.statut === 'Actif' ? 'success' : 
                    compte.statut === 'Suspendu' ? 'warning' : 
                    compte.statut === 'EN_ATTENTE_PAIEMENT' ? 'danger' :
                    'danger'
                } 
             />
          </div>
          
          <div className="flex items-baseline gap-1">
              <span className={`text-2xl font-bold tracking-tight ${isBloque ? 'text-amber-300' : 'text-white'}`}>
                {solde.toLocaleString()}
              </span>
              <span className="text-xs font-medium text-slate-500">FCFA</span>
          </div>

          {isEpargne && (compte.tauxInteret || 0) > 0 && (
              <div className="flex items-center gap-1 mt-1">
                  <TrendingUp size={10} className="text-emerald-500" />
                  <span className="text-[10px] text-emerald-500 font-medium">+{compte.tauxInteret}% d'intérêts</span>
              </div>
          )}

          {isBloque && compte.blocageFin && (
              <div className="flex items-center gap-1 mt-1">
                  <Unlock size={10} className="text-amber-500" />
                  <span className="text-[10px] text-amber-500 font-medium">
                    Déblocage: {new Date(compte.blocageFin).toLocaleDateString('fr-FR')}
                  </span>
              </div>
          )}
      </div>
    </Card>
  );
}
