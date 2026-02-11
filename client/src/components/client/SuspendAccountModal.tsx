import React, { useState } from 'react';
import { Ban, Calendar, ShieldAlert } from 'lucide-react';
import Modal from '../ui/Modal';
import { toast, handleApiError } from '../../lib/toast';
import {
  SuspensionReason,
  SUSPENSION_REASON_LABELS,
  type SuspensionReasonType,
} from '@shared/enum/status-constants';

interface SuspendAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  compteId: string;
  numeroCompte: string;
  onSuccess: () => void;
}

const REASON_OPTIONS = Object.entries(SUSPENSION_REASON_LABELS) as [SuspensionReasonType, string][];

export default function SuspendAccountModal({
  isOpen,
  onClose,
  compteId,
  numeroCompte,
  onSuccess,
}: SuspendAccountModalProps) {
  const [reasonCode, setReasonCode] = useState<SuspensionReasonType>(SuspensionReason.OTHER);
  const [reasonText, setReasonText] = useState('');
  const [autoLift, setAutoLift] = useState(false);
  const [endDate, setEndDate] = useState('');
  const [reviewRequired, setReviewRequired] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!reasonCode) return;

    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        reasonCode,
        reasonText: reasonText || undefined,
        autoLift,
        reviewRequired,
      };

      if (autoLift && endDate) {
        payload.endDate = new Date(endDate).toISOString();
      }

      const res = await fetch(`/api/comptes/${compteId}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Erreur lors de la suspension');
      }

      toast.success('Le compte a été suspendu avec succès.');
      onSuccess();
      handleClose();
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de la suspension'));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setReasonCode(SuspensionReason.OTHER);
    setReasonText('');
    setAutoLift(false);
    setEndDate('');
    setReviewRequired(false);
    onClose();
  };

  const canSubmit = !!reasonCode && (!autoLift || !!endDate);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Suspendre le compte"
      subtitle={`Compte ${numeroCompte}`}
      size="md"
      variant="warning"
      footer={
        <>
          <button
            onClick={handleClose}
            disabled={loading}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition text-sm font-medium"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || loading}
            className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition flex items-center gap-2 text-sm font-bold"
          >
            {loading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            ) : (
              <Ban size={16} />
            )}
            Suspendre
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Warning banner */}
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-3">
          <ShieldAlert size={18} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-300">
            Le compte sera bloqué pour toutes les opérations (dépôts et retraits).
            Cette action est réversible.
          </p>
        </div>

        {/* Reason code */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">
            Motif de suspension *
          </label>
          <select
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value as SuspensionReasonType)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:ring-1 focus:ring-amber-500 outline-none transition appearance-none"
          >
            {REASON_OPTIONS.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Reason text */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">
            Description (optionnel)
          </label>
          <textarea
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            placeholder="Détails supplémentaires sur la raison de la suspension..."
            rows={2}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:ring-1 focus:ring-amber-500 outline-none transition resize-none"
          />
        </div>

        {/* Auto-lift toggle */}
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer group">
            <div className="relative">
              <input
                type="checkbox"
                checked={autoLift}
                onChange={(e) => setAutoLift(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-slate-700 rounded-full peer-checked:bg-amber-500 transition" />
              <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full peer-checked:translate-x-5 transition" />
            </div>
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-slate-400" />
              <span className="text-sm text-slate-300 group-hover:text-white transition">
                Levée automatique à une date précise
              </span>
            </div>
          </label>

          {autoLift && (
            <div className="animate-in slide-in-from-top-2 duration-200 ml-[52px]">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">
                Date de fin de suspension *
              </label>
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:ring-1 focus:ring-amber-500 outline-none transition"
              />
            </div>
          )}
        </div>

        {/* Review required toggle */}
        <label className="flex items-center gap-3 cursor-pointer group">
          <div className="relative">
            <input
              type="checkbox"
              checked={reviewRequired}
              onChange={(e) => setReviewRequired(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-10 h-5 bg-slate-700 rounded-full peer-checked:bg-amber-500 transition" />
            <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full peer-checked:translate-x-5 transition" />
          </div>
          <span className="text-sm text-slate-300 group-hover:text-white transition">
            Exiger une revue manuelle avant levée
          </span>
        </label>
      </div>
    </Modal>
  );
}
