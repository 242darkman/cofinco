import React, { useState, useCallback } from 'react';
import { useAvances, AvanceSalaire } from '../../hooks/hr/useAvances';
import { useEmployes } from '../../hooks/hr/useEmployes';
import { Card, Button, ResponsiveTable, Badge } from '../ui';
import { Plus, CheckCircle, XCircle, Banknote, ArrowDownCircle, X } from 'lucide-react';
import { usePermissions } from '../auth/ProtectedFeature';
import { isAdminRole } from '@shared/types/roles';
import { useUserProfile } from '../../hooks/useUserProfile';
import { toast } from '../../lib/toast';

const STATUT_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  APPROVED: 'Approuvée',
  PAID: 'Payée',
  DEDUCTED: 'Déduite',
  REJECTED: 'Rejetée',
};

const STATUT_VARIANTS: Record<string, 'warning' | 'success' | 'error' | 'default' | 'info'> = {
  PENDING: 'warning',
  APPROVED: 'info',
  PAID: 'success',
  DEDUCTED: 'default',
  REJECTED: 'error',
};

export default function SalaryAdvances() {
  const { user } = useUserProfile();
  const { hasPermission } = usePermissions();
  const isRH = isAdminRole(user?.role) || hasPermission('rh', 'edit');
  const { avances, isLoading, createAvance, isCreating, approveAvance, rejectAvance, payAvance, deductAvance } = useAvances();
  const { employes } = useEmployes();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [rejectModal, setRejectModal] = useState<{ id: string } | null>(null);
  const [rejectMotif, setRejectMotif] = useState('');

  // Form state
  const [formEmployeId, setFormEmployeId] = useState('');
  const [formMontant, setFormMontant] = useState('');
  const [formMotif, setFormMotif] = useState('');
  const [formDateRemboursement, setFormDateRemboursement] = useState('');

  const handleCreate = useCallback(async () => {
    if (!formEmployeId || !formMontant || !formMotif) {
      toast.warning('Veuillez remplir tous les champs obligatoires');
      return;
    }
    try {
      await createAvance({
        employeId: formEmployeId,
        montant: parseInt(formMontant, 10),
        motif: formMotif,
        ...(formDateRemboursement ? { dateRemboursement: formDateRemboursement } : {}),
      });
      setShowCreateModal(false);
      setFormEmployeId('');
      setFormMontant('');
      setFormMotif('');
      setFormDateRemboursement('');
    } catch { /* handled in hook */ }
  }, [formEmployeId, formMontant, formMotif, formDateRemboursement, createAvance]);

  const handleReject = useCallback(async () => {
    if (!rejectModal || !rejectMotif.trim()) {
      toast.warning('Le motif est obligatoire');
      return;
    }
    try {
      await rejectAvance({ id: rejectModal.id, motif: rejectMotif });
      setRejectModal(null);
      setRejectMotif('');
    } catch { /* handled in hook */ }
  }, [rejectModal, rejectMotif, rejectAvance]);

  const columns = [
    {
      key: 'employeNom',
      label: 'Employé',
      primary: true,
      render: (val: string) => <span className="font-medium text-content-primary">{val}</span>,
    },
    {
      key: 'montant',
      label: 'Montant',
      render: (val: number) => (
        <span className="font-bold text-status-success">{val.toLocaleString()} FCFA</span>
      ),
    },
    {
      key: 'motif',
      label: 'Motif',
      hideOnMobile: true,
      render: (val: string) => (
        <span className="text-content-muted text-xs line-clamp-1 max-w-[200px]" title={val}>{val}</span>
      ),
    },
    {
      key: 'dateDemande',
      label: 'Date',
      hideOnMobile: true,
      render: (val: string) => (
        <span className="text-content-muted text-xs font-mono">
          {new Date(val).toLocaleDateString('fr-FR')}
        </span>
      ),
    },
    {
      key: 'statut',
      label: 'Statut',
      badge: true,
      render: (val: string) => (
        <Badge
          variant={STATUT_VARIANTS[val] || 'default'}
          value={STATUT_LABELS[val] || val}
          size="sm"
        />
      ),
    },
    ...(isRH
      ? [
          {
            key: 'actions',
            label: 'Actions',
            render: (_: any, item: AvanceSalaire) => (
              <div className="flex gap-1">
                {item.statut === 'PENDING' && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={CheckCircle}
                      onClick={(e) => { e.stopPropagation(); approveAvance(item.id); }}
                      title="Approuver"
                      className="text-status-success hover:bg-status-success-bg h-7 w-7 p-0"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={XCircle}
                      onClick={(e) => { e.stopPropagation(); setRejectModal({ id: item.id }); }}
                      title="Rejeter"
                      className="text-status-danger hover:bg-status-danger-bg h-7 w-7 p-0"
                    />
                  </>
                )}
                {item.statut === 'APPROVED' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Banknote}
                    onClick={(e) => { e.stopPropagation(); payAvance(item.id); }}
                    title="Marquer payée"
                    className="text-status-info hover:bg-status-info-bg h-7 w-7 p-0"
                  />
                )}
                {item.statut === 'PAID' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={ArrowDownCircle}
                    onClick={(e) => { e.stopPropagation(); deductAvance({ id: item.id }); }}
                    title="Déduire du salaire"
                    className="text-status-warning hover:bg-status-warning-bg h-7 w-7 p-0"
                  />
                )}
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 p-2 border-b border-edge flex justify-between items-center bg-surface-base/50">
        <h3 className="font-bold text-content-primary flex items-center gap-2 text-xs">
          <Banknote size={14} className="text-status-warning" />
          Avances sur Salaire
        </h3>
        {isRH && (
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => setShowCreateModal(true)}
            className="h-7 text-xs"
          >
            Nouvelle Avance
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-hidden">
        <ResponsiveTable
          data={avances}
          columns={columns}
          emptyMessage="Aucune avance sur salaire."
          loading={isLoading}
          maxHeight="100%"
          density="compact"
          className="border-0 rounded-none h-full"
          headerClassName="bg-surface-base sticky top-0"
        />
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowCreateModal(false)}>
          <div className="bg-surface-base border border-edge rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-edge flex items-center justify-between">
              <h3 className="text-sm font-bold text-content-primary">Nouvelle Avance sur Salaire</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-content-muted hover:text-content-primary">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-content-muted mb-1">Employé *</label>
                <select
                  className="w-full px-3 py-2 bg-surface border border-edge rounded-lg text-sm text-content-primary focus:ring-1 focus:ring-status-success/50 outline-none"
                  value={formEmployeId}
                  onChange={(e) => setFormEmployeId(e.target.value)}
                >
                  <option value="">Sélectionner un employé</option>
                  {employes?.map((emp: any) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.prenom} {emp.nom} — {emp.poste}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-content-muted mb-1">Montant (FCFA) *</label>
                <input
                  type="number"
                  className="w-full px-3 py-2 bg-surface border border-edge rounded-lg text-sm text-content-primary focus:ring-1 focus:ring-status-success/50 outline-none font-mono"
                  value={formMontant}
                  onChange={(e) => setFormMontant(e.target.value)}
                  placeholder="Ex: 150000"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-content-muted mb-1">Motif *</label>
                <textarea
                  className="w-full px-3 py-2 bg-surface border border-edge rounded-lg text-sm text-content-primary focus:ring-1 focus:ring-status-success/50 outline-none resize-none"
                  rows={2}
                  value={formMotif}
                  onChange={(e) => setFormMotif(e.target.value)}
                  placeholder="Raison de la demande..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-content-muted mb-1">Date remboursement souhaitée</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 bg-surface border border-edge rounded-lg text-sm text-content-primary focus:ring-1 focus:ring-status-success/50 outline-none font-mono"
                  value={formDateRemboursement}
                  onChange={(e) => setFormDateRemboursement(e.target.value)}
                />
              </div>
            </div>
            <div className="p-4 border-t border-edge flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowCreateModal(false)}>
                Annuler
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleCreate}
                isLoading={isCreating}
              >
                Créer la Demande
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setRejectModal(null)}>
          <div className="bg-surface-base border border-edge rounded-xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-edge">
              <h3 className="text-sm font-bold text-status-danger">Rejeter l'avance</h3>
            </div>
            <div className="p-4">
              <label className="block text-xs font-medium text-content-muted mb-1">Motif de rejet *</label>
              <textarea
                className="w-full px-3 py-2 bg-surface border border-edge rounded-lg text-sm text-content-primary focus:ring-1 focus:ring-status-danger/50 outline-none resize-none"
                rows={3}
                value={rejectMotif}
                onChange={(e) => setRejectMotif(e.target.value)}
                placeholder="Indiquer la raison du rejet..."
                autoFocus
              />
            </div>
            <div className="p-4 border-t border-edge flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setRejectModal(null); setRejectMotif(''); }}>
                Annuler
              </Button>
              <Button variant="danger" size="sm" onClick={handleReject}>
                Confirmer le Rejet
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
