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
    { key: 'dashboard', label: 'Tableau de Bord', icon: BarChart3, color: 'from-status-info to-status-success' },
    { key: 'logs', label: 'Journal d\'Audit', icon: Shield, color: 'from-status-success to-accent' },
    { key: 'transactions', label: 'Transactions', icon: TrendingUp, color: 'from-status-success to-status-success' },
    { key: 'activity', label: 'Activité', icon: Activity, color: 'from-accent to-status-info' },
    { key: 'changes', label: 'Modifications', icon: Database, color: 'from-status-success to-status-info' },
    { key: 'alerts', label: 'Alertes Sécurité', icon: AlertTriangle, color: 'from-status-info to-accent' },
    { key: 'compliance', label: 'Compliance', icon: FileText, color: 'from-status-info to-accent' }
  ];

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-surface to-surface-base rounded-2xl p-6 border border-edge">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold text-content-primary mb-2">Module d'Audit & Logs</h1>
            <p className="text-content-muted">Suivi et traçabilité complète du système</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm text-content-muted">Logs Actifs</div>
              <div className="text-2xl font-bold text-status-success">6 Tables</div>
            </div>
            <Shield className="w-16 h-16 text-status-success" />
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
                    : 'bg-surface-elevated text-content-secondary hover:bg-surface-subtle'
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
        <div className="bg-gradient-to-br from-status-info to-accent rounded-xl p-6 text-white">
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

        <div className="bg-gradient-to-br from-status-success to-status-success rounded-xl p-6 text-white">
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

        <div className="bg-gradient-to-br from-status-success to-accent rounded-xl p-6 text-white">
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
