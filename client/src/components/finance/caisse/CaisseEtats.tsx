import React, { useState, useEffect } from 'react';
import { ArrowLeft, FileText, Download, Calendar, TrendingUp, DollarSign, Activity } from 'lucide-react';
import { Button, Card, StatCard, Pagination } from '../../ui';

interface SessionCaisse {
  id: string;
  date_ouverture: string;
  date_fermeture?: string;
  solde_initial: number;
  solde_theorique: number;
  solde_reel?: number;
  ecart?: number;
  statut: string;
}

export default function CaisseEtats({ onBack }: { onBack: () => void }) {
  const [sessions, setSessions] = useState<SessionCaisse[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateDebut, setDateDebut] = useState(new Date(new Date().setDate(1)).toISOString().slice(0, 10));
  const [dateFin, setDateFin] = useState(new Date().toISOString().slice(0, 10));
  const [typeRapport, setTypeRapport] = useState('journal');
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const loadSessions = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions-caisse?dateDebut=${dateDebut}&dateFin=${dateFin}`, {
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Erreur lors du chargement');
      const data = await res.json();
      setSessions(data || []);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  }, [dateDebut, dateFin]);

  useEffect(() => {
    setCurrentPage(1); // Reset page on filter change
    loadSessions();

    const handleRealTimeUpdate = () => {
      loadSessions();
    };

    window.addEventListener('caisse-update', handleRealTimeUpdate);
    return () => window.removeEventListener('caisse-update', handleRealTimeUpdate);
  }, [loadSessions]);

  const exporterPDF = () => {
    alert('Export PDF en cours de développement');
  };

  const exporterExcel = () => {
    alert('Export Excel en cours de développement');
  };

  // Calculs financiers approximatifs basés sur les soldes
  // Note: Pour plus de précision, il faudrait charger les opérations de chaque session
  const totalMouvements = sessions.reduce((acc, s) => {
      const diff = Number(s.solde_theorique) - Number(s.solde_initial);
      if (diff > 0) acc.entrees += diff;
      else acc.sorties += Math.abs(diff);
      return acc;
  }, { entrees: 0, sorties: 0 });

  const soldeNet = totalMouvements.entrees - totalMouvements.sorties;
  const totalEcarts = sessions.reduce((sum, s) => sum + Number(s.ecart || 0), 0);

  // Pagination Logic
  const totalPages = Math.ceil(sessions.length / itemsPerPage);
  const paginatedSessions = sessions.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage
  );

  const setPeriode = (type: 'auj' | 'semaine' | 'mois') => {
      const today = new Date();
      const end = today.toISOString().slice(0, 10);
      let start = end;

      if (type === 'semaine') {
          const d = new Date();
          d.setDate(d.getDate() - 7);
          start = d.toISOString().slice(0, 10);
      } else if (type === 'mois') {
          const d = new Date();
          d.setDate(1);
          start = d.toISOString().slice(0, 10);
      }
      setDateDebut(start);
      setDateFin(end);
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-500 font-sans selection:bg-cyan-500/30">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                 <Button variant="ghost" size="sm" onClick={onBack} className="rounded-full w-10 h-10 p-0 flex items-center justify-center hover:bg-slate-800 text-slate-400 hover:text-white transition-colors shrink-0">
                   <ArrowLeft size={20} />
                 </Button>
                 <div>
                   <h2 className="text-xl font-bold text-white tracking-tight">États Financiers</h2>
                   <p className="text-xs text-slate-400 font-medium whitespace-nowrap">Rapports & Analyses</p>
                 </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                 <Button variant="outline" size="sm" onClick={exporterPDF} className="h-9 px-3 border-dashed border-slate-700 hover:border-slate-600 text-slate-400 hover:text-white">
                    <Download size={14} className="mr-2" /> PDF
                 </Button>
                 <Button variant="outline" size="sm" onClick={exporterExcel} className="h-9 px-3 border-dashed border-slate-700 hover:border-slate-600 text-slate-400 hover:text-white">
                    <Download size={14} className="mr-2" /> Excel
                 </Button>
              </div>
          </div>

          {/* Filters Bar */}
          <Card className="p-1 bg-slate-900/50 border-slate-800 backdrop-blur-sm shadow-none">
             <div className="flex flex-col sm:flex-row items-center gap-2 p-1">
                 {/* Shortcuts */}
                 <div className="flex bg-slate-950/50 rounded-lg p-1 shrink-0 w-full sm:w-auto overflow-x-auto">
                     <button onClick={() => setPeriode('auj')} className={`flex-1 sm:flex-none px-4 py-1.5 text-xs font-medium rounded-md transition-all ${dateDebut === new Date().toISOString().slice(0, 10) && dateFin === new Date().toISOString().slice(0, 10) ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>Aujourd'hui</button>
                     <button onClick={() => setPeriode('semaine')} className="flex-1 sm:flex-none px-4 py-1.5 text-xs font-medium rounded-md text-slate-400 hover:text-white hover:bg-white/5 transition-all">Semaine</button>
                     <button onClick={() => setPeriode('mois')} className="flex-1 sm:flex-none px-4 py-1.5 text-xs font-medium rounded-md text-slate-400 hover:text-white hover:bg-white/5 transition-all">Mois</button>
                 </div>
                 
                 <div className="h-4 w-px bg-slate-800 hidden sm:block mx-1"></div>

                 {/* Date Range Inputs */}
                 <div className="flex items-center gap-2 w-full sm:w-auto bg-slate-950/50 rounded-lg px-3 py-1.5 border border-slate-800/50 group focus-within:border-cyan-500/50 transition-colors">
                    <Calendar size={14} className="text-slate-500 group-focus-within:text-cyan-500 transition-colors" />
                    <input 
                      type="date" 
                      value={dateDebut} 
                      onChange={(e) => setDateDebut(e.target.value)}
                      className="bg-transparent border-none text-xs font-medium text-slate-300 focus:ring-0 p-0 w-24 [color-scheme:dark]"
                    />
                    <span className="text-slate-600 text-xs">au</span>
                    <input 
                      type="date" 
                      value={dateFin} 
                      onChange={(e) => setDateFin(e.target.value)}
                      className="bg-transparent border-none text-xs font-medium text-slate-300 focus:ring-0 p-0 w-24 [color-scheme:dark]"
                    />
                 </div>

                 <div className="h-4 w-px bg-slate-800 hidden sm:block mx-1"></div>

                 {/* Report Type */}
                 <select
                    value={typeRapport}
                    onChange={(e) => setTypeRapport(e.target.value)}
                    className="w-full sm:w-auto bg-slate-950/50 border border-slate-800/50 rounded-lg h-9 text-xs font-medium text-slate-300 px-3 focus:outline-none focus:border-cyan-500/50 transition-all cursor-pointer hover:bg-slate-900"
                 >
                    <option value="journal">Journal de Caisse</option>
                    <option value="synthese">Synthèse Quotidienne</option>
                    <option value="mouvements">Détail des Mouvements</option>
                    <option value="ecarts">Analyse des Écarts</option>
                 </select>
             </div>
          </Card>
      </div>

      {/* Content */}
      <Card className="bg-slate-900/80 backdrop-blur-xl border-slate-800 shadow-xl overflow-hidden mt-2">
        <div className="overflow-x-auto">
          {typeRapport === 'journal' && (
            <>
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-950/50 text-slate-400 uppercase text-[10px] font-bold tracking-wider">
                <tr>
                  <th className="px-6 py-4 rounded-tl-lg">Date</th>
                  <th className="px-6 py-4 text-right">Initial</th>
                  <th className="px-6 py-4 text-right">Entrées</th>
                  <th className="px-6 py-4 text-right">Sorties</th>
                  <th className="px-6 py-4 text-right">Théorique</th>
                  <th className="px-6 py-4 text-right">Réel</th>
                  <th className="px-6 py-4 text-right">Écart</th>
                  <th className="px-6 py-4 rounded-tr-lg">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {paginatedSessions.map((session) => {
                   const mouvements = Number(session.solde_theorique) - Number(session.solde_initial);
                   const entrees = mouvements > 0 ? mouvements : 0;
                   const sorties = mouvements < 0 ? Math.abs(mouvements) : 0;

                  return (
                    <tr key={session.id} className="hover:bg-slate-800/50 transition-colors group">
                      <td className="px-6 py-4 font-medium text-white group-hover:text-cyan-400 transition-colors">
                        {new Date(session.date_ouverture).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-6 py-4 text-right text-slate-400 font-medium font-mono">
                        {Number(session.solde_initial).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right text-emerald-400 font-bold font-mono">
                        +{entrees.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right text-rose-400 font-bold font-mono">
                        -{sorties.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right text-slate-300 font-mono">
                        {Number(session.solde_theorique).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right text-white font-bold font-mono">
                        {session.solde_reel ? Number(session.solde_reel).toLocaleString() : '-'}
                      </td>
                      <td className="px-6 py-4 text-right font-mono">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          !session.ecart || Number(session.ecart) === 0 ? 'bg-emerald-500/10 text-emerald-400' :
                          'bg-amber-500/10 text-amber-400'
                        }`}>
                          {session.ecart ? `${Number(session.ecart) > 0 ? '+' : ''}${Number(session.ecart).toLocaleString()}` : '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
                          session.statut === 'Fermée' 
                            ? 'bg-emerald-500/5 text-emerald-400 border-emerald-500/20' 
                            : 'bg-blue-500/5 text-blue-400 border-blue-500/20'
                        }`}>
                          {session.statut}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {sessions.length > 0 && (
                <tfoot className="bg-slate-950/50 font-bold border-t-2 border-slate-800">
                  <tr>
                    <td className="px-6 py-4 text-white uppercase text-xs tracking-wider">Totaux</td>
                    <td className="px-6 py-4 text-right text-slate-400 font-mono">
                      {sessions.reduce((sum, s) => sum + Number(s.solde_initial), 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right text-emerald-400 font-mono">
                      +{totalMouvements.entrees.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right text-rose-400 font-mono">
                      -{totalMouvements.sorties.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right text-slate-300 font-mono">
                      {sessions.reduce((sum, s) => sum + Number(s.solde_theorique), 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right text-white font-mono">
                      {sessions.reduce((sum, s) => sum + Number(s.solde_reel || 0), 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right font-mono">
                      <span className={`${totalEcarts !== 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {totalEcarts > 0 ? '+' : ''}{totalEcarts.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-6 py-4"></td>
                  </tr>
                </tfoot>
              )}
            </table>
            
           {/* Pagination */}
           {sessions.length > itemsPerPage && (
             <div className="p-4 border-t border-slate-800 bg-slate-950/30">
                 <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    itemsPerPage={itemsPerPage}
                    totalItems={sessions.length}
                    canGoNext={currentPage < totalPages}
                    canGoPrevious={currentPage > 1}
                 />
             </div>
           )}
           </>
          )}

          {typeRapport === 'synthese' && (
              <div className="p-6 grid gap-6">
                <div className="grid md:grid-cols-2 gap-6">
                   <Card variant="glass" className="p-4 border-slate-800 bg-slate-950/30">
                       <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Volume & Activité</h4>
                       <div className="space-y-4">
                           <div className="flex justify-between items-center">
                               <span className="text-slate-400 text-sm">Nombre de Sessions</span>
                               <span className="text-xl font-bold text-white">{sessions.length}</span>
                           </div>
                           <div className="flex justify-between items-center">
                               <span className="text-slate-400 text-sm">Sessions Fermées</span>
                               <span className="text-xl font-bold text-emerald-400">{sessions.filter(s => s.statut === 'Fermée').length}</span>
                           </div>
                           <div className="flex justify-between items-center">
                               <span className="text-slate-400 text-sm">Moyenne / Session</span>
                               <span className="text-xl font-bold text-blue-400">
                                   {sessions.length > 0 ? (totalMouvements.entrees / sessions.length).toFixed(0).toLocaleString() : '0'} <span className="text-xs text-slate-500 font-normal">FCFA</span>
                               </span>
                           </div>
                       </div>
                   </Card>

                   <Card variant="glass" className="p-4 border-slate-800 bg-slate-950/30">
                       <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Santé Financière</h4>
                       <div className="space-y-4">
                           <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50 flex items-center justify-between">
                               <div className="flex items-center gap-3">
                                   <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
                                       <TrendingUp size={18} />
                                   </div>
                                   <span className="text-sm font-medium text-slate-300">Total Flux Entrants</span>
                               </div>
                               <span className="text-lg font-bold text-emerald-400">
                                   {totalMouvements.entrees.toLocaleString()} <span className="text-xs text-slate-500 font-normal">FCFA</span>
                               </span>
                           </div>

                           <div className={`bg-slate-800/50 rounded-lg p-3 border border-slate-700/50 flex items-center justify-between`}>
                               <div className="flex items-center gap-3">
                                   <div className={`p-2 rounded-lg ${totalEcarts === 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                       <Activity size={18} />
                                   </div>
                                   <span className="text-sm font-medium text-slate-300">Balance Écarts</span>
                               </div>
                               <span className={`text-lg font-bold ${totalEcarts === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                   {totalEcarts > 0 ? '+' : ''}{totalEcarts.toLocaleString()} <span className="text-xs text-slate-500 font-normal">FCFA</span>
                               </span>
                           </div>
                       </div>
                   </Card>
                </div>
              </div>
          )}
          
          {sessions.length === 0 && (
             <div className="py-16 text-center">
                <div className="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FileText size={32} className="text-slate-600" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-1">Aucune donnée disponible</h3>
                <p className="text-slate-500 text-sm">Sélectionnez une période différente pour voir les états.</p>
             </div>
          )}
        </div>
      </Card>
    </div>
  );
}
