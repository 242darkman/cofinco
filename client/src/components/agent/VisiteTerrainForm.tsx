import React, { useState, useEffect } from 'react';
import { User, Calendar, FileText, DollarSign, Clock, CheckCircle, Info, AlertTriangle } from 'lucide-react';
import { agentTerrainApi, clientApi } from '../../lib/api-client';
import { Modal, Button, FormField, SelectField, TextareaField } from '../ui';
import { usePermissions } from '../auth/ProtectedFeature';
import {
  StatutUser,
  StatutClient,
  StatutVisiteTerrain,
  TypeVisiteTerrain,
  STATUT_VISITE_TERRAIN_OPTIONS,
  TYPE_VISITE_TERRAIN_OPTIONS
} from '@shared/enum/status-constants';
import { useCurrency } from '../../contexts/CurrencyContext';

interface VisiteTerrainFormProps {
  onClose: () => void;
  onSuccess: () => void;
  agentId?: string;
  clientId?: string;
}

export default function VisiteTerrainForm({ onClose, onSuccess, agentId, clientId }: VisiteTerrainFormProps) {
  const { label } = useCurrency();
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canCreateVisites = hasPermission('agent_terrain', 'create') || hasPermission('visites', 'create');

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [agents, setAgents] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);

  const [formData, setFormData] = useState<{
    agent_id: string;
    client_id: string;
    date_visite: string;
    type_visite: string;
    statut: string;
    notes: string;
    montant_collecte: string;
  }>({
    agent_id: agentId || '',
    client_id: clientId || '',
    date_visite: new Date().toISOString().slice(0, 16),
    type_visite: TypeVisiteTerrain.LOAN_RECOVERY,
    statut: StatutVisiteTerrain.PLANNED,
    notes: '',
    montant_collecte: ''
  });

  useEffect(() => {
    loadAgents();
    loadClients();
  }, []);

  const loadAgents = async () => {
    try {
      const data = await agentTerrainApi.getAllList();
      setAgents(data.filter((a: any) => a.statut === StatutUser.ACTIVE));
    } catch (error) {
      console.error('Erreur chargement agents:', error);
    }
  };

  const loadClients = async () => {
    try {
      const data = await clientApi.getAllList();
      setClients(data.filter((c: any) => c.statut === StatutClient.ACTIVE).slice(0, 100));
    } catch (error) {
      console.error('Erreur chargement clients:', error);
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.agent_id) newErrors.agent_id = 'Sélectionner un agent';
    if (!formData.client_id) newErrors.client_id = 'Sélectionner un client';
    if (!formData.date_visite) newErrors.date_visite = 'Date requise';
    if (formData.montant_collecte && parseFloat(formData.montant_collecte) < 0) {
      newErrors.montant_collecte = 'Le montant doit être positif';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!validate()) return;

    setLoading(true);

    try {
      const visiteData = {
        agentId: formData.agent_id,
        clientId: formData.client_id,
        dateVisite: formData.date_visite,
        typeVisite: formData.type_visite,
        statut: formData.statut,
        notes: formData.notes.trim(),
        montantCollecte: formData.montant_collecte ? parseFloat(formData.montant_collecte).toString() : '0'
      };

      const response = await fetch('/api/visites-terrain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(visiteData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erreur lors de la création');
      }

      onSuccess();
    } catch (error: any) {
      console.error('Erreur:', error);
      setErrors({ submit: error.error });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Nouvelle Visite Terrain"
      size="lg"
      footer={
        <div className="flex gap-2 w-full sm:w-auto">
          <Button 
            variant="ghost" 
            onClick={onClose} 
            disabled={loading}
            className="flex-1 sm:flex-none"
          >
            Annuler
          </Button>
          {canCreateVisites ? (
            <Button
              variant="success"
              onClick={handleSubmit}
              isLoading={loading}
              icon={CheckCircle}
              className="flex-1 sm:flex-none"
            >
              Créer la Visite
            </Button>
          ) : (
            <div className="flex-1 sm:flex-none px-4 py-2 bg-status-warning-bg text-status-warning rounded-lg font-medium flex items-center justify-center gap-2">
              <AlertTriangle size={16} />
              Permission requise
            </div>
          )}
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errors.submit && (
          <div className="bg-status-danger-bg border border-status-danger/20 text-status-danger px-4 py-3 rounded-lg text-sm">
            {errors.submit}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SelectField
            label="Agent *"
            name="agent_id"
            value={formData.agent_id}
            onChange={(e) => setFormData({ ...formData, agent_id: e.target.value })}
            options={agents.map(agent => ({
              value: agent.id,
              label: `${agent.nom} ${agent.prenom}`
            }))}
            error={errors.agent_id}
            disabled={!!agentId}
            placeholder="Sélectionner un agent"
          />

          <SelectField
            label="Client *"
            name="client_id"
            value={formData.client_id}
            onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
            options={clients.map(client => ({
              value: client.id,
              label: `${client.nom} - ${client.telephone || '--'}`
            }))}
            error={errors.client_id}
            disabled={!!clientId}
            placeholder="Sélectionner un client"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            label="Date et Heure *"
            name="date_visite"
            type="datetime-local"
            value={formData.date_visite}
            onChange={(e) => setFormData({ ...formData, date_visite: e.target.value })}
            error={errors.date_visite}
            icon={Calendar}
          />

          <SelectField
            label="Type d'Opération *"
            name="type_visite"
            value={formData.type_visite}
            onChange={(e) => setFormData({ ...formData, type_visite: e.target.value })}
            options={TYPE_VISITE_TERRAIN_OPTIONS}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SelectField
            label="Statut"
            name="statut"
            value={formData.statut}
            onChange={(e) => setFormData({ ...formData, statut: e.target.value })}
            options={STATUT_VISITE_TERRAIN_OPTIONS}
          />

          <FormField
            label={label('Montant Collecté')}
            name="montant_collecte"
            type="number"
            value={formData.montant_collecte}
            onChange={(e) => setFormData({ ...formData, montant_collecte: e.target.value })}
            error={errors.montant_collecte}
            icon={DollarSign}
            placeholder="0"
            min="0"
            step="100"
          />
        </div>

        <TextareaField
          label="Notes de Visite"
          name="notes"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Détails de la visite, observations..."
          rows={3}
        />

        <div className="bg-status-info/5 border border-status-info/20 rounded-lg p-3 text-xs text-content-muted">
          <div className="flex items-center gap-2 mb-2 text-status-info font-medium">
            <Info size={14} />
            <span>Guide des Opérations</span>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 ml-5 list-disc">
            <li><strong>Recouvrement:</strong> Remboursement crédit</li>
            <li><strong>Épargne/Tontine:</strong> Encaissement dépôts</li>
            <li><strong>Prospection:</strong> Nouveaux clients</li>
            <li><strong>Suivi:</strong> Visite de routine</li>
          </ul>
        </div>
      </form>
    </Modal>
  );
}
