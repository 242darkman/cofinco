import React from 'react';
import { LOGO_BASE64 } from '@/lib/pdf-logo';

// ── Types ───────────────────────────────────────────────────────

export interface PayslipLine {
  code: string;
  libelle: string;
  category: string; // 'GAIN' | 'RETENUE' | 'PATRONAL' | 'SUBTOTAL' | 'NET'
  base: number;
  taux: string | number | null;
  montantGain: number;
  montantRetenue: number;
  montantPatronal: number;
  sortOrder: number;
}

export interface PayslipData {
  bulletin: {
    id: number;
    mois: string;
    salaireBrut: string;
    salaireNet: string;
    totalChargesSalariales: string;
    totalChargesPatronales: string;
    irpp: string;
    totalRetenues: string;
    salaireBaseSnapshot: number;
    version: number;
    statut: string;
    datePaiement: string | null;
    createdAt: string;
  };
  lines: PayslipLine[];
  employe: {
    id: string;
    matricule: string | null;
    numeroCnss: string | null;
    dateEmbauche: string | null;
    dateSortie: string | null;
    typeContrat: string | null;
    categorie: string | null;
    coefficient: number | null;
    paymentMethod: string | null;
    paymentDetails: string | null;
    nom: string;
    prenom: string | null;
    jobTitle: string | null;
    anciennete: string | null;
    conventionCollective: string | null;
  } | null;
  company: {
    agenceName: string | null;
    adresse: string | null;
    telephone: string | null;
    niu: string | null;
    cnssMembership: string | null;
    rccm: string | null;
    logoUrl: string | null;
  } | null;
  agence: {
    nom: string;
    adresse: string | null;
    telephone: string | null;
  } | null;
  leaves: {
    acquired: number;
    used: number;
    balance: number;
  } | null;
  heuresTravaillees: {
    joursTravailles: number;
    heuresNormales: number;
    heuresSupplementaires: number;
  } | null;
}

// ── Helpers ─────────────────────────────────────────────────────

const fmt = (n: number | string | null | undefined) => {
  const v = typeof n === 'string' ? parseInt(n) || 0 : n || 0;
  return v.toLocaleString('fr-FR');
};

const fmtRate = (taux: string | number | null) => {
  if (taux === null || taux === undefined) return '';
  const v = typeof taux === 'string' ? parseFloat(taux) : taux;
  if (isNaN(v)) return '';
  return `${v.toFixed(v % 1 === 0 ? 0 : 2)}%`;
};

const formatPeriod = (mois: string) => {
  const [year, month] = mois.split('-');
  const date = new Date(Number(year), Number(month) - 1);
  return `01/${month}/${year} au ${new Date(Number(year), Number(month), 0).getDate()}/${month}/${year}`;
};

const formatMonthLabel = (mois: string) => {
  const [year, month] = mois.split('-');
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
};

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Espèces',
  TRANSFER: 'Virement bancaire',
  MOBILE_MONEY: 'Mobile Money',
  CHECK: 'Chèque',
};

// ── Logo ────────────────────────────────────────────────────────

const LogoImage: React.FC = () => {
  const [hasError, setHasError] = React.useState(false);
  if (hasError || !LOGO_BASE64) {
    return (
      <div className="w-12 h-12 bg-gradient-to-br from-blue-700 to-emerald-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
        CM
      </div>
    );
  }
  return (
    <img
      src={LOGO_BASE64}
      alt="Logo"
      className="w-12 h-12 rounded-lg object-contain"
      onError={() => setHasError(true)}
    />
  );
};

// ── Main Template ───────────────────────────────────────────────

interface PayslipTemplateProps {
  data: PayslipData;
}

export const PayslipTemplate = React.forwardRef<HTMLDivElement, PayslipTemplateProps>(
  ({ data }, ref) => {
    const { bulletin, lines, employe, company, agence, leaves, heuresTravaillees } = data;
    const companyName = company?.agenceName || 'COFIN&CO-M';
    const employeeName = employe ? `${employe.nom} ${employe.prenom || ''}`.trim() : 'N/A';

    // Sort lines by sortOrder for proper section display (GAIN → SUBTOTAL brut → RETENUE → SUBTOTAL → PATRONAL → NET)
    const allTableLines = [...lines]
      .filter(l => l.category !== 'NET')
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const netLine = lines.find(l => l.category === 'NET');

    // Fill empty rows to maintain consistent height
    const MIN_ROWS = 16;
    const emptyRows = Math.max(0, MIN_ROWS - allTableLines.length);

    return (
      <div
        ref={ref}
        data-receipt-root
        className="bg-white text-slate-900 w-full max-w-[210mm] mx-auto min-h-[297mm] p-6 print:p-4 font-sans text-[10px] leading-tight relative"
      >
        <style type="text/css" media="print">{`
          @page { size: A4; margin: 10mm; }
          @media print {
            body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            .no-print { display: none !important; }
          }
        `}</style>

        {/* ── HEADER ──────────────────────────────────────── */}
        <div className="text-center mb-4">
          <h1 className="text-xl font-black uppercase tracking-widest text-slate-900">
            Bulletin de Paie
          </h1>
        </div>

        {/* ── EMPLOYER / EMPLOYEE BLOC ────────────────────── */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          {/* Employeur */}
          <div className="border border-slate-700 rounded-sm overflow-hidden">
            <div className="bg-blue-100 border-b border-slate-700 px-2 py-0.5 font-bold text-center uppercase text-[9px]">
              Employeur
            </div>
            <div className="p-2 space-y-1">
              <div className="flex items-start gap-2">
                <LogoImage />
                <div>
                  <div className="font-bold text-sm uppercase">{companyName}</div>
                  <div className="text-slate-600 text-[9px]">
                    {company?.adresse || agence?.adresse || 'Brazzaville, Congo'}
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-1 text-[9px]">
                {company?.niu && <span><b>NIU:</b> {company.niu}</span>}
                {company?.cnssMembership && <span><b>CNSS:</b> {company.cnssMembership}</span>}
              </div>
              {company?.rccm && (
                <div className="text-[9px]"><b>RCCM:</b> {company.rccm}</div>
              )}
              {(company?.telephone || agence?.telephone) && (
                <div className="text-[9px]"><b>Tel:</b> {company?.telephone || agence?.telephone}</div>
              )}
            </div>
          </div>

          {/* Employé */}
          <div className="flex flex-col gap-2">
            {/* Identité contrat */}
            <div className="border border-slate-700 rounded-sm overflow-hidden text-[9px]">
              <div className="grid grid-cols-[auto_1fr]">
                {([
                  ['Matricule', employe?.matricule || 'N/A'],
                  ['Emploi', employe?.jobTitle || 'N/A'],
                  ['Contrat', employe?.typeContrat || 'CDI'],
                  ['Catégorie', [employe?.categorie, employe?.coefficient ? `Coeff ${employe.coefficient}` : null].filter(Boolean).join(' - ') || 'N/A'],
                  employe?.conventionCollective ? ['Convention', employe.conventionCollective] : null,
                  employe?.anciennete ? ['Ancienneté', employe.anciennete] : null,
                  employe?.dateSortie ? ['Sortie', new Date(employe.dateSortie).toLocaleDateString('fr-FR')] : null,
                ] as ([string, string] | null)[]).filter((row): row is [string, string] => row !== null).map(([label, value], i) => (
                  <React.Fragment key={i}>
                    <div className={`bg-blue-50 px-1.5 py-0.5 font-bold border-r border-slate-700 ${i > 0 ? 'border-t border-slate-300' : ''}`}>
                      {label}
                    </div>
                    <div className={`px-1.5 py-0.5 ${i > 0 ? 'border-t border-slate-300' : ''} ${label === 'Sortie' ? 'text-red-600 font-bold' : ''}`}>
                      {value}
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Identité employé */}
            <div className="border border-slate-700 rounded-sm p-2 bg-slate-50 flex-1">
              <div className="font-bold text-xs uppercase">{employeeName}</div>
              {employe?.numeroCnss && (
                <div className="text-[9px] mt-0.5">N° CNSS: {employe.numeroCnss}</div>
              )}
              {employe?.dateEmbauche && (
                <div className="text-[9px]">Embauche: {new Date(employe.dateEmbauche).toLocaleDateString('fr-FR')}</div>
              )}
            </div>
          </div>
        </div>

        {/* ── BANDEAU PÉRIODE & PAIEMENT ──────────────────── */}
        <div className="border border-slate-700 mb-3 bg-blue-50 flex divide-x divide-slate-700 text-[9px]">
          <div className="flex-1 px-2 py-1">
            <b>Période:</b> {formatPeriod(bulletin.mois)}
          </div>
          <div className="flex-1 px-2 py-1">
            <b>Date paie:</b> {bulletin.datePaiement
              ? new Date(bulletin.datePaiement).toLocaleDateString('fr-FR')
              : new Date(bulletin.createdAt).toLocaleDateString('fr-FR')}
          </div>
          <div className="flex-1 px-2 py-1">
            <b>Mode:</b> {PAYMENT_LABELS[employe?.paymentMethod || 'CASH'] || employe?.paymentMethod || 'Espèces'}
          </div>
        </div>

        {/* ── TABLEAU CENTRAL ─────────────────────────────── */}
        <table className="w-full border-collapse border border-slate-700 mb-3 text-[10px]">
          <thead>
            <tr className="bg-blue-100 text-slate-900">
              <th className="border border-slate-700 px-1 py-0.5 w-10 text-center">Code</th>
              <th className="border border-slate-700 px-1 py-0.5 text-left">Libellé</th>
              <th className="border border-slate-700 px-1 py-0.5 w-[70px] text-right"><div className="text-[8px] leading-tight">Base<br/><span className="font-normal text-slate-500">(FCFA)</span></div></th>
              <th className="border border-slate-700 px-1 py-0.5 w-12 text-center">Taux</th>
              <th className="border border-slate-700 px-1 py-0.5 w-[70px] text-right"><div className="text-[8px] leading-tight">Gains<br/><span className="font-normal text-slate-500">(FCFA)</span></div></th>
              <th className="border border-slate-700 px-1 py-0.5 w-[70px] text-right"><div className="text-[8px] leading-tight">Retenues<br/><span className="font-normal text-slate-500">(FCFA)</span></div></th>
              <th className="border border-slate-700 px-1 py-0.5 w-[70px] text-right bg-slate-200">
                <div className="text-[8px] leading-tight text-center">Cotis. Pat.<br/><span className="font-normal text-slate-500">(FCFA)</span></div>
              </th>
            </tr>
          </thead>
          <tbody>
            {allTableLines.map((line, i) => {
              const isSubtotal = line.category === 'SUBTOTAL';
              const isNet = line.category === 'NET';
              return (
                <tr
                  key={i}
                  className={
                    isSubtotal
                      ? 'bg-blue-50 font-bold'
                      : isNet
                        ? 'bg-blue-900 text-white font-bold'
                        : i % 2 === 0
                          ? 'bg-white'
                          : 'bg-slate-50'
                  }
                >
                  <td className="border-r border-slate-600 px-1 py-0.5 text-center font-mono text-slate-500 text-[9px]">
                    {line.code}
                  </td>
                  <td className={`border-r border-slate-600 px-1 py-0.5 ${isSubtotal || isNet ? 'font-bold' : ''}`}>
                    {line.libelle}
                  </td>
                  <td className="border-r border-slate-600 px-1 py-0.5 text-right font-mono text-[9px]">
                    {line.base ? fmt(line.base) : ''}
                  </td>
                  <td className="border-r border-slate-600 px-1 py-0.5 text-center text-[9px]">
                    {fmtRate(line.taux)}
                  </td>
                  <td className="border-r border-slate-600 px-1 py-0.5 text-right font-mono">
                    {line.montantGain ? fmt(line.montantGain) : ''}
                  </td>
                  <td className={`border-r border-slate-600 px-1 py-0.5 text-right font-mono ${!isSubtotal && !isNet && line.montantRetenue ? 'text-red-700' : ''}`}>
                    {line.montantRetenue ? fmt(line.montantRetenue) : ''}
                  </td>
                  <td className="px-1 py-0.5 text-right font-mono text-slate-500 bg-slate-100/50 text-[9px]">
                    {line.montantPatronal ? fmt(line.montantPatronal) : ''}
                  </td>
                </tr>
              );
            })}
            {/* Empty filler rows */}
            {Array.from({ length: emptyRows }).map((_, i) => (
              <tr key={`empty-${i}`}>
                <td className="border-r border-slate-600 h-[18px]" />
                <td className="border-r border-slate-600" />
                <td className="border-r border-slate-600" />
                <td className="border-r border-slate-600" />
                <td className="border-r border-slate-600" />
                <td className="border-r border-slate-600" />
                <td />
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── PIED : ACTIVITÉ + CONGÉS + TOTAUX + NET ──── */}
        <div className="flex gap-3 items-stretch mb-4">
          {/* Activité + Congés + Récap */}
          <div className="flex-1 flex flex-col gap-2">
            {/* Heures travaillées */}
            {heuresTravaillees && (
              <div className="border border-slate-700 rounded-sm p-2 text-[9px]">
                <div className="font-bold border-b border-slate-300 mb-1 pb-0.5">Activité du mois</div>
                <div className="flex justify-between">
                  <span>Jours: <b>{heuresTravaillees.joursTravailles}</b></span>
                  <span>Heures: <b>{Math.floor(heuresTravaillees.heuresNormales / 60)}h{String(heuresTravaillees.heuresNormales % 60).padStart(2, '0')}</b></span>
                  {heuresTravaillees.heuresSupplementaires > 0 && (
                    <span>H. Sup: <b className="text-amber-600">{Math.floor(heuresTravaillees.heuresSupplementaires / 60)}h{String(heuresTravaillees.heuresSupplementaires % 60).padStart(2, '0')}</b></span>
                  )}
                </div>
              </div>
            )}
            {/* Congés */}
            {leaves && (
              <div className="border border-slate-700 rounded-sm p-2 text-[9px]">
                <div className="font-bold border-b border-slate-300 mb-1 pb-0.5">Compteur Congés</div>
                <div className="flex justify-between">
                  <span>Acquis: <b>{leaves.acquired}</b></span>
                  <span>Pris: <b>{leaves.used}</b></span>
                  <span>Solde: <b className="text-blue-700">{leaves.balance}</b></span>
                </div>
              </div>
            )}
            <div className="border border-slate-700 rounded-sm p-2 text-[9px] flex-1">
              <div className="font-bold mb-1">Récapitulatif</div>
              <div className="space-y-0.5">
                <div className="flex justify-between">
                  <span>Brut S.S.</span>
                  <span className="font-mono">{fmt(bulletin.salaireBrut)} FCFA</span>
                </div>
                <div className="flex justify-between">
                  <span>Retenues</span>
                  <span className="font-mono text-red-600">{fmt(bulletin.totalRetenues)} FCFA</span>
                </div>
                <div className="flex justify-between">
                  <span>Cotis. Patronales</span>
                  <span className="font-mono text-slate-500">{fmt(bulletin.totalChargesPatronales)} FCFA</span>
                </div>
              </div>
            </div>
          </div>

          {/* NET À PAYER */}
          <div className="w-48 border-2 border-slate-900 rounded-sm flex flex-col overflow-hidden">
            <div className="bg-blue-900 text-white font-bold text-center py-2 uppercase text-xs">
              Net à Payer
            </div>
            <div className="flex-1 flex items-center justify-center bg-white px-2">
              <span className="text-lg font-black font-mono tracking-tight">
                {fmt(bulletin.salaireNet)} <span className="text-xs font-normal">FCFA</span>
              </span>
            </div>
            <div className="text-[8px] text-center bg-slate-100 p-1 border-t border-slate-200 capitalize">
              {formatMonthLabel(bulletin.mois)}
            </div>
          </div>
        </div>

        {/* ── MENTIONS LÉGALES & SIGNATURE ─────────────────── */}
        <div className="flex justify-between items-end text-[9px] mt-4 pt-4 border-t border-slate-300">
          <div className="italic text-slate-500 max-w-xs leading-relaxed">
            Conservez ce bulletin de paie sans limitation de durée.
            <br />
            Conformité Code du Travail & CNSS - République du Congo.
          </div>
          <div className="text-center">
            <div className="border-t border-slate-900 w-40 pt-1 font-bold">
              Signature de l'Employeur
            </div>
          </div>
          <div className="text-center">
            <div className="border-t border-slate-900 w-40 pt-1 font-bold">
              Signature du Salarié
            </div>
          </div>
        </div>

        {/* ── FOOTER ──────────────────────────────────────── */}
        <div className="absolute bottom-4 left-6 right-6 text-[8px] text-slate-400 text-center">
          Document généré le {new Date(bulletin.createdAt).toLocaleDateString('fr-FR')} — Confidentiel
        </div>
      </div>
    );
  }
);

PayslipTemplate.displayName = 'PayslipTemplate';
