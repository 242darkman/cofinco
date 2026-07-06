import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Badge, Modal } from '../ui';
import { Calendar, Check, X, Users, Clock } from 'lucide-react';
import { toast } from '../../lib/toast';

interface TeamConge {
  id: number;
  employeId: string;
  employeNom: string;
  type: string;
  dateDebut: string;
  dateFin: string;
  motif?: string;
  statut: string;
  dureeJours?: number;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  ANNUEL: 'Annuel',
  MALADIE: 'Maladie',
  MATERNITE: 'Maternite',
  SANS_SOLDE: 'Sans solde',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function computeDays(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return Math.max(Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1, 0);
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 1) return "Il y a quelques minutes";
  if (diffH < 24) return `Il y a ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "Hier";
  return `Il y a ${diffD}j`;
}

export default function MonEquipeCongesTab() {
  const queryClient = useQueryClient();
  const [approveTarget, setApproveTarget] = useState<TeamConge | null>(null);
  const [rejectTarget, setRejectTarget] = useState<TeamConge | null>(null);
  const [rejectComment, setRejectComment] = useState('');

  const { data: conges = [], isLoading } = useQuery<TeamConge[]>({
    queryKey: ['/api/hr/conges/team'],
    queryFn: async () => {
      const r = await fetch('/api/hr/conges/team', { credentials: 'include' });
      if (!r.ok) throw new Error('Erreur chargement des demandes');
      return r.json();
    },
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['/api/hr/conges/team'] });
    queryClient.invalidateQueries({ queryKey: ['/api/hr/conges/team/count'] });
    queryClient.invalidateQueries({ queryKey: ['/api/hr/conges'] });
  }, [queryClient]);

  const approveMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/hr/conges/${id}/approve`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).then(r => {
        if (!r.ok) return r.json().then(d => { throw new Error(d.message || 'Erreur'); });
        return r.json();
      }),
    onSuccess: () => {
      toast.success('Congé approuvé');
      setApproveTarget(null);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, commentaire }: { id: number; commentaire: string }) =>
      fetch(`/api/hr/conges/${id}/reject`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentaire }),
      }).then(r => {
        if (!r.ok) return r.json().then(d => { throw new Error(d.message || 'Erreur'); });
        return r.json();
      }),
    onSuccess: () => {
      toast.success('Congé refusé');
      setRejectTarget(null);
      setRejectComment('');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleReject = useCallback(() => {
    if (!rejectTarget) return;
    if (!rejectComment.trim()) {
      toast.warning('Veuillez saisir un motif de refus');
      return;
    }
    rejectMutation.mutate({ id: rejectTarget.id, commentaire: rejectComment.trim() });
  }, [rejectTarget, rejectComment, rejectMutation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  if (conges.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-status-success-bg mb-3">
            <Check className="h-6 w-6 text-status-success" />
          </div>
          <p className="text-content-primary font-semibold text-sm">Aucune demande en attente</p>
          <p className="text-xs text-content-muted mt-1 max-w-xs">
            Les demandes de conge de votre equipe apparaitront ici lorsqu'elles seront soumises.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-content-primary">Demandes en attente</h3>
          <Badge variant="warning" size="sm">{conges.length}</Badge>
        </div>
      </div>

      {/* Cards */}
      <div className="space-y-2">
        {conges.map((conge) => {
          const duree = conge.dureeJours || computeDays(conge.dateDebut, conge.dateFin);
          return (
            <Card key={conge.id} padding="sm">
              <div className="flex flex-col gap-3">
                {/* Top row: employee info + meta */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="hidden sm:flex shrink-0 items-center justify-center w-9 h-9 rounded-lg bg-accent/10">
                      <Users className="h-4 w-4 text-accent" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-content-primary text-sm truncate">
                        {conge.employeNom}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <Badge variant="info" size="xs">
                          {TYPE_LABELS[conge.type] || conge.type}
                        </Badge>
                        <span className="text-xs text-content-muted flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(conge.dateDebut)} — {formatDate(conge.dateFin)}
                        </span>
                        <span className="text-xs font-medium text-content-secondary">
                          {duree}j
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] text-content-muted shrink-0 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {timeAgo(conge.createdAt)}
                  </span>
                </div>

                {/* Motif */}
                {conge.motif && (
                  <p className="text-xs text-content-muted pl-0 sm:pl-12 truncate">
                    {conge.motif}
                  </p>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-2 pl-0 sm:pl-12">
                  <Button
                    variant="primary"
                    size="xs"
                    icon={Check}
                    onClick={() => setApproveTarget(conge)}
                  >
                    Approuver
                  </Button>
                  <Button
                    variant="danger"
                    size="xs"
                    icon={X}
                    onClick={() => { setRejectTarget(conge); setRejectComment(''); }}
                  >
                    Refuser
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Approve confirmation modal */}
      <Modal
        isOpen={!!approveTarget}
        onClose={() => setApproveTarget(null)}
        title="Approuver la demande"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setApproveTarget(null)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={() => approveTarget && approveMutation.mutate(approveTarget.id)}
              isLoading={approveMutation.isPending}
            >
              Confirmer l'approbation
            </Button>
          </>
        }
      >
        {approveTarget && (
          <div className="p-3 rounded-lg bg-surface-subtle">
            <p className="text-sm font-medium text-content-primary">{approveTarget.employeNom}</p>
            <p className="text-xs text-content-muted mt-1">
              {TYPE_LABELS[approveTarget.type] || approveTarget.type} — {formatDate(approveTarget.dateDebut)} au {formatDate(approveTarget.dateFin)}
            </p>
            <p className="text-xs font-medium text-content-secondary mt-1">
              {approveTarget.dureeJours || computeDays(approveTarget.dateDebut, approveTarget.dateFin)} jour(s)
            </p>
          </div>
        )}
      </Modal>

      {/* Reject modal */}
      <Modal
        isOpen={!!rejectTarget}
        onClose={() => { setRejectTarget(null); setRejectComment(''); }}
        title="Refuser la demande"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setRejectTarget(null); setRejectComment(''); }}>
              Annuler
            </Button>
            <Button
              variant="danger"
              onClick={handleReject}
              isLoading={rejectMutation.isPending}
            >
              Confirmer le refus
            </Button>
          </>
        }
      >
        {rejectTarget && (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-surface-subtle">
              <p className="text-sm font-medium text-content-primary">{rejectTarget.employeNom}</p>
              <p className="text-xs text-content-muted mt-1">
                {TYPE_LABELS[rejectTarget.type] || rejectTarget.type} — {formatDate(rejectTarget.dateDebut)} au {formatDate(rejectTarget.dateFin)}
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-content-secondary mb-1.5">
                Motif du refus <span className="text-status-danger">*</span>
              </label>
              <textarea
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
                placeholder="Expliquez la raison du refus..."
                rows={3}
                className="w-full px-3 py-2 bg-input-bg border border-input-border rounded-lg text-input-text text-sm placeholder:text-input-placeholder focus:outline-none focus:ring-2 focus:border-input-focus focus:ring-input-focus/30 transition-colors duration-200"
                autoFocus
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
