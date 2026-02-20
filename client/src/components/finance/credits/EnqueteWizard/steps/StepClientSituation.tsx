import React, { useState, useEffect } from 'react';
import { User, Info, Heart, Users, Home } from 'lucide-react';
import { clientApi } from '../../../../../lib/api-client';
import { formatClientName } from '../../../../../lib/format';
import { StatutClient } from '@shared/enum/status-constants';
import { SITUATIONS_MATRIMONIALES, TYPES_HABITATION } from '../constants';
import type { EnqueteFormData, CreditPlanInfo } from '../types';

interface StepClientSituationProps {
  formData: EnqueteFormData;
  updateField: (key: keyof EnqueteFormData, value: any) => void;
  readOnly: boolean;
  creditPlan: CreditPlanInfo | null;
  clientNom?: string;
  clientId?: string;
  initialData?: any;
  markTouched: (field: string) => void;
  getFieldError: (field: string) => string | null;
}

interface Client {
  id: string;
  nom: string;
  prenom?: string;
  photoProfile?: string;
}

export default function StepClientSituation({
  formData, updateField, readOnly, creditPlan, clientNom, clientId, initialData, markTouched, getFieldError,
}: StepClientSituationProps) {
  const [clients, setClients] = useState<Client[]>([]);

  useEffect(() => {
    if (!clientId && !formData.client_id) {
      clientApi.getAll({ statut: StatutClient.ACTIF }).then((data: any) => {
        const list = (data.data || data || []).map((c: any) => ({
          id: c.id,
          nom: c.user?.nom || c.nom || '',
          prenom: c.user?.prenom || c.prenom || '',
          photoProfile: c.user?.photoProfile || c.photoProfile || '',
        }));
        setClients(list);
      }).catch(() => {});
    }
  }, [clientId, formData.client_id]);

  return (
    <div className="space-y-4">
      {/* Client selector (only if clientId not pre-set) */}
      {!clientId && (
        <div className="bg-surface p-3 rounded-lg border border-edge">
          <label className="block text-xs font-semibold text-content-secondary mb-1.5">
            <User size={14} className="inline mr-1.5" />
            Sélectionner le Client *
          </label>
          <select
            value={formData.client_id}
            onChange={(e) => updateField('client_id', e.target.value)}
            onBlur={() => markTouched('client_id')}
            className="w-full bg-input border border-input-border rounded-lg px-3 py-2 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-input-focus"
          >
            <option value="">-- Choisir un client --</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{formatClientName(c.nom, c.prenom)}</option>
            ))}
          </select>
          {getFieldError('client_id') && (
            <p className="text-xs text-status-danger mt-1">{getFieldError('client_id')}</p>
          )}
        </div>
      )}

      {/* Info banner */}
      {!readOnly && (
        <div className="flex items-start gap-2 p-3 bg-status-info-bg border border-status-info/20 rounded-lg text-xs text-status-info">
          <Info size={16} className="shrink-0 mt-0.5" />
          <p>
            Les informations ci-dessous seront mises à jour sur le profil du client <strong>après validation par le superviseur</strong>.
            Renseignez ce que vous observez lors de l'enquête terrain.
          </p>
        </div>
      )}

      {/* Situation matrimoniale */}
      <div className="bg-surface p-3 rounded-lg border border-edge">
        <label className="block text-xs font-semibold text-content-secondary mb-1.5">
          <Heart size={14} className="inline mr-1.5" />
          Situation Matrimoniale *
        </label>
        <select
          value={formData.situationMatrimoniale}
          onChange={(e) => updateField('situationMatrimoniale', e.target.value)}
          onBlur={() => markTouched('situationMatrimoniale')}
          className="w-full bg-input border border-input-border rounded-lg px-3 py-2 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-input-focus"
        >
          <option value="">-- Sélectionner --</option>
          {SITUATIONS_MATRIMONIALES.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        {getFieldError('situationMatrimoniale') && (
          <p className="text-xs text-status-danger mt-1">{getFieldError('situationMatrimoniale')}</p>
        )}
      </div>

      {/* Personnes à charge */}
      <div className="bg-surface p-3 rounded-lg border border-edge">
        <label className="block text-xs font-semibold text-content-secondary mb-1.5">
          <Users size={14} className="inline mr-1.5" />
          Nombre de Personnes à Charge *
        </label>
        <input
          type="number"
          min="0"
          max="30"
          value={formData.personnesCharge}
          onChange={(e) => updateField('personnesCharge', e.target.value)}
          onBlur={() => markTouched('personnesCharge')}
          placeholder="0"
          className="w-full bg-input border border-input-border rounded-lg px-3 py-2 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-input-focus"
        />
        {getFieldError('personnesCharge') && (
          <p className="text-xs text-status-danger mt-1">{getFieldError('personnesCharge')}</p>
        )}
      </div>

      {/* Type d'habitation */}
      <div className="bg-surface p-3 rounded-lg border border-edge">
        <label className="block text-xs font-semibold text-content-secondary mb-1.5">
          <Home size={14} className="inline mr-1.5" />
          Type d'Habitation *
        </label>
        <select
          value={formData.typeHabitation}
          onChange={(e) => updateField('typeHabitation', e.target.value)}
          onBlur={() => markTouched('typeHabitation')}
          className="w-full bg-input border border-input-border rounded-lg px-3 py-2 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-input-focus"
        >
          <option value="">-- Sélectionner --</option>
          {TYPES_HABITATION.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        {getFieldError('typeHabitation') && (
          <p className="text-xs text-status-danger mt-1">{getFieldError('typeHabitation')}</p>
        )}
      </div>

      {/* Plan requirements preview */}
      {creditPlan && (
        <div className="bg-surface-subtle p-3 rounded-lg border border-edge-subtle text-xs text-content-secondary">
          <p className="font-semibold mb-1">Critères d'éligibilité du plan "{creditPlan.nom}" :</p>
          <ul className="space-y-0.5 ml-4 list-disc">
            {creditPlan.maxDebtToIncomeRatio && (
              <li>Ratio d'endettement max : {creditPlan.maxDebtToIncomeRatio}%</li>
            )}
            {creditPlan.collateralRequired && (
              <li>Garanties obligatoires</li>
            )}
            {creditPlan.documentsRequis && creditPlan.documentsRequis.length > 0 && (
              <li>{creditPlan.documentsRequis.length} document(s) requis</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
