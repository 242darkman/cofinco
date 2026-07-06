import React, { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileText, Upload, Download, Trash2, CheckCircle, XCircle, Clock,
  Calendar, AlertTriangle, Eye, X, Plus, Shield, File, Image, FileArchive
} from 'lucide-react';
import { Button, Badge, FormField, SelectField, Modal } from '../ui';
import { hrApi, EmployeeDocument } from '../../lib/api-client';
import { toast } from '../../lib/toast';
import { usePermissions } from '../auth/ProtectedFeature';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

interface EmployeeDocumentsPanelProps {
  employeId: string;
  employeNom?: string;
  readOnly?: boolean;
}

const DOCUMENT_TYPES = [
  { value: 'CONTRACT', label: 'Contrat de travail' },
  { value: 'ID_CARD', label: 'Carte d\'identité' },
  { value: 'DIPLOMA', label: 'Diplome' },
  { value: 'CERTIFICATE', label: 'Certificat' },
  { value: 'MEDICAL', label: 'Certificat médical' },
  { value: 'OTHER', label: 'Autre' },
];

const DOCUMENT_CATEGORIES = [
  { value: 'ADMINISTRATIF', label: 'Administratif' },
  { value: 'FORMATION', label: 'Formation' },
  { value: 'MEDICAL', label: 'Médical' },
  { value: 'JURIDIQUE', label: 'Juridique' },
  { value: 'GENERAL', label: 'Général' },
];

const STATUS_CONFIG: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  PENDING: { color: 'warning', icon: Clock, label: 'En attente' },
  VERIFIED: { color: 'success', icon: CheckCircle, label: 'Vérifié' },
  REJECTED: { color: 'danger', icon: XCircle, label: 'Rejeté' },
  EXPIRED: { color: 'neutral', icon: AlertTriangle, label: 'Expiré' },
};

const FILE_ICONS: Record<string, React.ElementType> = {
  'application/pdf': FileText,
  'image/jpeg': Image,
  'image/png': Image,
  'image/gif': Image,
  'application/zip': FileArchive,
  default: File,
};

export default function EmployeeDocumentsPanel({
  employeId,
  employeNom,
  readOnly = false,
}: EmployeeDocumentsPanelProps) {
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('rh', 'manage') || hasPermission('documents', 'manage');
  const canVerify = hasPermission('rh', 'manage');

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState<EmployeeDocument | null>(null);
  const [uploading, setUploading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Upload form state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadForm, setUploadForm] = useState({
    nom: '',
    typeDocument: 'OTHER',
    categorie: 'GENERAL',
    description: '',
    dateEmission: '',
    dateExpiration: '',
  });

  // Verify form state
  const [verifyDecision, setVerifyDecision] = useState<'VERIFIED' | 'REJECTED'>('VERIFIED');
  const [rejectReason, setRejectReason] = useState('');

  // Fetch documents
  const { data: documents = [], isLoading, refetch } = useQuery({
    queryKey: ['employee-documents', employeId],
    queryFn: () => hrApi.getEmployeeDocuments(employeId),
    enabled: !!employeId,
  });

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
      if (!uploadForm.nom) {
        setUploadForm(prev => ({ ...prev, nom: file.name.replace(/\.[^/.]+$/, '') }));
      }
    }
  }, [uploadForm.nom]);

  const handleUpload = useCallback(async () => {
    if (!uploadFile || !uploadForm.nom || !uploadForm.typeDocument) {
      toast.warning('Fichier et nom requis');
      return;
    }

    setUploading(true);
    try {
      await hrApi.uploadEmployeeDocument(employeId, uploadFile, {
        nom: uploadForm.nom,
        typeDocument: uploadForm.typeDocument,
        categorie: uploadForm.categorie || undefined,
        description: uploadForm.description || undefined,
        dateEmission: uploadForm.dateEmission || undefined,
        dateExpiration: uploadForm.dateExpiration || undefined,
      });
      toast.success('Document ajouté');
      setShowUploadModal(false);
      setUploadFile(null);
      setUploadForm({
        nom: '',
        typeDocument: 'OTHER',
        categorie: 'GENERAL',
        description: '',
        dateEmission: '',
        dateExpiration: '',
      });
      refetch();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de l\'upload');
    } finally {
      setUploading(false);
    }
  }, [employeId, uploadFile, uploadForm, refetch]);

  const handleVerify = useCallback(async () => {
    if (!showVerifyModal) return;
    if (verifyDecision === 'REJECTED' && !rejectReason.trim()) {
      toast.warning('Motif de rejet requis');
      return;
    }

    setVerifying(true);
    try {
      await hrApi.verifyEmployeeDocument(
        showVerifyModal.id,
        verifyDecision,
        verifyDecision === 'REJECTED' ? rejectReason : undefined
      );
      toast.success(verifyDecision === 'VERIFIED' ? 'Document vérifié' : 'Document rejeté');
      setShowVerifyModal(null);
      setVerifyDecision('VERIFIED');
      setRejectReason('');
      refetch();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la vérification');
    } finally {
      setVerifying(false);
    }
  }, [showVerifyModal, verifyDecision, rejectReason, refetch]);

  const handleDelete = useCallback(async (docId: string) => {
    if (!confirm('Supprimer ce document ?')) return;
    try {
      await hrApi.deleteEmployeeDocument(docId);
      toast.success('Document supprimé');
      refetch();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la suppression');
    }
  }, [refetch]);

  const getFileIcon = (mimeType?: string) => {
    return FILE_ICONS[mimeType || ''] || FILE_ICONS.default;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isExpiringSoon = (dateExpiration?: string) => {
    if (!dateExpiration) return false;
    const expiry = new Date(dateExpiration);
    const now = new Date();
    const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry > 0 && daysUntilExpiry <= 30;
  };

  const isExpired = (dateExpiration?: string) => {
    if (!dateExpiration) return false;
    return new Date(dateExpiration) < new Date();
  };

  // Group documents by category
  const groupedDocs = documents.reduce((acc, doc) => {
    const cat = doc.categorie || 'GENERAL';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(doc);
    return acc;
  }, {} as Record<string, EmployeeDocument[]>);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-content-primary flex items-center gap-2">
            <FileText size={16} className="text-status-info" />
            Documents {employeNom && `- ${employeNom}`}
          </h3>
          <p className="text-xs text-content-muted">{documents.length} document(s)</p>
        </div>
        {!readOnly && canManage && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowUploadModal(true)}
          >
            <Upload size={14} className="mr-1" />
            Ajouter
          </Button>
        )}
      </div>

      {/* Documents list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-status-info border-t-transparent rounded-full animate-spin" />
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-8 bg-surface-base/50 rounded-lg border border-edge">
          <FileText size={32} className="mx-auto text-content-muted mb-2" />
          <p className="text-sm text-content-muted">Aucun document</p>
          {!readOnly && canManage && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowUploadModal(true)}
              className="mt-2"
            >
              <Plus size={14} className="mr-1" />
              Ajouter un document
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedDocs).map(([category, docs]) => (
            <div key={category} className="bg-surface-base/50 rounded-lg border border-edge overflow-hidden">
              <div className="px-3 py-2 bg-surface/50 border-b border-edge">
                <h4 className="text-xs font-semibold text-content-muted uppercase">
                  {DOCUMENT_CATEGORIES.find(c => c.value === category)?.label || category}
                </h4>
              </div>
              <div className="divide-y divide-edge">
                {docs.map((doc) => {
                  const status = STATUS_CONFIG[doc.statut] || STATUS_CONFIG.PENDING;
                  const StatusIcon = status.icon;
                  const FileIcon = getFileIcon(doc.mimeType);
                  const expired = isExpired(doc.dateExpiration);
                  const expiringSoon = isExpiringSoon(doc.dateExpiration);

                  return (
                    <div
                      key={doc.id}
                      className={`p-3 hover:bg-surface/30 transition ${
                        expired ? 'bg-status-danger/5' : expiringSoon ? 'bg-status-warning/5' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${
                          doc.statut === 'VERIFIED' ? 'bg-status-success-bg' :
                          doc.statut === 'REJECTED' ? 'bg-status-danger-bg' :
                          'bg-surface'
                        }`}>
                          <FileIcon size={20} className={
                            doc.statut === 'VERIFIED' ? 'text-status-success' :
                            doc.statut === 'REJECTED' ? 'text-status-danger' :
                            'text-content-muted'
                          } />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-content-primary truncate">{doc.nom}</span>
                            <Badge
                              variant={status.color as any}
                              value={status.label}
                              size="xs"
                            />
                            {expired && (
                              <Badge variant="danger" value="Expiré" size="xs" />
                            )}
                            {expiringSoon && !expired && (
                              <Badge variant="warning" value="Expire bientot" size="xs" />
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-[10px] text-content-muted">
                            <span className="flex items-center gap-1">
                              <FileText size={10} />
                              {DOCUMENT_TYPES.find(t => t.value === doc.typeDocument)?.label || doc.typeDocument}
                            </span>
                            <span>{formatFileSize(doc.fileSize)}</span>
                            {doc.dateExpiration && (
                              <span className={`flex items-center gap-1 ${expired ? 'text-status-danger' : expiringSoon ? 'text-status-warning' : ''}`}>
                                <Calendar size={10} />
                                Expire: {new Date(doc.dateExpiration).toLocaleDateString('fr-FR')}
                              </span>
                            )}
                            <span>
                              {formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true, locale: fr })}
                            </span>
                          </div>

                          {doc.description && (
                            <p className="text-xs text-content-muted mt-1 line-clamp-1">{doc.description}</p>
                          )}

                          {doc.motifRejet && (
                            <p className="text-xs text-status-danger mt-1 flex items-center gap-1">
                              <XCircle size={10} />
                              {doc.motifRejet}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          {doc.url && (
                            <a
                              href={doc.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 text-content-muted hover:text-content-primary hover:bg-surface-elevated rounded transition"
                              title="Voir"
                            >
                              <Eye size={14} />
                            </a>
                          )}
                          {doc.url && (
                            <a
                              href={doc.url}
                              download={doc.fileName}
                              className="p-1.5 text-content-muted hover:text-content-primary hover:bg-surface-elevated rounded transition"
                              title="Télécharger"
                            >
                              <Download size={14} />
                            </a>
                          )}
                          {!readOnly && canVerify && doc.statut === 'PENDING' && (
                            <button
                              onClick={() => setShowVerifyModal(doc)}
                              className="p-1.5 text-status-info hover:bg-status-info-bg rounded transition"
                              title="Vérifier"
                            >
                              <Shield size={14} />
                            </button>
                          )}
                          {!readOnly && canManage && (
                            <button
                              onClick={() => handleDelete(doc.id)}
                              className="p-1.5 text-status-danger hover:bg-status-danger-bg rounded transition"
                              title="Supprimer"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      <Modal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        title="Ajouter un document"
        size="md"
      >
        <div className="space-y-4">
          {/* File input */}
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-2">Fichier</label>
            <div className={`border-2 border-dashed rounded-lg p-4 text-center transition ${
              uploadFile ? 'border-status-success/50 bg-status-success/5' : 'border-edge hover:border-edge-strong'
            }`}>
              <input
                type="file"
                onChange={handleFileSelect}
                className="hidden"
                id="doc-upload"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              />
              <label htmlFor="doc-upload" className="cursor-pointer">
                {uploadFile ? (
                  <div className="flex items-center justify-center gap-2 text-status-success">
                    <CheckCircle size={20} />
                    <span className="text-sm">{uploadFile.name}</span>
                  </div>
                ) : (
                  <div className="text-content-muted">
                    <Upload size={24} className="mx-auto mb-2" />
                    <p className="text-sm">Cliquez pour sélectionner un fichier</p>
                    <p className="text-xs text-content-muted mt-1">PDF, Images, Documents Word</p>
                  </div>
                )}
              </label>
            </div>
          </div>

          <FormField
            label="Nom du document"
            name="nom"
            value={uploadForm.nom}
            onChange={(e) => setUploadForm(prev => ({ ...prev, nom: e.target.value }))}
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <SelectField
              label="Type"
              name="typeDocument"
              value={uploadForm.typeDocument}
              onChange={(e) => setUploadForm(prev => ({ ...prev, typeDocument: e.target.value }))}
              options={DOCUMENT_TYPES}
              required
            />
            <SelectField
              label="Catégorie"
              name="categorie"
              value={uploadForm.categorie}
              onChange={(e) => setUploadForm(prev => ({ ...prev, categorie: e.target.value }))}
              options={DOCUMENT_CATEGORIES}
            />
          </div>

          <FormField
            label="Description"
            name="description"
            type="textarea"
            value={uploadForm.description}
            onChange={(e) => setUploadForm(prev => ({ ...prev, description: e.target.value }))}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Date d'émission"
              name="dateEmission"
              type="date"
              value={uploadForm.dateEmission}
              onChange={(e) => setUploadForm(prev => ({ ...prev, dateEmission: e.target.value }))}
            />
            <FormField
              label="Date d'expiration"
              name="dateExpiration"
              type="date"
              value={uploadForm.dateExpiration}
              onChange={(e) => setUploadForm(prev => ({ ...prev, dateExpiration: e.target.value }))}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-edge">
            <Button variant="secondary" onClick={() => setShowUploadModal(false)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={handleUpload}
              disabled={uploading || !uploadFile}
            >
              {uploading ? 'Upload...' : 'Ajouter'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Verify Modal */}
      <Modal
        isOpen={!!showVerifyModal}
        onClose={() => setShowVerifyModal(null)}
        title="Vérifier le document"
        size="sm"
      >
        {showVerifyModal && (
          <div className="space-y-4">
            <div className="bg-surface/50 rounded-lg p-3">
              <p className="text-sm text-content-primary font-medium">{showVerifyModal.nom}</p>
              <p className="text-xs text-content-muted">{showVerifyModal.fileName}</p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-content-secondary">Décision</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setVerifyDecision('VERIFIED')}
                  className={`flex-1 p-3 rounded-lg border transition flex items-center justify-center gap-2 ${
                    verifyDecision === 'VERIFIED'
                      ? 'bg-status-success-bg border-status-success text-status-success'
                      : 'bg-surface border-edge text-content-muted hover:border-edge-strong'
                  }`}
                >
                  <CheckCircle size={16} />
                  <span className="text-sm font-medium">Valider</span>
                </button>
                <button
                  onClick={() => setVerifyDecision('REJECTED')}
                  className={`flex-1 p-3 rounded-lg border transition flex items-center justify-center gap-2 ${
                    verifyDecision === 'REJECTED'
                      ? 'bg-status-danger-bg border-status-danger text-status-danger'
                      : 'bg-surface border-edge text-content-muted hover:border-edge-strong'
                  }`}
                >
                  <XCircle size={16} />
                  <span className="text-sm font-medium">Rejeter</span>
                </button>
              </div>
            </div>

            {verifyDecision === 'REJECTED' && (
              <FormField
                label="Motif de rejet"
                name="rejectReason"
                type="textarea"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                required
              />
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-edge">
              <Button variant="secondary" onClick={() => setShowVerifyModal(null)}>
                Annuler
              </Button>
              <Button
                variant={verifyDecision === 'VERIFIED' ? 'success' : 'danger'}
                onClick={handleVerify}
                disabled={verifying}
              >
                {verifying ? 'En cours...' : verifyDecision === 'VERIFIED' ? 'Valider' : 'Rejeter'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
