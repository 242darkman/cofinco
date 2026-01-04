import React, { useState, useEffect } from 'react';
import { MessageSquare, Send, Paperclip, Clock, Check, CheckCheck } from 'lucide-react';

interface Message {
  id: string;
  expediteur_id: string;
  destinataire_id: string;
  type_message: string;
  sujet: string;
  message: string;
  priorite: string;
  lu: boolean;
  date_lecture?: string;
  piece_jointe_url: string;
  created_at: string;
}

export default function AgentCommunications({ agentId }: { agentId?: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState({
    destinataire_id: agentId || '',
    type_message: 'Info',
    priorite: 'Normale',
    sujet: '',
    message: ''
  });

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 30000);
    return () => clearInterval(interval);
  }, [agentId]);

  const loadMessages = async () => {
    try {
      const params = new URLSearchParams();
      if (agentId) params.append('agent_id', agentId);
      
      const response = await fetch(`/api/agent-communications?${params.toString()}`);
      if (!response.ok) throw new Error('Erreur lors du chargement');
      const data = await response.json();
      setMessages(data || []);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const envoyerMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/agent-communications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newMessage,
          expediteur_id: 'admin',
          lu: false
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erreur lors de l\'envoi');
      }
      setNewMessage({
        destinataire_id: agentId || '',
        type_message: 'Info',
        priorite: 'Normale',
        sujet: '',
        message: ''
      });
      loadMessages();
    } catch (error: any) {
      alert('Erreur: ' + error.error);
    } finally {
      setLoading(false);
    }
  };

  const marquerCommeLu = async (id: string) => {
    try {
      const response = await fetch(`/api/agent-communications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lu: true, date_lecture: new Date().toISOString() })
      });

      if (!response.ok) throw new Error('Erreur');
      loadMessages();
    } catch (error: any) {
      console.error('Erreur:', error);
    }
  };

  const messagesNonLus = messages.filter(m => !m.lu).length;

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <MessageSquare size={24} />
          </div>
          <div className="text-3xl font-bold mb-1">{messages.length}</div>
          <div className="text-blue-100 text-sm">Total Messages</div>
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <Clock size={24} />
          </div>
          <div className="text-3xl font-bold mb-1">{messagesNonLus}</div>
          <div className="text-emerald-100 text-sm">Non Lus</div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <CheckCheck size={24} />
          </div>
          <div className="text-3xl font-bold mb-1">{messages.length - messagesNonLus}</div>
          <div className="text-green-100 text-sm">Lus</div>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Send size={24} className="text-blue-400" />
          Nouveau Message
        </h3>
        <form onSubmit={envoyerMessage} className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">Type</label>
              <select
                value={newMessage.type_message}
                onChange={(e) => setNewMessage({ ...newMessage, type_message: e.target.value })}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
              >
                <option value="Info">Info</option>
                <option value="Alerte">Alerte</option>
                <option value="Instruction">Instruction</option>
                <option value="Discussion">Discussion</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">Priorité</label>
              <select
                value={newMessage.priorite}
                onChange={(e) => setNewMessage({ ...newMessage, priorite: e.target.value })}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
              >
                <option value="Basse">Basse</option>
                <option value="Normale">Normale</option>
                <option value="Haute">Haute</option>
                <option value="Urgente">Urgente</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-300 mb-2">Sujet</label>
              <input
                type="text"
                value={newMessage.sujet}
                onChange={(e) => setNewMessage({ ...newMessage, sujet: e.target.value })}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                placeholder="Sujet du message"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-300 mb-2">Message</label>
              <textarea
                value={newMessage.message}
                onChange={(e) => setNewMessage({ ...newMessage, message: e.target.value })}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                rows={4}
                placeholder="Votre message..."
                required
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold flex items-center justify-center gap-2"
            >
              <Send size={20} />
              Envoyer
            </button>
            <button
              type="button"
              className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg flex items-center gap-2"
            >
              <Paperclip size={20} />
              Joindre
            </button>
          </div>
        </form>
      </div>

      <div className="space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`bg-slate-800 rounded-xl p-6 border ${
              !msg.lu ? 'border-blue-500/50 bg-blue-500/5' : 'border-slate-700'
            } cursor-pointer hover:bg-slate-700/50 transition`}
            onClick={() => !msg.lu && marquerCommeLu(msg.id)}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  msg.type_message === 'Alerte' ? 'bg-blue-500/20 text-blue-400' :
                  msg.type_message === 'Instruction' ? 'bg-emerald-500/20 text-emerald-400' :
                  'bg-blue-500/20 text-blue-400'
                }`}>
                  {msg.type_message}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  msg.priorite === 'Urgente' ? 'bg-blue-500/20 text-blue-400' :
                  msg.priorite === 'Haute' ? 'bg-emerald-500/20 text-emerald-400' :
                  'bg-slate-500/20 text-slate-400'
                }`}>
                  {msg.priorite}
                </span>
                {!msg.lu && (
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                )}
              </div>
              <span className="text-slate-400 text-sm flex items-center gap-2">
                <Clock size={14} />
                {new Date(msg.created_at).toLocaleString('fr-FR')}
              </span>
            </div>

            <h4 className="text-white font-bold mb-2">{msg.sujet}</h4>
            <p className="text-slate-300 text-sm">{msg.message}</p>

            {msg.lu && msg.date_lecture && (
              <div className="mt-3 text-xs text-slate-500 flex items-center gap-1">
                <CheckCheck size={14} className="text-green-500" />
                Lu le {new Date(msg.date_lecture).toLocaleString('fr-FR')}
              </div>
            )}
          </div>
        ))}

        {messages.length === 0 && (
          <div className="text-center py-12 bg-slate-800 rounded-xl border border-slate-700">
            <MessageSquare size={48} className="mx-auto text-slate-600 mb-4" />
            <p className="text-slate-400">Aucun message</p>
          </div>
        )}
      </div>
    </div>
  );
}
