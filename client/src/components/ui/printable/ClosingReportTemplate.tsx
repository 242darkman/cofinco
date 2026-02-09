import React from 'react';
import { LOGO_BASE64 } from '@/lib/pdf-logo';
import {
  type ClosureReportData,
  DENOMINATIONS,
  formatMoney,
  formatDateTime,
  formatDate,
  generateSignature,
} from '@/hooks/finance/useClosurePDF';

// ── Sub-components ──────────────────────────────────────────────

interface InfoRowProps {
  label: string;
  value: string;
}

const InfoRow: React.FC<InfoRowProps> = ({ label, value }) => (
  <div className="flex justify-between items-baseline py-1">
    <span className="text-xs text-slate-500">{label}</span>
    <span className="text-xs font-medium text-slate-800">{value}</span>
  </div>
);

interface AmountRowProps {
  label: string;
  amount: number;
  bold?: boolean;
}

const AmountRow: React.FC<AmountRowProps> = ({ label, amount, bold }) => (
  <div className={`flex justify-between items-baseline py-1.5 ${bold ? 'border-t border-slate-300 mt-1 pt-2' : ''}`}>
    <span className={`text-xs ${bold ? 'font-bold text-slate-900' : 'text-slate-600'}`}>{label}</span>
    <span className={`font-mono tabular-nums text-xs text-right ${bold ? 'font-bold text-slate-900' : 'text-slate-800'}`}>
      {formatMoney(amount)}
    </span>
  </div>
);

// ── Logo Fallback ───────────────────────────────────────────────

const LogoImage: React.FC = () => {
  const [hasError, setHasError] = React.useState(false);

  if (hasError || !LOGO_BASE64) {
    return (
      <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-emerald-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
        CM
      </div>
    );
  }

  return (
    <img
      src={LOGO_BASE64}
      alt="COFIN&CO-M"
      className="w-10 h-10 rounded-lg object-contain"
      onError={() => setHasError(true)}
    />
  );
};

// ── Main Template ───────────────────────────────────────────────

interface ClosingReportTemplateProps {
  data: ClosureReportData;
}

export const ClosingReportTemplate = React.forwardRef<HTMLDivElement, ClosingReportTemplateProps>(
  ({ data }, ref) => {
    const signature = data.signatureNumérique || generateSignature(data);

    // Compute billetage rows (only non-zero)
    const billetageRows = DENOMINATIONS
      .map(d => ({
        key: d.key,
        label: d.value >= 500
          ? `Billet ${d.value.toLocaleString('fr-FR')}`
          : `Pièce ${d.value}`,
        count: data.billetage[d.key] || 0,
        total: (data.billetage[d.key] || 0) * d.value,
      }))
      .filter(r => r.count > 0);

    // Ecart styling
    const ecartAbs = Math.abs(data.ecart);
    const ecartColors = ecartAbs > 100
      ? { bg: 'bg-red-600', text: 'text-white', label: 'bg-red-700' }
      : data.ecart === 0
        ? { bg: 'bg-emerald-600', text: 'text-white', label: 'bg-emerald-700' }
        : { bg: 'bg-amber-500', text: 'text-white', label: 'bg-amber-600' };
    const ecartStatus = data.ecart === 0
      ? 'Parfait'
      : ecartAbs <= 100
        ? 'Acceptable'
        : 'A verifier';
    const ecartText = data.ecart > 0
      ? `+${formatMoney(data.ecart)}`
      : formatMoney(data.ecart);

    return (
      <div data-receipt-root className="bg-white" ref={ref}>
        {/* Print CSS */}
        <style type="text/css" media="print">
          {`
            @page {
              size: A4;
              margin: 15mm;
            }
            @media print {
              body {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .no-print { display: none !important; }
            }
          `}
        </style>

        <div className="w-full max-w-[210mm] mx-auto min-h-[297mm] bg-white font-sans text-slate-900 flex flex-col">

          {/* ═══ Header ═══ */}
          <div className="h-1.5 bg-gradient-to-r from-blue-600 via-blue-500 to-emerald-500" />

          <header className="px-8 py-5 flex justify-between items-start">
            <div className="flex items-center gap-3">
              <LogoImage />
              <div>
                <h1 className="text-lg font-black text-slate-900 tracking-tight">COFIN&CO-M</h1>
                <p className="text-[10px] text-slate-400">Microfinance & Services Financiers</p>
              </div>
            </div>

            <div className="text-right">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                Rapport de Cloture de Caisse
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {data.agenceNom} — {data.caisseNom}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">{formatDate(data.closedAt)}</p>
            </div>
          </header>

          {/* ═══ Session Info ═══ */}
          <div className="mx-8 px-5 py-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="grid grid-cols-3 gap-x-6 gap-y-2">
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Session</p>
                <p className="text-xs font-mono font-semibold text-slate-800">{data.sessionId.slice(0, 8).toUpperCase()}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Caissier</p>
                <p className="text-xs font-semibold text-slate-800">{data.caissierNom}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Signature</p>
                <p className="text-[10px] font-mono text-slate-500">SIG-{signature}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Ouverture</p>
                <p className="text-xs text-slate-700">{formatDateTime(data.openedAt)}</p>
              </div>
              <div className="col-span-2">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Fermeture</p>
                <p className="text-xs text-slate-700">{formatDateTime(data.closedAt)}</p>
              </div>
            </div>
          </div>

          {/* ═══ Financial Summary + Ecart Verdict ═══ */}
          <div className="mx-8 mt-5 grid grid-cols-2 gap-5">
            {/* Left: Financial Summary */}
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Resume Financier
              </h3>
              <div className="border border-slate-200 rounded-lg p-4">
                <AmountRow label="Solde d'ouverture" amount={data.soldeOuverture} />
                <AmountRow label="Total Entrees" amount={data.totalEntrees} />
                <AmountRow label="Total Sorties" amount={data.totalSorties} />
                <div className="border-t border-dashed border-slate-200 mt-1" />
                <AmountRow label="Solde Theorique" amount={data.soldeTheorique} bold />
                <AmountRow label="Solde Physique (Compte)" amount={data.soldePhysique} bold />
              </div>
            </div>

            {/* Right: Ecart Verdict */}
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Ecart de Caisse
              </h3>
              <div className={`${ecartColors.bg} rounded-xl p-5 ${ecartColors.text} flex flex-col justify-center min-h-[140px]`}>
                <p className="text-xs font-medium opacity-80 uppercase tracking-wider">Ecart</p>
                <p className="text-2xl font-black font-mono tabular-nums mt-1">
                  {ecartText}
                </p>
                <span className={`inline-block mt-3 px-2 py-0.5 text-[10px] font-bold rounded ${ecartColors.label} ${ecartColors.text} w-fit`}>
                  {ecartStatus}
                </span>
              </div>
            </div>
          </div>

          {/* ═══ Billetage + Treasury Decision ═══ */}
          <div className="mx-8 mt-5 grid grid-cols-2 gap-5">
            {/* Left: Billetage */}
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Detail du Billetage
              </h3>
              {billetageRows.length > 0 ? (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-300">
                      <th className="py-1.5 text-left text-[10px] font-bold text-slate-500 uppercase">Coupure</th>
                      <th className="py-1.5 text-center text-[10px] font-bold text-slate-500 uppercase">Qte</th>
                      <th className="py-1.5 text-right text-[10px] font-bold text-slate-500 uppercase">Sous-total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billetageRows.map((row, i) => (
                      <tr key={row.key} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="py-1 text-slate-700">{row.label}</td>
                        <td className="py-1 text-center font-mono tabular-nums text-slate-600">{row.count}</td>
                        <td className="py-1 text-right font-mono tabular-nums text-slate-800">{formatMoney(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-300 bg-slate-900 text-white">
                      <td className="py-1.5 font-bold" colSpan={2}>TOTAL</td>
                      <td className="py-1.5 text-right font-mono tabular-nums font-bold">{formatMoney(data.soldePhysique)}</td>
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <p className="text-xs text-slate-400 italic">Aucun billetage enregistre</p>
              )}
            </div>

            {/* Right: Treasury Decision */}
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Decision de Tresorerie
              </h3>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <div className="flex justify-between items-baseline py-1.5">
                  <span className="text-xs text-slate-600">Transfert vers coffre</span>
                  <span className="font-mono tabular-nums text-xs font-semibold text-slate-800">{formatMoney(data.montantVersCoffre)}</span>
                </div>
                <div className="flex justify-between items-baseline py-1.5">
                  <span className="text-xs text-slate-600">Report jour suivant</span>
                  <span className="font-mono tabular-nums text-xs font-semibold text-slate-800">{formatMoney(data.montantReporte)}</span>
                </div>
                <div className="border-t border-slate-300 mt-2 pt-2">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs font-bold text-slate-900">Total</span>
                    <span className="font-mono tabular-nums text-sm font-bold text-slate-900">
                      {formatMoney(data.montantVersCoffre + data.montantReporte)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ═══ Mobile Money Reconciliation (conditional) ═══ */}
          {data.mmReconciliation && data.mmReconciliation.length > 0 && (
            <div className="mx-8 mt-5">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Reconciliation Mobile Money
              </h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-300">
                    <th className="py-1.5 text-left text-[10px] font-bold text-slate-500 uppercase">Fournisseur</th>
                    <th className="py-1.5 text-right text-[10px] font-bold text-slate-500 uppercase">Solde Attendu</th>
                    <th className="py-1.5 text-right text-[10px] font-bold text-slate-500 uppercase">Solde API</th>
                    <th className="py-1.5 text-right text-[10px] font-bold text-slate-500 uppercase">Ecart</th>
                    <th className="py-1.5 text-center text-[10px] font-bold text-slate-500 uppercase">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {data.mmReconciliation.map((r, i) => (
                    <tr key={r.provider} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="py-1 text-slate-700 font-medium">{r.provider}</td>
                      <td className="py-1 text-right font-mono tabular-nums">{formatMoney(r.expectedBalance)}</td>
                      <td className="py-1 text-right font-mono tabular-nums">
                        {r.providerBalance !== null ? formatMoney(r.providerBalance) : 'N/A'}
                      </td>
                      <td className="py-1 text-right font-mono tabular-nums">{formatMoney(r.ecart)}</td>
                      <td className="py-1 text-center">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          r.status === 'MATCHED'
                            ? 'bg-emerald-100 text-emerald-700'
                            : r.status === 'API_FAILED'
                              ? 'bg-slate-100 text-slate-500'
                              : 'bg-red-100 text-red-700'
                        }`}>
                          {r.status === 'MATCHED' ? 'OK' : r.status === 'API_FAILED' ? 'API Indisponible' : 'Ecart'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ═══ Observations (conditional) ═══ */}
          {(data.ecartJustification || data.observations) && (
            <div className="mx-8 mt-5">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Observations
              </h3>
              <div className="p-3 bg-amber-50 border-l-4 border-amber-400 rounded-r-lg">
                {data.ecartJustification && (
                  <p className="text-xs text-amber-900">
                    <span className="font-bold">Justification ecart:</span> {data.ecartJustification}
                  </p>
                )}
                {data.observations && (
                  <p className="text-xs text-amber-900 mt-1">
                    <span className="font-bold">Notes:</span> {data.observations}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ═══ Spacer ═══ */}
          <div className="flex-grow min-h-[30px]" />

          {/* ═══ Signatures ═══ */}
          <div className="mx-8 mt-8 flex justify-between items-end">
            <div className="text-center">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-10">
                Signature du Caissier
              </p>
              <div className="w-44 border-t-2 border-dashed border-slate-300 pt-1">
                <p className="text-[10px] text-slate-400">Date et signature</p>
              </div>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-10">
                Visa du Superviseur
              </p>
              <div className="w-44 border-t-2 border-dashed border-slate-300 pt-1">
                <p className="text-[10px] text-slate-400">Cachet et signature</p>
              </div>
            </div>
          </div>

          {/* ═══ Footer ═══ */}
          <footer className="mt-6">
            <div className="mx-8 py-3 border-t border-slate-200 flex justify-between items-center">
              <div className="text-[9px] text-slate-400">
                <p>Document genere automatiquement le {new Date().toLocaleString('fr-FR')}</p>
                <p>Empreinte numerique: SIG-{signature}</p>
              </div>
              <p className="text-[9px] text-slate-400">
                COFIN&CO-M — Rapport de Cloture — Document confidentiel
              </p>
            </div>
            <div className="h-1.5 bg-gradient-to-r from-blue-600 via-emerald-500 to-blue-600" />
          </footer>
        </div>
      </div>
    );
  }
);

ClosingReportTemplate.displayName = 'ClosingReportTemplate';
