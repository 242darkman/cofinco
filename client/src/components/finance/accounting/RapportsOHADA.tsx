import React, { useState, useCallback } from 'react';
import { Download, Printer, FileText, BookOpen, ClipboardList, RefreshCw, Calendar } from 'lucide-react';
import { toast, handleApiError } from '../../../lib/toast';
import { addPdfLogoHeader, addPdfLogoFooter } from '../../../lib/pdf-logo';
import { useBranding } from '../../../contexts/BrandingContext';
import { loadExportLibraries } from '../../../lib/lazy-export';
import {
  useJournalCentralisateur,
  useBilanOHADA,
  useCompteResultatOHADA,
  useLivreInventaire,
  useAccountingWebSocket,
} from '../../../hooks/accounting/useAccounting';

// ─────────────────────────────────────────────────────────────────────────────
// Types (mirror server-side gl-reporting-service types)
// ─────────────────────────────────────────────────────────────────────────────

interface JournalCentralisateurEntry {
  journalCode: string;
  journalIntitule: string;
  entryCount: number;
  totalDebit: number;
  totalCredit: number;
}

interface JournalCentralisateurData {
  agenceNom: string;
  year: number;
  month: number;
  periodLabel: string;
  entries: JournalCentralisateurEntry[];
  grandTotalDebit: number;
  grandTotalCredit: number;
  generatedAt: string;
}

interface BilanSection {
  titre: string;
  lignes: Array<{ numeroCompte: string; intitule: string; montant: number }>;
  sousTotal: number;
}

interface BilanData {
  agenceNom: string;
  dateArret: string;
  actif: BilanSection[];
  passif: BilanSection[];
  totalActif: number;
  totalPassif: number;
  resultatExercice: number;
  equilibre: boolean;
  generatedAt: string;
}

interface CompteResultatSection {
  titre: string;
  lignes: Array<{ numeroCompte: string; intitule: string; montant: number }>;
  sousTotal: number;
}

interface CompteResultatData {
  agenceNom: string;
  periodeDu: string;
  periodeAu: string;
  charges: CompteResultatSection[];
  produits: CompteResultatSection[];
  totalCharges: number;
  totalProduits: number;
  resultatNet: number;
  generatedAt: string;
}

interface LivreInventaireLine {
  numeroCompte: string;
  intitule: string;
  classe: number;
  typeCompte: string;
  solde: number;
  sensNormal: string;
  observation: string;
}

interface LivreInventaireData {
  agenceNom: string;
  dateInventaire: string;
  lignes: LivreInventaireLine[];
  totalActif: number;
  totalPassif: number;
  totalCharges: number;
  totalProduits: number;
  generatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (n: number) => (n || 0).toLocaleString('fr-FR');
const fmtFCFA = (n: number) => fmt(n) + ' FCFA';

const MONTH_NAMES = [
  '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function RapportsOHADA() {
  const { branding } = useBranding();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [dateArret, setDateArret] = useState(now.toISOString().split('T')[0]);
  const [exercice, setExercice] = useState(String(now.getFullYear()));

  const dateDebut = `${exercice}-01-01`;
  const dateFin = `${exercice}-12-31`;
  const dateInventaire = dateArret;

  useAccountingWebSocket();

  const { data: jcData, isLoading: jcLoading, refetch: jcRefetch } =
    useJournalCentralisateur(year, month);
  const { data: bilanData, isLoading: bilanLoading, refetch: bilanRefetch } =
    useBilanOHADA(dateArret);
  const { data: crData, isLoading: crLoading, refetch: crRefetch } =
    useCompteResultatOHADA(dateDebut, dateFin);
  const { data: liData, isLoading: liLoading, refetch: liRefetch } =
    useLivreInventaire(dateInventaire);

  // ─────────────────────────────────────────────────────────────────────────
  // JOURNAL CENTRALISATEUR — Excel
  // ─────────────────────────────────────────────────────────────────────────
  const handleJCExcel = useCallback(async () => {
    const d = jcData as JournalCentralisateurData | undefined;
    if (!d || d.entries.length === 0) { toast.warning('Aucune donnée à exporter'); return; }
    try {
      const { XLSX } = await loadExportLibraries();
      const rows = d.entries.map(e => ({
        'Code Journal': e.journalCode,
        'Intitulé': e.journalIntitule,
        'Nb Écritures': e.entryCount,
        'Total Débit': e.totalDebit,
        'Total Crédit': e.totalCredit,
      }));
      rows.push({
        'Code Journal': 'TOTAUX',
        'Intitulé': '',
        'Nb Écritures': rows.reduce((s, r) => s + r['Nb Écritures'], 0),
        'Total Débit': d.grandTotalDebit,
        'Total Crédit': d.grandTotalCredit,
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Journal Centralisateur');
      XLSX.writeFile(wb, `Journal_Centralisateur_${d.periodLabel.replace(' ', '_')}.xlsx`);
      toast.success('Export Excel réussi');
    } catch (e) { toast.error(handleApiError(e, 'Erreur export Excel')); }
  }, [jcData]);

  // ─────────────────────────────────────────────────────────────────────────
  // JOURNAL CENTRALISATEUR — PDF
  // ─────────────────────────────────────────────────────────────────────────
  const handleJCPDF = useCallback(async () => {
    const d = jcData as JournalCentralisateurData | undefined;
    if (!d || d.entries.length === 0) { toast.warning('Aucune donnée à exporter'); return; }
    try {
      const { jsPDF, autoTable } = await loadExportLibraries();
      const doc = new jsPDF('landscape');

      const startY = addPdfLogoHeader(doc, {
        title: 'JOURNAL CENTRALISATEUR MENSUEL',
        subtitle: `Agence: ${d.agenceNom} — Norme OHADA/SYSCOHADA`,
        dateRight: `Période: ${d.periodLabel}`,
        appName: branding.appName,
      });

      autoTable(doc, {
        startY,
        head: [['Code Journal', 'Intitulé', 'Nb Écritures', 'Total Débit (FCFA)', 'Total Crédit (FCFA)']],
        body: d.entries.map(e => [
          e.journalCode,
          e.journalIntitule,
          e.entryCount.toString(),
          fmt(e.totalDebit),
          fmt(e.totalCredit),
        ]),
        foot: [['TOTAUX', '', d.entries.reduce((s, e) => s + e.entryCount, 0).toString(), fmt(d.grandTotalDebit), fmt(d.grandTotalCredit)]],
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [241, 245, 249] },
        margin: { left: 14, right: 14 },
      });

      // Equilibre indicator
      const finalY = (doc as any).lastAutoTable?.finalY ?? startY + 60;
      const balanced = Math.abs(d.grandTotalDebit - d.grandTotalCredit) < 0.01;
      doc.setFontSize(10);
      doc.setFillColor(balanced ? 34 : 239, balanced ? 197 : 68, balanced ? 94 : 68);
      doc.roundedRect(14, finalY + 6, 120, 10, 2, 2, 'F');
      doc.setTextColor(255);
      doc.text(balanced ? 'Équilibre vérifié : Débit = Crédit' : `DÉSÉQUILIBRE : écart de ${fmt(Math.abs(d.grandTotalDebit - d.grandTotalCredit))} FCFA`, 20, finalY + 13);

      addPdfLogoFooter(doc, 'Journal Centralisateur', branding.appName);
      doc.save(`Journal_Centralisateur_${d.periodLabel.replace(' ', '_')}.pdf`);
      toast.success('Export PDF réussi');
    } catch (e) { toast.error(handleApiError(e, 'Erreur export PDF')); }
  }, [jcData]);

  // ─────────────────────────────────────────────────────────────────────────
  // BILAN OHADA — Excel
  // ─────────────────────────────────────────────────────────────────────────
  const handleBilanExcel = useCallback(async () => {
    const d = bilanData as BilanData | undefined;
    if (!d) { toast.warning('Aucune donnée à exporter'); return; }
    try {
      const { XLSX } = await loadExportLibraries();
      const actifRows: Record<string, any>[] = [];
      for (const sec of d.actif) {
        actifRows.push({ 'Compte': sec.titre, 'Intitulé': '', 'Montant': '' });
        for (const l of sec.lignes) actifRows.push({ 'Compte': l.numeroCompte, 'Intitulé': l.intitule, 'Montant': l.montant });
        actifRows.push({ 'Compte': '', 'Intitulé': 'Sous-total', 'Montant': sec.sousTotal });
      }
      actifRows.push({ 'Compte': '', 'Intitulé': 'TOTAL ACTIF', 'Montant': d.totalActif });

      const passifRows: Record<string, any>[] = [];
      for (const sec of d.passif) {
        passifRows.push({ 'Compte': sec.titre, 'Intitulé': '', 'Montant': '' });
        for (const l of sec.lignes) passifRows.push({ 'Compte': l.numeroCompte, 'Intitulé': l.intitule, 'Montant': l.montant });
        passifRows.push({ 'Compte': '', 'Intitulé': 'Sous-total', 'Montant': sec.sousTotal });
      }
      passifRows.push({ 'Compte': '', 'Intitulé': 'TOTAL PASSIF', 'Montant': d.totalPassif });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(actifRows), 'Actif');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(passifRows), 'Passif');
      XLSX.writeFile(wb, `Bilan_OHADA_${d.dateArret}.xlsx`);
      toast.success('Export Excel réussi');
    } catch (e) { toast.error(handleApiError(e, 'Erreur export Excel')); }
  }, [bilanData]);

  // ─────────────────────────────────────────────────────────────────────────
  // BILAN OHADA — PDF
  // ─────────────────────────────────────────────────────────────────────────
  const handleBilanPDF = useCallback(async () => {
    const d = bilanData as BilanData | undefined;
    if (!d) { toast.warning('Aucune donnée à exporter'); return; }
    try {
      const { jsPDF, autoTable } = await loadExportLibraries();
      const doc = new jsPDF('portrait');

      let y = addPdfLogoHeader(doc, {
        title: 'BILAN — OHADA/SYSCOHADA',
        subtitle: `Agence: ${d.agenceNom}`,
        dateRight: `Arrêté au ${d.dateArret}`,
        appName: branding.appName,
      });

      // ACTIF section
      doc.setFontSize(12);
      doc.setTextColor(30, 58, 138);
      doc.text('ACTIF', 14, y);
      y += 4;

      const actifBody: string[][] = [];
      for (const sec of d.actif) {
        actifBody.push([{ content: sec.titre, colSpan: 2, styles: { fontStyle: 'bold', fillColor: [226, 232, 240] } } as any, '']);
        for (const l of sec.lignes) actifBody.push([l.numeroCompte, l.intitule, fmt(l.montant)]);
        actifBody.push(['', 'Sous-total', { content: fmt(sec.sousTotal), styles: { fontStyle: 'bold' } } as any]);
      }
      actifBody.push([{ content: 'TOTAL ACTIF', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [30, 58, 138], textColor: 255 } } as any, '', { content: fmt(d.totalActif), styles: { fontStyle: 'bold', fillColor: [30, 58, 138], textColor: 255 } } as any]);

      autoTable(doc, {
        startY: y,
        head: [['Compte', 'Intitulé', 'Montant (FCFA)']],
        body: actifBody,
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [15, 23, 42], textColor: 255 },
        columnStyles: { 0: { cellWidth: 30 }, 2: { halign: 'right', cellWidth: 40 } },
        margin: { left: 14, right: 14 },
      });

      y = (doc as any).lastAutoTable?.finalY != null ? (doc as any).lastAutoTable.finalY + 8 : y + 80;

      // PASSIF section
      doc.setFontSize(12);
      doc.setTextColor(126, 34, 206);
      doc.text('PASSIF', 14, y);
      y += 4;

      const passifBody: string[][] = [];
      for (const sec of d.passif) {
        passifBody.push([{ content: sec.titre, colSpan: 2, styles: { fontStyle: 'bold', fillColor: [237, 233, 254] } } as any, '']);
        for (const l of sec.lignes) passifBody.push([l.numeroCompte, l.intitule, fmt(l.montant)]);
        passifBody.push(['', 'Sous-total', { content: fmt(sec.sousTotal), styles: { fontStyle: 'bold' } } as any]);
      }
      passifBody.push([{ content: 'TOTAL PASSIF', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [126, 34, 206], textColor: 255 } } as any, '', { content: fmt(d.totalPassif), styles: { fontStyle: 'bold', fillColor: [126, 34, 206], textColor: 255 } } as any]);

      autoTable(doc, {
        startY: y,
        head: [['Compte', 'Intitulé', 'Montant (FCFA)']],
        body: passifBody,
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [15, 23, 42], textColor: 255 },
        columnStyles: { 0: { cellWidth: 30 }, 2: { halign: 'right', cellWidth: 40 } },
        margin: { left: 14, right: 14 },
      });

      // Equilibre indicator
      const fy = (doc as any).lastAutoTable?.finalY ?? y + 60;
      doc.setFillColor(d.equilibre ? 34 : 239, d.equilibre ? 197 : 68, d.equilibre ? 94 : 68);
      doc.roundedRect(14, fy + 6, 180, 12, 2, 2, 'F');
      doc.setTextColor(255);
      doc.setFontSize(10);
      doc.text(
        d.equilibre
          ? `Bilan équilibré — Actif = Passif = ${fmtFCFA(d.totalActif)}`
          : `BILAN DÉSÉQUILIBRÉ — Écart: ${fmtFCFA(Math.abs(d.totalActif - d.totalPassif))}`,
        105, fy + 14, { align: 'center' }
      );

      addPdfLogoFooter(doc, 'Bilan OHADA', branding.appName);
      doc.save(`Bilan_OHADA_${d.dateArret}.pdf`);
      toast.success('Export PDF réussi');
    } catch (e) { toast.error(handleApiError(e, 'Erreur export PDF')); }
  }, [bilanData]);

  // ─────────────────────────────────────────────────────────────────────────
  // COMPTE DE RÉSULTAT OHADA — Excel
  // ─────────────────────────────────────────────────────────────────────────
  const handleCRExcel = useCallback(async () => {
    const d = crData as CompteResultatData | undefined;
    if (!d) { toast.warning('Aucune donnée à exporter'); return; }
    try {
      const { XLSX } = await loadExportLibraries();

      const chargesRows: Record<string, any>[] = [];
      for (const sec of d.charges) {
        chargesRows.push({ 'Compte': sec.titre, 'Intitulé': '', 'Montant': '' });
        for (const l of sec.lignes) chargesRows.push({ 'Compte': l.numeroCompte, 'Intitulé': l.intitule, 'Montant': l.montant });
        chargesRows.push({ 'Compte': '', 'Intitulé': 'Sous-total', 'Montant': sec.sousTotal });
      }
      chargesRows.push({ 'Compte': '', 'Intitulé': 'TOTAL CHARGES', 'Montant': d.totalCharges });

      const produitsRows: Record<string, any>[] = [];
      for (const sec of d.produits) {
        produitsRows.push({ 'Compte': sec.titre, 'Intitulé': '', 'Montant': '' });
        for (const l of sec.lignes) produitsRows.push({ 'Compte': l.numeroCompte, 'Intitulé': l.intitule, 'Montant': l.montant });
        produitsRows.push({ 'Compte': '', 'Intitulé': 'Sous-total', 'Montant': sec.sousTotal });
      }
      produitsRows.push({ 'Compte': '', 'Intitulé': 'TOTAL PRODUITS', 'Montant': d.totalProduits });

      const synthese = [
        { 'Élément': 'Total Produits', 'Montant': d.totalProduits },
        { 'Élément': 'Total Charges', 'Montant': d.totalCharges },
        { 'Élément': 'RÉSULTAT NET', 'Montant': d.resultatNet },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(chargesRows), 'Charges');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(produitsRows), 'Produits');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(synthese), 'Synthèse');
      XLSX.writeFile(wb, `Compte_Resultat_OHADA_${exercice}.xlsx`);
      toast.success('Export Excel réussi');
    } catch (e) { toast.error(handleApiError(e, 'Erreur export Excel')); }
  }, [crData, exercice]);

  // ─────────────────────────────────────────────────────────────────────────
  // COMPTE DE RÉSULTAT OHADA — PDF
  // ─────────────────────────────────────────────────────────────────────────
  const handleCRPDF = useCallback(async () => {
    const d = crData as CompteResultatData | undefined;
    if (!d) { toast.warning('Aucune donnée à exporter'); return; }
    try {
      const { jsPDF, autoTable } = await loadExportLibraries();
      const doc = new jsPDF('portrait');

      let y = addPdfLogoHeader(doc, {
        title: 'COMPTE DE RÉSULTAT — OHADA/SYSCOHADA',
        subtitle: `Agence: ${d.agenceNom}`,
        dateRight: `Du ${d.periodeDu} au ${d.periodeAu}`,
        appName: branding.appName,
      });

      // PRODUITS section
      doc.setFontSize(12);
      doc.setTextColor(34, 197, 94);
      doc.text('PRODUITS', 14, y);
      y += 4;

      const produitsBody: string[][] = [];
      for (const sec of d.produits) {
        produitsBody.push([{ content: sec.titre, colSpan: 2, styles: { fontStyle: 'bold', fillColor: [220, 252, 231] } } as any, '']);
        for (const l of sec.lignes) produitsBody.push([l.numeroCompte, l.intitule, fmt(l.montant)]);
        produitsBody.push(['', 'Sous-total', { content: fmt(sec.sousTotal), styles: { fontStyle: 'bold' } } as any]);
      }
      produitsBody.push([{ content: 'TOTAL PRODUITS', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [34, 197, 94], textColor: 255 } } as any, '', { content: fmt(d.totalProduits), styles: { fontStyle: 'bold', fillColor: [34, 197, 94], textColor: 255 } } as any]);

      autoTable(doc, {
        startY: y,
        head: [['Compte', 'Intitulé', 'Montant (FCFA)']],
        body: produitsBody,
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [15, 23, 42], textColor: 255 },
        columnStyles: { 0: { cellWidth: 30 }, 2: { halign: 'right', cellWidth: 40 } },
        margin: { left: 14, right: 14 },
      });

      y = (doc as any).lastAutoTable?.finalY != null ? (doc as any).lastAutoTable.finalY + 8 : y + 60;

      // CHARGES section
      doc.setFontSize(12);
      doc.setTextColor(239, 68, 68);
      doc.text('CHARGES', 14, y);
      y += 4;

      const chargesBody: string[][] = [];
      for (const sec of d.charges) {
        chargesBody.push([{ content: sec.titre, colSpan: 2, styles: { fontStyle: 'bold', fillColor: [254, 226, 226] } } as any, '']);
        for (const l of sec.lignes) chargesBody.push([l.numeroCompte, l.intitule, fmt(l.montant)]);
        chargesBody.push(['', 'Sous-total', { content: fmt(sec.sousTotal), styles: { fontStyle: 'bold' } } as any]);
      }
      chargesBody.push([{ content: 'TOTAL CHARGES', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [239, 68, 68], textColor: 255 } } as any, '', { content: fmt(d.totalCharges), styles: { fontStyle: 'bold', fillColor: [239, 68, 68], textColor: 255 } } as any]);

      autoTable(doc, {
        startY: y,
        head: [['Compte', 'Intitulé', 'Montant (FCFA)']],
        body: chargesBody,
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [15, 23, 42], textColor: 255 },
        columnStyles: { 0: { cellWidth: 30 }, 2: { halign: 'right', cellWidth: 40 } },
        margin: { left: 14, right: 14 },
      });

      // Résultat Net
      const fy = (doc as any).lastAutoTable?.finalY ?? y + 60;
      const profit = d.resultatNet >= 0;
      doc.setFillColor(profit ? 34 : 239, profit ? 197 : 68, profit ? 94 : 68);
      doc.roundedRect(14, fy + 6, 180, 14, 2, 2, 'F');
      doc.setTextColor(255);
      doc.setFontSize(12);
      doc.text(`RÉSULTAT NET : ${profit ? 'Bénéfice' : 'Perte'} de ${fmtFCFA(Math.abs(d.resultatNet))}`, 105, fy + 15, { align: 'center' });

      addPdfLogoFooter(doc, 'Compte de Résultat OHADA', branding.appName);
      doc.save(`Compte_Resultat_OHADA_${exercice}.pdf`);
      toast.success('Export PDF réussi');
    } catch (e) { toast.error(handleApiError(e, 'Erreur export PDF')); }
  }, [crData, exercice]);

  // ─────────────────────────────────────────────────────────────────────────
  // LIVRE D'INVENTAIRE — Excel
  // ─────────────────────────────────────────────────────────────────────────
  const handleLIExcel = useCallback(async () => {
    const d = liData as LivreInventaireData | undefined;
    if (!d || d.lignes.length === 0) { toast.warning('Aucune donnée à exporter'); return; }
    try {
      const { XLSX } = await loadExportLibraries();
      const rows = d.lignes.filter(l => l.solde !== 0).map(l => ({
        'Compte': l.numeroCompte,
        'Intitulé': l.intitule,
        'Classe': l.classe,
        'Type': l.typeCompte,
        'Solde': l.solde,
        'Sens Normal': l.sensNormal,
        'Observation': l.observation,
      }));
      rows.push({
        'Compte': 'TOTAUX',
        'Intitulé': '',
        'Classe': '' as any,
        'Type': 'Actif',
        'Solde': d.totalActif,
        'Sens Normal': '',
        'Observation': '',
      });
      rows.push({
        'Compte': '',
        'Intitulé': '',
        'Classe': '' as any,
        'Type': 'Passif',
        'Solde': d.totalPassif,
        'Sens Normal': '',
        'Observation': '',
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Livre d'Inventaire");
      XLSX.writeFile(wb, `Livre_Inventaire_${d.dateInventaire}.xlsx`);
      toast.success('Export Excel réussi');
    } catch (e) { toast.error(handleApiError(e, 'Erreur export Excel')); }
  }, [liData]);

  // ─────────────────────────────────────────────────────────────────────────
  // LIVRE D'INVENTAIRE — PDF
  // ─────────────────────────────────────────────────────────────────────────
  const handleLIPDF = useCallback(async () => {
    const d = liData as LivreInventaireData | undefined;
    if (!d || d.lignes.length === 0) { toast.warning('Aucune donnée à exporter'); return; }
    try {
      const { jsPDF, autoTable } = await loadExportLibraries();
      const doc = new jsPDF('landscape');

      const startY = addPdfLogoHeader(doc, {
        title: "LIVRE D'INVENTAIRE — OHADA/SYSCOHADA",
        subtitle: `Agence: ${d.agenceNom}`,
        dateRight: `Date inventaire: ${d.dateInventaire}`,
        appName: branding.appName,
      });

      const activeLignes = d.lignes.filter(l => l.solde !== 0);
      let currentClasse = -1;
      const body: any[][] = [];

      for (const l of activeLignes) {
        if (l.classe !== currentClasse) {
          currentClasse = l.classe;
          body.push([{ content: `Classe ${currentClasse}`, colSpan: 6, styles: { fontStyle: 'bold', fillColor: [226, 232, 240] } }]);
        }
        body.push([
          l.numeroCompte,
          l.intitule,
          l.typeCompte,
          { content: fmt(l.solde), styles: { halign: 'right' } },
          l.sensNormal,
          l.observation || '',
        ]);
      }

      autoTable(doc, {
        startY,
        head: [['Compte', 'Intitulé', 'Type', 'Solde (FCFA)', 'Sens Normal', 'Observation']],
        body,
        styles: { fontSize: 7, cellPadding: 2.5 },
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 25 },
          3: { halign: 'right', cellWidth: 35 },
          4: { cellWidth: 25 },
        },
        margin: { left: 10, right: 10 },
      });

      // Totaux summary
      const fy = (doc as any).lastAutoTable?.finalY ?? startY + 100;
      autoTable(doc, {
        startY: fy + 6,
        body: [
          ['Total Actif', fmt(d.totalActif)],
          ['Total Passif', fmt(d.totalPassif)],
          ['Total Charges', fmt(d.totalCharges)],
          ['Total Produits', fmt(d.totalProduits)],
          [{ content: 'Résultat', styles: { fontStyle: 'bold' } }, { content: fmt(d.totalProduits - d.totalCharges), styles: { fontStyle: 'bold' } }],
        ],
        styles: { fontSize: 9, cellPadding: 3 },
        columnStyles: { 0: { cellWidth: 60 }, 1: { halign: 'right', cellWidth: 50 } },
        margin: { left: 14, right: 200 },
        theme: 'grid',
      });

      addPdfLogoFooter(doc, "Livre d'Inventaire", branding.appName);
      doc.save(`Livre_Inventaire_${d.dateInventaire}.pdf`);
      toast.success('Export PDF réussi');
    } catch (e) { toast.error(handleApiError(e, 'Erreur export PDF')); }
  }, [liData]);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  const isAnyLoading = jcLoading || bilanLoading || crLoading || liLoading;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-status-warning to-status-danger rounded-xl p-3">
        <div className="flex items-center gap-3 overflow-x-auto">
          <div className="flex items-center gap-2 flex-shrink-0">
            <FileText className="w-5 h-5 text-white" />
            <div>
              <h2 className="text-sm font-bold text-white leading-tight whitespace-nowrap">États Financiers OHADA</h2>
              <p className="text-[10px] text-white/80 whitespace-nowrap">Téléchargement Excel & PDF</p>
            </div>
          </div>
          <div className="w-px h-10 bg-white/20 flex-shrink-0" />
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="bg-white/15 rounded-lg px-3 py-1.5">
              <div className="text-base font-bold text-white leading-none">4</div>
              <div className="text-[9px] text-white/70">Rapports</div>
            </div>
          </div>
          <div className="flex-1 min-w-4" />
          <button
            onClick={() => { jcRefetch(); bilanRefetch(); crRefetch(); liRefetch(); }}
            disabled={isAnyLoading}
            className="bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 flex-shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isAnyLoading ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
        </div>
      </div>

      {/* Reports Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* 1. Journal Centralisateur */}
        <div className="bg-surface rounded-xl overflow-hidden">
          <div className="bg-gradient-to-r from-status-info to-accent p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-white" />
                <div>
                  <h3 className="text-xs font-bold text-white">Journal Centralisateur</h3>
                  <p className="text-[9px] text-white/70">Synthèse mensuelle par journal</p>
                </div>
              </div>
              <div className="flex gap-1.5">
                <button onClick={handleJCExcel} disabled={jcLoading} className="bg-white/20 hover:bg-white/30 text-white p-1.5 rounded-lg transition-colors disabled:opacity-50" title="Excel">
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button onClick={handleJCPDF} disabled={jcLoading} className="bg-white/20 hover:bg-white/30 text-white p-1.5 rounded-lg transition-colors disabled:opacity-50" title="PDF">
                  <Printer className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
          <div className="p-3 space-y-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[10px] text-content-muted block mb-1">Année</label>
                <select value={year} onChange={e => setYear(Number(e.target.value))} className="w-full bg-surface-elevated text-content-primary text-xs px-2 py-1.5 rounded-lg border border-edge-strong">
                  {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-content-muted block mb-1">Mois</label>
                <select value={month} onChange={e => setMonth(Number(e.target.value))} className="w-full bg-surface-elevated text-content-primary text-xs px-2 py-1.5 rounded-lg border border-edge-strong">
                  {MONTH_NAMES.slice(1).map((m, i) => (
                    <option key={i + 1} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
            {jcLoading ? (
              <div className="h-16 bg-surface-elevated/50 rounded-lg animate-pulse" />
            ) : (jcData as JournalCentralisateurData)?.entries?.length > 0 ? (
              <div className="text-xs text-content-secondary space-y-1">
                <div className="flex justify-between text-content-muted">
                  <span>{(jcData as JournalCentralisateurData).entries.length} journaux</span>
                  <span>Débit: {fmtFCFA((jcData as JournalCentralisateurData).grandTotalDebit)}</span>
                </div>
                <div className="flex justify-between text-content-muted">
                  <span>{(jcData as JournalCentralisateurData).periodLabel}</span>
                  <span>Crédit: {fmtFCFA((jcData as JournalCentralisateurData).grandTotalCredit)}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-content-muted text-center py-3">Aucune écriture pour cette période</p>
            )}
          </div>
        </div>

        {/* 2. Bilan OHADA */}
        <div className="bg-surface rounded-xl overflow-hidden">
          <div className="bg-gradient-to-r from-accent to-status-info p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-white" />
                <div>
                  <h3 className="text-xs font-bold text-white">Bilan OHADA</h3>
                  <p className="text-[9px] text-white/70">Situation patrimoniale</p>
                </div>
              </div>
              <div className="flex gap-1.5">
                <button onClick={handleBilanExcel} disabled={bilanLoading} className="bg-white/20 hover:bg-white/30 text-white p-1.5 rounded-lg transition-colors disabled:opacity-50" title="Excel">
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button onClick={handleBilanPDF} disabled={bilanLoading} className="bg-white/20 hover:bg-white/30 text-white p-1.5 rounded-lg transition-colors disabled:opacity-50" title="PDF">
                  <Printer className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
          <div className="p-3 space-y-2">
            <div>
              <label className="text-[10px] text-content-muted block mb-1">Date d'arrêté</label>
              <input type="date" value={dateArret} onChange={e => setDateArret(e.target.value)} className="w-full bg-surface-elevated text-content-primary text-xs px-2 py-1.5 rounded-lg border border-edge-strong" />
            </div>
            {bilanLoading ? (
              <div className="h-16 bg-surface-elevated/50 rounded-lg animate-pulse" />
            ) : bilanData ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-status-info-bg border border-status-info/20 rounded-lg p-2">
                  <div className="text-status-info font-bold">{fmtFCFA((bilanData as BilanData).totalActif)}</div>
                  <div className="text-[9px] text-content-muted">Total Actif</div>
                </div>
                <div className="bg-status-info-bg border border-status-info/20 rounded-lg p-2">
                  <div className="text-status-info font-bold">{fmtFCFA((bilanData as BilanData).totalPassif)}</div>
                  <div className="text-[9px] text-content-muted">Total Passif</div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-content-muted text-center py-3">Aucune donnée</p>
            )}
          </div>
        </div>

        {/* 3. Compte de Résultat OHADA */}
        <div className="bg-surface rounded-xl overflow-hidden">
          <div className="bg-gradient-to-r from-status-success to-status-success p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-white" />
                <div>
                  <h3 className="text-xs font-bold text-white">Compte de Résultat OHADA</h3>
                  <p className="text-[9px] text-white/70">Charges & Produits</p>
                </div>
              </div>
              <div className="flex gap-1.5">
                <button onClick={handleCRExcel} disabled={crLoading} className="bg-white/20 hover:bg-white/30 text-white p-1.5 rounded-lg transition-colors disabled:opacity-50" title="Excel">
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button onClick={handleCRPDF} disabled={crLoading} className="bg-white/20 hover:bg-white/30 text-white p-1.5 rounded-lg transition-colors disabled:opacity-50" title="PDF">
                  <Printer className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
          <div className="p-3 space-y-2">
            <div>
              <label className="text-[10px] text-content-muted block mb-1">Exercice</label>
              <select value={exercice} onChange={e => setExercice(e.target.value)} className="w-full bg-surface-elevated text-content-primary text-xs px-2 py-1.5 rounded-lg border border-edge-strong">
                {Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i)).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            {crLoading ? (
              <div className="h-16 bg-surface-elevated/50 rounded-lg animate-pulse" />
            ) : crData ? (
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-status-success">Produits</span>
                  <span className="text-content-primary font-mono">{fmtFCFA((crData as CompteResultatData).totalProduits)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-status-danger">Charges</span>
                  <span className="text-content-primary font-mono">{fmtFCFA((crData as CompteResultatData).totalCharges)}</span>
                </div>
                <div className="border-t border-edge pt-1 flex justify-between font-bold">
                  <span className={(crData as CompteResultatData).resultatNet >= 0 ? 'text-status-success' : 'text-status-danger'}>
                    {(crData as CompteResultatData).resultatNet >= 0 ? 'Bénéfice' : 'Perte'}
                  </span>
                  <span className="text-content-primary font-mono">{fmtFCFA(Math.abs((crData as CompteResultatData).resultatNet))}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-content-muted text-center py-3">Aucune donnée</p>
            )}
          </div>
        </div>

        {/* 4. Livre d'Inventaire */}
        <div className="bg-surface rounded-xl overflow-hidden">
          <div className="bg-gradient-to-r from-status-warning to-status-warning p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-white" />
                <div>
                  <h3 className="text-xs font-bold text-white">Livre d'Inventaire</h3>
                  <p className="text-[9px] text-white/70">Inventaire comptable OHADA</p>
                </div>
              </div>
              <div className="flex gap-1.5">
                <button onClick={handleLIExcel} disabled={liLoading} className="bg-white/20 hover:bg-white/30 text-white p-1.5 rounded-lg transition-colors disabled:opacity-50" title="Excel">
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button onClick={handleLIPDF} disabled={liLoading} className="bg-white/20 hover:bg-white/30 text-white p-1.5 rounded-lg transition-colors disabled:opacity-50" title="PDF">
                  <Printer className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
          <div className="p-3 space-y-2">
            <div>
              <label className="text-[10px] text-content-muted block mb-1">Date inventaire</label>
              <input type="date" value={dateArret} onChange={e => setDateArret(e.target.value)} className="w-full bg-surface-elevated text-content-primary text-xs px-2 py-1.5 rounded-lg border border-edge-strong" />
            </div>
            {liLoading ? (
              <div className="h-16 bg-surface-elevated/50 rounded-lg animate-pulse" />
            ) : liData ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-status-warning-bg border border-status-warning/20 rounded-lg p-2">
                  <div className="text-status-warning font-bold">{(liData as LivreInventaireData).lignes.filter(l => l.solde !== 0).length}</div>
                  <div className="text-[9px] text-content-muted">Comptes actifs</div>
                </div>
                <div className="bg-status-warning-bg border border-status-warning/20 rounded-lg p-2">
                  <div className="text-status-warning font-bold">{fmtFCFA((liData as LivreInventaireData).totalProduits - (liData as LivreInventaireData).totalCharges)}</div>
                  <div className="text-[9px] text-content-muted">Résultat</div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-content-muted text-center py-3">Aucune donnée</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
