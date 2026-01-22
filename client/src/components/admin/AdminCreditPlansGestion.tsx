import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, Trash2, Save, FileText, Check, X, AlertTriangle, Calculator, CalendarClock, Percent, Wallet, Info } from 'lucide-react';
import { Card, Button, Badge, FormField, SelectField, TextareaField, Modal, EmptyState, LoadingSpinner, ConfirmDialog } from '../ui';
import { creditPlanApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { usePermissions } from '../auth/ProtectedFeature';

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

  // Form Data
  const [formData, setFormData] = useState({
    nom: '',
    description: '',
    type_credit: 'Personnel',
    montant_min: '',
    montant_max: '',
    taux_interet: '20',
    duree_valeur: '30',
    duree_unite: 'Jour',
    frequence_remboursement: 'Journalier',
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
      type_credit: 'Personnel',
      montant_min: '',
      montant_max: '',
      taux_interet: '10',
      duree_valeur: '30',
      duree_unite: 'Jour',
      frequence_remboursement: 'Journalier',
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
          <Button variant="primary" icon={Plus} onClick={() => {
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <Card key={plan.id} className={`group relative transition-all duration-300 hover:border-teal-500/50 ${!plan.actif ? 'opacity-75' : ''}`}>
              <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => handleEdit(plan)}
                  className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
                >
                  <Edit size={14} />
                </button>
                <button 
                  onClick={() => handleDelete(plan.id, plan.nom)}
                  className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-red-400 hover:bg-red-400/10"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="flex items-start gap-3 mb-3">
                <div className={`p-2.5 rounded-xl ${plan.actif ? 'bg-teal-500/10 text-teal-500' : 'bg-slate-700/50 text-slate-500'}`}>
                  <Wallet size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-white leading-tight">{plan.nom}</h3>
                  <p className="text-xs text-slate-400 mt-1">{plan.type_credit}</p>
                </div>
              </div>

              <div className="space-y-2 mb-4 bg-slate-800/40 p-3 rounded-lg border border-slate-700/50">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Taux Intérêt:</span>
                  <span className="font-semibold text-white">{plan.taux_interet}%</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Durée:</span>
                  <span className="font-semibold text-white">{plan.duree_valeur} {plan.duree_unite}(s)</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Remboursement:</span>
                  <span className="font-semibold text-white">{plan.frequence_remboursement}</span>
                </div>
                {(plan.montant_min || plan.montant_max) && (
                  <div className="flex justify-between text-xs pt-2 border-t border-slate-700/50 mt-2">
                    <span className="text-slate-500">Limites:</span>
                    <span className="font-medium text-emerald-400">
                      {plan.montant_min ? `${Number(plan.montant_min).toLocaleString()} ` : '0 '} 
                      - {plan.montant_max ? `${Number(plan.montant_max).toLocaleString()}` : '∞'} FCFA
                    </span>
                  </div>
                )}
              </div>
              
              {!plan.actif && (
                <div className="mb-3">
                   <Badge value="Inactif" variant="neutral" size="sm" />
                </div>
              )}

              {onLaunchCredit && (
                <Button 
                  variant="secondary" 
                  size="sm" 
                  fullWidth 
                  onClick={() => onLaunchCredit(plan)}
                  className="mt-2"
                >
                  Utiliser ce plan
                </Button>
              )}
            </Card>
          ))}
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
              options={[
                { value: 'Personnel', label: 'Personnel' },
                { value: 'Commercial', label: 'Commercial' }
              ]}
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
                    { value: 'Jour', label: 'Jours' },
                    { value: 'Semaine', label: 'Semaines' },
                    { value: 'Mois', label: 'Mois' }
                  ]}
                />


                <SelectField
                  label="Remboursement"
                  name="frequence_remboursement"
                  value={formData.frequence_remboursement}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData({...formData, frequence_remboursement: e.target.value})}
                  options={[
                    { value: 'Journalier', label: 'Journalier' },
                    { value: 'Hebdomadaire', label: 'Hebdomadaire' },
                    { value: 'Bimensuel', label: 'Bimensuel' },
                    { value: 'Mensuel', label: 'Mensuel' }
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
