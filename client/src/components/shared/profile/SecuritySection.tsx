import React, { useState, useCallback } from 'react';
import { Key, KeyRound, Shield, Eye, EyeOff, Check, AlertCircle, Info } from 'lucide-react';
import Card from '../../ui/Card';
import Button from '../../ui/Button';
import { authApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { SystemRole, normalizeRole } from '@shared/types/roles';

interface SecuritySectionProps {
  onChangePasswordClick: () => void;
  user?: { id: string; role: string } | null;
}

export default function SecuritySection({ onChangePasswordClick, user }: SecuritySectionProps) {
  const [showPinForm, setShowPinForm] = useState(false);
  const [formData, setFormData] = useState({ currentPassword: '', newPin: '', confirmPin: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const normalizedRole = normalizeRole(user?.role);
  const isSupervisor = normalizedRole === SystemRole.ADMIN || normalizedRole === SystemRole.CHEF_AGENCE;

  const handleSubmitPin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (formData.newPin !== formData.confirmPin) {
      setError('Les PIN ne correspondent pas');
      return;
    }
    if (!/^\d{6}$/.test(formData.newPin)) {
      setError('Le PIN doit contenir exactement 6 chiffres');
      return;
    }

    setLoading(true);
    try {
      await authApi.setCaissePin({
        currentPassword: formData.currentPassword,
        newPin: formData.newPin
      });

      setSuccess('PIN caisse configuré avec succès !');
      toast.success('PIN caisse configuré avec succès');
      setFormData({ currentPassword: '', newPin: '', confirmPin: '' });
      setShowPinForm(false);
    } catch (err: any) {
      setError(handleApiError(err, 'Erreur lors de la configuration du PIN'));
    } finally {
      setLoading(false);
    }
  }, [formData]);

  return (
    <Card className="p-6">
      <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2 border-b border-slate-700 pb-4">
        <Shield size={24} className="text-cyan-400" />
        Sécurité
      </h2>

      <div className="space-y-4">
        {/* Messages */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}
        {success && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <p className="text-xs text-emerald-400 font-medium">{success}</p>
          </div>
        )}

        {/* Mot de passe */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-700/20 p-4 rounded-xl border border-slate-700/50">
          <div>
            <h3 className="text-white font-semibold">Mot de passe</h3>
            <p className="text-slate-400 text-sm mt-1">Modifiez votre mot de passe de connexion</p>
          </div>
          <Button
            onClick={onChangePasswordClick}
            variant="secondary"
            icon={Key}
          >
            Changer
          </Button>
        </div>

        {/* PIN Caisse - Visible uniquement pour superviseurs */}
        {isSupervisor && (
          <div className="bg-slate-700/20 p-4 rounded-xl border border-slate-700/50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-white font-semibold flex items-center gap-2">
                  <KeyRound size={16} className="text-indigo-400" />
                  PIN Caisse
                </h3>
                <p className="text-slate-400 text-sm mt-1">Code à 6 chiffres pour autoriser les opérations de caisse</p>
              </div>
              <Button
                onClick={() => setShowPinForm(!showPinForm)}
                variant="secondary"
                icon={KeyRound}
              >
                {showPinForm ? 'Annuler' : 'Configurer'}
              </Button>
            </div>

            {/* Formulaire PIN */}
            {showPinForm && (
              <form onSubmit={handleSubmitPin} className="mt-4 pt-4 border-t border-slate-700 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Mot de passe actuel</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.currentPassword}
                      onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-white text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none pr-10"
                      placeholder="••••••••"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Nouveau PIN</label>
                    <input
                      type="password"
                      value={formData.newPin}
                      onChange={(e) => setFormData({ ...formData, newPin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                      className="w-full px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-white text-center text-lg font-mono tracking-widest focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      placeholder="000000"
                      maxLength={6}
                      inputMode="numeric"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Confirmer PIN</label>
                    <input
                      type="password"
                      value={formData.confirmPin}
                      onChange={(e) => setFormData({ ...formData, confirmPin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                      className="w-full px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-white text-center text-lg font-mono tracking-widest focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      placeholder="000000"
                      maxLength={6}
                      inputMode="numeric"
                      required
                    />
                  </div>
                </div>

                <Button type="submit" isLoading={loading} variant="primary" icon={Check} className="w-full">
                  Enregistrer le PIN
                </Button>
              </form>
            )}
          </div>
        )}

        {/* Info pour non-superviseurs */}
        {!isSupervisor && (
          <div className="bg-slate-700/10 border border-slate-700/30 rounded-xl p-3 flex items-start gap-2">
            <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-500">
              Le PIN Caisse est réservé aux superviseurs (Administrateurs et Chefs d'Agence).
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
