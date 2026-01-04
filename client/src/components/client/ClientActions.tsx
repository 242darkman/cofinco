import type { Client } from '@shared/schema';
import React, { useState } from 'react';
import { Phone, Mail, MessageSquare, Send, X, Copy, Check } from 'lucide-react';
import { Card, Badge, IconButton } from '../ui';

interface ClientActionsProps {
  client: Client;
  onActionComplete?: () => void;
}

export default function ClientActions({ client, onActionComplete }: ClientActionsProps) {
  const [showSMSModal, setShowSMSModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [smsMessage, setSmsMessage] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [sending, setSending] = useState(false);

  const handleCall = async () => {
    try {
      await fetch('/api/client-activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          client_id: client.id,
          activity_type: 'call',
          activity_description: `Appel téléphonique au ${client.telephone}`
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

    setSending(true);
    try {
      await fetch('/api/client-activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          client_id: client.id,
          activity_type: 'sms',
          activity_description: `SMS envoyé: ${smsMessage.substring(0, 50)}...`,
          metadata: { message: smsMessage }
        })
      });

      window.open(`sms:${client.telephone}?body=${encodeURIComponent(smsMessage)}`);
      setShowSMSModal(false);
      setSmsMessage('');
      onActionComplete?.();
    } catch (error) {
      console.error('Erreur envoi SMS:', error);
    } finally {
      setSending(false);
    }
  };

  const handleSendEmail = async () => {
    if (!emailSubject.trim() || !emailBody.trim()) return;

    setSending(true);
    try {
      await fetch('/api/client-activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          client_id: client.id,
          activity_type: 'email',
          activity_description: `Email envoyé: ${emailSubject}`,
          metadata: { subject: emailSubject, body: emailBody }
        })
      });

      window.open(`mailto:${client.email}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`);
      setShowEmailModal(false);
      setEmailSubject('');
      setEmailBody('');
      onActionComplete?.();
    } catch (error) {
      console.error('Erreur envoi email:', error);
    } finally {
      setSending(false);
    }
  };

  const smsTemplates = [
    'Bonjour, nous vous rappelons votre échéance de paiement du...',
    'Félicitations! Votre demande de crédit a été approuvée.',
    'Votre épargne a bien été enregistrée. Merci de votre confiance.',
    'Rappel: Réunion tontine prévue le...'
  ];

  const emailTemplates = [
    {
      subject: 'Rappel de paiement',
      body: 'Bonjour,\n\nNous vous rappelons votre échéance de paiement.\n\nCordialement,\nL\'équipe COFIN'
    },
    {
      subject: 'Approbation de crédit',
      body: 'Bonjour,\n\nNous avons le plaisir de vous informer que votre demande de crédit a été approuvée.\n\nCordialement,\nL\'équipe COFIN'
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
                className="group relative flex flex-col items-center justify-center p-6 rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-transparent hover:from-emerald-500/20 hover:border-emerald-500/40 transition-all duration-300"
            >
                <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300">
                    <Phone size={28} className="text-emerald-400" />
                </div>
                <h3 className="text-lg font-bold text-white mb-1">Appeler</h3>
                <p className="text-sm text-slate-400 font-mono tracking-tight">{client.telephone}</p>
            </button>

            {/* SMS Action */}
            <button 
                onClick={() => setShowSMSModal(true)}
                className="group relative flex flex-col items-center justify-center p-6 rounded-xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-transparent hover:from-blue-500/20 hover:border-blue-500/40 transition-all duration-300"
            >
                <div className="w-14 h-14 rounded-full bg-blue-500/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300">
                    <MessageSquare size={28} className="text-blue-400" />
                </div>
                <h3 className="text-lg font-bold text-white mb-1">Envoyer SMS</h3>
                <p className="text-sm text-slate-400">Message direct</p>
            </button>

            {/* Email Action */}
            <button 
                onClick={() => setShowEmailModal(true)}
                className="group relative flex flex-col items-center justify-center p-6 rounded-xl border border-purple-500/20 bg-gradient-to-br from-purple-500/10 to-transparent hover:from-purple-500/20 hover:border-purple-500/40 transition-all duration-300"
            >
                <div className="w-14 h-14 rounded-full bg-purple-500/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300">
                    <Mail size={28} className="text-purple-400" />
                </div>
                <h3 className="text-lg font-bold text-white mb-1">Envoyer Email</h3>
                <p className="text-sm text-slate-400 truncate max-w-full px-2">{client.email}</p>
            </button>
        </div>
      </div>

      {/* SMS Modal */}
      {showSMSModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <Card variant="elevated" className="max-w-md w-full border-blue-500/30">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                    <MessageSquare className="text-blue-400" size={20} />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-white">Nouveau SMS</h3>
                    <p className="text-xs text-slate-400">À: {client.telephone}</p>
                </div>
              </div>
              <IconButton icon={X} size="sm" onClick={() => setShowSMSModal(false)} aria-label="Fermer" />

            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Modèles Rapides</label>
                <div className="flex flex-wrap gap-2">
                  {smsTemplates.map((template, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSmsMessage(template)}
                      className="px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-xs text-slate-300 hover:border-blue-500/50 hover:text-blue-400 transition-colors text-left truncate max-w-full"
                    >
                      {template.length > 30 ? template.substring(0, 30) + '...' : template}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Message</label>
                <textarea
                  value={smsMessage}
                  onChange={(e) => setSmsMessage(e.target.value)}
                  className="w-full bg-slate-950 text-white px-4 py-3 rounded-xl border border-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[120px] placeholder:text-slate-600 resize-none text-sm"
                  placeholder="Rédigez votre message ici..."
                  autoFocus
                />
                <div className="flex justify-between mt-2">
                    <p className="text-xs text-slate-500">{smsMessage.length} caractères</p>
                </div>
              </div>

              <div className="pt-2">
                  <button
                    onClick={handleSendSMS}
                    disabled={sending || !smsMessage.trim()}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20"
                  >
                    <Send size={18} />
                    {sending ? 'Envoi en cours...' : 'Envoyer Maintenant'}
                  </button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <Card variant="elevated" className="max-w-xl w-full border-purple-500/30">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                 <div className="p-2 bg-purple-500/20 rounded-lg">
                    <Mail className="text-purple-400" size={20} />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-white">Nouvel Email</h3>
                    <p className="text-xs text-slate-400">À: {client.email}</p>
                </div>
              </div>
              <IconButton icon={X} size="sm" onClick={() => setShowEmailModal(false)} aria-label="Fermer" />
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Modèles Rapides</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {emailTemplates.map((template, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setEmailSubject(template.subject);
                        setEmailBody(template.body);
                      }}
                      className="text-left p-3 rounded-lg bg-slate-800 border border-slate-700 hover:border-purple-500/50 group transition-all"
                    >
                      <p className="font-semibold text-slate-300 text-sm group-hover:text-purple-400 transition-colors">{template.subject}</p>
                      <p className="text-xs text-slate-500 mt-1 truncate">{template.body}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Objet</label>
                    <input
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    className="w-full bg-slate-950 text-white px-4 py-2.5 rounded-lg border border-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 placeholder:text-slate-600 text-sm"
                    placeholder="Objet de l'email"
                    />
                  </div>
                  
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Message</label>
                    <textarea
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    className="w-full bg-slate-950 text-white px-4 py-3 rounded-xl border border-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 min-h-[160px] placeholder:text-slate-600 resize-none text-sm"
                    placeholder="Rédigez votre email ici..."
                    />
                  </div>
              </div>

              <div className="pt-2">
                  <button
                    onClick={handleSendEmail}
                    disabled={sending || !emailSubject.trim() || !emailBody.trim()}
                    className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-purple-900/20"
                  >
                    <Send size={18} />
                    {sending ? 'Envoi en cours...' : 'Envoyer Maintenant'}
                  </button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
