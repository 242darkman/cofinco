import React, { useState, useEffect, useMemo } from 'react';
import { User, DollarSign, Calendar, FileText, TrendingUp, AlertCircle, Save } from 'lucide-react';
import { clientApi, demandeCreditApi } from '../../../lib/api-client';
import { Modal, FormField, SelectField, Button } from '../../ui';

interface Client {
  id: string;
  nom: string;
  email: string;
  score: number;
  taux_remboursement: number;
  credit_total: number;
  photo_url?: string;
}

interface CreditRequestFormProps {
  onClose: () => void;
  onSuccess: () => void;
  clientId?: string;
  userRole?: string;
}

export default function CreditRequestForm({ onClose, onSuccess, clientId, userRole }: CreditRequestFormProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rateOverrideEnabled, setRateOverrideEnabled] = useState(false);
  const [rateOverrideReason, setRateOverrideReason] = useState('');

  const [formData, setFormData] = useState({
    client_id: clientId || '',
    montant_demande: '',
    duree_mois: '',
    taux_interet: '',
    frequence_remboursement: 'Mensuel',
    type_credit: 'Personnel',
    objet_credit: '',
    revenus_mensuels: '',
    charges_mensuelles: ''
  });

  const RATE_BASE = 12;
  const RATE_MIN = 10;
  const RATE_MAX = 24;
  const overrideRoles = new Set([
    'Administrateur',
    'Comptable',
    'Chef d\'Agence',
    'Gestionnaire Crédit',
    'Superviseur'
  ]);
  const canOverrideRate = userRole ? overrideRoles.has(userRole) : false;

  const [calculatedData, setCalculatedData] = useState({
    montantTotal: 0,
    montantEcheance: 0,
    nombreEcheances: 0,
    capaciteRemboursement: 0,
    tauxEndettement: 0
  });

  useEffect(() => {
    loadClients();
  }, []);

  const suggestedRate = useMemo(() => {
    const montant = parseFloat(formData.montant_demande) || 0;
    const dureeRaw = parseInt(formData.duree_mois) || 0;
    const isCommercial = formData.type_credit === 'Commercial';
    // Convert days to months for commercial (approx 30 days = 1 month)
    const duree = isCommercial ? dureeRaw / 30 : dureeRaw;
    
    const revenus = parseFloat(formData.revenus_mensuels) || 0;
    const charges = parseFloat(formData.charges_mensuelles) || 0;
    const client = clients.find(c => c.id === formData.client_id);
    const score = client?.score ?? 0;
    const tauxRemboursement = client?.taux_remboursement ?? 0;

    const revenusNet = Math.max(0, revenus - charges);
    const baseMonthly = duree > 0 ? (montant * (1 + RATE_BASE / 100 * (duree / 12))) / duree : 0;
    const debtRatio = revenusNet > 0 ? baseMonthly / revenusNet : 0;

    let adjustment = 0;

    if (duree > 24) {
      adjustment += 5;
    } else if (duree > 12) {
      adjustment += 3;
    } else if (duree > 6) {
      adjustment += 1;
    }

    if (debtRatio <= 0.3) {
      adjustment += 0;
    } else if (debtRatio <= 0.4) {
      adjustment += 2;
    } else if (debtRatio <= 0.5) {
      adjustment += 4;
    } else if (debtRatio > 0) {
      adjustment += 6;
    }

    if (score >= 75) {
      adjustment -= 1;
    } else if (score >= 60) {
      adjustment += 0;
    } else if (score >= 45) {
      adjustment += 2;
    } else if (score > 0) {
      adjustment += 4;
    }

    if (tauxRemboursement >= 95) {
      adjustment -= 1;
    } else if (tauxRemboursement > 0 && tauxRemboursement < 80) {
      adjustment += 2;
    }

    const rawRate = RATE_BASE + adjustment;
    return Math.min(RATE_MAX, Math.max(RATE_MIN, rawRate));
  }, [
    formData.montant_demande,
    formData.duree_mois,
    formData.revenus_mensuels,
    formData.charges_mensuelles,
    formData.client_id,
    formData.type_credit,
    clients
  ]);

  useEffect(() => {
    if (!rateOverrideEnabled) {
      const nextRate = suggestedRate.toFixed(1);
      setFormData(prev => (prev.taux_interet === nextRate ? prev : { ...prev, taux_interet: nextRate }));
    }
  }, [suggestedRate, rateOverrideEnabled]);

  useEffect(() => {
    calculateLoan();
  }, [formData.montant_demande, formData.duree_mois, formData.taux_interet, formData.frequence_remboursement, formData.revenus_mensuels, formData.charges_mensuelles, formData.type_credit]);

  const loadClients = async () => {
    try {
      const data = await clientApi.getAll();
      const activeClients = data
        .filter((c: any) => c.status === 'Actif')
        .map((c: any) => ({
          id: c.id,
          nom: `${c.nom} ${c.prenom || ''}`,
          email: c.email || '',
          score: c.score || 50,
          taux_remboursement: parseFloat(c.tauxRemboursement) || 100,
          credit_total: parseFloat(c.creditTotal) || 0,
          photo_url: c.photoUrl
        }));
      setClients(activeClients);
    } catch (error) {
      console.error('Erreur chargement clients:', error);
    }
  };

  const calculateLoan = () => {
    const montant = parseFloat(formData.montant_demande) || 0;
    const duree = parseInt(formData.duree_mois) || 0;
    const taux = parseFloat(formData.taux_interet) || suggestedRate || 0;
    const revenus = parseFloat(formData.revenus_mensuels) || 0;
    const charges = parseFloat(formData.charges_mensuelles) || 0;
    const isCommercial = formData.type_credit === 'Commercial';

    if (montant > 0 && duree > 0) {
      const montantTotal = montant * (1 + taux / 100);
      let nombreEcheances = duree;
      
      if (isCommercial) {
        // Durée en jours
        if (formData.frequence_remboursement === 'Journalier') {
          nombreEcheances = duree;
        } else if (formData.frequence_remboursement === 'Hebdomadaire') {
          nombreEcheances = Math.ceil(duree / 7);
        } else if (formData.frequence_remboursement === 'Mensuel') {
          nombreEcheances = Math.ceil(duree / 30);
        }
      } else {
        // Durée en mois
        if (formData.frequence_remboursement === 'Journalier') {
          nombreEcheances = duree * 30;
        } else if (formData.frequence_remboursement === 'Hebdomadaire') {
          nombreEcheances = duree * 4;
        }
      }

      const montantEcheance = nombreEcheances > 0 ? montantTotal / nombreEcheances : 0;
      const capaciteRemboursement = revenus - charges;

      let montantEcheanceMensuel = montantEcheance;
      
      // Calcul du montant mensuel équivalent pour le taux d'endettement
      if (formData.frequence_remboursement === 'Journalier') {
        montantEcheanceMensuel = montantEcheance * 30;
      } else if (formData.frequence_remboursement === 'Hebdomadaire') {
        montantEcheanceMensuel = montantEcheance * 4;
      }
      // Pour Mensuel, c'est déjà bon

      const tauxEndettement = revenus > 0 ? (montantEcheanceMensuel / revenus) * 100 : 0;

      setCalculatedData({
        montantTotal,
        montantEcheance,
        nombreEcheances,
        capaciteRemboursement,
        tauxEndettement
      });
    }
  };

  const calculateCreditScore = () => {
    const client = clients.find(c => c.id === formData.client_id);
    if (!client) return 0;

    let score = 0;

    if (client.score >= 80) score += 30;
    else if (client.score >= 60) score += 20;
    else if (client.score >= 40) score += 10;

    if (client.taux_remboursement >= 95) score += 25;
    else if (client.taux_remboursement >= 85) score += 15;
    else if (client.taux_remboursement >= 70) score += 5;

    if (calculatedData.tauxEndettement < 30) score += 25;
    else if (calculatedData.tauxEndettement < 40) score += 15;
    else if (calculatedData.tauxEndettement < 50) score += 5;

    const montant = parseFloat(formData.montant_demande) || 0;
    if (montant < 50000) score += 20;
    else if (montant < 100000) score += 15;
    else if (montant < 200000) score += 10;

    return Math.min(score, 100);
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.client_id) newErrors.client_id = 'Client requis';
    if (!formData.montant_demande || parseFloat(formData.montant_demande) <= 0) {
      newErrors.montant_demande = 'Montant invalide';
    }
    if (!formData.duree_mois || parseInt(formData.duree_mois) <= 0) {
      newErrors.duree_mois = 'Durée invalide';
    }
    if (!formData.objet_credit.trim()) newErrors.objet_credit = 'Objet requis';
    if (!formData.revenus_mensuels || parseFloat(formData.revenus_mensuels) <= 0) {
      newErrors.revenus_mensuels = 'Revenus requis';
    }

    if (calculatedData.tauxEndettement > 50) {
      newErrors.general = 'Taux d\'endettement trop élevé (> 50%)';
    }

    if (rateOverrideEnabled) {
      const overrideValue = parseFloat(formData.taux_interet);
      if (Number.isNaN(overrideValue) || overrideValue < RATE_MIN || overrideValue > RATE_MAX) {
        newErrors.taux_interet = `Le taux doit être entre ${RATE_MIN}% et ${RATE_MAX}%`;
      }
      if (!rateOverrideReason.trim()) {
        newErrors.taux_override_reason = 'Motif d\'override requis';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setLoading(true);

    try {
      const scoreCredit = calculateCreditScore();

      const overridePayload = rateOverrideEnabled
        ? {
            tauxInteretOverride: formData.taux_interet,
            tauxOverrideReason: rateOverrideReason,
          }
        : {};

      await demandeCreditApi.create({
        clientId: formData.client_id,
        montantDemande: formData.montant_demande,
        tauxInteret: suggestedRate.toFixed(1),
        dureeMois: parseInt(formData.duree_mois, 10),
        typeCredit: formData.type_credit,
        objetCredit: formData.objet_credit,
        frequenceRemboursement: formData.frequence_remboursement,
        revenusMensuels: formData.revenus_mensuels,
        chargesMensuelles: formData.charges_mensuelles,
        scoreCredit,
        statut: scoreCredit >= 70 ? 'En cours d\'analyse' : 'En attente',
        ...overridePayload,
      });

      onSuccess();
    } catch (error) {
      console.error('Erreur création demande:', error);
      setErrors({ general: 'Erreur lors de la création de la demande' });
    } finally {
      setLoading(false);
    }
  };

  const selectedClient = clients.find(c => c.id === formData.client_id);
  const scoreCredit = calculateCreditScore();

  const clientOptions = clients.map(client => ({
    value: client.id,
    label: `${client.nom} - Score: ${client.score}`
  }));

  const typeCreditOptions = [
    { value: 'Personnel', label: 'Personnel' },
    { value: 'Professionnel', label: 'Professionnel' },
    { value: 'Immobilier', label: 'Immobilier' },
    { value: 'Équipement', label: 'Équipement' },
    { value: 'Agricole', label: 'Agricole' },
    { value: 'Commercial', label: 'Commercial' }
  ];

  const frequenceOptions = [
    { value: 'Journalier', label: 'Journalier (chaque jour)' },
    { value: 'Hebdomadaire', label: 'Hebdomadaire (chaque semaine)' },
    { value: 'Mensuel', label: 'Mensuel (chaque mois)' }
  ];

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Nouvelle Demande de Crédit"
      size="2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button
            onClick={handleSubmit}
            disabled={loading}
            icon={Save}
            variant="primary"
            className="bg-green-600 hover:bg-green-700"
          >
            {loading ? 'Création...' : 'Créer la Demande'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {errors.general && (
          <div className="bg-blue-500/20 border border-blue-500 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="text-blue-400" size={20} />
            <span className="text-blue-400">{errors.general}</span>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          <div className="md:col-span-2">
            <SelectField
              label="Client"
              name="client_id"
              value={formData.client_id}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, client_id: e.target.value })}
              options={clientOptions}
              disabled={!!clientId}
              required
              error={errors.client_id}
            />
          </div>

          {selectedClient && (
            <div className="md:col-span-2 bg-slate-700/30 p-4 rounded-lg border border-slate-600 mb-2">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-slate-600 rounded-full flex items-center justify-center overflow-hidden border-2 border-slate-500">
                  {selectedClient.photo_url ? (
                    <img src={selectedClient.photo_url} alt={selectedClient.nom} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xl font-bold text-white">{selectedClient.nom.charAt(0)}</span>
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-white text-lg">{selectedClient.nom}</h3>
                  <div className="text-sm text-slate-400">Score Crédit: <span className={selectedClient.score >= 70 ? "text-green-400" : "text-yellow-400"}>{selectedClient.score}</span></div>
                  <div className="text-sm text-slate-400">Taux Remboursement: {selectedClient.taux_remboursement}%</div>
                </div>
              </div>
            </div>
          )}

          <SelectField
            label="Type de Crédit"
            name="type_credit"
            value={formData.type_credit}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, type_credit: e.target.value })}
            options={typeCreditOptions}
            required
          />

          <FormField
            label="Montant Demandé (FCFA)"
            name="montant_demande"
            type="number"
            value={formData.montant_demande}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, montant_demande: e.target.value })}
            placeholder="100000"
            error={errors.montant_demande}
            required
            icon={DollarSign}
          />

          <FormField
            label={formData.type_credit === 'Commercial' ? "Durée (jours)" : "Durée (mois)"}
            name="duree_mois"
            type="number"
            value={formData.duree_mois}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, duree_mois: e.target.value })}
            placeholder={formData.type_credit === 'Commercial' ? "30" : "12"}
            error={errors.duree_mois}
            required
            icon={Calendar}
          />

          <SelectField
            label="Fréquence de Remboursement"
            name="frequence_remboursement"
            value={formData.frequence_remboursement}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, frequence_remboursement: e.target.value })}
            options={frequenceOptions}
            required
            helperText={
              formData.type_credit === 'Commercial' ? (
                formData.frequence_remboursement === 'Journalier' ? `≈ ${parseInt(formData.duree_mois || '0')} paiements` :
                formData.frequence_remboursement === 'Hebdomadaire' ? `≈ ${Math.ceil(parseInt(formData.duree_mois || '0') / 7)} paiements` :
                `≈ ${Math.ceil(parseInt(formData.duree_mois || '0') / 30)} paiements`
              ) : (
                formData.frequence_remboursement === 'Journalier' ? `≈ ${parseInt(formData.duree_mois || '0') * 30} paiements` :
                formData.frequence_remboursement === 'Hebdomadaire' ? `≈ ${parseInt(formData.duree_mois || '0') * 4} paiements` :
                `≈ ${formData.duree_mois || '0'} paiements`
              )
            }
          />

          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              <TrendingUp size={16} className="inline mr-2" />
              Taux proposé (%) *
            </label>
            <div className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white h-11 flex items-center">
              {suggestedRate.toFixed(1)} %
            </div>
          </div>

          {canOverrideRate && (
            <div className="md:col-span-2">
              <label className="inline-flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rateOverrideEnabled}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRateOverrideEnabled(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500"
                />
                Ajuster le taux proposé
              </label>
            </div>
          )}

          {canOverrideRate && rateOverrideEnabled && (
            <>
              <FormField
                label="Taux ajusté (%)"
                name="taux_interet"
                type="number"
                step="0.1"
                value={formData.taux_interet}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, taux_interet: e.target.value })}
                error={errors.taux_interet}
                required
                icon={TrendingUp}
              />

              <div className="md:col-span-2">
                <FormField
                  label="Motif de l'ajustement"
                  name="taux_override_reason"
                  value={rateOverrideReason}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRateOverrideReason(e.target.value)}
                  placeholder="Ex: dossier prioritaire, garantie solide"
                  error={errors.taux_override_reason}
                  required
                />
              </div>
            </>
          )}

          <FormField
            label="Revenus Mensuels (FCFA)"
            name="revenus_mensuels"
            type="number"
            value={formData.revenus_mensuels}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, revenus_mensuels: e.target.value })}
            placeholder="50000"
            error={errors.revenus_mensuels}
            required
          />

          <FormField
            label="Charges Mensuelles (FCFA)"
            name="charges_mensuelles"
            type="number"
            value={formData.charges_mensuelles}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, charges_mensuelles: e.target.value })}
            placeholder="20000"
          />

          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              <FileText size={16} className="inline mr-2" />
              Objet du Crédit *
            </label>
            <textarea
              value={formData.objet_credit}
              onChange={(e) => setFormData({ ...formData, objet_credit: e.target.value })}
              className={`w-full bg-slate-700 border ${errors.objet_credit ? 'border-blue-500' : 'border-slate-600'} rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500`}
              rows={3}
              placeholder="Détails de l'utilisation des fonds..."
            />
            {errors.objet_credit && <p className="text-blue-400 text-sm mt-1">{errors.objet_credit}</p>}
          </div>
        </div>

        {formData.montant_demande && formData.duree_mois && (
          <div className="bg-slate-700/50 rounded-lg p-6 space-y-4">
            <h3 className="text-lg font-bold text-white mb-4">Analyse Prévisionnelle</h3>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-slate-800/50 rounded-lg p-4">
                <div className="text-slate-400 text-sm mb-1">Montant Total à Rembourser</div>
                <div className="text-2xl font-bold text-white">{calculatedData.montantTotal.toLocaleString()} FCFA</div>
                <div className="text-xs text-slate-400 mt-1">
                  Capital: {parseFloat(formData.montant_demande).toLocaleString()} FCFA +
                  Intérêts: {(calculatedData.montantTotal - parseFloat(formData.montant_demande || '0')).toLocaleString()} FCFA
                </div>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-4">
                <div className="text-slate-400 text-sm mb-1">
                  Montant par {formData.frequence_remboursement === 'Journalier' ? 'Jour' : formData.frequence_remboursement === 'Hebdomadaire' ? 'Semaine' : 'Mois'}
                </div>
                <div className="text-2xl font-bold text-green-400">{calculatedData.montantEcheance.toLocaleString()} FCFA</div>
                <div className="text-xs text-slate-400 mt-1">
                  {calculatedData.nombreEcheances} paiements de {calculatedData.montantEcheance.toFixed(0)} FCFA
                </div>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-4">
                <div className="text-slate-400 text-sm mb-1">Capacité de Remboursement</div>
                <div className="text-2xl font-bold text-cyan-400">{calculatedData.capaciteRemboursement.toLocaleString()} FCFA</div>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-4">
                <div className="text-slate-400 text-sm mb-1">Taux d'Endettement</div>
                <div className={`text-2xl font-bold ${calculatedData.tauxEndettement > 50 ? 'text-blue-400' : calculatedData.tauxEndettement > 40 ? 'text-cyan-400' : 'text-green-400'}`}>
                  {calculatedData.tauxEndettement.toFixed(1)}%
                </div>
              </div>
            </div>

            {selectedClient && (
              <div className="bg-slate-800/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-400 text-sm">Score de Crédit Calculé</span>
                  <span className={`text-2xl font-bold ${scoreCredit >= 70 ? 'text-green-400' : scoreCredit >= 50 ? 'text-cyan-400' : 'text-blue-400'}`}>
                    {scoreCredit}/100
                  </span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${scoreCredit >= 70 ? 'bg-green-500' : scoreCredit >= 50 ? 'bg-cyan-500' : 'bg-blue-500'}`}
                    style={{ width: `${scoreCredit}%` }}
                  />
                </div>
                <div className="text-xs text-slate-400 mt-2">
                  {scoreCredit >= 70 ? '✓ Profil favorable' : scoreCredit >= 50 ? '⚠ Profil acceptable' : '✗ Profil à risque'}
                </div>
              </div>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
