import { loadPDFLibraries } from '@/lib/lazy-export';

export interface FluxTresorerieExport {
  categorie: string;
  libelle: string;
  montant: number;
  type: 'entree' | 'sortie';
}

export interface TresorerieDataExport {
  exploitation: FluxTresorerieExport[];
  investissement: FluxTresorerieExport[];
  financement: FluxTresorerieExport[];
  soldeDebut: number;
  soldeFin: number;
}

export const exportTableauTresorerieExcel = async (
  data: TresorerieDataExport,
  totalExploitation: number,
  totalInvestissement: number,
  totalFinancement: number,
  variationTresorerie: number,
  dateDebut: string,
  dateFin: string
) => {
  try {
    const { downloadWorkbook } = await import('@/lib/excel-export');
    const allFlux = [
      ...data.exploitation.map(f => ({ ...f, Section: 'Exploitation' })),
      { Section: 'TOTAL EXPLOITATION', libelle: '', montant: totalExploitation, type: '', categorie: '' },
      ...data.investissement.map(f => ({ ...f, Section: 'Investissement' })),
      { Section: 'TOTAL INVESTISSEMENT', libelle: '', montant: totalInvestissement, type: '', categorie: '' },
      ...data.financement.map(f => ({ ...f, Section: 'Financement' })),
      { Section: 'TOTAL FINANCEMENT', libelle: '', montant: totalFinancement, type: '', categorie: '' },
      { Section: '', libelle: '', montant: 0, type: '', categorie: '' },
      { Section: 'VARIATION TRESORERIE', libelle: '', montant: variationTresorerie, type: '', categorie: '' },
      { Section: 'Trésorerie début', libelle: '', montant: data.soldeDebut, type: '', categorie: '' },
      { Section: 'Trésorerie fin', libelle: '', montant: data.soldeFin, type: '', categorie: '' },
    ];

    const exportData = allFlux.map(f => ({
      'Section': f.Section || f.categorie,
      'Libellé': f.libelle,
      'Type': f.type === 'entree' ? 'Entrée' : f.type === 'sortie' ? 'Sortie' : '',
      'Montant': f.montant
    }));

    await downloadWorkbook(`Tableau_Tresorerie_OHADA_${new Date().toISOString().split('T')[0]}.xlsx`, [{
      name: 'Flux Trésorerie',
      titleRows: [
        ['TABLEAU DES FLUX DE TRESORERIE - OHADA'],
        [`Période: ${dateDebut} au ${dateFin}`],
        [],
      ],
      rows: exportData,
    }]);
  } catch (error) {
    console.error('Erreur export Excel:', error);
  }
};

export const exportTableauTresoreriePDF = async (
  data: TresorerieDataExport,
  totalExploitation: number,
  totalInvestissement: number,
  totalFinancement: number,
  variationTresorerie: number,
  dateDebut: string,
  dateFin: string
) => {
  try {
    const { jsPDF } = await loadPDFLibraries();
    const doc = new jsPDF('portrait');

    doc.setFontSize(18);
    doc.setTextColor(30, 58, 138);
    doc.text('TABLEAU DES FLUX DE TRESORERIE', 105, 20, { align: 'center' });

    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text('Méthode directe - Normes OHADA', 105, 28, { align: 'center' });
    doc.text(`Période: ${dateDebut} au ${dateFin}`, 105, 35, { align: 'center' });

    doc.setDrawColor(30, 58, 138);
    doc.line(20, 40, 190, 40);

    let y = 50;

    const renderSection = (title: string, flux: FluxTresorerieExport[], total: number, color: number[]) => {
      doc.setFillColor(color[0], color[1], color[2]);
      doc.rect(20, y, 170, 8, 'F');
      doc.setTextColor(255);
      doc.setFontSize(10);
      doc.text(title, 25, y + 6);
      y += 12;

      doc.setTextColor(0);
      doc.setFontSize(9);
      flux.forEach(f => {
        const sign = f.type === 'entree' ? '+' : '-';
        doc.text(f.libelle, 30, y);
        doc.text(`${sign} ${Math.abs(f.montant).toLocaleString('fr-FR')}`, 170, y, { align: 'right' });
        y += 6;
      });

      doc.setFontSize(10);
      doc.setTextColor(color[0], color[1], color[2]);
      doc.text(`Total: ${total >= 0 ? '+' : ''}${total.toLocaleString('fr-FR')} FCFA`, 170, y, { align: 'right' });
      y += 12;
    };

    renderSection('A - FLUX DE TRESORERIE LIES A L\'EXPLOITATION', data.exploitation, totalExploitation, [34, 197, 94]);
    renderSection('B - FLUX DE TRESORERIE LIES A L\'INVESTISSEMENT', data.investissement, totalInvestissement, [59, 130, 246]);
    renderSection('C - FLUX DE TRESORERIE LIES AU FINANCEMENT', data.financement, totalFinancement, [168, 85, 247]);

    y += 5;
    const varColor = variationTresorerie >= 0 ? [34, 197, 94] : [239, 68, 68];
    doc.setFillColor(varColor[0], varColor[1], varColor[2]);
    doc.rect(20, y, 170, 12, 'F');
    doc.setTextColor(255);
    doc.setFontSize(12);
    doc.text('VARIATION DE TRESORERIE (A+B+C)', 25, y + 8);
    doc.text(`${variationTresorerie >= 0 ? '+' : ''}${variationTresorerie.toLocaleString('fr-FR')} FCFA`, 170, y + 8, { align: 'right' });

    y += 20;
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(`Trésorerie début de période: ${data.soldeDebut.toLocaleString('fr-FR')} FCFA`, 25, y);
    y += 7;
    doc.text(`Trésorerie fin de période: ${data.soldeFin.toLocaleString('fr-FR')} FCFA`, 25, y);

    doc.save(`Tableau_Tresorerie_OHADA_${new Date().toISOString().split('T')[0]}.pdf`);
  } catch (error) {
    console.error('Erreur export PDF:', error);
  }
};
