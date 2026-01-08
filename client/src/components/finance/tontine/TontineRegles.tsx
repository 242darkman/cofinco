import React, { useState, useEffect, useCallback } from 'react';
import { Plus, DollarSign, AlertTriangle, Check, X, Trash2, Gavel, Scale, FileText, AlertCircle } from 'lucide-react';
import { Card, Badge, Button, IconButton, Modal, FormField, SelectField, EmptyState, TextareaField } from '../../ui';
import ConfirmDialog from '../../ui/ConfirmDialog';
import { tontineRegleApi, tontinePenaliteApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { escapeHtml } from '../../../lib/sanitize';
import { useConfirmDialog } from '../../../hooks/useConfirmDialog';

interface TontineRegle {
  id: string;
  tontineId: string;
  typeRegle: 'penalite_retard' | 'frais_adhesion' | 'frais_sortie' | 'amende';
  montantPenalite: string | number;
  description: string;
  actif: boolean;
}

interface TontinePenalite {
  id: string;
  montant: string | number;
  motif: string; // Changed from raison to motif to match schema
  statut: 'En attente' | 'Payée' | 'Annulée';
  dateFaute: string; // Changed from date_application
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
    typeRegle: 'penalite_retard' as 'penalite_retard' | 'frais_adhesion' | 'frais_sortie' | 'amende',
    montant: 0,
    description: ''
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchRegles();
    fetchPenalites();
  }, [tontineId]);

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

  const handleAddRegle = useCallback(async () => {
    setSubmitting(true);
    try {
      await tontineRegleApi.create({
        tontineId: tontineId,
        typeRegle: formData.typeRegle,
        montantPenalite: formData.montant,
        description: formData.description
      });

      setShowAddForm(false);
      setFormData({
        typeRegle: 'penalite_retard',
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
    openConfirm({
      title: 'Supprimer cette règle ?',
      message: `Êtes-vous sûr de vouloir supprimer la règle "${getTypeLabel(regle.typeRegle)}" ? Cette action est irréversible.`,
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
        statut: 'Payée',
        date_paiement: new Date().toISOString()
      });
      fetchPenalites();
      toast.success('Pénalité marquée comme payée');
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du marquage de la pénalité'));
    }
  }, [fetchPenalites]);

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'penalite_retard': return 'Pénalité de retard';
      case 'frais_adhesion': return 'Frais d\'adhésion';
      case 'frais_sortie': return 'Frais de sortie';
      case 'amende': return 'Amende';
      default: return type;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'penalite_retard': return <AlertTriangle size={24} />;
      case 'frais_adhesion': return <FileText size={24} />;
      case 'frais_sortie': return <X size={24} />;
      case 'amende': return <Gavel size={24} />;
      default: return <Scale size={24} />;
    }
  };

  const regleOptions = [
    { value: 'penalite_retard', label: 'Pénalité de retard' },
    { value: 'frais_adhesion', label: 'Frais d\'adhésion' },
    { value: 'frais_sortie', label: 'Frais de sortie' },
    { value: 'amende', label: 'Amende' }
  ];

  const totalPenalitesEnAttente = penalites
    .filter(p => p.statut === 'En attente')
    .reduce((sum, p) => sum + Number(p.montant), 0);

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-12 gap-6">
        {/* Section Règles (Main Column) */}
        <div className="lg:col-span-8 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                   <h3 className="text-xl font-bold text-white flex items-center gap-2">
                       <Scale className="text-cyan-400" size={24} />
                       Règles et Frais
                   </h3>
                   <p className="text-slate-400 text-sm mt-1">Gérez les pénalités et frais de cette tontine</p>
                </div>
                <Button 
                    size="sm" 
                    icon={Plus} 
                    onClick={() => setShowAddForm(true)}
                    variant="primary"
                    className="shadow-lg shadow-cyan-500/20"
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
                                ? 'border-cyan-500/30 bg-slate-800/80 hover:border-cyan-500/50' 
                                : 'border-slate-700 bg-slate-800/40 opacity-75 grayscale-[0.5]'
                            }`}
                        >
                            {/* Status Indicator */}
                            <div className={`absolute top-0 right-0 w-16 h-16 pointer-events-none overflow-hidden`}>
                                <div className={`absolute top-[10px] right-[-25px] rotate-45 text-[10px] font-bold py-1 px-8 text-center text-white shadow-sm
                                    ${regle.actif ? 'bg-cyan-500 shadow-cyan-500/20' : 'bg-slate-600'}
                                `}>
                                    {regle.actif ? 'ON' : 'OFF'}
                                </div>
                            </div>

                            <div className="p-5 space-y-4">
                                {/* Header & Icon */}
                                <div className="flex justify-between items-start">
                                    <div className={`p-3 rounded-2xl ${
                                        regle.typeRegle === 'penalite_retard' ? 'bg-orange-500/10 text-orange-400' :
                                        regle.typeRegle === 'frais_adhesion' ? 'bg-blue-500/10 text-blue-400' :
                                        regle.typeRegle === 'frais_sortie' ? 'bg-purple-500/10 text-purple-400' :
                                        'bg-red-500/10 text-red-400'
                                    }`}>
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
                                                ? 'hover:bg-amber-500/20 hover:text-amber-400 text-slate-400' 
                                                : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                                            }`}
                                            title={regle.actif ? "Désactiver" : "Activer"}
                                            aria-label={regle.actif ? "Désactiver" : "Activer"}
                                        />
                                        <IconButton
                                            size="sm"
                                            variant="ghost"
                                            icon={Trash2}
                                            onClick={() => handleDeleteRegle(regle)}
                                            className="rounded-full w-8 h-8 hover:bg-red-500/20 hover:text-red-400 text-slate-400"
                                            title="Supprimer"
                                            aria-label="Supprimer"
                                        />
                                    </div>
                                </div>

                                {/* Content */}
                                <div>
                                    <h4 className="font-semibold text-slate-200 text-lg mb-1 leading-tight">{getTypeLabel(regle.typeRegle)}</h4>
                                    <div className="flex items-baseline gap-1.5">
                                        <span className={`text-2xl font-bold tracking-tight ${regle.actif ? 'text-white' : 'text-slate-400'}`}>
                                            {Number(regle.montantPenalite).toLocaleString()}
                                        </span>
                                        <span className="text-xs font-medium text-slate-500 uppercase">FCFA</span>
                                    </div>
                                </div>

                                {/* Description */}
                                {regle.description && (
                                    <div className="pt-3 border-t border-slate-700/50">
                                        <p className="text-sm text-slate-400 line-clamp-2 leading-relaxed">
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
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <AlertCircle className="text-red-400" size={20} />
                    Pénalités
                </h3>
            </div>

            {totalPenalitesEnAttente > 0 && (
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-600 to-orange-600 p-5 shadow-lg shadow-red-900/20 text-white">
                    <div className="relative z-10 flex items-center gap-4">
                        <div className="p-3 bg-white/10 rounded-xl backdrop-blur-sm">
                            <AlertTriangle size={24} className="text-white" />
                        </div>
                        <div>
                            <div className="text-red-100 text-xs font-semibold uppercase tracking-wider">Total Impayé</div>
                            <div className="text-2xl font-bold">
                                {totalPenalitesEnAttente.toLocaleString()} <span className="text-sm font-normal text-red-100">FCFA</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="space-y-3">
                {loading && penalites.length === 0 ? (
                    <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
                    </div>
                ) : penalites.length === 0 ? (
                    <div className="text-center py-8 px-4 rounded-xl border border-slate-800 bg-slate-900/50">
                        <div className="mx-auto w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-500 mb-3">
                            <Check size={20} />
                        </div>
                        <p className="text-slate-400 text-sm">Aucune pénalité en cours.</p>
                    </div>
                ) : (
                    <div className="bg-slate-900/50 rounded-xl border border-slate-800 divide-y divide-slate-800 overflow-hidden">
                        {penalites.map((penalite) => (
                            <div key={penalite.id} className="p-4 hover:bg-slate-800/50 transition-colors">
                                <div className="flex justify-between items-start gap-3 mb-2">
                                    <div className="font-medium text-white text-sm">{penalite.tontine_membres.clients.nom}</div>
                                    <div className="text-right">
                                         <span className={`text-sm font-bold ${
                                            penalite.statut === 'Payée' ? 'text-green-400' : 
                                            penalite.statut === 'Annulée' ? 'text-slate-400' : 'text-red-400'
                                         }`}>
                                            {Number(penalite.montant).toLocaleString()} F
                                         </span>
                                    </div>
                                </div>
                                
                                <div className="flex items-center justify-between text-xs">
                                     <div className="text-slate-500">{penalite.motif}</div>
                                     <div className="text-slate-600">
                                        {new Date(penalite.dateFaute).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                                     </div>
                                </div>

                                {penalite.statut === 'En attente' && (
                                    <div className="mt-3 text-right">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 text-xs bg-green-500/10 text-green-400 hover:bg-green-500/20 px-2.5"
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
                    onChange={(e) => setFormData(prev => ({ ...prev, typeRegle: e.target.value as any }))}
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
