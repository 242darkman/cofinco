import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, Trash2, Save, FileText, Check, X, AlertTriangle, Calculator, CalendarClock, Percent, Wallet, Info, ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, Button, Badge, FormField, SelectField, TextareaField, Modal, EmptyState, LoadingSpinner, ConfirmDialog, ResponsiveTable, TableColumn } from '../ui';
import { creditPlanApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { usePermissions } from '../auth/ProtectedFeature';
import { TYPE_CREDIT_OPTIONS } from '@shared/enum/status-constants';
import { useCurrency } from '../../contexts/CurrencyContext';

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
  fraisDossier: number;
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
  const { label } = useCurrency();
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
  const [pageSize, setPageSize] = useState(8);

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

  const totalPages = Math.ceil(plans.length / pageSize);
  const paginatedPlans = plans.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const columns: TableColumn<CreditPlan>[] = [
    { 
      key: 'nom', 
      label: 'Plan', 
      primary: true,
      format: (val, item) => (
        <div>
          <div className="font-bold text-content-primary">{val}</div>
          <div className="text-xs text-content-muted">{item.description?.substring(0, 40)}{(item.description?.length || 0) > 40 ? '...' : ''}</div>
        </div>
      )
    },
    { 
      key: 'typeCredit',
      label: 'Type', 
      badge: true,
      badgeClassName: 'bg-status-info-bg text-status-info border-status-info/20' 
    },
    { 
      key: 'tauxInteret',
      label: 'Taux',
      format: (val) => `${val}%` 
    },
    { 
      key: 'dureeValeur',
      label: 'Durée',
      format: (val, item) => `${val} ${item.dureeUnite || ''}(s)`
    },
    { 
      key: 'frequenceRemboursement',
      label: 'Remboursement' 
    },
    { 
      key: 'montantMin',
      label: label('Limites'),
      format: (_, item) => (
        <span className="text-status-success text-xs font-medium">
          {item.montantMin ? Number(item.montantMin).toLocaleString() : '0'}
          {' - '}
          {item.montantMax ? Number(item.montantMax).toLocaleString() : '∞'}
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
      type_credit: plan.typeCredit,
      montant_min: plan.montantMin?.toString() || '',
      montant_max: plan.montantMax?.toString() || '',
      taux_interet: plan.tauxInteret.toString(),
      duree_valeur: plan.dureeValeur.toString(),
      duree_unite: plan.dureeUnite,
      frequence_remboursement: plan.frequenceRemboursement,
      frais_dossier: plan.fraisDossier?.toString() || '',
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

  const formatDuration = (val: number, unit: string) => {
    const units: Record<string, string> = {
      'DAY': 'Jour',
      'WEEK': 'Semaine',
      'MONTH': 'Mois'
    };
    const label = units[unit] || unit;
    // Mois is invariant, others take 's' if > 1
    const suffix = (val > 1 && unit !== 'MONTH') ? 's' : '';
    return `${val} ${label}${suffix}`;
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
            resetForm();
            setEditMode(false);
            setShowModal(true);
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
            onClick: () => setShowModal(true)
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
                        <th className="px-3 py-2 text-left text-[10px] font-medium text-content-muted uppercase tracking-wider">Taux</th>
                        <th className="px-3 py-2 text-left text-[10px] font-medium text-content-muted uppercase tracking-wider">Durée</th>
                        <th className="px-3 py-2 text-left text-[10px] font-medium text-content-muted uppercase tracking-wider">Remboursement</th>
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
                                <div className="text-[10px] text-content-muted">{plan.description?.substring(0, 40)}{(plan.description?.length || 0) > 40 ? '...' : ''}</div>
                            </div>
                        </td>
                        <td className="px-3 py-2">
                            <span className="inline-flex items-center justify-center w-24 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-status-info-bg text-status-info border border-status-info/20">
                            {plan.typeCredit}
                            </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-content-secondary">
                            {plan.tauxInteret}%
                        </td>
                        <td className="px-3 py-2 text-xs text-content-secondary">
                            {formatDuration(plan.dureeValeur, plan.dureeUnite)}
                        </td>
                        <td className="px-3 py-2 text-xs text-content-secondary">
                            {plan.frequenceRemboursement}
                        </td>
                        <td className="px-3 py-2">
                            <span className="text-status-success text-[10px] font-medium">
                                {plan.montantMin ? Number(plan.montantMin).toLocaleString() : '0'} 
                                {' - '}
                                {plan.montantMax ? Number(plan.montantMax).toLocaleString() : '∞'}
                            </span>
                        </td>
                        <td className="px-3 py-2">
                             <div className="w-20">
                                <Badge 
                                    value={plan.actif ? 'Actif' : 'Inactif'} 
                                    variant={plan.actif ? 'success' : 'neutral'} 
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
                                    onClick={(e) => { e.stopPropagation(); handleDelete(plan.id, plan.nom); }}
                                    className="p-1 rounded hover:bg-status-danger-bg text-content-muted hover:text-status-danger transition-colors"
                                    title="Supprimer"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
                </div>
            </div>

            {/* Advanced Pagination Controls */}
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
            
            <div className="md:col-span-2 border-t border-edge-subtle my-2 pt-4">
              <h4 className="text-sm font-semibold text-accent mb-3 flex items-center gap-2">
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

            <div className="md:col-span-2 border-t border-edge-subtle my-2 pt-4">
              <h4 className="text-sm font-semibold text-status-success mb-3 flex items-center gap-2">
                <Wallet size={14} /> Limites & Frais
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <FormField
                  label={label('Montant Min')}
                  name="montant_min"
                  type="number"
                  value={formData.montant_min}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({...formData, montant_min: e.target.value})}
                />
                <FormField
                  label={label('Montant Max')}
                  name="montant_max"
                  type="number"
                  value={formData.montant_max}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({...formData, montant_max: e.target.value})}
                />
                <FormField
                  label={label('Frais Dossier')}
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
              <label className="flex items-center gap-2 text-content-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.actif}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({...formData, actif: e.target.checked})}
                  className="w-4 h-4 rounded border-edge bg-surface text-accent focus:ring-accent"
                />
                <span className="text-sm">Plan actif (visible pour les nouvelles demandes)</span>
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-edge">
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
