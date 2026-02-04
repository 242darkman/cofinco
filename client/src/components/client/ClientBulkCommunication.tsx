import type { ClientWithIdentity } from '@shared/schema';
import React, { useState } from 'react';
import { Send, Mail, MessageSquare, Users, AlertCircle, CheckCircle, X, AlertTriangle } from 'lucide-react';
import { usePermissions } from '../auth/ProtectedFeature';

interface ClientBulkCommunicationProps {
  clients: ClientWithIdentity[];
  onClose: () => void;
  onComplete: () => void;
}

export default function ClientBulkCommunication({ clients, onClose, onComplete }: ClientBulkCommunicationProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canSendCommunications = hasPermission('clients', 'communicate') || hasPermission('communications', 'send') || hasPermission('admin', 'manage');

  const [method, setMethod] = useState<'sms' | 'email'>('sms');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<{ success: number; failed: number } | null>(null);

  const templates = {
    sms: [
      'Bonjour {nom}, votre crédit a été approuvé!',
      'Rappel: votre paiement est dû le {date}',
      'Félicitations {nom}! Vous avez gagné {points} points de fidélité',
      'Nouvelle offre exclusive pour nos clients VIP!'
    ],
    email: [
      {
        subject: 'Approbation de crédit',
        body: 'Bonjour {nom},\n\nNous avons le plaisir de vous informer que votre demande de crédit a été approuvée.\n\nMontant: {montant} FCFA\n\nCordialement,\nL\'équipe COFIN'
      },
      {
        subject: 'Rappel de paiement',
        body: 'Bonjour {nom},\n\nCeci est un rappel concernant votre prochain paiement.\n\nMontant dû: {montant} FCFA\nDate d\'échéance: {date}\n\nCordialement,\nL\'équipe COFIN'
      },
      {
        subject: 'Programme de fidélité',
        body: 'Bonjour {nom},\n\nVous avez accumulé {points} points de fidélité!\n\nDécouvrez comment les utiliser sur notre plateforme.\n\nCordialement,\nL\'équipe COFIN'
      }
    ]
  };

  const replacePlaceholders = (text: string, client: ClientWithIdentity) => {
    return text
      .replace('{nom}', client.nom || '')
      .replace('{email}', client.email || '')
      .replace('{phone}', client.telephone || '')
      .replace('{points}', (client.pointsFidelite || 0).toString())
      .replace('{montant}', (client.creditTotal || '0').toString())
      .replace('{date}', new Date().toLocaleDateString('fr-FR'));
  };

  const handleSend = async () => {
    if (!message.trim()) return;

    setSending(true);
    setProgress(0);

    try {
      // P5.10: Batched parallel sending instead of sequential with artificial delays
      // Process in batches of 10 for better throughput while avoiding overwhelming the server
      const BATCH_SIZE = 10;
      let successCount = 0;
      let failedCount = 0;
      let processed = 0;

      for (let i = 0; i < clients.length; i += BATCH_SIZE) {
        const batch = clients.slice(i, i + BATCH_SIZE);

        const results = await Promise.allSettled(
          batch.map(async (client) => {
            const personalizedMessage = replacePlaceholders(message, client);
            const personalizedSubject = subject ? replacePlaceholders(subject, client) : '';

            const res = await fetch(`/api/clients/${client.id}/send-notification`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                channel: method === 'sms' ? 'SMS' : 'EMAIL',
                message: personalizedMessage,
                ...(method === 'email' ? { subject: personalizedSubject } : {}),
              })
            });

            if (!res.ok) throw new Error('Envoi echoue');
            return true;
          })
        );

        // Count successes and failures
        results.forEach((result) => {
          if (result.status === 'fulfilled') {
            successCount++;
          } else {
            failedCount++;
          }
        });

        processed += batch.length;
        setProgress(Math.round((processed / clients.length) * 100));
      }

      setResults({ success: successCount, failed: failedCount });
    } catch (error) {
      console.error('Erreur envoi bulk:', error);
    } finally {
      setSending(false);
    }
  };

  const handleComplete = () => {
    onComplete();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-xl max-w-3xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <Send className="text-cyan-400" size={28} />
              Communication en Masse
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              Envoyer à {clients.length} client{clients.length > 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded-lg transition text-slate-400 hover:text-white"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <h3 className="font-bold text-blue-400 mb-2 flex items-center gap-2">
              <Users size={18} />
              Destinataires sélectionnés
            </h3>
            <div className="flex flex-wrap gap-2 mt-3">
              {clients.slice(0, 5).map((client) => (
                <span key={client.id} className="px-3 py-1 bg-slate-700/50 rounded-full text-xs text-slate-300">
                  {client.nom}
                </span>
              ))}
              {clients.length > 5 && (
                <span className="px-3 py-1 bg-slate-700/50 rounded-full text-xs text-slate-300">
                  +{clients.length - 5} autres
                </span>
              )}
            </div>
          </div>

          {!results && (
            <>
              <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                <label className="block text-sm font-semibold text-slate-300 mb-3">Méthode d'envoi</label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setMethod('sms')}
                    className={`p-4 rounded-lg border-2 transition ${
                      method === 'sms'
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : 'border-slate-600 bg-slate-700/30 hover:border-slate-500'
                    }`}
                  >
                    <MessageSquare size={24} className={`mx-auto mb-2 ${method === 'sms' ? 'text-cyan-400' : 'text-slate-400'}`} />
                    <p className={`text-sm font-semibold ${method === 'sms' ? 'text-cyan-400' : 'text-slate-300'}`}>SMS</p>
                  </button>

                  <button
                    onClick={() => setMethod('email')}
                    className={`p-4 rounded-lg border-2 transition ${
                      method === 'email'
                        ? 'border-emerald-500 bg-emerald-500/10'
                        : 'border-slate-600 bg-slate-700/30 hover:border-slate-500'
                    }`}
                  >
                    <Mail size={24} className={`mx-auto mb-2 ${method === 'email' ? 'text-emerald-400' : 'text-slate-400'}`} />
                    <p className={`text-sm font-semibold ${method === 'email' ? 'text-emerald-400' : 'text-slate-300'}`}>Email</p>
                  </button>
                </div>
              </div>

              <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                <label className="block text-sm font-semibold text-slate-300 mb-2">Modèles rapides</label>
                <div className="space-y-2">
                  {method === 'sms' ? (
                    templates.sms.map((template, idx) => (
                      <button
                        key={idx}
                        onClick={() => setMessage(template)}
                        className="w-full text-left p-2 bg-slate-700/30 hover:bg-slate-700/50 rounded text-sm text-slate-300 transition"
                      >
                        {template}
                      </button>
                    ))
                  ) : (
                    templates.email.map((template, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setSubject(template.subject);
                          setMessage(template.body);
                        }}
                        className="w-full text-left p-3 bg-slate-700/30 hover:bg-slate-700/50 rounded text-sm transition"
                      >
                        <p className="font-semibold text-slate-200">{template.subject}</p>
                        <p className="text-xs text-slate-400 mt-1">{template.body.substring(0, 60)}...</p>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {method === 'email' && (
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                  <label className="block text-sm font-semibold text-slate-300 mb-2">Objet de l'email</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="Objet du message..."
                  />
                </div>
              )}

              <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                <label className="block text-sm font-semibold text-slate-300 mb-2">Message</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 min-h-[150px]"
                  placeholder="Votre message ici... Utilisez {nom}, {email}, {phone}, {points}, {montant}, {date} pour personnaliser"
                />
                <p className="text-xs text-slate-400 mt-2">
                  Variables disponibles: {'{nom}'}, {'{email}'}, {'{phone}'}, {'{points}'}, {'{montant}'}, {'{date}'}
                </p>
              </div>

              <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4">
                <h3 className="font-bold text-cyan-400 mb-2 flex items-center gap-2">
                  <AlertCircle size={18} />
                  Aperçu personnalisé (1er client)
                </h3>
                <div className="bg-slate-700/50 rounded p-3 text-sm text-slate-300 whitespace-pre-wrap">
                  {method === 'email' && subject && (
                    <p className="font-semibold mb-2">Objet: {replacePlaceholders(subject, clients[0])}</p>
                  )}
                  {message ? replacePlaceholders(message, clients[0]) : 'Aucun message'}
                </div>
              </div>
            </>
          )}

          {sending && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
              <p className="text-center text-slate-300 mb-4">Envoi en cours...</p>
              <div className="w-full bg-slate-700 rounded-full h-4 mb-2">
                <div
                  className="bg-gradient-to-r from-cyan-500 to-blue-600 h-4 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-center text-sm text-slate-400">{progress}% - {Math.round((progress / 100) * clients.length)} / {clients.length}</p>
            </div>
          )}

          {results && (
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-lg p-6">
                <h3 className="font-bold text-white mb-4 text-center">Résultats de l'envoi</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-4 text-center">
                    <CheckCircle className="text-green-400 mx-auto mb-2" size={32} />
                    <p className="text-xs text-slate-400">Succès</p>
                    <p className="text-3xl font-bold text-green-400">{results.success}</p>
                  </div>

                  <div className="bg-blue-500/20 border border-blue-500/30 rounded-lg p-4 text-center">
                    <X className="text-blue-400 mx-auto mb-2" size={32} />
                    <p className="text-xs text-slate-400">Échecs</p>
                    <p className="text-3xl font-bold text-blue-400">{results.failed}</p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleComplete}
                className="w-full px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-semibold rounded-lg transition"
              >
                Terminer
              </button>
            </div>
          )}

          {!sending && !results && (
            canSendCommunications ? (
              <button
                onClick={handleSend}
                disabled={!message.trim() || (method === 'email' && !subject.trim())}
                className="w-full px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition flex items-center justify-center gap-2"
              >
                <Send size={20} />
                Envoyer à {clients.length} client{clients.length > 1 ? 's' : ''}
              </button>
            ) : (
              <div className="w-full px-6 py-3 bg-amber-500/20 text-amber-400 font-semibold rounded-lg flex items-center justify-center gap-2">
                <AlertTriangle size={20} />
                Permission requise pour envoyer des communications
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
