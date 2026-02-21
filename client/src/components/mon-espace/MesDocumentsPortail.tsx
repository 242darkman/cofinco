import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Badge, Modal, SelectField } from '../ui';
import { FileText, Plus, Download } from 'lucide-react';
import { toast } from '../../lib/toast';

interface DocumentRequest {
  id: number;
  type: string;
  motif?: string;
  statut: string;
  documentUrl?: string;
  createdAt: string;
}

const TYPE_OPTIONS = [
  { value: 'ATTESTATION_TRAVAIL', label: 'Attestation de travail' },
  { value: 'CERTIFICAT_TRAVAIL', label: 'Certificat de travail' },
  { value: 'BULLETIN_DUPLICATE', label: 'Duplicata de bulletin' },
  { value: 'ATTESTATION_SALAIRE', label: 'Attestation de salaire' },
  { value: 'RELEVE_CARRIERE', label: 'Releve de carriere' },
];

const TYPE_LABELS: Record<string, string> = {
  ATTESTATION_TRAVAIL: 'Attestation de travail',
  CERTIFICAT_TRAVAIL: 'Certificat de travail',
  BULLETIN_DUPLICATE: 'Duplicata de bulletin',
  ATTESTATION_SALAIRE: 'Attestation de salaire',
  RELEVE_CARRIERE: 'Releve de carriere',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function MesDocumentsPortail() {
  const queryClient = useQueryClient();

  const { data: docs = [], isLoading } = useQuery<DocumentRequest[]>({
    queryKey: ['/api/hr/document-requests/my'],
    queryFn: () =>
      fetch('/api/hr/document-requests?mine=true', { credentials: 'include' }).then((r) =>
        r.json()
      ),
  });

  const createMutation = useMutation({
    mutationFn: (data: { type: string; motif?: string }) =>
      fetch('/api/hr/document-requests', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((r) => {
        if (!r.ok) throw new Error('Erreur lors de la creation');
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hr/document-requests/my'] });
      toast.success('Demande envoyee avec succes');
      setShowModal(false);
      resetForm();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const [showModal, setShowModal] = useState(false);
  const [formType, setFormType] = useState('');
  const [formMotif, setFormMotif] = useState('');

  const resetForm = useCallback(() => {
    setFormType('');
    setFormMotif('');
  }, []);

  const handleSubmit = useCallback(() => {
    if (!formType) {
      toast.warning('Veuillez selectionner un type de document');
      return;
    }
    createMutation.mutate({
      type: formType,
      motif: formMotif || undefined,
    });
  }, [formType, formMotif, createMutation]);

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
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-bold text-content-primary">Mes demandes de documents</h3>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => setShowModal(true)}>
          Nouvelle demande
        </Button>
      </div>

      {/* List */}
      {docs.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="h-12 w-12 text-content-muted mb-4" />
            <p className="text-content-secondary font-medium">Aucune demande</p>
            <p className="text-sm text-content-muted mt-1">
              Demandez vos attestations et certificats ici
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {docs.map((doc) => (
            <Card key={doc.id} padding="sm">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="hidden sm:flex shrink-0 items-center justify-center w-10 h-10 rounded-lg bg-accent/10">
                    <FileText className="h-5 w-5 text-accent" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-content-primary text-sm">
                        {TYPE_LABELS[doc.type] || doc.type}
                      </span>
                      <Badge value={doc.statut} size="sm" />
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-content-muted">
                      <span>{formatDate(doc.createdAt)}</span>
                      {doc.motif && (
                        <span className="truncate max-w-[200px]">{doc.motif}</span>
                      )}
                    </div>
                  </div>
                </div>
                {doc.documentUrl && (
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={Download}
                    onClick={() =>
                      window.open(`/api/hr/document-requests/${doc.id}/download`, '_blank')
                    }
                  >
                    <span className="hidden sm:inline">Telecharger</span>
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create document request modal */}
      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          resetForm();
        }}
        title="Nouvelle demande de document"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowModal(false); resetForm(); }}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              isLoading={createMutation.isPending}
            >
              Envoyer la demande
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <SelectField
            label="Type de document"
            name="typeDocument"
            value={formType}
            onChange={(e) => setFormType(e.target.value)}
            options={TYPE_OPTIONS}
            required
          />
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-content-secondary mb-2">
              Motif
            </label>
            <textarea
              value={formMotif}
              onChange={(e) => setFormMotif(e.target.value)}
              placeholder="Precisez le motif de votre demande (optionnel)"
              rows={3}
              className="w-full px-4 py-2 bg-input-bg border border-input-border rounded-lg text-input-text text-sm placeholder:text-input-placeholder focus:outline-none focus:ring-2 focus:border-input-focus focus:ring-input-focus/30 transition-colors duration-200"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
