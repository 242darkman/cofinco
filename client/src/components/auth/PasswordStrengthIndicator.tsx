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
      case 'strong': return 'bg-green-500';
      case 'medium': return 'bg-cyan-500';
      case 'weak': return 'bg-blue-500';
      default: return 'bg-gray-500';
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
          <span className="text-sm text-slate-400">Force du mot de passe</span>
          <span className={`text-sm font-semibold ${
            validation.strength === 'strong' ? 'text-green-400' :
            validation.strength === 'medium' ? 'text-cyan-400' :
            'text-blue-400'
          }`}>
            {getStrengthText()} ({validation.score}%)
          </span>
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${getStrengthColor()}`}
            style={{ width: `${validation.score}%` }}
          />
        </div>
      </div>

      {/* Exigences */}
      {validation.requirements && (
        <div className="bg-slate-700/50 rounded-lg p-4 space-y-2">
          <div className="text-sm font-semibold text-white mb-2">Exigences :</div>

          <div className="flex items-center gap-2 text-sm">
            {password.length >= validation.requirements.min_length ? (
              <Check size={16} className="text-green-400" />
            ) : (
              <X size={16} className="text-blue-400" />
            )}
            <span className={password.length >= validation.requirements.min_length ? 'text-green-400' : 'text-slate-400'}>
              Minimum {validation.requirements.min_length} caractères
            </span>
          </div>

          {validation.requirements.require_uppercase && (
            <div className="flex items-center gap-2 text-sm">
              {/[A-Z]/.test(password) ? (
                <Check size={16} className="text-green-400" />
              ) : (
                <X size={16} className="text-blue-400" />
              )}
              <span className={/[A-Z]/.test(password) ? 'text-green-400' : 'text-slate-400'}>
                Au moins une majuscule
              </span>
            </div>
          )}

          {validation.requirements.require_lowercase && (
            <div className="flex items-center gap-2 text-sm">
              {/[a-z]/.test(password) ? (
                <Check size={16} className="text-green-400" />
              ) : (
                <X size={16} className="text-blue-400" />
              )}
              <span className={/[a-z]/.test(password) ? 'text-green-400' : 'text-slate-400'}>
                Au moins une minuscule
              </span>
            </div>
          )}

          {validation.requirements.require_numbers && (
            <div className="flex items-center gap-2 text-sm">
              {/[0-9]/.test(password) ? (
                <Check size={16} className="text-green-400" />
              ) : (
                <X size={16} className="text-blue-400" />
              )}
              <span className={/[0-9]/.test(password) ? 'text-green-400' : 'text-slate-400'}>
                Au moins un chiffre
              </span>
            </div>
          )}

          {validation.requirements.require_special_chars && (
            <div className="flex items-center gap-2 text-sm">
              {/[^A-Za-z0-9]/.test(password) ? (
                <Check size={16} className="text-green-400" />
              ) : (
                <X size={16} className="text-blue-400" />
              )}
              <span className={/[^A-Za-z0-9]/.test(password) ? 'text-green-400' : 'text-slate-400'}>
                Au moins un caractère spécial
              </span>
            </div>
          )}
        </div>
      )}

      {/* Erreurs */}
      {validation.errors && validation.errors.length > 0 && (
        <div className="bg-blue-500/20 border border-blue-500 rounded-lg p-4">
          <div className="flex items-center gap-2 text-blue-400 mb-2">
            <AlertCircle size={16} />
            <span className="text-sm font-semibold">Problèmes détectés :</span>
          </div>
          <ul className="space-y-1">
            {validation.errors.map((error: string, index: number) => (
              <li key={index} className="text-sm text-blue-400">
                • {error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Message succès */}
      {validation.valid && validation.strength === 'strong' && (
        <div className="bg-green-500/20 border border-green-500 rounded-lg p-3 flex items-center gap-2 text-green-400">
          <Check size={16} />
          <span className="text-sm">Excellent mot de passe ! 🎉</span>
        </div>
      )}
    </div>
  );
}
