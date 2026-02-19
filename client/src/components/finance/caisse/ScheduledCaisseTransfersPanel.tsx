import React, { useState, useEffect } from 'react';
import {
  Calendar, Plus, Clock, Building2, ArrowRight, Loader2,
  Play, Pause, Trash2, Edit2, RefreshCw, CheckCircle, XCircle,
  AlertCircle, Repeat
} from 'lucide-react';
import { Button, Badge, Modal, FormField, SelectField, TextareaField } from '../../ui';
import { toast } from '../../../lib/toast';
import { scheduledCaisseTransfersApi } from '../../../lib/api-client';
import { formatMoney } from '../../../lib/format';

interface ScheduledTransfer {
  id: string;
  agenceSourceId: string;
  agenceSourceNom?: string;
  agenceDestId: string;
  agenceDestNom?: string;
  montant: string;
  datePrevue: string;
  frequence: string;
  jourSemaine?: number;
  jourMois?: number;
  motif?: string;
  statut: string;
  prochaineExecution?: string;
  derniereExecution?: string;
  nombreExecutions?: number;
  maxExecutions?: number;
  createdAt: string;
}

interface Agency {
  id: string;
  nom: string;
}

interface ScheduledCaisseTransfersPanelProps {
  agenceId?: string;
  agencies: Agency[];
  onTransferExecuted?: () => void;
}

const FREQUENCE_OPTIONS = [
  { value: 'ONE_TIME', label: 'Unique' },
  { value: 'DAILY', label: 'Quotidien' },
  { value: 'WEEKLY', label: 'Hebdomadaire' },
  { value: 'MONTHLY', label: 'Mensuel' },
];

const JOURS_SEMAINE = [
  { value: '0', label: 'Dimanche' },
  { value: '1', label: 'Lundi' },
  { value: '2', label: 'Mardi' },
  { value: '3', label: 'Mercredi' },
  { value: '4', label: 'Jeudi' },
  { value: '5', label: 'Vendredi' },
  { value: '6', label: 'Samedi' },
];

const STATUS_CONFIG: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  SCHEDULED: { color: 'bg-status-info-bg text-status-info', icon: Clock, label: 'Planifié' },
  EXECUTED: { color: 'bg-status-success-bg text-status-success', icon: CheckCircle, label: 'Exécuté' },
  CANCELLED: { color: 'bg-surface-subtle/40 text-content-muted', icon: XCircle, label: 'Annulé' },
  FAILED: { color: 'bg-status-danger-bg text-status-danger', icon: AlertCircle, label: 'Échoué' },
};

export default function ScheduledCaisseTransfersPanel({
  agenceId,
  agencies,
  onTransferExecuted,
}: ScheduledCaisseTransfersPanelProps) {
  const [transfers, setTransfers] = useState<ScheduledTransfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingTransfer, setEditingTransfer] = useState<ScheduledTransfer | null>(null);
  const [executing, setExecuting] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    agenceSourceId: agenceId || '',
    agenceDestId: '',
    montant: '',
    datePrevue: new Date().toISOString().split('T')[0],
    frequence: 'ONE_TIME',
    jourSemaine: '',
    jourMois: '',
    motif: '',
    maxExecutions: '',
  });

  useEffect(() => {
    fetchTransfers();
  }, [agenceId]);

  const fetchTransfers = async () => {
    setLoading(true);
    try {
      const data = await scheduledCaisseTransfersApi.getAll({
        agenceSourceId: agenceId,
      });
      setTransfers(data || []);
    } catch (error) {
      console.error('Error fetching scheduled transfers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.agenceSourceId || !formData.agenceDestId || !formData.montant || !formData.datePrevue) {
      toast.warning('Veuillez remplir tous les champs requis');
      return;
    }

    try {
      const payload = {
        agenceSourceId: formData.agenceSourceId,
        agenceDestId: formData.agenceDestId,
        montant: parseFloat(formData.montant),
        datePrevue: formData.datePrevue,
        frequence: formData.frequence,
        jourSemaine: formData.jourSemaine ? parseInt(formData.jourSemaine) : undefined,
        jourMois: formData.jourMois ? parseInt(formData.jourMois) : undefined,
        motif: formData.motif || undefined,
        maxExecutions: formData.maxExecutions ? parseInt(formData.maxExecutions) : undefined,
      };

      if (editingTransfer) {
        await scheduledCaisseTransfersApi.update(editingTransfer.id, payload);
        toast.success('Transfert planifié mis à jour');
      } else {
        await scheduledCaisseTransfersApi.create(payload);
        toast.success('Transfert planifié créé');
      }

      setShowForm(false);
      setEditingTransfer(null);
      resetForm();
      fetchTransfers();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la sauvegarde');
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Annuler ce transfert planifié ?')) return;
    try {
      await scheduledCaisseTransfersApi.cancel(id);
      toast.success('Transfert annulé');
      fetchTransfers();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de l\'annulation');
    }
  };

  const handleExecuteNow = async (id: string) => {
    setExecuting(id);
    try {
      await scheduledCaisseTransfersApi.execute(id);
      toast.success('Transfert exécuté');
      fetchTransfers();
      onTransferExecuted?.();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de l\'exécution');
    } finally {
      setExecuting(null);
    }
  };

  const handleEdit = (transfer: ScheduledTransfer) => {
    setEditingTransfer(transfer);
    setFormData({
      agenceSourceId: transfer.agenceSourceId,
      agenceDestId: transfer.agenceDestId,
      montant: transfer.montant,
      datePrevue: transfer.datePrevue,
      frequence: transfer.frequence,
      jourSemaine: transfer.jourSemaine?.toString() || '',
      jourMois: transfer.jourMois?.toString() || '',
      motif: transfer.motif || '',
      maxExecutions: transfer.maxExecutions?.toString() || '',
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      agenceSourceId: agenceId || '',
      agenceDestId: '',
      montant: '',
      datePrevue: new Date().toISOString().split('T')[0],
      frequence: 'ONE_TIME',
      jourSemaine: '',
      jourMois: '',
      motif: '',
      maxExecutions: '',
    });
  };

  const getAgencyName = (id: string) => {
    return agencies.find(a => a.id === id)?.nom || id;
  };

  const getFrequenceLabel = (freq: string) => {
    return FREQUENCE_OPTIONS.find(f => f.value === freq)?.label || freq;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-content-primary flex items-center gap-2">
          <Calendar size={16} className="text-accent" />
          Transferts Planifiés
        </h3>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchTransfers}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => { resetForm(); setEditingTransfer(null); setShowForm(true); }}
          >
            <Plus size={14} className="mr-1" />
            Planifier
          </Button>
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {loading && transfers.length === 0 ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-accent" />
          </div>
        ) : transfers.length === 0 ? (
          <div className="text-center py-8 text-content-muted">
            <Calendar size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">Aucun transfert planifié</p>
          </div>
        ) : (
          transfers.map((transfer) => {
            const status = STATUS_CONFIG[transfer.statut] || STATUS_CONFIG.SCHEDULED;
            const StatusIcon = status.icon;
            const isRecurring = transfer.frequence !== 'ONE_TIME';

            return (
              <div
                key={transfer.id}
                className="bg-surface/50 border border-edge rounded-lg p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Source -> Dest */}
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex items-center gap-1.5 text-sm">
                        <Building2 size={14} className="text-content-muted" />
                        <span className="text-content-primary font-medium truncate">
                          {transfer.agenceSourceNom || getAgencyName(transfer.agenceSourceId)}
                        </span>
                      </div>
                      <ArrowRight size={14} className="text-content-muted flex-shrink-0" />
                      <div className="flex items-center gap-1.5 text-sm">
                        <Building2 size={14} className="text-content-muted" />
                        <span className="text-content-primary font-medium truncate">
                          {transfer.agenceDestNom || getAgencyName(transfer.agenceDestId)}
                        </span>
                      </div>
                    </div>

                    {/* Amount and frequency */}
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-lg font-bold text-content-primary">
                        {formatMoney(parseFloat(transfer.montant))}
                      </span>
                      <Badge
                        variant="outline"
                        value={getFrequenceLabel(transfer.frequence)}
                        size="xs"
                      />
                      {isRecurring && (
                        <Repeat size={12} className="text-accent" />
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-content-muted">
                      <span className="flex items-center gap-1">
                        <Clock size={10} />
                        Prochaine: {transfer.prochaineExecution
                          ? new Date(transfer.prochaineExecution).toLocaleDateString('fr-FR')
                          : transfer.datePrevue}
                      </span>
                      {transfer.nombreExecutions !== undefined && transfer.nombreExecutions > 0 && (
                        <span>Exécutions: {transfer.nombreExecutions}{transfer.maxExecutions ? `/${transfer.maxExecutions}` : ''}</span>
                      )}
                    </div>

                    {transfer.motif && (
                      <p className="text-xs text-content-muted mt-1 truncate">{transfer.motif}</p>
                    )}
                  </div>

                  {/* Status and actions */}
                  <div className="flex flex-col items-end gap-2">
                    <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${status.color}`}>
                      <StatusIcon size={12} />
                      {status.label}
                    </div>

                    {transfer.statut === 'SCHEDULED' && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleExecuteNow(transfer.id)}
                          disabled={executing === transfer.id}
                          className="p-1.5 text-status-success hover:bg-status-success-bg rounded transition disabled:opacity-50"
                          title="Exécuter maintenant"
                        >
                          {executing === transfer.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Play size={14} />
                          )}
                        </button>
                        <button
                          onClick={() => handleEdit(transfer)}
                          className="p-1.5 text-content-muted hover:text-content-primary hover:bg-surface-elevated rounded transition"
                          title="Modifier"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleCancel(transfer.id)}
                          className="p-1.5 text-status-danger hover:bg-status-danger-bg rounded transition"
                          title="Annuler"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Form Modal */}
      <Modal
        isOpen={showForm}
        onClose={() => { setShowForm(false); setEditingTransfer(null); }}
        title={editingTransfer ? 'Modifier le transfert planifié' : 'Nouveau transfert planifié'}
        size="md"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <SelectField
              label="Agence source"
              name="agenceSourceId"
              value={formData.agenceSourceId}
              onChange={(e) => setFormData({ ...formData, agenceSourceId: e.target.value })}
              options={[
                { value: '', label: '-- Sélectionner --' },
                ...agencies.map(a => ({ value: a.id, label: a.nom }))
              ]}
              required
            />
            <SelectField
              label="Agence destination"
              name="agenceDestId"
              value={formData.agenceDestId}
              onChange={(e) => setFormData({ ...formData, agenceDestId: e.target.value })}
              options={[
                { value: '', label: '-- Sélectionner --' },
                ...agencies.filter(a => a.id !== formData.agenceSourceId).map(a => ({ value: a.id, label: a.nom }))
              ]}
              required
            />
          </div>

          <FormField
            label="Montant (FCFA)"
            name="montant"
            inputMode="numeric"
            pattern="[0-9]*"
            value={formData.montant}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const v = e.target.value.replace(/[^0-9]/g, ''); setFormData({ ...formData, montant: v }); }}
            placeholder="Ex: 500000"
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Date prévue"
              name="datePrevue"
              type="date"
              value={formData.datePrevue}
              onChange={(e) => setFormData({ ...formData, datePrevue: e.target.value })}
              required
            />
            <SelectField
              label="Fréquence"
              name="frequence"
              value={formData.frequence}
              onChange={(e) => setFormData({ ...formData, frequence: e.target.value })}
              options={FREQUENCE_OPTIONS}
              required
            />
          </div>

          {formData.frequence === 'WEEKLY' && (
            <SelectField
              label="Jour de la semaine"
              name="jourSemaine"
              value={formData.jourSemaine}
              onChange={(e) => setFormData({ ...formData, jourSemaine: e.target.value })}
              options={[
                { value: '', label: '-- Sélectionner --' },
                ...JOURS_SEMAINE
              ]}
            />
          )}

          {formData.frequence === 'MONTHLY' && (
            <FormField
              label="Jour du mois (1-31)"
              name="jourMois"
              inputMode="numeric"
              pattern="[0-9]*"
              value={formData.jourMois}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const v = e.target.value.replace(/[^0-9]/g, ''); setFormData({ ...formData, jourMois: v }); }}
              placeholder="Ex: 15"
            />
          )}

          {formData.frequence !== 'ONE_TIME' && (
            <FormField
              label="Nombre max d'exécutions (optionnel)"
              name="maxExecutions"
              inputMode="numeric"
              pattern="[0-9]*"
              value={formData.maxExecutions}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const v = e.target.value.replace(/[^0-9]/g, ''); setFormData({ ...formData, maxExecutions: v }); }}
              placeholder="Laisser vide pour illimité"
            />
          )}

          <TextareaField
            label="Motif (optionnel)"
            name="motif"
            value={formData.motif}
            onChange={(e) => setFormData({ ...formData, motif: e.target.value })}
            rows={2}
            placeholder="Ex: Approvisionnement hebdomadaire"
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-edge">
            <Button variant="secondary" onClick={() => { setShowForm(false); setEditingTransfer(null); }}>
              Annuler
            </Button>
            <Button variant="primary" onClick={handleSubmit}>
              {editingTransfer ? 'Mettre à jour' : 'Planifier'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
