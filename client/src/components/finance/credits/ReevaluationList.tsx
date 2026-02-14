/**
 * ReevaluationList - Liste des réévaluations en cours
 * Affiche toutes les réévaluations avec filtres et actions rapides
 */

import React, { useState, useEffect } from 'react';
import {
  RefreshCw, Clock, CheckCircle, XCircle, AlertTriangle,
  Users, Filter, Search, ChevronRight, Loader2, Eye
} from 'lucide-react';
import { toast } from 'sonner';
import { formatMoney, formatClientName, resolveStorageUrl } from '../../../lib/format';
import { Pagination } from '../../ui';
import { STATUT_REEVALUATION_LABELS } from '@shared/enum/status-constants';

interface Reevaluation {
  id: string;
  numeroDemande?: string;
  numeroReevaluation: string;
  numeroVersion: number;
  statut: string;
  clientId: string;
  demandeId: string;
  montantInitialDemande: string | number;
  nouveauMontantDemande?: string | number;
  scoreRejetInitial?: number;
  nouveauScore?: number;
  deltaScore?: number;
  elementsNouveaux: any[];
  createdAt: string;
  dateDecisionComite?: string;
  decisionComite?: string;
  client?: {
    nom: string;
    prenom?: string;
    photoUrl?: string;
    photoProfile?: string;
  };
}

interface ReevaluationListProps {
  onSelect?: (reevaluation: Reevaluation) => void;
  demandeId?: string; // Optional: filter by demande
  showFilters?: boolean;
}

type StatutFilter = 'all' | 'pending' | 'approved' | 'rejected';

// Status keys are from backend (English) — labels from centralized STATUT_REEVALUATION_LABELS
const STATUT_CONFIG: Record<string, { color: string; bg: string; icon: React.ReactNode; label: string }> = {
  'REQUESTED': { color: 'text-status-info', bg: 'bg-status-info-bg', icon: <Clock size={13} />, label: STATUT_REEVALUATION_LABELS.REQUESTED },
  'ELIGIBILITY_CHECK': { color: 'text-status-warning', bg: 'bg-status-warning-bg', icon: <Loader2 size={13} className="animate-spin" />, label: STATUT_REEVALUATION_LABELS.ELIGIBILITY_CHECK },
  'AUTHORIZED': { color: 'text-accent', bg: 'bg-accent/10', icon: <CheckCircle size={13} />, label: STATUT_REEVALUATION_LABELS.AUTHORIZED },
  'REFUSED': { color: 'text-status-danger', bg: 'bg-status-danger-bg', icon: <XCircle size={13} />, label: STATUT_REEVALUATION_LABELS.REFUSED },
  'ADDITIONAL_INVESTIGATION': { color: 'text-status-info', bg: 'bg-status-info-bg', icon: <Search size={13} />, label: STATUT_REEVALUATION_LABELS.ADDITIONAL_INVESTIGATION },
  'IN_COMMITTEE': { color: 'text-status-warning', bg: 'bg-status-warning-bg', icon: <Users size={13} />, label: STATUT_REEVALUATION_LABELS.IN_COMMITTEE },
  'APPROVED': { color: 'text-status-success', bg: 'bg-status-success-bg', icon: <CheckCircle size={13} />, label: STATUT_REEVALUATION_LABELS.APPROVED },
  'DEFINITIVELY_REJECTED': { color: 'text-status-danger', bg: 'bg-status-danger-bg', icon: <XCircle size={13} />, label: STATUT_REEVALUATION_LABELS.DEFINITIVELY_REJECTED },
  'CANCELLED': { color: 'text-content-muted', bg: 'bg-surface-subtle/30', icon: <XCircle size={13} />, label: STATUT_REEVALUATION_LABELS.CANCELLED },
};

export function ReevaluationList({ onSelect, demandeId, showFilters = true }: ReevaluationListProps) {
  const [reevaluations, setReevaluations] = useState<Reevaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statutFilter, setStatutFilter] = useState<StatutFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 7; // Increased density allows more items

  useEffect(() => {
    loadReevaluations();
  }, [demandeId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statutFilter, searchQuery, demandeId]);

  const loadReevaluations = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = demandeId 
        ? `/api/demandes/${demandeId}/reevaluations`
        : '/api/reevaluations';
      
      const response = await fetch(url, {
        credentials: 'include'
      });
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || 'Erreur de chargement');
      }
      
      setReevaluations(data.reevaluations || []);
    } catch (err: any) {
      setError(err.message);
      toast.error('Erreur lors du chargement des réévaluations');
    } finally {
      setLoading(false);
    }
  };

  const filteredReevaluations = reevaluations.filter(r => {
    // Status filter
    if (statutFilter === 'pending' && !['REQUESTED', 'ELIGIBILITY_CHECK', 'AUTHORIZED', 'ADDITIONAL_INVESTIGATION', 'IN_COMMITTEE'].includes(r.statut)) {
      return false;
    }
    if (statutFilter === 'approved' && r.statut !== 'APPROVED') {
      return false;
    }
    if (statutFilter === 'rejected' && !['REFUSED', 'DEFINITIVELY_REJECTED', 'CANCELLED'].includes(r.statut)) {
      return false;
    }
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        r.numeroReevaluation?.toLowerCase().includes(query) ||
        r.client?.nom?.toLowerCase().includes(query) ||
        r.client?.prenom?.toLowerCase().includes(query)
      );
    }
    
    return true;
  });

  const totalItems = filteredReevaluations.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  const paginatedReevaluations = filteredReevaluations.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const getStatutConfig = (statut: string) => {
    return STATUT_CONFIG[statut] || { 
      color: 'text-content-muted', 
      bg: 'bg-surface-subtle/30', 
      icon: <AlertTriangle size={13} />,
      label: statut 
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="animate-spin text-accent" size={24} />
        <span className="ml-3 text-content-muted text-sm">Chargement...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-status-danger-bg border border-status-danger/50 rounded-lg p-4 text-center">
        <XCircle className="mx-auto text-status-danger mb-2" size={24} />
        <p className="text-status-danger text-sm">{error}</p>
        <button 
          onClick={loadReevaluations}
          className="mt-2 px-3 py-1 bg-status-danger hover:bg-status-danger text-white text-xs rounded transition"
        >
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header Compact */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCw className="text-status-warning" size={16} />
          <h3 className="text-sm font-bold text-content-primary uppercase tracking-wider">Réévaluations</h3>
          <span className="px-1.5 py-0.5 bg-surface-elevated text-content-secondary text-xs rounded-full font-mono">
            {reevaluations.length}
          </span>
        </div>
        
        {showFilters && (
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted" />
              <input
                type="text"
                placeholder="Rechercher..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-40 sm:w-64 bg-surface-base/50 border border-edge-subtle rounded-md pl-8 pr-3 py-1 text-xs text-content-primary focus:outline-none focus:border-accent/50 transition-colors"
              />
            </div>
            
            <div className="flex bg-surface-base/50 p-0.5 rounded-md border border-edge-subtle">
              {[
                { value: 'all', label: 'Tout' },
                { value: 'pending', label: 'En cours' },
                { value: 'approved', label: 'Validées' },
                { value: 'rejected', label: 'Rejetées' },
              ].map(filter => (
                <button
                  key={filter.value}
                  onClick={() => setStatutFilter(filter.value as StatutFilter)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                    statutFilter === filter.value
                      ? 'bg-surface-elevated text-content-primary shadow-sm'
                      : 'text-content-muted hover:text-content-secondary hover:bg-surface'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* List Compact */}
      {filteredReevaluations.length === 0 ? (
        <div className="bg-surface/30 border border-edge-subtle rounded-lg p-6 text-center">
          <p className="text-content-muted text-sm">Aucune réévaluation trouvée</p>
        </div>
      ) : (
        <div className="space-y-1">
          {paginatedReevaluations.map(reeval => {
            const statutConfig = getStatutConfig(reeval.statut);
            const isClickable = !!onSelect;
            
            return (
              <div
                key={reeval.id}
                onClick={() => onSelect?.(reeval)}
                className={`group bg-surface/40 border border-edge-subtle hover:bg-surface hover:border-accent/30 rounded-lg p-2.5 transition-all ${
                  isClickable ? 'cursor-pointer' : ''
                }`}
              >
                <div className="flex items-center gap-4">
                  {/* Client Avatar & Info - Compact */}
                  <div className="flex items-center gap-3 w-[200px] shrink-0">
                    <div className="shrink-0 relative">
                      {(() => {
                        const photoUrl = reeval.client?.photoUrl || reeval.client?.photoProfile;
                        const initials = `${reeval.client?.nom?.[0] || ''}${reeval.client?.prenom?.[0] || ''}`.toUpperCase() || 'C';

                        if (photoUrl) {
                          return (
                            <img
                              src={resolveStorageUrl(photoUrl)}
                              alt="Client"
                              className="w-9 h-9 rounded-full object-cover border border-edge-strong group-hover:border-accent/50 transition-colors"
                            />
                          );
                        }
                        return (
                          <div className="w-9 h-9 rounded-full bg-surface-elevated flex items-center justify-center text-xs font-bold text-content-muted border border-edge-strong group-hover:border-accent/50 transition-colors">
                            {initials}
                          </div>
                        );
                      })()}
                      {/* Status Dot for very compact view */}
                      <div className={`absolute -right-0.5 -bottom-0.5 w-3 h-3 rounded-full border-2 border-edge ${statutConfig.bg.replace('/10', '')} ${statutConfig.color.replace('text-', 'bg-')}`}></div>
                    </div>
                    
                    <div className="min-w-0">
                      <p className="text-content-secondary font-semibold text-sm truncate group-hover:text-accent transition-colors">
                        {formatClientName(reeval.client?.nom || '', reeval.client?.prenom || '')}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-content-muted font-mono">
                         <span>{reeval.numeroReevaluation || `#${reeval.numeroVersion}`}</span>
                         <span>•</span>
                         <span>{new Date(reeval.createdAt).toLocaleDateString('fr-FR')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="w-[120px] shrink-0">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium border border-transparent ${statutConfig.bg} ${statutConfig.color}`}>
                      {statutConfig.icon}
                      {statutConfig.label}
                    </span>
                  </div>

                  {/* Financial Details - New Compact Grid */}
                  <div className="flex-1 grid grid-cols-2 gap-x-6 gap-y-1 border-l border-edge-subtle pl-4">
                    <div className="flex items-baseline justify-between">
                       <span className="text-[10px] text-content-muted uppercase tracking-wide">Initial</span>
                       <span className="text-content-muted text-xs font-mono">{formatMoney(Number(reeval.montantInitialDemande))}</span>
                    </div>
                    
                    <div className="flex items-baseline justify-between">
                       <span className="text-[10px] text-content-muted uppercase tracking-wide">Nouveau</span>
                       <span className="text-accent text-xs font-bold font-mono">
                         {reeval.nouveauMontantDemande ? formatMoney(Number(reeval.nouveauMontantDemande)) : '-'}
                       </span>
                    </div>

                    <div className="flex items-center justify-between col-span-2">
                       <div className="flex gap-2">
                          {reeval.elementsNouveaux?.slice(0, 3).map((el, i) => (
                             <span key={i} className="text-[10px] text-content-muted bg-surface-elevated/50 px-1.5 rounded truncate max-w-[100px]">
                               {el.type}
                             </span>
                          ))}
                       </div>
                       
                       {reeval.deltaScore !== undefined && reeval.deltaScore !== null && (
                        <div className={`text-xs font-mono font-medium ${reeval.deltaScore > 0 ? 'text-status-success' : 'text-status-danger'}`}>
                          {reeval.deltaScore > 0 ? '+' : ''}{reeval.deltaScore} pts
                        </div>
                       )}
                    </div>
                  </div>
                  
                  {/* Action Arrow */}
                  {isClickable && (
                    <div className="shrink-0 pl-2">
                      <ChevronRight size={16} className="text-content-muted group-hover:text-accent transition-colors" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalItems > ITEMS_PER_PAGE && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          canGoNext={currentPage < totalPages}
          canGoPrevious={currentPage > 1}
          itemsPerPage={ITEMS_PER_PAGE}
          totalItems={totalItems}
          className="mt-2"
        />
      )}
    </div>
  );
}

export default ReevaluationList;
