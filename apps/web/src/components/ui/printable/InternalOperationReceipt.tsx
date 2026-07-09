import React from 'react';
import { useBranding } from '@/contexts/BrandingContext';
import { InternalTransactionType, InternalTransactionInfo } from './ReceiptTemplate';
import { currencySymbol } from '@shared/config/currency';
import { formatPhoneNumber } from '../../../lib/format';

export interface InternalOperationReceiptData {
  companyInfo?: {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
    nif?: string;
    rccm?: string;
  };
  reference: string;
  date: Date | string;
  type: InternalTransactionType;
  montant: number;
  devise?: string;
  source: InternalTransactionInfo['source'];
  destination: InternalTransactionInfo['destination'];
  autorisation?: InternalTransactionInfo['autorisation'];
  motif?: string;
  observations?: string;
  statut?: InternalTransactionInfo['statut'];
  operateur?: {
    nom: string;
    prenom?: string;
    id?: string;
  };
  agence?: {
    nom: string;
    code?: string;
  };
  // Détails additionnels pour certains types d'opérations
  details?: Array<{
    label: string;
    value: string;
  }>;
  montantLettres?: string;
  footerMessage?: string;
}

interface InternalOperationReceiptProps {
  data: InternalOperationReceiptData;
}

const DEFAULT_COMPANY = {
  name: 'MicroFlex',
  address: 'Brazzaville, République du Congo',
  phone: '+242 06 123 4567',
};

// Labels français pour les types de transactions internes
const INTERNAL_TYPE_LABELS: Record<InternalTransactionType, string> = {
  TRANSFER_INTER_AGENCE: 'Transfert Inter-Agence',
  TRANSFER_INTER_CAISSE: 'Transfert Inter-Caisse',
  APPROVISIONNEMENT_COFFRE: 'Approvisionnement Coffre-Fort',
  PRELEVEMENT_COFFRE: 'Prélèvement Coffre-Fort',
  REGULARISATION: 'Régularisation Comptable',
  FRAIS_BANCAIRE: 'Frais Bancaires',
  CLOTURE_CAISSE: 'Clôture de Caisse',
  OUVERTURE_CAISSE: 'Ouverture de Caisse',
  AUTRE_INTERNE: 'Opération Interne',
};

// Labels pour les types d'entités
const ENTITY_LABELS: Record<string, string> = {
  AGENCE: 'Agence',
  CAISSE: 'Caisse',
  COFFRE: 'Coffre-Fort',
  BANQUE: 'Banque',
  SYSTEME: 'Système',
};

// Labels pour les statuts
const STATUT_LABELS: Record<string, { label: string; style: string }> = {
  EN_ATTENTE: { label: 'En attente', style: 'text-status-warning' },
  VALIDE: { label: 'Validé', style: 'text-status-success font-bold' },
  REJETE: { label: 'Rejeté', style: 'text-status-danger' },
  ANNULE: { label: 'Annulé', style: 'text-content-muted line-through' },
};

const formatDateTime = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatAmount = (amount: number, currency: string = currencySymbol()) => {
  const formatted = new Intl.NumberFormat('fr-FR')
    .format(amount)
    .replace(/[\u00A0\u202F]/g, ' ');
  return `${formatted} ${currency}`;
};

export const InternalOperationReceipt = React.forwardRef<HTMLDivElement, InternalOperationReceiptProps>(
  ({ data }, ref) => {
    const { branding } = useBranding();
    const company = { ...DEFAULT_COMPANY, name: branding.appName, ...data.companyInfo };
    const currency = data.devise || currencySymbol();
    const typeLabel = INTERNAL_TYPE_LABELS[data.type] || data.type;
    const statutInfo = data.statut ? STATUT_LABELS[data.statut] : null;
    const operateurName = data.operateur
      ? [data.operateur.prenom, data.operateur.nom].filter(Boolean).join(' ')
      : undefined;

    return (
      <div
        data-receipt-root
        className="internal-receipt w-full max-w-full sm:max-w-[80mm] bg-white text-black font-mono text-[14px] leading-snug mx-auto p-4"
        ref={ref}
      >
        <style type="text/css" media="print">
          {`
            @page { size: 80mm auto; margin: 0; }
            body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .internal-receipt {
              max-width: 80mm;
              width: 100%;
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, "Liberation Mono", "Courier New", monospace;
              font-size: 14px;
              line-height: 1.4;
              color: #000;
              filter: grayscale(100%);
              padding: 6mm 5mm;
            }
            .internal-receipt, .internal-receipt * {
              color: #000 !important;
              background: transparent !important;
              box-shadow: none !important;
            }
            .receipt-divider {
              border-top: 1px dashed #000;
              margin: 8px 0;
            }
          `}
        </style>

        {/* En-tête entreprise */}
        <div className="text-center">
          <div className="text-[16px] font-bold uppercase tracking-wide">
            {company.name}
          </div>
          <div className="text-[12px]">{company.address}</div>
          <div className="text-[12px]">{formatPhoneNumber(company.phone)}</div>
          {data.agence && (
            <div className="mt-1 text-[11px]">
              Agence: {data.agence.nom}
              {data.agence.code && ` (${data.agence.code})`}
            </div>
          )}
        </div>

        <div className="receipt-divider border-t border-dashed border-black my-2" />

        {/* Type d'opération */}
        <div className="text-center">
          <div className="text-[14px] font-bold uppercase tracking-wide">
            {typeLabel}
          </div>
          {statutInfo && (
            <div className={`text-[12px] mt-1 ${statutInfo.style}`}>
              Statut: {statutInfo.label}
            </div>
          )}
        </div>

        <div className="receipt-divider border-t border-dashed border-black my-2" />

        {/* Informations de référence */}
        <div className="space-y-1 text-[12px]">
          <div className="flex justify-between">
            <span>Réf. Opération</span>
            <span className="font-semibold">{data.reference}</span>
          </div>
          <div className="flex justify-between">
            <span>Date/Heure</span>
            <span>{formatDateTime(data.date)}</span>
          </div>
          {operateurName && (
            <div className="flex justify-between">
              <span>Opérateur</span>
              <span>{operateurName}</span>
            </div>
          )}
        </div>

        <div className="receipt-divider border-t border-dashed border-black my-2" />

        {/* Source et Destination */}
        <div className="space-y-2 text-[12px]">
          {/* Source */}
          {data.source && (
            <div className="bg-surface-muted p-2 rounded border border-edge">
              <div className="text-[11px] font-semibold uppercase text-content-muted mb-1">
                ↑ SOURCE
              </div>
              <div className="font-semibold">
                {ENTITY_LABELS[data.source.type] || data.source.type}
                {data.source.code && ` (${data.source.code})`}
              </div>
              <div className="text-[11px]">{data.source.nom}</div>
            </div>
          )}

          {/* Flèche de direction */}
          <div className="text-center text-[16px] text-content-muted">↓</div>

          {/* Destination */}
          {data.destination && (
            <div className="bg-surface-muted p-2 rounded border border-edge">
              <div className="text-[11px] font-semibold uppercase text-content-muted mb-1">
                ↓ DESTINATION
              </div>
              <div className="font-semibold">
                {ENTITY_LABELS[data.destination.type] || data.destination.type}
                {data.destination.code && ` (${data.destination.code})`}
              </div>
              <div className="text-[11px]">{data.destination.nom}</div>
            </div>
          )}
        </div>

        <div className="receipt-divider border-t border-dashed border-black my-2" />

        {/* Montant */}
        <div className="text-center py-2">
          <div className="text-[11px] text-content-muted uppercase">Montant</div>
          <div className="text-[18px] font-bold">
            {formatAmount(data.montant, currency)}
          </div>
          {data.montantLettres && (
            <div className="text-[10px] italic mt-1">
              ({data.montantLettres})
            </div>
          )}
        </div>

        {/* Motif et observations */}
        {(data.motif || data.observations) && (
          <>
            <div className="receipt-divider border-t border-dashed border-black my-2" />
            <div className="space-y-2 text-[12px]">
              {data.motif && (
                <div>
                  <span className="font-semibold">Motif:</span>
                  <span className="ml-1">{data.motif}</span>
                </div>
              )}
              {data.observations && (
                <div>
                  <span className="font-semibold">Observations:</span>
                  <div className="text-[11px] italic mt-0.5">{data.observations}</div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Détails additionnels */}
        {data.details && data.details.length > 0 && (
          <>
            <div className="receipt-divider border-t border-dashed border-black my-2" />
            <div className="space-y-1 text-[12px]">
              {data.details.map((detail, index) => (
                <div key={index} className="flex justify-between">
                  <span>{detail.label}</span>
                  <span>{detail.value}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Section Autorisation */}
        {data.autorisation && (
          <>
            <div className="receipt-divider border-t border-dashed border-black my-2" />
            <div className="bg-surface-muted p-2 rounded border border-edge">
              <div className="text-[11px] font-semibold uppercase text-center text-content-muted mb-2">
                ✓ AUTORISATION
              </div>
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span>Autorisé par</span>
                  <span className="font-semibold">{data.autorisation.par}</span>
                </div>
                {data.autorisation.role && (
                  <div className="flex justify-between">
                    <span>Fonction</span>
                    <span>{data.autorisation.role}</span>
                  </div>
                )}
                {data.autorisation.reference && (
                  <div className="flex justify-between">
                    <span>Réf.</span>
                    <span>{data.autorisation.reference}</span>
                  </div>
                )}
                {data.autorisation.date && (
                  <div className="flex justify-between">
                    <span>Date</span>
                    <span>{formatDateTime(data.autorisation.date)}</span>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Footer */}
        {data.footerMessage && (
          <>
            <div className="receipt-divider border-t border-dashed border-black my-2" />
            <div className="text-[11px] text-center">
              {data.footerMessage}
            </div>
          </>
        )}

        <div className="receipt-divider border-t border-dashed border-black my-2" />

        {/* Signature */}
        <div className="mt-3 space-y-4">
          <div className="flex justify-between text-[10px]">
            <div className="text-center flex-1">
              <div className="border-b border-edge mb-1 h-8" />
              <div>Signature Opérateur</div>
            </div>
            <div className="w-4" />
            <div className="text-center flex-1">
              <div className="border-b border-edge mb-1 h-8" />
              <div>Signature Autorisant</div>
            </div>
          </div>
        </div>

        <div className="mt-4 text-center text-[10px] text-content-muted">
          Document généré automatiquement - Usage interne
        </div>
      </div>
    );
  }
);

InternalOperationReceipt.displayName = 'InternalOperationReceipt';

export default InternalOperationReceipt;
