import React, { useState, useEffect, useCallback } from 'react';
import { Plus, AlertTriangle, Check, X, Trash2, Gavel, Scale, FileText, AlertCircle } from 'lucide-react';
import { Card, Badge, Button, IconButton, Modal, FormField, SelectField, EmptyState, TextareaField } from '../../ui';
import ConfirmDialog from '../../ui/ConfirmDialog';
import { tontineRegleApi, tontinePenaliteApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { useConfirmDialog } from '../../../hooks/useConfirmDialog';
import {
  TypeRegleTontine,
  TypeRegleTontineType,
  TYPE_REGLE_TONTINE_LABELS,
  TYPE_REGLE_TONTINE_OPTIONS,
  StatutPenaliteTontine,
  StatutPenaliteTontineType,
  STATUT_PENALITE_TONTINE_LABELS,
} from '@shared/enum/status-constants';

interface TontineRegle {
  id: string;
  tontineId: string;
  typeRegle: string;
  montantPenalite: string | number;
  description: string;
  actif: boolean;
}

interface TontinePenalite {
  id: string;
  montant: string | number;
  motif: string;
  statut: string;
  dateFaute: string;
  datePaiement: string | null;
  tontine_membres: {
    clients: {
      nom: string;
    };
  };
}

interface TontineReglesProps {
  tontineId: string;
}


export default function TontineRegles({ tontineId }: TontineReglesProps) {
  // Confirmation dialog hook
  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();

  const [regles, setRegles] = useState<TontineRegle[]>([]);
  const [penalites, setPenalites] = useState<TontinePenalite[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    typeRegle: TypeRegleTontine.LATE_PENALTY as TypeRegleTontineType,
    montant: 0,
    description: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchRegles = useCallback(async () => {
    try {
      const data = await tontineRegleApi.getByTontine(tontineId);
      setRegles(data || []);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des règles'));
    }
  }, [tontineId]);

  const fetchPenalites = useCallback(async () => {
    setLoading(true);
    try {
      const data = await tontinePenaliteApi.getByTontine(tontineId);
      setPenalites(data || []);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des pénalités'));
    } finally {
      setLoading(false);
    }
  }, [tontineId]);

  useEffect(() => {
    fetchRegles();
    fetchPenalites();
  }, [fetchRegles, fetchPenalites]);

  const handleAddRegle = useCallback(async () => {
    setSubmitting(true);
    try {
      await tontineRegleApi.create({
        tontineId: tontineId,
        typeRegle: formData.typeRegle,
        montantPenalite: formData.montant,
        description: formData.description,
        idempotencyKey: crypto.randomUUID(),
      });

      setShowAddForm(false);
      setFormData({
        typeRegle: TypeRegleTontine.LATE_PENALTY,
        montant: 0,
        description: ''
      });
      fetchRegles();
      toast.success('Règle créée avec succès');
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de la création de la règle'));
    } finally {
      setSubmitting(false);
    }
  }, [formData, tontineId, fetchRegles]);

  const handleToggleRegle = useCallback(async (regle: TontineRegle) => {
    try {
      await tontineRegleApi.update(regle.id, { actif: !regle.actif });
      fetchRegles();
      toast.success(regle.actif ? 'Règle désactivée' : 'Règle activée');
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de la mise à jour'));
    }
  }, [fetchRegles]);

  const handleDeleteRegle = useCallback((regle: TontineRegle) => {
    const typeLabel = getTypeLabel(regle.typeRegle);
    openConfirm({
      title: 'Supprimer cette règle ?',
      message: `Êtes-vous sûr de vouloir supprimer la règle "${typeLabel}" ? Cette action est irréversible.`,
      variant: 'danger',
      confirmText: 'Supprimer',
      onConfirm: async () => {
        try {
          await tontineRegleApi.delete(regle.id);
          fetchRegles();
          toast.success('Règle supprimée avec succès');
        } catch (error) {
          toast.error(handleApiError(error, 'Erreur lors de la suppression'));
        }
      },
    });
  }, [openConfirm, fetchRegles]);

  const handleMarquerPenalitePaye = useCallback(async (penaliteId: string) => {
    try {
      await tontinePenaliteApi.update(penaliteId, {
        statut: StatutPenaliteTontine.PAID,
        date_paiement: new Date().toISOString()
      });
      fetchPenalites();
      toast.success('Pénalité marquée comme payée');
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du marquage de la pénalité'));
    }
  }, [fetchPenalites]);

  const getTypeLabel = (type: string): string => {
    return TYPE_REGLE_TONTINE_LABELS[type as TypeRegleTontineType] || type;
  };

  const getTypeIcon = (type: string) => {
    switch (type as TypeRegleTontineType) {
      case TypeRegleTontine.LATE_PENALTY: return <AlertTriangle size={24} />;
      case TypeRegleTontine.MEMBERSHIP_FEE: return <FileText size={24} />;
      case TypeRegleTontine.EXIT_FEE: return <X size={24} />;
      case TypeRegleTontine.FINE: return <Gavel size={24} />;
      default: return <Scale size={24} />;
    }
  };

  const getTypeColor = (type: string): string => {
    switch (type as TypeRegleTontineType) {
      case TypeRegleTontine.LATE_PENALTY: return 'bg-status-warning-bg text-status-warning';
      case TypeRegleTontine.MEMBERSHIP_FEE: return 'bg-status-info-bg text-status-info';
      case TypeRegleTontine.EXIT_FEE: return 'bg-status-info-bg text-status-info';
      case TypeRegleTontine.FINE: return 'bg-status-danger-bg text-status-danger';
      default: return 'bg-surface-subtle/30 text-content-muted';
    }
  };

  const getStatutPenaliteLabel = (statut: string): string => {
    return STATUT_PENALITE_TONTINE_LABELS[statut as StatutPenaliteTontineType] || statut;
  };

  const getStatutPenaliteColor = (statut: string): string => {
    switch (statut as StatutPenaliteTontineType) {
      case StatutPenaliteTontine.PAID: return 'text-status-success';
      case StatutPenaliteTontine.CANCELLED:
      case StatutPenaliteTontine.WAIVED: return 'text-content-muted';
      default: return 'text-status-danger';
    }
  };

  const isPenalitePending = (statut: string): boolean => {
    return statut === StatutPenaliteTontine.PENDING;
  };

  // Options pour le select avec labels FR
  const regleOptions = TYPE_REGLE_TONTINE_OPTIONS;

  const totalPenalitesEnAttente = penalites
    .filter(p => isPenalitePending(p.statut))
    .reduce((sum, p) => sum + Number(p.montant), 0);

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-12 gap-6">
        {/* Section Règles (Main Column) */}
        <div className="lg:col-span-8 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                   <h3 className="text-xl font-bold text-content-primary flex items-center gap-2">
                       <Scale className="text-accent" size={24} />
                       Règles et Frais
                   </h3>
                   <p className="text-content-muted text-sm mt-1">Gérez les pénalités et frais de cette tontine</p>
                </div>
                <Button
                    size="sm"
                    icon={Plus}
                    onClick={() => setShowAddForm(true)}
                    variant="primary"
                    className="shadow-lg shadow-accent/20"
                >
                    Nouvelle Règle
                </Button>
            </div>

            {regles.length === 0 ? (
                <EmptyState
                    icon={Scale}
                    title="Aucune règle définie"
                    description="Commencez par ajouter des règles pour encadrer votre tontine (retards, absences, etc.)"
                    action={{
                        label: "Ajouter une règle",
                        onClick: () => setShowAddForm(true)
                    }}
                />
            ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                    {regles.map((regle) => (
                        <Card
                            key={regle.id}
                            className={`relative overflow-hidden transition-all duration-300 group hover:-translate-y-1 hover:shadow-xl ${
                                regle.actif
                                ? 'border-accent/30 bg-surface/80 hover:border-accent/50'
                                : 'border-edge bg-surface/40 opacity-75 grayscale-[0.5]'
                            }`}
                        >
                            {/* Status Indicator */}
                            <div className={`absolute top-0 right-0 w-16 h-16 pointer-events-none overflow-hidden`}>
                                <div className={`absolute top-[10px] right-[-25px] rotate-45 text-[10px] font-bold py-1 px-8 text-center text-content-primary shadow-sm
                                    ${regle.actif ? 'bg-accent shadow-accent/20' : 'bg-surface-subtle'}
                                `}>
                                    {regle.actif ? 'ON' : 'OFF'}
                                </div>
                            </div>

                            <div className="p-5 space-y-4">
                                {/* Header & Icon */}
                                <div className="flex justify-between items-start">
                                    <div className={`p-3 rounded-2xl ${getTypeColor(regle.typeRegle)}`}>
                                        {getTypeIcon(regle.typeRegle)}
                                    </div>
                                    <div className="flex gap-1">
                                        <IconButton
                                            size="sm"
                                            variant="ghost"
                                            icon={regle.actif ? X : Check}
                                            onClick={() => handleToggleRegle(regle)}
                                            className={`rounded-full w-8 h-8 ${
                                                regle.actif
                                                ? 'hover:bg-status-warning-bg hover:text-status-warning text-content-muted'
                                                : 'bg-status-success-bg text-status-success hover:bg-status-success-bg/80'
                                            }`}
                                            title={regle.actif ? "Désactiver" : "Activer"}
                                            aria-label={regle.actif ? "Désactiver" : "Activer"}
                                        />
                                        <IconButton
                                            size="sm"
                                            variant="ghost"
                                            icon={Trash2}
                                            onClick={() => handleDeleteRegle(regle)}
                                            className="rounded-full w-8 h-8 hover:bg-status-danger-bg hover:text-status-danger text-content-muted"
                                            title="Supprimer"
                                            aria-label="Supprimer"
                                        />
                                    </div>
                                </div>

                                {/* Content */}
                                <div>
                                    <h4 className="font-semibold text-content-secondary text-lg mb-1 leading-tight">{getTypeLabel(regle.typeRegle)}</h4>
                                    <div className="flex items-baseline gap-1.5">
                                        <span className={`text-2xl font-bold tracking-tight ${regle.actif ? 'text-content-primary' : 'text-content-muted'}`}>
                                            {Number(regle.montantPenalite).toLocaleString()}
                                        </span>
                                        <span className="text-xs font-medium text-content-muted uppercase">FCFA</span>
                                    </div>
                                </div>

                                {/* Description */}
                                {regle.description && (
                                    <div className="pt-3 border-t border-edge-subtle">
                                        <p className="text-sm text-content-muted line-clamp-2 leading-relaxed">
                                            {regle.description}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>

        {/* Section Pénalités (Sidebar) */}
        <div className="lg:col-span-4 space-y-6">
             <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-content-primary flex items-center gap-2">
                    <AlertCircle className="text-status-danger" size={20} />
                    Pénalités
                </h3>
            </div>

            {totalPenalitesEnAttente > 0 && (
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-status-danger to-status-warning p-5 shadow-lg shadow-status-danger/20 text-white">
                    <div className="relative z-10 flex items-center gap-4">
                        <div className="p-3 bg-white/10 rounded-xl backdrop-blur-sm">
                            <AlertTriangle size={24} className="text-content-primary" />
                        </div>
                        <div>
                            <div className="text-status-danger-text text-xs font-semibold uppercase tracking-wider">Total Impayé</div>
                            <div className="text-2xl font-bold">
                                {totalPenalitesEnAttente.toLocaleString()} <span className="text-sm font-normal text-status-danger-text">FCFA</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="space-y-3">
                {loading && penalites.length === 0 ? (
                    <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
                    </div>
                ) : penalites.length === 0 ? (
                    <div className="text-center py-8 px-4 rounded-xl border border-edge bg-surface-base/50">
                        <div className="mx-auto w-12 h-12 rounded-full bg-surface flex items-center justify-center text-content-muted mb-3">
                            <Check size={20} />
                        </div>
                        <p className="text-content-muted text-sm">Aucune pénalité en cours.</p>
                    </div>
                ) : (
                    <div className="bg-surface-base/50 rounded-xl border border-edge divide-y divide-edge overflow-hidden">
                        {penalites.map((penalite) => (
                            <div key={penalite.id} className="p-4 hover:bg-surface/50 transition-colors">
                                <div className="flex justify-between items-start gap-3 mb-2">
                                    <div className="font-medium text-content-primary text-sm">{penalite.tontine_membres.clients.nom}</div>
                                    <div className="text-right">
                                         <span className={`text-sm font-bold ${getStatutPenaliteColor(penalite.statut)}`}>
                                            {Number(penalite.montant).toLocaleString()} F
                                         </span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between text-xs">
                                     <div className="text-content-muted">{penalite.motif}</div>
                                     <div className="text-content-muted">
                                        {new Date(penalite.dateFaute).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                                     </div>
                                </div>

                                {isPenalitePending(penalite.statut) && (
                                    <div className="mt-3 text-right">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 text-xs bg-status-success-bg text-status-success hover:bg-status-success-bg/80 px-2.5"
                                            onClick={() => handleMarquerPenalitePaye(penalite.id)}
                                        >
                                            Marquer payée
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>

        {/* Modal Ajout Règle */}
        <Modal
            isOpen={showAddForm}
            onClose={() => setShowAddForm(false)}
            title="Nouvelle Règle"
            size="sm"
            footer={
                <>
                   <Button variant="ghost" onClick={() => setShowAddForm(false)} disabled={submitting}>
                     Annuler
                   </Button>
                   <Button
                     variant="primary"
                     onClick={handleAddRegle}
                     disabled={formData.montant <= 0 || submitting}
                     isLoading={submitting}
                     icon={Check}
                   >
                     Créer la règle
                   </Button>
                </>
            }
        >
            <div className="space-y-4">
                <SelectField
                    label="Type de règle"
                    name="typeRegle"
                    options={regleOptions}
                    value={formData.typeRegle}
                    onChange={(e) => setFormData(prev => ({ ...prev, typeRegle: e.target.value as TypeRegleTontineType }))}
                />

                <FormField
                    label="Montant (FCFA)"
                    name="montant"
                    type="number"
                    min="0"
                    value={formData.montant}
                    onChange={(e) => setFormData(prev => ({ ...prev, montant: Number(e.target.value) }))}
                />

                <TextareaField
                    label="Description (Optionnel)"
                    name="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Ex: Pénalité appliquée après 48h de retard..."
                    rows={3}
                />
            </div>
        </Modal>

        {/* Confirm Dialog */}
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
    </div>
  );
}
