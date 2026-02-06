import React, { useState, useEffect } from 'react';
import { Lock, Unlock, Clock, AlertTriangle, Key, Shield, RefreshCw, X, CheckCircle } from 'lucide-react';
import { Card, Button, IconButton, LoadingSpinner, Badge } from '../../ui';
import { isAdminRole } from '@shared/types/roles';

interface AccessStatus {
  accessible: boolean;
  reason: string;
  message: string;
  operatingHours?: { open: string; close: string };
  nextOpening?: { day: string; time: string };
  closingTime?: string;
}

interface AuthStatus {
  authorized: boolean;
  reason: string;
  expiresAt?: string;
}

interface CaisseAccessControlProps {
  onAccessGranted: () => void;
  onClose?: () => void;
  userRole?: string;
}

export default function CaisseAccessControl({ onAccessGranted, onClose, userRole }: CaisseAccessControlProps) {
  const [accessStatus, setAccessStatus] = useState<AccessStatus | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState('');

  useEffect(() => { checkAccess(); }, []);

  useEffect(() => {
    if (accessStatus?.nextOpening || authStatus?.expiresAt) {
      const interval = setInterval(updateCountdown, 1000);
      return () => clearInterval(interval);
    }
  }, [accessStatus, authStatus]);

  const checkAccess = async () => {
    setLoading(true);
    try {
      const [accessRes, authRes] = await Promise.all([
        fetch('/api/access/status/caisse', { credentials: 'include' }),
        fetch('/api/caisse/authorization-status', { credentials: 'include' })
      ]);
      const accessData = await accessRes.json();
      const authData = await authRes.json();
      setAccessStatus(accessData);
      setAuthStatus(authData);
      if (accessData.accessible && authData.authorized) onAccessGranted();
    } catch {
      setError('Erreur de vérification d\'accès');
    } finally {
      setLoading(false);
    }
  };

  const updateCountdown = () => {
    if (authStatus?.expiresAt) {
      const diff = new Date(authStatus.expiresAt).getTime() - Date.now();
      if (diff <= 0) { setCountdown('Expiré'); checkAccess(); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    }
  };

  const validateCode = async () => {
    if (code.length !== 6) { setError('Le code doit contenir 6 caractères'); return; }
    setValidating(true);
    setError('');
    try {
      const res = await fetch('/api/caisse/access-codes/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code: code.toUpperCase() })
      });
      const data = await res.json();
      if (res.ok && data.success) await checkAccess();
      else setError(data.error || 'Code invalide');
    } catch {
      setError('Erreur de validation');
    } finally {
      setValidating(false);
    }
  };

  const handleCodeInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (value.length <= 6) { setCode(value); setError(''); }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isAdminRole(userRole) || (accessStatus?.accessible && authStatus?.authorized)) return null;

  const isOutsideHours = !accessStatus?.accessible;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4">
      <Card variant="elevated" className="w-full max-w-sm bg-surface-base border-edge max-h-[95vh] flex flex-col" padding="none">
        {/* Header - Compact */}
        <div className={`px-3 py-3 sm:px-4 sm:py-4 flex items-center gap-3 border-b border-edge ${isOutsideHours ? 'bg-danger/10' : 'bg-primary/10'}`}>
          <div className={`p-2 sm:p-2.5 rounded-xl ${isOutsideHours ? 'bg-danger/20' : 'bg-primary/20'}`}>
            {isOutsideHours ? <Lock className="w-5 h-5 text-danger" /> : <Key className="w-5 h-5 text-primary" />}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-content-primary truncate">
              {isOutsideHours ? 'Caisse Fermée' : 'Authentification Requise'}
            </h2>
            <p className="text-[10px] sm:text-xs text-content-muted truncate">
              {isOutsideHours ? 'Hors des horaires d\'ouverture' : 'Entrez votre code d\'accès'}
            </p>
          </div>
          {onClose && <IconButton icon={X} variant="ghost" size="sm" onClick={onClose} aria-label="Fermer" />}
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
          {isOutsideHours && (
            <>
              {/* Status Info */}
              <div className="bg-surface-muted rounded-xl p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-warning shrink-0" />
                  <span className="text-xs sm:text-sm text-content-primary font-medium">{accessStatus?.message}</span>
                </div>
                {accessStatus?.operatingHours && (
                  <p className="text-[10px] sm:text-xs text-content-muted pl-6">
                    Horaires: {accessStatus.operatingHours.open} - {accessStatus.operatingHours.close}
                  </p>
                )}
                {accessStatus?.nextOpening && (
                  <p className="text-[10px] sm:text-xs text-primary pl-6">
                    Prochaine ouverture: {accessStatus.nextOpening.day} à {accessStatus.nextOpening.time}
                  </p>
                )}
              </div>

              {/* Emergency Warning */}
              <div className="bg-warning/10 border border-warning/30 rounded-xl p-3">
                <div className="flex gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-warning">Accès d'urgence</p>
                    <p className="text-[10px] sm:text-xs text-content-muted mt-0.5">
                      Contactez votre administrateur pour obtenir un code d'accès d'urgence si nécessaire.
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-[10px] sm:text-xs text-center text-content-muted">
                Ou entrez un code d'accès d'urgence
              </p>
            </>
          )}

          {/* Code Input */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-content-secondary">Code de sécurité</label>
            <div className="relative">
              <input
                type="text"
                value={code}
                onChange={handleCodeInput}
                onKeyDown={(e) => e.key === 'Enter' && validateCode()}
                placeholder="XXXXXX"
                className="w-full px-3 py-3 sm:py-3.5 bg-surface-muted border border-edge rounded-xl text-content-primary text-center text-lg sm:text-xl tracking-[0.3em] font-mono placeholder:tracking-normal placeholder:text-base focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                maxLength={6}
                autoFocus
                data-testid="input-security-code"
              />
              <Shield className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-content-muted">{code.length}/6 caractères</span>
              {error && <span className="text-[10px] sm:text-xs text-danger font-medium">{error}</span>}
            </div>
          </div>

          {/* Authorized Status */}
          {authStatus?.authorized && authStatus.expiresAt && (
            <div className="bg-success/10 border border-success/30 rounded-xl p-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-success" />
                <div>
                  <p className="text-xs font-semibold text-success">Accès autorisé</p>
                  <p className="text-[10px] text-content-muted">Expire dans: {countdown}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer - Fixed */}
        <div className="p-3 sm:p-4 border-t border-edge bg-surface-muted/50 space-y-2">
          <Button
            onClick={validateCode}
            isLoading={validating}
            disabled={code.length !== 6}
            variant="primary"
            icon={Unlock}
            className="w-full"
            size="sm"
            data-testid="btn-validate-code"
          >
            Valider le code
          </Button>
          
          <p className="text-[9px] sm:text-[10px] text-center text-content-muted">
            Les codes d'accès sont générés par l'administrateur ou le chef d'agence.
          </p>

          {onClose && (
            <Button variant="ghost" icon={X} size="sm" className="w-full" onClick={onClose} data-testid="btn-exit-caisse">
              Sortie
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
