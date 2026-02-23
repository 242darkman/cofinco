import { useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../ui/sheet';
import { Input, Button, Badge } from '../ui';
import { Search, ShieldAlert, ChevronRight, Loader2 } from 'lucide-react';
import { resolveClientPhotoUrl } from '@/lib/format';
import { useLanguage } from '../../contexts/LanguageContext';

interface AlertClientEntry {
  id: string;
  nom: string;
  prenom: string;
  codeClient: string;
  photoProfile: string | null;
  flags: string[];
  flagCount: number;
  score: number;
  severity: 'critical' | 'warning' | 'info';
}

interface PaginatedResponse {
  clients: AlertClientEntry[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

interface AlertsDrawerProps {
  open: boolean;
  onClose: () => void;
}

const FLAG_CONFIG: Record<string, { label: string; variant: 'danger' | 'warning' | 'info' }> = {
  blacklisted: { label: 'Liste noire', variant: 'danger' },
  high_risk: { label: 'Risque élevé', variant: 'danger' },
  kyc_expired: { label: 'KYC expiré', variant: 'danger' },
  id_expired: { label: "Pièce d'identité expirée", variant: 'danger' },
  pep: { label: 'Personne politiquement exposée', variant: 'warning' },
  id_missing: { label: "Pièce d'identité manquante", variant: 'warning' },
  low_score: { label: 'Score faible', variant: 'info' },
};

const FLAG_COLORS: Record<string, string> = {
  danger: 'bg-status-danger-bg text-status-danger',
  warning: 'bg-status-warning-bg text-status-warning',
  info: 'bg-status-info-bg text-status-info',
};

const FILTER_TABS = [
  { key: 'all', label: 'Tous' },
  { key: 'critical', label: 'Critiques' },
  { key: 'warning', label: 'Attention' },
  { key: 'info', label: 'Info' },
] as const;

export function AlertsDrawer({ open, onClose }: AlertsDrawerProps) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  // Reset on open
  useEffect(() => {
    if (open) {
      setSearch('');
      setDebouncedSearch('');
      setActiveFilter('all');
      setPage(1);
    }
  }, [open]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ['alerts-clients', activeFilter, debouncedSearch, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('perPage', '20');
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (activeFilter !== 'all') params.set('severity', activeFilter);
      const res = await fetch(`/api/alerts/clients?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    enabled: open,
    staleTime: 30_000,
  });

  const navigateToClient = useCallback((clientId: string) => {
    window.dispatchEvent(new CustomEvent('navigate-module', {
      detail: { module: 'clients', subModule: `${clientId}/alertes` }
    }));
    onClose();
  }, [onClose]);

  // Listen for real-time updates
  useEffect(() => {
    if (!open) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.alertsChanged) {
        queryClient.invalidateQueries({ queryKey: ['alerts-clients'] });
      }
    };
    window.addEventListener('client-update', handler);
    return () => window.removeEventListener('client-update', handler);
  }, [open, queryClient]);

  const clients = data?.clients || [];
  const totalPages = data?.totalPages || 1;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col bg-surface border-edge">
        {/* Header */}
        <div className="p-5 pb-3 border-b border-edge">
          <SheetHeader className="mb-0">
            <SheetTitle className="text-content-primary flex items-center gap-2 text-base">
              <ShieldAlert size={18} className="text-status-danger" />
              {t('alertesClients') || 'Alertes Clients'}
              {data?.total != null && data.total > 0 && (
                <Badge value={data.total} size="sm" variant="danger" />
              )}
            </SheetTitle>
            <SheetDescription className="text-content-muted text-xs">
              Clients nécessitant une attention particulière
            </SheetDescription>
          </SheetHeader>

          {/* Search */}
          <div className="mt-3 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" size={14} />
            <Input
              placeholder="Rechercher nom ou code client..."
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              className="pl-9 h-8 text-xs bg-surface border-edge text-content-primary placeholder:text-content-muted"
            />
          </div>

          {/* Filter tabs */}
          <div className="mt-3 flex gap-1.5">
            {FILTER_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => { setActiveFilter(tab.key); setPage(1); }}
                className={`text-[10px] px-2.5 py-1 rounded-full font-medium transition-colors ${
                  activeFilter === tab.key
                    ? 'bg-accent text-white'
                    : 'bg-surface-elevated text-content-muted hover:text-content-primary'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={20} className="animate-spin text-content-muted" />
            </div>
          ) : clients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-content-muted gap-3">
              <ShieldAlert size={36} className="text-status-success opacity-50" />
              <p className="text-xs">{t('aucuneUrgence') || 'Aucun client en alerte'}</p>
            </div>
          ) : (
            clients.map(client => {
              const photoUrl = resolveClientPhotoUrl(client.photoProfile);
              return (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => navigateToClient(client.id)}
                  className="w-full flex items-center justify-between p-2.5 rounded-lg bg-surface-elevated/50 border border-edge hover:border-accent/30 transition-colors text-left group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Avatar */}
                    <div className="w-8 h-8 rounded-full bg-surface-elevated flex items-center justify-center overflow-hidden border border-edge shrink-0">
                      {photoUrl ? (
                        <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[10px] font-bold text-content-muted">
                          {(client.prenom?.[0] || '') + (client.nom?.[0] || '')}
                        </span>
                      )}
                    </div>
                    {/* Info */}
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-content-primary truncate">
                        {client.prenom} {client.nom}
                      </p>
                      <p className="text-[10px] text-content-muted font-mono">{client.codeClient}</p>
                      {/* Flag badges */}
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {client.flags.slice(0, 3).map(flag => {
                          const cfg = FLAG_CONFIG[flag];
                          if (!cfg) return null;
                          return (
                            <span key={flag} className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${FLAG_COLORS[cfg.variant]}`}>
                              {cfg.label}
                            </span>
                          );
                        })}
                        {client.flags.length > 3 && (
                          <span className="text-[9px] text-content-muted">+{client.flags.length - 3}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-content-muted group-hover:text-content-primary transition-colors shrink-0" />
                </button>
              );
            })
          )}
        </div>

        {/* Pagination footer */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-edge flex items-center justify-between">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="h-7 text-[10px]"
            >
              {t('precedent') || 'Precedent'}
            </Button>
            <span className="text-[10px] text-content-muted">
              {page} / {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="h-7 text-[10px]"
            >
              {t('suivant') || 'Suivant'}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
