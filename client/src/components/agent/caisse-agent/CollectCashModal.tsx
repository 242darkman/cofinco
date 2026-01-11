/**
 * CollectCashModal - Modal pour créer une collecte cash
 *
 * Permet à un agent terrain de soumettre une collecte
 * effectuée chez un client.
 */

import React, { useState, useEffect } from 'react';
import { X, Search, User, Wallet, FileText, MapPin, CreditCard, PiggyBank } from 'lucide-react';
import { toast } from 'sonner';
import { Modal, Button, FormField, SelectField, SearchableSelect } from '../../ui';
import { caisseAgentApi, clientApi, creditApi, compteEpargneApi } from '../../../lib/api-client';

interface CollectCashModalProps {
  agentId: string;
  caisseAgentId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const TYPE_PAIEMENT_OPTIONS = [
  { value: 'Remboursement Crédit', label: 'Remboursement Crédit' },
  { value: 'Dépôt Épargne', label: 'Dépôt Épargne' },
  { value: 'Dépôt Courant', label: 'Dépôt Compte Courant' },
  { value: 'Versement Tontine', label: 'Versement Tontine' },
  { value: 'Frais Engagement', label: 'Frais Engagement Crédit' },
];

export default function CollectCashModal({
  agentId,
  caisseAgentId,
  onClose,
  onSuccess
}: CollectCashModalProps) {
  const [loading, setLoading] = useState(false);
  const [loadingClients, setLoadingClients] = useState(true);
  const [clients, setClients] = useState<any[]>([]);
  const [clientCredits, setClientCredits] = useState<any[]>([]);
  const [clientComptes, setClientComptes] = useState<any[]>([]);

  // Form state
  const [selectedClientId, setSelectedClientId] = useState('');
  const [typePaiement, setTypePaiement] = useState('');
  const [montant, setMontant] = useState('');
  const [creditId, setCreditId] = useState('');
  const [compteId, setCompteId] = useState('');
  const [numeroRecu, setNumeroRecu] = useState('');
  const [observations, setObservations] = useState('');
  const [useGeolocation, setUseGeolocation] = useState(false);
  const [latitude, setLatitude] = useState<number | undefined>();
  const [longitude, setLongitude] = useState<number | undefined>();

  // Load clients
  useEffect(() => {
    const loadClients = async () => {
      try {
        const data = await clientApi.getAll();
        setClients(data || []);
      } catch (error) {
        console.error('Erreur chargement clients:', error);
        toast.error('Erreur lors du chargement des clients');
      } finally {
        setLoadingClients(false);
      }
    };
    loadClients();
  }, []);

  // Load client's credits and accounts when selected
  useEffect(() => {
    if (!selectedClientId) {
      setClientCredits([]);
      setClientComptes([]);
      return;
    }

    const loadClientData = async () => {
      try {
        const [credits, comptes] = await Promise.all([
          creditApi.getByClient(selectedClientId),
          compteEpargneApi.getByClient(selectedClientId)
        ]);
        setClientCredits(credits?.filter((c: any) => c.statut === 'Actif' || c.statut === 'En retard') || []);
        setClientComptes(comptes || []);
      } catch (error) {
        console.error('Erreur chargement données client:', error);
      }
    };
    loadClientData();
  }, [selectedClientId]);

  // Get geolocation
  useEffect(() => {
    if (useGeolocation && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLatitude(position.coords.latitude);
          setLongitude(position.coords.longitude);
        },
        (error) => {
          console.error('Erreur géolocalisation:', error);
          toast.error('Impossible d\'obtenir la position');
        }
      );
    }
  }, [useGeolocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedClientId || !typePaiement || !montant) {
      toast.error('Veuillez remplir tous les champs obligatoires');
      return;
    }

    const montantNum = parseFloat(montant);
    if (isNaN(montantNum) || montantNum <= 0) {
      toast.error('Montant invalide');
      return;
    }

    // Validation selon le type de paiement
    if (typePaiement === 'Remboursement Crédit' && !creditId) {
      toast.error('Veuillez sélectionner le crédit');
      return;
    }

    if ((typePaiement === 'Dépôt Épargne' || typePaiement === 'Dépôt Courant') && !compteId) {
      toast.error('Veuillez sélectionner le compte');
      return;
    }

    setLoading(true);
    try {
      await caisseAgentApi.createCollectCash({
        agentId,
        clientId: selectedClientId,
        montant: montantNum,
        typePaiementClient: typePaiement,
        creditId: creditId || undefined,
        compteId: compteId || undefined,
        numeroRecu: numeroRecu || undefined,
        observations: observations || undefined,
        latitude,
        longitude,
        idempotencyKey: `collect_${agentId}_${Date.now()}`
      });

      onSuccess();
    } catch (error: any) {
      console.error('Erreur création collecte:', error);
      toast.error('Erreur lors de la création', {
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const clientOptions = clients.map((c) => ({
    value: c.id,
    label: `${c.nom} ${c.prenom}`,
    sublabel: c.telephone || c.email
  }));

  const creditOptions = clientCredits.map((c) => ({
    value: c.id,
    label: `Crédit #${c.numero || c.id.slice(0, 8)} - ${new Intl.NumberFormat('fr-FR').format(c.solde_restant || 0)} XOF`
  }));

  const compteOptions = clientComptes.map((c) => ({
    value: c.id,
    label: `${c.type_compte || 'Épargne'} - ${c.numero || c.id.slice(0, 8)}`
  }));

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Nouvelle Collecte Cash"
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Client Selection */}
        <SearchableSelect
          label="Client"
          name="clientId"
          options={clientOptions}
          value={selectedClientId}
          onChange={(val) => setSelectedClientId(String(val))}
          placeholder="Rechercher un client..."
          required
          disabled={loadingClients}
        />

        {/* Type de paiement */}
        <SelectField
          label="Type de paiement"
          name="typePaiement"
          value={typePaiement}
          onChange={(e) => {
            setTypePaiement(e.target.value);
            setCreditId('');
            setCompteId('');
          }}
          options={TYPE_PAIEMENT_OPTIONS}
          required
          icon={FileText}
        />

        {/* Credit selection (si remboursement) */}
        {typePaiement === 'Remboursement Crédit' && selectedClientId && (
          <SelectField
            label="Crédit concerné"
            name="creditId"
            value={creditId}
            onChange={(e) => setCreditId(e.target.value)}
            options={[
              { value: '', label: 'Sélectionner un crédit' },
              ...creditOptions
            ]}
            required
            icon={CreditCard}
            helperText={clientCredits.length === 0 ? 'Aucun crédit actif pour ce client' : undefined}
          />
        )}

        {/* Compte selection (si dépôt) */}
        {(typePaiement === 'Dépôt Épargne' || typePaiement === 'Dépôt Courant') && selectedClientId && (
          <SelectField
            label="Compte concerné"
            name="compteId"
            value={compteId}
            onChange={(e) => setCompteId(e.target.value)}
            options={[
              { value: '', label: 'Sélectionner un compte' },
              ...compteOptions
            ]}
            required
            icon={PiggyBank}
            helperText={clientComptes.length === 0 ? 'Aucun compte pour ce client' : undefined}
          />
        )}

        {/* Montant */}
        <FormField
          label="Montant collecté"
          name="montant"
          type="number"
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
          placeholder="0"
          required
        />

        {/* Numéro de reçu */}
        <FormField
          label="Numéro de reçu"
          name="numeroRecu"
          type="text"
          value={numeroRecu}
          onChange={(e) => setNumeroRecu(e.target.value)}
          placeholder="RC-2024-001"
        />

        {/* Géolocalisation */}
        <div className="flex items-center gap-3 p-3 bg-surface-elevated rounded-lg border border-edge">
          <input
            type="checkbox"
            id="geolocation"
            checked={useGeolocation}
            onChange={(e) => setUseGeolocation(e.target.checked)}
            className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500"
          />
          <label htmlFor="geolocation" className="text-sm text-slate-300 flex items-center gap-2">
            <MapPin size={16} className="text-cyan-400" />
            Enregistrer la position GPS
          </label>
          {latitude && longitude && (
            <span className="text-xs text-slate-500 ml-auto">
              {latitude.toFixed(4)}, {longitude.toFixed(4)}
            </span>
          )}
        </div>

        {/* Observations */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-300">Observations</label>
          <textarea
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            placeholder="Notes ou commentaires..."
            rows={2}
            className="w-full px-3 py-2 bg-surface-elevated border border-edge rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 resize-none"
          />
        </div>

        {/* Info box */}
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <p className="text-xs text-amber-300">
            Cette opération sera soumise pour validation par un superviseur.
            Aucune écriture comptable ne sera effectuée avant l'approbation.
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-edge">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={loading}
          >
            Annuler
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={loading}
            disabled={!selectedClientId || !typePaiement || !montant}
          >
            Soumettre la collecte
          </Button>
        </div>
      </form>
    </Modal>
  );
}
