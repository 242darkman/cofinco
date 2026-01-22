
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../../ui/sheet';
import { Input, Button, Badge } from '../../ui';
import { Search, UserCheck, Clock, CheckCircle2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { api } from '../../../lib/api-client';
import { resolveClientPhotoUrl } from '@/lib/format';

interface PendingActivationDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Callback avec compteId, montant ET clientId pour pré-remplir le modal de paiement */
  onActivate: (compteId: string, montant: number, clientId: string) => void;
}

interface PendingAccount {
  id: string;
  numeroCompte: string;
  typeCompte: string;
  montantInitial: number;
  createdAt: string;
  client: {
    id: string;
    nom: string;
    prenom: string;
    photoUrl?: string;
  };
}

export function PendingActivationDrawer({ open, onClose, onActivate }: PendingActivationDrawerProps) {
  const [search, setSearch] = useState('');

  // Sync cache key with CaisseDashboard
  const { data, isLoading } = useQuery({
    queryKey: ['comptes', 'pending-activation'],
    queryFn: async () => {
      const res = await api.get<PendingAccount[]>('/comptes/pending-activation');
      return res || [];
    },
    enabled: open,
    refetchInterval: open ? 10000 : false
  });

  const accounts = data || [];

  const filteredAccounts = accounts.filter(acc =>
    acc.client.nom.toLowerCase().includes(search.toLowerCase()) ||
    acc.client.prenom.toLowerCase().includes(search.toLowerCase()) ||
    acc.numeroCompte.includes(search)
  );

  const formattedMoney = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF' }).format(amount);
  };

  // Handle image load error by setting a state to hide the image
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const handleImageError = (id: string) => {
    setImageErrors(prev => ({ ...prev, [id]: true }));
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col bg-slate-950 border-slate-800">
        <div className="p-6 border-b border-slate-800 bg-slate-900/50">
          <SheetHeader>
            <SheetTitle className="text-white flex items-center gap-2">
              <UserCheck className="text-orange-500" />
              Activations Requises
              {accounts.length > 0 && (
                <Badge 
                  variant="warning" 
                  className="ml-2 bg-orange-500 text-white border-none"
                  value={accounts.length}
                />
              )}
            </SheetTitle>
            <SheetDescription className="text-slate-400">
              Encaissez les dépôts initiaux pour activer les comptes.
            </SheetDescription>
          </SheetHeader>
          
          <div className="mt-4 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
            <Input 
              placeholder="Rechercher nom ou numéro..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-slate-950 border-slate-800 text-white placeholder:text-slate-600"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading ? (
             <div className="flex justify-center py-8 text-slate-500">Chargement...</div>
          ) : filteredAccounts.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-4 opacity-60">
                <CheckCircle2 size={48} className="text-emerald-500" />
                <p>Aucune activation en attente</p>
             </div>
          ) : (
             filteredAccounts.map((account) => (
                <div key={account.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 group hover:border-orange-500/30 transition-all">
                   <div className="flex justify-between items-start">
                      <div className="flex gap-3">
                         <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden border border-slate-700">
                            {resolveClientPhotoUrl(account.client.photoUrl) ? (
                               <img 
                                 src={resolveClientPhotoUrl(account.client.photoUrl)} 
                                 alt="Client" 
                                 className="w-full h-full object-cover"
                                 onError={() => handleImageError(account.id)}
                               />
                            ) : (
                               <UserCheck size={20} className="text-slate-400" />
                            )}
                         </div>
                         <div>
                            <h4 className="font-medium text-slate-200">
                               {account.client.nom} {account.client.prenom}
                            </h4>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                               <Badge 
                                  variant="outline" 
                                  className="text-[10px] px-1 py-0 h-4 border-slate-700 text-slate-400"
                                  value={account.typeCompte}
                               />
                               <span className="flex items-center gap-1">
                                  <Clock size={10} />
                                  {formatDistanceToNow(new Date(account.createdAt), { addSuffix: true, locale: fr })}
                               </span>
                            </div>
                         </div>
                      </div>
                      <div className="text-right">
                         <p className="text-lg font-bold text-white">
                            {formattedMoney(account.montantInitial)}
                         </p>
                         <p className="text-xs text-slate-500 font-mono">{account.numeroCompte}</p>
                      </div>
                   </div>
                   
                   <Button
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-11 font-medium shadow-lg shadow-emerald-500/10 active:scale-[0.98] transition-all"
                      onClick={() => onActivate(account.id, account.montantInitial, account.client.id)}
                   >
                      Encaisser maintenant
                   </Button>
                </div>
             ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
