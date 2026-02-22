/**
 * AgentEnquetes - Field agent investigations (enquêtes de crédit)
 * Two tabs: pending investigations + history
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  ClipboardCheck,
  Clock,
  History,
  MapPin,
  User,
  Banknote,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ChevronRight,
  RefreshCw,
  Calendar,
  Search,
  Loader2,
  FileSearch,
} from 'lucide-react';
import clsx from 'clsx';
import { EnqueteWizard } from '../finance/credits/EnqueteWizard';

interface Investigation {
  id: string;
  clientId?: string;
  demandeId?: string;
  montantDemande?: number;
  objetCredit?: string;
  assignedAt?: string;
  dueDate?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  statut?: string;
  startedAt?: string;
  submittedAt?: string;
  reviewedAt?: string;
  closedAt?: string;
  geoLatitude?: number;
  geoLongitude?: number;
  scoreGlobal?: number;
  recommandation?: string;
  agentRecommendation?: string;
  categorieActivite?: string;
  typeActivite?: string;
  ancienneteActivite?: string;
  revenuMensuel?: number;
  revenuJournalier?: number;
  typeRevenu?: string;
  chargesMensuelles?: number;
  descriptionActivite?: string;
  client?: {
    nom?: string;
    prenom?: string;
    telephone?: string;
    adresseDomicile?: string;
    profession?: string;
    typeActivite?: string;
    revenuMensuel?: number;
    revenuJournalier?: number;
    typeRevenu?: string;
  };
}

interface AgentEnquetesProps {
  agentId?: string;
  selectedAgentId?: string | null;
  onAgentChange?: (id: string | null) => void;
}

const PRIORITY_CONFIG = {
  LOW: { label: 'Basse', color: 'bg-surface-subtle/35 text-content-muted' },
  MEDIUM: { label: 'Normale', color: 'bg-status-info-bg text-status-info' },
  HIGH: { label: 'Haute', color: 'bg-status-warning-bg text-status-warning' },
  URGENT: { label: 'Urgente', color: 'bg-status-danger-bg text-status-danger animate-pulse' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  PENDING_ASSIGNMENT: { label: 'En attente', color: 'bg-surface-subtle/35 text-content-muted', icon: Clock },
  ASSIGNED: { label: 'Assignée', color: 'bg-status-info-bg text-status-info', icon: ClipboardCheck },
  IN_PROGRESS: { label: 'En cours', color: 'bg-status-warning-bg text-status-warning', icon: RefreshCw },
  SUBMITTED: { label: 'Soumise', color: 'bg-accent-secondary/15 text-accent', icon: CheckCircle },
  REVIEWED: { label: 'Révisée', color: 'bg-status-success-bg text-status-success', icon: CheckCircle },
  CLOSED: { label: 'Clôturée', color: 'bg-surface-subtle/35 text-content-muted', icon: XCircle },
  APPROVED: { label: 'Approuvée', color: 'bg-status-success-bg text-status-success', icon: CheckCircle },
  REJECTED: { label: 'Rejetée', color: 'bg-status-danger-bg text-status-danger', icon: XCircle },
  REDUCED: { label: 'Réduite', color: 'bg-status-info/15 text-status-info', icon: Banknote },
};

const PENDING_STATUSES = ['ASSIGNED', 'IN_PROGRESS', 'PENDING_ASSIGNMENT'];

export default function AgentEnquetes({ agentId }: AgentEnquetesProps) {
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [starting, setStarting] = useState<string | null>(null);
  const [enqueteFormData, setEnqueteFormData] = useState<Investigation | null>(null);

  const fetchInvestigations = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/enquetes-credit/mes-enquetes', {
        credentials: 'include',
      });
      if (response.ok) {
        const result = await response.json();
        setInvestigations(Array.isArray(result.data) ? result.data : []);
      }
    } catch (error) {
      // Error handled silently
    } finally {
      setLoading(false);
    }
  }, []);

  const handleStart = useCallback(async (enqueteId: string) => {
    setStarting(enqueteId);
    try {
      const response = await fetch(`/api/enquetes-credit/${enqueteId}/demarrer`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.ok) {
        fetchInvestigations();
      } else {
        const err = await response.json().catch(() => ({}));
      }
    } catch (error) {
      // Error handled silently
    } finally {
      setStarting(null);
    }
  }, [fetchInvestigations]);

  const handleSubmitEnquete = useCallback(async (payload: any) => {
    if (!enqueteFormData?.id) return;
    const response = await fetch(`/api/enquetes-credit/${enqueteFormData.id}/soumettre`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || "Erreur lors de la soumission");
    }
    setEnqueteFormData(null);
    fetchInvestigations();
  }, [enqueteFormData, fetchInvestigations]);

  useEffect(() => { fetchInvestigations(); }, [fetchInvestigations]);

  // Listen for real-time updates
  useEffect(() => {
    const handler = (event: CustomEvent) => {
      const payload = event.detail || {};
      if (
        payload.type === 'enquete_new' ||
        payload.type === 'enquete_assigned' ||
        payload.type === 'enquete_updated' ||
        payload.type === 'investigation_assigned' ||
        payload.type === 'investigation_reassigned' ||
        payload.type === 'investigation_started' ||
        payload.type === 'investigation_submitted' ||
        payload.type === 'investigation_validated' ||
        payload.type === 'demande_updated'
      ) {
        fetchInvestigations();
      }
    };
    window.addEventListener('credit-update', handler as EventListener);
    return () => window.removeEventListener('credit-update', handler as EventListener);
  }, [fetchInvestigations]);

  const pendingInvestigations = investigations.filter(i =>
    PENDING_STATUSES.includes(i.statut || '')
  );
  const historyInvestigations = investigations.filter(i =>
    !PENDING_STATUSES.includes(i.statut || '')
  );

  const displayList = tab === 'pending' ? pendingInvestigations : historyInvestigations;
  const filtered = searchQuery
    ? displayList.filter(i => {
        const q = searchQuery.toLowerCase();
        return (
          (i.client?.nom || '').toLowerCase().includes(q) ||
          (i.client?.prenom || '').toLowerCase().includes(q) ||
          (i.objetCredit || '').toLowerCase().includes(q) ||
          (i.id || '').toLowerCase().includes(q)
        );
      })
    : displayList;

  const formatDate = (d?: string) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatMoney = (amount?: number) => {
    if (!amount) return '-';
    return amount.toLocaleString('fr-FR') + ' FCFA';
  };

  const isDueOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="bg-surface/80 backdrop-blur border border-edge rounded-xl p-1.5 flex gap-1">
        <button
          onClick={() => setTab('pending')}
          className={clsx(
            'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all',
            tab === 'pending'
              ? 'bg-status-warning-bg text-status-warning border border-status-warning/30 shadow-sm'
              : 'text-content-muted hover:bg-surface-elevated/50 hover:text-content-primary'
          )}
        >
          <ClipboardCheck size={16} />
          <span>A effectuer</span>
          {pendingInvestigations.length > 0 && (
            <span className={clsx(
              'text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center',
              tab === 'pending' ? 'bg-status-warning-bg text-status-warning' : 'bg-status-warning text-white'
            )}>
              {pendingInvestigations.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('history')}
          className={clsx(
            'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all',
            tab === 'history'
              ? 'bg-surface-subtle/30 text-content-primary border border-edge-strong/50 shadow-sm'
              : 'text-content-muted hover:bg-surface-elevated/50 hover:text-content-primary'
          )}
        >
          <History size={16} />
          <span>Historique</span>
          {historyInvestigations.length > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center bg-surface-subtle text-content-secondary">
              {historyInvestigations.length}
            </span>
          )}
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" size={16} />
        <input
          type="text"
          placeholder="Rechercher par client, objet..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-surface/60 border border-edge rounded-xl text-sm text-content-primary placeholder:text-content-muted focus:border-accent/50 focus:outline-none transition-colors"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-accent" size={32} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 bg-surface rounded-full flex items-center justify-center mb-4 ring-1 ring-edge">
            <FileSearch className="text-content-muted" size={28} />
          </div>
          <p className="text-content-secondary font-medium text-sm mb-1">
            {tab === 'pending' ? 'Aucune enquete en attente' : 'Aucun historique'}
          </p>
          <p className="text-content-muted text-xs max-w-[250px]">
            {tab === 'pending'
              ? 'Les nouvelles enquetes assignees apparaitront ici.'
              : 'Les enquetes completees seront affichees ici.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((investigation) => {
            const statusConf = STATUS_CONFIG[investigation.statut || 'PENDING_ASSIGNMENT'] || STATUS_CONFIG.PENDING_ASSIGNMENT;
            const StatusIcon = statusConf.icon;
            const priorityConf = PRIORITY_CONFIG[(investigation.priority || 'MEDIUM') as keyof typeof PRIORITY_CONFIG];
            const overdue = tab === 'pending' && isDueOverdue(investigation.dueDate);

            return (
              <div
                key={investigation.id}
                className={clsx(
                  'bg-surface/60 border rounded-xl p-3 sm:p-4 transition-all hover:bg-surface/80',
                  overdue ? 'border-status-danger/40' : 'border-edge/60'
                )}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-xs shrink-0">
                      {investigation.client
                        ? `${(investigation.client.nom || '?')[0]}${(investigation.client.prenom || '')[0] || ''}`
                        : '?'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-content-primary truncate">
                        {investigation.client
                          ? `${investigation.client.nom || ''} ${investigation.client.prenom || ''}`.trim()
                          : 'Client inconnu'}
                      </p>
                      {investigation.objetCredit && (
                        <p className="text-[11px] text-content-muted truncate">{investigation.objetCredit}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={clsx('text-[9px] font-bold uppercase px-1.5 py-0.5 rounded', priorityConf.color)}>
                      {priorityConf.label}
                    </span>
                    <span className={clsx('text-[9px] font-bold uppercase px-1.5 py-0.5 rounded flex items-center gap-1', statusConf.color)}>
                      <StatusIcon size={10} />
                      {statusConf.label}
                    </span>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {investigation.montantDemande && (
                    <div className="flex items-center gap-1.5 text-content-muted">
                      <Banknote size={12} className="text-status-success shrink-0" />
                      <span className="truncate">{formatMoney(investigation.montantDemande)}</span>
                    </div>
                  )}

                  {investigation.client?.telephone && (
                    <div className="flex items-center gap-1.5 text-content-muted">
                      <User size={12} className="text-status-info shrink-0" />
                      <span className="truncate">{investigation.client.telephone}</span>
                    </div>
                  )}

                  {investigation.client?.adresseDomicile && (
                    <div className="flex items-center gap-1.5 text-content-muted">
                      <MapPin size={12} className="text-status-info shrink-0" />
                      <span className="truncate">{investigation.client.adresseDomicile}</span>
                    </div>
                  )}

                  {tab === 'pending' && investigation.dueDate && (
                    <div className={clsx(
                      'flex items-center gap-1.5',
                      overdue ? 'text-status-danger' : 'text-content-muted'
                    )}>
                      <Calendar size={12} className={overdue ? 'text-status-danger' : 'text-content-muted'} />
                      <span className="truncate">
                        {overdue && <AlertTriangle size={10} className="inline mr-0.5" />}
                        Echéance: {formatDate(investigation.dueDate)}
                      </span>
                    </div>
                  )}

                  {tab === 'history' && investigation.submittedAt && (
                    <div className="flex items-center gap-1.5 text-content-muted">
                      <Calendar size={12} className="text-content-muted shrink-0" />
                      <span className="truncate">Soumise: {formatDate(investigation.submittedAt)}</span>
                    </div>
                  )}

                  {investigation.assignedAt && (
                    <div className="flex items-center gap-1.5 text-content-muted">
                      <Clock size={12} className="text-content-muted shrink-0" />
                      <span className="truncate">Assignée: {formatDate(investigation.assignedAt)}</span>
                    </div>
                  )}
                </div>

                {/* Overdue warning */}
                {overdue && (
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-status-danger bg-status-danger-bg rounded-lg px-2.5 py-1.5">
                    <AlertTriangle size={12} />
                    <span className="font-medium">Echéance dépassée</span>
                  </div>
                )}

                {/* Action buttons for pending investigations */}
                {investigation.statut === 'ASSIGNED' && (
                  <div className="mt-2 pt-2 border-t border-edge-subtle">
                    <button
                      onClick={() => handleStart(investigation.id)}
                      disabled={starting === investigation.id}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-content-primary bg-accent-secondary hover:bg-accent-secondary disabled:bg-surface-elevated disabled:text-content-muted rounded-lg transition-all"
                    >
                      {starting === investigation.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <ChevronRight size={14} />
                      )}
                      Démarrer l'enquête
                    </button>
                  </div>
                )}
                {investigation.statut === 'IN_PROGRESS' && (
                  <div className="mt-2 pt-2 border-t border-edge-subtle">
                    <button
                      onClick={() => setEnqueteFormData(investigation)}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-white bg-status-info hover:bg-status-info rounded-lg transition-all"
                    >
                      <ClipboardCheck size={14} />
                      Remplir l'enquête
                    </button>
                  </div>
                )}

                {/* History: show score and recommendation */}
                {tab === 'history' && (investigation.scoreGlobal || investigation.agentRecommendation) && (
                  <div className="mt-2 pt-2 border-t border-edge-subtle flex items-center gap-3 text-xs">
                    {investigation.scoreGlobal != null && (
                      <span className="text-content-muted">
                        Score: <span className="font-bold text-content-primary">{investigation.scoreGlobal}/100</span>
                      </span>
                    )}
                    {investigation.agentRecommendation && (
                      <span className={clsx(
                        'text-[10px] font-bold px-1.5 py-0.5 rounded',
                        investigation.agentRecommendation === 'APPROVE' ? 'bg-status-success-bg text-status-success' :
                        investigation.agentRecommendation === 'REJECT' ? 'bg-status-danger-bg text-status-danger' :
                        investigation.agentRecommendation === 'REDUCE_AMOUNT' ? 'bg-status-info/15 text-status-info' :
                        'bg-status-warning-bg text-status-warning'
                      )}>
                        {investigation.agentRecommendation === 'APPROVE' ? 'Approuver' :
                         investigation.agentRecommendation === 'REJECT' ? 'Rejeter' :
                         investigation.agentRecommendation === 'REDUCE_AMOUNT' ? 'Reduire' :
                         investigation.agentRecommendation === 'APPROVE_WITH_CAUTION' ? 'Prudence' :
                         investigation.agentRecommendation}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Refresh button */}
      <div className="flex justify-center pt-2">
        <button
          onClick={fetchInvestigations}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-content-muted hover:text-content-primary bg-surface/60 hover:bg-surface-elevated/60 border border-edge rounded-lg transition-all disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualiser
        </button>
      </div>

      {/* Enquête Wizard — agent fills investigation data in 5 steps */}
      {enqueteFormData && (
        <EnqueteWizard
          clientId={enqueteFormData.clientId}
          clientNom={enqueteFormData.client ? `${enqueteFormData.client.prenom || ''} ${enqueteFormData.client.nom || ''}`.trim() : undefined}
          initialData={{
            demandeId: enqueteFormData.demandeId,
            id: enqueteFormData.id,
            clientId: enqueteFormData.clientId,
            montantDemande: enqueteFormData.montantDemande,
            objetCredit: enqueteFormData.objetCredit,
            categorieActivite: enqueteFormData.categorieActivite,
            typeActivite: enqueteFormData.typeActivite || enqueteFormData.client?.typeActivite,
            ancienneteActivite: enqueteFormData.ancienneteActivite,
            revenuMensuel: enqueteFormData.revenuMensuel || enqueteFormData.client?.revenuMensuel,
            revenuJournalier: enqueteFormData.revenuJournalier || enqueteFormData.client?.revenuJournalier,
            typeRevenu: enqueteFormData.typeRevenu || enqueteFormData.client?.typeRevenu,
            chargesMensuelles: enqueteFormData.chargesMensuelles,
            descriptionActivite: enqueteFormData.descriptionActivite || enqueteFormData.client?.profession,
            creditPlan: enqueteFormData.creditPlan || null,
            clientSituation: enqueteFormData.clientSituation || null,
            situationMatrimoniale: enqueteFormData.situationMatrimoniale,
            personnesCharge: enqueteFormData.personnesCharge,
            typeHabitation: enqueteFormData.typeHabitation,
            garantiesProposees: enqueteFormData.garantiesProposees,
            autresCredits: enqueteFormData.autresCredits,
            photosActivite: enqueteFormData.photosActivite,
            documentsJustificatifs: enqueteFormData.documentsJustificatifs,
            agentRecommendation: enqueteFormData.agentRecommendation,
            recommendedAmount: enqueteFormData.recommendedAmount,
            riskLevel: enqueteFormData.riskLevel,
            riskFactors: enqueteFormData.riskFactors,
            observations: enqueteFormData.observations,
            geoLatitude: enqueteFormData.geoLatitude,
            geoLongitude: enqueteFormData.geoLongitude,
            geoAccuracy: enqueteFormData.geoAccuracy,
            geoTimestamp: enqueteFormData.geoTimestamp,
            client: enqueteFormData.client,
          }}
          onClose={() => setEnqueteFormData(null)}
          onSave={handleSubmitEnquete}
        />
      )}
    </div>
  );
}
