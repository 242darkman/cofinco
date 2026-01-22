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
          setDestinationCaisseId(activeSessions[0].caisse_id);
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
    value: c.caisse_id,
    label: `${c.caisse_nom || 'Caisse'} - ${c.caissier_nom || 'Caissier'}`
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
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet size={20} className="text-emerald-400" />
              <span className="text-sm text-slate-300">Disponible pour remise</span>
            </div>
            <span className="text-xl font-bold text-emerald-400">
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
            className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500"
          />
          <label htmlFor="billetage" className="text-sm text-slate-300">
            Détailler le billetage
          </label>
        </div>

        {/* Billetage */}
        {useBilletage ? (
          <div className="space-y-3 p-4 bg-surface-elevated rounded-lg border border-edge">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Billetage
            </p>
            <div className="grid grid-cols-2 gap-3">
              {DENOMINATIONS.map((denom) => (
                <div key={denom} className="flex items-center gap-2">
                  <span className="text-sm text-slate-300 w-20">
                    {formatMoney(denom)}
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={billetage[denom.toString()] || ''}
                    onChange={(e) => handleBilletageChange(denom, e.target.value)}
                    placeholder="0"
                    className="flex-1 px-3 py-2 bg-slate-800 border border-edge rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 text-center"
                  />
                  <span className="text-xs text-slate-500 w-20 text-right">
                    = {formatMoney((billetage[denom.toString()] || 0) * denom)}
                  </span>
                </div>
              ))}
            </div>
            <div className="pt-3 border-t border-edge flex items-center justify-between">
              <span className="text-sm font-medium text-slate-300">Total</span>
              <span className="text-lg font-bold text-cyan-400">
                {formatMoney(calculateBilletageTotal())} XOF
              </span>
            </div>
          </div>
        ) : (
          /* Montant simple */
          <FormField
            label="Montant à remettre"
            name="montant"
            type="number"
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            placeholder="0"
            required
          />
        )}

        {/* Warning si montant dépasse */}
        {parseFloat(montant || '0') > maxAmount && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-400" />
            <p className="text-xs text-red-300">
              Le montant dépasse le disponible ({formatMoney(maxAmount)} XOF)
            </p>
          </div>
        )}

        {/* Observations */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
            <FileText size={16} className="text-slate-400" />
            Observations
          </label>
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
