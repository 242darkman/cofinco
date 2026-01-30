import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, Trash2, Save, FileText, Check, X, AlertTriangle, Calculator, CalendarClock, Percent, Wallet, Info } from 'lucide-react';
import { Card, Button, Badge, FormField, SelectField, TextareaField, Modal, EmptyState, LoadingSpinner, ConfirmDialog, ResponsiveTable, TableColumn } from '../ui';
import { creditPlanApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { usePermissions } from '../auth/ProtectedFeature';
import { TYPE_CREDIT_OPTIONS } from '@shared/enum/status-constants';

interface CreditPlan {
  id: string;
  nom: string;
  description: string;
  type_credit: string;
  montant_min: number;
  montant_max: number;
  taux_interet: number;
  duree_valeur: number;
  duree_unite: string;
  frequence_remboursement: string;
  frais_dossier: number;
  conditions: string[];
  actif: boolean;
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
  // RBAC
  const { hasPermission } = usePermissions();
  const canManagePlans = hasPermission('admin', 'manage') || hasPermission('credits', 'manage');

  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();

  const [plans, setPlans] = useState<CreditPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<CreditPlan | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Form Data
  const [formData, setFormData] = useState({
    nom: '',
    description: '',
    type_credit: 'PERSONAL',
    montant_min: '',
    montant_max: '',
    taux_interet: '20',
    duree_valeur: '30',
    duree_unite: 'DAY',
    frequence_remboursement: 'DAILY',
    frais_dossier: '',
    conditions: '',
    actif: true
  });

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

  const totalPages = Math.ceil(plans.length / itemsPerPage);
  const paginatedPlans = plans.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const columns: TableColumn<CreditPlan>[] = [
    { 
      key: 'nom', 
      label: 'Plan', 
      primary: true,
      format: (val, item) => (
        <div>
          <div className="font-bold text-white">{val}</div>
          <div className="text-xs text-slate-400">{item.description?.substring(0, 40)}{(item.description?.length || 0) > 40 ? '...' : ''}</div>
        </div>
      )
    },
    { 
      key: 'type_credit', 
      label: 'Type', 
      badge: true,
      badgeClassName: 'bg-blue-500/10 text-blue-400 border-blue-500/20' 
    },
    { 
      key: 'taux_interet', 
      label: 'Taux',
      format: (val) => `${val}%` 
    },
    { 
      key: 'duree_valeur', 
      label: 'Durée',
      format: (val, item) => `${val} ${item.duree_unite || ''}(s)`
    },
    { 
      key: 'frequence_remboursement', 
      label: 'Remboursement' 
    },
    { 
      key: 'montant_min', 
      label: 'Limites (FCFA)', 
      format: (_, item) => (
        <span className="text-emerald-400 text-xs font-medium">
          {item.montant_min ? Number(item.montant_min).toLocaleString() : '0'} 
          {' - '}
          {item.montant_max ? Number(item.montant_max).toLocaleString() : '∞'}
        </span>
      )
    },
    { 
      key: 'actif', 
      label: 'Statut', 
      format: (val) => (
        <Badge 
          value={val ? 'Actif' : 'Inactif'} 
          variant={val ? 'success' : 'neutral'} 
        />
      )
    },
  ];

  useEffect(() => {
    if (showForm) {
      resetForm();
      setEditMode(false);
      setShowModal(true);
    }
  }, [showForm]);

  const resetForm = () => {
    setFormData({
      nom: '',
      description: '',
      type_credit: 'PERSONAL',
      montant_min: '',
      montant_max: '',
      taux_interet: '10',
      duree_valeur: '30',
      duree_unite: 'DAY',
      frequence_remboursement: 'DAILY',
      frais_dossier: '',
      conditions: '',
      actif: true
    });
  };

  const handleEdit = (plan: CreditPlan) => {
    setSelectedPlan(plan);
    setFormData({
      nom: plan.nom,
      description: plan.description || '',
      type_credit: plan.type_credit,
      montant_min: plan.montant_min?.toString() || '',
      montant_max: plan.montant_max?.toString() || '',
      taux_interet: plan.taux_interet.toString(),
      duree_valeur: plan.duree_valeur.toString(),
      duree_unite: plan.duree_unite,
      frequence_remboursement: plan.frequence_remboursement,
      frais_dossier: plan.frais_dossier?.toString() || '',
      conditions: plan.conditions ? plan.conditions.join('\n') : '',
      actif: plan.actif
    });
    setEditMode(true);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditMode(false);
    setSelectedPlan(null);
    resetForm();
    if (onHideForm) onHideForm();
  };

  const handleSubmit = async () => {
    if (!formData.nom) {
      toast.error('Le nom est obligatoire');
      return;
    }

    try {
      setSubmitting(true);
      
      const payload = {
        nom: formData.nom,
        description: formData.description,
        type_credit: formData.type_credit,
        montant_min: formData.montant_min || null,
        montant_max: formData.montant_max || null,
        taux_interet: formData.taux_interet,
        duree_valeur: parseInt(formData.duree_valeur), // duree_valeur usually integer
        duree_unite: formData.duree_unite,
        frequence_remboursement: formData.frequence_remboursement,
        frais_dossier: formData.frais_dossier || null,
        conditions: formData.conditions ? formData.conditions.split('\n').filter(s => s.trim()) : [],
        actif: formData.actif
      };

      if (editMode && selectedPlan) {
        await creditPlanApi.update(selectedPlan.id, payload);
        toast.success('Plan modifié avec succès');
      } else {
        await creditPlanApi.create(payload);
        toast.success('Plan créé avec succès');
      }

      await loadPlans();
      handleCloseModal();
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de la sauvegarde'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id: string, nom: string) => {
    openConfirm({
      title: 'Supprimer le plan ?',
      message: `Êtes-vous sûr de vouloir supprimer le plan "${nom}" ?`,
      variant: 'danger',
      onConfirm: async () => {
        try {
          await creditPlanApi.delete(id);
          toast.success('Plan supprimé');
          loadPlans();
        } catch (error) {
          toast.error(handleApiError(error, 'Impossible de supprimer'));
        }
      }
    });
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
          <h2 className="text-xl font-bold text-white">Plans de Crédit</h2>
          <Button variant="primary" size="sm" icon={Plus} onClick={() => {
            resetForm();
            setEditMode(false);
            setShowModal(true);
          }}>
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
            onClick: () => setShowModal(true)
          } : undefined}
        />
      ) : (
        <ResponsiveTable
          data={paginatedPlans}
          columns={columns}
          density="compact"
          actions={(plan) => (
            <div className="flex items-center gap-1">
              {onLaunchCredit && (
                <Button 
                  variant="secondary" 
                  size="xs" 
                  onClick={(e) => { e.stopPropagation(); onLaunchCredit(plan); }}
                  className="mr-2"
                >
                  Utiliser
                </Button>
              )}
              <button 
                onClick={(e) => { e.stopPropagation(); handleEdit(plan); }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                title="Modifier"
              >
                <Edit size={16} />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); handleDelete(plan.id, plan.nom); }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                title="Supprimer"
              >
                <Trash2 size={16} />
              </button>
            </div>
          )}
          pagination={{
            page: currentPage,
            totalPages,
            onPageChange: setCurrentPage
          }}
          onRowClick={(plan) => handleEdit(plan)}
        />
      )}

      {/* Modal CRUD */}
      <Modal
        isOpen={showModal}
        onClose={handleCloseModal}
        title={editMode ? "Modifier le plan" : "Nouveau plan de crédit"}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              label="Nom du plan"
              name="nom"
              value={formData.nom}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({...formData, nom: e.target.value})}
              placeholder="Ex: Prêt Express 30J"
              required
            />
             <SelectField
              label="Type de Crédit"
              name="type_credit"
              value={formData.type_credit}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData({...formData, type_credit: e.target.value})}
              options={TYPE_CREDIT_OPTIONS}
            />
            <TextareaField
              label="Description"
              name="description"
              value={formData.description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData({...formData, description: e.target.value})}
              containerClassName="md:col-span-2"
            />
            
            <div className="md:col-span-2 border-t border-slate-700/50 my-2 pt-4">
              <h4 className="text-sm font-semibold text-teal-400 mb-3 flex items-center gap-2">
                <Percent size={14} /> Conditions Financières
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <FormField
                  label="Taux d'intérêt (%)"
                  name="taux_interet"
                  type="number"
                  value={formData.taux_interet}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({...formData, taux_interet: e.target.value})}
                />
                
                <FormField
                  label="Durée"
                  name="duree_valeur"
                  type="number"
                  value={formData.duree_valeur}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({...formData, duree_valeur: e.target.value})}
                />
                
                <SelectField
                  label="Unité"
                  name="duree_unite"
                  value={formData.duree_unite}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData({...formData, duree_unite: e.target.value})}
                  options={[
                    { value: 'DAY', label: 'Jours' },
                    { value: 'WEEK', label: 'Semaines' },
                    { value: 'MONTH', label: 'Mois' }
                  ]}
                />


                <SelectField
                  label="Remboursement"
                  name="frequence_remboursement"
                  value={formData.frequence_remboursement}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData({...formData, frequence_remboursement: e.target.value})}
                  options={[
                    { value: 'DAILY', label: 'Journalier' },
                    { value: 'WEEKLY', label: 'Hebdomadaire' },
                    { value: 'BI_MONTHLY', label: 'Bimensuel' },
                    { value: 'MONTHLY', label: 'Mensuel' }
                  ]}
                />
              </div>
            </div>

            <div className="md:col-span-2 border-t border-slate-700/50 my-2 pt-4">
              <h4 className="text-sm font-semibold text-emerald-400 mb-3 flex items-center gap-2">
                <Wallet size={14} /> Limites & Frais
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <FormField
                  label="Montant Min (FCFA)"
                  name="montant_min"
                  type="number"
                  value={formData.montant_min}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({...formData, montant_min: e.target.value})}
                />
                <FormField
                  label="Montant Max (FCFA)"
                  name="montant_max"
                  type="number"
                  value={formData.montant_max}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({...formData, montant_max: e.target.value})}
                />
                <FormField
                  label="Frais Dossier (FCFA)"
                  name="frais_dossier"
                  type="number"
                  value={formData.frais_dossier}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({...formData, frais_dossier: e.target.value})}
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <TextareaField
                label="Conditions (une par ligne)"
                name="conditions"
                value={formData.conditions}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData({...formData, conditions: e.target.value})}
                placeholder="- 3 mois d'ancienneté&#10;- Garant requis"
                rows={3}
              />
            </div>

            <div className="md:col-span-2 pt-2">
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.actif}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({...formData, actif: e.target.checked})}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-teal-500 focus:ring-teal-500"
                />
                <span className="text-sm">Plan actif (visible pour les nouvelles demandes)</span>
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-slate-700">
            <Button
              variant="primary"
              icon={Save}
              onClick={handleSubmit}
              isLoading={submitting}
              fullWidth
            >
              Enregistrer
            </Button>
            <Button
              variant="secondary"
              onClick={handleCloseModal}
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
        confirmText={confirmState.confirmText}
      />
    </div>
  );
}
