import React, { useState } from 'react';
import { Lock, Check, X, AlertCircle } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import FormField from '../ui/FormField';

interface ForcePasswordChangeProps {
  onPasswordChanged: () => void;
}

const PASSWORD_REQUIREMENTS = {
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
  const [loading, setLoading] = useState(false);

  const checkRequirement = (password: string, requirement: string): boolean => {
    switch (requirement) {
      case 'length':
        return password.length >= PASSWORD_REQUIREMENTS.minLength;
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
    { key: 'length', label: `Au moins ${PASSWORD_REQUIREMENTS.minLength} caractères` },
    { key: 'uppercase', label: 'Une lettre majuscule (A-Z)' },
    { key: 'lowercase', label: 'Une lettre minuscule (a-z)' },
    { key: 'number', label: 'Un chiffre (0-9)' },
    { key: 'special', label: `Un caractère spécial (${PASSWORD_REQUIREMENTS.specialChars})` }
  ];

  const allRequirementsMet = requirements.every(req => 
    checkRequirement(newPassword, req.key)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

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
        throw new Error(data.error || 'Erreur lors du changement de mot de passe');
      }

      onPasswordChanged();
    } catch (err: any) {
      setError(err.error);
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
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg flex items-start gap-2">
            <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <FormField
          label="Mot de passe actuel"
          name="currentPassword"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Votre mot de passe actuel"
          required
          autoFocus
        />

        <FormField
          label="Nouveau mot de passe"
          name="newPassword"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Votre nouveau mot de passe"
          required
        />

        <FormField
          label="Confirmer le mot de passe"
          name="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Retapez le nouveau mot de passe"
          required
        />

        {/* Password Requirements */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
          <p className="text-sm font-semibold text-slate-300 mb-3">
            Critères de sécurité :
          </p>
          <div className="space-y-2">
            {requirements.map(req => {
              const met = checkRequirement(newPassword, req.key);
              return (
                <div key={req.key} className="flex items-center gap-2">
                  {met ? (
                    <Check size={16} className="text-green-400" />
                  ) : (
                    <X size={16} className="text-slate-500" />
                  )}
                  <span className={`text-sm ${met ? 'text-green-400' : 'text-slate-400'}`}>
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

        <p className="text-xs text-slate-400 text-center mt-4">
          Ce changement est obligatoire pour accéder à l'application
        </p>
      </form>
    </Modal>
  );
}
