/**
 * Panneau latéral de détail d'un transfert coffre, avec annulation /
 * compensation intégrée.
 */
import React, { useCallback, useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CheckCircle2, XCircle, ArrowRightLeft, Wallet, Clock, ArrowUpRight, ArrowDownRight, Shield, AlertTriangle, AlertCircle, Settings, Download, MoreHorizontal, Play, Ban, Eye, Vault, User, KeyRound, Info, X } from 'lucide-react';
import { toast } from 'sonner';

import { Card, Button, Badge, StatCard, ResponsiveTable, TabGroup, ConfirmDialog, IconButton } from "@/components/ui";
import { coffreApi, sessionCaisseApi } from "@/lib/api-client";
import { StatutTransfertCoffre, getMouvementCoffreLabel } from "@shared/enum/status-constants";
import { useCurrency } from '@/contexts/CurrencyContext';
import { coffreKeys, caisseKeys } from '../../../../lib/query-keys';


import { DetailRow } from './DetailRow';
import { type TransfertCoffreRow } from './types';

export function TransfertDetailPanel({ transfert, onClose }: { transfert: TransfertCoffreRow; onClose: () => void }) {
    const { currency } = useCurrency();
    const queryClient = useQueryClient();
    const [cancelReason, setCancelReason] = useState('');
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const isSortie = transfert.typeTransfert === 'COFFRE_VERS_CAISSE';
    const statusMap: Record<string, { color: string; bg: string; label: string }> = {
        [StatutTransfertCoffre.REQUESTED]: { color: 'text-status-warning', bg: 'bg-status-warning-bg', label: 'En attente' },
        [StatutTransfertCoffre.VALIDATED]: { color: 'text-status-info', bg: 'bg-status-info-bg', label: 'Validé' },
        [StatutTransfertCoffre.EXECUTED]: { color: 'text-status-success', bg: 'bg-status-success-bg', label: 'Exécuté' },
        [StatutTransfertCoffre.REJECTED]: { color: 'text-status-danger', bg: 'bg-status-danger-bg', label: 'Rejeté' },
        [StatutTransfertCoffre.CANCELLED]: { color: 'text-content-muted', bg: 'bg-surface-subtle/30', label: 'Annulé' },
    };
    const statusVariant = statusMap[transfert.statut as string] || { color: 'text-content-muted', bg: 'bg-surface-subtle/30', label: transfert.statut };

    // Déterminer si le transfert peut être annulé
    const canBeCancelled = [StatutTransfertCoffre.REQUESTED, StatutTransfertCoffre.VALIDATED].includes(transfert.statut as "REQUESTED" | "VALIDATED");
    const canBeReversed = transfert.statut === StatutTransfertCoffre.EXECUTED && !transfert.verrouille;

    // Vérifier si l'annulation est possible dans les 24h pour les transferts exécutés
    const canReverseWithin24h = canBeReversed && transfert.executedAt &&
        (Date.now() - new Date(transfert.executedAt).getTime()) / (1000 * 60 * 60) < 24;

    const handleCancel = async () => {
        if (!cancelReason.trim()) {
            toast.error('Veuillez indiquer une raison');
            return;
        }

        setIsLoading(true);
        try {
            if (canBeCancelled) {
                // Annulation simple pour REQUESTED ou VALIDATED
                await coffreApi.cancelTransfert(transfert.id, cancelReason);
                toast.success('Transfert annulé');
            } else if (canReverseWithin24h) {
                // Annulation avec compensation pour EXECUTED
                await coffreApi.reverseTransfert(transfert.id, { reason: cancelReason });
                toast.success('Transfert annulé avec compensation (transfert inversé créé)');
            }

            // Rafraîchir les données
            queryClient.invalidateQueries({ queryKey: coffreKeys.all });
            queryClient.invalidateQueries({ queryKey: caisseKeys.all });

            setShowCancelModal(false);
            onClose();
        } catch (error: unknown) {
            toast.error((error as Error).message || 'Erreur lors de l\'annulation');
        } finally {
            setIsLoading(false);
        }
    };

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
                <div className={`p-3 sm:p-4 border-b border-edge flex items-center justify-between shrink-0 ${isSortie ? 'bg-status-warning-bg' : 'bg-status-success-bg'}`}>
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <div className={`p-1.5 sm:p-2 rounded-lg shrink-0 ${isSortie ? 'bg-status-warning-bg' : 'bg-status-success-bg'}`}>
                            {isSortie ? (
                                <ArrowUpRight className="w-4 h-4 sm:w-5 sm:h-5 text-status-warning" />
                            ) : (
                                <ArrowDownRight className="w-4 h-4 sm:w-5 sm:h-5 text-status-success" />
                            )}
                        </div>
                        <div className="min-w-0">
                            <h3 className="font-bold text-content-primary text-sm sm:text-base">
                                {isSortie ? 'Coffre → Caisse' : 'Caisse → Coffre'}
                            </h3>
                            <p className="text-[10px] sm:text-xs text-content-muted">Demande de transfert</p>
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
                    {/* Statut */}
                    <div className={`text-center py-2 rounded-lg ${statusVariant.bg}`}>
                        <span className={`text-xs sm:text-sm font-semibold ${statusVariant.color}`}>
                            {statusVariant.label}
                        </span>
                    </div>

                    {/* Montant */}
                    <div className="text-center py-3 sm:py-4 bg-surface/50 rounded-lg">
                        <span className="text-[10px] sm:text-xs text-content-muted uppercase tracking-wide">Montant</span>
                        <div className={`text-xl sm:text-2xl font-bold font-mono ${isSortie ? 'text-status-warning' : 'text-status-success'}`}>
                            {Number(transfert.montant).toLocaleString()} {currency.symbol}
                        </div>
                    </div>

                    {/* Détails */}
                    <div className="space-y-1">
                        <DetailRow
                            label="Date demande"
                            value={format(new Date(transfert.createdAt), "dd MMM yyyy HH:mm", { locale: fr })}
                        />

                        <DetailRow
                            label="Caisse"
                            value={(isSortie ? transfert.caisseDestinationNom : transfert.caisseSourceNom) ?? ''}
                        />

                        <DetailRow
                            label="Demandé par"
                            value={`${transfert.requestedByPrenom || ''} ${transfert.requestedByNom || ''}`.trim() || '-'}
                        />

                        {transfert.validatedByNom && (
                            <DetailRow
                                label="Validé par"
                                value={`${transfert.validatedByPrenom || ''} ${transfert.validatedByNom || ''}`.trim()}
                            />
                        )}

                        {transfert.validatedAt && (
                            <DetailRow
                                label="Date validation"
                                value={format(new Date(transfert.validatedAt), "dd/MM/yyyy HH:mm", { locale: fr })}
                            />
                        )}

                        {transfert.executedByNom && (
                            <DetailRow
                                label="Exécuté par"
                                value={`${transfert.executedByPrenom || ''} ${transfert.executedByNom || ''}`.trim()}
                            />
                        )}

                        {transfert.executedAt && (
                            <DetailRow
                                label="Date exécution"
                                value={format(new Date(transfert.executedAt), "dd/MM/yyyy HH:mm", { locale: fr })}
                            />
                        )}

                        {transfert.motif && (
                            <DetailRow label="Motif" value={transfert.motif} />
                        )}

                        {transfert.reference && (
                            <DetailRow label="Référence" value={transfert.reference} mono />
                        )}

                        {transfert.rejectionReason && (
                            <div className="mt-3 p-2 sm:p-3 bg-status-danger-bg border border-status-danger/20 rounded-lg">
                                <span className="text-[10px] sm:text-xs text-status-danger font-medium block mb-1">Motif de rejet</span>
                                <span className="text-xs sm:text-sm text-status-danger/80">{transfert.rejectionReason}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 border-t border-edge bg-surface-base space-y-2">
                    {/* Bouton d'annulation si applicable */}
                    {(canBeCancelled || canReverseWithin24h) && (
                        <Button
                            variant="danger"
                            className="w-full h-9 text-xs cursor-pointer"
                            onClick={() => setShowCancelModal(true)}
                        >
                            <XCircle size={14} className="mr-1.5" />
                            {canBeReversed ? 'Annuler avec compensation' : 'Annuler le transfert'}
                        </Button>
                    )}

                    <Button
                        variant="secondary"
                        className="w-full h-9 text-xs"
                        onClick={onClose}
                    >
                        Fermer
                    </Button>
                </div>
            </div>

            {/* Modal de confirmation d'annulation */}
            {showCancelModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isLoading && setShowCancelModal(false)} />
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
                                    {canBeReversed
                                        ? 'Un transfert compensatoire (sens inverse) sera créé automatiquement pour maintenir la traçabilité comptable.'
                                        : 'Cette action annulera définitivement ce transfert.'}
                                </p>
                            </div>
                        </div>

                        {/* Informations du transfert */}
                        <div className="p-3 bg-surface/50 rounded-lg space-y-1.5">
                            <div className="flex justify-between text-xs">
                                <span className="text-content-muted">Montant</span>
                                <span className="font-mono font-bold text-content-primary">
                                    {Number(transfert.montant).toLocaleString()} {currency.symbol}
                                </span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-content-muted">Référence</span>
                                <span className="font-mono text-content-secondary">{transfert.reference}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-content-muted">Statut</span>
                                <span className={statusVariant.color}>{statusVariant.label}</span>
                            </div>
                        </div>

                        {/* Champ raison */}
                        <div className="space-y-2">
                            <label className="text-xs text-content-muted font-medium">
                                Raison de l'annulation {canBeReversed ? '(min. 10 caractères)' : ''}
                            </label>
                            <textarea
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                placeholder="Expliquez pourquoi ce transfert doit être annulé..."
                                className="w-full h-20 px-3 py-2 bg-surface border border-edge rounded-lg text-sm text-content-primary placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-status-danger/50"
                                disabled={isLoading}
                            />
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                            <Button
                                variant="secondary"
                                className="flex-1 h-9 text-xs"
                                onClick={() => setShowCancelModal(false)}
                                disabled={isLoading}
                            >
                                Fermer
                            </Button>
                            <Button
                                variant="danger"
                                className="flex-1 h-9 text-xs"
                                onClick={handleCancel}
                                disabled={isLoading || !cancelReason.trim() || (canBeReversed && cancelReason.length < 10)}
                            >
                                {isLoading ? (
                                    <>
                                        <Spinner size="xs" tone="current" className="mr-1.5" />
                                        Annulation...
                                    </>
                                ) : (
                                    'Confirmer l\'annulation'
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

/** Ligne de détail réutilisable */
