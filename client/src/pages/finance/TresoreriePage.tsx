import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  RefreshCw, Wallet, Building2, Smartphone, Banknote,
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Loader2, ChevronDown
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import airtelLogo from '@/assets/logos/airtel-logo.png';
import mtnLogo from '@/assets/logos/mtn-logo.png';

// Safe date format helper
const safeDateFormat = (dateValue: string | Date | null | undefined, formatStr: string): string => {
  if (!dateValue) return '-';
  try {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return '-';
    return format(date, formatStr, { locale: fr });
  } catch {
    return '-';
  }
};

// Provider logos
const ProviderLogo = ({ provider, size = 'md' }: { provider: string; size?: 'sm' | 'md' | 'lg' }) => {
  const sizeClass = size === 'sm' ? 'h-5 w-5' : size === 'md' ? 'h-8 w-8' : 'h-12 w-12';
  if (provider === 'MTN') {
    return <img src={mtnLogo} alt="MTN" className={sizeClass} />;
  }
  return <img src={airtelLogo} alt="Airtel" className={sizeClass} />;
};

interface CaisseSummary {
  id: string;
  nom: string;
  type: string;
  solde: string;
  statut: string;
  agenceId?: string;
  agenceNom?: string;
}

// Backend structure from mm-caisse-service
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
  totalDigital: number;
  totalGlobal: number;
  digitalCaisses: DigitalCaisseSummary;
  physicalCaisses: CaisseSummary[];
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

// Fetch tresorerie data
async function fetchTresorerieStats(): Promise<TresorerieStats> {
  // Fetch digital caisses summary
  const digitalRes = await fetch('/api/caisses/digital-summary', { credentials: 'include' });

  // Default values if endpoint doesn't exist
  const defaultDigital: DigitalCaisseSummary = {
    mtn: { total: 0, byAgence: [] },
    airtel: { total: 0, byAgence: [] },
    grandTotal: 0,
  };

  if (!digitalRes.ok) {
    return {
      totalPhysique: 0,
      totalDigital: 0,
      totalGlobal: 0,
      digitalCaisses: defaultDigital,
      physicalCaisses: [],
      recentMovements: [],
    };
  }

  const digitalData: DigitalCaisseSummary = await digitalRes.json();

  // Fetch physical caisses
  const physicalRes = await fetch('/api/caisses?type=PHYSICAL', { credentials: 'include' });
  const physicalData = physicalRes.ok ? await physicalRes.json() : [];

  const totalPhysique = physicalData.reduce((sum: number, c: any) => sum + Number(c.solde || 0), 0);
  const totalDigital = digitalData.grandTotal || (digitalData.mtn?.total || 0) + (digitalData.airtel?.total || 0);

  return {
    totalPhysique,
    totalDigital,
    totalGlobal: totalPhysique + totalDigital,
    digitalCaisses: digitalData,
    physicalCaisses: physicalData,
    recentMovements: [],
  };
}

export default function TresoreriePage() {
  const [filterAgence, setFilterAgence] = useState<string>('');

  const { data: stats, isLoading, refetch, isFetching } = useQuery<TresorerieStats>({
    queryKey: ['tresorerie-stats', filterAgence],
    queryFn: fetchTresorerieStats,
    refetchInterval: 60000, // Refresh every minute
  });

  const totalPhysique = stats?.totalPhysique || 0;
  const totalDigital = stats?.totalDigital || 0;
  const totalGlobal = stats?.totalGlobal || 0;
  const mtnData = stats?.digitalCaisses?.mtn || { total: 0, byAgence: [] };
  const airtelData = stats?.digitalCaisses?.airtel || { total: 0, byAgence: [] };

  return (
    <div className="flex flex-col h-full space-y-2 relative p-2" data-testid="page-tresorerie">
      {/* Header - Compact */}
      <div className="shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Wallet className="text-cyan-400" size={24} />
            Trésorerie
          </h1>
          <p className="text-slate-400 text-xs mt-0.5">
            Vue consolidée des caisses physiques et digitales
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs transition-colors disabled:opacity-50 border border-slate-700"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          Actualiser
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-full">
          <Loader2 size={32} className="text-cyan-500 animate-spin" />
        </div>
      ) : (
        <>
          {/* Global Summary - Compact Grid */}
          <div className="grid grid-cols-3 gap-2 shrink-0">
            {/* Total Global */}
            <div className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-xl p-3 flex items-center justify-between relative overflow-hidden group">
              <div className="absolute right-0 top-0 p-2 opacity-5 scale-150 group-hover:scale-125 transition-transform"><Wallet size={48} /></div>
              <div>
                 <p className="text-[10px] text-cyan-300 uppercase tracking-wider font-bold">Total Global</p>
                 <div className="flex items-baseline gap-1">
                   <span className="text-2xl font-bold text-white tracking-tight">{totalGlobal.toLocaleString()}</span>
                   <span className="text-xs text-cyan-400/70 font-medium">FCFA</span>
                 </div>
              </div>
              <div className="h-full flex items-end">
                 <Badge value="Global" variant="info" className="text-[9px] px-1.5 py-0" />
              </div>
            </div>

            {/* Caisses Physiques */}
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3 flex items-center justify-between">
               <div>
                  <p className="text-[10px] text-emerald-400/80 uppercase tracking-wider font-bold flex items-center gap-1">
                    <Banknote size={12} /> Physiques
                  </p>
                  <div className="flex items-baseline gap-1">
                     <span className="text-xl font-bold text-white">{totalPhysique.toLocaleString()}</span>
                     <span className="text-[10px] text-slate-500">FCFA</span>
                  </div>
               </div>
               <div className="text-right">
                  <span className="text-xs font-bold text-white bg-slate-700 px-1.5 py-0.5 rounded-md">
                    {stats?.physicalCaisses?.length || 0}
                  </span>
                  <p className="text-[9px] text-slate-500 mt-0.5">caisses</p>
               </div>
            </div>

            {/* Caisses Digitales */}
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3 flex items-center justify-between">
               <div>
                  <p className="text-[10px] text-violet-400/80 uppercase tracking-wider font-bold flex items-center gap-1">
                    <Smartphone size={12} /> Digitales
                  </p>
                  <div className="flex items-baseline gap-1">
                     <span className="text-xl font-bold text-white">{totalDigital.toLocaleString()}</span>
                     <span className="text-[10px] text-slate-500">FCFA</span>
                  </div>
               </div>
               <div className="text-right">
                  <span className="text-xs font-bold text-white bg-slate-700 px-1.5 py-0.5 rounded-md">
                    {mtnData.byAgence.length + airtelData.byAgence.length}
                  </span>
                  <p className="text-[9px] text-slate-500 mt-0.5">comptes</p>
               </div>
            </div>
          </div>

          {/* Main Content - Split View */}
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-2 overflow-hidden">
            
            {/* Left Column: Mobile Money */}
            <div className="flex flex-col gap-2 min-h-0">
               {/* MTN Card */}
               <div className="flex-1 min-h-0 bg-slate-900/40 border border-yellow-500/10 rounded-xl flex flex-col overflow-hidden relative">
                  <div className="absolute top-0 left-0 w-1 h-full bg-yellow-500/50"></div>
                  <div className="p-2 border-b border-slate-700/50 bg-yellow-500/5 flex justify-between items-center shrink-0">
                     <div className="flex items-center gap-2">
                        <ProviderLogo provider="MTN" size="sm" />
                        <span className="font-bold text-sm text-yellow-100">MTN Mobile Money</span>
                     </div>
                     <span className="font-mono font-bold text-yellow-400">{mtnData.total.toLocaleString()} F</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                    {mtnData.byAgence.length > 0 ? (
                      mtnData.byAgence.map((caisse) => (
                        <div key={caisse.caisseId} className="flex items-center justify-between p-2 rounded-lg bg-slate-800/30 border border-slate-700/30 hover:bg-slate-800/60 transition-colors">
                           <div className="flex items-center gap-2 overflow-hidden">
                              <Building2 size={12} className="text-slate-500 shrink-0" />
                              <span className="text-xs text-slate-300 truncate">{caisse.agenceNom}</span>
                           </div>
                           <span className="text-xs font-mono font-medium text-yellow-500 ml-2">{Number(caisse.solde).toLocaleString()}</span>
                        </div>
                      ))
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-slate-500/50">
                        <Smartphone size={24} className="mb-1 opacity-20" />
                        <span className="text-[10px]">Aucun compte MTN</span>
                      </div>
                    )}
                  </div>
               </div>

               {/* Airtel Card */}
               <div className="flex-1 min-h-0 bg-slate-900/40 border border-red-500/10 rounded-xl flex flex-col overflow-hidden relative">
                  <div className="absolute top-0 left-0 w-1 h-full bg-red-500/50"></div>
                  <div className="p-2 border-b border-slate-700/50 bg-red-500/5 flex justify-between items-center shrink-0">
                     <div className="flex items-center gap-2">
                        <ProviderLogo provider="AIRTEL" size="sm" />
                        <span className="font-bold text-sm text-red-100">Airtel Money</span>
                     </div>
                     <span className="font-mono font-bold text-red-400">{airtelData.total.toLocaleString()} F</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                    {airtelData.byAgence.length > 0 ? (
                      airtelData.byAgence.map((caisse) => (
                        <div key={caisse.caisseId} className="flex items-center justify-between p-2 rounded-lg bg-slate-800/30 border border-slate-700/30 hover:bg-slate-800/60 transition-colors">
                           <div className="flex items-center gap-2 overflow-hidden">
                              <Building2 size={12} className="text-slate-500 shrink-0" />
                              <span className="text-xs text-slate-300 truncate">{caisse.agenceNom}</span>
                           </div>
                           <span className="text-xs font-mono font-medium text-red-400 ml-2">{Number(caisse.solde).toLocaleString()}</span>
                        </div>
                      ))
                    ) : (
                       <div className="h-full flex flex-col items-center justify-center text-slate-500/50">
                        <Smartphone size={24} className="mb-1 opacity-20" />
                        <span className="text-[10px]">Aucun compte Airtel</span>
                      </div>
                    )}
                  </div>
               </div>
            </div>

            {/* Right Column: Physical Caisses */}
            <div className="flex flex-col min-h-0 bg-slate-900/50 border border-slate-700/50 rounded-xl overflow-hidden">
               <div className="p-2 border-b border-slate-700/50 flex items-center justify-between shrink-0 bg-slate-800/50">
                  <div className="flex items-center gap-2">
                     <Banknote size={16} className="text-emerald-400" />
                     <h2 className="text-sm font-bold text-white">Caisses Physiques</h2>
                  </div>
                  <Badge value={`${stats?.physicalCaisses?.length || 0} caisses`} variant="neutral" className="text-[10px]" />
               </div>
               
               <div className="flex-1 overflow-y-auto custom-scrollbar">
                  {stats?.physicalCaisses && stats.physicalCaisses.length > 0 ? (
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-900/80 sticky top-0 z-10 backdrop-blur-sm">
                        <tr>
                          <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase">Caisse</th>
                          <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase">Agence</th>
                          <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase text-center">Statut</th>
                          <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase text-right">Solde</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {stats.physicalCaisses.map((caisse) => (
                          <tr key={caisse.id} className="hover:bg-slate-800/40 transition-colors group">
                            <td className="px-3 py-2">
                              <div className="font-medium text-xs text-white group-hover:text-cyan-400 transition-colors">{caisse.nom}</div>
                            </td>
                            <td className="px-3 py-2">
                              <div className="text-xs text-slate-400">{caisse.agenceNom || '-'}</div>
                            </td>
                            <td className="px-3 py-2 text-center">
                               <div className={`inline-flex items-center px-1.5 py-0.5 rounded-[4px] text-[9px] font-bold uppercase border ${
                                 caisse.statut === 'OPEN' 
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                  : 'bg-slate-700/50 text-slate-400 border-slate-600/50'
                               }`}>
                                 {caisse.statut === 'OPEN' ? 'Ouverte' : 'Fermée'}
                               </div>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className="font-mono text-xs font-bold text-white">{Number(caisse.solde).toLocaleString()}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center p-8 text-slate-500">
                      <Banknote size={32} className="mb-2 opacity-20" />
                      <p className="text-xs">Aucune caisse physique</p>
                    </div>
                  )}
               </div>
            </div>

          </div>
        </>
      )}
    </div>
  );
}

// Simple Badge component to avoid import issues if not available
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
