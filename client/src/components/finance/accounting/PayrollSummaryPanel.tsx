import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Wallet, Clock, CheckCircle, RefreshCw, TrendingDown } from 'lucide-react';
import { Card, Badge } from '../../ui';
import { comptabiliteApi } from '../../../lib/api-client';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { fr } from 'date-fns/locale';

interface PayrollSummaryPanelProps {
  className?: string;
}

/**
 * Panel compact montrant la masse salariale dans la comptabilité
 * Comptes : 661 (Charges personnel) et 421 (Dettes personnel)
 */
export default function PayrollSummaryPanel({ className = '' }: PayrollSummaryPanelProps) {
  const today = new Date();
  const dateDebut = format(startOfMonth(today), 'yyyy-MM-dd');
  const dateFin = format(endOfMonth(today), 'yyyy-MM-dd');

  // Récupérer les données du compte 661 (Rémunérations)
  const { data: chargesData, isLoading: loadingCharges } = useQuery({
    queryKey: ['gl-payroll-661', dateDebut, dateFin],
    queryFn: async () => {
      const comptes = await comptabiliteApi.getPlanOhada();
      const compte661 = comptes.find((c: any) => c.numeroCompte === '661' || c.numeroCompte.startsWith('661'));
      if (!compte661) return null;

      return comptabiliteApi.getGrandLivre(compte661.id, {
        dateDebut,
        dateFin,
        page: 1,
        pageSize: 20
      });
    },
    staleTime: 60000,
  });

  // Récupérer les données du compte 421 (Dettes personnel)
  const { data: dettesData, isLoading: loadingDettes, refetch } = useQuery({
    queryKey: ['gl-payroll-421', dateDebut, dateFin],
    queryFn: async () => {
      const comptes = await comptabiliteApi.getPlanOhada();
      const compte421 = comptes.find((c: any) => c.numeroCompte === '421' || c.numeroCompte.startsWith('421'));
      if (!compte421) return null;

      return comptabiliteApi.getGrandLivre(compte421.id, {
        dateDebut,
        dateFin,
        page: 1,
        pageSize: 20
      });
    },
    staleTime: 60000,
  });

  const isLoading = loadingCharges || loadingDettes;

  // Calculer les stats
  const stats = useMemo(() => {
    // Charges de personnel (661) - Débits = charges
    const totalCharges = chargesData?.totalDebits || 0;

    // Dettes personnel (421)
    // Crédit 421 = engagements (salaires dus)
    // Débit 421 = paiements effectués
    const engagements = dettesData?.totalCredits || 0;
    const paiements = dettesData?.totalDebits || 0;
    const soldeDettes = dettesData?.soldeFinal || 0; // Reste à payer

    // Nb bulletins approximatif (nb écritures sur 661)
    const nbBulletins = chargesData?.entries?.length || 0;

    return {
      masseSalariale: totalCharges,
      engagements,
      paiements,
      resteAPayer: Math.abs(soldeDettes),
      nbBulletins
    };
  }, [chargesData, dettesData]);

  const formatMoney = (amount: number) => {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
    return amount.toLocaleString();
  };

  // Dernières écritures de paie
  const recentPayroll = useMemo(() => {
    const entries = chargesData?.entries || [];
    return entries.slice(0, 4);
  }, [chargesData]);

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
          <div className="p-1.5 rounded-lg bg-indigo-500/10">
            <Users className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Masse Salariale</h3>
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

      {/* Stats grid - 2x2 ultra compact */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-indigo-500/10 rounded-lg p-2">
          <div className="flex items-center gap-1 mb-0.5">
            <TrendingDown className="w-3 h-3 text-indigo-400" />
            <span className="text-[9px] text-indigo-400 uppercase">Charges</span>
          </div>
          <span className="text-sm font-bold text-indigo-400">{formatMoney(stats.masseSalariale)}</span>
          <span className="text-[9px] text-slate-500 ml-1">FCFA</span>
        </div>

        <div className="bg-amber-500/10 rounded-lg p-2">
          <div className="flex items-center gap-1 mb-0.5">
            <Clock className="w-3 h-3 text-amber-400" />
            <span className="text-[9px] text-amber-400 uppercase">À payer</span>
          </div>
          <span className="text-sm font-bold text-amber-400">{formatMoney(stats.resteAPayer)}</span>
          <span className="text-[9px] text-slate-500 ml-1">FCFA</span>
        </div>

        <div className="bg-emerald-500/10 rounded-lg p-2">
          <div className="flex items-center gap-1 mb-0.5">
            <CheckCircle className="w-3 h-3 text-emerald-400" />
            <span className="text-[9px] text-emerald-400 uppercase">Payés</span>
          </div>
          <span className="text-sm font-bold text-emerald-400">{formatMoney(stats.paiements)}</span>
          <span className="text-[9px] text-slate-500 ml-1">FCFA</span>
        </div>

        <div className="bg-slate-700/50 rounded-lg p-2">
          <div className="flex items-center gap-1 mb-0.5">
            <Wallet className="w-3 h-3 text-slate-400" />
            <span className="text-[9px] text-slate-400 uppercase">Bulletins</span>
          </div>
          <span className="text-sm font-bold text-white">{stats.nbBulletins}</span>
          <span className="text-[9px] text-slate-500 ml-1">ce mois</span>
        </div>
      </div>

      {/* Recent payroll entries - compact */}
      {recentPayroll.length > 0 ? (
        <div className="space-y-1.5">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Dernières écritures</div>
          {recentPayroll.map((op: any, idx: number) => (
            <div
              key={op.id || idx}
              className="flex items-center justify-between py-1.5 px-2 bg-slate-800/50 rounded text-xs"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Badge value="RH" variant="info" size="xs" />
                <span className="truncate text-slate-300" title={op.ecritureLibelle || op.ligneLibelle}>
                  {(op.ecritureLibelle || op.ligneLibelle || 'Paie').slice(0, 28)}
                </span>
              </div>
              <span className="font-mono font-medium text-rose-400 whitespace-nowrap">
                {formatMoney(op.debit || 0)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-4 text-slate-500 text-xs">
          Aucune écriture de paie ce mois
        </div>
      )}

      {/* Footer - comptes GL */}
      <div className="mt-3 pt-2 border-t border-slate-700/50 flex items-center justify-between text-[10px] text-slate-500">
        <span>GL: 661 (Charges) / 421 (Dettes)</span>
        <Badge
          value={stats.resteAPayer > 0 ? 'Solde dû' : 'À jour'}
          variant={stats.resteAPayer > 0 ? 'warning' : 'success'}
          size="xs"
        />
      </div>
    </Card>
  );
}
