import React, { useState, useEffect } from 'react';
import { useBranding } from '@/contexts/BrandingContext';
import { ReceiptData } from './ReceiptTemplate';
import { LOGO_BASE64 } from '@/lib/pdf-logo';
import { TYPE_OPERATION_TERRAIN_LABELS } from '@shared/enum/status-constants';
import { formatPhoneNumber } from '@/lib/format';
import { currencySymbol } from '@shared/config/currency';

// Default Company Info
const COMPANY = {
  nom: 'MicroFlex',
  slogan: 'Microfinance & Services Financiers',
  adresse: 'Brazzaville, République du Congo',
  telephone: '+242 06 123 4567',
  email: 'contact@microflex-m.com',
  siteWeb: 'www.microflex-m.com',
  nif: 'NIF-123456789',
  rccm: 'RCCM-BZV-1234',
};

/** Format money with narrow no-break space (fr-FR default) */
const fmt = (amount: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'decimal', minimumFractionDigits: 0 }).format(amount);

/** Translate raw type codes to French labels */
const translateType = (type: string): string =>
  (TYPE_OPERATION_TERRAIN_LABELS as Record<string, string>)[type] ?? type;

// ── Simple QR Code placeholder (SVG) ──────────────────────────────────
const QRPlaceholder: React.FC<{ data: string; size?: number }> = ({ data, size = 48 }) => {
  const hash = (s: string) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  };
  const h = hash(data);
  const g = 5;
  const c = size / (g + 2);
  const pat: boolean[][] = Array.from({ length: g }, (_, i) =>
    Array.from({ length: g }, (_, j) => (((h >> ((i * g + Math.min(j, g - 1 - j)) % 32)) & 1) === 1)),
  );
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <rect width={size} height={size} fill="white" stroke="#e2e8f0" strokeWidth="1" />
      {[[0, 0], [0, g + 1], [g + 1, 0]].map(([r, col], idx) => (
        <rect key={idx} x={col * c} y={r * c} width={c} height={c} fill="black" />
      ))}
      {pat.flatMap((row, i) =>
        row.map((cell, j) =>
          cell ? <rect key={`${i}-${j}`} x={(j + 1) * c} y={(i + 1) * c} width={c * 0.9} height={c * 0.9} fill="black" /> : null,
        ),
      )}
    </svg>
  );
};

// ── Logo with fallback ────────────────────────────────────────────────
const Logo: React.FC<{ src?: string; alt: string; className?: string }> = ({ src, alt, className }) => {
  const [err, setErr] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => { setErr(false); setLoading(true); }, [src]);

  if (!src || err) {
    const initials = alt.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    return (
      <div className={`${className} bg-surface-base rounded flex items-center justify-center text-content-primary font-bold text-xl`}>
        {initials}
      </div>
    );
  }
  return (
    <>
      {loading && <div className={`${className} bg-surface-subtle rounded animate-pulse`} />}
      <img
        src={src}
        alt={alt}
        className={`${className} rounded object-contain ${loading ? 'hidden' : ''}`}
        onLoad={() => setLoading(false)}
        onError={() => { setErr(true); setLoading(false); }}
      />
    </>
  );
};

// ── Main Component ────────────────────────────────────────────────────
interface InvoiceTemplateProps {
  data: ReceiptData;
  companyInfo?: typeof COMPANY;
  showQRCode?: boolean;
}

export const InvoiceTemplate = React.forwardRef<HTMLDivElement, InvoiceTemplateProps>(
  ({ data, companyInfo: companyInfoProp = COMPANY, showQRCode = true }, ref) => {
    const { branding } = useBranding();
    const companyInfo = { ...companyInfoProp, nom: companyInfoProp === COMPANY ? branding.appName : companyInfoProp.nom };
    const items = data.items ?? [];
    const total = data.total ?? 0;
    const tax = data.tax ?? 0;
    const devise = data.devise || currencySymbol();
    const reference = data.reference || 'N/A';
    const type = data.type || 'Opération';
    const typeLabel = translateType(type);
    const date = new Date(data.date || Date.now());

    const formattedDate = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const formattedTime = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    const maskedAccount = data.client?.numeroCompte
      ? `**** ${data.client.numeroCompte.slice(-4)}`
      : null;

    const qrData = JSON.stringify({ ref: reference, total, date: date.toISOString().split('T')[0], nif: companyInfo.nif });

    return (
      <div
        ref={ref}
        data-receipt-root
        className="invoice-a4 bg-white text-content-primary font-sans text-sm leading-normal"
        style={{ width: '210mm', height: '297mm', boxSizing: 'border-box' }}
      >
        {/* Print styles */}
        <style>{`
          @page { size: A4; margin: 0; }
          @media print {
            body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            .invoice-a4 { width: 100% !important; height: 100% !important; position: absolute; top: 0; left: 0; }
            .no-print { display: none !important; }
          }
        `}</style>

        <div className="flex flex-col justify-between h-full" style={{ padding: '15mm' }}>
          {/* ═══ TOP CONTENT ═══ */}
          <div>
            {/* ── HEADER ── */}
            <header className="flex justify-between items-start pb-5 border-b border-edge">
              <div className="flex gap-3 items-start">
                <Logo src={LOGO_BASE64} alt={companyInfo.nom} className="w-14 h-14" />
                <div>
                  <h1 className="font-bold text-lg uppercase tracking-wider text-content-primary">
                    {companyInfo.nom}
                  </h1>
                  <div className="text-[10px] text-content-muted mt-1 space-y-0.5">
                    <p>{companyInfo.slogan}</p>
                    <p>{companyInfo.adresse}</p>
                    <p>{companyInfo.email} &bull; {formatPhoneNumber(companyInfo.telephone)}</p>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <h2 className="text-3xl font-black text-content-primary tracking-tight uppercase">
                  FACTURE
                </h2>
                <p className="font-mono text-xs text-content-muted mt-1">#{reference}</p>
                <p className="text-[10px] text-content-muted mt-0.5">
                  {formattedDate} à {formattedTime}
                </p>
              </div>
            </header>

            {/* ── INFO CARDS ── */}
            <div className="grid grid-cols-2 gap-6 mt-6 mb-6">
              {/* Client */}
              <div className="bg-surface-muted p-4 rounded border border-edge-subtle">
                <h3 className="text-[10px] font-bold text-content-muted uppercase tracking-wider mb-2">
                  Client
                </h3>
                <div className="font-bold text-base text-content-primary">
                  {data.client?.prenom} {data.client?.nom}
                </div>
                {data.client?.telephone && (
                  <div className="font-mono text-xs text-content-muted mt-0.5">{formatPhoneNumber(data.client.telephone)}</div>
                )}
                {maskedAccount && (
                  <div className="mt-2 text-[10px] text-content-muted">
                    Compte: <span className="font-mono font-medium text-content-secondary">{maskedAccount}</span>
                  </div>
                )}
              </div>

              {/* Opération */}
              <div className="bg-surface-muted p-4 rounded border border-edge-subtle">
                <h3 className="text-[10px] font-bold text-content-muted uppercase tracking-wider mb-2">
                  Opération
                </h3>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-content-muted">Type</span>
                  <span className="font-bold text-content-primary">{typeLabel}</span>
                </div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-content-muted">Mode</span>
                  <span className="font-medium text-content-secondary">{data.modePaiement || 'Espèces'}</span>
                </div>
                {data.agent && (
                  <div className="flex justify-between text-xs pt-1 border-t border-edge mt-1">
                    <span className="text-content-muted">Agent</span>
                    <span className="text-content-secondary">{data.agent.prenom} {data.agent.nom}</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── TABLE ── */}
            <table className="w-full mb-6">
              <thead>
                <tr className="border-b-2 border-edge text-[10px] uppercase font-bold text-content-muted">
                  <th className="py-2 text-left w-[50%]">Désignation</th>
                  <th className="py-2 text-center w-[15%]">Qté</th>
                  <th className="py-2 text-right w-[15%]">P.U.</th>
                  <th className="py-2 text-right w-[20%]">Total</th>
                </tr>
              </thead>
              <tbody className="text-xs">
                {items.map((item, idx) => {
                  const qty = item.quantite || 1;
                  const unitPrice = qty > 1 ? item.montant / qty : item.montant;
                  return (
                    <tr key={idx} className="border-b border-edge-subtle">
                      <td className="py-3 pr-2 align-top">
                        <div className="font-bold text-content-primary">{item.description}</div>
                        {item.details && (
                          <div className="text-content-muted text-[10px] mt-0.5">{item.details}</div>
                        )}
                      </td>
                      <td className="py-3 text-center font-mono align-top">{qty}</td>
                      <td className="py-3 text-right font-mono text-content-muted align-top">
                        {fmt(unitPrice)} {devise}
                      </td>
                      <td className="py-3 text-right font-mono font-bold text-content-primary align-top">
                        {fmt(item.montant)} {devise}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* ── TOTALS (aligned right) ── */}
            <div className="flex justify-end mb-6">
              <div className="w-1/2">
                <div className="flex justify-between py-2 border-b border-edge-subtle text-xs">
                  <span className="text-content-muted">Sous-total HT</span>
                  <span className="font-mono font-medium">{fmt(tax ? total - tax : total)} {devise}</span>
                </div>
                {tax > 0 && (
                  <div className="flex justify-between py-2 border-b border-edge-subtle text-xs">
                    <span className="text-content-muted">Taxes / TVA</span>
                    <span className="font-mono">{fmt(tax)} {devise}</span>
                  </div>
                )}
                <div className="flex justify-between py-3 border-b-2 border-edge bg-surface-muted px-2 mt-2">
                  <span className="font-black text-sm uppercase">Net à Payer</span>
                  <span className="font-mono font-black text-lg">{fmt(total)} {devise}</span>
                </div>
                {data.montantLettres && (
                  <p className="mt-1 text-[10px] text-content-muted italic text-right">
                    Arrêté à : <span className="font-medium not-italic text-content-secondary">{data.montantLettres}</span>
                  </p>
                )}
              </div>
            </div>

            {/* ── NOTES ── */}
            {data.notes && (
              <div className="mb-4 p-3 bg-status-warning-bg border-l-4 border-status-warning rounded-r">
                <p className="text-[10px] font-bold text-status-warning uppercase tracking-wider mb-0.5">Note</p>
                <p className="text-xs text-status-warning">{data.notes}</p>
              </div>
            )}
          </div>

          {/* ═══ FOOTER (pushed to bottom via flex) ═══ */}
          <footer>
            {/* ── SIGNATURES ── */}
            <div className="grid grid-cols-2 gap-12 mb-6">
              <div>
                <div className="text-[10px] font-bold text-content-muted uppercase mb-10">
                  Signature Client
                </div>
                <div className="border-t border-dashed border-edge pt-1">
                  <span className="text-[8px] text-content-muted">Date et signature</span>
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-content-muted uppercase mb-10">
                  Signature Agent
                </div>
                <div className="border-t border-dashed border-edge pt-1">
                  <span className="text-[8px] text-content-muted">Cachet et signature</span>
                </div>
              </div>
            </div>

            {/* ── LEGAL & QR ── */}
            <div className="flex items-end gap-4 border-t border-edge pt-4">
              {showQRCode && (
                <div className="shrink-0 w-12 h-12">
                  <QRPlaceholder data={qrData} size={48} />
                </div>
              )}
              <div className="flex-1 text-[8px] text-content-muted leading-relaxed text-justify">
                <p className="mb-0.5">
                  <span className="font-bold">NIF:</span> {companyInfo.nif} &bull;{' '}
                  <span className="font-bold">RCCM:</span> {companyInfo.rccm}
                </p>
                <p>
                  Ce document tient lieu de facture et de preuve de paiement.
                  Conservez-le précieusement pour toute réclamation. Paiement immédiat à réception.
                </p>
                <p className="mt-0.5">
                  Document généré le {new Date().toLocaleDateString('fr-FR')} à{' '}
                  {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} &bull; Page 1/1
                </p>
              </div>
            </div>
          </footer>
        </div>
      </div>
    );
  },
);

InvoiceTemplate.displayName = 'InvoiceTemplate';
