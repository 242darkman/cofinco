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
import BilletageInput from './BilletageInput';

// ============================================================================
// Types
// ============================================================================

interface OfflineDaySessionProps {
  agentId: string;
  agenceId: string;
}

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

  const { count: pendingCount, hasPending } = useOfflinePendingCount();
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
          `Session fermee. Ecart de ${formatMoney(Math.abs(discrepancy))} ${discrepancy > 0 ? '(surplus)' : '(deficit)'}`
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
        <Loader2 className="animate-spin text-status-info" size={24} />
      </div>
    );
  }

  // ===== NO SESSION =====
  if (!session || session.syncStatus === 'reconciled') {
    return (
      <div className="bg-surface rounded-xl border border-edge p-6">
        <h3 className="text-lg font-bold text-content-primary mb-4 flex items-center gap-2">
          <Play size={20} className="text-status-success" />
          Ouvrir la session du jour
        </h3>

        {!showBilletage ? (
          <button
            onClick={() => setShowBilletage(true)}
            className="w-full py-3 bg-status-success hover:bg-status-success text-white rounded-lg font-semibold transition"
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
                className="flex-1 py-3 bg-surface-elevated hover:bg-surface-subtle text-content-primary rounded-lg font-semibold transition"
              >
                Annuler
              </button>
              <button
                onClick={handleOpenDay}
                disabled={actionLoading || billetageTotal <= 0}
                className="flex-1 py-3 bg-status-success hover:bg-status-success text-white rounded-lg font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
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
    <div className="bg-surface rounded-xl border border-edge">
      {/* Header */}
      <div className="p-4 border-b border-edge flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${isOpen ? 'bg-status-success animate-pulse' : 'bg-status-warning'}`} />
          <h3 className="text-lg font-bold text-content-primary">
            Session du {session.date}
          </h3>
        </div>
        <div className="flex items-center gap-2 text-sm text-content-muted">
          {hasPending && (
            <span className="flex items-center gap-1 text-status-warning">
              <WifiOff size={14} />
              {pendingCount} en attente
            </span>
          )}
          <Clock size={14} />
          {isOpen ? 'En cours' : isClosed ? 'Fermee' : session.syncStatus}
        </div>
      </div>

      {/* Cash Balance */}
      <div className="p-4 bg-gradient-to-r from-surface to-surface-elevated">
        <div className="text-center">
          <p className="text-content-muted text-sm">Solde caisse actuel</p>
          <p className="text-3xl font-bold text-content-primary mt-1">
            {formatMoney(session.currentCashBalance)}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="text-center">
            <p className="text-xs text-content-muted">Ouverture</p>
            <p className="text-sm font-semibold text-content-primary">{formatMoney(session.openingBalance)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-status-success">Collectes</p>
            <p className="text-sm font-semibold text-status-success">
              <TrendingUp size={12} className="inline mr-1" />
              {formatMoney(session.totalCollected)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-status-danger">Decaissements</p>
            <p className="text-sm font-semibold text-status-danger">
              <TrendingDown size={12} className="inline mr-1" />
              {formatMoney(session.totalDisbursed)}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 mt-3 text-sm text-content-muted">
          <span>{session.operationCount} operations</span>
          <span className="text-content-muted">|</span>
          <span>Volume: {formatMoney(session.dailyVolume)}</span>
        </div>
      </div>

      {/* Reconciliation Warning */}
      {reconciliation?.hasDiscrepancy && (
        <div className="px-4 py-3 bg-status-warning-bg border-b border-status-warning/20 flex items-center gap-2">
          <AlertTriangle size={16} className="text-status-warning" />
          <span className="text-sm text-status-warning">
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
              className="flex-1 py-2 bg-status-info-bg border border-status-info/40 text-status-info rounded-lg text-sm font-medium transition hover:bg-status-info/30 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <RefreshCw size={14} className={journalSync.isSyncing ? 'animate-spin' : ''} />
              Synchroniser ({pendingCount})
            </button>
            <button
              onClick={() => setShowBilletage(true)}
              className="flex-1 py-2 bg-status-danger-bg border border-status-danger/40 text-status-danger rounded-lg text-sm font-medium transition hover:bg-status-danger/30 flex items-center justify-center gap-2"
            >
              <StopCircle size={14} />
              Fermer la session
            </button>
          </div>
        )}

        {/* Close Day Billetage */}
        {isOpen && showBilletage && (
          <div className="space-y-4">
            <h4 className="font-semibold text-content-primary flex items-center gap-2">
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
              <div className="bg-surface-elevated/50 rounded-lg p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-content-muted">Solde attendu</span>
                  <span className="text-content-primary font-medium">{formatMoney(session.currentCashBalance)}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-content-muted">Solde declare</span>
                  <span className="text-content-primary font-medium">{formatMoney(billetageTotal)}</span>
                </div>
                <div className="border-t border-edge-strong mt-2 pt-2 flex justify-between text-sm">
                  <span className="text-content-muted">Ecart</span>
                  <span className={`font-bold ${
                    Math.abs(billetageTotal - session.currentCashBalance) < 0.01
                      ? 'text-status-success'
                      : 'text-status-warning'
                  }`}>
                    {formatMoney(billetageTotal - session.currentCashBalance)}
                  </span>
                </div>
              </div>
            )}

            {/* Justification for discrepancy */}
            {billetageTotal > 0 && Math.abs(billetageTotal - session.currentCashBalance) > 0.01 && (
              <div>
                <label className="block text-sm text-content-secondary mb-1">
                  Justification de l'ecart
                </label>
                <textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  className="w-full bg-surface-elevated border border-edge-strong rounded-lg px-3 py-2 text-content-primary text-sm"
                  rows={2}
                  placeholder="Expliquez l'ecart..."
                />
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setShowBilletage(false); setBilletage({}); setJustification(''); }}
                className="flex-1 py-2 bg-surface-elevated hover:bg-surface-subtle text-content-primary rounded-lg text-sm font-medium transition"
              >
                Annuler
              </button>
              <button
                onClick={handleCloseDay}
                disabled={actionLoading || billetageTotal <= 0}
                className="flex-1 py-2 bg-status-danger hover:bg-status-danger text-white rounded-lg text-sm font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading && <Loader2 size={14} className="animate-spin" />}
                Fermer la session
              </button>
            </div>
          </div>
        )}

        {/* Closed Session Summary */}
        {isClosed && (
          <div className="bg-surface-elevated/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              {session.discrepancy != null && Math.abs(session.discrepancy) < 0.01 ? (
                <CheckCircle size={18} className="text-status-success" />
              ) : (
                <AlertTriangle size={18} className="text-status-warning" />
              )}
              <span className="text-content-primary font-semibold">Session fermee</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-content-muted">Fermeture</span>
                <p className="text-content-primary font-medium">{formatMoney(session.closingBalance || 0)}</p>
              </div>
              <div>
                <span className="text-content-muted">Ecart</span>
                <p className={`font-medium ${
                  session.discrepancy != null && Math.abs(session.discrepancy) < 0.01
                    ? 'text-status-success'
                    : 'text-status-warning'
                }`}>
                  {formatMoney(session.discrepancy || 0)}
                </p>
              </div>
            </div>

            {hasPending && (
              <button
                onClick={() => journalSync.triggerSync()}
                disabled={journalSync.isSyncing}
                className="w-full mt-3 py-2 bg-status-info hover:bg-status-info text-white rounded-lg text-sm font-medium transition flex items-center justify-center gap-2"
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

// BilletageInput is now imported from ./BilletageInput.tsx
