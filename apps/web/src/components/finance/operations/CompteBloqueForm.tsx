import React, { useState, useEffect, useCallback } from 'react';
import { X, User, Percent, DollarSign, Calendar, Lock, AlertCircle, Clock, TrendingUp, Settings2 } from 'lucide-react';
import { clientApi, compteBloqueApi, compteEpargneApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { StatutClient } from '@shared/enum/status-constants';

interface Client {
  id: string;
  nom: string;
  email: string;
  telephone: string;
}

interface Produit {
  id: string;
  code: string;
  nom: string;
  tauxInteret: string;
  frais: { ouverture?: number; cloture?: number } | null;
  regles: {
    depotInitialMinimum?: number;
    montantMax?: number;
    dureeJours?: number;
    penaliteRetraitAnticipe?: number;
    depotInitialObligatoire?: boolean;
    validationOuvertureRequise?: boolean;
  } | null;
}

interface CompteBloqueFormProps {
  onClose: () => void;
  onSuccess: () => void;
  clientId?: string;
}

function dureeJoursToMois(jours: number): number {
  return Math.round(jours / 30);
}

function formatDureeLabel(jours: number): string {
  if (jours < 30) return `${jours} jours`;
  const mois = Math.round(jours / 30);
  return mois === 1 ? '1 mois' : `${mois} mois`;
}

export default function CompteBloqueForm({ onClose, onSuccess, clientId }: CompteBloqueFormProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [selectedProduit, setSelectedProduit] = useState<Produit | null>(null);
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    client_id: clientId || '',
    montant_initial: '',
    duree_jours: 90,
    taux_interet: '8',
    penalite_retrait_anticipe: '10',
    description: ''
  });

  useEffect(() => {
    loadClients();
    loadProduits();
  }, []);

  const loadClients = useCallback(async () => {
    try {
      const data = await clientApi.getAllList();
      const activeClients = (data || []).filter((c: any) => c.statut === StatutClient.ACTIVE);
      setClients(activeClients);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des clients'));
    }
  }, []);

  const loadProduits = useCallback(async () => {
    try {
      const data = await compteEpargneApi.getProduits({ typeCompte: 'BLOCKED' });
      const active = (data || []).filter((p: any) => p.actif);
      setProduits(active);
      // Auto-select first product if available
      if (active.length > 0) {
        selectProduit(active[0]);
      } else {
        setIsCustom(true);
      }
    } catch (error) {
      // Fallback to custom mode if products can't be loaded
      setIsCustom(true);
    }
  }, []);

  const selectProduit = (produit: Produit) => {
    setSelectedProduit(produit);
    setIsCustom(false);
    const regles = produit.regles || {};
    setFormData(prev => ({
      ...prev,
      taux_interet: produit.tauxInteret || '0',
      duree_jours: regles.dureeJours || 90,
      penalite_retrait_anticipe: String(regles.penaliteRetraitAnticipe ?? 10),
    }));
    setErrors({});
  };

  const selectCustom = () => {
    setSelectedProduit(null);
    setIsCustom(true);
    setFormData(prev => ({
      ...prev,
      taux_interet: '8',
      duree_jours: 365,
      penalite_retrait_anticipe: '10',
    }));
    setErrors({});
  };

  const calculateEcheance = () => {
    const date = new Date();
    date.setDate(date.getDate() + formData.duree_jours);
    return date;
  };

  const calculateInteretsEstimes = () => {
    if (!formData.montant_initial || !formData.taux_interet) return 0;
    const montant = parseFloat(formData.montant_initial);
    const taux = parseFloat(formData.taux_interet) / 100;
    const dureeAns = formData.duree_jours / 365;
    return Math.round(montant * taux * dureeAns);
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.client_id) newErrors.client_id = 'Client requis';

    const montant = parseFloat(formData.montant_initial);
    if (!formData.montant_initial || montant <= 0) {
      newErrors.montant_initial = 'Montant invalide';
    } else if (selectedProduit?.regles) {
      const { depotInitialMinimum, montantMax } = selectedProduit.regles;
      if (depotInitialMinimum && montant < depotInitialMinimum) {
        newErrors.montant_initial = `Minimum ${depotInitialMinimum.toLocaleString()} FCFA`;
      }
      if (montantMax && montant > montantMax) {
        newErrors.montant_initial = `Maximum ${montantMax.toLocaleString()} FCFA`;
      }
    }

    if (!formData.taux_interet || parseFloat(formData.taux_interet) < 0) {
      newErrors.taux_interet = 'Taux d\'intérêt invalide';
    }
    if (!formData.duree_jours || formData.duree_jours <= 0) {
      newErrors.duree_jours = 'Durée invalide';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const montant = parseFloat(formData.montant_initial);
      const dateEcheance = calculateEcheance();

      await compteBloqueApi.create({
        client_id: formData.client_id,
        solde_initial: montant,
        produit_id: selectedProduit?.id,
        blocage_motif: 'FORCED_SAVINGS',
        blocage_fin: dateEcheance.toISOString().split('T')[0],
        // Extra metadata (not in Zod but may be used by service extensions)
        taux_interet: parseFloat(formData.taux_interet),
        duree_mois: dureeJoursToMois(formData.duree_jours),
        penalite_retrait_anticipe: parseFloat(formData.penalite_retrait_anticipe),
        description: formData.description,
      });

      toast.success('Compte bloqué créé avec succès');
      onSuccess();
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de la création du compte'));
      setErrors({ general: 'Erreur lors de la création du compte' });
    } finally {
      setLoading(false);
    }
  }, [formData, selectedProduit, onSuccess]);

  const echeance = calculateEcheance();
  const interetsEstimes = calculateInteretsEstimes();
  const montantFinal = parseFloat(formData.montant_initial || '0') + interetsEstimes;

  const hasProducts = produits.length > 0;
  const regles = selectedProduit?.regles;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl border border-edge w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-status-success/20 to-status-info/20 border-b border-edge p-6 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Lock className="text-status-success" size={24} />
            <div>
              <h2 className="text-2xl font-bold text-content-primary">Nouveau Compte Bloqué</h2>
              <p className="text-content-muted text-sm">Compte à terme avec taux d'intérêt fixe</p>
            </div>
          </div>
          <button onClick={onClose} className="text-content-muted hover:text-content-primary">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {errors.general && (
            <div className="bg-status-danger-bg border border-status-danger rounded-lg p-4">
              <span className="text-status-danger">{errors.general}</span>
            </div>
          )}

          {/* Product Selector */}
          {hasProducts && (
            <div>
              <label className="block text-sm font-semibold text-content-secondary mb-3">
                <TrendingUp size={16} className="inline mr-2" />
                Produit de Placement
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                {produits.map(produit => {
                  const r = produit.regles || {};
                  const selected = selectedProduit?.id === produit.id;
                  return (
                    <button
                      key={produit.id}
                      type="button"
                      onClick={() => selectProduit(produit)}
                      className={`text-left p-4 rounded-lg border-2 transition-all ${
                        selected
                          ? 'border-accent bg-accent/5'
                          : 'border-edge hover:border-edge-strong bg-surface-elevated'
                      }`}
                    >
                      <div className="font-bold text-content-primary text-sm">{produit.nom}</div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-content-muted">
                        <span className="flex items-center gap-1">
                          <Percent size={12} />
                          {produit.tauxInteret}%/an
                        </span>
                        {r.dureeJours && (
                          <span className="flex items-center gap-1">
                            <Clock size={12} />
                            {formatDureeLabel(r.dureeJours)}
                          </span>
                        )}
                      </div>
                      {(r.depotInitialMinimum || r.montantMax) && (
                        <div className="mt-1 text-xs text-content-muted">
                          {r.depotInitialMinimum ? `Min ${r.depotInitialMinimum.toLocaleString()}` : ''}
                          {r.depotInitialMinimum && r.montantMax ? ' — ' : ''}
                          {r.montantMax ? `Max ${r.montantMax.toLocaleString()} FCFA` : ''}
                        </div>
                      )}
                    </button>
                  );
                })}
                {/* Custom option */}
                <button
                  type="button"
                  onClick={selectCustom}
                  className={`text-left p-4 rounded-lg border-2 transition-all ${
                    isCustom
                      ? 'border-accent bg-accent/5'
                      : 'border-edge hover:border-edge-strong bg-surface-elevated'
                  }`}
                >
                  <div className="font-bold text-content-primary text-sm flex items-center gap-2">
                    <Settings2 size={14} />
                    Personnalisé
                  </div>
                  <div className="mt-2 text-xs text-content-muted">
                    Définir manuellement le taux, la durée et les conditions
                  </div>
                </button>
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            {/* Client Selector */}
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-content-secondary mb-2">
                <User size={16} className="inline mr-2" />
                Client *
              </label>
              <select
                value={formData.client_id}
                onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                className={`w-full bg-surface-elevated border ${errors.client_id ? 'border-status-danger' : 'border-edge-strong'} rounded-lg px-4 py-3 text-content-primary`}
                disabled={!!clientId}
              >
                <option value="">Sélectionner un client</option>
                {clients.map(client => (
                  <option key={client.id} value={client.id}>
                    {client.nom} - {client.telephone}
                  </option>
                ))}
              </select>
              {errors.client_id && <p className="text-status-danger text-sm mt-1">{errors.client_id}</p>}
            </div>

            {/* Amount */}
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-content-secondary mb-2">
                <DollarSign size={16} className="inline mr-2" />
                Montant à Bloquer (FCFA) *
              </label>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                value={formData.montant_initial}
                onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setFormData({ ...formData, montant_initial: v }); }}
                className={`w-full bg-surface-elevated border ${errors.montant_initial ? 'border-status-danger' : 'border-edge-strong'} rounded-lg px-4 py-3 text-content-primary text-lg`}
                placeholder={
                  regles?.depotInitialMinimum && regles?.montantMax
                    ? `${regles.depotInitialMinimum.toLocaleString()} — ${regles.montantMax.toLocaleString()} FCFA`
                    : regles?.depotInitialMinimum
                    ? `Minimum ${regles.depotInitialMinimum.toLocaleString()} FCFA`
                    : 'Montant du placement'
                }
              />
              {errors.montant_initial && <p className="text-status-danger text-sm mt-1">{errors.montant_initial}</p>}
            </div>

            {/* Duration */}
            <div>
              <label className="block text-sm font-semibold text-content-secondary mb-2">
                <Calendar size={16} className="inline mr-2" />
                Durée *
              </label>
              {isCustom ? (
                <select
                  value={formData.duree_jours}
                  onChange={(e) => setFormData({ ...formData, duree_jours: parseInt(e.target.value) })}
                  className="w-full bg-surface-elevated border border-edge-strong rounded-lg px-4 py-3 text-content-primary"
                >
                  <option value={30}>1 mois (30 jours)</option>
                  <option value={60}>2 mois (60 jours)</option>
                  <option value={90}>3 mois (90 jours)</option>
                  <option value={180}>6 mois (180 jours)</option>
                  <option value={270}>9 mois (270 jours)</option>
                  <option value={365}>12 mois (365 jours)</option>
                  <option value={730}>24 mois (730 jours)</option>
                  <option value={1095}>36 mois (1095 jours)</option>
                </select>
              ) : (
                <div className="w-full bg-surface-subtle border border-edge rounded-lg px-4 py-3 text-content-primary">
                  {formatDureeLabel(formData.duree_jours)} ({formData.duree_jours} jours)
                </div>
              )}
              {errors.duree_jours && <p className="text-status-danger text-sm mt-1">{errors.duree_jours}</p>}
            </div>

            {/* Interest Rate */}
            <div>
              <label className="block text-sm font-semibold text-content-secondary mb-2">
                <Percent size={16} className="inline mr-2" />
                Taux d'Intérêt Annuel (%) *
              </label>
              {isCustom ? (
                <input
                  inputMode="decimal"
                  value={formData.taux_interet}
                  onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'); setFormData({ ...formData, taux_interet: v }); }}
                  className={`w-full bg-surface-elevated border ${errors.taux_interet ? 'border-status-danger' : 'border-edge-strong'} rounded-lg px-4 py-3 text-content-primary`}
                  placeholder="8.0"
                />
              ) : (
                <div className="w-full bg-surface-subtle border border-edge rounded-lg px-4 py-3 text-content-primary">
                  {formData.taux_interet}%
                </div>
              )}
              {errors.taux_interet && <p className="text-status-danger text-sm mt-1">{errors.taux_interet}</p>}
            </div>

            {/* Early Withdrawal Penalty */}
            <div>
              <label className="block text-sm font-semibold text-content-secondary mb-2">
                Pénalité Retrait Anticipé (%)
              </label>
              {isCustom ? (
                <input
                  inputMode="decimal"
                  value={formData.penalite_retrait_anticipe}
                  onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'); setFormData({ ...formData, penalite_retrait_anticipe: v }); }}
                  className="w-full bg-surface-elevated border border-edge-strong rounded-lg px-4 py-3 text-content-primary"
                  placeholder="10"
                />
              ) : (
                <div className="w-full bg-surface-subtle border border-edge rounded-lg px-4 py-3 text-content-primary">
                  {formData.penalite_retrait_anticipe}%
                </div>
              )}
              <p className="text-xs text-content-muted mt-1">Appliqué sur les intérêts en cas de retrait anticipé</p>
            </div>

            {/* Description */}
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-content-secondary mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full bg-surface-elevated border border-edge-strong rounded-lg px-4 py-3 text-content-primary"
                rows={2}
                placeholder="Objectif du placement..."
              />
            </div>
          </div>

          {/* Estimation */}
          {formData.montant_initial && (
            <div className="bg-gradient-to-br from-status-success/20 to-status-info/20 border border-status-success/50 rounded-lg p-6">
              <h3 className="text-lg font-bold text-content-primary mb-4">Estimation du Placement</h3>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <div className="text-content-muted text-sm mb-1">Date d'échéance</div>
                  <div className="text-content-primary font-bold">{echeance.toLocaleDateString()}</div>
                </div>
                <div>
                  <div className="text-content-muted text-sm mb-1">Intérêts estimés</div>
                  <div className="text-status-success font-bold text-lg">{interetsEstimes.toLocaleString()} FCFA</div>
                </div>
                <div>
                  <div className="text-content-muted text-sm mb-1">Montant total à l'échéance</div>
                  <div className="text-status-success font-bold text-xl">{montantFinal.toLocaleString()} FCFA</div>
                </div>
              </div>
            </div>
          )}

          {/* Conditions */}
          <div className="bg-status-info-bg border border-status-info/50 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-status-info flex-shrink-0 mt-1" size={20} />
              <div className="text-sm text-content-secondary">
                <p className="font-semibold text-content-primary mb-1">Conditions du Compte Bloqué</p>
                <ul className="space-y-1 text-content-muted">
                  <li>Le montant sera bloqué jusqu'à la date d'échéance</li>
                  <li>Les intérêts sont calculés sur toute la durée</li>
                  <li>Retrait anticipé possible avec pénalité de {formData.penalite_retrait_anticipe}%</li>
                  <li>Taux d'intérêt fixe garanti</li>
                  <li>Aucun retrait partiel autorisé</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-surface-elevated hover:bg-surface-subtle text-content-primary rounded-lg font-semibold transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-status-success hover:bg-status-success/90 text-white rounded-lg font-semibold transition disabled:opacity-50"
            >
              {loading ? 'Création...' : 'Bloquer le Montant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
