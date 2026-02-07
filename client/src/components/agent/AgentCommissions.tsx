import React, { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, Calendar, Check, X, Download, Plus, RefreshCw, Loader2, ChevronLeft, ChevronRight, Eye, AlertTriangle, FileText } from 'lucide-react';
import { StatutPaiementCommission, STATUT_PAIEMENT_COMMISSION_LABELS } from '@shared/enum/status-constants';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../ui/sheet';
import { Pagination } from '../ui'; // Assuming Pagination component exists as used in previous steps

interface Commission {
  id: string;
  agentId: string;
  periode: string;
  montantCollecte: number;
  tauxCommission: number;
  montantCommission: number;
  primes: number;
  avances: number;
  montantNet: number;
  statutPaiement: string;
  datePaiement?: string;
  methodePaiement?: string;
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
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  // Detail Sheet
  const [selectedCommission, setSelectedCommission] = useState<Commission | null>(null);

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
      setLoading(true);
      const params = new URLSearchParams();
      if (agentId) params.append('agent_id', agentId);
      if (selectedPeriode) params.append('periode', selectedPeriode);
      
      const response = await fetch(`/api/agent-commissions?${params.toString()}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Erreur lors du chargement');
      const data = await response.json();
      setCommissions(data || []);
      setCurrentPage(1); // Reset to first page on filter change
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
      // Update selected commission if open
      if (selectedCommission && selectedCommission.id === commissionId) {
          setSelectedCommission({
              ...selectedCommission,
              statutPaiement: 'Payé',
              datePaiement: new Date().toISOString()
          });
      }
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
       // Update selected commission if open - simpler to just close it or reload it but reloading whole list handles it
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

  const totalCommissions = commissions.reduce((sum, c) => sum + c.montantCommission, 0);
  const totalNet = commissions.reduce((sum, c) => sum + c.montantNet, 0);
  const commissionsPayees = commissions.filter(c => c.statutPaiement === StatutPaiementCommission.PAID).length;

  const { montant_commission: previewCommission, montant_net: previewNet } = calculateCommission();

  // Pagination Logic
  const totalPages = Math.ceil(commissions.length / ITEMS_PER_PAGE);
  const paginatedCommissions = commissions.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="space-y-4">
      {/* Stats Compact */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard 
            icon={<TrendingUp size={16} />} 
            label="Total Commissions" 
            value={`${totalCommissions.toLocaleString()} FCFA`} 
            color="blue" 
        />
        <StatCard 
            icon={<Check size={16} />} 
            label="Montant Net" 
            value={`${totalNet.toLocaleString()} FCFA`} 
            color="green" 
        />
        <StatCard 
            icon={<Calendar size={16} />} 
            label="Commissions Payées" 
            value={commissionsPayees.toString()} 
            color="emerald" 
        />
        <StatCard 
            icon={<AlertTriangle size={16} />} 
            label="En Attente" 
            value={(commissions.length - commissionsPayees).toString()} 
            color="amber" 
        />
      </div>

      {/* Actions Compact */}
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center gap-1.5 transition text-xs font-bold"
        >
          <Plus size={14} />
          Nouvelle
        </button>

        <input
          type="month"
          value={selectedPeriode}
          onChange={(e) => setSelectedPeriode(e.target.value)}
          className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs"
        />

        <div className="flex items-center gap-2 ml-auto">
            <button
            onClick={() => {
                if (commissions.length === 0) return;
                const headers = ['Période', 'Agent', 'Collecté', 'Taux %', 'Commission', 'Primes', 'Avances', 'Net', 'Statut', 'Paiement'];
                const rows = commissions.map(c => [
                c.periode,
                c.agent ? `${c.agent.nom} ${c.agent.prenom}` : '',
                c.montantCollecte,
                c.tauxCommission,
                c.montantCommission,
                c.primes,
                c.avances,
                c.montantNet,
                c.statutPaiement,
                c.datePaiement ? new Date(c.datePaiement).toLocaleDateString('fr-FR') : ''
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
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center gap-1.5 transition text-xs border border-slate-700"
            title="Exporter CSV"
            >
            <Download size={14} />
            <span className="hidden sm:inline">Exporter</span>
            </button>

            <button
            onClick={recalculateAll}
            disabled={recalculating === 'all' || commissions.length === 0}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-1.5 transition disabled:opacity-50 text-xs font-medium"
            >
            {recalculating === 'all' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            <span className="hidden sm:inline">Recalculer Tout</span>
            </button>
        </div>
      </div>

      {/* Formulaire Compact */}
      {showForm && (
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 text-sm animate-in slide-in-from-top-2">
          <h3 className="text-base font-bold text-white mb-3">Nouvelle Commission</h3>
          <form onSubmit={handleSubmit} className="space-y-3">
             {/* Compact Form Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <FormInput label="Période" type="month" value={formData.periode} onChange={v => setFormData({...formData, periode: v})} required />
              <FormInput label="Collecté (FC)" type="number" value={formData.montant_collecte} onChange={v => setFormData({...formData, montant_collecte: Number(v)})} required />
              <FormInput label="Taux (%)" type="number" value={formData.taux_commission} onChange={v => setFormData({...formData, taux_commission: Number(v)})} step="0.1" required />
              <FormInput label="Primes (FC)" type="number" value={formData.primes} onChange={v => setFormData({...formData, primes: Number(v)})} />
              <FormInput label="Avances (FC)" type="number" value={formData.avances} onChange={v => setFormData({...formData, avances: Number(v)})} />
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Méthode</label>
                <select
                  value={formData.methode_paiement}
                  onChange={(e) => setFormData({ ...formData, methode_paiement: e.target.value })}
                  className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-xs focus:ring-1 focus:ring-blue-500 max-h-[34px]"
                >
                  <option value="Espèces">Espèces</option>
                  <option value="Virement">Virement</option>
                  <option value="Mobile Money">Mobile Money</option>
                  <option value="Chèque">Chèque</option>
                </select>
              </div>
            </div>
            <div>
               <label className="block text-xs font-semibold text-slate-400 mb-1">Notes</label>
               <input type="text" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-xs" />
            </div>

            <div className="flex gap-2 justify-end">
               <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-slate-400 hover:text-white text-xs">Annuler</button>
               <button type="submit" disabled={loading} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold">Enregistrer ({previewNet.toLocaleString()} FCFA Net)</button>
            </div>
          </form>
        </div>
      )}

      {/* Liste Compacte */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        {loading && commissions.length === 0 ? (
             <div className="p-8 text-center text-slate-500"><Loader2 className="animate-spin mx-auto mb-2" />Chargement...</div>
        ) : commissions.length === 0 ? (
             <div className="p-8 text-center text-slate-500">Aucune commission trouvée</div>
        ) : (
            <div className="overflow-x-auto">
            <table className="w-full">
                <thead className="bg-slate-900/50">
                <tr>
                    {!agentId && <th className="px-3 py-2 text-left text-xs font-bold text-slate-400 uppercase">Agent</th>}
                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-400 uppercase">Période</th>
                    <th className="px-3 py-2 text-right text-xs font-bold text-slate-400 uppercase hidden sm:table-cell">Collecté</th>
                    <th className="px-3 py-2 text-right text-xs font-bold text-slate-400 uppercase hidden md:table-cell">Taux</th>
                    <th className="px-3 py-2 text-right text-xs font-bold text-slate-400 uppercase hidden md:table-cell">Primes</th>
                    <th className="px-3 py-2 text-right text-xs font-bold text-slate-400 uppercase hidden md:table-cell">Avances</th>
                    <th className="px-3 py-2 text-right text-xs font-bold text-slate-400 uppercase">Net</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-400 uppercase">Statut</th>
                    <th className="px-3 py-2 text-right text-xs font-bold text-slate-400 uppercase"></th>
                </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                {paginatedCommissions.map((commission) => (
                    <tr 
                        key={commission.id} 
                        className="hover:bg-slate-700/30 transition cursor-pointer group"
                        onClick={() => setSelectedCommission(commission)}
                    >
                    {!agentId && (
                        <td className="px-3 py-2 text-xs text-white font-medium">
                        {commission.agent?.nom} {commission.agent?.prenom}
                        </td>
                    )}
                    <td className="px-3 py-2 text-xs text-slate-300">{commission.periode}</td>
                    <td className="px-3 py-2 text-right text-xs text-slate-400 hidden sm:table-cell">{commission.montantCollecte.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-xs text-slate-400 hidden md:table-cell">{commission.tauxCommission}%</td>
                    <td className="px-3 py-2 text-right text-xs text-green-400 hidden md:table-cell">+{commission.primes.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-xs text-amber-400 hidden md:table-cell">-{commission.avances.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-xs text-white font-bold">{commission.montantNet.toLocaleString()} FCFA</td>
                    <td className="px-3 py-2">
                         <StatusBadge status={commission.statutPaiement} />
                    </td>
                    <td className="px-3 py-2 text-right">
                        <Eye size={14} className="text-slate-600 group-hover:text-cyan-400 inline-block" />
                    </td>
                    </tr>
                ))}
                </tbody>
            </table>
            </div>
        )}
        
        {/* Pagination Footer */}
        {totalPages > 1 && (
            <div className="flex items-center justify-between px-3 py-2 border-t border-slate-700/50 bg-slate-900/20">
              <span className="text-[10px] text-slate-500">Page {currentPage} sur {totalPages}</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 transition"
                >
                  <ChevronLeft size={12} />
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 transition"
                >
                  <ChevronRight size={12} />
                </button>
              </div>
            </div>
        )}
      </div>

       {/* Detail Sheet */}
       <Sheet open={!!selectedCommission} onOpenChange={(open) => !open && setSelectedCommission(null)}>
        <SheetContent className="w-full sm:max-w-md bg-slate-950 border-l-slate-800 p-0 overflow-y-auto">
            {selectedCommission && (
                <>
                <SheetHeader className="px-6 py-4 border-b border-slate-800 bg-slate-950/50 backdrop-blur sticky top-0 z-10">
                    <SheetTitle className="text-white">Détail Commission</SheetTitle>
                    <SheetDescription className="text-slate-400">
                        Période {selectedCommission.periode}
                    </SheetDescription>
                </SheetHeader>
                <div className="p-6 space-y-6">
                    {/* Header Card */}
                    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex justify-between items-start">
                        <div>
                            <div className="text-xs text-slate-400 uppercase font-bold mb-1">Montant Net à Payer</div>
                            <div className="text-2xl font-bold text-white tracking-tight">{selectedCommission.montantNet.toLocaleString()} FCFA</div>
                        </div>
                        <StatusBadge status={selectedCommission.statutPaiement} />
                    </div>

                     {/* Details Calculation */}
                    <div className="space-y-3">
                         <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                            <DollarSign size={12} /> Détails Calcul
                         </h4>
                         <div className="bg-slate-900 rounded-lg border border-slate-800 divide-y divide-slate-800 text-sm">
                             <div className="flex justify-between p-3">
                                 <span className="text-slate-400">Montant Collecté</span>
                                 <span className="text-white font-mono">{selectedCommission.montantCollecte.toLocaleString()} FCFA</span>
                             </div>
                             <div className="flex justify-between p-3">
                                 <span className="text-slate-400">Taux Commission</span>
                                 <span className="text-white font-mono">{selectedCommission.tauxCommission}%</span>
                             </div>
                             <div className="flex justify-between p-3 bg-slate-800/30">
                                 <span className="text-blue-300">Commission Brute</span>
                                 <span className="text-blue-300 font-bold font-mono">{selectedCommission.montantCommission.toLocaleString()} FCFA</span>
                             </div>
                             <div className="flex justify-between p-3">
                                 <span className="text-slate-400">Primes / Bonus</span>
                                 <span className="text-green-400 font-mono">+{selectedCommission.primes.toLocaleString()} FCFA</span>
                             </div>
                             <div className="flex justify-between p-3">
                                 <span className="text-slate-400">Avances / Déductions</span>
                                 <span className="text-amber-400 font-mono">-{selectedCommission.avances.toLocaleString()} FCFA</span>
                             </div>
                         </div>
                    </div>

                    {/* Meta Info */}
                    <div className="grid grid-cols-2 gap-3">
                         <InfoItem label="Méthode" value={selectedCommission.methodePaiement} />
                         <InfoItem label="Date Paiement" value={selectedCommission.datePaiement ? new Date(selectedCommission.datePaiement).toLocaleDateString() : '-'} />
                    </div>

                    {selectedCommission.notes && (
                         <div className="space-y-2">
                             <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                <FileText size={12} /> Notes
                             </h4>
                             <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-800 text-slate-300 text-sm italic">
                                 "{selectedCommission.notes}"
                             </div>
                         </div>
                    )}

                    {/* Actions */}
                    <div className="pt-4 border-t border-slate-800 flex flex-col gap-3">
                         {selectedCommission.statutPaiement === StatutPaiementCommission.PENDING && (
                            <button
                                onClick={() => handlePayer(selectedCommission.id)}
                                className="w-full py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-green-900/20 transition"
                            >
                                Marquer comme Payé
                            </button>
                         )}
                         <button
                            onClick={() => recalculateOne(selectedCommission.id)}
                            disabled={recalculating === selectedCommission.id}
                            className="w-full py-3 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 hover:text-indigo-300 border border-indigo-500/20 rounded-xl font-bold text-sm flex justify-center items-center gap-2 transition"
                         >
                            {recalculating === selectedCommission.id ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                            Recalculer cette Commission
                         </button>
                    </div>
                </div>
                </>
            )}
        </SheetContent>
       </Sheet>
    </div>
  );
}

// Sub-components for cleaner code
function StatCard({ icon, label, value, color }: { icon: React.ReactNode, label: string, value: string, color: string }) {
    const colorClasses: Record<string, string> = {
        blue: 'from-blue-500/20 to-blue-600/5 border-blue-500/20 text-blue-400',
        green: 'from-green-500/20 to-green-600/5 border-green-500/20 text-green-400',
        emerald: 'from-emerald-500/20 to-emerald-600/5 border-emerald-500/20 text-emerald-400',
        amber: 'from-amber-500/20 to-amber-600/5 border-amber-500/20 text-amber-400',
    };
    
    return (
        <div className={`rounded-xl p-3 border bg-gradient-to-br ${colorClasses[color] || colorClasses.blue}`}>
            <div className="flex justify-between items-start mb-1">
                <div className="p-1.5 rounded-lg bg-white/5">{icon}</div>
            </div>
            <div className="text-lg font-bold text-white truncate">{value}</div>
            <div className="text-[10px] uppercase font-bold opacity-70 tracking-wide">{label}</div>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const styles = status === StatutPaiementCommission.PAID
        ? 'bg-green-500/10 text-green-500 border-green-500/20'
        : status === StatutPaiementCommission.PENDING
        ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
        : 'bg-blue-500/10 text-blue-500 border-blue-500/20';
        
    const label = STATUT_PAIEMENT_COMMISSION_LABELS[status as keyof typeof STATUT_PAIEMENT_COMMISSION_LABELS] || status;

    return (
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${styles}`}>
            {label}
        </span>
    );
}

function InfoItem({ label, value }: { label: string, value: string | undefined }) {
    return (
        <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
            <div className="text-[10px] uppercase font-bold text-slate-500 mb-0.5">{label}</div>
            <div className="text-sm font-medium text-slate-200">{value || '-'}</div>
        </div>
    );
}

interface FormInputProps {
    label: string;
    type: string;
    value: string | number;
    onChange: (value: string) => void;
    required?: boolean;
    step?: string;
}

function FormInput({ label, type, value, onChange, required, step }: FormInputProps) {
    return (
        <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">{label}</label>
            <input 
                type={type} 
                value={value} 
                onChange={e => onChange(e.target.value)} 
                required={required} 
                step={step}
                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-xs focus:ring-1 focus:ring-blue-500" 
            />
        </div>
    );
}
