import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle,
  XCircle,
  User,
  Loader2,
  CreditCard,
  FileText,
  Calendar,
  ShieldAlert
} from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import ConfirmDialog from '../ui/ConfirmDialog';
import Button from '../ui/Button';
import { toast, handleApiError } from '../../lib/toast';
import { formatMoney } from '../../lib/format';
import { type ClosurePayoutMethodType } from '@shared/enum/status-constants';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface ClosureRequest {
  id: string;
  compteId: string;
  initiatedBy: string;
  initiatedAt: string;
  status: string;
  reason: string;
  payoutMethod: ClosurePayoutMethodType;
  payoutAmount: string;
  payoutPhoneNumber?: string;
  balanceAtInitiation: string;
  closingFeeAmount: string;
  numeroCompte?: string;
  clientNom?: string;
  initiatorName?: string;
  agenceId?: string;
}

interface ClosureApprovalsProps {
  agenceId?: string;
  searchTerm?: string;
}

const PAGE_SIZE = 8;

function PayoutMethodBadge({ method, phoneNumber }: { method: ClosurePayoutMethodType; phoneNumber?: string }) {
  if (method === 'CASH') {
    return (
      <Badge 
        value="LIQUIDE / CAISSE" 
        variant="warning" 
        className="text-[10px] py-0.5 h-5 bg-status-warning/10 border-status-warning/20 text-status-warning font-bold uppercase tracking-tight" 
      />
    );
  }
  return (
    <Badge 
      value={`MOMO: ${phoneNumber || 'MOBILE'}`} 
      variant="info" 
      className="text-[10px] py-0.5 h-5 bg-status-info/10 border-status-info/20 text-status-info font-bold uppercase tracking-tight" 
    />
  );
}

export default function ClosureApprovals({ agenceId, searchTerm = '' }: ClosureApprovalsProps) {
  const [requests, setRequests] = useState<ClosureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Approve dialog
  const [approveTarget, setApproveTarget] = useState<ClosureRequest | null>(null);

  // Cancel dialog
  const [cancelTarget, setCancelTarget] = useState<ClosureRequest | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  useEffect(() => {
    fetchPending();
    const handleUpdate = () => fetchPending();
    window.addEventListener('closure-update', handleUpdate);
    return () => window.removeEventListener('closure-update', handleUpdate);
  }, [agenceId]);

  const fetchPending = async () => {
    setLoading(true);
    try {
      const url = agenceId
        ? `/api/closure-requests/pending?agenceId=${agenceId}`
        : '/api/closure-requests/pending';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Erreur chargement demandes');
      const data = await res.json();
      setRequests(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading closure requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    let result = requests;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(r =>
        (r.numeroCompte || '').toLowerCase().includes(q) ||
        (r.clientNom || '').toLowerCase().includes(q) ||
        (r.initiatorName || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [requests, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((safeCurrentPage - 1) * PAGE_SIZE, safeCurrentPage * PAGE_SIZE);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, agenceId]);

  const handleApprove = async () => {
    if (!approveTarget) return;
    setActionLoading(approveTarget.id);
    try {
      const res = await fetch(`/api/closure-requests/${approveTarget.id}/approve`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Erreur lors de l\'approbation');
      toast.success('Clôture approuvée');
      setApproveTarget(null);
      fetchPending();
      window.dispatchEvent(new CustomEvent('closure-update'));
    } catch (error) {
      toast.error(handleApiError(error));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget || cancelReason.trim().length < 3) return;
    setActionLoading(cancelTarget.id);
    try {
      const res = await fetch(`/api/closure-requests/${cancelTarget.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ cancelReason }),
      });
      if (!res.ok) throw new Error('Erreur lors du rejet');
      toast.success('Demande rejetée');
      setCancelTarget(null);
      setCancelReason('');
      fetchPending();
      window.dispatchEvent(new CustomEvent('closure-update'));
    } catch (error) {
      toast.error(handleApiError(error));
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-10 h-10 text-status-danger animate-spin" />
        <p className="text-sm font-medium text-content-muted">Chargement des clôtures...</p>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <Card className="py-20 text-center border-dashed border-2 border-edge bg-surface-muted/5 rounded-2xl">
        <div className="w-16 h-16 bg-surface-base rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
          <CheckCircle size={32} className="text-status-success" />
        </div>
        <h3 className="text-lg font-bold text-content-primary">Aucune clôture en attente</h3>
        <p className="text-sm text-content-muted mt-1 max-w-xs mx-auto">
          Tous les comptes sont actifs ou déjà clôturés.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-500 pb-12">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-bold text-content-primary flex items-center gap-2">
          <ShieldAlert size={18} className="text-status-danger" />
          Approbation des Clôtures
        </h3>
        <Badge value={`${filtered.length} demandes`} variant="outline" className="text-[10px] bg-status-danger/5 border-status-danger/20 text-status-danger" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {paginated.map((req) => (
          <Card key={req.id} className="p-0 border-edge hover:shadow-lg transition-all duration-300 rounded-2xl overflow-hidden group">
            <div className="p-4 flex items-start justify-between bg-surface-muted/10 group-hover:bg-status-danger/5 transition-colors">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-status-danger/10 rounded-lg">
                    <CreditCard size={14} className="text-status-danger" />
                  </div>
                  <span className="text-sm font-black text-content-primary font-mono tracking-tighter">
                    {req.numeroCompte || 'COMPTE-ID'}
                  </span>
                </div>
                <p className="text-sm font-bold text-content-secondary pl-0.5">{req.clientNom || 'Client Inconnu'}</p>
              </div>
              <PayoutMethodBadge method={req.payoutMethod} phoneNumber={req.payoutPhoneNumber} />
            </div>

            <div className="p-4 space-y-4">
              <div className="grid grid-cols-3 gap-2 py-3 px-4 bg-surface-base border border-edge-subtle rounded-xl shadow-inner-sm">
                <div className="border-r border-edge-subtle">
                  <p className="text-[9px] font-bold text-content-muted uppercase tracking-widest mb-1">Solde</p>
                  <p className="text-xs font-black text-content-primary">{formatMoney(req.balanceAtInitiation)}</p>
                </div>
                <div className="border-r border-edge-subtle px-1">
                  <p className="text-[9px] font-bold text-content-muted uppercase tracking-widest mb-1 text-center">Frais</p>
                  <p className="text-xs font-black text-status-danger text-center">-{formatMoney(req.closingFeeAmount)}</p>
                </div>
                <div className="pl-1">
                  <p className="text-[9px] font-bold text-content-muted uppercase tracking-widest mb-1 text-right">Net</p>
                  <p className="text-xs font-black text-status-success text-right">{formatMoney(req.payoutAmount)}</p>
                </div>
              </div>

              <div className="flex items-start gap-2 text-[11px] text-content-muted bg-surface-muted/30 p-2.5 rounded-lg border border-edge-subtle">
                <FileText size={14} className="shrink-0 mt-0.5" />
                <span><span className="font-bold text-content-secondary">Motif:</span> {req.reason}</span>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-edge-subtle">
                <div className="flex items-center gap-1.5 text-[10px] text-content-muted font-medium">
                  <User size={12} />
                  <span>{req.initiatorName || 'Agent'}</span>
                  <span className="opacity-50">•</span>
                  <Calendar size={12} />
                  <span>{format(new Date(req.initiatedAt), 'dd MMM HH:mm', { locale: fr })}</span>
                </div>
                
                <div className="flex gap-2">
                  <Button 
                    variant="ghost" 
                    size="xs" 
                    className="h-8 w-8 p-0 rounded-full hover:bg-status-danger/10 text-status-danger"
                    onClick={() => setCancelTarget(req)}
                  >
                    <XCircle size={16} />
                  </Button>
                  <Button 
                    variant="success" 
                    size="xs" 
                    className="h-8 gap-1.5 px-3 rounded-full shadow-sm"
                    onClick={() => setApproveTarget(req)}
                  >
                    <CheckCircle size={16} />
                    Valider
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Pagination View */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-6">
          <Button variant="ghost" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safeCurrentPage === 1}>Précédent</Button>
          <span className="text-xs font-bold text-content-muted uppercase tracking-widest">Page {safeCurrentPage} / {totalPages}</span>
          <Button variant="ghost" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safeCurrentPage === totalPages}>Suivant</Button>
        </div>
      )}

      {/* Dialogs remain similar but with updated Button styles */}
      <ConfirmDialog
        isOpen={!!approveTarget}
        onClose={() => setApproveTarget(null)}
        onConfirm={handleApprove}
        title="Approuver la clôture"
        confirmText="Confirmer l'approbation"
        variant="success"
        isLoading={!!actionLoading}
        message={approveTarget ? `Vous validez le remboursement de ${formatMoney(Number(approveTarget.payoutAmount))} pour le compte ${approveTarget.numeroCompte}.` : ''}
      />

      <ConfirmDialog
        isOpen={!!cancelTarget}
        onClose={() => { setCancelTarget(null); setCancelReason(''); }}
        onConfirm={handleCancel}
        title="Rejeter la demande"
        message={
          <div className="space-y-3">
            <p className="text-sm text-content-secondary">Veuillez indiquer le motif du rejet pour ce compte.</p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full h-20 p-3 text-sm bg-surface-muted/50 border border-edge rounded-xl focus:ring-2 focus:ring-status-danger/20 outline-none transition-all resize-none"
              placeholder="Ex: Solde insuffisant pour frais..."
            />
          </div>
        }
        confirmText="Confirmer Rejet"
        variant="danger"
        isLoading={!!actionLoading}
        disabled={cancelReason.trim().length < 3}
      />
    </div>
  );
}
