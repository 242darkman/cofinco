import React from 'react';

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
    // Champs pour transactions internes
    isInternal: data.isInternal,
    internalTransaction: data.internalTransaction,
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
              {/* Source */}
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
              {/* Destination */}
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
              {/* Motif */}
              {normalized.internalTransaction.motif && (
                <div className="flex justify-between">
                  <span>Motif</span>
                  <span className="text-right max-w-[60%]">{normalized.internalTransaction.motif}</span>
                </div>
              )}
              {/* Observations */}
              {normalized.internalTransaction.observations && (
                <div className="mt-1">
                  <span className="block text-[11px] text-gray-600">Observations:</span>
                  <span className="text-[11px] italic">{normalized.internalTransaction.observations}</span>
                </div>
              )}
            </div>

            {/* Autorisation */}
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
