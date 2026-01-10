import React, { useState } from 'react';
import { 
  X, Check, RefreshCw, Shield, Users, FileText, 
  TrendingDown, Clock, TrendingUp, FileCheck, Loader2,
  ChevronRight, ChevronLeft
} from 'lucide-react';
import { toast } from 'sonner';

interface ElementNouveau {
  type: string;
  description: string;
  valeurAjoutee?: number;
  documents?: string[];
}

interface GarantieAdditionnelle {
  type: string;
  description: string;
  valeurEstimee: number;
  documents?: string[];
}

interface ReevaluationFormData {
  elementsNouveaux: ElementNouveau[];
  justification: string;
  nouveauMontantDemande: number;
  nouvelleDureeValeur?: number;
  nouvelleDureeUnite?: string;
  nouvelleFrequence?: string;
  garantiesAdditionnelles: GarantieAdditionnelle[];
  coEmprunteur?: {
    nom?: string;
    relation: string;
    revenusMensuels: number;
    consentement: boolean;
  };
  documentsJoints: string[];
}

interface Demande {
  id: string;
  numeroDemande: string;
  montantDemande: string | number;
  dureeValeur: number;
  dureeUnite: string;
  motifRejet?: string;
  dateRejet?: string;
  scoreCredit?: number;
  clientId: string;
}

interface Props {
  demande: Demande;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (reevaluation: any) => void;
}

type Step = 'elements' | 'ajustements' | 'garanties' | 'resume';

const TYPES_ELEMENTS = [
  { value: 'Garantie supplémentaire', icon: Shield, color: 'purple' },
  { value: 'Co-emprunteur', icon: Users, color: 'blue' },
  { value: 'Justificatif de revenus', icon: FileText, color: 'green' },
  { value: 'Réduction montant demandé', icon: TrendingDown, color: 'amber' },
  { value: 'Ajustement durée', icon: Clock, color: 'cyan' },
  { value: 'Amélioration situation', icon: TrendingUp, color: 'emerald' },
  { value: 'Document manquant', icon: FileCheck, color: 'slate' },
];

const formatMoney = (amount: number | string) => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('fr-FR').format(num) + ' FCFA';
};

const formatDate = (dateStr?: string) => {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('fr-FR');
};

export function ReevaluationModal({ demande, isOpen, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>('elements');
  const [formData, setFormData] = useState<ReevaluationFormData>({
    elementsNouveaux: [],
    justification: '',
    nouveauMontantDemande: Number(demande.montantDemande),
    garantiesAdditionnelles: [],
    documentsJoints: []
  });
  const [submitting, setSubmitting] = useState(false);

  const steps: Step[] = ['elements', 'ajustements', 'garanties', 'resume'];

  const addElement = (type: string) => {
    if (formData.elementsNouveaux.some(e => e.type === type)) {
      // Remove if already selected
      setFormData(prev => ({
        ...prev,
        elementsNouveaux: prev.elementsNouveaux.filter(e => e.type !== type)
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        elementsNouveaux: [...prev.elementsNouveaux, { type, description: '', documents: [] }]
      }));
    }
  };

  const updateElement = (idx: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      elementsNouveaux: prev.elementsNouveaux.map((el, i) => 
        i === idx ? { ...el, [field]: value } : el
      )
    }));
  };

  const removeElement = (idx: number) => {
    setFormData(prev => ({
      ...prev,
      elementsNouveaux: prev.elementsNouveaux.filter((_, i) => i !== idx)
    }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/demandes/${demande.id}/reevaluations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData)
      });
      
      const result = await response.json();
      
      if (!response.ok || !result.success) {
        toast.error(result.error?.message || 'Erreur lors de la création');
        return;
      }
      
      toast.success('Réévaluation créée avec succès');
      onSuccess(result.reevaluation);
      onClose();
    } catch (err) {
      toast.error('Erreur lors de la création');
    } finally {
      setSubmitting(false);
    }
  };

  const canGoNext = () => {
    if (step === 'elements') {
      return formData.elementsNouveaux.length > 0 && formData.justification.length >= 50;
    }
    return true;
  };

  const goToStep = (direction: 'next' | 'prev') => {
    const currentIdx = steps.indexOf(step);
    if (direction === 'next' && currentIdx < steps.length - 1) {
      setStep(steps[currentIdx + 1]);
    } else if (direction === 'prev' && currentIdx > 0) {
      setStep(steps[currentIdx - 1]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <RefreshCw className="text-amber-400" size={24} />
                Demande de Réévaluation
              </h2>
              <p className="text-slate-400 text-sm mt-1">{demande.numeroDemande}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="text-slate-400" size={20} />
            </button>
          </div>
          
          {/* Info box */}
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="text-xs text-red-400 mb-1">Motif de rejet initial</div>
            <p className="text-white text-sm">{demande.motifRejet || 'Non spécifié'}</p>
          </div>

          {/* Stepper */}
          <div className="flex items-center justify-between mt-4">
            {steps.map((s, i) => (
              <div key={s} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  step === s 
                    ? 'bg-amber-500 text-black' 
                    : steps.indexOf(step) > i 
                      ? 'bg-emerald-500 text-white' 
                      : 'bg-slate-700 text-slate-400'
                }`}>
                  {i + 1}
                </div>
                {i < steps.length - 1 && (
                  <div className={`w-12 h-0.5 mx-1 ${
                    steps.indexOf(step) > i ? 'bg-emerald-500' : 'bg-slate-700'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 'elements' && (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-white">Éléments nouveaux</h3>
              <p className="text-sm text-slate-400">
                Quels éléments nouveaux justifient cette demande de réévaluation ?
              </p>
              
              <div className="grid grid-cols-2 gap-3">
                {TYPES_ELEMENTS.map(type => {
                  const Icon = type.icon;
                  const isSelected = formData.elementsNouveaux.some(e => e.type === type.value);
                  return (
                    <button
                      key={type.value}
                      onClick={() => addElement(type.value)}
                      className={`p-4 rounded-xl border transition-all text-left ${
                        isSelected
                          ? 'bg-amber-500/20 border-amber-500/50'
                          : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      <Icon size={24} className={isSelected ? 'text-amber-400' : 'text-slate-400'} />
                      <div className={`text-sm mt-2 ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                        {type.value}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Selected elements with description */}
              {formData.elementsNouveaux.map((element, idx) => (
                <div key={idx} className="p-4 bg-slate-800/50 rounded-xl">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-amber-400 font-medium">{element.type}</span>
                    <button 
                      onClick={() => removeElement(idx)} 
                      className="text-red-400 hover:text-red-300"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <textarea
                    value={element.description}
                    onChange={(e) => updateElement(idx, 'description', e.target.value)}
                    placeholder="Description détaillée..."
                    className="w-full bg-slate-900/50 rounded-lg p-3 text-white text-sm border border-slate-700 focus:border-amber-500 focus:outline-none"
                    rows={2}
                  />
                </div>
              ))}

              {/* Justification */}
              <div className="mt-4">
                <label className="text-sm text-slate-400 mb-2 block">
                  Justification de la réévaluation *
                </label>
                <textarea
                  value={formData.justification}
                  onChange={(e) => setFormData(prev => ({ ...prev, justification: e.target.value }))}
                  placeholder="Expliquez en détail pourquoi cette demande mérite une réévaluation (minimum 50 caractères)..."
                  className="w-full bg-slate-800/50 rounded-xl p-4 text-white border border-slate-700 focus:border-amber-500 focus:outline-none"
                  rows={4}
                />
                <div className={`text-xs mt-1 ${
                  formData.justification.length >= 50 ? 'text-emerald-400' : 'text-slate-500'
                }`}>
                  {formData.justification.length}/50 caractères minimum
                </div>
              </div>
            </div>
          )}

          {step === 'ajustements' && (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-white">Ajustements proposés</h3>
              
              {/* Montant */}
              <div>
                <label className="text-sm text-slate-400 mb-2 block">
                  Nouveau montant demandé
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={formData.nouveauMontantDemande}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      nouveauMontantDemande: parseFloat(e.target.value) || 0
                    }))}
                    className="w-full bg-slate-800/50 rounded-xl p-4 text-white text-xl font-bold border border-slate-700 focus:border-amber-500 focus:outline-none"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                    FCFA
                  </span>
                </div>
                {formData.nouveauMontantDemande < Number(demande.montantDemande) && (
                  <div className="mt-2 text-sm text-emerald-400 flex items-center gap-2">
                    <TrendingDown size={14} />
                    Réduction de {formatMoney(Number(demande.montantDemande) - formData.nouveauMontantDemande)}
                    ({Math.round((1 - formData.nouveauMontantDemande / Number(demande.montantDemande)) * 100)}%)
                  </div>
                )}
              </div>

              {/* Durée */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-slate-400 mb-2 block">Durée</label>
                  <input
                    type="number"
                    value={formData.nouvelleDureeValeur || demande.dureeValeur}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      nouvelleDureeValeur: parseInt(e.target.value) || undefined
                    }))}
                    className="w-full bg-slate-800/50 rounded-xl p-4 text-white border border-slate-700 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-400 mb-2 block">Unité</label>
                  <select
                    value={formData.nouvelleDureeUnite || demande.dureeUnite}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      nouvelleDureeUnite: e.target.value
                    }))}
                    className="w-full bg-slate-800/50 rounded-xl p-4 text-white border border-slate-700 focus:border-amber-500 focus:outline-none"
                  >
                    <option value="Jour">Jour(s)</option>
                    <option value="Semaine">Semaine(s)</option>
                    <option value="Mois">Mois</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {step === 'garanties' && (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-white">Garanties additionnelles</h3>
              <p className="text-sm text-slate-400">
                Ajoutez des garanties supplémentaires pour renforcer votre dossier (optionnel).
              </p>
              
              <button
                onClick={() => setFormData(prev => ({
                  ...prev,
                  garantiesAdditionnelles: [
                    ...prev.garantiesAdditionnelles,
                    { type: '', description: '', valeurEstimee: 0, documents: [] }
                  ]
                }))}
                className="w-full p-4 border-2 border-dashed border-slate-600 rounded-xl text-slate-400 hover:border-amber-500 hover:text-amber-400 transition-colors"
              >
                + Ajouter une garantie
              </button>

              {formData.garantiesAdditionnelles.map((garantie, idx) => (
                <div key={idx} className="p-4 bg-slate-800/50 rounded-xl space-y-3">
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium text-slate-300">Garantie #{idx + 1}</span>
                    <button 
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        garantiesAdditionnelles: prev.garantiesAdditionnelles.filter((_, i) => i !== idx)
                      }))}
                      className="text-red-400 hover:text-red-300"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Type de garantie"
                    value={garantie.type}
                    onChange={(e) => {
                      const newGaranties = [...formData.garantiesAdditionnelles];
                      newGaranties[idx] = { ...garantie, type: e.target.value };
                      setFormData(prev => ({ ...prev, garantiesAdditionnelles: newGaranties }));
                    }}
                    className="w-full bg-slate-900/50 rounded-lg p-3 text-white text-sm border border-slate-700 focus:border-amber-500 focus:outline-none"
                  />
                  <textarea
                    placeholder="Description"
                    value={garantie.description}
                    onChange={(e) => {
                      const newGaranties = [...formData.garantiesAdditionnelles];
                      newGaranties[idx] = { ...garantie, description: e.target.value };
                      setFormData(prev => ({ ...prev, garantiesAdditionnelles: newGaranties }));
                    }}
                    className="w-full bg-slate-900/50 rounded-lg p-3 text-white text-sm border border-slate-700 focus:border-amber-500 focus:outline-none"
                    rows={2}
                  />
                  <input
                    type="number"
                    placeholder="Valeur estimée (FCFA)"
                    value={garantie.valeurEstimee || ''}
                    onChange={(e) => {
                      const newGaranties = [...formData.garantiesAdditionnelles];
                      newGaranties[idx] = { ...garantie, valeurEstimee: parseFloat(e.target.value) || 0 };
                      setFormData(prev => ({ ...prev, garantiesAdditionnelles: newGaranties }));
                    }}
                    className="w-full bg-slate-900/50 rounded-lg p-3 text-white text-sm border border-slate-700 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              ))}

              {/* Co-borrower section - appears when Co-emprunteur is selected */}
              {formData.elementsNouveaux.some(e => e.type === 'Co-emprunteur') && (
                <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl space-y-4">
                  <h4 className="text-md font-bold text-blue-400 flex items-center gap-2">
                    <Users size={18} />
                    Informations du Co-emprunteur
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-slate-400 mb-1 block">Nom complet</label>
                      <input
                        type="text"
                        placeholder="Nom du co-emprunteur"
                        value={formData.coEmprunteur?.nom || ''}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          coEmprunteur: {
                            ...prev.coEmprunteur,
                            nom: e.target.value,
                            relation: prev.coEmprunteur?.relation || '',
                            revenusMensuels: prev.coEmprunteur?.revenusMensuels || 0,
                            consentement: prev.coEmprunteur?.consentement || false
                          }
                        }))}
                        className="w-full bg-slate-900/50 rounded-lg p-3 text-white text-sm border border-slate-700 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-slate-400 mb-1 block">Relation</label>
                      <select
                        value={formData.coEmprunteur?.relation || ''}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          coEmprunteur: {
                            ...prev.coEmprunteur,
                            nom: prev.coEmprunteur?.nom,
                            relation: e.target.value,
                            revenusMensuels: prev.coEmprunteur?.revenusMensuels || 0,
                            consentement: prev.coEmprunteur?.consentement || false
                          }
                        }))}
                        className="w-full bg-slate-900/50 rounded-lg p-3 text-white text-sm border border-slate-700 focus:border-blue-500 focus:outline-none"
                      >
                        <option value="">Sélectionner...</option>
                        <option value="Conjoint(e)">Conjoint(e)</option>
                        <option value="Parent">Parent</option>
                        <option value="Frère/Sœur">Frère/Sœur</option>
                        <option value="Ami(e)">Ami(e)</option>
                        <option value="Collègue">Collègue</option>
                        <option value="Autre">Autre</option>
                      </select>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm text-slate-400 mb-1 block">Revenus mensuels (FCFA)</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={formData.coEmprunteur?.revenusMensuels || ''}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        coEmprunteur: {
                          ...prev.coEmprunteur,
                          nom: prev.coEmprunteur?.nom,
                          relation: prev.coEmprunteur?.relation || '',
                          revenusMensuels: parseFloat(e.target.value) || 0,
                          consentement: prev.coEmprunteur?.consentement || false
                        }
                      }))}
                      className="w-full bg-slate-900/50 rounded-lg p-3 text-white text-sm border border-slate-700 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.coEmprunteur?.consentement || false}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        coEmprunteur: {
                          ...prev.coEmprunteur,
                          nom: prev.coEmprunteur?.nom,
                          relation: prev.coEmprunteur?.relation || '',
                          revenusMensuels: prev.coEmprunteur?.revenusMensuels || 0,
                          consentement: e.target.checked
                        }
                      }))}
                      className="w-5 h-5 rounded bg-slate-700 border-slate-600 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-300">
                      Le co-emprunteur consent à participer à cette demande de crédit
                    </span>
                  </label>
                </div>
              )}
            </div>
          )}

          {step === 'resume' && (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-white">Résumé de la réévaluation</h3>
              
              {/* Comparatif avant/après */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                  <div className="text-xs text-red-400 mb-2">Demande initiale (Rejetée)</div>
                  <div className="text-2xl font-bold text-white">
                    {formatMoney(demande.montantDemande)}
                  </div>
                  <div className="text-sm text-slate-400">
                    {demande.dureeValeur} {demande.dureeUnite}
                  </div>
                  {demande.scoreCredit && (
                    <div className="mt-2 text-sm text-red-400">
                      Score: {demande.scoreCredit}/100
                    </div>
                  )}
                </div>
                
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                  <div className="text-xs text-amber-400 mb-2">Réévaluation proposée</div>
                  <div className="text-2xl font-bold text-white">
                    {formatMoney(formData.nouveauMontantDemande)}
                  </div>
                  <div className="text-sm text-slate-400">
                    {formData.nouvelleDureeValeur || demande.dureeValeur} {formData.nouvelleDureeUnite || demande.dureeUnite}
                  </div>
                  {formData.nouveauMontantDemande < Number(demande.montantDemande) && (
                    <div className="mt-2 text-sm text-emerald-400">
                      -{Math.round((1 - formData.nouveauMontantDemande / Number(demande.montantDemande)) * 100)}%
                    </div>
                  )}
                </div>
              </div>

              {/* Éléments nouveaux */}
              <div className="p-4 bg-slate-800/50 rounded-xl">
                <div className="text-sm text-slate-400 mb-2">
                  Éléments nouveaux ({formData.elementsNouveaux.length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {formData.elementsNouveaux.map((el, i) => (
                    <span key={i} className="px-3 py-1 bg-amber-500/20 text-amber-400 rounded-full text-sm">
                      {el.type}
                    </span>
                  ))}
                </div>
              </div>

              {/* Garanties */}
              {formData.garantiesAdditionnelles.length > 0 && (
                <div className="p-4 bg-slate-800/50 rounded-xl">
                  <div className="text-sm text-slate-400 mb-2">
                    Garanties additionnelles
                  </div>
                  <div className="space-y-2">
                    {formData.garantiesAdditionnelles.map((g, i) => (
                      <div key={i} className="flex justify-between">
                        <span className="text-white">{g.type || 'Non spécifié'}</span>
                        <span className="text-emerald-400">{formatMoney(g.valeurEstimee)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Justification */}
              <div className="p-4 bg-slate-800/50 rounded-xl">
                <div className="text-sm text-slate-400 mb-2">Justification</div>
                <p className="text-white text-sm">{formData.justification}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-700 flex justify-between">
          {step !== 'elements' ? (
            <button
              onClick={() => goToStep('prev')}
              className="px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors flex items-center gap-2"
            >
              <ChevronLeft size={18} />
              Précédent
            </button>
          ) : (
            <div />
          )}
          
          {step !== 'resume' ? (
            <button
              onClick={() => goToStep('next')}
              disabled={!canGoNext()}
              className="px-6 py-3 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-700 disabled:text-slate-500 text-black font-bold rounded-lg transition-colors flex items-center gap-2"
            >
              Suivant
              <ChevronRight size={18} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg transition-colors flex items-center gap-2"
            >
              {submitting ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <Check size={18} />
              )}
              Soumettre la réévaluation
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ReevaluationModal;
