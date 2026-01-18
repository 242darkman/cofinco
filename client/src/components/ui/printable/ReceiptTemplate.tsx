import React from 'react';

export interface ReceiptData {
  companyInfo?: {
    name?: string;
    address?: string;
    phone?: string;
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
}

const DEFAULT_COMPANY_INFO: ReceiptCompanyInfo = {
  name: 'COFIN&CO-M',
  address: 'Brazzaville, République du Congo',
  phone: '+242 06 123 4567',
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

const normalizeReceiptData = (data: ReceiptData, companyInfo?: ReceiptCompanyInfo) => {
  const resolvedCompany = resolveCompanyInfo(data.companyInfo, companyInfo);
  const itemsTotal = data.items?.reduce((sum, item) => sum + (item.montant || 0), 0) || 0;
  const amount = data.transaction?.amount ?? data.total ?? itemsTotal;
  const reference = data.transaction?.id || data.reference || 'N/A';
  const date = data.transaction?.date || data.date || new Date();
  const type = data.transaction?.type || data.type || data.title || 'Transaction';
  const cashierName =
    data.transaction?.cashierName ||
    [data.agent?.prenom, data.agent?.nom].filter(Boolean).join(' ').trim() ||
    undefined;
  const clientName = [data.client?.nom, data.client?.prenom].filter(Boolean).join(' ').trim();
  const clientPhone = data.client?.telephone;
  const clientAccount = maskAccountNumber(data.client?.numeroCompte);
  const currency = data.devise || 'FCFA';
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
  };
};

export const ReceiptTemplate = React.forwardRef<HTMLDivElement, ReceiptTemplateProps>(
  ({ data, companyInfo }, ref) => {
    const normalized = normalizeReceiptData(data, companyInfo);
    const formattedDate = formatDateTime(normalized.date);

    return (
      <div
        data-receipt-root
        className="ticket-receipt w-full max-w-full sm:max-w-[80mm] bg-white text-black font-mono text-[14px] leading-snug mx-auto p-4"
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
          `}
        </style>

        <div className="text-center">
          <div className="text-[16px] font-bold uppercase tracking-wide">
            {normalized.resolvedCompany.name}
          </div>
          <div className="text-[12px]">{normalized.resolvedCompany.address}</div>
          <div className="text-[12px]">{normalized.resolvedCompany.phone}</div>
          {normalized.title && (
            <div className="mt-1 text-[12px] font-semibold uppercase">
              {normalized.title}
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

        {(normalized.clientName || normalized.clientPhone || normalized.clientAccount) && (
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

        {normalized.footerMessage && (
          <div className="mt-3 text-[11px]">
            {normalized.footerMessage}
          </div>
        )}

        <div className="mt-4 text-center text-[11px]">
          Merci pour votre confiance.
        </div>
      </div>
    );
  }
);

ReceiptTemplate.displayName = 'ReceiptTemplate';
