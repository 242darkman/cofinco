/**
 * Historique des mouvements du coffre : filtres par période, export CSV
 * et panneau de détail par mouvement.
 */
import React, { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRightLeft,
  Wallet,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Shield,
  AlertTriangle,
  AlertCircle,
  Settings,
  Download,
  MoreHorizontal,
  Play,
  Ban,
  Eye,
  Vault,
  User,
  KeyRound,
  Info,
  X
} from "lucide-react";
import { Card, Button, Badge, StatCard, ResponsiveTable, TabGroup, ConfirmDialog, IconButton } from "@/components/ui";
import { coffreApi, sessionCaisseApi } from "@/lib/api-client";
import { StatutTransfertCoffre, getMouvementCoffreLabel } from "@shared/enum/status-constants";
import { useCurrency } from '@/contexts/CurrencyContext';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { coffreKeys, caisseKeys } from '../../../../lib/query-keys';


import { MouvementDetailPanel } from './MouvementDetailPanel';
import { type TransfertCoffreRow, type MouvementCoffreRow } from './types';

export function CoffreFortHistorique({ agenceId }: { agenceId: string }) {
    const { currency } = useCurrency();
    const [selectedMouvement, setSelectedMouvement] = useState<any>(null);

    // Date range filter — defaults to last 30 days
    const today = format(new Date(), 'yyyy-MM-dd');
    const thirtyDaysAgo = format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
    const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
    const [dateTo, setDateTo] = useState(today);

    const { data, isLoading, refetch, isRefetching } = useQuery({
        queryKey: [...coffreKeys.mouvements(agenceId), dateFrom, dateTo],
        queryFn: () => coffreApi.getMouvements({ agenceId, limit: 500, dateFrom, dateTo }),
    });

    const mouvements = data?.data || [];

    // Export CSV
    const handleExportCSV = () => {
      if (mouvements.length === 0) return;
      const headers = ['Date', 'Type', 'Sens', 'Description', 'Montant', 'Effectué par'];
      const rows = mouvements.map((m: MouvementCoffreRow) => [
        format(new Date(m.dateOperation), 'dd/MM/yyyy HH:mm', { locale: fr }),
        getMouvementCoffreLabel(m.typePaiement || m.metadata?.type || m.sourceModule),
        m.sens === 'CREDIT' ? 'Entrée' : 'Sortie',
        (m.metadata?.description || m.metadata?.motif || m.reference || '').replace(/,/g, ' '),
        `${m.sens === 'CREDIT' ? '+' : '-'}${Number(m.montant).toLocaleString('fr-FR')}`,
        m.initiator ? `${m.initiator.prenom || ''} ${m.initiator.nom || ''}`.trim() : '',
      ]);
      const bom = '\uFEFF';
      const csvContent = [headers.join(';'), ...rows.map((r: string[]) => r.join(';'))].join('\n');
      const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `historique_coffre_${dateFrom}_${dateTo}.csv`;
      link.click();
    };

    const columns = [
        {
            key: 'dateOperation',
            label: 'Date',
            format: (_: unknown, row: TransfertCoffreRow) => (
                <div className="flex flex-col leading-tight">
                    <span className="text-[11px] text-content-primary font-medium">
                        {format(new Date(row.dateOperation ?? row.createdAt), "dd MMM", { locale: fr })}
                    </span>
                    <span className="text-[9px] text-content-muted">
                        {format(new Date(row.dateOperation ?? row.createdAt), "HH:mm", { locale: fr })}
                    </span>
                </div>
            )
        },
        {
            key: 'type',
            label: 'Type',
            format: (_: unknown, row: TransfertCoffreRow) => {
                const isCredit = row.sens === 'CREDIT';
                return (
                    <div className="flex items-center gap-1.5">
                        <Badge
                            variant={isCredit ? 'success' : 'warning'}
                            icon={isCredit ? <ArrowDownRight size={10} /> : <ArrowUpRight size={10} />}
                            className="px-1 py-0 text-[9px] h-4"
                            value={isCredit ? 'Entrée' : 'Sortie'}
                        />
                        <span className="text-[10px] text-content-muted hidden sm:inline truncate max-w-[80px]">
                            {getMouvementCoffreLabel(row.typePaiement || row.metadata?.type || row.sourceModule)}
                        </span>
                    </div>
                );
            }
        },
        {
            key: 'description',
            label: 'Description',
            format: (_: unknown, row: TransfertCoffreRow) => (
                <div className="flex flex-col max-w-[200px]">
                    <span className="text-[11px] text-content-secondary truncate leading-tight">
                        {row.metadata?.description || row.metadata?.motif || row.reference}
                    </span>
                     {row.initiator && (
                        <span className="text-[9px] text-content-muted truncate">
                            {row.initiator.prenom} {row.initiator.nom}
                        </span>
                    )}
                </div>
            )
        },
        {
            key: 'montant',
            label: 'Montant',
            align: 'right' as const,
            format: (val: unknown, row: TransfertCoffreRow) => (
                <span className={`font-bold font-mono text-xs ${row.sens === 'CREDIT' ? 'text-status-success' : 'text-status-warning'}`}>
                    {row.sens === 'CREDIT' ? '+' : '-'} {Number(val).toLocaleString()} {currency.symbol}
                </span>
            )
        }
    ];

    if (isLoading) return (
        <div className="grid grid-cols-1 gap-4">
             <SkeletonCard className="h-64" />
        </div>
    );

    return (
        <>
            <Card className="overflow-hidden bg-surface-base/50 backdrop-blur border-edge">
                <div className="p-2 border-b border-edge space-y-2 bg-surface-base/40">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <Clock className="text-content-muted" size={14} />
                            <h3 className="font-bold text-content-primary text-xs">Historique</h3>
                            {mouvements.length > 0 && (
                              <span className="text-[9px] text-content-muted">{mouvements.length}</span>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleExportCSV}
                                disabled={mouvements.length === 0}
                                className="h-6 px-2 text-[10px] text-content-muted hover:text-content-primary hover:bg-surface"
                                title="Exporter en CSV"
                            >
                                <Download size={10} className="mr-1" />
                                CSV
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => refetch()}
                                disabled={isRefetching}
                                className="h-6 px-2 text-[10px] text-content-muted hover:text-content-primary hover:bg-surface"
                            >
                                <Loader2
                                    size={10}
                                    className={`mr-1 ${isRefetching ? 'animate-spin text-status-info' : 'text-content-muted'}`}
                                />
                                Act.
                            </Button>
                        </div>
                    </div>
                    {/* Date Range Filters */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1">
                            <label className="text-[10px] text-content-muted shrink-0">Du</label>
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                className="px-1.5 py-1 text-[11px] rounded border border-edge bg-surface-base/50 text-content-primary w-[110px]"
                            />
                        </div>
                        <div className="flex items-center gap-1">
                            <label className="text-[10px] text-content-muted shrink-0">Au</label>
                            <input
                                type="date"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                max={today}
                                className="px-1.5 py-1 text-[11px] rounded border border-edge bg-surface-base/50 text-content-primary w-[110px]"
                            />
                        </div>
                    </div>
                </div>

                <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                    <ResponsiveTable
                        data={mouvements}
                        columns={columns}
                        emptyMessage="Aucun mouvement."
                        density="compact"
                        className="text-[10px]"
                        onRowClick={(row) => setSelectedMouvement(row)}
                    />
                </div>
            </Card>

            {/* Panneau de détails */}
            {selectedMouvement && (
                <MouvementDetailPanel
                    mouvement={selectedMouvement}
                    onClose={() => setSelectedMouvement(null)}
                />
            )}
        </>
    );
}

/** Slider de détails d'un mouvement coffre */
