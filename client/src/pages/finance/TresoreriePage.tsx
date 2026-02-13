import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  RefreshCw, Wallet, Building2, Smartphone, Banknote,
  Loader2, ChevronDown, ChevronUp, CreditCard, Landmark, Signal,
  CheckCircle2, AlertCircle, Link2, Vault
} from 'lucide-react';
import airtelLogo from '@/assets/logos/airtel-logo.png';
import mtnLogo from '@/assets/logos/mtn-logo.png';

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
      currency: direct.currency || 'XAF',
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
      currency: shared.currency || 'XAF',
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

  const { data: stats, isLoading, refetch, isFetching, dataUpdatedAt } = useQuery<TresorerieStats>({
    queryKey: ['tresorerie-stats', filterAgence],
    queryFn: fetchTresorerieStats,
    refetchInterval: 60000,
  });

  const { data: providerData } = useQuery<{ providers: ProviderBalance[] }>({
    queryKey: ['provider-balances'],
    queryFn: async () => {
      const res = await fetch('/api/payments/provider-balances');
      if (!res.ok) throw new Error('Erreur chargement soldes');
      return res.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const providerBalances = providerData?.providers || [];
  const mtnBalance = resolveProviderBalance(providerBalances, 'MTN');
  const airtelBalance = resolveProviderBalance(providerBalances, 'AIRTEL');

  // Solde total pawaPay (dédupliqué si wallet partagé)
  const pawapayTotal = (() => {
    if (!mtnBalance && !airtelBalance) return 0;
    if (mtnBalance?.shared) return mtnBalance.balance; // partagé = un seul solde réel
    return (mtnBalance?.balance || 0) + (airtelBalance?.balance || 0);
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
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Wallet className="text-cyan-400" size={22} />
            Trésorerie
          </h1>
          <p className="text-slate-500 text-[11px] mt-0.5">
            Encaisse disponible — caisses physiques et comptes Mobile Money
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dataUpdatedAt > 0 && (
            <span className="text-[10px] text-slate-600 flex items-center gap-1">
              <Signal size={9} className="text-emerald-500" />
              {new Date(dataUpdatedAt).toLocaleTimeString('fr-FR')}
            </span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs transition-all disabled:opacity-50 border border-slate-700/50"
          >
            <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
            Actualiser
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={28} className="text-cyan-500 animate-spin" />
            <span className="text-xs text-slate-500">Chargement de la trésorerie...</span>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 custom-scrollbar">
          {/* ─── KPI Cards ─── */}
          <div className="grid grid-cols-3 gap-2.5">
            {/* Total Encaisse */}
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-cyan-500/15 via-blue-500/10 to-indigo-500/15 border border-cyan-500/20 p-4">
              <div className="absolute -right-3 -top-3 opacity-[0.04]">
                <Wallet size={72} />
              </div>
              <p className="text-[10px] text-cyan-300/80 uppercase tracking-widest font-semibold mb-1">Encaisse Totale</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-extrabold text-white tracking-tight">{totalGlobal.toLocaleString('fr-FR')}</span>
                <span className="text-xs text-cyan-400/60 font-medium">FCFA</span>
              </div>
              <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-400">
                <span className="flex items-center gap-1"><Banknote size={10} className="text-emerald-400" /> {totalEspeces.toLocaleString('fr-FR')}</span>
                <span className="text-slate-600">|</span>
                <span className="flex items-center gap-1"><Smartphone size={10} className="text-violet-400" /> {pawapayTotal.toLocaleString('fr-FR')}</span>
              </div>
            </div>

            {/* Espèces (Caisses + Coffres) */}
            <div className="relative overflow-hidden rounded-xl bg-slate-800/50 border border-slate-700/40 p-4">
              <div className="absolute -right-2 -top-2 opacity-[0.04]">
                <Banknote size={60} />
              </div>
              <p className="text-[10px] text-emerald-400/80 uppercase tracking-widest font-semibold mb-1 flex items-center gap-1">
                <Banknote size={11} /> Espèces
              </p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold text-white">{totalEspeces.toLocaleString('fr-FR')}</span>
                <span className="text-[10px] text-slate-500">FCFA</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10px] text-slate-500">
                  {pureCaisses.length} caisses · {realCoffres.length} coffres
                </span>
                <span className="text-[10px] font-medium text-emerald-400/60">{totalGlobal > 0 ? Math.round((totalEspeces / totalGlobal) * 100) : 0}%</span>
              </div>
            </div>

            {/* Mobile Money (solde pawaPay réel) */}
            <div className="relative overflow-hidden rounded-xl bg-slate-800/50 border border-slate-700/40 p-4">
              <div className="absolute -right-2 -top-2 opacity-[0.04]">
                <Smartphone size={60} />
              </div>
              <p className="text-[10px] text-violet-400/80 uppercase tracking-widest font-semibold mb-1 flex items-center gap-1">
                <Smartphone size={11} /> Mobile Money
              </p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold text-white">{pawapayTotal.toLocaleString('fr-FR')}</span>
                <span className="text-[10px] text-slate-500">FCFA</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10px] text-slate-500">via pawaPay</span>
                <span className="text-[10px] font-medium text-violet-400/60">{totalGlobal > 0 ? Math.round((pawapayTotal / totalGlobal) * 100) : 0}%</span>
              </div>
            </div>
          </div>

          {/* ─── Mobile Money Wallet Cards ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* MTN MoMo Card */}
            <WalletCard
              logo={mtnLogo}
              name="MTN Mobile Money"
              gradient="bg-gradient-to-br from-yellow-500 via-yellow-600 to-amber-700"
              borderColor="border-yellow-500/15"
              textAccent="text-yellow-100"
              balanceAccent="text-yellow-400"
              chipBg="bg-yellow-200/30"
              chipBorder="border-yellow-200/20"
              badgeBg="bg-yellow-100/10"
              badgeText="text-yellow-100/40"
              providerBalance={mtnBalance}
              agences={mtnData.byAgence}
              expanded={mtnExpanded}
              onToggle={() => setMtnExpanded(!mtnExpanded)}
            />

            {/* Airtel Money Card */}
            <WalletCard
              logo={airtelLogo}
              name="Airtel Money"
              gradient="bg-gradient-to-br from-red-600 via-red-700 to-rose-800"
              borderColor="border-red-500/15"
              textAccent="text-red-100"
              balanceAccent="text-red-400"
              chipBg="bg-red-200/30"
              chipBorder="border-red-200/20"
              badgeBg="bg-red-100/10"
              badgeText="text-red-100/40"
              providerBalance={airtelBalance}
              agences={airtelData.byAgence}
              expanded={airtelExpanded}
              onToggle={() => setAirtelExpanded(!airtelExpanded)}
            />
          </div>

          {/* ─── Caisses & Coffres Physiques ─── */}
          <div className="bg-slate-900/50 border border-slate-700/40 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/40 flex items-center justify-between bg-slate-800/30">
              <div className="flex items-center gap-2">
                <Landmark size={15} className="text-emerald-400" />
                <h2 className="text-sm font-bold text-white">Caisses & Coffres Physiques</h2>
              </div>
              <div className="flex items-center gap-3">
                {/* Segmented filter */}
                <div className="flex items-center bg-slate-800/80 rounded-lg p-0.5 border border-slate-700/50">
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
                          ? 'bg-slate-700 text-white shadow-sm'
                          : 'text-slate-500 hover:text-slate-300'
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
                  <thead className="bg-slate-900/80 sticky top-0 z-10 backdrop-blur-sm">
                    <tr>
                      <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nom</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Agence</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Statut</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Solde</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {unifiedList.map((caisse: CaisseSummary) => (
                      <tr key={caisse.id} className="hover:bg-slate-800/30 transition-colors group">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            {caisse.type === 'COFFRE' ? (
                              <Vault size={12} className="text-amber-400/60 shrink-0" />
                            ) : (
                              <Banknote size={12} className="text-emerald-400/60 shrink-0" />
                            )}
                            <span className="text-xs font-medium text-slate-200 group-hover:text-white transition-colors">{caisse.nom}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs text-slate-500">{caisse.agenceNom || '-'}</span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${
                            caisse.statut === 'OPEN'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-slate-700/50 text-slate-500 border-slate-600/30'
                          }`}>
                            {caisse.statut === 'OPEN' ? 'Ouverte' : 'Fermée'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className="font-mono text-xs font-bold text-white">{Number(caisse.solde).toLocaleString('fr-FR')}</span>
                          <span className="text-[9px] text-slate-600 ml-1">FCFA</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-slate-600">
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
  textAccent: string;
  balanceAccent: string;
  chipBg: string;
  chipBorder: string;
  badgeBg: string;
  badgeText: string;
  providerBalance: ReturnType<typeof resolveProviderBalance>;
  agences: DigitalCaisseByAgence[];
  expanded: boolean;
  onToggle: () => void;
}

function WalletCard({
  logo, name, gradient, borderColor, textAccent, balanceAccent,
  chipBg, chipBorder, badgeBg, badgeText,
  providerBalance, agences, expanded, onToggle,
}: WalletCardProps) {
  const hasAgences = agences.length > 0;

  return (
    <div className={`rounded-xl overflow-hidden border ${borderColor} bg-slate-900/40`}>
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
            <span className="font-bold text-sm text-white/95">{name}</span>
            <p className={`text-[9px] ${textAccent}/50`}>Solde disponible</p>
          </div>
        </div>

        {/* Balance */}
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-extrabold text-white tracking-tight font-mono">
            {providerBalance
              ? (providerBalance.error ? '---' : providerBalance.balance.toLocaleString('fr-FR'))
              : '---'
            }
          </span>
          <span className={`text-xs ${textAccent}/60 font-medium`}>FCFA</span>
          {providerBalance?.active && <CheckCircle2 size={12} className="text-emerald-300 ml-1" />}
        </div>

        {providerBalance?.error && (
          <p className="text-[10px] text-red-300/70 flex items-center gap-1 mt-1">
            <AlertCircle size={10} /> {providerBalance.error}
          </p>
        )}

        <div className="mt-2 flex items-center justify-between">
          <span className={`text-[10px] ${badgeText} flex items-center gap-1`}>
            {providerBalance?.shared && <><Link2 size={8} /> Wallet commun</>}
          </span>
          <span className={`text-[9px] ${badgeText} ${badgeBg} px-1.5 py-0.5 rounded`}>pawaPay</span>
        </div>
      </div>

      {/* Per-agence breakdown — only if there are agences */}
      {hasAgences && (
        <div>
          <button
            onClick={onToggle}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] text-slate-400 hover:text-slate-300 transition-colors bg-slate-800/30"
          >
            <span className="uppercase tracking-wider font-semibold">Répartition par agence</span>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {expanded && (
            <div className="p-2 space-y-1">
              {agences.map((caisse) => (
                <div key={caisse.caisseId} className="flex items-center justify-between p-2 rounded-lg bg-slate-800/40 border border-slate-700/20 hover:bg-slate-800/70 transition-colors">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Building2 size={11} className="text-slate-600 shrink-0" />
                    <span className="text-xs text-slate-300 truncate">{caisse.agenceNom}</span>
                  </div>
                  <span className={`text-xs font-mono font-semibold ${balanceAccent} ml-2`}>{Number(caisse.solde).toLocaleString('fr-FR')}</span>
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
    success: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    error: 'bg-red-500/10 text-red-500 border-red-500/20',
    info: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
    neutral: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  };
  return (
    <span className={`inline-flex items-center justify-center rounded border px-2 py-0.5 text-xs font-medium ${variants[variant]} ${className}`}>
      {value}
    </span>
  );
}
