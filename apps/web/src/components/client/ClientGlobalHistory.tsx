import React from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Activity, CreditCard, PiggyBank, Users, ArrowUpRight, ArrowDownLeft, RefreshCw, Banknote } from 'lucide-react';
import { Card } from '../ui';
import { ALL_STATUS_LABELS } from '../../lib/status-labels';
import { typeCreditLabel } from '../../lib/credit-labels';

const TYPE_COMPTE_LABELS: Record<string, string> = {
    SAVINGS: 'Épargne',
    CURRENT: 'Courant',
    BLOCKED: 'Bloqué',
};

interface HistoryItem {
    id: string;
    date: string;
    type: string;
    description?: string;
    sens: 'DEBIT' | 'CREDIT';
    montant: number;
    sourceModule: string;
    reference: string;
    referenceExterne?: string;
    statut: string;
    icon: string;
    numeroCompte?: string | null;
    typeCompte?: string | null;
    numeroCredit?: string | null;
    typeCredit?: string | null;
    nomTontine?: string | null;
}

/** Build a contextual subtitle from account/credit/tontine info */
function getContextDetail(item: HistoryItem): string | null {
    const parts: string[] = [];
    if (item.numeroCompte) {
        const typeLabel = item.typeCompte ? TYPE_COMPTE_LABELS[item.typeCompte] || item.typeCompte : '';
        parts.push(`Compte ${typeLabel} ${item.numeroCompte}`.trim());
    }
    if (item.numeroCredit) {
        const typeLabel = typeCreditLabel(item.typeCredit);
        parts.push(`Crédit ${typeLabel} ${item.numeroCredit}`.trim());
    }
    if (item.nomTontine) {
        parts.push(`Tontine ${item.nomTontine}`);
    }
    return parts.length > 0 ? parts.join(' · ') : null;
}

interface HistoryResponse {
    data: HistoryItem[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

interface ClientGlobalHistoryProps {
    clientId: string;
}

// Icon resolver
function getIcon(iconName: string) {
    const icons: Record<string, React.ReactElement> = {
        'credit-card': <CreditCard size={16} className="text-status-info" />,
        'piggy-bank': <PiggyBank size={16} className="text-status-success" />,
        'users': <Users size={16} className="text-status-warning" />,
        'arrow-up-right': <ArrowUpRight size={16} className="text-status-danger" />,
        'arrow-down-left': <ArrowDownLeft size={16} className="text-status-success" />,
        'refresh-cw': <RefreshCw size={16} className="text-accent" />,
        'banknote': <Banknote size={16} className="text-status-info" />,
        'activity': <Activity size={16} className="text-content-muted" />
    };
    return icons[iconName] || icons['activity'];
}

function normalizeHistoryResponse(payload: any): HistoryResponse {
    if (payload?.meta?.pagination) {
        const { page, perPage, totalItems, totalPages } = payload.meta.pagination;
        return {
            data: Array.isArray(payload.data) ? payload.data : [],
            pagination: {
                page: Number(page) || 1,
                limit: Number(perPage) || 0,
                total: Number(totalItems) || 0,
                totalPages: Number(totalPages) || 1
            }
        };
    }

    if (payload?.pagination) {
        return payload as HistoryResponse;
    }

    if (Array.isArray(payload)) {
        return {
            data: payload,
            pagination: {
                page: 1,
                limit: payload.length,
                total: payload.length,
                totalPages: 1
            }
        };
    }

    return {
        data: [],
        pagination: {
            page: 1,
            limit: 0,
            total: 0,
            totalPages: 1
        }
    };
}

export default function ClientGlobalHistory({ clientId }: ClientGlobalHistoryProps) {
    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading,
        isError
    } = useInfiniteQuery<HistoryResponse>({
        queryKey: ['client-global-history', clientId],
        queryFn: async ({ pageParam = 1 }) => {
            const res = await fetch(`/api/clients/${clientId}/global-history?page=${pageParam}&per_page=20&limit=20`, {
                credentials: 'include'
            });
            if (!res.ok) throw new Error('Failed to fetch history');
            const payload = await res.json();
            return normalizeHistoryResponse(payload);
        },
        initialPageParam: 1,
        getNextPageParam: (lastPage) => {
            if (lastPage.pagination.page < lastPage.pagination.totalPages) {
                return lastPage.pagination.page + 1;
            }
            return undefined;
        },
        staleTime: 30000
    });

    const allItems = data?.pages.flatMap(page => page.data) || [];
    const total = data?.pages[0]?.pagination.total || 0;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Spinner size="sm" tone="accent" />
            </div>
        );
    }

    if (isError) {
        return (
            <Card variant="default" padding="md" className="text-center text-status-danger">
                Erreur lors du chargement de l'historique
            </Card>
        );
    }

    if (allItems.length === 0) {
        return (
            <Card variant="default" padding="lg" className="text-center">
                <Activity className="w-8 h-8 text-content-muted mx-auto mb-2" />
                <p className="text-content-muted text-sm">Aucune transaction enregistrée</p>
            </Card>
        );
    }

    return (
        <div className="space-y-2">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-content-secondary uppercase tracking-wider">
                    Historique Global
                </h3>
                <span className="text-xs text-content-muted bg-surface px-2 py-0.5 rounded-full">
                    {total} transactions
                </span>
            </div>

            {/* Transactions List */}
            <div className="space-y-1">
                {allItems.map((item, index) => (
                    <div 
                        key={item.id || index}
                        className="flex items-center gap-3 p-3 bg-surface/50 rounded-lg border border-edge-subtle hover:bg-surface transition-colors"
                    >
                        {/* Icon */}
                        <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                            item.sens === 'CREDIT' ? 'bg-status-success-bg' : 'bg-status-danger-bg'
                        }`}>
                            {getIcon(item.icon)}
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-content-primary truncate">
                                {item.description || ALL_STATUS_LABELS[item.type] || item.type.replace(/_/g, ' ')}
                            </p>
                            {(() => {
                                const context = getContextDetail(item);
                                return context ? (
                                    <p className="text-xs text-content-muted truncate">
                                        {context}
                                    </p>
                                ) : null;
                            })()}
                            <p className="text-[11px] text-content-muted">
                                {new Date(item.date).toLocaleDateString('fr-FR', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })}
                            </p>
                        </div>

                        {/* Amount */}
                        <div className="text-right shrink-0">
                            <p className={`text-sm font-bold ${
                                item.sens === 'CREDIT' ? 'text-status-success' : 'text-status-danger'
                            }`}>
                                {item.sens === 'CREDIT' ? '+' : '-'}{item.montant.toLocaleString()} F
                            </p>
                            <p className="text-[10px] text-content-muted uppercase">
                                {item.sourceModule}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Load More */}
            {hasNextPage && (
                <button
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="w-full py-3 mt-4 text-sm font-medium text-accent hover:text-accent bg-surface/50 hover:bg-surface rounded-lg border border-edge transition-colors disabled:opacity-50"
                >
                    {isFetchingNextPage ? (
                        <span className="flex items-center justify-center gap-2">
                            <Spinner size="xs" tone="current" />
                            Chargement...
                        </span>
                    ) : (
                        'Charger plus'
                    )}
                </button>
            )}
        </div>
    );
}
