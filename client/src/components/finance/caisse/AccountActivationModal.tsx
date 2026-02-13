import React, { useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { X, Wallet, AlertTriangle, Loader2, UserCheck, Banknote } from 'lucide-react';
import { compteEpargneApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import { getStatusLabel, ACCOUNT_TYPE_LABELS } from '@/lib/status-labels';
import { v4 as uuidv4 } from 'uuid';
import { UniversalPaymentSuccessModal } from './shared/UniversalPaymentSuccessModal';
import { ReceiptData } from '../../ui/printable/ReceiptTemplate';
import { currencySymbol } from '@shared/config/currency';

interface AccountInfo {
  id: string;
  numeroCompte: string;
  typeCompte: string;
  montantInitial: number;
  client: {
    id: string;
    nom: string;
    prenom: string;
    photoUrl?: string;
  };
}

interface AccountActivationModalProps {
  account: AccountInfo;
  sessionId: string;
  caisseName?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function AccountActivationModal({
  account,
  sessionId,
  caisseName,
  onClose,
  onSuccess
}: AccountActivationModalProps) {
  const queryClient = useQueryClient();

  // Form state - amount is editable (flexible deposit)
  const [montant, setMontant] = useState(account.montantInitial.toString());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Receipt state
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  // Idempotency key to prevent duplicate transactions
  const idempotencyKey = useMemo(() => uuidv4(), []);

  // Validate amount
  const parsedMontant = parseFloat(montant);
  const isValidAmount = !isNaN(parsedMontant) && parsedMontant > 0;
  const amountDifference = isValidAmount ? parsedMontant - account.montantInitial : 0;

  // Handle receipt close
  const handleReceiptClose = useCallback(() => {
    setShowReceipt(false);
    onSuccess();
    onClose();
  }, [onSuccess, onClose]);

  // Handle backdrop click - only close if clicking directly on backdrop
  const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !loading) {
      onClose();
    }
  }, [loading, onClose]);

  // Handle close button click
  const handleCloseClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!loading) {
      onClose();
    }
  }, [loading, onClose]);

  // Handle form submission
  const handleSubmit = useCallback(async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!isValidAmount) {
      setError('Le montant doit être supérieur à 0');
      return;
    }

    if (!sessionId) {
      setError('Aucune session de caisse active');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await compteEpargneApi.depotInitial(account.id, {
        montant: parsedMontant,
        sessionCaisseId: sessionId,
        modePaiement: 'Espèces',
        idempotencyKey
      });

      // Invalidate queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['comptes'] });
      queryClient.invalidateQueries({ queryKey: ['comptes', 'pending-activation'] });
      queryClient.invalidateQueries({ queryKey: ['session-caisse'] });
      queryClient.invalidateQueries({ queryKey: ['caisse-transactions'] });

      // Build receipt data
      const receipt: ReceiptData = {
        title: 'Activation de Compte',
        reference: response?.facture?.numeroFacture || response?.transaction?.id || `ACT-${Date.now()}`,
        date: new Date(),
        type: 'Dépôt Initial - Activation',
        client: {
          nom: account.client.nom,
          prenom: account.client.prenom,
        },
        items: [
          {
            description: `Dépôt initial - Compte ${account.numeroCompte}`,
            montant: parsedMontant,
            quantite: 1
          }
        ],
        total: parsedMontant,
        modePaiement: 'Espèces',
        devise: currencySymbol(),
        notes: `Compte ${getStatusLabel(account.typeCompte, ACCOUNT_TYPE_LABELS)} activé`
      };

      setReceiptData(receipt);
      setShowReceipt(true);
      toast.success(`Compte ${account.numeroCompte} activé avec succès !`);

    } catch (err) {
      const errorMessage = handleApiError(err, 'Erreur lors de l\'activation');
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [account, sessionId, parsedMontant, isValidAmount, idempotencyKey, queryClient]);

  // Show receipt modal after success
  if (showReceipt && receiptData) {
    return (
      <UniversalPaymentSuccessModal
        isOpen={true}
        onClose={handleReceiptClose}
        data={receiptData}
      />
    );
  }

  // Use Portal to render modal at document body level (avoids z-index stacking issues)
  return createPortal(
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] animate-in fade-in duration-200"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-slate-900 rounded-2xl max-w-md w-full mx-4 border border-slate-800 shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Activation de Compte</h2>
              <p className="text-xs text-slate-500">Encaisser le dépôt initial</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCloseClick}
            disabled={loading}
            className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        {/* Account Info */}
        <div className="p-4 bg-slate-800/50 border-b border-slate-800">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-medium text-white">
                {account.client.nom} {account.client.prenom}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
                  {getStatusLabel(account.typeCompte, ACCOUNT_TYPE_LABELS)}
                </span>
                <span className="text-xs text-slate-500 font-mono">
                  {account.numeroCompte}
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">Montant attendu</p>
              <p className="text-lg font-bold text-slate-300">
                {formatMoney(account.montantInitial)}
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Amount Input */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
              <Banknote size={16} className="text-emerald-500" />
              Montant à encaisser
            </label>
            <div className="relative">
              <input
                type="number"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                placeholder="0"
                disabled={loading}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-lg font-bold placeholder:text-slate-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors disabled:opacity-50"
                autoFocus
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium">
                FCFA
              </span>
            </div>

            {/* Amount difference indicator */}
            {isValidAmount && amountDifference !== 0 && (
              <div className={`flex items-center gap-2 text-xs ${
                amountDifference > 0 ? 'text-emerald-400' : 'text-amber-400'
              }`}>
                <AlertTriangle size={12} />
                {amountDifference > 0
                  ? `+${formatMoney(amountDifference)} de plus que prévu`
                  : `${formatMoney(Math.abs(amountDifference))} de moins que prévu`
                }
              </div>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
              <AlertTriangle size={16} />
              {error}
            </div>
          )}

          {/* Summary */}
          <div className="bg-slate-800/50 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Client</span>
              <span className="text-white font-medium">{account.client.nom} {account.client.prenom}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Compte</span>
              <span className="text-white font-mono">{account.numeroCompte}</span>
            </div>
            {caisseName && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Caisse de réception</span>
                <span className="text-cyan-400 font-medium">{caisseName}</span>
              </div>
            )}
            <div className="flex justify-between text-sm border-t border-slate-700 pt-2 mt-2">
              <span className="text-slate-400">Total à encaisser</span>
              <span className="text-emerald-400 font-bold text-lg">
                {isValidAmount ? formatMoney(parsedMontant) : '—'}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleCloseClick}
              disabled={loading}
              className="flex-1 px-4 py-2.5 text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={loading || !isValidAmount}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSubmit(e);
              }}
              className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium shadow-lg shadow-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Activation...
                </>
              ) : (
                <>
                  <Wallet className="w-4 h-4 mr-2" />
                  Encaisser & Activer
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
