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
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Générateur de Rapports</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1">Créez des rapports détaillés de votre activité</p>
        </div>
        {reportData && (
          <button
            onClick={downloadReport}
            className="flex items-center gap-2 px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 font-semibold transition-colors"
          >
            <Download size={20} />
            Télécharger
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4">Configuration du Rapport</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {(['daily', 'weekly', 'monthly', 'custom'] as const).map(type => (
            <button
              key={type}
              onClick={() => setReportType(type)}
              className={`p-4 rounded-lg border-2 transition-all ${
                reportType === type
                  ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20'
                  : 'border-slate-300 dark:border-slate-600 hover:border-cyan-400'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Calendar size={20} className={reportType === type ? 'text-cyan-600' : 'text-slate-400'} />
                <span className={`font-semibold ${reportType === type ? 'text-cyan-600' : 'text-slate-700 dark:text-slate-300'}`}>
                  {type === 'daily' ? 'Quotidien' : type === 'weekly' ? 'Hebdomadaire' : type === 'monthly' ? 'Mensuel' : 'Personnalisé'}
                </span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {type === 'daily' ? "Rapport du jour" : type === 'weekly' ? "7 derniers jours" : type === 'monthly' ? "30 derniers jours" : "Choisir dates"}
              </p>
            </button>
          ))}
        </div>

        {reportType === 'custom' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Date de début</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Date de fin</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white"
              />
            </div>
          </div>
        )}

        <button
          onClick={generateReport}
          disabled={loading}
          className="w-full px-6 py-3 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              Génération en cours...
            </>
          ) : (
            <>
              <FileText size={20} />
              Générer le Rapport
            </>
          )}
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="text-blue-500" size={20} />
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Heures</span>
            </div>
            <div className="text-2xl font-bold text-slate-800 dark:text-white">{stats.totalHeures.toFixed(1)}h</div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-2 mb-2">
              <Banknote className="text-green-500" size={20} />
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Collectes</span>
            </div>
            <div className="text-2xl font-bold text-slate-800 dark:text-white">{stats.nombreCollectes}</div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="text-cyan-500" size={20} />
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Montant</span>
            </div>
            <div className="text-xl font-bold text-slate-800 dark:text-white">{(stats.totalCollectes / 1000).toFixed(0)}K</div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="text-emerald-500" size={20} />
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Recouvré</span>
            </div>
            <div className="text-xl font-bold text-slate-800 dark:text-white">{(stats.totalRecouvre / 1000).toFixed(0)}K</div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="text-emerald-500" size={20} />
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Visites</span>
            </div>
            <div className="text-2xl font-bold text-slate-800 dark:text-white">{stats.nombreVisites}</div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="text-blue-500" size={20} />
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Dépenses</span>
            </div>
            <div className="text-xl font-bold text-slate-800 dark:text-white">{(stats.totalDepenses / 1000).toFixed(0)}K</div>
          </div>
        </div>
      )}

      {reportData && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4">Aperçu du Rapport</h3>
          <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-6 font-mono text-sm">
            <pre className="whitespace-pre-wrap text-slate-700 dark:text-slate-300">
              {generateReportContent()}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
