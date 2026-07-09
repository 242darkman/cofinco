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

// Traduit l'unité de durée en français
const formatDureeUnite = (unite: string, valeur: number): string => {
  const uniteNormalized = unite?.toUpperCase() || '';
  if (uniteNormalized === 'DAY' || uniteNormalized === 'JOUR' || uniteNormalized === 'DAYS' || uniteNormalized === 'JOURS') {
    return valeur > 1 ? 'jours' : 'jour';
  }
  if (uniteNormalized === 'WEEK' || uniteNormalized === 'SEMAINE' || uniteNormalized === 'WEEKS' || uniteNormalized === 'SEMAINES') {
    return valeur > 1 ? 'semaines' : 'semaine';
  }
  if (uniteNormalized === 'MONTH' || uniteNormalized === 'MOIS' || uniteNormalized === 'MONTHS') {
    return 'mois';
  }
  // Fallback: retourne l'unité telle quelle
  return unite;
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
      setFormData(prev => {
        const updates: Partial<ReevaluationFormData> = {
          elementsNouveaux: prev.elementsNouveaux.filter(e => e.type !== type)
        };
        // Si on retire "Réduction montant demandé", remettre le montant initial
        if (type === 'Réduction montant demandé') {
          updates.nouveauMontantDemande = Number(demande.montantDemande);
        }
        return { ...prev, ...updates };
      });
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
    setFormData(prev => {
      const elementToRemove = prev.elementsNouveaux[idx];
      const newElements = prev.elementsNouveaux.filter((_, i) => i !== idx);

      // Si on retire "Réduction montant demandé", remettre le montant initial
      const updates: Partial<ReevaluationFormData> = { elementsNouveaux: newElements };
      if (elementToRemove?.type === 'Réduction montant demandé') {
        updates.nouveauMontantDemande = Number(demande.montantDemande);
      }

      return { ...prev, ...updates };
    });
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
        toast.error(result.error?.message || 'Erreur lors de la création de la réévaluation');
        return;
      }
      
      toast.success('Réévaluation créée');
      onSuccess(result.reevaluation);
      onClose();
    } catch (err) {
      toast.error('Erreur lors de la création de la réévaluation');
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
      <div className="bg-surface-base rounded-xl w-full max-w-xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-edge">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <RefreshCw className="text-status-warning" size={18} />
              <h2 className="text-base font-bold text-content-primary">Réévaluation</h2>
              <span className="text-content-muted text-sm">• {demande.numeroDemande}</span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-surface rounded-lg transition-colors"
            >
              <X className="text-content-muted" size={18} />
            </button>
          </div>

          {/* Info box + Stepper inline */}
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 p-2 bg-status-danger-bg border border-status-danger/30 rounded-lg">
              <p className="text-content-primary text-xs line-clamp-1">
                <span className="text-status-danger">Rejet: </span>
                {demande.motifRejet || 'Non spécifié'}
              </p>
            </div>

            {/* Stepper compact */}
            <div className="flex items-center gap-1">
              {steps.map((s, i) => (
                <div key={s} className="flex items-center">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                    step === s
                      ? 'bg-status-warning text-black'
                      : steps.indexOf(step) > i
                        ? 'bg-status-success text-white'
                        : 'bg-surface-elevated text-content-muted'
                  }`}>
                    {i + 1}
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`w-4 h-0.5 ${
                      steps.indexOf(step) > i ? 'bg-status-success' : 'bg-surface-elevated'
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
              <p className="text-xs text-content-muted">
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
                          ? 'bg-status-warning-bg border-status-warning/50'
                          : 'bg-surface/50 border-edge hover:border-edge-strong'
                      }`}
                    >
                      <Icon size={16} className={`mx-auto ${isSelected ? 'text-status-warning' : 'text-content-muted'}`} />
                      <div className={`text-xs mt-1 leading-tight ${isSelected ? 'text-content-primary' : 'text-content-secondary'}`}>
                        {type.value}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Selected elements with description */}
              {formData.elementsNouveaux.map((element, idx) => (
                <div key={idx} className="p-2 bg-surface/50 rounded-lg">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-status-warning text-xs font-medium">{element.type}</span>
                    <button onClick={() => removeElement(idx)} className="text-status-danger hover:text-status-danger">
                      <X size={14} />
                    </button>
                  </div>

                  {/* Special input for "Réduction montant demandé" */}
                  {element.type === 'Réduction montant demandé' && (
                    <div className="mb-2">
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={element.valeurAjoutee ?? ''}
                          onChange={(e) => {
                            // N'accepter que les chiffres
                            const rawValue = e.target.value.replace(/[^0-9]/g, '');
                            const reduction = rawValue === '' ? undefined : parseInt(rawValue, 10);
                            updateElement(idx, 'valeurAjoutee', reduction);
                            // Calculer automatiquement le nouveau montant
                            const montantInitial = Number(demande.montantDemande);
                            const nouveauMontant = reduction ? Math.max(0, montantInitial - reduction) : montantInitial;
                            setFormData(prev => ({ ...prev, nouveauMontantDemande: nouveauMontant }));
                          }}
                          placeholder="Montant de la réduction"
                          className="w-full bg-surface-base/50 rounded p-2 text-content-primary text-sm border border-edge focus:border-status-warning focus:outline-none"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-content-muted text-xs">FCFA</span>
                      </div>
                      {element.valeurAjoutee && element.valeurAjoutee > 0 && (
                        <div className="mt-1.5 p-1.5 bg-status-success-bg border border-status-success/30 rounded text-xs">
                          <div className="flex items-center justify-between text-status-success">
                            <span>Nouveau montant:</span>
                            <span className="font-bold">
                              {formatMoney(Math.max(0, Number(demande.montantDemande) - element.valeurAjoutee))}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-content-muted mt-0.5">
                            <span>Réduction:</span>
                            <span>-{Math.round((element.valeurAjoutee / Number(demande.montantDemande)) * 100)}%</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <textarea
                    value={element.description}
                    onChange={(e) => updateElement(idx, 'description', e.target.value)}
                    placeholder="Description..."
                    className="w-full bg-surface-base/50 rounded p-2 text-content-primary text-xs border border-edge focus:border-status-warning focus:outline-none"
                    rows={1}
                  />
                </div>
              ))}

              {/* Justification */}
              <div>
                <label className="text-xs text-content-muted mb-1 block">Justification *</label>
                <textarea
                  value={formData.justification}
                  onChange={(e) => setFormData(prev => ({ ...prev, justification: e.target.value }))}
                  placeholder="Pourquoi cette demande mérite une réévaluation..."
                  className="w-full bg-surface/50 rounded-lg p-2 text-content-primary text-sm border border-edge focus:border-status-warning focus:outline-none"
                  rows={2}
                />
                <div className={`text-xs mt-0.5 ${
                  formData.justification.length >= 10 ? 'text-status-success' : 'text-content-muted'
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
                <label className="text-xs text-content-muted mb-1 block">Nouveau montant</label>
                <div className="relative">
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={formData.nouveauMontantDemande}
                    onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); handleNumberChange('nouveauMontantDemande', v); }}
                    className="w-full bg-surface/50 rounded-lg p-2.5 text-content-primary text-lg font-bold border border-edge focus:border-status-warning focus:outline-none"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted text-sm">FCFA</span>
                </div>
                {Number(formData.nouveauMontantDemande) < Number(demande.montantDemande) && formData.nouveauMontantDemande !== '' && (
                  <div className="mt-1 text-xs text-status-success flex items-center gap-1">
                    <TrendingDown size={12} />
                    -{Math.round((1 - Number(formData.nouveauMontantDemande) / Number(demande.montantDemande)) * 100)}% ({formatMoney(Number(demande.montantDemande) - Number(formData.nouveauMontantDemande))})
                  </div>
                )}
              </div>

              {/* Durée */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-content-muted mb-1 block">Durée</label>
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={formData.nouvelleDureeValeur === undefined ? demande.dureeValeur : formData.nouvelleDureeValeur}
                    onChange={(e) => {
                       const val = e.target.value.replace(/[^0-9]/g, '');
                       setFormData(prev => ({
                         ...prev,
                         nouvelleDureeValeur: val === '' ? '' : parseInt(val)
                       }));
                    }}
                    className="w-full bg-surface/50 rounded-lg p-2.5 text-content-primary border border-edge focus:border-status-warning focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-content-muted mb-1 block">Unité</label>
                  <select
                    value={formData.nouvelleDureeUnite || demande.dureeUnite}
                    onChange={(e) => setFormData(prev => ({ ...prev, nouvelleDureeUnite: e.target.value }))}
                    className="w-full bg-surface/50 rounded-lg p-2.5 text-content-primary border border-edge focus:border-status-warning focus:outline-none"
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
              <p className="text-xs text-content-muted">
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
                className="w-full p-2 border border-dashed border-edge-strong rounded-lg text-content-muted text-sm hover:border-status-warning hover:text-status-warning transition-colors"
              >
                + Ajouter une garantie
              </button>

              {formData.garantiesAdditionnelles.map((garantie, idx) => (
                <div key={idx} className="p-2 bg-surface/50 rounded-lg space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-content-secondary">Garantie #{idx + 1}</span>
                    <button
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        garantiesAdditionnelles: prev.garantiesAdditionnelles.filter((_, i) => i !== idx)
                      }))}
                      className="text-status-danger hover:text-status-danger"
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
                      className="w-full bg-surface-base/50 rounded p-2 text-content-primary text-xs border border-edge focus:border-status-warning focus:outline-none"
                    />
                    <input
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="Valeur (FCFA)"
                      value={garantie.valeurEstimee || ''}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9]/g, '');
                        const newGaranties = [...formData.garantiesAdditionnelles];
                        newGaranties[idx] = { ...garantie, valeurEstimee: v ? parseFloat(v) : 0 };
                        setFormData(prev => ({ ...prev, garantiesAdditionnelles: newGaranties }));
                      }}
                      className="w-full bg-surface-base/50 rounded p-2 text-content-primary text-xs border border-edge focus:border-status-warning focus:outline-none"
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
                    className="w-full bg-surface-base/50 rounded p-2 text-content-primary text-xs border border-edge focus:border-status-warning focus:outline-none"
                    rows={1}
                  />
                </div>
              ))}

              {/* Co-borrower section */}
              {formData.elementsNouveaux.some(e => e.type === 'Co-emprunteur') && (
                <div className="p-3 bg-status-info-bg border border-status-info/30 rounded-lg space-y-2">
                  <h4 className="text-xs font-bold text-status-info flex items-center gap-1">
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
                      className="w-full bg-surface-base/50 rounded p-2 text-content-primary text-xs border border-edge focus:border-status-info focus:outline-none"
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
                      className="w-full bg-surface-base/50 rounded p-2 text-content-primary text-xs border border-edge focus:border-status-info focus:outline-none"
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
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="Revenus mensuels (FCFA)"
                    value={formData.coEmprunteur?.revenusMensuels || ''}
                    onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setFormData(prev => ({
                      ...prev,
                      coEmprunteur: {
                        ...prev.coEmprunteur,
                        nom: prev.coEmprunteur?.nom,
                        relation: prev.coEmprunteur?.relation || '',
                        revenusMensuels: v ? parseFloat(v) : 0,
                        consentement: prev.coEmprunteur?.consentement || false
                      }
                    })); }}
                    className="w-full bg-surface-base/50 rounded p-2 text-content-primary text-xs border border-edge focus:border-status-info focus:outline-none"
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
                      className="w-4 h-4 rounded bg-surface-elevated border-edge-strong text-status-info focus:ring-status-info"
                    />
                    <span className="text-xs text-content-secondary">Consentement du co-emprunteur</span>
                  </label>
                </div>
              )}
            </div>
          )}

          {step === 'resume' && (
            <div className="space-y-3">
              {/* Comparatif avant/après */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 bg-status-danger-bg border border-status-danger/30 rounded-lg">
                  <div className="text-xs text-status-danger">Initiale</div>
                  <div className="text-lg font-bold text-content-primary">{formatMoney(demande.montantDemande)}</div>
                  <div className="text-xs text-content-muted">
                    {demande.dureeValeur} {formatDureeUnite(demande.dureeUnite, demande.dureeValeur)}
                  </div>
                </div>

                <div className="p-2 bg-status-warning-bg border border-status-warning/30 rounded-lg">
                  <div className="text-xs text-status-warning">Nouvelle</div>
                  <div className="text-lg font-bold text-content-primary">{formatMoney(formData.nouveauMontantDemande)}</div>
                  <div className="text-xs text-content-muted">
                    {formData.nouvelleDureeValeur || demande.dureeValeur} {formatDureeUnite(formData.nouvelleDureeUnite || demande.dureeUnite, Number(formData.nouvelleDureeValeur || demande.dureeValeur))}
                    {Number(formData.nouveauMontantDemande) < Number(demande.montantDemande) && formData.nouveauMontantDemande !== '' && (
                      <span className="ml-2 text-status-success">-{Math.round((1 - Number(formData.nouveauMontantDemande) / Number(demande.montantDemande)) * 100)}%</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Éléments nouveaux */}
              <div className="p-2 bg-surface/50 rounded-lg">
                <div className="text-xs text-content-muted mb-1">Éléments ({formData.elementsNouveaux.length})</div>
                <div className="flex flex-wrap gap-1">
                  {formData.elementsNouveaux.map((el, i) => (
                    <span key={i} className="px-2 py-0.5 bg-status-warning-bg text-status-warning rounded-full text-xs">
                      {el.type}
                    </span>
                  ))}
                </div>
              </div>

              {/* Garanties */}
              {formData.garantiesAdditionnelles.length > 0 && (
                <div className="p-2 bg-surface/50 rounded-lg">
                  <div className="text-xs text-content-muted mb-1">Garanties</div>
                  <div className="space-y-1">
                    {formData.garantiesAdditionnelles.map((g, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-content-primary">{g.type || 'Non spécifié'}</span>
                        <span className="text-status-success">{formatMoney(g.valeurEstimee)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Justification */}
              <div className="p-2 bg-surface/50 rounded-lg">
                <div className="text-xs text-content-muted mb-1">Justification</div>
                <p className="text-content-primary text-xs">{formData.justification}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-edge flex justify-between">
          {step !== 'elements' ? (
            <button
              onClick={() => goToStep('prev')}
              className="px-4 py-2 bg-surface-elevated text-content-primary text-sm rounded-lg hover:bg-surface-subtle transition-colors flex items-center gap-1"
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
              className="px-4 py-2 bg-status-warning hover:bg-status-warning disabled:bg-surface-elevated disabled:text-content-muted text-black text-sm font-bold rounded-lg transition-colors flex items-center gap-1"
            >
              Suivant <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 bg-status-success hover:bg-status-success text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-1"
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
