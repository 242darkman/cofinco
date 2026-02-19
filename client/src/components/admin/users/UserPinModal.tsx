import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { KeyRound, Shield, Check, X, AlertTriangle, Sparkles, Eye, EyeOff } from 'lucide-react';
import { Button, Modal } from '../../ui';
import { userApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { motion, AnimatePresence } from 'framer-motion';

interface UserPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
}

// Validate PIN security (avoid weak patterns)
function validatePinSecurity(pin: string): { isWeak: boolean; reason?: string } {
  if (pin.length < 6) return { isWeak: false };

  // Check for sequential numbers (123456, 654321)
  const sequential = '0123456789';
  const reverseSequential = '9876543210';
  if (sequential.includes(pin) || reverseSequential.includes(pin)) {
    return { isWeak: true, reason: 'Évitez les séquences (123456)' };
  }

  // Check for repeated digits (000000, 111111)
  if (/^(\d)\1{5}$/.test(pin)) {
    return { isWeak: true, reason: 'Évitez les répétitions (000000)' };
  }

  // Check for common patterns
  const weakPatterns = ['123123', '121212', '112233', '001122'];
  if (weakPatterns.includes(pin)) {
    return { isWeak: true, reason: 'Pattern trop prévisible' };
  }

  return { isWeak: false };
}

// Success celebration particles
function SuccessParticles() {
  const particles = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 0.3,
      duration: 0.8 + Math.random() * 0.4,
      size: 4 + Math.random() * 8,
      color: ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#14b8a6', '#5eead4'][Math.floor(Math.random() * 6)]
    }))
  , []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            bottom: '50%',
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
          }}
          initial={{ y: 0, opacity: 1, scale: 0 }}
          animate={{
            y: [-20, -150 - Math.random() * 100],
            x: [0, (Math.random() - 0.5) * 100],
            opacity: [1, 1, 0],
            scale: [0, 1, 0.5],
            rotate: [0, 360],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: 'easeOut',
          }}
        />
      ))}
    </div>
  );
}

// Animated checkmark for success
function AnimatedCheckmark() {
  return (
    <motion.div
      className="relative flex items-center justify-center"
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 15 }}
    >
      <motion.div
        className="absolute w-24 h-24 rounded-full bg-status-success-bg"
        initial={{ scale: 0 }}
        animate={{ scale: [0, 1.5, 1] }}
        transition={{ duration: 0.6 }}
      />
      <motion.div
        className="absolute w-20 h-20 rounded-full bg-status-success/30"
        initial={{ scale: 0 }}
        animate={{ scale: [0, 1.3, 1] }}
        transition={{ duration: 0.5, delay: 0.1 }}
      />
      <motion.div
        className="w-16 h-16 rounded-full bg-gradient-to-br from-status-success to-status-success flex items-center justify-center shadow-lg shadow-status-success/50"
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
      >
        <motion.div
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.4, delay: 0.4 }}
        >
          <Check className="w-8 h-8 text-content-primary" strokeWidth={3} />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

// Individual PIN digit display
function PinDigit({ value, isFilled, isActive, showDigit }: { value: string; isFilled: boolean; isActive: boolean; showDigit: boolean }) {
  return (
    <motion.div
      className={`
        w-10 h-12 rounded-lg border-2 flex items-center justify-center text-xl font-bold
        transition-all duration-200
        ${isFilled
          ? 'border-status-success bg-status-success-bg text-status-success'
          : isActive
            ? 'border-primary bg-primary/10'
            : 'border-edge-strong bg-surface/50'
        }
      `}
      animate={isFilled ? { scale: [1, 1.1, 1] } : {}}
      transition={{ duration: 0.15 }}
    >
      {isFilled ? (showDigit ? value : '●') : ''}
    </motion.div>
  );
}

export default function UserPinModal({ isOpen, onClose, userId, userName }: UserPinModalProps) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [activeField, setActiveField] = useState<'pin' | 'confirm'>('pin');
  const [showPin, setShowPin] = useState(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setPin('');
      setConfirmPin('');
      setError('');
      setShowSuccess(false);
      setActiveField('pin');
    }
  }, [isOpen]);

  // Auto-switch to confirm field when first PIN is complete
  useEffect(() => {
    if (pin.length === 6 && activeField === 'pin') {
      setActiveField('confirm');
    }
  }, [pin, activeField]);

  const pinSecurity = useMemo(() => validatePinSecurity(pin), [pin]);
  const pinsMatch = pin.length === 6 && confirmPin.length === 6 && pin === confirmPin;
  const pinsMismatch = confirmPin.length === 6 && pin !== confirmPin;

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

    if (pinSecurity.isWeak) {
      setError(pinSecurity.reason || 'PIN trop faible');
      return;
    }

    setLoading(true);
    try {
      await userApi.setCaissePin(userId, pin);

      // Show success animation
      setShowSuccess(true);

      // Close after animation
      setTimeout(() => {
        toast.success('PIN configuré');
        onClose();
      }, 1800);
    } catch (err: any) {
      setError(handleApiError(err, 'Erreur lors de la configuration du PIN'));
    } finally {
      setLoading(false);
    }
  }, [pin, confirmPin, userId, onClose, pinSecurity]);

  // Handle keyboard input for PIN
  const handlePinInput = useCallback((e: React.ChangeEvent<HTMLInputElement>, field: 'pin' | 'confirm') => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    if (field === 'pin') {
      setPin(value);
      setError('');
    } else {
      setConfirmPin(value);
      setError('');
    }
  }, []);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Définir PIN Caisse - ${userName}`} size="sm">
      <AnimatePresence mode="wait">
        {showSuccess ? (
          <motion.div
            key="success"
            className="py-8 flex flex-col items-center justify-center relative"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <SuccessParticles />
            <AnimatedCheckmark />
            <motion.p
              className="mt-6 text-lg font-medium text-status-success"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              PIN configuré !
            </motion.p>
            <motion.p
              className="mt-1 text-sm text-content-muted"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
            >
              {userName} peut maintenant utiliser ce PIN
            </motion.p>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            onSubmit={handleSubmit}
            className="space-y-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Info banner */}
            <div className="bg-status-info-bg border border-status-info/20 p-3 rounded-lg flex items-start gap-3">
              <Shield className="w-5 h-5 text-status-info mt-0.5 flex-shrink-0" />
              <p className="text-sm text-status-info-text">
                Vous définissez le code PIN pour cet utilisateur. Ce code sera requis pour autoriser les opérations sensibles en caisse.
              </p>
            </div>

            {/* Error message */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-status-danger-bg border border-status-danger/20 p-3 rounded-lg flex items-center gap-2 text-sm text-status-danger"
                >
                  <X className="w-4 h-4 flex-shrink-0" />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* PIN Input */}
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-content-secondary">
                    Nouveau PIN (6 chiffres)
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="flex items-center gap-1 text-xs text-content-muted hover:text-content-primary transition-colors"
                  >
                    {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
                    <span>{showPin ? 'Masquer' : 'Afficher'}</span>
                  </button>
                </div>
                <div className="flex justify-center gap-2 mb-2">
                  {Array.from({ length: 6 }, (_, i) => (
                    <PinDigit
                      key={i}
                      value={pin[i] || ''}
                      isFilled={i < pin.length}
                      isActive={activeField === 'pin' && i === pin.length}
                      showDigit={showPin}
                    />
                  ))}
                </div>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => handlePinInput(e, 'pin')}
                  onFocus={() => setActiveField('pin')}
                  className="sr-only"
                  autoFocus
                  aria-label="PIN"
                />
                {/* Clickable area to focus input */}
                <div
                  className="flex justify-center"
                  onClick={() => {
                    setActiveField('pin');
                    const input = document.querySelector('input[aria-label="PIN"]') as HTMLInputElement;
                    input?.focus();
                  }}
                >
                  <span className="text-xs text-content-muted cursor-pointer hover:text-content-muted">
                    Cliquez pour saisir
                  </span>
                </div>

                {/* Security warning */}
                <AnimatePresence>
                  {pinSecurity.isWeak && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="mt-2 flex items-center gap-2 text-status-warning text-xs"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {pinSecurity.reason}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Confirm PIN */}
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-2">
                  Confirmer le PIN
                </label>
                <div className="flex justify-center gap-2 mb-2">
                  {Array.from({ length: 6 }, (_, i) => (
                    <motion.div
                      key={i}
                      className={`
                        w-10 h-12 rounded-lg border-2 flex items-center justify-center text-xl font-bold
                        transition-all duration-200
                        ${i < confirmPin.length
                          ? pinsMatch
                            ? 'border-status-success bg-status-success-bg text-status-success'
                            : pinsMismatch
                              ? 'border-status-danger bg-status-danger-bg text-status-danger'
                              : 'border-primary bg-primary/10 text-primary'
                          : activeField === 'confirm' && i === confirmPin.length
                            ? 'border-primary bg-primary/10'
                            : 'border-edge-strong bg-surface/50'
                        }
                      `}
                      animate={i < confirmPin.length ? { scale: [1, 1.1, 1] } : {}}
                      transition={{ duration: 0.15 }}
                    >
                      {i < confirmPin.length ? (showPin ? confirmPin[i] : '●') : ''}
                    </motion.div>
                  ))}
                </div>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={confirmPin}
                  onChange={(e) => handlePinInput(e, 'confirm')}
                  onFocus={() => setActiveField('confirm')}
                  className="sr-only"
                  aria-label="Confirm PIN"
                />
                <div
                  className="flex justify-center"
                  onClick={() => {
                    setActiveField('confirm');
                    const input = document.querySelector('input[aria-label="Confirm PIN"]') as HTMLInputElement;
                    input?.focus();
                  }}
                >
                  <span className="text-xs text-content-muted cursor-pointer hover:text-content-muted">
                    Cliquez pour saisir
                  </span>
                </div>

                {/* Match indicator */}
                <AnimatePresence>
                  {pinsMatch && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="mt-2 flex items-center justify-center gap-2 text-status-success text-xs"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Les PIN correspondent
                    </motion.div>
                  )}
                  {pinsMismatch && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="mt-2 flex items-center justify-center gap-2 text-status-danger text-xs"
                    >
                      <X className="w-3.5 h-3.5" />
                      Les PIN ne correspondent pas
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <p className="text-xs text-content-muted text-center">6 chiffres minimum requis</p>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
                Annuler
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={loading || pin.length !== 6 || confirmPin.length !== 6 || !pinsMatch || pinSecurity.isWeak}
                isLoading={loading}
                icon={pinsMatch && !pinSecurity.isWeak ? Sparkles : KeyRound}
                className={pinsMatch && !pinSecurity.isWeak ? 'bg-gradient-to-r from-status-success to-accent hover:from-status-success hover:to-accent' : ''}
              >
                Définir le PIN
              </Button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </Modal>
  );
}
