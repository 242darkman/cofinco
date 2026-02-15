import React, { useState, useEffect } from 'react';
import { Building2, ArrowRight, Loader2, Users, Briefcase, X, AlertTriangle } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Employe } from '../../hooks/hr/useEmployes';
import { useCurrency } from '@/contexts/CurrencyContext';

interface Agence {
  id: string;
  nom: string;
  codeAgence: string;
  typeAgence: 'MAIN' | 'SECONDARY' | 'KIOSK';
  statut: string;
}

interface ManagerOption {
  id: string;
  nom: string;
  prenom: string;
  poste: string;
}

type TransferMode = 'simple' | 'custom';

interface TransferAgenceModalProps {
  employee: Employe;
  onClose: () => void;
  onSuccess: () => void;
}

export default function TransferAgenceModal({ employee, onClose, onSuccess }: TransferAgenceModalProps) {
  const { currency } = useCurrency();

  // Form state
  const [targetAgenceId, setTargetAgenceId] = useState('');
  const [mode, setMode] = useState<TransferMode>('simple');
  const [reason, setReason] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));

  // Custom mode fields
  const [managerId, setManagerId] = useState<string | null>(employee.managerId || null);
  const [salaireBase, setSalaireBase] = useState(employee.salaireBase || '');

  // Data
  const [agences, setAgences] = useState<Agence[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [loadingAgences, setLoadingAgences] = useState(true);
  const [loadingManagers, setLoadingManagers] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Fetch agences
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/agences', { credentials: 'include' });
        if (res.ok) {
          const data: Agence[] = await res.json();
          setAgences(data.filter(a => a.statut === 'ACTIVE' && a.id !== employee.agenceId));
        }
      } catch {
        toast.error('Erreur lors du chargement des agences');
      } finally {
        setLoadingAgences(false);
      }
    })();
  }, [employee.agenceId]);

  // Fetch managers of target agency when it changes (custom mode)
  useEffect(() => {
    if (!targetAgenceId || mode !== 'custom') return;

    setLoadingManagers(true);
    (async () => {
      try {
        const res = await fetch(`/api/employes?agenceId=${targetAgenceId}`, { credentials: 'include' });
        if (res.ok) {
          const data: any[] = await res.json();
          setManagers(
            data
              .filter((e: any) => e.id !== employee.id)
              .map((e: any) => ({
                id: e.id,
                nom: e.nom,
                prenom: e.prenom,
                poste: e.poste || e.jobPosition?.name || '-',
              }))
          );
        }
      } catch {
        // Silently fail
      } finally {
        setLoadingManagers(false);
      }
    })();
  }, [targetAgenceId, mode, employee.id]);

  const selectedAgence = agences.find(a => a.id === targetAgenceId);

  const handleSubmit = async () => {
    if (!targetAgenceId) {
      toast.error("Veuillez sélectionner une agence de destination");
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, any> = {
        targetAgenceId,
        reason: reason || undefined,
        effectiveDate,
      };

      if (mode === 'custom') {
        body.managerId = managerId;
        body.salaireBase = salaireBase || undefined;
      }

      const res = await fetch(`/api/employes/${employee.id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Erreur inconnue' }));
        throw new Error(err.message);
      }

      toast.success(`${employee.nom} ${employee.prenom} transféré(e) vers ${selectedAgence?.nom}`);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || "Erreur lors du transfert");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-surface-base border border-edge rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto pointer-events-auto animate-in fade-in zoom-in-95 duration-200"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-edge">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center">
                <Building2 size={18} className="text-accent" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-content-primary">Changer d'agence</h2>
                <p className="text-[10px] sm:text-xs text-content-muted">{employee.nom} {employee.prenom} — {employee.poste}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="p-4 sm:p-5 space-y-4 sm:space-y-5">
            {/* Current agency */}
            <div>
              <label className="block text-[10px] sm:text-xs font-bold text-content-muted uppercase tracking-wider mb-1.5">Agence actuelle</label>
              <div className="flex items-center gap-2 px-3 py-2.5 bg-surface/50 rounded-lg border border-edge">
                <Building2 size={14} className="text-content-muted shrink-0" />
                <span className="text-sm text-content-primary font-medium">{employee.agence?.nom || 'Non affecté'}</span>
                {employee.agence?.codeAgence && (
                  <span className="text-[10px] text-content-muted font-mono">({employee.agence.codeAgence})</span>
                )}
              </div>
            </div>

            {/* Arrow */}
            <div className="flex justify-center">
              <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
                <ArrowRight size={16} className="text-accent" />
              </div>
            </div>

            {/* Target agency */}
            <div>
              <label className="block text-[10px] sm:text-xs font-bold text-content-muted uppercase tracking-wider mb-1.5">
                Agence de destination <span className="text-status-danger">*</span>
              </label>
              {loadingAgences ? (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-surface/50 rounded-lg border border-edge">
                  <Loader2 size={14} className="animate-spin text-content-muted" />
                  <span className="text-xs text-content-muted">Chargement...</span>
                </div>
              ) : agences.length === 0 ? (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-status-warning-bg rounded-lg border border-status-warning/20">
                  <AlertTriangle size={14} className="text-status-warning" />
                  <span className="text-xs text-status-warning">Aucune autre agence active disponible</span>
                </div>
              ) : (
                <select
                  value={targetAgenceId}
                  onChange={e => setTargetAgenceId(e.target.value)}
                  className="w-full h-11 px-3 bg-input border border-input-border rounded-lg text-sm text-content-primary focus:border-input-focus focus:outline-none transition-colors"
                >
                  <option value="">-- Sélectionner une agence --</option>
                  {agences.map(a => (
                    <option key={a.id} value={a.id}>{a.nom} ({a.codeAgence})</option>
                  ))}
                </select>
              )}
            </div>

            {/* Transfer mode */}
            {targetAgenceId && (
              <div className="space-y-2">
                <label className="block text-[10px] sm:text-xs font-bold text-content-muted uppercase tracking-wider">Mode de transfert</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMode('simple')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      mode === 'simple'
                        ? 'border-accent bg-accent/5 ring-1 ring-accent/30'
                        : 'border-edge hover:border-edge-strong bg-surface/30'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${mode === 'simple' ? 'border-accent' : 'border-content-muted'}`}>
                        {mode === 'simple' && <div className="w-1.5 h-1.5 rounded-full bg-accent" />}
                      </div>
                      <span className="text-xs font-bold text-content-primary">Simple</span>
                    </div>
                    <p className="text-[10px] text-content-muted ml-5.5">Conserver poste, salaire et hiérarchie</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode('custom')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      mode === 'custom'
                        ? 'border-accent bg-accent/5 ring-1 ring-accent/30'
                        : 'border-edge hover:border-edge-strong bg-surface/30'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${mode === 'custom' ? 'border-accent' : 'border-content-muted'}`}>
                        {mode === 'custom' && <div className="w-1.5 h-1.5 rounded-full bg-accent" />}
                      </div>
                      <span className="text-xs font-bold text-content-primary">Personnalisé</span>
                    </div>
                    <p className="text-[10px] text-content-muted ml-5.5">Modifier manager, salaire...</p>
                  </button>
                </div>
              </div>
            )}

            {/* Custom fields */}
            {targetAgenceId && mode === 'custom' && (
              <div className="space-y-3 p-3 bg-surface/30 rounded-xl border border-edge-subtle">
                {/* Manager */}
                <div>
                  <label className="flex items-center gap-1.5 text-[10px] sm:text-xs font-semibold text-content-secondary mb-1.5">
                    <Users size={12} /> Manager
                  </label>
                  {loadingManagers ? (
                    <div className="flex items-center gap-2 h-10 px-3 bg-surface/50 rounded-lg border border-edge">
                      <Loader2 size={12} className="animate-spin text-content-muted" />
                      <span className="text-[10px] text-content-muted">Chargement...</span>
                    </div>
                  ) : (
                    <select
                      value={managerId || ''}
                      onChange={e => setManagerId(e.target.value || null)}
                      className="w-full h-10 px-3 bg-input border border-input-border rounded-lg text-xs text-content-primary focus:border-input-focus focus:outline-none transition-colors"
                    >
                      <option value="">-- Aucun manager --</option>
                      {managers.map(m => (
                        <option key={m.id} value={m.id}>{m.nom} {m.prenom} — {m.poste}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Salary */}
                <div>
                  <label className="flex items-center gap-1.5 text-[10px] sm:text-xs font-semibold text-content-secondary mb-1.5">
                    <Briefcase size={12} /> Salaire de base ({currency.symbol})
                  </label>
                  <input
                    type="number"
                    value={salaireBase}
                    onChange={e => setSalaireBase(e.target.value)}
                    placeholder={employee.salaireBase || '0'}
                    className="w-full h-10 px-3 bg-input border border-input-border rounded-lg text-xs text-content-primary font-mono focus:border-input-focus focus:outline-none transition-colors"
                  />
                </div>
              </div>
            )}

            {/* Reason */}
            {targetAgenceId && (
              <div>
                <label className="block text-[10px] sm:text-xs font-bold text-content-muted uppercase tracking-wider mb-1.5">Motif du transfert</label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Raison du changement d'agence..."
                  rows={2}
                  className="w-full px-3 py-2 bg-input border border-input-border rounded-lg text-xs text-content-primary focus:border-input-focus focus:outline-none transition-colors resize-none"
                />
              </div>
            )}

            {/* Effective date */}
            {targetAgenceId && (
              <div>
                <label className="block text-[10px] sm:text-xs font-bold text-content-muted uppercase tracking-wider mb-1.5">Date d'effet</label>
                <input
                  type="date"
                  value={effectiveDate}
                  onChange={e => setEffectiveDate(e.target.value)}
                  className="w-full h-10 px-3 bg-input border border-input-border rounded-lg text-xs text-content-primary focus:border-input-focus focus:outline-none transition-colors"
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 p-4 sm:p-5 border-t border-edge">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-content-secondary hover:text-content-primary bg-surface hover:bg-surface-elevated border border-edge transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !targetAgenceId}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-accent hover:bg-accent-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Transfert en cours...
                </>
              ) : (
                <>
                  <Building2 size={14} />
                  Transférer
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
