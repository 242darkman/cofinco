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
import { formatMoney, formatClientName } from '../../../lib/format';
import { Pagination } from '../../ui';

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
    photo_url?: string;
  };
}

interface ReevaluationListProps {
  onSelect?: (reevaluation: Reevaluation) => void;
  demandeId?: string; // Optional: filter by demande
  showFilters?: boolean;
}

type StatutFilter = 'all' | 'pending' | 'approved' | 'rejected';

const STATUT_CONFIG: Record<string, { color: string; bg: string; icon: React.ReactNode; label: string }> = {
  'Demandée': { color: 'text-blue-400', bg: 'bg-blue-500/20', icon: <Clock size={14} />, label: 'Demandée' },
  'Éligibilité en cours': { color: 'text-amber-400', bg: 'bg-amber-500/20', icon: <Loader2 size={14} className="animate-spin" />, label: 'Vérification' },
  'Autorisée': { color: 'text-cyan-400', bg: 'bg-cyan-500/20', icon: <CheckCircle size={14} />, label: 'Autorisée' },
  'Refusée': { color: 'text-red-400', bg: 'bg-red-500/20', icon: <XCircle size={14} />, label: 'Non éligible' },
  'Enquête complémentaire': { color: 'text-purple-400', bg: 'bg-purple-500/20', icon: <Search size={14} />, label: 'Enquête' },
  'En comité': { color: 'text-orange-400', bg: 'bg-orange-500/20', icon: <Users size={14} />, label: 'En comité' },
  'Approuvée': { color: 'text-emerald-400', bg: 'bg-emerald-500/20', icon: <CheckCircle size={14} />, label: 'Approuvée' },
  'Rejetée définitivement': { color: 'text-red-400', bg: 'bg-red-500/20', icon: <XCircle size={14} />, label: 'Rejetée' },
  'Annulée': { color: 'text-slate-400', bg: 'bg-slate-500/20', icon: <XCircle size={14} />, label: 'Annulée' },
};

export function ReevaluationList({ onSelect, demandeId, showFilters = true }: ReevaluationListProps) {
  const [reevaluations, setReevaluations] = useState<Reevaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statutFilter, setStatutFilter] = useState<StatutFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

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
    if (statutFilter === 'pending' && !['Demandée', 'Éligibilité en cours', 'Autorisée', 'Enquête complémentaire', 'En comité'].includes(r.statut)) {
      return false;
    }
    if (statutFilter === 'approved' && r.statut !== 'Approuvée') {
      return false;
    }
    if (statutFilter === 'rejected' && !['Refusée', 'Rejetée définitivement', 'Annulée'].includes(r.statut)) {
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
      color: 'text-slate-400', 
      bg: 'bg-slate-500/20', 
      icon: <AlertTriangle size={14} />,
      label: statut 
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-cyan-400" size={32} />
        <span className="ml-3 text-slate-400">Chargement des réévaluations...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-6 text-center">
        <XCircle className="mx-auto text-red-400 mb-2" size={32} />
        <p className="text-red-400">{error}</p>
        <button 
          onClick={loadReevaluations}
          className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition"
        >
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCw className="text-amber-400" size={20} />
          <h3 className="text-lg font-bold text-white">Réévaluations</h3>
          <span className="px-2 py-0.5 bg-slate-700 text-slate-300 text-sm rounded-full">
            {reevaluations.length}
          </span>
        </div>
        <button 
          onClick={loadReevaluations}
          className="p-2 hover:bg-slate-700 rounded-lg transition"
          title="Actualiser"
        >
          <RefreshCw size={16} className="text-slate-400" />
        </button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
            />
          </div>
          
          {/* Status filter */}
          <div className="flex gap-2">
            {[
              { value: 'all', label: 'Tous' },
              { value: 'pending', label: 'En cours' },
              { value: 'approved', label: 'Approuvées' },
              { value: 'rejected', label: 'Rejetées' },
            ].map(filter => (
              <button
                key={filter.value}
                onClick={() => setStatutFilter(filter.value as StatutFilter)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                  statutFilter === filter.value
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* List */}
      {filteredReevaluations.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-8 text-center">
          <RefreshCw className="mx-auto text-slate-500 mb-3" size={40} />
          <p className="text-slate-400">Aucune réévaluation trouvée</p>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="mt-2 text-cyan-400 hover:underline text-sm"
            >
              Effacer la recherche
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            {paginatedReevaluations.map(reeval => {
            const statutConfig = getStatutConfig(reeval.statut);
            const isClickable = !!onSelect;
            
            return (
              <div
                key={reeval.id}
                onClick={() => onSelect?.(reeval)}
                className={`bg-slate-800/50 border border-slate-700 rounded-xl p-4 transition ${
                  isClickable ? 'cursor-pointer hover:border-cyan-500/50 hover:bg-slate-800' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {/* Header row */}
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-white font-bold">
                        {reeval.numeroReevaluation || `#${reeval.numeroVersion}`}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs flex items-center gap-1 ${statutConfig.bg} ${statutConfig.color}`}>
                        {statutConfig.icon}
                        {statutConfig.label}
                      </span>
                    </div>
                    
                    {/* Client */}
                    {reeval.client && (
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex-shrink-0">
                          {reeval.client.photo_url ? (
                            <img 
                              src={reeval.client.photo_url} 
                              alt={formatClientName(reeval.client.nom, reeval.client.prenom)} 
                              className="w-8 h-8 rounded-full object-cover border border-slate-700"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-400 border border-slate-600">
                              {(reeval.client.nom?.[0] || 'C').toUpperCase()}
                            </div>
                          )}
                        </div>
                        <p className="text-slate-300 font-medium text-sm">
                          {formatClientName(reeval.client.nom, reeval.client.prenom)}
                        </p>
                      </div>
                    )}
                    
                    {/* Montants */}
                    <div className="flex items-center gap-4 text-sm">
                      <div>
                        <span className="text-slate-500">Initial: </span>
                        <span className="text-slate-300">{formatMoney(Number(reeval.montantInitialDemande))}</span>
                      </div>
                      {reeval.nouveauMontantDemande && (
                        <div>
                          <span className="text-slate-500">Nouveau: </span>
                          <span className="text-cyan-400 font-medium">
                            {formatMoney(Number(reeval.nouveauMontantDemande))}
                          </span>
                        </div>
                      )}
                      {reeval.deltaScore !== undefined && reeval.deltaScore !== null && (
                        <div className={`flex items-center gap-1 ${reeval.deltaScore > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          <span>Score: {reeval.deltaScore > 0 ? '+' : ''}{reeval.deltaScore}</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Elements nouveaux count */}
                    {reeval.elementsNouveaux && reeval.elementsNouveaux.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {reeval.elementsNouveaux.slice(0, 3).map((el, i) => (
                          <span key={i} className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded">
                            {el.type}
                          </span>
                        ))}
                        {reeval.elementsNouveaux.length > 3 && (
                          <span className="px-2 py-0.5 bg-slate-600 text-slate-300 text-xs rounded">
                            +{reeval.elementsNouveaux.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 text-xs">
                      {new Date(reeval.createdAt).toLocaleDateString('fr-FR')}
                    </span>
                    {isClickable && (
                      <ChevronRight size={18} className="text-slate-500" />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          </div>

          {totalItems > ITEMS_PER_PAGE && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              canGoNext={currentPage < totalPages}
              canGoPrevious={currentPage > 1}
              itemsPerPage={ITEMS_PER_PAGE}
              totalItems={totalItems}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default ReevaluationList;
