/**
 * OfflineDaySession Component
 *
 * Manages the agent's offline day session lifecycle:
 * - Open day (billetage, opening balance)
 * - Real-time cash tracking during the day
 * - Close day (physical cash count, discrepancy detection)
 * - Reconciliation summary
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Play,
  StopCircle,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  Banknote,
  TrendingUp,
  TrendingDown,
  WifiOff,
  Loader2,
  ArrowUpDown,
} from 'lucide-react';
import { toast } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import {
  openDaySession,
  closeDaySession,
  getCurrentSession,
  getReconciliationSummary,
  type LimitCheckResult,
} from '../../../lib/offline-treasury';
import { getOrCreateFingerprint } from '../../../lib/device-fingerprint';
import type { AgentDaySession } from '../../../lib/offline-db';
import { useJournalSync, useOfflinePendingCount } from '../../../hooks/useJournalSync';

// ============================================================================
// Types
// ============================================================================

interface OfflineDaySessionProps {
  agentId: number;
  agenceId: string;
}

// Cash denomination structure for XAF
const DENOMINATIONS = [
  { value: 10000, label: '10 000' },
  { value: 5000, label: '5 000' },
  { value: 2000, label: '2 000' },
  { value: 1000, label: '1 000' },
  { value: 500, label: '500' },
  { value: 100, label: '100' },
  { value: 50, label: '50' },
  { value: 25, label: '25' },
  { value: 10, label: '10' },
  { value: 5, label: '5' },
];

// ============================================================================
// Component
// ============================================================================

export default function OfflineDaySession({ agentId, agenceId }: OfflineDaySessionProps) {
  const [session, setSession] = useState<AgentDaySession | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showBilletage, setShowBilletage] = useState(false);
  const [billetage, setBilletage] = useState<Record<string, number>>({});
  const [justification, setJustification] = useState('');
  const [reconciliation, setReconciliation] = useState<{
    computedBalance: number;
    operationCount: number;
    totalCollected: number;
    totalDisbursed: number;
    hasDiscrepancy: boolean;
  } | null>(null);

  const { pendingCount, hasPending } = useOfflinePendingCount();
  const journalSync = useJournalSync();

  // Load current session
  const loadSession = useCallback(async () => {
    try {
      const current = await getCurrentSession(agentId);
      setSession(current);

      if (current) {
        const summary = await getReconciliationSummary(agentId);
        if (summary) {
          setReconciliation({
            computedBalance: summary.computedBalance,
            operationCount: summary.operationCount,
            totalCollected: summary.totalCollected,
            totalDisbursed: summary.totalDisbursed,
            hasDiscrepancy: summary.hasDiscrepancy,
          });
        }
      }
    } catch (err) {
      console.error('Error loading session:', err);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    loadSession();
    // Refresh every 30 seconds
    const interval = setInterval(loadSession, 30_000);
    return () => clearInterval(interval);
  }, [loadSession]);

  // Compute total from billetage
  const billetageTotal = Object.entries(billetage).reduce(
    (sum, [denom, count]) => sum + parseInt(denom) * (count || 0),
    0
  );

  // ===== OPEN DAY =====
  const handleOpenDay = useCallback(async () => {
    if (billetageTotal <= 0) {
      toast.error('Veuillez saisir le billetage d\'ouverture');
      return;
    }

    setActionLoading(true);
    try {
      const { full: deviceId } = getOrCreateFingerprint();
      const newSession = await openDaySession({
        agentId,
        deviceId,
        openingBalance: billetageTotal,
        billetage,
        agenceId,
      });

      setSession(newSession);
      setShowBilletage(false);
      setBilletage({});
      toast.success(`Session ouverte avec ${formatMoney(billetageTotal)}`);
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de l\'ouverture de la session');
    } finally {
      setActionLoading(false);
    }
  }, [agentId, agenceId, billetageTotal, billetage]);

  // ===== CLOSE DAY =====
  const handleCloseDay = useCallback(async () => {
    if (billetageTotal <= 0) {
      toast.error('Veuillez saisir le billetage de fermeture');
      return;
    }

    setActionLoading(true);
    try {
      const { discrepancy, session: updated } = await closeDaySession({
        agentId,
        closingBalance: billetageTotal,
        billetage,
        agenceId,
        justification: justification || undefined,
      });

      setSession(updated);
      setShowBilletage(false);
      setBilletage({});
      setJustification('');

      if (Math.abs(discrepancy) < 0.01) {
        toast.success('Session fermee. Solde exact !');
      } else {
        toast.warning(
          `Session fermee. Ecart de ${formatMoney(Math.abs(discrepancy))} XAF ${discrepancy > 0 ? '(surplus)' : '(deficit)'}`
        );
      }
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la fermeture de la session');
    } finally {
      setActionLoading(false);
    }
  }, [agentId, agenceId, billetageTotal, billetage, justification]);

  // ===== BILLETAGE INPUT =====
  const updateBilletage = useCallback((denomination: string, count: number) => {
    setBilletage(prev => ({
      ...prev,
      [denomination]: Math.max(0, count),
    }));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="animate-spin text-blue-400" size={24} />
      </div>
    );
  }

  // ===== NO SESSION =====
  if (!session || session.syncStatus === 'reconciled') {
    return (
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Play size={20} className="text-green-400" />
          Ouvrir la session du jour
        </h3>

        {!showBilletage ? (
          <button
            onClick={() => setShowBilletage(true)}
            className="w-full py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg font-semibold transition"
          >
            Commencer le billetage d'ouverture
          </button>
        ) : (
          <div className="space-y-4">
            <BilletageInput
              billetage={billetage}
              onChange={updateBilletage}
              total={billetageTotal}
            />

            <div className="flex gap-3">
              <button
                onClick={() => { setShowBilletage(false); setBilletage({}); }}
                className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition"
              >
                Annuler
              </button>
              <button
                onClick={handleOpenDay}
                disabled={actionLoading || billetageTotal <= 0}
                className="flex-1 py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading && <Loader2 size={16} className="animate-spin" />}
                Ouvrir ({formatMoney(billetageTotal)})
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===== ACTIVE SESSION =====
  const isOpen = session.syncStatus === 'open';
  const isClosed = session.syncStatus === 'closed';

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700">
      {/* Header */}
      <div className="p-4 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${isOpen ? 'bg-green-400 animate-pulse' : 'bg-amber-400'}`} />
          <h3 className="text-lg font-bold text-white">
            Session du {session.date}
          </h3>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          {hasPending && (
            <span className="flex items-center gap-1 text-amber-400">
              <WifiOff size={14} />
              {pendingCount} en attente
            </span>
          )}
          <Clock size={14} />
          {isOpen ? 'En cours' : isClosed ? 'Fermee' : session.syncStatus}
        </div>
      </div>

      {/* Cash Balance */}
      <div className="p-4 bg-gradient-to-r from-slate-800 to-slate-700">
        <div className="text-center">
          <p className="text-slate-400 text-sm">Solde caisse actuel</p>
          <p className="text-3xl font-bold text-white mt-1">
            {formatMoney(session.currentCashBalance)}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="text-center">
            <p className="text-xs text-slate-400">Ouverture</p>
            <p className="text-sm font-semibold text-white">{formatMoney(session.openingBalance)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-green-400">Collectes</p>
            <p className="text-sm font-semibold text-green-400">
              <TrendingUp size={12} className="inline mr-1" />
              {formatMoney(session.totalCollected)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-red-400">Decaissements</p>
            <p className="text-sm font-semibold text-red-400">
              <TrendingDown size={12} className="inline mr-1" />
              {formatMoney(session.totalDisbursed)}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 mt-3 text-sm text-slate-400">
          <span>{session.operationCount} operations</span>
          <span className="text-slate-600">|</span>
          <span>Volume: {formatMoney(session.dailyVolume)}</span>
        </div>
      </div>

      {/* Reconciliation Warning */}
      {reconciliation?.hasDiscrepancy && (
        <div className="px-4 py-3 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-400" />
          <span className="text-sm text-amber-300">
            Ecart detecte entre le journal et le solde calcule.
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="p-4 space-y-3">
        {isOpen && !showBilletage && (
          <div className="flex gap-3">
            <button
              onClick={() => journalSync.triggerSync()}
              disabled={journalSync.isSyncing || !hasPending}
              className="flex-1 py-2 bg-blue-600/20 border border-blue-600/40 text-blue-400 rounded-lg text-sm font-medium transition hover:bg-blue-600/30 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <RefreshCw size={14} className={journalSync.isSyncing ? 'animate-spin' : ''} />
              Synchroniser ({pendingCount})
            </button>
            <button
              onClick={() => setShowBilletage(true)}
              className="flex-1 py-2 bg-red-600/20 border border-red-600/40 text-red-400 rounded-lg text-sm font-medium transition hover:bg-red-600/30 flex items-center justify-center gap-2"
            >
              <StopCircle size={14} />
              Fermer la session
            </button>
          </div>
        )}

        {/* Close Day Billetage */}
        {isOpen && showBilletage && (
          <div className="space-y-4">
            <h4 className="font-semibold text-white flex items-center gap-2">
              <Banknote size={16} />
              Billetage de fermeture
            </h4>

            <BilletageInput
              billetage={billetage}
              onChange={updateBilletage}
              total={billetageTotal}
            />

            {/* Expected vs Declared */}
            {billetageTotal > 0 && (
              <div className="bg-slate-700/50 rounded-lg p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Solde attendu</span>
                  <span className="text-white font-medium">{formatMoney(session.currentCashBalance)}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-slate-400">Solde declare</span>
                  <span className="text-white font-medium">{formatMoney(billetageTotal)}</span>
                </div>
                <div className="border-t border-slate-600 mt-2 pt-2 flex justify-between text-sm">
                  <span className="text-slate-400">Ecart</span>
                  <span className={`font-bold ${
                    Math.abs(billetageTotal - session.currentCashBalance) < 0.01
                      ? 'text-green-400'
                      : 'text-amber-400'
                  }`}>
                    {formatMoney(billetageTotal - session.currentCashBalance)} XAF
                  </span>
                </div>
              </div>
            )}

            {/* Justification for discrepancy */}
            {billetageTotal > 0 && Math.abs(billetageTotal - session.currentCashBalance) > 0.01 && (
              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Justification de l'ecart
                </label>
                <textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                  rows={2}
                  placeholder="Expliquez l'ecart..."
                />
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setShowBilletage(false); setBilletage({}); setJustification(''); }}
                className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition"
              >
                Annuler
              </button>
              <button
                onClick={handleCloseDay}
                disabled={actionLoading || billetageTotal <= 0}
                className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading && <Loader2 size={14} className="animate-spin" />}
                Fermer la session
              </button>
            </div>
          </div>
        )}

        {/* Closed Session Summary */}
        {isClosed && (
          <div className="bg-slate-700/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              {session.discrepancy != null && Math.abs(session.discrepancy) < 0.01 ? (
                <CheckCircle size={18} className="text-green-400" />
              ) : (
                <AlertTriangle size={18} className="text-amber-400" />
              )}
              <span className="text-white font-semibold">Session fermee</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-slate-400">Fermeture</span>
                <p className="text-white font-medium">{formatMoney(session.closingBalance || 0)}</p>
              </div>
              <div>
                <span className="text-slate-400">Ecart</span>
                <p className={`font-medium ${
                  session.discrepancy != null && Math.abs(session.discrepancy) < 0.01
                    ? 'text-green-400'
                    : 'text-amber-400'
                }`}>
                  {formatMoney(session.discrepancy || 0)} XAF
                </p>
              </div>
            </div>

            {hasPending && (
              <button
                onClick={() => journalSync.triggerSync()}
                disabled={journalSync.isSyncing}
                className="w-full mt-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition flex items-center justify-center gap-2"
              >
                <RefreshCw size={14} className={journalSync.isSyncing ? 'animate-spin' : ''} />
                Synchroniser maintenant ({pendingCount} en attente)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Billetage Input Sub-component
// ============================================================================

function BilletageInput({
  billetage,
  onChange,
  total,
}: {
  billetage: Record<string, number>;
  onChange: (denomination: string, count: number) => void;
  total: number;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2 text-xs text-slate-400 px-1">
        <span>Coupure</span>
        <span>Nombre</span>
        <span className="text-right">Sous-total</span>
      </div>

      {DENOMINATIONS.map(({ value, label }) => {
        const count = billetage[String(value)] || 0;
        const subtotal = value * count;

        return (
          <div key={value} className="grid grid-cols-3 gap-2 items-center">
            <span className="text-sm text-slate-300 font-medium">{label} XAF</span>
            <input
              type="number"
              min={0}
              value={count || ''}
              onChange={(e) => onChange(String(value), parseInt(e.target.value) || 0)}
              className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-sm text-center w-full"
              placeholder="0"
            />
            <span className="text-sm text-slate-400 text-right">
              {subtotal > 0 ? formatMoney(subtotal) : '-'}
            </span>
          </div>
        );
      })}

      <div className="border-t border-slate-600 pt-2 flex justify-between items-center">
        <span className="text-sm font-semibold text-slate-300">Total</span>
        <span className="text-lg font-bold text-white">{formatMoney(total)}</span>
      </div>
    </div>
  );
}
