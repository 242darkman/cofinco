import { loadPDFLibraries } from '@/lib/lazy-export';

export interface LigneTAFIREExport {
  code: string;
  libelle: string;
  montantN: number;
  montantN1: number;
}

export interface TAFIREDataExport {
  ressourcesDurables: LigneTAFIREExport[];
  emploisDurables: LigneTAFIREExport[];
  variationBFR: LigneTAFIREExport[];
  tresorerie: LigneTAFIREExport[];
}

export const exportTAFIREExcel = async (
  data: TAFIREDataExport,
  exercice: number,
  totalRessources: number,
  totalEmplois: number,
  excedentRessources: number,
  variationBFR: number,
  variationTresorerie: number
) => {
  try {
    const { downloadWorkbook } = await import('@/lib/excel-export');

    const calcTotal = (lignes: LigneTAFIREExport[], field: 'montantN' | 'montantN1') => {
      return lignes.reduce((sum, l) => sum + l[field], 0);
    };

    const mainData = [
      ['TAFIRE - Tableau Financier des Ressources et Emplois'],
      [`Exercice ${exercice}`],
      [],
      ['I - RESSOURCES DURABLES'],
      ['Code', 'Libellé', `Exercice N (${exercice})`, `Exercice N-1 (${exercice - 1})`],
      ...data.ressourcesDurables.map(l => [l.code, l.libelle, l.montantN, l.montantN1]),
      ['', 'TOTAL RESSOURCES', totalRessources, calcTotal(data.ressourcesDurables, 'montantN1')],
      [],
      ['II - EMPLOIS DURABLES'],
      ['Code', 'Libellé', `Exercice N (${exercice})`, `Exercice N-1 (${exercice - 1})`],
      ...data.emploisDurables.map(l => [l.code, l.libelle, l.montantN, l.montantN1]),
      ['', 'TOTAL EMPLOIS', totalEmplois, calcTotal(data.emploisDurables, 'montantN1')],
      [],
      ['', 'EXCEDENT DE RESSOURCES (I - II)', excedentRessources, ''],
      [],
      ['III - VARIATION DU BFR'],
      ...data.variationBFR.map(l => [l.code, l.libelle, l.montantN, l.montantN1]),
      ['', 'TOTAL VARIATION BFR', variationBFR, calcTotal(data.variationBFR, 'montantN1')],
      [],
      ['', 'VARIATION DE TRESORERIE', variationTresorerie, ''],
      [],
      ['IV - TRESORERIE'],
      ...data.tresorerie.map(l => [l.code, l.libelle, l.montantN, l.montantN1]),
    ];

    await downloadWorkbook(`TAFIRE_OHADA_${exercice}.xlsx`, [
      { name: 'TAFIRE', aoa: mainData, columnWidths: [10, 45, 20, 20] },
    ]);
  } catch (error) {
    console.error('Erreur export Excel:', error);
  }
};

export const exportTAFIREPDF = async (
  data: TAFIREDataExport,
  exercice: number,
  totalRessources: number,
  totalEmplois: number,
  excedentRessources: number,
  variationBFR: number,
  variationTresorerie: number
) => {
  try {
    const { jsPDF } = await loadPDFLibraries();
    const doc = new jsPDF('portrait');

    doc.setFontSize(16);
    doc.setTextColor(30, 58, 138);
    doc.text('TAFIRE', 105, 15, { align: 'center' });
    doc.setFontSize(10);
    doc.text('Tableau Financier des Ressources et Emplois', 105, 22, { align: 'center' });

    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Exercice ${exercice} - Normes OHADA`, 105, 29, { align: 'center' });

    doc.setDrawColor(30, 58, 138);
    doc.line(15, 33, 195, 33);

    let y = 40;

    const renderSection = (title: string, lignes: LigneTAFIREExport[], total: number, color: number[]) => {
      doc.setFillColor(color[0], color[1], color[2]);
      doc.rect(15, y, 180, 7, 'F');
      doc.setTextColor(255);
      doc.setFontSize(9);
      doc.text(title, 20, y + 5);
      y += 10;

      doc.setTextColor(0);
      doc.setFontSize(8);

      doc.setTextColor(100);
      doc.text('Code', 20, y);
      doc.text('Libellé', 35, y);
      doc.text(`N (${exercice})`, 145, y, { align: 'right' });
      doc.text(`N-1`, 175, y, { align: 'right' });
      y += 5;

      doc.setTextColor(0);
      lignes.forEach(l => {
        doc.text(l.code, 20, y);
        doc.text(l.libelle.substring(0, 55), 35, y);
        doc.text(l.montantN.toLocaleString('fr-FR'), 145, y, { align: 'right' });
        doc.text(l.montantN1.toLocaleString('fr-FR'), 175, y, { align: 'right' });
        y += 5;
      });

      doc.setFontSize(9);
      doc.setTextColor(color[0], color[1], color[2]);
      doc.text('TOTAL', 35, y);
      doc.text(total.toLocaleString('fr-FR') + ' FCFA', 145, y, { align: 'right' });
      y += 10;
    };

    renderSection('I - RESSOURCES DURABLES', data.ressourcesDurables, totalRessources, [34, 197, 94]);
    renderSection('II - EMPLOIS DURABLES', data.emploisDurables, totalEmplois, [239, 68, 68]);

    const excColor = excedentRessources >= 0 ? [34, 197, 94] : [239, 68, 68];
    doc.setFillColor(excColor[0], excColor[1], excColor[2]);
    doc.rect(15, y, 180, 8, 'F');
    doc.setTextColor(255);
    doc.setFontSize(10);
    doc.text('EXCEDENT DE RESSOURCES (I - II)', 20, y + 6);
    doc.text(`${excedentRessources >= 0 ? '+' : ''}${excedentRessources.toLocaleString('fr-FR')} FCFA`, 175, y + 6, { align: 'right' });
    y += 15;

    renderSection('III - VARIATION DU BFR', data.variationBFR, variationBFR, [59, 130, 246]);

    y += 5;
    const varColor = variationTresorerie >= 0 ? [34, 197, 94] : [239, 68, 68];
    doc.setFillColor(varColor[0], varColor[1], varColor[2]);
    doc.rect(15, y, 180, 10, 'F');
    doc.setTextColor(255);
    doc.setFontSize(11);
    doc.text('VARIATION DE TRESORERIE', 20, y + 7);
    doc.text(`${variationTresorerie >= 0 ? '+' : ''}${variationTresorerie.toLocaleString('fr-FR')} FCFA`, 175, y + 7, { align: 'right' });

    y += 18;
    doc.setFontSize(9);
    doc.setTextColor(0);
    data.tresorerie.forEach(t => {
      doc.text(t.libelle, 20, y);
      doc.text(t.montantN.toLocaleString('fr-FR') + ' FCFA', 175, y, { align: 'right' });
      y += 6;
    });

    doc.save(`TAFIRE_OHADA_${exercice}.pdf`);
  } catch (error) {
    console.error('Erreur export PDF:', error);
  }
};
