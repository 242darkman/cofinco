import React, { useState, useEffect, useMemo } from 'react';
import { Upload, FileText, CheckCircle, XCircle, Clock, Trash2, Eye, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, Badge, Skeleton } from '../ui';

const DOCS_PER_PAGE = 8;
import { FileUploadZone } from '../ui/FileUploadZone';
import ConfirmDialog from '../ui/ConfirmDialog';
import { usePermissions } from '../auth/ProtectedFeature';
import { useEntityUpload } from '../../hooks/useEntityUpload';
import { useSecureDocument } from '../../hooks/useSecureDocument';

// Helper to detect image URLs
const isImage = (url: string) => {
  if (url.startsWith('data:image')) return true;
  const cleanUrl = url.split('?')[0].split('#')[0];
  return /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(cleanUrl);
};

const isDirectUrl = (url: string) => url.startsWith('http') || url.startsWith('data:');

// Fix malformed URLs that have double prefixes (e.g., http://host/bucket/http://host/bucket/key)
const normalizeDocumentUrl = (url: string): string => {
  if (!url) return url;

  // Check for double http:// pattern (malformed URL)
  const doubleHttpMatch = url.match(/^(https?:\/\/[^/]+\/[^/]+\/)(https?:\/\/.+)$/);
  if (doubleHttpMatch) {
    // Return the second (inner) URL which is the real one
    return doubleHttpMatch[2];
  }

  return url;
};

// Translate status to French for UI display
const translateStatus = (status: string): string => {
  const statusLower = status?.toLowerCase();
  switch (statusLower) {
    case 'pending': return 'En attente';
    case 'verified': return 'Vérifié';
    case 'rejected': return 'Rejeté';
    default: return status;
  }
};

// Translate document type to French for UI display
const translateDocumentType = (docType: string): string => {
  switch (docType) {
    case 'ID_CARD_FRONT': return 'Pièce d\'identité (Recto)';
    case 'ID_CARD_BACK': return 'Pièce d\'identité (Verso)';
    case 'PASSPORT': return 'Passeport';
    case 'DRIVING_LICENSE': return 'Permis de conduire';
    case 'RESIDENT_CARD': return 'Carte de résident';
    case 'PROOF_OF_ADDRESS': return 'Justificatif de domicile';
    case 'CONTRACT': return 'Contrat de travail';
    case 'AVATAR': return 'Photo de profil';
    case 'OTHER': return 'Autre';
    default: return docType;
  }
};

interface ClientDocument {
  id: string;
  clientId: string;
  documentType: 'ID_CARD_FRONT' | 'ID_CARD_BACK' | 'PASSPORT' | 'DRIVING_LICENSE' | 'RESIDENT_CARD' | 'PROOF_OF_ADDRESS' | 'CONTRACT' | 'AVATAR' | 'OTHER';
  documentName: string;
  documentUrl: string;
  ownerId?: string;
  notes?: string;
  status: 'pending' | 'verified' | 'rejected';
  verifiedAt?: string;
  createdAt: string;
}

interface ClientKYCProps {
  clientId: string;
  onUpdate?: () => void;
}

interface KycDocumentCardProps {
  doc: ClientDocument;
  canVerifyDocuments: boolean;
  canDeleteDocuments: boolean;
  onUpdateStatus: (docId: string, status: ClientDocument['status']) => void;
  onDelete: (docId: string) => void;
  getStatusIcon: (status: string) => React.JSX.Element;
}

function KycDocumentCard({
  doc,
  canVerifyDocuments,
  canDeleteDocuments,
  onUpdateStatus,
  onDelete,
  getStatusIcon
}: KycDocumentCardProps) {
  // Normalize the URL first to fix any malformed double-prefix URLs
  const normalizedDocUrl = normalizeDocumentUrl(doc.documentUrl);

  // Déterminer si l'URL est directement utilisable (http/https ou data:)
  const hasDirectUrl = Boolean(normalizedDocUrl && isDirectUrl(normalizedDocUrl));
  // Les documents legacy n'ont pas d'entrée en base, on utilise leur document_url directement
  const isLegacyDoc = doc.id.startsWith('legacy-');

  // Appeler useSecureDocument seulement si on a besoin d'une URL signée (pas d'URL directe)
  const needsSignedUrl = !hasDirectUrl && !isLegacyDoc;
  const { url: signedUrl, isLoading, isError, refresh } = useSecureDocument(needsSignedUrl ? doc.id : null);
  const [refreshAttempted, setRefreshAttempted] = useState(false);

  // Résoudre l'URL finale : URL directe si disponible, sinon URL signée
  // Ne jamais utiliser doc.documentUrl si c'est une clé MinIO (ne commence pas par http/data)
  const resolvedUrl = hasDirectUrl ? normalizedDocUrl : signedUrl;
  const showSkeleton = needsSignedUrl && isLoading;

  const handleImageError = () => {
    if (!hasDirectUrl && !refreshAttempted) {
      setRefreshAttempted(true);
      refresh();
    }
  };

  return (
    <Card variant="default" padding="sm" className="hover:border-edge-strong transition-colors">
      <div className="flex items-start justify-between gap-3">
        {/* Icon & Info with Thumbnail Preview */}
        <div className="flex items-start gap-3 overflow-hidden">
          <div className="w-12 h-12 bg-surface rounded-lg shrink-0 overflow-hidden flex items-center justify-center">
            {showSkeleton ? (
              <Skeleton variant="rounded" width={48} height={48} />
            ) : resolvedUrl && isImage(resolvedUrl) ? (
              <img
                src={resolvedUrl}
                alt={doc.documentName}
                className="w-full h-full object-cover"
                onError={handleImageError}
              />
            ) : (
              <FileText size={20} className="text-status-info" />
            )}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-content-primary text-sm truncate pr-2">{doc.documentName}</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge value={translateDocumentType(doc.documentType)} size="sm" variant="neutral" />
              <span className="text-[10px] text-content-muted">
                {new Date(doc.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        {/* Status Badge */}
        <Badge
          value={translateStatus(doc.status)}
          size="sm"
          variant={doc.status?.toLowerCase() === 'verified' ? 'success' : doc.status?.toLowerCase() === 'rejected' ? 'danger' : 'warning'}
          icon={getStatusIcon(doc.status)}
        />
      </div>

      {/* Actions Toolbar */}
      <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-edge-subtle">
        {doc.status?.toLowerCase() === 'pending' && canVerifyDocuments && (
          <div className="flex items-center gap-1 mr-auto">
            <button
              onClick={() => onUpdateStatus(doc.id, 'verified')}
              className="p-1.5 text-status-success hover:bg-status-success-bg rounded transition"
              title="Valider"
            >
              <CheckCircle size={16} />
            </button>
            <button
              onClick={() => onUpdateStatus(doc.id, 'rejected')}
              className="p-1.5 text-status-danger hover:bg-status-danger-bg rounded transition"
              title="Rejeter"
            >
              <XCircle size={16} />
            </button>
            <div className="w-px h-3 bg-surface-elevated mx-1"></div>
          </div>
        )}

        {showSkeleton ? (
          <Skeleton variant="rounded" width={64} height={24} />
        ) : resolvedUrl ? (
          <a
            href={resolvedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-status-info hover:text-status-info flex items-center gap-1 px-2 py-1 hover:bg-status-info-bg rounded transition"
          >
            <Eye size={14} /> Voir
          </a>
        ) : (
          <span className="text-xs text-content-muted">
            {isError ? 'Accès refusé' : 'Indisponible'}
          </span>
        )}

        {canDeleteDocuments && (
          <button
            onClick={() => onDelete(doc.id)}
            className="text-xs font-medium text-content-muted hover:text-status-danger flex items-center gap-1 px-2 py-1 hover:bg-surface-elevated rounded transition"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </Card>
  );
}

export default function ClientKYC({ clientId, onUpdate }: ClientKYCProps) {
  // RBAC permissions
  const { hasPermission, isAdmin } = usePermissions();
  const canAddDocuments = hasPermission('clients', 'edit') || hasPermission('kyc', 'create');
  const canVerifyDocuments = isAdmin || hasPermission('kyc', 'approve') || hasPermission('admin', 'manage');
  const canDeleteDocuments = hasPermission('clients', 'edit') || hasPermission('kyc', 'delete');

  const { uploadFile } = useEntityUpload({
    fileType: 'kyc',
    entityType: 'client',
    entityId: clientId,
    onError: (err: Error) => console.error("Upload error", err)
  });

  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newDoc, setNewDoc] = useState({
    type: 'ID_CARD_FRONT' as ClientDocument['documentType'],
    name: '',
    url: '',
    notes: ''
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [docToDelete, setDocToDelete] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(documents.length / DOCS_PER_PAGE));
  const paginatedDocuments = useMemo(() => {
    const start = (currentPage - 1) * DOCS_PER_PAGE;
    return documents.slice(start, start + DOCS_PER_PAGE);
  }, [documents, currentPage]);

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
        const photoUrlField = client.photoUrl;
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
                    clientId: clientId,
                    documentType: 'ID_CARD_FRONT' as const,
                    documentName: `Document ${index + 1}`,
                    documentUrl: item,
                    status: 'pending' as const,
                    createdAt: client.createdAt || new Date().toISOString()
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
                clientId: clientId,
                documentType: 'ID_CARD_FRONT' as const,
                documentName: 'Pièce d\'identité',
                documentUrl: photoUrlField,
                status: 'pending' as const,
                createdAt: client.createdAt || new Date().toISOString()
              }];
            }
          }
        }
      }

      // Filter out AVATAR documents - they don't need KYC validation
      clientDocs = clientDocs.filter((doc: any) => {
        const docType = doc.documentType;
        return docType !== 'AVATAR' && docType !== 'Avatar';
      });

      setDocuments(clientDocs.sort((a: ClientDocument, b: ClientDocument) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
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
      const res = await fetch(`/api/clients/${clientId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Erreur chargement client');
      const client = await res.json();

      const ownerId = client.userId || undefined;
      const newDocData: ClientDocument = {
        id: crypto.randomUUID(),
        clientId: clientId,
        documentType: newDoc.type,
        documentName: newDoc.name,
        documentUrl: newDoc.url,
        ownerId: ownerId,
        notes: newDoc.notes,
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      
      const updatedDocs = [newDocData, ...(client.documents || [])];
      
      const updateRes = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ documents: updatedDocs })
      });

      if (!updateRes.ok) throw new Error('Erreur ajout document');

      setDocuments(updatedDocs);
      setNewDoc({ type: 'ID_CARD_FRONT', name: '', url: '', notes: '' });
      setShowForm(false);
      setCurrentPage(1);
      onUpdate?.();
    } catch (error) {
      console.error('Erreur ajout document:', error);
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateStatus = async (docId: string, status: ClientDocument['status']) => {
    try {
      // Convert status to lowercase to match backend Zod schema
      const normalizedStatus = status.toLowerCase() as ClientDocument['status'];
      
      const updatedDocs = documents.map(doc =>
        doc.id === docId ? { 
          ...doc, 
          status: normalizedStatus, 
          verified_at: normalizedStatus === 'verified' ? new Date().toISOString() : undefined 
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
    const statusLower = status?.toLowerCase();
    switch (statusLower) {
      case 'verified': return <CheckCircle size={14} className="text-status-success" />;
      case 'rejected': return <XCircle size={14} className="text-status-danger" />;
      default: return <Clock size={14} className="text-accent" />;
    }
  };

  const kycStats = {
    total: documents.length,
    verified: documents.filter(d => d.status?.toLowerCase() === 'verified').length,
    pending: documents.filter(d => d.status?.toLowerCase() === 'pending').length,
    rejected: documents.filter(d => d.status?.toLowerCase() === 'rejected').length
  };

  const kycComplete = kycStats.total > 0 && kycStats.pending === 0 && kycStats.rejected === 0;

  return (
    <div className="space-y-4">
      {/* Header Mobile First */}
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-bold text-content-primary flex items-center gap-2">
            Dossier KYC
            {kycComplete && <Badge value="Complet" variant="success" size="sm" icon={<CheckCircle size={12}/>} />}
        </h3>
        {canAddDocuments && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-3 py-1.5 bg-accent-secondary hover:bg-accent-secondary-hover text-white rounded-lg transition flex items-center gap-1.5 text-sm shadow-lg shadow-accent/20"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Ajouter Document</span>
            <span className="sm:hidden">Ajouter</span>
          </button>
        )}
      </div>

      {/* Stats - Mobile Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card variant="default" padding="sm" className="bg-surface/50 border-edge-subtle">
          <p className="text-[10px] uppercase text-content-muted font-semibold mb-1">Total</p>
          <p className="text-xl font-bold text-content-primary">{kycStats.total}</p>
        </Card>
        <Card variant="default" padding="sm" className="bg-status-success-bg border-status-success/20">
          <p className="text-[10px] uppercase text-status-success/70 font-semibold mb-1">Vérifiés</p>
          <p className="text-xl font-bold text-status-success">{kycStats.verified}</p>
        </Card>
         <Card variant="default" padding="sm" className="bg-status-warning-bg border-status-warning/20">
          <p className="text-[10px] uppercase text-status-warning/70 font-semibold mb-1">En attente</p>
          <p className="text-xl font-bold text-status-warning">{kycStats.pending}</p>
        </Card>
         <Card variant="default" padding="sm" className="bg-status-danger-bg border-status-danger/20">
          <p className="text-[10px] uppercase text-status-danger/70 font-semibold mb-1">Rejetés</p>
          <p className="text-xl font-bold text-status-danger">{kycStats.rejected}</p>
        </Card>
      </div>

      {/* Formulaire Inline (Collapsible) */}
      {showForm && (
        <Card variant="elevated" className="border-accent/30 animate-in slide-in-from-top-2">
            <Card.Header className="flex items-center justify-between text-base">
                <span>Nouveau Document</span>
                <button onClick={() => setShowForm(false)}><XCircle size={18} className="text-content-muted hover:text-content-primary" /></button>
            </Card.Header>
            <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div>
                <label className="block text-xs font-semibold text-content-muted mb-1.5 uppercase">Type</label>
                <select
                value={newDoc.type}
                onChange={(e) => setNewDoc(prev => ({ ...prev, type: e.target.value as ClientDocument['documentType'] }))}
                className="w-full bg-surface-base border border-edge rounded-lg px-3 py-2 text-content-primary text-sm focus:ring-1 focus:ring-accent outline-none"
                >
                <option value="ID_CARD_FRONT">Carte d'identité</option>
                <option value="PASSPORT">Passeport</option>
                <option value="DRIVING_LICENSE">Permis de conduire</option>
                <option value="RESIDENT_CARD">Carte de résident</option>
                <option value="PROOF_OF_ADDRESS">Justificatif de domicile</option>
                <option value="CONTRACT">Contrat de travail</option>
                <option value="OTHER">Autre</option>
                </select>
            </div>

            <div>
                <label className="block text-xs font-semibold text-content-muted mb-1.5 uppercase">Nom du fichier</label>
                <input
                type="text"
                value={newDoc.name}
                onChange={(e) => setNewDoc(prev => ({ ...prev, name: e.target.value }))}
                className="w-full bg-surface-base border border-edge rounded-lg px-3 py-2 text-content-primary text-sm focus:ring-1 focus:ring-accent outline-none"
                placeholder="Ex: CNI_Jean_Dupont.pdf"
                />
            </div>

            <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-content-muted mb-1.5 uppercase">Document</label>
                <FileUploadZone
                  accept=".pdf,.jpg,.jpeg,.png"
                  maxSize={5}
                  maxFiles={1}
                  label="Glissez votre document ici"
                  hint="ou cliquez pour parcourir (PDF, JPG, PNG - max 5MB)"
                  uploadFunction={async (file) => {
                    const url = await uploadFile(file);
                    if (!url) {
                      throw new Error('Upload failed');
                    }
                    setNewDoc(prev => ({
                      ...prev,
                      url,
                      name: prev.name || file.name
                    }));
                    return url;
                  }}
                />
                {newDoc.url && (
                  <p className="text-xs text-status-success mt-2 flex items-center gap-1">
                    <CheckCircle size={12} /> Document chargé
                  </p>
                )}
            </div>
            </div>

            <div className="flex justify-end gap-2">
                 <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-surface hover:bg-surface-elevated text-content-secondary rounded-lg transition text-sm font-medium"
                >
                Annuler
                </button>
                <button
                onClick={handleAddDocument}
                disabled={uploading || !newDoc.name || !newDoc.url}
                className="px-4 py-2 bg-accent-secondary hover:bg-accent-secondary-hover disabled:opacity-50 text-content-inverted rounded-lg transition flex items-center gap-2 text-sm font-bold"
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
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
          </div>
        ) : documents.length === 0 ? (
          <Card variant="default" padding="lg" className="border-dashed border-edge bg-transparent text-center">
             <div className="bg-surface/50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                 <FileText className="text-content-muted" size={24} />
            </div>
            <p className="text-content-muted text-sm">Aucun document dans le dossier</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {paginatedDocuments.map((doc) => (
              <KycDocumentCard
                key={doc.id}
                doc={doc}
                canVerifyDocuments={canVerifyDocuments}
                canDeleteDocuments={canDeleteDocuments}
                onUpdateStatus={handleUpdateStatus}
                onDelete={handleDeleteDocument}
                getStatusIcon={getStatusIcon}
              />
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-content-muted">
                  {(currentPage - 1) * DOCS_PER_PAGE + 1}-{Math.min(currentPage * DOCS_PER_PAGE, documents.length)} sur {documents.length}
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
