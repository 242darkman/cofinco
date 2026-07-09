import { toast, handleApiError } from '../../../../lib/toast';
import { loadPDFLibraries } from '../../../../lib/lazy-export';

export interface CompteResultatLineExport {
  numeroCompte: string;
  intitule: string;
  montant: number;
}

export const exportCompteResultatExcel = async (
  charges: CompteResultatLineExport[],
  produits: CompteResultatLineExport[],
  totalCharges: number,
  totalProduits: number,
  resultatNet: number,
  rentabilite: number
) => {
  try {
    const { downloadWorkbook } = await import('@/lib/excel-export');

    const chargesData = charges.map(c => ({
      'N° Compte': c.numeroCompte,
      'Intitulé': c.intitule,
      'Montant': c.montant
    }));
    chargesData.push({ 'N° Compte': 'TOTAL CHARGES', 'Intitulé': '', 'Montant': totalCharges });

    const produitsData = produits.map(c => ({
      'N° Compte': c.numeroCompte,
      'Intitulé': c.intitule,
      'Montant': c.montant
    }));
    produitsData.push({ 'N° Compte': 'TOTAL PRODUITS', 'Intitulé': '', 'Montant': totalProduits });

    const syntheseData = [
      { 'Élément': 'Total Produits', 'Montant': totalProduits },
      { 'Élément': 'Total Charges', 'Montant': totalCharges },
      { 'Élément': 'RESULTAT NET', 'Montant': resultatNet },
      { 'Élément': 'Marge nette (%)', 'Montant': rentabilite.toFixed(2) }
    ];

    await downloadWorkbook(`Compte_Resultat_OHADA_${new Date().toISOString().split('T')[0]}.xlsx`, [
      { name: 'Charges', rows: chargesData },
      { name: 'Produits', rows: produitsData },
      { name: 'Synthèse', rows: syntheseData },
    ]);
  } catch (error) {
    console.error('Erreur export Excel:', error);
  }
};

export const exportCompteResultatPDF = async (
  charges: CompteResultatLineExport[],
  produits: CompteResultatLineExport[],
  totalCharges: number,
  totalProduits: number,
  resultatNet: number,
  rentabilite: number,
  exercice: string,
  branding: { appName: string }
) => {
  try {
    const { jsPDF } = await loadPDFLibraries();
    const doc = new jsPDF('portrait');

    doc.setFontSize(20);
    doc.setTextColor(30, 58, 138);
    doc.text('COMPTE DE RESULTAT', 105, 20, { align: 'center' });

    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(`${branding.appName} - Système Comptable OHADA`, 105, 30, { align: 'center' });
    doc.text(`Exercice: ${exercice}`, 105, 38, { align: 'center' });

    doc.setDrawColor(30, 58, 138);
    doc.line(20, 44, 190, 44);

    let y = 55;

    doc.setFontSize(12);
    doc.setTextColor(34, 197, 94);
    doc.text('PRODUITS', 20, y);
    y += 8;

    doc.setFontSize(9);
    doc.setTextColor(0);
    produits.slice(0, 10).forEach((p) => {
      doc.text(p.numeroCompte, 25, y);
      doc.text(p.intitule.substring(0, 50), 45, y);
      doc.text((p.montant || 0).toLocaleString('fr-FR'), 160, y, { align: 'right' });
      y += 6;
    });

    doc.setFillColor(34, 197, 94);
    doc.rect(20, y, 170, 8, 'F');
    doc.setTextColor(255);
    doc.setFontSize(10);
    doc.text('TOTAL PRODUITS', 25, y + 6);
    doc.text(totalProduits.toLocaleString('fr-FR') + ' FCFA', 160, y + 6, { align: 'right' });
    y += 15;

    doc.setFontSize(12);
    doc.setTextColor(239, 68, 68);
    doc.text('CHARGES', 20, y);
    y += 8;

    doc.setFontSize(9);
    doc.setTextColor(0);
    charges.slice(0, 10).forEach((c) => {
      doc.text(c.numeroCompte, 25, y);
      doc.text(c.intitule.substring(0, 50), 45, y);
      doc.text((c.montant || 0).toLocaleString('fr-FR'), 160, y, { align: 'right' });
      y += 6;
    });

    doc.setFillColor(239, 68, 68);
    doc.rect(20, y, 170, 8, 'F');
    doc.setTextColor(255);
    doc.setFontSize(10);
    doc.text('TOTAL CHARGES', 25, y + 6);
    doc.text(totalCharges.toLocaleString('fr-FR') + ' FCFA', 160, y + 6, { align: 'right' });
    y += 20;

    const bgColor = resultatNet >= 0 ? [34, 197, 94] : [239, 68, 68];
    doc.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
    doc.rect(20, y, 170, 12, 'F');
    doc.setTextColor(255);
    doc.setFontSize(14);
    doc.text('RESULTAT NET', 25, y + 9);
    doc.text((resultatNet >= 0 ? '+' : '') + resultatNet.toLocaleString('fr-FR') + ' FCFA', 160, y + 9, { align: 'right' });

    y += 20;
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Marge nette: ${rentabilite.toFixed(2)}%`, 20, y);
    doc.text(resultatNet >= 0 ? 'Bénéfice' : 'Perte', 160, y, { align: 'right' });

    doc.save(`Compte_Resultat_OHADA_${new Date().toISOString().split('T')[0]}.pdf`);
  } catch (error) {
    console.error('Erreur export PDF:', error);
  }
};
