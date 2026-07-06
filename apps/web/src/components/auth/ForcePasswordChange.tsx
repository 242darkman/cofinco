import React, { useMemo, useState } from 'react';
import { Lock, Check, X, AlertCircle, Eye, EyeOff } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import FormField from '../ui/FormField';
import { useSecuritySettings } from '../../hooks/settings/useSecuritySettings';

interface ForcePasswordChangeProps {
  onPasswordChanged: () => void;
}

const DEFAULT_PASSWORD_REQUIREMENTS = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  specialChars: '@$!%*?&'
};

export default function ForcePasswordChange({ onPasswordChanged }: ForcePasswordChangeProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [currentPasswordError, setCurrentPasswordError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { settings: securitySettings } = useSecuritySettings();

  const passwordRequirements = useMemo(() => {
    if (!securitySettings) return DEFAULT_PASSWORD_REQUIREMENTS;
    return {
      minLength: securitySettings.passwordMinLength ?? DEFAULT_PASSWORD_REQUIREMENTS.minLength,
      requireUppercase: securitySettings.passwordRequireUppercase ?? DEFAULT_PASSWORD_REQUIREMENTS.requireUppercase,
      requireLowercase: securitySettings.passwordRequireLowercase ?? DEFAULT_PASSWORD_REQUIREMENTS.requireLowercase,
      requireNumbers: securitySettings.passwordRequireNumbers ?? DEFAULT_PASSWORD_REQUIREMENTS.requireNumbers,
      requireSpecialChars: securitySettings.passwordRequireSpecial ?? DEFAULT_PASSWORD_REQUIREMENTS.requireSpecialChars,
      specialChars: DEFAULT_PASSWORD_REQUIREMENTS.specialChars
    };
  }, [securitySettings]);

  const checkRequirement = (password: string, requirement: string): boolean => {
    switch (requirement) {
      case 'length':
        return password.length >= passwordRequirements.minLength;
      case 'uppercase':
        return /[A-Z]/.test(password);
      case 'lowercase':
        return /[a-z]/.test(password);
      case 'number':
        return /[0-9]/.test(password);
      case 'special':
        return /[@$!%*?&]/.test(password);
      default:
        return false;
    }
  };

  const requirements = [
    { key: 'length', label: `Au moins ${passwordRequirements.minLength} caractères`, enabled: true },
    { key: 'uppercase', label: 'Une lettre majuscule (A-Z)', enabled: passwordRequirements.requireUppercase },
    { key: 'lowercase', label: 'Une lettre minuscule (a-z)', enabled: passwordRequirements.requireLowercase },
    { key: 'number', label: 'Un chiffre (0-9)', enabled: passwordRequirements.requireNumbers },
    { key: 'special', label: `Un caractère spécial (${passwordRequirements.specialChars})`, enabled: passwordRequirements.requireSpecialChars }
  ].filter((req) => req.enabled);

  const allRequirementsMet = requirements.every(req => 
    checkRequirement(newPassword, req.key)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCurrentPasswordError('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Veuillez remplir tous les champs');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    if (!allRequirementsMet) {
      setError('Le mot de passe ne respecte pas tous les critères de sécurité');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      });

      if (!response.ok) {
        const data = await response.json();
        const errorMsg = data.message || data.error || 'Erreur lors du changement de mot de passe';
        // Detect wrong current password from server response
        if (/invalid current password|mot de passe actuel/i.test(errorMsg)) {
          setCurrentPasswordError('Mot de passe actuel incorrect');
        } else {
          setError(errorMsg);
        }
        return;
      }

      onPasswordChanged();
    } catch (err: any) {
      setError(err.message || 'Erreur lors du changement de mot de passe');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={() => {}}
      title="Changement de mot de passe requis"
      subtitle="Pour des raisons de sécurité, vous devez changer votre mot de passe avant de continuer."
      variant="danger"
      showCloseButton={false}
      closeOnBackdrop={false}
      closeOnEsc={false}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-2.5">
        {error && (
          <div className="px-3 py-2 bg-status-danger-bg border border-status-danger/30 rounded-lg flex items-center gap-2">
            <AlertCircle size={16} className="text-status-danger flex-shrink-0" />
            <p className="text-status-danger text-xs">{error}</p>
          </div>
        )}

        <div>
          <FormField
            label="Mot de passe actuel"
            name="currentPassword"
            type={showCurrentPassword ? 'text' : 'password'}
            value={currentPassword}
            onChange={(e) => { setCurrentPassword(e.target.value); setCurrentPasswordError(''); }}
            placeholder="Mot de passe actuel"
            required
            autoFocus
            rightIcon={showCurrentPassword ? Eye : EyeOff}
            onRightIconClick={() => setShowCurrentPassword(!showCurrentPassword)}
          />
          {currentPasswordError && (
            <div className="flex items-center gap-1.5 mt-1 px-1 text-status-danger">
              <AlertCircle size={12} className="flex-shrink-0" />
              <span className="text-xs">{currentPasswordError}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <FormField
            label="Nouveau mot de passe"
            name="newPassword"
            type={showNewPassword ? 'text' : 'password'}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Nouveau mot de passe"
            required
            rightIcon={showNewPassword ? Eye : EyeOff}
            onRightIconClick={() => setShowNewPassword(!showNewPassword)}
          />

          <FormField
            label="Confirmer le mot de passe"
            name="confirmPassword"
            type={showConfirmPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirmer le mot de passe"
            required
            rightIcon={showConfirmPassword ? Eye : EyeOff}
            onRightIconClick={() => setShowConfirmPassword(!showConfirmPassword)}
          />
        </div>

        {/* Password match feedback */}
        {confirmPassword.length > 0 && (
          <div className={`flex items-center gap-1.5 px-1 ${newPassword === confirmPassword ? 'text-status-success' : 'text-status-danger'}`}>
            {newPassword === confirmPassword ? (
              <Check size={12} />
            ) : (
              <X size={12} />
            )}
            <span className="text-xs">
              {newPassword === confirmPassword
                ? 'Mots de passe identiques'
                : 'Les mots de passe ne correspondent pas'}
            </span>
          </div>
        )}

        {/* Password Requirements - compact inline */}
        <div className="bg-surface/50 border border-edge rounded-lg px-3 py-2">
          <p className="text-xs font-semibold text-content-secondary mb-1.5">Critères de sécurité</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {requirements.map(req => {
              const met = checkRequirement(newPassword, req.key);
              return (
                <div key={req.key} className="flex items-center gap-1.5">
                  {met ? (
                    <Check size={12} className="text-status-success" />
                  ) : (
                    <X size={12} className="text-content-muted" />
                  )}
                  <span className={`text-xs ${met ? 'text-status-success' : 'text-content-muted'}`}>
                    {req.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <Button
          type="submit"
          disabled={loading || !allRequirementsMet || newPassword !== confirmPassword}
          fullWidth
          variant="danger"
          isLoading={loading}
          icon={Lock}
        >
          {loading ? 'Changement en cours...' : 'Changer le mot de passe'}
        </Button>

        <p className="text-[11px] text-content-muted text-center">
          Ce changement est obligatoire pour accéder à l'application
        </p>
      </form>
    </Modal>
  );
}
