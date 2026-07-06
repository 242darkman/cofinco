/**
 * Panel de Suggestion de Billetage Prédictif
 *
 * Affiche des suggestions de répartition de coupures basées sur:
 * - L'historique des transactions de la caisse
 * - Le jour de la semaine
 * - Les tendances de fin de mois
 */

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles,
  Lightbulb,
  TrendingUp,
  Calendar,
  Clock,
  Info,
  ChevronDown,
  ChevronUp,
  Check,
  Save,
  RefreshCw,
  Wallet,
  AlertCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../../ui/Button';
import { useLanguage } from '../../../contexts/LanguageContext';
import { formatMoney } from '../../../lib/format';

interface BilletageSuggestion {
  denomination: string;
  label: string;
  count: number;
  value: number;
  percentage: number;
  reason?: string;
}

interface SuggestionResult {
  suggestions: BilletageSuggestion[];
  totalAmount: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  basedOn: {
    sessionsAnalyzed: number;
    periodDays: number;
    dayOfWeek?: string;
    isEndOfMonth?: boolean;
  };
  insights: string[];
  alternativeSuggestions?: BilletageSuggestion[];
}

interface BilletageTemplate {
  id: string;
  nom: string;
  billetage: Record<string, number>;
  totalCalcule: number;
  usageCount: number;
}

interface PredictiveBilletagePanelProps {
  caisseId: string;
  targetAmount: number;
  onApplySuggestion: (billetage: Record<string, number>) => void;
  currentBilletage?: Record<string, number>;
}

const confidenceColors = {
  HIGH: 'text-status-success bg-status-success-bg',
  MEDIUM: 'text-status-warning bg-status-warning-bg',
  LOW: 'text-content-muted bg-surface-subtle/30',
};

const confidenceLabels = {
  HIGH: 'Confiance élevée',
  MEDIUM: 'Confiance moyenne',
  LOW: 'Confiance faible',
};

export default function PredictiveBilletagePanel({
  caisseId,
  targetAmount,
  onApplySuggestion,
  currentBilletage,
}: PredictiveBilletagePanelProps) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(true);
  const [showAlternative, setShowAlternative] = useState(false);
  const [prioritizeSmall, setPrioritizeSmall] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [templateName, setTemplateName] = useState('');

  // Déterminer si fin de mois
  const isEndOfMonth = useMemo(() => {
    const today = new Date();
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    return today.getDate() >= lastDay - 5;
  }, []);

  const dayOfWeek = new Date().getDay();

  // Récupérer la suggestion
  const { data: suggestion, isLoading, refetch } = useQuery<SuggestionResult>({
    queryKey: ['billetage-suggestion', caisseId, targetAmount, prioritizeSmall],
    queryFn: async () => {
      const res = await fetch('/api/caisses/billetage/suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caisseId,
          targetAmount,
          prioritizeSmallDenominations: prioritizeSmall,
          dayOfWeek,
          isEndOfMonth,
        }),
      });
      if (!res.ok) throw new Error('Erreur récupération suggestion');
      return res.json();
    },
    enabled: targetAmount > 0,
  });

  // Récupérer les templates
  const { data: templates } = useQuery<BilletageTemplate[]>({
    queryKey: ['billetage-templates', caisseId],
    queryFn: async () => {
      const res = await fetch(`/api/caisses/billetage/templates?caisseId=${caisseId}`);
      if (!res.ok) throw new Error('Erreur récupération templates');
      return res.json();
    },
  });

  // Mutation pour sauvegarder un template
  const saveMutation = useMutation({
    mutationFn: async (params: { nom: string; billetage: Record<string, number> }) => {
      const res = await fetch('/api/caisses/billetage/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...params,
          caisseId,
        }),
      });
      if (!res.ok) throw new Error('Erreur sauvegarde');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billetage-templates'] });
      setShowSaveModal(false);
      setTemplateName('');
    },
  });

  const handleApplySuggestion = (suggestions: BilletageSuggestion[]) => {
    const billetage: Record<string, number> = {};
    for (const s of suggestions) {
      billetage[s.denomination] = s.count;
    }
    onApplySuggestion(billetage);
  };

  const handleApplyTemplate = (template: BilletageTemplate) => {
    onApplySuggestion(template.billetage);
  };

  const handleSaveAsTemplate = () => {
    if (!templateName.trim() || !currentBilletage) return;
    saveMutation.mutate({ nom: templateName, billetage: currentBilletage });
  };

  if (targetAmount <= 0) {
    return null;
  }

  return (
    <div className="bg-gradient-to-br from-accent/10 to-accent/10 rounded-xl border border-accent/20 overflow-hidden">
      {/* En-tête */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-accent" />
          </div>
          <div className="text-left">
            <h4 className="font-medium text-content-primary">Suggestion intelligente</h4>
            <p className="text-xs text-content-muted">
              Répartition optimale basée sur votre historique
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {suggestion && (
            <span className={`px-2 py-1 rounded text-xs font-medium ${confidenceColors[suggestion.confidence]}`}>
              {confidenceLabels[suggestion.confidence]}
            </span>
          )}
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-content-muted" />
          ) : (
            <ChevronDown className="w-5 h-5 text-content-muted" />
          )}
        </div>
      </button>

      {/* Contenu */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-5 h-5 animate-spin text-accent" />
                  <span className="ml-2 text-content-muted">Analyse en cours...</span>
                </div>
              ) : suggestion ? (
                <>
                  {/* Options */}
                  <div className="flex items-center gap-4 py-2 border-y border-white/10">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={prioritizeSmall}
                        onChange={(e) => setPrioritizeSmall(e.target.checked)}
                        className="w-4 h-4 rounded border-edge-strong bg-surface text-accent focus:ring-accent"
                      />
                      <span className="text-sm text-content-secondary">
                        Priorité petites coupures
                      </span>
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => refetch()}
                      icon={RefreshCw}
                    >
                      Recalculer
                    </Button>
                  </div>

                  {/* Insights */}
                  {suggestion.insights.length > 0 && (
                    <div className="bg-surface/50 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <Lightbulb className="w-4 h-4 text-status-warning mt-0.5 flex-shrink-0" />
                        <div className="space-y-1">
                          {suggestion.insights.map((insight, i) => (
                            <p key={i} className="text-sm text-content-secondary">
                              {insight}
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Suggestion principale */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h5 className="text-sm font-medium text-content-primary flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-accent" />
                        Répartition suggérée
                      </h5>
                      <span className="text-sm text-content-muted">
                        Total: {formatMoney(suggestion.totalAmount)} XOF
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {suggestion.suggestions.filter(s => s.count > 0).map((s) => (
                        <div
                          key={s.denomination}
                          className="bg-surface/70 rounded-lg p-2 border border-edge-subtle"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-content-muted">{s.label}</span>
                            <span className="text-xs text-accent">{s.percentage}%</span>
                          </div>
                          <div className="flex items-baseline gap-2">
                            <span className="text-lg font-bold text-content-primary">{s.count}</span>
                            <span className="text-xs text-content-muted">
                              = {formatMoney(s.value)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-end mt-3 gap-2">
                      {suggestion.alternativeSuggestions && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowAlternative(!showAlternative)}
                        >
                          {showAlternative ? 'Masquer alternative' : 'Voir alternative'}
                        </Button>
                      )}
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleApplySuggestion(suggestion.suggestions)}
                        icon={Check}
                      >
                        Appliquer
                      </Button>
                    </div>
                  </div>

                  {/* Suggestion alternative */}
                  <AnimatePresence>
                    {showAlternative && suggestion.alternativeSuggestions && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="pt-2 border-t border-edge-subtle">
                          <h5 className="text-sm font-medium text-content-muted mb-3">
                            Alternative (+ de petites coupures)
                          </h5>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {suggestion.alternativeSuggestions.filter(s => s.count > 0).map((s) => (
                              <div
                                key={s.denomination}
                                className="bg-surface/50 rounded-lg p-2 border border-edge-subtle"
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs text-content-muted">{s.label}</span>
                                </div>
                                <span className="text-sm font-medium text-content-secondary">
                                  {s.count} = {formatMoney(s.value)}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="flex justify-end mt-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleApplySuggestion(suggestion.alternativeSuggestions!)}
                              icon={Check}
                            >
                              Appliquer
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Templates sauvegardés */}
                  {templates && templates.length > 0 && (
                    <div className="pt-4 border-t border-edge-subtle">
                      <h5 className="text-sm font-medium text-content-muted mb-3 flex items-center gap-2">
                        <Wallet className="w-4 h-4" />
                        Mes modèles
                      </h5>
                      <div className="flex flex-wrap gap-2">
                        {templates.map((template) => (
                          <button
                            key={template.id}
                            onClick={() => handleApplyTemplate(template)}
                            className="px-3 py-1.5 bg-surface rounded-lg text-sm text-content-secondary hover:bg-surface-elevated transition-colors flex items-center gap-2"
                          >
                            <span>{template.nom}</span>
                            <span className="text-xs text-content-muted">
                              ({formatMoney(template.totalCalcule)})
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sauvegarder comme template */}
                  {currentBilletage && Object.keys(currentBilletage).length > 0 && (
                    <div className="flex justify-center pt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowSaveModal(true)}
                        icon={Save}
                      >
                        Sauvegarder comme modèle
                      </Button>
                    </div>
                  )}

                  {/* Métadonnées */}
                  <div className="flex items-center gap-4 text-xs text-content-muted pt-2 border-t border-edge-subtle">
                    <span className="flex items-center gap-1">
                      <Info className="w-3 h-3" />
                      {suggestion.basedOn.sessionsAnalyzed} sessions analysées
                    </span>
                    {suggestion.basedOn.dayOfWeek && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {suggestion.basedOn.dayOfWeek}
                      </span>
                    )}
                    {suggestion.basedOn.isEndOfMonth && (
                      <span className="flex items-center gap-1 text-status-warning">
                        <AlertCircle className="w-3 h-3" />
                        Fin de mois
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-content-muted">
                  <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Entrez un montant pour obtenir des suggestions</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal sauvegarde */}
      <AnimatePresence>
        {showSaveModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowSaveModal(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-sm bg-surface rounded-xl shadow-xl border border-edge p-4"
            >
              <h3 className="font-semibold text-content-primary mb-4 flex items-center gap-2">
                <Save className="w-5 h-5 text-accent" />
                Sauvegarder comme modèle
              </h3>

              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Nom du modèle..."
                className="w-full px-3 py-2 bg-surface-elevated/50 border border-edge-strong rounded-lg text-content-primary placeholder-content-muted mb-4"
              />

              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setShowSaveModal(false)}
                >
                  Annuler
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSaveAsTemplate}
                  isLoading={saveMutation.isPending}
                  disabled={!templateName.trim()}
                  icon={Save}
                >
                  Sauvegarder
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
