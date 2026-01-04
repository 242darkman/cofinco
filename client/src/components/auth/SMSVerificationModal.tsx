import React, { useState, useEffect } from 'react';
import { X, Shield, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

interface SMSVerificationModalProps {
  onClose: () => void;
  onVerified: () => void;
  verificationId: string;
  clientPhone: string;
  montant: number;
  transactionType: 'encaissement' | 'retrait';
}

export default function SMSVerificationModal({
  onClose,
  onVerified,
  verificationId,
  clientPhone,
  montant,
  transactionType
}: SMSVerificationModalProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes
  const [attempts, setAttempts] = useState(0);
  const maxAttempts = 3;

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setError('Le code a expiré. Veuillez recommencer la transaction.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleVerify = async () => {
    if (code.length !== 6) {
      setError('Le code doit contenir 6 chiffres');
      return;
    }

    if (attempts >= maxAttempts) {
      setError('Nombre maximum de tentatives atteint');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/sms-verification/${verificationId}`);
      if (!response.ok) {
        setError('Code de vérification non trouvé');
        return;
      }
      const verification = await response.json();

      const expiresAt = new Date(verification.expires_at);
      if (expiresAt < new Date()) {
        await fetch(`/api/sms-verification/${verificationId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ statut: 'expired' })
        });
        setError('Le code a expiré');
        return;
      }

      if (verification.code === code) {
        await fetch(`/api/sms-verification/${verificationId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            statut: 'verified',
            verified_at: new Date().toISOString(),
            attempts: attempts + 1
          })
        });
        onVerified();
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);

        const updateData: any = { attempts: newAttempts };
        if (newAttempts >= maxAttempts) {
          updateData.statut = 'failed';
        }

        await fetch(`/api/sms-verification/${verificationId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData)
        });

        setError(`Code incorrect. ${maxAttempts - newAttempts} tentative(s) restante(s)`);
        setCode('');
      }
    } catch (err: any) {
      setError(err.error || 'Erreur lors de la vérification');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && code.length === 6) {
      handleVerify();
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Vérification SMS"
      subtitle={`${transactionType === 'encaissement' ? 'Encaissement' : 'Retrait'} de ${montant.toLocaleString()} FCFA`}
      size="md"
      variant="default"
      showCloseButton={true}
      footer={
        <>
          <Button
            onClick={onClose}
            variant="ghost"
            disabled={loading}
          >
            Annuler
          </Button>
          <Button
            onClick={handleVerify}
            variant="primary"
            disabled={loading || code.length !== 6 || timeLeft === 0 || attempts >= maxAttempts}
            isLoading={loading}
            icon={CheckCircle}
          >
            Vérifier
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {/* Info */}
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-blue-400 flex-shrink-0 mt-0.5" size={20} />
            <div className="text-sm text-blue-300">
              <p className="font-semibold mb-1">Un code de vérification a été envoyé</p>
              <p className="text-blue-400">au numéro {clientPhone}</p>
              <p className="text-blue-400 mt-2">
                Demandez au client de vous communiquer le code reçu par SMS.
              </p>
            </div>
          </div>
        </div>

        {/* Timer */}
        <div className="flex items-center justify-center gap-2 text-slate-300">
          <Clock size={18} />
          <span className="text-lg font-mono font-semibold">
            {formatTime(timeLeft)}
          </span>
          <span className="text-sm text-slate-400">restantes</span>
        </div>

        {/* Code Input */}
        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-2">
            Code de vérification (6 chiffres)
          </label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, '');
              setCode(value);
              setError('');
            }}
            onKeyPress={handleKeyPress}
            className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white text-center text-2xl font-mono tracking-widest focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="000000"
            disabled={loading || timeLeft === 0 || attempts >= maxAttempts}
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
            <p className="text-blue-400 text-sm flex items-center gap-2">
              <AlertCircle size={16} />
              {error}
            </p>
          </div>
        )}

        {/* Attempts Counter */}
        <div className="flex justify-between text-sm text-slate-400">
          <span>Tentatives: {attempts}/{maxAttempts}</span>
          <span>Code à 6 chiffres</span>
        </div>
      </div>
    </Modal>
  );
}
