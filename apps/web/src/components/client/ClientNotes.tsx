import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, AlertCircle, AlertTriangle, Info, Edit2, Save, X, MessageSquare, ChevronLeft, ChevronRight, CheckSquare, Square, ListTodo } from 'lucide-react';
import { Card, Badge } from '../ui';
import { usePermissions } from '../auth/ProtectedFeature';

const NOTES_PER_PAGE = 10;

interface ClientNote {
  id: string;
  client_id: string;
  note: string;
  priority: 'Basse' | 'Moyenne' | 'Haute';
  createdAt: string;
  isTodo?: boolean;
  completedAt?: string | null;
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
  const [newNote, setNewNote] = useState({ note: '', priority: 'Moyenne' as ClientNote['priority'], isTodo: false });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(notes.length / NOTES_PER_PAGE));
  const paginatedNotes = useMemo(() => {
    const start = (currentPage - 1) * NOTES_PER_PAGE;
    return notes.slice(start, start + NOTES_PER_PAGE);
  }, [notes, currentPage]);

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
        createdAt: new Date().toISOString(),
        ...(newNote.isTodo ? { isTodo: true, completedAt: null } : {}),
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
      setNewNote({ note: '', priority: 'Moyenne', isTodo: false });
      setShowForm(false);
      setCurrentPage(1);
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

  const handleToggleTodo = async (noteId: string) => {
    try {
      const updatedNotes = notes.map(n =>
        n.id === noteId
          ? { ...n, completedAt: n.completedAt ? null : new Date().toISOString() }
          : n
      );

      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ notes: updatedNotes })
      });

      if (!res.ok) throw new Error('Erreur mise à jour note');

      setNotes(updatedNotes);
    } catch (error) {
      console.error('Erreur toggle todo:', error);
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
        <h3 className="text-lg font-bold text-content-primary flex items-center gap-2">
            Notes & Remarques
            <span className="text-xs font-normal text-content-muted bg-surface px-2 py-0.5 rounded-full">{notes.length}</span>
        </h3>
        {canAddNotes && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-3 py-1.5 bg-accent-secondary hover:bg-accent-secondary-hover text-content-inverted rounded-lg transition flex items-center gap-1.5 text-sm shadow-lg shadow-accent/20"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Nouvelle Note</span>
            <span className="sm:hidden">Ajouter</span>
          </button>
        )}
      </div>

       {/* Formulaire Inline (Collapsible) */}
       {showForm && (
        <Card variant="elevated" className="border-accent/30 animate-in slide-in-from-top-2">
            <Card.Header className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                    <Edit2 size={16} className="text-accent" />
                    Nouvelle note
                </span>
                <button onClick={() => setShowForm(false)}><X size={18} className="text-content-muted hover:text-content-primary" /></button>
            </Card.Header>
            <div className="space-y-4 mb-4">
                 <div>
                    <label className="block text-xs font-semibold text-content-muted mb-1.5 uppercase">Priorité</label>
                    <div className="flex gap-2">
                        {['Basse', 'Moyenne', 'Haute'].map((p) => (
                            <button
                                key={p}
                                onClick={() => setNewNote(prev => ({ ...prev, priority: p as ClientNote['priority'] }))}
                                className={`
                                    px-3 py-1.5 rounded-lg text-sm font-medium transition flex-1 border
                                    ${newNote.priority === p 
                                        ? (p === 'Haute' ? 'bg-status-danger-bg border-status-danger text-status-danger' : p === 'Moyenne' ? 'bg-status-warning-bg border-status-warning text-status-warning' : 'bg-status-info-bg border-status-info text-status-info')
                                        : 'bg-surface border-edge text-content-muted hover:bg-surface-elevated'
                                    }
                                `}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-semibold text-content-muted mb-1.5 uppercase">Contenu</label>
                    <textarea
                    value={newNote.note}
                    onChange={(e) => setNewNote(prev => ({ ...prev, note: e.target.value }))}
                    className="w-full bg-surface-base border border-edge rounded-lg px-3 py-3 text-content-primary text-sm focus:ring-1 focus:ring-accent outline-none min-h-[100px]"
                    placeholder="Saisissez votre note ici..."
                    />
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                    <button
                      type="button"
                      onClick={() => setNewNote(prev => ({ ...prev, isTodo: !prev.isTodo }))}
                      className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                        newNote.isTodo
                          ? 'bg-accent border-accent text-white'
                          : 'border-edge bg-surface group-hover:border-content-muted'
                      }`}
                    >
                      {newNote.isTodo && <CheckSquare size={12} />}
                    </button>
                    <div>
                      <span className="text-sm font-medium text-content-primary">Tache a faire</span>
                      <p className="text-[10px] text-content-muted">Affiche une case a cocher pour marquer comme fait</p>
                    </div>
                </label>
            </div>

            <div className="flex justify-end gap-2">
                 <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-surface hover:bg-surface-elevated text-content-secondary rounded-lg transition text-sm font-medium"
                >
                Annuler
                </button>
                <button
                onClick={handleAddNote}
                disabled={!newNote.note.trim()}
                className="px-4 py-2 bg-accent-secondary hover:bg-accent-secondary-hover disabled:opacity-50 text-content-inverted rounded-lg transition flex items-center gap-2 text-sm font-bold"
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
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
          </div>
        ) : notes.length === 0 ? (
          <Card variant="default" padding="lg" className="border-dashed border-edge bg-transparent text-center">
             <div className="bg-surface/50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                 <MessageSquare className="text-content-muted" size={24} />
            </div>
            <p className="text-content-muted text-sm">Aucune note pour ce client</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {paginatedNotes.map((note) => {
              const isCompleted = note.isTodo && !!note.completedAt;
              return (
               <Card key={note.id} variant="default" padding="sm" className={`hover:border-edge-strong transition-colors group ${isCompleted ? 'opacity-60' : ''}`}>
                    {/* Header: Priority & Date & Actions */}
                    <div className="flex items-center justify-between mb-3 border-b border-edge/50 pb-2">
                         <div className="flex items-center gap-2">
                             <Badge
                                value={note.priority}
                                size="sm"
                                variant={getPriorityVariant(note.priority)}
                                icon={getPriorityIcon(note.priority)}
                             />
                             {note.isTodo && (
                               <Badge value="Tache" size="sm" variant="neutral" icon={<ListTodo size={10} />} />
                             )}
                             <span className="text-[10px] text-content-muted">
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
                                    className="p-1.5 text-status-success hover:bg-status-success-bg rounded transition"
                                    title="Confirmer"
                                    >
                                    <Save size={14} />
                                    </button>
                                    <button
                                    onClick={() => { setEditingId(null); setEditText(''); }}
                                    className="p-1.5 text-content-muted hover:bg-surface-elevated/50 rounded transition"
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
                                      className="p-1.5 text-content-muted hover:text-accent hover:bg-accent/10 rounded transition"
                                      title="Modifier"
                                      >
                                      <Edit2 size={14} />
                                      </button>
                                    )}
                                    {canDeleteNotes && (
                                      <button
                                      onClick={() => handleDeleteNote(note.id)}
                                      className="p-1.5 text-content-muted hover:text-status-danger hover:bg-status-danger-bg rounded transition"
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
                        className="w-full bg-surface-base text-content-primary px-3 py-2 rounded border border-edge focus:outline-none focus:ring-1 focus:ring-accent min-h-[80px] text-sm"
                        autoFocus
                        />
                    ) : (
                        <div className="flex items-start gap-2.5">
                          {note.isTodo && (
                            <button
                              onClick={() => handleToggleTodo(note.id)}
                              className={`shrink-0 mt-0.5 transition-colors ${
                                isCompleted ? 'text-status-success' : 'text-content-muted hover:text-accent'
                              }`}
                              title={isCompleted ? 'Marquer comme non fait' : 'Marquer comme fait'}
                            >
                              {isCompleted ? <CheckSquare size={18} /> : <Square size={18} />}
                            </button>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm whitespace-pre-wrap leading-relaxed ${
                              isCompleted
                                ? 'line-through text-content-muted'
                                : 'text-content-secondary'
                            }`}>
                              {note.note}
                            </p>
                            {isCompleted && note.completedAt && (
                              <p className="text-[10px] text-status-success mt-1">
                                Fait le {new Date(note.completedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </p>
                            )}
                          </div>
                        </div>
                    )}
               </Card>
              );
            })}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-content-muted">
                  {(currentPage - 1) * NOTES_PER_PAGE + 1}-{Math.min(currentPage * NOTES_PER_PAGE, notes.length)} sur {notes.length}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg text-content-muted hover:bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed transition"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-7 h-7 rounded-lg text-xs font-medium transition ${
                        page === currentPage
                          ? 'bg-accent text-white'
                          : 'text-content-muted hover:bg-surface-elevated'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg text-content-muted hover:bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed transition"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
    </div>
  );
}
