/**
 * ReevaluationDetailPanel - Détails d'une réévaluation avec actions workflow
 * Affiche le détail complet et permet d'effectuer les actions selon le statut
 */

import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, Clock, CheckCircle, XCircle, AlertTriangle, 
  Users, Shield, FileText, TrendingUp, TrendingDown,
  ChevronDown, ChevronUp, Loader2, ArrowLeft, Play,
  UserCheck, Ban, Send, Eye, History, Check
} from 'lucide-react';
import { toast } from 'sonner';
import { formatMoney } from '../../../lib/format';
import { CreditTimeline } from './CreditTimeline';
import { DecisionComite, DecisionComiteType, DECISION_COMITE_LABELS, StatutReevaluation, STATUT_REEVALUATION_LABELS } from '@shared/enum/status-constants';

interface Reevaluation {
  id: string;
  numeroReevaluation: string;
  numeroVersion: number;
  statut: string;
  demandeId: string;
  clientId: string;
  
  // Snapshot initial
  motifRejetInitial: string;
  dateRejetInitial: string;
  scoreRejetInitial: number;
  montantInitialDemande: string | number;
  
  // Nouveaux éléments
  elementsNouveaux: any[];
  justification: string;
  nouveauMontantDemande?: string | number;
  nouvelleDureeValeur?: number;
  nouvelleDureeUnite?: string;
  garantiesAdditionnelles?: any[];
  coEmprunteurDetails?: any;
  documentsJoints?: string[];
  
  // Eligibilité
  eligibiliteValidee?: boolean;
  motifRefusEligibilite?: string;
  dateValidationEligibilite?: string;
  validePar?: string;
  
  // Scoring
  nouveauScore?: number;
  deltaScore?: number;
  
  // Comité
  membresComite?: string[];
  decisionComite?: string;
  montantApprouveComite?: string | number;
  conditionsSpeciales?: string;
  commentaireComite?: string;
  dateDecisionComite?: string;
  decidePar?: string;
  
  // Metadata
  verrouille?: boolean;
  createdAt: string;
  updatedAt?: string;
  createdBy?: string;
}

interface AuditLog {
  id: string;
  action: string;
  statutAvant?: string;
  statutApres?: string;
  details?: any;
  timestamp: string;
  userId?: string;
  roleUtilisateur?: string;
}

interface ReevaluationDetailPanelProps {
  reevaluationId: string;
  onBack?: () => void;
  onStatusChange?: (newStatus: string) => void;
}

const STATUT_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
  'Demandée': { color: 'text-blue-400', bg: 'bg-blue-500/20', border: 'border-blue-500/50' },
  'Éligibilité en cours': { color: 'text-amber-400', bg: 'bg-amber-500/20', border: 'border-amber-500/50' },
  'Autorisée': { color: 'text-cyan-400', bg: 'bg-cyan-500/20', border: 'border-cyan-500/50' },
  'Refusée': { color: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500/50' },
  'Enquête complémentaire': { color: 'text-purple-400', bg: 'bg-purple-500/20', border: 'border-purple-500/50' },
  'En comité': { color: 'text-orange-400', bg: 'bg-orange-500/20', border: 'border-orange-500/50' },
  'Approuvée': { color: 'text-emerald-400', bg: 'bg-emerald-500/20', border: 'border-emerald-500/50' },
  'Rejetée définitivement': { color: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500/50' },
  'Annulée': { color: 'text-slate-400', bg: 'bg-slate-500/20', border: 'border-slate-500/50' },
};

const StepDetailModal = ({ step, logs, onClose }: { step: any, logs: AuditLog[], onClose: () => void }) => {
  if (!step) return null;

  const relevantLogs = logs.filter(log => {
    if (step.id === 'request') return ['REEVALUATION_CREEE', 'ELIGIBILITE_VERIFIEE'].includes(log.action);
    if (step.id === 'authorized') return ['ELIGIBILITE_VERIFIEE', 'ENQUETE_LANCEE'].includes(log.action) && log.statutApres !== 'Refusée';
    if (step.id === 'committee') return ['SOUMIS_COMITE'].includes(log.action);
    if (step.id === 'decision') return ['DECISION_ENREGISTREE', 'ANNULATION', 'REFUS_ELIGIBILITE'].includes(log.action);
    return false;
  }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
          <h3 className="font-bold text-white flex items-center gap-2">
            <History size={16} className="text-cyan-400" />
            Historique: {step.label}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><XCircle size={20} /></button>
        </div>
        <div className="p-0 max-h-[60vh] overflow-y-auto">
          {relevantLogs.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <Clock size={32} className="mx-auto mb-2 opacity-50" />
              <p>Aucune activité enregistrée pour cette étape</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {relevantLogs.map(log => (
                <div key={log.id} className="p-4 hover:bg-slate-800/50 transition">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-sm font-medium text-cyan-400">
                      {log.action.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs text-slate-500">
                      {new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                  </div>
                  {log.details?.description && (
                    <p className="text-sm text-slate-300 mb-2">{log.details.description}</p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <UserCheck size={12} />
                    <span>{log.roleUtilisateur || 'Système'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const WorkflowStepper = ({ currentStatus, onStepClick }: { currentStatus: string, onStepClick: (step: any) => void }) => {
  const steps = [
    { id: 'request', label: 'Demandée', status: [StatutReevaluation.REQUESTED, StatutReevaluation.ELIGIBILITY_CHECK] },
    { id: 'authorized', label: 'Autorisée', status: [StatutReevaluation.AUTHORIZED, StatutReevaluation.ADDITIONAL_INVESTIGATION] },
    { id: 'committee', label: 'En comité', status: [StatutReevaluation.IN_COMMITTEE] },
    { id: 'decision', label: 'Décision', status: [StatutReevaluation.APPROVED, StatutReevaluation.DEFINITIVELY_REJECTED, StatutReevaluation.REFUSED, StatutReevaluation.CANCELLED] }
  ];

  const getCurrentStepIndex = () => {
    if ([StatutReevaluation.REFUSED, StatutReevaluation.DEFINITIVELY_REJECTED, StatutReevaluation.APPROVED, StatutReevaluation.CANCELLED].includes(currentStatus as any)) return 3;
    if ([StatutReevaluation.IN_COMMITTEE].includes(currentStatus as any)) return 2;
    if ([StatutReevaluation.AUTHORIZED, StatutReevaluation.ADDITIONAL_INVESTIGATION].includes(currentStatus as any)) return 1;
    return 0;
  };
  
  const activeIndex = getCurrentStepIndex();

  return (
    <div className="w-full py-6">
      <div className="relative flex items-center justify-between w-full max-w-3xl mx-auto px-4">
        {/* Connector Line */}
        <div className="absolute left-4 right-4 top-[15px] h-0.5 bg-slate-800 -z-10"></div>
        <div 
          className="absolute left-4 top-[15px] h-0.5 bg-cyan-500 -z-10 transition-all duration-500"
          style={{ width: `calc(${(activeIndex / (steps.length - 1)) * 100}% - 32px)` }}
        ></div>

        {steps.map((step, index) => {
          const isActive = index <= activeIndex;
          const isCurrent = index === activeIndex;
          const isClickable = index <= activeIndex; // Allow clicking past steps too
          
          return (
            <div 
              key={step.id} 
              className={`flex flex-col items-center gap-3 relative group ${isClickable ? 'cursor-pointer' : ''}`}
              onClick={() => isClickable && onStepClick(step)}
            >
              <div 
                className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 bg-slate-900 z-10 ${
                  isActive 
                    ? 'bg-slate-900 border-cyan-500 text-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.3)]' 
                    : 'bg-slate-900 border-slate-700 text-slate-600'
                } ${isCurrent ? 'scale-110 ring-4 ring-cyan-500/10' : ''}`}
              >
                {isActive ? <Check size={14} strokeWidth={3} /> : <span className="text-xs font-bold">{index + 1}</span>}
              </div>
              
              <div className="absolute top-10 flex flex-col items-center w-32">
                <span className={`text-xs font-bold tracking-wide transition-colors ${isActive ? 'text-white' : 'text-slate-600'}`}>
                  {step.label}
                </span>
                {isCurrent && (
                  <span className="text-[10px] text-cyan-400 font-medium animate-pulse">En cours</span>
                )}
              </div>
              
              {/* Tooltip hint */}
              {isClickable && (
                <div className="absolute -top-8 px-2 py-1 bg-slate-800 text-xs text-white rounded opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap border border-slate-700">
                  Voir détails
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const StatusExplanation = ({ status }: { status: string }) => {
  const config = {
    'Demandée': {
      title: 'Dossier reçu',
      description: 'La demande a été créée mais n\'a pas encore été vérifiée. Vous devez vérifier l\'éligibilité pour continuer.',
      action: 'Action requise : Cliquez sur "Vérifier l\'éligibilité"',
      icon: Clock,
      color: 'blue'
    },
    'Autorisée': {
      title: 'Éligibilité validée',
      description: 'Le dossier respecte les critères d\'éligibilité. Il est prêt pour l\'analyse approfondie avant passage en comité.',
      action: 'Action requise : Préparez le dossier et cliquez sur "Soumettre au comité"',
      icon: CheckCircle,
      color: 'cyan'
    },
    'En comité': {
      title: 'Délibération en cours',
      description: 'Le dossier est entre les mains du comité de crédit. Les membres doivent examiner les nouvelles conditions proposées.',
      action: 'Action requise : Après la séance, cliquez sur "Enregistrer la décision" pour saisir le verdict.',
      icon: Users,
      color: 'orange'
    },
    'Approuvée': {
      title: 'Réévaluation validée',
      description: 'Le comité a donné son accord. Le crédit va être mis à jour avec les nouvelles conditions (montant, durée, score).',
      action: 'Terminé',
      icon: CheckCircle,
      color: 'emerald'
    },
    'Refusée': {
      title: 'Non éligible',
      description: 'Le dossier ne remplit pas les critères techniques (délai, nombre de tentatives, etc.).',
      action: 'Clôturé',
      icon: XCircle,
      color: 'red'
    }
  }[status];

  // Fallback for other statuses
  if (!config) return null;

  return (
    <div className={`bg-${config.color}-500/10 border border-${config.color}-500/30 rounded-xl p-4 flex items-start gap-4`}>
      <div className={`p-2 rounded-full bg-${config.color}-500/20 text-${config.color}-400 mt-1`}>
        <config.icon size={20} />
      </div>
      <div>
        <h4 className={`font-bold text-${config.color}-400 text-sm mb-1`}>{config.title}</h4>
        <p className="text-slate-300 text-sm leading-relaxed">{config.description}</p>
        <div className={`mt-2 text-xs font-semibold uppercase tracking-wider text-${config.color}-400/80`}>
          {config.action}
        </div>
      </div>
    </div>
  );
};

const DetailedElementView = ({ element, reevaluation }: { element: any, reevaluation: Reevaluation }) => {
  const type = element.type;
  
  // Render specific details based on type
  const renderDetails = () => {
    switch (type) {
      case 'Réduction montant demandé':
        return (
          <div className="mt-2 text-sm bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
            <div className="flex justify-between items-center">
               <span className="text-slate-400">Nouveau montant proposé:</span>
               <span className="font-bold text-emerald-400 text-lg">
                 {formatMoney(Number(reevaluation.nouveauMontantDemande))}
               </span>
            </div>
            <div className="flex justify-between items-center mt-1 text-xs">
               <span className="text-slate-500">Réduction:</span>
               <span className="text-emerald-500 font-medium">
                 -{formatMoney(Number(reevaluation.montantInitialDemande) - Number(reevaluation.nouveauMontantDemande || 0))}
               </span>
            </div>
          </div>
        );

      case 'Garantie supplémentaire':
        return (
          <div className="mt-2 space-y-2">
            {reevaluation.garantiesAdditionnelles && reevaluation.garantiesAdditionnelles.length > 0 ? (
              reevaluation.garantiesAdditionnelles.map((g, idx) => (
                <div key={idx} className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50 flex flex-col gap-1">
                  <div className="flex justify-between items-start">
                    <span className="font-medium text-slate-200">{g.type}</span>
                    <span className="font-mono text-cyan-400">{formatMoney(Number(g.valeurEstimee))}</span>
                  </div>
                  {g.description && <p className="text-xs text-slate-400">{g.description}</p>}
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500 italic">Aucune garantie enregistrée</p>
            )}
          </div>
        );

      case 'Co-emprunteur':
        const co = reevaluation.coEmprunteurDetails;
        if (!co) return <p className="text-xs text-slate-500 italic mt-1">Détails non disponibles</p>;
        
        return (
          <div className="mt-2 bg-slate-900/50 p-3 rounded-lg border border-slate-700/50 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
             <div className="col-span-2 font-medium text-slate-200 border-b border-slate-700 pb-1 mb-1">
               {co.nom} {co.prenom}
             </div>
             <div>
               <span className="text-slate-500 text-xs block">Relation</span>
               <span className="text-slate-300">{co.relation}</span>
             </div>
             <div>
               <span className="text-slate-500 text-xs block">Téléphone</span>
               <span className="text-slate-300">{co.telephone}</span>
             </div>
             <div className="col-span-2">
               <span className="text-slate-500 text-xs block">Revenus Mensuels</span>
               <span className="text-emerald-400 font-mono">{formatMoney(Number(co.revenusMensuels))}</span>
             </div>
          </div>
        );

      default:
        // Generic description field if present in the element object itself
        return element.description ? (
          <p className="mt-2 text-sm text-slate-400 bg-slate-900/50 p-2 rounded border border-slate-700/50">
            {element.description}
          </p>
        ) : null;
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'Co-emprunteur': return Users;
      case 'Garantie supplémentaire': return Shield;
      case 'Réduction montant demandé': return TrendingDown;
      case 'Allongement durée': return Clock;
      default: return FileText;
    }
  };

  const Icon = getIcon();

  return (
    <div className="bg-slate-800/80 rounded-lg p-3 border border-slate-700/50">
      <div className="flex items-center gap-2 mb-1">
        <div className="p-1.5 rounded-md bg-slate-700/50 text-amber-500">
          <Icon size={14} />
        </div>
        <span className="font-semibold text-amber-500 text-sm">{type}</span>
      </div>
      {renderDetails()}
    </div>
  );
};


export function ReevaluationDetailPanel({ reevaluationId, onBack, onStatusChange }: ReevaluationDetailPanelProps) {
  const [reevaluation, setReevaluation] = useState<Reevaluation | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [selectedStep, setSelectedStep] = useState<any>(null);

  useEffect(() => {
    if (reevaluationId) {
      loadReevaluation();
      loadAuditLogs();
    }
  }, [reevaluationId]);

  const loadReevaluation = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/reevaluations/${reevaluationId}`, {
        credentials: 'include'
      });
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || 'Erreur de chargement');
      }
      
      setReevaluation(data.reevaluation);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadAuditLogs = async () => {
    try {
      const response = await fetch(`/api/reevaluations/${reevaluationId}/audit-logs`, {
        credentials: 'include'
      });
      const data = await response.json();
      
      if (data.success) {
        setAuditLogs(data.logs || []);
      }
    } catch (err) {
      console.warn('Could not load audit logs');
    }
  };

  const handleValidateEligibility = async () => {
    setActionLoading('eligibility');
    try {
      const response = await fetch(`/api/reevaluations/${reevaluationId}/eligibility/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({})
      });
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || 'Erreur de validation');
      }
      
      if (data.eligibilite?.estEligible) {
        toast.success('✅ Éligibilité validée ! La réévaluation peut continuer.');
      } else {
        toast.error(`❌ Non éligible: ${data.eligibilite?.motifRefus || 'Critères non remplis'}`);
      }
      
      await loadReevaluation();
      await loadAuditLogs();
      onStatusChange?.(data.reevaluation?.statut);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSubmitToCommittee = async () => {
    setActionLoading('committee');
    try {
      const response = await fetch(`/api/reevaluations/${reevaluationId}/submit-to-committee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          membresConvoques: [],
          notePreparatoire: 'Dossier soumis pour évaluation en comité'
        })
      });
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || 'Erreur de soumission');
      }
      
      const scoring = data.scoring;
      toast.success(
        <div>
          <p className="font-bold">📋 Dossier soumis au comité</p>
          {scoring && (
            <p className="text-sm mt-1">
              Score: {scoring.scorePrecedent} → {scoring.scoreTotal} 
              ({scoring.deltaScore > 0 ? '+' : ''}{scoring.deltaScore})
            </p>
          )}
        </div>
      );
      
      await loadReevaluation();
      await loadAuditLogs();
      onStatusChange?.('En comité');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Êtes-vous sûr de vouloir annuler cette réévaluation ?')) return;
    
    setActionLoading('cancel');
    try {
      const response = await fetch(`/api/reevaluations/${reevaluationId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ motif: 'Annulation manuelle par l\'utilisateur' })
      });
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || 'Erreur d\'annulation');
      }
      
      toast.success('Réévaluation annulée');
      await loadReevaluation();
      await loadAuditLogs();
      onStatusChange?.('Annulée');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const getStatutConfig = (statut: string) => {
    return STATUT_CONFIG[statut] || { 
      color: 'text-slate-400', 
      bg: 'bg-slate-500/20', 
      border: 'border-slate-500/50' 
    };
  };

  const getActionButtons = () => {
    if (!reevaluation || reevaluation.verrouille) return null;
    
    const actions: React.ReactNode[] = [];
    
    switch (reevaluation.statut) {
      case 'Demandée':
        actions.push(
          <button
            key="validate"
            onClick={handleValidateEligibility}
            disabled={actionLoading !== null}
            className="flex-1 px-4 py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-medium transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {actionLoading === 'eligibility' ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Shield size={18} />
            )}
            Vérifier l'éligibilité
          </button>
        );
        break;
        
      case 'Autorisée':
        actions.push(
          <div key="committee-group" className="flex-1 flex flex-col gap-2">
            <button
              onClick={handleSubmitToCommittee}
              disabled={actionLoading !== null}
              className="w-full px-4 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {actionLoading === 'committee' ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Users size={18} />
              )}
              Soumettre au comité
            </button>
            <p className="text-xs text-slate-500 text-center">
              Envoie le dossier aux membres pour délibération (Session requise)
            </p>
          </div>
        );
        break;
        
      case 'En comité':
        actions.push(
          <div key="decision-group" className="flex-1 flex flex-col gap-2">
            <button
              onClick={() => setShowDecisionModal(true)}
              disabled={actionLoading !== null}
              className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <CheckCircle size={18} />
              Enregistrer la décision
            </button>
            <p className="text-xs text-slate-500 text-center">
              Saisir le verdict final (Approuvé/Rejeté) et les conditions retenues
            </p>
          </div>
        );
        break;
    }
    
    // Cancel button for non-terminal states
    if (![StatutReevaluation.APPROVED, StatutReevaluation.DEFINITIVELY_REJECTED, StatutReevaluation.CANCELLED, StatutReevaluation.REFUSED].includes(reevaluation.statut as any)) {
      actions.push(
        <button
          key="cancel"
          onClick={handleCancel}
          disabled={actionLoading !== null}
          className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-medium transition flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {actionLoading === 'cancel' ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Ban size={18} />
          )}
          Annuler
        </button>
      );
    }
    
    return actions.length > 0 ? (
      <div className="mt-8 bg-slate-800/50 border border-slate-700 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-cyan-500 to-blue-600"></div>
        <div className="absolute -right-10 -top-10 w-32 h-32 bg-cyan-500/5 rounded-full blur-3xl group-hover:bg-cyan-500/10 transition-colors"></div>
        
        <div className="flex flex-col md:flex-row items-center gap-6 relative z-10">
          <div className="flex-1">
             <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
               Action Requise
             </h3>
             <p className="text-slate-400 text-sm">
               Veuillez compléter l'étape actuelle pour faire avancer le dossier.
             </p>
          </div>
          
          <div className="flex items-start gap-3 w-full md:w-auto">
            {actions}
          </div>
        </div>
      </div>
    ) : null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-cyan-400" size={32} />
      </div>
    );
  }

  if (!reevaluation) {
    return (
      <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-6 text-center">
        <XCircle className="mx-auto text-red-400 mb-2" size={32} />
        <p className="text-red-400">Réévaluation introuvable</p>
      </div>
    );
  }

  const statutConfig = getStatutConfig(reevaluation.statut);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1 text-slate-400 hover:text-white mb-2 transition"
            >
              <ArrowLeft size={16} />
              <span className="text-sm">Retour</span>
            </button>
          )}
          <div className="flex items-center gap-3">
            <RefreshCw className="text-amber-400" size={24} />
            <div>
              <h2 className="text-xl font-bold text-white">
                {reevaluation.numeroReevaluation || `Réévaluation #${reevaluation.numeroVersion}`}
              </h2>
              <p className="text-slate-400 text-sm">
                Créée le {new Date(reevaluation.createdAt).toLocaleDateString('fr-FR', {
                  day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
                })}
              </p>
            </div>
          </div>
        </div>
        
        <div className={`px-4 py-2 rounded-lg border ${statutConfig.bg} ${statutConfig.border}`}>
          <span className={`font-medium ${statutConfig.color}`}>{reevaluation.statut}</span>
          {reevaluation.verrouille && (
            <span className="ml-2 text-xs text-slate-500">(verrouillée)</span>
          )}
        </div>
      </div>

      {/* Stepper */}
      <WorkflowStepper 
        currentStatus={reevaluation.statut} 
        onStepClick={setSelectedStep}
      />

      {/* Detail Modal for Steps */}
      {selectedStep && (
        <StepDetailModal 
          step={selectedStep} 
          logs={auditLogs} 
          onClose={() => setSelectedStep(null)} 
        />
      )}

      {/* Status Context Explanation */}
      <StatusExplanation status={reevaluation.statut} />

      {/* Comparatif montants */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <div className="text-xs text-red-400 mb-1">Demande initiale (rejetée)</div>
          <div className="text-2xl font-bold text-white">
            {formatMoney(Number(reevaluation.montantInitialDemande))}
          </div>
          <div className="text-sm text-slate-400 mt-1">
            Score: {reevaluation.scoreRejetInitial || 0}/100
          </div>
        </div>
        
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
          <div className="text-xs text-amber-400 mb-1">Nouvelle demande</div>
          <div className="text-2xl font-bold text-white">
            {formatMoney(Number(reevaluation.nouveauMontantDemande || reevaluation.montantInitialDemande))}
          </div>
          {reevaluation.nouveauScore !== undefined && reevaluation.nouveauScore !== null && (
            <div className="flex items-center gap-2 text-sm mt-1">
              <span className="text-slate-400">Score: {reevaluation.nouveauScore}/100</span>
              {reevaluation.deltaScore !== undefined && (
                <span className={reevaluation.deltaScore > 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {reevaluation.deltaScore > 0 ? '+' : ''}{reevaluation.deltaScore}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Motif rejet initial */}
      <div className="bg-slate-800/50 rounded-xl p-4">
        <h4 className="text-sm font-medium text-slate-400 mb-2">Motif du rejet initial</h4>
        <p className="text-white">{reevaluation.motifRejetInitial || 'Non spécifié'}</p>
        <p className="text-xs text-slate-500 mt-1">
        </p>
      </div>

      {/* Éléments nouveaux */}
      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
        <h3 className="text-sm font-bold text-slate-400 mb-4 flex items-center gap-2">
          <RefreshCw size={16} /> Éléments Nouveaux
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {reevaluation.elementsNouveaux?.map((el, i) => (
             <DetailedElementView key={i} element={el} reevaluation={reevaluation} />
          ))}
        </div>
        
        <div className="pt-4 border-t border-slate-700">
           <h4 className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Justification globale</h4>
           <p className="text-slate-300 text-sm leading-relaxed bg-slate-900/30 p-4 rounded-lg border border-slate-700/30">
             {reevaluation.justification}
           </p>
        </div>
      </div>

      {/* Garanties additionnelles */}
      {reevaluation.garantiesAdditionnelles && reevaluation.garantiesAdditionnelles.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl p-4">
          <h4 className="text-sm font-medium text-slate-400 mb-3">Garanties additionnelles</h4>
          <div className="space-y-2">
            {reevaluation.garantiesAdditionnelles.map((g, i) => (
              <div key={i} className="flex justify-between items-center bg-slate-900/50 rounded-lg p-3">
                <span className="text-white">{g.type || 'Type non spécifié'}</span>
                <span className="text-emerald-400 font-medium">{formatMoney(g.valeurEstimee || 0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Décision comité si applicable */}
      {reevaluation.decisionComite && (
        <div className={`rounded-xl p-4 border ${
          reevaluation.decisionComite === DecisionComite.APPROVED 
            ? 'bg-emerald-500/10 border-emerald-500/30' 
            : 'bg-red-500/10 border-red-500/30'
        }`}>
          <h4 className={`text-sm font-medium mb-2 ${
            reevaluation.decisionComite === DecisionComite.APPROVED ? 'text-emerald-400' : 'text-red-400'
          }`}>
            Décision du comité
          </h4>
          <p className="text-white font-bold text-lg">{reevaluation.decisionComite}</p>
          {reevaluation.montantApprouveComite && (
            <p className="text-slate-300 mt-1">
              Montant approuvé: {formatMoney(Number(reevaluation.montantApprouveComite))}
            </p>
          )}
          {reevaluation.commentaireComite && (
            <p className="text-slate-400 mt-2 text-sm italic">"{reevaluation.commentaireComite}"</p>
          )}
          {reevaluation.conditionsSpeciales && (
            <p className="text-amber-400 mt-2 text-sm">
              Conditions: {reevaluation.conditionsSpeciales}
            </p>
          )}
          {reevaluation.dateDecisionComite && (
            <p className="text-slate-500 text-xs mt-2">
              Décision le {new Date(reevaluation.dateDecisionComite).toLocaleDateString('fr-FR')}
            </p>
          )}
        </div>
      )}

      {/* Historique Timeline */}
      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
         <h3 className="text-sm font-bold text-slate-400 mb-4 flex items-center gap-2">
           <History size={16} /> Historique du Dossier
         </h3>
         <CreditTimeline demandeId={reevaluation.demandeId} compact />
      </div>

      {/* Actions */}
      {getActionButtons()}

      {/* Audit trail toggle */}
      <button
        onClick={() => setShowAudit(!showAudit)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/50 rounded-xl hover:bg-slate-800 transition"
      >
        <div className="flex items-center gap-2">
          <History size={18} className="text-slate-400" />
          <span className="text-slate-300">Historique des actions ({auditLogs.length})</span>
        </div>
        {showAudit ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
      </button>

      {/* Audit logs */}
      {showAudit && auditLogs.length > 0 && (
        <div className="space-y-2 pl-4 border-l-2 border-slate-700">
          {auditLogs.map(log => (
            <div key={log.id} className="bg-slate-800/30 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-white font-medium text-sm">{log.action.replace(/_/g, ' ')}</span>
                <span className="text-slate-500 text-xs">
                  {new Date(log.timestamp).toLocaleString('fr-FR')}
                </span>
              </div>
              {log.statutAvant && log.statutApres && (
                <div className="text-xs text-slate-400">
                  {log.statutAvant} → {log.statutApres}
                </div>
              )}
              {log.details?.description && (
                <p className="text-slate-400 text-sm mt-1">{log.details.description}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Decision Modal would be here - imported separately */}
      {showDecisionModal && (
        <ReevaluationDecisionModalInline
          reevaluationId={reevaluationId}
          onClose={() => setShowDecisionModal(false)}
          onSuccess={async () => {
            setShowDecisionModal(false);
            await loadReevaluation();
            await loadAuditLogs();
          }}
        />
      )}
    </div>
  );
}

/**
 * Inline Decision Modal for committee decisions
 */
function ReevaluationDecisionModalInline({ 
  reevaluationId, 
  onClose, 
  onSuccess 
}: { 
  reevaluationId: string; 
  onClose: () => void; 
  onSuccess: () => void;
}) {
  const [decision, setDecision] = useState<DecisionComiteType>(DecisionComite.APPROVED);
  const [montantApprouve, setMontantApprouve] = useState<number | undefined>();
  const [commentaire, setCommentaire] = useState('');
  const [conditionsSpeciales, setConditionsSpeciales] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (commentaire.length < 10) {
      toast.error('Le commentaire doit contenir au moins 10 caractères');
      return;
    }
    
    if (decision === DecisionComite.REDUCED_AMOUNT && !montantApprouve) {
      toast.error('Veuillez spécifier le montant approuvé');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/reevaluations/${reevaluationId}/committee-decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          decision,
          montantApprouve: decision === DecisionComite.APPROVED ? undefined : montantApprouve,
          commentaire,
          membresPresents: [],
          conditionsSpeciales: conditionsSpeciales || undefined
        })
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || 'Erreur lors de l\'enregistrement');
      }

      if (decision === DecisionComite.APPROVED) {
        toast.success('🎉 Réévaluation approuvée ! Le crédit peut être décaissé.');
      } else if (decision === DecisionComite.REDUCED_AMOUNT) {
        toast.success(`✅ Réévaluation approuvée avec montant réduit: ${formatMoney(montantApprouve!)}`);
      } else {
        toast.error('❌ Réévaluation rejetée définitivement.');
      }

      onSuccess();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-2xl w-full max-w-lg">
        <div className="p-6 border-b border-slate-700">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Users className="text-orange-400" size={24} />
            Décision du Comité
          </h3>
        </div>

        <div className="p-6 space-y-4">
          {/* Decision type */}
          <div>
            <label className="text-sm text-slate-400 mb-2 block">Décision</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: DecisionComite.APPROVED, label: 'Approuver', color: 'emerald' },
                { value: DecisionComite.REDUCED_AMOUNT, label: 'Réduire', color: 'amber' },
                { value: DecisionComite.REJECTED, label: 'Rejeter', color: 'red' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setDecision(opt.value as any)}
                  className={`px-4 py-3 rounded-lg border transition ${
                    decision === opt.value
                      ? `bg-${opt.color}-500/20 border-${opt.color}-500/50 text-${opt.color}-400`
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Montant if reduced */}
          {decision === DecisionComite.REDUCED_AMOUNT && (
            <div>
              <label className="text-sm text-slate-400 mb-2 block">Montant approuvé</label>
              <input
                type="number"
                value={montantApprouve || ''}
                onChange={(e) => setMontantApprouve(parseFloat(e.target.value) || undefined)}
                placeholder="Montant en FCFA"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          )}

          {/* Commentaire */}
          <div>
            <label className="text-sm text-slate-400 mb-2 block">Commentaire du comité *</label>
            <textarea
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              placeholder="Justification de la décision (min 10 caractères)..."
              rows={3}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-cyan-500"
            />
            <div className={`text-xs mt-1 ${commentaire.length >= 10 ? 'text-emerald-400' : 'text-slate-500'}`}>
              {commentaire.length}/10 caractères minimum
            </div>
          </div>

          {/* Conditions spéciales */}
          {decision !== DecisionComite.REJECTED && (
            <div>
              <label className="text-sm text-slate-400 mb-2 block">Conditions spéciales (optionnel)</label>
              <input
                type="text"
                value={conditionsSpeciales}
                onChange={(e) => setConditionsSpeciales(e.target.value)}
                placeholder="Ex: Garantie supplémentaire requise..."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-700 flex gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || commentaire.length < 10}
            className={`flex-1 px-4 py-3 rounded-lg font-medium transition flex items-center justify-center gap-2 disabled:opacity-50 ${
              decision === DecisionComite.REJECTED
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            {submitting ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <CheckCircle size={18} />
            )}
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReevaluationDetailPanel;
