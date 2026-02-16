import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../ui/sheet';
import { Badge } from '../../ui';
import { ArrowRight, Calendar, Hash, User, CreditCard, Clock, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { formatMoney } from '@shared/config/currency';

export interface TransferRecord {
  id: string;
  reference: string;
  montant: string;
  statut: string;
  dateOperation: string;
  createdAt: string;
  metadata: any;
  reversalOfId: string | null;
  sourceCompteId: string | null;
  sourceNumero: string | null;
  sourceType: string | null;
  sourceSoldeApres: string | null;
  destCompteId: string | null;
  destNumero: string | null;
  destType: string | null;
  destSoldeApres: string | null;
  sourceUserNom: string | null;
  sourceUserPrenom: string | null;
  destUserNom: string | null;
  destUserPrenom: string | null;
  createdBy: string | null;
}

interface TransferDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  transfer: TransferRecord | null;
}

function getStatusVariant(statut: string): 'success' | 'danger' | 'warning' | 'neutral' {
  switch (statut) {
    case 'POSTED': return 'success';
    case 'REVERSED': return 'danger';
    case 'PENDING': return 'warning';
    default: return 'neutral';
  }
}

function getStatusLabel(statut: string): string {
  switch (statut) {
    case 'POSTED': return 'Validé';
    case 'REVERSED': return 'Annulé';
    case 'PENDING': return 'En attente';
    default: return statut;
  }
}

function formatAccountType(type: string | null): string {
  switch (type) {
    case 'SAVINGS': return 'Épargne';
    case 'CURRENT': return 'Courant';
    case 'BLOCKED': return 'Bloqué';
    default: return type || '-';
  }
}

export default function TransferDetailDrawer({ open, onClose, transfer }: TransferDetailDrawerProps) {
  if (!transfer) return null;

  const montant = Number(transfer.montant) || 0;
  const sourceName = [transfer.sourceUserPrenom, transfer.sourceUserNom].filter(Boolean).join(' ') || 'Inconnu';
  const destName = [transfer.destUserPrenom, transfer.destUserNom].filter(Boolean).join(' ') || 'Inconnu';
  const date = new Date(transfer.dateOperation);
  const isReversed = transfer.statut === 'REVERSED';

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg bg-surface overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-edge">
          <SheetTitle className="text-content-primary text-lg font-bold">
            Détail du virement
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Amount header */}
          <div className="text-center py-4">
            <p className={`text-3xl font-bold ${isReversed ? 'text-status-danger line-through' : 'text-content-primary'}`}>
              {formatMoney(montant)}
            </p>
            <div className="mt-2">
              <Badge
                value={getStatusLabel(transfer.statut)}
                variant={getStatusVariant(transfer.statut)}
              />
            </div>
          </div>

          {/* Source → Destination flow */}
          <div className="bg-surface-subtle rounded-xl p-4 space-y-3">
            {/* Source */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-status-danger-bg flex items-center justify-center shrink-0 mt-0.5">
                <User size={14} className="text-status-danger" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-content-muted font-semibold">Débiteur</p>
                <p className="text-sm font-semibold text-content-primary truncate">{sourceName}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-content-muted font-mono">{transfer.sourceNumero || '-'}</span>
                  {transfer.sourceType && (
                    <span className="text-[10px] text-content-muted bg-surface rounded px-1.5 py-0.5">
                      {formatAccountType(transfer.sourceType)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Arrow */}
            <div className="flex justify-center">
              <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center">
                <ArrowRight size={12} className="text-accent rotate-90" />
              </div>
            </div>

            {/* Destination */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-status-success-bg flex items-center justify-center shrink-0 mt-0.5">
                <User size={14} className="text-status-success" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-content-muted font-semibold">Créditeur</p>
                <p className="text-sm font-semibold text-content-primary truncate">{destName}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-content-muted font-mono">{transfer.destNumero || '-'}</span>
                  {transfer.destType && (
                    <span className="text-[10px] text-content-muted bg-surface rounded px-1.5 py-0.5">
                      {formatAccountType(transfer.destType)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Transaction details */}
          <div className="space-y-3">
            <h3 className="text-xs uppercase tracking-wider text-content-muted font-semibold">Informations</h3>
            <div className="space-y-2">
              <DetailRow icon={Hash} label="Référence" value={transfer.reference} mono />
              <DetailRow
                icon={Calendar}
                label="Date d'opération"
                value={format(date, 'dd MMM yyyy à HH:mm', { locale: fr })}
              />
              <DetailRow
                icon={Clock}
                label="Créé le"
                value={format(new Date(transfer.createdAt), 'dd MMM yyyy à HH:mm', { locale: fr })}
              />
              {transfer.sourceSoldeApres && (
                <DetailRow
                  icon={CreditCard}
                  label="Solde source après"
                  value={formatMoney(Number(transfer.sourceSoldeApres))}
                />
              )}
              {transfer.destSoldeApres && (
                <DetailRow
                  icon={CreditCard}
                  label="Solde dest. après"
                  value={formatMoney(Number(transfer.destSoldeApres))}
                />
              )}
              {transfer.reversalOfId && (
                <DetailRow
                  icon={RotateCcw}
                  label="Annulation de"
                  value={transfer.reversalOfId.slice(0, 8) + '...'}
                  mono
                />
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailRow({ icon: Icon, label, value, mono }: {
  icon: React.ElementType;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-edge-subtle last:border-b-0">
      <div className="flex items-center gap-2 text-content-muted">
        <Icon size={14} />
        <span className="text-xs">{label}</span>
      </div>
      <span className={`text-xs font-medium text-content-primary ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  );
}
