import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  CheckCircle,
  AlertTriangle,
  Building2,
  Wallet,
  ArrowRight,
  Banknote,
  Clock,
  X,
  WifiOff,
  CloudOff,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { caisseAgentApi, caisseApi } from '@/lib/api-client';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { v4 as uuidv4 } from 'uuid';
import { StatutCaisse } from '@shared/enum/status-constants';

interface SettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  agentId: string;
}

export default function SettlementModal({ isOpen, onClose, onSuccess, agentId }: SettlementModalProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [caisses, setCaisses] = useState<any[]>([]);
  const [agentSummary, setAgentSummary] = useState<any>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    destinationCaisseId: '',
    montant: '',
    observations: ''
  });

  useEffect(() => {
    if (isOpen && agentId) {
      loadData();
    }
  }, [isOpen, agentId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [caissesData, summary] = await Promise.all([
        caisseApi.getStatus(),
        caisseAgentApi.getCaisseSummary(agentId)
      ]);
      setCaisses(caissesData.filter((c: any) => c.statut === StatutCaisse.OPEN));
      setAgentSummary(summary);
    } catch (error) {
       console.error('Erreur chargement données settlement:', error);
       toast({
         title: t('erreur'),
         description: "Impossible de charger les caisses disponibles.",
         variant: 'destructive',
       });
    } finally {
      setLoading(false);
    }
  };

  const validate = (allowQueue = false) => {
    const newErrors: Record<string, string> = {};
    
    // Only require caisse selection if not allowing queue mode
    if (!formData.destinationCaisseId && !allowQueue) {
      newErrors.destinationCaisseId = "Sélectionnez une caisse de réception";
    }
    
    const montantNum = parseFloat(formData.montant);
    if (!formData.montant || isNaN(montantNum) || montantNum <= 0) {
      newErrors.montant = "Montant invalide";
    } else if (agentSummary && montantNum > parseFloat(agentSummary.disponible)) {
      newErrors.montant = `Le montant dépasse votre solde disponible (${Number(agentSummary.disponible).toLocaleString()} FCFA)`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Offline queue hook
  const { isOnline, addToQueue, pendingCount } = useOfflineQueue();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // If no caisses available or offline, offer queue mode
    if (!hasCaisses || !isOnline) {
      handleQueueSubmit();
      return;
    }
    
    if (!validate()) return;

    setSubmitting(true);
    try {
      const idempotencyKey = uuidv4();
      await caisseAgentApi.createSettlementCash({
        agentId,
        destinationCaisseId: formData.destinationCaisseId,
        montant: parseFloat(formData.montant),
        observations: formData.observations,
        idempotencyKey
      });

      toast({
        title: t('succes'),
        description: "Demande de remise envoyée pour validation.",
      });
      
      onSuccess();
      onClose();
    } catch (error: any) {
      toast({
        title: t('erreur'),
        description: error.message || t('operationEchouee'),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Queue submission for offline/no-caisse scenario
  const handleQueueSubmit = () => {
    if (!validate(true)) return; // Allow queue mode validation (skip caisse requirement)

    const idempotencyKey = uuidv4();
    addToQueue('SETTLEMENT_CASH', {
      agentId,
      destinationCaisseId: formData.destinationCaisseId || null, // May be null if queued
      montant: parseFloat(formData.montant),
      observations: formData.observations,
      idempotencyKey,
      queuedAt: new Date().toISOString()
    });

    toast({
      title: "Remise mise en file d'attente",
      description: isOnline
        ? "Aucune caisse disponible. Cette remise sera soumise dès qu'une caisse sera ouverte."
        : "Vous êtes hors ligne. Cette remise sera synchronisée automatiquement.",
    });

    onSuccess();
    onClose();
  };

  // Don't render if not open
  if (!isOpen) return null;

  const disponible = agentSummary ? parseFloat(agentSummary.disponible) : 0;
  const valide = agentSummary ? parseFloat(agentSummary.valide) : 0;
  const pendingOut = agentSummary ? parseFloat(agentSummary.pendingOut || 0) : 0;
  const hasCaisses = caisses.length > 0;
  const canSubmitNormally = hasCaisses && isOnline;

  const handleMaxClick = () => {
    if (agentSummary && disponible > 0) {
      setFormData(prev => ({ ...prev, montant: disponible.toString() }));
      if (errors.montant) setErrors(prev => ({ ...prev, montant: '' }));
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="
            pointer-events-auto
            w-full max-w-2xl
            bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/50 rounded-2xl
            shadow-2xl shadow-black/20 dark:shadow-black/50
            flex flex-col
            max-h-[90vh]
            animate-in fade-in zoom-in-95 duration-200
          "
          onClick={(e) => e.stopPropagation()}
        >
          {/* ═══════════════════════════════════════════════════════════════════
              HEADER
          ═══════════════════════════════════════════════════════════════════ */}
          <div className="flex-shrink-0 p-5 sm:p-6 border-b border-slate-200 dark:border-slate-700/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30">
                <Banknote size={24} className="text-cyan-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Remise des Fonds
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Apurement de votre solde collecté
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white transition-all"
            >
              <X size={20} />
            </button>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              SCROLLABLE CONTENT (unique overflow container)
          ═══════════════════════════════════════════════════════════════════ */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">

            {/* ─────────────────────────────────────────────────────────────────
                HERO SECTION - Solde à Remettre
            ───────────────────────────────────────────────────────────────── */}
            <section className="bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-800/50 rounded-2xl p-5 border border-slate-200 dark:border-slate-700/50 shadow-sm">
              {/* Header Row */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Wallet size={18} className="text-slate-500 dark:text-slate-400" />
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Mon Solde Collecté
                  </span>
                </div>
                {loading && (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <div className="w-3 h-3 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
                    Chargement...
                  </div>
                )}
              </div>

              {/* Main Amount Display */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                {/* Solde Validé (Théorique) */}
                <div className="bg-white dark:bg-slate-900/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700/50">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-cyan-500" />
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                      Solde Validé
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-slate-700 dark:text-slate-300">
                    {valide.toLocaleString('fr-FR')}
                    <span className="text-sm font-normal text-slate-400 ml-1">FCFA</span>
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Montant théorique encaissé</p>
                </div>

                {/* Disponible (Hero - Physique) */}
                <div className="bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 dark:from-emerald-500/20 dark:to-cyan-500/20 rounded-xl p-4 border-2 border-emerald-500/30">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase">
                      Disponible à Remettre
                    </span>
                  </div>
                  <p className="text-3xl sm:text-4xl font-bold text-emerald-600 dark:text-emerald-400">
                    {disponible.toLocaleString('fr-FR')}
                    <span className="text-base font-normal text-emerald-500/70 ml-1">FCFA</span>
                  </p>
                  <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-1">Espèces physiques encaissables</p>
                </div>
              </div>

              {/* Pending Alert */}
              {pendingOut > 0 && (
                <div className="mt-4 flex items-center gap-3 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 p-3 rounded-xl border border-amber-200 dark:border-amber-500/30">
                  <Clock size={18} className="flex-shrink-0" />
                  <span>
                    <strong>{pendingOut.toLocaleString('fr-FR')} FCFA</strong> en attente de validation (remise en cours).
                  </span>
                </div>
              )}
            </section>

            {/* ─────────────────────────────────────────────────────────────────
                FORMULAIRE
            ───────────────────────────────────────────────────────────────── */}
            <form onSubmit={handleSubmit} className="space-y-5">

              {/* Caisse Selector */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Caisse de Réception <span className="text-red-500">*</span>
                </label>

                {hasCaisses ? (
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <Building2 size={20} />
                    </div>
                    <select
                      value={formData.destinationCaisseId}
                      onChange={(e) => {
                        setFormData({ ...formData, destinationCaisseId: e.target.value });
                        if (errors.destinationCaisseId) setErrors(prev => ({ ...prev, destinationCaisseId: '' }));
                      }}
                      className={`
                        w-full h-14 pl-12 pr-4 rounded-xl text-base font-medium
                        bg-white dark:bg-slate-800
                        border-2 ${errors.destinationCaisseId ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'}
                        text-slate-900 dark:text-white
                        focus:outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10
                        transition-all cursor-pointer
                        appearance-none
                      `}
                    >
                      <option value="">Sélectionner une caisse d'agence</option>
                      {caisses.map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.nom} ({c.caissierNom || 'Auto'})
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                      <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
                        <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>
                ) : (
                  /* No Caisse - Queue Mode Enabled */
                  <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-2 border-amber-500/30 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-amber-500/20">
                        {isOnline ? (
                          <CloudOff size={20} className="text-amber-400" />
                        ) : (
                          <WifiOff size={20} className="text-amber-400" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-amber-300">
                          {isOnline ? 'Aucune caisse ouverte' : 'Mode hors ligne'}
                        </p>
                        <p className="text-sm text-amber-400/80 mt-1">
                          {isOnline 
                            ? "Votre remise sera mise en file d'attente et traitée dès qu'une caisse sera disponible."
                            : "Votre remise sera synchronisée automatiquement au retour du réseau."
                          }
                        </p>
                        {pendingCount > 0 && (
                          <p className="text-xs text-amber-400/60 mt-2">
                            📋 {pendingCount} opération(s) en attente de synchronisation
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {errors.destinationCaisseId && hasCaisses && (
                  <p className="text-sm text-red-500 flex items-center gap-1">
                    <AlertTriangle size={14} /> {errors.destinationCaisseId}
                  </p>
                )}
              </div>

              {/* Montant Field with MAX Button */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Montant de la Remise <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    <DollarSign size={22} />
                  </div>
                  <input
                    type="number"
                    value={formData.montant}
                    onChange={(e) => {
                      setFormData({ ...formData, montant: e.target.value });
                      if (errors.montant) setErrors(prev => ({ ...prev, montant: '' }));
                    }}
                    placeholder="0"
                    min="0"
                    max={disponible}
                    className={`
                      w-full h-14 pl-12 pr-24 rounded-xl text-lg font-semibold
                      bg-white dark:bg-slate-800
                      border-2 ${errors.montant ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'}
                      text-slate-900 dark:text-white
                      placeholder-slate-400
                      focus:outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10
                      transition-all
                      [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
                    `}
                  />
                  {/* MAX Button inside input */}
                  <button
                    type="button"
                    onClick={handleMaxClick}
                    disabled={disponible <= 0}
                    className={`
                      absolute right-2 top-1/2 -translate-y-1/2
                      px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wide
                      transition-all
                      ${disponible > 0
                        ? 'bg-cyan-500 hover:bg-cyan-400 text-white shadow-lg shadow-cyan-500/30'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                      }
                    `}
                  >
                    Max
                  </button>
                </div>
                {errors.montant && (
                  <p className="text-sm text-red-500 flex items-center gap-1">
                    <AlertTriangle size={14} /> {errors.montant}
                  </p>
                )}
                {formData.montant && !errors.montant && (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Vous remettez <span className="font-semibold text-emerald-500">{parseFloat(formData.montant).toLocaleString('fr-FR')} FCFA</span>
                  </p>
                )}
              </div>

              {/* Observations */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Observations
                </label>
                <textarea
                  value={formData.observations}
                  onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
                  placeholder="Précisions si nécessaire..."
                  rows={2}
                  className="
                    w-full px-4 py-3 rounded-xl text-sm
                    bg-white dark:bg-slate-800
                    border-2 border-slate-200 dark:border-slate-700
                    text-slate-900 dark:text-white
                    placeholder-slate-400
                    focus:outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10
                    transition-all resize-none
                  "
                />
              </div>

              {/* Info Box */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/50 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 flex items-center justify-center text-cyan-500 flex-shrink-0">
                  <ArrowRight size={22} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Procédure de remise
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Le caissier devra valider la réception physique de ces fonds pour apurer votre compte.
                  </p>
                </div>
              </div>
            </form>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              STICKY FOOTER - Action Buttons
          ═══════════════════════════════════════════════════════════════════ */}
          <div className="flex-shrink-0 p-5 sm:p-6 border-t border-slate-200 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-900/95">
            <div className="flex flex-col-reverse sm:flex-row gap-3">
              <Button
                variant="ghost"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 h-12"
              >
                Annuler
              </Button>
              <Button
                variant="primary"
                onClick={handleSubmit}
                isLoading={submitting}
                disabled={disponible <= 0 || submitting}
                icon={canSubmitNormally ? CheckCircle : CloudOff}
                className={`flex-1 h-12 shadow-lg ${
                  canSubmitNormally 
                    ? 'bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 shadow-cyan-500/20'
                    : 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 shadow-amber-500/20'
                }`}
              >
                {canSubmitNormally ? 'Confirmer la Remise' : "Mettre en File d'Attente"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
