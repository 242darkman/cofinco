import React from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { 
    Activity, 
    CreditCard, 
    PiggyBank, 
    Users, 
    ArrowUpRight, 
    ArrowDownLeft, 
    RefreshCw, 
    Banknote,
    Loader2
} from 'lucide-react';
import { Card } from '../ui';

interface HistoryItem {
    id: string;
    date: string;
    type: string;
    sens: 'Débit' | 'Crédit';
    montant: number;
    source_module: string;
    reference: string;
    reference_externe?: string;
    statut: string;
    icon: string;
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
        'credit-card': <CreditCard size={16} className="text-blue-400" />,
        'piggy-bank': <PiggyBank size={16} className="text-emerald-400" />,
        'users': <Users size={16} className="text-amber-400" />,
        'arrow-up-right': <ArrowUpRight size={16} className="text-red-400" />,
        'arrow-down-left': <ArrowDownLeft size={16} className="text-green-400" />,
        'refresh-cw': <RefreshCw size={16} className="text-cyan-400" />,
        'banknote': <Banknote size={16} className="text-purple-400" />,
        'activity': <Activity size={16} className="text-slate-400" />
    };
    return icons[iconName] || icons['activity'];
}

function normalizeHistoryResponse(payload: any): HistoryResponse {
    if (payload?.meta?.pagination) {
        const { page, per_page, total_items, total_pages } = payload.meta.pagination;
        return {
            data: Array.isArray(payload.data) ? payload.data : [],
            pagination: {
                page: Number(page) || 1,
                limit: Number(per_page) || 0,
                total: Number(total_items) || 0,
                totalPages: Number(total_pages) || 1
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
                <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
            </div>
        );
    }

    if (isError) {
        return (
            <Card variant="default" padding="md" className="text-center text-red-400">
                Erreur lors du chargement de l'historique
            </Card>
        );
    }

    if (allItems.length === 0) {
        return (
            <Card variant="default" padding="lg" className="text-center">
                <Activity className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                <p className="text-slate-400 text-sm">Aucune transaction enregistrée</p>
            </Card>
        );
    }

    return (
        <div className="space-y-2">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                    Historique Global
                </h3>
                <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
                    {total} transactions
                </span>
            </div>

            {/* Transactions List */}
            <div className="space-y-1">
                {allItems.map((item, index) => (
                    <div 
                        key={item.id || index}
                        className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50 hover:bg-slate-800 transition-colors"
                    >
                        {/* Icon */}
                        <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                            item.sens === 'Crédit' ? 'bg-green-500/10' : 'bg-red-500/10'
                        }`}>
                            {getIcon(item.icon)}
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">
                                {item.type}
                            </p>
                            <p className="text-xs text-slate-500">
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
                                item.sens === 'Crédit' ? 'text-green-400' : 'text-red-400'
                            }`}>
                                {item.sens === 'Crédit' ? '+' : '-'}{item.montant.toLocaleString()} F
                            </p>
                            <p className="text-[10px] text-slate-500 uppercase">
                                {item.source_module}
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
                    className="w-full py-3 mt-4 text-sm font-medium text-cyan-400 hover:text-cyan-300 bg-slate-800/50 hover:bg-slate-800 rounded-lg border border-slate-700 transition-colors disabled:opacity-50"
                >
                    {isFetchingNextPage ? (
                        <span className="flex items-center justify-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
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
