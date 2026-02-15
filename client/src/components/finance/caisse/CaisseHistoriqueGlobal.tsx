/**
 * CaisseHistoriqueGlobal - Historique global d'une caisse avec pagination
 *
 * Ce composant utilise le nouvel endpoint GET /api/caisses/:id/historique
 * pour afficher l'historique complet des opérations d'une caisse,
 * avec filtres et pagination côté serveur.
 */
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
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
import { TransactionsList, TransactionDetailDrawer } from '../transactions';
import type { TransactionItem, TransactionDetails } from '../transactions';
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

  // Transaction detail drawer
  const [selectedTx, setSelectedTx] = useState<TransactionDetails | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const handleTransactionClick = useCallback((tx: TransactionItem) => {
    setSelectedTx({
      id: tx.id,
      reference: tx.reference,
      amount: tx.amount,
      type: tx.typeOperation || tx.type,
      typeOperation: tx.typeOperation,
      status: tx.status,
      date: tx.date,
      description: tx.description,
      client: tx.client,
      agent: tx.agent,
      modePaiement: tx.modePaiement,
    });
    setIsDrawerOpen(true);
  }, []);

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
        status: op.statut || 'POSTED',
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
      nbEntrees: summary.totalEntrees,
      nbSorties: summary.totalSorties,
      montantEntrees: Number(summary.montantEntrees) || 0,
      montantSorties: Number(summary.montantSorties) || 0,
      soldeNet: Number(summary.soldeNet) || 0,
    };
  }, [summary]);

  // Modes de paiement générés dynamiquement depuis l'enum centralisé
  const paymentModes = Object.values(MethodePaiement) as MethodePaiementType[];

  // Measure available height for TransactionsList
  const listContainerRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState(400);

  useEffect(() => {
    if (!listContainerRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setListHeight(entry.contentRect.height);
      }
    });
    observer.observe(listContainerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex flex-col h-full space-y-2 font-sans overflow-hidden">
      {/* 1. Header & Stats (Fixed) */}
      <div className="shrink-0 space-y-2 p-2 pb-0">
          <div className="flex items-center justify-between gap-2">
            {caisseName && (
              <span className="text-xs text-content-muted font-medium truncate shrink-0">{caisseName}</span>
            )}
            <div className="flex items-center gap-2 flex-1 justify-end">
              <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted group-focus-within:text-accent transition-colors" size={14} />
                    <input
                    type="text"
                    placeholder="Ref, client..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-48 pl-9 pr-8 py-1.5 bg-surface-base border border-edge rounded-lg text-xs text-content-primary placeholder-content-muted focus:outline-none focus:border-accent/50 transition-all font-medium"
                    />
                     {searchTerm && (
                        <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-primary">
                            <X size={12} />
                        </button>
                    )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className={`h-8 px-3 text-xs ${showFilters ? 'bg-surface text-content-primary' : 'text-content-muted'}`}
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
               <div className="bg-surface-base/50 border border-edge rounded-lg p-2.5 flex items-center justify-between">
                   <div>
                       <p className="text-[10px] text-content-muted uppercase font-bold tracking-wider">Opérations</p>
                       <p className="text-lg font-black text-content-primary leading-none">{stats.totalOperations}</p>
                   </div>
                   <Activity size={18} className="text-status-info opacity-80" />
               </div>
               <div className="bg-surface-base/50 border border-edge rounded-lg p-2.5 flex items-center justify-between">
                   <div>
                       <p className="text-[10px] text-content-muted uppercase font-bold tracking-wider">Entrées</p>
                       <p className="text-lg font-black text-status-success leading-none">{formatMoney(stats.montantEntrees, { compact: true })}</p>
                       {stats.nbEntrees > 0 && <p className="text-[9px] text-content-muted mt-0.5">{stats.nbEntrees} op.</p>}
                   </div>
                   <TrendingDown size={18} className="text-status-success opacity-80" />
               </div>
               <div className="bg-surface-base/50 border border-edge rounded-lg p-2.5 flex items-center justify-between">
                   <div>
                       <p className="text-[10px] text-content-muted uppercase font-bold tracking-wider">Sorties</p>
                       <p className="text-lg font-black text-status-danger leading-none">{formatMoney(stats.montantSorties, { compact: true })}</p>
                       {stats.nbSorties > 0 && <p className="text-[9px] text-content-muted mt-0.5">{stats.nbSorties} op.</p>}
                   </div>
                   <TrendingUp size={18} className="text-status-danger opacity-80" />
               </div>
               <div className={`bg-surface-base/50 border rounded-lg p-2.5 flex items-center justify-between ${stats.soldeNet >= 0 ? 'border-status-success/20' : 'border-status-danger/20'}`}>
                   <div>
                       <p className="text-[10px] text-content-muted uppercase font-bold tracking-wider">Solde Net</p>
                       <p className={`text-lg font-black leading-none ${stats.soldeNet >= 0 ? 'text-status-success' : 'text-status-danger'}`}>
                           {stats.soldeNet > 0 ? '+' : ''}{formatMoney(stats.soldeNet, { compact: true })}
                       </p>
                   </div>
                   <FileSpreadsheet size={18} className={stats.soldeNet >= 0 ? 'text-status-success opacity-80' : 'text-status-danger opacity-80'} />
               </div>
            </div>
          )}

           {/* Collapsible Filters */}
           {showFilters && (
            <div className="bg-surface-base/80 border border-edge rounded-xl p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 animate-in fade-in slide-in-from-top-2">
                <div>
                   <label className="text-[10px] text-content-muted uppercase tracking-wider mb-1 block">Type</label>
                   <select
                        value={selectedType}
                        onChange={(e) => setSelectedType(e.target.value)}
                        className="w-full px-2 py-1.5 bg-surface-base border border-edge rounded text-xs text-content-primary focus:border-accent outline-none"
                    >
                        <option value="">Tous</option>
                        {TYPES_OPERATIONS_CAISSE.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-[10px] text-content-muted uppercase tracking-wider mb-1 block">Mode</label>
                    <select
                        value={selectedMode}
                        onChange={(e) => setSelectedMode(e.target.value)}
                        className="w-full px-2 py-1.5 bg-surface-base border border-edge rounded text-xs text-content-primary focus:border-accent outline-none"
                    >
                        <option value="">Tous</option>
                        {paymentModes.map(mode => <option key={mode} value={mode}>{METHODE_PAIEMENT_LABELS[mode] || mode}</option>)}
                    </select>
                </div>
                <div className="col-span-2 flex items-end gap-2">
                     <div className="flex-1">
                        <label className="text-[10px] text-content-muted uppercase tracking-wider mb-1 block">Date</label>
                        <div className="flex gap-2">
                             <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full px-2 py-1.5 bg-surface-base border border-edge rounded text-xs text-content-primary" />
                             <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full px-2 py-1.5 bg-surface-base border border-edge rounded text-xs text-content-primary" />
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
      <div ref={listContainerRef} className="flex-1 min-h-0 relative px-2 overflow-hidden mx-2">
          {error ? (
             <div className="h-full flex items-center justify-center text-status-danger text-sm p-4">
               <span className="bg-status-danger-bg border border-status-danger/30 p-4 rounded-xl">{error.message}</span>
             </div>
          ) : (
            <TransactionsList
                transactions={transactions}
                onTransactionClick={handleTransactionClick}
                isLoading={isLoading}
                emptyMessage="Aucune opération trouvée"
                headerTitle=""
                maxItems={500}
                compactMode
                listHeight={listHeight}
            />
          )}
      </div>

      {/* 3. Helper Functions (Inline) */}
      {/* We need to declare this format helper outside or stick to formatMoney if simple */}

      {/* 4. Sticky Pagination (Fixed Bottom) */}
      <div className="shrink-0 p-2 border-t border-edge/50 bg-surface-base/50 backdrop-blur-sm flex items-center justify-between text-xs mx-2 mb-1 rounded-b-xl">
           <span className="text-content-muted">
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
                <div className="px-2 py-1 rounded bg-surface text-content-secondary font-mono text-[10px]">
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
      {/* Transaction Detail Drawer */}
      <TransactionDetailDrawer
        transaction={selectedTx}
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          setTimeout(() => setSelectedTx(null), 300);
        }}
      />
    </div>
  );

}
