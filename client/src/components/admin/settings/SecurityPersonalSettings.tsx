import React, { useState, useCallback } from 'react';
import { KeyRound, Lock, Smartphone, Shield, Eye, EyeOff, Check, AlertCircle, Info } from 'lucide-react';
import { Card, Button, Badge } from '../../ui';
import { authApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';

interface SecurityPersonalSettingsProps {
  user?: { id: string; role: string; } | null;
}

export default function SecurityPersonalSettings({ user }: SecurityPersonalSettingsProps) {
  const [showPinForm, setShowPinForm] = useState(false);
  const [formData, setFormData] = useState({ currentPassword: '', newPin: '', confirmPin: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const isSupervisor = user?.role && ['Administrateur', "Chef d'Agence"].includes(user.role);

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

  // Features configuration with availability status
  const securityFeatures = [
    { 
      id: 'pin_caisse',
      icon: KeyRound,
      title: 'PIN Caisse',
      description: 'Code à 6 chiffres pour autoriser les ouvertures de caisse',
      available: isSupervisor,
      unavailableReason: !isSupervisor ? 'Réservé aux superviseurs' : undefined,
      action: () => setShowPinForm(!showPinForm)
    },
    {
      id: '2fa',
      icon: Smartphone,
      title: 'Authentification 2FA',
      description: 'Double authentification par application mobile',
      available: false,
      unavailableReason: 'Prochainement disponible',
      action: undefined
    },
    {
      id: 'sms_otp',
      icon: Shield,
      title: 'SMS OTP',
      description: 'Vérification par code SMS',
      available: false,
      unavailableReason: 'Service SMS non configuré',
      action: undefined
    },
    {
      id: 'biometric',
      icon: Eye,
      title: 'Biométrie',
      description: 'Connexion par empreinte ou Face ID',
      available: false,
      unavailableReason: 'Prochainement disponible',
      action: undefined
    }
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-lg sm:text-xl font-semibold text-content-primary mb-4">Sécurité du Compte</h3>

      {/* Messages */}
      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-danger shrink-0" />
          <p className="text-xs text-danger">{error}</p>
        </div>
      )}
      {success && (
        <div className="bg-success/10 border border-success/30 rounded-xl p-3 flex items-center gap-2">
          <Check className="w-4 h-4 text-success shrink-0" />
          <p className="text-xs text-success font-medium">{success}</p>
        </div>
      )}

      {/* Security Features Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {securityFeatures.map((feature) => {
          const Icon = feature.icon;
          return (
            <div
              key={feature.id}
              className={`p-4 rounded-xl border transition-all ${
                feature.available 
                  ? 'bg-surface-muted border-edge hover:border-primary/50 cursor-pointer' 
                  : 'bg-surface-muted/50 border-edge/50 opacity-60'
              }`}
              onClick={feature.available ? feature.action : undefined}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${feature.available ? 'bg-primary/20' : 'bg-surface-base'}`}>
                  <Icon className={`w-5 h-5 ${feature.available ? 'text-primary' : 'text-content-muted'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className={`text-sm font-semibold ${feature.available ? 'text-content-primary' : 'text-content-muted'}`}>
                      {feature.title}
                    </h4>
                    {!feature.available && (
                      <Badge variant="neutral" size="sm" value="Indisponible" />
                    )}
                  </div>
                  <p className="text-[10px] sm:text-xs text-content-muted">{feature.description}</p>
                  {!feature.available && feature.unavailableReason && (
                    <p className="text-[10px] text-warning mt-1 flex items-center gap-1">
                      <Info size={10} /> {feature.unavailableReason}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* PIN Configuration Form */}
      {showPinForm && isSupervisor && (
        <Card variant="elevated" padding="md" className="mt-4 border-primary/30">
          <h4 className="text-sm font-bold text-content-primary mb-4 flex items-center gap-2">
            <KeyRound size={16} className="text-primary" />
            Configurer mon PIN Caisse
          </h4>
          <form onSubmit={handleSubmitPin} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-content-secondary mb-1.5">Mot de passe actuel</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.currentPassword}
                  onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
                  className="w-full px-3 py-2.5 bg-surface-muted border border-edge rounded-xl text-content-primary text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none pr-10"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-primary"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-content-secondary mb-1.5">Nouveau PIN</label>
                <input
                  type="password"
                  value={formData.newPin}
                  onChange={(e) => setFormData({ ...formData, newPin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                  className="w-full px-3 py-2.5 bg-surface-muted border border-edge rounded-xl text-content-primary text-center text-lg font-mono tracking-widest focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                  placeholder="000000"
                  maxLength={6}
                  inputMode="numeric"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-content-secondary mb-1.5">Confirmer PIN</label>
                <input
                  type="password"
                  value={formData.confirmPin}
                  onChange={(e) => setFormData({ ...formData, confirmPin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                  className="w-full px-3 py-2.5 bg-surface-muted border border-edge rounded-xl text-content-primary text-center text-lg font-mono tracking-widest focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                  placeholder="000000"
                  maxLength={6}
                  inputMode="numeric"
                  required
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit" isLoading={loading} variant="primary" size="sm" icon={Check} className="flex-1">
                Enregistrer
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowPinForm(false)}>
                Annuler
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Hint for non-supervisors */}
      {!isSupervisor && (
        <div className="bg-info/10 border border-info/30 rounded-xl p-3 flex items-start gap-2 mt-4">
          <Info className="w-4 h-4 text-info shrink-0 mt-0.5" />
          <p className="text-xs text-content-secondary">
            Certaines fonctionnalités de sécurité avancées sont réservées aux superviseurs (Administrateurs et Chefs d'Agence).
          </p>
        </div>
      )}
    </div>
  );
}
