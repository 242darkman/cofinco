import React, { useState, useEffect, useCallback } from 'react';
import {
  StatutClient,
  MethodePaiement,
  StatutMembreTontine
} from '@shared/enum/status-constants';
import { Check, DollarSign, User, X, AlertTriangle, Wallet, TrendingDown, Banknote, Smartphone, Clock, Play } from 'lucide-react';
import mtnLogo from '@/assets/logos/mtn-logo.png';
import airtelLogo from '@/assets/logos/airtel-logo.png';

const MOBILE_OPERATORS = [
  { id: 'MTN', name: 'MTN Mobile Money', color: 'bg-status-warning-bg0', logo: mtnLogo },
  { id: 'AIRTEL', name: 'Airtel Money', color: 'bg-status-danger', logo: airtelLogo },
] as const;
import { Card, Button, Badge, IconButton } from '../../ui';
import { tontineMembreApi, tontineApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { formatClientName } from '../../../lib/format';

interface DistributionRequest {
  id: string;
  status: string;
  amountRequested?: number;
  amountPaid?: number;
  netAmount?: number;
  payoutMethod?: string;
  createdAt?: string;
  paidAt?: string;
  turnId?: string;
  beneficiaryMemberId?: string;
}

interface Membre {
  id: string;
  position: number;
  statut: string;
  aRecuBenefice: boolean;
  client: {
    id?: string;
    nom: string;
    prenom: string;
  };
  clientId?: string;
  totalCotisations?: string;
  toursPayes?: number;
  estAJour?: boolean;
  msisdn?: string;
  preferredPayoutMethod?: string;
}

interface TontineDistributionsProps {
  tontineId: string;
  tourActuel: number;
  montantContribution: number;
  nombreMembres: number;
  onUpdate: () => Promise<void>;
}

const payoutMethodLabels: Record<string, string> = {
  CASH: 'Espèces',
  MOBILE_MONEY: 'Mobile Money',
  WALLET: 'Compte client',
};

const statusConfig: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary' | 'outline' }> = {
  DRAFT: { label: 'Brouillon', variant: 'neutral' },
  SUBMITTED: { label: 'En attente', variant: 'warning' },
  APPROVED: { label: 'Approuvé', variant: 'success' },
  PENDING_PROVIDER: { label: 'En cours', variant: 'warning' },
  SUCCESS: { label: 'Payé', variant: 'success' },
  PARTIAL: { label: 'Partiel', variant: 'warning' },
  FAILED: { label: 'Échec', variant: 'danger' },
  CANCELLED: { label: 'Annulé', variant: 'neutral' },
};

export default function TontineDistributions({ tontineId, montantContribution, tourActuel, nombreMembres, onUpdate }: TontineDistributionsProps) {
  const [distributions, setDistributions] = useState<DistributionRequest[]>([]);
  const [membres, setMembres] = useState<Membre[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [soldeDisponible, setSoldeDisponible] = useState<number>(0);
  const [dashboard, setDashboard] = useState<any>(null);
  const [turns, setTurns] = useState<any[]>([]);

  // Form state
  const [selectedMembreId, setSelectedMembreId] = useState('');
  const [selectedTurnId, setSelectedTurnId] = useState('');
  const [payoutMethod, setPayoutMethod] = useState<'CASH' | 'MOBILE_MONEY' | 'WALLET'>('CASH');
  const [provider, setProvider] = useState<string>('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchData();
  }, [tontineId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch all data in parallel
      const [dashData, membresData] = await Promise.all([
        tontineApi.getDashboard(tontineId).catch(() => null),
        tontineMembreApi.getByTontine(tontineId)
      ]);

      setDashboard(dashData);
      setSoldeDisponible(Number(dashData?.stats?.potCollecte || 0) - Number(dashData?.stats?.potDistribue || 0));

      // Filter active members
      const activeMembres = (membresData || [])
        .filter((m: Membre) => m.statut === StatutMembreTontine.ACTIVE || m.statut === StatutClient.ACTIVE)
        .sort((a: Membre, b: Membre) => (a.position || 999) - (b.position || 999));
      setMembres(activeMembres);

      // Fetch distribution requests
      if (tontineId) {
        const requests = await tontineApi.getDistributionRequests(tontineId);
        setDistributions(requests || []);
      }

      // Fetch turns if we have a cycle
      if (dashData?.currentCycle?.id) {
        const turnsData = await tontineApi.getTurns(tontineId, dashData.currentCycle.id);
        setTurns(turnsData || []);
      }
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des distributions'));
    } finally {
      setLoading(false);
    }
  };

  // Find next eligible turn and member
  const getNextTurn = useCallback(() => {
    return turns.find(t => t.status === 'SCHEDULED' || t.status === 'READY');
  }, [turns]);

  const nextTurn = getNextTurn();
  const currentCycle = dashboard?.currentCycle;

  // Members eligible for distribution (haven't received yet)
  const membresEligibles = membres.filter(m => !m.aRecuBenefice);
  const montantEstime = membres.length > 0 ? membres.length * montantContribution : 0;
  const soldeInsuffisant = soldeDisponible < montantEstime;

  // Auto-select next turn/member when modal opens
  useEffect(() => {
    if (showModal && nextTurn) {
      setSelectedTurnId(nextTurn.id);
      const memberId = nextTurn.beneficiaryMemberId;
      if (memberId) {
        setSelectedMembreId(memberId);
      }
    }
  }, [showModal, nextTurn]);

  const handleDistribute = useCallback(async () => {
    if (!selectedMembreId || !selectedTurnId || !currentCycle?.id) {
      toast.error('Veuillez sélectionner un bénéficiaire et un tour');
      return;
    }

    if (soldeInsuffisant) {
      toast.error('Solde insuffisant pour effectuer cette distribution');
      return;
    }

    setLoading(true);
    try {
      // Create distribution request
      const result = await tontineApi.createDistributionRequest(tontineId, {
        cycleId: currentCycle.id,
        turnId: selectedTurnId,
        beneficiaryMemberId: selectedMembreId,
        payoutMethod,
        provider: payoutMethod === 'MOBILE_MONEY' ? provider : undefined,
        notes,
      });

      // If status is SUBMITTED, auto-approve
      if (result.status === 'SUBMITTED') {
        await tontineApi.approveDistribution(tontineId, result.requestId);
      }

      const selectedMembre = membres.find(m => m.id === selectedMembreId);
      const beneficiaireNom = selectedMembre
        ? formatClientName(selectedMembre.client.nom, selectedMembre.client.prenom)
        : 'Bénéficiaire';

      setShowModal(false);
      setNotes('');
      fetchData();
      onUpdate();

      toast.success(`Distribution effectuée pour ${beneficiaireNom}`);
    } catch (error: any) {
      const errorMsg = error?.message || '';
      if (errorMsg.includes('Solde insuffisant') || errorMsg.includes('Pot insuffisant')) {
        toast.error('Solde insuffisant pour la distribution', { duration: 6000 });
      } else {
        toast.error(handleApiError(error, 'Erreur lors de la distribution'));
      }
    } finally {
      setLoading(false);
    }
  }, [selectedMembreId, selectedTurnId, currentCycle, tontineId, payoutMethod, provider, notes, membres, soldeInsuffisant, fetchData, onUpdate]);

  // Helper functions
  const getDistributionAmount = (dist: DistributionRequest) => {
    return Number(dist.netAmount || dist.amountPaid || dist.amountRequested || 0);
  };

  const getDistributionDate = (dist: DistributionRequest) => {
    return dist.paidAt || dist.createdAt || '';
  };

  const getDistributionStatus = (dist: DistributionRequest) => {
    return dist.status || 'DRAFT';
  };

  const getPayoutMethod = (dist: DistributionRequest) => {
    return dist.payoutMethod || 'CASH';
  };

  // Find member name by ID
  const getMemberName = (memberId: string) => {
    const membre = membres.find(m => m.id === memberId);
    return membre ? formatClientName(membre.client.nom, membre.client.prenom) : 'Inconnu';
  };

  // Success distributions
  const successDistributions = distributions.filter(d => d.status === 'SUCCESS' || d.status === 'PARTIAL');
  const pendingDistributions = distributions.filter(d => d.status === 'SUBMITTED' || d.status === 'APPROVED');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-bold text-content-primary">Distributions</h3>
        <Button
          onClick={() => {
            fetchData();
            setShowModal(true);
          }}
          disabled={!nextTurn || !currentCycle}
          variant="success"
          size="sm"
          icon={DollarSign}
        >
          Nouvelle
        </Button>
      </div>

      {/* Alert if no cycle */}
      {!currentCycle && (
        <Card className="bg-surface/50 border-edge-subtle p-4 text-center">
          <Clock className="mx-auto text-content-muted mb-2" size={24} />
          <p className="text-content-muted text-sm">Générez d'abord un cycle pour effectuer des distributions</p>
        </Card>
      )}

      {/* Alert if insufficient balance */}
      {currentCycle && soldeInsuffisant && membresEligibles.length > 0 && (
        <Card className="bg-status-warning/10 border-status-warning/30 p-3">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-status-warning shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-status-warning text-sm">Solde insuffisant</div>
              <div className="text-xs text-content-muted mt-1">
                Solde: <span className="text-content-primary">{soldeDisponible.toLocaleString()} FCFA</span> •
                Requis: <span className="text-content-primary">{montantEstime.toLocaleString()} FCFA</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Balance indicator */}
      <Card className="bg-surface/30 border-edge-subtle p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-content-muted">
            <Wallet size={16} />
            <span className="text-xs font-medium uppercase tracking-wider">Solde Disponible</span>
          </div>
          <div className={`font-bold text-lg ${soldeInsuffisant ? 'text-status-warning' : 'text-status-success'}`}>
            {soldeDisponible.toLocaleString()} FCFA
          </div>
        </div>
      </Card>

      {/* Next beneficiary card */}
      {nextTurn && currentCycle && (
        <Card className={`p-4 ${soldeInsuffisant
          ? 'bg-gradient-to-r from-status-warning/10 to-surface-base/40 border-status-warning/30'
          : 'bg-gradient-to-r from-status-success/10 to-surface-base/40 border-status-success/30'}`}>
          <div className="flex justify-between items-start">
            <div>
              <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${soldeInsuffisant ? 'text-status-warning' : 'text-status-success'}`}>
                Prochain Bénéficiaire (Tour #{nextTurn.turnNumber})
              </div>
              <div className="text-lg font-bold text-content-primary flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${soldeInsuffisant ? 'bg-status-warning-bg text-status-warning' : 'bg-status-success-bg text-status-success'}`}>
                  <User size={16} />
                </div>
                {getMemberName(nextTurn.beneficiaryMemberId)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-content-muted mb-0.5">Montant estimé</div>
              <div className={`text-xl font-bold ${soldeInsuffisant ? 'text-status-warning' : 'text-status-success'}`}>
                {montantEstime.toLocaleString()} FCFA
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Pending distributions */}
      {pendingDistributions.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-status-warning uppercase tracking-wider">En attente</div>
          {pendingDistributions.map(dist => {
            const memberId = dist.beneficiaryMemberId;
            const status = getDistributionStatus(dist);
            const statusCfg = statusConfig[status] || statusConfig.DRAFT;

            return (
              <Card key={dist.id} className="bg-status-warning-bg border-status-warning/20 p-3">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium text-content-primary text-sm">{memberId ? getMemberName(memberId) : 'Inconnu'}</div>
                    <div className="text-xs text-content-muted">{getDistributionAmount(dist).toLocaleString()} FCFA</div>
                  </div>
                  <Badge variant={statusCfg.variant} className="text-[10px]" value={statusCfg.label} />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Completed distributions */}
      {loading && successDistributions.length === 0 ? (
        <div className="text-center py-8 text-content-muted">Chargement...</div>
      ) : successDistributions.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-edge rounded-lg">
          <DollarSign className="mx-auto text-content-muted mb-3" size={32} />
          <p className="text-content-muted text-sm">Aucune distribution effectuée</p>
        </div>
      ) : (
        <div className="space-y-2">
          {successDistributions.map((dist) => {
            const memberId = dist.beneficiaryMemberId;
            const status = getDistributionStatus(dist);
            const statusCfg = statusConfig[status] || statusConfig.SUCCESS;
            const method = getPayoutMethod(dist);

            return (
              <Card key={dist.id} className="bg-surface/40 border-edge-subtle p-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={statusCfg.variant} className="text-[10px]" value={statusCfg.label} />
                      <span className="text-xs text-content-muted">
                        {getDistributionDate(dist) && new Date(getDistributionDate(dist)).toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                    <div className="font-medium text-content-primary text-sm truncate">
                      {memberId ? getMemberName(memberId) : 'Inconnu'}
                    </div>
                    <div className="text-xs text-content-muted flex items-center gap-1">
                      {method === 'MOBILE_MONEY' ? <Smartphone size={10} /> : <Banknote size={10} />}
                      {payoutMethodLabels[method] || method}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-status-success">{getDistributionAmount(dist).toLocaleString()} FCFA</div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Distribution Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-base border border-edge rounded-xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-edge flex items-center justify-between shrink-0">
              <h2 className="text-lg font-bold text-content-primary">Nouvelle Distribution</h2>
              <IconButton icon={X} onClick={() => setShowModal(false)} size="sm" aria-label="Fermer" />
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              {soldeInsuffisant && (
                <div className="p-3 bg-status-warning/15 border border-status-warning/30 rounded-lg">
                  <div className="flex items-center gap-2 text-status-warning font-semibold text-sm">
                    <AlertTriangle size={16} />
                    Solde insuffisant
                  </div>
                  <div className="text-xs text-content-secondary mt-1">
                    Manquant: <span className="font-bold text-status-warning">{(montantEstime - soldeDisponible).toLocaleString()} FCFA</span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-content-muted uppercase tracking-wider mb-2">Bénéficiaire</label>
                <select
                  value={selectedMembreId}
                  onChange={(e) => setSelectedMembreId(e.target.value)}
                  className="w-full bg-surface-base border border-edge rounded-lg px-3 py-2.5 text-content-primary focus:border-accent focus:outline-none text-sm"
                >
                  <option value="">Sélectionner...</option>
                  {membresEligibles.map(m => (
                    <option key={m.id} value={m.id}>
                      #{m.position} - {formatClientName(m.client.nom, m.client.prenom)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-content-muted uppercase tracking-wider mb-2">Montant</label>
                <div className={`p-3 rounded-lg font-bold text-lg text-center ${
                  soldeInsuffisant
                    ? 'bg-status-warning-bg border border-status-warning/30 text-status-warning'
                    : 'bg-status-success-bg border border-status-success/30 text-status-success'
                }`}>
                  {montantEstime.toLocaleString()} FCFA
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-content-muted uppercase tracking-wider mb-2">Mode de paiement</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['CASH', 'MOBILE_MONEY', 'WALLET'] as const).map(method => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPayoutMethod(method)}
                      className={`flex flex-col items-center justify-center gap-1 p-2 rounded-lg border text-xs font-medium transition ${
                        payoutMethod === method
                          ? 'bg-accent border-accent text-white'
                          : 'bg-surface border-edge text-content-secondary hover:bg-surface-elevated'
                      }`}
                    >
                      {method === 'CASH' ? <Banknote size={16} /> : method === 'MOBILE_MONEY' ? <Smartphone size={16} /> : <Wallet size={16} />}
                      {payoutMethodLabels[method]}
                    </button>
                  ))}
                </div>
              </div>

              {payoutMethod === 'MOBILE_MONEY' && (
                <div>
                  <label className="block text-xs font-semibold text-content-muted uppercase tracking-wider mb-2">Opérateur</label>
                  <div className="grid grid-cols-2 gap-2">
                    {MOBILE_OPERATORS.map(op => (
                      <button
                        key={op.id}
                        type="button"
                        onClick={() => setProvider(op.id)}
                        className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm font-medium transition ${
                          provider === op.id
                            ? 'bg-accent border-accent text-white'
                            : 'bg-surface border-edge text-content-secondary hover:bg-surface-elevated'
                        }`}
                      >
                        <img src={op.logo} alt={op.name} className="w-6 h-6 rounded-full object-contain bg-white/10" />
                        {op.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-content-muted uppercase tracking-wider mb-2">Notes (optionnel)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Commentaire..."
                  className="w-full bg-surface-base border border-edge rounded-lg px-3 py-2 text-content-primary focus:border-accent focus:outline-none text-sm"
                  rows={2}
                />
              </div>
            </div>

            <div className="p-4 border-t border-edge bg-surface-base/50 shrink-0 flex gap-3">
              <Button variant="ghost" fullWidth onClick={() => setShowModal(false)}>
                Annuler
              </Button>
              <Button
                variant={soldeInsuffisant ? 'danger' : 'success'}
                fullWidth
                onClick={handleDistribute}
                disabled={loading || !selectedMembreId || soldeInsuffisant || !selectedTurnId}
                isLoading={loading}
                icon={soldeInsuffisant ? AlertTriangle : Check}
              >
                {soldeInsuffisant ? 'Solde insuffisant' : 'Confirmer'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
