import React, { useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Building2, Send, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import { Card, Button, Modal, Badge, FormField } from '../ui';
import { usePaymentBatches, usePaymentBatchDetail, type PaymentBatch } from '../../hooks/hr/usePaymentBatches';
import { usePermissions } from '../auth/ProtectedFeature';

const STATUS_CONFIG: Record<string, { variant: 'warning' | 'info' | 'success' | 'danger'; label: string; icon: typeof Clock }> = {
  GENERATED: { variant: 'warning', label: 'Généré', icon: Clock },
  SENT_TO_BANK: { variant: 'info', label: 'Envoyé', icon: Send },
  CONFIRMED: { variant: 'success', label: 'Confirmé', icon: CheckCircle },
  REJECTED: { variant: 'danger', label: 'Rejeté', icon: XCircle },
};

const ITEM_STATUS_CONFIG: Record<string, { variant: 'warning' | 'success' | 'danger'; label: string }> = {
  PENDING: { variant: 'warning', label: 'En attente' },
  PAID: { variant: 'success', label: 'Payé' },
  FAILED: { variant: 'danger', label: 'Échoué' },
};

const fmt = (amount: number | string) =>
  new Intl.NumberFormat('fr-FR').format(typeof amount === 'string' ? parseInt(amount) : amount) + ' FCFA';

interface PaymentBatchManagerProps {
  runId: number | null;
  onGenerateXlsx?: (runId: number) => void;
}

export default function PaymentBatchManager({ runId, onGenerateXlsx }: PaymentBatchManagerProps) {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('rh', 'manage') || hasPermission('paie', 'manage');

  const { batches, isLoading, createBatches, isCreatingBatches, updateBatchStatus } = usePaymentBatches(runId);
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [statusModal, setStatusModal] = useState<{ batchId: string; targetStatus: string } | null>(null);
  const [referenceExterne, setReferenceExterne] = useState('');
  const [statusNotes, setStatusNotes] = useState('');

  const { batch: batchDetail } = usePaymentBatchDetail(expandedBatchId);

  if (!runId) {
    return (
      <Card className="p-6 text-center text-content-muted text-sm">
        Sélectionnez un run de paie pour voir les batches de virement
      </Card>
    );
  }

  if (isLoading) {
    return (
      <SkeletonList items={5} />
    );
  }

  const totalAmount = batches.reduce((s, b) => s + parseInt(b.totalAmount || '0'), 0);
  const confirmedBatches = batches.filter(b => b.statut === 'CONFIRMED');
  const pendingBatches = batches.filter(b => b.statut !== 'CONFIRMED' && b.statut !== 'REJECTED');

  const handleCreateBatches = async () => {
    if (!runId) return;
    await createBatches({ runId });
  };

  const handleStatusChange = async () => {
    if (!statusModal) return;
    await updateBatchStatus({
      batchId: statusModal.batchId,
      statut: statusModal.targetStatus,
      referenceExterne: referenceExterne || undefined,
      notes: statusNotes || undefined,
    });
    setStatusModal(null);
    setReferenceExterne('');
    setStatusNotes('');
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3 text-center">
          <div className="text-xl font-bold text-content-primary">{batches.length}</div>
          <div className="text-xs text-content-muted">Batches</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-xl font-bold text-accent">{fmt(totalAmount)}</div>
          <div className="text-xs text-content-muted">Total</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-xl font-bold text-status-success">{confirmedBatches.length}</div>
          <div className="text-xs text-content-muted">Confirmés</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-xl font-bold text-status-warning">{pendingBatches.length}</div>
          <div className="text-xs text-content-muted">En attente</div>
        </Card>
      </div>

      {/* Actions */}
      {canManage && (
        <div className="flex items-center gap-2">
          {batches.length === 0 && (
            <Button size="sm" onClick={handleCreateBatches} disabled={isCreatingBatches}>
              {isCreatingBatches ? <Spinner size="xs" tone="current" className="mr-1" /> : <Building2 size={14} className="mr-1" />}
              Créer les batches
            </Button>
          )}
          {onGenerateXlsx && (
            <Button size="sm" variant="outline" onClick={() => onGenerateXlsx(runId)}>
              <FileSpreadsheet size={14} className="mr-1" /> Exporter XLSX
            </Button>
          )}
        </div>
      )}

      {/* Batch list */}
      {batches.length === 0 ? (
        <Card className="p-6 text-center text-content-muted text-sm">
          Aucun batch de paiement. Créez les batches à partir du fichier de virement.
        </Card>
      ) : (
        <div className="space-y-2">
          {batches.map(batch => {
            const statusCfg = STATUS_CONFIG[batch.statut] || STATUS_CONFIG.GENERATED;
            const isExpanded = expandedBatchId === batch.id;
            const StatusIcon = statusCfg.icon;

            return (
              <Card key={batch.id} className="overflow-hidden">
                <div
                  className="p-3 flex items-center gap-3 cursor-pointer hover:bg-surface-subtle transition-colors"
                  onClick={() => setExpandedBatchId(isExpanded ? null : batch.id)}
                >
                  <div className="p-2 rounded-lg bg-accent/10 text-accent shrink-0">
                    <Building2 size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-content-primary">{batch.bankName}</span>
                      <Badge variant={statusCfg.variant} size="sm">{statusCfg.label}</Badge>
                    </div>
                    <div className="text-xs text-content-muted">
                      {batch.employeeCount} employé(s) · {fmt(batch.totalAmount)}
                      {batch.referenceExterne && ` · Réf: ${batch.referenceExterne}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {canManage && batch.statut === 'GENERATED' && (
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setStatusModal({ batchId: batch.id, targetStatus: 'SENT_TO_BANK' }); }}>
                        <Send size={12} className="mr-1" /> Envoyer
                      </Button>
                    )}
                    {canManage && batch.statut === 'SENT_TO_BANK' && (
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setStatusModal({ batchId: batch.id, targetStatus: 'CONFIRMED' }); }}>
                        <CheckCircle size={12} className="mr-1" /> Confirmer
                      </Button>
                    )}
                    {isExpanded ? <ChevronUp size={16} className="text-content-muted" /> : <ChevronDown size={16} className="text-content-muted" />}
                  </div>
                </div>

                {/* Expanded: batch items */}
                {isExpanded && batchDetail?.items && (
                  <div className="border-t border-edge px-3 pb-3">
                    <div className="mt-2 space-y-1">
                      {batchDetail.items.map(item => {
                        const itemCfg = ITEM_STATUS_CONFIG[item.statut] || ITEM_STATUS_CONFIG.PENDING;
                        return (
                          <div key={item.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-surface-subtle text-xs">
                            <span className="flex-1 text-content-primary">{item.employeNom}</span>
                            <span className="text-content-muted">{item.accountNumber || '—'}</span>
                            <span className="font-medium text-content-primary">{fmt(item.montantNet)}</span>
                            <Badge variant={itemCfg.variant} size="sm">{itemCfg.label}</Badge>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Status change modal */}
      <Modal isOpen={!!statusModal} onClose={() => { setStatusModal(null); setReferenceExterne(''); setStatusNotes(''); }}
        title={statusModal?.targetStatus === 'SENT_TO_BANK' ? 'Marquer comme envoyé' :
               statusModal?.targetStatus === 'CONFIRMED' ? 'Confirmer la réception' : 'Changer le statut'} size="sm">
        <div className="p-4 space-y-4">
          {statusModal?.targetStatus === 'CONFIRMED' && (
            <FormField label="Référence bancaire" name="referenceExterne"
              value={referenceExterne} onChange={e => setReferenceExterne(e.target.value)} placeholder="Référence de la banque" />
          )}
          <FormField label="Notes" name="statusNotes"
            value={statusNotes} onChange={e => setStatusNotes(e.target.value)} placeholder="Notes optionnelles" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setStatusModal(null)}>Annuler</Button>
            <Button onClick={handleStatusChange}>Confirmer</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
