import React, { useEffect, useState } from 'react';
import { Search, FileSearch, CheckCircle, XCircle, Clock, AlertTriangle, ChevronDown, ChevronUp, User } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { formatMoney } from '../../../lib/format';
import LoadingSpinner from '../../ui/LoadingSpinner';
import EmptyState from '../../ui/EmptyState';
import { Badge } from '../../ui';

interface ClientEnquete {
  id: string;
  statut: string;
  montantDemande: string | null;
  objetCredit: string | null;
  agentRecommendation: string | null;
  recommendedAmount: string | null;
  riskLevel: string | null;
  scoreGlobal: number | null;
  assignedAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
  supervisorNotes: string | null;
  numeroDemande: string | null;
  creditPlanName: string | null;
  agentNom: string | null;
  agentPrenom: string | null;
}

const STATUT_CONFIG: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  PENDING_ASSIGNMENT: { label: 'En attente', className: 'bg-surface-subtle text-content-muted', icon: Clock },
  ASSIGNED: { label: 'Assignée', className: 'bg-status-info-bg text-status-info', icon: User },
  IN_PROGRESS: { label: 'En cours', className: 'bg-status-warning-bg text-status-warning', icon: Clock },
  SUBMITTED: { label: 'Soumise', className: 'bg-status-info-bg text-status-info', icon: FileSearch },
  APPROVED: { label: 'Approuvée', className: 'bg-status-success-bg text-status-success', icon: CheckCircle },
  REJECTED: { label: 'Rejetée', className: 'bg-status-danger-bg text-status-danger', icon: XCircle },
  REDUCED: { label: 'Réduite', className: 'bg-status-warning-bg text-status-warning', icon: AlertTriangle },
};

const RECOMMENDATION_LABELS: Record<string, { label: string; className: string }> = {
  APPROVE: { label: 'Favorable', className: 'text-status-success' },
  APPROVE_WITH_CONDITIONS: { label: 'Sous conditions', className: 'text-status-warning' },
  REJECT: { label: 'Défavorable', className: 'text-status-danger' },
};

const RISK_LABELS: Record<string, { label: string; className: string }> = {
  LOW: { label: 'Faible', className: 'text-status-success' },
  MEDIUM: { label: 'Moyen', className: 'text-status-warning' },
  HIGH: { label: 'Élevé', className: 'text-status-danger' },
};

interface ClientEnquetesTabProps {
  client: { id: string };
}

export default function ClientEnquetesTab({ client }: ClientEnquetesTabProps) {
  const [enquetes, setEnquetes] = useState<ClientEnquete[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/clients/${client.id}/enquetes`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : [])
      .then(data => setEnquetes(Array.isArray(data) ? data : []))
      .catch(() => setEnquetes([]))
      .finally(() => setLoading(false));
  }, [client.id]);

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    try {
      return format(new Date(d), 'dd MMM yyyy', { locale: fr });
    } catch {
      return '—';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (enquetes.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title="Aucune enquête"
        description="Ce client n'a pas encore fait l'objet d'une enquête de crédit."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-content-primary">
          Enquêtes de crédit ({enquetes.length})
        </h3>
      </div>

      <div className="space-y-2">
        {enquetes.map((enquete) => {
          const config = STATUT_CONFIG[enquete.statut] || STATUT_CONFIG.PENDING_ASSIGNMENT;
          const StatusIcon = config.icon;
          const isExpanded = expandedId === enquete.id;
          const rec = enquete.agentRecommendation ? RECOMMENDATION_LABELS[enquete.agentRecommendation] : null;
          const risk = enquete.riskLevel ? RISK_LABELS[enquete.riskLevel] : null;

          return (
            <div key={enquete.id} className="bg-surface border border-edge rounded-lg overflow-hidden">
              {/* Summary row */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : enquete.id)}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-surface-subtle/50 transition"
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${config.className}`}>
                  <StatusIcon size={14} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-content-primary truncate">
                      {enquete.numeroDemande || 'Enquête'}
                    </span>
                    <Badge value={config.label} className={config.className} size="sm" />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-content-muted mt-0.5">
                    {enquete.montantDemande && (
                      <span>{formatMoney(Number(enquete.montantDemande))}</span>
                    )}
                    {enquete.creditPlanName && (
                      <span className="text-accent">{enquete.creditPlanName}</span>
                    )}
                    <span>{formatDate(enquete.createdAt)}</span>
                  </div>
                </div>

                {rec && (
                  <span className={`text-xs font-medium ${rec.className} hidden sm:block`}>
                    {rec.label}
                  </span>
                )}

                {isExpanded ? <ChevronUp size={16} className="text-content-muted shrink-0" /> : <ChevronDown size={16} className="text-content-muted shrink-0" />}
              </button>

              {/* Expanded details */}
              {isExpanded && (
                <div className="border-t border-edge px-4 py-3 space-y-3 bg-surface-subtle/30">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-content-muted block">Objet</span>
                      <span className="text-content-primary">{enquete.objetCredit || '—'}</span>
                    </div>
                    <div>
                      <span className="text-content-muted block">Montant demandé</span>
                      <span className="text-content-primary font-medium">
                        {enquete.montantDemande ? formatMoney(Number(enquete.montantDemande)) : '—'}
                      </span>
                    </div>
                    {enquete.recommendedAmount && (
                      <div>
                        <span className="text-content-muted block">Montant recommandé</span>
                        <span className="text-content-primary font-medium">
                          {formatMoney(Number(enquete.recommendedAmount))}
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="text-content-muted block">Agent</span>
                      <span className="text-content-primary">
                        {enquete.agentNom ? `${enquete.agentPrenom || ''} ${enquete.agentNom}`.trim() : '—'}
                      </span>
                    </div>
                    {rec && (
                      <div>
                        <span className="text-content-muted block">Recommandation</span>
                        <span className={`font-medium ${rec.className}`}>{rec.label}</span>
                      </div>
                    )}
                    {risk && (
                      <div>
                        <span className="text-content-muted block">Niveau de risque</span>
                        <span className={`font-medium ${risk.className}`}>{risk.label}</span>
                      </div>
                    )}
                    {enquete.scoreGlobal != null && (
                      <div>
                        <span className="text-content-muted block">Score global</span>
                        <span className="text-content-primary font-bold">{enquete.scoreGlobal}/100</span>
                      </div>
                    )}
                  </div>

                  {/* Timeline dates */}
                  <div className="flex flex-wrap gap-4 text-[10px] text-content-muted pt-2 border-t border-edge-subtle">
                    {enquete.assignedAt && <span>Assignée: {formatDate(enquete.assignedAt)}</span>}
                    {enquete.submittedAt && <span>Soumise: {formatDate(enquete.submittedAt)}</span>}
                    {enquete.reviewedAt && <span>Revue: {formatDate(enquete.reviewedAt)}</span>}
                  </div>

                  {enquete.supervisorNotes && (
                    <div className="bg-surface-base p-2 rounded border border-edge-subtle">
                      <span className="text-[10px] text-content-muted uppercase font-semibold block mb-1">Notes du superviseur</span>
                      <p className="text-xs text-content-secondary italic">"{enquete.supervisorNotes}"</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
