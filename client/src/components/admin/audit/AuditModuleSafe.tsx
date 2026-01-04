import React, { useState } from 'react';
import { Shield, Activity, Database, TrendingUp, BarChart3, AlertTriangle, FileText } from 'lucide-react';

const AuditLogs = React.lazy(() => import('./AuditLogs'));
const TransactionAudit = React.lazy(() => import('./TransactionAudit'));
const UserActivityMonitor = React.lazy(() => import('../../shared/UserActivityMonitor'));
const DataChangesViewer = React.lazy(() => import('../../shared/DataChangesViewer'));
const SecurityAlertsPanel = React.lazy(() => import('../../security/SecurityAlertsPanel'));
const AuditDashboard = React.lazy(() => import('./AuditDashboard'));
const ComplianceReports = React.lazy(() => import('../../shared/ComplianceReports'));

type TabKey = 'dashboard' | 'logs' | 'transactions' | 'activity' | 'changes' | 'alerts' | 'compliance';

const ErrorFallback = ({ error }: { error: Error }) => (
  <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-6">
    <div className="flex items-center gap-3 mb-4">
      <AlertTriangle className="text-blue-400" size={24} />
      <h3 className="text-xl font-bold text-blue-400">Erreur de Chargement</h3>
    </div>
    <p className="text-slate-300 mb-2">{error.message}</p>
    <button
      onClick={() => window.location.reload()}
      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
    >
      Recharger la page
    </button>
  </div>
);

const LoadingFallback = () => (
  <div className="bg-slate-800 rounded-2xl p-12 text-center">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
    <p className="text-slate-400">Chargement du module...</p>
  </div>
);

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return <ErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}

export default function AuditModuleSafe() {
  const [activeTab, setActiveTab] = useState<TabKey>('logs');

  const tabs = [
    { key: 'dashboard', label: 'Tableau de Bord', icon: BarChart3, color: 'from-blue-500 to-emerald-500' },
    { key: 'logs', label: 'Journal d\'Audit', icon: Shield, color: 'from-emerald-500 to-cyan-500' },
    { key: 'transactions', label: 'Transactions', icon: TrendingUp, color: 'from-green-500 to-emerald-500' },
    { key: 'activity', label: 'Activité', icon: Activity, color: 'from-cyan-500 to-blue-500' },
    { key: 'changes', label: 'Modifications', icon: Database, color: 'from-emerald-500 to-blue-500' },
    { key: 'alerts', label: 'Alertes Sécurité', icon: AlertTriangle, color: 'from-blue-500 to-cyan-500' },
    { key: 'compliance', label: 'Compliance', icon: FileText, color: 'from-blue-600 to-cyan-600' }
  ];

  const renderTab = () => {
    try {
      return (
        <ErrorBoundary>
          <React.Suspense fallback={<LoadingFallback />}>
            {activeTab === 'dashboard' && <AuditDashboard />}
            {activeTab === 'logs' && <AuditLogs />}
            {activeTab === 'transactions' && <TransactionAudit />}
            {activeTab === 'activity' && <UserActivityMonitor />}
            {activeTab === 'changes' && <DataChangesViewer />}
            {activeTab === 'alerts' && <SecurityAlertsPanel />}
            {activeTab === 'compliance' && <ComplianceReports />}
          </React.Suspense>
        </ErrorBoundary>
      );
    } catch (error) {
      console.error('Erreur rendu tab:', error);
      return <ErrorFallback error={error as Error} />;
    }
  };

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
              <div className="text-sm text-slate-400">Système Actif</div>
              <div className="text-2xl font-bold text-green-400">
                <span className="inline-block w-3 h-3 bg-green-400 rounded-full animate-pulse mr-2"></span>
                En ligne
              </div>
            </div>
            <Shield className="w-16 h-16 text-emerald-500" />
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as TabKey)}
                className={`
                  px-6 py-3 rounded-xl font-semibold transition-all flex items-center gap-2 whitespace-nowrap
                  ${isActive
                    ? `bg-gradient-to-r ${tab.color} text-white shadow-lg scale-105`
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

      {renderTab()}

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
