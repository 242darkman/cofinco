/**
 * SecureValidationModal - Password/PIN confirmation for critical actions
 * 
 * Used by supervisors to confirm fund reception with identity verification.
 */

import React, { useState, useRef, useEffect } from 'react';
import { ShieldCheck, Eye, EyeOff, AlertTriangle, Loader2, Lock } from 'lucide-react';
import Button from '@/components/ui/Button';

interface SecureValidationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (password: string) => Promise<void>;
  title?: string;
  description?: string;
  operationDetails?: {
    agentName?: string;
    amount?: number;
    reference?: string;
  };
}

export default function SecureValidationModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirmation Sécurisée",
  description = "Entrez votre mot de passe pour confirmer la réception des fonds.",
  operationDetails
}: SecureValidationModalProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setError('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password.length < 4) {
      setError('Mot de passe trop court');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await onConfirm(password);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Mot de passe incorrect ou erreur de validation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div 
          className="pointer-events-auto w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-6 text-center border-b border-slate-700/50">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 border-2 border-amber-500/50 flex items-center justify-center">
              <ShieldCheck size={32} className="text-amber-500" />
            </div>
            <h2 className="text-xl font-bold text-white">{title}</h2>
            <p className="text-sm text-slate-400 mt-2">{description}</p>
          </div>

          {/* Operation Details */}
          {operationDetails && (
            <div className="mx-6 mt-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500 uppercase tracking-wider">Agent</span>
                <span className="text-sm font-medium text-white">{operationDetails.agentName || 'N/A'}</span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500 uppercase tracking-wider">Référence</span>
                <span className="text-xs font-mono text-cyan-400">{operationDetails.reference || 'N/A'}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
                <span className="text-xs text-slate-500 uppercase tracking-wider">Montant</span>
                <span className="text-2xl font-bold text-emerald-400">
                  {operationDetails.amount?.toLocaleString('fr-FR') || 0} <span className="text-sm">FCFA</span>
                </span>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-300 flex items-center gap-2">
                <Lock size={14} className="text-slate-500" />
                Votre mot de passe
              </label>
              <div className="relative">
                <input
                  ref={inputRef}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={`
                    w-full h-14 px-4 pr-12 rounded-xl text-lg font-medium
                    bg-slate-800 border-2 
                    ${error ? 'border-red-500' : 'border-slate-700 focus:border-amber-500'}
                    text-white placeholder-slate-500
                    focus:outline-none focus:ring-4 focus:ring-amber-500/10
                    transition-all
                  `}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              
              {error && (
                <div className="flex items-center gap-2 text-red-400 text-sm mt-2">
                  <AlertTriangle size={14} />
                  <span>{error}</span>
                </div>
              )}
            </div>

            {/* Warning */}
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-400 flex items-start gap-2">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <span>Cette action confirme la réception physique des fonds. Elle est irréversible et sera auditée.</span>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={loading}
                className="flex-1 h-12"
              >
                Annuler
              </Button>
              <Button
                type="submit"
                variant="success"
                disabled={loading || password.length < 4}
                className="flex-1 h-12 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin mr-2" />
                    Vérification...
                  </>
                ) : (
                  'Confirmer Réception'
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
