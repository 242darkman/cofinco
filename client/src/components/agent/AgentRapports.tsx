import React, { useState, useEffect } from 'react';
import { requestAllPages } from '../../lib/api-client';
import { FileText, Download, Calendar, TrendingUp, Users, DollarSign, Activity, BarChart3, Filter } from 'lucide-react';
import { addPdfLogoHeader } from '@/lib/pdf-logo';
import { toast } from '../../lib/toast';
// P4.1: Lazy-load heavy export libraries
import { loadPDFLibraries } from '@/lib/lazy-export';

interface Rapport {
  id: string;
  agent_id: string;
  periode_debut: string;
  periode_fin: string;
  type_rapport: string;
  nombre_visites: number;
  nombre_collectes: number;
  montant_total_collecte: number;
  taux_reussite: number;
  clients_nouveaux: number;
  incidents: number;
  km_parcourus: number;
  notes: string;
  created_at: string;
  agent?: {
    nom: string;
    prenom: string;
  };
}

export default function AgentRapports({ agentId }: { agentId?: string }) {
  const [rapports, setRapports] = useState<Rapport[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeRapport, setTypeRapport] = useState<string>('Mensuel');
  const [selectedAgent, setSelectedAgent] = useState(agentId || '');
  const [periodeDu, setPeriodeDu] = useState(new Date(new Date().setDate(1)).toISOString().slice(0, 10));
  const [periodeAu, setPeriodeAu] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    loadRapports();
  }, [selectedAgent, periodeDu, periodeAu, typeRapport]);

  const loadRapports = async () => {
    try {
      let url = '/api/agent-rapports?';
      if (selectedAgent) url += `agent_id=${selectedAgent}&`;
      if (typeRapport !== 'all') url += `type_rapport=${typeRapport}&`;
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setRapports(data || []);
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

    setLoading(true);
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
          km_parcourus: 0,
          notes: `Rapport généré automatiquement`
        })
      });

      if (!response.ok) throw new Error('Erreur lors de la création du rapport');
      loadRapports();
      toast.success(`Rapport ${typeRapport.toLowerCase()} généré avec succès`);
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la génération du rapport');
    } finally {
      setLoading(false);
    }
  };

  const exportPDF = async () => {
    if (rapports.length === 0) return;

    // P4.1: Lazy-load PDF library
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
        `${new Date(r.periode_debut).toLocaleDateString('fr-FR')} - ${new Date(r.periode_fin).toLocaleDateString('fr-FR')}`,
        r.type_rapport,
        r.nombre_visites,
        r.nombre_collectes,
        r.montant_total_collecte.toLocaleString(),
        r.taux_reussite.toFixed(1),
        r.km_parcourus.toFixed(1)
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [37, 99, 235] },
    });

    doc.save(`rapport_agent_${typeRapport}_${periodeDu}.pdf`);
  };

  const totalVisites = rapports.reduce((sum, r) => sum + r.nombre_visites, 0);
  const totalCollectes = rapports.reduce((sum, r) => sum + r.nombre_collectes, 0);
  const totalMontant = rapports.reduce((sum, r) => sum + r.montant_total_collecte, 0);
  const tauxMoyen = rapports.length > 0
    ? rapports.reduce((sum, r) => sum + r.taux_reussite, 0) / rapports.length
    : 0;

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <Users size={24} />
            <TrendingUp size={20} />
          </div>
          <div className="text-3xl font-bold mb-1">{totalVisites}</div>
          <div className="text-blue-100 text-sm">Total Visites</div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <Activity size={24} />
            <BarChart3 size={20} />
          </div>
          <div className="text-3xl font-bold mb-1">{totalCollectes}</div>
          <div className="text-green-100 text-sm">Total Collectes</div>
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <DollarSign size={24} />
            <TrendingUp size={20} />
          </div>
          <div className="text-3xl font-bold mb-1">{totalMontant.toLocaleString()} FCFA</div>
          <div className="text-emerald-100 text-sm">Montant Total</div>
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <BarChart3 size={24} />
            <Activity size={20} />
          </div>
          <div className="text-3xl font-bold mb-1">{tauxMoyen.toFixed(1)}%</div>
          <div className="text-emerald-100 text-sm">Taux Réussite Moyen</div>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Filter size={24} className="text-blue-400" />
          Génération de Rapport
        </h3>

        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">Type de Rapport</label>
            <select
              value={typeRapport}
              onChange={(e) => setTypeRapport(e.target.value)}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
            >
              <option value="Quotidien">Quotidien</option>
              <option value="Hebdomadaire">Hebdomadaire</option>
              <option value="Mensuel">Mensuel</option>
              <option value="Trimestriel">Trimestriel</option>
              <option value="Annuel">Annuel</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">Période Du</label>
            <input
              type="date"
              value={periodeDu}
              onChange={(e) => setPeriodeDu(e.target.value)}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">Au</label>
            <input
              type="date"
              value={periodeAu}
              onChange={(e) => setPeriodeAu(e.target.value)}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
            />
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={genererRapport}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition disabled:opacity-50"
            >
              Générer Rapport
            </button>
            <button
              onClick={exportPDF}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center gap-2"
            >
              <Download size={20} />
              PDF
            </button>
          </div>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="p-4 border-b border-slate-700">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <FileText size={20} className="text-blue-400" />
            Rapports Générés ({rapports.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-700">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Période</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Type</th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-slate-300">Visites</th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-slate-300">Collectes</th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-slate-300">Montant</th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-slate-300">Taux</th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-slate-300">KM</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {rapports.map((rapport) => (
                <tr key={rapport.id} className="hover:bg-slate-700/50 transition">
                  <td className="px-6 py-4 text-white">
                    {new Date(rapport.periode_debut).toLocaleDateString('fr-FR')} - {new Date(rapport.periode_fin).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-xs font-semibold">
                      {rapport.type_rapport}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-white">{rapport.nombre_visites}</td>
                  <td className="px-6 py-4 text-right text-green-400">{rapport.nombre_collectes}</td>
                  <td className="px-6 py-4 text-right text-white font-semibold">{rapport.montant_total_collecte.toLocaleString()} FCFA</td>
                  <td className="px-6 py-4 text-right">
                    <span className={`font-semibold ${
                      rapport.taux_reussite >= 80 ? 'text-green-400' :
                      rapport.taux_reussite >= 60 ? 'text-cyan-400' :
                      'text-blue-400'
                    }`}>
                      {rapport.taux_reussite.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-slate-300">{rapport.km_parcourus.toFixed(1)}</td>
                  <td className="px-6 py-4">
                    <button className="text-blue-400 hover:text-blue-300 text-sm font-semibold">
                      Détails
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {rapports.length === 0 && (
            <div className="text-center py-12">
              <FileText size={48} className="mx-auto text-slate-600 mb-4" />
              <p className="text-slate-400">Aucun rapport disponible</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
