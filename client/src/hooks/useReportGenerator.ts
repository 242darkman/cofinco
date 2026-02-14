import { useState, useCallback } from 'react';
import { Users, Wallet, PiggyBank, UsersRound, LucideIcon } from 'lucide-react';
import { useBranding } from '../contexts/BrandingContext';
import { requestListAll } from '../lib/api-client';
import { addPdfLogoHeader, addPdfLogoFooter } from '../lib/pdf-logo';
// P4.1: Lazy-load heavy export libraries (saves ~650KB on initial bundle)
import { loadPDFLibraries, loadExcelLibrary } from '../lib/lazy-export';

// ============================================================================
// TYPES
// ============================================================================

export interface ReportType {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

interface ReportConfig {
  title: string;
  columns: string[];
  /** Formatted string values for PDF / CSV / Print */
  getRowValues: (item: any) => string[];
  /** Raw values for Excel (numbers stay numbers) */
  getRawValues: (item: any) => any[];
  /** Summary KPIs for the report */
  getSummary: (data: any[]) => { label: string; value: string }[];
  /** Field used for client-side date-range filtering */
  dateField: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const reportTypes: ReportType[] = [
  { id: 'clients', label: 'Rapport Clients', icon: Users, description: 'Liste complète des clients avec statistiques' },
  { id: 'credits', label: 'Rapport Crédits', icon: Wallet, description: 'État des crédits et remboursements' },
  { id: 'epargnes', label: 'Rapport Épargnes', icon: PiggyBank, description: 'Soldes et mouvements d\'épargne' },
  { id: 'tontines', label: 'Rapport Tontines', icon: UsersRound, description: 'Activité des groupes de tontine' },
];

// Constant for HTML print template
const COMPANY_SUBTITLE = 'Établissement de Microfinance';

// ============================================================================
// HELPERS
// ============================================================================

function fmtMoney(val: any): string {
  return `${Number(val || 0).toLocaleString('fr-FR')} FCFA`;
}

function fmtDate(val: any): string {
  if (!val) return '-';
  const d = new Date(val);
  return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('fr-FR');
}

/** Convert ISO date string YYYY-MM-DD → DD/MM/YYYY */
function fmtDateRange(s: string): string {
  if (!s) return '-';
  const [y, m, d] = s.split('-');
  return d && m && y ? `${d}/${m}/${y}` : s;
}

function clientFullName(item: any): string {
  const p = item.clients?.prenom || '';
  const n = item.clients?.nom || '';
  return (p + ' ' + n).trim() || '-';
}

function translateStatut(s: string | null | undefined): string {
  if (!s) return '-';
  const map: Record<string, string> = {
    ACTIVE: 'Actif', INACTIVE: 'Inactif', BLOCKED: 'Bloqué', CLOSED: 'Clôturé',
    PENDING: 'En attente', APPROVED: 'Approuvé', REJECTED: 'Rejeté',
    DISBURSED: 'Décaissé', OVERDUE: 'En retard', PAID_OFF: 'Soldé',
    DEFAULTED: 'Défaillant', WRITTEN_OFF: 'Passé en perte',
    SAVINGS: 'Épargne', CURRENT: 'Courant',
    active: 'Actif', inactive: 'Inactif',
  };
  return map[s] || s;
}

// ============================================================================
// REPORT CONFIGS – one per report type
// ============================================================================

function buildConfigs(): Record<string, ReportConfig> {
  return {
    clients: {
      title: 'Rapport des Clients',
      columns: ['Nom', 'Prénom', 'Téléphone', 'Email', 'Agence', 'Statut'],
      dateField: 'createdAt',
      getRowValues: (i) => [
        i.nom || '-', i.prenom || '-', i.telephone || '-',
        i.email || '-', i.agenceNom || '-', translateStatut(i.statut),
      ],
      getRawValues(i) { return this.getRowValues(i); },
      getSummary: (data) => {
        const actifs = data.filter(d => (d.statut || '').toUpperCase() === 'ACTIVE').length;
        return [
          { label: 'Total clients', value: String(data.length) },
          { label: 'Actifs', value: String(actifs) },
          { label: 'Inactifs', value: String(data.length - actifs) },
        ];
      },
    },

    credits: {
      title: 'Rapport des Crédits',
      columns: ['Client', 'N° Crédit', 'Montant (FCFA)', 'Taux (%)', 'Durée (mois)', 'Date Début', 'Statut'],
      dateField: 'createdAt',
      getRowValues: (i) => [
        clientFullName(i),
        i.numeroCredit || '-',
        fmtMoney(i.montant),
        `${Number(i.taux || 0)}%`,
        String(i.duree || '-'),
        fmtDate(i.dateDebut),
        translateStatut(i.statut),
      ],
      getRawValues: (i) => [
        clientFullName(i),
        i.numeroCredit || '-',
        Number(i.montant || 0),
        Number(i.taux || 0),
        Number(i.duree || 0),
        fmtDate(i.dateDebut),
        translateStatut(i.statut),
      ],
      getSummary: (data) => {
        const total = data.reduce((s, d) => s + Number(d.montant || 0), 0);
        const restant = data.reduce((s, d) => s + Number(d.soldeRestant || 0), 0);
        const enRetard = data.filter(d => d.statut === 'OVERDUE').length;
        return [
          { label: 'Total crédits', value: String(data.length) },
          { label: 'Montant total', value: fmtMoney(total) },
          { label: 'Solde restant', value: fmtMoney(restant) },
          { label: 'En retard', value: String(enRetard) },
        ];
      },
    },

    epargnes: {
      title: 'Rapport des Épargnes',
      columns: ['N° Compte', 'Client', 'Solde (FCFA)', 'Type', 'Taux (%)', 'Statut'],
      dateField: 'createdAt',
      getRowValues: (i) => [
        i.numeroCompte || '-',
        clientFullName(i),
        fmtMoney(i.soldeCourant ?? i.solde),
        translateStatut(i.typeCompte),
        `${Number(i.produit?.tauxInteret ?? 0)}%`,
        translateStatut(i.statut),
      ],
      getRawValues: (i) => [
        i.numeroCompte || '-',
        clientFullName(i),
        Number(i.soldeCourant ?? i.solde ?? 0),
        translateStatut(i.typeCompte),
        Number(i.produit?.tauxInteret ?? 0),
        translateStatut(i.statut),
      ],
      getSummary: (data) => {
        const totalSolde = data.reduce((s, d) => s + Number(d.soldeCourant ?? d.solde ?? 0), 0);
        const actifs = data.filter(d => (d.statut || '').toUpperCase() === 'ACTIVE').length;
        return [
          { label: 'Total comptes', value: String(data.length) },
          { label: 'Solde global', value: fmtMoney(totalSolde) },
          { label: 'Comptes actifs', value: String(actifs) },
        ];
      },
    },

    tontines: {
      title: 'Rapport des Tontines',
      columns: ['Nom', 'Type', 'Cotisation (FCFA)', 'Fréquence', 'Membres', 'Statut'],
      dateField: 'createdAt',
      getRowValues: (i) => [
        i.nom || '-',
        i.typeDistribution || '-',
        fmtMoney(i.montantCotisation),
        i.frequence || '-',
        `${i.nombreMembresActuel ?? i.membresActuels ?? 0}/${i.nombreMembres ?? '?'}`,
        translateStatut(i.statut),
      ],
      getRawValues(i) { return this.getRowValues(i); },
      getSummary: (data) => {
        const totalCot = data.reduce((s, d) => s + Number(d.montantCotisation || 0), 0);
        const totalM = data.reduce((s, d) => s + Number(d.nombreMembresActuel ?? d.membresActuels ?? 0), 0);
        return [
          { label: 'Total tontines', value: String(data.length) },
          { label: 'Cotisation cumulée', value: fmtMoney(totalCot) },
          { label: 'Total membres', value: String(totalM) },
          { label: 'Actives', value: String(data.filter(d => d.statut === 'ACTIVE').length) },
        ];
      },
    },
  };
}

// ============================================================================
// HOOK
// ============================================================================

export function useReportGenerator() {
  const { branding } = useBranding();
  const COMPANY_NAME = branding.appName;
  const [reportType, setReportType] = useState('clients');
  const [format, setFormat] = useState<'pdf' | 'excel' | 'csv'>('pdf');
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    status: 'all',
    segment: 'all',
    includeTransactions: true,
    includeStats: true,
  });
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // ── Endpoint mapping ──────────────────────────────────────────────────────
  const endpoints: Record<string, string> = {
    clients: '/api/clients',
    credits: '/api/credits',
    epargnes: '/api/comptes',       // ← fixed: was /api/epargne (404)
    tontines: '/api/tontines',
  };

  const normalizeApiPath = (ep: string) => ep.startsWith('/api/') ? ep.slice(4) : ep;

  // ── Client-side date-range filtering ──────────────────────────────────────
  const filterByDateRange = useCallback((data: any[], dateField: string) => {
    if (!dateRange.start && !dateRange.end) return data;
    const start = dateRange.start ? new Date(dateRange.start + 'T00:00:00') : null;
    const end = dateRange.end ? new Date(dateRange.end + 'T23:59:59') : null;
    return data.filter((item) => {
      const raw = item[dateField] || item.createdAt || item.dateDebut;
      if (!raw) return true;
      const d = new Date(raw);
      if (isNaN(d.getTime())) return true;
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    });
  }, [dateRange]);

  const applyClientFilters = useCallback((data: any[]) => {
    let out = data;
    if (filters.status !== 'all') out = out.filter(c => c.statut === filters.status);
    if (filters.segment !== 'all') out = out.filter(c => c.segment === filters.segment);
    return out;
  }, [filters]);

  // ── Data fetching ─────────────────────────────────────────────────────────
  const fetchReportData = useCallback(async (type?: string) => {
    const t = type || reportType;
    const endpoint = endpoints[t];
    if (!endpoint) return [];
    try {
      const params: Record<string, string> = {};
      if (t === 'epargnes') params.limit = '5000';
      const data = await requestListAll<any>(normalizeApiPath(endpoint), params);
      const cfg = buildConfigs()[t];
      let filtered = filterByDateRange(data, cfg.dateField);
      if (t === 'clients') filtered = applyClientFilters(filtered);
      return filtered;
    } catch (err) {
      console.error('Erreur récupération données:', err);
      return [];
    }
  }, [reportType, filterByDateRange, applyClientFilters]);

  // ── Preview ───────────────────────────────────────────────────────────────
  const loadPreview = async (type: string) => {
    setLoadingPreview(true);
    setReportType(type);
    try {
      setPreviewData(await fetchReportData(type));
    } catch { setPreviewData([]); }
    finally { setLoadingPreview(false); }
  };

  const getReportConfig = () => buildConfigs()[reportType] || buildConfigs().clients;
  const getPreviewColumns = () => getReportConfig().columns.slice(0, 5);
  const getPreviewRow = (item: any) => {
    if (!item) return [];
    return getReportConfig().getRowValues(item).slice(0, 5);
  };

  // ═════════════════════════════════════════════════════════════════════════
  // PDF GENERATION
  // ═════════════════════════════════════════════════════════════════════════

  const generatePDF = async () => {
    setLoading(true);
    try {
      // P4.1: Lazy-load PDF libraries on demand
      const { jsPDF, autoTable } = await loadPDFLibraries();

      const data = await fetchReportData();
      const config = getReportConfig();
      const doc = new jsPDF();
      const W = doc.internal.pageSize.width;
      const H = doc.internal.pageSize.height;

      // ── Header ──
      const startY = addPdfLogoHeader(doc, {
        title: config.title,
        subtitle: `Période: ${fmtDateRange(dateRange.start)} — ${fmtDateRange(dateRange.end)} | ${data.length} enregistrement${data.length !== 1 ? 's' : ''}`,
        dateRight: `Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`,
        appName: COMPANY_NAME,
      });

      // ── Table ──
      autoTable(doc, {
        head: [config.columns],
        body: data.map(item => config.getRowValues(item)),
        startY,
        theme: 'striped',
        headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold', fontSize: 8, cellPadding: 4 },
        bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59], cellPadding: 3 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { top: startY, left: 14, right: 14 },
      });

      // ── Summary ──
      if (filters.includeStats) {
        const finalY: number = (doc as any).lastAutoTable?.finalY || 100;
        const summary = config.getSummary(data);
        const boxH = 14 + summary.length * 8;
        if (finalY + boxH + 20 < H) {
          doc.setFillColor(241, 245, 249);
          doc.roundedRect(14, finalY + 10, W - 28, boxH, 3, 3, 'F');
          doc.setDrawColor(203, 213, 225);
          doc.roundedRect(14, finalY + 10, W - 28, boxH, 3, 3, 'S');

          doc.setFontSize(10);
          doc.setTextColor(15, 23, 42);
          doc.setFont('helvetica', 'bold');
          doc.text('Résumé', 20, finalY + 20);

          doc.setFontSize(8);
          doc.setTextColor(51, 65, 85);
          summary.forEach((s, idx) => {
            const y = finalY + 28 + idx * 8;
            doc.setFont('helvetica', 'normal');
            doc.text(`${s.label}: `, 20, y);
            doc.setFont('helvetica', 'bold');
            doc.text(s.value, 20 + doc.getTextWidth(`${s.label}: `), y);
          });
        }
      }

      // ── Footer ──
      addPdfLogoFooter(doc, config.title, COMPANY_NAME);

      doc.save(`rapport_${reportType}_${dateRange.start}_${dateRange.end}.pdf`);
    } finally { setLoading(false); }
  };

  // ═════════════════════════════════════════════════════════════════════════
  // EXCEL GENERATION
  // ═════════════════════════════════════════════════════════════════════════

  const generateExcel = async () => {
    setLoading(true);
    try {
      // P4.1: Lazy-load Excel library on demand
      const XLSX = await loadExcelLibrary();

      const data = await fetchReportData();
      const config = getReportConfig();

      const rows = data.map(item => {
        const vals = config.getRawValues(item);
        const row: Record<string, any> = {};
        config.columns.forEach((col, i) => { row[col] = vals[i] ?? '-'; });
        return row;
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = config.columns.map(col => {
        const max = rows.reduce((m, r) => Math.max(m, String(r[col] ?? '').length), col.length);
        return { wch: Math.min(max + 2, 40) };
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, config.title.substring(0, 31));

      if (filters.includeStats) {
        const summaryRows = config.getSummary(data).map(s => ({ Indicateur: s.label, Valeur: s.value }));
        summaryRows.push(
          { Indicateur: 'Période', Valeur: `${fmtDateRange(dateRange.start)} — ${fmtDateRange(dateRange.end)}` },
          { Indicateur: 'Généré le', Valeur: new Date().toLocaleDateString('fr-FR') },
        );
        const sws = XLSX.utils.json_to_sheet(summaryRows);
        sws['!cols'] = [{ wch: 30 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(wb, sws, 'Résumé');
      }

      XLSX.writeFile(wb, `rapport_${reportType}_${dateRange.start}_${dateRange.end}.xlsx`);
    } finally { setLoading(false); }
  };

  // ═════════════════════════════════════════════════════════════════════════
  // CSV GENERATION
  // ═════════════════════════════════════════════════════════════════════════

  const generateCSV = async () => {
    setLoading(true);
    try {
      const data = await fetchReportData();
      const config = getReportConfig();

      const header = config.columns.join(',');
      const body = data.map(item =>
        config.getRowValues(item).map(v => `"${String(v).replace(/"/g, '""')}"`).join(','),
      ).join('\n');

      // UTF-8 BOM so Excel renders French characters correctly
      const blob = new Blob(['\uFEFF' + header + '\n' + body], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `rapport_${reportType}_${dateRange.start}_${dateRange.end}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally { setLoading(false); }
  };

  // ═════════════════════════════════════════════════════════════════════════
  // PRINT
  // ═════════════════════════════════════════════════════════════════════════

  const printReport = async () => {
    setLoading(true);
    try {
      const data = await fetchReportData();
      const config = getReportConfig();
      const summary = config.getSummary(data);

      const w = window.open('', '_blank');
      if (!w) { alert('Veuillez autoriser les popups pour imprimer'); return; }

      const rows = data.map(item =>
        `<tr>${config.getRowValues(item).map(v => `<td>${v}</td>`).join('')}</tr>`,
      ).join('');

      const summaryHtml = filters.includeStats
        ? `<div class="summary"><h3>Résumé</h3><div class="sg">${summary.map(s => `<div class="si"><span class="sl">${s.label}</span><span class="sv">${s.value}</span></div>`).join('')}</div></div>`
        : '';

      w.document.write(`<!DOCTYPE html><html><head>
<title>${COMPANY_NAME} — ${config.title}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Arial,sans-serif;padding:20px;color:#1e293b}
.hd{background:#0f172a;color:#fff;padding:24px 28px;margin:-20px -20px 24px}
.hd-row{display:flex;justify-content:space-between;align-items:flex-start}
.hd h1{font-size:22px;letter-spacing:.5px}
.hd .sub{font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-top:2px}
.hd h2{font-size:14px;font-weight:500;margin-top:12px;color:#e2e8f0}
.hd .mr{text-align:right;font-size:10px;color:#94a3b8;line-height:1.7}
table{width:100%;border-collapse:collapse;font-size:10px;margin-top:4px}
th{background:#1e40af;color:#fff;padding:8px 10px;text-align:left;font-weight:600;font-size:9px;text-transform:uppercase;letter-spacing:.3px}
td{padding:7px 10px;border-bottom:1px solid #e2e8f0}
tr:nth-child(even){background:#f8fafc}
.summary{background:#f1f5f9;padding:16px 20px;margin-top:24px;border-radius:8px;border:1px solid #cbd5e1}
.summary h3{font-size:13px;margin-bottom:10px;color:#0f172a}
.sg{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}
.si{display:flex;justify-content:space-between;font-size:11px}
.sl{color:#64748b}.sv{font-weight:600;color:#0f172a}
.ft{margin-top:28px;text-align:center;color:#94a3b8;font-size:8px}
@media print{body{padding:0}.hd{margin:0 0 20px;-webkit-print-color-adjust:exact;print-color-adjust:exact}th,tr:nth-child(even),.summary{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<div class="hd"><div class="hd-row"><div>
<h1>${COMPANY_NAME}</h1><div class="sub">${COMPANY_SUBTITLE}</div>
<h2>${config.title}</h2></div>
<div class="mr">Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}<br>
Période: ${fmtDateRange(dateRange.start)} — ${fmtDateRange(dateRange.end)}<br>
${data.length} enregistrement${data.length !== 1 ? 's' : ''}</div></div></div>
<table><thead><tr>${config.columns.map(c => `<th>${c}</th>`).join('')}</tr></thead>
<tbody>${rows}</tbody></table>
${summaryHtml}
<div class="ft">Document confidentiel — Ne pas diffuser — ${COMPANY_NAME} — République du Congo</div>
<script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}</script>
</body></html>`);
      w.document.close();
    } finally { setLoading(false); }
  };

  // ═════════════════════════════════════════════════════════════════════════

  return {
    reportType, setReportType,
    format, setFormat,
    dateRange, setDateRange,
    loading, setLoading,
    filters, setFilters,
    previewData, loadingPreview,
    loadPreview,
    generatePDF, generateExcel, generateCSV, printReport,
    getPreviewColumns, getPreviewRow,
    getReportConfig,
    fetchReportData,
  };
}
