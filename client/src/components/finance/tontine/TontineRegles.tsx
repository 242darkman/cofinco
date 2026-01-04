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
      case 'penalite_retard': return <AlertTriangle size={18} />;
      case 'frais_adhesion': return <FileText size={18} />;
      case 'frais_sortie': return <X size={18} />;
      case 'amende': return <Gavel size={18} />;
      default: return <Scale size={18} />;
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
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Section Règles */}
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Scale className="text-cyan-400" size={20} />
                    Règles et Frais
                </h3>
                <Button 
                    size="sm" 
                    icon={Plus} 
                    onClick={() => setShowAddForm(true)}
                    variant="primary"
                >
                    Ajouter
                </Button>
            </div>

            {regles.length === 0 ? (
                <EmptyState 
                    icon={Scale}
                    title="Aucune règle"
                    description="Configurez des frais ou des pénalités pour cette tontine."
                />
            ) : (
                <div className="grid gap-3">
                    {regles.map((regle) => (
                        <Card key={regle.id} className="p-4 flex items-start gap-4">
                            <div className={`p-3 rounded-xl shrink-0 ${regle.actif ? 'bg-cyan-500/10 text-cyan-400' : 'bg-slate-700/50 text-slate-500'}`}>
                                {getTypeIcon(regle.typeRegle)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <div className="font-bold text-white mb-0.5">{getTypeLabel(regle.typeRegle)}</div>
                                        <div className="text-2xl font-bold text-white tracking-tight">
                                            {Number(regle.montantPenalite).toLocaleString()} <span className="text-sm font-normal text-slate-400">FCFA</span>
                                        </div>
                                    </div>
                                    <Badge 
                                        value={regle.actif ? 'Active' : 'Inactive'} 
                                        variant={regle.actif ? 'success' : 'neutral'}
                                    />
                                </div>
                                
                                {regle.description && (
                                    <p className="text-sm text-slate-400 mt-2">{regle.description}</p>
                                )}

                                <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-slate-700/50">
                                    <Button
                                        size="sm"
                                        variant={regle.actif ? 'secondary' : 'success'}
                                        onClick={() => handleToggleRegle(regle)}
                                        icon={regle.actif ? X : Check}
                                        className={regle.actif ? '!bg-amber-500/10 !text-amber-400 hover:!bg-amber-500/20' : '!bg-green-500/10 !text-green-400 hover:!bg-green-500/20'}
                                    >
                                        {regle.actif ? 'Désactiver' : 'Activer'}
                                    </Button>
                                    <IconButton
                                        size="sm"
                                        variant="ghost"
                                        icon={Trash2}
                                        onClick={() => handleDeleteRegle(regle)}
                                        className="text-slate-400 hover:text-red-400"
                                        aria-label={`Supprimer la règle ${getTypeLabel(regle.typeRegle)}`}
                                    />
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>

        {/* Section Pénalités */}
        <div className="space-y-4">
             <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <AlertCircle className="text-red-400" size={20} />
                    Pénalités Appliquées
                </h3>
            </div>

            {totalPenalitesEnAttente > 0 && (
                <Card className="bg-gradient-to-br from-red-500/10 to-orange-500/10 border-red-500/20 p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-sm text-red-300 font-medium mb-1">Total en attente</div>
                            <div className="text-3xl font-bold text-white">
                                {totalPenalitesEnAttente.toLocaleString()} <span className="text-lg font-normal text-red-300">FCFA</span>
                            </div>
                        </div>
                        <div className="p-3 bg-red-500/20 rounded-full text-red-400">
                             <AlertTriangle size={24} />
                        </div>
                    </div>
                </Card>
            )}

            <div className="space-y-3">
                {loading && penalites.length === 0 ? (
                    <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
                    </div>
                ) : penalites.length === 0 ? (
                    <EmptyState
                        icon={Check}
                        title="Aucune pénalité"
                        description="Tout est en ordre, aucune pénalité n'a été appliquée."
                    />
                ) : (
                    penalites.map((penalite) => (
                        <Card key={penalite.id} className="p-4">
                            <div className="flex justify-between items-start gap-3">
                                <div>
                                    <div className="font-bold text-white">{penalite.tontine_membres.clients.nom}</div>
                                    <div className="text-sm text-slate-400 mt-0.5">{penalite.motif}</div>
                                </div>
                                <div className="text-right">
                                     <div className="font-bold text-red-400">{Number(penalite.montant).toLocaleString()} FCFA</div>
                                     <div className="text-xs text-slate-500 mt-1">
                                        {new Date(penalite.dateFaute).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                                     </div>
                                </div>
                            </div>
                            
                            <div className="mt-3 flex items-center justify-between pt-3 border-t border-slate-700/50">
                                <Badge value={penalite.statut} variant={penalite.statut === 'Payée' ? 'success' : penalite.statut === 'Annulée' ? 'neutral' : 'warning'} />
                                
                                {penalite.statut === 'En attente' && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="bg-green-500/10 text-green-400 hover:bg-green-500/20"
                                        icon={Check}
                                        onClick={() => handleMarquerPenalitePaye(penalite.id)}
                                    >
                                        Marquer payée
                                    </Button>
                                )}
                            </div>
                        </Card>
                    ))
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
