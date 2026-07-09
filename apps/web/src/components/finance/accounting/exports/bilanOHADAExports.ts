export const exportBilanExcel = async (
  bilanStats: any,
  appName: string
) => {
  try {
    const { downloadWorkbook } = await import('@/lib/excel-export');
    const data = [
      [`BILAN OHADA - ${appName}`],
      [`Date: ${new Date().toLocaleDateString('fr-FR')}`],
      [],
      ['ACTIF'],
      ['Poste', 'Montant (FCFA)'],
      ['Actif immobilisé', bilanStats?.actif?.immobilise || 0],
      ['Actif circulant', bilanStats?.actif?.circulant || 0],
      ['Trésorerie-Actif', bilanStats?.actif?.tresorerie || 0],
      ['TOTAL ACTIF', bilanStats?.actif?.total || 0],
      [],
      ['PASSIF'],
      ['Poste', 'Montant (FCFA)'],
      ['Capitaux propres', bilanStats?.passif?.capitaux || 0],
      ['Dettes financières', bilanStats?.passif?.dettes || 0],
      ['Passif circulant', bilanStats?.passif?.circulant || 0],
      ['TOTAL PASSIF', bilanStats?.passif?.total || 0],
    ];

    await downloadWorkbook(`Bilan_OHADA_${new Date().toISOString().split('T')[0]}.xlsx`, [
      { name: 'Bilan OHADA', aoa: data, columnWidths: [40, 20] },
    ]);
  } catch (error) {
    console.error('Erreur export Excel:', error);
  }
};

export const exportBilanPDF = async (
  bilanStats: any,
  appName: string
) => {
  try {
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF('portrait');

    doc.setFontSize(20);
    doc.setTextColor(30, 58, 138);
    doc.text('BILAN OHADA', 105, 20, { align: 'center' });

    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(`${appName} - Système Comptable OHADA`, 105, 30, { align: 'center' });
    doc.text(`Édité le: ${new Date().toLocaleDateString('fr-FR')}`, 105, 38, { align: 'center' });

    doc.setDrawColor(30, 58, 138);
    doc.line(20, 44, 190, 44);

    let y = 55;

    // ACTIF
    doc.setFillColor(59, 130, 246);
    doc.rect(20, y, 170, 10, 'F');
    doc.setTextColor(255);
    doc.setFontSize(12);
    doc.text('ACTIF', 25, y + 7);
    y += 15;

    doc.setTextColor(0);
    doc.setFontSize(10);
    const actifItems = [
      { label: 'Actif immobilisé', val: bilanStats?.actif?.immobilise || 0 },
      { label: 'Actif circulant', val: bilanStats?.actif?.circulant || 0 },
      { label: 'Trésorerie-Actif', val: bilanStats?.actif?.tresorerie || 0 },
    ];

    actifItems.forEach(item => {
      doc.text(item.label, 30, y);
      doc.text(item.val.toLocaleString('fr-FR') + ' FCFA', 170, y, { align: 'right' });
      y += 8;
    });

    doc.setFontSize(11);
    doc.setTextColor(59, 130, 246);
    doc.text('TOTAL ACTIF', 30, y + 3);
    doc.text((bilanStats?.actif?.total || 0).toLocaleString('fr-FR') + ' FCFA', 170, y + 3, { align: 'right' });
    y += 20;

    // PASSIF
    doc.setFillColor(147, 51, 234);
    doc.rect(20, y, 170, 10, 'F');
    doc.setTextColor(255);
    doc.setFontSize(12);
    doc.text('PASSIF', 25, y + 7);
    y += 15;

    doc.setTextColor(0);
    doc.setFontSize(10);
    const passifItems = [
      { label: 'Capitaux propres', val: bilanStats?.passif?.capitaux || 0 },
      { label: 'Dettes financières', val: bilanStats?.passif?.dettes || 0 },
      { label: 'Passif circulant', val: bilanStats?.passif?.circulant || 0 },
    ];

    passifItems.forEach(item => {
      doc.text(item.label, 30, y);
      doc.text(item.val.toLocaleString('fr-FR') + ' FCFA', 170, y, { align: 'right' });
      y += 8;
    });

    doc.setFontSize(11);
    doc.setTextColor(147, 51, 234);
    doc.text('TOTAL PASSIF', 30, y + 3);
    doc.text((bilanStats?.passif?.total || 0).toLocaleString('fr-FR') + ' FCFA', 170, y + 3, { align: 'right' });

    // Équilibre
    y += 20;
    const isEquilibre = Math.abs((bilanStats?.actif?.total || 0) - (bilanStats?.passif?.total || 0)) < 1;
    if (isEquilibre) {
      doc.setFillColor(34, 197, 94);
    } else {
      doc.setFillColor(239, 68, 68);
    }
    doc.rect(20, y, 170, 10, 'F');
    doc.setTextColor(255);
    doc.setFontSize(10);
    doc.text(isEquilibre ? 'Bilan équilibré' : 'Bilan déséquilibré', 105, y + 7, { align: 'center' });

    doc.save(`Bilan_OHADA_${new Date().toISOString().split('T')[0]}.pdf`);
  } catch (error) {
    console.error('Erreur export PDF:', error);
  }
};
