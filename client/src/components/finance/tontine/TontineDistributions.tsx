import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Check, Search, Calendar, DollarSign, User, X } from 'lucide-react';
import { Card, Button, Badge, IconButton } from '../../ui';
import { tontineDistributionApi, tontineMembreApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { escapeHtml } from '../../../lib/sanitize';

interface Distribution {
  id: string;
  tour_numero: number;
  montant_total: number;
  date_distribution: string;
  mode_paiement: string;
  reference_paiement?: string;
  notes?: string;
  tontine_membres: {
    position_ordre: number;
    clients: {
      nom: string;
      prenom: string;
      telephone: string;
    };
  };
}

interface Membre {
  id: string;
  position: number;
  statut: string;
  aRecuBenefice: boolean; // CamelCase from internal API
  client: { // CamelCase from internal API
    nom: string;
    prenom: string;
  };
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
  
  // Form state
  const [selectedMembreId, setSelectedMembreId] = useState('');
  const [dateDistribution, setDateDistribution] = useState(new Date().toISOString().split('T')[0]);
  const [modePaiement, setModePaiement] = useState('ESPECES');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchDistributions();
    fetchMembres();
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

      // Filter for active members only
      const activeMembres = data.filter(m => m.statut === 'Actif').sort((a, b) => (a.position || 999) - (b.position || 999));
      setMembres(activeMembres);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des membres'));
    } finally {
      setLoading(false);
    }
  }, [tontineId]);

  const getNextBeneficiary = () => {
    // Logic: First active member sorted by position who hasn't received benefit
    return membres.find(m => !m.aRecuBenefice);
  };

  const nextBeneficiary = getNextBeneficiary();
  const nextTourNumber = distributions.length + 1;
  const montantEstime = membres.length * montantContribution;

  // Auto-select next beneficiary when modal opens
  useEffect(() => {
    if (showModal && nextBeneficiary) {
      setSelectedMembreId(nextBeneficiary.id);
    }
  }, [showModal, nextBeneficiary]);

  const handleDistribute = useCallback(async () => {
    if (!selectedMembreId) return;
    setLoading(true);
    try {
      const selectedMembre = membres.find(m => m.id === selectedMembreId);

      await tontineDistributionApi.create({
        tontineId,
        membreId: selectedMembreId,
        clientId: (selectedMembre?.client as any)?.id || (selectedMembre as any)?.clientId,
        tourNumero: nextTourNumber,
        montantTotal: montantEstime.toString(),
        dateDistribution: new Date(dateDistribution).toISOString(),
        modePaiement,
        referencePaiement: '',
        notes
      });

      setShowModal(false);
      fetchDistributions();
      fetchMembres(); // Refresh to update aRecuBenefice status
      onUpdate();
      toast.success('Distribution effectuée avec succès');
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de la distribution'));
    } finally {
      setLoading(false);
    }
  }, [selectedMembreId, membres, tontineId, nextTourNumber, montantEstime, dateDistribution, modePaiement, notes, fetchDistributions, fetchMembres, onUpdate]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-bold text-white">Distributions</h3>
        <Button
          onClick={() => setShowModal(true)}
          disabled={!nextBeneficiary}
          variant="success"
          size="sm"
          icon={DollarSign}
        >
          Nouvelle
        </Button>
      </div>

      {nextBeneficiary && (
        <Card className="bg-gradient-to-r from-emerald-900/40 to-slate-900/40 border-emerald-500/30 p-4">
           <div className="flex justify-between items-start">
              <div>
                <div className="text-xs text-emerald-400 font-bold uppercase tracking-wider mb-1">
                    Prochain Bénéficiaire (Tour {nextTourNumber})
                </div>
                <div className="text-lg font-bold text-white flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                      <User size={16} />
                  </div>
                  {nextBeneficiary.client.nom} {nextBeneficiary.client.prenom}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400 mb-0.5">Montant estimé</div>
                <div className="text-xl font-bold text-emerald-400">{montantEstime.toLocaleString()} FCFA</div>
              </div>
           </div>
        </Card>
      )}

      {loading && distributions.length === 0 ? (
        <div className="text-center py-12 text-slate-400">Chargement...</div>
      ) : distributions.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-slate-700 rounded-lg">
          <DollarSign className="mx-auto text-slate-500 mb-3" size={48} />
          <p className="text-slate-400 font-medium">Aucune distribution effectuée</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {distributions.map((dist) => (
            <Card key={dist.id} className="bg-slate-800/40 border-slate-700/50 p-3 hover:border-slate-600 transition-colors">
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                     <Badge variant="neutral" className="text-[10px] sm:text-xs text-slate-400 border-slate-600" value={`Tour #${dist.tour_numero}`} />
                     <span className="text-xs text-slate-500">
                        {new Date(dist.date_distribution).toLocaleDateString()}
                     </span>
                  </div>
                  
                  <div className="font-bold text-white text-sm truncate mb-1">
                      {dist.tontine_membres.clients.nom} {dist.tontine_membres.clients.prenom}
                  </div>
                  
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span>{dist.mode_paiement}</span>
                      {dist.notes && <span className="text-slate-600">• {dist.notes}</span>}
                  </div>
                </div>

                <div className="text-right shrink-0">
                    <div className="font-bold text-emerald-400 text-sm sm:text-base">
                        {dist.montant_total.toLocaleString()} FCFA
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
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Bénéficiaire</label>
                <select
                  value={selectedMembreId}
                  onChange={(e) => setSelectedMembreId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:border-emerald-500 focus:outline-none text-sm"
                >
                  <option value="">Sélectionner...</option>
                  {membres.filter(m => !m.aRecuBenefice).map(m => (
                    <option key={m.id} value={m.id}>
                      Position #{m.position} - {m.client.nom} {m.client.prenom}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Montant Total</label>
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 font-bold text-lg text-center">
                    {montantEstime.toLocaleString()} FCFA
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
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Commentaire optionnel..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:border-emerald-500 focus:outline-none text-sm"
                  rows={2}
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-700 bg-slate-900/50 shrink-0 flex gap-3">
                 <Button variant="ghost" fullWidth onClick={() => setShowModal(false)}>Annuler</Button>
                 <Button 
                    variant="success" 
                    fullWidth 
                    onClick={handleDistribute}
                    disabled={loading || !selectedMembreId}
                    isLoading={loading}
                    icon={Check}
                 >
                    Confirmer
                 </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
