import React, { useState, useCallback } from 'react';
import { useDocumentRequests, DocumentRequest } from '../../hooks/hr/useDocumentRequests';
import { Card, Button, Badge, Modal, SelectField, FormField } from '../ui';
import { Plus, FileText, Clock, CheckCircle, XCircle, Download, AlertTriangle } from 'lucide-react';
import { usePermissions } from '../auth/ProtectedFeature';
import { toast } from '../../lib/toast';

const TYPE_LABELS: Record<string, string> = {
  ATTESTATION_TRAVAIL: 'Attestation de travail',
  ATTESTATION_SALAIRE: 'Attestation de salaire',
  CERTIFICAT_TRAVAIL: 'Certificat de travail',
  ATTESTATION_CONGE: "Attestation de conge",
  AUTRE: 'Autre document',
};

const TYPE_OPTIONS = Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }));

const STATUS_CONFIG: Record<string, { variant: 'warning' | 'info' | 'success' | 'danger'; label: string }> = {
  PENDING: { variant: 'warning', label: 'En attente' },
  IN_PROGRESS: { variant: 'info', label: 'En cours' },
  COMPLETED: { variant: 'success', label: 'Termine' },
  REJECTED: { variant: 'danger', label: 'Rejete' },
};

const PROCESS_STATUS_OPTIONS = [
  { value: 'IN_PROGRESS', label: 'En cours de traitement' },
  { value: 'COMPLETED', label: 'Termine' },
  { value: 'REJECTED', label: 'Rejete' },
];

export default function MesDocumentsTab() {
  const { isAdmin, hasPermission } = usePermissions();
  const isRH = isAdmin || hasPermission('rh', 'edit');

  // Employee: own requests / RH: all requests
  const { requests, isLoading, createRequest, isCreating, processRequest, isProcessing } = useDocumentRequests(!isRH);

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formType, setFormType] = useState('');
  const [formMotif, setFormMotif] = useState('');
  const [formDetails, setFormDetails] = useState('');
  const [formUrgence, setFormUrgence] = useState(false);

  // Process modal state (RH)
  const [processModal, setProcessModal] = useState<DocumentRequest | null>(null);
  const [processStatut, setProcessStatut] = useState('');
  const [processComment, setProcessComment] = useState('');
  const [processRejectMotif, setProcessRejectMotif] = useState('');

  const resetCreateForm = useCallback(() => {
    setFormType('');
    setFormMotif('');
    setFormDetails('');
    setFormUrgence(false);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!formType) {
      toast.warning('Veuillez selectionner le type de document');
      return;
    }
    try {
      await createRequest({
        type: formType,
        ...(formMotif ? { motif: formMotif } : {}),
        ...(formDetails ? { details: formDetails } : {}),
        urgence: formUrgence,
      });
      setShowCreateModal(false);
      resetCreateForm();
    } catch {
      /* handled in hook */
    }
  }, [formType, formMotif, formDetails, formUrgence, createRequest, resetCreateForm]);

  const handleProcess = useCallback(async () => {
    if (!processModal || !processStatut) {
      toast.warning('Veuillez selectionner un statut');
      return;
    }
    if (processStatut === 'REJECTED' && !processRejectMotif.trim()) {
      toast.warning('Le motif de rejet est obligatoire');
      return;
    }
    try {
      await processRequest({
        id: processModal.id,
        statut: processStatut,
        ...(processComment ? { commentaireRh: processComment } : {}),
        ...(processStatut === 'REJECTED' ? { motifRejet: processRejectMotif } : {}),
      });
      setProcessModal(null);
      setProcessStatut('');
      setProcessComment('');
      setProcessRejectMotif('');
    } catch {
      /* handled in hook */
    }
  }, [processModal, processStatut, processComment, processRejectMotif, processRequest]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-content-primary">
            {isRH ? 'Demandes de documents' : 'Mes demandes de documents'}
          </h2>
          <p className="text-sm text-content-muted mt-1">
            {isRH
              ? `${requests.length} demande(s) au total`
              : 'Demandez vos attestations et certificats'}
          </p>
        </div>
        {!isRH && (
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => setShowCreateModal(true)}
          >
            Demander un document
          </Button>
        )}
      </div>

      {/* Request List */}
      {requests.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="h-12 w-12 text-content-muted mb-4" />
            <p className="text-content-secondary font-medium">Aucune demande</p>
            <p className="text-sm text-content-muted mt-1">
              {isRH
                ? "Aucune demande de document n'a ete soumise"
                : 'Cliquez sur "Demander un document" pour commencer'}
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const statusConf = STATUS_CONFIG[req.statut] || STATUS_CONFIG.PENDING;
            return (
              <Card key={req.id} padding="sm">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
                  {/* Icon */}
                  <div className="hidden sm:flex shrink-0 items-center justify-center w-10 h-10 rounded-lg bg-accent/10">
                    <FileText className="h-5 w-5 text-accent" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-content-primary text-sm">
                        {TYPE_LABELS[req.type] || req.type}
                      </span>
                      {req.urgence && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-status-danger-bg text-status-danger border border-status-danger/30">
                          <AlertTriangle className="h-3 w-3" />
                          Urgent
                        </span>
                      )}
                      <Badge value={statusConf.label} variant={statusConf.variant} size="sm" />
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-content-muted">
                      {isRH && (
                        <span className="font-medium text-content-secondary">{req.employeNom}</span>
                      )}
                      <span>{formatDate(req.createdAt)}</span>
                      {req.motif && (
                        <span className="truncate max-w-[200px]">{req.motif}</span>
                      )}
                    </div>
                    {/* Status-specific info */}
                    {req.statut === 'REJECTED' && req.motifRejet && (
                      <p className="mt-1 text-xs text-status-danger">
                        Motif: {req.motifRejet}
                      </p>
                    )}
                    {req.commentaireRh && (
                      <p className="mt-1 text-xs text-content-muted italic">
                        RH: {req.commentaireRh}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {req.statut === 'COMPLETED' && req.documentUrl && (
                      <Button
                        variant="success"
                        size="xs"
                        icon={Download}
                        onClick={() => {
                          window.open(`/api/hr/document-requests/${req.id}/download`, '_blank');
                          // Mark as read (fire-and-forget)
                          fetch(`/api/hr/document-requests/${req.id}/mark-read`, { method: 'POST', credentials: 'include' }).catch(() => {});
                        }}
                      >
                        <span className="hidden sm:inline">Telecharger</span>
                      </Button>
                    )}
                    {isRH && req.statut !== 'COMPLETED' && req.statut !== 'REJECTED' && (
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          setProcessModal(req);
                          setProcessStatut('');
                          setProcessComment('');
                          setProcessRejectMotif('');
                        }}
                      >
                        Traiter
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Request Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          resetCreateForm();
        }}
        title="Demander un document"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowCreateModal(false); resetCreateForm(); }}>
              Annuler
            </Button>
            <Button variant="primary" onClick={handleCreate} isLoading={isCreating}>
              Envoyer la demande
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <SelectField
            label="Type de document"
            name="type"
            value={formType}
            onChange={(e) => setFormType(e.target.value)}
            options={TYPE_OPTIONS}
            required
          />

          <FormField
            label="Motif"
            name="motif"
            value={formMotif}
            onChange={(e) => setFormMotif(e.target.value)}
            placeholder="Motif de la demande (optionnel)"
          />

          <div>
            <label className="block text-xs sm:text-sm font-semibold text-content-secondary mb-2">
              Details complementaires
            </label>
            <textarea
              value={formDetails}
              onChange={(e) => setFormDetails(e.target.value)}
              placeholder="Informations supplementaires..."
              rows={3}
              className="w-full px-4 py-2 bg-input-bg border border-input-border rounded-lg text-input-text text-sm placeholder:text-input-placeholder focus:outline-none focus:ring-2 focus:border-input-focus focus:ring-input-focus/30 transition-colors duration-200"
            />
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formUrgence}
              onChange={(e) => setFormUrgence(e.target.checked)}
              className="rounded border-input-border text-accent focus:ring-accent/30 h-4 w-4"
            />
            <div>
              <span className="text-sm font-medium text-content-primary">Demande urgente</span>
              <p className="text-xs text-content-muted">Cochez si vous avez besoin du document rapidement</p>
            </div>
          </label>
        </div>
      </Modal>

      {/* Process Request Modal (RH) */}
      {processModal && (
        <Modal
          isOpen={!!processModal}
          onClose={() => setProcessModal(null)}
          title="Traiter la demande"
          subtitle={`${processModal.employeNom} - ${TYPE_LABELS[processModal.type] || processModal.type}`}
          size="md"
          footer={
            <>
              <Button variant="secondary" onClick={() => setProcessModal(null)}>
                Annuler
              </Button>
              <Button variant="primary" onClick={handleProcess} isLoading={isProcessing}>
                Valider
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            {processModal.motif && (
              <div className="p-3 rounded-lg bg-surface-subtle border border-edge">
                <p className="text-xs font-semibold text-content-muted mb-1">Motif de la demande</p>
                <p className="text-sm text-content-primary">{processModal.motif}</p>
              </div>
            )}

            {processModal.details && (
              <div className="p-3 rounded-lg bg-surface-subtle border border-edge">
                <p className="text-xs font-semibold text-content-muted mb-1">Details</p>
                <p className="text-sm text-content-primary">{processModal.details}</p>
              </div>
            )}

            <SelectField
              label="Decision"
              name="processStatut"
              value={processStatut}
              onChange={(e) => setProcessStatut(e.target.value)}
              options={PROCESS_STATUS_OPTIONS}
              required
            />

            <FormField
              label="Commentaire RH"
              name="commentaireRh"
              value={processComment}
              onChange={(e) => setProcessComment(e.target.value)}
              placeholder="Commentaire visible par l'employe (optionnel)"
            />

            {processStatut === 'REJECTED' && (
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-content-secondary mb-2">
                  Motif de rejet <span className="text-status-danger">*</span>
                </label>
                <textarea
                  value={processRejectMotif}
                  onChange={(e) => setProcessRejectMotif(e.target.value)}
                  placeholder="Expliquez pourquoi la demande est rejetee..."
                  rows={3}
                  className="w-full px-4 py-2 bg-input-bg border border-input-border rounded-lg text-input-text text-sm placeholder:text-input-placeholder focus:outline-none focus:ring-2 focus:border-input-focus focus:ring-input-focus/30 transition-colors duration-200"
                />
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
