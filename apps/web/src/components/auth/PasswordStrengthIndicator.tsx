import React, { useEffect, useState } from 'react';
import { Check, X, AlertCircle } from 'lucide-react';

interface PasswordStrengthIndicatorProps {
  password: string;
  requirements?: {
    min_length?: number;
    require_uppercase?: boolean;
    require_lowercase?: boolean;
    require_numbers?: boolean;
    require_special_chars?: boolean;
  };
  onChange?: (validation: any) => void;
}

const DEFAULT_REQUIREMENTS = {
  min_length: 8,
  require_uppercase: true,
  require_lowercase: true,
  require_numbers: true,
  require_special_chars: true
};

function normalizeRequirements(overrides?: PasswordStrengthIndicatorProps['requirements']) {
  return {
    min_length: overrides?.min_length ?? DEFAULT_REQUIREMENTS.min_length,
    require_uppercase: overrides?.require_uppercase ?? DEFAULT_REQUIREMENTS.require_uppercase,
    require_lowercase: overrides?.require_lowercase ?? DEFAULT_REQUIREMENTS.require_lowercase,
    require_numbers: overrides?.require_numbers ?? DEFAULT_REQUIREMENTS.require_numbers,
    require_special_chars: overrides?.require_special_chars ?? DEFAULT_REQUIREMENTS.require_special_chars
  };
}

function validatePasswordLocally(password: string, overrides?: PasswordStrengthIndicatorProps['requirements']) {
  const requirements = normalizeRequirements(overrides);

  const errors: string[] = [];
  let score = 0;

  if (password.length >= requirements.min_length) score += 20;
  else errors.push(`Le mot de passe doit contenir au moins ${requirements.min_length} caractères`);

  if (/[A-Z]/.test(password)) score += 20;
  else if (requirements.require_uppercase) errors.push('Le mot de passe doit contenir au moins une majuscule');

  if (/[a-z]/.test(password)) score += 20;
  else if (requirements.require_lowercase) errors.push('Le mot de passe doit contenir au moins une minuscule');

  if (/[0-9]/.test(password)) score += 20;
  else if (requirements.require_numbers) errors.push('Le mot de passe doit contenir au moins un chiffre');

  if (/[^A-Za-z0-9]/.test(password)) score += 20;
  else if (requirements.require_special_chars) errors.push('Le mot de passe doit contenir au moins un caractère spécial');

  let strength: 'weak' | 'medium' | 'strong' = 'weak';
  if (score >= 80) strength = 'strong';
  else if (score >= 60) strength = 'medium';

  return {
    valid: errors.length === 0,
    score,
    strength,
    requirements,
    errors
  };
}

export default function PasswordStrengthIndicator({ password, requirements, onChange }: PasswordStrengthIndicatorProps) {
  const [validation, setValidation] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!password) {
      setValidation(null);
      onChange?.(null);
      return;
    }

    const validatePassword = () => {
      setLoading(true);
      try {
        const data = validatePasswordLocally(password, requirements);
        setValidation(data);
        onChange?.(data);
      } catch (error) {
        console.error('Erreur:', error);
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(validatePassword, 300);
    return () => clearTimeout(timeoutId);
  }, [password, requirements, onChange]);

  if (!password || !validation) return null;

  const getStrengthColor = () => {
    switch (validation.strength) {
      case 'strong': return 'bg-status-success';
      case 'medium': return 'bg-accent-secondary';
      case 'weak': return 'bg-status-info';
      default: return 'bg-surface-muted0';
    }
  };

  const getStrengthText = () => {
    switch (validation.strength) {
      case 'strong': return 'Fort';
      case 'medium': return 'Moyen';
      case 'weak': return 'Faible';
      default: return 'Inconnu';
    }
  };

  return (
    <div className="space-y-3">
      {/* Barre de force */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-content-muted">Force du mot de passe</span>
          <span className={`text-sm font-semibold ${
            validation.strength === 'strong' ? 'text-status-success' :
            validation.strength === 'medium' ? 'text-accent' :
            'text-status-info'
          }`}>
            {getStrengthText()} ({validation.score}%)
          </span>
        </div>
        <div className="h-2 bg-surface-elevated rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${getStrengthColor()}`}
            style={{ width: `${validation.score}%` }}
          />
        </div>
      </div>

      {/* Exigences */}
      {validation.requirements && (
        <div className="bg-surface-elevated/50 rounded-lg p-4 space-y-2">
          <div className="text-sm font-semibold text-content-primary mb-2">Exigences :</div>

          <div className="flex items-center gap-2 text-sm">
            {password.length >= validation.requirements.min_length ? (
              <Check size={16} className="text-status-success" />
            ) : (
              <X size={16} className="text-status-info" />
            )}
            <span className={password.length >= validation.requirements.min_length ? 'text-status-success' : 'text-content-muted'}>
              Minimum {validation.requirements.min_length} caractères
            </span>
          </div>

          {validation.requirements.require_uppercase && (
            <div className="flex items-center gap-2 text-sm">
              {/[A-Z]/.test(password) ? (
                <Check size={16} className="text-status-success" />
              ) : (
                <X size={16} className="text-status-info" />
              )}
              <span className={/[A-Z]/.test(password) ? 'text-status-success' : 'text-content-muted'}>
                Au moins une majuscule
              </span>
            </div>
          )}

          {validation.requirements.require_lowercase && (
            <div className="flex items-center gap-2 text-sm">
              {/[a-z]/.test(password) ? (
                <Check size={16} className="text-status-success" />
              ) : (
                <X size={16} className="text-status-info" />
              )}
              <span className={/[a-z]/.test(password) ? 'text-status-success' : 'text-content-muted'}>
                Au moins une minuscule
              </span>
            </div>
          )}

          {validation.requirements.require_numbers && (
            <div className="flex items-center gap-2 text-sm">
              {/[0-9]/.test(password) ? (
                <Check size={16} className="text-status-success" />
              ) : (
                <X size={16} className="text-status-info" />
              )}
              <span className={/[0-9]/.test(password) ? 'text-status-success' : 'text-content-muted'}>
                Au moins un chiffre
              </span>
            </div>
          )}

          {validation.requirements.require_special_chars && (
            <div className="flex items-center gap-2 text-sm">
              {/[^A-Za-z0-9]/.test(password) ? (
                <Check size={16} className="text-status-success" />
              ) : (
                <X size={16} className="text-status-info" />
              )}
              <span className={/[^A-Za-z0-9]/.test(password) ? 'text-status-success' : 'text-content-muted'}>
                Au moins un caractère spécial
              </span>
            </div>
          )}
        </div>
      )}

      {/* Erreurs */}
      {validation.errors && validation.errors.length > 0 && (
        <div className="bg-status-info-bg border border-status-info rounded-lg p-4">
          <div className="flex items-center gap-2 text-status-info mb-2">
            <AlertCircle size={16} />
            <span className="text-sm font-semibold">Problèmes détectés :</span>
          </div>
          <ul className="space-y-1">
            {validation.errors.map((error: string, index: number) => (
              <li key={index} className="text-sm text-status-info">
                • {error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Message succès */}
      {validation.valid && validation.strength === 'strong' && (
        <div className="bg-status-success-bg border border-status-success rounded-lg p-3 flex items-center gap-2 text-status-success">
          <Check size={16} />
          <span className="text-sm">Excellent mot de passe ! 🎉</span>
        </div>
      )}
    </div>
  );
}
