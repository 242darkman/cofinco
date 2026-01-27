import React, { useState, useEffect, useCallback } from 'react';
import {
  Mail, MessageSquare, AlertTriangle, CheckCircle, Clock, XCircle,
  RefreshCw, BarChart3, Send, Inbox, Loader2, ChevronDown, ChevronUp,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface NotificationMetrics {
  total: number;
  queued: number;
  processing: number;
  sent: number;
  failed: number;
  deadLetter: number;
  byChannel: {
    sms: { sent: number; failed: number };
    email: { sent: number; failed: number };
  };
  todaySent: number;
  todayFailed: number;
}

interface NotificationJob {
  id: string;
  channel: string;
  templateCode: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  correlationId: string;
  createdAt: string;
  processedAt: string | null;
}

interface NotificationSettings {
  id?: string;
  smsEnabled?: boolean;
  emailEnabled?: boolean;
  pushEnabled?: boolean;
  fallbackPolicy?: string;
  otpChannel?: string;
  otpMaxPerMinute?: number;
  otpMaxPerDay?: number;
  smsQuotaDaily?: number;
  emailQuotaDaily?: number;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function AdminNotificationsMonitor() {
  const [metrics, setMetrics] = useState<NotificationMetrics | null>(null);
  const [jobs, setJobs] = useState<NotificationJob[]>([]);
  const [failedJobs, setFailedJobs] = useState<NotificationJob[]>([]);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [metricsRes, jobsRes, failedRes, settingsRes] = await Promise.all([
        fetch('/api/notifications/admin/metrics', { credentials: 'include' }),
        fetch(`/api/notifications/admin/outbox?limit=30${statusFilter ? `&status=${statusFilter}` : ''}`, { credentials: 'include' }),
        fetch('/api/notifications/admin/failed?limit=10', { credentials: 'include' }),
        fetch('/api/notifications/admin/settings', { credentials: 'include' }),
      ]);

      if (metricsRes.ok) setMetrics(await metricsRes.json());
      if (jobsRes.ok) {
        const data = await jobsRes.json();
        setJobs(Array.isArray(data) ? data : []);
      }
      if (failedRes.ok) {
        const data = await failedRes.json();
        setFailedJobs(Array.isArray(data) ? data : []);
      }
      if (settingsRes.ok) setSettings(await settingsRes.json());
    } catch (error) {
      console.error('Error fetching notification data:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000); // Refresh every 15s
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleRetryDeadLetter = async () => {
    setRetrying(true);
    try {
      const res = await fetch('/api/notifications/admin/retry-dead-letter', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        alert(`${data.retriedCount} job(s) remis en file d'attente.`);
        fetchData();
      }
    } catch (error) {
      console.error('Error retrying dead-letter:', error);
    } finally {
      setRetrying(false);
    }
  };

  const handleRetryJob = async (jobId: string) => {
    setRetryingJobId(jobId);
    try {
      const res = await fetch(`/api/notifications/admin/retry-job/${jobId}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error('Error retrying job:', error);
    } finally {
      setRetryingJobId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
        <span className="ml-2 text-sm text-slate-400">Chargement...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 overflow-y-auto max-h-[calc(100vh-12rem)]">
      {/* Metrics Cards */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard
            label="Total"
            value={metrics.total}
            icon={<Inbox className="w-4 h-4" />}
            color="slate"
          />
          <MetricCard
            label="En file"
            value={metrics.queued}
            icon={<Clock className="w-4 h-4" />}
            color="yellow"
          />
          <MetricCard
            label="En cours"
            value={metrics.processing}
            icon={<Loader2 className="w-4 h-4 animate-spin" />}
            color="blue"
          />
          <MetricCard
            label="Envoyés"
            value={metrics.sent}
            icon={<CheckCircle className="w-4 h-4" />}
            color="green"
          />
          <MetricCard
            label="Échoués"
            value={metrics.failed}
            icon={<XCircle className="w-4 h-4" />}
            color="red"
          />
          <MetricCard
            label="Dead Letter"
            value={metrics.deadLetter}
            icon={<AlertTriangle className="w-4 h-4" />}
            color="orange"
            action={
              metrics.deadLetter > 0 ? (
                <button
                  onClick={handleRetryDeadLetter}
                  disabled={retrying}
                  className="text-xs text-orange-400 hover:text-orange-300 underline mt-1"
                >
                  {retrying ? 'Relance...' : 'Relancer'}
                </button>
              ) : undefined
            }
          />
        </div>
      )}

      {/* Today's Stats + Channel Breakdown */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-3">
            <h3 className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" /> Aujourd'hui
            </h3>
            <div className="flex items-center gap-6">
              <div>
                <span className="text-xl font-bold text-green-400">{metrics.todaySent}</span>
                <span className="text-xs text-slate-500 ml-1">envoyés</span>
              </div>
              <div>
                <span className="text-xl font-bold text-red-400">{metrics.todayFailed}</span>
                <span className="text-xs text-slate-500 ml-1">échoués</span>
              </div>
              {metrics.todaySent + metrics.todayFailed > 0 && (
                <div className="text-xs text-slate-500">
                  Taux: {((metrics.todaySent / (metrics.todaySent + metrics.todayFailed)) * 100).toFixed(1)}%
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-3">
            <h3 className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5" /> Par canal
            </h3>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-sm text-slate-300">SMS</span>
                <span className="text-xs text-green-400">{metrics.byChannel.sms.sent}</span>
                <span className="text-xs text-slate-600">/</span>
                <span className="text-xs text-red-400">{metrics.byChannel.sms.failed}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-sm text-slate-300">Email</span>
                <span className="text-xs text-green-400">{metrics.byChannel.email.sent}</span>
                <span className="text-xs text-slate-600">/</span>
                <span className="text-xs text-red-400">{metrics.byChannel.email.failed}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Toggle */}
      <div className="bg-slate-800/50 rounded-lg border border-slate-700/50">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="w-full flex items-center justify-between p-3 text-sm text-slate-300 hover:bg-slate-700/30"
        >
          <span className="font-medium">Configuration globale</span>
          {showSettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showSettings && settings && (
          <div className="px-3 pb-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <SettingBadge label="SMS" enabled={settings.smsEnabled} />
            <SettingBadge label="Email" enabled={settings.emailEnabled} />
            <SettingBadge label="Push" enabled={settings.pushEnabled} />
            <div className="text-slate-400">
              Politique: <span className="text-slate-300">{settings.fallbackPolicy || 'SMS_ONLY'}</span>
            </div>
            <div className="text-slate-400">
              OTP canal: <span className="text-slate-300">{settings.otpChannel || 'SMS'}</span>
            </div>
            <div className="text-slate-400">
              OTP/min: <span className="text-slate-300">{settings.otpMaxPerMinute ?? 3}</span>
            </div>
            <div className="text-slate-400">
              Quota SMS/jour: <span className="text-slate-300">{settings.smsQuotaDaily ?? 1000}</span>
            </div>
            <div className="text-slate-400">
              Quota Email/jour: <span className="text-slate-300">{settings.emailQuotaDaily ?? 500}</span>
            </div>
          </div>
        )}
      </div>

      {/* Jobs Table */}
      <div className="bg-slate-800/50 rounded-lg border border-slate-700/50">
        <div className="flex items-center justify-between p-3 border-b border-slate-700/50">
          <h3 className="text-sm font-medium text-slate-300">File d'attente</h3>
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs bg-slate-900 border border-slate-700 text-slate-300 rounded px-2 py-1"
            >
              <option value="">Tous</option>
              <option value="QUEUED">En file</option>
              <option value="PROCESSING">En cours</option>
              <option value="SENT">Envoyés</option>
              <option value="FAILED">Échoués</option>
              <option value="DEAD_LETTER">Dead Letter</option>
            </select>
            <button
              onClick={fetchData}
              className="p-1 text-slate-400 hover:text-slate-300"
              title="Rafraîchir"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-700/50">
                <th className="text-left p-2 font-medium">Canal</th>
                <th className="text-left p-2 font-medium">Template</th>
                <th className="text-left p-2 font-medium">Statut</th>
                <th className="text-left p-2 font-medium">Tentatives</th>
                <th className="text-left p-2 font-medium">Erreur</th>
                <th className="text-left p-2 font-medium">Date</th>
                <th className="text-left p-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-slate-500 py-6">
                    Aucun job trouvé
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr key={job.id} className="border-b border-slate-800/50 hover:bg-slate-700/20">
                    <td className="p-2">
                      <span className={`inline-flex items-center gap-1 ${
                        job.channel === 'SMS' ? 'text-blue-400' : 'text-purple-400'
                      }`}>
                        {job.channel === 'SMS' ? <MessageSquare className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
                        {job.channel}
                      </span>
                    </td>
                    <td className="p-2 text-slate-300 font-mono">{formatTemplateCode(job.templateCode)}</td>
                    <td className="p-2">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="p-2 text-slate-400">{job.attempts}/{job.maxAttempts}</td>
                    <td className="p-2 text-red-400/70 max-w-48 truncate" title={job.lastError || ''}>
                      {job.lastError || '-'}
                    </td>
                    <td className="p-2 text-slate-500">
                      {new Date(job.createdAt).toLocaleString('fr-FR', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                      })}
                    </td>
                    <td className="p-2">
                      {(job.status === 'DEAD_LETTER' || job.status === 'FAILED') && (
                        <button
                          onClick={() => handleRetryJob(job.id)}
                          disabled={retryingJobId === job.id}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-orange-900/30 text-orange-400 hover:bg-orange-900/50 hover:text-orange-300 disabled:opacity-50 transition-colors"
                          title="Rejouer ce job"
                        >
                          <RefreshCw className={`w-3 h-3 ${retryingJobId === job.id ? 'animate-spin' : ''}`} />
                          {retryingJobId === job.id ? 'Relance...' : 'Rejouer'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Failed Jobs Detail */}
      {failedJobs.length > 0 && (
        <div className="bg-slate-800/50 rounded-lg border border-red-900/30">
          <div className="flex items-center gap-2 p-3 border-b border-red-900/30">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <h3 className="text-sm font-medium text-red-300">Jobs en erreur ({failedJobs.length})</h3>
          </div>
          <div className="divide-y divide-slate-800/50">
            {failedJobs.map((job) => (
              <div key={job.id} className="p-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">
                    {job.channel} / {formatTemplateCode(job.templateCode)}
                  </span>
                  <StatusBadge status={job.status} />
                </div>
                {job.lastError && (
                  <p className="text-red-400/70 mt-1 line-clamp-2">{job.lastError}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function MetricCard({
  label,
  value,
  icon,
  color,
  action,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  action?: React.ReactNode;
}) {
  const colorMap: Record<string, string> = {
    slate: 'text-slate-400 bg-slate-800/50 border-slate-700/50',
    yellow: 'text-yellow-400 bg-yellow-900/20 border-yellow-800/30',
    blue: 'text-blue-400 bg-blue-900/20 border-blue-800/30',
    green: 'text-green-400 bg-green-900/20 border-green-800/30',
    red: 'text-red-400 bg-red-900/20 border-red-800/30',
    orange: 'text-orange-400 bg-orange-900/20 border-orange-800/30',
  };

  return (
    <div className={`rounded-lg border p-3 ${colorMap[color] || colorMap.slate}`}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-xl font-bold">{value}</p>
      {action}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    QUEUED: { bg: 'bg-yellow-900/30', text: 'text-yellow-400', label: 'EN FILE' },
    PROCESSING: { bg: 'bg-blue-900/30', text: 'text-blue-400', label: 'EN COURS' },
    SENT: { bg: 'bg-green-900/30', text: 'text-green-400', label: 'ENVOYÉ' },
    FAILED: { bg: 'bg-red-900/30', text: 'text-red-400', label: 'ÉCHOUÉ' },
    DEAD_LETTER: { bg: 'bg-orange-900/30', text: 'text-orange-400', label: 'DEAD LETTER' },
  };

  const c = config[status] || { bg: 'bg-slate-800', text: 'text-slate-400', label: status };

  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}


function formatTemplateCode(code: string): string {
  const map: Record<string, string> = {
    // Credit
    'CREDIT_REQUEST_CREATED': 'Demande de crédit créée',
    'CREDIT_APPROVED': 'Crédit approuvé',
    'CREDIT_REJECTED': 'Crédit refusé',
    'CREDIT_DISBURSED': 'Crédit décaissé',
    'CREDIT_OVERDUE': 'Crédit en retard',
    'CREDIT_INVESTIGATION_ASSIGNED': 'Enquête crédit assignée',
    'CREDIT_PAID_OFF': 'Crédit remboursé',
    'CREDIT_REFUND_APPROVED': 'Remboursement approuvé',
    'CREDIT_REFUND_PAID': 'Remboursement effectué',
    // Transfer
    'TRANSFER_REQUESTED': 'Virement demandé',
    'TRANSFER_VALIDATED': 'Virement validé',
    'TRANSFER_REJECTED': 'Virement rejeté',
    'TRANSFER_EXECUTED': 'Virement exécuté',
    'SCHEDULED_TRANSFER_EXECUTED': 'Virement programmé exécuté',
    'SCHEDULED_TRANSFER_FAILED': 'Echec virement programmé',
    // HR
    'HR_LEAVE_REQUESTED': 'Congé demandé',
    'HR_LEAVE_APPROVED': 'Congé approuvé',
    'HR_LEAVE_REJECTED': 'Congé refusé',
    // Tontine
    'TONTINE_MEMBER_JOINED': 'Adhésion tontine',
    'TONTINE_CONTRIBUTION_RECEIVED': 'Cotisation reçue',
    'TONTINE_CONTRIBUTION_OVERDUE': 'Cotisation en retard',
    'TONTINE_PENALTY_APPLIED': 'Pénalité appliquée',
    'TONTINE_DISTRIBUTION_APPROVED': 'Distribution approuvée',
    'TONTINE_DISTRIBUTION_PAID': 'Distribution payée',
    'TONTINE_CYCLE_STARTED': 'Nouveau cycle tontine',
    // Accounts
    'ACCOUNT_CREATED': 'Compte créé',
    'ACCOUNT_ACTIVATED': 'Compte activé',
    'ACCOUNT_DEPOSIT': 'Dépôt effectué',
    'ACCOUNT_WITHDRAWAL': 'Retrait effectué',
    'ACCOUNT_BLOCKED': 'Compte bloqué',
    'ACCOUNT_UNBLOCKED': 'Compte débloqué',
    'ACCOUNT_CLOSED': 'Compte clôturé',
    'INTEREST_CAPITALIZED': 'Intérêts capitalisés',
    // Auth / Security
    'USER_PASSWORD_RESET': 'Réinitialisation mot de passe',
    'SESSION_FORCE_CLOSED': 'Session fermée de force',
    // Client / User
    'CLIENT_CREATED': 'Client créé',
    'USER_REGISTERED': 'Utilisateur inscrit',
    'USER_PASSWORD_CHANGED': 'Mot de passe modifié',
    'EMPLOYEE_CREATED': 'Employé créé',
    // Terrain
    'PROSPECTION_CREATED': 'Prospection créée',
    'PAIEMENT_TERRAIN_VALIDATED': 'Paiement terrain validé',
  };
  
  if (map[code]) return map[code];

  // Fallback: SNAKE_CASE -> Snake Case
  return code
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function SettingBadge({ label, enabled }: { label: string; enabled?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${enabled ? 'bg-green-400' : 'bg-slate-600'}`} />
      <span className="text-slate-400">{label}</span>
      <span className={enabled ? 'text-green-400' : 'text-slate-600'}>
        {enabled ? 'Actif' : 'Inactif'}
      </span>
    </div>
  );
}

