import React, { useState, useCallback } from 'react';
import { CreditCard, Info, Eye, EyeOff, Check, X } from 'lucide-react';
import { authApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import LoadingSpinner from '../../ui/LoadingSpinner';
import Button from '../../ui/Button';

// PIN Form Props Interface
export interface PinFormProps {
  formData: { currentPassword: string; newPin: string; confirmPin: string };
  setFormData: (data: any) => void;
  showPassword: boolean;
  setShowPassword: (show: boolean) => void;
  loading: boolean;
  error: string;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

export function PinForm({ formData, setFormData, showPassword, setShowPassword, loading, error, onSubmit, onCancel }: PinFormProps) {
  const [showPin, setShowPin] = useState(false);

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      {error && (
        <div className="text-[10px] sm:text-xs text-status-danger bg-status-danger-bg p-2 rounded font-medium">
          {error}
        </div>
      )}

      <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={formData.currentPassword}
            onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
            className="w-full px-2.5 py-1.5 bg-surface-base border border-edge rounded-lg text-content-primary text-sm focus:border-accent outline-none pr-8 h-9 transition-colors"
            placeholder="Mot de passe actuel"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-primary p-1"
          >
            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="relative">
          <input
            type={showPin ? 'text' : 'password'}
            value={formData.newPin}
            onChange={(e) => setFormData({ ...formData, newPin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
            className="w-full px-2.5 py-1.5 bg-surface-base border border-edge rounded-lg text-content-primary text-center text-sm font-mono tracking-widest focus:border-accent outline-none pr-8 h-9 transition-colors"
            placeholder="Nouveau"
            maxLength={6}
            inputMode="numeric"
            required
          />
          <button
            type="button"
            onClick={() => setShowPin(!showPin)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-primary p-1"
          >
            {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <div className="relative">
          <input
            type={showPin ? 'text' : 'password'}
            value={formData.confirmPin}
            onChange={(e) => setFormData({ ...formData, confirmPin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
            className="w-full px-2.5 py-1.5 bg-surface-base border border-edge rounded-lg text-content-primary text-center text-sm font-mono tracking-widest focus:border-accent outline-none pr-8 h-9 transition-colors"
            placeholder="Confirmer"
            maxLength={6}
            inputMode="numeric"
            required
          />
          <button
            type="button"
            onClick={() => setShowPin(!showPin)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-primary p-1"
          >
            {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      <p className="text-xs text-content-muted px-1">6 chiffres minimum requis</p>

      <div className="flex gap-2 pt-1">
        <Button
          type="submit"
          disabled={loading}
          variant="primary"
          size="sm"
          className="flex-1"
        >
          {loading ? <LoadingSpinner size="sm" /> : <Check size={14} />}
          Confirmer
        </Button>
        <Button
          type="button"
          onClick={onCancel}
          variant="outline"
          size="sm"
        >
          <X size={14} />
        </Button>
      </div>
    </form>
  );
}

// ==================== CAISSE PIN MANAGER ====================
export interface CaissePinManagerProps {
  hasPin?: boolean;
  onPinConfigured: () => void;
  canAccessCaisse: boolean; // Peut accéder à la caisse (via rôle OU permissions)
}

export function CaissePinManager({ hasPin, onPinConfigured, canAccessCaisse }: CaissePinManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ currentPassword: '', newPin: '', confirmPin: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.newPin !== formData.confirmPin) {
      setError('Les PINs sont différents');
      return;
    }
    if (!/^\d{6}$/.test(formData.newPin)) {
      setError('6 chiffres requis');
      return;
    }

    setLoading(true);
    try {
      await authApi.setCaissePin({
        currentPassword: formData.currentPassword,
        newPin: formData.newPin
      });
      toast.success('PIN configuré');
      setFormData({ currentPassword: '', newPin: '', confirmPin: '' });
      setShowForm(false);
      onPinConfigured();
    } catch (err: any) {
      setError(handleApiError(err, 'Erreur de configuration du PIN'));
    } finally {
      setLoading(false);
    }
  }, [formData, onPinConfigured]);
  
  if (!canAccessCaisse) {
       return (
        <div className="flex items-center gap-2 text-xs text-content-muted bg-surface-base/50 p-2.5 rounded-lg border border-edge">
          <Info size={14} className="shrink-0" />
          <span>PIN Caisse non requis (aucune permission caisse).</span>
        </div>
       );
  }

  if (showForm) {
      return (
        <div className="p-3 rounded-xl border bg-surface-base border-edge shadow-sm">
           <PinForm
            formData={formData}
            setFormData={setFormData}
            showPassword={showPassword}
            setShowPassword={setShowPassword}
            loading={loading}
            error={error}
            onSubmit={handleSubmit}
            onCancel={() => setShowForm(false)}
          />
        </div>
      );
  }

  return (
    <div className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${!hasPin ? 'bg-status-warning-bg border-status-warning/30' : 'bg-surface-base border-edge'}`}>
       <div className="flex items-center gap-3">
            <div className={`p-1.5 rounded-lg ${hasPin ? 'bg-status-success/10' : 'bg-status-warning/10'}`}>
              <CreditCard size={16} className={hasPin ? "text-status-success" : "text-status-warning"} />
            </div>
            <div className="flex flex-col">
                 <span className={`text-xs font-bold ${hasPin ? "text-status-success" : "text-status-warning"}`}>
                     {hasPin ? 'PIN Actif' : 'PIN Inactif'}
                 </span>
                 <span className="text-[10px] text-content-muted leading-tight mt-0.5">Accès caisse</span>
            </div>
       </div>
       <Button
            size="sm"
            variant={hasPin ? "secondary" : "primary"}
            onClick={() => setShowForm(true)}
            className="text-xs"
       >
            {hasPin ? 'Modifier' : 'Créer'}
       </Button>
    </div>
  );
}
