import { useState, useMemo, useCallback } from 'react';
import { MessageSquarePlus, Check, X, Clock, Filter, Loader2, User, Shield, AlertCircle, Ban } from 'lucide-react';
import { Button, Badge, Modal } from '@/components/ui';
import { usePermissionRequests, type PermissionRequestData } from '@/hooks/admin/usePermissionRequests';
import { useToast } from '@/hooks/use-toast';

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: typeof Check }> = {
  PENDING: { label: 'En attente', className: 'bg-status-warning-bg text-status-warning border-status-warning/20', icon: Clock },
  APPROVED: { label: 'Approuvée', className: 'bg-status-success-bg text-status-success border-status-success/20', icon: Check },
  REJECTED: { label: 'Rejetée', className: 'bg-status-danger-bg text-status-danger border-status-danger/20', icon: X },
  CANCELLED: { label: 'Annulée', className: 'bg-surface-subtle text-content-muted border-edge-subtle', icon: Ban },
};

const TYPE_LABELS: Record<string, string> = {
  GRANT: 'Accorder',
  DENY: 'Bloquer',
  TEMPORARY: 'Temporaire',
};

function ReviewModal({
  isOpen,
  onClose,
  request,
  decision,
  onSubmit,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;
  request: PermissionRequestData;
  decision: 'APPROVED' | 'REJECTED';
  onSubmit: (reason: string) => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState('');
  const isReject = decision === 'REJECTED';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isReject ? 'Rejeter la demande' : 'Approuver la demande'}>
      <div className="space-y-4">
        <div className="p-3 rounded-lg bg-surface-subtle border border-edge-subtle text-sm">
          <div className="flex items-center gap-2 mb-2">
            <User size={14} className="text-content-muted" />
            <span className="font-medium text-content-primary">
              {request.requesterPrenom} {request.requesterNom}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Shield size={14} className="text-content-muted" />
            <span className="text-content-secondary">
              {TYPE_LABELS[request.requestType]} : <span className="font-mono text-xs">{request.permissionCode}</span>
            </span>
          </div>
          <div className="mt-2 text-xs text-content-muted">
            Raison : {request.reason}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">
            {isReject ? 'Raison du rejet *' : 'Commentaire (optionnel)'}
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            required={isReject}
            placeholder={isReject ? 'Expliquez pourquoi cette demande est rejetée...' : 'Commentaire optionnel...'}
            className="w-full px-3 py-2 text-sm bg-input border border-input-border rounded-lg focus:border-input-focus focus:outline-none text-content-primary resize-none"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button
            size="sm"
            variant={isReject ? 'destructive' : 'default'}
            onClick={() => onSubmit(reason)}
            disabled={loading || (isReject && !reason.trim())}
          >
            {loading && <Loader2 size={14} className="animate-spin mr-1" />}
            {isReject ? 'Rejeter' : 'Approuver'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function PermissionRequestsManager() {
  const { requests, pendingCount, loading, error, fetchRequests, approve, reject } = usePermissionRequests();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [reviewingRequest, setReviewingRequest] = useState<PermissionRequestData | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [reviewLoading, setReviewLoading] = useState(false);

  const filteredRequests = useMemo(() => {
    if (!statusFilter) return requests;
    return requests.filter(r => r.status === statusFilter);
  }, [requests, statusFilter]);

  const handleReview = useCallback(async (reason: string) => {
    if (!reviewingRequest) return;
    setReviewLoading(true);
    try {
      if (reviewDecision === 'APPROVED') {
        await approve(reviewingRequest.id, reason || undefined);
        toast({ title: 'Demande approuvée', variant: 'default' });
      } else {
        await reject(reviewingRequest.id, reason);
        toast({ title: 'Demande rejetée', variant: 'default' });
      }
      setReviewingRequest(null);
    } catch (err: any) {
      toast({ title: err.message, variant: 'destructive' });
    } finally {
      setReviewLoading(false);
    }
  }, [reviewingRequest, reviewDecision, approve, reject, toast]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-edge-subtle">
        <div className="flex items-center gap-2">
          <MessageSquarePlus size={18} className="text-accent" />
          <h3 className="font-semibold text-content-primary">Demandes de Permissions</h3>
          {pendingCount > 0 && (
            <Badge className="bg-status-warning-bg text-status-warning text-[10px]">
              {pendingCount} en attente
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-input border border-input-border rounded-md focus:border-input-focus focus:outline-none text-content-primary"
          >
            <option value="">Tous les statuts</option>
            <option value="PENDING">En attente</option>
            <option value="APPROVED">Approuvées</option>
            <option value="REJECTED">Rejetées</option>
            <option value="CANCELLED">Annulées</option>
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-status-danger-bg text-status-danger text-sm flex items-center gap-2">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-accent" />
          </div>
        )}

        {!loading && filteredRequests.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-content-muted">
            <MessageSquarePlus size={36} className="mb-3 opacity-50" />
            <p className="text-sm">Aucune demande {statusFilter ? `avec le statut "${STATUS_CONFIG[statusFilter]?.label}"` : ''}</p>
          </div>
        )}

        {!loading && filteredRequests.length > 0 && (
          <div className="divide-y divide-edge-subtle">
            {filteredRequests.map(req => {
              const statusCfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.PENDING;
              const StatusIcon = statusCfg.icon;

              return (
                <div key={req.id} className="px-4 py-3 hover:bg-surface-subtle/50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <User size={14} className="text-content-muted shrink-0" />
                        <span className="font-medium text-sm text-content-primary">
                          {req.requesterPrenom} {req.requesterNom}
                        </span>
                        <Badge variant="secondary" className="text-[9px]">{TYPE_LABELS[req.requestType]}</Badge>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border ${statusCfg.className}`}>
                          <StatusIcon size={10} />
                          {statusCfg.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <Shield size={12} className="text-content-muted" />
                        <code className="text-xs font-mono text-content-secondary">{req.permissionCode}</code>
                        {req.permissionName && (
                          <span className="text-xs text-content-muted">({req.permissionName})</span>
                        )}
                      </div>
                      <p className="text-xs text-content-muted line-clamp-2">{req.reason}</p>
                      {req.reviewReason && (
                        <p className="text-xs text-content-muted mt-1 italic">
                          Avis : {req.reviewReason}
                        </p>
                      )}
                      <div className="text-[10px] text-content-muted mt-1.5">
                        {new Date(req.createdAt).toLocaleDateString('fr-FR', {
                          day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                        {req.expiresAt && (
                          <span className="ml-2">
                            Expire : {new Date(req.expiresAt).toLocaleDateString('fr-FR')}
                          </span>
                        )}
                      </div>
                    </div>

                    {req.status === 'PENDING' && (
                      <div className="flex items-center gap-1.5 shrink-0 ml-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-status-success hover:bg-status-success-bg"
                          onClick={() => { setReviewingRequest(req); setReviewDecision('APPROVED'); }}
                        >
                          <Check size={14} className="mr-1" />
                          Approuver
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-status-danger hover:bg-status-danger-bg"
                          onClick={() => { setReviewingRequest(req); setReviewDecision('REJECTED'); }}
                        >
                          <X size={14} className="mr-1" />
                          Rejeter
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Review Modal */}
      {reviewingRequest && (
        <ReviewModal
          isOpen={!!reviewingRequest}
          onClose={() => setReviewingRequest(null)}
          request={reviewingRequest}
          decision={reviewDecision}
          onSubmit={handleReview}
          loading={reviewLoading}
        />
      )}
    </div>
  );
}
