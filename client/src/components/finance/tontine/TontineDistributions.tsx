import React, { useState, useEffect, useCallback } from 'react';
import { Check, DollarSign, User, X, AlertTriangle, Wallet, Info, TrendingDown } from 'lucide-react';
import { Card, Button, Badge, IconButton } from '../../ui';
import { tontineDistributionApi, tontineMembreApi, tontineApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { escapeHtml } from '../../../lib/sanitize';
import { formatClientName } from '../../../lib/format';

interface Distribution {
  id: string;
  tour_numero: number;
  tourNumero?: number;
  montant_total: number;
  montantTotal?: number;
  date_distribution: string;
  dateDistribution?: string;
  mode_paiement: string;
  modePaiement?: string;
  reference_paiement?: string;
  notes?: string;
  tontine_membres?: {
    position_ordre: number;
    clients: {
      nom: string;
      prenom: string;
      telephone: string;
    };
  };
  membre?: {
    client: {
      nom: string;
      prenom: string;
    };
  };
}

interface Membre {
  id: string;
  position: number;
  statut: string;
  aRecuBenefice: boolean;
  a_recu_benefice?: boolean;
  client: {
    id?: string;
    nom: string;
    prenom: string;
  };
  clientId?: string;
  totalCotisations?: string;
  toursPayes?: number;
  estAJour?: boolean;
}

interface TontineDistributionsProps {
  tontineId: string;
  tourActuel: number;
  montantContribution: number;
  nombreMembres: number;
  onUpdate: () => Promise<void>;
}

export default function TontineDistributions({ tontineId, montantContribution, tourActuel, nombreMembres, onUpdate }: TontineDistributionsProps) {
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [membres, setMembres] = useState<Membre[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [soldeDisponible, setSoldeDisponible] = useState<number>(0);
  const [loadingStats, setLoadingStats] = useState(false);

  // Form state
  const [selectedMembreId, setSelectedMembreId] = useState('');
  const [dateDistribution, setDateDistribution] = useState(new Date().toISOString().split('T')[0]);
  const [modePaiement, setModePaiement] = useState('ESPECES');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchDistributions();
    fetchMembres();
    fetchSolde();
  }, [tontineId]);

  const fetchSolde = useCallback(async () => {
    try {
      const tontine = await tontineApi.getById(tontineId);
      setSoldeDisponible(Number(tontine?.solde || tontine?.totalCollecte || 0));
    } catch (error) {
      console.error('Erreur chargement solde:', error);
    }
  }, [tontineId]);

  const fetchDistributions = useCallback(async () => {
    try {
      const data = await tontineDistributionApi.getByTontine(tontineId);
      setDistributions(data || []);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des distributions'));
    }
  }, [tontineId]);

  const fetchMembres = useCallback(async () => {
    setLoading(true);
    try {
      const data: Membre[] = await tontineMembreApi.getByTontine(tontineId);
      const activeMembres = data
        .filter(m => m.statut === 'Actif')
        .sort((a, b) => (a.position || 999) - (b.position || 999));
      setMembres(activeMembres);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des membres'));
    } finally {
      setLoading(false);
    }
  }, [tontineId]);

  const getNextBeneficiary = () => {
    return membres.find(m => !(m.aRecuBenefice || m.a_recu_benefice));
  };

  const nextBeneficiary = getNextBeneficiary();
  const nextTourNumber = distributions.length + 1;
  const membresEligibles = membres.filter(m => !(m.aRecuBenefice || m.a_recu_benefice));
  const montantEstime = membresEligibles.length > 0 ? membres.length * montantContribution : 0;
  const soldeInsuffisant = soldeDisponible < montantEstime;

  // Auto-select next beneficiary when modal opens
  useEffect(() => {
    if (showModal && nextBeneficiary) {
      setSelectedMembreId(nextBeneficiary.id);
    }
  }, [showModal, nextBeneficiary]);

  const handleDistribute = useCallback(async () => {
    if (!selectedMembreId) {
      toast.error('Veuillez sélectionner un bénéficiaire');
      return;
    }

    const selectedMembre = membres.find(m => m.id === selectedMembreId);
    if (!selectedMembre) {
      toast.error('Membre introuvable');
      return;
    }

    // Vérification préalable du solde côté client
    if (soldeDisponible < montantEstime) {
      toast.error(
        `Solde insuffisant pour effectuer cette distribution.\n` +
        `Solde actuel: ${soldeDisponible.toLocaleString()} FCFA\n` +
        `Montant requis: ${montantEstime.toLocaleString()} FCFA\n` +
        `Manquant: ${(montantEstime - soldeDisponible).toLocaleString()} FCFA`,
        { duration: 6000 }
      );
      return;
    }

    setLoading(true);
    try {
      await tontineDistributionApi.create({
        tontineId,
        membreId: selectedMembreId,
        clientId: selectedMembre.client?.id || selectedMembre.clientId,
        tourNumero: nextTourNumber,
        montantTotal: montantEstime.toString(),
        dateDistribution: new Date(dateDistribution).toISOString(),
        modePaiement,
        referencePaiement: '',
        notes
      });

      const beneficiaireNom = `${selectedMembre.client?.nom || ''} ${selectedMembre.client?.prenom || ''}`.trim();

      setShowModal(false);
      setNotes('');
      fetchDistributions();
      fetchMembres();
      fetchSolde();
      onUpdate();

      toast.success(
        `Distribution effectuée avec succès !\n` +
        `${beneficiaireNom} a reçu ${montantEstime.toLocaleString()} FCFA (Tour #${nextTourNumber})`,
        { duration: 5000 }
      );
    } catch (error: any) {
      // Parser le message d'erreur pour un feedback plus contextuel
      const errorMsg = error?.message || '';

      if (errorMsg.includes('Solde insuffisant')) {
        // Extraire les montants du message
        // Extraire les montants du message (format: "Solde insuffisant. Disponible: X FCFA, Requis: Y FCFA")
        // Regex adjusted to handle potential varying spaces or casing
        const match = errorMsg.match(/Disponible:\s*(\d+).*Requis:\s*(\d+)/i);
        if (match) {
          const disponible = parseInt(match[1]);
          const requis = parseInt(match[2]);
          const manquant = requis - disponible;

          toast.error(
            `Solde insuffisant pour la distribution.\n` +
            `Disponible: ${disponible.toLocaleString()} FCFA\n` +
            `Requis: ${requis.toLocaleString()} FCFA\n` +
            `Manquant: ${manquant.toLocaleString()} FCFA\n\n` +
            `Attendez plus de contributions avant de distribuer.`,
            { duration: 8000 }
          );
        } else {
          toast.error(errorMsg, { duration: 6000 });
        }
      } else if (errorMsg.includes('déjà reçu son bénéfice')) {
        toast.error(
          `Membre déjà bénéficiaire.\nCe membre a déjà reçu sa distribution. Sélectionnez un autre membre éligible.`,
          { duration: 5000 }
        );
      } else if (errorMsg.includes('distribution existe déjà')) {
        toast.error(
          `Tour déjà distribué.\nUne distribution a déjà été effectuée pour ce tour. Rafraîchissez la page.`,
          { duration: 5000 }
        );
      } else if (errorMsg.includes("n'est pas actif")) {
        toast.error(
          `Membre inactif.\nCe membre n'est plus actif dans la tontine et ne peut pas recevoir de distribution.`,
          { duration: 5000 }
        );
      } else {
        toast.error(handleApiError(error, 'Erreur lors de la distribution'));
      }
    } finally {
      setLoading(false);
    }
  }, [selectedMembreId, membres, tontineId, nextTourNumber, montantEstime, dateDistribution, modePaiement, notes, soldeDisponible, fetchDistributions, fetchMembres, fetchSolde, onUpdate]);

  // Helper pour obtenir le nom du bénéficiaire d'une distribution
  const getBeneficiaireName = (dist: Distribution) => {
    if (dist.membre?.client) {
      return formatClientName(dist.membre.client.nom, dist.membre.client.prenom);
    }
    if (dist.tontine_membres?.clients) {
      return `${dist.tontine_membres.clients.nom} ${dist.tontine_membres.clients.prenom || ''}`.trim();
    }
    return 'Inconnu';
  };

  // Helper pour obtenir le montant d'une distribution
  const getDistributionAmount = (dist: Distribution) => {
    return Number(dist.montant_total || dist.montantTotal || 0);
  };

  // Helper pour obtenir la date d'une distribution
  const getDistributionDate = (dist: Distribution) => {
    return dist.date_distribution || dist.dateDistribution || '';
  };

  // Helper pour obtenir le tour d'une distribution
  const getDistributionTour = (dist: Distribution) => {
    return dist.tour_numero || dist.tourNumero || 0;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-bold text-white">Distributions</h3>
        <Button
          onClick={() => {
            fetchSolde(); // Refresh balance before opening
            setShowModal(true);
          }}
          disabled={!nextBeneficiary || membresEligibles.length === 0}
          variant="success"
          size="sm"
          icon={DollarSign}
        >
          Nouvelle
        </Button>
      </div>

      {/* Alerte si solde insuffisant */}
      {soldeInsuffisant && membresEligibles.length > 0 && (
        <Card className="bg-amber-900/20 border-amber-500/30 p-3">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-500/20 rounded-lg shrink-0">
              <AlertTriangle size={18} className="text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-amber-400 text-sm">Solde insuffisant pour la prochaine distribution</div>
              <div className="text-xs text-slate-400 mt-1 space-y-0.5">
                <div>Solde actuel: <span className="text-white font-medium">{soldeDisponible.toLocaleString()} FCFA</span></div>
                <div>Montant requis: <span className="text-white font-medium">{montantEstime.toLocaleString()} FCFA</span></div>
                <div className="text-amber-400">
                  Manquant: <span className="font-bold">{(montantEstime - soldeDisponible).toLocaleString()} FCFA</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Indicateur de solde disponible */}
      <Card className="bg-slate-800/30 border-slate-700/50 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-400">
            <Wallet size={16} />
            <span className="text-xs font-medium uppercase tracking-wider">Solde Disponible</span>
          </div>
          <div className={`font-bold text-lg ${soldeInsuffisant ? 'text-amber-400' : 'text-emerald-400'}`}>
            {soldeDisponible.toLocaleString()} FCFA
          </div>
        </div>
      </Card>

      {nextBeneficiary && (
        <Card className={`p-4 ${soldeInsuffisant
          ? 'bg-gradient-to-r from-amber-900/30 to-slate-900/40 border-amber-500/30'
          : 'bg-gradient-to-r from-emerald-900/40 to-slate-900/40 border-emerald-500/30'}`}>
          <div className="flex justify-between items-start">
            <div>
              <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${soldeInsuffisant ? 'text-amber-400' : 'text-emerald-400'}`}>
                Prochain Bénéficiaire (Tour {nextTourNumber})
              </div>
              <div className="text-lg font-bold text-white flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${soldeInsuffisant ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                  <User size={16} />
                </div>
                {formatClientName(nextBeneficiary.client.nom, nextBeneficiary.client.prenom)}
              </div>
              {nextBeneficiary.estAJour === false && (
                <div className="flex items-center gap-1 mt-1 text-xs text-amber-400">
                  <Info size={12} />
                  Ce membre a des cotisations en retard
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400 mb-0.5">Montant estimé</div>
              <div className={`text-xl font-bold ${soldeInsuffisant ? 'text-amber-400' : 'text-emerald-400'}`}>
                {montantEstime.toLocaleString()} FCFA
              </div>
              {soldeInsuffisant && (
                <div className="text-[10px] text-amber-400/70 mt-0.5 flex items-center gap-1 justify-end">
                  <TrendingDown size={10} />
                  Solde insuffisant
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Message si tous ont reçu leur bénéfice */}
      {membresEligibles.length === 0 && membres.length > 0 && (
        <Card className="bg-green-900/20 border-green-500/30 p-4 text-center">
          <Check size={32} className="mx-auto text-green-400 mb-2" />
          <div className="font-bold text-green-400">Cycle terminé</div>
          <div className="text-sm text-slate-400 mt-1">
            Tous les membres ont reçu leur distribution pour ce cycle.
          </div>
        </Card>
      )}

      {loading && distributions.length === 0 ? (
        <div className="text-center py-12 text-slate-400">Chargement...</div>
      ) : distributions.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-slate-700 rounded-lg">
          <DollarSign className="mx-auto text-slate-500 mb-3" size={48} />
          <p className="text-slate-400 font-medium">Aucune distribution effectuée</p>
          <p className="text-slate-500 text-sm mt-1">
            Les distributions apparaîtront ici une fois effectuées.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {distributions.map((dist) => (
            <Card key={dist.id} className="bg-slate-800/40 border-slate-700/50 p-3 hover:border-slate-600 transition-colors">
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="neutral" className="text-[10px] sm:text-xs text-slate-400 border-slate-600" value={`Tour #${getDistributionTour(dist)}`} />
                    <span className="text-xs text-slate-500">
                      {new Date(getDistributionDate(dist)).toLocaleDateString('fr-FR')}
                    </span>
                  </div>

                  <div className="font-bold text-white text-sm truncate mb-1">
                    {getBeneficiaireName(dist)}
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>{dist.mode_paiement || dist.modePaiement}</span>
                    {dist.notes && <span className="text-slate-600">• {dist.notes}</span>}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="font-bold text-emerald-400 text-sm sm:text-base">
                    {getDistributionAmount(dist).toLocaleString()} FCFA
                  </div>
                  <Badge variant="success" className="bg-green-500/10 text-green-400 hover:bg-green-500/20 mt-1 justify-end" value="Payé" icon={<Check size={10} />} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-700 flex items-center justify-between shrink-0">
              <h2 className="text-lg font-bold text-white">Nouvelle Distribution</h2>
              <IconButton icon={X} onClick={() => setShowModal(false)} size="sm" aria-label="Fermer" />
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              {/* Alerte solde insuffisant dans le modal */}
              {soldeInsuffisant && (
                <div className="p-3 bg-amber-900/30 border border-amber-500/30 rounded-lg">
                  <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm mb-1">
                    <AlertTriangle size={16} />
                    Attention : Solde insuffisant
                  </div>
                  <div className="text-xs text-slate-300 space-y-0.5">
                    <div>Solde: <span className="font-medium">{soldeDisponible.toLocaleString()} FCFA</span></div>
                    <div>Requis: <span className="font-medium">{montantEstime.toLocaleString()} FCFA</span></div>
                    <div className="text-amber-400">Manquant: <span className="font-bold">{(montantEstime - soldeDisponible).toLocaleString()} FCFA</span></div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Bénéficiaire</label>
                <select
                  value={selectedMembreId}
                  onChange={(e) => setSelectedMembreId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:border-emerald-500 focus:outline-none text-sm"
                >
                  <option value="">Sélectionner un membre éligible...</option>
                  {membresEligibles.map(m => (
                    <option key={m.id} value={m.id}>
                      Position #{m.position} - {formatClientName(m.client.nom, m.client.prenom)}
                      {m.estAJour === false ? ' (en retard)' : ''}
                    </option>
                  ))}
                </select>
                {membresEligibles.length === 0 && (
                  <p className="text-xs text-amber-400 mt-1">Aucun membre éligible pour ce tour.</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Montant Total</label>
                <div className={`p-3 rounded-lg font-bold text-lg text-center ${
                  soldeInsuffisant
                    ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
                    : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                }`}>
                  {montantEstime.toLocaleString()} FCFA
                </div>
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>{membres.length} membres × {montantContribution.toLocaleString()} FCFA</span>
                  <span>Solde dispo: {soldeDisponible.toLocaleString()} FCFA</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Date</label>
                  <input
                    type="date"
                    value={dateDistribution}
                    onChange={(e) => setDateDistribution(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:border-emerald-500 focus:outline-none text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Mode</label>
                  <select
                    value={modePaiement}
                    onChange={(e) => setModePaiement(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:border-emerald-500 focus:outline-none text-sm"
                  >
                    <option value="ESPECES">Espèces</option>
                    <option value="MOBILE_MONEY">Mobile Money</option>
                    <option value="VIREMENT">Virement</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Notes (optionnel)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Commentaire sur cette distribution..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:border-emerald-500 focus:outline-none text-sm"
                  rows={2}
                />
              </div>

              {/* Récapitulatif avant confirmation */}
              {selectedMembreId && !soldeInsuffisant && (
                <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-lg">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Récapitulatif</div>
                  <div className="text-sm text-slate-300 space-y-1">
                    <div className="flex justify-between">
                      <span>Bénéficiaire:</span>
                      <span className="font-medium text-white">
                        {membres.find(m => m.id === selectedMembreId)?.client?.nom}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Montant:</span>
                      <span className="font-bold text-emerald-400">{montantEstime.toLocaleString()} FCFA</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Tour:</span>
                      <span className="font-medium">#{nextTourNumber}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-700 bg-slate-900/50 shrink-0 flex gap-3">
              <Button variant="ghost" fullWidth onClick={() => setShowModal(false)}>
                Annuler
              </Button>
              <Button
                variant={soldeInsuffisant ? 'danger' : 'success'}
                fullWidth
                onClick={handleDistribute}
                disabled={loading || !selectedMembreId || soldeInsuffisant}
                isLoading={loading}
                icon={soldeInsuffisant ? AlertTriangle : Check}
              >
                {soldeInsuffisant ? 'Solde insuffisant' : 'Confirmer la distribution'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
