/**
 * Module d'export professionnel pour les états financiers
 * Génère des PDF et Excel adaptés à chaque type de rapport
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { downloadWorkbook } from '@/lib/excel-export';
import { SessionCaisse, CaisseTransaction } from '@/types/finance';
import { computeSessionStatus, getSessionStatusLabel } from '@/lib/format';
import { addPdfLogoHeader as addSharedLogoHeader, addPdfLogoFooter as addSharedLogoFooter } from '@/lib/pdf-logo';
import { currencySymbol } from '@shared/config/currency';

// ============================================================================
// TYPES & HELPERS
// ============================================================================

interface ExportConfig {
  companyName: string;
  companySubtitle: string;
  dateDebut: string;
  dateFin: string;
}

const DEFAULT_CONFIG: ExportConfig = {
  companyName: 'MicroFlex',
  companySubtitle: 'Coopérative Financière du Congo',
  dateDebut: '',
  dateFin: '',
};

// Couleurs corporate
const COLORS = {
  primary: [6, 182, 212] as [number, number, number],      // Cyan
  secondary: [30, 41, 59] as [number, number, number],     // Slate-800
  success: [16, 185, 129] as [number, number, number],     // Emerald
  danger: [244, 63, 94] as [number, number, number],       // Rose
  warning: [245, 158, 11] as [number, number, number],     // Amber
  text: [15, 23, 42] as [number, number, number],          // Slate-900
  textLight: [100, 116, 139] as [number, number, number],  // Slate-500
};

const THOUSANDS_SPACE_REGEX = /[\u00A0\u202F]/g;

/**
 * Formate un nombre avec des espaces réguliers comme séparateurs de milliers
 * (jsPDF ne rend pas correctement les espaces insécables de toLocaleString)
 */
function formatNumber(value: number): string {
  return value.toLocaleString('fr-FR').replace(THOUSANDS_SPACE_REGEX, ' ');
}

function formatMoney(value: number): string {
  return formatNumber(value) + ' ' + currencySymbol();
}

function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isEntreeOperation(type: string): boolean {
  const entreeTypes = [
    'DEPOSIT', 'ENCAISSEMENT', 'LOAN_REPAYMENT', 'REMBOURSEMENT_PRET',
    'TONTINE_COTISATION', 'TONTINE_CONTRIBUTION', 'COTISATION_TONTINE',
    'SAVINGS_DEPOSIT', 'DEPOT_EPARGNE', 'APPROVISIONNEMENT', 'TRANSFER_IN',
    'BLOCKED_DEPOSIT', 'VERSEMENT_COMPTE_BLOQUE',
  ];
  return entreeTypes.some((t) => type.toUpperCase().includes(t));
}

function getOperationLabel(type?: string): string {
  if (!type) return 'Opération';
  const labels: Record<string, string> = {
    DEPOSIT: 'Dépôt',
    WITHDRAWAL: 'Retrait',
    ENCAISSEMENT: 'Encaissement',
    DECAISSEMENT: 'Décaissement',
    LOAN_REPAYMENT: 'Remboursement Prêt',
    CREDIT_DISBURSEMENT: 'Décaissement Crédit',
    TONTINE_COTISATION: 'Cotisation Tontine',
    TONTINE_CONTRIBUTION: 'Cotisation Tontine',
    TONTINE_DISTRIBUTION: 'Distribution Tontine',
    SAVINGS_DEPOSIT: 'Dépôt Épargne',
    SAVINGS_WITHDRAWAL: 'Retrait Épargne',
    BLOCKED_DEPOSIT: 'Versement Compte Bloqué',
    BLOCKED_WITHDRAWAL: 'Retrait Compte Bloqué',
    APPROVISIONNEMENT: 'Approvisionnement',
    TRANSFER_IN: 'Transfert Entrant',
    TRANSFER_OUT: 'Transfert Sortant',
    OUVERTURE: 'Ouverture Session',
    FERMETURE: 'Fermeture Session',
  };
  for (const [key, label] of Object.entries(labels)) {
    if (type.toUpperCase().includes(key)) return label;
  }
  return type.replace(/_/g, ' ');
}

// ============================================================================
// PDF HEADER COMMON
// ============================================================================

function addPDFHeader(doc: jsPDF, title: string, subtitle: string, config: ExportConfig) {
  const y = addSharedLogoHeader(doc, {
    title,
    subtitle,
    dateRight: `Généré le ${formatDateTime(new Date())}`,
    appName: config.companyName,
  });

  // Period info below header
  if (config.dateDebut && config.dateFin) {
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.textLight);
    doc.text(`Période: du ${formatDate(config.dateDebut)} au ${formatDate(config.dateFin)}`, 14, y);
    return y + 10;
  }

  return y;
}

function addPDFFooter(doc: jsPDF, config: ExportConfig) {
  addSharedLogoFooter(doc, undefined, config.companyName);
}

// ============================================================================
// JOURNAL EXPORT
// ============================================================================

interface JournalEntry {
  id: string;
  date: Date;
  type: 'OUVERTURE' | 'OPERATION' | 'FERMETURE';
  operationType?: string;
  description: string;
  reference?: string;
  client?: string | null;
  caissier?: string;
  montant: number;
  sens: 'ENTREE' | 'SORTIE' | 'NEUTRE';
  soldeProgressif: number;
}

function buildJournalEntries(sessions: SessionCaisse[], transactions: CaisseTransaction[]): JournalEntry[] {
  const entries: JournalEntry[] = [];
  let soldeProgressif = 0;

  const sortedSessions = [...sessions].sort((a, b) => {
    const dateA = new Date(a.openedAt || '');
    const dateB = new Date(b.openedAt || '');
    return dateA.getTime() - dateB.getTime();
  });

  for (const session of sortedSessions) {
    const sessionOpenDate = new Date(session.openedAt || '');
    const soldeInitial = Number(session.soldeInitial || session.montantOuverture || 0);
    const caissierName = session.caissierNom || 'Caissier';

    soldeProgressif = soldeInitial;
    entries.push({
      id: `open-${session.id}`,
      date: sessionOpenDate,
      type: 'OUVERTURE',
      description: 'Ouverture de session',
      montant: soldeInitial,
      sens: 'NEUTRE',
      soldeProgressif,
      caissier: caissierName,
      client: null,
    });

    const sessionTransactions = transactions
      .filter((t) => t.sessionId === session.id)
      .sort((a, b) => {
        const dateA = new Date(a.createdAt || '');
        const dateB = new Date(b.createdAt || '');
        return dateA.getTime() - dateB.getTime();
      });

    for (const tx of sessionTransactions) {
      const montant = Number(tx.montant);
      const typeOp = tx.typeOperation || '';
      const isEntree = isEntreeOperation(typeOp);

      if (isEntree) soldeProgressif += montant;
      else soldeProgressif -= montant;

      const hasClient = tx.clientNom || tx.clientPrenom;
      const clientName = hasClient ? `${tx.clientPrenom || ''} ${tx.clientNom || ''}`.trim() : undefined;

      entries.push({
        id: tx.id,
        date: new Date(tx.createdAt || ''),
        type: 'OPERATION',
        operationType: typeOp,
        description: tx.description || getOperationLabel(typeOp),
        reference: tx.reference,
        client: clientName,
        montant,
        sens: isEntree ? 'ENTREE' : 'SORTIE',
        soldeProgressif,
      });
    }

    const sessionStatus = session.computedStatus || computeSessionStatus(session);
    if (sessionStatus === 'CLOSED' && (session.closedAt)) {
      const soldeFinal = Number(session.soldeReel || soldeProgressif);
      entries.push({
        id: `close-${session.id}`,
        date: new Date(session.closedAt || ''),
        type: 'FERMETURE',
        description: 'Fermeture de session',
        montant: soldeFinal,
        sens: 'NEUTRE',
        soldeProgressif: soldeFinal,
        caissier: caissierName,
        client: null,
      });
    }
  }

  return entries.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function exportJournalPDF(
  sessions: SessionCaisse[],
  transactions: CaisseTransaction[],
  config: Partial<ExportConfig> = {}
) {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  // Format paysage pour plus d'espace
  const doc = new jsPDF({ orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();

  const entries = buildJournalEntries(sessions, transactions);
  const operations = entries.filter(e => e.type === 'OPERATION');
  const totalEntrees = operations.filter(e => e.sens === 'ENTREE').reduce((s, e) => s + e.montant, 0);
  const totalSorties = operations.filter(e => e.sens === 'SORTIE').reduce((s, e) => s + e.montant, 0);

  let y = addPDFHeader(doc, 'Journal de Caisse', 'Historique détaillé des opérations', fullConfig);

  // Summary cards - ajustés pour le format paysage
  const cardWidth = 85;
  const cardHeight = 22;
  const cardY = y;
  const cardGap = 10;

  // Card 1: Entrées
  doc.setFillColor(16, 185, 129);
  doc.roundedRect(14, cardY, cardWidth, cardHeight, 3, 3, 'F');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.text('TOTAL ENTRÉES', 20, cardY + 9);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(`+${formatNumber(totalEntrees)} ${currencySymbol()}`, 20, cardY + 18);

  // Card 2: Sorties
  doc.setFillColor(244, 63, 94);
  doc.roundedRect(14 + cardWidth + cardGap, cardY, cardWidth, cardHeight, 3, 3, 'F');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.text('TOTAL SORTIES', 20 + cardWidth + cardGap, cardY + 9);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(`-${formatNumber(totalSorties)} ${currencySymbol()}`, 20 + cardWidth + cardGap, cardY + 18);

  // Card 3: Opérations
  doc.setFillColor(6, 182, 212);
  doc.roundedRect(14 + (cardWidth + cardGap) * 2, cardY, cardWidth, cardHeight, 3, 3, 'F');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.text('OPÉRATIONS', 20 + (cardWidth + cardGap) * 2, cardY + 9);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(operations.length.toString(), 20 + (cardWidth + cardGap) * 2, cardY + 18);

  y = cardY + cardHeight + 12;

  // Table avec largeurs optimisées pour le format paysage
  const tableData = entries.map(entry => {
    const isSession = entry.type === 'OUVERTURE' || entry.type === 'FERMETURE';
    return [
      formatDateTime(entry.date),
      isSession ? entry.type : getOperationLabel(entry.operationType),
      entry.client || entry.caissier || '—',
      entry.reference || '—',
      entry.sens === 'ENTREE' ? `+${formatNumber(entry.montant)}` : '',
      entry.sens === 'SORTIE' ? `-${formatNumber(entry.montant)}` : '',
      formatNumber(entry.soldeProgressif),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['Date & Heure', 'Opération', 'Client / Caissier', 'Référence', `Entrée (${currencySymbol()})`, `Sortie (${currencySymbol()})`, `Solde (${currencySymbol()})`]],
    body: tableData,
    theme: 'striped',
    styles: {
      fontSize: 8,
      cellPadding: 3,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: COLORS.secondary,
      textColor: 255,
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 38, halign: 'center' },
      1: { cellWidth: 40 },
      2: { cellWidth: 45 },
      3: { cellWidth: 50 },
      4: { cellWidth: 35, halign: 'right', textColor: COLORS.success, fontStyle: 'bold' },
      5: { cellWidth: 35, halign: 'right', textColor: COLORS.danger, fontStyle: 'bold' },
      6: { cellWidth: 35, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      // Highlight session rows
      const rowData = data.row.raw as string[];
      if (rowData && (rowData[1] === 'OUVERTURE' || rowData[1] === 'FERMETURE')) {
        data.cell.styles.fillColor = [241, 245, 249]; // slate-100
        data.cell.styles.fontStyle = 'bold';
      }
    },
    margin: { left: 14, right: 14 },
  });

  addPDFFooter(doc, fullConfig);
  doc.save(`journal_caisse_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportJournalExcel(
  sessions: SessionCaisse[],
  transactions: CaisseTransaction[],
  config: Partial<ExportConfig> = {}
) {
  const entries = buildJournalEntries(sessions, transactions);

  const data = entries.map(entry => ({
    'Date': formatDateTime(entry.date),
    'Type': entry.type,
    'Opération': getOperationLabel(entry.operationType) || entry.type,
    'Description': entry.description,
    'Client/Caissier': entry.client || entry.caissier || '',
    'Référence': entry.reference || '',
    'Sens': entry.sens,
    'Montant': entry.montant,
    'Solde': entry.soldeProgressif,
  }));

  return downloadWorkbook(`journal_caisse_${new Date().toISOString().slice(0, 10)}.xlsx`, [{
    name: 'Journal de Caisse',
    rows: data,
    columnWidths: [18, 12, 20, 35, 25, 25, 10, 15, 15],
  }]);
}

// ============================================================================
// SYNTHESE EXPORT
// ============================================================================

export function exportSynthesePDF(
  sessions: SessionCaisse[],
  transactions: CaisseTransaction[],
  config: Partial<ExportConfig> = {}
) {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const doc = new jsPDF();

  // Calculate metrics
  const totalEntrees = transactions
    .filter(t => isEntreeOperation(t.typeOperation || ''))
    .reduce((sum, t) => sum + Number(t.montant), 0);

  const totalSorties = transactions
    .filter(t => !isEntreeOperation(t.typeOperation || ''))
    .reduce((sum, t) => sum + Number(t.montant), 0);

  const soldeNet = totalEntrees - totalSorties;
  const sessionsTerminees = sessions.filter(s =>
    (s.computedStatus || computeSessionStatus(s)) === 'CLOSED'
  ).length;
  const totalEcarts = sessions.reduce((sum, s) => sum + Math.abs(Number(s.ecart || 0)), 0);
  const tauxConformite = sessions.length > 0
    ? (sessions.filter(s => !s.ecart || Number(s.ecart) === 0).length / sessions.length) * 100
    : 100;

  let y = addPDFHeader(doc, 'Synthèse Financière', 'Vue d\'ensemble des performances', fullConfig);

  // KPI Cards - 2x2 grid
  const cardWidth = 88;
  const cardHeight = 30;
  const gap = 6;

  // Row 1
  // Card: Total Entrées
  doc.setFillColor(16, 185, 129);
  doc.roundedRect(14, y, cardWidth, cardHeight, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('TOTAL ENTRÉES', 20, y + 10);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`+${formatNumber(totalEntrees)} ${currencySymbol()}`, 20, y + 22);

  // Card: Total Sorties
  doc.setFillColor(244, 63, 94);
  doc.roundedRect(14 + cardWidth + gap, y, cardWidth, cardHeight, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('TOTAL SORTIES', 20 + cardWidth + gap, y + 10);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`-${formatNumber(totalSorties)} ${currencySymbol()}`, 20 + cardWidth + gap, y + 22);

  y += cardHeight + gap;

  // Row 2
  // Card: Solde Net
  const soldeColor = soldeNet >= 0 ? COLORS.primary : COLORS.warning;
  doc.setFillColor(...soldeColor);
  doc.roundedRect(14, y, cardWidth, cardHeight, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('SOLDE NET', 20, y + 10);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`${soldeNet >= 0 ? '+' : ''}${formatNumber(soldeNet)} ${currencySymbol()}`, 20, y + 22);

  // Card: Conformité
  const confColor = tauxConformite >= 95 ? COLORS.success : tauxConformite >= 80 ? COLORS.warning : COLORS.danger;
  doc.setFillColor(...confColor);
  doc.roundedRect(14 + cardWidth + gap, y, cardWidth, cardHeight, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('TAUX CONFORMITÉ', 20 + cardWidth + gap, y + 10);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`${tauxConformite.toFixed(1)}%`, 20 + cardWidth + gap, y + 22);

  y += cardHeight + 15;

  // Stats table
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.text);
  doc.text('Statistiques détaillées', 14, y);
  y += 8;

  const statsData = [
    ['Nombre de sessions', sessions.length.toString()],
    ['Sessions terminées', sessionsTerminees.toString()],
    ['Sessions en cours', (sessions.length - sessionsTerminees).toString()],
    ['Nombre d\'opérations', transactions.length.toString()],
    ['Total des écarts', formatMoney(totalEcarts)],
    ['Moyenne entrées/session', sessions.length > 0 ? formatMoney(totalEntrees / sessions.length) : '—'],
    ['Moyenne sorties/session', sessions.length > 0 ? formatMoney(totalSorties / sessions.length) : '—'],
  ];

  autoTable(doc, {
    startY: y,
    head: [['Indicateur', 'Valeur']],
    body: statsData,
    theme: 'striped',
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: COLORS.secondary, textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 100 },
      1: { halign: 'right', cellWidth: 80 },
    },
    margin: { left: 14, right: 14 },
  });

  // Operation breakdown by type
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.text);
  doc.text('Répartition par type d\'opération', 14, y);
  y += 8;

  const byType: Record<string, { count: number; total: number }> = {};
  for (const tx of transactions) {
    const type = getOperationLabel(tx.typeOperation);
    if (!byType[type]) byType[type] = { count: 0, total: 0 };
    byType[type].count++;
    byType[type].total += Number(tx.montant);
  }

  const typeData = Object.entries(byType)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([type, data]) => [
      type,
      data.count.toString(),
      formatMoney(data.total),
      `${((data.total / (totalEntrees + totalSorties)) * 100).toFixed(1)}%`,
    ]);

  autoTable(doc, {
    startY: y,
    head: [['Type d\'opération', 'Nombre', 'Montant total', '% du volume']],
    body: typeData,
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: COLORS.secondary, textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { halign: 'center', cellWidth: 30 },
      2: { halign: 'right', cellWidth: 50 },
      3: { halign: 'right', cellWidth: 40 },
    },
    margin: { left: 14, right: 14 },
  });

  addPDFFooter(doc, fullConfig);
  doc.save(`synthese_financiere_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportSyntheseExcel(
  sessions: SessionCaisse[],
  transactions: CaisseTransaction[],
  config: Partial<ExportConfig> = {}
) {
  // Sheet 1: KPIs
  const totalEntrees = transactions
    .filter(t => isEntreeOperation(t.typeOperation || ''))
    .reduce((sum, t) => sum + Number(t.montant), 0);
  const totalSorties = transactions
    .filter(t => !isEntreeOperation(t.typeOperation || ''))
    .reduce((sum, t) => sum + Number(t.montant), 0);

  const kpiData = [
    { 'Indicateur': 'Total Entrées', 'Valeur': totalEntrees },
    { 'Indicateur': 'Total Sorties', 'Valeur': totalSorties },
    { 'Indicateur': 'Solde Net', 'Valeur': totalEntrees - totalSorties },
    { 'Indicateur': 'Nombre Sessions', 'Valeur': sessions.length },
    { 'Indicateur': 'Nombre Opérations', 'Valeur': transactions.length },
  ];

  // Sheet 2: Par type
  const byType: Record<string, { count: number; total: number }> = {};
  for (const tx of transactions) {
    const type = getOperationLabel(tx.typeOperation);
    if (!byType[type]) byType[type] = { count: 0, total: 0 };
    byType[type].count++;
    byType[type].total += Number(tx.montant);
  }

  const typeData = Object.entries(byType).map(([type, data]) => ({
    'Type': type,
    'Nombre': data.count,
    'Montant Total': data.total,
  }));

  // Sheet 3: Par jour
  const byDay: Record<string, { entrees: number; sorties: number; count: number }> = {};
  for (const tx of transactions) {
    const date = formatDate(tx.createdAt || '');
    if (!byDay[date]) byDay[date] = { entrees: 0, sorties: 0, count: 0 };
    const isEntree = isEntreeOperation(tx.typeOperation || '');
    if (isEntree) byDay[date].entrees += Number(tx.montant);
    else byDay[date].sorties += Number(tx.montant);
    byDay[date].count++;
  }

  const dayData = Object.entries(byDay).map(([date, data]) => ({
    'Date': date,
    'Entrées': data.entrees,
    'Sorties': data.sorties,
    'Solde': data.entrees - data.sorties,
    'Opérations': data.count,
  }));

  return downloadWorkbook(`synthese_financiere_${new Date().toISOString().slice(0, 10)}.xlsx`, [
    { name: 'KPIs', rows: kpiData },
    { name: 'Par Type', rows: typeData },
    { name: 'Par Jour', rows: dayData },
  ]);
}

// ============================================================================
// ECARTS EXPORT
// ============================================================================

interface DiscrepancyEntry {
  date: Date;
  caissier: string;
  soldeTheorique: number;
  soldeReel: number;
  ecart: number;
  ecartPercent: number;
  status: 'ok' | 'warning' | 'critical';
  justification?: string;
}

function buildDiscrepancies(sessions: SessionCaisse[]): DiscrepancyEntry[] {
  return sessions
    .filter(s => {
      const status = s.computedStatus || computeSessionStatus(s);
      return status === 'CLOSED' || status === 'CLOSING_VALIDATION';
    })
    .map(session => {
      const soldeTheorique = Number(
        session.soldeTheorique || session.montantFermetureTheorique || 0
      );
      const soldeReel = Number(
        session.soldeReel || session.montantFermetureDeclare || 0
      );
      const ecart = Number(session.ecart || 0) || (soldeReel - soldeTheorique);
      const ecartPercent = soldeTheorique !== 0 ? (ecart / soldeTheorique) * 100 : 0;

      let status: 'ok' | 'warning' | 'critical' = 'ok';
      if (Math.abs(ecart) > 0 && Math.abs(ecart) <= 5000) status = 'warning';
      if (Math.abs(ecart) > 5000) status = 'critical';

      return {
        date: new Date(session.closedAt || session.openedAt || ''),
        caissier: session.caissierNom || 'Non renseigné',
        soldeTheorique,
        soldeReel,
        ecart,
        ecartPercent,
        status,
        justification: session.ecartJustification,
      };
    })
    .sort((a, b) => Math.abs(b.ecart) - Math.abs(a.ecart));
}

export function exportEcartsPDF(
  sessions: SessionCaisse[],
  config: Partial<ExportConfig> = {}
) {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  // Format paysage pour plus d'espace
  const doc = new jsPDF({ orientation: 'landscape' });

  const discrepancies = buildDiscrepancies(sessions);

  // Stats
  const withDiscrepancy = discrepancies.filter(d => d.ecart !== 0);
  const positiveEcarts = discrepancies.filter(d => d.ecart > 0);
  const negativeEcarts = discrepancies.filter(d => d.ecart < 0);
  const totalEcartPositif = positiveEcarts.reduce((sum, d) => sum + d.ecart, 0);
  const totalEcartNegatif = negativeEcarts.reduce((sum, d) => sum + Math.abs(d.ecart), 0);
  const tauxConformite = discrepancies.length > 0
    ? ((discrepancies.length - withDiscrepancy.length) / discrepancies.length) * 100
    : 100;

  let y = addPDFHeader(doc, 'Rapport des Écarts', 'Analyse de conformité des sessions', fullConfig);

  // KPI Cards - ajustés pour le format paysage
  const cardWidth = 65;
  const cardHeight = 28;
  const gap = 8;

  // Card 1: Conformité
  const confColor = tauxConformite >= 95 ? COLORS.success : tauxConformite >= 80 ? COLORS.warning : COLORS.danger;
  doc.setFillColor(...confColor);
  doc.roundedRect(14, y, cardWidth, cardHeight, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('CONFORMITÉ', 20, y + 10);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`${tauxConformite.toFixed(1)}%`, 20, y + 22);

  // Card 2: Excédents
  doc.setFillColor(...COLORS.success);
  doc.roundedRect(14 + cardWidth + gap, y, cardWidth, cardHeight, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('EXCÉDENTS', 20 + cardWidth + gap, y + 10);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(`+${formatNumber(totalEcartPositif)} ${currencySymbol()}`, 20 + cardWidth + gap, y + 22);

  // Card 3: Manquants
  doc.setFillColor(...COLORS.danger);
  doc.roundedRect(14 + (cardWidth + gap) * 2, y, cardWidth, cardHeight, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('MANQUANTS', 20 + (cardWidth + gap) * 2, y + 10);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(`-${formatNumber(totalEcartNegatif)} ${currencySymbol()}`, 20 + (cardWidth + gap) * 2, y + 22);

  // Card 4: Sessions
  doc.setFillColor(...COLORS.secondary);
  doc.roundedRect(14 + (cardWidth + gap) * 3, y, cardWidth, cardHeight, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('SESSIONS ANALYSÉES', 20 + (cardWidth + gap) * 3, y + 10);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(discrepancies.length.toString(), 20 + (cardWidth + gap) * 3, y + 22);

  y += cardHeight + 12;

  // Detail table
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.text);
  doc.text('Détail des sessions', 14, y);
  y += 8;

  const tableData = discrepancies.map(d => {
    const statusLabel = d.status === 'ok' ? 'OK' : d.status === 'warning' ? 'Mineur' : 'Critique';
    return [
      formatDateTime(d.date),
      d.caissier,
      formatNumber(d.soldeTheorique),
      formatNumber(d.soldeReel),
      `${d.ecart > 0 ? '+' : ''}${formatNumber(d.ecart)}`,
      `${d.ecartPercent > 0 ? '+' : ''}${d.ecartPercent.toFixed(2)}%`,
      statusLabel,
      d.justification || (d.ecart !== 0 ? 'Non justifié' : '—'),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['Date & Heure', 'Caissier', `Théorique (${currencySymbol()})`, `Réel (${currencySymbol()})`, `Écart (${currencySymbol()})`, '%', 'Status', 'Justification']],
    body: tableData,
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: COLORS.secondary, textColor: 255, fontStyle: 'bold', halign: 'center', fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 38, halign: 'center' },
      1: { cellWidth: 40 },
      2: { halign: 'right', cellWidth: 35, fontStyle: 'bold' },
      3: { halign: 'right', cellWidth: 35, fontStyle: 'bold' },
      4: { halign: 'right', cellWidth: 35, fontStyle: 'bold' },
      5: { halign: 'right', cellWidth: 20 },
      6: { halign: 'center', cellWidth: 20 },
      7: { cellWidth: 55 },
    },
    didParseCell: (data) => {
      // Color code the écart column
      if (data.column.index === 4 && data.section === 'body') {
        const value = parseFloat(String(data.cell.raw).replace(/[^\d-]/g, ''));
        if (value > 0) data.cell.styles.textColor = COLORS.success;
        else if (value < 0) data.cell.styles.textColor = COLORS.danger;
      }
      // Color code the status column
      if (data.column.index === 6 && data.section === 'body') {
        const status = data.cell.raw;
        if (status === 'OK') data.cell.styles.textColor = COLORS.success;
        else if (status === 'Mineur') data.cell.styles.textColor = COLORS.warning;
        else if (status === 'Critique') data.cell.styles.textColor = COLORS.danger;
      }
    },
    margin: { left: 14, right: 14 },
  });

  addPDFFooter(doc, fullConfig);
  doc.save(`rapport_ecarts_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportEcartsExcel(
  sessions: SessionCaisse[],
  config: Partial<ExportConfig> = {}
) {
  const discrepancies = buildDiscrepancies(sessions);

  const data = discrepancies.map(d => ({
    'Date': formatDateTime(d.date),
    'Caissier': d.caissier,
    'Solde Théorique': d.soldeTheorique,
    'Solde Réel': d.soldeReel,
    'Écart': d.ecart,
    'Écart %': d.ecartPercent,
    'Status': d.status === 'ok' ? 'OK' : d.status === 'warning' ? 'Mineur' : 'Critique',
    'Justification': d.justification || '',
  }));

  return downloadWorkbook(`rapport_ecarts_${new Date().toISOString().slice(0, 10)}.xlsx`, [{
    name: 'Rapport Écarts',
    rows: data,
    columnWidths: [18, 20, 15, 15, 12, 10, 10, 40],
  }]);
}
