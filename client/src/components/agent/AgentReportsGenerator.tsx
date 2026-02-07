import React, { useState, useEffect } from 'react';
import { requestAllPages } from '../../lib/api-client';
import { FileText, Download, Calendar, Filter, TrendingUp, Users, Banknote, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { StatutVisiteTerrain, StatutValidationDepense } from '@shared/enum/status-constants';

interface ReportData {
  presences: any[];
  collectes: any[];
  recouvrements: any[];
  visites: any[];
  depenses: any[];
}

export default function AgentReportsGenerator() {
  const [reportType, setReportType] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('daily');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [agentId, setAgentId] = useState('');

  useEffect(() => {
    const cofinUserStr = localStorage.getItem('cofin_user');
    if (cofinUserStr) {
      const user = JSON.parse(cofinUserStr);
      setAgentId(user.id);
    }

    const today = new Date();
    setEndDate(today.toISOString().split('T')[0]);
    setStartDate(today.toISOString().split('T')[0]);
  }, []);

  const generateReport = async () => {
    if (!agentId) return;

    setLoading(true);
    try {
      let dateStart = startDate;
      let dateEnd = endDate;

      if (reportType === 'daily') {
        const today = new Date().toISOString().split('T')[0];
        dateStart = today;
        dateEnd = today;
      } else if (reportType === 'weekly') {
        const today = new Date();
        const weekAgo = new Date(today);
        weekAgo.setDate(today.getDate() - 7);
        dateStart = weekAgo.toISOString().split('T')[0];
        dateEnd = today.toISOString().split('T')[0];
      } else if (reportType === 'monthly') {
        const today = new Date();
        const monthAgo = new Date(today);
        monthAgo.setMonth(today.getMonth() - 1);
        dateStart = monthAgo.toISOString().split('T')[0];
        dateEnd = today.toISOString().split('T')[0];
      }

      const [presencesRes, collectesRes, recouvrementsRes, visitesRes, depensesRes] = await Promise.all([
        fetch(`/api/agent-presences?agent_id=${agentId}&date_debut=${dateStart}&date_fin=${dateEnd}`),
        fetch(`/api/agent-collectes-cash?agent_id=${agentId}&date_debut=${dateStart}&date_fin=${dateEnd}`),
        fetch(`/api/agent-recouvrements?agent_id=${agentId}`),
        requestAllPages(`/visites-terrain`, { agent_id: agentId, date_debut: dateStart, date_fin: dateEnd }),
        fetch(`/api/agent-depenses?agent_id=${agentId}&date_debut=${dateStart}&date_fin=${dateEnd}`)
      ]);

      setReportData({
        presences: presencesRes.ok ? await presencesRes.json() : [],
        collectes: collectesRes.ok ? await collectesRes.json() : [],
        recouvrements: recouvrementsRes.ok ? await recouvrementsRes.json() : [],
        visites: Array.isArray(visitesRes) ? visitesRes : [],
        depenses: depensesRes.ok ? await depensesRes.json() : []
      });
    } catch (error) {
      console.error('Erreur génération rapport:', error);
      alert('Erreur lors de la génération du rapport');
    } finally {
      setLoading(false);
    }
  };

  const downloadReport = () => {
    if (!reportData) return;

    const reportContent = generateReportContent();
    const blob = new Blob([reportContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rapport_agent_${reportType}_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const generateReportContent = () => {
    if (!reportData) return '';

    const lines = [];
    lines.push('═══════════════════════════════════════════════════');
    lines.push('       RAPPORT D\'ACTIVITÉ AGENT DE TERRAIN       ');
    lines.push('═══════════════════════════════════════════════════');
    lines.push('');
    lines.push(`Période: ${reportType.toUpperCase()}`);
    lines.push(`Date de génération: ${new Date().toLocaleString('fr-FR')}`);
    lines.push(`Du: ${startDate} au ${endDate}`);
    lines.push('');
    lines.push('───────────────────────────────────────────────────');
    lines.push('  1. PRÉSENCE ET PONCTUALITÉ');
    lines.push('───────────────────────────────────────────────────');
    lines.push(`Jours travaillés: ${reportData.presences.length}`);
    lines.push(`Heures totales: ${reportData.presences.reduce((sum, p) => sum + (Number(p.heures_travaillees) || 0), 0).toFixed(1)}h`);
    lines.push(`Moyenne/jour: ${reportData.presences.length > 0 ? (reportData.presences.reduce((sum, p) => sum + (Number(p.heures_travaillees) || 0), 0) / reportData.presences.length).toFixed(1) : 0}h`);
    lines.push('');
    lines.push('───────────────────────────────────────────────────');
    lines.push('  2. COLLECTES CASH');
    lines.push('───────────────────────────────────────────────────');
    lines.push(`Nombre de collectes: ${reportData.collectes.length}`);
    lines.push(`Montant total: ${reportData.collectes.reduce((sum, c) => sum + c.montant, 0).toLocaleString()} FCFA`);
    lines.push(`Montant moyen: ${reportData.collectes.length > 0 ? (reportData.collectes.reduce((sum, c) => sum + c.montant, 0) / reportData.collectes.length).toLocaleString() : 0} FCFA`);
    lines.push(`Collectes vérifiées: ${reportData.collectes.filter(c => c.statut_verification === 'Vérifiée').length}`);
    lines.push('');
    lines.push('Détail des collectes:');
    reportData.collectes.forEach((c, i) => {
      lines.push(`  ${i + 1}. ${c.clients?.nom || 'N/A'} - ${c.montant.toLocaleString()} FCFA - ${c.type_paiement}`);
    });
    lines.push('');
    lines.push('───────────────────────────────────────────────────');
    lines.push('  3. RECOUVREMENT');
    lines.push('───────────────────────────────────────────────────');
    const totalDu = reportData.recouvrements.reduce((sum, r) => sum + r.montant_du, 0);
    const totalRecouvre = reportData.recouvrements.reduce((sum, r) => sum + r.montant_recouvre, 0);
    lines.push(`Dossiers actifs: ${reportData.recouvrements.length}`);
    lines.push(`Montant total dû: ${totalDu.toLocaleString()} FCFA`);
    lines.push(`Montant recouvré: ${totalRecouvre.toLocaleString()} FCFA`);
    lines.push(`Taux de recouvrement: ${totalDu > 0 ? ((totalRecouvre / totalDu) * 100).toFixed(1) : 0}%`);
    lines.push('');
    lines.push('───────────────────────────────────────────────────');
    lines.push('  4. VISITES TERRAIN');
    lines.push('───────────────────────────────────────────────────');
    lines.push(`Nombre de visites: ${reportData.visites.length}`);
    lines.push(`Visites effectuées: ${reportData.visites.filter(v => v.statut === StatutVisiteTerrain.COMPLETED).length}`);
    lines.push(`Visites en cours: ${reportData.visites.filter(v => v.statut === StatutVisiteTerrain.IN_PROGRESS).length}`);
    lines.push('');
    lines.push('───────────────────────────────────────────────────');
    lines.push('  5. DÉPENSES DE TERRAIN');
    lines.push('───────────────────────────────────────────────────');
    lines.push(`Nombre de dépenses: ${reportData.depenses.length}`);
    lines.push(`Montant total: ${reportData.depenses.reduce((sum, d) => sum + d.montant, 0).toLocaleString()} FCFA`);
    lines.push(`Dépenses validées: ${reportData.depenses.filter(d => d.statut_validation === StatutValidationDepense.VALIDATED).length}`);
    lines.push('');
    lines.push('═══════════════════════════════════════════════════');
    lines.push('               FIN DU RAPPORT');
    lines.push('═══════════════════════════════════════════════════');

    return lines.join('\n');
  };

  const calculateStats = () => {
    if (!reportData) return null;

    return {
      totalHeures: reportData.presences.reduce((sum, p) => sum + (Number(p.heures_travaillees) || 0), 0),
      totalCollectes: reportData.collectes.reduce((sum, c) => sum + c.montant, 0),
      nombreCollectes: reportData.collectes.length,
      totalRecouvre: reportData.recouvrements.reduce((sum, r) => sum + r.montant_recouvre, 0),
      nombreVisites: reportData.visites.length,
      totalDepenses: reportData.depenses.reduce((sum, d) => sum + d.montant, 0)
    };
  };

  const stats = calculateStats();

  return (
    <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
      {/* Header Compact */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white">Générateur de Rapports</h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">Créez des rapports détaillés de votre activité</p>
        </div>
        {reportData && (
          <button
            onClick={downloadReport}
            className="flex items-center justify-center gap-2 px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 font-medium text-sm transition-colors w-full sm:w-auto"
          >
            <Download size={16} />
            Télécharger
          </button>
        )}
      </div>

      {/* Configuration Section - Compact */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700/50 p-3 sm:p-4">
        <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2">
            <Filter size={16} className="text-cyan-500" />
            Configuration du Rapport
        </h3>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-4">
          {(['daily', 'weekly', 'monthly', 'custom'] as const).map(type => (
            <button
              key={type}
              onClick={() => setReportType(type)}
              className={`p-2.5 rounded-lg border transition-all text-left group relative overflow-hidden ${
                reportType === type
                  ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20 ring-1 ring-cyan-500/20'
                  : 'border-slate-200 dark:border-slate-700 hover:border-cyan-400 dark:hover:border-cyan-500/50'
              }`}
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                    <Calendar size={14} className={reportType === type ? 'text-cyan-600' : 'text-slate-400 group-hover:text-cyan-500'} />
                    <span className={`text-xs font-semibold ${reportType === type ? 'text-cyan-700 dark:text-cyan-400' : 'text-slate-700 dark:text-slate-300'}`}>
                    {type === 'daily' ? 'Quotidien' : type === 'weekly' ? 'Hebdo' : type === 'monthly' ? 'Mensuel' : 'Perso'}
                    </span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 pl-5">
                    {type === 'daily' ? "Aujourd'hui" : type === 'weekly' ? "7 derniers jours" : type === 'monthly' ? "30 derniers jours" : "Au choix"}
                </p>
              </div>
            </button>
          ))}
        </div>

        {reportType === 'custom' && (
          <div className="grid grid-cols-2 gap-3 mb-4 animate-in slide-in-from-top-2 duration-200">
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1">Début</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-2 py-1.5 rounded text-xs border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1">Fin</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-2 py-1.5 rounded text-xs border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>
          </div>
        )}

        <button
          onClick={generateReport}
          disabled={loading}
          className="w-full sm:w-auto px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-500 font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm shadow-cyan-900/10 active:scale-[0.98]"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
              <span>Génération...</span>
            </>
          ) : (
            <>
              <FileText size={16} />
              <span>Générer le Rapport</span>
            </>
          )}
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          <StatCard icon={Clock} label="Heures" value={`${stats.totalHeures.toFixed(1)}h`} color="blue" />
          <StatCard icon={Banknote} label="Collectes" value={stats.nombreCollectes} color="green" />
          <StatCard icon={TrendingUp} label="Montant" value={`${(stats.totalCollectes / 1000).toFixed(0)}K`} color="cyan" />
          <StatCard icon={CheckCircle} label="Recouvré" value={`${(stats.totalRecouvre / 1000).toFixed(0)}K`} color="emerald" />
          <StatCard icon={Users} label="Visites" value={stats.nombreVisites} color="purple" />
          <StatCard icon={AlertCircle} label="Dépenses" value={`${(stats.totalDepenses / 1000).toFixed(0)}K`} color="indigo" />
        </div>
      )}

      {reportData && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700/50 p-3 sm:p-4">
          <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-2 flex items-center gap-2">
            <FileText size={16} className="text-slate-400" />
            Aperçu
          </h3>
          <div className="bg-slate-50 dark:bg-slate-950 rounded border border-slate-100 dark:border-slate-800 p-3 overflow-x-auto max-h-[400px] scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700">
            <pre className="whitespace-pre-wrap text-[10px] sm:text-xs font-mono text-slate-700 dark:text-slate-300 leading-relaxed">
              {generateReportContent()}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any, label: string, value: string | number, color: string }) {
    const colorClasses: Record<string, string> = {
        blue: 'text-blue-500 bg-blue-500/10',
        green: 'text-green-500 bg-green-500/10',
        cyan: 'text-cyan-500 bg-cyan-500/10',
        emerald: 'text-emerald-500 bg-emerald-500/10',
        purple: 'text-purple-500 bg-purple-500/10',
        indigo: 'text-indigo-500 bg-indigo-500/10',
    };

    return (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700/50 p-2.5 sm:p-3 flex flex-col gap-1 shadow-sm">
            <div className="flex items-center gap-1.5">
                <div className={`p-1 rounded ${colorClasses[color]}`}>
                    <Icon size={12} />
                </div>
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</span>
            </div>
            <div className="text-lg font-bold text-slate-800 dark:text-white pl-0.5">{value}</div>
        </div>
    );
}
