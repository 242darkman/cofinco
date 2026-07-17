/**
 * AgentSessionManager - Unified GL + Offline session management
 *
 * Orchestrates two complementary layers:
 * - GL Session (server-side): REQUESTING_FUNDS → ACTIVE → CLOSING → CLOSED
 * - Offline Day Session (client-side): billetage, journal, reconciliation
 *
 * Used in both AgentTerrainPortail and AgentCaisseInterface.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Spinner, SkeletonCard } from '@/components/ui';
import { Activity, Banknote, CheckCircle, Clock, AlertTriangle, Send, RefreshCw, ArrowDownRight, ArrowUpRight, Wallet, ShieldCheck, XCircle } from 'lucide-react';
import { toast } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import { caisseAgentApi, caisseApi } from '../../../lib/api-client';
import { useAgentGlSession } from '../../../hooks/useAgentGlSession';
import OfflineDaySession from '../offline/OfflineDaySession';
import BilletageInput, { computeBilletageTotal } from '../offline/BilletageInput';

interface AgentSessionManagerProps {
  agentId: string;
  agenceId: string;
  mode: 'agent' | 'supervisor';
}

// ============================================================================
// Status helpers
// ============================================================================

function getStatutLabel(statut: string | undefined): string {
  switch (statut) {
    case 'REQUESTING_FUNDS': return 'En attente de fonds';
    case 'ACTIVE': return 'Active';
    case 'CLOSING': return 'En cours de clôture';
    case 'CLOSED': return 'Clôturée';
    default: return 'Aucune session';
  }
}

function getStatutColor(statut: string | undefined): string {
  switch (statut) {
    case 'REQUESTING_FUNDS': return 'text-status-warning';
    case 'ACTIVE': return 'text-status-success';
    case 'CLOSING': return 'text-status-info';
    case 'CLOSED': return 'text-content-muted';
    default: return 'text-content-muted';
  }
}

function getStatutBgColor(statut: string | undefined): string {
  switch (statut) {
    case 'REQUESTING_FUNDS': return 'bg-status-warning-bg border-status-warning/30';
    case 'ACTIVE': return 'bg-status-success-bg border-status-success/30';
    case 'CLOSING': return 'bg-status-info-bg border-status-info/30';
    case 'CLOSED': return 'bg-surface-elevated border-edge';
    default: return 'bg-surface-elevated border-edge';
  }
}

// ============================================================================
// Main Component
// ============================================================================

export default function AgentSessionManager({ agentId, agenceId, mode }: AgentSessionManagerProps) {
  const {
    session,
    isLoading,
    refetch,
    hasActiveSession,
    isRequestingFunds,
    isClosing,
    hasSession,
    statut,
  } = useAgentGlSession(agentId);

  if (isLoading) {
    return (
      <SkeletonCard />
    );
  }

  return (
    <div className="space-y-4">
      {/* GL Session Banner */}
      {hasSession ? (
        <GlSessionBanner session={session} statut={statut} onRefresh={refetch} />
      ) : null}

      {/* State-dependent content */}
      {!hasSession && (
        <NoSessionView agentId={agentId} agenceId={agenceId} mode={mode} onCreated={refetch} />
      )}

      {isRequestingFunds && (
        <RequestingFundsView session={session} mode={mode} onUpdated={refetch} />
      )}

      {hasActiveSession && (
        <ActiveSessionView
          session={session}
          agentId={agentId}
          agenceId={agenceId}
          mode={mode}
          onUpdated={refetch}
        />
      )}

      {isClosing && (
        <ClosingView session={session} mode={mode} onUpdated={refetch} />
      )}
    </div>
  );
}

// ============================================================================
// GL Session Banner
// ============================================================================

function GlSessionBanner({ session, statut, onRefresh }: {
  session: any;
  statut: string | undefined;
  onRefresh: () => void;
}) {
  return (
    <div className={`rounded-xl border p-4 ${getStatutBgColor(statut)}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${
            statut === 'ACTIVE' ? 'bg-status-success animate-pulse' :
            statut === 'REQUESTING_FUNDS' ? 'bg-status-warning animate-pulse' :
            statut === 'CLOSING' ? 'bg-status-info' : 'bg-content-muted'
          }`} />
          <span className={`text-sm font-bold ${getStatutColor(statut)}`}>
            {getStatutLabel(statut)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {session?.glAccountNumber && (
            <span className="text-xs text-content-muted bg-surface/50 px-2 py-0.5 rounded font-mono">
              GL: {session.glAccountNumber}
            </span>
          )}
          <button onClick={onRefresh} className="p-1 rounded hover:bg-surface/50 text-content-muted">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-[10px] text-content-muted uppercase tracking-wider">Provisionné</p>
          <p className="text-sm font-bold text-content-primary">
            {formatMoney(session?.montantProvisionne || 0)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-status-success uppercase tracking-wider">Collecté</p>
          <p className="text-sm font-bold text-status-success">
            <ArrowDownRight size={12} className="inline mr-0.5" />
            {formatMoney(session?.totalCollected || 0)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-accent uppercase tracking-wider">Remis</p>
          <p className="text-sm font-bold text-accent">
            <ArrowUpRight size={12} className="inline mr-0.5" />
            {formatMoney(session?.totalSettled || 0)}
          </p>
        </div>
      </div>

      {session?.operationCount > 0 && (
        <p className="text-[10px] text-content-muted mt-2">
          {session.operationCount} opération{session.operationCount > 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}

// ============================================================================
// No Session View — Request a new session
// ============================================================================

function NoSessionView({ agentId, agenceId, mode, onCreated }: {
  agentId: string;
  agenceId: string;
  mode: 'agent' | 'supervisor';
  onCreated: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [montantDemande, setMontantDemande] = useState('');
  const [sourceCaisseId, setSourceCaisseId] = useState('');
  const [observations, setObservations] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [caisses, setCaisses] = useState<any[]>([]);
  const [loadingCaisses, setLoadingCaisses] = useState(false);
  // Supervisor: auto-dispatch toggle (create + dispatch in one step)
  const [autoDispatch, setAutoDispatch] = useState(mode === 'supervisor');

  // Supervisor needs caisse selection for direct dispatch
  const loadCaisses = useCallback(async () => {
    if (mode !== 'supervisor') return;
    setLoadingCaisses(true);
    try {
      const data = await caisseApi.getStatus(agenceId);
      const physical = (data || []).filter((c: any) => c.type === 'PHYSICAL');
      setCaisses(physical);
      if (physical.length === 1) setSourceCaisseId(physical[0].id);
    } catch {
      // Caisses loading is best-effort
    } finally {
      setLoadingCaisses(false);
    }
  }, [agenceId, mode]);

  useEffect(() => {
    if (showForm && mode === 'supervisor' && caisses.length === 0) loadCaisses();
  }, [showForm, mode, loadCaisses, caisses.length]);

  const handleRequest = async () => {
    const amount = parseFloat(montantDemande);
    if (!amount || amount <= 0) {
      toast.error('Veuillez saisir un montant valide');
      return;
    }
    // Supervisor with autoDispatch needs a caisse
    if (mode === 'supervisor' && autoDispatch && !sourceCaisseId) {
      toast.error('Veuillez sélectionner une caisse source');
      return;
    }

    setLoading(true);
    try {
      // Step 1: Create session (→ REQUESTING_FUNDS)
      setLoadingStep('Création de la session...');
      const result = await caisseAgentApi.requestSession({
        agentId,
        agenceId,
        montantDemande: amount,
        sourceCaisseId: sourceCaisseId || undefined,
        observations: observations || undefined,
      });

      // Step 2: Supervisor auto-dispatch (→ ACTIVE)
      if (autoDispatch && mode === 'supervisor' && sourceCaisseId) {
        const sessionId = result?.session?.id;
        if (sessionId) {
          setLoadingStep('Provisionnement en cours...');
          await caisseAgentApi.dispatchFunds(sessionId, {
            montantProvisionne: amount,
            sourceCaisseId,
          });
          toast.success('Session créée et provisionnée');
        } else {
          toast.success('Session créée. Provisionnement en attente.');
        }
      } else {
        toast.success(mode === 'supervisor'
          ? 'Session créée — en attente de provisionnement'
          : 'Demande envoyée en caisse');
      }

      setShowForm(false);
      onCreated();
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la création');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  return (
    <div className="bg-surface rounded-xl border border-edge p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-accent/10">
          <Wallet size={20} className="text-accent" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-content-primary">Session Agent</h3>
          <p className="text-xs text-content-muted">
            {mode === 'supervisor'
              ? 'Aucune session active pour cet agent'
              : 'Aucune session active — demandez un provisionnement pour commencer'}
          </p>
        </div>
      </div>

      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="w-full py-3 bg-accent hover:bg-accent/90 text-white rounded-lg font-semibold transition flex items-center justify-center gap-2"
        >
          <Send size={16} />
          {mode === 'supervisor' ? 'Ouvrir une session' : 'Demander un provisionnement'}
        </button>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">
              Montant {mode === 'supervisor' ? 'à provisionner' : 'demandé'}
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={montantDemande}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9]/g, '');
                setMontantDemande(v);
              }}
              className="w-full bg-input border border-input-border rounded-lg px-3 py-2 text-content-primary text-lg font-bold focus:border-input-focus focus:outline-none"
              placeholder="500000"
              autoFocus
            />
          </div>

          {/* Agent: message explaining the flow */}
          {mode === 'agent' && (
            <div className="flex items-start gap-2 p-3 bg-status-info-bg rounded-lg border border-status-info/20">
              <AlertTriangle size={14} className="text-status-info mt-0.5 shrink-0" />
              <p className="text-xs text-content-secondary">
                Votre demande sera envoyée en caisse. Le caissier validera et provisionnera votre session.
              </p>
            </div>
          )}

          {/* Supervisor: caisse source selection */}
          {mode === 'supervisor' && (
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">
                Caisse source
              </label>
              {loadingCaisses ? (
                <div className="text-xs text-content-muted py-2">Chargement des caisses...</div>
              ) : (
                <select
                  value={sourceCaisseId}
                  onChange={(e) => setSourceCaisseId(e.target.value)}
                  className="w-full bg-input border border-input-border rounded-lg px-3 py-2 text-content-primary focus:border-input-focus focus:outline-none"
                >
                  <option value="">Sélectionner une caisse</option>
                  {caisses.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.nom || c.code || c.id}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">
              Observations (optionnel)
            </label>
            <textarea
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              className="w-full bg-input border border-input-border rounded-lg px-3 py-2 text-content-primary text-sm focus:border-input-focus focus:outline-none"
              rows={2}
              placeholder="Zone de collecte, objectif du jour..."
            />
          </div>

          {/* Supervisor: auto-dispatch toggle */}
          {mode === 'supervisor' && (
            <label className="flex items-center gap-3 p-3 bg-surface-elevated rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={autoDispatch}
                onChange={(e) => setAutoDispatch(e.target.checked)}
                className="w-4 h-4 accent-accent rounded"
              />
              <div>
                <span className="text-sm font-medium text-content-primary">Provisionner immédiatement</span>
                <p className="text-[10px] text-content-muted">Crée la session et transfert les fonds en une étape</p>
              </div>
            </label>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setShowForm(false)}
              disabled={loading}
              className="flex-1 py-2.5 bg-surface-elevated hover:bg-surface-subtle text-content-primary rounded-lg font-medium transition disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              onClick={handleRequest}
              disabled={loading || !montantDemande || (mode === 'supervisor' && autoDispatch && !sourceCaisseId)}
              className="flex-1 py-2.5 bg-accent hover:bg-accent/90 text-white rounded-lg font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Spinner size="xs" tone="current" />
                  <span className="text-xs">{loadingStep || 'En cours...'}</span>
                </>
              ) : (
                mode === 'supervisor' && autoDispatch ? 'Créer et provisionner' : 'Envoyer la demande'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Requesting Funds View
// ============================================================================

function RequestingFundsView({ session }: {
  session: any;
  mode: 'agent' | 'supervisor';
  onUpdated: () => void;
}) {
  return (
    <div className="bg-surface rounded-xl border border-edge p-6">
      <div className="flex items-center gap-2 mb-4">
        <Clock size={20} className="text-status-warning" />
        <h3 className="text-lg font-bold text-content-primary">En attente de provisionnement</h3>
      </div>

      <div className="bg-status-warning-bg rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-content-secondary">Montant demandé</span>
          <span className="text-lg font-bold text-content-primary">
            {formatMoney(session?.montantDemande || 0)}
          </span>
        </div>
        {session?.observations && (
          <p className="text-xs text-content-muted mt-2">{session.observations}</p>
        )}
        <p className="text-xs text-content-muted mt-1">
          Demandé le {new Date(session?.fundRequestedAt || session?.createdAt).toLocaleString('fr-FR')}
        </p>
      </div>

      <div className="flex items-start gap-2 p-3 bg-status-info-bg rounded-lg border border-status-info/20">
        <Send size={14} className="text-status-info mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-content-primary">
            Demande envoyée en caisse
          </p>
          <p className="text-xs text-content-muted mt-1">
            Le caissier traitera cette demande depuis l'onglet « Demandes » de la caisse.
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Active Session View — Shows offline day session + operations
// ============================================================================

function ActiveSessionView({ session, agentId, agenceId, mode, onUpdated }: {
  session: any;
  agentId: string;
  agenceId: string;
  mode: 'agent' | 'supervisor';
  onUpdated: () => void;
}) {
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [billetage, setBilletage] = useState<Record<string, number>>({});
  const [destinationCaisseId, setDestinationCaisseId] = useState('');
  const [loading, setLoading] = useState(false);
  const [caisses, setCaisses] = useState<any[]>([]);

  const billetageTotal = computeBilletageTotal(billetage);

  useEffect(() => {
    if (showCloseForm && caisses.length === 0) {
      caisseApi.getStatus(agenceId)
        .then((data: any[]) => setCaisses((data || []).filter((c: any) => c.type === 'PHYSICAL')))
        .catch(() => {});
    }
  }, [showCloseForm, agenceId, caisses.length]);

  const updateBilletage = useCallback((denomination: string, count: number) => {
    setBilletage(prev => ({ ...prev, [denomination]: Math.max(0, count) }));
  }, []);

  const handleInitiateClose = async () => {
    if (billetageTotal <= 0) {
      toast.error('Veuillez saisir le billetage physique');
      return;
    }
    if (!destinationCaisseId) {
      toast.error('Veuillez sélectionner la caisse de destination');
      return;
    }

    setLoading(true);
    try {
      await caisseAgentApi.initiateClose(session.id, {
        montantPhysique: billetageTotal,
        billetage,
        destinationCaisseId,
      });
      toast.success('Clôture initiée');
      setShowCloseForm(false);
      onUpdated();
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la clôture');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Offline Day Session — only for agents (local to their device) */}
      {mode === 'agent' && (
        <OfflineDaySession agentId={agentId} agenceId={agenceId} />
      )}

      {/* Supervisor: session activity summary */}
      {mode === 'supervisor' && (
        <div className="bg-surface rounded-xl border border-edge p-4">
          <h4 className="text-sm font-bold text-content-primary mb-3 flex items-center gap-2">
            <Activity size={16} className="text-accent" />
            Détails session
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-surface-elevated rounded-lg p-3">
              <p className="text-[10px] text-content-muted uppercase">Ouverture</p>
              <p className="text-xs font-medium text-content-primary">
                {session?.createdAt ? new Date(session.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
              </p>
            </div>
            <div className="bg-surface-elevated rounded-lg p-3">
              <p className="text-[10px] text-content-muted uppercase">Provisionné</p>
              <p className="text-sm font-bold text-content-primary">{formatMoney(session?.montantProvisionne || 0)}</p>
            </div>
            <div className="bg-surface-elevated rounded-lg p-3">
              <p className="text-[10px] text-status-success uppercase">Collecté</p>
              <p className="text-sm font-bold text-status-success">{formatMoney(session?.totalCollected || 0)}</p>
            </div>
            <div className="bg-surface-elevated rounded-lg p-3">
              <p className="text-[10px] text-accent uppercase">Opérations</p>
              <p className="text-sm font-bold text-content-primary">{session?.operationCount || 0}</p>
            </div>
          </div>
        </div>
      )}

      {/* Close Session Section */}
      {!showCloseForm ? (
        <div className="bg-surface rounded-xl border border-edge p-4">
          <button
            onClick={() => setShowCloseForm(true)}
            className="w-full py-2.5 bg-status-warning-bg border border-status-warning/30 text-status-warning rounded-lg text-sm font-medium transition hover:bg-status-warning/20 flex items-center justify-center gap-2"
          >
            <ShieldCheck size={16} />
            Initier la clôture de session GL
          </button>
          <p className="text-[10px] text-content-muted mt-2 text-center">
            {mode === 'supervisor'
              ? 'Clôturez la session GL de cet agent une fois les opérations terminées'
              : 'Clôturez votre session GL une fois toutes les opérations du jour terminées'
            }
          </p>
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-edge p-4 space-y-4">
          <h4 className="font-bold text-content-primary flex items-center gap-2">
            <Banknote size={18} className="text-status-warning" />
            Clôture session GL — Billetage physique
          </h4>

          <BilletageInput billetage={billetage} onChange={updateBilletage} total={billetageTotal} />

          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">
              Caisse de destination (retour fonds)
            </label>
            <select
              value={destinationCaisseId}
              onChange={(e) => setDestinationCaisseId(e.target.value)}
              className="w-full bg-input border border-input-border rounded-lg px-3 py-2 text-content-primary focus:border-input-focus focus:outline-none"
            >
              <option value="">Sélectionner</option>
              {caisses.map((c: any) => (
                <option key={c.id} value={c.id}>{c.nom || c.code || c.id}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => { setShowCloseForm(false); setBilletage({}); }}
              className="flex-1 py-2.5 bg-surface-elevated hover:bg-surface-subtle text-content-primary rounded-lg font-medium transition"
            >
              Annuler
            </button>
            <button
              onClick={handleInitiateClose}
              disabled={loading || billetageTotal <= 0 || !destinationCaisseId}
              className="flex-1 py-2.5 bg-status-warning hover:bg-status-warning/90 text-white rounded-lg font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Spinner size="xs" tone="current" />}
              Initier la clôture ({formatMoney(billetageTotal)})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Closing View — Session in CLOSING state, waiting for finalization
// ============================================================================

function ClosingView({ session, mode, onUpdated }: {
  session: any;
  mode: 'agent' | 'supervisor';
  onUpdated: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [ecartJustification, setEcartJustification] = useState('');

  const montantPhysique = parseFloat(session?.montantPhysique || '0');
  const ecart = session?.ecart != null ? parseFloat(session.ecart) : null;
  const hasSignificantEcart = ecart != null && Math.abs(ecart) >= 0.01;

  const handleFinalize = async () => {
    if (hasSignificantEcart && !ecartJustification.trim()) {
      toast.error('Veuillez justifier l\'écart avant de finaliser');
      return;
    }

    setLoading(true);
    try {
      await caisseAgentApi.finalizeClose(session.id, {
        montantRetourne: montantPhysique,
        ecartJustification: ecartJustification.trim() || undefined,
      });
      toast.success('Session clôturée');
      onUpdated();
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la finalisation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-surface rounded-xl border border-edge p-6">
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck size={20} className="text-status-info" />
        <h3 className="text-lg font-bold text-content-primary">Clôture en cours</h3>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-surface-elevated rounded-lg p-3">
          <p className="text-xs text-content-muted">Montant physique</p>
          <p className="text-lg font-bold text-content-primary">
            {formatMoney(montantPhysique)}
          </p>
        </div>
        <div className="bg-surface-elevated rounded-lg p-3">
          <p className="text-xs text-content-muted">Montant théorique (GL)</p>
          <p className="text-lg font-bold text-content-primary">
            {session?.montantTheorique != null ? formatMoney(session.montantTheorique) : '—'}
          </p>
        </div>
      </div>

      {ecart != null && (
        <div className={`rounded-lg p-3 mb-4 ${
          !hasSignificantEcart
            ? 'bg-status-success-bg border border-status-success/20'
            : 'bg-status-warning-bg border border-status-warning/20'
        }`}>
          <div className="flex items-center gap-2">
            {!hasSignificantEcart ? (
              <CheckCircle size={16} className="text-status-success" />
            ) : (
              <AlertTriangle size={16} className="text-status-warning" />
            )}
            <span className="text-sm font-medium">
              Écart : {formatMoney(ecart)} {ecart > 0 ? '(surplus)' : ecart < 0 ? '(déficit)' : ''}
            </span>
          </div>
        </div>
      )}

      {mode === 'supervisor' ? (
        <div className="space-y-3">
          {hasSignificantEcart && (
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">
                Justification de l'écart
              </label>
              <textarea
                value={ecartJustification}
                onChange={(e) => setEcartJustification(e.target.value)}
                className="w-full bg-input border border-input-border rounded-lg px-3 py-2 text-content-primary text-sm focus:border-input-focus focus:outline-none"
                rows={2}
                placeholder="Expliquez la raison de l'écart..."
              />
            </div>
          )}
          <button
            onClick={handleFinalize}
            disabled={loading || (hasSignificantEcart && !ecartJustification.trim())}
            className="w-full py-3 bg-status-success hover:bg-status-success/90 text-white rounded-lg font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Spinner size="xs" tone="current" /> : <CheckCircle size={16} />}
            Finaliser la clôture
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-status-info text-sm">
          <Clock size={16} />
          <span>En attente de finalisation par le superviseur</span>
        </div>
      )}
    </div>
  );
}
