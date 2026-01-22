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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="rounded-full w-10 h-10 p-0"
          >
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h2 className="text-xl font-bold text-white">Historique Global</h2>
            {caisseName && (
              <p className="text-sm text-slate-400">{caisseName}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={showFilters ? 'bg-slate-700' : ''}
          >
            <Filter size={16} className="mr-1" />
            Filtres
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            title="Total Opérations"
            value={stats.totalOperations}
            icon={Activity}
            color="primary"
          />
          <StatCard
            title="Total Entrées"
            value={stats.totalEntrees}
            icon={TrendingDown}
            color="success"
          />
          <StatCard
            title="Total Sorties"
            value={stats.totalSorties}
            icon={TrendingUp}
            color="warning"
          />
          <StatCard
            title="Solde Net"
            value={stats.soldeNet}
            icon={FileSpreadsheet}
            color={stats.soldeNet >= 0 ? 'success' : 'danger'}
          />
        </div>
      )}

      {/* Filtres */}
      {showFilters && (
        <Card className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Type d'opération */}
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">
                Type d'opération
              </label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
              >
                <option value="">Tous les types</option>
                {TYPES_OPERATIONS_CAISSE.map(op => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Mode de paiement */}
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">
                Mode de paiement
              </label>
              <select
                value={selectedMode}
                onChange={(e) => setSelectedMode(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
              >
                <option value="">Tous les modes</option>
                {paymentModes.map(mode => (
                  <option key={mode} value={mode}>
                    {METHODE_PAIEMENT_LABELS[mode] || mode}
                  </option>
                ))}
              </select>
            </div>

            {/* Date début */}
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">
                Date début
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
              />
            </div>

            {/* Date fin */}
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">
                Date fin
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={handleResetFilters}>
              <X size={14} className="mr-1" />
              Réinitialiser
            </Button>
            <Button variant="primary" size="sm" onClick={handleApplyFilters}>
              Appliquer
            </Button>
          </div>
        </Card>
      )}

      {/* Barre de recherche rapide */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
        <input
          type="text"
          placeholder="Rechercher par référence, client, description..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Liste des transactions */}
      <TransactionsList
        transactions={transactions}
        isLoading={isLoading}
        emptyMessage="Aucune opération dans l'historique"
        headerTitle={`${data?.pagination?.total || 0} opérations`}
        maxItems={100}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage(page - 1)}
            disabled={page === 0}
          >
            <ChevronLeft size={16} />
          </Button>

          <span className="text-sm text-slate-400">
            Page {page + 1} sur {totalPages}
          </span>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage(page + 1)}
            disabled={page >= totalPages - 1}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      )}

      {/* Message d'erreur */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
          Erreur lors du chargement de l'historique: {error.message}
        </div>
      )}
    </div>
  );
}
