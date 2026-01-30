import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Vault, ArrowUpRight, ArrowDownRight, RefreshCw, TrendingUp } from 'lucide-react';
import { Card, Badge } from '../../ui';
import { comptabiliteApi } from '../../../lib/api-client';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { fr } from 'date-fns/locale';

interface CoffreOperationsPanelProps {
  className?: string;
}

/**
 * Panel compact montrant les opérations coffre dans la comptabilité
 * Comptes : 531 (Coffre-fort) et 521 (Caisse) pour les flux coffre
 */
export default function CoffreOperationsPanel({ className = '' }: CoffreOperationsPanelProps) {
  const today = new Date();
  const dateDebut = format(startOfMonth(today), 'yyyy-MM-dd');
  const dateFin = format(endOfMonth(today), 'yyyy-MM-dd');

  // Récupérer les données du compte 531 (Coffre-fort central)
  const { data: coffreData, isLoading, refetch } = useQuery({
    queryKey: ['gl-coffre-531', dateDebut, dateFin],
    queryFn: async () => {
      // Chercher le compte 531 dans le plan comptable
      const comptes = await comptabiliteApi.getPlanOhada();
      const compte531 = comptes.find((c: any) => c.numeroCompte === '531' || c.numeroCompte.startsWith('531'));

      if (!compte531) return null;

      return comptabiliteApi.getGrandLivre(compte531.id, {
        dateDebut,
        dateFin,
        page: 1,
        pageSize: 10
      });
    },
    staleTime: 30000,
  });

  // Calculer les stats
  const stats = useMemo(() => {
    if (!coffreData) return { approvisionnements: 0, versements: 0, solde: 0, nbOps: 0 };

    const entries = coffreData.entries || [];
    let approvisionnements = 0; // Crédits sur 531 = entrées d'argent
    let versements = 0; // Débits sur 531 = sorties vers caisse

    entries.forEach((e: any) => {
      if (e.credit > 0) approvisionnements += e.credit;
      if (e.debit > 0) versements += e.debit;
    });

    return {
      approvisionnements,
      versements,
      solde: coffreData.soldeFinal || 0,
      nbOps: entries.length
    };
  }, [coffreData]);

  const formatMoney = (amount: number) => {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
    return amount.toLocaleString();
  };

  const recentOps = useMemo(() => {
    if (!coffreData?.entries) return [];
    return coffreData.entries.slice(0, 4);
  }, [coffreData]);

  if (isLoading) {
    return (
      <Card className={`p-4 ${className}`}>
        <div className="flex items-center justify-center h-32">
          <RefreshCw className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      </Card>
    );
  }

  return (
    <Card className={`p-4 ${className}`}>
      {/* Header compact */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/10">
            <Vault className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Opérations Coffre</h3>
            <p className="text-[10px] text-slate-500">{format(today, 'MMMM yyyy', { locale: fr })}</p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          className="p-1 hover:bg-slate-700 rounded transition-colors"
          title="Rafraîchir"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>

      {/* Stats row - ultra compact */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-emerald-500/10 rounded-lg p-2 text-center">
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <ArrowDownRight className="w-3 h-3 text-emerald-400" />
            <span className="text-[9px] text-emerald-400 uppercase">Entrées</span>
          </div>
          <span className="text-sm font-bold text-emerald-400">{formatMoney(stats.approvisionnements)}</span>
        </div>

        <div className="bg-rose-500/10 rounded-lg p-2 text-center">
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <ArrowUpRight className="w-3 h-3 text-rose-400" />
            <span className="text-[9px] text-rose-400 uppercase">Sorties</span>
          </div>
          <span className="text-sm font-bold text-rose-400">{formatMoney(stats.versements)}</span>
        </div>

        <div className="bg-cyan-500/10 rounded-lg p-2 text-center">
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <TrendingUp className="w-3 h-3 text-cyan-400" />
            <span className="text-[9px] text-cyan-400 uppercase">Solde</span>
          </div>
          <span className="text-sm font-bold text-cyan-400">{formatMoney(stats.solde)}</span>
        </div>
      </div>

      {/* Recent operations - compact list */}
      {recentOps.length > 0 ? (
        <div className="space-y-1.5">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Dernières écritures</div>
          {recentOps.map((op: any, idx: number) => (
            <div
              key={op.id || idx}
              className="flex items-center justify-between py-1.5 px-2 bg-slate-800/50 rounded text-xs"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Badge
                  value={op.journalCode}
                  variant={op.debit > 0 ? 'warning' : 'success'}
                  size="xs"
                />
                <span className="truncate text-slate-300" title={op.ecritureLibelle || op.ligneLibelle}>
                  {(op.ecritureLibelle || op.ligneLibelle || 'Opération coffre').slice(0, 25)}
                </span>
              </div>
              <span className={`font-mono font-medium whitespace-nowrap ${op.debit > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {op.debit > 0 ? '-' : '+'}{formatMoney(op.debit || op.credit)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-4 text-slate-500 text-xs">
          Aucune opération ce mois
        </div>
      )}

      {/* Footer - compte GL */}
      <div className="mt-3 pt-2 border-t border-slate-700/50 flex items-center justify-between text-[10px] text-slate-500">
        <span>Compte GL: 531 - Coffre-fort central</span>
        <span>{stats.nbOps} écriture{stats.nbOps > 1 ? 's' : ''}</span>
      </div>
    </Card>
  );
}
