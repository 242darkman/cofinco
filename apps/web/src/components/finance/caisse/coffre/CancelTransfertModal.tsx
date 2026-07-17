/**
 * Modale d'annulation d'un transfert coffre : annulation simple pour les
 * statuts REQUESTED/VALIDATED, compensation (transfert inverse) sous 24 h
 * pour un transfert exécuté non verrouillé.
 */
import { Spinner } from '@/components/ui/Spinner';
import {
  CheckCircle2,
  XCircle,
  ArrowRightLeft,
  Wallet,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Shield,
  AlertTriangle,
  AlertCircle,
  Settings,
  Download,
  MoreHorizontal,
  Play,
  Ban,
  Eye,
  Vault,
  User,
  KeyRound,
  Info,
  X
} from "lucide-react";
import { Card, Button, Badge, StatCard, ResponsiveTable, TabGroup, ConfirmDialog, IconButton } from "@/components/ui";
import { StatutTransfertCoffre, getMouvementCoffreLabel } from "@shared/enum/status-constants";
import type { TransfertCoffreRow } from './types';

export interface CancelTransfertModalProps {
  transfert: TransfertCoffreRow & { reference?: string; typeTransfert: string; statut: string; montant: number | string };
  cancelReason: string;
  setCancelReason: (v: string) => void;
  isCancelling: boolean;
  onConfirm: () => void;
  onClose: () => void;
  currencySymbol: string;
}

export function CancelTransfertModal({
  transfert, cancelReason, setCancelReason, isCancelling, onConfirm, onClose, currencySymbol,
}: CancelTransfertModalProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={() => !isCancelling && onClose()}
        />
        <div className="relative bg-surface-base border border-edge rounded-lg shadow-2xl max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 duration-200">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-status-danger-bg rounded-lg">
              <AlertCircle className="w-5 h-5 text-status-danger" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-content-primary text-base mb-1">
                Annuler ce transfert ?
              </h3>
              <p className="text-sm text-content-muted">
                {transfert.statut === StatutTransfertCoffre.EXECUTED
                  ? 'Un transfert compensatoire (sens inverse) sera créé automatiquement pour maintenir la traçabilité comptable.'
                  : 'Cette action annulera définitivement ce transfert.'}
              </p>
            </div>
          </div>
    
          {/* Transfer details */}
          <div className="p-3 bg-surface/50 rounded-lg space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-content-muted">Montant</span>
              <span className="font-mono font-bold text-content-primary">
                {Number(transfert.montant).toLocaleString()} {currencySymbol}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-content-muted">Référence</span>
              <span className="font-mono text-content-secondary">{transfert.reference}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-content-muted">Type</span>
              <span className="text-content-secondary">{getMouvementCoffreLabel(transfert.typeTransfert)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-content-muted">Statut</span>
              <Badge variant="warning" value={transfert.statut} className="text-xs" />
            </div>
          </div>
    
          {/* Reason input */}
          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1.5">
              Raison de l'annulation *
            </label>
            <textarea
              className="w-full px-3 py-2 bg-surface border border-edge-strong rounded-lg text-sm text-content-primary placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-status-danger/50 focus:border-status-danger resize-none"
              placeholder="Expliquez pourquoi vous annulez ce transfert..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              disabled={isCancelling}
            />
            <p className="mt-1 text-xs text-content-muted">
              Minimum 10 caractères requis pour la traçabilité
            </p>
          </div>
    
          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1 h-9 text-xs"
              onClick={() => {
                onClose();
                setCancelReason('');
              }}
              disabled={isCancelling}
            >
              Annuler
            </Button>
            <Button
              variant="danger"
              className="flex-1 h-9 text-xs cursor-pointer"
              onClick={onConfirm}
              disabled={isCancelling || !cancelReason.trim() || cancelReason.length < 10}
            >
              {isCancelling ? (
                <>
                  <Spinner size="xs" tone="current" className="mr-1.5" />
                  Annulation...
                </>
              ) : (
                <>
                  <XCircle size={14} className="mr-1.5" />
                  Confirmer l'annulation
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
  );
}
