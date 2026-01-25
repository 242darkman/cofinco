/**
 * CaisseHistoriqueGlobal - Historique global d'une caisse avec pagination
 *
 * Ce composant utilise le nouvel endpoint GET /api/caisses/:id/historique
 * pour afficher l'historique complet des opérations d'une caisse,
 * avec filtres et pagination côté serveur.
 */
import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  Calendar,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Activity,
  FileSpreadsheet,
  Search,
  X
} from 'lucide-react';
import { Button, Card, StatCard, Pagination } from '../../ui';
import { useCaisseHistorique } from '../../../hooks/caisse/useCaisseHistorique';
import { TransactionsList } from '../transactions';
import type { TransactionItem } from '../transactions';
import { isIncomingOperation } from '@shared/config/caisse-operations';
import {
  getOperationCaisseLabel,
  TYPES_OPERATIONS_CAISSE,
  MethodePaiement,
  METHODE_PAIEMENT_LABELS,
  type MethodePaiementType
} from '@shared/enum/status-constants';
import { formatMoney } from '../../../lib/format';

interface CaisseHistoriqueGlobalProps {
  caisseId: string;
  caisseName?: string;
  onBack: () => void;
}

export default function CaisseHistoriqueGlobal({
  caisseId,
  caisseName,
  onBack
}: CaisseHistoriqueGlobalProps) {
  // État local pour les filtres de l'UI
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedMode, setSelectedMode] = useState<string>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Hook personnalisé pour l'historique
  const {
    data,
    isLoading,
    error,
    page,
    totalPages,
    setPage,
    setFilters,
    refetch,
    summary,
    summaryLoading
  } = useCaisseHistorique({
    caisseId,
    pageSize: 20,
    enabled: !!caisseId
  });

  // Appliquer les filtres
  const handleApplyFilters = () => {
    setFilters({
      typeOperation: selectedType || undefined,
      methodePaiement: selectedMode || undefined,
      startDate: dateFrom || undefined,
      endDate: dateTo || undefined
    });
  };

  // Réinitialiser les filtres
  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedType('');
    setSelectedMode('');
    setDateFrom('');
    setDateTo('');
    setFilters({});
  };

  // Transformer les opérations pour TransactionsList
  const transactions = useMemo<TransactionItem[]>(() => {
    if (!data?.operations) return [];

    return data.operations
      .filter(op => {
        if (!searchTerm) return true;
        const search = searchTerm.toLowerCase();
        return (
          op.reference?.toLowerCase().includes(search) ||
          op.clientNom?.toLowerCase().includes(search) ||
          op.clientPrenom?.toLowerCase().includes(search) ||
          op.description?.toLowerCase().includes(search)
        );
      })
      .map(op => ({
        id: op.id,
        reference: op.reference,
        amount: parseFloat(op.montant),
        type: op.typeOperation,
        type_operation: op.typeOperation,
        status: 'Succès' as const,
        date: op.createdAt,
        description: op.description,
        client: op.clientNom ? {
          name: `${op.clientNom} ${op.clientPrenom || ''}`.trim(),
          phone: op.clientTelephone || undefined
        } : undefined,
        agent: op.caissierNom || undefined,
        mode_paiement: op.modePaiement,
        created_at: op.createdAt
      }));
  }, [data?.operations, searchTerm]);

  // Stats dérivées du summary
  const stats = useMemo(() => {
    if (!summary) return null;
    return {
      totalOperations: summary.totalOperations,
      totalEntrees: parseFloat(summary.totalEntrees),
      totalSorties: parseFloat(summary.totalSorties),
      soldeNet: parseFloat(summary.soldeNet)
    };
  }, [summary]);

  // Modes de paiement générés dynamiquement depuis l'enum centralisé
  const paymentModes = Object.values(MethodePaiement) as MethodePaiementType[];

  return (
    <div className="flex flex-col h-full space-y-2 font-sans overflow-hidden">
      {/* 1. Header & Stats (Fixed) */}
      <div className="shrink-0 space-y-2 p-2 pb-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={onBack}
                className="rounded-full w-8 h-8 p-0 hover:bg-slate-800 text-slate-400"
              >
                <ArrowLeft size={18} />
              </Button>
              <div>
                <h2 className="text-lg font-bold text-white leading-none">Historique Global</h2>
                {caisseName && (
                  <p className="text-xs text-slate-500 mt-0.5">{caisseName}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-cyan-400 transition-colors" size={14} />
                    <input
                    type="text"
                    placeholder="Ref, client..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-48 pl-9 pr-8 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 transition-all font-medium"
                    />
                     {searchTerm && (
                        <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                            <X size={12} />
                        </button>
                    )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className={`h-8 px-3 text-xs ${showFilters ? 'bg-slate-800 text-white' : 'text-slate-400'}`}
              >
                <Filter size={14} className="mr-1.5" />
                Filtres
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
                className="h-8 w-8 p-0"
              >
                <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              </Button>
            </div>
          </div>

          {/* Compact Stats Grid */}
          {stats && (
            <div className="grid grid-cols-4 gap-2">
               <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-2.5 flex items-center justify-between">
                   <div>
                       <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Opérations</p>
                       <p className="text-lg font-black text-white leading-none">{stats.totalOperations}</p>
                   </div>
                   <Activity size={18} className="text-blue-500 opacity-80" />
               </div>
               <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-2.5 flex items-center justify-between">
                   <div>
                       <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Entrées</p>
                       <p className="text-lg font-black text-emerald-400 leading-none">{formatCompactMoney(stats.totalEntrees)}</p>
                   </div>
                   <TrendingDown size={18} className="text-emerald-500 opacity-80" />
               </div>
               <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-2.5 flex items-center justify-between">
                   <div>
                       <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Sorties</p>
                       <p className="text-lg font-black text-rose-400 leading-none">{formatCompactMoney(stats.totalSorties)}</p>
                   </div>
                   <TrendingUp size={18} className="text-rose-500 opacity-80" />
               </div>
               <div className={`bg-slate-900/50 border rounded-lg p-2.5 flex items-center justify-between ${stats.soldeNet >= 0 ? 'border-emerald-900/30' : 'border-rose-900/30'}`}>
                   <div>
                       <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Solde Net</p>
                       <p className={`text-lg font-black leading-none ${stats.soldeNet >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                           {stats.soldeNet > 0 ? '+' : ''}{formatCompactMoney(stats.soldeNet)}
                       </p>
                   </div>
                   <FileSpreadsheet size={18} className={stats.soldeNet >= 0 ? 'text-emerald-500 opacity-80' : 'text-rose-500 opacity-80'} />
               </div>
            </div>
          )}

           {/* Collapsible Filters */}
           {showFilters && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 grid grid-cols-4 gap-3 animate-in fade-in slide-in-from-top-2">
                <div>
                   <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Type</label>
                   <select
                        value={selectedType}
                        onChange={(e) => setSelectedType(e.target.value)}
                        className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-white focus:border-cyan-500 outline-none"
                    >
                        <option value="">Tous</option>
                        {TYPES_OPERATIONS_CAISSE.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Mode</label>
                    <select
                        value={selectedMode}
                        onChange={(e) => setSelectedMode(e.target.value)}
                        className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-white focus:border-cyan-500 outline-none"
                    >
                        <option value="">Tous</option>
                        {paymentModes.map(mode => <option key={mode} value={mode}>{METHODE_PAIEMENT_LABELS[mode] || mode}</option>)}
                    </select>
                </div>
                <div className="col-span-2 flex items-end gap-2">
                     <div className="flex-1">
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Date</label>
                        <div className="flex gap-2">
                             <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-white" />
                             <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-white" />
                        </div>
                     </div>
                     <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={handleResetFilters} className="h-7 text-xs px-2"><X size={12} /></Button>
                        <Button variant="primary" size="sm" onClick={handleApplyFilters} className="h-7 text-xs">OK</Button>
                     </div>
                </div>
            </div>
          )}
      </div>

      {/* 2. Scrollable List (Flex-1) */}
      <div className="flex-1 min-h-0 relative px-2 overflow-hidden mx-2">
          {error ? (
             <div className="h-full flex items-center justify-center text-rose-500 text-sm p-4">
               <span className="bg-rose-950/30 border border-rose-900/50 p-4 rounded-xl">{error.message}</span>
             </div>
          ) : (
            <TransactionsList
                transactions={transactions}
                isLoading={isLoading}
                emptyMessage="Aucune opération trouvée"
                headerTitle=""
                maxItems={500} // Let the container handle scroll
                compactMode={true} // Hint to make rows smaller if supported
            />
          )}
      </div>

      {/* 3. Helper Functions (Inline) */}
      {/* We need to declare this format helper outside or stick to formatMoney if simple */}

      {/* 4. Sticky Pagination (Fixed Bottom) */}
      <div className="shrink-0 p-2 border-t border-slate-800/50 bg-slate-950/50 backdrop-blur-sm flex items-center justify-between text-xs mx-2 mb-1 rounded-b-xl">
           <span className="text-slate-500">
               {data?.pagination?.total ? data.pagination.total : (data?.operations?.length || 0)} opérations
           </span>

           {totalPages > 1 && (
            <div className="flex items-center gap-1">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 rounded-md"
                    onClick={() => setPage(page - 1)}
                    disabled={page === 0}
                >
                    <ChevronLeft size={14} />
                </Button>
                <div className="px-2 py-1 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                    {page + 1} / {totalPages}
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 rounded-md"
                    onClick={() => setPage(page + 1)}
                    disabled={page >= totalPages - 1}
                >
                    <ChevronRight size={14} />
                </Button>
            </div>
           )}
      </div>
    </div>
  );

  function formatCompactMoney(amount: number) {
      return new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(amount);
  }
}
