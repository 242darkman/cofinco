import type { ClientWithIdentity } from '@shared/schema';
import React, { useState } from 'react';
import { Phone, Mail, MessageSquare, Send, X, CheckCircle, AlertTriangle } from 'lucide-react';
import { Card, IconButton } from '../ui';
import { useBranding } from '../../contexts/BrandingContext';

interface ClientActionsProps {
  client: ClientWithIdentity;
  onActionComplete?: () => void;
}

type SendStatus = 'idle' | 'sending' | 'success' | 'error';

export default function ClientActions({ client, onActionComplete }: ClientActionsProps) {
  const { branding } = useBranding();
  const [showSMSModal, setShowSMSModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [smsMessage, setSmsMessage] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [sendStatus, setSendStatus] = useState<SendStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleCall = async () => {
    try {
      await fetch(`/api/clients/${client.id}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          type: 'call',
          description: `Appel telephonique au ${client.telephone}`
        })
      });

      window.open(`tel:${client.telephone}`);
      onActionComplete?.();
    } catch (error) {
      console.error('Erreur enregistrement appel:', error);
    }
  };

  const handleSendSMS = async () => {
    if (!smsMessage.trim()) return;

    setSendStatus('sending');
    setErrorMessage('');
    try {
      const res = await fetch(`/api/clients/${client.id}/send-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          channel: 'SMS',
          message: smsMessage,
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Erreur inconnue' }));
        throw new Error(err.message || 'Erreur envoi SMS');
      }

      setSendStatus('success');
      setTimeout(() => {
        setShowSMSModal(false);
        setSmsMessage('');
        setSendStatus('idle');
      }, 1500);
      onActionComplete?.();
    } catch (error: any) {
      setSendStatus('error');
      setErrorMessage(error.message || 'Erreur envoi SMS');
    }
  };

  const handleSendEmail = async () => {
    if (!emailSubject.trim() || !emailBody.trim()) return;

    setSendStatus('sending');
    setErrorMessage('');
    try {
      const res = await fetch(`/api/clients/${client.id}/send-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          channel: 'EMAIL',
          subject: emailSubject,
          message: emailBody,
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Erreur inconnue' }));
        throw new Error(err.message || 'Erreur envoi email');
      }

      setSendStatus('success');
      setTimeout(() => {
        setShowEmailModal(false);
        setEmailSubject('');
        setEmailBody('');
        setSendStatus('idle');
      }, 1500);
      onActionComplete?.();
    } catch (error: any) {
      setSendStatus('error');
      setErrorMessage(error.message || 'Erreur envoi email');
    }
  };

  const resetAndClose = (modal: 'sms' | 'email') => {
    setSendStatus('idle');
    setErrorMessage('');
    if (modal === 'sms') {
      setShowSMSModal(false);
      setSmsMessage('');
    } else {
      setShowEmailModal(false);
      setEmailSubject('');
      setEmailBody('');
    }
  };

  const smsTemplates = [
    'Bonjour, nous vous rappelons votre echeance de paiement du...',
    'Felicitations! Votre demande de credit a ete approuvee.',
    'Votre epargne a bien ete enregistree. Merci de votre confiance.',
    'Rappel: Reunion tontine prevue le...'
  ];

  const emailTemplates = [
    {
      subject: 'Rappel de paiement',
      body: `Bonjour,\n\nNous vous rappelons votre echeance de paiement.\n\nCordialement,\nL'equipe ${branding.appName}`
    },
    {
      subject: 'Approbation de credit',
      body: `Bonjour,\n\nNous avons le plaisir de vous informer que votre demande de credit a ete approuvee.\n\nCordialement,\nL'equipe ${branding.appName}`
    }
  ];

  return (
    <>
      <div className="space-y-4">
        {/* Actions Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Call Action */}
            <button
                onClick={handleCall}
                className="group relative flex flex-col items-center justify-center p-6 rounded-xl border border-status-success/20 bg-gradient-to-br from-status-success/10 to-transparent hover:from-status-success/20 hover:border-status-success/40 transition-all duration-300"
            >
                <div className="w-14 h-14 rounded-full bg-status-success-bg flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300">
                    <Phone size={28} className="text-status-success" />
                </div>
                <h3 className="text-lg font-bold text-content-primary mb-1">Appeler</h3>
                <p className="text-sm text-content-muted font-mono tracking-tight">{client.telephone}</p>
            </button>

            {/* SMS Action */}
            <button
                onClick={() => setShowSMSModal(true)}
                className="group relative flex flex-col items-center justify-center p-6 rounded-xl border border-status-info/20 bg-gradient-to-br from-status-info/10 to-transparent hover:from-status-info/20 hover:border-status-info/40 transition-all duration-300"
            >
                <div className="w-14 h-14 rounded-full bg-status-info-bg flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300">
                    <MessageSquare size={28} className="text-status-info" />
                </div>
                <h3 className="text-lg font-bold text-content-primary mb-1">Envoyer SMS</h3>
                <p className="text-sm text-content-muted">Via le serveur</p>
            </button>

            {/* Email Action */}
            <button
                onClick={() => setShowEmailModal(true)}
                className="group relative flex flex-col items-center justify-center p-6 rounded-xl border border-status-info/20 bg-gradient-to-br from-status-info/10 to-transparent hover:from-status-info/20 hover:border-status-info/40 transition-all duration-300"
            >
                <div className="w-14 h-14 rounded-full bg-status-info-bg flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300">
                    <Mail size={28} className="text-status-info" />
                </div>
                <h3 className="text-lg font-bold text-content-primary mb-1">Envoyer Email</h3>
                <p className="text-sm text-content-muted truncate max-w-full px-2">{client.email}</p>
            </button>
        </div>
      </div>

      {/* SMS Modal */}
      {showSMSModal && (
        <div className="fixed inset-0 bg-surface-base/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <Card variant="elevated" className="max-w-md w-full border-status-info/30">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-status-info-bg rounded-lg">
                    <MessageSquare className="text-status-info" size={20} />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-content-primary">Nouveau SMS</h3>
                    <p className="text-xs text-content-muted">A: {client.telephone}</p>
                </div>
              </div>
              <IconButton icon={X} size="sm" onClick={() => resetAndClose('sms')} aria-label="Fermer" />
            </div>

            {sendStatus === 'success' ? (
              <div className="text-center py-8">
                <CheckCircle size={48} className="text-status-success mx-auto mb-3" />
                <p className="text-status-success font-bold">SMS mis en file d'attente</p>
                <p className="text-content-muted text-sm mt-1">Le message sera envoye sous peu.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-content-muted uppercase tracking-wider mb-2 block">Modeles Rapides</label>
                  <div className="flex flex-wrap gap-2">
                    {smsTemplates.map((template, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSmsMessage(template)}
                        className="px-3 py-1.5 rounded-full bg-surface border border-edge text-xs text-content-secondary hover:border-status-info/50 hover:text-status-info transition-colors text-left truncate max-w-full"
                      >
                        {template.length > 30 ? template.substring(0, 30) + '...' : template}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-content-muted uppercase tracking-wider mb-2 block">Message</label>
                  <textarea
                    value={smsMessage}
                    onChange={(e) => setSmsMessage(e.target.value)}
                    className="w-full bg-surface-base text-content-primary px-4 py-3 rounded-xl border border-edge focus:outline-none focus:ring-1 focus:ring-status-info min-h-[120px] placeholder:text-content-muted resize-none text-sm"
                    placeholder="Redigez votre message ici..."
                    autoFocus
                  />
                  <div className="flex justify-between mt-2">
                      <p className="text-xs text-content-muted">{smsMessage.length} caracteres</p>
                  </div>
                </div>

                {sendStatus === 'error' && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-status-danger-bg border border-status-danger/20 rounded-lg text-sm text-status-danger">
                    <AlertTriangle size={16} />
                    {errorMessage}
                  </div>
                )}

                <div className="pt-2">
                    <button
                      onClick={handleSendSMS}
                      disabled={sendStatus === 'sending' || !smsMessage.trim()}
                      className="w-full py-3 bg-status-info hover:bg-status-info disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-status-info/20"
                    >
                      <Send size={18} />
                      {sendStatus === 'sending' ? 'Envoi en cours...' : 'Envoyer Maintenant'}
                    </button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-surface-base/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <Card variant="elevated" className="max-w-xl w-full border-status-info/30">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                 <div className="p-2 bg-status-info-bg rounded-lg">
                    <Mail className="text-status-info" size={20} />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-content-primary">Nouvel Email</h3>
                    <p className="text-xs text-content-muted">A: {client.email}</p>
                </div>
              </div>
              <IconButton icon={X} size="sm" onClick={() => resetAndClose('email')} aria-label="Fermer" />
            </div>

            {sendStatus === 'success' ? (
              <div className="text-center py-8">
                <CheckCircle size={48} className="text-status-success mx-auto mb-3" />
                <p className="text-status-success font-bold">Email mis en file d'attente</p>
                <p className="text-content-muted text-sm mt-1">Le message sera envoye sous peu.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-content-muted uppercase tracking-wider mb-2 block">Modeles Rapides</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {emailTemplates.map((template, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setEmailSubject(template.subject);
                          setEmailBody(template.body);
                        }}
                        className="text-left p-3 rounded-lg bg-surface border border-edge hover:border-status-info/50 group transition-all"
                      >
                        <p className="font-semibold text-content-secondary text-sm group-hover:text-status-info transition-colors">{template.subject}</p>
                        <p className="text-xs text-content-muted mt-1 truncate">{template.body}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-content-muted uppercase tracking-wider mb-1 block">Objet</label>
                      <input
                      type="text"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      className="w-full bg-surface-base text-content-primary px-4 py-2.5 rounded-lg border border-edge focus:outline-none focus:ring-1 focus:ring-status-info placeholder:text-content-muted text-sm"
                      placeholder="Objet de l'email"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-content-muted uppercase tracking-wider mb-1 block">Message</label>
                      <textarea
                      value={emailBody}
                      onChange={(e) => setEmailBody(e.target.value)}
                      className="w-full bg-surface-base text-content-primary px-4 py-3 rounded-xl border border-edge focus:outline-none focus:ring-1 focus:ring-status-info min-h-[160px] placeholder:text-content-muted resize-none text-sm"
                      placeholder="Redigez votre email ici..."
                      />
                    </div>
                </div>

                {sendStatus === 'error' && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-status-danger-bg border border-status-danger/20 rounded-lg text-sm text-status-danger">
                    <AlertTriangle size={16} />
                    {errorMessage}
                  </div>
                )}

                <div className="pt-2">
                    <button
                      onClick={handleSendEmail}
                      disabled={sendStatus === 'sending' || !emailSubject.trim() || !emailBody.trim()}
                      className="w-full py-3 bg-status-info hover:bg-status-info disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-status-info/20"
                    >
                      <Send size={18} />
                      {sendStatus === 'sending' ? 'Envoi en cours...' : 'Envoyer Maintenant'}
                    </button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
