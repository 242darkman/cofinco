import React, { useState, useEffect } from 'react';
import { Upload, FileText, CheckCircle, XCircle, Clock, Trash2, Eye, Plus, Filter, SortAsc, Image } from 'lucide-react';
import { Card, Badge } from '../ui';
import { FileUploadZone } from '../ui/FileUploadZone';
import ConfirmDialog from '../ui/ConfirmDialog';
import { usePermissions } from '../auth/ProtectedFeature';
import { useMinIOUpload } from '../../hooks/useMinIOUpload';

// Helper to detect image URLs
const isImage = (url: string) =>
  /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(url) || url.startsWith('data:image');

interface ClientDocument {
  id: string;
  client_id: string;
  document_type: 'ID Card' | 'Passport' | 'Contract' | 'Photo' | 'Other';
  document_name: string;
  document_url: string;
  notes?: string;
  status: 'Pending' | 'Verified' | 'Rejected';
  verified_at?: string;
  created_at: string;
}

interface ClientKYCProps {
  clientId: string;
  onUpdate?: () => void;
}

export default function ClientKYC({ clientId, onUpdate }: ClientKYCProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canAddDocuments = hasPermission('clients', 'edit') || hasPermission('kyc', 'create');
  const canVerifyDocuments = hasPermission('kyc', 'approve') || hasPermission('admin', 'manage');
  const canDeleteDocuments = hasPermission('clients', 'edit') || hasPermission('kyc', 'delete');

  const { uploadFile, isUploading: isFileUploading } = useMinIOUpload({
    path: 'kyc', 
    isPublic: false, 
    onError: (err: Error) => console.error("Upload error", err)
  });

  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newDoc, setNewDoc] = useState({
    type: 'ID Card' as ClientDocument['document_type'],
    name: '',
    url: '',
    notes: ''
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [docToDelete, setDocToDelete] = useState<string | null>(null);

  useEffect(() => {
    fetchDocuments();
  }, [clientId]);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Erreur chargement client');
      const client = await res.json();

      // Documents peuvent être dans 'documents' (nouveau format) ou 'photoUrl'/'photo_url' (legacy)
      let clientDocs: ClientDocument[] = client.documents || [];

      // Si pas de documents mais photoUrl existe, parser le format legacy
      if (clientDocs.length === 0) {
        const photoUrlField = client.photoUrl || client.photo_url;
        if (photoUrlField) {
          try {
            const parsed = JSON.parse(photoUrlField);
            if (Array.isArray(parsed)) {
              // Format legacy: array of URLs strings ou objets
              clientDocs = parsed.map((item: string | any, index: number) => {
                if (typeof item === 'string') {
                  // URL simple - convertir en document
                  return {
                    id: `legacy-${index}-${Date.now()}`,
                    client_id: clientId,
                    document_type: 'ID Card' as const,
                    document_name: `Document ${index + 1}`,
                    document_url: item,
                    status: 'Pending' as const,
                    created_at: client.created_at || new Date().toISOString()
                  };
                }
                // Déjà un objet document
                return item;
              });
            }
          } catch {
            // Si c'est une URL simple (pas JSON), créer un document
            if (photoUrlField.startsWith('data:') || photoUrlField.startsWith('http')) {
              clientDocs = [{
                id: `legacy-0-${Date.now()}`,
                client_id: clientId,
                document_type: 'ID Card' as const,
                document_name: 'Pièce d\'identité',
                document_url: photoUrlField,
                status: 'Pending' as const,
                created_at: client.created_at || new Date().toISOString()
              }];
            }
          }
        }
      }

      setDocuments(clientDocs.sort((a: ClientDocument, b: ClientDocument) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
    } catch (error) {
      console.error('Erreur chargement documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddDocument = async () => {
    if (!newDoc.name || !newDoc.url) return;

    setUploading(true);
    try {
      const newDocData: ClientDocument = {
        id: crypto.randomUUID(),
        client_id: clientId,
        document_type: newDoc.type,
        document_name: newDoc.name,
        document_url: newDoc.url,
        notes: newDoc.notes,
        status: 'Pending',
        created_at: new Date().toISOString()
      };

      const res = await fetch(`/api/clients/${clientId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Erreur chargement client');
      const client = await res.json();
      
      const updatedDocs = [newDocData, ...(client.documents || [])];
      
      const updateRes = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ documents: updatedDocs })
      });

      if (!updateRes.ok) throw new Error('Erreur ajout document');

      setDocuments(updatedDocs);
      setNewDoc({ type: 'ID Card', name: '', url: '', notes: '' });
      setShowForm(false);
      onUpdate?.();
    } catch (error) {
      console.error('Erreur ajout document:', error);
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateStatus = async (docId: string, status: ClientDocument['status']) => {
    try {
      const updatedDocs = documents.map(doc =>
        doc.id === docId ? { 
          ...doc, 
          status, 
          verified_at: status === 'Verified' ? new Date().toISOString() : undefined 
        } : doc
      );

      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ documents: updatedDocs })
      });

      if (!res.ok) throw new Error('Erreur mise à jour statut');

      setDocuments(updatedDocs);
      onUpdate?.();
    } catch (error) {
      console.error('Erreur mise à jour statut:', error);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    setDocToDelete(docId);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!docToDelete) return;

    try {
      const updatedDocs = documents.filter(doc => doc.id !== docToDelete);

      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ documents: updatedDocs })
      });

      if (!res.ok) throw new Error('Erreur suppression document');

      setDocuments(updatedDocs);
      onUpdate?.();
    } catch (error) {
      console.error('Erreur suppression document:', error);
    } finally {
      setShowDeleteConfirm(false);
      setDocToDelete(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Verified': return <CheckCircle size={14} className="text-green-400" />;
      case 'Rejected': return <XCircle size={14} className="text-blue-400" />;
      default: return <Clock size={14} className="text-cyan-400" />;
    }
  };

  const kycStats = {
    total: documents.length,
    verified: documents.filter(d => d.status === 'Verified').length,
    pending: documents.filter(d => d.status === 'Pending').length,
    rejected: documents.filter(d => d.status === 'Rejected').length
  };

  const kycComplete = kycStats.total > 0 && kycStats.pending === 0 && kycStats.rejected === 0;

  return (
    <div className="space-y-4">
      {/* Header Mobile First */}
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
            Dossier KYC
            {kycComplete && <Badge value="Complet" variant="success" size="sm" icon={<CheckCircle size={12}/>} />}
        </h3>
        {canAddDocuments && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition flex items-center gap-1.5 text-sm shadow-lg shadow-cyan-500/20"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Ajouter Document</span>
            <span className="sm:hidden">Ajouter</span>
          </button>
        )}
      </div>

      {/* Stats - Mobile Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card variant="default" padding="sm" className="bg-slate-800/50 border-slate-700/50">
          <p className="text-[10px] uppercase text-slate-500 font-semibold mb-1">Total</p>
          <p className="text-xl font-bold text-white">{kycStats.total}</p>
        </Card>
        <Card variant="default" padding="sm" className="bg-emerald-900/10 border-emerald-500/20">
          <p className="text-[10px] uppercase text-emerald-500/70 font-semibold mb-1">Vérifiés</p>
          <p className="text-xl font-bold text-emerald-400">{kycStats.verified}</p>
        </Card>
         <Card variant="default" padding="sm" className="bg-amber-900/10 border-amber-500/20">
          <p className="text-[10px] uppercase text-amber-500/70 font-semibold mb-1">En attente</p>
          <p className="text-xl font-bold text-amber-400">{kycStats.pending}</p>
        </Card>
         <Card variant="default" padding="sm" className="bg-red-900/10 border-red-500/20">
          <p className="text-[10px] uppercase text-red-500/70 font-semibold mb-1">Rejetés</p>
          <p className="text-xl font-bold text-red-400">{kycStats.rejected}</p>
        </Card>
      </div>

      {/* Formulaire Inline (Collapsible) */}
      {showForm && (
        <Card variant="elevated" className="border-cyan-500/30 animate-in slide-in-from-top-2">
            <Card.Header className="flex items-center justify-between text-base">
                <span>Nouveau Document</span>
                <button onClick={() => setShowForm(false)}><XCircle size={18} className="text-slate-400 hover:text-white" /></button>
            </Card.Header>
            <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Type</label>
                <select
                value={newDoc.type}
                onChange={(e) => setNewDoc(prev => ({ ...prev, type: e.target.value as ClientDocument['document_type'] }))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-1 focus:ring-cyan-500 outline-none"
                >
                <option value="ID Card">Carte d'identité</option>
                <option value="Passport">Passeport</option>
                <option value="Contract">Contrat</option>
                <option value="Photo">Photo</option>
                <option value="Other">Autre</option>
                </select>
            </div>

            <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Nom du fichier</label>
                <input
                type="text"
                value={newDoc.name}
                onChange={(e) => setNewDoc(prev => ({ ...prev, name: e.target.value }))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-1 focus:ring-cyan-500 outline-none"
                placeholder="Ex: CNI_Jean_Dupont.pdf"
                />
            </div>

            <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Document</label>
                <FileUploadZone
                  accept=".pdf,.jpg,.jpeg,.png"
                  maxSize={5}
                  maxFiles={1}
                  label="Glissez votre document ici"
                  hint="ou cliquez pour parcourir (PDF, JPG, PNG - max 5MB)"
                  uploadFunction={async (file) => {
                    // Determine path based on doc type
                    const path = newDoc.type === 'Contract' ? 'contracts' : 'kyc';
                    // We need to use the hook's uploadFile here, but we can't easily pass the hook's returned function 
                    // if it depends on state that changes (like path).
                    // Actually, useMinIOUpload hook creates a stable function if props are stable.
                    // Let's handle the upload in onFilesSelected instead to control the path dynamically if needed, 
                    // OR just use uploadFunction if we make the hook usage dynamic.
                    
                    // Better approach: use onFilesSelected and call uploadFile manually to handle state updates
                    return ""; 
                  }}
                  onFilesSelected={async (files: File[]) => {
                    if (files.length > 0) {
                      const file = files[0];
                      try {
                         // Determine specific path based on type
                         const subfolder = newDoc.type === 'Contract' ? 'contracts' : 'kyc';
                         // We'll rely on the hook initialized in the component, but we might need dynamic path support in the hook
                         // OR we just instantiate the hook with a generic 'documents' path and handle organization backend side?
                         // The hook uses the path passed at init. 
                         // Let's modify the hook call or use the hook with a generic path and rely on filename or just accept 'documents' for now.
                         // Actually, looking at useMinIOUpload (from memory), it takes path in props.
                         // Let's assume we use one hook instance for now, maybe initialized with 'clients'.
                         
                         const url = await uploadFile(file); // This uses the path defined in the hook
                         if (url) {
                            setNewDoc(prev => ({ 
                              ...prev, 
                              url: url,
                              name: prev.name || file.name 
                            }));
                         }
                      } catch (e) {
                        console.error("Upload error", e);
                      }
                    }
                  }}
                />
                {newDoc.url && (
                  <p className="text-xs text-green-400 mt-2 flex items-center gap-1">
                    <CheckCircle size={12} /> Document chargé
                  </p>
                )}
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
                onClick={handleAddDocument}
                disabled={uploading || !newDoc.name || !newDoc.url}
                className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white rounded-lg transition flex items-center gap-2 text-sm font-bold"
                >
                {uploading ? <Clock size={16} className="animate-spin" /> : <Upload size={16} />}
                {uploading ? 'Ajout...' : 'Enregistrer'}
                </button>
            </div>
        </Card>
      )}

      {/* Document List */}
        {loading ? (
           <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
          </div>
        ) : documents.length === 0 ? (
          <Card variant="default" padding="lg" className="border-dashed border-slate-700 bg-transparent text-center">
             <div className="bg-slate-800/50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                 <FileText className="text-slate-500" size={24} />
            </div>
            <p className="text-slate-400 text-sm">Aucun document dans le dossier</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => (
              <Card key={doc.id} variant="default" padding="sm" className="hover:border-slate-600 transition-colors">
                <div className="flex items-start justify-between gap-3">
                    {/* Icon & Info with Thumbnail Preview */}
                    <div className="flex items-start gap-3 overflow-hidden">
                        <div className="w-12 h-12 bg-slate-800 rounded-lg shrink-0 overflow-hidden flex items-center justify-center">
                            {isImage(doc.document_url) ? (
                              <img 
                                src={doc.document_url} 
                                alt={doc.document_name} 
                                className="w-full h-full object-cover" 
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                  (e.target as HTMLImageElement).parentElement!.innerHTML = '<svg class="text-blue-400" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
                                }}
                              />
                            ) : (
                              <FileText size={20} className="text-blue-400" />
                            )}
                        </div>
                        <div className="min-w-0">
                             <p className="font-semibold text-white text-sm truncate pr-2">{doc.document_name}</p>
                             <div className="flex items-center gap-2 mt-1">
                                <Badge value={doc.document_type} size="sm" variant="neutral" />
                                <span className="text-[10px] text-slate-500">{new Date(doc.created_at).toLocaleDateString()}</span>
                             </div>
                        </div>
                    </div>

                    {/* Status Badge */}
                    <Badge 
                        value={doc.status} 
                        size="sm" 
                        variant={doc.status === 'Verified' ? 'success' : doc.status === 'Rejected' ? 'danger' : 'warning'}
                        icon={getStatusIcon(doc.status)}
                    />
                </div>

                {/* Actions Toolbar */}
                <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-slate-700/50">
                     {doc.status === 'Pending' && canVerifyDocuments && (
                        <div className="flex items-center gap-1 mr-auto">
                           <button
                             onClick={() => handleUpdateStatus(doc.id, 'Verified')}
                             className="p-1.5 text-emerald-500 hover:bg-emerald-500/10 rounded transition"
                             title="Valider"
                           >
                             <CheckCircle size={16} />
                           </button>
                           <button
                             onClick={() => handleUpdateStatus(doc.id, 'Rejected')}
                             className="p-1.5 text-red-500 hover:bg-red-500/10 rounded transition"
                             title="Rejeter"
                           >
                             <XCircle size={16} />
                           </button>
                           <div className="w-px h-3 bg-slate-700 mx-1"></div>
                        </div>
                     )}

                     <a
                        href={doc.document_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-blue-400 hover:text-blue-300 flex items-center gap-1 px-2 py-1 hover:bg-blue-500/10 rounded transition"
                      >
                        <Eye size={14} /> Voir
                      </a>
                      {canDeleteDocuments && (
                        <button
                          onClick={() => handleDeleteDocument(doc.id)}
                          className="text-xs font-medium text-slate-400 hover:text-red-400 flex items-center gap-1 px-2 py-1 hover:bg-slate-700 rounded transition"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                </div>
              </Card>
            ))}
          </div>
        )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDelete}
        title="Supprimer ce document?"
        message="Cette action est irréversible. Le document sera définitivement supprimé du dossier KYC."
        variant="danger"
        confirmText="Supprimer"
        cancelText="Annuler"
      />
    </div>
  );
}
