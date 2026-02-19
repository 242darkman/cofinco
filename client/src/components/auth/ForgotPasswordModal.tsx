import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Mail,
  Phone,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import Button from '../ui/Button';
import FormField from '../ui/FormField';
import { useLanguage } from '../../contexts/LanguageContext';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'identifier' | 'otp' | 'newPassword' | 'success';

export default function ForgotPasswordModal({ isOpen, onClose }: ForgotPasswordModalProps) {
  const { t } = useLanguage();
  const [step, setStep] = useState<Step>('identifier');
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [resendCountdown, setResendCountdown] = useState(0);

  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStep('identifier');
      setIdentifier('');
      setOtp(['', '', '', '', '', '']);
      setNewPassword('');
      setConfirmPassword('');
      setError('');
      setAttemptsRemaining(null);
      setResendCountdown(0);
    }
  }, [isOpen]);

  // Resend countdown timer
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setInterval(() => {
      setResendCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCountdown]);

  // Focus first OTP input when entering OTP step
  useEffect(() => {
    if (step === 'otp' && otpInputRefs.current[0]) {
      setTimeout(() => otpInputRefs.current[0]?.focus(), 100);
    }
  }, [step]);

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newOtp = [...otp];
    pasted.split('').forEach((char, i) => {
      if (i < 6) newOtp[i] = char;
    });
    setOtp(newOtp);
    // Focus the next empty input or last input
    const nextEmpty = newOtp.findIndex((v) => !v);
    otpInputRefs.current[nextEmpty === -1 ? 5 : nextEmpty]?.focus();
  };

  const handleRequestOtp = async () => {
    if (!identifier.trim()) {
      setError('Veuillez entrer votre email ou numéro de téléphone');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          setError(data.message || 'Trop de tentatives. Veuillez patienter.');
        } else {
          setError(data.message || 'Une erreur est survenue');
        }
        return;
      }

      // Success - move to OTP step
      setStep('otp');
      setResendCountdown(60); // 60 seconds before allowing resend
    } catch (err) {
      setError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtpAndReset = async () => {
    const otpCode = otp.join('');
    if (otpCode.length !== 6) {
      setError('Veuillez entrer le code complet à 6 chiffres');
      return;
    }

    if (!newPassword) {
      setError('Veuillez entrer un nouveau mot de passe');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    if (newPassword.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: identifier.trim(),
          code: otpCode,
          newPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.attemptsRemaining !== undefined) {
          setAttemptsRemaining(data.attemptsRemaining);
        }
        setError(data.message || 'Code invalide');
        return;
      }

      // Success!
      setStep('success');
    } catch (err) {
      setError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCountdown > 0) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || 'Erreur lors du renvoi du code');
        return;
      }

      setOtp(['', '', '', '', '', '']);
      setResendCountdown(60);
      setAttemptsRemaining(null);
    } catch (err) {
      setError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-md bg-gradient-to-br from-surface via-surface/95 to-surface-base rounded-2xl shadow-2xl border border-status-info/20 overflow-hidden"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-edge-subtle flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-status-info to-status-info flex items-center justify-center shadow-lg">
                <KeyRound className="text-white" size={20} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-content-primary">
                  {step === 'success' ? 'Mot de passe réinitialisé' : 'Mot de passe oublié'}
                </h2>
                <p className="text-sm text-content-muted">
                  {step === 'identifier' && 'Entrez votre email ou téléphone'}
                  {step === 'otp' && 'Vérification de sécurité'}
                  {step === 'newPassword' && 'Créez un nouveau mot de passe'}
                  {step === 'success' && 'Vous pouvez maintenant vous connecter'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-surface-elevated/50 transition-colors"
            >
              <X className="text-content-muted" size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            <AnimatePresence mode="wait">
              {/* Step 1: Identifier */}
              {step === 'identifier' && (
                <motion.div
                  key="identifier"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <p className="text-content-secondary text-sm">
                    Entrez l'adresse email ou le numéro de téléphone associé à votre compte.
                    Un code de vérification vous sera envoyé.
                  </p>

                  <FormField
                    label="Email ou Téléphone"
                    name="identifier"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="exemple@email.com ou +237..."
                    icon={identifier.includes('@') ? Mail : Phone}
                    autoFocus
                  />

                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-2 p-3 rounded-lg bg-status-danger-bg border border-status-danger/30"
                    >
                      <AlertCircle className="text-status-danger flex-shrink-0" size={16} />
                      <p className="text-sm text-status-danger">{error}</p>
                    </motion.div>
                  )}

                  <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    onClick={handleRequestOtp}
                    isLoading={loading}
                    icon={ArrowRight}
                    iconPosition="right"
                  >
                    Envoyer le code
                  </Button>
                </motion.div>
              )}

              {/* Step 2: OTP + New Password (combined for better UX) */}
              {step === 'otp' && (
                <motion.div
                  key="otp"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-5"
                >
                  <div className="text-center">
                    <p className="text-content-secondary text-sm">
                      Un code à 6 chiffres a été envoyé à <span className="font-medium text-content-primary">{identifier}</span>
                    </p>
                    <p className="text-content-muted text-xs mt-1">
                      Le code expire dans 5 minutes
                    </p>
                  </div>

                  {/* OTP Input */}
                  <div className="flex justify-center gap-2">
                    {otp.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => { otpInputRefs.current[index] = el; }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(index, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(index, e)}
                        onPaste={handleOtpPaste}
                        className="w-11 h-12 text-center text-xl font-semibold rounded-lg bg-surface-elevated/50 border border-edge-strong
                                 text-content-primary focus:border-status-info focus:ring-2 focus:ring-status-info/30 transition-all"
                      />
                    ))}
                  </div>

                  {/* Resend button */}
                  <div className="text-center">
                    {resendCountdown > 0 ? (
                      <p className="text-content-muted text-sm">
                        Renvoyer le code dans {resendCountdown}s
                      </p>
                    ) : (
                      <button
                        onClick={handleResendOtp}
                        disabled={loading}
                        className="text-status-info hover:text-status-info text-sm font-medium transition-colors"
                      >
                        Renvoyer le code
                      </button>
                    )}
                  </div>

                  {/* New Password Fields */}
                  <div className="pt-4 border-t border-edge-subtle space-y-4">
                    <h3 className="text-content-primary font-medium flex items-center gap-2">
                      <Lock size={16} className="text-status-info" />
                      Nouveau mot de passe
                    </h3>

                    <FormField
                      label="Nouveau mot de passe"
                      name="newPassword"
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 8 caractères"
                      icon={Lock}
                      rightIcon={showPassword ? EyeOff : Eye}
                      onRightIconClick={() => setShowPassword(!showPassword)}
                    />

                    <FormField
                      label="Confirmer le mot de passe"
                      name="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Retapez le mot de passe"
                      icon={Lock}
                      rightIcon={showConfirmPassword ? EyeOff : Eye}
                      onRightIconClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    />
                  </div>

                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-2 p-3 rounded-lg bg-status-danger-bg border border-status-danger/30"
                    >
                      <AlertCircle className="text-status-danger flex-shrink-0" size={16} />
                      <div>
                        <p className="text-sm text-status-danger">{error}</p>
                        {attemptsRemaining !== null && attemptsRemaining > 0 && (
                          <p className="text-xs text-status-warning mt-1">
                            {attemptsRemaining} tentative{attemptsRemaining > 1 ? 's' : ''} restante{attemptsRemaining > 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}

                  <div className="flex gap-3">
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={() => setStep('identifier')}
                      icon={ArrowLeft}
                      iconPosition="left"
                    >
                      Retour
                    </Button>
                    <Button
                      variant="primary"
                      size="lg"
                      className="flex-1"
                      onClick={handleVerifyOtpAndReset}
                      isLoading={loading}
                      icon={ShieldCheck}
                      iconPosition="left"
                    >
                      Réinitialiser
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* Step 3: Success */}
              {step === 'success' && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-6"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 10 }}
                    className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-status-success to-status-success flex items-center justify-center shadow-lg shadow-status-success/40"
                  >
                    <CheckCircle className="text-white" size={40} />
                  </motion.div>

                  <h3 className="text-xl font-bold text-content-primary mb-2">
                    Mot de passe réinitialisé !
                  </h3>
                  <p className="text-content-muted mb-6">
                    Votre mot de passe a été modifié
                    <br />
                    Vous pouvez maintenant vous connecter.
                  </p>

                  <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    onClick={onClose}
                  >
                    Retour à la connexion
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
