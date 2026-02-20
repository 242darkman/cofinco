import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, Power, Calculator, AlertTriangle, ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, Badge, EmptyState, LoadingSpinner, ConfirmDialog } from '../ui';
import { creditPlanApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { usePermissions } from '../auth/ProtectedFeature';
import { useCurrency } from '../../contexts/CurrencyContext';
import { CreditPlanWizard } from './CreditPlanWizard';
import { typeCreditLabel, interestMethodLabel, amortizationLabel, dureeUniteLabel, frequenceLabel } from '../../lib/credit-labels';

interface CreditPlan {
  id: string;
  nom: string;
  description: string;
  typeCredit: string;
  montantMin: number;
  montantMax: number;
  tauxInteret: number;
  dureeValeur: number;
  dureeUnite: string;
  frequenceRemboursement: string;
  interestMethod: string;
  amortizationType: string;
  isActive: boolean;
  version: number;
  fees?: any[];
}

interface AdminCreditPlansGestionProps {
  showForm?: boolean;
  onHideForm?: () => void;
  onLaunchCredit?: (plan: any) => void;
}

export default function AdminCreditPlansGestion({
  showForm = false,
  onHideForm,
  onLaunchCredit
}: AdminCreditPlansGestionProps) {
  const { hasPermission } = usePermissions();
  const { label } = useCurrency();
  const canManagePlans = hasPermission('admin', 'manage') || hasPermission('credits', 'manage');

  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();

  const [plans, setPlans] = useState<CreditPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [editPlan, setEditPlan] = useState<CreditPlan | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);

  const loadPlans = useCallback(async () => {
    try {
      setLoading(true);
      const data = await creditPlanApi.getAll();
      setPlans(data || []);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur chargement plans'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const totalPages = Math.ceil(plans.length / pageSize);
  const paginatedPlans = plans.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  useEffect(() => {
    if (showForm) {
      setEditPlan(null);
      setShowWizard(true);
    }
  }, [showForm]);

  const handleEdit = (plan: CreditPlan) => {
    setEditPlan(plan);
    setShowWizard(true);
  };

  const handleCloseWizard = () => {
    setShowWizard(false);
    setEditPlan(null);
    if (onHideForm) onHideForm();
  };

  const handleSave = async (data: any) => {
    const { fees, expectedVersion, ...planData } = data;
    if (editPlan) {
      await creditPlanApi.update(editPlan.id, { ...planData, fees, expectedVersion });
    } else {
      await creditPlanApi.create({ ...planData, fees });
    }
    await loadPlans();
  };

  const handleToggleActive = (plan: CreditPlan) => {
    const action = plan.isActive ? 'désactiver' : 'activer';
    openConfirm({
      title: `${plan.isActive ? 'Désactiver' : 'Activer'} le plan ?`,
      message: `Êtes-vous sûr de vouloir ${action} le plan "${plan.nom}" ?`,
      variant: plan.isActive ? 'warning' : 'info',
      confirmText: plan.isActive ? 'Désactiver' : 'Activer',
      onConfirm: async () => {
        try {
          await creditPlanApi.update(plan.id, { isActive: !plan.isActive, expectedVersion: plan.version });
          toast.success(`Plan ${plan.isActive ? 'désactivé' : 'activé'}`);
          loadPlans();
        } catch (error) {
          toast.error(handleApiError(error, `Impossible de ${action}`));
        }
      }
    });
  };

  const formatDuration = (val: number, unit: string) => {
    return `${val} ${dureeUniteLabel(unit, val > 1)}`;
  };

  if (!canManagePlans) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Accès refusé"
        description="Vous n'avez pas les permissions nécessaires."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header if standalone */}
      {!onHideForm && (
        <div className="flex justify-between items-center">
          <h2 className="text-base font-bold text-content-primary">Plans de Crédit</h2>
          <Button variant="primary" size="sm" icon={Plus} onClick={() => {
            setEditPlan(null);
            setShowWizard(true);
          }} className="h-7 px-3 text-xs">
            Nouveau Plan
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-8">
          <LoadingSpinner size="lg" />
        </div>
      ) : plans.length === 0 ? (
        <EmptyState
          icon={Calculator}
          title="Aucun plan de crédit"
          description="Créez des plans pour accélérer la saisie des demandes."
          action={!onHideForm ? {
            label: "Créer un plan",
            onClick: () => setShowWizard(true)
          } : undefined}
        />
      ) : (
        <div className="space-y-2">
          <div className="bg-surface/40 border border-edge-subtle rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-base/50 border-b border-edge-subtle">
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-content-muted uppercase tracking-wider">Plan</th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-content-muted uppercase tracking-wider">Type</th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-content-muted uppercase tracking-wider">Méthode</th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-content-muted uppercase tracking-wider">Taux</th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-content-muted uppercase tracking-wider">Amort.</th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-content-muted uppercase tracking-wider">Durée</th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-content-muted uppercase tracking-wider">Fréquence</th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-content-muted uppercase tracking-wider">{label('Limites')}</th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-content-muted uppercase tracking-wider">Statut</th>
                    <th className="px-3 py-2 text-right text-[10px] font-medium text-content-muted uppercase tracking-wider w-20">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge/30">
                  {paginatedPlans.map((plan) => (
                    <tr key={plan.id} className="hover:bg-surface-elevated/20 transition-colors cursor-pointer" onClick={() => handleEdit(plan)}>
                      <td className="px-3 py-2">
                        <div>
                          <div className="font-bold text-content-primary text-xs">{plan.nom}</div>
                          <div className="text-[10px] text-content-muted">
                            {plan.description?.substring(0, 40)}{(plan.description?.length || 0) > 40 ? '...' : ''}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center justify-center w-24 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-status-info-bg text-status-info border border-status-info/20">
                          {typeCreditLabel(plan.typeCredit)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-content-secondary">
                        {interestMethodLabel(plan.interestMethod)}
                      </td>
                      <td className="px-3 py-2 text-xs text-content-secondary">
                        {plan.tauxInteret}%
                      </td>
                      <td className="px-3 py-2 text-xs text-content-secondary">
                        {amortizationLabel(plan.amortizationType)}
                      </td>
                      <td className="px-3 py-2 text-xs text-content-secondary">
                        {formatDuration(plan.dureeValeur, plan.dureeUnite)}
                      </td>
                      <td className="px-3 py-2 text-xs text-content-secondary">
                        {frequenceLabel(plan.frequenceRemboursement)}
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-status-success text-[10px] font-medium">
                          {plan.montantMin ? Number(plan.montantMin).toLocaleString() : '0'}
                          {' - '}
                          {plan.montantMax ? Number(plan.montantMax).toLocaleString() : '\u221E'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="w-20">
                          <Badge
                            value={plan.isActive ? 'Actif' : 'Inactif'}
                            variant={plan.isActive ? 'success' : 'neutral'}
                            className="w-full justify-center text-[10px] py-0.5"
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {onLaunchCredit && (
                            <Button
                              variant="secondary"
                              size="xs"
                              onClick={(e) => { e.stopPropagation(); onLaunchCredit(plan); }}
                              className="mr-2 h-6 text-[10px]"
                            >
                              Utiliser
                            </Button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleEdit(plan); }}
                            className="p-1 rounded hover:bg-surface-elevated text-content-muted hover:text-content-primary transition-colors"
                            title="Modifier"
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleToggleActive(plan); }}
                            className={`p-1 rounded transition-colors ${
                              plan.isActive
                                ? "hover:bg-status-warning-bg text-content-muted hover:text-status-warning"
                                : "hover:bg-status-success-bg text-content-muted hover:text-status-success"
                            }`}
                            title={plan.isActive ? 'Désactiver' : 'Activer'}
                          >
                            <Power size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination Controls */}
          <div className="p-2 border border-edge-subtle bg-surface/40 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-xs text-content-muted">
              <span className="hidden sm:inline">
                {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, plans.length)} sur {plans.length}
              </span>
              <span className="sm:hidden">
                Page {currentPage}/{totalPages || 1}
              </span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2 py-1 bg-surface-base border border-edge rounded text-[10px] text-content-secondary focus:border-accent outline-none"
              >
                <option value={8}>8 / page</option>
                <option value={10}>10 / page</option>
                <option value={20}>20 / page</option>
                <option value={50}>50 / page</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="p-1 rounded hover:bg-surface-elevated text-content-muted hover:text-content-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronsLeft size={14} />
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1 rounded hover:bg-surface-elevated text-content-muted hover:text-content-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={14} />
              </button>

              <div className="flex items-center gap-1 mx-1">
                <span className="text-xs font-medium text-content-primary px-2">
                  {currentPage} / {Math.max(1, totalPages)}
                </span>
              </div>

              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || totalPages === 0}
                className="p-1 rounded hover:bg-surface-elevated text-content-muted hover:text-content-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={14} />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages || totalPages === 0}
                className="p-1 rounded hover:bg-surface-elevated text-content-muted hover:text-content-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronsRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credit Plan Wizard */}
      <CreditPlanWizard
        key={editPlan?.id ?? 'new'}
        isOpen={showWizard}
        onClose={handleCloseWizard}
        onSave={handleSave}
        editPlan={editPlan}
      />

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={closeConfirm}
        onConfirm={handleConfirm}
        title={confirmState.title || ''}
        message={confirmState.message || ''}
        variant={confirmState.variant}
        confirmText={confirmState.confirmText}
      />
    </div>
  );
}
