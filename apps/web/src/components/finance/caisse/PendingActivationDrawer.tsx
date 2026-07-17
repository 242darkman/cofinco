
import React, { useState, useCallback } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../../ui/sheet';
import { Input, Button, Badge } from '../../ui';
import { Search, UserCheck, Clock, CheckCircle2, CheckSquare, Square } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { api, compteEpargneApi } from '../../../lib/api-client';
import { usePermissions } from '../../auth/ProtectedFeature';
import { resolveClientPhotoUrl } from '@/lib/format';
import { getStatusLabel, ACCOUNT_TYPE_LABELS } from '@/lib/status-labels';
import { toast } from '../../../lib/toast';

export interface PendingAccount {
  id: string;
  numeroCompte: string;
  typeCompte: string;
  montantInitial: number;
  createdAt: string;
  client: {
    id: string;
    nom: string;
    prenom: string;
    photoProfile?: string;
  };
}

interface PendingActivationDrawerProps {
  open: boolean;
  onClose: () => void;
  /** ID de la session de caisse active (requis pour batch activate) */
  sessionId: string;
  /** Callback avec le compte complet pour le modal d'activation dédié */
  onActivate: (account: PendingAccount) => void;
}

export function PendingActivationDrawer({ open, onClose, sessionId, onActivate }: PendingActivationDrawerProps) {
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canActivate = hasPermission('comptes', 'create') || hasPermission('caisse', 'manage');

  // Batch selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchActivating, setBatchActivating] = useState(false);

  // Sync cache key with CaisseDashboard
  const { data, isLoading, refetch } = useQuery({
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

  // Toggle single selection
  const toggleSelect = useCallback((accountId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(accountId)) {
        next.delete(accountId);
      } else {
        next.add(accountId);
      }
      return next;
    });
  }, []);

  // Toggle all selection
  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredAccounts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAccounts.map(a => a.id)));
    }
  }, [filteredAccounts, selectedIds.size]);

  // Batch activate handler
  const handleBatchActivate = useCallback(async () => {
    if (selectedIds.size === 0) return;

    setBatchActivating(true);
    try {
      const result = await compteEpargneApi.batchActivate(Array.from(selectedIds), sessionId);

      if (result.activated > 0) {
        toast.success(`${result.activated} compte(s) activé(s)`);
      }
      if (result.failed > 0) {
        toast.warning(`${result.failed} activation(s) échouée(s)`);
      }

      // Clear selection and refresh
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['comptes', 'pending-activation'] });
      refetch();
    } catch (error: unknown) {
      toast.error((error as Error).message || 'Erreur lors de l\'activation batch');
    } finally {
      setBatchActivating(false);
    }
  }, [selectedIds, queryClient, refetch]);

  const allSelected = filteredAccounts.length > 0 && selectedIds.size === filteredAccounts.length;
  const someSelected = selectedIds.size > 0;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col bg-surface-base border-edge">
        <div className="p-6 border-b border-edge bg-surface-base/50">
          <SheetHeader>
            <SheetTitle className="text-content-primary flex items-center gap-2">
              <UserCheck className="text-status-warning" />
              Activations Requises
              {accounts.length > 0 && (
                <Badge
                  variant="warning"
                  className="ml-2 bg-status-warning text-white border-none"
                  value={accounts.length}
                />
              )}
            </SheetTitle>
            <SheetDescription className="text-content-muted">
              Encaissez les dépôts initiaux pour activer les comptes.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted w-4 h-4" />
            <Input
              placeholder="Rechercher nom ou numéro..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-surface-base border-edge text-content-primary placeholder:text-content-muted"
            />
          </div>

          {/* Batch actions bar */}
          {filteredAccounts.length > 0 && (
            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-2 text-xs text-content-muted hover:text-content-primary transition"
              >
                {allSelected ? (
                  <CheckSquare size={16} className="text-status-warning" />
                ) : (
                  <Square size={16} />
                )}
                {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
              </button>

              {someSelected && canActivate && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleBatchActivate}
                  disabled={batchActivating}
                  className="bg-status-success hover:bg-status-success text-xs"
                >
                  {batchActivating ? (
                    <Spinner size="xs" tone="current" className="mr-1" />
                  ) : (
                    <CheckCircle2 size={14} className="mr-1" />
                  )}
                  Activer {selectedIds.size} compte{selectedIds.size > 1 ? 's' : ''}
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading ? (
             <div className="flex justify-center py-8 text-content-muted">Chargement...</div>
          ) : filteredAccounts.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-full text-content-muted space-y-4 opacity-60">
                <CheckCircle2 size={48} className="text-status-success" />
                <p>Aucune activation en attente</p>
             </div>
          ) : (
             filteredAccounts.map((account) => {
                const isSelected = selectedIds.has(account.id);
                return (
                  <div
                    key={account.id}
                    className={`bg-surface-base border rounded-xl p-4 flex flex-col gap-3 group transition-all ${
                      isSelected
                        ? 'border-status-warning/50 bg-status-warning/5'
                        : 'border-edge hover:border-status-warning/30'
                    }`}
                  >
                     <div className="flex justify-between items-start">
                        <div className="flex gap-3">
                           {/* Selection checkbox */}
                           <button
                             onClick={(e) => toggleSelect(account.id, e)}
                             className="flex-shrink-0 self-center"
                           >
                             {isSelected ? (
                               <CheckSquare size={20} className="text-status-warning" />
                             ) : (
                               <Square size={20} className="text-content-muted hover:text-content-muted" />
                             )}
                           </button>

                           <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center overflow-hidden border border-edge">
                              {resolveClientPhotoUrl(account.client.photoProfile) && !imageErrors[account.id] ? (
                                 <img
                                   src={resolveClientPhotoUrl(account.client.photoProfile)}
                                   alt="Client"
                                   className="w-full h-full object-cover"
                                   onError={() => handleImageError(account.id)}
                                 />
                              ) : (
                                 <UserCheck size={20} className="text-content-muted" />
                              )}
                           </div>
                           <div>
                              <h4 className="font-medium text-content-secondary">
                                 {account.client.nom} {account.client.prenom}
                              </h4>
                              <div className="flex items-center gap-2 text-xs text-content-muted">
                                 <Badge
                                    variant="outline"
                                    className="text-[10px] px-1 py-0 h-4 border-edge text-content-muted"
                                    value={getStatusLabel(account.typeCompte, ACCOUNT_TYPE_LABELS)}
                                 />
                                 <span className="flex items-center gap-1">
                                    <Clock size={10} />
                                    {formatDistanceToNow(new Date(account.createdAt), { addSuffix: true, locale: fr })}
                                 </span>
                              </div>
                           </div>
                        </div>
                        <div className="text-right">
                           <p className="text-lg font-bold text-content-primary">
                              {formattedMoney(account.montantInitial)}
                           </p>
                           <p className="text-xs text-content-muted font-mono">{account.numeroCompte}</p>
                        </div>
                     </div>

                     {canActivate && (
                     <Button
                        className="w-full bg-status-success hover:bg-status-success text-white h-11 font-medium shadow-lg shadow-status-success/10 active:scale-[0.98] transition-all"
                        onClick={() => onActivate(account)}
                     >
                        Encaisser maintenant
                     </Button>
                     )}
                  </div>
                );
             })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
