import React, { useState, useMemo } from 'react';
import { Briefcase, DollarSign, TrendingUp, Plus, Trash2, Clock } from 'lucide-react';
import { CATEGORIES_ACTIVITE } from '../constants';
import { useDebtRatioCalculation } from '../hooks/useDebtRatioCalculation';
import type { EnqueteFormData, CreditPlanInfo, AutreCredit } from '../types';

interface StepActiviteRevenusProps {
  formData: EnqueteFormData;
  updateField: (key: keyof EnqueteFormData, value: any) => void;
  readOnly: boolean;
  creditPlan: CreditPlanInfo | null;
  markTouched: (field: string) => void;
  getFieldError: (field: string) => string | null;
}

export default function StepActiviteRevenus({
  formData, updateField, readOnly, creditPlan, markTouched, getFieldError,
}: StepActiviteRevenusProps) {
  const [seniorityValue, setSeniorityValue] = useState<string>(formData.anciennete_activite || '');
  const [seniorityUnit, setSeniorityUnit] = useState<'days' | 'months' | 'years'>('months');
  const [newCredit, setNewCredit] = useState<AutreCredit>({ organisme: '', montant: '', echeance: '' });

  const typesActivite = formData.categorie_activite ? (CATEGORIES_ACTIVITE[formData.categorie_activite] || []) : [];

  // Convert seniority to months
  const handleSeniorityChange = (val: string, unit: 'days' | 'months' | 'years') => {
    setSeniorityValue(val);
    setSeniorityUnit(unit);
    const num = parseFloat(val) || 0;
    let months: number;
    switch (unit) {
      case 'days': months = Math.round(num / 30); break;
      case 'years': months = Math.round(num * 12); break;
      default: months = Math.round(num);
    }
    updateField('anciennete_activite', months.toString());
  };

  // Revenue calculation
  const handleRevenuJournalier = (val: string) => {
    updateField('revenu_journalier', val);
    const journalier = parseFloat(val) || 0;
    const jours = parseInt(formData.jours_travail_mois) || 26;
    updateField('revenu_mensuel_declare', Math.round(journalier * jours).toString());
  };

  // Debt ratio preview
  const debtRatio = useDebtRatioCalculation({
    montant: parseFloat(formData.montant_demande) || 0,
    revenuMensuel: parseFloat(formData.revenu_mensuel_declare) || 0,
    chargesMensuelles: parseFloat(formData.charges_mensuelles) || 0,
    autresCredits: formData.autres_credits,
    creditPlan,
  });

  const addCredit = () => {
    if (!newCredit.organisme || !newCredit.montant) return;
    updateField('autres_credits', [...formData.autres_credits, { ...newCredit }]);
    setNewCredit({ organisme: '', montant: '', echeance: '' });
  };

  const removeCredit = (index: number) => {
    updateField('autres_credits', formData.autres_credits.filter((_, i) => i !== index));
  };

  const riskColors = { good: 'text-status-success', acceptable: 'text-status-warning', risky: 'text-status-danger' };
  const riskLabels = { good: 'Bon', acceptable: 'Correct', risky: 'Risqué' };

  const seniorityDisplay = useMemo(() => {
    const months = parseInt(formData.anciennete_activite) || 0;
    if (months >= 12) return `${Math.floor(months / 12)} an(s) ${months % 12 ? `et ${months % 12} mois` : ''}`;
    return `${months} mois`;
  }, [formData.anciennete_activite]);

  return (
    <div className="space-y-4">
      {/* Catégorie activité */}
      <div className="bg-surface p-3 rounded-lg border border-edge">
        <label className="block text-xs font-semibold text-content-secondary mb-1.5">
          <Briefcase size={14} className="inline mr-1.5" />
          Catégorie d'Activité *
        </label>
        <select
          value={formData.categorie_activite}
          onChange={(e) => { updateField('categorie_activite', e.target.value); updateField('type_activite', ''); }}
          onBlur={() => markTouched('categorie_activite')}
          className="w-full bg-input border border-input-border rounded-lg px-3 py-2 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-input-focus"
        >
          <option value="">-- Sélectionner --</option>
          {Object.keys(CATEGORIES_ACTIVITE).map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      {/* Type activité */}
      {typesActivite.length > 0 && (
        <div className="bg-surface p-3 rounded-lg border border-edge">
          <label className="block text-xs font-semibold text-content-secondary mb-1.5">Type d'Activité *</label>
          <select
            value={formData.type_activite}
            onChange={(e) => updateField('type_activite', e.target.value)}
            onBlur={() => markTouched('type_activite')}
            className="w-full bg-input border border-input-border rounded-lg px-3 py-2 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-input-focus"
          >
            <option value="">-- Sélectionner --</option>
            {typesActivite.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      )}

      {/* Ancienneté */}
      <div className="bg-surface p-3 rounded-lg border border-edge">
        <label className="block text-xs font-semibold text-content-secondary mb-1.5">
          <Clock size={14} className="inline mr-1.5" />
          Ancienneté dans l'Activité *
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            min="0"
            value={seniorityValue}
            onChange={(e) => handleSeniorityChange(e.target.value, seniorityUnit)}
            onBlur={() => markTouched('anciennete_activite')}
            placeholder="Durée"
            className="flex-1 bg-input border border-input-border rounded-lg px-3 py-2 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-input-focus"
          />
          <select
            value={seniorityUnit}
            onChange={(e) => handleSeniorityChange(seniorityValue, e.target.value as any)}
            className="bg-input border border-input-border rounded-lg px-3 py-2 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-input-focus"
          >
            <option value="days">Jours</option>
            <option value="months">Mois</option>
            <option value="years">Années</option>
          </select>
        </div>
        {formData.anciennete_activite && (
          <p className="text-xs text-content-muted mt-1">{seniorityDisplay}</p>
        )}
      </div>

      {/* Description */}
      <div className="bg-surface p-3 rounded-lg border border-edge">
        <label className="block text-xs font-semibold text-content-secondary mb-1.5">Description de l'Activité *</label>
        <textarea
          value={formData.description_activite}
          onChange={(e) => updateField('description_activite', e.target.value)}
          onBlur={() => markTouched('description_activite')}
          rows={3}
          placeholder="Décrivez l'activité du client (min. 10 caractères)"
          className="w-full bg-input border border-input-border rounded-lg px-3 py-2 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-input-focus resize-none"
        />
        <div className="flex justify-between text-xs mt-1">
          {getFieldError('description_activite') && (
            <span className="text-status-danger">{getFieldError('description_activite')}</span>
          )}
          <span className="text-content-muted ml-auto">{formData.description_activite.length}/10 min</span>
        </div>
      </div>

      {/* Revenus */}
      <div className="bg-surface p-3 rounded-lg border border-edge">
        <label className="block text-xs font-semibold text-content-secondary mb-2">
          <DollarSign size={14} className="inline mr-1.5" />
          Revenus
        </label>

        {/* Type revenu toggle */}
        <div className="flex gap-1 mb-3 bg-surface-subtle rounded-lg p-1">
          {['Mensuel', 'Journalier'].map(type => (
            <button
              key={type}
              type="button"
              onClick={() => updateField('type_revenu', type)}
              className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition ${
                formData.type_revenu === type
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-content-muted hover:text-content-secondary'
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        {formData.type_revenu === 'Journalier' ? (
          <div className="space-y-2">
            <div>
              <label className="text-xs text-content-muted">Revenu journalier *</label>
              <input
                type="number"
                min="0"
                value={formData.revenu_journalier}
                onChange={(e) => handleRevenuJournalier(e.target.value)}
                onBlur={() => markTouched('revenu_mensuel_declare')}
                placeholder="Ex: 5000"
                className="w-full bg-input border border-input-border rounded-lg px-3 py-2 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-input-focus"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-content-muted">Jours/mois</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={formData.jours_travail_mois}
                  onChange={(e) => {
                    updateField('jours_travail_mois', e.target.value);
                    const j = parseFloat(formData.revenu_journalier) || 0;
                    updateField('revenu_mensuel_declare', Math.round(j * (parseInt(e.target.value) || 26)).toString());
                  }}
                  className="w-full bg-input border border-input-border rounded-lg px-3 py-2 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-input-focus"
                />
              </div>
              <div>
                <label className="text-xs text-content-muted">Revenu mensuel calculé</label>
                <div className="bg-surface-subtle border border-edge-subtle rounded-lg px-3 py-2 text-sm font-medium text-content-primary">
                  {Number(formData.revenu_mensuel_declare || 0).toLocaleString('fr-FR')}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <label className="text-xs text-content-muted">Revenu mensuel *</label>
            <input
              type="number"
              min="0"
              value={formData.revenu_mensuel_declare}
              onChange={(e) => updateField('revenu_mensuel_declare', e.target.value)}
              onBlur={() => markTouched('revenu_mensuel_declare')}
              placeholder="Ex: 150000"
              className="w-full bg-input border border-input-border rounded-lg px-3 py-2 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-input-focus"
            />
          </div>
        )}
      </div>

      {/* Charges */}
      <div className="bg-surface p-3 rounded-lg border border-edge">
        <label className="block text-xs font-semibold text-content-secondary mb-1.5">Charges Mensuelles</label>
        <input
          type="number"
          min="0"
          value={formData.charges_mensuelles}
          onChange={(e) => updateField('charges_mensuelles', e.target.value)}
          placeholder="Ex: 30000"
          className="w-full bg-input border border-input-border rounded-lg px-3 py-2 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-input-focus"
        />
      </div>

      {/* Autres crédits */}
      <div className="bg-surface p-3 rounded-lg border border-edge">
        <label className="block text-xs font-semibold text-content-secondary mb-2">Autres Crédits en Cours</label>

        {formData.autres_credits.length > 0 && (
          <div className="space-y-2 mb-3">
            {formData.autres_credits.map((c, i) => (
              <div key={i} className="flex items-center gap-2 bg-surface-subtle rounded-lg p-2 text-xs">
                <span className="flex-1 font-medium text-content-primary">{c.organisme}</span>
                <span className="text-content-secondary">{Number(c.montant).toLocaleString('fr-FR')}/mois</span>
                {!readOnly && (
                  <button type="button" onClick={() => removeCredit(i)} className="text-status-danger hover:text-status-danger/80">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {!readOnly && (
          <div className="flex gap-2">
            <input
              type="text"
              value={newCredit.organisme}
              onChange={(e) => setNewCredit(p => ({ ...p, organisme: e.target.value }))}
              placeholder="Organisme"
              className="flex-1 bg-input border border-input-border rounded-lg px-2 py-1.5 text-xs text-content-primary focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <input
              type="number"
              min="0"
              value={newCredit.montant}
              onChange={(e) => setNewCredit(p => ({ ...p, montant: e.target.value }))}
              placeholder="Montant"
              className="w-24 bg-input border border-input-border rounded-lg px-2 py-1.5 text-xs text-content-primary focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button
              type="button"
              onClick={addCredit}
              disabled={!newCredit.organisme || !newCredit.montant}
              className="p-1.5 bg-accent/10 text-accent rounded-lg hover:bg-accent/20 transition disabled:opacity-50"
            >
              <Plus size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Aperçu ratio d'endettement */}
      {(parseFloat(formData.revenu_mensuel_declare) > 0 && parseFloat(formData.montant_demande) > 0) && (
        <div className="bg-surface-subtle p-3 rounded-lg border border-edge-subtle">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={14} className="text-content-secondary" />
            <span className="text-xs font-semibold text-content-secondary">Aperçu du Ratio d'Endettement</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <span className="text-content-muted">Revenu net</span>
              <p className="font-medium text-content-primary">{debtRatio.revenuNet.toLocaleString('fr-FR')}</p>
            </div>
            <div>
              <span className="text-content-muted">Échéance est.</span>
              <p className="font-medium text-content-primary">{debtRatio.echeanceEstimee.toLocaleString('fr-FR')}</p>
              <p className="text-[10px] text-content-muted">{debtRatio.dureeLabel}</p>
            </div>
            <div>
              <span className="text-content-muted">Ratio</span>
              <p className={`font-bold ${riskColors[debtRatio.riskLevel]}`}>
                {debtRatio.tauxEndettement.toFixed(1)}%
              </p>
              <p className={`text-[10px] ${riskColors[debtRatio.riskLevel]}`}>{riskLabels[debtRatio.riskLevel]}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
