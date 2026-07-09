import React, { useState, useEffect } from 'react';
import { Tag, Plus, X, Hash, Search, Minus } from 'lucide-react';
import { usePermissions } from '../auth/ProtectedFeature';

interface TagType {
  id: string;
  name: string;
  color: string;
  type: string;
}

interface ClientTag {
  id: string; // Assignment ID
  clientId: string;
  tagId: string;
  tag: TagType;
  createdAt: string;
}

interface ClientTagsProps {
  clientId: string;
  compact?: boolean;
}

export default function ClientTags({ clientId, compact = false }: ClientTagsProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canCreateTags = hasPermission('clients', 'edit') || hasPermission('tags', 'create');
  const canAssignTags = hasPermission('clients', 'edit') || hasPermission('tags', 'assign');
  const canDeleteTags = hasPermission('clients', 'edit') || hasPermission('tags', 'delete');

  const [allTags, setAllTags] = useState<TagType[]>([]);
  const [clientTags, setClientTags] = useState<ClientTag[]>([]);
  const [showTagModal, setShowTagModal] = useState(false);
  const [newTag, setNewTag] = useState({ name: '', color: '#10B981', type: 'status' });
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchTags();
    fetchClientTags();
  }, [clientId]);
  


  const fetchTags = async () => {
    try {
      const res = await fetch('/api/tags', { credentials: 'include' });
      const data = await res.json();
      setAllTags(data || []);
    } catch (error) {
      console.error('Erreur chargement tags:', error);
    }
  };

  const fetchClientTags = async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/tags`, { credentials: 'include' });
      const data = await res.json();
      setClientTags(data || []);
    } catch (error) {
      console.error('Erreur chargement client tags:', error);
    }
  };

  const handleAddTag = async () => {
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTag),
        credentials: 'include'
      });

      if (!res.ok) throw new Error('Erreur création tag');
      const tag = await res.json();

      setAllTags([...allTags, tag]);
      setNewTag({ name: '', color: '#10B981', type: 'status' });
      // Assign directly? No, user selects it.
    } catch (error) {
      console.error('Erreur création tag:', error);
    }
  };

  const handleAssignTag = async (tagId: string) => {
    try {
      const res = await fetch(`/api/clients/${clientId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagId }),
        credentials: 'include'
      });

      if (!res.ok) throw new Error('Erreur assignation tag');
      const assignment = await res.json();

      // S'assurer que l'objet tag est présent
      if (assignment && assignment.tag) {
        setClientTags(prev => [...prev, assignment]);
        logActivity(clientId, 'tag_assigned', `Tag assigné: ${assignment.tag.name}`);
      } else {
        // Rafraîchir les tags si la réponse n'inclut pas le tag complet
        await fetchClientTags();
        const tag = allTags.find(t => t.id === tagId);
        logActivity(clientId, 'tag_assigned', `Tag assigné: ${tag?.name || 'Inconnu'}`);
      }
    } catch (error) {
      console.error('Erreur assignation tag:', error);
    }
  };

  const handleRemoveTag = async (tagId: string, tagName: string) => {
    try {
      const res = await fetch(`/api/clients/${clientId}/tags/${tagId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!res.ok) throw new Error('Erreur suppression tag');

      setClientTags(prev => prev.filter(t => t.tagId !== tagId));
      logActivity(clientId, 'tag_removed', `Tag retiré: ${tagName}`);
    } catch (error) {
      console.error('Erreur suppression tag:', error);
    }
  };

  const handleDeleteTagDef = async (id: string) => {
    if (!confirm('Supprimer définitivement ce tag ?')) return;
    try {
      const res = await fetch(`/api/tags/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Erreur suppression tag');
      fetchTags();
      fetchClientTags(); // Refresh in case it was used
    } catch (error) {
      console.error('Erreur suppression tag def:', error);
    }
  };

  const logActivity = async (clientIdParam: string, type: string, description: string) => {
    try {
      await fetch(`/api/clients/${clientIdParam}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          description,
          metadata: {}
        }),
        credentials: 'include'
      });
    } catch (error) {
      console.error("Failed to log activity", error);
    }
  };

  // Filtrer les tags client valides (avec tag non null)
  const validClientTags = clientTags.filter(ct => ct && ct.tag && ct.tagId);
  const unassignedTags = allTags.filter(t => t && t.id && !validClientTags.some(ct => ct.tagId === t.id));
  const filteredTags = unassignedTags.filter(t => (t.name || '').toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className={`space-y-4 ${compact ? '!space-y-2' : ''}`}>
      <div className="flex flex-wrap gap-2">
        {validClientTags.map(ct => (
          <span
            key={ct.id}
            className={`px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition border border-transparent ${compact ? 'text-[10px] px-2 py-0' : ''}`}
            style={{ backgroundColor: `${ct.tag.color}15`, color: ct.tag.color, borderColor: `${ct.tag.color}30` }}
          >
            {!compact && <Hash size={12} />}
            {ct.tag.name}
            {!compact && canDeleteTags && (
                <button
                onClick={() => handleRemoveTag(ct.tagId, ct.tag.name)}
                className="hover:bg-black/20 rounded-full p-0.5 ml-0.5"
                >
                <X size={12} />
                </button>
            )}

          </span>
        ))}
        
        {compact ? (
             <button
              onClick={() => setShowTagModal(true)}
              className="px-2 py-0.5 rounded-full bg-surface hover:bg-surface-elevated text-content-muted text-[10px] flex items-center gap-1 transition border border-dashed border-edge-strong hover:border-edge-strong hover:text-content-secondary"
            >
              <Plus size={10} /> {validClientTags.length === 0 ? 'Tags' : ''}
            </button>
        ) : (
            <button
            onClick={() => setShowTagModal(true)}
            className="px-3 py-1 rounded-full bg-surface-elevated hover:bg-surface-subtle text-content-secondary text-sm flex items-center gap-1 transition border border-dashed border-edge-strong"
            >
            <Plus size={14} /> Gérer les tags
            </button>
        )}

      </div>

      {showTagModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-edge rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-edge flex justify-between items-center bg-surface-base/50">
              <h3 className="font-bold text-content-primary flex items-center gap-2">
                <Tag size={18} className="text-status-success" />
                Gestion des Tags
              </h3>
              <button onClick={() => setShowTagModal(false)} className="text-content-muted hover:text-content-primary">
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Tags assignés au client */}
              {validClientTags.length > 0 && (
                <div>
                  <p className="text-[10px] text-content-muted uppercase tracking-wider mb-2 font-medium">Tags assignés</p>
                  <div className="flex flex-wrap gap-1.5">
                    {validClientTags.map(ct => (
                      <span
                        key={ct.id}
                        className="px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 border border-transparent"
                        style={{ backgroundColor: `${ct.tag.color}15`, color: ct.tag.color, borderColor: `${ct.tag.color}30` }}
                      >
                        {ct.tag.name}
                        {canDeleteTags && (
                          <button
                            onClick={() => handleRemoveTag(ct.tagId, ct.tag.name)}
                            className="hover:bg-black/20 rounded-full p-0.5"
                            title="Retirer du client"
                          >
                            <Minus size={12} />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Créer un nouveau tag */}
              {canCreateTags && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Nouveau tag..."
                    value={newTag.name}
                    onChange={e => setNewTag({ ...newTag, name: e.target.value })}
                    className="flex-1 bg-surface-base border border-edge-strong rounded-lg px-3 py-2 text-content-primary focus:ring-2 focus:ring-status-success outline-none"
                  />
                  <input
                    type="color"
                    value={newTag.color}
                    onChange={e => setNewTag({ ...newTag, color: e.target.value })}
                    className="w-10 h-10 rounded cursor-pointer bg-transparent"
                  />
                  <button
                    onClick={handleAddTag}
                    disabled={!newTag.name}
                    className="bg-status-success hover:bg-status-success/80 text-white p-2 rounded-lg disabled:opacity-50"
                  >
                    <Plus size={20} />
                  </button>
                </div>
              )}

              {/* Recherche et tags disponibles */}
              <div className="relative">
                <Search size={16} className="absolute left-3 top-3 text-content-muted" />
                <input
                  type="text"
                  placeholder="Rechercher un tag existant..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full bg-surface-base border border-edge-strong rounded-lg pl-9 pr-3 py-2 text-content-primary text-sm outline-none focus:border-edge-strong"
                />
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {filteredTags.length === 0 ? (
                  <div className="text-center text-content-muted py-4 text-sm">Aucun tag disponible</div>
                ) : (
                  filteredTags.map(tag => (
                    <div
                      key={tag.id}
                      className="flex items-center justify-between p-2 hover:bg-surface-elevated/50 rounded-lg group"
                    >
                      <span
                        className="px-2 py-1 rounded text-xs font-medium"
                        style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                      >
                        {tag.name}
                      </span>
                      <div className="flex items-center gap-2">
                        {canAssignTags && (
                          <button
                            onClick={() => handleAssignTag(tag.id)}
                            className="text-content-muted hover:text-status-success p-1"
                            title="Assigner"
                          >
                            <Plus size={16} />
                          </button>
                        )}
                        {canDeleteTags && (
                          <button
                            onClick={() => handleDeleteTagDef(tag.id)}
                            className="text-content-muted hover:text-status-danger p-1 opacity-0 group-hover:opacity-100 transition"
                            title="Supprimer définitivement"
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
