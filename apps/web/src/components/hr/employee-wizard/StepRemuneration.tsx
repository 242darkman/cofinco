import React from 'react';
import {
  Banknote,
  Wallet,
  ArrowRightLeft,
  Smartphone,
  FileText,
  Building2,
  Users,
  Check,
  Loader2,
  AlertCircle,
  Info,
} from 'lucide-react';
import { FormField, SelectField } from '../../ui';

interface StepRemunerationProps {
  formData: any; // EmployeFormData
  updateField: (field: string, value: string | null) => void;
  editingEmploye: any | null;
  // Mode calcul paie
  modeCalculPaie: 'MONTHLY' | 'HOURLY' | 'DAILY';
  setModeCalculPaie: (mode: 'MONTHLY' | 'HOURLY' | 'DAILY') => void;
  // CNSS validation
  validationErrors: Record<string, string>;
  checkingCnss: boolean;
  cnssAvailable: boolean | null;
  cnssError: string | null;
  // Employee type info (for INTERNAL_WALLET option)
  isEmployeClient: boolean; // true if user.typeCompte === 'both'
  // Salary range from job position
  salaryRange: { min: number | null; max: number | null } | null;
}

function SalaryRangeIndicator({ min, max, current }: { min: number | null; max: number | null; current: number }) {
  const fmt = (n: number) => n.toLocaleString('fr-FR');

  // Compute how well the current salary fits within the range
  let status: 'below' | 'within' | 'above' | 'unknown' = 'unknown';
  if (min != null && max != null && current > 0) {
    if (current < min) status = 'below';
    else if (current > max) status = 'above';
    else status = 'within';
  } else if (min != null && current > 0 && current < min) {
    status = 'below';
  } else if (max != null && current > 0 && current > max) {
    status = 'above';
  } else if (current > 0) {
    status = 'within';
  }

  // Progress bar percentage
  let pct = 0;
  if (min != null && max != null && max > min) {
    pct = Math.max(0, Math.min(100, ((current - min) / (max - min)) * 100));
  }

  const statusColor =
    status === 'below' ? 'text-status-warning' :
    status === 'above' ? 'text-status-danger' :
    status === 'within' ? 'text-status-success' :
    'text-content-muted';

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-content-muted flex items-center gap-1">
          <Info size={12} />
          Fourchette du poste
        </span>
        <span className={`font-medium ${statusColor}`}>
          {min != null && max != null
            ? `${fmt(min)} — ${fmt(max)} FCFA`
            : min != null
              ? `Min: ${fmt(min)} FCFA`
              : max != null
                ? `Max: ${fmt(max)} FCFA`
                : ''}
        </span>
      </div>
      {min != null && max != null && max > min && (
        <div className="relative h-1.5 bg-edge rounded-full overflow-hidden">
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-all ${
              status === 'below' ? 'bg-status-warning' :
              status === 'above' ? 'bg-status-danger' :
              'bg-status-success'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

const StepRemuneration: React.FC<StepRemunerationProps> = ({
  formData,
  updateField,
  editingEmploye,
  modeCalculPaie,
  setModeCalculPaie,
  validationErrors,
  checkingCnss,
  cnssAvailable,
  cnssError,
  isEmployeClient,
  salaryRange,
}: StepRemunerationProps) => {
  const paymentMethod = formData.paymentMethod || 'CASH';

  const handleSalaireChange = (value: string) => {
    // Strip non-digits
    const numericValue = value.replace(/\D/g, '');
    updateField('salaireBase', numericValue || null);
  };

  const handleCnssChange = (value: string) => {
    // Uppercase
    updateField('numeroCnss', value.toUpperCase() || null);
  };

  const handleEnfantsChange = (value: string) => {
    // Strip non-digits
    const numericValue = value.replace(/\D/g, '');
    updateField('nombreEnfantsCharge', numericValue || null);
  };

  const getSalaireLabel = () => {
    switch (modeCalculPaie) {
      case 'HOURLY':
        return 'Taux Horaire (FCFA/h)';
      case 'DAILY':
        return 'Taux Journalier (FCFA/jour)';
      case 'MONTHLY':
      default:
        return 'Salaire de Base (FCFA/mois)';
    }
  };

  const paymentOptions = [
    {
      id: 'CASH',
      icon: Banknote,
      label: 'Espèces',
      description: 'Paiement en espèces au guichet',
    },
    {
      id: 'TRANSFER',
      icon: ArrowRightLeft,
      label: 'Virement Bancaire',
      description: 'Virement sur compte bancaire',
    },
    {
      id: 'MOBILE_MONEY',
      icon: Smartphone,
      label: 'Mobile Money',
      description: 'Via opérateur mobile',
    },
    {
      id: 'CHECK',
      icon: FileText,
      label: 'Chèque',
      description: 'Paiement par chèque',
    },
  ];

  if (isEmployeClient) {
    paymentOptions.push({
      id: 'INTERNAL_WALLET',
      icon: Wallet,
      label: 'Wallet Interne',
      description: 'Crédit sur compte client COFIN',
    });
  }

  return (
    <div className="space-y-6">
      {/* Section 1: Rémunération */}
      <section className="bg-status-success-bg border-status-success/30 border rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-status-success-bg border border-status-success/30 rounded-lg flex items-center justify-center">
            <Banknote className="w-5 h-5 text-status-success" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-content-primary">
              Rémunération
            </h3>
            <p className="text-sm text-content-secondary">
              Mode de calcul et montant de la rémunération
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <SelectField
            label="Mode de Calcul"
            name="modeCalculPaie"
            value={modeCalculPaie}
            onChange={(e) =>
              setModeCalculPaie(
                e.target.value as 'MONTHLY' | 'HOURLY' | 'DAILY'
              )
            }
            options={[
              { value: 'MONTHLY', label: 'Mensuel' },
              { value: 'HOURLY', label: 'Horaire' },
              { value: 'DAILY', label: 'Journalier' },
            ]}
            required
            containerClassName="py-1"
          />

          <div>
            <FormField
              label={getSalaireLabel()}
              name="salaireBase"
              value={formData.salaireBase || ''}
              onChange={(e) => handleSalaireChange(e.target.value)}
              error={validationErrors.salaireBase}
              required
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="0"
              containerClassName="py-1"
            />
            {salaryRange && modeCalculPaie === 'MONTHLY' && (
              <SalaryRangeIndicator
                min={salaryRange.min}
                max={salaryRange.max}
                current={parseInt(formData.salaireBase) || 0}
              />
            )}
          </div>

          <div className="col-span-2">
            <FormField
              label="Numéro CNSS"
              name="numeroCnss"
              value={formData.numeroCnss || ''}
              onChange={(e) => handleCnssChange(e.target.value)}
              error={validationErrors.numeroCnss}
              placeholder="Ex: CNSS-CG-12345"
              containerClassName="py-1"
            />
            {/* CNSS Validation Indicator */}
            {formData.numeroCnss && (
              <div className="mt-2">
                {checkingCnss && (
                  <div className="flex items-center gap-2 text-sm text-content-muted">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Vérification...</span>
                  </div>
                )}
                {!checkingCnss && cnssAvailable === true && (
                  <div className="flex items-center gap-2 text-sm text-status-success">
                    <Check className="w-4 h-4" />
                    <span>Numéro CNSS disponible</span>
                  </div>
                )}
                {!checkingCnss && cnssAvailable === false && (
                  <div className="flex items-center gap-2 text-sm text-status-danger">
                    <AlertCircle className="w-4 h-4" />
                    <span>Déjà utilisé</span>
                  </div>
                )}
                {!checkingCnss && cnssError && (
                  <div className="flex items-center gap-2 text-sm text-status-danger">
                    <AlertCircle className="w-4 h-4" />
                    <span>{cnssError}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Section 2: Mode de Paiement */}
      <section className="bg-accent/5 border-accent/20 border rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-accent/10 border border-accent/30 rounded-lg flex items-center justify-center">
            <Wallet className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-content-primary">
              Mode de Paiement du Salaire
            </h3>
            <p className="text-sm text-content-secondary">
              Sélectionnez le mode de paiement préféré
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {paymentOptions.map((option) => {
            const Icon = option.icon;
            const isSelected = paymentMethod === option.id;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => updateField('paymentMethod', option.id)}
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all text-left ${
                  isSelected
                    ? 'border-accent bg-accent/10'
                    : 'border-edge bg-surface hover:border-accent/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      isSelected ? 'bg-accent/20' : 'bg-surface-elevated'
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 ${
                        isSelected ? 'text-accent' : 'text-content-secondary'
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className={`font-semibold mb-1 ${
                        isSelected
                          ? 'text-content-primary'
                          : 'text-content-secondary'
                      }`}
                    >
                      {option.label}
                    </div>
                    <div className="text-sm text-content-muted">
                      {option.description}
                    </div>
                  </div>
                  {isSelected && (
                    <Check className="w-5 h-5 text-accent flex-shrink-0" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Section 3: Coordonnées Bancaires (shown when TRANSFER) */}
      {paymentMethod === 'TRANSFER' && (
        <section className="bg-surface/30 border-edge border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-accent/10 border border-accent/30 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-content-primary">
                Coordonnées Bancaires
              </h3>
              <p className="text-sm text-content-secondary">
                Informations du compte bancaire
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <FormField
              label="Nom de la Banque"
              name="bankName"
              value={formData.bankName || ''}
              onChange={(e) => updateField('bankName', e.target.value || null)}
              placeholder="Ex: BGFI Bank Congo"
              containerClassName="py-1"
            />

            <FormField
              label="Code Banque"
              name="bankCode"
              value={formData.bankCode || ''}
              onChange={(e) => updateField('bankCode', e.target.value || null)}
              placeholder="Ex: 30011"
              containerClassName="py-1"
            />

            <FormField
              label="Code Guichet"
              name="branchCode"
              value={formData.branchCode || ''}
              onChange={(e) =>
                updateField('branchCode', e.target.value || null)
              }
              placeholder="Ex: 00100"
              containerClassName="py-1"
            />

            <FormField
              label="Numéro de Compte"
              name="bankAccountNumber"
              value={formData.bankAccountNumber || ''}
              onChange={(e) =>
                updateField('bankAccountNumber', e.target.value || null)
              }
              placeholder="Ex: 0000123456"
              containerClassName="py-1"
            />

            <FormField
              label="Clé RIB"
              name="accountKey"
              value={formData.accountKey || ''}
              onChange={(e) =>
                updateField('accountKey', e.target.value || null)
              }
              placeholder="Ex: 97"
              containerClassName="py-1"
            />
          </div>
        </section>
      )}

      {/* Section 4: Détails Mobile Money (shown when MOBILE_MONEY) */}
      {paymentMethod === 'MOBILE_MONEY' && (
        <section className="bg-surface/30 border-edge border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-accent/10 border border-accent/30 rounded-lg flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-content-primary">
                Détails Mobile Money
              </h3>
              <p className="text-sm text-content-secondary">
                Numéro de téléphone mobile money
              </p>
            </div>
          </div>

          <FormField
            label="Numéro Mobile Money"
            name="paymentDetails"
            value={formData.paymentDetails || ''}
            onChange={(e) =>
              updateField('paymentDetails', e.target.value || null)
            }
            placeholder="Ex: +242 06 XXX XX XX"
            containerClassName="py-1"
          />
        </section>
      )}

      {/* Section 5: Situation Familiale & Fiscale */}
      <section className="bg-status-info-bg border-status-info/30 border rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-status-info-bg border border-status-info/30 rounded-lg flex items-center justify-center">
            <Users className="w-5 h-5 text-status-info" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-content-primary">
              Situation Familiale & Fiscale
            </h3>
            <p className="text-sm text-content-secondary">
              Informations pour le calcul de l'IRPP
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <SelectField
            label="Situation Familiale"
            name="situationFamiliale"
            value={formData.situationFamiliale || ''}
            onChange={(e) =>
              updateField('situationFamiliale', e.target.value || null)
            }
            options={[
              { value: '', label: '-- Sélectionner --' },
              { value: 'CELIBATAIRE', label: 'Célibataire' },
              { value: 'MARIE', label: 'Marié(e)' },
              { value: 'VEUF', label: 'Veuf/Veuve' },
              { value: 'DIVORCE', label: 'Divorcé(e)' },
            ]}
            containerClassName="py-1"
          />

          <FormField
            label="Enfants à charge"
            name="nombreEnfantsCharge"
            value={formData.nombreEnfantsCharge || ''}
            onChange={(e) => handleEnfantsChange(e.target.value)}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="0"
            containerClassName="py-1"
          />

          <FormField
            label="NIU"
            name="niu"
            value={formData.niu || ''}
            onChange={(e) => updateField('niu', e.target.value || null)}
            placeholder="Ex: NIU-CG-00123"
            containerClassName="py-1"
          />
        </div>

        <div className="mt-4 p-3 bg-surface/50 border border-edge rounded-lg">
          <p className="text-sm text-content-muted">
            La situation familiale et le nombre d'enfants déterminent le
            quotient familial pour le calcul de l'IRPP.
          </p>
        </div>
      </section>
    </div>
  );
};

export default StepRemuneration;
