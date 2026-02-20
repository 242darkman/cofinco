import React from 'react';
import { UserCheck, Play, Send, CheckCircle, XCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface EnqueteTimelineProps {
  enquete: {
    statut: string;
    assignedAt?: string | null;
    startedAt?: string | null;
    submittedAt?: string | null;
    reviewedAt?: string | null;
    closedAt?: string | null;
    agentRecommendation?: string | null;
    createdByName?: string | null;
  };
  compact?: boolean;
}

interface TimelineStep {
  key: string;
  label: string;
  icon: React.ReactNode;
  date: string | null;
  status: 'done' | 'current' | 'pending';
  detail?: string;
}

const STATUT_MAP: Record<string, number> = {
  PENDING_ASSIGNMENT: 0,
  ASSIGNED: 1,
  IN_PROGRESS: 2,
  SUBMITTED: 3,
  APPROVED: 4,
  REJECTED: 4,
  REDUCED: 4,
};

export default function EnqueteTimeline({ enquete, compact = false }: EnqueteTimelineProps) {
  const currentStep = STATUT_MAP[enquete.statut] ?? 0;
  const isTerminal = ['APPROVED', 'REJECTED', 'REDUCED'].includes(enquete.statut);

  const steps: TimelineStep[] = [
    {
      key: 'assigned',
      label: 'Assignée',
      icon: <UserCheck size={compact ? 12 : 14} />,
      date: enquete.assignedAt || null,
      status: currentStep >= 1 ? 'done' : currentStep === 0 ? 'current' : 'pending',
    },
    {
      key: 'started',
      label: 'Démarrée',
      icon: <Play size={compact ? 12 : 14} />,
      date: enquete.startedAt || null,
      status: currentStep >= 2 ? 'done' : currentStep === 1 ? 'current' : 'pending',
    },
    {
      key: 'submitted',
      label: 'Soumise',
      icon: <Send size={compact ? 12 : 14} />,
      date: enquete.submittedAt || null,
      status: currentStep >= 3 ? 'done' : currentStep === 2 ? 'current' : 'pending',
      detail: enquete.agentRecommendation
        ? enquete.agentRecommendation === 'APPROVE' ? 'Favorable'
        : enquete.agentRecommendation === 'APPROVE_WITH_CONDITIONS' ? 'Sous conditions'
        : 'Défavorable'
        : undefined,
    },
    {
      key: 'reviewed',
      label: isTerminal
        ? enquete.statut === 'APPROVED' ? 'Validée'
        : enquete.statut === 'REJECTED' ? 'Rejetée'
        : 'Réduite'
        : 'En attente',
      icon: isTerminal && enquete.statut !== 'APPROVED'
        ? <XCircle size={compact ? 12 : 14} />
        : <CheckCircle size={compact ? 12 : 14} />,
      date: enquete.reviewedAt || enquete.closedAt || null,
      status: isTerminal ? 'done' : currentStep === 3 ? 'current' : 'pending',
    },
  ];

  const formatDate = (d: string) => {
    try {
      return format(new Date(d), compact ? 'dd/MM HH:mm' : "dd MMM yyyy 'à' HH:mm", { locale: fr });
    } catch {
      return d;
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {steps.map((step, i) => (
          <React.Fragment key={step.key}>
            <div
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                step.status === 'done'
                  ? step.key === 'reviewed' && enquete.statut === 'REJECTED'
                    ? 'bg-status-danger-bg text-status-danger'
                    : 'bg-status-success-bg text-status-success'
                  : step.status === 'current'
                    ? 'bg-status-info-bg text-status-info'
                    : 'bg-surface-subtle text-content-muted'
              }`}
              title={step.date ? `${step.label} — ${formatDate(step.date)}` : step.label}
            >
              {step.icon}
              {step.label}
            </div>
            {i < steps.length - 1 && (
              <div className={`w-3 h-px ${step.status === 'done' ? 'bg-status-success' : 'bg-edge'}`} />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-lg border border-edge p-3">
      <div className="flex items-center gap-1.5 mb-3 text-xs font-semibold text-content-secondary">
        <Clock size={13} />
        Progression de l'enquête
      </div>

      <div className="relative">
        {/* Connector line */}
        <div className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-edge" />

        <div className="space-y-3">
          {steps.map((step) => (
            <div key={step.key} className="flex items-start gap-3 relative">
              {/* Dot */}
              <div
                className={`w-[23px] h-[23px] rounded-full flex items-center justify-center shrink-0 z-10 border-2 ${
                  step.status === 'done'
                    ? step.key === 'reviewed' && enquete.statut === 'REJECTED'
                      ? 'bg-status-danger border-status-danger text-white'
                      : 'bg-status-success border-status-success text-white'
                    : step.status === 'current'
                      ? 'bg-status-info border-status-info text-white'
                      : 'bg-surface border-edge text-content-muted'
                }`}
              >
                {step.icon}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${
                    step.status === 'pending' ? 'text-content-muted' : 'text-content-primary'
                  }`}>
                    {step.label}
                  </span>
                  {step.detail && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-subtle text-content-muted">
                      {step.detail}
                    </span>
                  )}
                </div>
                {step.date && (
                  <p className="text-[10px] text-content-muted mt-0.5">{formatDate(step.date)}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
