import { toast, handleApiError } from '../../../../lib/toast';
import { addPdfLogoHeader, addPdfLogoFooter } from '../../../../lib/pdf-logo';
import { loadPDFLibraries } from '../../../../lib/lazy-export';

interface JsPDFWithAutoTable {
  lastAutoTable?: { finalY: number };
}

interface AutoTableCellDef {
  content: string;
  colSpan?: number;
  styles?: Record<string, unknown>;
}

type AutoTableBodyRow = (string | AutoTableCellDef)[];

export interface JournalCentralisateurEntryExport {
  journalCode: string;
  journalIntitule: string;
  entryCount: number;
  totalDebit: number;
  totalCredit: number;
}

export interface JournalCentralisateurDataExport {
  agenceNom: string;
  year: number;
  month: number;
  periodLabel: string;
  entries: JournalCentralisateurEntryExport[];
  grandTotalDebit: number;
  grandTotalCredit: number;
  generatedAt: string;
}

export interface BilanSectionExport {
  titre: string;
  lignes: Array<{ numeroCompte: string; intitule: string; montant: number }>;
  sousTotal: number;
}

export interface BilanDataExport {
  agenceNom: string;
  dateArret: string;
  actif: BilanSectionExport[];
  passif: BilanSectionExport[];
  totalActif: number;
  totalPassif: number;
  resultatExercice: number;
  equilibre: boolean;
  generatedAt: string;
}

export interface CompteResultatSectionExport {
  titre: string;
  lignes: Array<{ numeroCompte: string; intitule: string; montant: number }>;
  sousTotal: number;
}

export interface CompteResultatDataExport {
  agenceNom: string;
  periodeDu: string;
  periodeAu: string;
  charges: CompteResultatSectionExport[];
  produits: CompteResultatSectionExport[];
  totalCharges: number;
  totalProduits: number;
  resultatNet: number;
  generatedAt: string;
}

export interface LivreInventaireLineExport {
  numeroCompte: string;
  intitule: string;
  classe: number;
  typeCompte: string;
  solde: number;
  sensNormal: string;
  observation: string;
}

export interface LivreInventaireDataExport {
  agenceNom: string;
  dateInventaire: string;
  lignes: LivreInventaireLineExport[];
  totalActif: number;
  totalPassif: number;
  totalCharges: number;
  totalProduits: number;
  generatedAt: string;
}

const fmt = (n: number) => (n || 0).toLocaleString('fr-FR');
const fmtFCFA = (n: number) => fmt(n) + ' FCFA';

export const exportJCExcel = async (d: JournalCentralisateurDataExport | undefined) => {
  if (!d || d.entries.length === 0) { toast.warning('Aucune donnée à exporter'); return; }
  try {
    const { downloadWorkbook } = await import('@/lib/excel-export');
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
      'Nb Écritures': rows.reduce((s, r) => s + (r['Nb Écritures'] as number), 0),
      'Total Débit': d.grandTotalDebit,
      'Total Crédit': d.grandTotalCredit,
    });
    await downloadWorkbook(`Journal_Centralisateur_${d.periodLabel.replace(' ', '_')}.xlsx`, [
      { name: 'Journal Centralisateur', rows },
    ]);
    toast.success('Export Excel réussi');
  } catch (e) { toast.error(handleApiError(e, 'Erreur export Excel')); }
};

export const exportJCPDF = async (d: JournalCentralisateurDataExport | undefined, branding: { appName: string }) => {
  if (!d || d.entries.length === 0) { toast.warning('Aucune donnée à exporter'); return; }
  try {
    const { jsPDF, autoTable } = await loadPDFLibraries();
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

    const finalY = (doc as unknown as JsPDFWithAutoTable).lastAutoTable?.finalY ?? startY + 60;
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
};

export const exportBilanExcel = async (d: BilanDataExport | undefined) => {
  if (!d) { toast.warning('Aucune donnée à exporter'); return; }
  try {
    const { downloadWorkbook } = await import('@/lib/excel-export');
    const actifRows: Record<string, string | number>[] = [];
    for (const sec of d.actif) {
      actifRows.push({ 'Compte': sec.titre, 'Intitulé': '', 'Montant': '' });
      for (const l of sec.lignes) actifRows.push({ 'Compte': l.numeroCompte, 'Intitulé': l.intitule, 'Montant': l.montant });
      actifRows.push({ 'Compte': '', 'Intitulé': 'Sous-total', 'Montant': sec.sousTotal });
    }
    actifRows.push({ 'Compte': '', 'Intitulé': 'TOTAL ACTIF', 'Montant': d.totalActif });

    const passifRows: Record<string, string | number>[] = [];
    for (const sec of d.passif) {
      passifRows.push({ 'Compte': sec.titre, 'Intitulé': '', 'Montant': '' });
      for (const l of sec.lignes) passifRows.push({ 'Compte': l.numeroCompte, 'Intitulé': l.intitule, 'Montant': l.montant });
      passifRows.push({ 'Compte': '', 'Intitulé': 'Sous-total', 'Montant': sec.sousTotal });
    }
    passifRows.push({ 'Compte': '', 'Intitulé': 'TOTAL PASSIF', 'Montant': d.totalPassif });

    await downloadWorkbook(`Bilan_OHADA_${d.dateArret}.xlsx`, [
      { name: 'Actif', rows: actifRows },
      { name: 'Passif', rows: passifRows },
    ]);
    toast.success('Export Excel réussi');
  } catch (e) { toast.error(handleApiError(e, 'Erreur export Excel')); }
};

export const exportBilanPDF = async (d: BilanDataExport | undefined, branding: { appName: string }) => {
  if (!d) { toast.warning('Aucune donnée à exporter'); return; }
  try {
    const { jsPDF, autoTable } = await loadPDFLibraries();
    const doc = new jsPDF('portrait');

    let y = addPdfLogoHeader(doc, {
      title: 'BILAN — OHADA/SYSCOHADA',
      subtitle: `Agence: ${d.agenceNom}`,
      dateRight: `Arrêté au ${d.dateArret}`,
      appName: branding.appName,
    });

    doc.setFontSize(12);
    doc.setTextColor(30, 58, 138);
    doc.text('ACTIF', 14, y);
    y += 4;

    const actifBody: AutoTableBodyRow[] = [];
    for (const sec of d.actif) {
      actifBody.push([{ content: sec.titre, colSpan: 2, styles: { fontStyle: 'bold', fillColor: [226, 232, 240] } }, '']);
      for (const l of sec.lignes) actifBody.push([l.numeroCompte, l.intitule, fmt(l.montant)]);
      actifBody.push(['', 'Sous-total', { content: fmt(sec.sousTotal), styles: { fontStyle: 'bold' } }]);
    }
    actifBody.push([{ content: 'TOTAL ACTIF', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [30, 58, 138], textColor: 255 } }, '', { content: fmt(d.totalActif), styles: { fontStyle: 'bold', fillColor: [30, 58, 138], textColor: 255 } }]);

    autoTable(doc, {
      startY: y,
      head: [['Compte', 'Intitulé', 'Montant (FCFA)']],
      body: actifBody,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [15, 23, 42], textColor: 255 },
      columnStyles: { 0: { cellWidth: 30 }, 2: { halign: 'right', cellWidth: 40 } },
      margin: { left: 14, right: 14 },
    });

    y = (doc as unknown as JsPDFWithAutoTable).lastAutoTable?.finalY != null ? (doc as unknown as JsPDFWithAutoTable).lastAutoTable!.finalY + 8 : y + 80;

    doc.setFontSize(12);
    doc.setTextColor(126, 34, 206);
    doc.text('PASSIF', 14, y);
    y += 4;

    const passifBody: AutoTableBodyRow[] = [];
    for (const sec of d.passif) {
      passifBody.push([{ content: sec.titre, colSpan: 2, styles: { fontStyle: 'bold', fillColor: [237, 233, 254] } }, '']);
      for (const l of sec.lignes) passifBody.push([l.numeroCompte, l.intitule, fmt(l.montant)]);
      passifBody.push(['', 'Sous-total', { content: fmt(sec.sousTotal), styles: { fontStyle: 'bold' } }]);
    }
    passifBody.push([{ content: 'TOTAL PASSIF', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [126, 34, 206], textColor: 255 } }, '', { content: fmt(d.totalPassif), styles: { fontStyle: 'bold', fillColor: [126, 34, 206], textColor: 255 } }]);

    autoTable(doc, {
      startY: y,
      head: [['Compte', 'Intitulé', 'Montant (FCFA)']],
      body: passifBody,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [15, 23, 42], textColor: 255 },
      columnStyles: { 0: { cellWidth: 30 }, 2: { halign: 'right', cellWidth: 40 } },
      margin: { left: 14, right: 14 },
    });

    const fy = (doc as unknown as JsPDFWithAutoTable).lastAutoTable?.finalY ?? y + 60;
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
};

export const exportCRExcel = async (d: CompteResultatDataExport | undefined, exercice: string) => {
  if (!d) { toast.warning('Aucune donnée à exporter'); return; }
  try {
    const { downloadWorkbook } = await import('@/lib/excel-export');

    const chargesRows: Record<string, string | number>[] = [];
    for (const sec of d.charges) {
      chargesRows.push({ 'Compte': sec.titre, 'Intitulé': '', 'Montant': '' });
      for (const l of sec.lignes) chargesRows.push({ 'Compte': l.numeroCompte, 'Intitulé': l.intitule, 'Montant': l.montant });
      chargesRows.push({ 'Compte': '', 'Intitulé': 'Sous-total', 'Montant': sec.sousTotal });
    }
    chargesRows.push({ 'Compte': '', 'Intitulé': 'TOTAL CHARGES', 'Montant': d.totalCharges });

    const produitsRows: Record<string, string | number>[] = [];
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

    await downloadWorkbook(`Compte_Resultat_OHADA_${exercice}.xlsx`, [
      { name: 'Charges', rows: chargesRows },
      { name: 'Produits', rows: produitsRows },
      { name: 'Synthèse', rows: synthese },
    ]);
    toast.success('Export Excel réussi');
  } catch (e) { toast.error(handleApiError(e, 'Erreur export Excel')); }
};

export const exportCRPDF = async (d: CompteResultatDataExport | undefined, exercice: string, branding: { appName: string }) => {
  if (!d) { toast.warning('Aucune donnée à exporter'); return; }
  try {
    const { jsPDF, autoTable } = await loadPDFLibraries();
    const doc = new jsPDF('portrait');

    let y = addPdfLogoHeader(doc, {
      title: 'COMPTE DE RÉSULTAT — OHADA/SYSCOHADA',
      subtitle: `Agence: ${d.agenceNom}`,
      dateRight: `Du ${d.periodeDu} au ${d.periodeAu}`,
      appName: branding.appName,
    });

    doc.setFontSize(12);
    doc.setTextColor(34, 197, 94);
    doc.text('PRODUITS', 14, y);
    y += 4;

    const produitsBody: AutoTableBodyRow[] = [];
    for (const sec of d.produits) {
      produitsBody.push([{ content: sec.titre, colSpan: 2, styles: { fontStyle: 'bold', fillColor: [220, 252, 231] } }, '']);
      for (const l of sec.lignes) produitsBody.push([l.numeroCompte, l.intitule, fmt(l.montant)]);
      produitsBody.push(['', 'Sous-total', { content: fmt(sec.sousTotal), styles: { fontStyle: 'bold' } }]);
    }
    produitsBody.push([{ content: 'TOTAL PRODUITS', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [34, 197, 94], textColor: 255 } }, '', { content: fmt(d.totalProduits), styles: { fontStyle: 'bold', fillColor: [34, 197, 94], textColor: 255 } }]);

    autoTable(doc, {
      startY: y,
      head: [['Compte', 'Intitulé', 'Montant (FCFA)']],
      body: produitsBody,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [15, 23, 42], textColor: 255 },
      columnStyles: { 0: { cellWidth: 30 }, 2: { halign: 'right', cellWidth: 40 } },
      margin: { left: 14, right: 14 },
    });

    y = (doc as unknown as JsPDFWithAutoTable).lastAutoTable?.finalY != null ? (doc as unknown as JsPDFWithAutoTable).lastAutoTable!.finalY + 8 : y + 60;

    doc.setFontSize(12);
    doc.setTextColor(239, 68, 68);
    doc.text('CHARGES', 14, y);
    y += 4;

    const chargesBody: AutoTableBodyRow[] = [];
    for (const sec of d.charges) {
      chargesBody.push([{ content: sec.titre, colSpan: 2, styles: { fontStyle: 'bold', fillColor: [254, 226, 226] } }, '']);
      for (const l of sec.lignes) chargesBody.push([l.numeroCompte, l.intitule, fmt(l.montant)]);
      chargesBody.push(['', 'Sous-total', { content: fmt(sec.sousTotal), styles: { fontStyle: 'bold' } }]);
    }
    chargesBody.push([{ content: 'TOTAL CHARGES', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [239, 68, 68], textColor: 255 } }, '', { content: fmt(d.totalCharges), styles: { fontStyle: 'bold', fillColor: [239, 68, 68], textColor: 255 } }]);

    autoTable(doc, {
      startY: y,
      head: [['Compte', 'Intitulé', 'Montant (FCFA)']],
      body: chargesBody,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [15, 23, 42], textColor: 255 },
      columnStyles: { 0: { cellWidth: 30 }, 2: { halign: 'right', cellWidth: 40 } },
      margin: { left: 14, right: 14 },
    });

    const fy = (doc as unknown as JsPDFWithAutoTable).lastAutoTable?.finalY ?? y + 60;
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
};

export const exportLIExcel = async (d: LivreInventaireDataExport | undefined) => {
  if (!d || d.lignes.length === 0) { toast.warning('Aucune donnée à exporter'); return; }
  try {
    const { downloadWorkbook } = await import('@/lib/excel-export');
    const rows: Record<string, string | number>[] = d.lignes.filter(l => l.solde !== 0).map(l => ({
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
      'Classe': '',
      'Type': 'Actif',
      'Solde': d.totalActif,
      'Sens Normal': '',
      'Observation': '',
    });
    rows.push({
      'Compte': '',
      'Intitulé': '',
      'Classe': '',
      'Type': 'Passif',
      'Solde': d.totalPassif,
      'Sens Normal': '',
      'Observation': '',
    });
    await downloadWorkbook(`Livre_Inventaire_${d.dateInventaire}.xlsx`, [
      { name: "Livre d'Inventaire", rows },
    ]);
    toast.success('Export Excel réussi');
  } catch (e) { toast.error(handleApiError(e, 'Erreur export Excel')); }
};

export const exportLIPDF = async (d: LivreInventaireDataExport | undefined, branding: { appName: string }) => {
  if (!d || d.lignes.length === 0) { toast.warning('Aucune donnée à exporter'); return; }
  try {
    const { jsPDF, autoTable } = await loadPDFLibraries();
    const doc = new jsPDF('landscape');

    const startY = addPdfLogoHeader(doc, {
      title: "LIVRE D'INVENTAIRE — OHADA/SYSCOHADA",
      subtitle: `Agence: ${d.agenceNom}`,
      dateRight: `Date inventaire: ${d.dateInventaire}`,
      appName: branding.appName,
    });

    const activeLignes = d.lignes.filter(l => l.solde !== 0);
    let currentClasse = -1;
    const body: AutoTableBodyRow[] = [];

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

    const fy = (doc as unknown as JsPDFWithAutoTable).lastAutoTable?.finalY ?? startY + 100;
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
};
