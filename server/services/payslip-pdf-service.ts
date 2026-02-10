/**
 * Server-side payslip PDF generation using jsPDF + jspdf-autotable.
 * Produces an A4 PDF matching the visual style of the client PayslipTemplate.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getLogoBase64 } from '../lib/company-logo';
import { createLogger } from '../lib/logger';

const logger = createLogger('PayslipPDF');

// ── Types ──────────────────────────────────────────────────────

export interface PayslipPdfLine {
  code: string;
  libelle: string;
  category: string; // GAIN | RETENUE | PATRONAL | SUBTOTAL | NET
  base: number | null;
  taux: string | number | null;
  montantGain: number;
  montantRetenue: number;
  montantPatronal: number;
  sortOrder: number;
}

export interface PayslipPdfData {
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
    createdAt: string | Date;
  };
  lines: PayslipPdfLine[];
  employe: {
    matricule: string | null;
    nom: string;
    prenom: string | null;
    typeContrat: string | null;
    dateEmbauche: string | null;
    dateSortie: string | null;
    numeroCnss: string | null;
    categorie: string | null;
    coefficient: number | null;
    paymentMethod: string | null;
    jobTitle: string | null;
    anciennete: string | null;
    conventionCollective: string | null;
  } | null;
  company: {
    agenceName: string | null;
    adresse: string | null;
    telephone: string | null;
    niu: string | null;
    rccm: string | null;
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

// ── Helpers ────────────────────────────────────────────────────

const fmt = (v: number | string | null | undefined): string => {
  const n = typeof v === 'string' ? parseInt(v) || 0 : v || 0;
  return new Intl.NumberFormat('fr-FR').format(Math.round(n));
};

const fmtRate = (taux: string | number | null | undefined): string => {
  if (taux === null || taux === undefined) return '';
  const v = typeof taux === 'string' ? parseFloat(taux) : taux;
  if (isNaN(v) || v === 0) return '';
  return `${v.toFixed(v % 1 === 0 ? 0 : 2)}%`;
};

const formatPeriod = (mois: string): string => {
  const [year, month] = mois.split('-');
  const lastDay = new Date(Number(year), Number(month), 0).getDate();
  return `01/${month}/${year} au ${lastDay}/${month}/${year}`;
};

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Especes',
  TRANSFER: 'Virement bancaire',
  MOBILE_MONEY: 'Mobile Money',
  CHECK: 'Cheque',
};

// Colors (RGB tuples)
const DARK_BLUE: [number, number, number] = [27, 45, 75];
const LIGHT_BG: [number, number, number] = [248, 249, 250];
const BORDER_GRAY: [number, number, number] = [200, 210, 220];
const TEXT_GRAY: [number, number, number] = [100, 100, 100];

// ── Main generator ─────────────────────────────────────────────

export async function generatePayslipPdf(data: PayslipPdfData): Promise<Buffer> {
  const { bulletin, lines, employe, company, agence, leaves, heuresTravaillees } = data;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();  // 210
  const H = doc.internal.pageSize.getHeight(); // 297
  const ML = 10;
  const MR = 10;
  const CW = W - ML - MR; // 190

  // ── HEADER BAR ──
  doc.setFillColor(...DARK_BLUE);
  doc.rect(0, 0, W, 26, 'F');

  // Logo
  const logoBase64 = getLogoBase64();
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', ML, 3, 18, 18);
    } catch (err) {
      logger.debug('Logo embedding failed, using text fallback');
    }
  }

  // Company branding
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('COFIN&CO-M', 32, 12);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 190, 200);
  doc.text('La Finance Autrement', 32, 17);

  // Company details (right)
  doc.setFontSize(6.5);
  doc.setTextColor(200, 210, 220);
  let rY = 8;
  if (company?.adresse) { doc.text(company.adresse, W - MR, rY, { align: 'right' }); rY += 3.5; }
  if (company?.telephone) { doc.text(`Tel: ${company.telephone}`, W - MR, rY, { align: 'right' }); rY += 3.5; }
  if (company?.rccm) { doc.text(`RCCM: ${company.rccm}`, W - MR, rY, { align: 'right' }); rY += 3.5; }
  if (company?.niu) { doc.text(`NIU: ${company.niu}`, W - MR, rY, { align: 'right' }); }

  // Reset
  doc.setTextColor(0, 0, 0);

  // ── TITLE ──
  let y = 30;
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK_BLUE);
  doc.text('BULLETIN DE PAIE', W / 2, y, { align: 'center' });

  y += 7;

  // ── PERIOD BAR ──
  doc.setFillColor(239, 246, 255);
  doc.setDrawColor(...BORDER_GRAY);
  doc.roundedRect(ML, y, CW, 7, 1, 1, 'FD');
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);

  doc.setFont('helvetica', 'bold');
  doc.text('Periode:', ML + 3, y + 4.8);
  doc.setFont('helvetica', 'normal');
  doc.text(formatPeriod(bulletin.mois), ML + 20, y + 4.8);

  const payDate = bulletin.datePaiement
    ? new Date(bulletin.datePaiement).toLocaleDateString('fr-FR')
    : new Date(bulletin.createdAt).toLocaleDateString('fr-FR');
  doc.setFont('helvetica', 'bold');
  doc.text('Date paie:', ML + 80, y + 4.8);
  doc.setFont('helvetica', 'normal');
  doc.text(payDate, ML + 99, y + 4.8);

  const payMethod = PAYMENT_LABELS[employe?.paymentMethod || 'CASH'] || 'Especes';
  doc.setFont('helvetica', 'bold');
  doc.text('Mode:', ML + 140, y + 4.8);
  doc.setFont('helvetica', 'normal');
  doc.text(payMethod, ML + 152, y + 4.8);
  y += 10;

  // ── EMPLOYEE INFO ──
  // Calculate dynamic height based on optional rows
  const hasConvention = !!employe?.conventionCollective;
  const hasSortie = !!employe?.dateSortie;
  const extraRows = (hasConvention ? 1 : 0) + (hasSortie ? 1 : 0);
  const empBoxH = 20 + extraRows * 4;

  doc.setFillColor(...LIGHT_BG);
  doc.setDrawColor(...BORDER_GRAY);
  doc.roundedRect(ML, y, CW, empBoxH, 1, 1, 'FD');

  const col1 = ML + 3;
  const col2 = ML + CW / 2;
  let eY = y + 4.5;

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK_BLUE);
  doc.text('EMPLOYE', col1, eY);
  eY += 4;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(7);

  const empName = employe ? `${employe.nom} ${employe.prenom || ''}`.trim() : 'N/A';
  doc.text(`Nom: ${empName}`, col1, eY);
  doc.text(`Matricule: ${employe?.matricule || 'N/A'}`, col2, eY);
  eY += 4;
  doc.text(`Poste: ${employe?.jobTitle || 'N/A'}`, col1, eY);
  doc.text(`Contrat: ${employe?.typeContrat || 'N/A'}`, col2, eY);
  eY += 4;
  doc.text(`N CNSS: ${employe?.numeroCnss || 'N/A'}`, col1, eY);
  const embaucheLabel = employe?.dateEmbauche || 'N/A';
  const ancienneteLabel = employe?.anciennete ? ` (${employe.anciennete})` : '';
  doc.text(`Embauche: ${embaucheLabel}${ancienneteLabel}`, col2, eY);

  if (hasConvention) {
    eY += 4;
    doc.text(`Convention: ${employe!.conventionCollective}`, col1, eY);
    const catLabel = [employe?.categorie, employe?.coefficient ? `Coeff ${employe.coefficient}` : null].filter(Boolean).join(' - ');
    if (catLabel) doc.text(`Classification: ${catLabel}`, col2, eY);
  }

  if (hasSortie) {
    eY += 4;
    doc.setTextColor(200, 50, 50);
    doc.setFont('helvetica', 'bold');
    doc.text(`Date de sortie: ${employe!.dateSortie}`, col1, eY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
  }

  y += empBoxH + 4;

  // ── RUBRIQUE TABLE ──
  const sortedLines = [...lines]
    .filter(l => l.category !== 'NET')
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const tableBody = sortedLines.map(line => [
    line.code,
    line.libelle,
    line.base ? fmt(line.base) : '',
    fmtRate(line.taux),
    line.montantGain ? fmt(line.montantGain) : '',
    line.montantRetenue ? fmt(line.montantRetenue) : '',
    line.montantPatronal ? fmt(line.montantPatronal) : '',
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Code', 'Libelle', 'Base (FCFA)', 'Taux', 'Gains (FCFA)', 'Retenues (FCFA)', 'Patronal (FCFA)']],
    body: tableBody,
    theme: 'grid',
    styles: {
      fontSize: 6.5,
      cellPadding: 1.5,
      lineWidth: 0.1,
      lineColor: [180, 180, 180],
    },
    headStyles: {
      fillColor: DARK_BLUE,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 13, halign: 'center', textColor: TEXT_GRAY },
      1: { cellWidth: 54 },
      2: { cellWidth: 24, halign: 'right' },
      3: { cellWidth: 15, halign: 'center' },
      4: { cellWidth: 28, halign: 'right' },
      5: { cellWidth: 28, halign: 'right' },
      6: { cellWidth: 28, halign: 'right', textColor: TEXT_GRAY },
    },
    didParseCell: (hookData: any) => {
      if (hookData.section === 'body') {
        const line = sortedLines[hookData.row.index];
        if (line?.category === 'SUBTOTAL') {
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.fillColor = [239, 246, 255];
        }
        if (hookData.column.index === 5 && line?.montantRetenue && line.category !== 'SUBTOTAL') {
          hookData.cell.styles.textColor = [200, 50, 50];
        }
      }
    },
    margin: { left: ML, right: MR },
  });

  y = (doc as any).lastAutoTable.finalY + 5;

  // ── RECAP + NET ──
  const recapW = CW * 0.58;
  const netW = CW - recapW - 4;
  const netX = ML + recapW + 4;

  // Heures travaillées (if available)
  if (heuresTravaillees) {
    doc.setDrawColor(...BORDER_GRAY);
    doc.setFillColor(...LIGHT_BG);
    doc.roundedRect(ML, y, recapW, 9, 1, 1, 'FD');
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DARK_BLUE);
    doc.text('Activite du mois', ML + 3, y + 3.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    const hNorm = `${Math.floor(heuresTravaillees.heuresNormales / 60)}h${String(heuresTravaillees.heuresNormales % 60).padStart(2, '0')}`;
    let activiteText = `Jours: ${heuresTravaillees.joursTravailles}   Heures: ${hNorm}`;
    if (heuresTravaillees.heuresSupplementaires > 0) {
      const hSup = `${Math.floor(heuresTravaillees.heuresSupplementaires / 60)}h${String(heuresTravaillees.heuresSupplementaires % 60).padStart(2, '0')}`;
      activiteText += `   H. Sup: ${hSup}`;
    }
    doc.text(activiteText, ML + 3, y + 7.5);
    y += 11;
  }

  // Congés (if available)
  if (leaves) {
    doc.setDrawColor(...BORDER_GRAY);
    doc.setFillColor(...LIGHT_BG);
    doc.roundedRect(ML, y, recapW, 9, 1, 1, 'FD');
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DARK_BLUE);
    doc.text('Compteur Conges', ML + 3, y + 3.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text(`Acquis: ${leaves.acquired}   Pris: ${leaves.used}   Solde: ${leaves.balance}`, ML + 3, y + 7.5);
    y += 11;
  }

  // Recap box
  doc.setDrawColor(...BORDER_GRAY);
  doc.setFillColor(...LIGHT_BG);
  doc.roundedRect(ML, y, recapW, 20, 1, 1, 'FD');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK_BLUE);
  doc.text('Recapitulatif', ML + 3, y + 4);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);

  const recapItems: [string, string][] = [
    ['Salaire Brut', `${fmt(bulletin.salaireBrut)} FCFA`],
    ['Retenues', `${fmt(bulletin.totalRetenues)} FCFA`],
    ['Cotis. Patronales', `${fmt(bulletin.totalChargesPatronales)} FCFA`],
  ];
  let ry = y + 8;
  for (const [label, val] of recapItems) {
    doc.setFontSize(6.5);
    doc.text(label, ML + 3, ry);
    doc.text(val, ML + recapW - 3, ry, { align: 'right' });
    ry += 4;
  }

  // NET box
  doc.setFillColor(...DARK_BLUE);
  doc.roundedRect(netX, y, netW, 20, 1, 1, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('NET A PAYER', netX + netW / 2, y + 6, { align: 'center' });
  doc.setFontSize(15);
  doc.setTextColor(78, 187, 107);
  doc.text(`${fmt(bulletin.salaireNet)}`, netX + netW / 2, y + 13, { align: 'center' });
  doc.setFontSize(9);
  doc.text('FCFA', netX + netW / 2, y + 17.5, { align: 'center' });

  // ── FOOTER ──
  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184);
  const genDate = new Date(bulletin.createdAt).toLocaleDateString('fr-FR');
  doc.text(`Document genere le ${genDate} — Confidentiel`, W / 2, H - 8, { align: 'center' });
  doc.text('COFIN&CO-M — La Finance Autrement', W / 2, H - 5, { align: 'center' });

  // Convert to Buffer
  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}
