import React, { useState, useEffect, useRef } from 'react';
import { Lock, X, Clock, AlertCircle, CheckCircle, Send, RefreshCw } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useLanguage } from '../../contexts/LanguageContext';

interface OTPValidationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (validationData: any) => void;
  transactionType: string;
  transactionReference: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  montant: number;
  createdBy: string;
  createdByRole: string;
}

export default function OTPValidationModal({
  isOpen,
  onClose,
  onSuccess,
  transactionType,
  transactionReference,
  clientId,
  clientName,
  clientPhone,
  montant,
  createdBy,
  createdByRole
}: OTPValidationModalProps) {
  const { t } = useLanguage();
  const [step, setStep] = useState<'generating' | 'waiting' | 'validating' | 'success' | 'error'>('generating');
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [timeLeft, setTimeLeft] = useState(300);
  const [otpId, setOtpId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState(3);
  const [otpCodeDisplay, setOtpCodeDisplay] = useState<string | null>(null);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (isOpen) {
      generateOTP();
    }
  }, [isOpen]);

  useEffect(() => {
    if (step === 'waiting' && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            setStep('error');
            setError('codeExpire');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [step, timeLeft]);

  const generateOTP = async () => {
    setStep('generating');
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/otp/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          transactionType,
          transactionReference,
          clientId,
          clientPhone,
          montant,
          createdBy,
          createdByRole
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'erreurGenerationOtp');
      }

      if (data.success) {
        setOtpId(data.otp_id);
        setExpiresAt(data.expires_at);
        setTimeLeft(300);

        if (data.otp_code_debug) {
          console.log('%c🔐 CODE OTP: ' + data.otp_code_debug, 'background: #1a1a1a; color: #00ff00; font-size: 24px; padding: 15px; border: 2px solid #00ff00;');
          console.log('%c📱 Client: ' + clientName + ' (' + clientPhone + ')', 'background: #1a1a1a; color: #00aaff; font-size: 16px; padding: 10px;');
          console.log('%c💰 Montant: ' + montant.toLocaleString() + ' FCFA', 'background: #1a1a1a; color: #ffaa00; font-size: 16px; padding: 10px;');
          setOtpCodeDisplay(data.otp_code_debug);
        }

        setStep('waiting');
        inputRefs.current[0]?.focus();
      } else {
        throw new Error(data.error || 'erreurGenerationOtp');
      }
    } catch (err: any) {
      console.error('OTP generation error:', err);
      setError(err.error || 'impossibleGenererOtp');
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) {
      value = value[0];
    }

    if (!/^\d*$/.test(value)) {
      return;
    }

    const newOtp = [...otpCode];
    newOtp[index] = value;
    setOtpCode(newOtp);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').slice(0, 6);
    if (/^\d+$/.test(pastedData)) {
      const newOtp = pastedData.split('');
      while (newOtp.length < 6) newOtp.push('');
      setOtpCode(newOtp);
      inputRefs.current[5]?.focus();
    }
  };

  const handleValidate = async () => {
    const code = otpCode.join('');
    if (code.length !== 6) {
      setError('saisir6Chiffres');
      return;
    }

    setStep('validating');
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/otp/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          transactionReference,
          otpCode: code,
          validatedByRole: createdByRole
        })
      });

      const data = await response.json();

      if (data.success) {
        setStep('success');

        console.log('%c✅ TRANSACTION VALIDATED', 'background: #00aa00; color: white; font-size: 18px; padding: 10px;');
        console.log('Client:', clientName, '| Amount:', montant, 'FCFA');

        setTimeout(() => {
          onSuccess(data);
          handleClose();
        }, 2000);
      } else {
        const errorMsg = data.error || 'codeInvalide';
        setError(errorMsg);
        setStep('waiting');
        setOtpCode(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();

        if (errorMsg.includes('Tentatives restantes') || errorMsg.includes('Remaining attempts')) {
          const match = errorMsg.match(/(\d+)/);
          if (match) {
            setAttemptsLeft(parseInt(match[1]));
          }
        }
      }
    } catch (err: any) {
      console.error('OTP validation error:', err);
      setError(err.error || 'erreurValidation');
      setStep('waiting');
      setOtpCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOtpCode(['', '', '', '', '', '']);
    setStep('generating');
    setError('');
    setTimeLeft(300);
    setAttemptsLeft(3);
    setOtpCodeDisplay(null);
    onClose();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('validationSecurisee')}
      size="md"
      variant="default"
      showCloseButton={true}
      className={step === 'success' ? 'border-green-500/50' : step === 'error' ? 'border-red-500/50' : 'border-blue-500/50'}
    >
      <div className="space-y-6">
        <div className="bg-slate-800 border-2 border-slate-700/50 rounded-xl p-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-slate-400">Type:</span>
              <p className="text-white font-semibold" data-testid="text-otp-type">{transactionType}</p>
            </div>
            <div>
              <span className="text-slate-400">{t('montant')}:</span>
              <p className="text-green-400 font-bold" data-testid="text-otp-montant">{montant.toLocaleString()} FCFA</p>
            </div>
            <div className="col-span-2">
              <span className="text-slate-400">{t('client')}:</span>
              <p className="text-white font-semibold" data-testid="text-otp-client">{clientName}</p>
              <p className="text-slate-400 text-xs">{clientPhone}</p>
            </div>
          </div>
        </div>

        {step === 'generating' && (
          <div className="text-center py-8">
            <RefreshCw className="w-12 h-12 text-blue-400 mx-auto mb-4 animate-spin" />
            <p className="text-white font-semibold">{t('generationCode')}</p>
            <p className="text-slate-400 text-sm mt-2">{t('envoiSmsClient')}</p>
          </div>
        )}

        {step === 'waiting' && (
          <>
            <div>
              <div className="flex items-center justify-between mb-4">
                <label className="text-sm font-semibold text-slate-300">
                  {t('codeRecuClient')}
                </label>
                <div className="flex items-center gap-2 text-emerald-400">
                  <Clock className="w-4 h-4" />
                  <span className="font-mono font-bold">{formatTime(timeLeft)}</span>
                </div>
              </div>

              {otpCodeDisplay && (
                 <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-center">
                    <p className="text-xs text-yellow-500 mb-1 uppercase tracking-wider font-bold">Code OTP (Démo/Test)</p>
                    <p className="text-3xl font-mono font-bold text-white tracking-[0.5em]">{otpCodeDisplay}</p>
                 </div>
              )}

              <div className="flex gap-2 justify-center mb-4" onPaste={handlePaste}>
                {otpCode.map((digit, index) => (
                  <input
                    key={index}
                    ref={el => { inputRefs.current[index] = el }}
                    type="text"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    className="w-12 h-14 text-center text-2xl font-bold bg-slate-700 text-white border-2 border-slate-600 rounded-xl focus:border-blue-500 focus:outline-none transition placeholder-slate-500"
                    disabled={loading}
                    data-testid={`input-otp-${index}`}
                  />
                ))}
              </div>

              <div className="flex items-center justify-center gap-2 text-sm text-slate-400 mb-4">
                <AlertCircle className="w-4 h-4" />
                <span>{t('tentativesRestantes')}: <strong className="text-emerald-400">{attemptsLeft}</strong></span>
              </div>
            </div>

            <Button
              onClick={handleValidate}
              disabled={loading || otpCode.some(d => !d)}
              fullWidth
              variant="primary"
              isLoading={loading}
              icon={CheckCircle}
              data-testid="btn-validate-otp"
            >
              {t('validerTransaction')}
            </Button>

            <Button
              onClick={generateOTP}
              disabled={loading}
              fullWidth
              variant="outline"
              icon={Send}
              data-testid="btn-resend-otp"
            >
              {t('renvoyerCode')}
            </Button>
          </>
        )}

        {step === 'validating' && (
          <div className="text-center py-8">
            <RefreshCw className="w-12 h-12 text-blue-400 mx-auto mb-4 animate-spin" />
            <p className="text-white font-semibold">{t('validationEnCours')}</p>
          </div>
        )}

        {step === 'success' && (
          <div className="text-center py-8">
            <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
            <p className="text-white font-bold text-xl mb-2" data-testid="text-otp-success">{t('transactionValidee')}</p>
            <p className="text-slate-400">{t('smsConfirmationEnvoye')}</p>
          </div>
        )}

        {step === 'error' && (
          <div className="text-center py-8">
            <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <p className="text-red-400 font-semibold mb-4" data-testid="text-otp-error">{t(error) !== error ? t(error) : error}</p>
            <Button
              onClick={generateOTP}
              variant="primary"
              data-testid="btn-new-otp"
            >
              {t('genererNouveauCode')}
            </Button>
          </div>
        )}

        {error && step !== 'error' && (
          <div className="bg-red-500/10 border border-red-500 rounded-xl p-3 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-400 text-sm">{t(error) !== error ? t(error) : error}</p>
          </div>
        )}

        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3">
          <p className="text-blue-300 text-xs">
            <strong>🔒</strong> {t('securiteOtp')}
          </p>
        </div>
      </div>
    </Modal>
  );
}
