import React from 'react';
import { Key } from 'lucide-react';
import { PasswordData } from '../../../hooks/useUserProfile';
import Modal from '../../ui/Modal';
import Button from '../../ui/Button';

interface PasswordChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  passwordData: PasswordData;
  setPasswordData: (data: PasswordData) => void;
  error: string;
  onSubmit: () => void;
}

export default function PasswordChangeModal({
  isOpen, onClose, passwordData, setPasswordData, error, onSubmit
}: PasswordChangeModalProps) {
  
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Changer le mot de passe">
      <div className="space-y-4">
        {error && (
          <div className="p-4 bg-status-danger-bg border border-status-danger/20 rounded-xl text-status-danger text-sm flex items-center gap-2">
             <div className="w-1.5 h-1.5 rounded-full bg-status-danger shrink-0" />
             {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-content-secondary mb-2">
              Mot de passe actuel
            </label>
            <input
              type="password"
              value={passwordData.currentPassword}
              onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value as any })}
              className="w-full px-4 py-3 bg-surface-elevated/50 border border-edge-strong rounded-xl text-content-primary focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all duration-200"
              placeholder="Votre mot de passe actuel"
              data-testid="input-current-password"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-content-secondary mb-2">
              Nouveau mot de passe
            </label>
            <input
              type="password"
              value={passwordData.newPassword}
              onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value as any })}
              className="w-full px-4 py-3 bg-surface-elevated/50 border border-edge-strong rounded-xl text-content-primary focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all duration-200"
              placeholder="Minimum 8 caractères"
              data-testid="input-new-password"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-content-secondary mb-2">
              Confirmer le mot de passe
            </label>
            <input
              type="password"
              value={passwordData.confirmPassword}
              onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value as any })}
              className="w-full px-4 py-3 bg-surface-elevated/50 border border-edge-strong rounded-xl text-content-primary focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all duration-200"
              placeholder="Retapez le nouveau mot de passe"
              data-testid="input-confirm-password"
            />
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-6 border-t border-edge mt-6">
          <Button onClick={onClose} variant="ghost" className="w-full sm:w-auto">
            Annuler
          </Button>
          <Button
            onClick={onSubmit}
            variant="primary"
            className="w-full sm:w-auto"
            data-testid="button-submit-password"
            icon={Key}
          >
            Changer le mot de passe
          </Button>
        </div>
      </div>
    </Modal>
  );
}
