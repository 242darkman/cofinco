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
  client?: {
    nom?: string;
    prenom?: string;
    telephone?: string;
    adresseDomicile?: string;
  };
}

interface AgentEnquetesProps {
  agentId?: string;
  selectedAgentId?: string | null;
  onAgentChange?: (id: string | null) => void;
}

const PRIORITY_CONFIG = {
  LOW: { label: 'Basse', color: 'bg-slate-500/15 text-slate-400' },
  MEDIUM: { label: 'Normale', color: 'bg-blue-500/15 text-blue-400' },
  HIGH: { label: 'Haute', color: 'bg-amber-500/15 text-amber-400' },
  URGENT: { label: 'Urgente', color: 'bg-red-500/15 text-red-400 animate-pulse' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  PENDING_ASSIGNMENT: { label: 'En attente', color: 'bg-slate-500/15 text-slate-400', icon: Clock },
  ASSIGNED: { label: 'Assignée', color: 'bg-blue-500/15 text-blue-400', icon: ClipboardCheck },
  IN_PROGRESS: { label: 'En cours', color: 'bg-amber-500/15 text-amber-400', icon: RefreshCw },
  SUBMITTED: { label: 'Soumise', color: 'bg-cyan-500/15 text-cyan-400', icon: CheckCircle },
  REVIEWED: { label: 'Révisée', color: 'bg-emerald-500/15 text-emerald-400', icon: CheckCircle },
  CLOSED: { label: 'Clôturée', color: 'bg-slate-500/15 text-slate-500', icon: XCircle },
  APPROVED: { label: 'Approuvée', color: 'bg-emerald-500/15 text-emerald-400', icon: CheckCircle },
  REJECTED: { label: 'Rejetée', color: 'bg-red-500/15 text-red-400', icon: XCircle },
  REDUCED: { label: 'Réduite', color: 'bg-purple-500/15 text-purple-400', icon: Banknote },
};

const PENDING_STATUSES = ['ASSIGNED', 'IN_PROGRESS', 'PENDING_ASSIGNMENT'];

export default function AgentEnquetes({ agentId }: AgentEnquetesProps) {
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchInvestigations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (agentId) params.set('agentId', agentId);

      const response = await fetch(`/api/credit-investigations/investigations?${params}`, {
        credentials: 'include',
      });
      if (response.ok) {
        const result = await response.json();
        setInvestigations(Array.isArray(result.data) ? result.data : []);
      }
    } catch (error) {
      console.error('[AgentEnquetes] Error fetching investigations:', error);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

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
        payload.type === 'investigation_submitted' ||
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
      <div className="bg-slate-800/80 backdrop-blur border border-slate-700 rounded-xl p-1.5 flex gap-1">
        <button
          onClick={() => setTab('pending')}
          className={clsx(
            'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all',
            tab === 'pending'
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-sm'
              : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'
          )}
        >
          <ClipboardCheck size={16} />
          <span>A effectuer</span>
          {pendingInvestigations.length > 0 && (
            <span className={clsx(
              'text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center',
              tab === 'pending' ? 'bg-amber-400/20 text-amber-300' : 'bg-amber-500 text-white'
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
              ? 'bg-slate-600/30 text-white border border-slate-600/50 shadow-sm'
              : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'
          )}
        >
          <History size={16} />
          <span>Historique</span>
          {historyInvestigations.length > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center bg-slate-600 text-slate-300">
              {historyInvestigations.length}
            </span>
          )}
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
        <input
          type="text"
          placeholder="Rechercher par client, objet..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-slate-800/60 border border-slate-700 rounded-xl text-sm text-white placeholder:text-slate-500 focus:border-cyan-500/50 focus:outline-none transition-colors"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-cyan-400" size={32} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4 ring-1 ring-slate-700">
            <FileSearch className="text-slate-600" size={28} />
          </div>
          <p className="text-slate-300 font-medium text-sm mb-1">
            {tab === 'pending' ? 'Aucune enquete en attente' : 'Aucun historique'}
          </p>
          <p className="text-slate-500 text-xs max-w-[250px]">
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
                  'bg-slate-800/60 border rounded-xl p-3 sm:p-4 transition-all hover:bg-slate-800/80',
                  overdue ? 'border-red-500/40' : 'border-slate-700/60'
                )}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-indigo-600/20 flex items-center justify-center text-indigo-400 font-bold text-xs shrink-0">
                      {investigation.client
                        ? `${(investigation.client.nom || '?')[0]}${(investigation.client.prenom || '')[0] || ''}`
                        : '?'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {investigation.client
                          ? `${investigation.client.nom || ''} ${investigation.client.prenom || ''}`.trim()
                          : 'Client inconnu'}
                      </p>
                      {investigation.objetCredit && (
                        <p className="text-[11px] text-slate-500 truncate">{investigation.objetCredit}</p>
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
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Banknote size={12} className="text-emerald-500 shrink-0" />
                      <span className="truncate">{formatMoney(investigation.montantDemande)}</span>
                    </div>
                  )}

                  {investigation.client?.telephone && (
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <User size={12} className="text-blue-400 shrink-0" />
                      <span className="truncate">{investigation.client.telephone}</span>
                    </div>
                  )}

                  {investigation.client?.adresseDomicile && (
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <MapPin size={12} className="text-purple-400 shrink-0" />
                      <span className="truncate">{investigation.client.adresseDomicile}</span>
                    </div>
                  )}

                  {tab === 'pending' && investigation.dueDate && (
                    <div className={clsx(
                      'flex items-center gap-1.5',
                      overdue ? 'text-red-400' : 'text-slate-400'
                    )}>
                      <Calendar size={12} className={overdue ? 'text-red-400' : 'text-slate-500'} />
                      <span className="truncate">
                        {overdue && <AlertTriangle size={10} className="inline mr-0.5" />}
                        Echéance: {formatDate(investigation.dueDate)}
                      </span>
                    </div>
                  )}

                  {tab === 'history' && investigation.submittedAt && (
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Calendar size={12} className="text-slate-500 shrink-0" />
                      <span className="truncate">Soumise: {formatDate(investigation.submittedAt)}</span>
                    </div>
                  )}

                  {investigation.assignedAt && (
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Clock size={12} className="text-slate-500 shrink-0" />
                      <span className="truncate">Assignée: {formatDate(investigation.assignedAt)}</span>
                    </div>
                  )}
                </div>

                {/* Overdue warning */}
                {overdue && (
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-red-400 bg-red-500/10 rounded-lg px-2.5 py-1.5">
                    <AlertTriangle size={12} />
                    <span className="font-medium">Echéance dépassée</span>
                  </div>
                )}

                {/* History: show score and recommendation */}
                {tab === 'history' && (investigation.scoreGlobal || investigation.agentRecommendation) && (
                  <div className="mt-2 pt-2 border-t border-slate-700/50 flex items-center gap-3 text-xs">
                    {investigation.scoreGlobal != null && (
                      <span className="text-slate-400">
                        Score: <span className="font-bold text-white">{investigation.scoreGlobal}/100</span>
                      </span>
                    )}
                    {investigation.agentRecommendation && (
                      <span className={clsx(
                        'text-[10px] font-bold px-1.5 py-0.5 rounded',
                        investigation.agentRecommendation === 'APPROVE' ? 'bg-emerald-500/15 text-emerald-400' :
                        investigation.agentRecommendation === 'REJECT' ? 'bg-red-500/15 text-red-400' :
                        investigation.agentRecommendation === 'REDUCE_AMOUNT' ? 'bg-purple-500/15 text-purple-400' :
                        'bg-amber-500/15 text-amber-400'
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
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700 rounded-lg transition-all disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualiser
        </button>
      </div>
    </div>
  );
}
