import React, { useState } from 'react';
import { Shield, Activity, Database, TrendingUp, BarChart3, AlertTriangle, FileText } from 'lucide-react';
import AuditLogs from './AuditLogs';
import TransactionAudit from './TransactionAudit';
import UserActivityMonitor from '../../shared/UserActivityMonitor';
import DataChangesViewer from '../../shared/DataChangesViewer';
import SecurityAlertsPanel from '../../security/SecurityAlertsPanel';
import AuditDashboard from './AuditDashboard';
import ComplianceReports from '../../shared/ComplianceReports';

type TabKey = 'dashboard' | 'logs' | 'transactions' | 'activity' | 'changes' | 'alerts' | 'compliance';

export default function AuditModule() {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');

  const tabs = [
    { key: 'dashboard', label: 'Tableau de Bord', icon: BarChart3, color: 'from-blue-500 to-emerald-500' },
    { key: 'logs', label: 'Journal d\'Audit', icon: Shield, color: 'from-emerald-500 to-cyan-500' },
    { key: 'transactions', label: 'Transactions', icon: TrendingUp, color: 'from-green-500 to-emerald-500' },
    { key: 'activity', label: 'Activité', icon: Activity, color: 'from-cyan-500 to-blue-500' },
    { key: 'changes', label: 'Modifications', icon: Database, color: 'from-emerald-500 to-blue-500' },
    { key: 'alerts', label: 'Alertes Sécurité', icon: AlertTriangle, color: 'from-blue-500 to-cyan-500' },
    { key: 'compliance', label: 'Compliance', icon: FileText, color: 'from-blue-600 to-cyan-600' }
  ];

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 border border-slate-700">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Module d'Audit & Logs</h1>
            <p className="text-slate-400">Suivi et traçabilité complète du système</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm text-slate-400">Logs Actifs</div>
              <div className="text-2xl font-bold text-green-400">6 Tables</div>
            </div>
            <Shield className="w-16 h-16 text-emerald-500" />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as TabKey)}
                className={`
                  px-3 py-2 rounded-xl font-medium transition-all flex items-center gap-1.5 text-sm
                  ${isActive
                    ? `bg-gradient-to-r ${tab.color} text-white shadow-lg`
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        {activeTab === 'dashboard' && <AuditDashboard />}
        {activeTab === 'logs' && <AuditLogs />}
        {activeTab === 'transactions' && <TransactionAudit />}
        {activeTab === 'activity' && <UserActivityMonitor />}
        {activeTab === 'changes' && <DataChangesViewer />}
        {activeTab === 'alerts' && <SecurityAlertsPanel />}
        {activeTab === 'compliance' && <ComplianceReports />}
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm opacity-90 mb-1">Sécurité</div>
              <div className="text-3xl font-bold">100%</div>
            </div>
            <Shield size={48} className="opacity-30" />
          </div>
          <div className="text-sm opacity-90">
            RLS activé sur toutes les tables d'audit
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm opacity-90 mb-1">Performance</div>
              <div className="text-3xl font-bold">Optimale</div>
            </div>
            <TrendingUp size={48} className="opacity-30" />
          </div>
          <div className="text-sm opacity-90">
            Indexes sur toutes les colonnes clés
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm opacity-90 mb-1">Rétention</div>
              <div className="text-3xl font-bold">365j</div>
            </div>
            <Database size={48} className="opacity-30" />
          </div>
          <div className="text-sm opacity-90">
            Archivage automatique des anciens logs
          </div>
        </div>
      </div>
    </div>
  );
}
