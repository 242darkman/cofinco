import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle,
  XCircle,
  User,
  Loader2,
  Banknote,
  CreditCard,
  PiggyBank,
  Lock,
  Wallet,
  Calendar,
  ShieldCheck
} from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import ConfirmDialog from '../ui/ConfirmDialog';
import Button from '../ui/Button';
import { toast, handleApiError } from '../../lib/toast';
import { formatMoney } from '../../lib/format';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface OpeningRequest {
  id: string;
  compteId: string;
  initiatedBy: string;
  initiatedAt: string;
  status: string;
  openingFeeAmount: string;
  initialDepositAmount: string;
  produitId: string | null;
  createdAt: string;
  numeroCompte?: string;
  typeCompte?: string;
  produitNom?: string;
  clientNom?: string;
  initiatorName?: string;
  agenceId?: string;
}

interface OpeningApprovalsProps {
  agenceId?: string;
  searchTerm?: string;
}

const PAGE_SIZE = 8;

const TYPE_LABEL: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  SAVINGS: { label: 'Épargne', icon: PiggyBank, color: 'text-status-success', bg: 'bg-status-success/10' },
  CURRENT: { label: 'Courant', icon: Wallet, color: 'text-status-info', bg: 'bg-status-info/10' },
  BLOCKED: { label: 'Bloqué', icon: Lock, color: 'text-status-warning', bg: 'bg-status-warning/10' },
};

function AccountTypeBadge({ typeCompte }: { typeCompte?: string }) {
  const config = TYPE_LABEL[typeCompte || ''] || { label: typeCompte || '—', icon: CreditCard, color: 'text-content-muted', bg: 'bg-surface-muted' };
  const Icon = config.icon;
  return (
    <Badge 
      variant="outline" 
      className={cn("text-[10px] font-bold uppercase gap-1 px-2 py-0.5 border-none", config.bg, config.color)}
    >
      <Icon size={12} />
      {config.label}
    </Badge>
  );
}

export default function OpeningApprovals({ agenceId, searchTerm = '' }: OpeningApprovalsProps) {
  const [requests, setRequests] = useState<OpeningRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Approve dialog
  const [approveTarget, setApproveTarget] = useState<OpeningRequest | null>(null);

  // Reject dialog
  const [rejectTarget, setRejectTarget] = useState<OpeningRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    fetchPending();
    const handleUpdate = () => fetchPending();
    window.addEventListener('opening-update', handleUpdate);
    return () => window.removeEventListener('opening-update', handleUpdate);
  }, [agenceId]);

  const fetchPending = async () => {
    setLoading(true);
    try {
      const url = agenceId
        ? `/api/opening-requests/pending?agenceId=${agenceId}`
        : '/api/opening-requests/pending';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Erreur chargement demandes');
      const data = await res.json();
      setRequests(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading opening requests:', error);
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
        (r.initiatorName || '').toLowerCase().includes(q) ||
        (r.produitNom || '').toLowerCase().includes(q)
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
      const res = await fetch(`/api/opening-requests/${approveTarget.id}/approve`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Erreur lors de l\'approbation');
      toast.success('Ouverture approuvée');
      setApproveTarget(null);
      fetchPending();
      window.dispatchEvent(new CustomEvent('opening-update'));
    } catch (error) {
      toast.error(handleApiError(error));
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget || rejectReason.trim().length < 3) return;
    setActionLoading(rejectTarget.id);
    try {
      const res = await fetch(`/api/opening-requests/${rejectTarget.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: rejectReason }),
      });
      if (!res.ok) throw new Error('Erreur lors du rejet');
      toast.success('Demande rejetée');
      setRejectTarget(null);
      setRejectReason('');
      fetchPending();
      window.dispatchEvent(new CustomEvent('opening-update'));
    } catch (error) {
      toast.error(handleApiError(error));
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-10 h-10 text-status-success animate-spin" />
        <p className="text-sm font-medium text-content-muted">Chargement des ouvertures...</p>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <Card className="py-20 text-center border-dashed border-2 border-edge bg-surface-muted/5 rounded-2xl">
        <div className="w-16 h-16 bg-surface-base rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
          <CheckCircle size={32} className="text-status-success" />
        </div>
        <h3 className="text-lg font-bold text-content-primary">Aucune ouverture en attente</h3>
        <p className="text-sm text-content-muted mt-1 max-w-xs mx-auto">
          Toutes les demandes de création de compte ont été traitées.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-500 pb-12">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-bold text-content-primary flex items-center gap-2">
          <ShieldCheck size={18} className="text-status-success" />
          Validation des Ouvertures
        </h3>
        <Badge value={`${filtered.length} demandes`} variant="outline" className="text-[10px] bg-status-success/5 border-status-success/20 text-status-success" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {paginated.map((req) => {
          const fee = Number(req.openingFeeAmount);
          const deposit = Number(req.initialDepositAmount);
          const netDeposit = deposit - fee;

          return (
            <Card key={req.id} className="p-0 border-edge hover:shadow-lg transition-all duration-300 rounded-2xl overflow-hidden group">
              <div className="p-4 flex items-start justify-between bg-surface-muted/10 group-hover:bg-status-success/5 transition-colors">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-status-success/10 rounded-lg">
                      <CreditCard size={14} className="text-status-success" />
                    </div>
                    <span className="text-sm font-black text-content-primary font-mono tracking-tighter">
                      {req.numeroCompte || 'NOUVEAU'}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-content-secondary pl-0.5">{req.clientNom || 'Client Inconnu'}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <AccountTypeBadge typeCompte={req.typeCompte} />
                  {req.produitNom && (
                    <span className="text-[9px] font-bold text-content-muted bg-surface/60 px-1.5 py-0.5 rounded border border-edge-subtle uppercase tracking-tight">
                      {req.produitNom}
                    </span>
                  )}
                </div>
              </div>

              <div className="p-4 space-y-4">
                <div className="grid grid-cols-3 gap-2 py-3 px-4 bg-surface-base border border-edge-subtle rounded-xl shadow-inner-sm">
                  <div className="border-r border-edge-subtle">
                    <p className="text-[9px] font-bold text-content-muted uppercase tracking-widest mb-1">Frais</p>
                    <p className="text-xs font-black text-status-danger">{fee > 0 ? formatMoney(fee) : '0'}</p>
                  </div>
                  <div className="border-r border-edge-subtle px-1">
                    <p className="text-[9px] font-bold text-content-muted uppercase tracking-widest mb-1 text-center">Crédité</p>
                    <p className="text-xs font-black text-content-secondary text-center">{formatMoney(netDeposit)}</p>
                  </div>
                  <div className="pl-1">
                    <p className="text-[9px] font-bold text-content-muted uppercase tracking-widest mb-1 text-right">À Verser</p>
                    <p className="text-xs font-black text-status-success text-right">{formatMoney(deposit)}</p>
                  </div>
                </div>

                <div className="flex items-start gap-2 text-[10px] text-status-success bg-status-success/5 p-2.5 rounded-lg border border-status-success/10">
                  <Banknote size={14} className="shrink-0" />
                  <p className="font-medium">Après validation, le dépôt de {formatMoney(deposit)} sera attendu en caisse.</p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-edge-subtle">
                  <div className="flex items-center gap-1.5 text-[10px] text-content-muted font-medium">
                    <User size={12} />
                    <span>{req.initiatorName || 'Conseiller'}</span>
                    <span className="opacity-50">•</span>
                    <Calendar size={12} />
                    <span>{format(new Date(req.initiatedAt), 'dd MMM HH:mm', { locale: fr })}</span>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button 
                      variant="ghost" 
                      size="xs" 
                      className="h-8 w-8 p-0 rounded-full hover:bg-status-danger/10 text-status-danger"
                      onClick={() => setRejectTarget(req)}
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
                      Approuver
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-6">
          <Button variant="ghost" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safeCurrentPage === 1}>Précédent</Button>
          <span className="text-xs font-bold text-content-muted uppercase tracking-widest">Page {safeCurrentPage} / {totalPages}</span>
          <Button variant="ghost" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safeCurrentPage === totalPages}>Suivant</Button>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!approveTarget}
        onClose={() => setApproveTarget(null)}
        onConfirm={handleApprove}
        title="Approuver l'ouverture"
        confirmText="Confirmer"
        variant="success"
        isLoading={!!actionLoading}
        message={approveTarget ? `Vous validez l'ouverture du compte pour ${approveTarget.clientNom}. Dépôt initial requis : ${formatMoney(Number(approveTarget.initialDepositAmount))}.` : ''}
      />

      <ConfirmDialog
        isOpen={!!rejectTarget}
        onClose={() => { setRejectTarget(null); setRejectReason(''); }}
        onConfirm={handleReject}
        title="Rejeter l'ouverture"
        message={
          <div className="space-y-3">
            <p className="text-sm text-content-secondary">Indiquez le motif du rejet pour cette ouverture de compte.</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full h-20 p-3 text-sm bg-surface-muted/50 border border-edge rounded-xl focus:ring-2 focus:ring-status-danger/20 outline-none transition-all resize-none"
              placeholder="Ex: Pièces justificatives manquantes..."
            />
          </div>
        }
        confirmText="Confirmer Rejet"
        variant="danger"
        isLoading={!!actionLoading}
        disabled={rejectReason.trim().length < 3}
      />
    </div>
  );
}
