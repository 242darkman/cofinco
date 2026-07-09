/**
 * Panneau latéral de détail d'un mouvement de coffre.
 */
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  CheckCircle2,
  XCircle,
  Loader2,
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
import { useCurrency } from '@/contexts/CurrencyContext';
import { DetailRow } from './DetailRow';
import { type MouvementCoffreRow } from './types';

export function MouvementDetailPanel({ mouvement, onClose }: { mouvement: MouvementCoffreRow; onClose: () => void }) {
    const { currency } = useCurrency();
    const isCredit = mouvement.sens === 'CREDIT';

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onClose}
            />

            {/* Slider Panel */}
            <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[100vw] sm:max-w-sm bg-surface-base border-l border-edge shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
                {/* Header */}
                <div className={`p-3 sm:p-4 border-b border-edge flex items-center justify-between ${isCredit ? 'bg-status-success-bg' : 'bg-status-warning-bg'} shrink-0`}>
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <div className={`p-1.5 sm:p-2 rounded-lg shrink-0 ${isCredit ? 'bg-status-success-bg' : 'bg-status-warning-bg'}`}>
                            {isCredit ? (
                                <ArrowDownRight className="w-4 h-4 sm:w-5 sm:h-5 text-status-success" />
                            ) : (
                                <ArrowUpRight className="w-4 h-4 sm:w-5 sm:h-5 text-status-warning" />
                            )}
                        </div>
                        <div className="min-w-0">
                            <h3 className="font-bold text-content-primary text-sm sm:text-base">
                                {isCredit ? 'Entrée de fonds' : 'Sortie de fonds'}
                            </h3>
                            <p className="text-[10px] sm:text-xs text-content-muted truncate">
                                {getMouvementCoffreLabel(mouvement.typePaiement || mouvement.metadata?.type || mouvement.sourceModule)}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-surface text-content-muted hover:text-content-primary transition-colors shrink-0"
                    >
                        <XCircle size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4 pb-20">
                    {/* Montant */}
                    <div className="text-center py-3 sm:py-4 bg-surface/50 rounded-lg">
                        <span className="text-[10px] sm:text-xs text-content-muted uppercase tracking-wide">Montant</span>
                        <div className={`text-xl sm:text-2xl font-bold font-mono ${isCredit ? 'text-status-success' : 'text-status-warning'}`}>
                            {isCredit ? '+' : '-'} {Number(mouvement.montant).toLocaleString()} {currency.symbol}
                        </div>
                    </div>

                    {/* Détails */}
                    <div className="space-y-1">
                        <DetailRow
                            label="Date & Heure"
                            value={format(new Date(mouvement.dateOperation), "dd MMM yyyy HH:mm", { locale: fr })}
                        />

                        {(mouvement.metadata?.description || mouvement.metadata?.motif) && (
                            <DetailRow
                                label="Description"
                                value={mouvement.metadata?.description || mouvement.metadata?.motif}
                            />
                        )}

                        {mouvement.reference && (
                            <DetailRow label="Référence" value={mouvement.reference} mono />
                        )}

                        {mouvement.initiator && (
                            <DetailRow
                                label="Effectué par"
                                value={`${mouvement.initiator.prenom || ''} ${mouvement.initiator.nom || ''}`.trim() || 'Système'}
                            />
                        )}

                        {mouvement.metadata?.numeroPiece && (
                            <DetailRow label="N° Pièce" value={mouvement.metadata.numeroPiece} mono />
                        )}

                        {mouvement.sourceModule && (
                            <DetailRow label="Module" value={mouvement.sourceModule} />
                        )}

                        {mouvement.soldeApres !== undefined && (
                            <DetailRow
                                label="Solde après"
                                value={`${Number(mouvement.soldeApres).toLocaleString()} ${currency.symbol}`}
                                mono
                            />
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 border-t border-edge bg-surface-base">
                    <Button
                        variant="secondary"
                        className="w-full h-9 text-xs"
                        onClick={onClose}
                    >
                        Fermer
                    </Button>
                </div>
            </div>
        </>
    );
}

/** Slider de détails d'un transfert coffre */
