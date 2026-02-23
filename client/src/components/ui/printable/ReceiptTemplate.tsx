import React, { useState, useEffect } from 'react';
import { useBranding } from '@/contexts/BrandingContext';
import { LOGO_BASE64 } from '@/lib/pdf-logo';
import { currencySymbol } from '@shared/config/currency';
import { formatPhoneNumber } from '@/lib/format';

// Types pour les transactions internes (sans client)
export type InternalTransactionType =
  | 'TRANSFER_INTER_AGENCE'      // Transfert entre agences
  | 'TRANSFER_INTER_CAISSE'      // Transfert entre caisses
  | 'APPROVISIONNEMENT_COFFRE'   // Approvisionnement coffre-fort
  | 'PRELEVEMENT_COFFRE'         // Prélèvement coffre-fort
  | 'REGULARISATION'             // Régularisation/ajustement
  | 'FRAIS_BANCAIRE'             // Frais bancaires internes
  | 'CLOTURE_CAISSE'             // Clôture de caisse
  | 'OUVERTURE_CAISSE'           // Ouverture de caisse
  | 'AUTRE_INTERNE';             // Autre opération interne

export interface InternalTransactionInfo {
  type: InternalTransactionType;
  // Source de l'opération
  source?: {
    type: 'AGENCE' | 'CAISSE' | 'COFFRE' | 'BANQUE' | 'SYSTEME';
    id?: string;
    nom: string;
    code?: string;
  };
  // Destination de l'opération
  destination?: {
    type: 'AGENCE' | 'CAISSE' | 'COFFRE' | 'BANQUE' | 'SYSTEME';
    id?: string;
    nom: string;
    code?: string;
  };
  // Informations d'autorisation
  autorisation?: {
    par: string;           // Nom de la personne qui a autorisé
    role?: string;         // Rôle (Chef d'agence, Admin, etc.)
    date?: Date | string;  // Date d'autorisation
    reference?: string;    // Référence d'autorisation
  };
  // Motif/raison de l'opération
  motif?: string;
  // Observations additionnelles
  observations?: string;
  // Statut de l'opération
  statut?: 'EN_ATTENTE' | 'VALIDE' | 'REJETE' | 'ANNULE';
}

export interface ReceiptData {
  companyInfo?: {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
    siteWeb?: string;
    nif?: string;
    rccm?: string;
  };
  transaction?: {
    id: string;
    date: string | Date;
    type: 'DEPOT' | 'RETRAIT' | 'REMBOURSEMENT' | 'TONTINE' | string;
    amount: number;
    cashierName?: string;
  };
  details?: {
    label: string;
    value: string;
    isBold?: boolean;
  }[];
  footerMessage?: string;
  title?: string;
  reference?: string;
  date?: Date | string;
  type?: string;
  client?: {
    nom: string;
    prenom?: string;
    telephone?: string;
    email?: string;
    adresse?: string;
    numeroCompte?: string;
  };
  agent?: {
    nom: string;
    prenom?: string;
    id?: string;
  };
  items?: Array<{
    description: string;
    quantite?: number;
    prixUnitaire?: number;
    montant: number;
    details?: string;
  }>;
  tax?: number;
  total?: number;
  montantLettres?: string;
  notes?: string;
  modePaiement?: string;
  devise?: string;

  // ===== NOUVEAU: Support des transactions internes =====
  /** Indique si c'est une transaction interne (sans client) */
  isInternal?: boolean;
  /** Informations détaillées pour les transactions internes */
  internalTransaction?: InternalTransactionInfo;
}

interface ReceiptCompanyInfo {
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  siteWeb?: string;
  nif?: string;
  rccm?: string;
  nom?: string;
  adresse?: string;
  telephone?: string;
}

interface ReceiptTemplateProps {
  data: ReceiptData;
  companyInfo?: ReceiptCompanyInfo;
  /** Type of copy: 'original', 'duplicate', or 'both' (prints 2 copies) */
  copyType?: 'original' | 'duplicate' | 'both';
  /** Show QR code for verification */
  showQRCode?: boolean;
}

const DEFAULT_COMPANY_INFO: ReceiptCompanyInfo = {
  name: 'COFIN&CO-M',
  address: 'Brazzaville, République du Congo',
  phone: '+242 06 123 4567',
  email: 'contact@cofinco-m.com',
  siteWeb: 'www.cofinco-m.com',
  nif: 'NIF-123456789',
  rccm: 'RCCM-BZV-1234',
};

// Simple QR code placeholder for thermal receipt (compact version)
interface MiniQRCodeProps {
  data: string;
  size?: number;
}

const MiniQRCode: React.FC<MiniQRCodeProps> = ({ data, size = 32 }) => {
  // Generate a simple hash-based pattern
  const hashCode = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  };

  const hash = hashCode(data);
  const gridSize = 4;
  const cellSize = size / (gridSize + 2);

  const pattern: boolean[][] = [];
  for (let i = 0; i < gridSize; i++) {
    pattern[i] = [];
    for (let j = 0; j < gridSize; j++) {
      const idx = i * gridSize + Math.min(j, gridSize - 1 - j);
      pattern[i][j] = ((hash >> (idx % 32)) & 1) === 1;
    }
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="inline-block">
      <rect x="0" y="0" width={size} height={size} fill="white" />
      {/* Corner markers */}
      <rect x="0" y="0" width={cellSize} height={cellSize} fill="black" />
      <rect x="0" y={(gridSize + 1) * cellSize} width={cellSize} height={cellSize} fill="black" />
      <rect x={(gridSize + 1) * cellSize} y="0" width={cellSize} height={cellSize} fill="black" />
      {/* Data pattern */}
      {pattern.map((row, i) =>
        row.map((cell, j) => cell ? (
          <rect
            key={`${i}-${j}`}
            x={(j + 1) * cellSize}
            y={(i + 1) * cellSize}
            width={cellSize * 0.85}
            height={cellSize * 0.85}
            fill="black"
          />
        ) : null)
      )}
    </svg>
  );
};

// Logo with fallback for receipt
interface LogoWithFallbackProps {
  src?: string;
  alt: string;
  className?: string;
}

const LogoWithFallback: React.FC<LogoWithFallbackProps> = ({ src, alt, className }) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (!src || hasError) {
    const initials = alt.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    return (
      <div className={`${className} bg-black text-content-primary font-bold flex items-center justify-center rounded`}>
        {initials}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setHasError(true)}
    />
  );
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

const formatAmount = (amount: number, currency: string) => {
  const formatted = new Intl.NumberFormat('fr-FR')
    .format(amount)
    .replace(/[\u00A0\u202F]/g, ' ');
  return `${formatted} ${currency}`;
};

const maskAccountNumber = (value?: string) => {
  if (!value) return undefined;
  if (value.includes('*')) return value;
  const compact = value.replace(/\s+/g, '');
  const last4 = compact.slice(-4);
  if (!last4) return value;
  return `**** ${last4}`;
};

const resolveCompanyInfo = (dataInfo?: ReceiptCompanyInfo, propInfo?: ReceiptCompanyInfo) => {
  const merged = { ...DEFAULT_COMPANY_INFO, ...(propInfo || {}), ...(dataInfo || {}) };
  return {
    name: merged.name || merged.nom || DEFAULT_COMPANY_INFO.name,
    address: merged.address || merged.adresse || DEFAULT_COMPANY_INFO.address,
    phone: merged.phone || merged.telephone || DEFAULT_COMPANY_INFO.phone,
    email: merged.email,
    siteWeb: merged.siteWeb,
    nif: merged.nif,
    rccm: merged.rccm,
  };
};

// Labels français pour les types de transactions internes
const INTERNAL_TRANSACTION_LABELS: Record<InternalTransactionType, string> = {
  TRANSFER_INTER_AGENCE: 'Transfert Inter-Agence',
  TRANSFER_INTER_CAISSE: 'Transfert Inter-Caisse',
  APPROVISIONNEMENT_COFFRE: 'Approvisionnement Coffre-Fort',
  PRELEVEMENT_COFFRE: 'Prélèvement Coffre-Fort',
  REGULARISATION: 'Régularisation',
  FRAIS_BANCAIRE: 'Frais Bancaires',
  CLOTURE_CAISSE: 'Clôture de Caisse',
  OUVERTURE_CAISSE: 'Ouverture de Caisse',
  AUTRE_INTERNE: 'Opération Interne',
};

// Labels pour les types d'entités
const ENTITY_TYPE_LABELS: Record<string, string> = {
  AGENCE: 'Agence',
  CAISSE: 'Caisse',
  COFFRE: 'Coffre-Fort',
  BANQUE: 'Banque',
  SYSTEME: 'Système',
};

const normalizeReceiptData = (data: ReceiptData, companyInfo?: ReceiptCompanyInfo) => {
  const resolvedCompany = resolveCompanyInfo(data.companyInfo, companyInfo);
  const itemsTotal = data.items?.reduce((sum, item) => sum + (item.montant || 0), 0) || 0;
  const amount = data.transaction?.amount ?? data.total ?? itemsTotal;
  const reference = data.transaction?.id || data.reference || 'N/A';
  const date = data.transaction?.date || data.date || new Date();

  // Pour les transactions internes, utiliser le label approprié
  const internalType = data.internalTransaction?.type;
  const type = data.isInternal && internalType
    ? INTERNAL_TRANSACTION_LABELS[internalType]
    : data.transaction?.type || data.type || data.title || 'Transaction';

  const cashierName =
    data.transaction?.cashierName ||
    [data.agent?.prenom, data.agent?.nom].filter(Boolean).join(' ').trim() ||
    undefined;
  const clientName = [data.client?.nom, data.client?.prenom].filter(Boolean).join(' ').trim();
  const clientPhone = data.client?.telephone;
  const clientAccount = maskAccountNumber(data.client?.numeroCompte);
  const currency = data.devise || currencySymbol();
  const details: { label: string; value: string; isBold?: boolean }[] =
    data.details?.length
      ? data.details
      : data.items?.map((item) => ({
          label: item.details ? `${item.description} - ${item.details}` : item.description,
          value: formatAmount(item.montant, currency),
          isBold: false,
        })) || [];

  return {
    resolvedCompany,
    title: data.title,
    reference,
    date,
    type,
    amount,
    cashierName,
    clientName,
    clientPhone,
    clientAccount,
    currency,
    details,
    footerMessage: data.footerMessage || data.notes,
    modePaiement: data.modePaiement,
    montantLettres: data.montantLettres,
    // Champs pour transactions internes
    isInternal: data.isInternal,
    internalTransaction: data.internalTransaction,
  };
};

// Single receipt content component
const ReceiptContent: React.FC<{
  normalized: ReturnType<typeof normalizeReceiptData>;
  formattedDate: string;
  copyLabel?: string;
  showQRCode?: boolean;
  verificationData: string;
}> = ({ normalized, formattedDate, copyLabel, showQRCode, verificationData }) => (
  <>
    <div className="text-center">
      <LogoWithFallback
        src={LOGO_BASE64}
        alt={normalized.resolvedCompany.name || 'Logo'}
        className="w-12 h-12 mx-auto mb-1 object-contain"
      />
      <div className="text-[16px] font-bold uppercase tracking-wide">
        {normalized.resolvedCompany.name}
      </div>
      <div className="text-[12px]">{normalized.resolvedCompany.address}</div>
      <div className="text-[12px]">{formatPhoneNumber(normalized.resolvedCompany.phone)}</div>
      {normalized.resolvedCompany.email && (
        <div className="text-[11px]">{normalized.resolvedCompany.email}</div>
      )}
      {normalized.title && (
        <div className="mt-1 text-[12px] font-semibold uppercase">
          {normalized.title}
        </div>
      )}
      {/* Copy type label */}
      {copyLabel && (
        <div className="mt-1 text-[10px] font-bold uppercase border border-black px-2 py-0.5 inline-block">
          {copyLabel}
        </div>
      )}
    </div>

    <div className="ticket-divider border-t border-dashed border-black my-2" />

    <div className="space-y-1 text-[12px]">
      <div className="flex justify-between">
        <span>Réf</span>
        <span className="font-semibold">{normalized.reference}</span>
      </div>
      <div className="flex justify-between">
        <span>Date</span>
        <span>{formattedDate}</span>
      </div>
      <div className="flex justify-between">
        <span>Type</span>
        <span>{normalized.type}</span>
      </div>
      {normalized.modePaiement && (
        <div className="flex justify-between">
          <span>Mode</span>
          <span>{normalized.modePaiement}</span>
        </div>
      )}
      {normalized.cashierName && (
        <div className="flex justify-between">
          <span>Caissier</span>
          <span>{normalized.cashierName}</span>
        </div>
      )}
    </div>

    {/* Section Client (transactions normales) */}
    {!normalized.isInternal && (normalized.clientName || normalized.clientPhone || normalized.clientAccount) && (
      <>
        <div className="ticket-divider border-t border-dashed border-black my-2" />
        <div className="space-y-1 text-[12px]">
          {normalized.clientName && (
            <div className="flex justify-between">
              <span>Client</span>
              <span className="font-semibold">{normalized.clientName}</span>
            </div>
          )}
          {normalized.clientAccount && (
            <div className="flex justify-between">
              <span>Compte</span>
              <span>{normalized.clientAccount}</span>
            </div>
          )}
          {normalized.clientPhone && (
            <div className="flex justify-between">
              <span>Tél.</span>
              <span>{normalized.clientPhone}</span>
            </div>
          )}
        </div>
      </>
    )}

    {/* Section Transaction Interne (source/destination) */}
    {normalized.isInternal && normalized.internalTransaction && (
      <>
        <div className="ticket-divider border-t border-dashed border-black my-2" />
        <div className="space-y-1 text-[12px]">
          {normalized.internalTransaction.source && (
            <div className="flex justify-between">
              <span>Source</span>
              <span className="font-semibold text-right">
                {ENTITY_TYPE_LABELS[normalized.internalTransaction.source.type] || normalized.internalTransaction.source.type}
                {normalized.internalTransaction.source.code && ` (${normalized.internalTransaction.source.code})`}
                <br />
                <span className="font-normal">{normalized.internalTransaction.source.nom}</span>
              </span>
            </div>
          )}
          {normalized.internalTransaction.destination && (
            <div className="flex justify-between">
              <span>Destination</span>
              <span className="font-semibold text-right">
                {ENTITY_TYPE_LABELS[normalized.internalTransaction.destination.type] || normalized.internalTransaction.destination.type}
                {normalized.internalTransaction.destination.code && ` (${normalized.internalTransaction.destination.code})`}
                <br />
                <span className="font-normal">{normalized.internalTransaction.destination.nom}</span>
              </span>
            </div>
          )}
          {normalized.internalTransaction.motif && (
            <div className="flex justify-between">
              <span>Motif</span>
              <span className="text-right max-w-[60%]">{normalized.internalTransaction.motif}</span>
            </div>
          )}
          {normalized.internalTransaction.observations && (
            <div className="mt-1">
              <span className="block text-[11px] text-content-muted">Observations:</span>
              <span className="text-[11px] italic">{normalized.internalTransaction.observations}</span>
            </div>
          )}
        </div>

        {normalized.internalTransaction.autorisation && (
          <>
            <div className="ticket-divider border-t border-dashed border-black my-2" />
            <div className="space-y-1 text-[12px]">
              <div className="text-center text-[11px] font-semibold uppercase mb-1">Autorisation</div>
              <div className="flex justify-between">
                <span>Autorisé par</span>
                <span className="font-semibold">{normalized.internalTransaction.autorisation.par}</span>
              </div>
              {normalized.internalTransaction.autorisation.role && (
                <div className="flex justify-between">
                  <span>Fonction</span>
                  <span>{normalized.internalTransaction.autorisation.role}</span>
                </div>
              )}
              {normalized.internalTransaction.autorisation.reference && (
                <div className="flex justify-between">
                  <span>Réf. Auth.</span>
                  <span>{normalized.internalTransaction.autorisation.reference}</span>
                </div>
              )}
              {normalized.internalTransaction.autorisation.date && (
                <div className="flex justify-between">
                  <span>Date Auth.</span>
                  <span>{formatDateTime(normalized.internalTransaction.autorisation.date)}</span>
                </div>
              )}
            </div>
          </>
        )}
      </>
    )}

    <div className="ticket-divider border-t border-dashed border-black my-2" />

    <div className="space-y-2">
      {normalized.details.length > 0 ? (
        normalized.details.map((detail, index) => (
          <div
            key={`${detail.label}-${index}`}
            className={`flex justify-between ${detail.isBold ? 'font-bold text-[15px]' : ''}`}
          >
            <span>{detail.label}</span>
            <span className="text-right">{detail.value}</span>
          </div>
        ))
      ) : (
        <div className="text-center text-[12px]">Aucun détail disponible</div>
      )}
    </div>

    <div className="ticket-divider border-t border-dashed border-black my-2" />

    <div className="flex justify-between font-bold text-[16px]">
      <span>Total</span>
      <span>{formatAmount(normalized.amount, normalized.currency)}</span>
    </div>

    {normalized.montantLettres && (
      <div className="mt-2 text-[11px] italic">
        Arrêté la présente facture à la somme de : {normalized.montantLettres}
      </div>
    )}

    {/* QR Code for verification */}
    {showQRCode && (
      <div className="mt-3 flex items-center justify-center gap-2">
        <MiniQRCode data={verificationData} size={28} />
        <span className="text-[9px] text-content-muted">Vérification</span>
      </div>
    )}

    {normalized.footerMessage && (
      <div className="mt-3 text-[11px]">
        {normalized.footerMessage}
      </div>
    )}

    <div className="mt-4 text-center text-[11px]">
      Merci pour votre confiance.
    </div>

    {/* Legal identifiers at bottom */}
    {(normalized.resolvedCompany.nif || normalized.resolvedCompany.rccm) && (
      <div className="mt-2 text-center text-[9px] text-content-muted">
        {normalized.resolvedCompany.nif && <span>NIF: {normalized.resolvedCompany.nif}</span>}
        {normalized.resolvedCompany.nif && normalized.resolvedCompany.rccm && <span> | </span>}
        {normalized.resolvedCompany.rccm && <span>RCCM: {normalized.resolvedCompany.rccm}</span>}
      </div>
    )}
  </>
);

export const ReceiptTemplate = React.forwardRef<HTMLDivElement, ReceiptTemplateProps>(
  ({ data, companyInfo, copyType = 'original', showQRCode = true }, ref) => {
    const { branding } = useBranding();
    const normalized = normalizeReceiptData(data, companyInfo);
    // Override default company name with dynamic branding
    if (!companyInfo?.name && !companyInfo?.nom && !data.companyInfo?.name) {
      normalized.resolvedCompany.name = branding.appName;
    }
    const formattedDate = formatDateTime(normalized.date);

    // Generate verification data for QR code
    const verificationData = JSON.stringify({
      ref: normalized.reference,
      total: normalized.amount,
      date: new Date(normalized.date).toISOString().split('T')[0],
    });

    // Determine copy labels
    const getCopyLabel = (type: 'original' | 'duplicate') => {
      return type === 'original' ? 'ORIGINAL' : 'DUPLICATA';
    };

    return (
      <div
        data-receipt-root
        className="ticket-receipt w-full max-w-full sm:max-w-[80mm] bg-white text-black font-mono text-[14px] leading-snug mx-auto"
        ref={ref}
      >
        <style type="text/css" media="print">
          {`
            @page { size: 80mm auto; margin: 0; }
            body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .ticket-receipt {
              max-width: 80mm;
              width: 100%;
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, "Liberation Mono", "Courier New", monospace;
              font-size: 14px;
              line-height: 1.4;
              color: #000;
              filter: grayscale(100%);
              padding: 6mm 5mm;
            }
            .ticket-receipt, .ticket-receipt * {
              color: #000 !important;
              background: transparent !important;
              box-shadow: none !important;
            }
            .ticket-divider {
              border-top: 1px dashed #000;
              margin: 8px 0;
            }
            .receipt-copy {
              page-break-after: always;
            }
            .receipt-copy:last-child {
              page-break-after: auto;
            }
          `}
        </style>

        {/* Render based on copyType */}
        {copyType === 'both' ? (
          <>
            {/* Original */}
            <div className="receipt-copy p-4">
              <ReceiptContent
                normalized={normalized}
                formattedDate={formattedDate}
                copyLabel={getCopyLabel('original')}
                showQRCode={showQRCode}
                verificationData={verificationData}
              />
            </div>
            {/* Cut line indicator */}
            <div className="border-t-2 border-dashed border-black my-2 relative">
              <span className="absolute left-1/2 -translate-x-1/2 -top-2 bg-white px-2 text-[8px] text-content-muted">✂ DÉCOUPER ICI</span>
            </div>
            {/* Duplicate */}
            <div className="receipt-copy p-4">
              <ReceiptContent
                normalized={normalized}
                formattedDate={formattedDate}
                copyLabel={getCopyLabel('duplicate')}
                showQRCode={showQRCode}
                verificationData={verificationData}
              />
            </div>
          </>
        ) : (
          <div className="p-4">
            <ReceiptContent
              normalized={normalized}
              formattedDate={formattedDate}
              copyLabel={copyType === 'duplicate' ? getCopyLabel('duplicate') : undefined}
              showQRCode={showQRCode}
              verificationData={verificationData}
            />
          </div>
        )}
      </div>
    );
  }
);

ReceiptTemplate.displayName = 'ReceiptTemplate';
