import React, { useState, useEffect, useCallback } from 'react';
import { X, User, Percent, DollarSign, Calendar, Lock, AlertCircle } from 'lucide-react';
import { clientApi, compteBloqueApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { StatutClient, StatutCompte } from '@shared/enum/status-constants';

interface Client {
  id: string;
  nom: string;
  email: string;
  telephone: string;
}

interface CompteBloqueFormProps {
  onClose: () => void;
  onSuccess: () => void;
  clientId?: string;
}

export default function CompteBloqueForm({ onClose, onSuccess, clientId }: CompteBloqueFormProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    client_id: clientId || '',
    montant_initial: '',
    duree_mois: '12',
    taux_interet: '8',
    penalite_retrait_anticipe: '10',
    description: ''
  });

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = useCallback(async () => {
    try {
      const data = await clientApi.getAllList();
      // Filter for active clients only
      const activeClients = (data || []).filter((c: any) => c.statut === StatutClient.ACTIVE);
      setClients(activeClients);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des clients'));
    }
  }, []);

  const generateNumeroCompte = () => {
    const prefix = 'BLQ';
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}-${timestamp}-${random}`;
  };

  const calculateEcheance = () => {
    const date = new Date();
    date.setMonth(date.getMonth() + parseInt(formData.duree_mois));
    return date;
  };

  const calculateInteretsEstimes = () => {
    if (!formData.montant_initial || !formData.taux_interet || !formData.duree_mois) return 0;

    const montant = parseFloat(formData.montant_initial);
    const taux = parseFloat(formData.taux_interet) / 100;
    const duree = parseInt(formData.duree_mois) / 12;

    return montant * taux * duree;
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.client_id) newErrors.client_id = 'Client requis';
    if (!formData.montant_initial || parseFloat(formData.montant_initial) <= 0) {
      newErrors.montant_initial = 'Montant invalide';
    }
    if (!formData.taux_interet || parseFloat(formData.taux_interet) < 0) {
      newErrors.taux_interet = 'Taux d\'intérêt invalide';
    }
    if (!formData.duree_mois || parseInt(formData.duree_mois) <= 0) {
      newErrors.duree_mois = 'Durée invalide';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setLoading(true);

    try {
      const numeroCompte = generateNumeroCompte();
      const montant = parseFloat(formData.montant_initial);
      const dateEcheance = calculateEcheance();

      await compteBloqueApi.create({
        client_id: formData.client_id,
        numero_compte: numeroCompte,
        montant_initial: montant,
        montant_actuel: montant,
        taux_interet: parseFloat(formData.taux_interet),
        duree_mois: parseInt(formData.duree_mois),
        date_echeance: dateEcheance.toISOString().split('T')[0],
        penalite_retrait_anticipe: parseFloat(formData.penalite_retrait_anticipe),
        description: formData.description,
        statut: StatutCompte.ACTIVE
      });

      toast.success('Compte bloqué créé avec succès');
      onSuccess();
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de la création du compte'));
      setErrors({ general: 'Erreur lors de la création du compte' });
    } finally {
      setLoading(false);
    }
  }, [formData, onSuccess]);

  const echeance = calculateEcheance();
  const interetsEstimes = calculateInteretsEstimes();
  const montantFinal = parseFloat(formData.montant_initial || '0') + interetsEstimes;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-emerald-500/20 to-blue-500/20 border-b border-slate-700 p-6 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Lock className="text-emerald-400" size={24} />
            <div>
              <h2 className="text-2xl font-bold text-white">Nouveau Compte Bloqué</h2>
              <p className="text-slate-400 text-sm">Compte à terme avec taux d'intérêt fixe</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {errors.general && (
            <div className="bg-blue-500/20 border border-blue-500 rounded-lg p-4">
              <span className="text-blue-400">{errors.general}</span>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                <User size={16} className="inline mr-2" />
                Client *
              </label>
              <select
                value={formData.client_id}
                onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                className={`w-full bg-slate-700 border ${errors.client_id ? 'border-blue-500' : 'border-slate-600'} rounded-lg px-4 py-3 text-white`}
                disabled={!!clientId}
              >
                <option value="">Sélectionner un client</option>
                {clients.map(client => (
                  <option key={client.id} value={client.id}>
                    {client.nom} - {client.telephone}
                  </option>
                ))}
              </select>
              {errors.client_id && <p className="text-blue-400 text-sm mt-1">{errors.client_id}</p>}
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                <DollarSign size={16} className="inline mr-2" />
                Montant à Bloquer (FC) *
              </label>
              <input
                type="number"
                value={formData.montant_initial}
                onChange={(e) => setFormData({ ...formData, montant_initial: e.target.value })}
                className={`w-full bg-slate-700 border ${errors.montant_initial ? 'border-blue-500' : 'border-slate-600'} rounded-lg px-4 py-3 text-white text-lg`}
                placeholder="Montant minimum requis"
              />
              {errors.montant_initial && <p className="text-blue-400 text-sm mt-1">{errors.montant_initial}</p>}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                <Calendar size={16} className="inline mr-2" />
                Durée (mois) *
              </label>
              <select
                value={formData.duree_mois}
                onChange={(e) => setFormData({ ...formData, duree_mois: e.target.value })}
                className={`w-full bg-slate-700 border ${errors.duree_mois ? 'border-blue-500' : 'border-slate-600'} rounded-lg px-4 py-3 text-white`}
              >
                <option value="3">3 mois</option>
                <option value="6">6 mois</option>
                <option value="12">12 mois</option>
                <option value="24">24 mois</option>
                <option value="36">36 mois</option>
              </select>
              {errors.duree_mois && <p className="text-blue-400 text-sm mt-1">{errors.duree_mois}</p>}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                <Percent size={16} className="inline mr-2" />
                Taux d'Intérêt Annuel (%) *
              </label>
              <input
                type="number"
                step="0.1"
                value={formData.taux_interet}
                onChange={(e) => setFormData({ ...formData, taux_interet: e.target.value })}
                className={`w-full bg-slate-700 border ${errors.taux_interet ? 'border-blue-500' : 'border-slate-600'} rounded-lg px-4 py-3 text-white`}
                placeholder="8.0"
              />
              {errors.taux_interet && <p className="text-blue-400 text-sm mt-1">{errors.taux_interet}</p>}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                Pénalité Retrait Anticipé (%)
              </label>
              <input
                type="number"
                step="0.1"
                value={formData.penalite_retrait_anticipe}
                onChange={(e) => setFormData({ ...formData, penalite_retrait_anticipe: e.target.value })}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white"
                placeholder="10"
              />
              <p className="text-xs text-slate-400 mt-1">Appliqué sur les intérêts en cas de retrait anticipé</p>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white"
                rows={2}
                placeholder="Objectif du placement..."
              />
            </div>
          </div>

          {formData.montant_initial && (
            <div className="bg-gradient-to-br from-emerald-500/20 to-blue-500/20 border border-emerald-500/50 rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-4">Estimation du Placement</h3>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <div className="text-slate-400 text-sm mb-1">Date d'échéance</div>
                  <div className="text-white font-bold">{echeance.toLocaleDateString()}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-sm mb-1">Intérêts estimés</div>
                  <div className="text-green-400 font-bold text-lg">{interetsEstimes.toLocaleString()} FCFA</div>
                </div>
                <div>
                  <div className="text-slate-400 text-sm mb-1">Montant total à l'échéance</div>
                  <div className="text-emerald-400 font-bold text-xl">{montantFinal.toLocaleString()} FCFA</div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-blue-500/10 border border-blue-500/50 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-blue-400 flex-shrink-0 mt-1" size={20} />
              <div className="text-sm text-slate-300">
                <p className="font-semibold text-white mb-1">Conditions du Compte Bloqué</p>
                <ul className="space-y-1 text-slate-400">
                  <li>• Le montant sera bloqué jusqu'à la date d'échéance</li>
                  <li>• Les intérêts sont calculés sur toute la durée</li>
                  <li>• Retrait anticipé possible avec pénalité de {formData.penalite_retrait_anticipe}%</li>
                  <li>• Taux d'intérêt fixe garanti</li>
                  <li>• Aucun retrait partiel autorisé</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition disabled:opacity-50"
            >
              {loading ? 'Création...' : 'Bloquer le Montant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
