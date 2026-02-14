/**
 * SMS Test Panel Component
 * Allows testing SMS sending with any provider
 */

import React, { useState } from 'react';
import {
  MessageSquare,
  Send,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Phone,
  FileText,
} from 'lucide-react';
import { smsApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { useBranding } from '../../../contexts/BrandingContext';

export interface SmsTestPanelProps {
  providers: { id: string; name: string; isActive: boolean }[];
  defaultProvider?: string;
  onTestComplete?: (result: TestResult) => void;
}

export interface TestResult {
  success: boolean;
  provider: string;
  phoneNumber: string;
  message: string;
  error?: string;
  deliveryTime?: number;
}

export default function SmsTestPanel({
  providers,
  defaultProvider,
  onTestComplete,
}: SmsTestPanelProps) {
  const { branding } = useBranding();
  const [selectedProvider, setSelectedProvider] = useState(defaultProvider || '');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [message, setMessage] = useState(`Ceci est un message de test de la plateforme ${branding.appName}.`);
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<TestResult | null>(null);

  const activeProviders = providers.filter((p) => p.isActive);

  const handleTest = async () => {
    if (!selectedProvider) {
      toast.error('Veuillez sélectionner un provider');
      return;
    }

    if (!phoneNumber) {
      toast.error('Veuillez entrer un numéro de téléphone');
      return;
    }

    if (!message) {
      toast.error('Veuillez entrer un message');
      return;
    }

    // Validate phone number format
    const phoneRegex = /^(\+|00)?[0-9]{8,15}$/;
    if (!phoneRegex.test(phoneNumber.replace(/\s/g, ''))) {
      toast.error('Format de numéro de téléphone invalide');
      return;
    }

    setSending(true);
    setLastResult(null);

    const startTime = Date.now();

    try {
      const response = await smsApi.testSend({
        provider: selectedProvider,
        phoneNumber: phoneNumber.replace(/\s/g, ''),
        message,
      });

      const deliveryTime = Date.now() - startTime;

      const result: TestResult = {
        success: response.success,
        provider: selectedProvider,
        phoneNumber,
        message,
        error: response.error,
        deliveryTime,
      };

      setLastResult(result);
      onTestComplete?.(result);

      if (response.success) {
        toast.success('SMS de test envoyé avec succès');
      } else {
        toast.error(response.error || 'Échec de l\'envoi du SMS');
      }
    } catch (error) {
      const result: TestResult = {
        success: false,
        provider: selectedProvider,
        phoneNumber,
        message,
        error: handleApiError(error, 'Erreur lors du test'),
      };

      setLastResult(result);
      onTestComplete?.(result);
      toast.error(handleApiError(error, 'Erreur lors du test'));
    } finally {
      setSending(false);
    }
  };

  const characterCount = message.length;
  const smsCount = Math.ceil(characterCount / 160) || 1;

  return (
    <div className="bg-surface/50 rounded-xl border border-edge overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-edge flex items-center gap-3">
        <div className="p-2 bg-accent/10 rounded-lg">
          <MessageSquare className="text-accent" size={20} />
        </div>
        <div>
          <h3 className="font-semibold text-content-primary">Test d'envoi SMS</h3>
          <p className="text-sm text-content-muted">Vérifiez la configuration de vos providers</p>
        </div>
      </div>

      {/* Form */}
      <div className="p-4 space-y-4">
        {/* Provider Selection */}
        <div>
          <label className="block text-sm text-content-muted mb-2">Provider SMS</label>
          {activeProviders.length === 0 ? (
            <div className="p-3 bg-status-warning-bg border border-status-warning/30 rounded-lg flex items-center gap-2 text-status-warning text-sm">
              <AlertTriangle size={16} />
              <span>Aucun provider SMS actif. Configurez un provider avant de tester.</span>
            </div>
          ) : (
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="w-full px-4 py-2.5 bg-surface-elevated border border-edge-strong rounded-lg text-content-primary focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">Sélectionner un provider</option>
              {activeProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Phone Number */}
        <div>
          <label className="block text-sm text-content-muted mb-2">Numéro de téléphone</label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" size={18} />
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+242 06 XXX XX XX"
              className="w-full pl-10 pr-4 py-2.5 bg-surface-elevated border border-edge-strong rounded-lg text-content-primary focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <p className="mt-1 text-xs text-content-muted">Format international recommandé (+242...)</p>
        </div>

        {/* Message */}
        <div>
          <label className="block text-sm text-content-muted mb-2">Message de test</label>
          <div className="relative">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 bg-surface-elevated border border-edge-strong rounded-lg text-content-primary focus:outline-none focus:ring-2 focus:ring-accent resize-none"
            />
            <div className="absolute bottom-2 right-2 flex items-center gap-2 text-xs text-content-muted">
              <FileText size={12} />
              <span>
                {characterCount} car. | {smsCount} SMS
              </span>
            </div>
          </div>
        </div>

        {/* Send Button */}
        <button
          onClick={handleTest}
          disabled={sending || !selectedProvider || !phoneNumber || !message}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent-secondary hover:bg-accent-secondary-hover text-content-primary rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending ? (
            <>
              <Loader2 className="animate-spin" size={18} />
              Envoi en cours...
            </>
          ) : (
            <>
              <Send size={18} />
              Envoyer le test
            </>
          )}
        </button>
      </div>

      {/* Result */}
      {lastResult && (
        <div className={`p-4 border-t border-edge ${lastResult.success ? 'bg-status-success-bg' : 'bg-status-danger-bg'}`}>
          <div className="flex items-start gap-3">
            {lastResult.success ? (
              <CheckCircle className="text-status-success mt-0.5" size={20} />
            ) : (
              <XCircle className="text-status-danger mt-0.5" size={20} />
            )}
            <div className="flex-1">
              <h4 className={`font-medium ${lastResult.success ? 'text-status-success' : 'text-status-danger'}`}>
                {lastResult.success ? 'Test réussi' : 'Échec du test'}
              </h4>
              <div className="mt-2 space-y-1 text-sm text-content-secondary">
                <p>
                  <span className="text-content-muted">Provider:</span> {lastResult.provider}
                </p>
                <p>
                  <span className="text-content-muted">Destinataire:</span> {lastResult.phoneNumber}
                </p>
                {lastResult.deliveryTime && (
                  <p>
                    <span className="text-content-muted">Temps de réponse:</span> {lastResult.deliveryTime}ms
                  </p>
                )}
                {lastResult.error && (
                  <p className="text-status-danger">
                    <span className="text-content-muted">Erreur:</span> {lastResult.error}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
