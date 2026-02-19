import React from 'react';
import { Shield, ShieldCheck, Clock, AlertTriangle } from 'lucide-react';
import { KYC_STATUS_LABELS, RISK_LEVEL_LABELS } from '@shared/enum/status-constants';

/** Reusable info row: label on left, value on right */
export function InfoRow({ label, value, mono, icon }: { label: string; value?: string | null; mono?: boolean; icon?: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-subtle/30 border border-edge-subtle">
      <span className="text-[10px] text-content-muted uppercase tracking-wide flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span className={`text-xs font-medium text-content-secondary ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

/** KYC status badge with color coding */
export function KycBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="text-xs text-content-muted">-</span>;
  const map: Record<string, string> = {
    VERIFIED: 'bg-status-success-bg text-status-success border-status-success/20',
    PARTIAL: 'bg-status-warning-bg text-status-warning border-status-warning/20',
    PENDING: 'bg-status-info-bg text-status-info border-status-info/20',
    REJECTED: 'bg-status-danger-bg text-status-danger border-status-danger/20',
    EXPIRED: 'bg-status-danger-bg text-status-danger border-status-danger/20',
  };
  const label = (KYC_STATUS_LABELS as any)[status] || status;
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${map[status] || 'bg-surface-subtle text-content-muted border-edge-subtle'}`}>
      {label}
    </span>
  );
}

/** Risk level badge */
export function RiskBadge({ level }: { level?: string | null }) {
  if (!level) return <span className="text-xs text-content-muted">-</span>;
  const map: Record<string, string> = {
    LOW: 'bg-status-success-bg text-status-success border-status-success/20',
    MEDIUM: 'bg-status-warning-bg text-status-warning border-status-warning/20',
    HIGH: 'bg-status-danger-bg text-status-danger border-status-danger/20',
    VERY_HIGH: 'bg-status-danger-bg text-status-danger border-status-danger/20',
  };
  const label = (RISK_LEVEL_LABELS as any)[level] || level;
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${map[level] || 'bg-surface-subtle text-content-muted border-edge-subtle'}`}>
      {label}
    </span>
  );
}

/** Expiration date badge: red < 30 days, orange < 90 days, green otherwise */
export function ExpirationBadge({ date }: { date?: string | Date | null }) {
  if (!date) return <span className="text-xs text-content-muted">-</span>;

  const expirationDate = new Date(date);
  const now = new Date();
  const diffMs = expirationDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  const formatted = expirationDate.toLocaleDateString('fr-FR');

  let colorClass: string;
  let icon: React.ReactNode = null;

  if (diffDays < 0) {
    colorClass = 'bg-status-danger-bg text-status-danger border-status-danger/20';
    icon = <AlertTriangle size={10} className="mr-1" />;
  } else if (diffDays < 30) {
    colorClass = 'bg-status-danger-bg text-status-danger border-status-danger/20';
    icon = <Clock size={10} className="mr-1" />;
  } else if (diffDays < 90) {
    colorClass = 'bg-status-warning-bg text-status-warning border-status-warning/20';
    icon = <Clock size={10} className="mr-1" />;
  } else {
    colorClass = 'bg-status-success-bg text-status-success border-status-success/20';
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${colorClass}`}>
      {icon}
      {formatted}
      {diffDays < 0 && ' (expiree)'}
    </span>
  );
}

/** Consent badge with shield icon */
export function ConsentBadge({ consented, date }: { consented?: boolean | null; date?: string | Date | null }) {
  if (!consented) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold border bg-status-warning-bg text-status-warning border-status-warning/20">
        <Shield size={10} />
        Non signe
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold border bg-status-success-bg text-status-success border-status-success/20">
      <ShieldCheck size={10} />
      Consentement signe
      {date && <span className="font-normal ml-1">({new Date(date).toLocaleDateString('fr-FR')})</span>}
    </span>
  );
}

/** KYC health indicator: visual badge showing overall KYC health */
export function KycHealthIndicator({ status }: { status?: string | null }) {
  if (!status) return null;

  const config: Record<string, { icon: React.FC<any>; label: string; colorClass: string }> = {
    VERIFIED: {
      icon: ShieldCheck,
      label: 'KYC Verifie',
      colorClass: 'bg-status-success-bg text-status-success border-status-success/30',
    },
    PARTIAL: {
      icon: Shield,
      label: 'KYC Partiel',
      colorClass: 'bg-status-warning-bg text-status-warning border-status-warning/30',
    },
    PENDING: {
      icon: Clock,
      label: 'KYC En attente',
      colorClass: 'bg-status-info-bg text-status-info border-status-info/30',
    },
    REJECTED: {
      icon: AlertTriangle,
      label: 'KYC Rejete',
      colorClass: 'bg-status-danger-bg text-status-danger border-status-danger/30',
    },
    EXPIRED: {
      icon: AlertTriangle,
      label: 'KYC Expire',
      colorClass: 'bg-status-danger-bg text-status-danger border-status-danger/30',
    },
  };

  const cfg = config[status] || config.PENDING;
  const Icon = cfg!.icon;

  return (
    <div className={`flex items-center gap-2 p-3 rounded-xl border ${cfg!.colorClass}`}>
      <Icon size={18} />
      <span className="text-sm font-semibold">{cfg!.label}</span>
    </div>
  );
}
