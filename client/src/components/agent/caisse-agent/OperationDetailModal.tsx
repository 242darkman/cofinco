/**
 * OperationDetailModal - Modal pour afficher les détails d'une opération terrain
 */

import React from 'react';
import {
  ArrowDownRight, ArrowUpRight, User, Calendar, Clock,
  CheckCircle, XCircle, AlertTriangle, FileText, MapPin,
  CreditCard, PiggyBank, Hash
} from 'lucide-react';
import { Modal, Button, Badge } from '../../ui';
import type { OperationTerrainWithRelations } from '@shared/schema';
import { formatClientName } from '../../../lib/format';
import { StatutOperationTerrain } from '@shared/enum/status-constants';

interface OperationDetailModalProps {
  operation: OperationTerrainWithRelations;
  onClose: () => void;
  onCancel?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
}

const formatMoney = (amount: string | number) => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('fr-FR').format(num || 0);
};

const formatDate = (date: string | Date) => {
  return new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const getStatutInfo = (statut: string) => {
  switch (statut) {
    case StatutOperationTerrain.SUBMITTED:
      return {
        label: 'En attente',
        variant: 'warning' as const,
        icon: Clock,
        color: 'text-status-warning'
      };
    case StatutOperationTerrain.APPROVED:
      return {
        label: 'Approuvée',
        variant: 'success' as const,
        icon: CheckCircle,
        color: 'text-status-success'
      };
    case StatutOperationTerrain.REJECTED:
      return {
        label: 'Rejetée',
        variant: 'danger' as const,
        icon: XCircle,
        color: 'text-status-danger'
      };
    case StatutOperationTerrain.CANCELLED:
      return {
        label: 'Annulée',
        variant: 'neutral' as const,
        icon: AlertTriangle,
        color: 'text-content-muted'
      };
    default:
      return {
        label: statut,
        variant: 'neutral' as const,
        icon: Clock,
        color: 'text-content-muted'
      };
  }
};

export default function OperationDetailModal({
  operation,
  onClose,
  onCancel,
  onApprove,
  onReject
}: OperationDetailModalProps) {
  const statutInfo = getStatutInfo(operation.statut);
  const StatutIcon = statutInfo.icon;
  const isCollect = operation.type === 'COLLECT_CASH';
  const metadata = operation.metadata as any;

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Détails de l'opération"
      size="lg"
    >
      <div className="space-y-6">
        {/* Header avec statut */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              isCollect ? 'bg-accent/10 text-accent' : 'bg-status-success-bg text-status-success'
            }`}>
              {isCollect ? <ArrowDownRight size={24} /> : <ArrowUpRight size={24} />}
            </div>
            <div>
              <h3 className="text-lg font-bold text-content-primary">
                {isCollect ? 'Collecte Cash' : 'Remise Cash'}
              </h3>
              <p className="text-sm text-content-muted">
                Réf: {operation.reference}
              </p>
            </div>
          </div>
          <Badge variant={statutInfo.variant} size="md" value={statutInfo.label} icon={<StatutIcon size={14} />} />
        </div>

        {/* Montant */}
        <div className="p-4 bg-surface-elevated rounded-xl border border-edge">
          <p className="text-xs text-content-muted uppercase tracking-wider mb-1">Montant</p>
          <p className={`text-3xl font-bold ${isCollect ? 'text-accent' : 'text-status-success'}`}>
            {isCollect ? '+' : '-'}{formatMoney(operation.montant as unknown as string)} {operation.devise}
          </p>
        </div>

        {/* Informations principales */}
        <div className="grid grid-cols-2 gap-4">
          {/* Client (pour collecte) */}
          {operation.client && (
            <div className="p-3 bg-surface-elevated rounded-lg border border-edge">
              <div className="flex items-center gap-2 mb-1">
                <User size={14} className="text-content-muted" />
                <p className="text-xs text-content-muted">Client</p>
              </div>
              <p className="text-sm font-medium text-content-primary">
                {formatClientName(operation.client.nom, operation.client.prenom)}
              </p>
            </div>
          )}

          {/* Destination (pour remise) */}
          {operation.destinationCaisse && (
            <div className="p-3 bg-surface-elevated rounded-lg border border-edge">
              <div className="flex items-center gap-2 mb-1">
                <FileText size={14} className="text-content-muted" />
                <p className="text-xs text-content-muted">Caisse destination</p>
              </div>
              <p className="text-sm font-medium text-content-primary">
                {operation.destinationCaisse.nom}
              </p>
            </div>
          )}

          {/* Agent */}
          {operation.agent && (
            <div className="p-3 bg-surface-elevated rounded-lg border border-edge">
              <div className="flex items-center gap-2 mb-1">
                <User size={14} className="text-content-muted" />
                <p className="text-xs text-content-muted">Agent</p>
              </div>
              <p className="text-sm font-medium text-content-primary">
                {operation.agent.nom} {operation.agent.prenom}
              </p>
            </div>
          )}

          {/* Type de paiement (pour collecte) */}
          {metadata?.typePaiementClient && (
            <div className="p-3 bg-surface-elevated rounded-lg border border-edge">
              <div className="flex items-center gap-2 mb-1">
                {metadata.typePaiementClient.includes('Crédit') ? (
                  <CreditCard size={14} className="text-status-warning" />
                ) : (
                  <PiggyBank size={14} className="text-status-success" />
                )}
                <p className="text-xs text-content-muted">Type de paiement</p>
              </div>
              <p className="text-sm font-medium text-content-primary">
                {metadata.typePaiementClient}
              </p>
            </div>
          )}
        </div>

        {/* Numéro de reçu */}
        {metadata?.numeroRecu && (
          <div className="p-3 bg-surface-elevated rounded-lg border border-edge">
            <div className="flex items-center gap-2 mb-1">
              <Hash size={14} className="text-content-muted" />
              <p className="text-xs text-content-muted">Numéro de reçu</p>
            </div>
            <p className="text-sm font-medium text-content-primary font-mono">
              {metadata.numeroRecu}
            </p>
          </div>
        )}

        {/* Géolocalisation */}
        {metadata?.latitude && metadata?.longitude && (
          <div className="p-3 bg-surface-elevated rounded-lg border border-edge">
            <div className="flex items-center gap-2 mb-1">
              <MapPin size={14} className="text-accent" />
              <p className="text-xs text-content-muted">Position GPS</p>
            </div>
            <p className="text-sm text-content-secondary font-mono">
              {metadata.latitude.toFixed(6)}, {metadata.longitude.toFixed(6)}
            </p>
          </div>
        )}

        {/* Observations */}
        {metadata?.observations && (
          <div className="p-3 bg-surface-elevated rounded-lg border border-edge">
            <div className="flex items-center gap-2 mb-1">
              <FileText size={14} className="text-content-muted" />
              <p className="text-xs text-content-muted">Observations</p>
            </div>
            <p className="text-sm text-content-secondary">
              {metadata.observations}
            </p>
          </div>
        )}

        {/* Timeline */}
        <div className="space-y-3">
          <p className="text-xs font-medium text-content-muted uppercase tracking-wider">Historique</p>

          <div className="space-y-2">
            {/* Soumission */}
            <div className="flex items-center gap-3 p-2 rounded-lg bg-surface-elevated/50">
              <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
                <Calendar size={14} className="text-accent" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-content-primary">Soumise</p>
                <p className="text-xs text-content-muted">
                  {formatDate(operation.submittedAt as unknown as string)}
                  {operation.submitter && ` par ${operation.submitter.nom} ${operation.submitter.prenom}`}
                </p>
              </div>
            </div>

            {/* Approbation */}
            {operation.approvedAt && (
              <div className="flex items-center gap-3 p-2 rounded-lg bg-status-success/5">
                <div className="w-8 h-8 rounded-full bg-status-success-bg flex items-center justify-center">
                  <CheckCircle size={14} className="text-status-success" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-status-success">Approuvée</p>
                  <p className="text-xs text-content-muted">
                    {formatDate(operation.approvedAt as unknown as string)}
                    {operation.approver && ` par ${operation.approver.nom} ${operation.approver.prenom}`}
                  </p>
                </div>
              </div>
            )}

            {/* Rejet */}
            {operation.rejectedAt && (
              <div className="flex items-center gap-3 p-2 rounded-lg bg-status-danger/5">
                <div className="w-8 h-8 rounded-full bg-status-danger-bg flex items-center justify-center">
                  <XCircle size={14} className="text-status-danger" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-status-danger">Rejetée</p>
                  <p className="text-xs text-content-muted">
                    {formatDate(operation.rejectedAt as unknown as string)}
                  </p>
                  {operation.rejectionReason && (
                    <p className="text-xs text-status-danger mt-1">
                      Motif: {operation.rejectionReason}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Annulation */}
            {operation.cancelledAt && (
              <div className="flex items-center gap-3 p-2 rounded-lg bg-surface-muted0/5">
                <div className="w-8 h-8 rounded-full bg-surface-subtle/30 flex items-center justify-center">
                  <AlertTriangle size={14} className="text-content-muted" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-content-muted">Annulée</p>
                  <p className="text-xs text-content-muted">
                    {formatDate(operation.cancelledAt as unknown as string)}
                  </p>
                  {operation.cancellationReason && (
                    <p className="text-xs text-content-muted mt-1">
                      Motif: {operation.cancellationReason}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-edge">
          {/* Actions pour l'agent (annulation) */}
          {operation.statut === StatutOperationTerrain.SUBMITTED && onCancel && (
            <Button
              variant="danger"
              size="sm"
              icon={XCircle}
              onClick={onCancel}
            >
              Annuler
            </Button>
          )}

          {/* Actions pour le superviseur */}
          {operation.statut === StatutOperationTerrain.SUBMITTED && onReject && (
            <Button
              variant="outline"
              size="sm"
              icon={XCircle}
              onClick={onReject}
              className="border-status-danger/50 text-status-danger hover:bg-status-danger-bg"
            >
              Rejeter
            </Button>
          )}

          {operation.statut === StatutOperationTerrain.SUBMITTED && onApprove && (
            <Button
              variant="success"
              size="sm"
              icon={CheckCircle}
              onClick={onApprove}
            >
              Approuver
            </Button>
          )}

          <Button
            variant="ghost"
            onClick={onClose}
          >
            Fermer
          </Button>
        </div>
      </div>
    </Modal>
  );
}
