import React, { useState, useCallback } from 'react';
import { Plus, Trash2, Upload, Shield, FileText } from 'lucide-react';
import { useEntityUpload } from '../../../../../hooks/useEntityUpload';
import CollateralChecklist from '../components/CollateralChecklist';
import PlanRequirementsBanner from '../components/PlanRequirementsBanner';
import { TYPES_GARANTIES } from '../constants';
import type { EnqueteFormData, CreditPlanInfo, Garantie } from '../types';

interface StepGarantiesDocumentsProps {
  formData: EnqueteFormData;
  updateField: (key: keyof EnqueteFormData, value: any) => void;
  readOnly: boolean;
  creditPlan: CreditPlanInfo | null;
  markTouched: (field: string) => void;
  getFieldError: (field: string) => string | null;
}

export default function StepGarantiesDocuments({
  formData, updateField, readOnly, creditPlan, markTouched, getFieldError,
}: StepGarantiesDocumentsProps) {
  const [newGarantie, setNewGarantie] = useState<Garantie>({ type: '', description: '', valeur: '' });
  const [showAddForm, setShowAddForm] = useState(false);

  const { uploadFile, isUploading } = useEntityUpload({
    fileType: 'investigation',
    entityType: 'client',
    entityId: formData.client_id || '',
  });

  const addGarantie = () => {
    if (!newGarantie.type) return;
    updateField('garanties_proposees', [...formData.garanties_proposees, { ...newGarantie }]);
    setNewGarantie({ type: '', description: '', valeur: '' });
    setShowAddForm(false);
  };

  const removeGarantie = (index: number) => {
    updateField('garanties_proposees', formData.garanties_proposees.filter((_, i) => i !== index));
  };

  const handleSelectCollateralType = useCallback((type: string) => {
    setNewGarantie({ type, description: '', valeur: '' });
    setShowAddForm(true);
  }, []);

  const handleDocumentUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await uploadFile(file);
      if (result?.url) {
        updateField('documents_justificatifs', [...formData.documents_justificatifs, result.url]);
      }
    } catch { /* handled by upload hook */ }
    e.target.value = '';
  }, [uploadFile, formData, updateField]);

  const removeDocument = (index: number) => {
    updateField('documents_justificatifs', formData.documents_justificatifs.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      {/* Plan banner */}
      {creditPlan && <PlanRequirementsBanner creditPlan={creditPlan} />}

      {/* Plan-guided checklist */}
      {creditPlan && (creditPlan.collateralTypes?.length || creditPlan.documentsRequis?.length) ? (
        <CollateralChecklist
          creditPlan={creditPlan}
          garanties={formData.garanties_proposees}
          documents={formData.documents_justificatifs}
          onSelectCollateralType={readOnly ? undefined : handleSelectCollateralType}
        />
      ) : null}

      {/* Existing garanties */}
      <div className="bg-surface p-3 rounded-lg border border-edge">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-content-secondary">
            <Shield size={14} className="inline mr-1.5" />
            Garanties Proposées ({formData.garanties_proposees.length})
          </label>
          {creditPlan?.collateralRequired && formData.garanties_proposees.length === 0 && (
            <span className="text-xs text-status-danger">Au moins 1 requise</span>
          )}
        </div>

        {formData.garanties_proposees.length > 0 && (
          <div className="space-y-2 mb-3">
            {formData.garanties_proposees.map((g, i) => (
              <div key={i} className="flex items-start gap-2 bg-surface-subtle rounded-lg p-2.5 text-xs">
                <div className="flex-1">
                  <div className="font-medium text-content-primary">{g.type}</div>
                  {g.description && <p className="text-content-muted mt-0.5">{g.description}</p>}
                  {g.valeur && <p className="text-content-secondary mt-0.5">Valeur : {Number(g.valeur).toLocaleString('fr-FR')}</p>}
                </div>
                {!readOnly && (
                  <button type="button" onClick={() => removeGarantie(i)} className="text-status-danger hover:text-status-danger/80 mt-0.5">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add garantie form */}
        {!readOnly && (
          <>
            {showAddForm ? (
              <div className="space-y-2 p-2.5 bg-surface-subtle rounded-lg border border-edge-subtle">
                <select
                  value={newGarantie.type}
                  onChange={(e) => setNewGarantie(p => ({ ...p, type: e.target.value }))}
                  className="w-full bg-input border border-input-border rounded-lg px-3 py-2 text-xs text-content-primary focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="">Type de garantie</option>
                  {TYPES_GARANTIES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input
                  type="text"
                  value={newGarantie.description}
                  onChange={(e) => setNewGarantie(p => ({ ...p, description: e.target.value }))}
                  placeholder="Description (optionnel)"
                  className="w-full bg-input border border-input-border rounded-lg px-3 py-2 text-xs text-content-primary focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <input
                  type="number"
                  min="0"
                  value={newGarantie.valeur}
                  onChange={(e) => setNewGarantie(p => ({ ...p, valeur: e.target.value }))}
                  placeholder="Valeur estimée"
                  className="w-full bg-input border border-input-border rounded-lg px-3 py-2 text-xs text-content-primary focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={addGarantie}
                    disabled={!newGarantie.type}
                    className="flex-1 py-1.5 bg-accent text-white text-xs font-medium rounded-lg hover:bg-accent/90 transition disabled:opacity-50"
                  >
                    Ajouter
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAddForm(false); setNewGarantie({ type: '', description: '', valeur: '' }); }}
                    className="px-3 py-1.5 text-xs text-content-muted hover:text-content-secondary transition"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-edge rounded-lg text-xs text-content-muted hover:text-accent hover:border-accent/30 transition"
              >
                <Plus size={14} /> Ajouter une garantie
              </button>
            )}
          </>
        )}
      </div>

      {/* Documents */}
      <div className="bg-surface p-3 rounded-lg border border-edge">
        <label className="block text-xs font-semibold text-content-secondary mb-2">
          <FileText size={14} className="inline mr-1.5" />
          Documents Justificatifs ({formData.documents_justificatifs.length})
        </label>

        {formData.documents_justificatifs.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {formData.documents_justificatifs.map((url, i) => (
              <div key={i} className="flex items-center gap-2 bg-surface-subtle rounded-lg p-2 text-xs">
                <FileText size={14} className="text-accent shrink-0" />
                <span className="flex-1 text-content-primary truncate">{url.split('/').pop()}</span>
                {!readOnly && (
                  <button type="button" onClick={() => removeDocument(i)} className="text-status-danger hover:text-status-danger/80">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {!readOnly && (
          <label className="flex items-center justify-center gap-1.5 py-2 border border-dashed border-edge rounded-lg text-xs text-content-muted hover:text-accent hover:border-accent/30 transition cursor-pointer">
            <Upload size={14} /> Téléverser un document
            <input type="file" className="hidden" onChange={handleDocumentUpload} disabled={isUploading} />
          </label>
        )}
      </div>
    </div>
  );
}
