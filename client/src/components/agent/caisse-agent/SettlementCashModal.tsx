/**
 * SettlementCashModal - Modal pour créer une remise cash
 *
 * Permet à un agent terrain de soumettre une remise
 * de l'argent collecté vers une caisse de l'agence.
 */

import React, { useState, useEffect } from 'react';
import { Send, Wallet, Building2, FileText, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Modal, Button, FormField, SelectField } from '../../ui';
import { caisseAgentApi, sessionCaisseApi } from '../../../lib/api-client';
import { computeSessionStatus } from '../../../lib/format';
import { StatutCaisseAgent } from '@shared/enum/status-constants';

interface SettlementCashModalProps {
  agentId: string;
  caisseAgentId: string;
  maxAmount: number;
  onClose: () => void;
  onSuccess: () => void;
}

// Dénominations des billets CFA
const DENOMINATIONS = [10000, 5000, 2000, 1000, 500];

export default function SettlementCashModal({
  agentId,
  caisseAgentId,
  maxAmount,
  onClose,
  onSuccess
}: SettlementCashModalProps) {
  const [loading, setLoading] = useState(false);
  const [loadingCaisses, setLoadingCaisses] = useState(true);
  const [caisses, setCaisses] = useState<any[]>([]);

  // Form state
  const [destinationCaisseId, setDestinationCaisseId] = useState('');
  const [montant, setMontant] = useState('');
  const [observations, setObservations] = useState('');
  const [useBilletage, setUseBilletage] = useState(false);
  const [billetage, setBilletage] = useState<Record<string, number>>({});

  // Load active caisses
  useEffect(() => {
    const loadCaisses = async () => {
      try {
        // Récupérer les sessions de caisse ouvertes
        const sessions = await sessionCaisseApi.getAll();
        const activeSessions = sessions?.filter((s: any) => {
          const status = s.computedStatus || computeSessionStatus(s);
          return status === StatutCaisseAgent.OPEN;
        }) || [];
        setCaisses(activeSessions);

        // Sélectionner la première par défaut
        if (activeSessions.length > 0) {
          setDestinationCaisseId(activeSessions[0].caisseId);
        }
      } catch (error) {
        console.error('Erreur chargement caisses:', error);
        toast.error('Erreur lors du chargement des caisses');
      } finally {
        setLoadingCaisses(false);
      }
    };
    loadCaisses();
  }, []);

  // Calculer le total du billetage
  const calculateBilletageTotal = () => {
    return Object.entries(billetage).reduce((sum, [denom, count]) => {
      return sum + (parseInt(denom) * (count || 0));
    }, 0);
  };

  // Mettre à jour le montant si billetage actif
  useEffect(() => {
    if (useBilletage) {
      const total = calculateBilletageTotal();
      setMontant(total.toString());
    }
  }, [billetage, useBilletage]);

  const handleBilletageChange = (denomination: number, count: string) => {
    const countNum = parseInt(count) || 0;
    setBilletage(prev => ({
      ...prev,
      [denomination.toString()]: countNum
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!destinationCaisseId || !montant) {
      toast.error('Veuillez remplir tous les champs obligatoires');
      return;
    }

    const montantNum = parseFloat(montant);
    if (isNaN(montantNum) || montantNum <= 0) {
      toast.error('Montant invalide');
      return;
    }

    if (montantNum > maxAmount) {
      toast.error(`Le montant ne peut pas dépasser ${new Intl.NumberFormat('fr-FR').format(maxAmount)} XOF`);
      return;
    }

    setLoading(true);
    try {
      await caisseAgentApi.createSettlementCash({
        agentId,
        destinationCaisseId,
        montant: montantNum,
        observations: observations || undefined,
        billetage: useBilletage ? billetage : undefined,
        idempotencyKey: crypto.randomUUID()
      });

      onSuccess();
    } catch (error: any) {
      console.error('Erreur création remise:', error);
      toast.error('Erreur lors de la création', {
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const caisseOptions = caisses.map((c) => ({
    value: c.caisseId,
    label: `${c.caisseNom || 'Caisse'} - ${c.caissierNom || 'Caissier'}`
  }));

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount);
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Remise Cash à l'Agence"
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Montant disponible */}
        <div className="p-4 bg-status-success-bg border border-status-success/20 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet size={20} className="text-status-success" />
              <span className="text-sm text-content-secondary">Disponible pour remise</span>
            </div>
            <span className="text-xl font-bold text-status-success">
              {formatMoney(maxAmount)} XOF
            </span>
          </div>
        </div>

        {/* Caisse destination */}
        <SelectField
          label="Caisse destination"
          name="destinationCaisseId"
          value={destinationCaisseId}
          onChange={(e) => setDestinationCaisseId(e.target.value)}
          options={[
            { value: '', label: loadingCaisses ? 'Chargement...' : 'Sélectionner une caisse' },
            ...caisseOptions
          ]}
          required
          disabled={loadingCaisses || caisses.length === 0}
          icon={Building2}
          helperText={caisses.length === 0 && !loadingCaisses ? 'Aucune caisse ouverte disponible' : undefined}
        />

        {/* Toggle billetage */}
        <div className="flex items-center gap-3 p-3 bg-surface-elevated rounded-lg border border-edge">
          <input
            type="checkbox"
            id="billetage"
            checked={useBilletage}
            onChange={(e) => setUseBilletage(e.target.checked)}
            className="w-4 h-4 rounded border-edge-strong bg-surface-elevated text-accent focus:ring-accent"
          />
          <label htmlFor="billetage" className="text-sm text-content-secondary">
            Détailler le billetage
          </label>
        </div>

        {/* Billetage */}
        {useBilletage ? (
          <div className="space-y-3 p-4 bg-surface-elevated rounded-lg border border-edge">
            <p className="text-xs font-medium text-content-muted uppercase tracking-wider">
              Billetage
            </p>
            <div className="grid grid-cols-2 gap-3">
              {DENOMINATIONS.map((denom) => (
                <div key={denom} className="flex items-center gap-2">
                  <span className="text-sm text-content-secondary w-20">
                    {formatMoney(denom)}
                  </span>
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={billetage[denom.toString()] || ''}
                    onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); handleBilletageChange(denom, v); }}
                    placeholder="0"
                    className="flex-1 px-3 py-2 bg-surface border border-edge rounded-lg text-content-primary placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent text-center"
                  />
                  <span className="text-xs text-content-muted w-20 text-right">
                    = {formatMoney((billetage[denom.toString()] || 0) * denom)}
                  </span>
                </div>
              ))}
            </div>
            <div className="pt-3 border-t border-edge flex items-center justify-between">
              <span className="text-sm font-medium text-content-secondary">Total</span>
              <span className="text-lg font-bold text-accent">
                {formatMoney(calculateBilletageTotal())} XOF
              </span>
            </div>
          </div>
        ) : (
          /* Montant simple */
          <FormField
            label="Montant à remettre"
            name="montant"
            inputMode="numeric"
            pattern="[0-9]*"
            value={montant}
            onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setMontant(v); }}
            placeholder="0"
            required
          />
        )}

        {/* Warning si montant dépasse */}
        {parseFloat(montant || '0') > maxAmount && (
          <div className="p-3 bg-status-danger-bg border border-status-danger/20 rounded-lg flex items-center gap-2">
            <AlertTriangle size={16} className="text-status-danger" />
            <p className="text-xs text-status-danger">
              Le montant dépasse le disponible ({formatMoney(maxAmount)} XOF)
            </p>
          </div>
        )}

        {/* Observations */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-content-secondary flex items-center gap-2">
            <FileText size={16} className="text-content-muted" />
            Observations
          </label>
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
            Cette remise sera soumise pour validation par un superviseur.
            Le montant ne sera transféré qu'après approbation.
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
            variant="success"
            isLoading={loading}
            icon={Send}
            disabled={!destinationCaisseId || !montant || parseFloat(montant || '0') > maxAmount}
          >
            Soumettre la remise
          </Button>
        </div>
      </form>
    </Modal>
  );
}
