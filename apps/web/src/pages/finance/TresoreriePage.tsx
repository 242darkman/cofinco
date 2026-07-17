import React, { useState, useEffect, useCallback } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { treasuryKeys } from '../../lib/query-keys';
import { RefreshCw, Wallet, Building2, Smartphone, Banknote, ChevronDown, ChevronUp, CreditCard, Landmark, Signal, CheckCircle2, AlertCircle, Link2, Vault } from 'lucide-react';
import airtelLogo from '@/assets/logos/airtel-logo.png';
import mtnLogo from '@/assets/logos/mtn-logo.png';
import { currencyCode } from '@shared/config/currency';

interface ProviderBalance {
  provider: string;
  code: string;
  balance: string | null;
  currency: string | null;
  accountStatus: string | null;
  shared?: boolean;
  error: string | null;
  checkedAt: string;
}

interface CaisseSummary {
  id: string;
  nom: string;
  type: string;
  solde: string;
  statut: string;
  agenceId?: string;
  agenceNom?: string;
}

interface CoffreFortSummary {
  id: string;
  nom: string;
  solde: string;
  statut: string;
  ownerType: string;
  agenceId?: string;
  agenceNom?: string;
}

interface DigitalCaisseByAgence {
  caisseId: string;
  agenceId: string;
  agenceNom: string;
  provider: 'MTN' | 'AIRTEL';
  type: string;
  solde: string;
  statut: string;
}

interface DigitalCaisseSummary {
  mtn: {
    total: number;
    byAgence: DigitalCaisseByAgence[];
  };
  airtel: {
    total: number;
    byAgence: DigitalCaisseByAgence[];
  };
  grandTotal: number;
}

interface TresorerieStats {
  totalPhysique: number;
  totalCoffres: number;
  totalDigital: number;
  totalGlobal: number;
  digitalCaisses: DigitalCaisseSummary;
  physicalCaisses: CaisseSummary[];
  coffresForts: CoffreFortSummary[];
  recentMovements: Array<{
    id: string;
    type: string;
    montant: string;
    sens: string;
    description?: string;
    createdAt: string;
    provider?: string;
  }>;
}

async function fetchTresorerieStats(): Promise<TresorerieStats> {
  const defaultDigital: DigitalCaisseSummary = {
    mtn: { total: 0, byAgence: [] },
    airtel: { total: 0, byAgence: [] },
    grandTotal: 0,
  };

  const [digitalRes, physicalRes, coffresRes] = await Promise.all([
    fetch('/api/caisses/digital-summary', { credentials: 'include' }),
    fetch('/api/caisses?type=PHYSICAL', { credentials: 'include' }),
    fetch('/api/caisses/coffres-summary', { credentials: 'include' }),
  ]);

  if (!digitalRes.ok) {
    return {
      totalPhysique: 0, totalCoffres: 0, totalDigital: 0, totalGlobal: 0,
      digitalCaisses: defaultDigital, physicalCaisses: [], coffresForts: [], recentMovements: [],
    };
  }

  const digitalData: DigitalCaisseSummary = await digitalRes.json();
  const physicalData = physicalRes.ok ? await physicalRes.json() : [];
  const coffresData: CoffreFortSummary[] = coffresRes.ok ? await coffresRes.json() : [];

  const totalPhysique = physicalData.reduce((sum: number, c: any) => sum + Number(c.solde || 0), 0);
  const totalCoffres = coffresData.reduce((sum: number, c: CoffreFortSummary) => sum + Number(c.solde || 0), 0);
  const totalDigital = digitalData.grandTotal || (digitalData.mtn?.total || 0) + (digitalData.airtel?.total || 0);

  return {
    totalPhysique, totalCoffres, totalDigital,
    totalGlobal: totalPhysique + totalCoffres + totalDigital,
    digitalCaisses: digitalData, physicalCaisses: physicalData, coffresForts: coffresData, recentMovements: [],
  };
}

/**
 * Résout le solde d'un provider depuis la liste des balances pawaPay.
 * Si le wallet est partagé (shared=true), le solde est le même pour les deux opérateurs.
 */
function resolveProviderBalance(
  providerBalances: ProviderBalance[],
  code: 'MTN' | 'AIRTEL'
): { balance: number; currency: string; active: boolean; error: string | null; shared: boolean } | null {
  if (providerBalances.length === 0) return null;

  // Chercher le provider direct
  const direct = providerBalances.find(p => p.code === code);
  if (direct) {
    return {
      balance: parseFloat(direct.balance || '0'),
      currency: direct.currency || currencyCode(),
      active: direct.accountStatus === 'ACTIVE',
      error: direct.error,
      shared: !!direct.shared,
    };
  }

  // Si wallet partagé, prendre n'importe quel provider avec shared=true
  const shared = providerBalances.find(p => p.shared);
  if (shared) {
    return {
      balance: parseFloat(shared.balance || '0'),
      currency: shared.currency || currencyCode(),
      active: shared.accountStatus === 'ACTIVE',
      error: shared.error,
      shared: true,
    };
  }

  return null;
}

export default function TresoreriePage() {
  const [filterAgence] = useState<string>('');
  const [mtnExpanded, setMtnExpanded] = useState(true);
  const [airtelExpanded, setAirtelExpanded] = useState(true);
  const [physicalFilter, setPhysicalFilter] = useState<'ALL' | 'CAISSE' | 'COFFRE'>('ALL');

  const queryClient = useQueryClient();

  const { data: stats, isLoading, refetch, isFetching, dataUpdatedAt } = useQuery<TresorerieStats>({
    queryKey: [...treasuryKeys.stats(), filterAgence],
    queryFn: fetchTresorerieStats,
    refetchInterval: 60000,
  });

  // Real-time: écouter les événements caisse/coffre via WebSocket
  const handleCaisseUpdate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: treasuryKeys.stats() });
  }, [queryClient]);

  useEffect(() => {
    window.addEventListener('caisse-update', handleCaisseUpdate);
    return () => window.removeEventListener('caisse-update', handleCaisseUpdate);
  }, [handleCaisseUpdate]);

  const { data: providerData, isError: providerError } = useQuery<{ providers: ProviderBalance[] }>({
    queryKey: ['provider-balances'],
    queryFn: async () => {
      const res = await fetch('/api/payments/provider-balances');
      if (!res.ok) throw new Error('Erreur chargement soldes');
      return res.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // Quand l'endpoint échoue, ignorer les données stale
  const providerBalances = providerError ? [] : (providerData?.providers || []);
  const mtnBalance = resolveProviderBalance(providerBalances, 'MTN');
  const airtelBalance = resolveProviderBalance(providerBalances, 'AIRTEL');

  // Disponibilité par opérateur
  const mtnUnavailable = providerError || !mtnBalance || !!mtnBalance.error;
  const airtelUnavailable = providerError || !airtelBalance || !!airtelBalance.error;
  const mmUnavailable = mtnUnavailable && airtelUnavailable;

  // Solde total pawaPay (dédupliqué si wallet partagé)
  // Solde indisponible = 0
  const pawapayTotal = (() => {
    if (mtnUnavailable && airtelUnavailable) return 0;
    if (!mtnUnavailable && mtnBalance?.shared) return mtnBalance.balance;
    return (mtnUnavailable ? 0 : mtnBalance!.balance) + (airtelUnavailable ? 0 : airtelBalance!.balance);
  })();

  const totalPhysique = stats?.totalPhysique || 0;
  const totalCoffres = stats?.totalCoffres || 0;
  const totalEspeces = totalPhysique + totalCoffres;
  const totalGlobal = totalEspeces + pawapayTotal;
  const mtnData = stats?.digitalCaisses?.mtn || { total: 0, byAgence: [] };
  const airtelData = stats?.digitalCaisses?.airtel || { total: 0, byAgence: [] };

  // Caisses pures (exclure celles nommées "coffre" car on a les vrais coffres-forts)
  const pureCaisses = (stats?.physicalCaisses || []).filter((c: CaisseSummary) => !/coffre/i.test(c.nom));
  // Vrais coffres-forts (depuis la table coffres_forts)
  const realCoffres = (stats?.coffresForts || []).map((cf: CoffreFortSummary) => ({
    id: cf.id,
    nom: cf.nom,
    type: 'COFFRE',
    solde: cf.solde,
    statut: cf.statut === 'ACTIVE' ? 'OPEN' : 'CLOSED',
    agenceId: cf.agenceId,
    agenceNom: cf.agenceNom || (cf.ownerType === 'SIEGE' ? 'Siège' : '-'),
  } satisfies CaisseSummary));

  const unifiedList: CaisseSummary[] = physicalFilter === 'CAISSE'
    ? pureCaisses
    : physicalFilter === 'COFFRE'
      ? realCoffres
      : [...pureCaisses, ...realCoffres];

  const filteredTotal = unifiedList.reduce((sum: number, c: CaisseSummary) => sum + Number(c.solde || 0), 0);

  return (
    <div className="flex flex-col h-full space-y-3 relative p-3" data-testid="page-tresorerie">
      {/* ─── Header ─── */}
      <div className="shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-content-primary flex items-center gap-2">
            <Wallet className="text-accent" size={22} />
            Trésorerie
          </h1>
          <p className="text-content-muted text-[11px] mt-0.5">
            Encaisse disponible — caisses physiques et comptes Mobile Money
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dataUpdatedAt > 0 && (
            <span className="text-[10px] text-content-muted flex items-center gap-1">
              <Signal size={9} className="text-status-success" />
              {new Date(dataUpdatedAt).toLocaleTimeString('fr-FR')}
            </span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface/80 hover:bg-surface-elevated text-content-secondary hover:text-content-primary text-xs transition-all disabled:opacity-50 border border-edge-subtle"
          >
            <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
            Actualiser
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <Spinner size="md" tone="accent" />
            <span className="text-xs text-content-muted">Chargement de la trésorerie...</span>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 custom-scrollbar">
          {/* ─── KPI Cards ─── */}
          <div className="grid grid-cols-3 gap-2.5">
            {/* Total Encaisse */}
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-accent/15 via-status-info/10 to-accent/15 border border-accent/20 p-4">
              <div className="absolute -right-3 -top-3 opacity-[0.04]">
                <Wallet size={72} />
              </div>
              <p className="text-[10px] text-accent/80 uppercase tracking-widest font-semibold mb-1">Encaisse Totale</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-extrabold text-content-primary tracking-tight">{totalGlobal.toLocaleString('fr-FR')}</span>
                <span className="text-xs text-accent/60 font-medium">FCFA</span>
              </div>
              <div className="mt-2 flex items-center gap-3 text-[10px] text-content-muted">
                <span className="flex items-center gap-1"><Banknote size={10} className="text-status-success" /> {totalEspeces.toLocaleString('fr-FR')}</span>
                <span className="text-content-muted">|</span>
                <span className="flex items-center gap-1">
                  <Smartphone size={10} className="text-accent" />
                  {mmUnavailable ? <span className="italic text-status-warning">Indisponible</span> : pawapayTotal.toLocaleString('fr-FR')}
                </span>
              </div>
            </div>

            {/* Espèces (Caisses + Coffres) */}
            <div className="relative overflow-hidden rounded-xl bg-surface/50 border border-edge/40 p-4">
              <div className="absolute -right-2 -top-2 opacity-[0.04]">
                <Banknote size={60} />
              </div>
              <p className="text-[10px] text-status-success/80 uppercase tracking-widest font-semibold mb-1 flex items-center gap-1">
                <Banknote size={11} /> Espèces
              </p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold text-content-primary">{totalEspeces.toLocaleString('fr-FR')}</span>
                <span className="text-[10px] text-content-muted">FCFA</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10px] text-content-muted">
                  {pureCaisses.length} caisses · {realCoffres.length} coffres
                </span>
                <span className="text-[10px] font-medium text-status-success/60">{totalGlobal > 0 ? Math.round((totalEspeces / totalGlobal) * 100) : 0}%</span>
              </div>
            </div>

            {/* Mobile Money (solde pawaPay réel) */}
            <div className="relative overflow-hidden rounded-xl bg-surface/50 border border-edge/40 p-4">
              <div className="absolute -right-2 -top-2 opacity-[0.04]">
                <Smartphone size={60} />
              </div>
              <p className="text-[10px] text-accent/80 uppercase tracking-widest font-semibold mb-1 flex items-center gap-1">
                <Smartphone size={11} /> Mobile Money
              </p>
              {mmUnavailable ? (
                <div className="flex items-center gap-1.5 mt-1">
                  <AlertCircle size={14} className="text-status-warning" />
                  <span className="text-sm font-semibold text-status-warning italic">Solde indisponible</span>
                </div>
              ) : (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-bold text-content-primary">{pawapayTotal.toLocaleString('fr-FR')}</span>
                  <span className="text-[10px] text-content-muted">FCFA</span>
                </div>
              )}
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10px] text-content-muted">via pawaPay</span>
                <span className="text-[10px] font-medium text-accent/60">{mmUnavailable ? '—' : `${totalGlobal > 0 ? Math.round((pawapayTotal / totalGlobal) * 100) : 0}%`}</span>
              </div>
            </div>
          </div>

          {/* ─── Mobile Money Wallet Cards ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* MTN MoMo Card */}
            <WalletCard
              logo={mtnLogo}
              name="MTN Mobile Money"
              gradient="bg-gradient-to-br from-[#c89200] via-[#e0a800] to-[#c89200]"
              borderColor="border-[#c89200]/20"
              chipBg="bg-white/15"
              chipBorder="border-white/20"
              providerBalance={mtnBalance}
              unavailable={mtnUnavailable}
              agences={mtnData.byAgence}
              expanded={mtnExpanded}
              onToggle={() => setMtnExpanded(!mtnExpanded)}
            />

            {/* Airtel Money Card */}
            <WalletCard
              logo={airtelLogo}
              name="Airtel Money"
              gradient="bg-gradient-to-br from-[#cc0000] via-[#e61a1a] to-[#cc0000]"
              borderColor="border-[#cc0000]/20"
              chipBg="bg-white/15"
              chipBorder="border-white/20"
              providerBalance={airtelBalance}
              unavailable={airtelUnavailable}
              agences={airtelData.byAgence}
              expanded={airtelExpanded}
              onToggle={() => setAirtelExpanded(!airtelExpanded)}
            />
          </div>

          {/* ─── Caisses & Coffres Physiques ─── */}
          <div className="bg-surface-base/50 border border-edge/40 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-edge-subtle flex items-center justify-between bg-surface/30">
              <div className="flex items-center gap-2">
                <Landmark size={15} className="text-status-success" />
                <h2 className="text-sm font-bold text-content-primary">Caisses & Coffres Physiques</h2>
              </div>
              <div className="flex items-center gap-3">
                {/* Segmented filter */}
                <div className="flex items-center bg-surface/80 rounded-lg p-0.5 border border-edge-subtle">
                  {([
                    { key: 'ALL', label: 'Tout', icon: null },
                    { key: 'CAISSE', label: 'Caisses', icon: Banknote },
                    { key: 'COFFRE', label: 'Coffres', icon: Vault },
                  ] as const).map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      onClick={() => setPhysicalFilter(key)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${
                        physicalFilter === key
                          ? 'bg-surface-elevated text-content-primary shadow-sm'
                          : 'text-content-muted hover:text-content-secondary'
                      }`}
                    >
                      {Icon && <Icon size={10} />}
                      {label}
                    </button>
                  ))}
                </div>
                <Badge value={`${filteredTotal.toLocaleString('fr-FR')} FCFA`} variant="success" className="text-[10px]" />
                <Badge value={`${unifiedList.length}`} variant="neutral" className="text-[10px]" />
              </div>
            </div>

            {unifiedList.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-surface-base/80 sticky top-0 z-10 backdrop-blur-sm">
                    <tr>
                      <th className="px-4 py-2.5 text-[10px] font-bold text-content-muted uppercase tracking-wider">Nom</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold text-content-muted uppercase tracking-wider">Agence</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold text-content-muted uppercase tracking-wider text-center">Statut</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold text-content-muted uppercase tracking-wider text-right">Solde</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge/40">
                    {unifiedList.map((caisse: CaisseSummary) => (
                      <tr key={caisse.id} className="hover:bg-surface/30 transition-colors group">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            {caisse.type === 'COFFRE' ? (
                              <Vault size={12} className="text-status-warning/60 shrink-0" />
                            ) : (
                              <Banknote size={12} className="text-status-success/60 shrink-0" />
                            )}
                            <span className="text-xs font-medium text-content-secondary group-hover:text-content-primary transition-colors">{caisse.nom}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs text-content-muted">{caisse.agenceNom || '-'}</span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${
                            caisse.statut === 'OPEN'
                              ? 'bg-status-success-bg text-status-success border-status-success/20'
                              : 'bg-surface-elevated/50 text-content-muted border-edge-strong/30'
                          }`}>
                            {caisse.statut === 'OPEN' ? 'Ouverte' : 'Fermée'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className="font-mono text-xs font-bold text-content-primary">{Number(caisse.solde).toLocaleString('fr-FR')}</span>
                          <span className="text-[9px] text-content-muted ml-1">FCFA</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-content-muted">
                <Banknote size={28} className="mb-2 opacity-20" />
                <p className="text-xs">
                  {physicalFilter === 'COFFRE' ? 'Aucun coffre-fort' : physicalFilter === 'CAISSE' ? 'Aucune caisse' : 'Aucune caisse physique'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Wallet Card Component ───

interface WalletCardProps {
  logo: string;
  name: string;
  gradient: string;
  borderColor: string;
  chipBg: string;
  chipBorder: string;
  providerBalance: ReturnType<typeof resolveProviderBalance>;
  unavailable?: boolean;
  agences: DigitalCaisseByAgence[];
  expanded: boolean;
  onToggle: () => void;
}

function WalletCard({
  logo, name, gradient, borderColor,
  chipBg, chipBorder,
  providerBalance, unavailable, agences, expanded, onToggle,
}: WalletCardProps) {
  const hasAgences = agences.length > 0;

  return (
    <div className={`rounded-xl overflow-hidden border ${borderColor} bg-surface-base/40`}>
      {/* Credit card gradient header */}
      <div className={`${gradient} p-4 relative overflow-hidden`}>
        <div className="absolute -right-6 -bottom-4 opacity-10">
          <CreditCard size={80} strokeWidth={1} />
        </div>
        <div className="absolute right-3 top-3 opacity-20">
          <div className={`w-8 h-5 rounded-sm ${chipBg} border ${chipBorder}`} />
        </div>

        <div className="flex items-center gap-2.5 mb-3">
          <img src={logo} alt={name} className="h-7 w-7 rounded" />
          <div>
            <span className="font-bold text-sm text-white">{name}</span>
            <p className="text-[9px] text-white/50">Solde disponible</p>
          </div>
        </div>

        {/* Balance */}
        {unavailable ? (
          <div className="flex items-center gap-1.5 mt-1">
            <AlertCircle size={14} className="text-white/70" />
            <span className="text-lg font-semibold text-white/70 italic">Solde indisponible</span>
          </div>
        ) : (
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-white tracking-tight font-mono">
              {providerBalance
                ? providerBalance.balance.toLocaleString('fr-FR')
                : '---'
              }
            </span>
            <span className="text-xs text-white/60 font-medium">FCFA</span>
            {providerBalance?.active && <CheckCircle2 size={12} className="text-white/80 ml-1" />}
          </div>
        )}

        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-white/40 flex items-center gap-1">
            {providerBalance?.shared && <><Link2 size={8} /> Wallet commun</>}
          </span>
          <span className="text-[9px] text-white/50 bg-white/10 px-1.5 py-0.5 rounded">pawaPay</span>
        </div>
      </div>

      {/* Per-agence breakdown — only if there are agences */}
      {hasAgences && (
        <div>
          <button
            onClick={onToggle}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] text-content-muted hover:text-content-secondary transition-colors bg-surface/30"
          >
            <span className="uppercase tracking-wider font-semibold">Répartition par agence</span>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {expanded && (
            <div className="p-2 space-y-1">
              {agences.map((caisse) => (
                <div key={caisse.caisseId} className="flex items-center justify-between p-2 rounded-lg bg-surface/40 border border-edge/20 hover:bg-surface/70 transition-colors">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Building2 size={11} className="text-content-muted shrink-0" />
                    <span className="text-xs text-content-secondary truncate">{caisse.agenceNom}</span>
                  </div>
                  <span className="text-xs font-mono font-semibold text-content-primary ml-2">{Number(caisse.solde).toLocaleString('fr-FR')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Badge ───

function Badge({ value, variant = 'neutral', className = '' }: { value: string | React.ReactNode, variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral', className?: string }) {
  const variants = {
    success: 'bg-status-success-bg text-status-success border-status-success/20',
    warning: 'bg-status-warning-bg text-status-warning border-status-warning/20',
    error: 'bg-status-danger-bg text-status-danger border-status-danger/20',
    info: 'bg-accent/10 text-accent border-accent/20',
    neutral: 'bg-surface-subtle/30 text-content-muted border-edge-strong/20',
  };
  return (
    <span className={`inline-flex items-center justify-center rounded border px-2 py-0.5 text-xs font-medium ${variants[variant]} ${className}`}>
      {value}
    </span>
  );
}
