import React, { useState, useEffect } from 'react';
import { requestAllPages } from '../../lib/api-client';
import { FileText, Download, TrendingUp, Users, DollarSign, Activity, BarChart3, Filter, ChevronLeft, ChevronRight, Eye, Calendar, Loader2 } from 'lucide-react';
import { addPdfLogoHeader } from '@/lib/pdf-logo';
import { toast } from '../../lib/toast';
import { loadPDFLibraries } from '@/lib/lazy-export';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../ui/sheet';

interface Rapport {
  id: string;
  agentId: string;
  periodeDebut: string;
  periodeFin: string;
  typeRapport: string;
  nombreVisites: number;
  nombreCollectes: number;
  montantTotalCollecte: number;
  tauxReussite: number;
  clientsNouveaux: number;
  incidents: number;
  kmParcourus: number;
  notes: string;
  createdAt: string;
  agent?: {
    nom: string;
    prenom: string;
  };
}

export default function AgentRapports({ agentId }: { agentId?: string }) {
  const [rapports, setRapports] = useState<Rapport[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [typeRapport, setTypeRapport] = useState<string>('Mensuel');
  const [selectedAgent, setSelectedAgent] = useState(agentId || '');
  const [periodeDu, setPeriodeDu] = useState(new Date(new Date().setDate(1)).toISOString().slice(0, 10));
  const [periodeAu, setPeriodeAu] = useState(new Date().toISOString().slice(0, 10));

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  // Detail Sheet
  const [selectedRapport, setSelectedRapport] = useState<Rapport | null>(null);

  useEffect(() => {
    loadRapports();
  }, [selectedAgent, periodeDu, periodeAu, typeRapport]);

  const loadRapports = async () => {
    try {
      setLoading(true);
      let url = '/api/agent-rapports?';
      if (selectedAgent) url += `agent_id=${selectedAgent}&`;
      if (typeRapport !== 'all') url += `type_rapport=${typeRapport}&`;
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setRapports(data || []);
        setCurrentPage(1);
      }
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const genererRapport = async () => {
    if (!selectedAgent) {
      toast.error('Veuillez sélectionner un agent');
      return;
    }

    setGenerating(true);
    try {
      const [visites, paiements] = await Promise.all([
        requestAllPages('/visites-terrain', { agent_id: selectedAgent, date_debut: periodeDu, date_fin: periodeAu }),
        requestAllPages('/paiements-terrain', { agent_id: selectedAgent, date_debut: periodeDu, date_fin: periodeAu })
      ]);

      const nombre_visites = visites?.length || 0;
      const nombre_collectes = paiements?.length || 0;
      const montant_total_collecte = paiements?.reduce((sum: number, p: any) => sum + (p.montant || 0), 0) || 0;
      const taux_reussite = nombre_visites > 0 ? (nombre_collectes / nombre_visites) * 100 : 0;

      const response = await fetch('/api/agent-rapports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: selectedAgent,
          periode_debut: periodeDu,
          periode_fin: periodeAu,
          type_rapport: typeRapport,
          nombre_visites,
          nombre_collectes,
          montant_total_collecte,
          taux_reussite,
          clients_nouveaux: 0,
          incidents: 0,
          kmParcourus: 0,
          notes: `Rapport généré automatiquement`
        })
      });

      if (!response.ok) throw new Error('Erreur lors de la création du rapport');
      loadRapports();
      toast.success(`Rapport ${typeRapport.toLowerCase()} généré avec succès`);
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la génération du rapport');
    } finally {
      setGenerating(false);
    }
  };

  const exportPDF = async () => {
    if (rapports.length === 0) return;

    const { jsPDF, autoTable } = await loadPDFLibraries();
    const doc = new jsPDF();
    const startY = addPdfLogoHeader(doc, {
      title: 'Rapport Agent Terrain',
      subtitle: `Période: ${periodeDu} au ${periodeAu} | Type: ${typeRapport}`,
      dateRight: `Généré le: ${new Date().toLocaleDateString('fr-FR')}`,
    });

    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    doc.text(`Visites: ${totalVisites} | Collectes: ${totalCollectes} | Montant: ${totalMontant.toLocaleString()} FCFA | Taux: ${tauxMoyen.toFixed(1)}%`, 14, startY);

    autoTable(doc, {
      startY: startY + 8,
      head: [['Période', 'Type', 'Visites', 'Collectes', 'Montant (FCFA)', 'Taux (%)', 'KM']],
      body: rapports.map(r => [
        `${new Date(r.periodeDebut).toLocaleDateString('fr-FR')} - ${new Date(r.periodeFin).toLocaleDateString('fr-FR')}`,
        r.typeRapport,
        r.nombreVisites,
        r.nombreCollectes,
        r.montantTotalCollecte.toLocaleString(),
        r.tauxReussite.toFixed(1),
        r.kmParcourus.toFixed(1)
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [37, 99, 235] },
    });

    doc.save(`rapport_agent_${typeRapport}_${periodeDu}.pdf`);
  };

  const totalVisites = rapports.reduce((sum, r) => sum + r.nombreVisites, 0);
  const totalCollectes = rapports.reduce((sum, r) => sum + r.nombreCollectes, 0);
  const totalMontant = rapports.reduce((sum, r) => sum + r.montantTotalCollecte, 0);
  const tauxMoyen = rapports.length > 0
    ? rapports.reduce((sum, r) => sum + r.tauxReussite, 0) / rapports.length
    : 0;

  // Pagination Logic
  const totalPages = Math.ceil(rapports.length / ITEMS_PER_PAGE);
  const paginatedRapports = rapports.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="space-y-3">
      {/* Stats Compact */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <StatCard icon={<Users size={14} />} label="Visites" value={totalVisites.toString()} color="blue" />
        <StatCard icon={<Activity size={14} />} label="Collectes" value={totalCollectes.toString()} color="green" />
        <StatCard icon={<DollarSign size={14} />} label="Montant" value={`${totalMontant.toLocaleString()} FC`} color="emerald" />
        <StatCard icon={<BarChart3 size={14} />} label="Taux Moyen" value={`${tauxMoyen.toFixed(1)}%`} color="cyan" />
      </div>

      {/* Generation Form Compact */}
      <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-800">
        <div className="flex flex-col md:flex-row gap-2 items-end">
          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-2 w-full">
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Type</label>
              <select
                value={typeRapport}
                onChange={(e) => setTypeRapport(e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs"
              >
                <option value="Quotidien">Quotidien</option>
                <option value="Hebdomadaire">Hebdomadaire</option>
                <option value="Mensuel">Mensuel</option>
                <option value="Trimestriel">Trimestriel</option>
                <option value="Annuel">Annuel</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Du</label>
              <input
                type="date"
                value={periodeDu}
                onChange={(e) => setPeriodeDu(e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Au</label>
              <input
                type="date"
                value={periodeAu}
                onChange={(e) => setPeriodeAu(e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs"
              />
            </div>
            
            <div className="flex gap-1.5 items-end col-span-2 md:col-span-1">
              <button
                onClick={genererRapport}
                disabled={generating || !selectedAgent}
                className="flex-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-xs transition disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {generating ? <Loader2 size={14} className="animate-spin" /> : <Filter size={14} />}
                Générer
              </button>
              <button
                onClick={exportPDF}
                disabled={rapports.length === 0}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg flex items-center gap-1.5 text-xs font-bold transition disabled:opacity-50"
              >
                <Download size={14} />
                PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Reports List */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between bg-slate-900/30">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <FileText size={16} className="text-blue-400" />
            Rapports Générés
          </h3>
          <span className="text-[10px] text-slate-500 font-medium">{rapports.length} rapports</span>
        </div>
        
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-cyan-500" /></div>
        ) : rapports.length === 0 ? (
          <div className="text-center py-12 opacity-50">
            <FileText size={32} className="mx-auto mb-2 text-slate-500" />
            <p className="text-sm text-slate-400">Aucun rapport disponible</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-900/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-bold text-slate-400 uppercase">Période</th>
                  <th className="px-3 py-2 text-left text-xs font-bold text-slate-400 uppercase">Type</th>
                  <th className="px-3 py-2 text-right text-xs font-bold text-slate-400 uppercase hidden sm:table-cell">Visites</th>
                  <th className="px-3 py-2 text-right text-xs font-bold text-slate-400 uppercase hidden md:table-cell">Collectes</th>
                  <th className="px-3 py-2 text-right text-xs font-bold text-slate-400 uppercase">Montant</th>
                  <th className="px-3 py-2 text-right text-xs font-bold text-slate-400 uppercase hidden lg:table-cell">Taux</th>
                  <th className="px-3 py-2 text-right text-xs font-bold text-slate-400 uppercase"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {paginatedRapports.map((rapport) => (
                  <tr 
                    key={rapport.id} 
                    className="hover:bg-slate-700/30 transition cursor-pointer group"
                    onClick={() => setSelectedRapport(rapport)}
                  >
                    <td className="px-3 py-2 text-xs text-white">
                      {new Date(rapport.periodeDebut).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} - {new Date(rapport.periodeFin).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                    </td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[10px] font-bold uppercase">
                        {rapport.typeRapport}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-slate-300 hidden sm:table-cell">{rapport.nombreVisites}</td>
                    <td className="px-3 py-2 text-right text-xs text-green-400 hidden md:table-cell">{rapport.nombreCollectes}</td>
                    <td className="px-3 py-2 text-right text-xs text-white font-bold">{rapport.montantTotalCollecte.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-xs hidden lg:table-cell">
                      <span className={`font-bold ${
                        rapport.tauxReussite >= 80 ? 'text-green-400' :
                        rapport.tauxReussite >= 60 ? 'text-cyan-400' :
                        'text-amber-400'
                      }`}>
                        {rapport.tauxReussite.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Eye size={14} className="text-slate-600 group-hover:text-cyan-400 inline-block" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-700/50 bg-slate-900/20">
            <span className="text-[10px] text-slate-500">Page {currentPage} sur {totalPages}</span>
            <div className="flex gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 transition"
              >
                <ChevronLeft size={12} />
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 transition"
              >
                <ChevronRight size={12} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Sheet */}
      <Sheet open={!!selectedRapport} onOpenChange={(open) => !open && setSelectedRapport(null)}>
        <SheetContent className="w-full sm:max-w-md bg-slate-950 border-l-slate-800 p-0 overflow-y-auto">
          {selectedRapport && (
            <>
              <SheetHeader className="px-6 py-4 border-b border-slate-800 bg-slate-950/50 backdrop-blur sticky top-0 z-10">
                <SheetTitle className="text-white flex items-center gap-2">
                  <FileText size={16} className="text-blue-400" />
                  Détail Rapport
                </SheetTitle>
                <SheetDescription className="text-slate-400">
                  {selectedRapport.typeRapport} • {new Date(selectedRapport.periodeDebut).toLocaleDateString('fr-FR')} au {new Date(selectedRapport.periodeFin).toLocaleDateString('fr-FR')}
                </SheetDescription>
              </SheetHeader>

              <div className="p-6 space-y-6">
                {/* Main Summary Card */}
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-center">
                  <div className="text-xs text-slate-400 uppercase font-bold mb-1">Montant Total Collecté</div>
                  <div className="text-2xl font-bold text-white">{selectedRapport.montantTotalCollecte.toLocaleString()} FCFA</div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <InfoItem label="Visites" value={selectedRapport.nombreVisites.toString()} />
                  <InfoItem label="Collectes" value={selectedRapport.nombreCollectes.toString()} />
                  <InfoItem label="Taux Réussite" value={`${selectedRapport.tauxReussite.toFixed(1)}%`} />
                  <InfoItem label="KM Parcourus" value={`${selectedRapport.kmParcourus.toFixed(1)} km`} />
                  <InfoItem label="Nouveaux Clients" value={selectedRapport.clientsNouveaux.toString()} />
                  <InfoItem label="Incidents" value={selectedRapport.incidents.toString()} />
                </div>

                {/* Notes */}
                {selectedRapport.notes && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-500 uppercase">Notes</h4>
                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-300 italic">
                      "{selectedRapport.notes}"
                    </div>
                  </div>
                )}

                {/* Meta */}
                <div className="pt-4 border-t border-slate-800">
                  <div className="text-[10px] text-slate-500 text-center">
                    Créé le {new Date(selectedRapport.createdAt).toLocaleString('fr-FR')}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SUB COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function StatCard({ icon, label, value, color }: { icon: React.ReactNode, label: string, value: string, color: string }) {
    const colorClasses: Record<string, string> = {
        blue: 'from-blue-500/20 to-blue-600/5 border-blue-500/20 text-blue-400',
        green: 'from-green-500/20 to-green-600/5 border-green-500/20 text-green-400',
        emerald: 'from-emerald-500/20 to-emerald-600/5 border-emerald-500/20 text-emerald-400',
        cyan: 'from-cyan-500/20 to-cyan-600/5 border-cyan-500/20 text-cyan-400',
    };
    
    return (
        <div className={`rounded-xl p-3 border bg-gradient-to-br ${colorClasses[color] || colorClasses.blue}`}>
            <div className="flex justify-between items-start mb-1">
                <div className="p-1.5 rounded-lg bg-white/5">{icon}</div>
            </div>
            <div className="text-lg font-bold text-white truncate">{value}</div>
            <div className="text-[10px] uppercase font-bold opacity-70 tracking-wide">{label}</div>
        </div>
    );
}

function InfoItem({ label, value }: { label: string, value: string }) {
    return (
        <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
            <div className="text-[10px] uppercase font-bold text-slate-500 mb-0.5">{label}</div>
            <div className="text-sm font-medium text-slate-200">{value}</div>
        </div>
    );
}
