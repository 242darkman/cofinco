import React, { useState, useCallback } from 'react';
import { KeyRound, Shield, Check, X } from 'lucide-react';
import { Button, Modal } from '../../ui';
import { userApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';

interface UserPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
}

export default function UserPinModal({ isOpen, onClose, userId, userName }: UserPinModalProps) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (pin.length !== 6 || !/^\d+$/.test(pin)) {
      setError('Le PIN doit contenir exactement 6 chiffres');
      return;
    }

    if (pin !== confirmPin) {
      setError('Les PIN ne correspondent pas');
      return;
    }

    setLoading(true);
    try {
      await userApi.setCaissePin(userId, pin);

      toast.success('PIN configuré avec succès');
      onClose();
      setPin('');
      setConfirmPin('');
    } catch (err: any) {
      setError(handleApiError(err, 'Erreur lors de la configuration du PIN'));
    } finally {
      setLoading(false);
    }
  }, [pin, confirmPin, userId, onClose]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Définir PIN Caisse - ${userName}`} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-lg flex items-start gap-3">
          <Shield className="w-5 h-5 text-blue-400 mt-0.5" />
          <p className="text-sm text-blue-200">
            Vous définissez le code PIN pour cet utilisateur. Ce code sera requis pour autoriser les opérations sensibles en caisse.
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 p-2 rounded text-sm text-red-400 text-center">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Nouveau PIN (6 chiffres)</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-center text-2xl tracking-widest focus:outline-none focus:border-blue-500"
              placeholder="000000"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Confirmer le PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-center text-2xl tracking-widest focus:outline-none focus:border-blue-500"
              placeholder="000000"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <Button 
            type="submit" 
            variant="primary" 
            disabled={loading || pin.length !== 6} 
            isLoading={loading}
            icon={KeyRound}
          >
            Définir le PIN
          </Button>
        </div>
      </form>
    </Modal>
  );
}
