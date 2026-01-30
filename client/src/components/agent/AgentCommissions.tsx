import React, { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, Calendar, Check, X, Download, Plus, Edit, RefreshCw, Loader2 } from 'lucide-react';
import { StatutPaiementCommission, STATUT_PAIEMENT_COMMISSION_LABELS } from '@shared/enum/status-constants';

interface Commission {
  id: string;
  agent_id: string;
  periode: string;
  montant_collecte: number;
  taux_commission: number;
  montant_commission: number;
  primes: number;
  avances: number;
  montant_net: number;
  statut_paiement: string;
  date_paiement?: string;
  methode_paiement?: string;
  notes: string;
  agent?: {
    nom: string;
    prenom: string;
  };
}

interface AgentCommissionsProps {
  agentId?: string;
}

export default function AgentCommissions({ agentId }: AgentCommissionsProps) {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedPeriode, setSelectedPeriode] = useState('');
  const [recalculating, setRecalculating] = useState<string | null>(null); // commission id or 'all'
  const [formData, setFormData] = useState({
    agent_id: agentId || '',
    periode: new Date().toISOString().slice(0, 7),
    montant_collecte: 0,
    taux_commission: 5.0,
    primes: 0,
    avances: 0,
    methode_paiement: 'Mobile Money',
    notes: ''
  });

  useEffect(() => {
    fetchCommissions();
  }, [agentId, selectedPeriode]);

  const fetchCommissions = async () => {
    try {
      const params = new URLSearchParams();
      if (agentId) params.append('agent_id', agentId);
      if (selectedPeriode) params.append('periode', selectedPeriode);
      
      const response = await fetch(`/api/agent-commissions?${params.toString()}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Erreur lors du chargement');
      const data = await response.json();
      setCommissions(data || []);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateCommission = () => {
    const montant_commission = (formData.montant_collecte * formData.taux_commission) / 100;
    const montant_net = montant_commission + formData.primes - formData.avances;
    return { montant_commission, montant_net };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { montant_commission, montant_net } = calculateCommission();

      const response = await fetch('/api/agent-commissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...formData,
          montant_commission,
          montant_net,
          statut_paiement: 'En attente'
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erreur lors de la création');
      }

      setShowForm(false);
      fetchCommissions();
      setFormData({
        agent_id: agentId || '',
        periode: new Date().toISOString().slice(0, 7),
        montant_collecte: 0,
        taux_commission: 5.0,
        primes: 0,
        avances: 0,
        methode_paiement: 'Mobile Money',
        notes: ''
      });
    } catch (error: any) {
      alert('Erreur: ' + error.error);
    } finally {
      setLoading(false);
    }
  };

  const handlePayer = async (commissionId: string) => {
    try {
      const response = await fetch(`/api/agent-commissions/${commissionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          statut_paiement: 'Payé',
          date_paiement: new Date().toISOString()
        })
      });

      if (!response.ok) throw new Error('Erreur lors du paiement');
      fetchCommissions();
    } catch (error: any) {
      alert('Erreur: ' + error.error);
    }
  };

  const recalculateOne = async (commissionId: string) => {
    setRecalculating(commissionId);
    try {
      const response = await fetch(`/api/agent-commissions/${commissionId}/recalculate`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Erreur recalcul');
      await fetchCommissions();
    } catch (error) {
      console.error('Erreur recalcul:', error);
    } finally {
      setRecalculating(null);
    }
  };

  const recalculateAll = async () => {
    setRecalculating('all');
    try {
      const response = await fetch('/api/agent-commissions/recalculate-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ agent_id: agentId, periode: selectedPeriode || undefined }),
      });
      if (!response.ok) throw new Error('Erreur recalcul');
      await fetchCommissions();
    } catch (error) {
      console.error('Erreur recalcul:', error);
    } finally {
      setRecalculating(null);
    }
  };

  const totalCommissions = commissions.reduce((sum, c) => sum + c.montant_commission, 0);
  const totalNet = commissions.reduce((sum, c) => sum + c.montant_net, 0);
  const commissionsPayees = commissions.filter(c => c.statut_paiement === StatutPaiementCommission.PAID).length;

  const { montant_commission: previewCommission, montant_net: previewNet } = calculateCommission();

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <DollarSign size={24} />
            <TrendingUp size={20} />
          </div>
          <div className="text-3xl font-bold mb-1">{totalCommissions.toLocaleString()} FCFA</div>
          <div className="text-blue-100 text-sm">Total Commissions</div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <DollarSign size={24} />
            <Check size={20} />
          </div>
          <div className="text-3xl font-bold mb-1">{totalNet.toLocaleString()} FCFA</div>
          <div className="text-green-100 text-sm">Montant Net</div>
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <Check size={24} />
            <Calendar size={20} />
          </div>
          <div className="text-3xl font-bold mb-1">{commissionsPayees}</div>
          <div className="text-emerald-100 text-sm">Commissions Payées</div>
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <X size={24} />
            <Calendar size={20} />
          </div>
          <div className="text-3xl font-bold mb-1">{commissions.length - commissionsPayees}</div>
          <div className="text-emerald-100 text-sm">En Attente</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 transition"
        >
          <Plus size={20} />
          Nouvelle Commission
        </button>

        <input
          type="month"
          value={selectedPeriode}
          onChange={(e) => setSelectedPeriode(e.target.value)}
          className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
        />

        <button
          onClick={() => {
            if (commissions.length === 0) return;
            const headers = ['Période', 'Agent', 'Collecté', 'Taux %', 'Commission', 'Primes', 'Avances', 'Net', 'Statut', 'Paiement'];
            const rows = commissions.map(c => [
              c.periode,
              c.agent ? `${c.agent.nom} ${c.agent.prenom}` : '',
              c.montant_collecte,
              c.taux_commission,
              c.montant_commission,
              c.primes,
              c.avances,
              c.montant_net,
              c.statut_paiement,
              c.date_paiement ? new Date(c.date_paiement).toLocaleDateString('fr-FR') : ''
            ]);
            const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
            const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `commissions_${selectedPeriode || 'all'}.csv`;
            link.click();
            URL.revokeObjectURL(url);
          }}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg flex items-center gap-2 transition"
        >
          <Download size={20} />
          Exporter
        </button>

        <button
          onClick={recalculateAll}
          disabled={recalculating === 'all' || commissions.length === 0}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-2 transition disabled:opacity-50"
        >
          {recalculating === 'all' ? <Loader2 size={20} className="animate-spin" /> : <RefreshCw size={20} />}
          Recalculer Tout
        </button>
      </div>

      {/* Formulaire */}
      {showForm && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-xl font-bold text-white mb-4">Nouvelle Commission</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  Période
                </label>
                <input
                  type="month"
                  value={formData.periode}
                  onChange={(e) => setFormData({ ...formData, periode: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  Montant Collecté (FC)
                </label>
                <input
                  type="number"
                  value={formData.montant_collecte}
                  onChange={(e) => setFormData({ ...formData, montant_collecte: Number(e.target.value) })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  Taux Commission (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.taux_commission}
                  onChange={(e) => setFormData({ ...formData, taux_commission: Number(e.target.value) })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  Primes (FC)
                </label>
                <input
                  type="number"
                  value={formData.primes}
                  onChange={(e) => setFormData({ ...formData, primes: Number(e.target.value) })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  Avances Déduites (FC)
                </label>
                <input
                  type="number"
                  value={formData.avances}
                  onChange={(e) => setFormData({ ...formData, avances: Number(e.target.value) })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  Méthode de Paiement
                </label>
                <select
                  value={formData.methode_paiement}
                  onChange={(e) => setFormData({ ...formData, methode_paiement: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                >
                  <option value="Espèces">Espèces</option>
                  <option value="Virement">Virement</option>
                  <option value="Mobile Money">Mobile Money</option>
                  <option value="Chèque">Chèque</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                rows={3}
              />
            </div>

            {/* Aperçu */}
            <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
              <h4 className="font-semibold text-white mb-3">Aperçu du Calcul</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-slate-300">
                  <span>Commission ({formData.taux_commission}%):</span>
                  <span className="font-semibold text-blue-400">{previewCommission.toLocaleString()} FCFA</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Primes:</span>
                  <span className="font-semibold text-green-400">+{formData.primes.toLocaleString()} FCFA</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Avances:</span>
                  <span className="font-semibold text-blue-400">-{formData.avances.toLocaleString()} FCFA</span>
                </div>
                <div className="flex justify-between text-white font-bold text-lg pt-2 border-t border-slate-600">
                  <span>Montant Net:</span>
                  <span className="text-green-400">{previewNet.toLocaleString()} FCFA</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition disabled:opacity-50"
              >
                Enregistrer
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition"
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Liste des commissions */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-700">
              <tr>
                {!agentId && <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">Agent</th>}
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">Période</th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-slate-300">Collecté</th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-slate-300">Taux</th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-slate-300">Commission</th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-slate-300">Primes</th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-slate-300">Avances</th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-slate-300">Net</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">Statut</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {commissions.map((commission) => (
                <tr key={commission.id} className="hover:bg-slate-700/50 transition">
                  {!agentId && (
                    <td className="px-6 py-4 text-white">
                      {commission.agent?.nom} {commission.agent?.prenom}
                    </td>
                  )}
                  <td className="px-6 py-4 text-white">{commission.periode}</td>
                  <td className="px-6 py-4 text-right text-white">{commission.montant_collecte.toLocaleString()} FCFA</td>
                  <td className="px-6 py-4 text-right text-white">{commission.taux_commission}%</td>
                  <td className="px-6 py-4 text-right text-blue-400 font-semibold">{commission.montant_commission.toLocaleString()} FCFA</td>
                  <td className="px-6 py-4 text-right text-green-400">{commission.primes.toLocaleString()} FCFA</td>
                  <td className="px-6 py-4 text-right text-blue-400">{commission.avances.toLocaleString()} FCFA</td>
                  <td className="px-6 py-4 text-right text-white font-bold">{commission.montant_net.toLocaleString()} FCFA</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      commission.statut_paiement === StatutPaiementCommission.PAID
                        ? 'bg-green-500/20 text-green-400'
                        : commission.statut_paiement === StatutPaiementCommission.PENDING
                        ? 'bg-cyan-500/20 text-cyan-400'
                        : 'bg-blue-500/20 text-blue-400'
                    }`}>
                      {STATUT_PAIEMENT_COMMISSION_LABELS[commission.statut_paiement as keyof typeof STATUT_PAIEMENT_COMMISSION_LABELS] || commission.statut_paiement}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => recalculateOne(commission.id)}
                        disabled={recalculating === commission.id}
                        className="px-2 py-1 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 rounded text-sm transition disabled:opacity-50"
                        title="Recalculer depuis collectes"
                      >
                        {recalculating === commission.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                      </button>
                      {commission.statut_paiement === StatutPaiementCommission.PENDING && (
                        <button
                          onClick={() => handlePayer(commission.id)}
                          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition"
                        >
                          Payer
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {commissions.length === 0 && (
            <div className="text-center py-12">
              <DollarSign size={48} className="mx-auto text-slate-600 mb-4" />
              <p className="text-slate-400">Aucune commission trouvée</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
