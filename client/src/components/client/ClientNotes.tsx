import React, { useState, useEffect } from 'react';
import { Plus, Trash2, AlertCircle, AlertTriangle, Info, Edit2, Save, X, MessageSquare, Filter } from 'lucide-react';
import { Card, Badge } from '../ui';
import { usePermissions } from '../auth/ProtectedFeature';

interface ClientNote {
  id: string;
  client_id: string;
  note: string;
  priority: 'Basse' | 'Moyenne' | 'Haute';
  createdAt: string;
}

interface ClientNotesProps {
  clientId: string;
}

export default function ClientNotes({ clientId }: ClientNotesProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canAddNotes = hasPermission('clients', 'edit') || hasPermission('notes', 'create');
  const canEditNotes = hasPermission('clients', 'edit') || hasPermission('notes', 'edit');
  const canDeleteNotes = hasPermission('clients', 'edit') || hasPermission('notes', 'delete');

  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newNote, setNewNote] = useState({ note: '', priority: 'Moyenne' as ClientNote['priority'] });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    fetchNotes();
  }, [clientId]);

  const fetchNotes = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Erreur chargement client');
      const client = await res.json();
      const clientNotes = client.notes || [];
      setNotes(clientNotes.sort((a: ClientNote, b: ClientNote) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ));
    } catch (error) {
      console.error('Erreur chargement notes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.note.trim()) return;

    try {
      const newNoteData: ClientNote = {
        id: crypto.randomUUID(),
        client_id: clientId,
        note: newNote.note,
        priority: newNote.priority,
        createdAt: new Date().toISOString()
      };

      const res = await fetch(`/api/clients/${clientId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Erreur chargement client');
      const client = await res.json();
      
      const updatedNotes = [newNoteData, ...(client.notes || [])];
      
      const updateRes = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ notes: updatedNotes })
      });

      if (!updateRes.ok) throw new Error('Erreur ajout note');

      setNotes(updatedNotes);
      setNewNote({ note: '', priority: 'Moyenne' });
      setShowForm(false);
    } catch (error) {
      console.error('Erreur ajout note:', error);
    }
  };

  const handleUpdateNote = async (noteId: string) => {
    if (!editText.trim()) return;

    try {
      const updatedNotes = notes.map(n => 
        n.id === noteId ? { ...n, note: editText } : n
      );

      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ notes: updatedNotes })
      });

      if (!res.ok) throw new Error('Erreur mise à jour note');

      setNotes(updatedNotes);
      setEditingId(null);
      setEditText('');
    } catch (error) {
      console.error('Erreur mise à jour note:', error);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('Supprimer cette note?')) return;

    try {
      const updatedNotes = notes.filter(n => n.id !== noteId);

      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ notes: updatedNotes })
      });

      if (!res.ok) throw new Error('Erreur suppression note');

      setNotes(updatedNotes);
    } catch (error) {
      console.error('Erreur suppression note:', error);
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'Haute': return <AlertCircle size={14} />;
      case 'Moyenne': return <AlertTriangle size={14} />;
      default: return <Info size={14} />;
    }
  };

  const getPriorityVariant = (priority: string) => {
    switch (priority) {
      case 'Haute': return 'danger';
      case 'Moyenne': return 'warning';
      default: return 'info';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Mobile First */}
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
            Notes & Remarques
            <span className="text-xs font-normal text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">{notes.length}</span>
        </h3>
        {canAddNotes && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition flex items-center gap-1.5 text-sm shadow-lg shadow-cyan-500/20"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Nouvelle Note</span>
            <span className="sm:hidden">Ajouter</span>
          </button>
        )}
      </div>

       {/* Formulaire Inline (Collapsible) */}
       {showForm && (
        <Card variant="elevated" className="border-cyan-500/30 animate-in slide-in-from-top-2">
            <Card.Header className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                    <Edit2 size={16} className="text-cyan-400" />
                    Nouvelle note
                </span>
                <button onClick={() => setShowForm(false)}><X size={18} className="text-slate-400 hover:text-white" /></button>
            </Card.Header>
            <div className="space-y-4 mb-4">
                 <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Priorité</label>
                    <div className="flex gap-2">
                        {['Basse', 'Moyenne', 'Haute'].map((p) => (
                            <button
                                key={p}
                                onClick={() => setNewNote(prev => ({ ...prev, priority: p as ClientNote['priority'] }))}
                                className={`
                                    px-3 py-1.5 rounded-lg text-sm font-medium transition flex-1 border
                                    ${newNote.priority === p 
                                        ? (p === 'Haute' ? 'bg-red-500/20 border-red-500 text-red-400' : p === 'Moyenne' ? 'bg-amber-500/20 border-amber-500 text-amber-400' : 'bg-blue-500/20 border-blue-500 text-blue-400')
                                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                                    }
                                `}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Contenu</label>
                    <textarea
                    value={newNote.note}
                    onChange={(e) => setNewNote(prev => ({ ...prev, note: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-3 text-white text-sm focus:ring-1 focus:ring-cyan-500 outline-none min-h-[100px]"
                    placeholder="Saisissez votre note ici..."
                    />
                </div>
            </div>

            <div className="flex justify-end gap-2">
                 <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition text-sm font-medium"
                >
                Annuler
                </button>
                <button
                onClick={handleAddNote}
                disabled={!newNote.note.trim()}
                className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white rounded-lg transition flex items-center gap-2 text-sm font-bold"
                >
                <Save size={16} />
                Enregistrer
                </button>
            </div>
        </Card>
      )}

      {/* Notes List */}
        {loading ? (
           <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
          </div>
        ) : notes.length === 0 ? (
          <Card variant="default" padding="lg" className="border-dashed border-slate-700 bg-transparent text-center">
             <div className="bg-slate-800/50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                 <MessageSquare className="text-slate-500" size={24} />
            </div>
            <p className="text-slate-400 text-sm">Aucune note pour ce client</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
               <Card key={note.id} variant="default" padding="sm" className="hover:border-slate-600 transition-colors group">
                    {/* Header: Priority & Date & Actions */}
                    <div className="flex items-center justify-between mb-3 border-b border-slate-800/50 pb-2">
                         <div className="flex items-center gap-2">
                             <Badge 
                                value={note.priority} 
                                size="sm" 
                                variant={getPriorityVariant(note.priority)}
                                icon={getPriorityIcon(note.priority)}
                             />
                             <span className="text-[10px] text-slate-500">
                                {new Date(note.createdAt).toLocaleDateString('fr-FR', {
                                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                                })}
                             </span>
                         </div>
                         
                         {/* Actions (visible on hover or always on mobile) */}
                         <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            {editingId === note.id ? (
                                <>
                                    <button
                                    onClick={() => handleUpdateNote(note.id)}
                                    className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded transition"
                                    title="Confirmer"
                                    >
                                    <Save size={14} />
                                    </button>
                                    <button
                                    onClick={() => { setEditingId(null); setEditText(''); }}
                                    className="p-1.5 text-slate-400 hover:bg-slate-700/50 rounded transition"
                                    title="Annuler"
                                    >
                                    <X size={14} />
                                    </button>
                                </>
                            ) : (
                                <>
                                    {canEditNotes && (
                                      <button
                                      onClick={() => { setEditingId(note.id); setEditText(note.note); }}
                                      className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 rounded transition"
                                      title="Modifier"
                                      >
                                      <Edit2 size={14} />
                                      </button>
                                    )}
                                    {canDeleteNotes && (
                                      <button
                                      onClick={() => handleDeleteNote(note.id)}
                                      className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition"
                                      title="Supprimer"
                                      >
                                      <Trash2 size={14} />
                                      </button>
                                    )}
                                </>
                            )}
                         </div>
                    </div>

                    {/* Content */}
                    {editingId === note.id ? (
                        <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="w-full bg-slate-950 text-white px-3 py-2 rounded border border-slate-700 focus:outline-none focus:ring-1 focus:ring-cyan-500 min-h-[80px] text-sm"
                        autoFocus
                        />
                    ) : (
                        <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                            {note.note}
                        </p>
                    )}
               </Card>
            ))}
          </div>
        )}
    </div>
  );
}
