import { useState, useEffect, useCallback } from 'react';
import { Layout, Edit, Trash2, Rocket } from 'lucide-react';
import { Card, Button, Badge, EmptyState, LoadingSpinner } from '../ui';
import { tontinePlanApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import ConfirmDialog from '../ui/ConfirmDialog';
import { usePermissions } from '../auth/ProtectedFeature';
import { useCurrency } from '../../contexts/CurrencyContext';
import { TontinePlanWizard } from './TontinePlanWizard';
import type { TontinePlan } from '@shared/schema/tontines';

interface AdminTontinePlansGestionProps {
  showForm?: boolean;
  onHideForm?: () => void;
  onLaunchTontine?: (plan: TontinePlan) => void;
}

export default function AdminTontinePlansGestion({ showForm: externalShowForm, onHideForm, onLaunchTontine }: AdminTontinePlansGestionProps) {
  const { hasPermission } = usePermissions();
  const { currency } = useCurrency();
  const canManagePlans = hasPermission('tontines', 'manage') || hasPermission('admin', 'manage');

  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();
  const [plans, setPlans] = useState<TontinePlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [editPlan, setEditPlan] = useState<TontinePlan | null>(null);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const data = await tontinePlanApi.getAll();
      setPlans(data || []);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des plans'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  // Open wizard from external trigger
  useEffect(() => {
    if (externalShowForm) setShowWizard(true);
  }, [externalShowForm]);

  const handleEdit = (plan: TontinePlan) => {
    setEditPlan(plan);
    setShowWizard(true);
  };

  const handleWizardClose = () => {
    setShowWizard(false);
    setEditPlan(null);
    if (onHideForm) onHideForm();
  };

  const handleWizardSave = async (data: Partial<TontinePlan>) => {
    if (editPlan) {
      await tontinePlanApi.update(editPlan.id, data);
    } else {
      await tontinePlanApi.create(data);
    }
    await loadPlans();
  };

  const handleDelete = (id: string) => {
    openConfirm({
      title: 'Supprimer ce modèle ?',
      message: 'Les tontines existantes basées sur ce modèle ne seront pas affectées.',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await tontinePlanApi.delete(id);
          toast.success('Modèle supprimé');
          await loadPlans();
        } catch (error) {
          toast.error(handleApiError(error, 'Erreur lors de la suppression du modèle'));
        }
      }
    });
  };

  if (loading && plans.length === 0) {
    return <LoadingSpinner size="lg" />;
  }

  return (
    <div className="space-y-6">
      {/* Header removed and moved to parent for consistency */}

      {plans.length === 0 ? (
        <EmptyState
          icon={Layout}
          title="Aucun modèle défini"
          description="Créez des modèles pour simplifier la création de vos tontines."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <Card key={plan.id} className="p-5 bg-surface-base border-edge hover:border-accent/50 transition-all duration-300 flex flex-col h-full group">
              <div className="flex justify-between items-start mb-4 gap-3 h-14">
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-content-primary text-base leading-tight line-clamp-2 group-hover:text-accent transition-colors">
                    {plan.nom}
                  </h4>
                  <p className="text-xs text-content-muted line-clamp-1 mt-1 font-medium">
                    {plan.description}
                  </p>
                </div>
                <Badge 
                  value={plan.actif ? 'Actif' : 'Inactif'} 
                  variant={plan.actif ? 'success' : 'neutral'} 
                  size="sm" 
                  className="flex-shrink-0"
                />
              </div>

              <div className="space-y-3 mb-6 bg-surface/30 p-3 rounded-lg border border-edge/50">
                <div className="flex justify-between text-sm items-baseline">
                  <span className="text-content-muted font-medium">Cotisation:</span>
                  <span className="font-bold text-accent text-base">{(plan.montantCotisation ?? 0).toLocaleString()} {currency.symbol}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-content-muted font-medium">Membres:</span>
                  <span className="text-content-secondary font-semibold">{plan.nombreMembres}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-content-muted font-medium">Fréquence:</span>
                  <span className="text-content-secondary font-semibold">{plan.frequence}</span>
                </div>
              </div>

              {onLaunchTontine && (
                <div className="mb-4">
                  <Button
                    variant="primary"
                    size="sm"
                    fullWidth
                    icon={Rocket}
                    onClick={() => onLaunchTontine(plan)}
                    className="shadow-lg shadow-accent/20"
                  >
                    Lancer une tontine
                  </Button>
                </div>
              )}

              {canManagePlans && (
                <div className="flex gap-2 border-t border-edge pt-4 mt-auto">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Edit}
                    onClick={() => handleEdit(plan)}
                    className="flex-1 justify-center bg-surface/50 border-edge hover:bg-surface-elevated hover:text-content-primary"
                  >
                    Modifier
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Trash2}
                    onClick={() => handleDelete(plan.id)}
                    className="text-content-muted hover:text-status-danger hover:bg-status-danger-bg border border-transparent hover:border-status-danger/20"
                  />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <TontinePlanWizard
        isOpen={showWizard}
        onClose={handleWizardClose}
        onSave={handleWizardSave}
        editPlan={editPlan ?? undefined}
      />

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={closeConfirm}
        onConfirm={handleConfirm}
        title={confirmState.title || ''}
        message={confirmState.message || ''}
        variant={confirmState.variant}
      />
    </div>
  );
}
