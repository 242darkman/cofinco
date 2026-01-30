import React, { useState, useEffect } from 'react';
import { Building2, Phone, Mail, MapPin, Globe, FileText, Calendar, Hash, User, Briefcase, QrCode } from 'lucide-react';
import { ReceiptData } from './ReceiptTemplate';
import { LOGO_BASE64 } from '@/lib/pdf-logo';

// Default Company Info
const DEFAULT_COMPANY_INFO = {
  nom: 'COFIN&CO-M',
  slogan: 'Microfinance & Services Financiers',
  adresse: 'Brazzaville, République du Congo',
  telephone: '+242 06 123 4567',
  email: 'contact@cofinco-m.com',
  siteWeb: 'www.cofinco-m.com',
  nif: 'NIF-123456789',
  rccm: 'RCCM-BZV-1234'
};

// Simple QR Code generator using SVG (no external library needed)
// Creates a simple visual representation with verification data
interface QRCodeProps {
  data: string;
  size?: number;
}

const QRCodePlaceholder: React.FC<QRCodeProps> = ({ data, size = 64 }) => {
  // Generate a simple hash-based pattern for visual verification
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
  const gridSize = 5;
  const cellSize = size / (gridSize + 2); // +2 for border

  // Generate pattern based on hash
  const pattern: boolean[][] = [];
  for (let i = 0; i < gridSize; i++) {
    pattern[i] = [];
    for (let j = 0; j < gridSize; j++) {
      // Mirror pattern for QR-like appearance
      const idx = i * gridSize + Math.min(j, gridSize - 1 - j);
      pattern[i][j] = ((hash >> (idx % 32)) & 1) === 1;
    }
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="inline-block">
      {/* Border */}
      <rect x="0" y="0" width={size} height={size} fill="white" stroke="#e2e8f0" strokeWidth="1" />

      {/* Corner markers (QR code style) */}
      {[[0, 0], [0, gridSize + 1], [gridSize + 1, 0]].map(([row, col], idx) => (
        <g key={idx}>
          <rect
            x={col * cellSize}
            y={row * cellSize}
            width={cellSize}
            height={cellSize}
            fill="black"
          />
        </g>
      ))}

      {/* Data pattern */}
      {pattern.map((row, i) =>
        row.map((cell, j) => cell ? (
          <rect
            key={`${i}-${j}`}
            x={(j + 1) * cellSize}
            y={(i + 1) * cellSize}
            width={cellSize * 0.9}
            height={cellSize * 0.9}
            fill="black"
          />
        ) : null)
      )}
    </svg>
  );
};

// Logo component with fallback
interface LogoWithFallbackProps {
  src?: string;
  alt: string;
  className?: string;
}

const LogoWithFallback: React.FC<LogoWithFallbackProps> = ({ src, alt, className }) => {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setHasError(false);
    setIsLoading(true);
  }, [src]);

  if (!src || hasError) {
    // Fallback: Show company initials in a styled box
    const initials = alt.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    return (
      <div className={`${className} bg-gradient-to-br from-blue-600 to-emerald-500 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg`}>
        {initials}
      </div>
    );
  }

  return (
    <>
      {isLoading && (
        <div className={`${className} bg-slate-200 rounded-xl animate-pulse`} />
      )}
      <img
        src={src}
        alt={alt}
        className={`${className} rounded-xl object-contain shadow-lg ${isLoading ? 'hidden' : ''}`}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setHasError(true);
          setIsLoading(false);
        }}
      />
    </>
  );
};

interface InvoiceTemplateProps {
  data: ReceiptData;
  companyInfo?: typeof DEFAULT_COMPANY_INFO;
  showQRCode?: boolean;
}

export const InvoiceTemplate = React.forwardRef<HTMLDivElement, InvoiceTemplateProps>(
  ({ data, companyInfo = DEFAULT_COMPANY_INFO, showQRCode = true }, ref) => {

    const items = data.items || [];
    const total = data.total ?? 0;
    const tax = data.tax ?? 0;
    const date = data.date || new Date();
    const type = data.type || 'Opération';
    const reference = data.reference || 'N/A';

    // Generate verification data for QR code
    const verificationData = JSON.stringify({
      ref: reference,
      total,
      date: new Date(date).toISOString().split('T')[0],
      type,
      nif: companyInfo.nif
    });

    const formattedDate = new Date(date).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const formattedTime = new Date(date).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });

    // Determine if this is a debit transaction
    const isDebit = ['Retrait', 'Décaissement', 'Prêt', 'Versement'].some(
      type => data.type?.toLowerCase().includes(type.toLowerCase())
    );

    return (
      <div 
        data-receipt-root
        className="invoice-a4 bg-white" 
        ref={ref}
      >
        {/* Print specific styles for A4 with page numbering */}
        <style type="text/css" media="print">
          {`
            @page {
              size: A4;
              margin: 15mm;
              @bottom-center {
                content: "Page " counter(page) " / " counter(pages);
                font-size: 9px;
                color: #64748b;
              }
            }
            @media print {
              body {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .no-print { display: none !important; }
              .print-break { page-break-before: always; }
              .page-number::after {
                content: "Page " counter(page) " / " counter(pages);
              }
            }
          `}
        </style>

        <div className="w-full max-w-[210mm] mx-auto min-h-[297mm] bg-white font-sans text-slate-900 flex flex-col p-0">

          {/* ===== HEADER SECTION ===== */}
          <header className="relative">
            {/* Top Color Bar */}
            <div className="h-2 bg-gradient-to-r from-blue-600 via-blue-500 to-emerald-500" />

            <div className="px-8 py-6 flex justify-between items-start">
              {/* Company Info - Left */}
              <div className="flex items-start gap-4">
                {/* Logo with fallback */}
                <LogoWithFallback
                  src={LOGO_BASE64}
                  alt={companyInfo.nom}
                  className="w-16 h-16"
                />

                <div>
                  <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                    {companyInfo.nom}
                  </h1>
                  <p className="text-sm text-slate-500 font-medium">{companyInfo.slogan}</p>

                  <div className="mt-3 space-y-1 text-xs text-slate-600">
                    <p className="flex items-center gap-2">
                      <MapPin size={11} className="text-slate-400" />
                      {companyInfo.adresse}
                    </p>
                    <p className="flex items-center gap-2">
                      <Phone size={11} className="text-slate-400" />
                      {companyInfo.telephone}
                    </p>
                    <p className="flex items-center gap-2">
                      <Mail size={11} className="text-slate-400" />
                      {companyInfo.email}
                    </p>
                    <p className="flex items-center gap-2">
                      <Globe size={11} className="text-slate-400" />
                      {companyInfo.siteWeb}
                    </p>
                  </div>
                </div>
              </div>

              {/* Invoice Title & Reference - Right */}
              <div className="text-right">
                <div className="inline-block">
                  <h2 className={`
                    text-4xl font-black uppercase tracking-wide
                    ${isDebit ? 'text-amber-600' : 'text-emerald-600'}
                  `}>
                    {isDebit ? 'Reçu' : 'Facture'}
                  </h2>
                  <div className={`h-1 mt-1 rounded-full ${isDebit ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                </div>

                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-end gap-2">
                    <Hash size={12} className="text-slate-400" />
                    <span className="text-xs text-slate-500 uppercase">Référence</span>
                  </div>
                  <p className="font-mono text-lg font-bold text-slate-900 bg-slate-100 px-3 py-1 rounded-lg inline-block">
                    {reference}
                  </p>

                  <div className="flex items-center justify-end gap-2 mt-3">
                    <Calendar size={12} className="text-slate-400" />
                    <span className="text-xs text-slate-500">
                      {formattedDate} à {formattedTime}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </header>

          {/* ===== CLIENT & OPERATION INFO ===== */}
          <div className="px-8 py-6 grid grid-cols-2 gap-8 bg-slate-50 border-y border-slate-200">
            {/* Client Info */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                  <User size={14} className="text-blue-600" />
                </div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Informations Client
                </h3>
              </div>

              <div className="bg-white rounded-xl p-4 border border-slate-200">
                <p className="text-lg font-bold text-slate-900 mb-1">
                  {data.client?.prenom} {data.client?.nom}
                </p>
                {data.client?.adresse && (
                  <p className="text-sm text-slate-600">{data.client.adresse}</p>
                )}
                {data.client?.telephone && (
                  <p className="text-sm text-slate-600 flex items-center gap-2 mt-1">
                    <Phone size={12} className="text-slate-400" />
                    {data.client.telephone}
                  </p>
                )}
                {data.client?.email && (
                  <p className="text-sm text-slate-600 flex items-center gap-2">
                    <Mail size={12} className="text-slate-400" />
                    {data.client.email}
                  </p>
                )}
                {data.client?.numeroCompte && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <span className="text-[10px] text-slate-400 uppercase">N° Compte</span>
                    <p className="font-mono text-sm font-semibold text-slate-700">
                      {data.client.numeroCompte}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Operation Info */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <FileText size={14} className="text-emerald-600" />
                </div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Détails de l'Opération
                </h3>
              </div>

              <div className="bg-white rounded-xl p-4 border border-slate-200 space-y-3">
                <div className="flex justify-between items-center pb-2 border-b border-dashed border-slate-200">
                  <span className="text-sm text-slate-500">Type d'opération</span>
                  <span className={`text-sm font-bold px-2 py-0.5 rounded ${
                    isDebit ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {type}
                  </span>
                </div>

                <div className="flex justify-between items-center pb-2 border-b border-dashed border-slate-200">
                  <span className="text-sm text-slate-500">Mode de paiement</span>
                  <span className="text-sm font-semibold text-slate-700">{data.modePaiement}</span>
                </div>

                {data.agent && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-500">Agent traitant</span>
                    <span className="text-sm font-semibold text-slate-700">
                      {data.agent.prenom} {data.agent.nom}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ===== ITEMS TABLE ===== */}
          <div className="px-8 py-6 flex-grow">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider w-[55%]">
                    Description
                  </th>
                  <th className="py-3 px-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider w-[15%]">
                    Qté
                  </th>
                  <th className="py-3 px-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider w-[15%]">
                    P.U.
                  </th>
                  <th className="py-3 px-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider w-[15%]">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr
                    key={index}
                    className={`border-b border-slate-100 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                  >
                    <td className="py-4 px-4">
                      <p className="font-semibold text-slate-900">{item.description}</p>
                      {item.details && (
                        <p className="text-xs text-slate-500 mt-1">{item.details}</p>
                      )}
                    </td>
                    <td className="py-4 px-4 text-center text-slate-600 font-mono">
                      {item.quantite || 1}
                    </td>
                    <td className="py-4 px-4 text-right text-slate-600 font-mono">
                      {item.quantite && item.quantite > 1
                        ? (item.montant / item.quantite).toLocaleString('fr-FR')
                        : item.montant.toLocaleString('fr-FR')
                      }
                    </td>
                    <td className="py-4 px-4 text-right font-bold text-slate-900 font-mono">
                      {item.montant.toLocaleString('fr-FR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ===== TOTALS SECTION ===== */}
          <div className="px-8 pb-6">
            <div className="flex justify-end">
              <div className="w-80">
                {/* Subtotal */}
                <div className="flex justify-between items-center py-2 border-b border-slate-200">
                  <span className="text-sm text-slate-600">Sous-total HT</span>
                  <span className="font-mono text-slate-700">
                    {(tax ? total - tax : total).toLocaleString('fr-FR')} {data.devise || 'FCFA'}
                  </span>
                </div>

                {/* Tax if applicable */}
                {tax > 0 && (
                  <div className="flex justify-between items-center py-2 border-b border-slate-200">
                    <span className="text-sm text-slate-600">Taxes / TVA</span>
                    <span className="font-mono text-slate-700">
                      {tax.toLocaleString('fr-FR')} {data.devise || 'FCFA'}
                    </span>
                  </div>
                )}

                {/* Total */}
                <div className={`
                  flex justify-between items-center py-4 mt-2 rounded-xl px-4
                  ${isDebit
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                    : 'bg-gradient-to-r from-emerald-500 to-cyan-500'
                  }
                `}>
                  <span className="text-white font-bold uppercase text-sm">Total TTC</span>
                  <span className="text-2xl font-black text-white font-mono">
                    {total.toLocaleString('fr-FR')} <span className="text-sm font-normal opacity-80">{data.devise || 'FCFA'}</span>
                  </span>
                </div>

                {/* Amount in words */}
                {data.montantLettres && (
                  <p className="mt-3 text-xs text-slate-500 italic text-right">
                    Arrêté à la somme de : <span className="font-medium not-italic text-slate-700">{data.montantLettres}</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ===== NOTES SECTION ===== */}
          {data.notes && (
            <div className="px-8 pb-6">
              <div className="p-4 bg-amber-50 border-l-4 border-amber-400 rounded-r-lg">
                <p className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-1">
                  Note importante
                </p>
                <p className="text-sm text-amber-900">{data.notes}</p>
              </div>
            </div>
          )}

          {/* ===== SIGNATURES ===== */}
          <div className="px-8 py-6 border-t border-slate-200">
            <div className="flex justify-between items-end">
              <div className="text-center">
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-12">
                  Signature du Client
                </p>
                <div className="w-40 border-t-2 border-slate-300 pt-2">
                  <p className="text-xs text-slate-500">Date et signature</p>
                </div>
              </div>

              <div className="text-center">
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-12">
                  Signature de l'Agent
                </p>
                <div className="w-40 border-t-2 border-slate-300 pt-2">
                  <p className="text-xs text-slate-500">Cachet et signature</p>
                </div>
              </div>
            </div>
          </div>

          {/* ===== FOOTER ===== */}
          <footer className="mt-auto">
            {/* Legal Info with QR Code */}
            <div className="px-8 py-4 bg-slate-50 border-t border-slate-200">
              <div className="flex justify-between items-start">
                {/* QR Code for verification */}
                {showQRCode && (
                  <div className="flex items-center gap-3">
                    <QRCodePlaceholder data={verificationData} size={48} />
                    <div className="text-[9px] text-slate-400">
                      <div className="flex items-center gap-1 mb-0.5">
                        <QrCode size={10} />
                        <span className="font-medium">Code de vérification</span>
                      </div>
                      <div>Scannez pour vérifier l'authenticité</div>
                    </div>
                  </div>
                )}

                {/* Legal identifiers */}
                <div className="text-right">
                  <div className="flex gap-4 text-[10px] text-slate-400 mb-1">
                    <span>NIF: {companyInfo.nif}</span>
                    <span>RCCM: {companyInfo.rccm}</span>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    Document généré le {new Date().toLocaleDateString('fr-FR')} à {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom Color Bar */}
            <div className="h-1.5 bg-gradient-to-r from-blue-600 via-emerald-500 to-blue-600" />

            {/* Terms with page number placeholder */}
            <div className="px-8 py-3 text-center">
              <p className="text-[9px] text-slate-400">
                Ce document tient lieu de facture. Conservez-le précieusement pour toute réclamation.
                Paiement immédiat à réception. Merci de votre confiance.
              </p>
              <p className="text-[8px] text-slate-300 mt-1 page-number print:block hidden"></p>
            </div>
          </footer>
        </div>
      </div>
    );
  }
);

InvoiceTemplate.displayName = 'InvoiceTemplate';
