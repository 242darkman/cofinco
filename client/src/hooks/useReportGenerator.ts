import { useState, useCallback } from 'react';
import { Users, Wallet, PiggyBank, UsersRound, ArrowRightLeft, Briefcase, TrendingUp, BookOpen, LucideIcon } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { requestListAll } from '../lib/api-client';

export interface ReportType {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export const reportTypes: ReportType[] = [
  { id: 'clients', label: 'Rapport Clients', icon: Users, description: 'Liste complète des clients avec statistiques' },
  { id: 'credits', label: 'Rapport Crédits', icon: Wallet, description: 'État des crédits et remboursements' },
  { id: 'epargnes', label: 'Rapport Épargnes', icon: PiggyBank, description: 'Soldes et mouvements d\'épargne' },
  { id: 'tontines', label: 'Rapport Tontines', icon: UsersRound, description: 'Activité des groupes de tontine' },
];

export function useReportGenerator() {
  const [reportType, setReportType] = useState('clients');
  const [format, setFormat] = useState<'pdf' | 'excel' | 'csv'>('pdf');
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    status: 'all',
    segment: 'all',
    includeTransactions: true,
    includeStats: true
  });
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const endpoints: Record<string, string> = {
    clients: '/api/clients',
    credits: '/api/credits',
    epargnes: '/api/epargne',
    tontines: '/api/tontines',
  };

  const buildQueryParams = useCallback(() => {
    const params: Record<string, string> = {};
    if (dateRange.start) params.startDate = dateRange.start;
    if (dateRange.end) params.endDate = dateRange.end;
    if (filters.status !== 'all') params.status = filters.status;
    if (filters.segment !== 'all') params.segment = filters.segment;
    return params;
  }, [dateRange, filters]);

  const applyClientFilters = (data: any[]) => {
    let filtered = data;
    if (filters.status !== 'all') {
      filtered = filtered.filter((client) => client.statut === filters.status);
    }
    if (filters.segment !== 'all') {
      filtered = filtered.filter((client) => client.segment === filters.segment);
    }
    return filtered;
  };

  const normalizeApiPath = (endpoint: string) =>
    endpoint.startsWith('/api/') ? endpoint.slice(4) : endpoint;

  const loadPreview = async (type: string) => {
    setLoadingPreview(true);
    setReportType(type);
    try {
      const endpoint = endpoints[type];
      if (!endpoint) {
        setPreviewData([]);
        return;
      }
      const data = await requestListAll<any>(
        normalizeApiPath(endpoint),
        buildQueryParams()
      );
      setPreviewData(type === 'clients' ? applyClientFilters(data) : data);
    } catch (error) {
      console.error('Erreur chargement aperçu:', error);
      setPreviewData([]);
    } finally {
      setLoadingPreview(false);
    }
  };

  const fetchReportData = async () => {
    const endpoint = endpoints[reportType];
    if (!endpoint) return [];
    try {
      const data = await requestListAll<any>(
        normalizeApiPath(endpoint),
        buildQueryParams()
      );
      return reportType === 'clients' ? applyClientFilters(data) : data;
    } catch (error) {
      console.error('Erreur récupération données:', error);
      return [];
    }
  };

  const getReportConfig = () => {
    const configs: Record<string, { columns: string[]; keys: string[]; title: string }> = {
      clients: {
        title: 'Rapport des Clients',
        columns: ['Nom', 'Prénom', 'Téléphone', 'Email', 'Segment', 'Score', 'Statut'],
        keys: ['nom', 'prenom', 'telephone', 'email', 'segment', 'score', 'statut']
      },
      credits: {
        title: 'Rapport des Crédits',
        columns: ['Client', 'Montant (FCFA)', 'Taux (%)', 'Durée (mois)', 'Type', 'Date Début', 'Statut'],
        keys: ['clientId', 'montant', 'taux', 'duree', 'typeCredit', 'dateDebut', 'statut']
      },
      epargnes: {
        title: 'Rapport des Épargnes',
        columns: ['Numéro Compte', 'Client', 'Solde (FCFA)', 'Type', 'Taux (%)', 'Statut'],
        keys: ['numeroCompte', 'clientId', 'solde', 'typeCompte', 'tauxInteret', 'statut']
      },
      tontines: {
        title: 'Rapport des Tontines',
        columns: ['Nom', 'Type', 'Cotisation (FCFA)', 'Fréquence', 'Membres', 'Statut'],
        keys: ['nom', 'type', 'montantCotisation', 'frequence', 'nombreMembres', 'statut']
      }
    };
    return configs[reportType] || configs.clients;
  };

  const getPreviewColumns = () => getReportConfig().columns.slice(0, 5);

  const getPreviewRow = (item: any) => {
    const config = getReportConfig();
    if (!item) {
      return config.keys.slice(0, 5).map(() => '-');
    }
    return config.keys.slice(0, 5).map(key => {
      const val = item[key];
      if (key === 'montant' || key === 'solde' || key === 'montantCotisation') {
        return `${Number(val || 0).toLocaleString('fr-FR')}`;
      }
      if (key === 'dateDebut' && val) {
        return new Date(val).toLocaleDateString('fr-FR');
      }
      return String(val || '-');
    });
  };

  const generatePDF = async () => {
    setLoading(true);
    try {
      const data = await fetchReportData();
      const config = getReportConfig();
      const doc = new jsPDF();

      // Header with branding
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, 0, doc.internal.pageSize.width, 40, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text('COFIN', 14, 20);
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(config.title, 14, 30);

      // Report info
      doc.setFontSize(9);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, 14, 37);
      doc.text(`Période: ${dateRange.start} au ${dateRange.end}`, doc.internal.pageSize.width - 14, 37, { align: 'right' });

      // Table with autoTable
      const tableData = data.map(item => 
        config.keys.map(key => {
          const val = item[key];
          if (key === 'montant' || key === 'solde' || key === 'montantCotisation') {
            return `${Number(val || 0).toLocaleString('fr-FR')} FCFA`;
          }
          if (key === 'dateDebut' && val) {
            return new Date(val).toLocaleDateString('fr-FR');
          }
          return String(val || '-');
        })
      );

      autoTable(doc, {
        head: [config.columns],
        body: tableData,
        startY: 50,
        theme: 'striped',
        headStyles: {
          fillColor: [59, 130, 246], // blue-500
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 9
        },
        bodyStyles: {
          fontSize: 8,
          textColor: [30, 41, 59] // slate-800
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252] // slate-50
        },
        margin: { top: 50, left: 14, right: 14 },
        didDrawPage: (data) => {
          // Footer on each page
          const pageCount = doc.getNumberOfPages();
          doc.setFontSize(8);
          doc.setTextColor(100);
          doc.text(
            `Page ${data.pageNumber} / ${pageCount}`,
            doc.internal.pageSize.width / 2,
            doc.internal.pageSize.height - 10,
            { align: 'center' }
          );
        }
      });

      // Summary section
      const finalY = (doc as any).lastAutoTable?.finalY || 100;
      if (finalY < doc.internal.pageSize.height - 50) {
        doc.setFillColor(241, 245, 249); // slate-100
        doc.roundedRect(14, finalY + 10, doc.internal.pageSize.width - 28, 25, 3, 3, 'F');
        doc.setFontSize(10);
        doc.setTextColor(30, 41, 59);
        doc.setFont('helvetica', 'bold');
        doc.text('Résumé', 20, finalY + 20);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(`Total enregistrements: ${data.length}`, 20, finalY + 28);
      }

      doc.save(`rapport_${reportType}_${dateRange.start}_${dateRange.end}.pdf`);
    } finally {
      setLoading(false);
    }
  };

  const generateExcel = async () => {
    setLoading(true);
    try {
      const data = await fetchReportData();
      const config = getReportConfig();
      
      // Transform data with proper column names
      const formattedData = data.map(item => {
        const row: Record<string, any> = {};
        config.columns.forEach((col, idx) => {
          const key = config.keys[idx];
          let val = item[key];
          if (key === 'montant' || key === 'solde' || key === 'montantCotisation') {
            val = Number(val || 0);
          }
          if (key === 'dateDebut' && val) {
            val = new Date(val).toLocaleDateString('fr-FR');
          }
          row[col] = val || '-';
        });
        return row;
      });

      const ws = XLSX.utils.json_to_sheet(formattedData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, config.title.substring(0, 31));
      XLSX.writeFile(wb, `rapport_${reportType}_${dateRange.start}_${dateRange.end}.xlsx`);
    } finally {
      setLoading(false);
    }
  };

  const generateCSV = async () => {
    setLoading(true);
    try {
      const data = await fetchReportData();
      const config = getReportConfig();
      
      const headers = config.columns.join(',');
      const rows = data.map(item => 
        config.keys.map(key => {
          let val = item[key];
          if (key === 'montant' || key === 'solde' || key === 'montantCotisation') {
            val = Number(val || 0);
          }
          if (key === 'dateDebut' && val) {
            val = new Date(val).toLocaleDateString('fr-FR');
          }
          return `"${String(val || '-').replace(/"/g, '""')}"`;
        }).join(',')
      ).join('\n');

      const blob = new Blob([`${headers}\n${rows}`], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `rapport_${reportType}_${dateRange.start}_${dateRange.end}.csv`;
      link.click();
    } finally {
      setLoading(false);
    }
  };

  const printReport = async () => {
    setLoading(true);
    try {
      const data = await fetchReportData();
      const config = getReportConfig();

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Veuillez autoriser les popups pour imprimer');
        return;
      }

      const tableRows = data.map(item => `
        <tr>
          ${config.keys.map(key => {
            let val = item[key];
            if (key === 'montant' || key === 'solde' || key === 'montantCotisation') {
              val = `${Number(val || 0).toLocaleString('fr-FR')} FCFA`;
            }
            if (key === 'dateDebut' && val) {
              val = new Date(val).toLocaleDateString('fr-FR');
            }
            return `<td>${val || '-'}</td>`;
          }).join('')}
        </tr>
      `).join('');

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>COFIN - ${config.title}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 20px; color: #1e293b; }
            .header { background: #0f172a; color: white; padding: 20px; margin: -20px -20px 20px; }
            .header h1 { font-size: 24px; margin-bottom: 5px; }
            .header p { font-size: 14px; opacity: 0.8; }
            .meta { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 12px; color: #64748b; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th { background: #3b82f6; color: white; padding: 10px 8px; text-align: left; font-weight: bold; }
            td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
            tr:nth-child(even) { background: #f8fafc; }
            .summary { background: #f1f5f9; padding: 15px; margin-top: 20px; border-radius: 8px; }
            .summary h3 { font-size: 14px; margin-bottom: 8px; }
            @media print { body { padding: 0; } .header { margin: 0 0 20px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>COFIN</h1>
            <p>${config.title}</p>
          </div>
          <div class="meta">
            <span>Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}</span>
            <span>Période: ${dateRange.start} au ${dateRange.end}</span>
          </div>
          <table>
            <thead><tr>${config.columns.map(c => `<th>${c}</th>`).join('')}</tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
          <div class="summary">
            <h3>Résumé</h3>
            <p>Total enregistrements: ${data.length}</p>
          </div>
          <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }</script>
        </body>
        </html>
      `);
      printWindow.document.close();
    } finally {
      setLoading(false);
    }
  };

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
    fetchReportData
  };
}
