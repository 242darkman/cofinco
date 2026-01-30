import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, Paperclip, Clock, Check, CheckCheck, Search, Filter, FileText, Image as ImageIcon, Download, X, Loader2 } from 'lucide-react';
import { resolveStorageUrl } from '../../lib/format';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterPriorite, setFilterPriorite] = useState<string>('all');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{ url: string; filename: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

      const response = await fetch(`/api/agent-communications?${params.toString()}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Erreur lors du chargement');
      const data = await response.json();
      setMessages(data || []);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileType', file.type.startsWith('image/') ? 'profile' : 'misc');
      formData.append('entityType', 'conversation');
      formData.append('entityId', agentId || 'general');

      const uploadRes = await fetch('/api/storage/entity/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      if (!uploadRes.ok) throw new Error('Erreur upload');
      const uploadData = await uploadRes.json();
      setAttachedFile({ url: uploadData.url || uploadData.path, filename: file.name });
    } catch (error) {
      console.error('Erreur upload:', error);
      alert('Erreur lors du téléversement du fichier');
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const envoyerMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/agent-communications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...newMessage,
          expediteur_id: 'admin',
          lu: false,
          piece_jointe_url: attachedFile?.url || ''
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
      setAttachedFile(null);
      loadMessages();
    } catch (error: any) {
      alert('Erreur: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const marquerCommeLu = async (id: string) => {
    try {
      const response = await fetch(`/api/agent-communications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ lu: true, date_lecture: new Date().toISOString() })
      });

      if (!response.ok) throw new Error('Erreur');
      loadMessages();
    } catch (error: any) {
      console.error('Erreur:', error);
    }
  };

  const filteredMessages = messages.filter(m => {
    const matchSearch = !searchQuery ||
      m.sujet.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.message.toLowerCase().includes(searchQuery.toLowerCase());
    const matchType = filterType === 'all' || m.type_message === filterType;
    const matchPriorite = filterPriorite === 'all' || m.priorite === filterPriorite;
    return matchSearch && matchType && matchPriorite;
  });

  const messagesNonLus = messages.filter(m => !m.lu).length;
  const types = ['Info', 'Alerte', 'Instruction', 'Discussion'];
  const priorites = ['Basse', 'Normale', 'Haute', 'Urgente'];

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

      {/* Search & Filter Bar */}
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 space-y-3">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par sujet ou contenu..."
            className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
              <X size={16} />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1 text-xs text-slate-400 mr-1">
            <Filter size={14} />
            Type:
          </div>
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition ${filterType === 'all' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50' : 'bg-slate-700 text-slate-400 border border-slate-600 hover:bg-slate-600'}`}
          >
            Tous
          </button>
          {types.map(t => (
            <button
              key={t}
              onClick={() => setFilterType(filterType === t ? 'all' : t)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition ${filterType === t ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50' : 'bg-slate-700 text-slate-400 border border-slate-600 hover:bg-slate-600'}`}
            >
              {t}
            </button>
          ))}
          <div className="w-px bg-slate-600 mx-1" />
          <div className="flex items-center gap-1 text-xs text-slate-400 mr-1">
            Priorité:
          </div>
          <button
            onClick={() => setFilterPriorite('all')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition ${filterPriorite === 'all' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50' : 'bg-slate-700 text-slate-400 border border-slate-600 hover:bg-slate-600'}`}
          >
            Toutes
          </button>
          {priorites.map(p => (
            <button
              key={p}
              onClick={() => setFilterPriorite(filterPriorite === p ? 'all' : p)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition ${filterPriorite === p
                ? p === 'Urgente' ? 'bg-red-500/20 text-red-300 border border-red-500/50'
                  : p === 'Haute' ? 'bg-orange-500/20 text-orange-300 border border-orange-500/50'
                  : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                : 'bg-slate-700 text-slate-400 border border-slate-600 hover:bg-slate-600'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        {(searchQuery || filterType !== 'all' || filterPriorite !== 'all') && (
          <div className="text-xs text-slate-400">
            {filteredMessages.length} résultat{filteredMessages.length !== 1 ? 's' : ''} sur {messages.length}
          </div>
        )}
      </div>

      {/* New Message Form */}
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

          {/* Attached file preview */}
          {attachedFile && (
            <div className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg border border-slate-600">
              <FileText size={18} className="text-blue-400 shrink-0" />
              <span className="text-sm text-white truncate flex-1">{attachedFile.filename}</span>
              <button
                type="button"
                onClick={() => setAttachedFile(null)}
                className="text-slate-400 hover:text-red-400 shrink-0"
              >
                <X size={16} />
              </button>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold flex items-center justify-center gap-2"
            >
              <Send size={20} />
              Envoyer
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
              onChange={handleFileUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFile}
              className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg flex items-center gap-2"
            >
              {uploadingFile ? <Loader2 size={20} className="animate-spin" /> : <Paperclip size={20} />}
              {uploadingFile ? 'Envoi...' : 'Joindre'}
            </button>
          </div>
        </form>
      </div>

      {/* Messages List */}
      <div className="space-y-3">
        {filteredMessages.map((msg) => (
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
                  msg.type_message === 'Alerte' ? 'bg-red-500/20 text-red-400' :
                  msg.type_message === 'Instruction' ? 'bg-emerald-500/20 text-emerald-400' :
                  msg.type_message === 'Discussion' ? 'bg-purple-500/20 text-purple-400' :
                  'bg-blue-500/20 text-blue-400'
                }`}>
                  {msg.type_message}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  msg.priorite === 'Urgente' ? 'bg-red-500/20 text-red-400' :
                  msg.priorite === 'Haute' ? 'bg-orange-500/20 text-orange-400' :
                  msg.priorite === 'Basse' ? 'bg-slate-500/20 text-slate-400' :
                  'bg-cyan-500/20 text-cyan-400'
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

            {/* Attachment display */}
            {msg.piece_jointe_url && (
              <div className="mt-3">
                {msg.piece_jointe_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                  <a href={resolveStorageUrl(msg.piece_jointe_url)} target="_blank" rel="noopener noreferrer" className="inline-block">
                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-700/50 rounded-lg border border-slate-600 hover:border-blue-500/50 transition">
                      <ImageIcon size={16} className="text-blue-400" />
                      <span className="text-sm text-blue-400">Image jointe</span>
                      <Download size={14} className="text-slate-400" />
                    </div>
                  </a>
                ) : (
                  <a href={resolveStorageUrl(msg.piece_jointe_url)} target="_blank" rel="noopener noreferrer" className="inline-block">
                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-700/50 rounded-lg border border-slate-600 hover:border-blue-500/50 transition">
                      <FileText size={16} className="text-blue-400" />
                      <span className="text-sm text-blue-400">Fichier joint</span>
                      <Download size={14} className="text-slate-400" />
                    </div>
                  </a>
                )}
              </div>
            )}

            {msg.lu && msg.date_lecture && (
              <div className="mt-3 text-xs text-slate-500 flex items-center gap-1">
                <CheckCheck size={14} className="text-green-500" />
                Lu le {new Date(msg.date_lecture).toLocaleString('fr-FR')}
              </div>
            )}
          </div>
        ))}

        {filteredMessages.length === 0 && messages.length > 0 && (
          <div className="text-center py-12 bg-slate-800 rounded-xl border border-slate-700">
            <Search size={48} className="mx-auto text-slate-600 mb-4" />
            <p className="text-slate-400">Aucun message ne correspond aux filtres</p>
            <button
              onClick={() => { setSearchQuery(''); setFilterType('all'); setFilterPriorite('all'); }}
              className="mt-3 text-sm text-cyan-400 hover:text-cyan-300"
            >
              Réinitialiser les filtres
            </button>
          </div>
        )}

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
