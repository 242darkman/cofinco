import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { Mail, MessageSquare, AlertTriangle, CheckCircle, Clock, XCircle, RefreshCw, BarChart3, Send, Inbox, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';

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

  // Pagination state
  const [jobsPage, setJobsPage] = useState(1);
  const [failedJobsPage, setFailedJobsPage] = useState(1);
  const JOBS_PER_PAGE = 10;
  const FAILED_JOBS_PER_PAGE = 5;

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

  // Reset pagination when filter changes
  useEffect(() => {
    setJobsPage(1);
  }, [statusFilter]);

  // Paginated data
  const paginatedJobs = useMemo(() => {
    const start = (jobsPage - 1) * JOBS_PER_PAGE;
    return jobs.slice(start, start + JOBS_PER_PAGE);
  }, [jobs, jobsPage]);

  const paginatedFailedJobs = useMemo(() => {
    const start = (failedJobsPage - 1) * FAILED_JOBS_PER_PAGE;
    return failedJobs.slice(start, start + FAILED_JOBS_PER_PAGE);
  }, [failedJobs, failedJobsPage]);

  const totalJobsPages = Math.ceil(jobs.length / JOBS_PER_PAGE);
  const totalFailedJobsPages = Math.ceil(failedJobs.length / FAILED_JOBS_PER_PAGE);

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
        <Spinner size="sm" tone="accent" />
        <span className="ml-2 text-sm text-content-muted">Chargement...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
            icon={<Spinner size="xs" tone="current" />}
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
                  className="text-xs text-status-warning hover:text-status-warning underline mt-1"
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
          <div className="bg-surface/50 rounded-lg border border-edge-subtle p-3">
            <h3 className="text-xs font-medium text-content-muted mb-2 flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" /> Aujourd'hui
            </h3>
            <div className="flex items-center gap-6">
              <div>
                <span className="text-xl font-bold text-status-success">{metrics.todaySent}</span>
                <span className="text-xs text-content-muted ml-1">envoyés</span>
              </div>
              <div>
                <span className="text-xl font-bold text-status-danger">{metrics.todayFailed}</span>
                <span className="text-xs text-content-muted ml-1">échoués</span>
              </div>
              {metrics.todaySent + metrics.todayFailed > 0 && (
                <div className="text-xs text-content-muted">
                  Taux: {((metrics.todaySent / (metrics.todaySent + metrics.todayFailed)) * 100).toFixed(1)}%
                </div>
              )}
            </div>
          </div>

          <div className="bg-surface/50 rounded-lg border border-edge-subtle p-3">
            <h3 className="text-xs font-medium text-content-muted mb-2 flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5" /> Par canal
            </h3>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-status-info" />
                <span className="text-sm text-content-secondary">SMS</span>
                <span className="text-xs text-status-success">{metrics.byChannel.sms.sent}</span>
                <span className="text-xs text-content-muted">/</span>
                <span className="text-xs text-status-danger">{metrics.byChannel.sms.failed}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-status-info" />
                <span className="text-sm text-content-secondary">Email</span>
                <span className="text-xs text-status-success">{metrics.byChannel.email.sent}</span>
                <span className="text-xs text-content-muted">/</span>
                <span className="text-xs text-status-danger">{metrics.byChannel.email.failed}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Toggle */}
      <div className="bg-surface/50 rounded-lg border border-edge-subtle">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="w-full flex items-center justify-between p-3 text-sm text-content-secondary hover:bg-surface-elevated/30"
        >
          <span className="font-medium">Configuration globale</span>
          {showSettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showSettings && settings && (
          <div className="px-3 pb-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <SettingBadge label="SMS" enabled={settings.smsEnabled} />
            <SettingBadge label="Email" enabled={settings.emailEnabled} />
            <SettingBadge label="Push" enabled={settings.pushEnabled} />
            <div className="text-content-muted">
              Politique: <span className="text-content-secondary">{settings.fallbackPolicy || 'SMS_ONLY'}</span>
            </div>
            <div className="text-content-muted">
              OTP canal: <span className="text-content-secondary">{settings.otpChannel || 'SMS'}</span>
            </div>
            <div className="text-content-muted">
              OTP/min: <span className="text-content-secondary">{settings.otpMaxPerMinute ?? 3}</span>
            </div>
            <div className="text-content-muted">
              Quota SMS/jour: <span className="text-content-secondary">{settings.smsQuotaDaily ?? 1000}</span>
            </div>
            <div className="text-content-muted">
              Quota Email/jour: <span className="text-content-secondary">{settings.emailQuotaDaily ?? 500}</span>
            </div>
          </div>
        )}
      </div>

      {/* Jobs Table */}
      <div className="bg-surface/50 rounded-lg border border-edge-subtle">
        <div className="flex items-center justify-between p-3 border-b border-edge-subtle">
          <h3 className="text-sm font-medium text-content-secondary">
            File d'attente
            {jobs.length > 0 && (
              <span className="ml-2 text-xs text-content-muted">({jobs.length})</span>
            )}
          </h3>
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs bg-surface-base border border-edge text-content-secondary rounded px-2 py-1"
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
              className="p-1 text-content-muted hover:text-content-secondary"
              title="Rafraîchir"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-content-muted border-b border-edge-subtle">
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
              {paginatedJobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-content-muted py-6">
                    Aucun job trouvé
                  </td>
                </tr>
              ) : (
                paginatedJobs.map((job) => (
                  <tr key={job.id} className="border-b border-edge/50 hover:bg-surface-elevated/20">
                    <td className="p-2">
                      <span className={`inline-flex items-center gap-1 ${
                        job.channel === 'SMS' ? 'text-status-info' : 'text-status-info'
                      }`}>
                        {job.channel === 'SMS' ? <MessageSquare className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
                        {job.channel}
                      </span>
                    </td>
                    <td className="p-2 text-content-secondary font-mono">{formatTemplateCode(job.templateCode)}</td>
                    <td className="p-2">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="p-2 text-content-muted">{job.attempts}/{job.maxAttempts}</td>
                    <td className="p-2 text-status-danger/70 max-w-48 truncate" title={job.lastError || ''}>
                      {job.lastError || '-'}
                    </td>
                    <td className="p-2 text-content-muted">
                      {new Date(job.createdAt).toLocaleString('fr-FR', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                      })}
                    </td>
                    <td className="p-2">
                      {(job.status === 'DEAD_LETTER' || job.status === 'FAILED') && (
                        <button
                          onClick={() => handleRetryJob(job.id)}
                          disabled={retryingJobId === job.id}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-status-warning-bg text-status-warning hover:bg-status-warning-bg hover:text-status-warning disabled:opacity-50 transition-colors"
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

        {/* Pagination for Jobs */}
        {totalJobsPages > 1 && (
          <div className="flex items-center justify-between p-3 border-t border-edge-subtle">
            <span className="text-xs text-content-muted">
              Page {jobsPage} sur {totalJobsPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setJobsPage(p => Math.max(1, p - 1))}
                disabled={jobsPage === 1}
                className="p-1.5 rounded hover:bg-surface-elevated/50 disabled:opacity-30 disabled:cursor-not-allowed text-content-muted"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(5, totalJobsPages) }, (_, i) => {
                let pageNum: number;
                if (totalJobsPages <= 5) {
                  pageNum = i + 1;
                } else if (jobsPage <= 3) {
                  pageNum = i + 1;
                } else if (jobsPage >= totalJobsPages - 2) {
                  pageNum = totalJobsPages - 4 + i;
                } else {
                  pageNum = jobsPage - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setJobsPage(pageNum)}
                    className={`w-7 h-7 text-xs rounded ${
                      jobsPage === pageNum
                        ? 'bg-accent text-white'
                        : 'hover:bg-surface-elevated/50 text-content-muted'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setJobsPage(p => Math.min(totalJobsPages, p + 1))}
                disabled={jobsPage === totalJobsPages}
                className="p-1.5 rounded hover:bg-surface-elevated/50 disabled:opacity-30 disabled:cursor-not-allowed text-content-muted"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Failed Jobs Detail */}
      {failedJobs.length > 0 && (
        <div className="bg-surface/50 rounded-lg border border-status-danger/30">
          <div className="flex items-center gap-2 p-3 border-b border-status-danger/30">
            <AlertTriangle className="w-4 h-4 text-status-danger" />
            <h3 className="text-sm font-medium text-status-danger">Jobs en erreur ({failedJobs.length})</h3>
          </div>
          <div className="divide-y divide-edge/50">
            {paginatedFailedJobs.map((job) => (
              <div key={job.id} className="p-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-content-muted">
                    {job.channel} / {formatTemplateCode(job.templateCode)}
                  </span>
                  <StatusBadge status={job.status} />
                </div>
                {job.lastError && (
                  <p className="text-status-danger/70 mt-1 line-clamp-2">{job.lastError}</p>
                )}
              </div>
            ))}
          </div>

          {/* Pagination for Failed Jobs */}
          {totalFailedJobsPages > 1 && (
            <div className="flex items-center justify-between p-3 border-t border-status-danger/30">
              <span className="text-xs text-content-muted">
                Page {failedJobsPage} sur {totalFailedJobsPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setFailedJobsPage(p => Math.max(1, p - 1))}
                  disabled={failedJobsPage === 1}
                  className="p-1.5 rounded hover:bg-surface-elevated/50 disabled:opacity-30 disabled:cursor-not-allowed text-content-muted"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: Math.min(5, totalFailedJobsPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalFailedJobsPages <= 5) {
                    pageNum = i + 1;
                  } else if (failedJobsPage <= 3) {
                    pageNum = i + 1;
                  } else if (failedJobsPage >= totalFailedJobsPages - 2) {
                    pageNum = totalFailedJobsPages - 4 + i;
                  } else {
                    pageNum = failedJobsPage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setFailedJobsPage(pageNum)}
                      className={`w-7 h-7 text-xs rounded ${
                        failedJobsPage === pageNum
                          ? 'bg-status-danger text-white'
                          : 'hover:bg-surface-elevated/50 text-content-muted'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  onClick={() => setFailedJobsPage(p => Math.min(totalFailedJobsPages, p + 1))}
                  disabled={failedJobsPage === totalFailedJobsPages}
                  className="p-1.5 rounded hover:bg-surface-elevated/50 disabled:opacity-30 disabled:cursor-not-allowed text-content-muted"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
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
    slate: 'text-content-muted bg-surface/50 border-edge-subtle',
    yellow: 'text-status-warning bg-status-warning-bg border-status-warning/30',
    blue: 'text-status-info bg-status-info-bg border-status-info/30',
    green: 'text-status-success bg-status-success-bg border-status-success/30',
    red: 'text-status-danger bg-status-danger-bg border-status-danger/30',
    orange: 'text-status-warning bg-status-warning-bg border-status-warning/30',
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
    QUEUED: { bg: 'bg-status-warning-bg', text: 'text-status-warning', label: 'EN FILE' },
    PROCESSING: { bg: 'bg-status-info-bg', text: 'text-status-info', label: 'EN COURS' },
    SENT: { bg: 'bg-status-success-bg', text: 'text-status-success', label: 'ENVOYÉ' },
    FAILED: { bg: 'bg-status-danger-bg', text: 'text-status-danger', label: 'ÉCHOUÉ' },
    DEAD_LETTER: { bg: 'bg-status-warning-bg', text: 'text-status-warning', label: 'DEAD LETTER' },
  };

  const c = config[status] || { bg: 'bg-surface', text: 'text-content-muted', label: status };

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
      <div className={`w-2 h-2 rounded-full ${enabled ? 'bg-status-success' : 'bg-surface-subtle'}`} />
      <span className="text-content-muted">{label}</span>
      <span className={enabled ? 'text-status-success' : 'text-content-muted'}>
        {enabled ? 'Actif' : 'Inactif'}
      </span>
    </div>
  );
}

