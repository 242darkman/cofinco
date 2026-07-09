/**
 * CollectCashModal - Modal pour créer une collecte cash
 *
 * Permet à un agent terrain de soumettre une collecte
 * effectuée chez un client.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { FileText, MapPin, CreditCard, PiggyBank } from 'lucide-react';
import { toast } from 'sonner';
import { Modal, Button, FormField, SelectField, SearchableSelect } from '../../ui';
import { caisseAgentApi, clientApi } from '../../../lib/api-client';
import { TypeOperationTerrain, TYPE_OPERATION_TERRAIN_LABELS } from '@shared/enum/status-constants';
import { useClientOperations } from '../../finance/caisse/hooks/useClientOperations';

interface CollectCashModalProps {
  agentId: string;
  caisseAgentId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const TYPE_PAIEMENT_OPTIONS = [
  {
    value: TypeOperationTerrain.LOAN_REPAYMENT,
    label: TYPE_OPERATION_TERRAIN_LABELS[TypeOperationTerrain.LOAN_REPAYMENT]
  },
  {
    value: TypeOperationTerrain.SAVINGS_DEPOSIT,
    label: TYPE_OPERATION_TERRAIN_LABELS[TypeOperationTerrain.SAVINGS_DEPOSIT]
  },
  {
    value: TypeOperationTerrain.DEPOSIT_CURRENT,
    label: TYPE_OPERATION_TERRAIN_LABELS[TypeOperationTerrain.DEPOSIT_CURRENT]
  },
  {
    value: TypeOperationTerrain.WITHDRAWAL_SAVINGS,
    label: TYPE_OPERATION_TERRAIN_LABELS[TypeOperationTerrain.WITHDRAWAL_SAVINGS]
  },
  {
    value: TypeOperationTerrain.WITHDRAWAL_CURRENT,
    label: TYPE_OPERATION_TERRAIN_LABELS[TypeOperationTerrain.WITHDRAWAL_CURRENT]
  },
  {
    value: TypeOperationTerrain.TONTINE_CONTRIBUTION,
    label: TYPE_OPERATION_TERRAIN_LABELS[TypeOperationTerrain.TONTINE_CONTRIBUTION]
  },
  {
    value: TypeOperationTerrain.ENGAGEMENT_FEE,
    label: TYPE_OPERATION_TERRAIN_LABELS[TypeOperationTerrain.ENGAGEMENT_FEE]
  },
];

const WITHDRAWAL_TYPES = [TypeOperationTerrain.WITHDRAWAL_CURRENT, TypeOperationTerrain.WITHDRAWAL_SAVINGS] as string[];
const NEEDS_COMPTE_TYPES = [
  TypeOperationTerrain.SAVINGS_DEPOSIT,
  TypeOperationTerrain.DEPOSIT_CURRENT,
  TypeOperationTerrain.WITHDRAWAL_SAVINGS,
  TypeOperationTerrain.WITHDRAWAL_CURRENT,
] as string[];

export default function CollectCashModal({
  agentId,
  caisseAgentId,
  onClose,
  onSuccess
}: CollectCashModalProps) {
  const [loading, setLoading] = useState(false);
  const [loadingClients, setLoadingClients] = useState(true);
  const [clients, setClients] = useState<any[]>([]);

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

  // Client operations hook — filters available types based on client data
  const {
    clientCredits,
    clientAccounts: clientComptes,
    availableTerrainOperations,
    loading: loadingClientOps,
  } = useClientOperations(selectedClientId || null);

  // Filtered type options from hook
  const filteredTypeOptions = useMemo(() => {
    if (!selectedClientId) return TYPE_PAIEMENT_OPTIONS;
    if (availableTerrainOperations.length === 0 && !loadingClientOps) return [];
    return availableTerrainOperations;
  }, [selectedClientId, availableTerrainOperations, loadingClientOps]);

  // Reset typePaiement if it becomes unavailable after client change
  useEffect(() => {
    if (selectedClientId && typePaiement && filteredTypeOptions.length > 0) {
      const stillAvailable = filteredTypeOptions.some(opt => opt.value === typePaiement);
      if (!stillAvailable) {
        setTypePaiement('');
        setCreditId('');
        setCompteId('');
      }
    }
  }, [filteredTypeOptions, selectedClientId, typePaiement]);

  // Load clients
  useEffect(() => {
    const loadClients = async () => {
      try {
        const data = await clientApi.getAllList();
        setClients(data || []);
      } catch (error) {
        toast.error('Erreur lors du chargement des clients');
      } finally {
        setLoadingClients(false);
      }
    };
    loadClients();
  }, []);

  // Get geolocation
  useEffect(() => {
    if (useGeolocation && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLatitude(position.coords.latitude);
          setLongitude(position.coords.longitude);
        },
        (error) => {
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
    if (typePaiement === TypeOperationTerrain.LOAN_REPAYMENT && !creditId) {
      toast.error('Veuillez sélectionner le crédit');
      return;
    }

    if (NEEDS_COMPTE_TYPES.includes(typePaiement) && !compteId) {
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
        idempotencyKey: crypto.randomUUID()
      });

      onSuccess();
    } catch (error: any) {
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
    label: `Crédit #${c.numeroCredit || c.id.slice(0, 8)} - ${new Intl.NumberFormat('fr-FR').format(Number(c.solde_restant || c.soldeRestant || 0))} XOF`
  }));

  const compteOptions = clientComptes.map((c: any) => ({
    value: c.id,
    label: `${c.typeCompte || 'Épargne'} - ${c.numeroCompte || c.id.slice(0, 8)}`,
    typeCompte: c.typeCompte,
    solde: c.soldeCourant,
  }));

  // Filter accounts based on operation type
  const filteredCompteOptions = compteOptions.filter((c) => {
    if (typePaiement === TypeOperationTerrain.SAVINGS_DEPOSIT || typePaiement === TypeOperationTerrain.WITHDRAWAL_SAVINGS) {
      return c.typeCompte === 'SAVINGS' || c.typeCompte === 'Épargne';
    }
    if (typePaiement === TypeOperationTerrain.DEPOSIT_CURRENT || typePaiement === TypeOperationTerrain.WITHDRAWAL_CURRENT) {
      return c.typeCompte === 'CURRENT' || c.typeCompte === 'Courant';
    }
    return true;
  }).map(({ typeCompte, solde, ...rest }) => {
    // For withdrawals, show available balance
    if (WITHDRAWAL_TYPES.includes(typePaiement) && solde != null) {
      return { ...rest, label: `${rest.label} — Solde: ${new Intl.NumberFormat('fr-FR').format(Number(solde))} XOF` };
    }
    return rest;
  });

  const isWithdrawal = WITHDRAWAL_TYPES.includes(typePaiement);

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={isWithdrawal ? "Nouveau Retrait Espèces" : "Nouvelle Collecte Cash"}
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
            setMontant('');
            setObservations('');
          }}
          options={selectedClientId ? filteredTypeOptions : TYPE_PAIEMENT_OPTIONS}
          required
          icon={FileText}
          disabled={!selectedClientId || loadingClientOps}
          helperText={
            !selectedClientId
              ? 'Sélectionnez d\'abord un client'
              : loadingClientOps
                ? 'Chargement des données client...'
                : filteredTypeOptions.length === 0
                  ? 'Ce client n\'a aucun produit actif'
                  : undefined
          }
        />

        {/* Credit selection (si remboursement) */}
        {typePaiement === TypeOperationTerrain.LOAN_REPAYMENT && selectedClientId && (
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

        {/* Compte selection (si dépôt ou retrait) */}
        {NEEDS_COMPTE_TYPES.includes(typePaiement) && selectedClientId && (
          <SelectField
            label="Compte concerné"
            name="compteId"
            value={compteId}
            onChange={(e) => setCompteId(e.target.value)}
            options={[
              { value: '', label: 'Sélectionner un compte' },
              ...filteredCompteOptions
            ]}
            required
            icon={PiggyBank}
            helperText={filteredCompteOptions.length === 0 ? 'Aucun compte de ce type pour ce client' : undefined}
          />
        )}

        {/* Champs suivants visibles seulement après sélection du type */}
        {selectedClientId && typePaiement && (<>
        {/* Montant */}
        <FormField
          label={isWithdrawal ? "Montant à retirer" : "Montant collecté"}
          name="montant"
          inputMode="numeric"
          pattern="[0-9]*"
          value={montant}
          onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setMontant(v); }}
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
            className="w-4 h-4 rounded border-edge-strong bg-surface-elevated text-accent focus:ring-accent"
          />
          <label htmlFor="geolocation" className="text-sm text-content-secondary flex items-center gap-2">
            <MapPin size={16} className="text-accent" />
            Enregistrer la position GPS
          </label>
          {latitude && longitude && (
            <span className="text-xs text-content-muted ml-auto">
              {latitude.toFixed(4)}, {longitude.toFixed(4)}
            </span>
          )}
        </div>

        {/* Observations */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-content-secondary">Observations</label>
          <textarea
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            placeholder="Notes ou commentaires..."
            rows={2}
            className="w-full px-3 py-2 bg-surface-elevated border border-edge rounded-lg text-content-primary placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent resize-none"
          />
        </div>

        {/* Info box */}
        <div className="p-3 bg-status-warning-bg border border-status-warning/20 rounded-lg">
          <p className="text-xs text-status-warning">
            {isWithdrawal
              ? "Ce retrait sera soumis pour validation. À l'approbation, le portefeuille agent sera débité et le compte client sera impacté."
              : "Cette opération sera soumise pour validation par un superviseur. Aucune écriture comptable ne sera effectuée avant l'approbation."}
          </p>
        </div>
        </>)}

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
            {isWithdrawal ? "Soumettre le retrait" : "Soumettre la collecte"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
