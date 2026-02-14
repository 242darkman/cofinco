import React, { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Award, Plus, Download, Trash2, CheckCircle, XCircle, Calendar,
  User, AlertTriangle, FileText, X, Loader2, Users
} from 'lucide-react';
import { Button, Badge, FormField, Modal } from '../ui';
import { hrApi, FormationCertificate } from '../../lib/api-client';
import { toast } from '../../lib/toast';
import { usePermissions } from '../auth/ProtectedFeature';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

interface FormationCertificatesPanelProps {
  formationId: number;
  formationTitre: string;
  formationStatut: string;
  participants: Array<{
    employeId: string;
    employeNom: string;
    presence?: string;
    scoreEvaluation?: number;
  }>;
  onRefresh?: () => void;
}

const STATUS_CONFIG: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  ISSUED: { color: 'success', icon: CheckCircle, label: 'Valide' },
  REVOKED: { color: 'danger', icon: XCircle, label: 'Revoque' },
  EXPIRED: { color: 'neutral', icon: AlertTriangle, label: 'Expire' },
};

export default function FormationCertificatesPanel({
  formationId,
  formationTitre,
  formationStatut,
  participants,
  onRefresh,
}: FormationCertificatesPanelProps) {
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('rh', 'manage') || hasPermission('formations', 'manage');

  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showRevokeModal, setShowRevokeModal] = useState<FormationCertificate | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [revoking, setRevoking] = useState(false);

  // Issue form state
  const [selectedParticipant, setSelectedParticipant] = useState('');
  const [issueForm, setIssueForm] = useState({
    competences: '',
    dateExpiration: '',
  });

  // Batch issue form
  const [batchForm, setBatchForm] = useState({
    competences: '',
    dateExpiration: '',
  });

  // Revoke form
  const [revokeReason, setRevokeReason] = useState('');

  // Fetch certificates
  const { data: certificates = [], isLoading, refetch } = useQuery({
    queryKey: ['formation-certificates', formationId],
    queryFn: () => hrApi.getFormationCertificates(formationId),
    enabled: !!formationId,
  });

  // Get participants without certificates
  const eligibleParticipants = participants.filter(p => {
    const hasCert = certificates.some(c => c.employeId === p.employeId);
    return !hasCert && (p.presence === 'Present' || p.presence === 'Présent');
  });

  const handleIssueCertificate = useCallback(async () => {
    if (!selectedParticipant) {
      toast.warning('Selectionnez un participant');
      return;
    }

    const participant = participants.find(p => p.employeId === selectedParticipant);
    if (!participant) return;

    setIssuing(true);
    try {
      await hrApi.issueCertificate(formationId, {
        employeId: participant.employeId,
        employeNom: participant.employeNom,
        competences: issueForm.competences || undefined,
        dateExpiration: issueForm.dateExpiration || undefined,
      });
      toast.success('Certificat emis');
      setShowIssueModal(false);
      setSelectedParticipant('');
      setIssueForm({ competences: '', dateExpiration: '' });
      refetch();
      onRefresh?.();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de l\'emission');
    } finally {
      setIssuing(false);
    }
  }, [formationId, selectedParticipant, participants, issueForm, refetch, onRefresh]);

  const handleBatchIssue = useCallback(async () => {
    setIssuing(true);
    try {
      const result = await hrApi.issueBatchCertificates(formationId, {
        competences: batchForm.competences || undefined,
        dateExpiration: batchForm.dateExpiration || undefined,
      });
      toast.success(`${result.issued} certificat(s) emis`);
      setShowBatchModal(false);
      setBatchForm({ competences: '', dateExpiration: '' });
      refetch();
      onRefresh?.();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de l\'emission batch');
    } finally {
      setIssuing(false);
    }
  }, [formationId, batchForm, refetch, onRefresh]);

  const handleRevoke = useCallback(async () => {
    if (!showRevokeModal || revokeReason.length < 10) {
      toast.warning('Motif de revocation requis (min 10 caracteres)');
      return;
    }

    setRevoking(true);
    try {
      await hrApi.revokeCertificate(showRevokeModal.id, revokeReason);
      toast.success('Certificat revoque');
      setShowRevokeModal(null);
      setRevokeReason('');
      refetch();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la revocation');
    } finally {
      setRevoking(false);
    }
  }, [showRevokeModal, revokeReason, refetch]);

  const isCompleted = formationStatut === 'COMPLETED';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-content-primary flex items-center gap-2">
            <Award size={16} className="text-status-warning" />
            Certificats
          </h3>
          <p className="text-xs text-content-muted">
            {certificates.length} certificat(s) emis
          </p>
        </div>
        {canManage && isCompleted && (
          <div className="flex gap-2">
            {eligibleParticipants.length > 0 && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowBatchModal(true)}
                  title="Emettre pour tous les participants presents"
                >
                  <Users size={14} className="mr-1" />
                  Batch ({eligibleParticipants.length})
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowIssueModal(true)}
                >
                  <Plus size={14} className="mr-1" />
                  Emettre
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {!isCompleted && (
        <div className="bg-status-warning-bg border border-status-warning/30 rounded-lg p-3 flex items-center gap-2">
          <AlertTriangle size={16} className="text-status-warning" />
          <p className="text-xs text-status-warning">
            Les certificats ne peuvent etre emis qu'apres la fin de la formation.
          </p>
        </div>
      )}

      {/* Certificates list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-status-warning" />
        </div>
      ) : certificates.length === 0 ? (
        <div className="text-center py-8 bg-surface-base/50 rounded-lg border border-edge">
          <Award size={32} className="mx-auto text-content-muted mb-2" />
          <p className="text-sm text-content-muted">Aucun certificat emis</p>
          {canManage && isCompleted && eligibleParticipants.length > 0 && (
            <p className="text-xs text-content-muted mt-1">
              {eligibleParticipants.length} participant(s) eligible(s)
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {certificates.map((cert) => {
            const status = STATUS_CONFIG[cert.statut] || STATUS_CONFIG.ISSUED;
            const StatusIcon = status.icon;
            const isExpired = cert.dateExpiration && new Date(cert.dateExpiration) < new Date();

            return (
              <div
                key={cert.id}
                className={`bg-surface-base/50 border rounded-lg p-3 ${
                  cert.statut === 'REVOKED' ? 'border-status-danger/30 opacity-60' :
                  isExpired ? 'border-status-warning/30' :
                  'border-edge'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${
                      cert.statut === 'REVOKED' ? 'bg-status-danger-bg' :
                      isExpired ? 'bg-status-warning-bg' :
                      'bg-status-warning-bg'
                    }`}>
                      <Award size={20} className={
                        cert.statut === 'REVOKED' ? 'text-status-danger' :
                        isExpired ? 'text-status-warning' :
                        'text-status-warning'
                      } />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-content-primary">{cert.employeNom}</span>
                        <Badge
                          variant={status.color as any}
                          value={isExpired && cert.statut === 'ISSUED' ? 'Expire' : status.label}
                          size="xs"
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-[10px] text-content-muted">
                        <span className="font-mono text-status-warning/70">{cert.numeroCertificat}</span>
                        <span className="flex items-center gap-1">
                          <Calendar size={10} />
                          Emis le {new Date(cert.dateEmission).toLocaleDateString('fr-FR')}
                        </span>
                        {cert.dateExpiration && (
                          <span className={`flex items-center gap-1 ${isExpired ? 'text-status-warning' : ''}`}>
                            <AlertTriangle size={10} />
                            Expire le {new Date(cert.dateExpiration).toLocaleDateString('fr-FR')}
                          </span>
                        )}
                      </div>

                      {cert.competences && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {cert.competences.split(',').map((comp, i) => (
                            <span
                              key={i}
                              className="px-1.5 py-0.5 bg-surface text-content-muted text-[9px] rounded"
                            >
                              {comp.trim()}
                            </span>
                          ))}
                        </div>
                      )}

                      {cert.motifRevocation && (
                        <p className="text-xs text-status-danger mt-2 flex items-center gap-1">
                          <XCircle size={10} />
                          {cert.motifRevocation}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {cert.fichierUrl && (
                      <a
                        href={cert.fichierUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-content-muted hover:text-content-primary hover:bg-surface-elevated rounded transition"
                        title="Telecharger"
                      >
                        <Download size={14} />
                      </a>
                    )}
                    {canManage && cert.statut === 'ISSUED' && !isExpired && (
                      <button
                        onClick={() => setShowRevokeModal(cert)}
                        className="p-1.5 text-status-danger hover:bg-status-danger-bg rounded transition"
                        title="Revoquer"
                      >
                        <XCircle size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Issue Modal */}
      <Modal
        isOpen={showIssueModal}
        onClose={() => setShowIssueModal(false)}
        title="Emettre un certificat"
        size="md"
      >
        <div className="space-y-4">
          <div className="bg-surface/50 rounded-lg p-3">
            <p className="text-xs text-content-muted">Formation</p>
            <p className="text-sm font-medium text-content-primary">{formationTitre}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-content-secondary mb-2">Participant</label>
            <select
              value={selectedParticipant}
              onChange={(e) => setSelectedParticipant(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-edge rounded-lg text-sm text-content-primary focus:ring-1 focus:ring-status-warning/50"
            >
              <option value="">Selectionner un participant</option>
              {eligibleParticipants.map((p) => (
                <option key={p.employeId} value={p.employeId}>
                  {p.employeNom} {p.scoreEvaluation ? `(${p.scoreEvaluation}/100)` : ''}
                </option>
              ))}
            </select>
          </div>

          <FormField
            label="Competences certifiees (separees par virgule)"
            name="competences"
            type="textarea"
            value={issueForm.competences}
            onChange={(e) => setIssueForm(prev => ({ ...prev, competences: e.target.value }))}
            placeholder="Ex: Gestion de projet, Leadership, Communication..."
          />

          <FormField
            label="Date d'expiration (optionnel)"
            name="dateExpiration"
            type="date"
            value={issueForm.dateExpiration}
            onChange={(e) => setIssueForm(prev => ({ ...prev, dateExpiration: e.target.value }))}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-edge">
            <Button variant="secondary" onClick={() => setShowIssueModal(false)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={handleIssueCertificate}
              disabled={issuing || !selectedParticipant}
            >
              {issuing ? 'Emission...' : 'Emettre le certificat'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Batch Issue Modal */}
      <Modal
        isOpen={showBatchModal}
        onClose={() => setShowBatchModal(false)}
        title="Emission en masse"
        size="md"
      >
        <div className="space-y-4">
          <div className="bg-status-warning-bg border border-status-warning/30 rounded-lg p-3">
            <div className="flex items-center gap-2 text-status-warning mb-2">
              <Users size={16} />
              <span className="text-sm font-medium">{eligibleParticipants.length} participant(s) eligible(s)</span>
            </div>
            <p className="text-xs text-content-muted">
              Les certificats seront emis pour tous les participants marques "Present" qui n'ont pas encore de certificat.
            </p>
          </div>

          <div className="max-h-32 overflow-y-auto bg-surface/50 rounded-lg p-2 space-y-1">
            {eligibleParticipants.map(p => (
              <div key={p.employeId} className="flex items-center gap-2 text-xs text-content-secondary">
                <User size={12} className="text-content-muted" />
                {p.employeNom}
              </div>
            ))}
          </div>

          <FormField
            label="Competences certifiees (pour tous)"
            name="competences"
            type="textarea"
            value={batchForm.competences}
            onChange={(e) => setBatchForm(prev => ({ ...prev, competences: e.target.value }))}
            placeholder="Ex: Gestion de projet, Leadership..."
          />

          <FormField
            label="Date d'expiration (optionnel)"
            name="dateExpiration"
            type="date"
            value={batchForm.dateExpiration}
            onChange={(e) => setBatchForm(prev => ({ ...prev, dateExpiration: e.target.value }))}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-edge">
            <Button variant="secondary" onClick={() => setShowBatchModal(false)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={handleBatchIssue}
              disabled={issuing}
            >
              {issuing ? 'Emission...' : `Emettre ${eligibleParticipants.length} certificat(s)`}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Revoke Modal */}
      <Modal
        isOpen={!!showRevokeModal}
        onClose={() => setShowRevokeModal(null)}
        title="Revoquer le certificat"
        size="sm"
      >
        {showRevokeModal && (
          <div className="space-y-4">
            <div className="bg-status-danger-bg border border-status-danger/30 rounded-lg p-3">
              <p className="text-sm text-status-danger font-medium mb-1">Attention</p>
              <p className="text-xs text-content-muted">
                Cette action est irreversible. Le certificat de {showRevokeModal.employeNom} sera marque comme revoque.
              </p>
            </div>

            <FormField
              label="Motif de revocation (min 10 caracteres)"
              name="revokeReason"
              type="textarea"
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              required
            />

            <div className="flex justify-end gap-3 pt-4 border-t border-edge">
              <Button variant="secondary" onClick={() => setShowRevokeModal(null)}>
                Annuler
              </Button>
              <Button
                variant="danger"
                onClick={handleRevoke}
                disabled={revoking || revokeReason.length < 10}
              >
                {revoking ? 'Revocation...' : 'Revoquer'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
