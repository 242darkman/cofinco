import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Users, Award, Loader2, RefreshCw, Calendar } from 'lucide-react';
import { supervisionApi } from '../../lib/api-client';

interface AgentPerformance {
  agentId: string;
  agentNom: string;
  totalProspects: number;
  converted: number;
  conversionRate: number;
  interested: number;
  refused: number;
  toFollowUp: number;
}

export default function ProspectionSupervisionPanel() {
  const [data, setData] = useState<AgentPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await supervisionApi.getProspectionPerformance({ period });
      // Normalize response (could be { agents: [...] } or direct array)
      const agents = Array.isArray(result) ? result : (result.agents || result.data || []);
      setData(agents.map((a: any) => ({
        agentId: a.agent_id || a.agentId,
        agentNom: a.agent_nom || a.agentNom || 'Inconnu',
        totalProspects: Number(a.total_prospects || a.totalProspects || 0),
        converted: Number(a.converted || a.convertedToClient || 0),
        conversionRate: Number(a.conversion_rate || a.conversionRate || 0),
        interested: Number(a.interested || 0),
        refused: Number(a.refused || 0),
        toFollowUp: Number(a.to_follow_up || a.toFollowUp || 0),
      })));
    } catch {
      // Silently handle - empty data shown
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [period]);

  const maxProspects = Math.max(...data.map(d => d.totalProspects), 1);
  const totalConverted = data.reduce((s, d) => s + d.converted, 0);
  const totalProspects = data.reduce((s, d) => s + d.totalProspects, 0);
  const avgConversion = totalProspects > 0 ? ((totalConverted / totalProspects) * 100).toFixed(1) : '0';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 size={20} className="text-cyan-400" />
          <h2 className="text-lg font-bold text-white">Supervision Prospection</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg">
            <Calendar size={14} className="text-slate-400" />
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="bg-transparent text-sm text-white focus:outline-none"
            />
          </div>
          <button onClick={loadData} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 bg-slate-800/80 border border-slate-700 rounded-xl">
          <div className="flex items-center gap-1.5 text-slate-400 mb-1">
            <Users size={14} />
            <span className="text-[10px] font-medium uppercase">Total Prospects</span>
          </div>
          <p className="text-xl font-bold text-white">{totalProspects}</p>
        </div>
        <div className="p-3 bg-slate-800/80 border border-slate-700 rounded-xl">
          <div className="flex items-center gap-1.5 text-slate-400 mb-1">
            <Award size={14} />
            <span className="text-[10px] font-medium uppercase">Convertis</span>
          </div>
          <p className="text-xl font-bold text-purple-400">{totalConverted}</p>
        </div>
        <div className="p-3 bg-slate-800/80 border border-slate-700 rounded-xl">
          <div className="flex items-center gap-1.5 text-slate-400 mb-1">
            <TrendingUp size={14} />
            <span className="text-[10px] font-medium uppercase">Taux Conversion</span>
          </div>
          <p className="text-xl font-bold text-cyan-400">{avgConversion}%</p>
        </div>
      </div>

      {/* Agent Performance Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-cyan-400" />
        </div>
      ) : data.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <p className="text-sm">Aucune donn\u00e9e pour cette p\u00e9riode</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data
            .sort((a, b) => b.totalProspects - a.totalProspects)
            .map((agent, idx) => (
            <div key={agent.agentId} className="p-3 bg-slate-800/80 border border-slate-700 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-700 text-[10px] font-bold text-slate-300">
                    {idx + 1}
                  </span>
                  <span className="text-sm font-medium text-white">{agent.agentNom}</span>
                </div>
                <span className="text-xs font-medium text-cyan-400">{agent.conversionRate.toFixed(1)}%</span>
              </div>

              {/* Progress bar */}
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all"
                  style={{ width: `${(agent.totalProspects / maxProspects) * 100}%` }}
                />
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-3 text-[10px]">
                <span className="text-blue-400">{agent.totalProspects} prospects</span>
                <span className="text-emerald-400">{agent.interested} int\u00e9ress\u00e9s</span>
                <span className="text-purple-400">{agent.converted} convertis</span>
                <span className="text-amber-400">{agent.toFollowUp} \u00e0 suivre</span>
                <span className="text-red-400">{agent.refused} refus\u00e9s</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
