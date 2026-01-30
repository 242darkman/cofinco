import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Employe } from './useEmployes';
import { savePDFToLoge } from '../../lib/loge-storage';
import { LOGO_BASE64 } from '../../lib/pdf-logo';

export function useBulletinPDF() {
  // Logo is now imported directly as base64, no async loading needed
  const loadLogoAsBase64 = async (): Promise<string> => {
    return LOGO_BASE64;
  };

  const generateBulletinPDF = async (employe: Employe, logoBase64?: string): Promise<jsPDF> => {
    const doc = new jsPDF();
    const mois = 'Décembre';
    const annee = '2024';
    const salaireBase = parseFloat(employe.salaireBase) || 0;
    const dateEmission = new Date().toLocaleDateString('fr-FR');
    
    // Fonction pour tronquer le texte
    const truncate = (text: string, maxLen: number) => 
      text.length > maxLen ? text.substring(0, maxLen - 2) + '..' : text;
    
    // Calculs conformes Congo/OHADA
    const primeAnciennete = salaireBase * 0.05;
    const primeTransport = 25000;
    const primeRendement = salaireBase * 0.03;
    const salaireBrut = salaireBase + primeAnciennete + primeTransport + primeRendement;
    
    // Cotisations sociales Congo
    const cnssEmploye = salaireBrut * 0.04;
    const ipr = salaireBrut * 0.10;
    const totalRetenues = cnssEmploye + ipr;
    const salaireNet = salaireBrut - totalRetenues;
    const cnssPatronale = salaireBrut * 0.205;

    // === EN-TÊTE AVEC LOGO (fond blanc) ===
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 210, 35, 'F');
    
    // Bordure inférieure bleu marine
    doc.setDrawColor(30, 58, 138);
    doc.setLineWidth(0.8);
    doc.line(0, 35, 210, 35);
    
    // Logo de la plateforme (utilise le logo partagé)
    try {
      doc.addImage(LOGO_BASE64, 'PNG', 10, 5, 25, 25);
    } catch (e) {
      // Fallback: cercle avec lettre C
      doc.setFillColor(30, 58, 138);
      doc.circle(22, 17, 10, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('C', 22, 20, { align: 'center' });
    }
    
    // Nom entreprise
    doc.setTextColor(30, 58, 138);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('COFIN & CO-M', 42, 12);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text('Institution de Microfinance', 42, 18);
    doc.text('Brazzaville - République du Congo', 42, 23);
    
    // Informations entreprise (à droite)
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text('RCCM: CG-BZV-01-2024-B12-00123', 140, 12);
    doc.text('N° Impôt: A0123456M', 140, 17);
    doc.text('Email: contact@cofin.cg', 140, 22);
    doc.text('Tel: +242 06 123 45 67', 140, 27);

    // === TITRE DU DOCUMENT ===
    doc.setFillColor(30, 58, 138);
    doc.rect(0, 40, 210, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('BULLETIN DE PAIE', 105, 48, { align: 'center' });
    
    // Période
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Période: ${mois} ${annee}`, 105, 58, { align: 'center' });

    // === INFORMATIONS EMPLOYÉ (fond gris clair) ===
    doc.setFillColor(245, 245, 245);
    doc.rect(10, 65, 190, 28, 'F');
    doc.setDrawColor(200, 200, 200);
    doc.rect(10, 65, 190, 28, 'S');
    
    doc.setTextColor(30, 58, 138);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('INFORMATIONS EMPLOYÉ', 15, 72);
    
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    
    // Colonne gauche
    doc.setFont('helvetica', 'bold');
    doc.text('Nom:', 15, 79);
    doc.setFont('helvetica', 'normal');
    doc.text(`${employe.nom} ${employe.prenom}`, 45, 79);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Matricule:', 15, 85);
    doc.setFont('helvetica', 'normal');
    doc.text(employe.matricule, 45, 85);
    
    // Colonne droite
    doc.setFont('helvetica', 'bold');
    doc.text('Poste:', 110, 79);
    doc.setFont('helvetica', 'normal');
    doc.text(truncate(employe.poste, 25), 140, 79);
    
    doc.setFont('helvetica', 'bold');
    doc.text('N° CNSS:', 110, 85);
    doc.setFont('helvetica', 'normal');
    doc.text(employe.numeroCnss || 'N/A', 140, 85);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Date embauche:', 110, 91);
    doc.setFont('helvetica', 'normal');
    doc.text(new Date(employe.dateEmbauche).toLocaleDateString('fr-FR'), 155, 91);

    // === DÉTAILS DE LA RÉMUNÉRATION ===
    let startY = 100;
    
    // Tableau des gains
    autoTable(doc, {
      startY,
      head: [['GAINS', 'MONTANT']],
      body: [
        ['Salaire de base', `${salaireBase.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} FCFA`],
        ['Prime d\'ancienneté (5%)', `${primeAnciennete.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} FCFA`],
        ['Prime de transport', `${primeTransport.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} FCFA`],
        ['Prime de rendement (3%)', `${primeRendement.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} FCFA`]
      ],
      foot: [['SALAIRE BRUT', `${salaireBrut.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} FCFA`]],
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 138], textColor: 255, fontSize: 9, fontStyle: 'bold' },
      footStyles: { fillColor: [200, 200, 200], textColor: 30, fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 120 },
        1: { cellWidth: 70, halign: 'right', fontStyle: 'bold' }
      },
      margin: { left: 10, right: 10 }
    });

    startY = (doc as any).lastAutoTable.finalY + 5;

    // Tableau des retenues
    autoTable(doc, {
      startY,
      head: [['RETENUES', 'MONTANT']],
      body: [
        ['Cotisation CNSS (4%)', `${cnssEmploye.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} FCFA`],
        ['Impôt sur traitement (IPR 10%)', `${ipr.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} FCFA`]
      ],
      foot: [['TOTAL RETENUES', `${totalRetenues.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} FCFA`]],
      theme: 'grid',
      headStyles: { fillColor: [220, 38, 38], textColor: 255, fontSize: 9, fontStyle: 'bold' },
      footStyles: { fillColor: [252, 165, 165], textColor: 30, fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 120 },
        1: { cellWidth: 70, halign: 'right', fontStyle: 'bold' }
      },
      margin: { left: 10, right: 10 }
    });

    startY = (doc as any).lastAutoTable.finalY + 5;

    // Salaire net (encadré vert)
    doc.setFillColor(21, 128, 61);
    doc.rect(10, startY, 190, 15, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('SALAIRE NET À PAYER', 15, startY + 6);
    doc.setFontSize(14);
    doc.text(`${salaireNet.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} FCFA`, 195, startY + 10, { align: 'right' });

    startY += 20;

    // Charges patronales
    doc.setFillColor(245, 245, 245);
    doc.rect(10, startY, 190, 12, 'F');
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Charges patronales (CNSS 20.5%):', 15, startY + 5);
    doc.setFont('helvetica', 'bold');
    doc.text(`${cnssPatronale.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} FCFA`, 195, startY + 5, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text('Coût total employeur:', 15, startY + 9);
    doc.setFont('helvetica', 'bold');
    doc.text(`${(salaireBrut + cnssPatronale).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} FCFA`, 195, startY + 9, { align: 'right' });

    startY += 17;

    // Pied de page
    doc.setDrawColor(200, 200, 200);
    doc.line(10, startY, 200, startY);
    startY += 5;
    
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    doc.text(`Document généré le ${dateEmission}`, 105, startY, { align: 'center' });
    doc.text('Ce bulletin de paie est strictement confidentiel et personnel.', 105, startY + 4, { align: 'center' });
    doc.text('Conformité législation Congo (Code du Travail & CNSS)', 105, startY + 8, { align: 'center' });

    return doc;
  };

  const downloadBulletinPDF = async (employe: Employe) => {
    const logoBase64 = await loadLogoAsBase64();
    const doc = await generateBulletinPDF(employe, logoBase64);
    doc.save(`Bulletin_${employe.matricule}_${employe.nom}_Decembre2024.pdf`);
  };

  const saveBulletinToLoge = async (employe: Employe) => {
    try {
      const logoBase64 = await loadLogoAsBase64();
      const doc = await generateBulletinPDF(employe, logoBase64);
      const pdfBlob = doc.output('blob');
      const fileName = `Bulletin_${employe.matricule}_${employe.nom}_Decembre2024.pdf`;
      await savePDFToLoge(pdfBlob, {
        nom: fileName,
        categorie: 'rh',
        description: `Bulletin de paie de ${employe.nom} ${employe.prenom} - Décembre 2024`,
        referenceType: 'employe',
        referenceId: employe.id,
        visibilite: 'prive',
        tags: ['bulletin-paie', 'rh', employe.matricule]
      });
      alert('Bulletin sauvegardé dans la Loge Cloud !');
    } catch (error) {
      console.error('Erreur sauvegarde Loge:', error);
      alert('Erreur lors de la sauvegarde dans la Loge');
    }
  };

  return {
    generateBulletinPDF,
    downloadBulletinPDF,
    saveBulletinToLoge,
    loadLogoAsBase64
  };
}
