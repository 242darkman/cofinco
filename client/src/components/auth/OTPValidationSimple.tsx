import React, { useState, useEffect } from 'react';
import { Lock, X, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

interface OTPValidationSimpleProps {
  isOpen: boolean;
  onClose: () => void;
  onValidate: (isValid: boolean) => void;
  phoneNumber: string;
  generatedCode: string;
  operationType: string;
  amount: number;
}

export function OTPValidationSimple({
  isOpen,
  onClose,
  onValidate,
  phoneNumber,
  generatedCode,
  operationType,
  amount
}: OTPValidationSimpleProps) {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [timeLeft, setTimeLeft] = useState(600);
  const [error, setError] = useState('');
  const inputRefs = [
    React.useRef<HTMLInputElement>(null),
    React.useRef<HTMLInputElement>(null),
    React.useRef<HTMLInputElement>(null),
    React.useRef<HTMLInputElement>(null),
    React.useRef<HTMLInputElement>(null),
    React.useRef<HTMLInputElement>(null),
  ];

  useEffect(() => {
    if (!isOpen) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && inputRefs[0].current) {
      inputRefs[0].current.focus();
    }
  }, [isOpen]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);

    if (value && index < 5) {
      inputRefs[index + 1].current?.focus();
    }

    setError('');
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs[index - 1].current?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim();
    if (/^\d{6}$/.test(pastedData)) {
      const newCode = pastedData.split('');
      setCode(newCode);
      inputRefs[5].current?.focus();
    }
  };

  const handleValidate = () => {
    const enteredCode = code.join('');

    if (enteredCode.length !== 6) {
      setError('Veuillez entrer le code complet à 6 chiffres');
      return;
    }

    if (enteredCode === generatedCode) {
      onValidate(true);
      handleClose();
    } else {
      setError('Code incorrect. Veuillez réessayer.');
      setCode(['', '', '', '', '', '']);
      inputRefs[0].current?.focus();
    }
  };

  const handleClose = () => {
    setCode(['', '', '', '', '', '']);
    setError('');
    setTimeLeft(600);
    onClose();
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Validation OTP"
      subtitle="Sécurisation de la transaction"
      size="md"
      variant="default"
      showCloseButton={true}
      footer={
        <>
          <Button
            onClick={handleClose}
            variant="ghost"
          >
            Annuler
          </Button>
          <Button
            onClick={handleValidate}
            variant="primary"
            disabled={code.join('').length !== 6 || timeLeft === 0}
            icon={CheckCircle}
          >
            Valider
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Type d'opération:</span>
            <span className="font-semibold text-gray-800">{operationType}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Montant:</span>
            <span className="font-bold text-blue-600 text-lg">
              {amount.toLocaleString()} FCFA
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Téléphone:</span>
            <span className="font-mono text-gray-800">{phoneNumber}</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-gray-700 font-medium">Code de validation à 6 chiffres:</p>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${
              timeLeft > 60 ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
            }`}>
              <Clock className="w-4 h-4" />
              <span className="font-mono font-semibold">{formatTime(timeLeft)}</span>
            </div>
          </div>

          <div className="flex gap-2 justify-center" onPaste={handlePaste}>
            {code.map((digit, index) => (
              <input
                key={index}
                ref={inputRefs[index]}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                className={`w-12 h-14 text-center text-2xl font-bold border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition ${
                  error
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-300 focus:border-blue-500'
                }`}
              />
            ))}
          </div>

          {error && (
            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <p className="text-blue-700 text-sm">{error}</p>
            </div>
          )}
        </div>

        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-green-800 mb-1">Code SMS envoyé</p>
              <p className="text-green-700 text-sm">
                Un code à 6 chiffres a été envoyé par SMS au {phoneNumber}
              </p>
              <div className="mt-2 bg-white border border-green-300 rounded-lg p-2">
                <p className="text-xs text-gray-600 mb-1">Code de test (développement):</p>
                <p className="font-mono font-bold text-green-600 text-lg">{generatedCode}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
