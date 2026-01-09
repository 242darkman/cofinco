import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Info,
  Shield,
  Wallet,
  Users,
  Clock,
  PiggyBank
} from 'lucide-react';
import { creditApi } from '../../../lib/api-client';
import { formatMoney } from '../../../lib/format';
import { toast } from '../../../lib/toast';

interface ScoreDetail {
  categorie: string;
  score: number;
  maxScore: number;
  description: string;
  indicateurs: Record<string, any>;
}

interface ScoringResult {
  demandeId: string;
  numeroDemande: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'E';
  recommendation: 'APPROUVER' | 'ETUDE_APPROFONDIE' | 'REJETER';
  tauxEndettement: number;
  capaciteRemboursement: number;
  montantMaxRecommande: number;
  details: ScoreDetail[];
  alertes: string[];
  atouts: string[];
}

interface CreditScoreCardProps {
  demandeId: string;
  initialScore?: number | null;
  compact?: boolean;
  onScoreUpdated?: (newScore: number) => void;
}

const getCategorieIcon = (categorie: string) => {
  switch (categorie) {
    case 'Historique Crédit':
      return Shield;
    case 'Comportement Épargne':
      return PiggyBank;
    case 'Participation Tontine':
      return Users;
    case 'Capacité Financière':
      return Wallet;
    case 'Ancienneté Relation':
      return Clock;
    default:
      return Info;
  }
};

const getGradeColor = (grade: string) => {
  switch (grade) {
    case 'A':
      return 'text-emerald-400 bg-emerald-500/20 border-emerald-500/50';
    case 'B':
      return 'text-green-400 bg-green-500/20 border-green-500/50';
    case 'C':
      return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/50';
    case 'D':
      return 'text-orange-400 bg-orange-500/20 border-orange-500/50';
    case 'E':
      return 'text-red-400 bg-red-500/20 border-red-500/50';
    default:
      return 'text-slate-400 bg-slate-500/20 border-slate-500/50';
  }
};

const getRecommendationConfig = (recommendation: string) => {
  switch (recommendation) {
    case 'APPROUVER':
      return {
        icon: CheckCircle,
        text: 'Approuver',
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10'
      };
    case 'ETUDE_APPROFONDIE':
      return {
        icon: AlertTriangle,
        text: 'Étude approfondie requise',
        color: 'text-amber-400',
        bg: 'bg-amber-500/10'
      };
    case 'REJETER':
      return {
        icon: XCircle,
        text: 'Rejeter',
        color: 'text-red-400',
        bg: 'bg-red-500/10'
      };
    default:
      return {
        icon: Info,
        text: recommendation,
        color: 'text-slate-400',
        bg: 'bg-slate-500/10'
      };
  }
};

export default function CreditScoreCard({
  demandeId,
  initialScore,
  compact = false,
  onScoreUpdated
}: CreditScoreCardProps) {
  const [scoring, setScoring] = useState<ScoringResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!compact) {
      loadScoring();
    }
  }, [demandeId, compact]);

  const loadScoring = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await creditApi.getScoring(demandeId);
      setScoring(result);
    } catch (err: any) {
      setError(err.message || 'Erreur lors du chargement du scoring');
    } finally {
      setLoading(false);
    }
  };

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      const result = await creditApi.recalculerScore(demandeId);
      toast.success(`Score recalculé: ${result.nouveauScore}/100 (${result.grade})`);

      if (onScoreUpdated) {
        onScoreUpdated(result.nouveauScore);
      }

      // Recharger le scoring complet
      await loadScoring();
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors du recalcul');
    } finally {
      setRecalculating(false);
    }
  };

  // Mode compact: juste afficher le score avec un badge
  if (compact) {
    const score = initialScore ?? scoring?.score;
    if (score === null || score === undefined) {
      return (
        <span className="text-slate-500 text-sm">--</span>
      );
    }

    let colorClass = 'text-slate-400 bg-slate-500/20';
    if (score >= 70) colorClass = 'text-emerald-400 bg-emerald-500/20';
    else if (score >= 55) colorClass = 'text-yellow-400 bg-yellow-500/20';
    else if (score >= 45) colorClass = 'text-orange-400 bg-orange-500/20';
    else colorClass = 'text-red-400 bg-red-500/20';

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm font-medium ${colorClass}`}>
        {score}
      </span>
    );
  }

  if (loading) {
    return (
      <div className="bg-slate-800 rounded-lg p-4 animate-pulse">
        <div className="h-6 bg-slate-700 rounded w-1/3 mb-4"></div>
        <div className="h-20 bg-slate-700 rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-800 rounded-lg p-4 border border-red-500/30">
        <div className="flex items-center gap-2 text-red-400">
          <AlertTriangle size={20} />
          <span>{error}</span>
        </div>
        <button
          onClick={loadScoring}
          className="mt-2 text-sm text-blue-400 hover:text-blue-300"
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (!scoring) {
    return (
      <div className="bg-slate-800 rounded-lg p-4">
        <button
          onClick={loadScoring}
          className="flex items-center gap-2 text-blue-400 hover:text-blue-300"
        >
          <RefreshCw size={16} />
          Charger le scoring
        </button>
      </div>
    );
  }

  const recommendationConfig = getRecommendationConfig(scoring.recommendation);
  const RecommendationIcon = recommendationConfig.icon;

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
      {/* Header avec score principal */}
      <div className="p-4 bg-slate-700/30">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Shield className="text-blue-400" size={20} />
            Score de Crédit
          </h3>
          <button
            onClick={handleRecalculate}
            disabled={recalculating}
            className="flex items-center gap-1 px-2 py-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={recalculating ? 'animate-spin' : ''} />
            Recalculer
          </button>
        </div>

        <div className="flex items-center gap-6">
          {/* Score circulaire */}
          <div className="relative">
            <svg className="w-24 h-24 transform -rotate-90">
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                className="text-slate-700"
              />
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                strokeDasharray={`${(scoring.score / 100) * 251.2} 251.2`}
                className={
                  scoring.score >= 70 ? 'text-emerald-500' :
                  scoring.score >= 55 ? 'text-yellow-500' :
                  scoring.score >= 45 ? 'text-orange-500' :
                  'text-red-500'
                }
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-white">{scoring.score}</span>
              <span className="text-xs text-slate-400">/100</span>
            </div>
          </div>

          {/* Grade et Recommandation */}
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-3">
              <span className={`text-3xl font-bold px-3 py-1 rounded border ${getGradeColor(scoring.grade)}`}>
                {scoring.grade}
              </span>
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${recommendationConfig.bg}`}>
                <RecommendationIcon className={recommendationConfig.color} size={18} />
                <span className={`font-medium ${recommendationConfig.color}`}>
                  {recommendationConfig.text}
                </span>
              </div>
            </div>

            {/* Indicateurs clés */}
            <div className="flex gap-4 text-sm">
              <div>
                <span className="text-slate-400">Endettement:</span>{' '}
                <span className={scoring.tauxEndettement > 50 ? 'text-red-400' : scoring.tauxEndettement > 33 ? 'text-yellow-400' : 'text-emerald-400'}>
                  {scoring.tauxEndettement}%
                </span>
              </div>
              <div>
                <span className="text-slate-400">Max recommandé:</span>{' '}
                <span className="text-white font-medium">{formatMoney(scoring.montantMaxRecommande)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Alertes et Atouts */}
      {(scoring.alertes.length > 0 || scoring.atouts.length > 0) && (
        <div className="px-4 py-3 border-t border-slate-700 grid md:grid-cols-2 gap-3">
          {scoring.atouts.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-xs font-medium text-emerald-400 uppercase flex items-center gap-1">
                <TrendingUp size={12} /> Points forts
              </h4>
              <ul className="text-sm text-emerald-300 space-y-0.5">
                {scoring.atouts.map((atout, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <CheckCircle size={12} className="mt-0.5 flex-shrink-0" />
                    <span>{atout}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {scoring.alertes.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-xs font-medium text-amber-400 uppercase flex items-center gap-1">
                <AlertTriangle size={12} /> Points d'attention
              </h4>
              <ul className="text-sm text-amber-300 space-y-0.5">
                {scoring.alertes.map((alerte, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                    <span>{alerte}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Toggle pour détails */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2 border-t border-slate-700 flex items-center justify-center gap-2 text-sm text-slate-400 hover:text-white hover:bg-slate-700/30 transition-colors"
      >
        {expanded ? (
          <>
            <ChevronUp size={16} />
            Masquer les détails
          </>
        ) : (
          <>
            <ChevronDown size={16} />
            Voir les détails du scoring
          </>
        )}
      </button>

      {/* Détails des catégories */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {scoring.details.map((detail, idx) => {
            const Icon = getCategorieIcon(detail.categorie);
            const percentage = (detail.score / detail.maxScore) * 100;

            return (
              <div key={idx} className="bg-slate-700/30 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Icon size={16} className="text-blue-400" />
                    <span className="font-medium text-white">{detail.categorie}</span>
                  </div>
                  <span className="text-sm">
                    <span className={
                      percentage >= 70 ? 'text-emerald-400' :
                      percentage >= 50 ? 'text-yellow-400' :
                      'text-red-400'
                    }>
                      {detail.score}
                    </span>
                    <span className="text-slate-500">/{detail.maxScore}</span>
                  </span>
                </div>

                {/* Barre de progression */}
                <div className="h-2 bg-slate-600 rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-full transition-all ${
                      percentage >= 70 ? 'bg-emerald-500' :
                      percentage >= 50 ? 'bg-yellow-500' :
                      'bg-red-500'
                    }`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>

                <p className="text-xs text-slate-400">{detail.description}</p>

                {/* Indicateurs détaillés */}
                {Object.keys(detail.indicateurs).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(detail.indicateurs).map(([key, value]) => {
                      if (key.startsWith('_') || value === null || value === undefined) return null;
                      const displayValue = typeof value === 'boolean'
                        ? (value ? 'Oui' : 'Non')
                        : typeof value === 'number'
                          ? value.toLocaleString()
                          : String(value);
                      return (
                        <span
                          key={key}
                          className="text-xs bg-slate-600/50 px-2 py-0.5 rounded text-slate-300"
                        >
                          {key.replace(/([A-Z])/g, ' $1').trim()}: {displayValue}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
