import React, { useState, useEffect, useCallback } from 'react';
import { DollarSign, TrendingUp, Calendar, Check, Download, RefreshCw, Loader2, ChevronLeft, ChevronRight, Eye, AlertTriangle, FileText, Banknote, Smartphone, CreditCard, Clock } from 'lucide-react';
import { StatutPaiementCommission, STATUT_PAIEMENT_COMMISSION_LABELS } from '@shared/enum/status-constants';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../ui/sheet';
import { formatMoney, currencySymbol } from '@shared/config/currency';
import { toast } from 'sonner';

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
  mouvementId?: string;
  notes: string;
  agent?: { nom: string; prenom: string };
}

interface AgentCommissionsProps {
  agentId?: string;
}

type PaymentMethod = 'CASH' | 'PAYROLL' | 'MOBILE_MONEY';

export default function AgentCommissions({ agentId }: AgentCommissionsProps) {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriode, setSelectedPeriode] = useState('');
  const [recalculating, setRecalculating] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  // Detail Sheet
  const [selectedCommission, setSelectedCommission] = useState<Commission | null>(null);

  // Payment modal
  const [payingCommission, setPayingCommission] = useState<Commission | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [mmPhone, setMmPhone] = useState('');
  const [mmProvider, setMmProvider] = useState('MTN');
  const [activeSessions, setActiveSessions] = useState<Array<{ id: string; caisseNom?: string }>>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');

  const fetchCommissions = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (agentId) params.append('agent_id', agentId);
      if (selectedPeriode) params.append('periode', selectedPeriode);

      const response = await fetch(`/api/agent-commissions?${params.toString()}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Erreur lors du chargement');
      const data = await response.json();
      setCommissions(data || []);
      setCurrentPage(1);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  }, [agentId, selectedPeriode]);

  useEffect(() => {
    fetchCommissions();
  }, [fetchCommissions]);

  // WebSocket: listen for real-time commission updates
  useEffect(() => {
    const handler = () => fetchCommissions();
    window.addEventListener('agent-modules-update', handler);
    return () => window.removeEventListener('agent-modules-update', handler);
  }, [fetchCommissions]);

  // Fetch active caisse sessions when payment modal opens with CASH method
  useEffect(() => {
    if (payingCommission && paymentMethod === 'CASH') {
      fetch('/api/caisses/sessions?statut=OPEN', { credentials: 'include' })
        .then(r => r.ok ? r.json() : [])
        .then(data => {
          const sessions = (data.sessions || data || []).map((s: any) => ({
            id: s.id,
            caisseNom: s.caisseNom || s.caisse?.nom || 'Caisse',
          }));
          setActiveSessions(sessions);
          if (sessions.length > 0 && !selectedSessionId) {
            setSelectedSessionId(sessions[0].id);
          }
        })
        .catch(() => setActiveSessions([]));
    }
  }, [payingCommission, paymentMethod]);

  const handlePay = async () => {
    if (!payingCommission) return;
    setPaymentLoading(true);

    try {
      const body: Record<string, any> = { method: paymentMethod };

      if (paymentMethod === 'CASH') {
        if (!selectedSessionId) {
          toast.error('Sélectionnez une session caisse');
          setPaymentLoading(false);
          return;
        }
        body.sessionCaisseId = selectedSessionId;
      } else if (paymentMethod === 'MOBILE_MONEY') {
        if (!mmPhone) {
          toast.error('Saisissez un numéro de téléphone');
          setPaymentLoading(false);
          return;
        }
        body.phone = mmPhone;
        body.provider = mmProvider;
      }

      const response = await fetch(`/api/agent-commissions/${payingCommission.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Erreur lors du paiement');
      }

      const result = await response.json();

      if (paymentMethod === 'MOBILE_MONEY') {
        toast.success('Paiement Mobile Money initié', {
          description: 'Le paiement sera finalisé après confirmation de l\'opérateur',
        });
      } else {
        const methodLabel = paymentMethod === 'CASH' ? 'en espèces' : 'via fiche de paie';
        toast.success(`Commission payée ${methodLabel}`, {
          description: `${formatMoney(payingCommission.montantNet)} — ${payingCommission.periode}`,
        });
      }

      setPayingCommission(null);
      setSelectedCommission(null);
      fetchCommissions();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors du paiement');
    } finally {
      setPaymentLoading(false);
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

  const totalCommissions = commissions.reduce((sum, c) => sum + Number(c.montantCommission || 0), 0);
  const totalNet = commissions.reduce((sum, c) => sum + Number(c.montantNet || 0), 0);
  const commissionsPayees = commissions.filter(c => c.statutPaiement === StatutPaiementCommission.PAID).length;

  const totalPages = Math.ceil(commissions.length / ITEMS_PER_PAGE);
  const paginatedCommissions = commissions.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const symbol = currencySymbol();

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<TrendingUp size={16} />} label="Total Commissions" value={`${totalCommissions.toLocaleString()} ${symbol}`} color="blue" />
        <StatCard icon={<Check size={16} />} label="Montant Net" value={`${totalNet.toLocaleString()} ${symbol}`} color="green" />
        <StatCard icon={<Calendar size={16} />} label="Commissions Payées" value={commissionsPayees.toString()} color="emerald" />
        <StatCard icon={<AlertTriangle size={16} />} label="En Attente" value={(commissions.length - commissionsPayees).toString()} color="amber" />
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="month"
          value={selectedPeriode}
          onChange={(e) => setSelectedPeriode(e.target.value)}
          className="px-3 py-1.5 bg-surface border border-edge rounded-lg text-content-primary text-xs"
        />

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => {
              if (commissions.length === 0) return;
              const headers = ['Période', 'Collecté', 'Taux %', 'Commission', 'Primes', 'Avances', 'Net', 'Statut', 'Méthode', 'Paiement'];
              const rows = commissions.map(c => [
                c.periode, c.montantCollecte, c.tauxCommission, c.montantCommission,
                c.primes, c.avances, c.montantNet, c.statutPaiement,
                c.methodePaiement || '', c.datePaiement ? new Date(c.datePaiement).toLocaleDateString('fr-FR') : '',
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
            className="px-3 py-1.5 bg-surface hover:bg-surface-elevated text-content-secondary rounded-lg flex items-center gap-1.5 transition text-xs border border-edge"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Exporter</span>
          </button>

          <button
            onClick={recalculateAll}
            disabled={recalculating === 'all' || commissions.length === 0}
            className="px-3 py-1.5 bg-accent hover:bg-accent-primary-hover text-white rounded-lg flex items-center gap-1.5 transition disabled:opacity-50 text-xs font-medium"
          >
            {recalculating === 'all' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            <span className="hidden sm:inline">Recalculer Tout</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface rounded-xl border border-edge overflow-hidden">
        {loading && commissions.length === 0 ? (
          <div className="p-8 text-center text-content-muted"><Loader2 className="animate-spin mx-auto mb-2" />Chargement...</div>
        ) : commissions.length === 0 ? (
          <div className="p-8 text-center text-content-muted">Aucune commission — les commissions se créent automatiquement après chaque collecte approuvée</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-base/50">
                <tr>
                  {!agentId && <th className="px-3 py-2 text-left text-xs font-bold text-content-muted uppercase">Agent</th>}
                  <th className="px-3 py-2 text-left text-xs font-bold text-content-muted uppercase">Période</th>
                  <th className="px-3 py-2 text-right text-xs font-bold text-content-muted uppercase hidden sm:table-cell">Collecté</th>
                  <th className="px-3 py-2 text-right text-xs font-bold text-content-muted uppercase hidden md:table-cell">Taux</th>
                  <th className="px-3 py-2 text-right text-xs font-bold text-content-muted uppercase">Net</th>
                  <th className="px-3 py-2 text-left text-xs font-bold text-content-muted uppercase">Statut</th>
                  <th className="px-3 py-2 text-right text-xs font-bold text-content-muted uppercase"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge/50">
                {paginatedCommissions.map((commission) => (
                  <tr
                    key={commission.id}
                    className="hover:bg-surface-elevated/30 transition cursor-pointer group"
                    onClick={() => setSelectedCommission(commission)}
                  >
                    {!agentId && (
                      <td className="px-3 py-2 text-xs text-content-primary font-medium">
                        {commission.agent?.prenom} {commission.agent?.nom}
                      </td>
                    )}
                    <td className="px-3 py-2 text-xs text-content-secondary">{commission.periode}</td>
                    <td className="px-3 py-2 text-right text-xs text-content-muted hidden sm:table-cell">{Number(commission.montantCollecte || 0).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-xs text-content-muted hidden md:table-cell">{commission.tauxCommission}%</td>
                    <td className="px-3 py-2 text-right text-xs text-content-primary font-bold">{Number(commission.montantNet || 0).toLocaleString()} {symbol}</td>
                    <td className="px-3 py-2"><StatusBadge status={commission.statutPaiement} /></td>
                    <td className="px-3 py-2 text-right"><Eye size={14} className="text-content-muted group-hover:text-accent inline-block" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-edge-subtle bg-surface-base/20">
            <span className="text-[10px] text-content-muted">Page {currentPage} sur {totalPages}</span>
            <div className="flex gap-1">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1 rounded bg-surface border border-edge text-content-muted hover:text-content-primary disabled:opacity-30 transition"><ChevronLeft size={12} /></button>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1 rounded bg-surface border border-edge text-content-muted hover:text-content-primary disabled:opacity-30 transition"><ChevronRight size={12} /></button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Sheet */}
      <Sheet open={!!selectedCommission} onOpenChange={(open) => !open && setSelectedCommission(null)}>
        <SheetContent className="w-full sm:max-w-md bg-surface-base border-l-edge p-0 overflow-y-auto">
          {selectedCommission && (
            <>
              <SheetHeader className="px-6 py-4 border-b border-edge bg-surface-base/50 backdrop-blur sticky top-0 z-10">
                <SheetTitle className="text-content-primary">Détail Commission</SheetTitle>
                <SheetDescription className="text-content-muted">Période {selectedCommission.periode}</SheetDescription>
              </SheetHeader>
              <div className="p-6 space-y-6">
                {/* Header Card */}
                <div className="bg-surface-base/50 border border-edge rounded-xl p-4 flex justify-between items-start">
                  <div>
                    <div className="text-xs text-content-muted uppercase font-bold mb-1">Montant Net</div>
                    <div className="text-2xl font-bold text-content-primary tracking-tight">{formatMoney(selectedCommission.montantNet)}</div>
                  </div>
                  <StatusBadge status={selectedCommission.statutPaiement} />
                </div>

                {/* Details Calculation */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-content-muted uppercase flex items-center gap-2"><DollarSign size={12} /> Détails Calcul</h4>
                  <div className="bg-surface-base rounded-lg border border-edge divide-y divide-edge text-sm">
                    <div className="flex justify-between p-3">
                      <span className="text-content-muted">Montant Collecté</span>
                      <span className="text-content-primary font-mono">{formatMoney(selectedCommission.montantCollecte)}</span>
                    </div>
                    <div className="flex justify-between p-3">
                      <span className="text-content-muted">Taux Commission</span>
                      <span className="text-content-primary font-mono">{selectedCommission.tauxCommission}%</span>
                    </div>
                    <div className="flex justify-between p-3 bg-surface/30">
                      <span className="text-status-info">Commission Brute</span>
                      <span className="text-status-info font-bold font-mono">{formatMoney(selectedCommission.montantCommission)}</span>
                    </div>
                    <div className="flex justify-between p-3">
                      <span className="text-content-muted">Primes / Bonus</span>
                      <span className="text-status-success font-mono">+{formatMoney(selectedCommission.primes)}</span>
                    </div>
                    <div className="flex justify-between p-3">
                      <span className="text-content-muted">Avances / Déductions</span>
                      <span className="text-status-warning font-mono">-{formatMoney(selectedCommission.avances)}</span>
                    </div>
                  </div>
                </div>

                {/* Meta Info */}
                <div className="grid grid-cols-2 gap-3">
                  <InfoItem label="Méthode" value={selectedCommission.methodePaiement || '-'} />
                  <InfoItem label="Date Paiement" value={selectedCommission.datePaiement ? new Date(selectedCommission.datePaiement).toLocaleDateString('fr-FR') : '-'} />
                </div>

                {selectedCommission.notes && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-content-muted uppercase flex items-center gap-2"><FileText size={12} /> Notes</h4>
                    <div className="p-3 bg-surface-base/50 rounded-lg border border-edge text-content-secondary text-sm italic">"{selectedCommission.notes}"</div>
                  </div>
                )}

                {/* Actions */}
                <div className="pt-4 border-t border-edge flex flex-col gap-3">
                  {selectedCommission.statutPaiement === StatutPaiementCommission.PENDING && Number(selectedCommission.montantNet || 0) > 0 && (
                    <button
                      onClick={() => {
                        setPayingCommission(selectedCommission);
                        setPaymentMethod('CASH');
                        setMmPhone('');
                        setSelectedSessionId('');
                      }}
                      className="w-full py-3 bg-status-success hover:bg-status-success/90 text-white rounded-xl font-bold text-sm shadow-lg shadow-status-success/20 transition active:scale-[0.98]"
                    >
                      Payer cette Commission
                    </button>
                  )}
                  {selectedCommission.statutPaiement === 'PROCESSING' && (
                    <div className="flex items-center gap-2 p-3 bg-status-info-bg border border-status-info/20 rounded-xl">
                      <Clock size={16} className="text-status-info" />
                      <span className="text-sm text-status-info font-medium">Paiement Mobile Money en cours...</span>
                    </div>
                  )}
                  <button
                    onClick={() => recalculateOne(selectedCommission.id)}
                    disabled={recalculating === selectedCommission.id}
                    className="w-full py-3 bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20 rounded-xl font-bold text-sm flex justify-center items-center gap-2 transition"
                  >
                    {recalculating === selectedCommission.id ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                    Recalculer
                  </button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Payment Modal */}
      {payingCommission && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-base w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
            <div className="p-6 border-b border-edge">
              <h3 className="text-lg font-bold text-content-primary">Payer la Commission</h3>
              <p className="text-sm text-content-muted mt-1">
                {payingCommission.periode} — <span className="font-bold text-content-primary">{formatMoney(payingCommission.montantNet)}</span>
              </p>
            </div>

            <div className="p-6 space-y-4">
              {/* Method Selection */}
              <div className="space-y-2">
                <PaymentMethodOption
                  selected={paymentMethod === 'CASH'}
                  onClick={() => setPaymentMethod('CASH')}
                  icon={<Banknote size={20} />}
                  label="Espèces (Caisse)"
                  description="Décaissement depuis la session caisse ouverte"
                />
                <PaymentMethodOption
                  selected={paymentMethod === 'PAYROLL'}
                  onClick={() => setPaymentMethod('PAYROLL')}
                  icon={<CreditCard size={20} />}
                  label="Fiche de paie"
                  description="Ajouté au prochain bulletin de paie"
                />
                <PaymentMethodOption
                  selected={paymentMethod === 'MOBILE_MONEY'}
                  onClick={() => setPaymentMethod('MOBILE_MONEY')}
                  icon={<Smartphone size={20} />}
                  label="Mobile Money"
                  description="Envoi via MTN ou Airtel Money"
                />
              </div>

              {/* Cash: session selector */}
              {paymentMethod === 'CASH' && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-content-muted">Session Caisse</label>
                  {activeSessions.length === 0 ? (
                    <p className="text-sm text-status-warning">Aucune session caisse ouverte</p>
                  ) : (
                    <select
                      value={selectedSessionId}
                      onChange={e => setSelectedSessionId(e.target.value)}
                      className="w-full px-3 py-2 bg-input border border-input-border rounded-lg text-content-primary text-sm focus:border-input-focus"
                    >
                      {activeSessions.map(s => (
                        <option key={s.id} value={s.id}>{s.caisseNom}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Mobile Money: phone + provider */}
              {paymentMethod === 'MOBILE_MONEY' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-content-muted">Numéro de téléphone</label>
                    <input
                      type="tel"
                      value={mmPhone}
                      onChange={e => setMmPhone(e.target.value)}
                      placeholder="Ex: 066000000"
                      className="w-full px-3 py-2 bg-input border border-input-border rounded-lg text-content-primary text-sm focus:border-input-focus mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-content-muted">Opérateur</label>
                    <select
                      value={mmProvider}
                      onChange={e => setMmProvider(e.target.value)}
                      className="w-full px-3 py-2 bg-input border border-input-border rounded-lg text-content-primary text-sm focus:border-input-focus mt-1"
                    >
                      <option value="MTN">MTN Mobile Money</option>
                      <option value="AIRTEL">Airtel Money</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-edge flex gap-3">
              <button
                onClick={() => setPayingCommission(null)}
                disabled={paymentLoading}
                className="flex-1 py-3 bg-surface hover:bg-surface-elevated text-content-secondary rounded-xl font-medium text-sm transition border border-edge"
              >
                Annuler
              </button>
              <button
                onClick={handlePay}
                disabled={paymentLoading || (paymentMethod === 'CASH' && activeSessions.length === 0)}
                className="flex-1 py-3 bg-status-success hover:bg-status-success/90 text-white rounded-xl font-bold text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {paymentLoading ? <Loader2 size={16} className="animate-spin" /> : null}
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function PaymentMethodOption({ selected, onClick, icon, label, description }: {
  selected: boolean; onClick: () => void; icon: React.ReactNode; label: string; description: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition ${
        selected
          ? 'border-accent bg-accent/5 ring-1 ring-accent/30'
          : 'border-edge hover:border-edge-subtle hover:bg-surface-elevated/30'
      }`}
    >
      <div className={`p-2 rounded-lg ${selected ? 'bg-accent/10 text-accent' : 'bg-surface text-content-muted'}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-semibold ${selected ? 'text-accent' : 'text-content-primary'}`}>{label}</div>
        <div className="text-xs text-content-muted">{description}</div>
      </div>
      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
        selected ? 'border-accent' : 'border-edge'
      }`}>
        {selected && <div className="w-2 h-2 rounded-full bg-accent" />}
      </div>
    </button>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  const colorClasses: Record<string, string> = {
    blue: 'from-status-info/20 to-status-info/5 border-status-info/20 text-status-info',
    green: 'from-status-success/20 to-status-success/5 border-status-success/20 text-status-success',
    emerald: 'from-status-success/20 to-status-success/5 border-status-success/20 text-status-success',
    amber: 'from-status-warning/20 to-status-warning/5 border-status-warning/20 text-status-warning',
  };
  return (
    <div className={`rounded-xl p-3 border bg-gradient-to-br ${colorClasses[color] || colorClasses.blue}`}>
      <div className="flex justify-between items-start mb-1"><div className="p-1.5 rounded-lg bg-white/5">{icon}</div></div>
      <div className="text-lg font-bold text-content-primary truncate">{value}</div>
      <div className="text-[10px] uppercase font-bold opacity-70 tracking-wide">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = status === StatutPaiementCommission.PAID
    ? 'bg-status-success-bg text-status-success border-status-success/20'
    : status === StatutPaiementCommission.PENDING
    ? 'bg-status-warning-bg text-status-warning border-status-warning/20'
    : status === 'PROCESSING'
    ? 'bg-status-info-bg text-status-info border-status-info/20'
    : 'bg-status-info-bg text-status-info border-status-info/20';

  const label = STATUT_PAIEMENT_COMMISSION_LABELS[status as keyof typeof STATUT_PAIEMENT_COMMISSION_LABELS] || status;

  return <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${styles}`}>{label}</span>;
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2.5 bg-surface-base rounded-lg border border-edge">
      <div className="text-[10px] uppercase font-bold text-content-muted mb-0.5">{label}</div>
      <div className="text-sm font-medium text-content-secondary">{value}</div>
    </div>
  );
}
