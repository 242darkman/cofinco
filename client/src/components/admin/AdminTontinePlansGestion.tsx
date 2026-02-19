import React, { useState, useEffect, useCallback } from 'react';
import { Layout, Edit, Trash2, Plus, Save, Settings, AlertTriangle, Rocket } from 'lucide-react';
import { Card, Button, Badge, FormField, SelectField, Modal, EmptyState, LoadingSpinner } from '../ui';
import { tontinePlanApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import ConfirmDialog from '../ui/ConfirmDialog';
import { usePermissions } from '../auth/ProtectedFeature';
import { useCurrency } from '../../contexts/CurrencyContext';

interface TontinePlan {
  id: string;
  nom: string;
  description: string;
  montant_cotisation: number;
  nombre_membres: number;
  frequence: string;
  type_distribution: string;
  taux_plateforme: number;
  intervalle_cotisation: number;
  actif: boolean;
}

interface AdminTontinePlansGestionProps {
  showForm?: boolean;
  onHideForm?: () => void;
  onLaunchTontine?: (plan: TontinePlan) => void;
}

export default function AdminTontinePlansGestion({ showForm: externalShowForm, onHideForm, onLaunchTontine }: AdminTontinePlansGestionProps) {
  const { hasPermission } = usePermissions();
  const { currency, label } = useCurrency();
  const canManagePlans = hasPermission('tontines', 'manage') || hasPermission('admin', 'manage');

  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();
  const [plans, setPlans] = useState<TontinePlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [internalShowForm, setInternalShowForm] = useState(false);
  const showForm = !!externalShowForm || internalShowForm;
  const [editMode, setEditMode] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    nom: '',
    description: '',
    montant_cotisation: '',
    nombre_membres: '12',
    frequence: 'Mensuel',
    type_distribution: 'Rotative',
    taux_plateforme: '5',
    intervalle_cotisation: '1',
    actif: true
  });

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

  const resetForm = () => {
    setFormData({
      nom: '',
      description: '',
      montant_cotisation: '',
      nombre_membres: '12',
      frequence: 'Mensuel',
      type_distribution: 'Rotative',
      taux_plateforme: '5',
      intervalle_cotisation: '1',
      actif: true
    });
    setEditMode(false);
    setSelectedPlanId(null);
  };

  const handleEdit = (plan: TontinePlan) => {
    setFormData({
      nom: plan.nom,
      description: plan.description || '',
      montant_cotisation: (plan.montant_cotisation ?? 0).toString(),
      nombre_membres: (plan.nombre_membres ?? 12).toString(),
      frequence: plan.frequence,
      type_distribution: plan.type_distribution,
      taux_plateforme: (plan.taux_plateforme ?? 5).toString(),
      intervalle_cotisation: (plan.intervalle_cotisation ?? 1).toString(),
      actif: plan.actif
    });
    setSelectedPlanId(plan.id);
    setEditMode(true);
    setInternalShowForm(true);
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        montant_cotisation: parseFloat(formData.montant_cotisation),
        nombre_membres: parseInt(formData.nombre_membres),
        taux_plateforme: parseFloat(formData.taux_plateforme),
        intervalle_cotisation: parseInt(formData.intervalle_cotisation)
      };

      if (editMode && selectedPlanId) {
        await tontinePlanApi.update(selectedPlanId, payload);
        toast.success(`Modèle "${formData.nom}" mis à jour`);
      } else {
        await tontinePlanApi.create(payload);
        toast.success(`Modèle "${formData.nom}" créé`);
      }

      setInternalShowForm(false);
      if (onHideForm) onHideForm();
      resetForm();
      await loadPlans();
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de la sauvegarde'));
    } finally {
      setIsSubmitting(false);
    }
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
                  <span className="font-bold text-accent text-base">{(plan.montant_cotisation ?? 0).toLocaleString()} {currency.symbol}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-content-muted font-medium">Membres:</span>
                  <span className="text-content-secondary font-semibold">{plan.nombre_membres}</span>
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

      <Modal
        isOpen={showForm}
        onClose={() => {
          setInternalShowForm(false);
          if (onHideForm) onHideForm();
          resetForm();
        }}
        title={editMode ? 'Modifier le modèle' : 'Créer un modèle'}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Nom du modèle"
              name="nom"
              value={formData.nom}
              onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
              placeholder="Ex: Tontine Diamant"
              className="sm:col-span-2"
            />
            <FormField
              label="Description"
              name="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Description optionnelle..."
              className="sm:col-span-2"
            />
            <FormField
              label={label('Montant cotisation')}
              name="montant_cotisation"
              inputMode="numeric"
              pattern="[0-9]*"
              value={formData.montant_cotisation}
              onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setFormData({ ...formData, montant_cotisation: v }); }}
            />
            <FormField
              label="Nombre de membres"
              name="nombre_membres"
              inputMode="numeric"
              pattern="[0-9]*"
              value={formData.nombre_membres}
              onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setFormData({ ...formData, nombre_membres: v }); }}
            />
            <SelectField
              label="Fréquence"
              name="frequence"
              value={formData.frequence}
              onChange={(e) => setFormData({ ...formData, frequence: e.target.value })}
              options={[
                { value: 'Quotidien', label: 'Quotidien' },
                { value: 'Hebdomadaire', label: 'Hebdomadaire' },
                { value: 'Bimensuel', label: 'Bimensuel' },
                { value: 'Mensuel', label: 'Mensuel' }
              ]}
            />
            <SelectField
              label="Type de distribution"
              name="type_distribution"
              value={formData.type_distribution}
              onChange={(e) => setFormData({ ...formData, type_distribution: e.target.value })}
              options={[
                { value: 'Rotative', label: 'Rotative (Susu)' },
                { value: 'Accumulation', label: 'Accumulation' }
              ]}
            />
            <FormField
              label="Frais plateforme (%)"
              name="taux_plateforme"
              inputMode="decimal"
              value={formData.taux_plateforme}
              onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'); setFormData({ ...formData, taux_plateforme: v }); }}
            />
            <div className="flex items-center pt-8">
              <label className="flex items-center gap-2 text-content-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.actif}
                  onChange={(e) => setFormData({ ...formData, actif: e.target.checked })}
                  className="w-4 h-4 rounded bg-surface border-edge text-accent focus:ring-accent"
                />
                <span>Modèle actif</span>
              </label>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <Button
              variant="primary"
              fullWidth
              icon={Save}
              onClick={handleSave}
              isLoading={isSubmitting}
            >
              Sauvegarder
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setInternalShowForm(false);
                if (onHideForm) onHideForm();
                resetForm();
              }}
            >
              Annuler
            </Button>
          </div>
        </div>
      </Modal>

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
