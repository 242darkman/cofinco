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
  nouveauMontantDemande: number | '';
  nouvelleDureeValeur?: number | '';
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
  if (amount === '' || amount === undefined || amount === null) return '0 FCFA';
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
      return formData.elementsNouveaux.length > 0 && formData.justification.length >= 10;
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

  // Helper to handle number input changes smoothly
  const handleNumberChange = (
    field: keyof ReevaluationFormData,
    value: string
  ) => {
    // Allow empty string to clear the input
    if (value === '') {
      setFormData(prev => ({ ...prev, [field]: '' }));
      return;
    }
    
    // Parse but keep as string if it ends with decimal point or is just minus
    const num = parseFloat(value);
    if (!isNaN(num)) {
      setFormData(prev => ({ ...prev, [field]: num }));
    }
  };
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-xl w-full max-w-xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-700">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <RefreshCw className="text-amber-400" size={18} />
              <h2 className="text-base font-bold text-white">Réévaluation</h2>
              <span className="text-slate-500 text-sm">• {demande.numeroDemande}</span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="text-slate-400" size={18} />
            </button>
          </div>

          {/* Info box + Stepper inline */}
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-white text-xs line-clamp-1">
                <span className="text-red-400">Rejet: </span>
                {demande.motifRejet || 'Non spécifié'}
              </p>
            </div>

            {/* Stepper compact */}
            <div className="flex items-center gap-1">
              {steps.map((s, i) => (
                <div key={s} className="flex items-center">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                    step === s
                      ? 'bg-amber-500 text-black'
                      : steps.indexOf(step) > i
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-700 text-slate-400'
                  }`}>
                    {i + 1}
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`w-4 h-0.5 ${
                      steps.indexOf(step) > i ? 'bg-emerald-500' : 'bg-slate-700'
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {step === 'elements' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                Sélectionnez les éléments nouveaux justifiant la réévaluation
              </p>

              <div className="grid grid-cols-3 gap-2">
                {TYPES_ELEMENTS.map(type => {
                  const Icon = type.icon;
                  const isSelected = formData.elementsNouveaux.some(e => e.type === type.value);
                  return (
                    <button
                      key={type.value}
                      onClick={() => addElement(type.value)}
                      className={`p-2 rounded-lg border transition-all text-center ${
                        isSelected
                          ? 'bg-amber-500/20 border-amber-500/50'
                          : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      <Icon size={16} className={`mx-auto ${isSelected ? 'text-amber-400' : 'text-slate-400'}`} />
                      <div className={`text-xs mt-1 leading-tight ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                        {type.value}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Selected elements with description */}
              {formData.elementsNouveaux.map((element, idx) => (
                <div key={idx} className="p-2 bg-slate-800/50 rounded-lg">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-amber-400 text-xs font-medium">{element.type}</span>
                    <button onClick={() => removeElement(idx)} className="text-red-400 hover:text-red-300">
                      <X size={14} />
                    </button>
                  </div>
                  <textarea
                    value={element.description}
                    onChange={(e) => updateElement(idx, 'description', e.target.value)}
                    placeholder="Description..."
                    className="w-full bg-slate-900/50 rounded p-2 text-white text-xs border border-slate-700 focus:border-amber-500 focus:outline-none"
                    rows={1}
                  />
                </div>
              ))}

              {/* Justification */}
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Justification *</label>
                <textarea
                  value={formData.justification}
                  onChange={(e) => setFormData(prev => ({ ...prev, justification: e.target.value }))}
                  placeholder="Pourquoi cette demande mérite une réévaluation..."
                  className="w-full bg-slate-800/50 rounded-lg p-2 text-white text-sm border border-slate-700 focus:border-amber-500 focus:outline-none"
                  rows={2}
                />
                <div className={`text-xs mt-0.5 ${
                  formData.justification.length >= 10 ? 'text-emerald-400' : 'text-slate-500'
                }`}>
                  {formData.justification.length}/10 min
                </div>
              </div>
            </div>
          )}

          {step === 'ajustements' && (
            <div className="space-y-3">
              {/* Montant */}
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Nouveau montant</label>
                <div className="relative">
                  <input
                    type="number"
                    value={formData.nouveauMontantDemande}
                    onChange={(e) => handleNumberChange('nouveauMontantDemande', e.target.value)}
                    className="w-full bg-slate-800/50 rounded-lg p-2.5 text-white text-lg font-bold border border-slate-700 focus:border-amber-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">FCFA</span>
                </div>
                {Number(formData.nouveauMontantDemande) < Number(demande.montantDemande) && formData.nouveauMontantDemande !== '' && (
                  <div className="mt-1 text-xs text-emerald-400 flex items-center gap-1">
                    <TrendingDown size={12} />
                    -{Math.round((1 - Number(formData.nouveauMontantDemande) / Number(demande.montantDemande)) * 100)}% ({formatMoney(Number(demande.montantDemande) - Number(formData.nouveauMontantDemande))})
                  </div>
                )}
              </div>

              {/* Durée */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Durée</label>
                  <input
                    type="number"
                    value={formData.nouvelleDureeValeur === undefined ? demande.dureeValeur : formData.nouvelleDureeValeur}
                    onChange={(e) => {
                       const val = e.target.value;
                       setFormData(prev => ({
                         ...prev,
                         nouvelleDureeValeur: val === '' ? '' : parseInt(val)
                       }));
                    }}
                    className="w-full bg-slate-800/50 rounded-lg p-2.5 text-white border border-slate-700 focus:border-amber-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Unité</label>
                  <select
                    value={formData.nouvelleDureeUnite || demande.dureeUnite}
                    onChange={(e) => setFormData(prev => ({ ...prev, nouvelleDureeUnite: e.target.value }))}
                    className="w-full bg-slate-800/50 rounded-lg p-2.5 text-white border border-slate-700 focus:border-amber-500 focus:outline-none"
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
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                Garanties supplémentaires (optionnel)
              </p>

              <button
                onClick={() => setFormData(prev => ({
                  ...prev,
                  garantiesAdditionnelles: [
                    ...prev.garantiesAdditionnelles,
                    { type: '', description: '', valeurEstimee: 0, documents: [] }
                  ]
                }))}
                className="w-full p-2 border border-dashed border-slate-600 rounded-lg text-slate-400 text-sm hover:border-amber-500 hover:text-amber-400 transition-colors"
              >
                + Ajouter une garantie
              </button>

              {formData.garantiesAdditionnelles.map((garantie, idx) => (
                <div key={idx} className="p-2 bg-slate-800/50 rounded-lg space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-slate-300">Garantie #{idx + 1}</span>
                    <button
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        garantiesAdditionnelles: prev.garantiesAdditionnelles.filter((_, i) => i !== idx)
                      }))}
                      className="text-red-400 hover:text-red-300"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Type"
                      value={garantie.type}
                      onChange={(e) => {
                        const newGaranties = [...formData.garantiesAdditionnelles];
                        newGaranties[idx] = { ...garantie, type: e.target.value };
                        setFormData(prev => ({ ...prev, garantiesAdditionnelles: newGaranties }));
                      }}
                      className="w-full bg-slate-900/50 rounded p-2 text-white text-xs border border-slate-700 focus:border-amber-500 focus:outline-none"
                    />
                    <input
                      type="number"
                      placeholder="Valeur (FCFA)"
                      value={garantie.valeurEstimee || ''}
                      onChange={(e) => {
                        const newGaranties = [...formData.garantiesAdditionnelles];
                        newGaranties[idx] = { ...garantie, valeurEstimee: parseFloat(e.target.value) || 0 };
                        setFormData(prev => ({ ...prev, garantiesAdditionnelles: newGaranties }));
                      }}
                      className="w-full bg-slate-900/50 rounded p-2 text-white text-xs border border-slate-700 focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <textarea
                    placeholder="Description"
                    value={garantie.description}
                    onChange={(e) => {
                      const newGaranties = [...formData.garantiesAdditionnelles];
                      newGaranties[idx] = { ...garantie, description: e.target.value };
                      setFormData(prev => ({ ...prev, garantiesAdditionnelles: newGaranties }));
                    }}
                    className="w-full bg-slate-900/50 rounded p-2 text-white text-xs border border-slate-700 focus:border-amber-500 focus:outline-none"
                    rows={1}
                  />
                </div>
              ))}

              {/* Co-borrower section */}
              {formData.elementsNouveaux.some(e => e.type === 'Co-emprunteur') && (
                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg space-y-2">
                  <h4 className="text-xs font-bold text-blue-400 flex items-center gap-1">
                    <Users size={14} /> Co-emprunteur
                  </h4>

                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Nom complet"
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
                      className="w-full bg-slate-900/50 rounded p-2 text-white text-xs border border-slate-700 focus:border-blue-500 focus:outline-none"
                    />
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
                      className="w-full bg-slate-900/50 rounded p-2 text-white text-xs border border-slate-700 focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">Relation...</option>
                      <option value="Conjoint(e)">Conjoint(e)</option>
                      <option value="Parent">Parent</option>
                      <option value="Frère/Sœur">Frère/Sœur</option>
                      <option value="Ami(e)">Ami(e)</option>
                      <option value="Collègue">Collègue</option>
                      <option value="Autre">Autre</option>
                    </select>
                  </div>

                  <input
                    type="number"
                    placeholder="Revenus mensuels (FCFA)"
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
                    className="w-full bg-slate-900/50 rounded p-2 text-white text-xs border border-slate-700 focus:border-blue-500 focus:outline-none"
                  />

                  <label className="flex items-center gap-2 cursor-pointer">
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
                      className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="text-xs text-slate-300">Consentement du co-emprunteur</span>
                  </label>
                </div>
              )}
            </div>
          )}

          {step === 'resume' && (
            <div className="space-y-3">
              {/* Comparatif avant/après */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <div className="text-xs text-red-400">Initiale</div>
                  <div className="text-lg font-bold text-white">{formatMoney(demande.montantDemande)}</div>
                  <div className="text-xs text-slate-400">
                    {demande.dureeValeur} {demande.dureeUnite}{(demande.dureeValeur > 1 && demande.dureeUnite !== "Mois") ? "s" : ""}
                  </div>
                </div>

                <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <div className="text-xs text-amber-400">Nouvelle</div>
                  <div className="text-lg font-bold text-white">{formatMoney(formData.nouveauMontantDemande)}</div>
                  <div className="text-xs text-slate-400">
                    {formData.nouvelleDureeValeur || demande.dureeValeur} {(formData.nouvelleDureeUnite || demande.dureeUnite)}{(Number(formData.nouvelleDureeValeur || demande.dureeValeur) > 1 && (formData.nouvelleDureeUnite || demande.dureeUnite) !== "Mois") ? "s" : ""}
                    {Number(formData.nouveauMontantDemande) < Number(demande.montantDemande) && formData.nouveauMontantDemande !== '' && (
                      <span className="ml-2 text-emerald-400">-{Math.round((1 - Number(formData.nouveauMontantDemande) / Number(demande.montantDemande)) * 100)}%</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Éléments nouveaux */}
              <div className="p-2 bg-slate-800/50 rounded-lg">
                <div className="text-xs text-slate-400 mb-1">Éléments ({formData.elementsNouveaux.length})</div>
                <div className="flex flex-wrap gap-1">
                  {formData.elementsNouveaux.map((el, i) => (
                    <span key={i} className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded-full text-xs">
                      {el.type}
                    </span>
                  ))}
                </div>
              </div>

              {/* Garanties */}
              {formData.garantiesAdditionnelles.length > 0 && (
                <div className="p-2 bg-slate-800/50 rounded-lg">
                  <div className="text-xs text-slate-400 mb-1">Garanties</div>
                  <div className="space-y-1">
                    {formData.garantiesAdditionnelles.map((g, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-white">{g.type || 'Non spécifié'}</span>
                        <span className="text-emerald-400">{formatMoney(g.valeurEstimee)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Justification */}
              <div className="p-2 bg-slate-800/50 rounded-lg">
                <div className="text-xs text-slate-400 mb-1">Justification</div>
                <p className="text-white text-xs">{formData.justification}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-700 flex justify-between">
          {step !== 'elements' ? (
            <button
              onClick={() => goToStep('prev')}
              className="px-4 py-2 bg-slate-700 text-white text-sm rounded-lg hover:bg-slate-600 transition-colors flex items-center gap-1"
            >
              <ChevronLeft size={16} /> Précédent
            </button>
          ) : (
            <div />
          )}

          {step !== 'resume' ? (
            <button
              onClick={() => goToStep('next')}
              disabled={!canGoNext()}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-700 disabled:text-slate-500 text-black text-sm font-bold rounded-lg transition-colors flex items-center gap-1"
            >
              Suivant <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-1"
            >
              {submitting ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
              Soumettre
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ReevaluationModal;
